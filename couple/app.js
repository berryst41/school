/* 우리 둘 — 둘만 쓰는 커플 앱 */
'use strict';

const SUPABASE_URL = 'https://bmfihlddiyfeejrdrigm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Sfa_Oh-RP4WCrG9EjhSlXA_qcDusGOk';
const BUCKET = 'couple';
const DEMO = new URLSearchParams(location.search).has('demo');

const CULTURE_CATS = [
  ['영화', '🎬'], ['드라마', '📺'], ['예능', '🎤'], ['책', '📖'], ['만화', '📚'], ['전시', '🖼️'],
  ['공연', '🎭'], ['게임', '🎮'], ['스포츠', '⚾'], ['방탈출', '🗝️'], ['공방', '🏺'],
];
const BUCKET_CATS = ['여행', '맛집', '데이트', '도전', '선물', '기타'];
const MOODS = ['😊', '🥰', '😆', '😴', '😢', '😡', '🤒', '🍀'];
const ANN_EMOJI = ['🎉', '🎂', '💍', '💐', '✈️', '🏠', '💌', '⭐'];

/* ───────── 작은 도구 ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diff = (a, b) => Math.round((parse(a) - parse(b)) / 86400000); // a - b (일)
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = s => { if (!s) return ''; const d = parse(s); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${WD[d.getDay()]})`; };
const fmtShort = s => { if (!s) return ''; const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const dLabel = n => n === 0 ? '오늘' : n > 0 ? `D-${n}` : `D+${-n}`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
async function busy(msg, fn) {
  const el = document.createElement('div'); el.id = 'busy'; el.textContent = msg; document.body.appendChild(el);
  try { return await fn(); } catch (e) { console.error(e); alert('문제가 생겼어요: ' + (e.message || e)); throw e; } finally { el.remove(); }
}

/* 사진을 휴대폰에서 보기 좋은 크기로 줄여요 */
async function shrink(file, max = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { src = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); }); }
  const w0 = src.width, h0 = src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
  return { blob, w: c.width, h: c.height };
}
function pickFiles(multiple = true) {
  return new Promise(ok => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple;
    i.onchange = () => ok([...i.files]); i.click();
  });
}
async function uploadFiles(files) {
  const out = [];
  for (const f of files) { const s = await shrink(f); out.push({ path: await API.upload(s.blob), w: s.w, h: s.h }); }
  return out;
}

/* ───────── 저장소 (Supabase) ───────── */
const urlCache = new Map();
function makeSupabaseApi() {
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const ok = r => { if (r.error) throw r.error; return r.data; };
  return {
    async session() { const { data } = await db.auth.getSession(); return data.session?.user || null; },
    async signIn(login, pw) {
      const r = await db.auth.signInWithPassword({ email: login.trim().toLowerCase() + '@couple.app', password: pw });
      if (r.error) throw new Error('아이디 또는 비밀번호가 맞지 않아요.');
      return r.data.user;
    },
    async join(code, login, pw, nick) { return ok(await db.rpc('couple_join', { p_code: code, p_login: login, p_password: pw, p_nickname: nick })); },
    async memberCount() { return ok(await db.rpc('couple_member_count')); },
    async signOut() { await db.auth.signOut(); },
    async changePassword(pw) { ok(await db.auth.updateUser({ password: pw })); },
    async list(t, order = 'created_at', asc = true) { return ok(await db.from(t).select('*').order(order, { ascending: asc })); },
    async insert(t, row) { return ok(await db.from(t).insert(row).select().single()); },
    async update(t, match, patch) { return ok(await db.from(t).update(patch).match(match).select().single()); },
    async upsert(t, row) { return ok(await db.from(t).upsert(row).select().single()); },
    async remove(t, match) { ok(await db.from(t).delete().match(match)); },
    async upload(blob) {
      const path = `${crypto.randomUUID()}.jpg`;
      ok(await db.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
      return path;
    },
    async removeFiles(paths) { if (paths.length) await db.storage.from(BUCKET).remove(paths); },
    async urls(paths) {
      const need = [...new Set(paths)].filter(p => p && !urlCache.has(p));
      if (need.length) {
        const data = ok(await db.storage.from(BUCKET).createSignedUrls(need, 60 * 60 * 24 * 7));
        data.forEach(d => d.signedUrl && urlCache.set(d.path, d.signedUrl));
      }
    },
  };
}

/* 미리보기용 (주소 끝에 ?demo) — 저장하지 않아요 */
function makeDemoApi() {
  const T = {}; const files = new Map(); let me = null;
  const uid = () => crypto.randomUUID();
  const users = [{ user_id: 'u1', login_id: 'me', nickname: '딸기' }, { user_id: 'u2', login_id: 'you', nickname: '바나나' }];
  T.couple_members = users;
  T.couple_settings = [{ id: 1, app_name: '우리 둘', start_date: addDays(today(), -297) }];
  ['couple_anniversaries', 'couple_diary', 'couple_photos', 'couple_bucket', 'couple_places', 'couple_trips', 'couple_culture'].forEach(t => T[t] = []);
  const key = (t, r) => t === 'couple_places' ? r.scope + ':' + r.code : (r.id ?? r.user_id);
  const match = (r, m) => Object.entries(m).every(([k, v]) => r[k] === v);
  return {
    async session() { return me; },
    async signIn() { return me = { id: 'u1' }; },
    async join() { return 'ok'; }, async memberCount() { return 2; },
    async signOut() { me = null; }, async changePassword() {},
    async list(t, order = 'created_at', asc = true) { return [...T[t]].sort((a, b) => (a[order] > b[order] ? 1 : -1) * (asc ? 1 : -1)); },
    async insert(t, row) { const r = { id: uid(), created_at: new Date().toISOString(), created_by: 'u1', updated_by: 'u1', updated_at: new Date().toISOString(), photos: [], ...row }; T[t].push(r); return r; },
    async update(t, m, patch) { const r = T[t].find(x => match(x, m)); Object.assign(r, patch); return r; },
    async upsert(t, row) { const i = T[t].findIndex(x => key(t, x) === key(t, row)); if (i >= 0) Object.assign(T[t][i], row); else T[t].push({ ...row }); return row; },
    async remove(t, m) { T[t] = T[t].filter(x => !match(x, m)); },
    async upload(blob) { const p = uid() + '.jpg'; files.set(p, URL.createObjectURL(blob)); return p; },
    async removeFiles() {},
    async urls(paths) { paths.forEach(p => files.has(p) && urlCache.set(p, files.get(p))); },
    _T: T,
  };
}
const API = DEMO ? makeDemoApi() : makeSupabaseApi();

/* 사진 주소 채우기: <img data-path="…"> */
async function hydrate(root = document) {
  const imgs = $$('img[data-path]', root).filter(i => !i.src);
  if (!imgs.length) return;
  try { await API.urls(imgs.map(i => i.dataset.path)); } catch (e) { console.warn(e); }
  imgs.forEach(i => { const u = urlCache.get(i.dataset.path); if (u) i.src = u; });
}
const img = (path, cls = '') => path ? `<img data-path="${esc(path)}" class="${cls}" alt="" loading="lazy">` : '';

/* ───────── 상태 ───────── */
const S = { me: null, members: [], settings: {}, anniv: [], diary: [], photos: [], bucket: [], places: [], trips: [], culture: [], tab: 'home' };
const nick = id => S.members.find(m => m.user_id === id)?.nickname || '';

async function loadAll() {
  const [members, settings, anniv, diary, photos, bucket, places, trips, culture] = await Promise.all([
    API.list('couple_members'), API.list('couple_settings', 'id'), API.list('couple_anniversaries', 'date'),
    API.list('couple_diary', 'date'), API.list('couple_photos', 'created_at', false), API.list('couple_bucket'),
    API.list('couple_places', 'updated_at'), API.list('couple_trips', 'start_date', false), API.list('couple_culture', 'created_at', false),
  ]);
  Object.assign(S, { members, settings: settings[0] || {}, anniv, diary, photos, bucket, places, trips, culture });
}
const RELOAD = {
  anniv: async () => S.anniv = await API.list('couple_anniversaries', 'date'),
  diary: async () => S.diary = await API.list('couple_diary', 'date'),
  photos: async () => S.photos = await API.list('couple_photos', 'created_at', false),
  bucket: async () => S.bucket = await API.list('couple_bucket'),
  places: async () => S.places = await API.list('couple_places', 'updated_at'),
  trips: async () => S.trips = await API.list('couple_trips', 'start_date', false),
  culture: async () => S.culture = await API.list('couple_culture', 'created_at', false),
  settings: async () => S.settings = (await API.list('couple_settings', 'id'))[0] || {},
  members: async () => S.members = await API.list('couple_members'),
};

/* ───────── 아래에서 올라오는 창 ───────── */
const sheets = [];
function openSheet(html, mount) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg); sheets.push(bg);
  const sh = $('.sheet', bg);
  $$('[data-close]', sh).forEach(b => b.onclick = () => closeSheet());
  mount?.(sh); hydrate(sh);
  return sh;
}
function closeSheet() { sheets.pop()?.remove(); }
const head = (title, extra = '') => `<div class="sheet-head"><h2>${title}</h2>${extra}<button class="x" data-close aria-label="닫기">✕</button></div>`;

