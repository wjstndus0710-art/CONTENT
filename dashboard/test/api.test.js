import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../netlify/functions/api.mjs';

const ENV = {APP_USER: 'me', APP_PASSWORD: 'correct-horse-battery'};
const AUTH = 'Basic ' + Buffer.from('me:correct-horse-battery').toString('base64');
const SEED = {
  items: [{id: 'c1', title: '첫 콘텐츠'}],
  blogStats: [{id: 's-connect-2026-09', blog: '커넥트', month: '2026-09', views: 463}],
};

function memoryStore() {
  const m = new Map();
  return {
    m,
    keys: async (prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)),
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => { m.set(k, structuredClone(v)); },
    delete: async (k) => { m.delete(k); },
  };
}
const req = (path, {method = 'GET', auth = AUTH, body, headers = {}} = {}) => new Request('https://dash.example' + path, {
  method,
  headers: {...(auth ? {authorization: auth} : {}), ...(body !== undefined ? {'content-type': 'application/json'} : {}), ...headers},
  body: body !== undefined ? JSON.stringify(body) : undefined,
});

test('APP_PASSWORD가 없거나 짧으면 503과 원인을 알려 준다', async () => {
  let r = await createHandler(memoryStore(), {APP_PASSWORD: 'short'}, SEED)(req('/api/session'));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /5자/);
  r = await createHandler(memoryStore(), {}, SEED)(req('/api/session'));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /찾지 못했습니다/);
});

test('환경 변수를 넘기지 않으면 Netlify.env, 그다음 process.env를 읽는다', async () => {
  globalThis.Netlify = {env: {get: (k) => ({APP_USER: 'me', APP_PASSWORD: 'correct-horse-battery'})[k]}};
  try {
    assert.equal((await createHandler(memoryStore(), undefined, SEED)(req('/api/session'))).status, 200);
  } finally { delete globalThis.Netlify; }
  process.env.APP_USER = 'me'; process.env.APP_PASSWORD = 'correct-horse-battery';
  try {
    assert.equal((await createHandler(memoryStore(), undefined, SEED)(req('/api/session'))).status, 200);
  } finally { delete process.env.APP_USER; delete process.env.APP_PASSWORD; }
});

test('읽기는 로그인 없이, 쓰기는 로그인해야 한다', async () => {
  const h = createHandler(memoryStore(), ENV, SEED);
  const r = await h(req('/api/data', {auth: null}));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).items.length, 1);
  assert.equal((await h(req('/api/doc/items/c1', {method: 'DELETE', auth: null}))).status, 401);
  assert.equal((await h(req('/api/doc/items/c9', {method: 'PUT', auth: null, body: {id: 'c9'}}))).status, 401);
  const wrong = 'Basic ' + Buffer.from('me:wrong').toString('base64');
  assert.equal((await h(req('/api/doc/items/c9', {method: 'PUT', auth: wrong, body: {id: 'c9'}}))).status, 401);
  assert.equal((await h(req('/api/session', {auth: null}))).status, 401);
  assert.equal((await h(req('/api/session'))).status, 200);
});

test('비밀번호 설정이 없어도 보기는 된다', async () => {
  const h = createHandler(memoryStore(), {}, SEED);
  assert.equal((await h(req('/api/data', {auth: null}))).status, 200);
  assert.equal((await h(req('/api/session'))).status, 503);
});

test('처음 읽을 때 한 번만 처음 데이터를 넣는다', async () => {
  const store = memoryStore();
  const h = createHandler(store, ENV, SEED);
  let data = await (await h(req('/api/data'))).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.blogStats[0].views, 463);
  // 전체 삭제 후에도 다시 채우지 않는다
  await h(req('/api/doc/items/c1', {method: 'DELETE'}));
  await h(req('/api/doc/blogStats/s-connect-2026-09', {method: 'DELETE'}));
  data = await (await h(req('/api/data'))).json();
  assert.deepEqual(data, {items: [], blogStats: [], settings: []});
});

test('이미 데이터가 있으면 처음 데이터를 덮어쓰지 않는다', async () => {
  const store = memoryStore();
  await store.set('items/x9', {id: 'x9', title: '기존'});
  const h = createHandler(store, ENV, SEED);
  const data = await (await h(req('/api/data'))).json();
  assert.deepEqual(data.items.map((i) => i.id), ['x9']);
});

test('문서 저장·수정·삭제', async () => {
  const h = createHandler(memoryStore(), ENV, SEED);
  await h(req('/api/data'));
  assert.equal((await h(req('/api/doc/items/new1', {method: 'PUT', body: {id: 'new1', title: '새 글'}}))).status, 200);
  assert.equal((await h(req('/api/doc/items/c1', {method: 'PUT', body: {id: 'c1', title: '수정'}}))).status, 200);
  const data = await (await h(req('/api/data'))).json();
  assert.deepEqual(data.items.map((i) => i.title).sort(), ['새 글', '수정']);
});

test('사업부 목록(settings) 저장', async () => {
  const h = createHandler(memoryStore(), ENV, SEED);
  const list = [{key: 'EAI', icon: '🔗'}];
  assert.equal((await h(req('/api/doc/settings/divisions', {method: 'PUT', body: {id: 'divisions', list}}))).status, 200);
  const data = await (await h(req('/api/data', {auth: null}))).json();
  assert.deepEqual(data.settings, [{id: 'divisions', list}]);
  assert.equal((await h(req('/api/doc/settings/divisions', {method: 'PUT', auth: null, body: {id: 'divisions', list: []}}))).status, 401);
});

test('잘못된 요청은 거부한다', async () => {
  const h = createHandler(memoryStore(), ENV, SEED);
  assert.equal((await h(req('/api/doc/other/a', {method: 'PUT', body: {id: 'a'}}))).status, 400);
  assert.equal((await h(req('/api/doc/items/a', {method: 'PUT', body: {id: 'b'}}))).status, 400);
  assert.equal((await h(req('/api/doc/items/a', {method: 'PUT', body: [1]}))).status, 400);
  assert.equal((await h(req('/api/doc/items/a%2F..', {method: 'PUT', body: {id: 'a/..'}}))).status, 400);
  assert.equal((await h(req('/api/doc/items/a', {method: 'PUT', body: {id: 'a', big: 'x'.repeat(70000)}}))).status, 413);
  assert.equal((await h(req('/api/doc/items/a', {method: 'PUT', body: {id: 'a'}, headers: {origin: 'https://evil.example'}}))).status, 403);
  const plain = new Request('https://dash.example/api/doc/items/a', {method: 'PUT', headers: {authorization: AUTH, 'content-type': 'text/plain'}, body: '{"id":"a"}'});
  assert.equal((await h(plain)).status, 415);
});
