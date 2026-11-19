const params = new URLSearchParams(location.search);
const tokens = new URLSearchParams(location.hash.slice(1));
const invite = tokens.get("invite_token");
const recovery = tokens.get("recovery_token");
const token = invite || recovery;
const mode = invite
  ? "invite"
  : recovery
    ? "recovery"
    : params.has("logout")
      ? "logout"
      : "login";
const form = document.getElementById("work-form");
const status = document.getElementById("auth-status");
const button = document.getElementById("auth-submit");
let next = location.origin + "/";
try {
  const returnUrl = new URL(params.get("return") || "/", location.origin);
  if (
    returnUrl.origin === location.origin &&
    returnUrl.pathname !== "/login.html"
  )
    next = returnUrl.href;
} catch {
  // Invalid return URLs go to the dashboard.
}

if (mode !== "login") {
  const text = {
    invite: "초대 수락",
    recovery: "비밀번호 재설정",
    logout: "로그아웃",
  }[mode];
  document.getElementById("auth-title").textContent = text;
  button.textContent = text;
  document.getElementById("email-field").hidden = true;
  form.elements.email.disabled = true;
  form.elements.password.autocomplete = "new-password";
  if (mode === "logout") {
    document.getElementById("password-field").hidden = true;
    form.elements.password.disabled = true;
  }
}

form.onsubmit = async (event) => {
  event.preventDefault();
  status.textContent = "";
  button.disabled = true;
  const email = form.elements.email.value;
  const password = form.elements.password.value;
  try {
    const response = await fetch("/api/journal-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: mode, email, password, token }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.replace(mode === "logout" ? "/login.html" : next);
  } catch (error) {
    status.textContent = error.message || "인증 요청을 완료하지 못했습니다.";
    button.disabled = false;
  }
};
