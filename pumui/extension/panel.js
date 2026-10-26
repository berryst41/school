const $ = id => document.getElementById(id);
const FIELDS = ["fmt", "year", "project", "label", "refs", "vendor"];
const won = n => Math.round(n || 0).toLocaleString("ko-KR");
const num = v => Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;
const LETTERS = "가나다라마바사아자차카타파하";

/* ---------- 저장 ---------- */
let state = { fmt: "simple", year: new Date().getFullYear(), project: "", label: "", refs: "", vendor: "", items: [] };
let settings = { apiKey: "", model: "claude-opus-5-5" };

async function loadAll() {
  const got = await chrome.storage.local.get(["state", "settings"]);
  if (got.state) state = { ...state, ...got.state };
  if (got.settings) settings = { ...settings, ...got.settings };
  FIELDS.forEach(k => $(k).value = state[k] ?? "");
  $("budget").value = state.budget || "";
  $("apiKey").value = settings.apiKey;
  $("model").value = settings.model;
  drawRows();
  render();
  loadHistory();
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ state }), 300);
}

/* ---------- 품목 표 ---------- */
function drawRows() {
  const tb = $("rows");
  tb.innerHTML = "";
  if (!state.items.length) state.items.push({ name: "", spec: "", qty: 1, unit: "개", price: 0 });
  state.items.forEach((it, i) => {
    const tr = document.createElement("tr");
    if (it.done) tr.className = "done";
    tr.innerHTML = `
      <td class="pick"><input type="checkbox" class="sel" title="에듀파인에 넣을 품목으로 선택"${it.sel ? " checked" : ""}>${it.done ? `<button class="badge" title="누르면 '입력함' 표시를 지워요">✓${it.done}차</button>` : ""}</td>
      <td><input data-k="name" style="min-width:110px"></td><td><input data-k="spec" style="width:60px"></td>
      <td><input data-k="qty" class="n" inputmode="numeric" style="width:44px"></td>
      <td><input data-k="unit" style="width:44px"></td>
      <td><input data-k="price" class="n" inputmode="numeric" style="width:76px"></td>
      <td class="acts"><button class="split" title="수량을 나눠 다른 예산에 넣기">나누기</button><button class="x" title="이 품목 삭제">✕</button></td>`;
    tr.querySelector(".sel").onchange = e => { it.sel = e.target.checked; render(); save(); };
    const badge = tr.querySelector(".badge");
    if (badge) badge.onclick = () => { it.done = 0; drawRows(); render(); save(); };
    tr.querySelectorAll("input[data-k]").forEach(inp => {
      const k = inp.dataset.k;
      inp.value = k === "price" ? (it.price ? won(it.price) : "") : (it[k] ?? "");
      inp.addEventListener("input", () => {
        it[k] = (k === "qty" || k === "price") ? num(inp.value) : inp.value;
        render(); save();
      });
      if (k === "price") inp.addEventListener("blur", () => { if (inp.value) inp.value = won(num(inp.value)); });
    });
    tr.querySelector(".split").onclick = () => splitRow(i, tr);
    tr.querySelector(".x").onclick = () => { state.items.splice(i, 1); drawRows(); render(); save(); };
    tb.appendChild(tr);
  });
}
// 한 품목의 수량을 둘로 나눈다 (예: 줄넘기 20개 → 12개 + 8개, 서로 다른 예산에 넣기)
function splitRow(i, tr) {
  const it = state.items[i];
  const q = num(it.qty);
  if (q < 2) { say("readState", "수량이 2개 이상일 때 나눌 수 있어요.", "err"); return; }
  const cell = tr.querySelector(".acts");
  cell.innerHTML = `<input class="n" type="number" min="1" max="${q - 1}" value="${Math.floor(q / 2)}" style="width:44px" title="떼어 낼 수량"><button class="ok">확인</button>`;
  const inp = cell.querySelector("input");
  inp.focus(); inp.select();
  const go = () => {
    const n = Math.round(num(inp.value));
    if (n >= 1 && n < q) {
      it.qty = q - n;
      state.items.splice(i + 1, 0, { ...it, qty: n, sel: false, done: 0, budget: "" });
    }
    drawRows(); render(); save();
  };
  cell.querySelector(".ok").onclick = go;
  inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); if (e.key === "Escape") drawRows(); });
}
const goodItems = () => state.items.filter(o => (o.name || "").trim());
// 이번에 에듀파인에 넣을 품목: 체크한 품목. 하나도 체크하지 않았으면 아직 안 넣은 품목 전부.
const picked = () => { const g = goodItems(); const s = g.filter(o => o.sel); return s.length ? s : g.filter(o => !o.done); };
const total = () => picked().reduce((a, o) => a + num(o.qty) * num(o.price), 0);

