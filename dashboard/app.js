const $ = (id) => document.getElementById(id);
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const remember = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const mondayOf = (date) => addDays(date, -dayIndex(date));
const short = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
let journal = { days: {}, weeks: {}, schedule: [], reviews: [] },
  weekStart = mondayOf(today()),
  focusDate = null;
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
const tasksOf = (date) => journal.days[date] || [];
const showWeekend = () =>
  $("show-weekend").checked ||
  [5, 6].some((i) => tasksOf(addDays(weekStart, i)).length);
const nextWorkday = (date) => {
  let next = addDays(date, 1);
  while (!showWeekend() && dayIndex(next) > 4) next = addDays(next, 1);
  return next;
};

function renderSummary() {
  const t = today(),
    [y, m, d] = t.split("-").map(Number),
    mine = tasksOf(t),
    left = mine.filter((x) => !x.done).length;
  $("today-title").textContent = `${m}월 ${d}일 ${weekdays[dayIndex(t)]}요일`;
  $("today-summary").textContent = mine.length
    ? left
      ? `오늘 할 일 ${mine.length}개 중 ${left}개가 남았어요.`
      : "오늘 할 일을 모두 끝냈어요."
    : "오늘은 아직 기록이 없어요. 할 일을 적어 보세요.";
  $("stat-today").textContent = left;
  $("stat-today-sub").textContent =
    `완료 ${mine.length - left} / 전체 ${mine.length}`;
  const week = Array.from({ length: 7 }, (_, i) =>
      tasksOf(addDays(weekStart, i)),
    ).flat(),
    done = week.filter((x) => x.done).length,
    rate = week.length ? Math.round((done / week.length) * 100) : 0;
  $("stat-week").textContent = rate + "%";
  $("stat-week-bar").style.width = rate + "%";
  const monthTasks = Object.entries(journal.days)
    .filter(([date]) => date.startsWith(t.slice(0, 7)))
    .flatMap(([, x]) => x);
  $("stat-month").textContent = monthTasks.filter((x) => x.done).length;
  $("stat-month-sub").textContent =
    `${y}년 ${m}월 · 기록 ${Object.keys(journal.days).filter((x) => x.startsWith(t.slice(0, 7))).length}일`;
  $("stat-overdue").textContent = Array.from({ length: 7 }, (_, i) =>
    tasksOf(addDays(t, -(i + 1))),
  )
    .flat()
    .filter((x) => !x.done).length;
}
function renderWeekHead() {
  const end = addDays(weekStart, 6),
    [y, m, d] = weekStart.split("-").map(Number);
  $("week-label").textContent = `${y}년 ${m}월 ${d}일 – ${short(end)}`;
  if (document.activeElement !== $("week-focus"))
    $("week-focus").value = journal.weeks[weekStart] || "";
}
function taskItem(date, tasks, index) {
  const t = tasks[index],
    li = node("li", undefined, t.done ? "done" : ""),
    box = node("input"),
    text = node("span", t.text, "text"),
    actions = node("span", undefined, "task-actions");
  box.type = "checkbox";
  box.checked = t.done;
  box.disabled = !mayWrite;
  box.setAttribute("aria-label", t.text + " 완료");
  box.onchange = () =>
    saveDay(
      date,
      tasks.map((x, i) => (i === index ? { ...x, done: box.checked } : x)),
    );
  text.title = "눌러서 수정";
  if (mayWrite)
    text.onclick = () => {
      const input = node("input");
      input.type = "text";
      input.value = t.text;
      input.maxLength = 500;
      let finished = false;
      const finish = (commit) => {
        if (finished) return;
        finished = true;
        const value = input.value.trim();
        if (!commit || value === t.text) {
          render();
          return;
        }
        saveDay(
          date,
          value
            ? tasks.map((x, i) => (i === index ? { ...x, text: value } : x))
            : tasks.filter((x, i) => i !== index),
        );
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          finish(true);
        }
        if (e.key === "Escape") finish(false);
      };
      input.onblur = () => finish(true);
      text.replaceWith(input);
      input.focus();
    };
  if (!t.done) {
    const move = node("button", "→", "icon");
    const next = nextWorkday(date);
    move.title = `${short(next)}로 넘기기`;
    move.setAttribute("aria-label", `${t.text} ${short(next)}로 넘기기`);
    move.onclick = () => moveTask(date, index, next);
    actions.append(move);
  }
  const remove = node("button", "×", "icon remove");
  remove.setAttribute("aria-label", t.text + " 삭제");
  remove.onclick = () =>
    saveDay(
      date,
      tasks.filter((x, i) => i !== index),
    );
  actions.append(remove);
  li.append(box, text, actions);
  return li;
}
function renderBoard() {
  const query = $("search").value.trim().toLowerCase();
  $("journal-days").hidden = !!query;
  $("journal-results").hidden = !query;
  if (query) {
    const results = $("journal-results");
    results.replaceChildren();
    let found = 0;
    for (const date of Object.keys(journal.days).sort().reverse()) {
      const hits = journal.days[date].filter((t) =>
        t.text.toLowerCase().includes(query),
      );
      if (!hits.length) continue;
      found += hits.length;
      results.append(node("h3", `${date} (${weekdays[dayIndex(date)]})`));
      const ul = node("ul", undefined, "tasks");
      for (const t of hits) {
        const li = node(
          "li",
          (t.done ? "✓ " : "") + t.text,
          t.done ? "done" : "",
        );
        li.title = "이 주로 이동";
        li.tabIndex = 0;
        li.onclick = li.onkeydown = (e) => {
          if (e.type === "keydown" && e.key !== "Enter") return;
          $("search").value = "";
          weekStart = mondayOf(date);
          render();
        };
        ul.append(li);
      }
      results.append(ul);
    }
    results.prepend(
      node(
        "p",
        found
          ? `검색 결과 ${found}건 · 누르면 그 주로 이동합니다.`
          : "검색 결과가 없습니다.",
        "hint",
      ),
    );
    return;
  }
  const weekend = showWeekend(),
    grid = $("journal-days");
  grid.replaceChildren();
  grid.classList.toggle("weekend", weekend);
  Array.from({ length: weekend ? 7 : 5 }, (_, i) =>
    addDays(weekStart, i),
  ).forEach((date, i) => {
    const tasks = tasksOf(date),
      card = node(
        "section",
        undefined,
        "day-card" +
          (date === today() ? " today" : "") +
          (date < today() ? " past" : ""),
      ),
      head = node("div", undefined, "day-head"),
      title = node("h3", `${short(date)} (${weekdays[i]})`);
    head.append(title);
    if (date === today()) head.append(node("span", "오늘", "pill"));
    else if (tasks.some((t) => !t.done) && date < today()) {
      const all = node("button", "모두 완료", "link");
      all.onclick = () =>
        saveDay(
          date,
          tasks.map((t) => ({ ...t, done: true })),
        );
      head.append(all);
    }
    const ul = node("ul", undefined, "tasks");
    tasks.forEach((_, index) => ul.append(taskItem(date, tasks, index)));
    const add = node("input", undefined, "add");
    add.placeholder = "할 일 입력 후 Enter";
    add.maxLength = 500;
    add.dataset.date = date;
    add.setAttribute("aria-label", `${date} 할 일 추가`);
    add.onkeydown = (e) => {
      if (e.key !== "Enter" || e.isComposing || !add.value.trim()) return;
      e.preventDefault();
      if (tasks.length >= 100) {
        $("message").textContent = "하루 할 일은 100개까지 기록할 수 있습니다.";
        return;
      }
      focusDate = date;
      saveDay(date, [...tasks, { text: add.value.trim(), done: false }]);
    };
    card.append(head, ul, add);
    grid.append(card);
  });
  if (focusDate) {
    grid.querySelector(`input.add[data-date="${focusDate}"]`)?.focus();
    focusDate = null;
  }
}
function render() {
  renderSummary();
  renderWeekHead();
  renderWork();
  renderBoard();
  $("week-focus").readOnly = !mayWrite;
}
function persist(next) {
  if (!mayWrite) return;
  recordStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  journal = next;
}

