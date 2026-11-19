import { createHash, randomBytes } from "node:crypto";
import { json, headers } from "../team/workspace.mjs";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const cookieName = "__Host-journal-viewer";
const key = "workspace/viewer-link.json";
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const cookie = (token, maxAge = "") =>
  `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge}`;

async function matchesToken(store, token) {
  if (typeof token !== "string" || !tokenPattern.test(token)) return false;
  const link = await store.get(key, { type: "json" });
  return link?.hash === hashToken(token);
}

export function mayReadWithLink(request, store) {
  const match = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((value) => value.startsWith(cookieName + "="));
  return matchesToken(store, match?.slice(cookieName.length + 1));
}

export async function viewerLink(request, store, canWrite) {
  if (!canWrite)
    return json({ error: "관리자만 읽기 링크를 관리할 수 있습니다." }, 403);
  if (request.method === "GET") {
    return json({ active: Boolean(await store.get(key, { type: "json" })) });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return json({ error: "요청 출처를 확인해 주세요." }, 403);
  }
  if (request.method === "POST") {
    const token = randomBytes(32).toString("base64url");
    await store.setJSON(key, { hash: hashToken(token) });
    return json({ token });
  }
  if (request.method === "DELETE") {
    await store.delete(key);
    return json({ active: false });
  }
  return json({ error: "지원하지 않는 요청입니다." }, 405);
}

export async function viewerSession(request, store) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return json({ error: "요청 출처를 확인해 주세요." }, 403);
  }
  if (request.method === "DELETE") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "Set-Cookie": cookie("", "; Max-Age=0") },
    });
  }
  if (request.method !== "POST")
    return json({ error: "지원하지 않는 요청입니다." }, 405);
  let token;
  try {
    ({ token } = await request.json());
  } catch {}
  if (!(await matchesToken(store, token))) {
    return json(
      {
        error:
          "읽기 링크가 유효하지 않습니다. 관리자에게 새 링크를 요청해 주세요.",
      },
      403,
    );
  }
  return new Response(null, {
    status: 204,
    headers: { ...headers, "Set-Cookie": cookie(token) },
  });
}
