// 방탈출 예약 도우미 (키이스케이프)
// - 서버 시계: 사이트 응답의 Date 머리글로 내 컴퓨터와 서버의 시간 차이를 잽니다.
// - 정시 새로고침: 정해 둔 서버 시각이 되면 이 탭을 딱 한 번 새로고침합니다.
// - 내 정보 채우기: 이름·전화번호·인원 칸을 찾아 채웁니다. 예약(신청) 버튼은 누르지 않습니다.
(() => {
  if (window.top !== window || window.__keHelper) return;
  window.__keHelper = true;

  // 키이스케이프 예약 안내에 적힌 지점별 예약 오픈 시간
  const BRANCHES = [
    ['직접 입력', ''],
    ['백산방역 09:30', '09:30:00'],
    ['더오름점·우주라이크점·LOG_IN 1, 2 10:00', '10:00:00'],
    ['메모리컴퍼니 10:30', '10:30:00'],
    ['후즈데어 11:00', '11:00:00'],
    ['STATION 11:30', '11:30:00'],
    ['무비무드 13:30', '13:30:00'],
    ['강남점·부산점·전주점 18:00', '18:00:00'],
    ['홍대점 20:00', '20:00:00'],
  ];
  const KST = 9 * 3600 * 1000;
  const store = chrome.storage.local;
  const get = (k) => new Promise((r) => store.get(k, (v) => r(v[k])));
  const set = (o) => new Promise((r) => store.set(o, r));

  // ---------- 서버 시계 ----------
  let offset = 0; // 서버 시간 - 내 컴퓨터 시간 (ms)
  let accuracy = null; // ± ms
  let synced = false;

  async function sample() {
    const url = location.origin + '/?_ke=' + Date.now() + Math.random().toString(36).slice(2, 6);
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    } catch (e) {
      res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    }
    const t1 = Date.now();
    const d = Date.parse(res.headers.get('date'));
    if (isNaN(d)) throw new Error('서버 시간을 읽지 못했어요');
    // Date 머리글은 초 단위라 서버 시각은 [d, d+1000) 사이, 내 시각은 [t0, t1] 사이
    return { lo: d - t1, hi: d + 1000 - t0, mid: d + 500 - (t0 + t1) / 2 };
  }

  // 요청 8번을 0.137초 간격으로 보내 초가 바뀌는 순간을 좁혀 갑니다. (한 번 맞출 때 약 1초, 요청 8번)
  async function syncClock() {
    const samples = [];
    for (let i = 0; i < 8; i++) {
      samples.push(await sample());
      await new Promise((r) => setTimeout(r, 137));
    }
    const lo = Math.max(...samples.map((s) => s.lo));
    const hi = Math.min(...samples.map((s) => s.hi));
    if (lo <= hi) {
      offset = (lo + hi) / 2;
      accuracy = Math.max(1, Math.round((hi - lo) / 2));
    } else {
      const mids = samples.map((s) => s.mid).sort((a, b) => a - b);
      offset = mids[Math.floor(mids.length / 2)];
      accuracy = 500;
    }
    synced = true;
  }
  const serverNow = () => Date.now() + offset;

  // 서버 시각 기준 "오늘 HH:MM:SS" (한국 시간)
  function targetEpoch(hms) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hms.trim());
    if (!m) return null;
    const k = new Date(serverNow() + KST);
    return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), +m[1], +m[2], +(m[3] || 0)) - KST;
  }
  const fmt = (t, ms) => {
    const k = new Date(t + KST);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}` + (ms ? '.' + p(Math.floor(k.getUTCMilliseconds() / 100), 1) : '');
  };

  // ---------- 화면 ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
  .box{font:14px/1.45 "Malgun Gothic",sans-serif;color:#222;background:#fff;border:2px solid #ff6f61;border-radius:14px;
       box-shadow:0 6px 20px rgba(0,0,0,.18);width:290px;overflow:hidden}
  .hd{background:#ff6f61;color:#fff;padding:8px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
  .bd{padding:10px 12px}
  .min .bd{display:none}
  .clock{font:700 28px/1.1 Consolas,monospace;text-align:center;letter-spacing:1px}
  .sub{font-size:12px;color:#777;text-align:center;margin-bottom:8px}
  h4{margin:10px 0 4px;font-size:13px;color:#ff6f61}
  label{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:13px}
  label>span{width:62px;flex:none}
  input[type=text],input[type=tel],input[type=number],select{flex:1;min-width:0;padding:5px 6px;border:1px solid #ccc;border-radius:6px;font:inherit}
  button{width:100%;margin-top:6px;padding:8px;border:0;border-radius:8px;background:#ff6f61;color:#fff;font:700 14px "Malgun Gothic",sans-serif;cursor:pointer}
  button.gray{background:#888}
  button.big{background:#2f9e44;font-size:16px}
  .msg{margin-top:6px;font-size:12.5px;color:#444;white-space:pre-line}
  .armed{background:#fff4d6;border-radius:8px;padding:6px;text-align:center;font-weight:700}
</style>
<div class="box">
  <div class="hd" id="hd"><span>🔑 방탈출 예약 도우미</span><span id="tg">－</span></div>
  <div class="bd">
    <div class="clock" id="clock">--:--:--.-</div>
    <div class="sub" id="acc">서버 시간 맞추는 중…</div>

    <h4>① 정시 새로고침</h4>
    <label><span>지점</span><select id="br">${BRANCHES.map(([n, v]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
    <label><span>열리는 시각</span><input type="text" id="at" placeholder="10:00:00"></label>
    <label><span>여유(초)</span><input type="number" id="lag" step="0.1" min="0" max="5" value="0.3"></label>
    <div id="armbox"></div>
    <button id="arm">이 시각에 새로고침 예약</button>

    <h4>② 내 정보</h4>
    <label><span>이름</span><input type="text" id="nm"></label>
    <label><span>전화번호</span><input type="tel" id="ph" placeholder="010-1234-5678"></label>
    <label><span>인원</span><input type="number" id="pp" min="1" max="20"></label>
    <label><input type="checkbox" id="auto"> 입력칸이 나타나면 자동으로 채우기</label>
    <button class="big" id="fill">내 정보 채우기</button>
    <div class="msg" id="msg">예약 신청 버튼은 직접 눌러 주세요.</div>
  </div>
</div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => root.getElementById(id);
  const say = (t) => ($('msg').textContent = t);

  $('hd').onclick = () => {
    const box = root.querySelector('.box');
    box.classList.toggle('min');
    $('tg').textContent = box.classList.contains('min') ? '＋' : '－';
  };
  $('br').onchange = () => { if ($('br').value) $('at').value = $('br').value; };

  // 저장해 둔 정보 불러오기
  (async () => {
    const me = (await get('me')) || {};
    $('nm').value = me.name || '';
    $('ph').value = me.phone || '';
    $('pp').value = me.people || '';
    $('auto').checked = !!me.auto;
    const last = (await get('lastTime')) || {};
    if (last.at) $('at').value = last.at;
    if (last.lag != null) $('lag').value = last.lag;
    if (me.auto) watchForForm();
  })();
  const saveMe = () => set({ me: { name: $('nm').value.trim(), phone: $('ph').value.trim(), people: $('pp').value.trim(), auto: $('auto').checked } });
  ['nm', 'ph', 'pp'].forEach((id) => $(id).addEventListener('change', saveMe));
  $('auto').onchange = () => { saveMe(); if ($('auto').checked) watchForForm(); };

  // ---------- 정시 새로고침 ----------
  // 예약은 탭마다 따로 기억합니다(sessionStorage). 새로고침 후에는 저절로 풀려서 딱 한 번만 새로고침합니다.
  let timer = null;
  const ARM_KEY = '__keHelperArm';

  function showArmed(t) {
    $('armbox').innerHTML = t ? `<div class="armed">⏰ 서버 ${fmt(t, true)}에 새로고침합니다<br><small>이 탭을 앞에 띄워 두세요</small></div>` : '';
    $('arm').textContent = t ? '새로고침 예약 취소' : '이 시각에 새로고침 예약';
    $('arm').className = t ? 'gray' : '';
  }
  function disarm() {
    clearTimeout(timer);
    timer = null;
    sessionStorage.removeItem(ARM_KEY);
    showArmed(null);
  }
  function arm(fireAt) {
    sessionStorage.setItem(ARM_KEY, String(fireAt));
    showArmed(fireAt);
    let resynced = false;
    const tick = async () => {
      const left = fireAt - serverNow();
      if (left <= 0) {
        sessionStorage.setItem(ARM_KEY, 'done');
        location.reload();
        return;
      }
      // 20초 전에 한 번 더 시간을 맞춥니다
      if (!resynced && left < 20000 && left > 5000) {
        resynced = true;
        try { await syncClock(); } catch (e) {}
        return tick();
      }
      timer = setTimeout(tick, left > 2000 ? Math.min(left - 1500, 1000) : left > 50 ? left - 30 : 4);
    };
    tick();
  }
  $('arm').onclick = () => {
    if (timer) { disarm(); say('새로고침 예약을 취소했어요.'); return; }
    if (!synced) { say('서버 시간을 아직 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.'); return; }
    const t = targetEpoch($('at').value || '');
    if (t == null) { say('시각을 10:00:00 처럼 적어 주세요.'); return; }
    const lag = Math.min(5, Math.max(0, parseFloat($('lag').value) || 0));
    const fireAt = t + lag * 1000;
    if (fireAt <= serverNow()) { say('이미 지난 시각이에요. 시각을 다시 확인해 주세요.'); return; }
    set({ lastTime: { at: $('at').value, lag } });
    arm(fireAt);
    say('예약했어요. 시간이 되면 이 탭을 한 번 새로고침합니다.');
  };

  // ---------- 내 정보 채우기 ----------
  const RX = {
    name: /이름|성명|예약자|성함|(^|[^a-z])(user_?)?name|nm\b/i,
    phone: /전화|휴대|연락처|핸드폰|phone|tel|mobile|\bhp\d?\b|hp_?\d|cell/i,
    people: /인원|명수|인원수|people|person|persons|headcount|count|cnt|num_?people|member/i,
    skip: /아이디|비밀번호|password|search|검색|이메일|email|입금자|zizum|theme|테마|지점|날짜|date|time|captcha|보안/i,
  };

  function labelText(el) {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title];
    if (el.id) {
      const l = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(l.textContent);
    }
    const wrap = el.closest('label');
    if (wrap) parts.push(wrap.textContent);
    const cell = el.closest('td,dd,li,div');
    if (cell) {
      const prev = cell.previousElementSibling;
      if (prev && prev.textContent.length < 30) parts.push(prev.textContent);
    }
    const row = el.closest('tr');
    if (row) { const th = row.querySelector('th'); if (th) parts.push(th.textContent); }
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ');
  }
  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

  function setValue(el, v) {
    if (el.tagName === 'SELECT') {
      const want = String(v);
      const opt = [...el.options].find((o) => o.value === want) ||
        [...el.options].find((o) => o.textContent.replace(/\D/g, '') === want.replace(/\D/g, '') && want.replace(/\D/g, '') !== '');
      if (!opt) return false;
      el.value = opt.value;
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function docs() {
    const out = [document];
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentDocument) out.push(f.contentDocument); } catch (e) {}
    }
    return out;
  }

  function fillAll(quiet) {
    const name = $('nm').value.trim();
    const phone = $('ph').value.replace(/[^\d]/g, '');
    const people = $('pp').value.trim();
    if (!name && !phone && !people) { if (!quiet) say('먼저 ② 내 정보를 적어 주세요.'); return 0; }

    const found = { name: [], phone: [], people: [] };
    for (const d of docs()) {
      for (const el of d.querySelectorAll('input,select,textarea')) {
        if (!visible(el) || el.disabled || el.readOnly) continue;
        const type = (el.type || '').toLowerCase();
        if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'image', 'file', 'password'].includes(type)) continue;
        if (host.contains(el)) continue;
        const t = labelText(el);
        if (RX.skip.test(t)) continue;
        if (RX.phone.test(t)) found.phone.push(el);
        else if (RX.people.test(t)) found.people.push(el);
        else if (RX.name.test(t)) found.name.push(el);
      }
    }

    const done = [];
    if (name && found.name.length) { found.name.forEach((el) => setValue(el, name)); done.push('이름'); }
    if (people && found.people.length && found.people.some((el) => setValue(el, people))) done.push('인원');
    if (phone && found.phone.length) {
      const f = found.phone;
      const parts = phone.length === 11 ? [phone.slice(0, 3), phone.slice(3, 7), phone.slice(7)]
        : [phone.slice(0, 3), phone.slice(3, 6), phone.slice(6)];
      let ok;
      if (f.length === 1) {
        const dash = /-/.test(f[0].placeholder || '') || /-/.test(f[0].value || '');
        ok = setValue(f[0], dash ? parts.join('-') : phone);
      } else if (f.length === 2) {
        ok = setValue(f[0], parts[1]) && setValue(f[1], parts[2]); // 앞자리(010)는 고정이거나 따로 있는 경우
      } else {
        ok = setValue(f[0], parts[0]) && setValue(f[1], parts[1]) && setValue(f[2], parts[2]);
      }
      if (ok) done.push('전화번호');
    }
    if (!quiet || done.length) {
      say(done.length
        ? `${done.join(', ')}을(를) 채웠어요. 내용을 확인하고 예약 버튼은 직접 눌러 주세요.`
        : '채울 칸을 찾지 못했어요. 지점·테마·날짜·시간을 고른 뒤 입력칸이 보일 때 다시 눌러 주세요.');
    }
    return done.length;
  }
  $('fill').onclick = () => { saveMe(); fillAll(false); };

  // 입력칸이 새로 나타나면 한 번 채웁니다
  let watching = false;
  function watchForForm() {
    if (watching) return;
    watching = true;
    let filled = false, wait = null;
    const check = () => {
      if (!$('auto').checked) return;
      const n = fillAll(true);
      if (n && !filled) filled = true;
    };
    new MutationObserver(() => {
      clearTimeout(wait);
      wait = setTimeout(() => { if (!filled) check(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });
    // 입력칸이 바뀌면(다른 시간을 고르면) 다시 채울 수 있게
    document.addEventListener('click', () => { filled = false; }, true);
    check();
  }

  // ---------- 시작 ----------
  const state = sessionStorage.getItem(ARM_KEY);
  if (state === 'done') {
    sessionStorage.removeItem(ARM_KEY);
    say('⏰ 정해 둔 시각에 새로고침했어요! 지점·테마·날짜·시간을 골라 주세요.');
  }

  setInterval(() => {
    $('clock').textContent = synced ? fmt(serverNow(), true) : '--:--:--.-';
  }, 50);

  syncClock().then(() => {
    const diff = offset / 1000;
    $('acc').textContent = `서버 시간 (정확도 ±${accuracy}ms) · 내 컴퓨터보다 ${Math.abs(diff).toFixed(1)}초 ${diff >= 0 ? '빠름' : '느림'}`;
    if (state && state !== 'done') {
      const t = +state;
      if (t > serverNow()) arm(t); else sessionStorage.removeItem(ARM_KEY);
    }
  }).catch((e) => {
    $('acc').textContent = '서버 시간을 맞추지 못했어요: ' + e.message;
  });
})();