/* ---------- 기안 문장 ---------- */
function toKorean(n) {
  n = Math.floor(Math.abs(n));
  if (!n) return "영";
  const d = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"], s = ["", "십", "백", "천"], b = ["", "만", "억", "조"];
  let out = "", gi = 0;
  while (n > 0) {
    const g = n % 10000; n = Math.floor(n / 10000);
    if (g) {
      let part = "", x = g;
      for (let i = 0; i < 4; i++) { const k = x % 10; x = Math.floor(x / 10); if (k) part = d[k] + s[i] + part; }
      out = part + b[gi] + out;
    }
    gi++;
  }
  return out;
}

function build() {
  const head = `${state.year ? state.year + "학년도 " : ""}${state.project || "○○"}`;
  const items = picked();
  const sum = total();
  const goods = items.filter(o => o.name.trim() !== "배송비");
  const first = state.label || goods[0]?.name || "○○";
  const itemLine = `${first}${goods.length > 1 ? ` 외 ${goods.length - 1}종` : ""}`;
  const vendor = (state.vendor || "").split(",").map(s => s.trim()).filter(Boolean).join(", ");
  const title = `${head} 물품 구입`;
  const L = [];
  if (state.fmt === "short") {
    L.push(`${head}에 필요한 물품을 다음과 같이 구입하고자 합니다.`);
    const sub = [`품목: ${itemLine}`, `금액: ${won(sum)}원`];
    if (vendor) sub.push(`시장조사처: ${vendor}.`);
    sub.forEach((t, i) => L.push(` ${i + 1}. ${t}`));
    L[L.length - 1] += "  끝.";
  } else {
    const refs = (state.refs || "").split("\n").map(s => s.trim()).filter(Boolean);
    if (refs.length === 1) L.push(`1. 관련: ${refs[0]}`);
    else if (refs.length > 1) { L.push("1. 관련"); refs.forEach((r, i) => L.push(`  ${LETTERS[i]}. ${r}`)); }
    L.push(`${refs.length ? 2 : 1}. ${head}에 필요한 물품을 다음과 같이 구입하고자 합니다.`);
    const sub = [`품목: ${itemLine}.`, `금액: 금${won(sum)}원(금${toKorean(sum)}원)`];
    if (vendor) sub.push(`시장조사처: ${vendor}.`);
    sub.forEach((t, i) => L.push(`  ${LETTERS[i]}. ${t}`));
    L.push("", "붙임  지출품의서 1부.  끝.");
  }
  return { title, body: L.join("\n"), sum };
}

function render() {
  const d = build();
  $("sum").textContent = won(d.sum);
  const all = goodItems();
  $("sumAll").textContent = won(all.reduce((a, o) => a + num(o.qty) * num(o.price), 0));
  $("allInfo").textContent = `${all.length}개 품목`;
  const g = goodItems(), sel = g.filter(o => o.sel).length, left = g.filter(o => !o.done).length;
  $("pickInfo").textContent = sel ? `체크한 ${sel}개만 넣어요` : (g.length && !left ? "모두 입력했어요" : `체크한 품목이 없어 아직 안 넣은 ${left}개를 넣어요`);
  $("pvTitle").textContent = d.title;
  $("pvBody").textContent = d.body;
}

$("budget").addEventListener("input", () => { state.budget = $("budget").value; save(); });
FIELDS.forEach(k => $(k).addEventListener("input", () => { state[k] = $(k).value; render(); save(); }));
$("pickLeft").onclick = () => { goodItems().forEach(o => o.sel = !o.done); drawRows(); render(); save(); };
$("pickNone").onclick = () => { state.items.forEach(o => o.sel = false); drawRows(); render(); save(); };
$("addRow").onclick = () => { state.items.push({ name: "", spec: "", qty: 1, unit: "개", price: 0 }); drawRows(); save(); };
$("clearAll").onclick = () => {
  state = { ...state, project: "", label: "", vendor: "", items: [], batches: {}, budget: "" };
  $("budget").value = "";
  FIELDS.forEach(k => $(k).value = state[k] ?? "");
  drawRows(); render(); save();
};

/* ---------- 상태 표시 ---------- */
function say(id, msg, kind) { const el = $(id); el.textContent = msg; el.className = "state" + (kind ? " " + kind : ""); }

/* ---------- ① 장바구니 읽기 (먼저 AI 없이, 안 되면 Claude API) ---------- */
const SHOPS = [
  [/coupang/, "쿠팡"], [/officedepot/, "오피스디포"], [/11st/, "11번가"], [/gmarket/, "G마켓"], [/auction/, "옥션"],
  [/ssg\.com/, "SSG닷컴"], [/smartstore|shopping\.naver|naver/, "네이버쇼핑"], [/kyobobook/, "교보문고"], [/yes24/, "예스24"],
  [/aladin/, "알라딘"], [/s2b/, "S2B"], [/alpha/, "알파문구"], [/lotteon/, "롯데온"], [/interpark/, "인터파크"], [/wemakeprice/, "위메프"], [/tmon/, "티몬"], [/i-?scream|iscream/, "아이스크림몰"]
];
const shopName = host => (SHOPS.find(([re]) => re.test(host)) || [, ""])[1];

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, spec: { type: "string" }, qty: { type: "number" },
          unit: { type: "string" }, price: { type: "number" }
        },
        required: ["name", "spec", "qty", "unit", "price"],
        additionalProperties: false
      }
    },
    shown_total: { type: "number" },
    vendor: { type: "string" },
    label: { type: "string" },
    project: { type: "string" }
  },
  required: ["items", "shown_total", "vendor", "label", "project"],
  additionalProperties: false
};

