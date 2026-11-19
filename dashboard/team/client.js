(() => {
  const endpoint = "/api/workspace";
  const keys = [
    "marketing-journal-local-v1",
    "content-dashboard:v2",
    "content-dashboard:v2:blog-monthly",
    "content-dashboard:v2:settings",
  ];
  const loader = document.getElementById("team-loader");
  const panel = document.getElementById("team-storage-status");
  const message = document.createElement("span");
  const control = document.createElement("button");
  control.type = "button";
  control.hidden = true;
  panel.append(message, control);
  const notify = (text, action, callback) => {
    message.textContent = text;
    control.hidden = !action;
    control.textContent = action || "";
    control.onclick = callback || null;
  };

  async function connect() {
    const netlify = document.documentElement.dataset.auth === "netlify";
    const loginUrl =
      "/login.html?return=" +
      encodeURIComponent(location.pathname + location.search);
    if (netlify && /(?:^#|&)(?:invite|recovery)_token=/.test(location.hash)) {
      location.replace(loginUrl + location.hash);
      return;
    }
    notify("공유 기록을 불러오는 중입니다.");
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const workspace = await response.json();
    let revision = workspace.revision;
    let records = workspace.records;
    let pending = false;
    let saving = false;
    let conflicted = false;
    const role = workspace.canWrite ? "관리자" : "읽기 전용";

    async function flush() {
      if (saving || conflicted || !pending) return;
      saving = true;
      notify("서버에 저장 중입니다.");
      try {
        while (pending) {
          pending = false;
          const sent = await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision, records }),
          });
          if (sent.status === 409) conflicted = true;
          if (!sent.ok) throw new Error();
          revision = (await sent.json()).revision;
        }
        notify(role + " · 서버에 저장됨");
      } catch {
        pending = true;
        if (conflicted) {
          notify(
            "다른 창에서 기록이 변경되어 저장을 멈췄습니다.",
            "다시 불러오기",
            () => {
              if (
                confirm(
                  "이 창에서 아직 저장되지 않은 변경을 버리고 다시 불러올까요?",
                )
              ) {
                pending = false;
                location.reload();
              }
            },
          );
        } else {
          notify(
            "서버에 저장하지 못했습니다. 이 창을 유지하고 다시 저장해 주세요.",
            "다시 저장",
            flush,
          );
        }
      } finally {
        saving = false;
      }
    }

    window.teamWorkspace = {
      canWrite: workspace.canWrite,
      storage: {
        getItem: (key) =>
          Object.hasOwn(records, key) ? JSON.stringify(records[key]) : null,
        setItem(key, value) {
          if (!workspace.canWrite || !keys.includes(key) || conflicted)
            throw new Error("저장할 수 없습니다.");
          records = { ...records, [key]: JSON.parse(value) };
          pending = true;
          void flush();
        },
      },
    };
    if (netlify && !workspace.canWrite) {
      for (const link of document.querySelectorAll(
        'a[href="/login.html?logout=1"]',
      )) {
        link.href = loginUrl;
        link.textContent = "관리자 로그인";
      }
    }
    document.body.classList.toggle("team-viewer", !workspace.canWrite);
    if (workspace.canWrite)
      window.addEventListener("beforeunload", (event) => {
        if (pending || saving) event.preventDefault();
      });

    function importOffer() {
      if (!workspace.canWrite || revision) {
        notify(role + " · 공유 저장소");
        return;
      }
      let legacy;
      try {
        legacy = Object.fromEntries(
          keys.flatMap((key) => {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const data = key === keys[0] ? parseJournal(raw) : JSON.parse(raw);
            return !Object.hasOwn(records, key) &&
              (key === keys[0] || Array.isArray(data))
              ? [[key, data]]
              : [];
          }),
        );
      } catch {
        notify("관리자 · 기존 브라우저 기록을 읽지 못했습니다.");
        return;
      }
      if (!Object.keys(legacy).length) {
        notify("관리자 · 공유 저장소");
        return;
      }
      notify(
        "이 브라우저에 기존 기록이 있습니다.",
        "공유 저장소로 옮기기",
        async () => {
          if (
            !confirm(
              "현재 브라우저의 일지와 콘텐츠 기록을 팀 공유 저장소에 복사할까요?",
            )
          )
            return;
          records = { ...records, ...legacy };
          pending = true;
          await flush();
          if (!pending) location.reload();
        },
      );
    }

    for (const src of loader.dataset.scripts.split(" ")) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.append(script);
      });
    }
    for (const badge of document.querySelectorAll("#store-pill, #sync-status"))
      badge.textContent = "서버 공유 저장";
    document.body.classList.remove("team-loading");
    importOffer();
  }

  connect().catch(() => {
    notify("공유 기록에 연결하지 못했습니다.", "다시 불러오기", () =>
      location.reload(),
    );
  });
})();