function saveDay(date, tasks) {
  try {
    persist({ ...journal, days: { ...journal.days, [date]: tasks } });
    $("message").textContent = "";
    render();
  } catch {
    focusDate = null;
    $("message").textContent = "변경사항을 저장하지 못했습니다.";
    render();
  }
}

function moveTask(date, index, next) {
  const from = tasksOf(date);
  const destination = tasksOf(next);
  if (destination.length >= 100) {
    $("message").textContent = "다음 날 할 일이 100개라 넘길 수 없습니다.";
    return;
  }
  const task = from[index];
  try {
    persist({
      ...journal,
      days: {
        ...journal.days,
        [date]: from.filter((_, i) => i !== index),
        [next]: [...destination, task],
      },
    });
    render();
    $("message").textContent = `‘${task.text}’를 ${short(next)}로 넘겼습니다.`;
  } catch {
    $("message").textContent = "할 일을 넘기지 못했습니다.";
  }
}

$("add").onclick = () => {
  $("search").value = "";
  weekStart = mondayOf(today());
  if (dayIndex(today()) > 4) $("show-weekend").checked = true;
  focusDate = today();
  render();
};
$("prev-week").onclick = () => {
  weekStart = addDays(weekStart, -7);
  render();
};
$("next-week").onclick = () => {
  weekStart = addDays(weekStart, 7);
  render();
};
$("this-week").onclick = () => {
  weekStart = mondayOf(today());
  render();
};
$("search").oninput = renderBoard;
$("show-weekend").checked = stored("show-weekend") === "1";
$("show-weekend").onchange = () => {
  remember("show-weekend", $("show-weekend").checked ? "1" : "0");
  render();
};
$("week-focus").onchange = () => {
  const focus = $("week-focus").value;
  try {
    persist({ ...journal, weeks: { ...journal.weeks, [weekStart]: focus } });
    renderReport();
    $("focus-status").textContent = "저장했습니다.";
  } catch {
    $("focus-status").textContent = "목표를 저장하지 못했습니다.";
  }
};
$("week-focus").oninput = () => {
  $("focus-status").textContent = "입력 칸 밖을 누르면 저장됩니다.";
};