function prompt(page) {
  return `한국 초등학교 교사가 학교 물품을 사려고 온라인 쇼핑몰 장바구니(또는 상품) 페이지를 열어 두었습니다. 아래는 그 페이지에서 가져온 글자입니다. K-에듀파인 품의 등록에 쓸 정보를 뽑아 주세요.

규칙:
- 글자에 실제로 있는 값만 씁니다. 없는 값은 지어내지 말고 빈 문자열이나 0으로 둡니다.
- items: 장바구니에 담긴 상품만. 추천 상품, 광고, 최근 본 상품, 함께 사면 좋은 상품은 넣지 않습니다. 선택이 해제된 상품이 구분되면 빼고, 같은 상품이 두 번 나오면 한 번만 넣습니다.
- name: 쇼핑몰 상품명 그대로(브랜드·용량·개수 포함). "무료배송", "특가" 같은 광고 문구만 뺍니다.
- spec: 선택 옵션(색상, 크기 등). 없으면 "".
- qty: 주문 수량. unit: 개, 세트, 박스, 권, 대, 봉, 팩 중 알맞은 것(모르면 "개").
- price: 1개당 실제 결제 단가(원). 할인가가 있으면 할인가. 합계만 보이면 합계÷수량.
- 배송비가 0원이 아니면 name "배송비", qty 1, unit "건"인 품목으로 따로 넣습니다.
- shown_total: 페이지에 보이는 최종 결제 예정 금액(원). 없으면 0.
- vendor: 쇼핑몰 이름(예: "쿠팡"). 모르면 "".
- label: 기안문 "품목: ○○ 외 N종"에 쓸 첫 상품의 짧은 일반 명칭(예: "초코바", "볼펜").
- project: "○○에 필요한 물품을 구입하고자 합니다"의 ○○에 어울리는 짧은 말(예: "학급 환경 정비"). 이미 교사가 정한 사업 내용이 있으면 그대로 씁니다: "${state.project || ""}"

페이지 주소: ${page.host}
페이지 제목: ${page.title}

----- 페이지 글자 시작 -----
${page.text}
----- 페이지 글자 끝 -----`;
}

let readCtl = null;
async function callClaude(content, signal) {
  const opus = settings.model.startsWith("claude-opus");
  const body = {
    model: settings.model,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }]
  };
  const headers = {
    "content-type": "application/json",
    "x-api-key": settings.apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  };
  if (opus) { body.fallbacks = "default"; headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; }
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || "";
    if (res.status === 401) throw new Error("API 키가 맞지 않아요. 설정에서 키를 다시 확인해 주세요.");
    if (res.status === 429) throw new Error("요청이 많거나 사용 한도에 걸렸어요. 잠시 뒤 다시 눌러 주세요.");
    if (res.status === 400 && /credit|balance/i.test(msg)) throw new Error("Anthropic 계정의 크레딧이 부족해요. 콘솔에서 충전해 주세요.");
    if (res.status >= 500) throw new Error("AI 서버가 잠시 바빠요. 조금 뒤 다시 눌러 주세요.");
    throw new Error(`AI 요청이 거절됐어요 (${res.status}). ${msg}`);
  }
  if (data.stop_reason === "refusal") throw new Error("AI가 이 페이지 내용을 처리하지 않았어요. 장바구니 부분만 드래그해서 다시 해 보세요.");
  if (data.stop_reason === "max_tokens") throw new Error("품목이 너무 많아 다 읽지 못했어요. 장바구니를 나눠서(드래그) 읽어 주세요.");
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(text);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// 읽은 품목을 표에 넣는다 (새로 채우기 / 덧붙이기)
function applyItems(items, host, extra) {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const replace = mode === "replace";
  const sum = items.reduce((a, o) => a + o.qty * o.price, 0);
  // 새 품목만: 표에 이미 있는 품목(이름·규격이 같은 것)은 뺀다
  const key = o => (o.name + "|" + (o.spec || "")).replace(/\s+/g, "").toLowerCase();
  const have = new Set(goodItems().map(key));
  const add = mode === "new" ? items.filter(o => !have.has(key(o))) : items;
  extra.skipped = items.length - add.length;
  state.items = replace ? add : goodItems().concat(add);
  if (extra.label && (replace || !state.label)) state.label = extra.label;
  if (!state.project && extra.project) state.project = extra.project;
  const shop = shopName(host) || extra.vendor;
  if (shop) {
    const list = replace ? [] : state.vendor.split(",").map(s => s.trim()).filter(Boolean);
    if (!list.includes(shop)) list.push(shop);
    state.vendor = list.join(", ");
  }
  FIELDS.forEach(k => $(k).value = state[k] ?? "");
  drawRows(); render(); save();
  return sum;
}
const skipMsg = extra => extra.skipped ? ` 이미 표에 있던 ${extra.skipped}개는 뺐어요.` : "";