/* 사진 여러 장 고르는 칸 (일기·여행·문화 기록에 같이 써요) */
function photoPicker(sh, sel, list, opts = {}) {
  const box = $(sel, sh);
  const draw = () => {
    box.innerHTML = list.map((p, i) => `<div class="t">${img(p)}<button class="x" data-i="${i}">✕</button>${opts.star ? `<button class="star" data-s="${i}">${opts.isStar?.(p) ? '⭐ 대표' : '대표로'}</button>` : ''}</div>`).join('')
      + `<button class="add-photo">＋<br>사진 추가</button>`;
    $$('.x', box).forEach(b => b.onclick = () => { list.splice(+b.dataset.i, 1); draw(); });
    $$('.star', box).forEach(b => b.onclick = () => opts.star(list[+b.dataset.s], draw));
    $('.add-photo', box).onclick = async () => {
      const files = await pickFiles(true); if (!files.length) return;
      const up = await busy('사진 올리는 중…', () => uploadFiles(files));
      up.forEach(u => list.push(u.path)); opts.onAdd?.(up); draw();
    };
    hydrate(box);
  };
  draw();
}

/* ───────── 기념일 계산 ───────── */
function upcoming(limit = 6) {
  const t = today(), out = [];
  const st = S.settings.start_date;
  if (st) {
    const n = diff(t, st) + 1; // 사귄 날이 1일
    for (let k = Math.max(1, Math.ceil(n / 100)); k < Math.ceil(n / 100) + 4; k++) out.push({ em: '💯', title: `${k * 100}일`, date: addDays(st, k * 100 - 1) });
    const y0 = parse(st).getFullYear();
    for (let y = 1; y < 80; y++) {
      const d = ymd(new Date(y0 + y, parse(st).getMonth(), parse(st).getDate()));
      if (d >= t) { out.push({ em: '💞', title: `${y}주년`, date: d }); out.push({ em: '💞', title: `${y + 1}주년`, date: ymd(new Date(y0 + y + 1, parse(st).getMonth(), parse(st).getDate())) }); break; }
    }
  }
  for (const a of S.anniv) {
    let d = a.date;
    if (a.yearly) { const o = parse(a.date); const ty = parse(t).getFullYear(); d = ymd(new Date(ty, o.getMonth(), o.getDate())); if (d < t) d = ymd(new Date(ty + 1, o.getMonth(), o.getDate())); }
    if (d >= t) out.push({ em: a.emoji || '🎉', title: a.title, date: d, id: a.id });
  }
  return out.filter(x => x.date >= t).sort((a, b) => a.date < b.date ? -1 : 1).slice(0, limit);
}
function marksOn(date) {
  const res = [], st = S.settings.start_date;
  if (st) {
    const n = diff(date, st) + 1;
    if (n > 0 && n % 100 === 0) res.push(`${n}일`);
    const a = parse(st), b = parse(date);
    if (b > a && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) res.push(`${b.getFullYear() - a.getFullYear()}주년`);
  }
  for (const x of S.anniv) {
    const a = parse(x.date), b = parse(date);
    if (x.yearly ? (a.getMonth() === b.getMonth() && a.getDate() === b.getDate() && b >= a) : x.date === date) res.push(x.title);
  }
  return res;
}

/* 휴대폰 달력에 넣는 파일(.ics) — 하루 전 저녁 8시, 당일 아침 9시에 알려 줘요 */
function downloadIcs() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//uri-dul//couple//KO', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${S.settings.app_name || '우리 둘'} 기념일`];
  const alarm = ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:기념일', 'TRIGGER:-PT4H', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:기념일', 'TRIGGER:PT9H', 'END:VALARM'];
  const ev = (id, title, date, rrule) => {
    const d = date.replace(/-/g, ''), e = addDays(date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${id}@uri-dul`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${e}`, `SUMMARY:${title}`);
    if (rrule) lines.push('RRULE:FREQ=YEARLY');
    lines.push(...alarm, 'END:VEVENT');
  };
  const st = S.settings.start_date, t = today();
  if (st) {
    const n = diff(t, st) + 1;
    for (let k = Math.max(1, Math.ceil(n / 100)); k <= Math.ceil(n / 100) + 10; k++) ev(`d${k * 100}`, `💯 우리 ${k * 100}일`, addDays(st, k * 100 - 1));
    const a = parse(st); ev('anniv', '💞 우리 기념일 (주년)', ymd(new Date(a.getFullYear() + 1, a.getMonth(), a.getDate())), true);
  }
  S.anniv.forEach(x => ev(x.id, `${x.emoji || '🎉'} ${x.title}`, x.date, x.yearly));
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '우리기념일.ics'; a.click();
}

/* ───────── 화면 그리기 ───────── */
const TABS = [['home', '🏠', '홈'], ['cal', '📅', '일기'], ['album', '🖼️', '앨범'], ['map', '🗺️', '지도'], ['bucket', '✅', '버킷'], ['culture', '🎬', '문화']];
function shell() {
  $('#app').innerHTML = `<div id="view"></div><nav class="tabs">${TABS.map(([k, e, l]) => `<button data-tab="${k}"><span>${e}</span>${l}</button>`).join('')}</nav>`;
  $$('nav.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
}
function go(tab) {
  S.tab = tab; try { localStorage.setItem('couple-tab', tab); } catch {}
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0); render();
}
function render() {
  const v = $('#view');
  ({ home: renderHome, cal: renderCal, album: renderAlbum, map: renderMap, bucket: renderBucket, culture: renderCulture })[S.tab](v);
  hydrate(v);
}