$("backup").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(journal, null, 2)], {
      type: "application/json",
    }),
  );
  const link = node("a");
  link.href = url;
  link.download = `marketing-journal-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("restore").onclick = () => $("restore-file").click();
$("restore-file").onchange = async () => {
  const input = $("restore-file");
  const file = input.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("5MB 이하의 백업 파일을 선택해 주세요.");
    const source = await file.text();
    const next = parseJournal(source);
    const backup = JSON.parse(source);
    if (
      Array.isArray(backup.journalDays) &&
      Array.isArray(backup.journalWeeks)
    ) {
      const days = { ...journal.days };
      for (const [date, imported] of Object.entries(next.days)) {
        const existing = days[date] || [];
        const texts = new Set(existing.map((task) => task.text));
        days[date] = [
          ...existing,
          ...imported.filter((task) => !texts.has(task.text)),
        ];
      }
      persist({ ...journal, days, weeks: { ...next.weeks, ...journal.weeks } });
      render();
      $("message").textContent =
        "이전 백업의 일별 기록과 주간 목표를 합쳤습니다.";
      return;
    }
    if (
      Object.keys(journal.days).length ||
      Object.keys(journal.weeks).length ||
      journal.schedule.length ||
      journal.reviews.length
    ) {
      if (
        !confirm("현재 브라우저의 일지가 백업 내용으로 교체됩니다. 계속할까요?")
      )
        return;
    }
    persist(next);
    render();
    $("message").textContent = "백업을 복원했습니다.";
  } catch (error) {
    $("message").textContent = "백업 복원에 실패했습니다. " + error.message;
  } finally {
    input.value = "";
  }
};

function workRow(entry, key, contentById) {
  const row = node("li", undefined, "work-row");
  const info = node("div");
  const late = stillOpen(entry) && entry.date < today();
  info.append(
    node("strong", entry.title),
    node(
      "p",
      [
        entry.date,
        key === "reviews" ? entry.team : entry.kind,
        entry.status,
        late ? "기한 지남" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      late ? "work-late" : "hint",
    ),
  );
  if (entry.notes) info.append(node("p", entry.notes, "work-notes"));
  const content = contentById.get(entry.contentId);
  if (content) {
    const link = node(
      "a",
      key === "reviews" ? content.title : "콘텐츠 관리에서 열기",
    );
    link.href = contentUrl(content.id);
    info.append(link);
  } else if (key === "reviews" && entry.contentId) {
    info.append(node("p", "연결된 콘텐츠를 찾을 수 없습니다.", "hint"));
  }
  if (key === "schedule" && entry.contentId) {
    row.append(info);
    return row;
  }
  const edit = node("button", "수정", "secondary");
  edit.setAttribute("aria-label", entry.title + " 수정");
  edit.onclick = () => editWork(key, entry);
  row.append(info, edit);
  return row;
}

function renderWork() {
  const mode = $("schedule-filter").value;
  const contentById = new Map(contentItems().map((item) => [item.id, item]));
  const schedule = [...journal.schedule, ...contentSchedule()]
    .filter((entry) => {
      if (mode === "week")
        return entry.date >= weekStart && entry.date <= addDays(weekStart, 6);
      if (mode === "upcoming") return stillOpen(entry);
      return true;
    })
    .sort(byDate);
  const reviews = [...journal.reviews].sort(
    (a, b) => Number(stillOpen(b)) - Number(stillOpen(a)) || byDate(a, b),
  );
  $("review-count").textContent =
    `미회신 ${reviews.filter(stillOpen).length}건 · 전체 ${reviews.length}건`;
  $("schedule-list").replaceChildren(
    ...(schedule.length
      ? schedule.map((entry) => workRow(entry, "schedule", contentById))
      : [node("li", "표시할 일정이 없습니다.", "hint")]),
  );
  $("review-list").replaceChildren(
    ...(reviews.length
      ? reviews.map((entry) => workRow(entry, "reviews", contentById))
      : [node("li", "등록된 검수 요청이 없습니다.", "hint")]),
  );
  renderReport();
}

function renderReport() {
  const monthly = $("report-period").value === "month";
  const monthOfWeek = addDays(weekStart, 3).slice(0, 7);
  const [year, month] = monthOfWeek.split("-").map(Number);
  const start = monthly ? monthOfWeek + "-01" : weekStart;
  const end = monthly
    ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    : addDays(weekStart, 6);
  $("report").value = buildReport(
    journal,
    start,
    end,
    monthly ? "월간" : "주간",
  );
  $("copy-status").textContent = "";
}

const form = $("work-form");
const dialog = $("work-dialog");
let editingWork;

function editWork(key, entry) {
  if (!mayWrite) return;
  editingWork = { key, entry };
  const review = key === "reviews";
  const { kinds, statuses } = workOptions[key];
  form.reset();
  $("work-title").textContent =
    (review ? "검수 요청" : "일정") + (entry ? " 수정" : " 추가");
  $("work-kind-label").hidden = review;
  $("work-team-label").hidden = !review;
  $("work-content-label").hidden = !review;
  const contentSelect = form.elements.contentId;
  contentSelect.disabled = !review;
  const options = contentItems().map(
    (item) =>
      new Option(
        [item.title, item.division, item.publishDate]
          .filter(Boolean)
          .join(" · "),
        item.id,
      ),
  );
  if (
    entry?.contentId &&
    !options.some((option) => option.value === entry.contentId)
  ) {
    options.push(new Option("연결된 콘텐츠를 찾을 수 없음", entry.contentId));
  }
  contentSelect.replaceChildren(new Option("연결 안 함", ""), ...options);
  contentSelect.value = entry?.contentId || "";
  $("work-date-label").firstElementChild.textContent = review
    ? "회신 기한"
    : "예정일";
  $("work-notes-label").firstElementChild.textContent = review
    ? "검수·협조 요청 요약"
    : "일정 메모";
  form.elements.team.required = review;
  form.elements.notes.required = review;
  form.elements.kind.replaceChildren(
    ...kinds.map((value) => new Option(value)),
  );
  form.elements.status.replaceChildren(
    ...statuses.map((value) => new Option(value)),
  );
  form.elements.date.value = today();
  $("work-error").textContent = "";
  $("work-delete").hidden = !entry;
  for (const field of ["title", "kind", "team", "date", "status", "notes"]) {
    if (entry) form.elements[field].value = entry[field];
  }
  dialog.showModal();
}

function saveWork(entries) {
  try {
    persist({ ...journal, [editingWork.key]: entries });
    renderWork();
    dialog.close();
  } catch {
    $("work-error").textContent = "저장하지 못했습니다.";
  }
}

form.onsubmit = (event) => {
  event.preventDefault();
  const { key, entry } = editingWork;
  const values = Object.fromEntries(
    Array.from(new FormData(form), ([field, value]) => [
      field,
      field === "contentId" ? value : value.trim(),
    ]),
  );
  if (!values.title || (key === "reviews" && (!values.team || !values.notes))) {
    $("work-error").textContent = "필수 항목을 입력해 주세요.";
    return;
  }
  const next = { ...values, id: entry?.id ?? crypto.randomUUID() };
  if (key === "schedule") $("schedule-filter").value = "all";
  saveWork(
    entry
      ? journal[key].map((item) => (item.id === entry.id ? next : item))
      : [...journal[key], next],
  );
};

$("schedule-add").onclick = () => editWork("schedule");
$("review-add").onclick = () => editWork("reviews");
$("work-cancel").onclick = () => dialog.close();
$("work-delete").onclick = () => {
  const { key, entry } = editingWork;
  if (confirm(`‘${entry.title}’을 삭제할까요?`))
    saveWork(journal[key].filter((item) => item.id !== entry.id));
};
$("schedule-filter").onchange = renderWork;
window.addEventListener("storage", (event) => {
  if (event.key === CONTENT_KEY || event.key === null) renderWork();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) renderWork();
});
$("report-period").onchange = renderReport;
$("copy-report").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("report").value);
    $("copy-status").textContent = "요약을 복사했습니다.";
  } catch {
    $("report").focus();
    $("report").select();
    $("copy-status").textContent = "선택된 요약을 복사해 주세요.";
  }
};

try {
  const existing = recordStorage.getItem(LOCAL_KEY);
  if (existing) journal = parseJournal(existing);
} catch {
  $("message").textContent = "저장된 일지를 불러오지 못했습니다.";
}
render();