// AI 없이(무료) 읽기: rules.js를 장바구니 페이지에 넣어 실행한다
async function readByRules(tab) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["rules.js"] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => pumuiReadCart() });
  return r.result || { items: [] };
}

$("readCart").onclick = async () => {
  const tab = await activeTab();
  if (!tab || !/^https?:/.test(tab.url || "")) { say("readState", "쇼핑몰 장바구니 화면을 연 탭에서 눌러 주세요.", "err"); return; }
  const host = new URL(tab.url).hostname;

  // 1) 먼저 AI 없이 읽어 본다
  let rules = null;
  try { rules = await readByRules(tab); } catch (e) {
    say("readState", "이 페이지는 읽을 수 없어요. 크롬 설정 화면이나 웹스토어가 아닌 쇼핑몰 화면에서 눌러 주세요.", "err"); return;
  }
  const ruleItems = (rules.items || []).map(o => ({
    name: String(o.name || "").trim(), spec: String(o.spec || "").trim(),
    qty: num(o.qty) || 1, unit: String(o.unit || "개").trim(), price: num(o.price)
  })).filter(o => o.name && o.price);
  if (ruleItems.length) {
    // 배송비는 쇼핑몰마다 따로 붙으므로 규격에 쇼핑몰 이름을 적어 구분한다
    if (rules.shipping > 0) ruleItems.push({ name: "배송비", spec: shopName(host), qty: 1, unit: "건", price: rules.shipping });
    const extra = {};
    const sum = applyItems(ruleItems, host, extra);
    const n = ruleItems.filter(o => o.name !== "배송비").length;
    const shownOk = (rules.pagePrices || []).includes(sum);
    const tips = (rules.notes || []).length ? " 확인할 것: " + rules.notes.join(" / ") : "";
    say("readState", `AI 없이 품목 ${n}개를 읽었어요 (합계 ${won(sum)}원${rules.shipping > 0 ? ", 배송비 포함" : ""}).` +
      (shownOk ? " 화면의 금액과 같아요." : " 화면의 결제 금액과 같은지 꼭 확인해 주세요.") + skipMsg(extra) + tips, shownOk ? "ok" : "err");
    return;
  }

  // 2) 못 읽었으면 AI (설정에 키가 있을 때만)
  if (!settings.apiKey) {
    say("readState", "이 화면은 AI 없이 읽지 못했어요. 장바구니 화면이 맞는지 확인해 주세요. 품목을 직접 적거나, 아래 'AI 없이 읽기 준비'로 화면 구조를 저장해 Claude에게 보내 주세요. (설정에 AI 키를 넣으면 AI로도 읽을 수 있어요.)", "err");
    return;
  }
  let page;
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ host: location.hostname, title: document.title, sel: String(getSelection() || ""), text: document.body ? document.body.innerText : "" })
    });
    page = r.result;
  } catch (e) { say("readState", "이 페이지는 읽을 수 없어요. 크롬 설정 화면이나 웹스토어가 아닌 쇼핑몰 화면에서 눌러 주세요.", "err"); return; }

  const useSel = page.sel.trim().length > 30;
  let text = (useSel ? page.sel : page.text).replace(/\n{3,}/g, "\n\n");
  const LIMIT = 60000;
  let note = useSel ? "드래그한 부분만 읽었어요. " : "";
  if (text.length > LIMIT) { text = text.slice(0, LIMIT); note += "페이지가 길어서 앞부분만 읽었어요. 빠진 품목이 있으면 장바구니 부분만 드래그하고 다시 읽어 주세요. "; }

  readCtl = new AbortController();
  $("readCart").disabled = true; $("stopRead").hidden = false;
  say("readState", "AI가 장바구니를 읽는 중이에요…");
  try {
    const r = await callClaude(prompt({ ...page, text }), readCtl.signal);
    const items = (r.items || []).map(o => ({
      name: String(o.name || "").trim(), spec: String(o.spec || "").trim(),
      qty: num(o.qty) || 1, unit: String(o.unit || "개").trim(), price: num(o.price)
    })).filter(o => o.name);
    if (!items.length) { say("readState", note + "장바구니 품목을 찾지 못했어요. 장바구니 화면인지 확인해 주세요.", "err"); return; }
    const sum = applyItems(items, page.host, r);
    const sk = skipMsg(r);
    const shown = num(r.shown_total);
    if (shown && shown !== sum) say("readState", note + `AI로 품목 ${items.length}개를 읽었어요 (합계 ${won(sum)}원). 화면의 결제 금액은 ${won(shown)}원이라 차이가 있어요. 할인·배송비를 확인해 주세요.` + sk, "err");
    else say("readState", note + `AI로 품목 ${items.length}개를 읽었어요 (합계 ${won(sum)}원). 수량과 단가를 한 번 확인해 주세요.` + sk, "ok");
  } catch (e) {
    if (e.name === "AbortError") say("readState", "멈췄어요.");
    else say("readState", e.message || "읽는 중 문제가 생겼어요. 다시 눌러 주세요.", "err");
  } finally {
    $("readCart").disabled = false; $("stopRead").hidden = true;
  }
};
$("stopRead").onclick = () => readCtl?.abort();

