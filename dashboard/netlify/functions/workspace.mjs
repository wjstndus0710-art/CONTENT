import { randomBytes } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { json, workspace } from "../../team/workspace.mjs";

export const config = { path: "/api/workspace" };

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

function workspaceStorage(store, legacyStore) {
  return {
    async get(key) {
      const saved = await store.getWithMetadata(key, { type: "json" });
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
      const revision = '"' + randomBytes(16).toString("hex") + '"';
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
      const user = await identity();
      if (!user) return json({ error: "로그인이 필요합니다." }, 401);
      const admin = env.JOURNAL_ADMIN_EMAIL?.trim().toLowerCase();
      if (!admin) return json({ error: "관리자 계정을 설정해 주세요." }, 503);
      const canWrite = user.email?.trim().toLowerCase() === admin;
      if (!canWrite && !user.roles?.includes("viewer")) {
        return json({ error: "팀원 보기 권한이 필요합니다." }, 403);
      }
      const options = {
        name: "marketing-journal-workspace",
        consistency: "strong",
      };
      const production =
        new URL(request.url).origin === env.JOURNAL_PRODUCTION_ORIGIN;
      const store = production ? siteStore(options) : previewStore(options);
      const legacy = production
        ? siteStore({ name: "content-dashboard", consistency: "strong" })
        : null;
      return await workspace(
        request,
        { BUCKET: workspaceStorage(store, legacy) },
        canWrite,
      );
    } catch {
      return json({ error: "공유 저장소에 연결하지 못했습니다." }, 503);
    }
  };
}

export default createHandler();