/* 홈 */
function renderHome(v) {
  const st = S.settings.start_date, n = st ? diff(today(), st) + 1 : null;
  const names = S.members.map(m => esc(m.nickname)).join(' <span class="heart">♥</span> ') || '우리 둘';
  const up = upcoming(6), soon = up.find(x => diff(x.date, today()) <= 7);
  const visitedW = visitedCodes('world').size, visitedK = visitedCodes('korea').size;
  v.innerHTML = `
    <div class="top"><h1>${esc(S.settings.app_name || '우리 둘')}</h1><button class="icon-btn" id="setBtn" aria-label="설정">⚙️</button></div>
    ${soon ? `<div class="alert">🔔 ${diff(soon.date, today()) === 0 ? '오늘은' : `${diff(soon.date, today())}일 뒤는`} ${esc(soon.title)}이에요! ${soon.em}</div>` : ''}
    <div class="card dday">
      <div class="names">${names}</div>
      ${st ? `<div class="num">D+${n}</div><div class="muted">${fmt(st)}부터 함께해요</div>`
           : `<p>사귄 날짜를 넣으면 D-day가 나와요.</p><button class="btn primary" id="setStart">사귄 날짜 넣기</button>`}
    </div>
    <div class="card">
      <div class="row between"><h2>다가오는 기념일</h2><button class="btn small" id="addAnn">＋ 기념일</button></div>
      ${up.length ? up.map(x => `<div class="ann"><div class="em">${x.em}</div><div class="grow"><b>${esc(x.title)}</b><div class="muted">${fmt(x.date)}</div></div><div class="d">${dLabel(diff(x.date, today()))}</div></div>`).join('') : '<div class="empty">기념일을 더해 보세요</div>'}
      <div class="btns"><button class="btn small" id="ics">📲 휴대폰 달력에 알림 넣기</button><button class="btn small" id="annList">기념일 관리</button></div>
    </div>
    <div class="card">
      <h2>우리 기록</h2>
      <div class="stats">
        <div><b>${S.diary.length}</b>일기</div><div><b>${S.photos.length}</b>사진</div><div><b>${S.bucket.filter(b => b.done).length}/${S.bucket.length}</b>버킷</div>
        <div><b>${visitedW}</b>나라</div><div><b>${visitedK}</b>국내 지역</div><div><b>${S.culture.length}</b>문화 기록</div>
      </div>
    </div>`;
  $('#setBtn').onclick = openSettings;
  $('#setStart') && ($('#setStart').onclick = openSettings);
  $('#addAnn').onclick = () => editAnniv();
  $('#annList').onclick = annivList;
  $('#ics').onclick = () => {
    if (!confirm('기념일을 휴대폰 달력에 넣는 파일을 받아요.\n파일을 열고 "추가"를 누르면, 기념일 하루 전 저녁 8시와 당일 아침 9시에 알림이 와요.\n\n기념일을 새로 더하면 다시 받아 주세요.')) return;
    downloadIcs();
  };
}
function annivList() {
  openSheet(head('기념일 관리') + `<p class="muted">100일 단위 기념일과 주년은 사귄 날로 저절로 계산돼요. 생일처럼 따로 챙길 날을 더해 주세요.</p>
    <div id="al">${S.anniv.map(a => `<div class="ann"><div class="em">${esc(a.emoji)}</div><div class="grow"><b>${esc(a.title)}</b><div class="muted">${fmt(a.date)}${a.yearly ? ' · 매년' : ''}</div></div><button class="btn small" data-id="${a.id}">고치기</button></div>`).join('') || '<div class="empty">아직 없어요</div>'}</div>
    <div class="btns"><button class="btn primary" id="na">＋ 기념일 더하기</button></div>`, sh => {
    $$('[data-id]', sh).forEach(b => b.onclick = () => { closeSheet(); editAnniv(S.anniv.find(a => a.id === b.dataset.id)); });
    $('#na', sh).onclick = () => { closeSheet(); editAnniv(); };
  });
}
function editAnniv(a) {
  let emoji = a?.emoji || '🎉';
  openSheet(head(a ? '기념일 고치기' : '기념일 더하기') + `
    <div class="chips" id="em">${ANN_EMOJI.map(e => `<button class="chip ${e === emoji ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div>
    <input class="field" id="t" placeholder="이름 (예: 딸기 생일)" value="${esc(a?.title)}">
    <div class="datebox"><div class="row between"><b>날짜</b><input type="date" id="d" value="${a?.date || today()}"></div>
    <div class="row between"><b>매년 챙기기</b><input type="checkbox" id="y" ${a ? (a.yearly ? 'checked' : '') : 'checked'} style="width:24px;height:24px"></div></div>
    <div class="btns">${a ? '<button class="btn danger" id="del">지우기</button>' : ''}<button class="btn primary" id="save">저장</button></div>`, sh => {
    $$('#em .chip', sh).forEach(b => b.onclick = () => { emoji = b.dataset.e; $$('#em .chip', sh).forEach(x => x.classList.toggle('on', x === b)); });
    $('#save', sh).onclick = () => busy('저장 중…', async () => {
      const row = { title: $('#t', sh).value.trim(), date: $('#d', sh).value, yearly: $('#y', sh).checked, emoji };
      if (!row.title || !row.date) return toast('이름과 날짜를 넣어 주세요');
      a ? await API.update('couple_anniversaries', { id: a.id }, row) : await API.insert('couple_anniversaries', row);
      await RELOAD.anniv(); closeSheet(); render(); toast('저장했어요');
    });
    a && ($('#del', sh).onclick = () => confirm('이 기념일을 지울까요?') && busy('지우는 중…', async () => {
      await API.remove('couple_anniversaries', { id: a.id }); await RELOAD.anniv(); closeSheet(); render();
    }));
  });
}
function openSettings() {
  const meM = S.members.find(m => m.user_id === S.me.id);
  openSheet(head('설정') + `
    <label class="lbl">앱 이름</label><input class="field" id="an" value="${esc(S.settings.app_name || '우리 둘')}">
    <label class="lbl">사귄 날 (1일)</label><input class="field" type="date" id="sd" value="${S.settings.start_date || ''}">
    <label class="lbl">내 별명</label><input class="field" id="nn" value="${esc(meM?.nickname)}">
    <div class="btns"><button class="btn primary" id="save">저장</button></div>
    <hr style="border:none;border-top:1px solid var(--line);margin:22px 0">
    <label class="lbl">비밀번호 바꾸기</label><input class="field" type="password" id="pw" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password">
    <div class="btns"><button class="btn" id="pwb">비밀번호 바꾸기</button></div>
    <div class="card" style="box-shadow:none;border-color:var(--line)"><b>📱 홈 화면에 앱처럼 두기</b>
      <p class="muted" style="margin:6px 0 0">아이폰: 사파리 아래 공유 단추 → "홈 화면에 추가"<br>갤럭시: 크롬 오른쪽 위 ⋮ → "홈 화면에 추가"</p></div>
    <div class="btns"><button class="btn" id="out">로그아웃</button></div>
    <p class="muted" style="text-align:center">로그인 아이디: ${esc(meM?.login_id)}</p>`, sh => {
    $('#save', sh).onclick = () => busy('저장 중…', async () => {
      await API.update('couple_settings', { id: 1 }, { app_name: $('#an', sh).value.trim() || '우리 둘', start_date: $('#sd', sh).value || null, updated_at: new Date().toISOString() });
      if (meM) await API.update('couple_members', { user_id: S.me.id }, { nickname: $('#nn', sh).value.trim() || meM.nickname });
      await RELOAD.settings(); await RELOAD.members(); closeSheet(); render(); toast('저장했어요');
    });
    $('#pwb', sh).onclick = () => {
      const pw = $('#pw', sh).value; if (pw.length < 6) return toast('6자 이상으로 적어 주세요');
      busy('바꾸는 중…', async () => { await API.changePassword(pw); $('#pw', sh).value = ''; toast('비밀번호를 바꿨어요'); });
    };
    $('#out', sh).onclick = async () => { await API.signOut(); location.reload(); };
  });
}

/* 캘린더 일기 */
let calMonth = today().slice(0, 7), calSel = today();
function renderCal(v) {
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), start = addDays(ymd(first), -first.getDay());
  const byDate = {}; S.diary.forEach(d => (byDate[d.date] ||= []).push(d));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), dd = parse(d), es = byDate[d] || [], ph = es.flatMap(e => e.photos || [])[0], mk = marksOn(d);
    if (i === 35 && dd.getMonth() !== m - 1) break;
    cells += `<button class="day ${dd.getMonth() !== m - 1 ? 'out' : ''} ${d === today() ? 'today' : ''} ${d === calSel ? 'sel' : ''}" data-d="${d}">
      ${ph ? img(ph, 'bg') : ''}<span class="n">${dd.getDate()}</span>${mk.length ? '<span class="mk">🎉</span>' : ''}${es.length && !ph ? '<span class="dot"></span>' : ''}</button>`;
  }
  const sel = byDate[calSel] || [], mk = marksOn(calSel);
  v.innerHTML = `
    <div class="top"><h1>📅 우리 일기</h1></div>
    <div class="card">
      <div class="cal-head"><button class="icon-btn" id="pm">‹</button><h2>${y}년 ${m}월</h2><button class="icon-btn" id="nm">›</button></div>
      <div class="cal">${WD.map(w => `<div class="wd">${w}</div>`).join('')}${cells}</div>
    </div>
    <div class="card">
      <div class="row between"><h2>${fmt(calSel)}</h2>${S.settings.start_date && calSel >= S.settings.start_date ? `<span class="muted">${diff(calSel, S.settings.start_date) + 1}일째</span>` : ''}</div>
      ${mk.length ? `<div class="alert" style="margin:4px 0 10px">🎉 ${mk.map(esc).join(', ')}</div>` : ''}
      ${sel.map(e => `<div class="entry">
          <div class="row between"><b>${esc(e.mood || '')} ${esc(nick(e.created_by))}</b><button class="btn small" data-edit="${e.id}">고치기</button></div>
          <div class="txt">${esc(e.content)}</div>
          ${(e.photos || []).length ? `<div class="mini-thumbs">${e.photos.map(p => `<button class="t" data-view="${esc(p)}">${img(p)}</button>`).join('')}</div>` : ''}
          ${e.updated_by && e.updated_by !== e.created_by ? `<div class="muted">✏️ ${esc(nick(e.updated_by))}님이 고쳤어요</div>` : ''}
        </div>`).join('') || '<div class="empty">이 날의 이야기를 남겨 보세요</div>'}
      <div class="btns"><button class="btn primary" id="write">✏️ 이 날 일기 쓰기</button></div>
    </div>`;
  $('#pm').onclick = () => { const d = new Date(y, m - 2, 1); calMonth = ymd(d).slice(0, 7); render(); };
  $('#nm').onclick = () => { const d = new Date(y, m, 1); calMonth = ymd(d).slice(0, 7); render(); };
  $$('.day', v).forEach(b => b.onclick = () => { calSel = b.dataset.d; if (calSel.slice(0, 7) !== calMonth) calMonth = calSel.slice(0, 7); render(); });
  $('#write').onclick = () => editDiary(null, calSel);
  $$('[data-edit]', v).forEach(b => b.onclick = () => editDiary(S.diary.find(e => e.id === b.dataset.edit)));
  $$('[data-view]', v).forEach(b => b.onclick = () => viewPhoto(b.dataset.view));
}
function editDiary(e, date) {
  const photos = [...(e?.photos || [])]; let mood = e?.mood || '';
  openSheet(head(e ? '일기 고치기' : '일기 쓰기') + `
    <input class="field" type="date" id="d" value="${e?.date || date}">
    <div class="chips" id="mood">${MOODS.map(x => `<button class="chip ${x === mood ? 'on' : ''}" data-m="${x}">${x}</button>`).join('')}</div>
    <textarea class="field" id="c" placeholder="오늘 우리에게 있었던 일">${esc(e?.content)}</textarea>
    <div class="mini-thumbs" id="ph"></div>
    ${e ? `<p class="muted">처음 쓴 사람: ${esc(nick(e.created_by))} · 둘 다 고칠 수 있어요</p>` : ''}
    <div class="btns">${e ? '<button class="btn danger" id="del">지우기</button>' : ''}<button class="btn primary" id="save">저장</button></div>`, sh => {
    photoPicker(sh, '#ph', photos);
    $$('#mood .chip', sh).forEach(b => b.onclick = () => { mood = mood === b.dataset.m ? '' : b.dataset.m; $$('#mood .chip', sh).forEach(x => x.classList.toggle('on', x.dataset.m === mood)); });
    $('#save', sh).onclick = () => busy('저장 중…', async () => {
      const row = { date: $('#d', sh).value, content: $('#c', sh).value, mood, photos, updated_by: S.me.id, updated_at: new Date().toISOString() };
      if (!row.content.trim() && !photos.length) return toast('내용이나 사진을 넣어 주세요');
      e ? await API.update('couple_diary', { id: e.id }, row) : await API.insert('couple_diary', row);
      calSel = row.date; calMonth = row.date.slice(0, 7);
      await RELOAD.diary(); closeSheet(); render(); toast('저장했어요');
    });
    e && ($('#del', sh).onclick = () => confirm('이 일기를 지울까요?') && busy('지우는 중…', async () => {
      await API.remove('couple_diary', { id: e.id }); await API.removeFiles(e.photos || []); await RELOAD.diary(); closeSheet(); render();
    }));
  });
}
function viewPhoto(path, extra = '') {
  openSheet(head('') + `<div class="viewer">${img(path)}</div>${extra}<div class="btns"><a class="btn" id="dl" target="_blank" style="text-align:center;text-decoration:none">원본 보기</a></div>`, sh => {
    setTimeout(() => { const u = urlCache.get(path); if (u) $('#dl', sh).href = u; }, 400);
  });
}

/* 사진 앨범 */
function renderAlbum(v) {
  v.innerHTML = `
    <div class="top"><h1>🖼️ 우리 앨범</h1><button class="btn small primary" id="up">＋ 사진 올리기</button></div>
    <p class="muted" style="margin:0 2px 10px">사진 ${S.photos.length}장 · 둘 다 올리고 볼 수 있어요</p>
    ${S.photos.length ? `<div class="thumbs">${S.photos.map(p => `<button class="t" data-id="${p.id}">${img(p.path)}</button>`).join('')}</div>` : '<div class="empty">첫 사진을 올려 보세요 📷</div>'}`;
  $('#up').onclick = async () => {
    const files = await pickFiles(true); if (!files.length) return;
    await busy(`사진 ${files.length}장 올리는 중…`, async () => {
      for (const f of files) {
        const s = await shrink(f); const path = await API.upload(s.blob);
        await API.insert('couple_photos', { path, taken_on: f.lastModified ? ymd(new Date(f.lastModified)) : today() });
      }
      await RELOAD.photos();
    });
    render(); toast('올렸어요');
  };
  $$('.thumbs .t', v).forEach(b => b.onclick = () => {
    const p = S.photos.find(x => x.id === b.dataset.id);
    viewPhoto(p.path, `<input class="field" id="cap" placeholder="한마디 남기기" value="${esc(p.caption)}">
      <p class="muted">${esc(nick(p.created_by))} · ${fmt(p.taken_on)}</p>
      <div class="btns"><button class="btn danger" id="del">지우기</button><button class="btn primary" id="save">저장</button></div>`);
    const sh = sheets.at(-1);
    $('#save', sh).onclick = () => busy('저장 중…', async () => { await API.update('couple_photos', { id: p.id }, { caption: $('#cap', sh).value }); await RELOAD.photos(); closeSheet(); toast('저장했어요'); });
    $('#del', sh).onclick = () => confirm('이 사진을 지울까요?') && busy('지우는 중…', async () => {
      await API.remove('couple_photos', { id: p.id }); await API.removeFiles([p.path]); await RELOAD.photos(); closeSheet(); render();
    });
  });
}

/* 버킷리스트 */
let bucketFilter = 'todo';
function renderBucket(v) {
  const list = S.bucket.filter(b => bucketFilter === 'all' || (bucketFilter === 'done' ? b.done : !b.done));
  const done = S.bucket.filter(b => b.done).length;
  v.innerHTML = `
    <div class="top"><h1>✅ 버킷리스트</h1></div>
    <div class="card">
      <div class="row"><input class="field grow" id="nb" placeholder="함께 하고 싶은 것" style="margin:0"><button class="btn primary" id="add">더하기</button></div>
      <div class="chips" style="margin-top:12px">${[['todo', '할 것'], ['done', `해낸 것 ${done}`], ['all', '전체']].map(([k, l]) => `<button class="chip ${bucketFilter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      ${list.map(b => `<div class="bucket-item ${b.done ? 'done' : ''}">
          <button class="check ${b.done ? 'on' : ''}" data-chk="${b.id}">${b.done ? '✓' : ''}</button>
          <button class="grow" data-open="${b.id}" style="background:none;border:none;text-align:left;padding:0">
            <div class="bt"><b>${esc(b.title)}</b></div>
            <div>${b.category ? `<span class="tag">${esc(b.category)}</span>` : ''}${b.done && b.done_on ? `<span class="muted">${fmt(b.done_on)} 해냈어요</span>` : ''}</div>
          </button>${b.photo ? `<div style="width:48px;height:48px;border-radius:10px;overflow:hidden">${img(b.photo)}</div>` : ''}</div>`).join('') || `<div class="empty">${bucketFilter === 'done' ? '아직 해낸 게 없어요' : '하고 싶은 걸 적어 보세요'}</div>`}
    </div>`;
  $$('img', v).forEach(i => i.style.cssText = 'width:100%;height:100%;object-fit:cover');
  const add = () => { const t = $('#nb').value.trim(); if (!t) return; busy('저장 중…', async () => { await API.insert('couple_bucket', { title: t }); await RELOAD.bucket(); bucketFilter = 'todo'; render(); }); };
  $('#add').onclick = add; $('#nb').onkeydown = e => e.key === 'Enter' && !e.isComposing && add();
  $$('[data-f]', v).forEach(b => b.onclick = () => { bucketFilter = b.dataset.f; render(); });
  $$('[data-chk]', v).forEach(b => b.onclick = () => busy('저장 중…', async () => {
    const it = S.bucket.find(x => x.id === b.dataset.chk);
    await API.update('couple_bucket', { id: it.id }, { done: !it.done, done_on: !it.done ? today() : null });
    await RELOAD.bucket(); render(); if (!it.done) toast('🎉 하나 해냈어요!');
  }));
  $$('[data-open]', v).forEach(b => b.onclick = () => editBucket(S.bucket.find(x => x.id === b.dataset.open)));
}
function editBucket(b) {
  let cat = b.category || ''; const photos = b.photo ? [b.photo] : [];
  openSheet(head('버킷리스트') + `
    <input class="field" id="t" value="${esc(b.title)}">
    <div class="chips" id="cat">${BUCKET_CATS.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
    <textarea class="field" id="m" placeholder="메모" style="min-height:80px">${esc(b.memo)}</textarea>
    <div class="datebox"><div class="row between"><b>해냈어요</b><input type="checkbox" id="dn" ${b.done ? 'checked' : ''} style="width:24px;height:24px"></div>
    <div class="row between"><b>해낸 날</b><input type="date" id="dd" value="${b.done_on || ''}"></div></div>
    <label class="lbl">인증 사진 (1장)</label><div class="mini-thumbs" id="ph"></div>
    <div class="btns"><button class="btn danger" id="del">지우기</button><button class="btn primary" id="save">저장</button></div>`, sh => {
    photoPicker(sh, '#ph', photos, { onAdd: () => { while (photos.length > 1) photos.shift(); } });
    $$('#cat .chip', sh).forEach(x => x.onclick = () => { cat = cat === x.dataset.c ? '' : x.dataset.c; $$('#cat .chip', sh).forEach(y => y.classList.toggle('on', y.dataset.c === cat)); });
    $('#save', sh).onclick = () => busy('저장 중…', async () => {
      const done = $('#dn', sh).checked;
      await API.update('couple_bucket', { id: b.id }, { title: $('#t', sh).value.trim() || b.title, category: cat || null, memo: $('#m', sh).value, done, done_on: done ? ($('#dd', sh).value || today()) : null, photo: photos.at(-1) || null });
      await RELOAD.bucket(); closeSheet(); render(); toast('저장했어요');
    });
    $('#del', sh).onclick = () => confirm('지울까요?') && busy('지우는 중…', async () => { await API.remove('couple_bucket', { id: b.id }); await RELOAD.bucket(); closeSheet(); render(); });
  });
}

/* 문화 기록장 */
let cultureFilter = '';
const catEmoji = c => (CULTURE_CATS.find(x => x[0] === c) || [, '✨'])[1];
function renderCulture(v) {
  const list = S.culture.filter(c => !cultureFilter || c.category === cultureFilter);
  const cnt = c => S.culture.filter(x => x.category === c).length;
  v.innerHTML = `
    <div class="top"><h1>🎬 문화 기록장</h1><button class="btn small primary" id="add">＋ 기록 추가</button></div>
    <div class="chips scroll"><button class="chip ${!cultureFilter ? 'on' : ''}" data-f="">전체 ${S.culture.length}</button>${CULTURE_CATS.filter(([c]) => cnt(c)).map(([c, e]) => `<button class="chip ${cultureFilter === c ? 'on' : ''}" data-f="${c}">${e} ${c} ${cnt(c)}</button>`).join('')}</div>
    <div class="card">${list.map(c => `<button class="culture" data-id="${c.id}">
        <div class="ph">${c.photos?.[0] ? img(c.photos[0]) : catEmoji(c.category)}</div>
        <div class="grow"><span class="tag">${catEmoji(c.category)} ${esc(c.category)}</span><div><b>${esc(c.title)}</b></div>
          <div class="stars-view">${'★'.repeat(c.rating || 0)}<span style="color:#d5d8de">${'★'.repeat(5 - (c.rating || 0))}</span></div>
          <div class="muted">${fmt(c.start_date)}${c.end_date && c.end_date !== c.start_date ? ' ~ ' + fmt(c.end_date) : ''}</div></div></button>`).join('') || '<div class="empty">함께 본 영화, 책, 공연을 남겨 보세요</div>'}</div>`;
  $('#add').onclick = () => editCulture();
  $$('[data-f]', v).forEach(b => b.onclick = () => { cultureFilter = b.dataset.f; render(); });
  $$('[data-id]', v).forEach(b => b.onclick = () => editCulture(S.culture.find(x => x.id === b.dataset.id)));
}
function editCulture(c) {
  let cat = c?.category || cultureFilter || '영화', rating = c?.rating || 0; const photos = [...(c?.photos || [])];
  openSheet(head(c ? '기록 고치기' : '기록 추가') + `
    <div class="chips" id="cat">${CULTURE_CATS.map(([n, e]) => `<button class="chip ${n === cat ? 'on' : ''}" data-c="${n}">${e} ${n}</button>`).join('')}</div>
    <input class="field" id="t" placeholder="제목" value="${esc(c?.title)}">
    <div class="datebox"><div class="row between"><b>시작일</b><input type="date" id="sd" value="${c?.start_date || today()}"></div>
    <div class="row between"><b>종료일</b><input type="date" id="ed" value="${c?.end_date || ''}"></div></div>
    <div class="stars" id="st">${[1, 2, 3, 4, 5].map(i => `<button data-r="${i}">★</button>`).join('')}</div>
    <div class="mini-thumbs" id="ph"></div>
    <textarea class="field" id="m" placeholder="메모">${esc(c?.memo)}</textarea>
    <div class="btns">${c ? '<button class="btn danger" id="del">지우기</button>' : ''}<button class="btn primary" id="save">저장</button></div>`, sh => {
    photoPicker(sh, '#ph', photos);
    const drawStars = () => $$('#st button', sh).forEach(b => b.classList.toggle('on', +b.dataset.r <= rating));
    $$('#st button', sh).forEach(b => b.onclick = () => { rating = rating === +b.dataset.r ? 0 : +b.dataset.r; drawStars(); }); drawStars();
    $$('#cat .chip', sh).forEach(x => x.onclick = () => { cat = x.dataset.c; $$('#cat .chip', sh).forEach(y => y.classList.toggle('on', y === x)); });
    $('#save', sh).onclick = () => busy('저장 중…', async () => {
      const row = { category: cat, title: $('#t', sh).value.trim(), start_date: $('#sd', sh).value || null, end_date: $('#ed', sh).value || null, rating, memo: $('#m', sh).value, photos };
      if (!row.title) return toast('제목을 넣어 주세요');
      c ? await API.update('couple_culture', { id: c.id }, row) : await API.insert('couple_culture', row);
      await RELOAD.culture(); closeSheet(); render(); toast('저장했어요');
    });
    c && ($('#del', sh).onclick = () => confirm('이 기록을 지울까요?') && busy('지우는 중…', async () => {
      await API.remove('couple_culture', { id: c.id }); await API.removeFiles(c.photos || []); await RELOAD.culture(); closeSheet(); render();
    }));
  });
}

/* ───────── 지도 기록 ───────── */
let mapScope = 'world';
const GEO = {};
async function loadGeo(scope) {
  if (GEO[scope]) return GEO[scope];
  const topo = await (await fetch(`data/${scope}.json`)).json();
  const obj = topo.objects[scope === 'world' ? 'countries' : 'regions'];
  const fc = topojson.feature(topo, obj);
  fc.features = fc.features.filter(f => f.id !== 'AQ');
  return GEO[scope] = { fc, mesh: topojson.mesh(topo, obj, (a, b) => a !== b) };
}
function visitedCodes(scope) {
  const s = new Set();
  S.places.filter(p => p.scope === scope && p.cover).forEach(p => s.add(p.code));
  S.trips.filter(t => t.scope === scope).forEach(t => s.add(t.code));
  return s;
}
const placeOf = (scope, code) => S.places.find(p => p.scope === scope && p.code === code);

/* 대표 사진을 나라 모양 안에 맞춰 넣는 계산 (지도와 편집 창이 같은 식을 써요) */
function coverRect(b, pos) {
  const [[x0, y0], [x1, y1]] = b, bw = x1 - x0, bh = y1 - y0;
  const iw = pos?.iw || 1, ih = pos?.ih || 1, s = pos?.s || 1;
  const base = Math.max(bw / iw, bh / ih), w = iw * base * s, h = ih * base * s;
  return { x: x0 + (bw - w) / 2 + (pos?.dx || 0) * bw, y: y0 + (bh - h) / 2 + (pos?.dy || 0) * bh, w, h };
}

let mapState = null; // 지금 그려진 지도
async function renderMap(v) {
  v.innerHTML = `
    <div class="top"><h1>${mapScope === 'world' ? '🌏 세계 지도' : '🇰🇷 국내 지도'}</h1></div>
    <div class="map-tools">
      <div class="chips" style="margin:0"><button class="chip ${mapScope === 'world' ? 'on' : ''}" data-s="world">세계</button><button class="chip ${mapScope === 'korea' ? 'on' : ''}" data-s="korea">국내</button></div>
      <button class="btn small" id="srch">🔍 검색</button>
      <div class="count">${mapScope === 'world' ? '방문 나라' : '방문 지역'} <b>${visitedCodes(mapScope).size}</b>곳</div>
    </div>
    <div class="map-wrap" id="mw"><div class="empty">지도를 불러오는 중…</div></div>`;
  $$('[data-s]', v).forEach(b => b.onclick = () => { mapScope = b.dataset.s; render(); });
  $('#srch').onclick = searchPlace;
  const geo = await loadGeo(mapScope);
  if (S.tab !== 'map') return;
  drawMap($('#mw'), geo);
}
function drawMap(wrap, geo) {
  const W = wrap.clientWidth, H = wrap.clientHeight, scope = mapScope;
  const proj = d3.geoMercator();
  if (scope === 'world') { proj.scale(W / 2 / Math.PI * 1.0).translate([W / 2, H / 2]).center([0, 15]); }
  else proj.fitExtent([[20, 20], [W - 20, H - 20]], geo.fc);
  const path = d3.geoPath(proj);
  const visited = visitedCodes(scope);
  const covers = new Map(S.places.filter(p => p.scope === scope && p.cover).map(p => [p.code, p]));
  wrap.innerHTML = '';
  const svg = d3.select(wrap).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const defs = svg.append('defs');
  const g = svg.append('g');
  const feats = geo.fc.features;
  g.selectAll('path.land').data(feats).join('path')
    .attr('class', d => 'land' + (visited.has(d.id) ? ' visited' : ''))
    .attr('d', path).attr('stroke-width', 0.6)
    .on('click', (e, d) => openPlace(scope, d));
  // 대표 사진
  const coverG = g.append('g');
  for (const f of feats) {
    const p = covers.get(f.id); if (!p) continue;
    const id = `cp-${scope}-${f.id}`;
    defs.append('clipPath').attr('id', id).append('path').attr('d', path(f));
    const r = coverRect(path.bounds(f), p.cover_pos);
    coverG.append('image').attr('data-path', p.cover).attr('x', r.x).attr('y', r.y).attr('width', r.w).attr('height', r.h)
      .attr('preserveAspectRatio', 'none').attr('clip-path', `url(#${id})`).style('cursor', 'pointer')
      .on('click', () => openPlace(scope, f));
  }
  g.append('path').datum(geo.mesh).attr('d', path).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 0.6).style('pointer-events', 'none').attr('class', 'mesh');
  const sel = g.append('path').attr('fill', 'none').attr('stroke', '#ffc94d').attr('stroke-width', 3).attr('stroke-linejoin', 'round').style('pointer-events', 'none');
  // 이름표
  const lg = g.append('g');
  const lab = feats.map(f => { const c = path.centroid(f); const a = path.area(f); return { f, c, a }; }).filter(x => isFinite(x.c[0]));
  // 사진 주소
  API.urls([...covers.values()].map(p => p.cover)).then(() => coverG.selectAll('image').each(function () { const u = urlCache.get(this.getAttribute('data-path')); if (u) this.setAttribute('href', u); })).catch(console.warn);

  let k0 = 1;
  const drawLabels = k => {
    const minA = scope === 'world' ? 700 : 0;
    lg.selectAll('text').data(lab.filter(x => x.a * k * k >= minA || visited.has(x.f.id)), x => x.f.id).join('text')
      .attr('class', 'lbl').attr('x', x => x.c[0]).attr('y', x => x.c[1]).attr('dy', '.35em')
      .style('font-size', `${(scope === 'world' ? 12 : 13) / k}px`).style('stroke-width', `${3 / k}px`).text(x => x.f.properties.ko);
  };
  const zoom = d3.zoom().scaleExtent([1, scope === 'world' ? 40 : 8]).translateExtent([[-W, -H * 0.2], [2 * W, H * 1.3]])
    .on('zoom', e => {
      g.attr('transform', e.transform);
      const k = e.transform.k;
      g.selectAll('path.land').attr('stroke-width', 0.6 / k); g.select('.mesh').attr('stroke-width', 0.6 / k);
      sel.attr('stroke-width', 3 / k);
      if (Math.abs(k - k0) / k0 > 0.15) { k0 = k; drawLabels(k); } else lg.selectAll('text').style('font-size', `${(scope === 'world' ? 12 : 13) / k}px`).style('stroke-width', `${3 / k}px`);
    });
  svg.call(zoom).on('dblclick.zoom', null);
  drawLabels(1);
  const focus = (f, kMax = 6) => {
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const k = Math.min(kMax, 0.55 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H * 0.4).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
    sel.attr('d', path(f));
  };
  mapState = { focus, select: f => sel.attr('d', f ? path(f) : null), geo };
  // 처음엔 동아시아가 보이게
  if (scope === 'world') {
    const kr = feats.find(f => f.id === 'KR');
    const [x, y] = proj([120, 15]);
    svg.call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(2.6).translate(-x, -y));
    if (!kr) return;
  }
}
function searchPlace() {
  const feats = GEO[mapScope]?.fc.features || [];
  openSheet(head(mapScope === 'world' ? '나라 검색' : '지역 검색') + `<input class="field" id="q" placeholder="예: ${mapScope === 'world' ? '일본' : '부산'}" autocomplete="off"><div id="res"></div>`, sh => {
    const q = $('#q', sh), res = $('#res', sh);
    const visited = visitedCodes(mapScope);
    const draw = () => {
      const s = q.value.trim();
      const list = feats.filter(f => !s || f.properties.ko.includes(s) || (f.properties.full || '').includes(s))
        .sort((a, b) => (visited.has(b.id) - visited.has(a.id)) || a.properties.ko.localeCompare(b.properties.ko, 'ko')).slice(0, 40);
      res.innerHTML = list.map(f => `<button class="ann" data-c="${f.id}" style="width:100%;background:none;border-left:none;border-right:none;border-top:none;text-align:left"><div class="grow"><b>${esc(f.properties.ko)}</b></div>${visited.has(f.id) ? '<span class="badge on">방문</span>' : ''}</button>`).join('');
      $$('[data-c]', res).forEach(b => b.onclick = () => { closeSheet(); const f = feats.find(x => x.id === b.dataset.c); mapState?.focus(f); setTimeout(() => openPlace(mapScope, f), 350); });
    };
    q.oninput = draw; draw(); setTimeout(() => q.focus(), 100);
  });
}

function openPlace(scope, f) {
  mapState?.select(f);
  const code = f.id, name = f.properties.ko, place = placeOf(scope, code);
  const trips = S.trips.filter(t => t.scope === scope && t.code === code);
  const visited = trips.length || place?.cover;
  openSheet(head(esc(name), `<span class="badge ${visited ? 'on' : ''}">${visited ? '방문' : '미방문'}</span>`) + `
    <div id="cov"></div>
    <div class="row between" style="margin-top:18px"><h3 style="margin:0">여행 기록 ${trips.length ? trips.length : ''}</h3><button class="btn small primary" id="addTrip">＋ 여행 기록</button></div>
    ${trips.map(t => `<button class="culture" data-t="${t.id}"><div class="ph">${t.photos?.[0] ? img(t.photos[0]) : '✈️'}</div>
      <div class="grow"><b>${esc(t.title)}</b><div class="muted">${fmt(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ' ~ ' + fmt(t.end_date) : ''}</div>
      <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.memo || '')}</div></div></button>`).join('') || '<div class="empty">여행을 기록하면 지도에 표시돼요</div>'}`, sh => {
    coverBox(sh, scope, f, place);
    $('#addTrip', sh).onclick = () => editTrip(scope, f);
    $$('[data-t]', sh).forEach(b => b.onclick = () => editTrip(scope, f, S.trips.find(t => t.id === b.dataset.t)));
  });
}
function refreshPlaceSheet(scope, f) { closeSheet(); render(); setTimeout(() => openPlace(scope, f), 300); }