/* ---------- ③ 에듀파인에 넣기 ---------- */
async function focusedFrame(tab) {
  // 이미 열려 있던 페이지에도 넣기 기능이 붙도록 한 번 더 심는다(중복은 content.js가 막음).
  await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] }).catch(() => {});
  const res = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => (window.__pumuiLastFocus ? window.__pumuiLastFocus() : 0)
  }).catch(() => []);
  const best = res.filter(r => r.result > 0).sort((a, b) => b.result - a.result)[0];
  return best ? best.frameId : null;
}

// 에듀파인(넥사크로) 화면이면 페이지 안쪽에서 표·칸의 데이터에 직접 넣는다
async function focusInfo() {
  const tab = await activeTab();
  if (!tab) return null;
  const frameId = await focusedFrame(tab);
  if (frameId === null) return null;
  const r = await chrome.tabs.sendMessage(tab.id, { type: "focusInfo" }, { frameId }).catch(() => null);
  return r && r.id ? { tab, frameId, id: r.id } : null;
}
async function nexa(fi, fn, args) {
  const target = { tabId: fi.tab.id, frameIds: [fi.frameId] };
  await chrome.scripting.executeScript({ target, world: "MAIN", files: ["nexa.js"] });
  const [r] = await chrome.scripting.executeScript({ target, world: "MAIN", func: (fn, args) => window.__pumuiNexa[fn](...args), args: [fn, args] });
  return r && r.result;
}
const nexaPath = id => /^mainframe\./.test(id) ? id : "";
async function nexaText(text) {
  try {
    const fi = await focusInfo();
    if (!fi || !nexaPath(fi.id)) return;
    const path = fi.id.replace(/:(input|textarea)$/, "").replace(/\.(comboedit|calendaredit)$/, "");
    await nexa(fi, "setText", [path, text]);
  } catch (e) {}
}

async function sendFill(msg, label) {
  const tab = await activeTab();
  if (!tab) return;
  const frameId = await focusedFrame(tab);
  if (frameId === null) { say("fillState", `에듀파인 화면에서 ${label} 칸을 먼저 한 번 클릭한 뒤 눌러 주세요.`, "err"); return null; }
  try {
    return await chrome.tabs.sendMessage(tab.id, msg, { frameId });
  } catch (e) {
    say("fillState", "에듀파인 화면과 연결하지 못했어요. 에듀파인 탭을 새로고침(F5)하고 다시 해 주세요.", "err");
    return null;
  }
}

