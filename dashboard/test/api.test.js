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
  const call = (host, user, method = "GET", data, origin = host) => {
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
      new Request(host + "/api/workspace", {
        method,
        headers: { Origin: origin, "Content-Type": "application/json" },
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
