// 콘텐츠 대시보드 API (Netlify Functions + Netlify Blobs).
// 혼자 쓰는 대시보드라 읽기와 쓰기 모두 로그인(APP_USER / APP_PASSWORD)이 필요하다.
import {createHash, timingSafeEqual} from 'node:crypto';
import seedData from '../../data/seed.mjs';

const COLLECTIONS = ['items', 'blogStats'];
const ID = /^[A-Za-z0-9_.:@+~-]{1,100}$/;
const MAX_DOC = 64 * 1024;

const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'},
});
const digest = (value) => createHash('sha256').update(value).digest();

// store: {keys(prefix), get(key), set(key, value), delete(key)} — Netlify Blobs in production, a Map in tests.
export function createHandler(store, env = process.env, seed = seedData) {
  const readCollection = async (name) => {
    const keys = await store.keys(name + '/');
    return (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean);
  };
  // 저장소가 처음 쓰일 때 한 번만 처음 데이터를 넣는다. 이후 전체 삭제해도 다시 채우지 않는다.
  const ensureSeeded = async () => {
    if (await store.get('meta/seeded')) return;
    const existing = (await Promise.all(COLLECTIONS.map((c) => store.keys(c + '/')))).flat();
    if (!existing.length) {
      for (const c of COLLECTIONS) for (const doc of seed[c] || []) await store.set(`${c}/${doc.id}`, doc);
    }
    await store.set('meta/seeded', {at: new Date().toISOString()});
  };

  return async (req) => {
    const url = new URL(req.url);
    const password = env.APP_PASSWORD, username = env.APP_USER || 'admin';
    if (typeof password !== 'string' || password.length < 12) {
      return json(503, {error: 'Netlify 환경 변수 APP_PASSWORD(12자 이상)를 설정한 뒤 다시 배포해 주세요.'});
    }
    const header = req.headers.get('authorization') || '';
    const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
    if (!timingSafeEqual(digest(username + ':' + password), digest(supplied))) return json(401, {error: '로그인이 필요합니다.'});

    try {
      if (url.pathname === '/api/session' && req.method === 'GET') return json(200, {ok: true});
      if (url.pathname === '/api/data' && req.method === 'GET') {
        await ensureSeeded();
        const [items, blogStats] = await Promise.all(COLLECTIONS.map(readCollection));
        return json(200, {items, blogStats});
      }
      const m = url.pathname.match(/^\/api\/doc\/([^/]+)\/([^/]+)$/);
      if (m && (req.method === 'PUT' || req.method === 'DELETE')) {
        const [, col, rawId] = m;
        const id = decodeURIComponent(rawId);
        if (!COLLECTIONS.includes(col) || !ID.test(id)) return json(400, {error: '잘못된 문서 주소입니다.'});
        const origin = req.headers.get('origin');
        if (origin) {
          let host = null;
          try { host = new URL(origin).host; } catch { /* 잘못된 origin */ }
          if (host !== url.host) return json(403, {error: '허용되지 않은 요청입니다.'});
        }
        if (req.method === 'DELETE') { await store.delete(`${col}/${id}`); return json(200, {ok: true}); }
        if (!(req.headers.get('content-type') || '').startsWith('application/json')) return json(415, {error: 'JSON 형식으로 보내 주세요.'});
        const text = await req.text();
        if (Buffer.byteLength(text) > MAX_DOC) return json(413, {error: '내용이 너무 큽니다.'});
        let body;
        try { body = JSON.parse(text); } catch { return json(400, {error: '입력 형식이 잘못되었습니다.'}); }
        if (!body || typeof body !== 'object' || Array.isArray(body) || body.id !== id) return json(400, {error: '입력 형식이 잘못되었습니다.'});
        await store.set(`${col}/${id}`, body);
        return json(200, {ok: true});
      }
      return json(404, {error: '페이지를 찾을 수 없습니다.'});
    } catch {
      return json(500, {error: '저장 처리에 실패했습니다.'});
    }
  };
}

let handler;
export default async (req) => {
  if (!handler) {
    const {getStore} = await import('@netlify/blobs');
    const blobs = getStore({name: 'content-dashboard', consistency: 'strong'});
    handler = createHandler({
      keys: async (prefix) => (await blobs.list({prefix})).blobs.map((b) => b.key),
      get: (key) => blobs.get(key, {type: 'json'}),
      set: (key, value) => blobs.setJSON(key, value),
      delete: (key) => blobs.delete(key),
    });
  }
  return handler(req);
};

export const config = {path: ['/api/session', '/api/data', '/api/doc/*']};