$("fillTitle").onclick = async () => {
  const r = await sendFill({ type: "fillText", text: build().title }, "제목");
  if (r && r.ok) await nexaText(build().title);
  if (r) r.ok ? say("fillState", "제목을 넣었어요.", "ok") : say("fillState", "제목을 넣지 못했어요. 제목 칸을 다시 클릭하고 눌러 주세요.", "err");
};
$("fillBody").onclick = async () => {
  const r = await sendFill({ type: "fillBody", text: build().body }, "본문");
  if (r && r.ok) await nexaText(build().body);
  if (r) r.ok ? say("fillState", "본문을 넣었어요. 줄 바꿈과 띄어쓰기가 맞는지 확인해 주세요.", "ok") : say("fillState", "본문을 넣지 못했어요. 본문 칸 안을 클릭하고 다시 눌러 주세요.", "err");
};
$("fillGrid").onclick = async () => {
  const list = picked();
  const rows = list.map(o => [o.name, o.spec, String(num(o.qty)), o.unit, String(num(o.price)), String(num(o.qty) * num(o.price))]);
  if (!rows.length) { say("fillState", "넣을 품목이 없어요.", "err"); return; }
  let r = null;
  // 에듀파인 표: 데이터에 직접 넣기 (화면에 안 보이는 줄도 넣을 수 있음). 안 되면 칸 클릭 방식으로.
  try {
    const fi = await focusInfo();
    if (fi && nexaPath(fi.id) && fi.id.includes(".body.")) {
      const rep = await nexa(fi, "fill", [fi.id.split(".body.")[0], rows, ["내용", "규격", "수량", "단위", "예상단가", "예상금액"]]);
      if (rep && rep.ok) r = { ok: true, report: rep };
      // '이번 예산 이름'을 비워 두었으면 에듀파인에서 선택된 예산을 읽어 채운다
      if (rep && rep.ok && !$("budget").value.trim()) {
        const name = await nexa(fi, "budgetName", [fi.id.split(".body.")[0]]).catch(() => "");
        if (name) { $("budget").value = name; state.budget = name; }
      }
      else if (rep && rep.byNexa && rep.failed && rep.failed.length) r = { ok: false, report: rep }; // 표는 찾았지만 줄을 못 만든 경우: 그 이유를 그대로 보여 준다
    }
  } catch (e) {}
  if (!r) r = await sendFill({ type: "fillGrid", rows }, "품목내역 첫 줄 '내용'");
  if (!r) return;
  const rep = r.report || {};
  // 넣은 품목은 'N차 입력함'으로 표시하고 체크를 푼다 → 다음 예산은 새로 체크한 품목만
  if (r.ok && rep.done > 0) {
    const batch = Math.max(0, ...state.items.map(o => o.done || 0)) + 1;
    const budget = ($("budget").value || "").trim();
    const day = new Date().toISOString().slice(0, 10);
    const d = build();
    state.batches = state.batches || {};
    state.batches[batch] = { budget, title: d.title, day };
    const doneList = list.slice(0, rep.done);
    addHistory({ day, time: new Date().toTimeString().slice(0, 5), budget, title: d.title, body: d.body, vendor: state.vendor || "",
      items: doneList.map(o => ({ name: o.name, spec: o.spec || "", qty: num(o.qty), unit: o.unit, price: num(o.price) })),
      sum: doneList.reduce((a, o) => a + num(o.qty) * num(o.price), 0) });
    doneList.forEach(o => { o.done = batch; o.sel = false; o.budget = budget; o.day = day; });
    $("budget").value = ""; state.budget = "";
    drawRows(); render(); save();
  }
  if (r.ok && !rep.failed?.length) say("fillState", `품목 ${rep.done}줄을 넣고 '입력함'으로 표시했어요. 예상금액과 합계를 확인해 주세요. 다른 예산은 품목을 새로 체크해서 넣으세요.`, "ok");
  else if (r.ok) say("fillState", `품목 ${rep.done}줄을 넣었어요. 직접 확인할 곳: ${rep.failed.join(" / ")}`, "err");
  else say("fillState", (rep.failed?.length ? rep.failed.join(" / ") + ". " : "") + "품목내역을 넣지 못했어요. 아래 '잘 안 들어갈 때'의 진단 파일을 보내 주시면 맞춰 고칠게요.", "err");
};

