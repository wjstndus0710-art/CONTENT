const recordStorage = window.teamWorkspace?.storage || localStorage;
const mayWrite = window.teamWorkspace?.canWrite ?? true;
const CONTENT_KEY = "content-dashboard:v2";
const CONTENT_STATS_KEY = CONTENT_KEY + ":blog-monthly";
const LOCAL_KEY = "marketing-journal-local-v1";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const addDays = (date, n) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayIndex = (date) => (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
const workOptions = {
  schedule: {
    kinds: ["행사", "콘텐츠", "뉴스레터"],
    statuses: ["예정", "완료", "취소"],
  },
  reviews: {
    kinds: ["검수 요청"],
    statuses: ["요청 예정", "검수 중", "회신 완료"],
  },
};

function parseWork(data, validDate) {
  return Object.fromEntries(
    Object.entries(workOptions).map(([key, options]) => {
      const entries = data[key] === undefined ? [] : data[key];
      const ids = new Set();
      if (
        !Array.isArray(entries) ||
        entries.some((item) => {
          if (
            !item ||
            typeof item.id !== "string" ||
            !item.id ||
            ids.has(item.id)
          )
            return true;
          ids.add(item.id);
          return (
            typeof item.title !== "string" ||
            !item.title.trim() ||
            typeof item.team !== "string" ||
            typeof item.notes !== "string" ||
            (key === "reviews" && (!item.team.trim() || !item.notes.trim())) ||
            typeof item.date !== "string" ||
            !validDate(item.date) ||
            !options.kinds.includes(item.kind) ||
            !options.statuses.includes(item.status)
          );
        })
      )
        throw new Error("일정 또는 검수 요청 형식을 확인해 주세요.");
      return [key, entries];
    }),
  );
}

const stillOpen = (entry) =>
  entry.kind === "검수 요청"
    ? entry.status !== "회신 완료"
    : entry.status === "예정";
const byDate = (a, b) => a.date.localeCompare(b.date);
const describeWork = (entry) =>
  entry.kind === "검수 요청"
    ? `${entry.date} [${entry.status}] ${entry.title} · ${entry.team} — ${entry.notes}`
    : `${entry.date} [${entry.kind} · ${entry.status}] ${entry.title}${entry.notes ? " — " + entry.notes : ""}`;

function parseJournal(source) {
  const data = JSON.parse(source);
  const validDate = (date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  };
  const isRecord = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  const dayRows = data?.days ?? data?.journalDays;
  const weekRows = data?.weeks ?? data?.journalWeeks;
  const days = Array.isArray(dayRows)
    ? Object.fromEntries(dayRows.map((day) => [day.date, day.tasks]))
    : dayRows;
  const weeks = Array.isArray(weekRows)
    ? Object.fromEntries(weekRows.map((week) => [week.week_start, week.focus]))
    : weekRows;
  if (!isRecord(days) || !isRecord(weeks))
    throw new Error("올바른 일지 백업 형식이 아닙니다.");
  for (const [date, tasks] of Object.entries(days)) {
    if (
      !validDate(date) ||
      !Array.isArray(tasks) ||
      tasks.some(
        (task) =>
          typeof task?.text !== "string" || typeof task.done !== "boolean",
      )
    )
      throw new Error("날짜 또는 할 일 형식을 확인해 주세요.");
  }
  for (const [date, focus] of Object.entries(weeks)) {
    if (!validDate(date) || dayIndex(date) !== 0 || typeof focus !== "string") {
      throw new Error("주간 목표 형식을 확인해 주세요.");
    }
  }
  return { days, weeks, ...parseWork(data, validDate) };
}

function contentItems() {
  try {
    const items = JSON.parse(recordStorage.getItem(CONTENT_KEY) || "[]");
    if (!Array.isArray(items)) return [];
    return items.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item.title === "string" &&
        item.title.trim(),
    );
  } catch {
    return [];
  }
}

function contentUrl(id) {
  const href = "content/index.html?item=" + encodeURIComponent(id);
  return window.teamWorkspace?.navigationUrl?.(href) || href;
}

