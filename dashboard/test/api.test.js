import assert from "node:assert/strict";
import test from "node:test";
import { createHandler } from "../netlify/functions/workspace.mjs";

const production = "https://inspiencontent.netlify.app";
const preview = "https://deploy-preview-1--inspiencontent.netlify.app";
const owner = { email: "admin@example.invalid", roles: [] };
const viewer = { email: "viewer@example.invalid", roles: ["viewer"] };
const env = {
  JOURNAL_ADMIN_EMAIL: owner.email,
  JOURNAL_PRODUCTION_ORIGIN: production,
};
const contentKey = "content-dashboard:v2";
const journalKey = "marketing-journal-local-v1";

function memoryStore(initial = {}) {
  const records = new Map(Object.entries(initial));
  return {
    async setJSON(key, data) {
      records.set(key, { data });
    },
    async delete(key) {
      records.delete(key);
    },
    async get(key) {
      return records.get(key)?.data ?? null;
    },
    async getWithMetadata(key) {
      return records.get(key) ?? null;
    },
    async *list({ prefix }) {
      const blobs = Array.from(records.keys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key }));
      for (const blob of blobs) yield { blobs: [blob] };
    },
    async set(key, raw, { metadata, onlyIfMatch, onlyIfNew }) {
      const previous = records.get(key);
      if (onlyIfNew ? previous : previous?.etag !== onlyIfMatch)
        return { modified: false };
      records.set(key, {
        data: JSON.parse(raw),
        metadata,
        etag: crypto.randomUUID(),
      });
      return { modified: true };
    },
  };
}

