import {
  acceptInvite,
  login,
  logout,
  recoverPassword,
  verifyRequestOrigin,
} from "@netlify/identity";
import { json } from "../../team/workspace.mjs";

export const config = { path: "/api/journal-auth" };

export default async function handle(request) {
  if (request.method !== "POST")
    return json({ error: "지원하지 않는 요청입니다." }, 405);
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return json({ error: "요청 출처를 확인해 주세요." }, 403);
    verifyRequestOrigin(request);
    const { action, email, password, token } = await request.json();
    if (action === "logout") await logout();
    else if (action === "login") await login(email, password);
    else if (action === "invite") await acceptInvite(token, password);
    else if (action === "recovery") await recoverPassword(token, password);
    else return json({ error: "지원하지 않는 요청입니다." }, 400);
    return json({ ok: true });
  } catch {
    return json(
      {
        error: "인증에 실패했습니다. 로그인 정보나 초대 링크를 확인해 주세요.",
      },
      401,
    );
  }
}