function contentSchedule() {
  const hasDate = (date) =>
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return contentItems().flatMap((item) => {
    const localized = Object.entries({ en: "영어", ja: "일본어" }).flatMap(
      ([key, language]) => {
        const variant = item.locales?.[key];
        if (!hasDate(variant?.date) || variant.status === "미착수") return [];
        return [
          {
            id: item.id + ":" + key,
            contentId: item.id,
            title: (variant.title || item.title) + " (" + language + ")",
            date: variant.date,
            kind: "콘텐츠",
            status: variant.status === "발행 완료" ? "완료" : "예정",
            notes: [variant.status, variant.owner].filter(Boolean).join(" · "),
          },
        ];
      },
    );
    if (!hasDate(item.publishDate)) return localized;
    const channel = item.sourceChannel || item.division || "";
    const isPublished =
      item.stage === "발행" ||
      item.channels?.[item.sourceChannel] === "발행완료";
    return [
      {
        id: item.id,
        contentId: item.id,
        title: item.title,
        date: item.publishDate,
        kind: /뉴스레터|스티비/.test(channel) ? "뉴스레터" : "콘텐츠",
        status: isPublished ? "완료" : "예정",
        notes: [
          channel,
          item.category,
          item.stage && "제작 " + item.stage,
          item.result && "성과 " + item.result,
          item.learning && "다음 제작 " + item.learning,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      ...localized,
    ];
  });
}

function blogResults(month) {
  try {
    const rows = JSON.parse(recordStorage.getItem(CONTENT_STATS_KEY) || "[]");
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row?.month === month && typeof row.blog === "string")
      .map((row) => {
        const metrics = [
          ["조회수", row.views],
          ["방문자", row.visitors],
          ["발행 수", row.posts],
        ]
          .filter(([, value]) => Number.isFinite(value))
          .map(([label, value]) => label + " " + value.toLocaleString("ko-KR"));
        return [row.blog, ...metrics, row.memo].filter(Boolean).join(" · ");
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildReport(journal, start, end, period) {
  const inPeriod = (date) => date >= start && date <= end;
  const tasks = Object.entries(journal.days)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([date]) => inPeriod(date))
    .flatMap(([date, entries]) => entries.map((task) => ({ ...task, date })));
  const goals = Object.entries(journal.weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(
      ([date, goal]) => goal.trim() && date <= end && addDays(date, 6) >= start,
    );
  const section = (title, lines) => [
    `${title} (${lines.length}건)`,
    ...(lines.length ? lines.map((line) => "- " + line) : ["- 없음"]),
    "",
  ];
  const titles = new Map(contentItems().map((item) => [item.id, item.title]));
  const reviewLine = (entry) => {
    const title = titles.get(entry.contentId);
    return describeWork(entry) + (title ? " · 연결 콘텐츠 " + title : "");
  };
  const taskLine = (task) => `${task.date} ${task.text}`;
  return [
    `${period} 업무 요약 | ${start} ~ ${end}`,
    "",
    ...section(
      "주간 목표",
      goals.map(([date, goal]) => `${date} 주 · ${goal}`),
    ),
    ...section("완료한 업무", tasks.filter((task) => task.done).map(taskLine)),
    ...section("미완료 업무", tasks.filter((task) => !task.done).map(taskLine)),
    ...section(
      "행사·발행 일정",
      [...journal.schedule, ...contentSchedule()]
        .filter((entry) => inPeriod(entry.date))
        .sort(byDate)
        .map(describeWork),
    ),
    ...(period === "월간"
      ? section("블로그 월간 성과", blogResults(start.slice(0, 7)))
      : []),
    ...section(
      "검수 요청",
      journal.reviews
        .filter((entry) => inPeriod(entry.date))
        .sort(byDate)
        .map(reviewLine),
    ),
    ...section(
      "이전 기간 미회신",
      journal.reviews
        .filter((entry) => entry.date < start && stillOpen(entry))
        .sort(byDate)
        .map(reviewLine),
    ),
  ]
    .join("\n")
    .trimEnd();
}