/* ---------- ④ 지난 품의 (이 컴퓨터 크롬에 계속 남는 기록) ---------- */
let history = [];
const histSel = new Set(); // 삭제하려고 체크한 지난 품의
async function loadHistory() {
  const got = await chrome.storage.local.get(["history"]);
  history = Array.isArray(got.history) ? got.history : [];
  drawHistory();
}
function saveHistory() { chrome.storage.local.set({ history }); drawHistory(); }
function addHistory(h) { history.unshift({ id: Date.now(), ...h }); saveHistory(); }
const esc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function drawHistory() {
  const q = ($("histFind").value || "").trim();
  const shown = history.filter(h => !q || [h.budget, h.title, h.vendor, ...h.items.map(i => i.name)].join(" ").includes(q));
  $("histCount").textContent = history.length ? `(${history.length}건)` : "";
  updHistDel();
  const box = $("histList");
  if (!shown.length) { box.innerHTML = `<p class="hint">${history.length ? "찾는 품의가 없어요." : "아직 기록이 없어요. 품목내역을 넣으면 여기에 남아요."}</p>`; return; }
  box.innerHTML = shown.map(h => {
    const goods = h.items.filter(i => i.name !== "배송비");
    return `<details class="hist" data-id="${h.id}"><summary><input type="checkbox" class="hsel" title="삭제할 품의로 선택"${histSel.has(h.id) ? " checked" : ""}> <span class="hd">${esc(h.day)}</span> ${esc(h.budget || "예산 이름 없음")} · <b>${won(h.sum)}원</b><br><small>${esc(goods[0]?.name || h.items[0]?.name || "")}${goods.length > 1 ? ` 외 ${goods.length - 1}종` : ""}</small></summary>
      <div class="hbody"><div class="ht">${esc(h.title)}</div>
      <table><thead><tr><th>내용</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>${h.items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.spec)}</td><td class="n">${i.qty}${esc(i.unit)}</td><td class="n">${won(i.price)}</td><td class="n">${won(i.qty * i.price)}</td></tr>`).join("")}</tbody></table>
      <pre>${esc(h.body)}</pre>
      <div class="btns"><button data-act="load">표로 다시 불러오기</button><button data-act="copy">본문 복사</button><button data-act="del">기록 삭제</button></div></div></details>`;
  }).join("");
}
$("histFind").addEventListener("input", drawHistory);
function updHistDel() {
  [...histSel].forEach(id => { if (!history.some(h => h.id === id)) histSel.delete(id); });
  const allSum = history.reduce((a, h) => a + (h.sum || 0), 0);
  $("histSum").textContent = history.length ? `전체 합계 ${won(allSum)}원 (${history.length}건)` : "";
  const b = $("histDel");
  b.disabled = !histSel.size;
  b.textContent = histSel.size ? `선택한 ${histSel.size}건 삭제` : "선택한 품의 삭제";
  delete b.dataset.sure;
}
$("histList").addEventListener("change", e => {
  if (!e.target.classList.contains("hsel")) return;
  const id = Number(e.target.closest(".hist").dataset.id);
  e.target.checked ? histSel.add(id) : histSel.delete(id);
  updHistDel();
});
$("histAll").onclick = () => {
  const ids = [...$("histList").querySelectorAll(".hist")].map(d => Number(d.dataset.id));
  const all = ids.length && ids.every(id => histSel.has(id));
  ids.forEach(id => all ? histSel.delete(id) : histSel.add(id));
  drawHistory();
};
$("histDel").onclick = () => {
  const b = $("histDel");
  if (!histSel.size) return;
  if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = `정말 ${histSel.size}건을 지울까요? 한 번 더 누르세요`; return; }
  history = history.filter(h => !histSel.has(h.id));
  histSel.clear();
  saveHistory();
};
$("histList").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = Number(btn.closest(".hist").dataset.id);
  const h = history.find(x => x.id === id);
  if (!h) return;
  if (btn.dataset.act === "load") {
    state.items = h.items.map(i => ({ ...i, sel: false, done: 0 }));
    if (h.vendor) state.vendor = h.vendor;
    FIELDS.forEach(k => $(k).value = state[k] ?? "");
    drawRows(); render(); save();
    btn.textContent = "불러왔어요 ✓";
  } else if (btn.dataset.act === "copy") {
    await navigator.clipboard.writeText(h.body).then(() => btn.textContent = "복사했어요 ✓", () => btn.textContent = "복사 못 함");
  } else if (btn.dataset.act === "del") {
    if (btn.dataset.sure) { history = history.filter(x => x.id !== id); saveHistory(); }
    else { btn.dataset.sure = "1"; btn.textContent = "한 번 더 누르면 삭제"; }
  }
});
$("histXlsx").onclick = () => {
  if (!history.length) return;
  const rows = [];
  [...history].reverse().forEach(h => h.items.forEach(i => rows.push([h.day, h.budget || "", h.title, i.name, i.spec, i.qty, i.unit, i.price, i.qty * i.price, h.vendor || ""])));
  const ws = XLSX.utils.aoa_to_sheet([["날짜", "예산", "기안 제목", "내용", "규격", "수량", "단위", "단가", "금액", "시장조사처"], ...rows]);
  ws["!cols"] = [{ wch: 11 }, { wch: 20 }, { wch: 34 }, { wch: 40 }, { wch: 14 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  const ws2 = XLSX.utils.aoa_to_sheet([["날짜", "예산", "기안 제목", "품목 수", "금액"], ...[...history].reverse().map(h => [h.day, h.budget || "", h.title, h.items.length, h.sum])]);
  ws2["!cols"] = [{ wch: 11 }, { wch: 20 }, { wch: 34 }, { wch: 8 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws2, "품의별");
  XLSX.utils.book_append_sheet(wb, ws, "품목별");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(`지난품의_${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
};

/* ---------- 엑셀 / 진단 ---------- */
function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("xlsx").onclick = () => {
  const rows = picked().map(o => [o.name, o.spec, num(o.qty), o.unit, num(o.price), num(o.qty) * num(o.price)]);
  const ws = XLSX.utils.aoa_to_sheet([["내용", "규격", "수량", "단위", "예상단가", "예상금액"], ...rows]);
  ws["!cols"] = [{ wch: 44 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "품목내역");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(`품목내역_${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  say("fillState", "엑셀을 받았어요. 에듀파인 품목내역의 [파일 ↑]로 올려 주세요.", "ok");
};
// 품의 목록 엑셀: 품목마다 몇 차·어느 예산에 넣었는지, 차수별 합계
$("exportList").onclick = () => {
  const g = goodItems();
  if (!g.length) { say("fillState", "표에 품목이 없어요.", "err"); return; }
  const B = state.batches || {};
  const order = [...g].sort((a, b) => (a.done || 1e9) - (b.done || 1e9));
  const list = order.map(o => [o.done ? `${o.done}차` : "미입력", o.budget || B[o.done]?.budget || "", o.name, o.spec || "", num(o.qty), o.unit, num(o.price), num(o.qty) * num(o.price), o.day || ""]);
  const ws1 = XLSX.utils.aoa_to_sheet([["차수", "예산", "내용", "규격", "수량", "단위", "단가", "금액", "입력일"], ...list,
    ["", "", "합계", "", "", "", "", g.reduce((a, o) => a + num(o.qty) * num(o.price), 0), ""]]);
  ws1["!cols"] = [{ wch: 7 }, { wch: 22 }, { wch: 44 }, { wch: 16 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 11 }];
  const groups = {};
  g.forEach(o => { const k = o.done || 0; (groups[k] = groups[k] || []).push(o); });
  const sumRows = Object.keys(groups).map(Number).sort((a, b) => (a || 1e9) - (b || 1e9)).map(k => {
    const its = groups[k], goods = its.filter(o => o.name !== "배송비");
    return [k ? `${k}차` : "미입력", (k && (B[k]?.budget || its[0].budget)) || "", (k && B[k]?.title) || "",
      `${goods[0]?.name || its[0].name}${goods.length > 1 ? ` 외 ${goods.length - 1}종` : ""}`, its.length,
      its.reduce((a, o) => a + num(o.qty) * num(o.price), 0), (k && B[k]?.day) || ""];
  });
  const ws2 = XLSX.utils.aoa_to_sheet([["차수", "예산", "기안 제목", "품목", "줄 수", "금액", "입력일"], ...sumRows]);
  ws2["!cols"] = [{ wch: 7 }, { wch: 22 }, { wch: 36 }, { wch: 40 }, { wch: 6 }, { wch: 12 }, { wch: 11 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "품의목록");
  XLSX.utils.book_append_sheet(wb, ws2, "차수별합계");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  download(`품의목록_${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  say("fillState", "품의 목록 엑셀을 저장했어요.", "ok");
};
$("diag").onclick = async () => {
  const tab = await activeTab();
  if (!tab) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content.js"] }).catch(() => {});
  const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => location.href }).catch(() => []);
  const out = [];
  for (const f of frames) {
    try { const r = await chrome.tabs.sendMessage(tab.id, { type: "diagnose" }, { frameId: f.frameId }); if (r?.ok) out.push({ frameId: f.frameId, ...r.data }); }
    catch (e) { out.push({ frameId: f.frameId, error: "읽지 못함" }); }
  }
  download("에듀파인_화면진단.json", new Blob([JSON.stringify({ made: new Date().toISOString(), frames: out }, null, 1)], { type: "application/json" }));
  say("fillState", "진단 파일을 저장했어요. Claude 대화창에 올려 주세요.", "ok");
};

$("cartDiag").onclick = async () => {
  const tab = await activeTab();
  if (!tab || !/^https?:/.test(tab.url || "")) { say("readState", "쇼핑몰 장바구니 탭에서 눌러 주세요.", "err"); return; }
  let r;
  try {
    [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = getSelection();
        if (!sel || sel.isCollapsed || String(sel).trim().length < 20) return { none: true };
        let root = sel.getRangeAt(0).commonAncestorContainer;
        if (root.nodeType !== 1) root = root.parentElement;
        const keep = /^(class|id|name|type|value|role|aria-label|title|data-[\w-]+)$/;
        const clone = root.cloneNode(true);
        clone.querySelectorAll("script,style,svg,img,iframe,noscript,link,video,picture,canvas").forEach(n => n.remove());
        const walk = el => {
          [...el.attributes].forEach(a => { if (!keep.test(a.name)) el.removeAttribute(a.name); });
          if (el.tagName === "INPUT" && el.type !== "hidden") el.setAttribute("value", el.value);
          [...el.children].forEach(walk);
        };
        walk(clone);
        return { host: location.hostname, path: location.pathname, title: document.title, text: String(sel).slice(0, 20000), html: clone.outerHTML.slice(0, 400000) };
      }
    });
  } catch (e) { say("readState", "이 페이지는 읽을 수 없어요.", "err"); return; }
  if (r.result.none) { say("readState", "장바구니 상품 부분을 먼저 마우스로 드래그해 선택해 주세요.", "err"); return; }
  download(`장바구니구조_${r.result.host}.json`, new Blob([JSON.stringify(r.result, null, 1)], { type: "application/json" }));
  say("readState", "장바구니 구조 파일을 저장했어요. Claude 대화창에 올려 주세요.", "ok");
};

/* ---------- 설정 ---------- */
$("saveKey").onclick = async () => {
  settings.apiKey = $("apiKey").value.trim();
  settings.model = $("model").value;
  await chrome.storage.local.set({ settings });
  say("keyState", settings.apiKey ? "저장했어요." : "키를 지웠어요.", "ok");
};

loadAll();