function setup(previousDeploys = {}) {
  const liveStore = memoryStore();
  const previewStores = new Map();
  const legacyStore = memoryStore({
    "items/old": { data: { id: "old", title: "기존 콘텐츠" } },
    "items/old2": { data: { id: "old2", title: "두 번째 콘텐츠" } },
    "blogStats/old": { data: { id: "old", views: 1 } },
    "settings/divisions": { data: { id: "divisions", list: [] } },
  });
  const call = (
    host,
    user,
    method = "GET",
    data,
    origin = host,
    path = "/api/workspace",
    cookie = "",
  ) => {
    const handler = createHandler({
      identity: async () => user,
      env,
      siteStore: ({ name }) => {
        if (name === "content-dashboard") return legacyStore;
        if (name === "marketing-journal-workspace") return liveStore;
        if (!previewStores.has(name)) previewStores.set(name, memoryStore());
        return previewStores.get(name);
      },
      previewStore: ({ deployID }) =>
        previousDeploys[deployID] ?? memoryStore(),
    });
    return handler(
      new Request(host + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
    );
  };
  return { call, legacyStore };
}

test("팀원에게 읽기 권한만 있고 미승인 계정은 접근할 수 없다", async () => {
  const { call } = setup();
  assert.equal((await call(production, null)).status, 401);
  assert.equal(
    (await call(production, { email: "other@example.invalid", roles: [] }))
      .status,
    403,
  );
  const data = await (await call(production, viewer)).json();
  assert.equal(data.canWrite, false);
  assert.equal(data.records[contentKey].length, 2);
  assert.equal(
    (await call(production, viewer, "PUT", { revision: null, records: {} }))
      .status,
    403,
  );
});

test("운영 첫 저장은 기존 콘텐츠를 보존하고 미리보기와 분리한다", async () => {
  const { call, legacyStore } = setup();
  const isolated = await (await call(preview, owner)).json();
  assert.deepEqual(isolated.records, {});
  assert.equal(
    (
      await call(preview, owner, "PUT", {
        revision: null,
        records: { [contentKey]: [{ id: "preview" }] },
      })
    ).status,
    200,
  );
  const initial = await (await call(production, owner)).json();
  assert.equal(initial.revision, null);
  assert.deepEqual(
    initial.records[contentKey].map((record) => record.id),
    ["old", "old2"],
  );
  assert.equal(initial.records[contentKey + ":blog-monthly"].length, 1);
  assert.equal(initial.records[contentKey + ":settings"].length, 1);
  const journal = {
    days: { "2026-11-19": [{ text: "일지 복원", done: false }] },
    weeks: {},
    schedule: [],
    reviews: [],
  };
  const update = {
    revision: null,
    records: { ...initial.records, [journalKey]: journal },
  };
  assert.equal(
    (await call(production, owner, "PUT", update, "https://other.invalid"))
      .status,
    403,
  );
  const first = await call(production, owner, "PUT", update);
  assert.equal(first.status, 200);
  const { revision } = await first.json();
  assert.match(revision, /^"[a-f0-9]{32}"$/);
  assert.equal((await call(production, owner, "PUT", update)).status, 409);
  assert.equal(
    (await call(production, owner, "PUT", { ...update, revision })).status,
    200,
  );
  const current = await (await call(production, viewer)).json();
  assert.deepEqual(current.records[journalKey], journal);
  assert.equal(current.records[contentKey].length, 2);
  assert.equal((await legacyStore.get("items/old")).title, "기존 콘텐츠");
});

test("이전 미리보기의 기록을 같은 미리보기 주소에 복원하고 다시 배포해도 유지한다", async () => {
  const backup = {
    [journalKey]: {
      days: { "2026-11-19": [{ text: "이전 배포에 저장됨", done: true }] },
      weeks: {},
      schedule: [],
      reviews: [],
    },
  };
  const { call } = setup({
    "6afe9dea67d02b885f715d15": memoryStore({
      "workspace/v1.json": { data: backup, metadata: {} },
    }),
  });
  const first = await (await call(preview, owner)).json();
  assert.deepEqual(first.records, backup);
  assert.match(first.revision, /^"[a-f0-9]{32}"$/);
  assert.deepEqual(await (await call(preview, owner)).json(), first);
  const other = await (
    await call("https://deploy-preview-2--inspiencontent.netlify.app", owner)
  ).json();
  assert.deepEqual(other.records, {});
  const updated = {
    revision: first.revision,
    records: { ...backup, [contentKey]: [{ id: "new" }] },
  };
  assert.equal((await call(preview, owner, "PUT", updated)).status, 200);
  assert.deepEqual(
    (await (await call(preview, viewer)).json()).records,
    updated.records,
  );
});

test("관리자가 발급한 읽기 링크는 로그인 없이 열리며 수정은 차단되고 폐기할 수 있다", async () => {
  const { call } = setup();
  const linkPath = "/api/viewer-link";
  const sessionPath = "/api/viewer-session";
  assert.equal(
    (await call(preview, null, "POST", undefined, preview, linkPath)).status,
    403,
  );
  assert.equal(
    (await call(preview, viewer, "POST", undefined, preview, linkPath)).status,
    403,
  );
  assert.equal(
    (
      await call(
        preview,
        owner,
        "POST",
        undefined,
        "https://other.invalid",
        linkPath,
      )
    ).status,
    403,
  );
  const { token } = await (
    await call(preview, owner, "POST", undefined, preview, linkPath)
  ).json();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const opened = await call(
    preview,
    null,
    "POST",
    { token },
    preview,
    sessionPath,
  );
  assert.equal(opened.status, 204);
  const cookieHeader = opened.headers.get("set-cookie");
  assert.match(cookieHeader, /HttpOnly; Secure; SameSite=Lax/);
  const cookie = cookieHeader.split(";")[0];
  const records = await (
    await call(
      preview,
      null,
      "GET",
      undefined,
      preview,
      "/api/workspace",
      cookie,
    )
  ).json();
  assert.equal(records.canWrite, false);
  assert.equal(
    (
      await call(
        preview,
        null,
        "PUT",
        { revision: null, records: {} },
        preview,
        "/api/workspace",
        cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(production, null, "POST", { token }, production, sessionPath))
      .status,
    403,
  );
  assert.equal(
    (await call(preview, owner, "DELETE", undefined, preview, linkPath)).status,
    200,
  );
  assert.equal(
    (
      await call(
        preview,
        null,
        "GET",
        undefined,
        preview,
        "/api/workspace",
        cookie,
      )
    ).status,
    401,
  );
});
