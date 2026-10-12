/* 콘텐츠 마케팅 대시보드 — 빌드 없이 브라우저에서 바로 실행되는 단일 스크립트.
 * 데이터는 브라우저 localStorage에 저장되며 CSV/JSON으로 가져오기·내보내기 할 수 있다. */
(() => {
  'use strict';

  // ---------- 설정 ----------
  const STORAGE_KEY = 'content-dashboard:v1';
  const CHANNELS = ['블로그', '인스타그램', '유튜브', '뉴스레터', '링크드인', '틱톡', '스레드', '기타'];
  const FORMATS = ['아티클', '카드뉴스', '숏폼 영상', '롱폼 영상', '이메일', '이미지', '라이브', '기타'];
  const STATUSES = [
    { key: '아이디어', color: 'var(--muted)' },
    { key: '기획', color: 'var(--s7)' },
    { key: '제작중', color: 'var(--s1)' },
    { key: '검수', color: 'var(--st-warning)' },
    { key: '발행예정', color: 'var(--s3)' },
    { key: '발행완료', color: 'var(--st-good)' },
  ];
  const STATUS_KEYS = STATUSES.map((s) => s.key);
  const DONE = '발행완료';
  const METRICS = ['views', 'likes', 'comments', 'shares', 'clicks', 'conversions'];

  // CSV 열 이름 ↔ 필드 (한글/영문 헤더 모두 인식)
  const CSV_FIELDS = [
    ['title', '제목', ['title', '콘텐츠', '콘텐츠명', '제목']],
    ['channel', '채널', ['channel', '플랫폼', '매체']],
    ['format', '형식', ['format', 'type', '유형', '포맷']],
    ['status', '상태', ['status', '진행상태', '진행 상태']],
    ['owner', '담당자', ['owner', 'assignee', '작성자']],
    ['campaign', '캠페인', ['campaign']],
    ['tags', '태그', ['tags', 'tag', '키워드']],
    ['dueDate', '마감일', ['duedate', 'due', 'deadline', '마감']],
    ['publishDate', '발행일', ['publishdate', 'publish', 'date', '게시일', '업로드일', '발행 날짜']],
    ['url', 'URL', ['url', 'link', '링크']],
    ['views', '조회수', ['views', 'view', '조회', '노출', 'impressions']],
    ['likes', '좋아요', ['likes', 'like']],
    ['comments', '댓글', ['comments', 'comment']],
    ['shares', '공유', ['shares', 'share', '저장']],
    ['clicks', '클릭', ['clicks', 'click', '클릭수']],
    ['conversions', '전환', ['conversions', 'conversion', '전환수']],
    ['notes', '메모', ['notes', 'note', '비고']],
  ];

  // ---------- 유틸 ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('ko-KR'));
  const fmtCompact = (n) => {
    if (n == null || isNaN(n)) return '–';
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만';
    return Math.round(n).toLocaleString('ko-KR');
  };
  const pct = (n) => (n == null || !isFinite(n) ? '–' : (n * 100).toFixed(1) + '%');

  function toISO(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parseDate(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  function normDate(s) {
    const d = parseDate(s);
    return d ? toISO(d) : '';
  }
  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  const shortDate = (s) => { const d = parseDate(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : '–'; };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const engagement = (it) => {
    const v = +it.views || 0;
    if (!v) return null;
    return ((+it.likes || 0) + (+it.comments || 0) + (+it.shares || 0)) / v;
  };
  const channelColor = (ch) => `var(--s${(CHANNELS.indexOf(ch) + 1) || 8})`;
  const statusColor = (st) => (STATUSES.find((s) => s.key === st) || {}).color || 'var(--muted)';
  const chanBadge = (ch) => `<span class="chan" style="--c:${channelColor(ch)}">${esc(ch || '–')}</span>`;
  const statusBadge = (st) => `<span class="status" style="--dot:${statusColor(st)}">${esc(st || '–')}</span>`;

  function isOverdue(it) {
    if (it.status === DONE) return false;
    const d = parseDate(it.dueDate);
    return d && d < today();
  }

  // ---------- 저장소 ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).map(normalize);
    } catch (e) { /* 저장소를 쓸 수 없으면 샘플로 시작 */ }
    return sampleData();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { toast('브라우저 저장에 실패했습니다. JSON 백업을 내려받아 두세요.'); }
  }
  function normalize(raw) {
    const it = {
      id: raw.id || uid(),
      title: String(raw.title || '').trim() || '(제목 없음)',
      channel: CHANNELS.includes(raw.channel) ? raw.channel : matchOption(raw.channel, CHANNELS, '기타'),
      format: FORMATS.includes(raw.format) ? raw.format : matchOption(raw.format, FORMATS, '기타'),
      status: STATUS_KEYS.includes(raw.status) ? raw.status : matchOption(raw.status, STATUS_KEYS, '아이디어'),
      owner: String(raw.owner || '').trim(),
      campaign: String(raw.campaign || '').trim(),
      tags: Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(/[,;#]/).map((t) => t.trim()).filter(Boolean),
      dueDate: normDate(raw.dueDate),
      publishDate: normDate(raw.publishDate),
      url: String(raw.url || '').trim(),
      notes: String(raw.notes || ''),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    METRICS.forEach((k) => {
      const v = String(raw[k] ?? '').replace(/[,\s]/g, '');
      it[k] = v === '' || isNaN(+v) ? 0 : Math.max(0, +v);
    });
    return it;
  }
  function matchOption(v, list, fallback) {
    if (!v) return fallback;
    const s = String(v).trim().toLowerCase();
    const alias = {
      blog: '블로그', instagram: '인스타그램', insta: '인스타그램', 인스타: '인스타그램', youtube: '유튜브', 유튜브쇼츠: '유튜브',
      newsletter: '뉴스레터', email: '이메일', linkedin: '링크드인', tiktok: '틱톡', threads: '스레드',
      idea: '아이디어', planning: '기획', draft: '제작중', 'in progress': '제작중', 작성중: '제작중', 진행중: '제작중',
      review: '검수', 검토: '검수', scheduled: '발행예정', 예약: '발행예정', published: '발행완료', 발행: '발행완료', 완료: '발행완료', done: '발행완료',
    };
    const hit = list.find((o) => o.toLowerCase() === s) || (alias[s] && list.includes(alias[s]) ? alias[s] : null);
    return hit || list.find((o) => s.includes(o.toLowerCase())) || fallback;
  }

  // ---------- 상태 ----------
  let items = load();
  const ui = {
    view: 'dashboard',
    sort: { key: 'publishDate', dir: 'desc' },
    calMonth: startOfMonth(new Date()),
    editingId: null,
  };

  // ---------- 필터 ----------
  function filtered({ ignorePeriod = false } = {}) {
    const q = $('#f-search').value.trim().toLowerCase();
    const ch = $('#f-channel').value, st = $('#f-status').value, ow = $('#f-owner').value, cp = $('#f-campaign').value;
    const range = ignorePeriod ? null : periodRange();
    return items.filter((it) => {
      if (ch && it.channel !== ch) return false;
      if (st && it.status !== st) return false;
      if (ow && it.owner !== ow) return false;
      if (cp && it.campaign !== cp) return false;
      if (q) {
        const hay = [it.title, it.campaign, it.owner, it.notes, ...(it.tags || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (range) {
        // 기간 필터: 발행일(없으면 마감일) 기준. 날짜가 없는 아이디어는 항상 포함.
        const d = parseDate(it.publishDate) || parseDate(it.dueDate);
        if (d && (d < range[0] || d > range[1])) return false;
      }
      return true;
    });
  }
  function periodRange() {
    const p = $('#f-period').value, t = today();
    if (p === 'all') return null;
    if (p === 'month') return [startOfMonth(t), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    if (p === 'year') return [new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31)];
    // 최근 N일 + 앞으로 예정된 30일
    return [addDays(t, -+p), addDays(t, 30)];
  }
  function refreshFilterOptions() {
    const fill = (sel, values, label) => {
      const el = $(sel), cur = el.value;
      el.innerHTML = `<option value="">${label}</option>` + values.map((v) => `<option>${esc(v)}</option>`).join('');
      el.value = values.includes(cur) ? cur : '';
    };
    const uniq = (k) => [...new Set(items.map((i) => i[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    fill('#f-channel', CHANNELS, '모든 채널');
    fill('#f-status', STATUS_KEYS, '모든 상태');
    fill('#f-owner', uniq('owner'), '모든 담당자');
    fill('#f-campaign', uniq('campaign'), '모든 캠페인');
    $('#dl-owner').innerHTML = uniq('owner').map((v) => `<option value="${esc(v)}">`).join('');
    $('#dl-campaign').innerHTML = uniq('campaign').map((v) => `<option value="${esc(v)}">`).join('');
  }

  // ---------- 렌더 ----------
  function render() {
    refreshFilterOptions();
    renderSide();
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'list') renderList();
    if (ui.view === 'board') renderBoard();
    if (ui.view === 'calendar') renderCalendar();
  }

  function renderDashboard() {
    const list = filtered();
    const published = list.filter((i) => i.status === DONE);
    const sum = (arr, k) => arr.reduce((a, i) => a + (+i[k] || 0), 0);
    const views = sum(published, 'views');
    const inter = sum(published, 'likes') + sum(published, 'comments') + sum(published, 'shares');
    const clicks = sum(published, 'clicks'), conv = sum(published, 'conversions');
    const inProgress = list.filter((i) => i.status !== DONE && i.status !== '아이디어').length;
    const overdue = list.filter(isOverdue).length;

    // 이번 달 vs 지난 달 발행 수 (기간 필터와 무관하게 비교)
    const base = filtered({ ignorePeriod: true }).filter((i) => i.status === DONE);
    const t = today();
    const inMonth = (i, off) => { const d = parseDate(i.publishDate); const m = new Date(t.getFullYear(), t.getMonth() + off, 1); return d && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); };
    const thisM = base.filter((i) => inMonth(i, 0)).length, lastM = base.filter((i) => inMonth(i, -1)).length;
    const diff = thisM - lastM;
    const diffHtml = diff === 0 ? '지난달과 동일' : `지난달 대비 ${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}`;

    const ideas = list.filter((i) => i.status === '아이디어').length;
    $('#hero').innerHTML = `
      <div class="hero-card hero-green">
        <div class="hero-label">총 조회수 <span class="hero-hint">발행 콘텐츠 기준</span></div>
        <div class="hero-big">${fmt(views)}<small>회</small></div>
        <div class="hero-foot">건당 평균 ${fmtCompact(published.length ? views / published.length : 0)} · 이번 달 발행 ${fmt(thisM)}건 (${diffHtml})</div>
      </div>
      <div class="hero-card hero-blue">
        <div class="hero-label">콘텐츠 현황</div>
        <div class="hero-trio">
          <div><span>발행완료</span><b>${fmt(published.length)}</b></div>
          <div><span>진행 중</span><b>${fmt(inProgress)}</b></div>
          <div><span>아이디어</span><b>${fmt(ideas)}</b></div>
        </div>
        <button class="hero-btn" data-add>새 콘텐츠 등록하기</button>
      </div>`;
    $('#strip').innerHTML = `
      <span class="strip-title">성과 요약</span>
      <div class="strip-item"><span>참여율</span><b>${pct(views ? inter / views : null)}</b></div>
      <div class="strip-item"><span>클릭</span><b>${fmtCompact(clicks)}</b></div>
      <div class="strip-item"><span>전환</span><b>${fmtCompact(conv)}</b></div>
      <div class="strip-item"><span>전환율</span><b>${pct(clicks ? conv / clicks : null)}</b></div>
      <div class="strip-item"><span>마감 지남</span><b class="${overdue ? 'overdue' : ''}">${overdue ? '⚠ ' : ''}${overdue}건</b></div>`;

    // 채널별 조회수
    const byCh = CHANNELS.map((ch) => {
      const arr = published.filter((i) => i.channel === ch);
      return { label: ch, value: sum(arr, 'views'), count: arr.length, eng: (() => { const v = sum(arr, 'views'); return v ? (sum(arr, 'likes') + sum(arr, 'comments') + sum(arr, 'shares')) / v : null; })() };
    }).filter((d) => d.count > 0).sort((a, b) => b.value - a.value);
    $('#ch-sub').textContent = byCh.length ? `발행 ${published.length}건 기준` : '';
    hBarChart($('#chart-channel'), byCh, (d) => [
      ['조회수', fmt(d.value)], ['발행 수', fmt(d.count) + '건'], ['평균 참여율', pct(d.eng)],
    ]);

    // 파이프라인
    const counts = STATUSES.map((s) => ({ ...s, n: list.filter((i) => i.status === s.key).length }));
    const maxN = Math.max(1, ...counts.map((c) => c.n));
    $('#pipeline').innerHTML = counts.map((c) => `
      <div class="pipe-row" data-status="${esc(c.key)}" title="${esc(c.key)} 보기">
        <span class="pipe-label">${statusBadge(c.key)}</span>
        <div class="pipe-track"><div class="pipe-fill" style="width:${(c.n / maxN) * 100}%"></div></div>
        <span class="pipe-count">${c.n}</span>
      </div>`).join('') + (overdue ? `<div class="pipe-alert"><span class="icon-warn">⚠</span> 마감일이 지난 미발행 콘텐츠 ${overdue}건</div>` : '');

    // 월별 추이 (최근 6개월, 기간 필터 무시)
    const months = [];
    for (let k = 5; k >= 0; k--) months.push(new Date(t.getFullYear(), t.getMonth() - k, 1));
    const monthly = months.map((m) => {
      const arr = base.filter((i) => { const d = parseDate(i.publishDate); return d && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); });
      return { label: `${m.getMonth() + 1}월`, full: `${m.getFullYear()}년 ${m.getMonth() + 1}월`, count: arr.length, views: sum(arr, 'views') };
    });
    vBarChart($('#chart-monthly-count'), monthly.map((m) => ({ ...m, value: m.count })), (d) => [['발행 수', fmt(d.count) + '건'], ['조회수', fmt(d.views)]]);
    lineChart($('#chart-monthly-views'), monthly.map((m) => ({ ...m, value: m.views })), (d) => [['조회수', fmt(d.views)], ['발행 수', fmt(d.count) + '건']]);

    // 상위 콘텐츠
    const metric = $('#top-metric').value;
    const val = (i) => (metric === 'engagement' ? engagement(i) ?? -1 : +i[metric] || 0);
    const top = published.slice().sort((a, b) => val(b) - val(a)).slice(0, 6);
    $('#top-content').innerHTML = top.length ? `
      <div class="table-wrap"><table class="table"><thead><tr>
        <th>제목</th><th>채널</th><th class="num">조회수</th><th class="num">참여율</th><th class="num">${metric === 'conversions' ? '전환' : '클릭'}</th>
      </tr></thead><tbody>${top.map((i) => `
        <tr data-id="${i.id}"><td class="title-cell">${esc(i.title)}</td><td>${chanBadge(i.channel)}</td>
        <td class="num">${fmt(i.views)}</td><td class="num">${pct(engagement(i))}</td><td class="num">${fmt(metric === 'conversions' ? i.conversions : i.clicks)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">발행된 콘텐츠가 없습니다.</p>';
  }

  function renderSide() {
    const t = today();
    $('#today-label').textContent = `오늘은 ${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일 (${DOW[t.getDay()]}) 입니다.`;
    const all = filtered({ ignorePeriod: true });
    const pubAll = items.filter((i) => i.status === DONE);
    $('#profile-stats').innerHTML = `
      <div><span>전체 콘텐츠</span><b>${fmt(items.length)}</b></div>
      <div><span>발행완료</span><b>${fmt(pubAll.length)}</b></div>`;

    // 이번 달(없으면 최근 30일) 베스트 콘텐츠
    const recent = pubAll.filter((i) => { const d = parseDate(i.publishDate); return d && daysBetween(d, t) <= 30; });
    const best = recent.sort((a, b) => b.views - a.views)[0];
    $('#promo').innerHTML = best ? `
      <div class="promo-kicker">BEST CONTENT · 최근 30일</div>
      <div class="promo-title">${esc(best.title)}</div>
      <div class="promo-num">${fmtCompact(best.views)}<small> 조회</small></div>
      <div class="promo-meta">${esc(best.channel)} · 참여율 ${pct(engagement(best))}</div>
      <button class="promo-btn" data-id="${best.id}">자세히 보기</button>` : `
      <div class="promo-kicker">BEST CONTENT</div>
      <div class="promo-title">최근 30일 내 발행된 콘텐츠가 없어요</div>
      <button class="promo-btn" data-add>콘텐츠 등록하기</button>`;

    // 다가오는 일정
    const end = addDays(t, 14);
    const upcoming = [];
    all.forEach((i) => {
      if (i.status === DONE) return;
      const due = parseDate(i.dueDate), pub = parseDate(i.publishDate);
      if (due && due <= end) upcoming.push({ it: i, d: due, kind: '마감' });
      if (pub && pub >= t && pub <= end) upcoming.push({ it: i, d: pub, kind: '발행' });
    });
    upcoming.sort((a, b) => a.d - b.d);
    $('#upcoming').innerHTML = upcoming.length ? upcoming.slice(0, 8).map(({ it, d, kind }) => {
      const dd = daysBetween(t, d);
      const rel = dd < 0 ? `<span class="overdue">${-dd}일 지남</span>` : dd === 0 ? '<b class="overdue">오늘</b>' : `D-${dd}`;
      return `<li data-id="${it.id}">
        <span class="up-title">${esc(it.title)}<span class="up-meta">${kind} · ${esc(it.channel)}${it.owner ? ' · ' + esc(it.owner) : ''}</span></span>
        <span class="up-date">${d.getMonth() + 1}/${d.getDate()}<br>${rel}</span>
      </li>`;
    }).join('') : '<p class="empty">14일 내 예정된 일정이 없습니다.</p>';

    // 캠페인별 진행률
    const camps = {};
    all.forEach((i) => { if (!i.campaign) return; const c = (camps[i.campaign] ||= { n: 0, done: 0, views: 0 }); c.n++; if (i.status === DONE) { c.done++; c.views += i.views; } });
    const rows = Object.entries(camps).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
    $('#campaigns').innerHTML = rows.length ? rows.map(([name, c]) => `
      <li data-campaign="${esc(name)}">
        <div class="camp-top"><span>${esc(name)}</span><span class="muted">${c.done}/${c.n} 발행</span></div>
        <div class="pipe-track"><div class="pipe-fill" style="width:${(c.done / c.n) * 100}%"></div></div>
      </li>`).join('') : '<p class="empty">캠페인이 지정된 콘텐츠가 없습니다.</p>';
  }

  function renderList() {
    const list = filtered();
    const { key, dir } = ui.sort;
    const get = (i) => (key === 'engagement' ? engagement(i) ?? -1 : i[key]);
    list.sort((a, b) => {
      let x = get(a), y = get(b);
      if (key === 'status') { x = STATUS_KEYS.indexOf(x); y = STATUS_KEYS.indexOf(y); }
      if (typeof x === 'number' || typeof y === 'number') return dir === 'asc' ? x - y : y - x;
      x = x || ''; y = y || '';
      if (!x && y) return 1; if (x && !y) return -1; // 빈 값은 항상 뒤로
      return dir === 'asc' ? String(x).localeCompare(y, 'ko') : String(y).localeCompare(x, 'ko');
    });
    $$('#content-table th').forEach((th) => { th.dataset.dir = th.dataset.sort === key ? dir : ''; });
    $('#list-count').textContent = `${list.length}건`;
    $('#list-empty').hidden = list.length > 0;
    $('#content-table tbody').innerHTML = list.map((i) => `
      <tr data-id="${i.id}">
        <td class="title-cell" title="${esc(i.title)}">${esc(i.title)}${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener" data-link>↗</a>` : ''}</td>
        <td>${chanBadge(i.channel)}</td>
        <td>${statusBadge(i.status)}</td>
        <td>${esc(i.owner || '–')}</td>
        <td>${esc(i.campaign || '–')}</td>
        <td class="${isOverdue(i) ? 'overdue' : ''}">${i.dueDate || '–'}${isOverdue(i) ? ' ⚠' : ''}</td>
        <td>${i.publishDate || '–'}</td>
        <td class="num">${i.status === DONE ? fmt(i.views) : '–'}</td>
        <td class="num">${i.status === DONE ? pct(engagement(i)) : '–'}</td>
        <td class="num">${i.status === DONE ? fmt(i.clicks) : '–'}</td>
        <td class="num">${i.status === DONE ? fmt(i.conversions) : '–'}</td>
      </tr>`).join('');
  }

  function renderBoard() {
    const list = filtered();
    $('#board').innerHTML = STATUSES.map((s) => {
      const cards = list.filter((i) => i.status === s.key)
        .sort((a, b) => (a.dueDate || a.publishDate || '9999').localeCompare(b.dueDate || b.publishDate || '9999'));
      return `<div class="col" data-status="${esc(s.key)}">
        <div class="col-head">${statusBadge(s.key)}<span class="count">${cards.length}</span></div>
        <div class="col-body">${cards.map((i) => `
          <div class="kcard" draggable="true" data-id="${i.id}">
            ${chanBadge(i.channel)} <span class="muted">· ${esc(i.format)}</span>
            <div class="kcard-title">${esc(i.title)}</div>
            <div class="kcard-meta">
              <span>${esc(i.owner || '담당자 없음')}</span>
              <span class="${isOverdue(i) ? 'overdue' : ''}">${s.key === DONE ? '발행 ' + shortDate(i.publishDate) : i.dueDate ? '마감 ' + shortDate(i.dueDate) + (isOverdue(i) ? ' ⚠' : '') : ''}</span>
            </div>
            ${s.key === DONE ? `<div class="kcard-metrics">조회 ${fmtCompact(i.views)} · 참여율 ${pct(engagement(i))}</div>` : ''}
            ${i.tags.length ? `<div>${i.tags.slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  function renderCalendar() {
    const field = $('#cal-field').value;
    const m = ui.calMonth;
    $('#cal-title').textContent = `${m.getFullYear()}년 ${m.getMonth() + 1}월`;
    const start = addDays(m, -m.getDay());
    const list = filtered({ ignorePeriod: true });
    const byDate = {};
    list.forEach((i) => { if (i[field]) (byDate[i[field]] ||= []).push(i); });
    const t = toISO(today());
    let html = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let k = 0; k < 42; k++) {
      const d = addDays(start, k);
      if (k === 35 && d.getMonth() !== m.getMonth()) break; // 5주로 충분하면 6주차 생략
      const iso = toISO(d);
      const its = byDate[iso] || [];
      html += `<div class="cal-cell ${d.getMonth() !== m.getMonth() ? 'is-out' : ''} ${iso === t ? 'is-today' : ''}" data-date="${iso}" title="빈 곳을 더블클릭하면 이 날짜로 새 콘텐츠 추가">
        <span class="cal-day">${d.getDate()}</span>
        ${its.slice(0, 4).map((i) => `<div class="cal-item ${i.status === DONE ? 'is-done' : ''}" style="--c:${channelColor(i.channel)}" data-id="${i.id}" title="${esc(i.channel)} · ${esc(i.status)} · ${esc(i.title)}">${i.status === DONE ? '✓ ' : ''}${esc(i.title)}</div>`).join('')}
        ${its.length > 4 ? `<span class="muted">+${its.length - 4}건 더</span>` : ''}
      </div>`;
    }
    $('#calendar').innerHTML = html;
    $('#cal-legend').innerHTML = CHANNELS.map((c) => chanBadge(c)).join('');
  }

  // ---------- 차트 (SVG) ----------
  const NS = 'http://www.w3.org/2000/svg';

  function hBarChart(el, data, tip) {
    if (!data.length || data.every((d) => !d.value)) { el.innerHTML = '<div class="chart-empty">발행된 콘텐츠의 조회수 데이터가 없습니다.</div>'; return; }
    const W = 520, rowH = 36, padL = 96, padR = 70, H = data.length * rowH + 8;
    const max = Math.max(...data.map((d) => d.value)) || 1;
    const x = (v) => ((W - padL - padR) * v) / max;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="채널별 조회수 막대 차트">`;
    data.forEach((d, i) => {
      const y = i * rowH + 8, bh = 18, w = Math.max(2, x(d.value));
      s += `<g data-i="${i}">
        <text class="label" x="${padL - 10}" y="${y + bh / 2 + 5}" text-anchor="end">${esc(d.label)}</text>
        <path class="bar" d="${roundedRight(padL, y, w, bh, 4)}"/>
        <text class="value" x="${padL + w + 8}" y="${y + bh / 2 + 5}">${fmtCompact(d.value)}</text>
        <rect class="hit" x="0" y="${y - 6}" width="${W}" height="${rowH}"/>
      </g>`;
    });
    s += `<line class="baseline" x1="${padL}" x2="${padL}" y1="0" y2="${H}"/></svg>`;
    el.innerHTML = s;
    bindHover(el, data, (d) => d.label, tip);
  }

  function vBarChart(el, data, tip) {
    const W = 520, H = 240, padL = 40, padR = 8, padT = 22, padB = 30;
    const max = niceMax(Math.max(...data.map((d) => d.value)));
    const iw = W - padL - padR, ih = H - padT - padB;
    const bw = Math.min(44, (iw / data.length) * 0.55);
    const y = (v) => padT + ih - (ih * v) / max;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 발행 수 막대 차트">`;
    s += gridY(max, y, padL, W - padR, (v) => fmt(v));
    data.forEach((d, i) => {
      const cx = padL + (iw / data.length) * (i + 0.5);
      const h = Math.max(0, (ih * d.value) / max);
      s += `<g data-i="${i}">
        ${d.value ? `<path class="bar" d="${roundedTop(cx - bw / 2, y(d.value), bw, h, 4)}"/>` : ''}
        ${d.value ? `<text class="value" x="${cx}" y="${y(d.value) - 6}" text-anchor="middle">${fmt(d.value)}</text>` : ''}
        <text class="tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>
        <rect class="hit" x="${cx - iw / data.length / 2}" y="${padT}" width="${iw / data.length}" height="${ih}"/>
      </g>`;
    });
    s += `<line class="baseline" x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}"/></svg>`;
    el.innerHTML = s;
    bindHover(el, data, (d) => d.full, tip);
  }

  function lineChart(el, data, tip) {
    const W = 520, H = 240, padL = 52, padR = 12, padT = 22, padB = 30;
    const max = niceMax(Math.max(...data.map((d) => d.value)));
    const iw = W - padL - padR, ih = H - padT - padB;
    const x = (i) => padL + (iw * i) / (data.length - 1);
    const y = (v) => padT + ih - (ih * v) / max;
    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 조회수 선 차트">`;
    s += gridY(max, y, padL, W - padR, fmtCompact);
    s += `<path class="area" d="${line} L${x(data.length - 1)} ${padT + ih} L${padL} ${padT + ih} Z"/>`;
    s += `<line class="baseline" x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}"/>`;
    s += `<path class="line" d="${line}"/>`;
    s += `<line class="crosshair" id="xh" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" visibility="hidden"/>`;
    const last = pts[pts.length - 1];
    s += `<text class="value" x="${last[0]}" y="${last[1] - 10}" text-anchor="end">${fmtCompact(data[data.length - 1].value)}</text>`;
    data.forEach((d, i) => {
      s += `<g data-i="${i}">
        <circle class="dot" cx="${pts[i][0]}" cy="${pts[i][1]}" r="4"/>
        <text class="tick" x="${pts[i][0]}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>
        <rect class="hit" x="${pts[i][0] - iw / (data.length - 1) / 2}" y="${padT}" width="${iw / (data.length - 1)}" height="${ih}"/>
      </g>`;
    });
    s += '</svg>';
    el.innerHTML = s;
    const xh = $('#xh', el);
    bindHover(el, data, (d) => d.full, tip, (i) => {
      if (i == null) return xh.setAttribute('visibility', 'hidden');
      xh.setAttribute('x1', pts[i][0]); xh.setAttribute('x2', pts[i][0]); xh.setAttribute('visibility', 'visible');
    });
  }

  function gridY(max, y, x1, x2, f) {
    let s = '';
    for (let k = 1; k <= 4; k++) {
      const v = (max / 4) * k;
      s += `<line class="grid-line" x1="${x1}" x2="${x2}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="tick" x="${x1 - 6}" y="${y(v) + 4}" text-anchor="end">${f(v)}</text>`;
    }
    return s;
  }
  function niceMax(v) {
    if (!v) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
    return Math.max(4, step * p);
  }
  function roundedRight(x, y, w, h, r) {
    r = Math.min(r, w, h / 2);
    return `M${x} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x} Z`;
  }
  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z`;
  }

  const tooltip = $('#tooltip');
  function bindHover(el, data, title, rows, onIdx) {
    $$('g[data-i]', el).forEach((g) => {
      const d = data[+g.dataset.i];
      g.addEventListener('mousemove', (e) => {
        $$('g.is-hover', el).forEach((x) => x.classList.remove('is-hover'));
        g.classList.add('is-hover');
        tooltip.innerHTML = `<b>${esc(title(d))}</b>` + rows(d).map(([k, v]) => `<div class="tt-row"><span>${k}</span><span>${v}</span></div>`).join('');
        tooltip.hidden = false;
        const r = tooltip.getBoundingClientRect();
        let left = e.clientX + 14, top = e.clientY + 14;
        if (left + r.width > innerWidth - 8) left = e.clientX - r.width - 14;
        if (top + r.height > innerHeight - 8) top = e.clientY - r.height - 14;
        tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px';
        onIdx && onIdx(+g.dataset.i);
      });
      g.addEventListener('mouseleave', () => { g.classList.remove('is-hover'); tooltip.hidden = true; onIdx && onIdx(null); });
    });
  }

  // ---------- 편집 모달 ----------
  const dlg = $('#editor'), form = $('#editor-form');
  form.channel.innerHTML = CHANNELS.map((c) => `<option>${c}</option>`).join('');
  form.format.innerHTML = FORMATS.map((c) => `<option>${c}</option>`).join('');
  form.status.innerHTML = STATUS_KEYS.map((c) => `<option>${c}</option>`).join('');

  function openEditor(id, preset = {}) {
    const it = id ? items.find((i) => i.id === id) : null;
    ui.editingId = it ? it.id : null;
    $('#editor-title').textContent = it ? '콘텐츠 편집' : '새 콘텐츠';
    $('#btn-delete').hidden = !it;
    const v = it || { channel: $('#f-channel').value || CHANNELS[0], format: FORMATS[0], status: $('#f-status').value || '아이디어', ...preset };
    ['title', 'channel', 'format', 'status', 'owner', 'campaign', 'dueDate', 'publishDate', 'url', 'notes', ...METRICS].forEach((k) => {
      form[k].value = v[k] ?? (METRICS.includes(k) ? '' : '');
      if (METRICS.includes(k) && !+v[k]) form[k].value = '';
    });
    form.tags.value = (v.tags || []).join(', ');
    dlg.showModal();
    setTimeout(() => form.title.focus(), 30);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.title.trim()) return form.title.focus();
    if (data.status === DONE && !data.publishDate) data.publishDate = toISO(today());
    if (ui.editingId) {
      const idx = items.findIndex((i) => i.id === ui.editingId);
      items[idx] = normalize({ ...items[idx], ...data, id: ui.editingId, updatedAt: new Date().toISOString() });
      toast('저장했습니다.');
    } else {
      items.push(normalize({ ...data, id: uid() }));
      toast('새 콘텐츠를 추가했습니다.');
    }
    save(); dlg.close(); render();
  });
  $('#btn-delete').addEventListener('click', async () => {
    if (!ui.editingId || !(await ask('이 콘텐츠를 삭제할까요?', '삭제'))) return;
    items = items.filter((i) => i.id !== ui.editingId);
    save(); dlg.close(); render(); toast('삭제했습니다.');
  });
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // ---------- CSV / JSON ----------
  function toCSV(list) {
    const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = CSV_FIELDS.map((f) => f[1]);
    const rows = list.map((i) => CSV_FIELDS.map(([k]) => cell(k === 'tags' ? i.tags.join(', ') : i[k])).join(','));
    return '﻿' + [head.join(','), ...rows].join('\r\n');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('데이터 행이 없습니다.');
    const keyOf = (h) => {
      const s = h.trim().toLowerCase().replace(/\s+/g, '');
      const f = CSV_FIELDS.find(([k, ko, al]) => k.toLowerCase() === s || ko.toLowerCase() === s || al.some((a) => a.replace(/\s+/g, '') === s));
      return f ? f[0] : null;
    };
    const map = rows[0].map(keyOf);
    if (!map.includes('title')) throw new Error('"제목"(title) 열을 찾을 수 없습니다.');
    return rows.slice(1).map((r) => {
      const o = {};
      map.forEach((k, i) => { if (k) o[k] = r[i]; });
      return normalize(o);
    }).filter((o) => o.title !== '(제목 없음)');
  }
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function pickFile(accept, cb) {
    const input = $('#file-input');
    input.accept = accept; input.value = '';
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = async () => { try { await cb(String(r.result)); } catch (e) { ask('가져오기 실패: ' + e.message, '확인', null); } };
      r.readAsText(f, 'utf-8');
    };
    input.click();
  }

  const actions = {
    'import-csv': () => pickFile('.csv,.tsv,text/csv', async (text) => {
      const rows = importCSV(text);
      const replace = items.length && (await ask(`CSV에서 ${rows.length}건을 읽었습니다. 기존 데이터는 어떻게 할까요?`, '기존 데이터 교체', '기존 데이터에 추가'));
      items = replace ? rows : items.concat(rows);
      save(); render(); toast(`CSV ${rows.length}건을 가져왔습니다.`);
    }),
    'export-csv': () => download(`콘텐츠_${toISO(today())}.csv`, toCSV(filtered({ ignorePeriod: true })), 'text/csv;charset=utf-8'),
    'export-json': () => download(`content-backup_${toISO(today())}.json`, JSON.stringify(items, null, 2), 'application/json'),
    'import-json': () => pickFile('.json,application/json', async (text) => {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error('올바른 백업 파일이 아닙니다.');
      if (!(await ask(`백업 ${arr.length}건으로 현재 데이터를 교체할까요?`, '교체'))) return;
      items = arr.map(normalize); save(); render(); toast('백업을 불러왔습니다.');
    }),
    'load-sample': async () => {
      if (items.length && !(await ask('현재 데이터를 샘플 데이터로 교체할까요?', '교체'))) return;
      items = sampleData(); save(); render(); toast('샘플 데이터를 불러왔습니다.');
    },
    'clear-all': async () => {
      if (!(await ask('모든 콘텐츠를 삭제할까요? 되돌릴 수 없으니 먼저 백업을 저장해 두세요.', '전체 삭제'))) return;
      items = []; save(); render(); toast('전체 삭제했습니다.');
    },
  };

  // ---------- 이벤트 ----------
  function setView(v) {
    ui.view = v;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('is-active', s.id === 'view-' + v));
    try { localStorage.setItem(STORAGE_KEY + ':view', v); } catch (e) { /* 무시 */ }
    render();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $('#btn-add').addEventListener('click', () => openEditor(null));

  $('#menu-data').addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a) actions[a.dataset.action]();
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) openEditor(null); });
  $('#campaigns').addEventListener('click', (e) => {
    const r = e.target.closest('[data-campaign]');
    if (r) { $('#f-campaign').value = r.dataset.campaign; setView('list'); }
  });

  ['#f-search', '#f-channel', '#f-status', '#f-owner', '#f-campaign', '#f-period', '#top-metric', '#cal-field']
    .forEach((s) => $(s).addEventListener(s === '#f-search' ? 'input' : 'change', render));
  $('#f-reset').addEventListener('click', () => {
    ['#f-search', '#f-channel', '#f-status', '#f-owner', '#f-campaign'].forEach((s) => { $(s).value = ''; });
    $('#f-period').value = 'all'; render();
  });

  // 행/카드/일정 클릭 → 편집
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-link]')) return;
    const row = e.target.closest('[data-id]');
    if (row && !row.closest('dialog')) openEditor(row.dataset.id);
  });
  $('#pipeline').addEventListener('click', (e) => {
    const r = e.target.closest('[data-status]');
    if (r) { $('#f-status').value = r.dataset.status; setView('list'); }
  });
  $$('#content-table th').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    ui.sort = { key: k, dir: ui.sort.key === k && ui.sort.dir === 'desc' ? 'asc' : 'desc' };
    renderList();
  }));

  // 칸반 드래그 앤 드롭
  const board = $('#board');
  board.addEventListener('dragstart', (e) => {
    const c = e.target.closest('.kcard'); if (!c) return;
    c.classList.add('is-dragging');
    e.dataTransfer.setData('text/plain', c.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  board.addEventListener('dragend', (e) => { e.target.closest('.kcard')?.classList.remove('is-dragging'); });
  board.addEventListener('dragover', (e) => {
    const col = e.target.closest('.col'); if (!col) return;
    e.preventDefault();
    $$('.col', board).forEach((c) => c.classList.toggle('is-over', c === col));
  });
  board.addEventListener('dragleave', (e) => { if (!board.contains(e.relatedTarget)) $$('.col', board).forEach((c) => c.classList.remove('is-over')); });
  board.addEventListener('drop', (e) => {
    const col = e.target.closest('.col'); if (!col) return;
    e.preventDefault();
    const it = items.find((i) => i.id === e.dataTransfer.getData('text/plain'));
    if (it && it.status !== col.dataset.status) {
      it.status = col.dataset.status;
      if (it.status === DONE && !it.publishDate) it.publishDate = toISO(today());
      it.updatedAt = new Date().toISOString();
      save(); toast(`"${it.title}" → ${it.status}`);
    }
    renderBoard();
  });

  // 캘린더
  $('#cal-prev').addEventListener('click', () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); renderCalendar(); });
  $('#cal-today').addEventListener('click', () => { ui.calMonth = startOfMonth(new Date()); renderCalendar(); });
  $('#calendar').addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.cal-cell');
    if (cell && !e.target.closest('[data-id]')) openEditor(null, { [$('#cal-field').value]: cell.dataset.date, status: '기획' });
  });

  // 테마
  const themeBtn = $('#btn-theme');
  try { const th = localStorage.getItem(STORAGE_KEY + ':theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* 무시 */ }
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(STORAGE_KEY + ':theme', next); } catch (e) { /* 무시 */ }
  });

  // 단축키: N = 새 콘텐츠, / = 검색
  document.addEventListener('keydown', (e) => {
    if (dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor(null); }
    if (e.key === '/') { e.preventDefault(); $('#f-search').focus(); }
  });

  // 브라우저 confirm()/alert() 대신 쓰는 페이지 내 확인 창. 취소 라벨이 null이면 확인 버튼만 표시.
  function ask(message, okLabel = '확인', cancelLabel = '취소') {
    const box = $('#confirm');
    $('#confirm-msg').textContent = message;
    $('#confirm-ok').textContent = okLabel;
    const cancel = $('#confirm-cancel');
    cancel.hidden = cancelLabel === null;
    cancel.textContent = cancelLabel || '';
    box.returnValue = '';
    box.showModal();
    return new Promise((resolve) => {
      box.addEventListener('close', () => resolve(box.returnValue === 'ok'), { once: true });
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- 샘플 데이터 ----------
  function sampleData() {
    const t = today();
    const d = (n) => toISO(addDays(t, n));
    const owners = ['김지수', '이민호', '박서연', '최도윤'];
    const rows = [
      ['신제품 런칭 비하인드 스토리', '블로그', '아티클', DONE, 0, '신제품 런칭', -150, -152, 4200, 180, 24, 40, 310, 22, 'SEO, 신제품'],
      ['고객 인터뷰 #1 — 3개월 사용 후기', '유튜브', '롱폼 영상', DONE, 1, '고객 스토리', -132, -135, 18400, 920, 140, 85, 640, 31, '인터뷰'],
      ['여름 시즌 프로모션 안내', '인스타그램', '카드뉴스', DONE, 2, '여름 프로모션', -118, -120, 9600, 780, 52, 210, 420, 48, '프로모션'],
      ['7월 뉴스레터: 업데이트 모아보기', '뉴스레터', '이메일', DONE, 3, '', -105, -107, 5200, 0, 0, 12, 860, 65, '뉴스레터'],
      ['업계 트렌드 리포트 2026 상반기', '링크드인', '아티클', DONE, 0, '브랜드 인지도', -96, -98, 7300, 410, 38, 120, 520, 18, '리포트, B2B'],
      ['30초 사용법 — 기능 A', '틱톡', '숏폼 영상', DONE, 1, '튜토리얼', -88, -90, 26500, 2100, 160, 340, 380, 12, '숏폼, 튜토리얼'],
      ['자주 묻는 질문 10가지', '블로그', '아티클', DONE, 3, '튜토리얼', -74, -76, 6100, 95, 18, 22, 450, 27, 'SEO, FAQ'],
      ['고객 인터뷰 #2 — 팀 도입 사례', '유튜브', '롱폼 영상', DONE, 1, '고객 스토리', -66, -68, 14200, 700, 96, 60, 510, 26, '인터뷰, B2B'],
      ['가을 신메뉴 미리보기', '인스타그램', '카드뉴스', DONE, 2, '가을 시즌', -52, -54, 11800, 1040, 88, 260, 390, 35, '시즌'],
      ['8월 뉴스레터', '뉴스레터', '이메일', DONE, 3, '', -45, -47, 5600, 0, 0, 15, 910, 72, '뉴스레터'],
      ['기능 B 출시 공지', '블로그', '아티클', DONE, 0, '신제품 런칭', -38, -40, 8900, 230, 41, 75, 720, 54, '신제품'],
      ['일하는 방식 시리즈 Ep.1', '링크드인', '이미지', DONE, 0, '브랜드 인지도', -30, -32, 5400, 380, 29, 66, 210, 6, '컬처'],
      ['15초 꿀팁 — 단축키', '틱톡', '숏폼 영상', DONE, 1, '튜토리얼', -24, -25, 31200, 2650, 210, 520, 300, 9, '숏폼'],
      ['9월 뉴스레터', '뉴스레터', '이메일', DONE, 3, '', -15, -17, 6000, 0, 0, 20, 980, 80, '뉴스레터'],
      ['고객 리뷰 하이라이트', '인스타그램', '카드뉴스', DONE, 2, '고객 스토리', -9, -10, 8700, 690, 47, 150, 260, 21, '리뷰'],
      ['스레드 오픈 기념 Q&A', '스레드', '이미지', DONE, 2, '브랜드 인지도', -4, -5, 3900, 310, 120, 40, 90, 4, '커뮤니티'],
      ['기능 C 튜토리얼 영상', '유튜브', '롱폼 영상', '발행예정', 1, '튜토리얼', 3, 2, 0, 0, 0, 0, 0, 0, '튜토리얼'],
      ['10월 뉴스레터', '뉴스레터', '이메일', '발행예정', 3, '', 5, 3, 0, 0, 0, 0, 0, 0, '뉴스레터'],
      ['연말 캠페인 티저', '인스타그램', '카드뉴스', '검수', 2, '연말 캠페인', 9, 6, 0, 0, 0, 0, 0, 0, '티저'],
      ['검색 상위 노출 가이드', '블로그', '아티클', '검수', 0, '튜토리얼', 7, 4, 0, 0, 0, 0, 0, 0, 'SEO'],
      ['고객 인터뷰 #3', '유튜브', '롱폼 영상', '제작중', 1, '고객 스토리', 18, 12, 0, 0, 0, 0, 0, 0, '인터뷰'],
      ['일하는 방식 시리즈 Ep.2', '링크드인', '이미지', '제작중', 0, '브랜드 인지도', 11, -1, 0, 0, 0, 0, 0, 0, '컬처'],
      ['숏폼 챌린지 기획', '틱톡', '숏폼 영상', '기획', 1, '연말 캠페인', 21, 14, 0, 0, 0, 0, 0, 0, '챌린지'],
      ['연말 결산 리포트', '블로그', '아티클', '기획', 3, '연말 캠페인', 30, 24, 0, 0, 0, 0, 0, 0, '리포트'],
      ['파트너사 협업 라이브', '유튜브', '라이브', '아이디어', 1, '', null, null, 0, 0, 0, 0, 0, 0, '협업'],
      ['사용자 커뮤니티 밋업 후기', '블로그', '아티클', '아이디어', 2, '', null, null, 0, 0, 0, 0, 0, 0, '커뮤니티'],
    ];
    return rows.map(([title, channel, format, status, o, campaign, pub, due, views, likes, comments, shares, clicks, conversions, tags]) => normalize({
      title, channel, format, status, owner: owners[o], campaign,
      publishDate: pub == null ? '' : d(pub), dueDate: due == null ? '' : d(due),
      views, likes, comments, shares, clicks, conversions, tags,
      url: status === DONE ? 'https://example.com/' : '',
    }));
  }

  // ---------- 시작 ----------
  try { const v = localStorage.getItem(STORAGE_KEY + ':view'); if (v && $('#view-' + v)) ui.view = v; } catch (e) { /* 무시 */ }
  save();
  setView(ui.view);
})();
