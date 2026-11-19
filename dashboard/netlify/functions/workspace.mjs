import { createHash, randomBytes } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { json, workspace } from "../../team/workspace.mjs";

import {
  mayReadWithLink,
  viewerLink,
  viewerSession,
} from "../viewer-access.mjs";

export const config = {
  path: ["/api/workspace", "/api/viewer-link", "/api/viewer-session"],
};

const storeName = "marketing-journal-workspace";
const consistency = "strong";
const previewHistory = {
  "https://deploy-preview-1--inspiencontent.netlify.app": [
    "6afea1c6172bd5c7fc4334b2",
    "6afe9dea67d02b885f715d15",
    "6afe973c9555571a5a540a1d",
  ],
};
const createRevision = () => '"' + randomBytes(16).toString("hex") + '"';

async function restorePreviousPreview(key, store, previewStore, deployIDs) {
  for (const deployID of deployIDs) {
    const previous = await previewStore({
      name: storeName,
      consistency,
      deployID,
    }).getWithMetadata(key, { type: "json" });
    if (!previous || !Object.keys(previous.data || {}).length) continue;
    const revision = createRevision();
    const restored = await store.set(key, JSON.stringify(previous.data), {
      onlyIfNew: true,
      metadata: { revision },
    });
    return restored.modified
      ? { metadata: { revision }, data: previous.data }
      : store.getWithMetadata(key, { type: "json" });
  }
  return null;
}

const legacyCollections = {
  items: "content-dashboard:v2",
  blogStats: "content-dashboard:v2:blog-monthly",
  settings: "content-dashboard:v2:settings",
};

async function readLegacyRecords(store) {
  const entries = await Promise.all(
    Object.entries(legacyCollections).map(async ([collection, recordKey]) => {
      const records = [];
      for await (const page of store.list({
        prefix: collection + "/",
        paginate: true,
      })) {
        const pageRecords = await Promise.all(
          page.blobs.map(({ key }) => store.get(key, { type: "json" })),
        );
        records.push(...pageRecords.filter(Boolean));
      }
      return [recordKey, records];
    }),
  );
  return Object.fromEntries(entries);
}

function workspaceStorage(store, legacyStore, restorePreview) {
  return {
    async get(key) {
      const saved =
        (await store.getWithMetadata(key, { type: "json" })) ??
        (await restorePreview?.(key));
      if (!saved) {
        if (!legacyStore) return null;
        return { httpEtag: null, json: () => readLegacyRecords(legacyStore) };
      }
      return {
        httpEtag: saved.metadata.revision,
        json: async () => saved.data,
      };
    },
    async put(key, data, { onlyIf }) {
      const revision = createRevision();
      const expected = onlyIf.get("If-Match");
      let condition = { onlyIfNew: true };
      if (expected) {
        const current = await store.getWithMetadata(key, { type: "json" });
        if (!current || current.metadata.revision !== expected) return null;
        condition = { onlyIfMatch: current.etag };
      }
      const result = await store.set(key, data, {
        ...condition,
        metadata: { revision },
      });
      return result.modified ? { httpEtag: revision } : null;
    },
  };
}

export function createHandler({
  identity = getUser,
  siteStore = getStore,
  previewStore = getDeployStore,
  env = process.env,
} = {}) {
  return async function handle(request) {
    try {
      const { origin, pathname } = new URL(request.url);
      const admin = env.JOURNAL_ADMIN_EMAIL?.trim().toLowerCase();
      const user = pathname === "/api/viewer-session" ? null : await identity();
      const canWrite = Boolean(
        admin && user?.email?.trim().toLowerCase() === admin,
      );
      const production = origin === env.JOURNAL_PRODUCTION_ORIGIN;
      const scope = createHash("sha256")
        .update(origin)
        .digest("hex")
        .slice(0, 16);
      const store = siteStore({
        name: production ? storeName : storeName + "-preview-" + scope,
        consistency,
      });
      if (pathname === "/api/viewer-link")
        return await viewerLink(request, store, canWrite);
      if (pathname === "/api/viewer-session")
        return await viewerSession(request, store);
      const linkViewer = !canWrite && (await mayReadWithLink(request, store));
      if (!user && !linkViewer)
        return json({ error: "로그인이 필요합니다." }, 401);
      if (!admin) return json({ error: "관리자 계정을 설정해 주세요." }, 503);
      if (!canWrite && !linkViewer && !user?.roles?.includes("viewer")) {
        return json({ error: "팀원 보기 권한이 필요합니다." }, 403);
      }
      const legacy = production
        ? siteStore({ name: "content-dashboard", consistency })
        : null;
      const history = previewHistory[origin];
      const restorePreview =
        !production && history
          ? (key) => restorePreviousPreview(key, store, previewStore, history)
          : undefined;
      return await workspace(
        request,
        { BUCKET: workspaceStorage(store, legacy, restorePreview) },
        canWrite,
      );
    } catch {
      return json({ error: "공유 저장소에 연결하지 못했습니다." }, 503);
    }
  };
}

export default createHandler();
