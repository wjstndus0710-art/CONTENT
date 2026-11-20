import { assets } from "./assets.mjs";

import { headers, json, workspace } from "./workspace.mjs";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const user = request.headers.get("oai-authenticated-user-id");
    const email = request.headers
      .get("oai-authenticated-user-email")
      ?.trim()
      .toLowerCase();
    const owner = env.JOURNAL_ADMIN_EMAIL?.trim().toLowerCase();
    if (!user)
      return pathname.startsWith("/api/")
        ? json({ error: "로그인이 필요합니다." }, 401)
        : Response.redirect(new URL("/signin-with-chatgpt", request.url), 302);
    if (pathname === "/api/workspace") {
      try {
        return await workspace(
          request,
          env,
          Boolean(email && owner && email === owner),
        );
      } catch {
        return json({ error: "공유 저장소에 연결하지 못했습니다." }, 503);
      }
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 405, headers });
    const path = pathname.endsWith("/") ? pathname + "index.html" : pathname;
    const asset = Object.hasOwn(assets, path) ? assets[path] : null;
    if (!asset)
      return new Response("페이지를 찾을 수 없습니다.", {
        status: 404,
        headers,
      });
    return new Response(request.method === "HEAD" ? null : asset[1], {
      headers: { ...headers, "Content-Type": asset[0] },
    });
  },
};
