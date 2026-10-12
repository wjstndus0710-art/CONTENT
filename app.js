/* 멀티채널 콘텐츠 운영 대시보드 — 빌드 없이 브라우저에서 바로 실행되는 단일 스크립트.
 * 기존 「26_멀티채널 콘텐츠 운영관리」 시트의 구조(콘텐츠 1건 = 1행, 채널별 배포 상태)를 그대로 따른다.
 * 데이터는 브라우저 localStorage에 저장되며 xlsx/csv 가져오기, CSV/JSON 내보내기를 지원한다. */
(() => {
  'use strict';

  // ---------- 설정 ----------
  const STORAGE_KEY = 'content-dashboard:v2';
  // 시트의 드롭다운 순서 그대로. 색은 이 순서대로 고정 배정한다.
  const DIVISIONS = [
    { key: 'Rtail-X', icon: '📦' },
    { key: 'EDI', icon: '📁' },
    { key: 'SIEM', icon: '🔐' },
    { key: '뉴스레터', icon: '📩' },
    { key: 'Auto-X', icon: '🚕' },
    { key: 'xCON', icon: '📋' },
  ];
  const CHANNELS = ['네이버', '홈페이지', '티스토리', '카카오', '인스타'];
  const CORE = ['네이버', '홈페이지', '티스토리', '카카오']; // 시트 진행률 = COUNTIF(H:K,"발행완료")/4
  const STATUSES = [
    { key: '미작성', cls: 'todo', icon: '○' },
    { key: '작성중', cls: 'writing', icon: '✎' },
    { key: '검수중', cls: 'review', icon: '◎' },
    { key: '예약', cls: 'reserved', icon: '◷' },
    { key: '발행완료', cls: 'done', icon: '✓' },
  ];
  const STATUS_KEYS = STATUSES.map((s) => s.key);
  const DONE = '발행완료';
  const NAVER = [
    { key: 'Y', label: '노출됨', color: 'var(--st-good)' },
    { key: 'N', label: '미노출', color: 'var(--st-critical)' },
    { key: '뉴스레터만', label: '', color: 'var(--st-warning)' },
    { key: '', label: '미확인', color: 'var(--axis)' },
  ];

  // 시트 열 ↔ 필드. 내보내기도 이 순서(=원래 시트 순서)를 따른다.
  const COLUMNS = [
    ['division', '사업부/서비스', ['사업부', '서비스', '사업부/서비스']],
    ['title', '콘텐츠 주제', ['콘텐츠 주제', '주제', '제목', '콘텐츠']],
    ['mainKeyword', '메인 키워드', ['메인 키워드', '메인키워드', '키워드']],
    ['naver', '네이버 노출', ['네이버 노출', '네이버노출']],
    ['subKeywords', '서브 키워드', ['서브 키워드', '서브키워드']],
    ['sourceChannel', '원문 채널', ['원문 채널', '원문채널']],
    ['publishDate', '원문 발행일', ['원문 발행일', '원문발행일', '발행일']],
    ...CHANNELS.map((c) => ['ch:' + c, c, [c]]),
    ['progress', '진행률', ['진행률']],
    ['owner', '담당자', ['담당자']],
    ['notes', '비고', ['비고', '메모']],
  ];

  // ---------- 유틸 ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('ko-KR'));
  const pct = (n) => (n == null || !isFinite(n) ? '–' : Math.round(n * 100) + '%');

  function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseDate(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function normDate(v) {
    if (v instanceof Date && !isNaN(v)) return toISO(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) return toISO(new Date(1899, 11, 30 + Math.floor(v))); // 엑셀 날짜 일련번호 (시간대 영향 없음)
    const d = parseDate(v);
    if (d) return toISO(d);
    const m = String(v ?? '').trim().match(/^(\d{4})[-./년\s]+(\d{1,2})월?\.?$/); // "2026-09", "2026년 9월" → 그 달 1일
    return m ? toISO(new Date(+m[1], +m[2] - 1, 1)) : '';
  }
  function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  const sameMonth = (d, m) => d && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const divInfo = (key) => DIVISIONS.find((d) => d.key === key) || { key, icon: '' };
  const divColor = (key) => { const i = DIVISIONS.findIndex((d) => d.key === key); return i < 0 ? 'var(--s8)' : `var(--s${i + 1})`; };
  const divLabel = (key) => (key ? `${divInfo(key).icon} ${key}`.trim() : '–');
  const divBadge = (key) => `<span class="chan" style="--c:${divColor(key)}">${esc(divLabel(key))}</span>`;
  const statusInfo = (st) => STATUSES.find((s) => s.key === st);

  function progress(it) { return CORE.filter((c) => it.channels[c] === DONE).length / CORE.length; }
  function stage(it) { const p = progress(it); return p >= 1 ? 'done' : p > 0 ? 'partial' : 'none'; }

  function chip(it, ch, { interactive = true } = {}) {
    const st = it.channels[ch];
    const info = statusInfo(st);
    const label = info ? `${info.icon} ${st}` : '–';
    const cls = info ? info.cls : 'none';
    const attrs = interactive ? `data-chip="${esc(ch)}" data-cid="${it.id}" title="${esc(ch)}: 눌러서 다음 단계로" tabindex="0" role="button"` : '';
    return `<span class="chip st-${cls}" ${attrs}>${esc(label)}</span>`;
  }
  function progressCell(it) {
    const p = progress(it);
    return `<span class="prog"><span class="prog-track"><span class="prog-fill ${p >= 1 ? 'is-done' : ''}" style="width:${p * 100}%"></span></span><b>${pct(p)}</b></span>`;
  }

  // ---------- 저장소 ----------
  function seed() { return (window.SEED_DATA || []).map(normalize); }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).map(normalize);
    } catch (e) { /* 저장소를 쓸 수 없으면 처음 데이터로 시작 */ }
    return seed();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { toast('브라우저 저장에 실패했습니다. JSON 백업을 받아 두세요.'); }
  }
  function normDivision(v) {
    const s = String(v || '').replace(/^[^\p{L}\p{N}]+/u, '').trim(); // 앞의 이모지 제거
    if (!s) return '';
    const hit = DIVISIONS.find((d) => d.key.toLowerCase() === s.toLowerCase());
    return hit ? hit.key : s;
  }
  function normStatus(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (STATUS_KEYS.includes(s)) return s;
    const alias = { 발행: DONE, 완료: DONE, 검수: '검수중', 검토중: '검수중', 예약발행: '예약', 작성: '작성중', 진행중: '작성중' };
    return alias[s] || s;
  }
  function normalize(raw) {
    const ch = raw.channels || {};
    const it = {
      id: raw.id || uid(),
      division: normDivision(raw.division),
      title: String(raw.title || '').trim(),
      mainKeyword: String(raw.mainKeyword || '').trim(),
      naver: (() => { const n = String(raw.naver || '').trim(); return /^y(es)?$/i.test(n) ? 'Y' : /^n(o)?$/i.test(n) ? 'N' : n; })(),
      subKeywords: String(raw.subKeywords || '').trim(),
      sourceChannel: String(raw.sourceChannel || '').trim(),
      publishDate: normDate(raw.publishDate),
      channels: {},
      owner: String(raw.owner || '').trim(),
      notes: String(raw.notes || ''),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    CHANNELS.forEach((c) => { it.channels[c] = normStatus(ch[c] ?? raw['ch:' + c]); });
    return it;
  }

  // ---------- 상태 ----------
  let items = load();
  const ui = {
    view: 'dashboard',
    sort: { key: 'publishDate', dir: 'asc' },
    calMonth: startOfMonth(new Date()),
    editingId: null,
  };

  // ---------- 필터 ----------
  function filtered({ ignorePeriod = false } = {}) {
    const q = $('#f-search').value.trim().toLowerCase();
    const dv = $('#f-division').value, src = $('#f-source').value, pr = $('#f-progress').value, ow = $('#f-owner').value;
    const range = ignorePeriod ? null : periodRange();
    return items.filter((it) => {
      if (dv && it.division !== dv) return false;
      if (src && it.sourceChannel !== src) return false;
      if (pr && stage(it) !== pr) return false;
      if (ow && it.owner !== ow) return false;
      if (q && ![it.title, it.mainKeyword, it.subKeywords, it.notes, it.division].join(' ').toLowerCase().includes(q)) return false;
      if (range) {
        const d = parseDate(it.publishDate);
        if (!d || d < range[0] || d > range[1]) return false;
      }
      return true;
    });
  }
  function periodRange() {
    const p = $('#f-period').value, t = today();
    if (p === 'all') return null;
    if (p === 'month') return [startOfMonth(t), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    if (p === 'last-month') return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    if (p === 'year') return [new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31)];
    return [addDays(t, -+p), addDays(t, 60)];
  }
  const uniq = (vals) => [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  function allDivisions() {
    const extra = uniq(items.map((i) => i.division)).filter((k) => !DIVISIONS.some((d) => d.key === k));
    return [...DIVISIONS.map((d) => d.key), ...extra];
  }
  function refreshFilterOptions() {
    const fill = (sel, values, label, show = (v) => v) => {
      const el = $(sel), cur = el.value;
      el.innerHTML = `<option value="">${label}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(show(v))}</option>`).join('');
      el.value = values.includes(cur) ? cur : '';
    };
    fill('#f-division', allDivisions(), '모든 사업부/서비스', divLabel);
    fill('#f-source', uniq(items.map((i) => i.sourceChannel)), '모든 원문 채널');
    fill('#f-owner', uniq(items.map((i) => i.owner)), '모든 담당자');
    $('#dl-owner').innerHTML = uniq(items.map((i) => i.owner)).map((v) => `<option value="${esc(v)}">`).join('');
    $('#dl-source').innerHTML = uniq(['네이버 블로그', '스티비', ...items.map((i) => i.sourceChannel)]).map((v) => `<option value="${esc(v)}">`).join('');
  }

  // ---------- 렌더 ----------
  function render() {
    refreshFilterOptions();
    renderSide();
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'list') renderList();
    if (ui.view === 'calendar') renderCalendar();
    if (ui.view === 'keywords') renderKeywords();
    if (ui.view === 'blog') renderBlog();
  }

  function renderDashboard() {
    const list = filtered();
    const t = today();
    const base = filtered({ ignorePeriod: true });
    const thisM = base.filter((i) => sameMonth(parseDate(i.publishDate), t)).length;
    const lastM = base.filter((i) => sameMonth(parseDate(i.publishDate), new Date(t.getFullYear(), t.getMonth() - 1, 1))).length;
    const diff = thisM - lastM;
    const done = list.filter((i) => stage(i) === 'done').length;
    const avg = list.length ? list.reduce((a, i) => a + progress(i), 0) / list.length : null;

    // 채널 칸 단위 집계 (핵심 4채널)
    let cDone = 0, cWip = 0, cTodo = 0;
    list.forEach((i) => CORE.forEach((c) => {
      const s = i.channels[c];
      if (s === DONE) cDone++; else if (s && s !== '미작성') cWip++; else cTodo++;
    }));

    $('#hero').innerHTML = `
      <div class="hero-card hero-green">
        <div class="hero-label">배포 완료 콘텐츠 <span class="hero-hint">진행률 100%</span></div>
        <div class="hero-big">${fmt(done)}<small>/ ${fmt(list.length)}건</small></div>
        <div class="hero-foot">평균 진행률 ${pct(avg)} · 이번 달 원문 발행 ${thisM}건 (지난달 대비 ${diff === 0 ? '동일' : (diff > 0 ? '▲' : '▼') + Math.abs(diff)})</div>
      </div>
      <div class="hero-card hero-blue">
        <div class="hero-label">채널 배포 현황 <span class="hero-hint">네이버·홈페이지·티스토리·카카오 칸 기준</span></div>
        <div class="hero-trio">
          <div><span>발행완료</span><b>${fmt(cDone)}</b></div>
          <div><span>작성·검수·예약</span><b>${fmt(cWip)}</b></div>
          <div><span>미작성·빈칸</span><b>${fmt(cTodo)}</b></div>
        </div>
        <button class="hero-btn" data-add>새 콘텐츠 등록하기</button>
      </div>`;

    $('#strip').innerHTML = `<span class="strip-title">채널별 완료율</span>` + CHANNELS.map((c) => {
      const n = list.filter((i) => i.channels[c] === DONE).length;
      return `<div class="strip-item" title="${esc(c)} 발행완료 ${n}/${list.length}건"><span>${esc(c)}</span><b>${pct(list.length ? n / list.length : null)}</b></div>`;
    }).join('');

    // 채널별 상태 누적 막대
    const order = [...STATUSES].reverse(); // 발행완료부터
    const segColor = { done: 'var(--st-good)', reserved: 'var(--s1)', review: 'var(--st-warning)', writing: 'var(--s7)', todo: 'var(--axis)', none: 'var(--grid)' };
    $('#channel-legend').innerHTML = order.map((s) => `<span class="lg"><i style="background:${segColor[s.cls]}"></i>${s.key}</span>`).join('') + `<span class="lg"><i style="background:${segColor.none}"></i>빈칸</span>`;
    const rows = CHANNELS.map((c) => {
      const segs = order.map((s) => ({ key: s.key, cls: s.cls, n: list.filter((i) => i.channels[c] === s.key).length }));
      segs.push({ key: '빈칸', cls: 'none', n: list.filter((i) => !i.channels[c]).length });
      return { label: c, segs, total: list.length };
    });
    stackedBars($('#chart-channel'), rows, segColor);

    // 사업부별
    const divs = allDivisions().map((k) => {
      const arr = list.filter((i) => i.division === k);
      return { key: k, label: divLabel(k), value: arr.length, avg: arr.length ? arr.reduce((a, i) => a + progress(i), 0) / arr.length : null };
    }).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    hBarChart($('#chart-division'), divs, (d) => [['콘텐츠', d.value + '건'], ['평균 진행률', pct(d.avg)]], (d) => {
      $('#f-division').value = d.key; setView('list');
    });

    // 월별
    const months = [];
    for (let k = 5; k >= 0; k--) months.push(new Date(t.getFullYear(), t.getMonth() - k, 1));
    const monthly = months.map((m) => {
      const arr = base.filter((i) => sameMonth(parseDate(i.publishDate), m));
      return { label: `${m.getMonth() + 1}월`, full: `${m.getFullYear()}년 ${m.getMonth() + 1}월`, value: arr.length, arr };
    });
    vBarChart($('#chart-monthly'), monthly, (d) => [
      ['원문 발행', d.value + '건'],
      ...allDivisions().map((k) => [divLabel(k), d.arr.filter((i) => i.division === k).length]).filter((r) => r[1]).map(([a, b]) => [a, b + '건']),
    ]);

    // 네이버 노출
    const nv = NAVER.map((n) => ({ ...n, count: list.filter((i) => (n.key ? i.naver === n.key : !i.naver)).length }));
    const other = list.filter((i) => i.naver && !NAVER.some((n) => n.key === i.naver)).length;
    const maxN = Math.max(1, ...nv.map((n) => n.count));
    $('#naver').innerHTML = nv.map((n) => `
      <div class="pipe-row" data-naver="${esc(n.key)}">
        <span class="pipe-label"><span class="status" style="--dot:${n.color}">${[n.key, n.label].filter(Boolean).map(esc).join(' · ')}</span></span>
        <div class="pipe-track"><div class="pipe-fill" style="width:${(n.count / maxN) * 100}%"></div></div>
        <span class="pipe-count">${n.count}</span>
      </div>`).join('') + (other ? `<div class="pipe-alert">기타 값 ${other}건</div>` : '') +
      `<div class="pipe-alert">노출 확인율 ${pct(list.length ? (list.length - nv[3].count) / list.length : null)} · 미확인 콘텐츠는 키워드 관리에서 확인하세요.</div>`;

    // 배포가 남은 콘텐츠
    const pending = list.filter((i) => progress(i) < 1).sort((a, b) => (a.publishDate || '9999').localeCompare(b.publishDate || '9999'));
    $('#pending-count').textContent = `${pending.length}건`;
    $('#pending').innerHTML = pending.length ? `<div class="table-wrap"><table class="table matrix compact"><thead><tr>
        <th>원문 발행일</th><th>콘텐츠 주제</th>${CHANNELS.map((c) => `<th>${c}</th>`).join('')}<th>진행률</th>
      </tr></thead><tbody>${pending.map((i) => `<tr>
        <td class="nowrap">${i.publishDate || '–'}</td>
        <td class="title-cell" data-id="${i.id}" title="${esc(divLabel(i.division))} | ${esc(i.title)}">${esc(divInfo(i.division).icon)} ${esc(i.title)}</td>
        ${CHANNELS.map((c) => `<td>${chip(i, c)}</td>`).join('')}<td>${progressCell(i)}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="empty">모든 콘텐츠가 4개 채널에 배포되었습니다.</p>';
  }

  function renderSide() {
    const t = today();
    $('#today-label').textContent = `오늘은 ${t.getFullYear()}년 ${t.getMonth() + 1}월 ${t.getDate()}일 (${DOW[t.getDay()]}) · 데이터는 이 브라우저에 저장됩니다`;
    const all = filtered({ ignorePeriod: true });
    $('#profile-stats').innerHTML = `
      <div><span>전체 콘텐츠</span><b>${fmt(items.length)}</b></div>
      <div><span>배포 완료</span><b>${fmt(items.filter((i) => stage(i) === 'done').length)}</b></div>
      <div><span>이번 달 발행</span><b>${fmt(items.filter((i) => sameMonth(parseDate(i.publishDate), t)).length)}</b></div>`;

    // 다음 발행 예정(오늘 이후) → 없으면 가장 최근 발행
    const dated = all.filter((i) => parseDate(i.publishDate));
    const next = dated.filter((i) => parseDate(i.publishDate) >= t).sort((a, b) => a.publishDate.localeCompare(b.publishDate))[0];
    const last = dated.filter((i) => parseDate(i.publishDate) < t).sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0];
    const pick = next || last;
    $('#promo').innerHTML = pick ? `
      <div class="promo-kicker">${next ? '다음 원문 발행' : '최근 원문 발행'} · ${esc(pick.publishDate)}</div>
      <div class="promo-div">${esc(divLabel(pick.division))}</div>
      <div class="promo-title">${esc(pick.title)}</div>
      <div class="promo-meta">${esc(pick.sourceChannel || '원문 채널 미정')} · 진행률 ${pct(progress(pick))}</div>
      <button class="promo-btn" data-id="${pick.id}">열어 보기</button>` : `
      <div class="promo-kicker">CONTENT</div>
      <div class="promo-title">발행일이 입력된 콘텐츠가 없어요</div>
      <button class="promo-btn" data-add>콘텐츠 등록하기</button>`;

    // 채널 배포 할 일: 원문이 발행된 콘텐츠 중 아직 발행완료가 아닌 채널 칸
    const todo = [];
    all.forEach((i) => {
      if (!i.publishDate) return;
      CHANNELS.forEach((c) => {
        const s = i.channels[c];
        if (s && s !== DONE) todo.push({ it: i, ch: c, st: s });
      });
    });
    const rank = { 예약: 0, 검수중: 1, 작성중: 2, 미작성: 3 };
    todo.sort((a, b) => (rank[a.st] ?? 4) - (rank[b.st] ?? 4) || a.it.publishDate.localeCompare(b.it.publishDate));
    $('#todo-count').textContent = `${todo.length}건`;
    $('#todo').innerHTML = todo.length ? todo.slice(0, 10).map(({ it, ch }) => `
      <li>
        <span class="up-title" data-id="${it.id}">${esc(it.title)}<span class="up-meta">${esc(divLabel(it.division))} · ${esc(it.publishDate)}</span></span>
        <span class="todo-ch"><span class="muted">${esc(ch)}</span>${chip(it, ch)}</span>
      </li>`).join('') + (todo.length > 10 ? `<li class="more" data-goto="list">+${todo.length - 10}건 더 · 운영 현황에서 보기</li>` : '')
      : '<p class="empty">남은 배포 작업이 없습니다.</p>';

    // 사업부별 평균 진행률
    const rows = allDivisions().map((k) => {
      const arr = all.filter((i) => i.division === k);
      return [k, arr.length, arr.length ? arr.reduce((a, i) => a + progress(i), 0) / arr.length : 0];
    }).filter((r) => r[1]);
    $('#divisions').innerHTML = rows.length ? rows.map(([k, n, p]) => `
      <li data-division="${esc(k)}">
        <div class="camp-top"><span>${esc(divLabel(k))}</span><span class="muted">${n}건 · ${pct(p)}</span></div>
        <div class="pipe-track"><div class="pipe-fill" style="width:${p * 100}%;background:${divColor(k)}"></div></div>
      </li>`).join('') : '<p class="empty">데이터가 없습니다.</p>';
    renderSideBlog();
  }

  const LIST_COLS = [
    ['division', '사업부/서비스'], ['title', '콘텐츠 주제'], ['mainKeyword', '메인 키워드'], ['publishDate', '원문 발행일'],
    ...CHANNELS.map((c) => ['ch:' + c, c]), ['progress', '진행률'], ['notes', '비고'],
  ];
  function renderList() {
    const list = filtered();
    const { key, dir } = ui.sort;
    const get = (i) => (key === 'progress' ? progress(i) : key.startsWith('ch:') ? STATUS_KEYS.indexOf(i.channels[key.slice(3)]) : key === 'division' ? allDivisions().indexOf(i.division) : i[key]);
    list.sort((a, b) => {
      let x = get(a), y = get(b);
      if (typeof x === 'number') return dir === 'asc' ? x - y : y - x;
      x = x || ''; y = y || '';
      if (!x && y) return 1; if (x && !y) return -1;
      return dir === 'asc' ? String(x).localeCompare(y, 'ko') : String(y).localeCompare(x, 'ko');
    });
    $('#matrix-head').innerHTML = LIST_COLS.map(([k, l]) => `<th data-sort="${k}" data-dir="${k === key ? dir : ''}" class="${k.startsWith('ch:') ? 'ch-col' : ''}">${l}</th>`).join('');
    $('#list-count').textContent = `${list.length}건`;
    $('#list-empty').hidden = list.length > 0;
    $('#content-table tbody').innerHTML = list.map((i) => `
      <tr>
        <td>${divBadge(i.division)}</td>
        <td class="title-cell" data-id="${i.id}" title="${esc(i.title)}">${esc(i.title)}<span class="cell-meta">${esc(i.sourceChannel || '원문 채널 미정')} · ${esc(i.owner || '담당자 없음')}</span></td>
        <td class="wrap">${esc(i.mainKeyword || '–')}<span class="cell-meta">노출 ${naverBadge(i.naver)}</span></td>
        <td class="nowrap">${i.publishDate || '–'}</td>
        ${CHANNELS.map((c) => `<td>${chip(i, c)}</td>`).join('')}
        <td>${progressCell(i)}</td>
        <td class="notes-cell" title="${esc(i.notes)}">${esc(i.notes || '')}</td>
      </tr>`).join('');
  }
  function naverBadge(v) {
    const n = NAVER.find((x) => x.key === v);
    if (!v) return '<span class="muted">–</span>';
    return `<span class="status" style="--dot:${n ? n.color : 'var(--muted)'}">${esc(v)}</span>`;
  }

  function renderCalendar() {
    const m = ui.calMonth;
    $('#cal-title').textContent = `${m.getFullYear()}년 ${m.getMonth() + 1}월`;
    const start = addDays(m, -((m.getDay() + 6) % 7)); // 시트처럼 월요일 시작
    const byDate = {};
    filtered({ ignorePeriod: true }).forEach((i) => { if (i.publishDate) (byDate[i.publishDate] ||= []).push(i); });
    const t = toISO(today());
    let html = ['월', '화', '수', '목', '금', '토', '일'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let k = 0; k < 42; k++) {
      const d = addDays(start, k);
      if (k === 35 && d.getMonth() !== m.getMonth()) break;
      const iso = toISO(d), its = byDate[iso] || [];
      html += `<div class="cal-cell ${d.getMonth() !== m.getMonth() ? 'is-out' : ''} ${iso === t ? 'is-today' : ''}" data-date="${iso}">
        <span class="cal-day">${d.getDate()}</span>
        ${its.slice(0, 4).map((i) => `<div class="cal-item" style="--c:${divColor(i.division)}" data-id="${i.id}" title="${esc(divLabel(i.division))} | ${esc(i.title)} · 진행률 ${pct(progress(i))}">${esc(divInfo(i.division).icon)} ${esc(i.title)}</div>`).join('')}
        ${its.length > 4 ? `<span class="muted">+${its.length - 4}건 더</span>` : ''}
      </div>`;
    }
    $('#calendar').innerHTML = html;
    $('#cal-legend').innerHTML = allDivisions().map(divBadge).join('');
  }

  function renderKeywords() {
    const list = filtered().slice().sort((a, b) => (a.publishDate || '9999').localeCompare(b.publishDate || '9999'));
    const count = {};
    items.forEach((i) => { const k = i.mainKeyword.trim().toLowerCase(); if (k) count[k] = (count[k] || 0) + 1; });
    const withKw = list.filter((i) => i.mainKeyword);
    const subs = new Set(list.flatMap((i) => i.subKeywords.split(',').map((s) => s.trim()).filter(Boolean)));
    const dup = withKw.filter((i) => count[i.mainKeyword.trim().toLowerCase()] > 1).length;
    $('#kw-strip').innerHTML = `<span class="strip-title">키워드 요약</span>
      <div class="strip-item"><span>메인 키워드</span><b>${withKw.length}</b></div>
      <div class="strip-item"><span>서브 키워드</span><b>${subs.size}</b></div>
      <div class="strip-item"><span>네이버 노출 Y</span><b>${list.filter((i) => i.naver === 'Y').length}</b></div>
      <div class="strip-item"><span>미확인</span><b>${list.filter((i) => !i.naver).length}</b></div>
      <div class="strip-item"><span>중복 키워드</span><b>${dup}</b></div>`;
    $('#kw-count').textContent = `${list.length}건`;
    $('#kw-table tbody').innerHTML = list.map((i) => {
      const d = i.mainKeyword && count[i.mainKeyword.trim().toLowerCase()] > 1;
      return `<tr>
        <td class="nowrap"><b>${esc(i.mainKeyword || '–')}</b>${d ? ' <span class="dup">중복</span>' : ''}</td>
        <td>${naverBadge(i.naver)}</td>
        <td class="tags-cell">${i.subKeywords ? i.subKeywords.split(',').map((s) => s.trim()).filter(Boolean).map((s) => `<span class="tag">${esc(s)}</span>`).join('') : '<span class="muted">–</span>'}</td>
        <td>${divBadge(i.division)}</td>
        <td class="title-cell" data-id="${i.id}" title="${esc(i.title)}">${esc(i.title)}</td>
        <td class="nowrap">${i.publishDate || '–'}</td>
      </tr>`;
    }).join('');
  }

  // ---------- 차트 (SVG) ----------
  function stackedBars(el, rows, colors) {
    if (!rows[0] || !rows[0].total) { el.innerHTML = '<div class="chart-empty">콘텐츠가 없습니다.</div>'; return; }
    const W = 520, rowH = 38, padL = 76, padR = 54, bh = 20, H = rows.length * rowH + 4;
    const iw = W - padL - padR;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="채널별 배포 상태 누적 막대">`;
    rows.forEach((r, i) => {
      const y = i * rowH + 8;
      let x = padL;
      s += `<text class="label" x="${padL - 10}" y="${y + bh / 2 + 5}" text-anchor="end">${esc(r.label)}</text>`;
      r.segs.forEach((g) => {
        if (!g.n) return;
        const w = (iw * g.n) / r.total;
        s += `<g data-i="${i}" data-seg="${esc(g.key)}"><rect x="${x}" y="${y}" width="${Math.max(0, w - 2)}" height="${bh}" rx="3" fill="${colors[g.cls]}"/>
          <rect class="hit" x="${x}" y="${y - 8}" width="${w}" height="${rowH}"/></g>`;
        x += w;
      });
      const done = r.segs.find((g) => g.key === DONE).n;
      s += `<text class="value" x="${W - padR + 8}" y="${y + bh / 2 + 5}">${done}/${r.total}</text>`;
    });
    s += '</svg>';
    el.innerHTML = s;
    $$('g[data-i]', el).forEach((g) => {
      const r = rows[+g.dataset.i];
      g.addEventListener('mousemove', (e) => showTip(e, r.label, r.segs.filter((x) => x.n).map((x) => [x.key, x.n + '건']), g.dataset.seg));
      g.addEventListener('mouseleave', hideTip);
    });
  }

  function hBarChart(el, data, tip, onClick) {
    if (!data.length) { el.innerHTML = '<div class="chart-empty">콘텐츠가 없습니다.</div>'; return; }
    const W = 520, rowH = 36, padL = 116, padR = 44, H = data.length * rowH + 8;
    const max = Math.max(...data.map((d) => d.value)) || 1;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="사업부별 콘텐츠 수 막대 차트">`;
    data.forEach((d, i) => {
      const y = i * rowH + 8, bh = 18, w = Math.max(2, ((W - padL - padR) * d.value) / max);
      s += `<g data-i="${i}" class="${onClick ? 'clickable' : ''}">
        <text class="label" x="${padL - 10}" y="${y + bh / 2 + 5}" text-anchor="end">${esc(d.label)}</text>
        <path class="bar" style="fill:${divColor(d.key)}" d="${roundedRight(padL, y, w, bh, 4)}"/>
        <text class="value" x="${padL + w + 8}" y="${y + bh / 2 + 5}">${d.value}</text>
        <rect class="hit" x="0" y="${y - 8}" width="${W}" height="${rowH}"/>
      </g>`;
    });
    s += `<line class="baseline" x1="${padL}" x2="${padL}" y1="0" y2="${H}"/></svg>`;
    el.innerHTML = s;
    $$('g[data-i]', el).forEach((g) => {
      const d = data[+g.dataset.i];
      g.addEventListener('mousemove', (e) => showTip(e, d.label, tip(d)));
      g.addEventListener('mouseleave', hideTip);
      if (onClick) g.addEventListener('click', () => { hideTip(); onClick(d); });
    });
  }

  function vBarChart(el, data, tip) {
    const W = 520, H = 240, padL = 40, padR = 8, padT = 22, padB = 30;
    const max = niceMax(Math.max(...data.map((d) => d.value)));
    const iw = W - padL - padR, ih = H - padT - padB;
    const bw = Math.min(44, (iw / data.length) * 0.55);
    const y = (v) => padT + ih - (ih * v) / max;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 원문 발행 수 막대 차트">`;
    for (let k = 1; k <= 4; k++) {
      const v = (max / 4) * k;
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    data.forEach((d, i) => {
      const cx = padL + (iw / data.length) * (i + 0.5), h = (ih * d.value) / max;
      s += `<g data-i="${i}">
        ${d.value ? `<path class="bar" d="${roundedTop(cx - bw / 2, y(d.value), bw, h, 4)}"/><text class="value" x="${cx}" y="${y(d.value) - 6}" text-anchor="middle">${d.value}</text>` : ''}
        <text class="tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>
        <rect class="hit" x="${cx - iw / data.length / 2}" y="${padT}" width="${iw / data.length}" height="${ih}"/>
      </g>`;
    });
    s += `<line class="baseline" x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}"/></svg>`;
    el.innerHTML = s;
    $$('g[data-i]', el).forEach((g) => {
      const d = data[+g.dataset.i];
      g.addEventListener('mousemove', (e) => showTip(e, d.full, tip(d)));
      g.addEventListener('mouseleave', hideTip);
    });
  }

  function niceMax(v) {
    if (!v) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return Math.max(4, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10) * p);
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
  function showTip(e, title, rows, highlight) {
    tooltip.innerHTML = `<b>${esc(title)}</b>` + rows.map(([k, v]) => `<div class="tt-row ${k === highlight ? 'is-hl' : ''}"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('');
    tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    let left = e.clientX + 14, top = e.clientY + 14;
    if (left + r.width > innerWidth - 8) left = e.clientX - r.width - 14;
    if (top + r.height > innerHeight - 8) top = e.clientY - r.height - 14;
    tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px';
  }
  function hideTip() { tooltip.hidden = true; }

  // ---------- 편집 모달 ----------
  const dlg = $('#editor'), form = $('#editor-form');
  $('#e-channels').insertAdjacentHTML('beforeend', CHANNELS.map((c) => `
    <label>${c}<select name="ch:${c}" id="e-ch-${c}"><option value="">(빈칸)</option>${STATUS_KEYS.map((s) => `<option>${s}</option>`).join('')}</select></label>`).join(''));

  function openEditor(id, preset = {}) {
    const it = id ? items.find((i) => i.id === id) : null;
    ui.editingId = it ? it.id : null;
    $('#editor-title').textContent = it ? '콘텐츠 편집' : '새 콘텐츠';
    $('#btn-delete').hidden = !it;
    form.division.innerHTML = allDivisions().map((k) => `<option value="${esc(k)}">${esc(divLabel(k))}</option>`).join('');
    const v = it || normalize({ division: $('#f-division').value || DIVISIONS[1].key, owner: items[0]?.owner || '', channels: Object.fromEntries(CHANNELS.map((c) => [c, '미작성'])), ...preset });
    ['division', 'title', 'mainKeyword', 'naver', 'subKeywords', 'sourceChannel', 'publishDate', 'owner', 'notes'].forEach((k) => { form[k].value = v[k] || ''; });
    CHANNELS.forEach((c) => { form['ch:' + c].value = v.channels[c] || ''; });
    dlg.showModal();
    setTimeout(() => form.title.focus(), 30);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.title.trim()) return form.title.focus();
    data.channels = Object.fromEntries(CHANNELS.map((c) => [c, data['ch:' + c]]));
    if (ui.editingId) {
      const idx = items.findIndex((i) => i.id === ui.editingId);
      items[idx] = normalize({ ...data, id: ui.editingId, updatedAt: new Date().toISOString() });
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

  // 상태 칩: 미작성 → 작성중 → 검수중 → 예약 → 발행완료 → (빈칸) → 미작성 …
  function cycleChip(el) {
    const it = items.find((i) => i.id === el.dataset.cid);
    if (!it) return;
    const ch = el.dataset.chip, cur = it.channels[ch];
    const seq = [...STATUS_KEYS, ''];
    it.channels[ch] = seq[(seq.indexOf(cur) + 1) % seq.length];
    it.updatedAt = new Date().toISOString();
    save(); render();
    toast(`${ch}: ${it.channels[ch] || '빈칸'} · ${it.title.slice(0, 24)}${it.title.length > 24 ? '…' : ''}`);
  }

  // ---------- 가져오기 / 내보내기 ----------
  function rowsToItems(rows) {
    // 시트 맨 위 제목 줄 등을 건너뛰고 헤더 줄을 찾는다.
    const clean = (h) => String(h ?? '').replace(/\s+/g, '').toLowerCase();
    const hIdx = rows.findIndex((r) => r.some((c) => ['콘텐츠주제', '주제', '제목'].includes(clean(c))));
    if (hIdx < 0) throw new Error('"콘텐츠 주제" 열이 있는 헤더 줄을 찾을 수 없습니다.');
    const map = rows[hIdx].map((h) => {
      const c = clean(h);
      const f = COLUMNS.find(([, label, al]) => clean(label) === c || al.some((a) => clean(a) === c));
      return f ? f[0] : null;
    });
    return rows.slice(hIdx + 1).map((r) => {
      const o = { channels: {} };
      map.forEach((k, i) => {
        if (!k || k === 'progress') return;
        if (k.startsWith('ch:')) o.channels[k.slice(3)] = r[i]; else o[k] = r[i];
      });
      return normalize(o);
    }).filter((o) => o.title);
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split('\n')[0];
    const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  let xlsxLib = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLib) return xlsxLib;
    xlsxLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { xlsxLib = null; reject(new Error('엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV로 저장해 가져오세요.')); };
      document.head.appendChild(s);
    });
    return xlsxLib;
  }
  // 파일의 탭들을 [{ name, rows }]로 읽는다. preferred에 맞는 탭을 앞에 둔다.
  async function readSheets(file, preferred) {
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) return [{ name: file.name, rows: parseCSV(await file.text()) }];
    const XLSX = await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const score = (n) => (preferred.test(n) ? 2 : 0) - (/사본/.test(n) ? 1 : 0);
    return [...wb.SheetNames].sort((a, b) => score(b) - score(a))
      .map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  }
  async function readSheetFile(file, parse = rowsToItems, preferred = /운영\s*현황/, what = '"콘텐츠 주제" 열') {
    for (const sh of await readSheets(file, preferred)) {
      try { return { rows: parse(sh.rows), sheet: sh.name }; } catch (e) { /* 다음 탭 시도 */ }
    }
    throw new Error(`${what}이 있는 탭을 찾을 수 없습니다.`);
  }
  function toCSV(list) {
    const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const val = (i, k) => (k === 'progress' ? progress(i) : k.startsWith('ch:') ? i.channels[k.slice(3)] : k === 'division' ? divLabel(i.division) : i[k]);
    return '﻿' + [COLUMNS.map((c) => c[1]).join(','), ...list.map((i) => COLUMNS.map(([k]) => cell(val(i, k))).join(','))].join('\r\n');
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
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try { await cb(f); } catch (e) { ask('가져오기 실패: ' + e.message, '확인', null); }
    };
    input.click();
  }

  const actions = {
    'import-file': () => pickFile('.xlsx,.xls,.xlsm,.csv,.tsv,text/csv', async (f) => {
      const { rows, sheet } = await readSheetFile(f);
      if (!rows.length) throw new Error('가져올 행이 없습니다.');
      const replace = !items.length || (await ask(`「${sheet}」에서 ${rows.length}건을 읽었습니다. 기존 데이터는 어떻게 할까요?`, '기존 데이터 교체', '기존 데이터에 추가'));
      items = replace ? rows : items.concat(rows);
      save(); render(); toast(`${rows.length}건을 가져왔습니다.`);
    }),
    'export-csv': () => download(`멀티채널_콘텐츠_운영현황_${toISO(today())}.csv`, toCSV(filtered({ ignorePeriod: true })), 'text/csv;charset=utf-8'),
    'export-json': () => download(`content-backup_${toISO(today())}.json`, JSON.stringify({ version: 2, items, stats: stats.filter((r) => !r.example) }, null, 2), 'application/json'),
    'import-json': () => pickFile('.json,application/json', async (f) => {
      const data = JSON.parse(await f.text());
      const arr = Array.isArray(data) ? data : data.items; // 예전 백업은 콘텐츠 배열만 있음
      if (!Array.isArray(arr)) throw new Error('올바른 백업 파일이 아닙니다.');
      const st = Array.isArray(data.stats) ? data.stats : null;
      if (!(await ask(`백업(콘텐츠 ${arr.length}건${st ? `, 블로그 성과 ${st.length}건` : ''})으로 현재 데이터를 교체할까요?`, '교체'))) return;
      items = arr.map(normalize); save();
      if (st) { stats = st.map(normStat); saveStats(); }
      render(); toast('백업을 불러왔습니다.');
    }),
    'import-stats': () => pickFile('.xlsx,.xls,.xlsm,.csv,.tsv,text/csv', async (f) => {
      let { rows, sheet } = await readSheetFile(f, rowsToStats, /블로그|성과|통계/, '"조회수" 또는 "방문자수" 열');
      if (!rows.length) throw new Error('가져올 행이 없습니다.');
      if (rows.some((r) => !r.blog)) {
        const bs = blogs();
        const pick = await askChoice(`「${sheet}」에 블로그 열이 없습니다. 어느 블로그의 기록인가요?`, bs[0], bs[1] || '취소');
        if (!pick || (pick === 'cancel' && !bs[1])) return;
        const name = pick === 'ok' ? bs[0] : bs[1];
        rows = rows.map((r) => ({ ...r, blog: r.blog || name }));
      }
      upsertStats(rows);
      toast(`블로그 성과 ${rows.length}건을 가져왔습니다.`);
    }),
    'clear-example': () => { stats = stats.filter((r) => !r.example); saveStats(); render(); toast('예시 숫자를 지웠습니다.'); },
    'load-seed': async () => {
      if (!(await ask('지금 데이터를 지우고 처음 시트 데이터로 되돌릴까요?', '되돌리기'))) return;
      items = seed(); save(); render(); toast('처음 데이터로 되돌렸습니다.');
    },
    'clear-all': async () => {
      if (!(await ask('모든 콘텐츠를 삭제할까요? 되돌릴 수 없으니 먼저 백업을 저장해 두세요.', '전체 삭제'))) return;
      items = []; save(); render(); toast('전체 삭제했습니다.');
    },
  };

  // ---------- 블로그 성과 (커넥트 · 인스피언) ----------
  const BLOGS_DEFAULT = ['커넥트', '인스피언'];
  const STATS_KEY = STORAGE_KEY + ':blog';
  const METRIC_LABEL = { views: '조회수', visitors: '방문자수', neighbors: '이웃 수' };
  const statsUi = { period: 'month', metric: 'views', editingId: null };

  const numOrNull = (v) => { const t = String(v ?? '').replace(/[,\s]/g, ''); return t === '' || isNaN(+t) ? null : Math.max(0, +t); };
  function normStat(r) {
    return {
      id: r.id || uid(), blog: String(r.blog || '').trim(), date: normDate(r.date),
      views: numOrNull(r.views), visitors: numOrNull(r.visitors), neighbors: numOrNull(r.neighbors),
      memo: String(r.memo || ''), example: !!r.example,
    };
  }
  function loadStats() {
    try { const raw = localStorage.getItem(STATS_KEY); if (raw) return JSON.parse(raw).map(normStat); } catch (e) { /* 무시 */ }
    return exampleStats();
  }
  function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { toast('브라우저 저장에 실패했습니다.'); } }
  let stats = loadStats();

  // 실제 기록이 없을 때 화면을 보여 주기 위한 예시 숫자 (주간 기록, example 표시)
  function exampleStats() {
    let seedN = 7;
    const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
    const t = today(), mon = addDays(t, -((t.getDay() + 6) % 7) - 7);
    const out = [];
    BLOGS_DEFAULT.forEach((blog, b) => {
      let nb = b ? 640 : 1180;
      for (let k = 39; k >= 0; k--) {
        const d = addDays(mon, -7 * k);
        const base = (b ? 1050 : 1750) * (1 + (39 - k) * 0.012) * (0.85 + rnd() * 0.3);
        const views = Math.round(base), visitors = Math.round(views * (0.58 + rnd() * 0.08));
        nb += Math.round(4 + rnd() * 14);
        out.push(normStat({ blog, date: toISO(d), views, visitors, neighbors: nb, example: true }));
      }
    });
    return out;
  }
  function blogs() { return uniq([...BLOGS_DEFAULT, ...stats.map((r) => r.blog)]).sort((a, b) => ((BLOGS_DEFAULT.indexOf(a) + 1 || 99) - (BLOGS_DEFAULT.indexOf(b) + 1 || 99))); }
  const blogColor = (b) => `var(--s${(blogs().indexOf(b) % 8) + 1})`;

  function periodKey(dateStr, unit) {
    const d = parseDate(dateStr);
    if (!d) return null;
    if (unit === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return toISO(addDays(d, -((d.getDay() + 6) % 7))); // 그 주 월요일
  }
  function periodLabel(key, unit, long = false) {
    const [y, m, d] = key.split('-').map(Number);
    if (unit === 'month') return long ? `${y}년 ${m}월` : `${String(y).slice(2)}.${String(m).padStart(2, '0')}`;
    const end = addDays(new Date(y, m - 1, d), 6);
    return long ? `${y}년 ${m}/${d} ~ ${end.getMonth() + 1}/${end.getDate()} 주` : `${m}/${d}`;
  }
  function prevKey(key, unit) {
    const [y, m, d] = key.split('-').map(Number);
    return unit === 'month' ? periodKey(toISO(new Date(y, m - 2, 1)), unit) : toISO(addDays(new Date(y, m - 1, d), -7));
  }
  function periodsList(unit, n) {
    const last = stats.reduce((a, r) => (r.date > a ? r.date : a), '') || toISO(today());
    const keys = [periodKey(last, unit)];
    while (keys.length < n) keys.unshift(prevKey(keys[0], unit));
    return keys;
  }
  // 블로그별 기간 집계: 조회수·방문자수는 합계, 이웃 수는 기간 안 마지막 기록 값
  function aggregate(unit) {
    const out = {};
    [...stats].sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => {
      const k = periodKey(r.date, unit);
      if (!k || !r.blog) return;
      const a = ((out[r.blog] ||= {})[k] ||= { views: null, visitors: null, neighbors: null, n: 0 });
      if (r.views != null) a.views = (a.views || 0) + r.views;
      if (r.visitors != null) a.visitors = (a.visitors || 0) + r.visitors;
      if (r.neighbors != null) a.neighbors = r.neighbors;
      a.n++;
    });
    return out;
  }
  // 오늘이 속한 주/월은 아직 끝나지 않은 기간이라 증감률 비교에서 뺀다.
  const isCurrent = (key, unit) => key === periodKey(toISO(today()), unit);
  const growth = (cur, prev) => (cur == null || prev == null || prev === 0 ? null : (cur - prev) / prev);
  function deltaHtml(g, onColor = false) {
    const c = onColor ? ' on-color' : '';
    if (g == null) return `<span class="delta flat${c}">–</span>`;
    const v = Math.abs(g * 100), txt = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    if (Math.abs(g) < 0.0005) return `<span class="delta flat${c}">0%</span>`;
    return g > 0 ? `<span class="delta up${c}">▲ ${txt}%</span>` : `<span class="delta down${c}">▼ ${txt}%</span>`;
  }
  // 이웃 수는 증감률보다 순증 수가 읽기 쉽다
  const diffHtml = (cur, prev, onColor = false) => (cur == null || prev == null ? `<span class="delta flat${onColor ? ' on-color' : ''}">–</span>`
    : `<span class="delta ${cur > prev ? 'up' : cur < prev ? 'down' : 'flat'}${onColor ? ' on-color' : ''}">${cur > prev ? '+' : ''}${fmt(cur - prev)}</span>`);

  function renderBlog() {
    const unit = statsUi.period, metric = statsUi.metric;
    $('#stats-example').hidden = !stats.some((r) => r.example);
    $$('#stats-period button').forEach((b) => b.classList.toggle('is-on', b.dataset.period === unit));
    $$('#stats-metric button').forEach((b) => b.classList.toggle('is-on', b.dataset.metric === metric));
    $('#dl-blog').innerHTML = blogs().map((b) => `<option value="${esc(b)}">`).join('');
    const agg = aggregate(unit), bs = blogs();
    const keys = periodsList(unit, unit === 'month' ? 12 : 16);
    const unitWord = unit === 'month' ? '전월' : '전주';

    if (!stats.length) {
      $('#blog-cards').innerHTML = `<div class="card empty-card span-all">
        <b>아직 기록이 없습니다.</b>
        <p>네이버 블로그 통계에서 커넥트·인스피언의 조회수와 방문자수를 옮겨 적으세요. 일·주·월 단위 어느 것이든 됩니다.</p>
        <button class="btn btn-primary" data-add-stat>+ 첫 기록 입력</button></div>`;
    } else {
      $('#blog-cards').innerHTML = bs.map((b, i) => {
        const a = agg[b] || {};
        const k = [...keys].reverse().find((x) => a[x] && !isCurrent(x, unit)) || [...keys].reverse().find((x) => a[x]) || keys[keys.length - 1];
        const cur0 = keys.find((x) => isCurrent(x, unit) && a[x]);
        const cur = a[k] || {}, prev = a[prevKey(k, unit)] || {};
        const cls = i === 0 ? 'hero-green' : i === 1 ? 'hero-blue' : 'hero-plain';
        const on = i < 2;
        return `<div class="hero-card ${cls} blog-card">
          <div class="hero-label">${esc(b)} 블로그 <span class="hero-hint">${esc(periodLabel(k, unit, true))}${cur0 && cur0 !== k ? ` · ${unit === 'month' ? '이번 달' : '이번 주'}은 진행 중 (현재 ${fmt(a[cur0].views)})` : ''}</span></div>
          <div class="blog-main"><span>조회수</span><b>${fmt(cur.views)}</b>${deltaHtml(growth(cur.views, prev.views), on)}<em>${unitWord} ${fmt(prev.views)}</em></div>
          <div class="blog-subs">
            <div><span>방문자수</span><b>${fmt(cur.visitors)}</b>${deltaHtml(growth(cur.visitors, prev.visitors), on)}</div>
            <div><span>방문자당 조회</span><b>${cur.views != null && cur.visitors ? (cur.views / cur.visitors).toFixed(2) : '–'}</b></div>
            <div><span>이웃 수</span><b>${fmt(cur.neighbors)}</b>${diffHtml(cur.neighbors, prev.neighbors, on)}</div>
          </div>
        </div>`;
      }).join('');
    }

    // 추이 차트
    $('#trend-title').textContent = `${METRIC_LABEL[metric]} 추이`;
    $('#trend-sub').textContent = `${unit === 'month' ? '월간 · 최근 12개월' : '주간 · 최근 16주'}${metric === 'neighbors' ? ' · 기간 마지막 값' : ' · 기간 합계'}`;
    const series = bs.filter((b) => agg[b]).map((b) => ({ name: b, color: blogColor(b), values: keys.map((k) => agg[b][k]?.[metric] ?? null) }));
    $('#trend-legend').innerHTML = series.map((sr) => `<span class="lg"><i style="background:${sr.color}"></i>${esc(sr.name)}</span>`).join('');
    const partial = isCurrent(keys[keys.length - 1], unit) ? keys.length - 1 : -1;
    lineMulti($('#chart-trend'), keys.map((k) => periodLabel(k, unit)), keys.map((k, i) => periodLabel(k, unit, true) + (i === partial ? ' (진행 중)' : '')), series, metric, partial);

    // 기간별 표 (최신 기간이 위)
    const showBs = bs.filter((b) => agg[b]);
    const total = (k, m) => { const v = showBs.map((b) => agg[b][k]?.[m]); return v.every((x) => x == null) ? null : v.reduce((s2, x) => s2 + (x || 0), 0); };
    $('#period-table').innerHTML = showBs.length ? `<thead>
        <tr><th rowspan="2">기간</th>${showBs.map((b) => `<th colspan="4" class="grp"><span class="chan" style="--c:${blogColor(b)}">${esc(b)}</span></th>`).join('')}${showBs.length > 1 ? '<th colspan="2" class="grp">합계</th>' : ''}</tr>
        <tr>${showBs.map(() => '<th class="num">조회수</th><th class="num">증감</th><th class="num">방문자수</th><th class="num">증감</th>').join('')}${showBs.length > 1 ? '<th class="num">조회수</th><th class="num">증감</th>' : ''}</tr>
      </thead><tbody>${[...keys].reverse().filter((k) => showBs.some((b) => agg[b][k])).map((k) => {
        const pk = prevKey(k, unit), live = isCurrent(k, unit);
        const d = (c, p) => (live ? '<span class="delta flat">진행 중</span>' : deltaHtml(growth(c, p)));
        return `<tr class="${live ? 'is-live' : ''}"><td class="nowrap">${esc(periodLabel(k, unit, true))}</td>${showBs.map((b) => {
          const c = agg[b][k] || {}, p = agg[b][pk] || {};
          return `<td class="num">${fmt(c.views)}</td><td class="num">${d(c.views, p.views)}</td><td class="num">${fmt(c.visitors)}</td><td class="num">${d(c.visitors, p.visitors)}</td>`;
        }).join('')}${showBs.length > 1 ? `<td class="num"><b>${fmt(total(k, 'views'))}</b></td><td class="num">${d(total(k, 'views'), total(pk, 'views'))}</td>` : ''}</tr>`;
      }).join('')}</tbody>` : '<tbody><tr><td class="empty">기록을 입력하면 기간별 증감률이 계산됩니다.</td></tr></tbody>';

    // 입력한 기록
    const rows = [...stats].sort((a, b) => b.date.localeCompare(a.date) || a.blog.localeCompare(b.blog, 'ko'));
    $('#stats-count').textContent = `${rows.length}건${stats.some((r) => r.example) ? ' (예시 포함)' : ''}`;
    $('#stats-table').innerHTML = `<thead><tr><th>기준일</th><th>블로그</th><th class="num">조회수</th><th class="num">방문자수</th><th class="num">이웃 수</th><th>메모</th></tr></thead>
      <tbody>${rows.slice(0, statsUi.showAll ? rows.length : 20).map((r) => `<tr data-stat="${r.id}" class="clickable-row">
        <td class="nowrap">${r.date}</td><td><span class="chan" style="--c:${blogColor(r.blog)}">${esc(r.blog)}</span>${r.example ? ' <span class="dup">예시</span>' : ''}</td>
        <td class="num">${fmt(r.views)}</td><td class="num">${fmt(r.visitors)}</td><td class="num">${fmt(r.neighbors)}</td><td class="notes-cell">${esc(r.memo)}</td>
      </tr>`).join('')}${rows.length > 20 ? `<tr><td colspan="6" class="more-row"><button class="btn btn-ghost btn-sm" data-toggle-all>${statsUi.showAll ? '최근 20건만 보기' : `전체 ${rows.length}건 보기`}</button></td></tr>` : ''}</tbody>`;
  }

  // 여러 블로그를 한 축에 그리는 선 차트 (조회수끼리, 방문자수끼리처럼 같은 단위만)
  function lineMulti(el, labels, fullLabels, series, metric, partial = -1) {
    if (!series.length || series.every((sr) => sr.values.every((v) => v == null))) { el.innerHTML = '<div class="chart-empty">표시할 기록이 없습니다.</div>'; return; }
    const W = 1080, H = 300, padL = 56, padR = 120, padT = 16, padB = 30;
    const iw = W - padL - padR, ih = H - padT - padB, n = labels.length;
    const vals = series.flatMap((sr) => sr.values).filter((v) => v != null);
    const lo = metric === 'neighbors' ? Math.min(...vals) * 0.9 : 0;
    const max = metric === 'neighbors' ? Math.max(...vals) * 1.05 : niceMax(Math.max(...vals));
    const x = (i) => padL + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
    const y = (v) => padT + ih - (ih * (v - lo)) / (max - lo || 1);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="블로그별 ${METRIC_LABEL[metric]} 추이">`;
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((max - lo) / 4) * k;
      s += `<line class="${k ? 'grid-line' : 'baseline'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${fmtShort(v)}</text>`;
    }
    const step = Math.ceil(n / 8);
    labels.forEach((l, i) => { if (i % step === (n - 1) % step) s += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}${i === partial ? '*' : ''}</text>`; });
    s += `<line class="crosshair" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" visibility="hidden"/>`;
    const ends = [];
    series.forEach((sr) => {
      let d = '', pen = false;
      sr.values.forEach((v, i) => { if (v == null || i === partial) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
      s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      // 진행 중인 기간은 점선 + 속 빈 점
      if (partial > 0 && sr.values[partial] != null && sr.values[partial - 1] != null) {
        s += `<path d="M${x(partial - 1)} ${y(sr.values[partial - 1])} L${x(partial)} ${y(sr.values[partial])}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-dasharray="4 4"/>`;
      }
      sr.values.forEach((v, i) => {
        if (v != null) s += i === partial
          ? `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="var(--surface)" stroke="${sr.color}" stroke-width="2"/>`
          : `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${sr.color}" stroke="var(--surface)" stroke-width="2"/>`;
      });
      const li = sr.values.map((v, i) => (v == null || i === partial ? -1 : i)).filter((i) => i >= 0).pop();
      if (li != null) ends.push({ sr, i: li, v: sr.values[li], y: y(sr.values[li]) });
    });
    // 끝점 라벨: 겹치지 않게 최소 간격 확보
    ends.sort((a, b) => a.y - b.y).forEach((e, k, arr) => { e.ly = k ? Math.max(e.y, arr[k - 1].ly + 30) : e.y; });
    ends.forEach((e) => {
      s += `<circle cx="${x(e.i)}" cy="${e.y}" r="5" fill="${e.sr.color}" stroke="var(--surface)" stroke-width="2"/>`;
      s += `<text class="label" x="${W - padR + 10}" y="${e.ly - 2}">${esc(e.sr.name)}</text><text class="value" x="${W - padR + 10}" y="${e.ly + 14}">${fmt(e.v)}</text>`;
    });
    labels.forEach((l, i) => {
      const w = n === 1 ? iw : iw / (n - 1);
      s += `<rect class="hit" data-i="${i}" x="${x(i) - w / 2}" y="${padT}" width="${w}" height="${ih}"/>`;
    });
    s += '</svg>';
    el.innerHTML = s;
    const xh = $('.crosshair', el);
    $$('rect.hit', el).forEach((r) => {
      const i = +r.dataset.i;
      r.addEventListener('mousemove', (e) => {
        xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
        showTip(e, fullLabels[i], series.map((sr) => {
          const g = i > 0 ? growth(sr.values[i], sr.values[i - 1]) : null;
          return [sr.name, sr.values[i] == null ? '기록 없음' : `${fmt(sr.values[i])}${g == null ? '' : `  (${g >= 0 ? '▲' : '▼'}${Math.abs(g * 100).toFixed(1)}%)`}`];
        }));
      });
      r.addEventListener('mouseleave', () => { xh.setAttribute('visibility', 'hidden'); hideTip(); });
    });
  }
  const fmtShort = (n) => (n >= 1e4 ? (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '만' : fmt(n));

  function rowsToStats(rows) {
    const clean = (h) => String(h ?? '').replace(/\s+/g, '').toLowerCase();
    const FIELDS = [
      ['blog', ['블로그', '블로그명', '블로그이름']],
      ['date', ['기준일', '날짜', '일자', 'date', '기간', '월', '주']],
      ['views', ['조회수', '조회', 'pv', 'pageview', 'pageviews']],
      ['visitors', ['방문자수', '방문자', '순방문자수', 'uv', 'visitors']],
      ['neighbors', ['이웃수', '이웃', '구독자수', '구독자']],
      ['memo', ['메모', '비고']],
    ];
    const hIdx = rows.findIndex((r) => r.some((c) => ['조회수', '조회', '방문자수', '방문자', '순방문자수'].includes(clean(c))));
    if (hIdx < 0) throw new Error('"조회수" 또는 "방문자수" 열을 찾을 수 없습니다.');
    const map = rows[hIdx].map((h) => (FIELDS.find(([, al]) => al.includes(clean(h))) || [null])[0]);
    if (!map.includes('date')) throw new Error('"기준일"(날짜) 열을 찾을 수 없습니다.');
    return rows.slice(hIdx + 1).map((r) => {
      const o = {};
      map.forEach((k, i) => { if (k && o[k] == null) o[k] = r[i]; });
      return normStat(o);
    }).filter((r) => r.date && (r.views != null || r.visitors != null || r.neighbors != null));
  }
  // 같은 블로그·같은 기준일 기록은 새 값으로 덮어쓴다. 실제 기록이 들어오면 예시는 지운다.
  function upsertStats(newRows) {
    const keyOf = (r) => r.blog + '|' + r.date;
    const incoming = new Set(newRows.map(keyOf));
    const hadExample = stats.some((r) => r.example);
    stats = stats.filter((r) => !r.example && !incoming.has(keyOf(r))).concat(newRows);
    saveStats(); render();
    if (hadExample) setTimeout(() => toast('예시 숫자를 지우고 실제 기록으로 바꿨습니다.'), 2300);
  }

  const sdlg = $('#stat-editor'), sform = $('#stat-form');
  function openStat(id) {
    const r = id ? stats.find((x) => x.id === id) : null;
    statsUi.editingId = r ? r.id : null;
    $('#stat-title').textContent = r ? '블로그 성과 수정' : '블로그 성과 기록';
    $('#btn-delete-stat').hidden = !r;
    $('#dl-blog').innerHTML = blogs().map((b) => `<option value="${esc(b)}">`).join('');
    const lastBlog = stats.filter((x) => !x.example).sort((a, b) => b.date.localeCompare(a.date))[0]?.blog;
    const v = r || { blog: lastBlog || BLOGS_DEFAULT[0], date: toISO(statsUi.period === 'month' ? startOfMonth(today()) : addDays(today(), -((today().getDay() + 6) % 7))) };
    ['blog', 'date', 'views', 'visitors', 'neighbors', 'memo'].forEach((k) => { sform[k].value = v[k] ?? ''; });
    sdlg.showModal();
    setTimeout(() => sform.views.focus(), 30);
  }
  sform.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = normStat({ ...Object.fromEntries(new FormData(sform).entries()), id: statsUi.editingId || undefined });
    if (!r.blog || !r.date) return;
    if (r.views == null && r.visitors == null && r.neighbors == null) { sform.views.focus(); return toast('조회수, 방문자수, 이웃 수 중 하나는 입력하세요.'); }
    if (statsUi.editingId) stats = stats.filter((x) => x.id !== statsUi.editingId);
    upsertStats([r]);
    sdlg.close(); toast(`${r.blog} ${r.date} 기록을 저장했습니다.`);
  });
  $('#btn-delete-stat').addEventListener('click', async () => {
    if (!statsUi.editingId || !(await ask('이 기록을 삭제할까요?', '삭제'))) return;
    stats = stats.filter((x) => x.id !== statsUi.editingId);
    saveStats(); sdlg.close(); render(); toast('삭제했습니다.');
  });
  $$('[data-close]', sdlg).forEach((b) => b.addEventListener('click', () => sdlg.close()));
  sdlg.addEventListener('click', (e) => { if (e.target === sdlg) sdlg.close(); });
  $('#btn-add-stat').addEventListener('click', () => openStat(null));
  $('#stats-period').addEventListener('click', (e) => { const b = e.target.closest('[data-period]'); if (b) { statsUi.period = b.dataset.period; renderBlog(); } });
  $('#stats-metric').addEventListener('click', (e) => { const b = e.target.closest('[data-metric]'); if (b) { statsUi.metric = b.dataset.metric; renderBlog(); } });
  $('#view-blog').addEventListener('click', (e) => {
    if (e.target.closest('[data-add-stat]')) return openStat(null);
    if (e.target.closest('[data-toggle-all]')) { statsUi.showAll = !statsUi.showAll; return renderBlog(); }
    const tr = e.target.closest('[data-stat]');
    if (tr) openStat(tr.dataset.stat);
  });
  $('#stats-example').addEventListener('click', (e) => { const a = e.target.closest('[data-action]'); if (a) actions[a.dataset.action](); });

  // 대시보드 우측 패널용 요약: 블로그별 최근 월 조회수와 전월 대비
  function renderSideBlog() {
    const agg = aggregate('month'), keys = periodsList('month', 3);
    const [pk, k] = isCurrent(keys[2], 'month') ? keys : keys.slice(1);
    $('#side-blog-sub').textContent = stats.length ? `${periodLabel(k, 'month', true)} 조회수${stats.some((r) => r.example) ? ' · 예시' : ''}` : '';
    $('#side-blog').innerHTML = stats.length ? blogs().filter((b) => agg[b]).map((b) => {
      const c = agg[b][k] || {}, p = agg[b][pk] || {};
      return `<li data-goto="blog"><div class="camp-top"><span><span class="chan" style="--c:${blogColor(b)}">${esc(b)}</span></span><span><b class="nowrap">${fmt(c.views)}</b> ${deltaHtml(growth(c.views, p.views))}</span></div></li>`;
    }).join('') : '<li data-goto="blog" class="muted">아직 기록이 없습니다 · 블로그 성과에서 입력</li>';
  }

  // ---------- 이벤트 ----------
  function setView(v) {
    ui.view = v;
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === v));
    $$('.view').forEach((s) => s.classList.toggle('is-active', s.id === 'view-' + v));
    $('.app').classList.toggle('no-side', v !== 'dashboard');
    try { localStorage.setItem(STORAGE_KEY + ':view', v); } catch (e) { /* 무시 */ }
    render();
    window.scrollTo({ top: 0 });
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  $('#btn-add').addEventListener('click', () => openEditor(null));
  $('#menu-data').addEventListener('click', (e) => { const a = e.target.closest('[data-action]'); if (a) actions[a.dataset.action](); });

  ['#f-search', '#f-division', '#f-source', '#f-progress', '#f-owner', '#f-period']
    .forEach((s) => $(s).addEventListener(s === '#f-search' ? 'input' : 'change', render));
  $('#f-reset').addEventListener('click', () => {
    ['#f-search', '#f-division', '#f-source', '#f-progress', '#f-owner'].forEach((s) => { $(s).value = ''; });
    $('#f-period').value = 'all'; render();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('dialog')) return;
    const c = e.target.closest('[data-chip]');
    if (c) return cycleChip(c);
    if (e.target.closest('[data-add]')) return openEditor(null);
    const g = e.target.closest('[data-goto]');
    if (g) return setView(g.dataset.goto);
    const dv = e.target.closest('[data-division]');
    if (dv) { $('#f-division').value = dv.dataset.division; return setView('list'); }
    const nv = e.target.closest('[data-naver]');
    if (nv) { $('#f-search').value = ''; setView('keywords'); return; }
    const row = e.target.closest('[data-id]');
    if (row) openEditor(row.dataset.id);
  });
  document.addEventListener('keydown', (e) => {
    const c = e.target.closest && e.target.closest('[data-chip]');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cycleChip(c); }
  });
  $('#matrix-head').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]'); if (!th) return;
    const k = th.dataset.sort;
    ui.sort = { key: k, dir: ui.sort.key === k && ui.sort.dir === 'asc' ? 'desc' : 'asc' };
    renderList();
  });

  // 캘린더
  $('#cal-prev').addEventListener('click', () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); renderCalendar(); });
  $('#cal-today').addEventListener('click', () => { ui.calMonth = startOfMonth(new Date()); renderCalendar(); });
  $('#calendar').addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.cal-cell');
    if (cell && !e.target.closest('[data-id]')) openEditor(null, { publishDate: cell.dataset.date });
  });

  // 테마
  try { const th = localStorage.getItem(STORAGE_KEY + ':theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* 무시 */ }
  $('#btn-theme').addEventListener('click', () => {
    const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(STORAGE_KEY + ':theme', r.dataset.theme); } catch (e) { /* 무시 */ }
  });

  // 단축키: N = 새 콘텐츠, / = 검색
  document.addEventListener('keydown', (e) => {
    if (dlg.open || $('#stat-editor').open || $('#confirm').open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor(null); }
    if (e.key === '/') { e.preventDefault(); $('#f-search').focus(); }
  });

  // 브라우저 confirm()/alert() 대신 쓰는 페이지 내 확인 창. 취소 라벨이 null이면 확인 버튼만 표시.
  function ask(message, okLabel = '확인', cancelLabel = '취소') {
    return askChoice(message, okLabel, cancelLabel).then((v) => v === 'ok');
  }
  // 'ok' | 'cancel' | null(Esc로 닫음)
  function askChoice(message, okLabel = '확인', cancelLabel = '취소') {
    const box = $('#confirm');
    $('#confirm-msg').textContent = message;
    $('#confirm-ok').textContent = okLabel;
    const cancel = $('#confirm-cancel');
    cancel.hidden = cancelLabel === null;
    cancel.textContent = cancelLabel || '';
    box.returnValue = '';
    box.showModal();
    return new Promise((resolve) => {
      box.addEventListener('close', () => resolve(box.returnValue || null), { once: true });
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- 시작 ----------
  try { const v = localStorage.getItem(STORAGE_KEY + ':view'); if (v && $('#view-' + v)) ui.view = v; } catch (e) { /* 무시 */ }
  save();
  setView(ui.view);
})();