/* 대표 사진 칸: 사진이 없으면 고르기, 있으면 끌어서 위치 맞추기 */
function coverBox(sh, scope, f, place) {
  const box = $('#cov', sh);
  if (!place?.cover) {
    box.innerHTML = `<button class="cover-empty" id="pick" style="width:100%">📷 대표 사진 고르기<br><span class="muted">사진이 ${esc(f.properties.ko)} 모양으로 지도에 채워져요</span></button>`;
    $('#pick', box).onclick = async () => {
      const files = await pickFiles(false); if (!files[0]) return;
      const up = await busy('사진 올리는 중…', () => uploadFiles(files));
      startCoverEdit(sh, scope, f, place, up[0].path, { iw: up[0].w, ih: up[0].h, s: 1, dx: 0, dy: 0 }, true);
    };
    return;
  }
  box.innerHTML = `<div class="cover-edit" id="ce"></div>
    <div class="btns"><button class="btn small" id="chg">사진 바꾸기</button><button class="btn small" id="adj">위치 맞추기</button><button class="btn small danger" id="rm">빼기</button></div>`;
  coverSvg($('#ce', box), f, place.cover, place.cover_pos, false);
  $('#adj', box).onclick = () => startCoverEdit(sh, scope, f, place, place.cover, { ...place.cover_pos }, false);
  $('#chg', box).onclick = async () => {
    const files = await pickFiles(false); if (!files[0]) return;
    const up = await busy('사진 올리는 중…', () => uploadFiles(files));
    startCoverEdit(sh, scope, f, place, up[0].path, { iw: up[0].w, ih: up[0].h, s: 1, dx: 0, dy: 0 }, true);
  };
  $('#rm', box).onclick = () => confirm('대표 사진을 뺄까요? (여행 기록은 그대로예요)') && busy('저장 중…', async () => {
    await API.update('couple_places', { scope, code: f.id }, { cover: null, cover_pos: null, updated_at: new Date().toISOString() });
    await RELOAD.places(); refreshPlaceSheet(scope, f);
  });
}
/* 편집 창 속 그림: 사진 + 나라 테두리 */
function coverSvg(el, f, photo, pos, editable) {
  const N = 300;
  const proj = d3.geoMercator().fitExtent([[24, 24], [N - 24, N - 24]], f), path = d3.geoPath(proj);
  const b = path.bounds(f), d = path(f);
  el.innerHTML = `<svg viewBox="0 0 ${N} ${N}"><defs><clipPath id="cpe"><path d="${d}"/></clipPath></defs>
    <image id="im0" preserveAspectRatio="none" opacity="${editable ? 0.45 : 0.25}"/>
    <image id="im1" preserveAspectRatio="none" clip-path="url(#cpe)"/>
    <path d="${d}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  const ims = [$('#im0', el), $('#im1', el)];
  const place = () => { const r = coverRect(b, pos); ims.forEach(i => { i.setAttribute('x', r.x); i.setAttribute('y', r.y); i.setAttribute('width', r.w); i.setAttribute('height', r.h); }); };
  API.urls([photo]).then(() => ims.forEach(i => i.setAttribute('href', urlCache.get(photo) || '')));
  place();
  if (editable) {
    const svg = $('svg', el); let last = null;
    const bw = b[1][0] - b[0][0], bh = b[1][1] - b[0][1];
    svg.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => {
      if (!last) return;
      const k = N / svg.getBoundingClientRect().width;
      pos.dx += (e.clientX - last[0]) * k / bw; pos.dy += (e.clientY - last[1]) * k / bh; last = [e.clientX, e.clientY]; place();
    });
    svg.addEventListener('pointerup', () => last = null); svg.addEventListener('pointercancel', () => last = null);
  }
  return place;
}
function startCoverEdit(sh, scope, f, place, photo, pos, isNew) {
  const box = $('#cov', sh);
  box.innerHTML = `<div class="cover-edit" id="ce"></div>
    <p class="muted" style="margin:8px 2px 0">사진을 손가락으로 끌어서 위치를 맞추고, 아래 막대로 크기를 조절해요.</p>
    <input type="range" id="sc" min="1" max="4" step="0.01" value="${pos.s || 1}">
    <div class="btns"><button class="btn" id="cc">취소</button><button class="btn primary" id="cs">저장</button></div>`;
  const redraw = coverSvg($('#ce', box), f, photo, pos, true);
  $('#sc', box).oninput = e => { pos.s = +e.target.value; redraw(); };
  $('#cc', box).onclick = async () => { if (isNew) await API.removeFiles([photo]); coverBox(sh, scope, f, place); };
  $('#cs', box).onclick = () => busy('저장 중…', async () => {
    const old = place?.cover;
    await API.upsert('couple_places', { scope, code: f.id, name: f.properties.ko, cover: photo, cover_pos: pos, updated_at: new Date().toISOString() });
    if (old && old !== photo && !S.trips.some(t => (t.photos || []).includes(old))) await API.removeFiles([old]);
    await RELOAD.places(); refreshPlaceSheet(scope, f); toast('지도에 채웠어요');
  });
}
function editTrip(scope, f, t) {
  const photos = [...(t?.photos || [])], place = placeOf(scope, f.id);
  let cover = null; // 대표로 고른 사진
  openSheet(head(t ? '여행 기록 고치기' : `${esc(f.properties.ko)} 여행 기록`) + `
    <input class="field" id="tt" placeholder="제목 (예: 첫 해외여행)" value="${esc(t?.title)}">
    <div class="datebox"><div class="row between"><b>시작일</b><input type="date" id="sd" value="${t?.start_date || today()}"></div>
    <div class="row between"><b>종료일</b><input type="date" id="ed" value="${t?.end_date || ''}"></div></div>
    <div class="mini-thumbs" id="ph"></div>
    <p class="muted" style="margin:0 2px">사진의 "대표로"를 누르면 그 사진이 지도에 채워져요.</p>
    <textarea class="field" id="m" placeholder="메모">${esc(t?.memo)}</textarea>
    <div class="btns">${t ? '<button class="btn danger" id="del">지우기</button>' : ''}<button class="btn primary" id="save">저장</button></div>`, sh => {
    const picks = {};
    photoPicker(sh, '#ph', photos, {
      onAdd: up => up.forEach(u => picks[u.path] = u),
      isStar: p => p === (cover || place?.cover),
      star: (p, redraw) => { cover = p; redraw(); },
    });
    $('#save', sh).onclick = () => busy('저장 중…', async () => {
      const row = { scope, code: f.id, title: $('#tt', sh).value.trim() || `${f.properties.ko} 여행`, start_date: $('#sd', sh).value || null, end_date: $('#ed', sh).value || null, memo: $('#m', sh).value, photos };
      t ? await API.update('couple_trips', { id: t.id }, row) : await API.insert('couple_trips', row);
      // 대표 사진: 고른 사진, 없으면 처음 기록할 때 첫 사진
      const chosen = cover || (!place?.cover && photos[0]);
      if (chosen && chosen !== place?.cover) {
        let size = picks[chosen];
        if (!size) size = await new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 1, h: 1 }); API.urls([chosen]).then(() => i.src = urlCache.get(chosen)); });
        await API.upsert('couple_places', { scope, code: f.id, name: f.properties.ko, cover: chosen, cover_pos: { iw: size.w, ih: size.h, s: 1, dx: 0, dy: 0 }, updated_at: new Date().toISOString() });
      } else if (!place) await API.upsert('couple_places', { scope, code: f.id, name: f.properties.ko, updated_at: new Date().toISOString() });
      await RELOAD.trips(); await RELOAD.places(); closeSheet(); refreshPlaceSheet(scope, f); toast('저장했어요');
    });
    t && ($('#del', sh).onclick = () => confirm('이 여행 기록을 지울까요?') && busy('지우는 중…', async () => {
      await API.remove('couple_trips', { id: t.id });
      await API.removeFiles((t.photos || []).filter(p => p !== place?.cover));
      await RELOAD.trips(); closeSheet(); refreshPlaceSheet(scope, f);
    }));
  });
}

/* ───────── 로그인 ───────── */
function renderLogin(full) {
  $('#app').innerHTML = `<div class="login">
    <div class="logo">💑</div><h1>우리 둘</h1>
    <div class="card" id="box"></div></div>`;
  const loginForm = () => {
    $('#box').innerHTML = `<h2>로그인</h2>
      <input class="field" id="lid" placeholder="아이디" autocapitalize="off" autocomplete="username">
      <input class="field" id="lpw" type="password" placeholder="비밀번호" autocomplete="current-password">
      <div class="btns"><button class="btn primary" id="go">들어가기</button></div>
      ${full ? '' : '<p style="text-align:center"><button class="link" id="tojoin">처음이에요 (계정 만들기)</button></p>'}`;
    const go = () => busy('들어가는 중…', async () => { await API.signIn($('#lid').value, $('#lpw').value); start(); }).catch(() => {});
    $('#go').onclick = go; $('#lpw').onkeydown = e => e.key === 'Enter' && go();
    $('#tojoin') && ($('#tojoin').onclick = joinForm);
  };
  const joinForm = () => {
    $('#box').innerHTML = `<h2>계정 만들기</h2>
      <p class="muted">둘만 쓸 수 있도록, 받은 <b>초대 코드</b>가 있어야 만들 수 있어요. 계정은 두 개까지만 만들어져요.</p>
      <input class="field" id="code" placeholder="초대 코드 (6자리)" autocapitalize="characters">
      <input class="field" id="nick" placeholder="별명 (예: 딸기)">
      <input class="field" id="lid" placeholder="아이디 (영어 소문자·숫자 3~20자)" autocapitalize="off" autocomplete="username">
      <input class="field" id="lpw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="new-password">
      <div class="btns"><button class="btn" id="back">뒤로</button><button class="btn primary" id="mk">만들기</button></div>`;
    $('#back').onclick = loginForm;
    $('#mk').onclick = () => busy('만드는 중…', async () => {
      const r = await API.join($('#code').value, $('#lid').value, $('#lpw').value, $('#nick').value);
      const msg = { full: '이미 두 사람이 가입했어요.', bad_code: '초대 코드가 맞지 않아요.', bad_login: '아이디는 영어 소문자, 숫자, _ 로 3~20자예요.', short_password: '비밀번호는 6자 이상이에요.', taken: '이미 있는 아이디예요.' }[r];
      if (msg) return alert(msg);
      await API.signIn($('#lid').value, $('#lpw').value); start();
    }).catch(() => {});
  };
  loginForm();
}

/* ───────── 시작 ───────── */
async function start() {
  if (DEMO && !(await API.session())) await API.signIn();
  const user = await API.session();
  if (!user) { let full = false; try { full = (await API.memberCount()) >= 2; } catch {} return renderLogin(full); }
  S.me = user;
  await busy('불러오는 중…', loadAll);
  if (!S.members.some(m => m.user_id === user.id)) { alert('이 계정은 우리 둘 앱 회원이 아니에요.'); await API.signOut(); return renderLogin(true); }
  shell();
  let t = 'home'; try { t = localStorage.getItem('couple-tab') || 'home'; } catch {}
  go(TABS.some(x => x[0] === t) ? t : 'home');
}
if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
