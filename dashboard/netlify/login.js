const params = new URLSearchParams(location.search);
const form = document.getElementById("work-form");
const status = document.getElementById("auth-status");
const button = document.getElementById("auth-submit");
const heading = document.getElementById("auth-title");
const help = document.getElementById("auth-help");
let next = location.origin + "/";
try {
  const returnUrl = new URL(params.get("return") || "/", location.origin);
  if (
    returnUrl.origin === location.origin &&
    returnUrl.pathname !== "/login.html"
  ) {
    next = returnUrl.href;
  }
} catch {
  // Invalid return URLs go to the dashboard.
}

function readToken(url) {
  const fields = new URLSearchParams(url.hash.slice(1));
  const invite = fields.get("invite_token");
  const recovery = fields.get("recovery_token");
  if (invite) return { mode: "invite", token: invite };
  if (recovery) return { mode: "recovery", token: recovery };
  return null;
}

let mode = "login";
let token = null;

function setMode(nextMode, nextToken = null) {
  mode = nextMode;
  token = nextToken;
  const labels = {
    login: ["마케팅 일지 로그인", "로그인"],
    invite: ["초대 수락", "비밀번호 설정"],
    recovery: ["비밀번호 재설정", "새 비밀번호 저장"],
    logout: ["로그아웃", "로그아웃"],
  };
  [heading.textContent, button.textContent] = labels[mode];
  const login = mode === "login";
  const logout = mode === "logout";
  help.hidden = !login;
  document.getElementById("email-field").hidden = !login;
  form.elements.email.disabled = !login;
  document.getElementById("password-field").hidden = logout;
  form.elements.password.disabled = logout;
  form.elements.password.autocomplete = login
    ? "current-password"
    : "new-password";
  status.textContent = "";
  if (!login && !logout) {
    form.elements.password.value = "";
    form.elements.password.focus();
  }
}

async function send(data) {
  const response = await fetch("/api/journal-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
}

const existing = readToken(new URL(location.href));
if (existing) {
  history.replaceState(null, "", location.pathname + location.search);
  setMode(existing.mode, existing.token);
} else if (params.has("logout")) {
  setMode("logout");
}

form.onsubmit = async (event) => {
  event.preventDefault();
  status.textContent = "";
  button.disabled = true;
  try {
    await send({
      action: mode,
      email: form.elements.email.value,
      password: form.elements.password.value,
      token,
    });
    location.replace(mode === "logout" ? "/login.html" : next);
  } catch (error) {
    status.textContent = error.message || "인증 요청을 완료하지 못했습니다.";
    button.disabled = false;
  }
};

document.getElementById("auth-link-form").onsubmit = (event) => {
  event.preventDefault();
  const input = document.getElementById("auth-link");
  const info = document.getElementById("auth-link-status");
  let parsed;
  try {
    const url = new URL(input.value.trim());
    if (url.protocol === "https:") parsed = readToken(url);
  } catch {
    // The message below covers incomplete links.
  }
  if (!parsed) {
    info.textContent =
      "초대·재설정 링크를 연 뒤, 주소창에 표시된 주소 전체를 붙여넣어 주세요.";
    return;
  }
  input.value = "";
  info.textContent = "";
  setMode(parsed.mode, parsed.token);
};

const reset = document.getElementById("request-reset");
reset.onclick = async () => {
  if (!form.elements.email.reportValidity()) return;
  status.textContent = "";
  reset.disabled = true;
  try {
    await send({ action: "request-reset", email: form.elements.email.value });
    status.textContent =
      "등록된 이메일이라면 재설정 메일이 도착합니다. 메일의 링크를 열어 주세요.";
  } catch (error) {
    status.textContent = error.message || "재설정 메일을 요청하지 못했습니다.";
  } finally {
    reset.disabled = false;
  }
};
