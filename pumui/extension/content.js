// 모든 페이지(프레임 포함)에서 돈다.
// 1) 마지막으로 클릭한 입력 칸을 기억한다.
// 2) 옆 창의 요청을 받아 그 칸에 제목·본문·품목내역을 넣는다.
// 3) 에듀파인 화면 구조를 진단용으로 정리한다 (값은 담지 않음).
(() => {
  if (window.__pumuiLoaded) return;
  window.__pumuiLoaded = true;

  const S = { el: null, t: 0, click: null, ct: 0 };

  const isEditable = el =>
    !!el && (
      el.isContentEditable ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|file|hidden|image)$/i.test(el.type))
    );

  document.addEventListener("focusin", e => {
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (isEditable(el)) { S.el = el; S.t = Date.now(); }
  }, true);
  // 에듀파인 표는 첫 클릭에 칸만 '선택'하고 입력칸은 아직 열지 않는다.
  // 그래서 클릭한 곳도 기억해 둔다 (이름(id)이 있는 가장 가까운 요소).
  document.addEventListener("pointerdown", e => {
    let el = e.composedPath ? e.composedPath()[0] : e.target;
    while (el && el.nodeType === 1 && !el.id) el = el.parentElement;
    if (el && el.nodeType === 1) { S.click = el; S.ct = Date.now(); }
  }, true);

  const visible = el => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  // React·그리드 같은 화면도 값을 알아채도록 브라우저 기본 setter로 넣는다.
  function setValue(el, value) {
    value = value == null ? "" : String(value);
    if (el.tagName === "SELECT") {
      const opts = [...el.options];
      const hit = opts.find(o => o.text.trim() === value) ||
                  opts.find(o => o.value === value) ||
                  opts.find(o => value && o.text.includes(value));
      if (!hit) return false;
      el.value = hit.value;
      fire(el, "input"); fire(el, "change");
      return true;
    }
    if (el.isContentEditable) {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, value);
      return true;
    }
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    fire(el, "input"); fire(el, "change");
    el.dispatchEvent(new FocusEvent("blur")); el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    return true;
  }

  // 본문: 편집기(contenteditable)면 줄과 띄어쓰기를 살려 HTML로, 일반 칸이면 글자로 넣는다.
  function insertBody(el, text) {
    if (el.isContentEditable) {
      el.focus();
      const html = text.split("\n").map(line =>
        "<p>" + (line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/^ +| {2,}/g, m => "&nbsp;".repeat(m.length)) || "<br>") + "</p>"
      ).join("");
      const ok = document.execCommand("insertHTML", false, html);
      if (!ok) document.execCommand("insertText", false, text);
      return true;
    }
    return setValue(el, text);
  }

  // 같은 줄(행)에서 값을 넣을 수 있는 칸들
  function rowOf(el) {
    return el.closest("tr, [role='row'], .grid-row, li") || el.parentElement;
  }
  function cellsIn(row) {
    return [...row.querySelectorAll("input, select, textarea, [contenteditable='true']")]
      .filter(c => isEditable(c) && visible(c) && !c.readOnly && !c.disabled);
  }
  // 다음 줄: 입력칸이 있고 아직 비어 있는 줄 (이미 적힌 줄은 건너뛴다)
  function nextRow(row) {
    let r = row.nextElementSibling;
    while (r && (!cellsIn(r).length || cellsIn(r).some(c => c.tagName !== "SELECT" && (c.value || "").trim() && !/^\d+$/.test((c.value || "").trim())))) r = r.nextElementSibling;
    if (r) r.scrollIntoView({ block: "nearest", inline: "nearest" });
    return r;
  }
  // [행추가] 버튼 누르기. 글자·툴팁·그림 설명(alt)까지 보고, 같은 사이트의 다른 프레임도 찾는다.
  // 버튼이 여러 개면 품목내역 표에 가장 가까운 것을 누른다.
  const ADD = /행\s*추가|추가\s*행|^\+\s*행|row\s*add|add\s*row|addrow|insertrow/i;
  function sameSiteDocs() {
    const docs = [];
    const walk = w => {
      try { if (!w.document || docs.includes(w.document)) return; docs.push(w.document); } catch (e) { return; }
      for (let i = 0; i < w.frames.length; i++) walk(w.frames[i]);
    };
    try { walk(window.top); } catch (e) {}
    if (!docs.includes(document)) docs.unshift(document);
    return docs;
  }
  const labelOf = b => [b.innerText, b.value, b.title, b.getAttribute && b.getAttribute("aria-label"), b.alt,
    ...[...(b.querySelectorAll ? b.querySelectorAll("img[alt], [title]") : [])].map(i => i.alt || i.title)]
    .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  function clickAddRow(near) {
    const cands = [];
    for (const d of sameSiteDocs()) {
      for (const b of d.querySelectorAll("button, a, input[type=button], input[type=image], img, span, div, li")) {
        if (!b.getClientRects().length) continue;
        const t = labelOf(b);
        if (t && t.length < 15 && ADD.test(t) && !/삭제/.test(t)) cands.push(b);
        else if ((b.id || "") && /add_?row|row_?add|btn_?add|insertrow/i.test(b.id)) cands.push(b);
      }
    }
    let inner = cands.filter(c => !cands.some(d => d !== c && c.contains(d)));
    // 바깥 칸과 안쪽 버튼이 둘 다 잡히면 안쪽(실제 버튼)을 쓴다
    if (!inner.length) return false;
    let b = inner[0];
    if (near) {
      // 프레임이 달라도 화면 전체 기준 위치로 비교한다. 표보다 위에 있고 가까운 버튼을 고른다.
      const abs = el => {
        const r = el.getBoundingClientRect(); let x = r.left, y = r.top;
        try { for (let w = el.ownerDocument.defaultView; w && w.frameElement; w = w.parent) { const f = w.frameElement.getBoundingClientRect(); x += f.left; y += f.top; } } catch (e) {}
        return { x, y };
      };
      const g = abs(near);
      const dist = c => { const p = abs(c); return (p.y > g.y + 5 ? 5000 : 0) + Math.abs(g.y - p.y) + Math.abs(g.x - p.x) / 8; };
      // 다른 표(예: 위쪽 예산내역)의 [행추가]를 누르지 않도록, 표 바로 위(200px 안)에 있는 것만 쓴다
      inner = inner.filter(c => { const p = abs(c); return p.y <= g.y + 5 && g.y - p.y < 200; });
      if (!inner.length) return false;
      inner.sort((x, y) => dist(x) - dist(y));
      b = inner[0];
    } else b = inner.find(c => /^(BUTTON|A|INPUT)$/.test(c.tagName)) || inner[0];
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const w = b.ownerDocument.defaultView;
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) b.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true, view: w, clientX: x, clientY: y, button: 0 }));
    b.click();
    return true;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 표 머리글(내용·규격·수량…)의 가로 위치를 찾아, 각 줄에서 같은 위치의 칸에 값을 넣는다.
  // 머리글을 못 찾으면 클릭한 칸부터 왼쪽→오른쪽 순서대로 넣는다.
  const HEAD = ["내용", "규격", "수량", "단위", "예상단가", "예상금액"];
  const norm = s => (s || "").replace(/[\s*※]/g, "");
  function findHeaders(start) {
    const top = start.getBoundingClientRect().top;
    let scope = start;
    for (let up = 0; up < 10 && scope.parentElement; up++) {
      scope = scope.parentElement;
      const found = {};
      for (const h of scope.querySelectorAll("th, td, div, span, [role='columnheader']")) {
        if (h.children.length > 2) continue;
        const t = norm(h.innerText);
        const k = HEAD.indexOf(t);
        if (k < 0 || !visible(h)) continue;
        const r = h.getBoundingClientRect();
        if (r.bottom > top + 2) continue;
        if (!found[k] || r.bottom > found[k].bottom) found[k] = r;
      }
      if (found[0] && found[2] && Object.keys(found).length >= 3) return found;
    }
    return null;
  }
  function cellsByHeader(row, heads) {
    const cells = cellsIn(row);
    return HEAD.map((_, k) => {
      const h = heads[k];
      if (!h) return null;
      return cells.find(c => { const r = c.getBoundingClientRect(); const cx = r.left + r.width / 2; return cx >= h.left - 2 && cx <= h.right + 2; }) || null;
    });
  }

  // ----- 화면 좌표로 칸을 여는 방식 -----
  // 에듀파인 같은 그리드는 클릭한 칸에만 입력칸이 생긴다. 그래서 머리글의 가로 위치와
  // 줄의 세로 위치로 칸을 찾아 클릭(필요하면 더블클릭)해 입력칸을 연 뒤 값을 넣는다.
  const inside = (el, x, y, pad = 3) => { const r = el.getBoundingClientRect(); return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad; };
  function editorAt(x, y) {
    const a = document.activeElement;
    if (a && isEditable(a) && visible(a) && !a.readOnly && inside(a, x, y)) return a;
    return [...document.querySelectorAll("input, select, textarea, [contenteditable='true']")]
      .find(c => isEditable(c) && visible(c) && !c.readOnly && !c.disabled && inside(c, x, y)) || null;
  }
  function under(x, y, skip) {
    const old = skip ? skip.style.pointerEvents : null;
    if (skip) skip.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    if (skip) skip.style.pointerEvents = old;
    return el;
  }
  function mouse(el, type, x, y) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, detail: type === "dblclick" ? 2 : 1 }));
  }
  async function openCell(x, y) {
    let ed = editorAt(x, y);
    if (ed) return ed;
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) mouse(el, t, x, y);
    await wait(150);
    if ((ed = editorAt(x, y))) return ed;
    mouse(el, "dblclick", x, y);
    await wait(250);
    if ((ed = editorAt(x, y))) return ed;
    // 클릭으로 칸이 '선택'만 되는 그리드: 글자 키를 눌러 입력을 시작하게 한다
    const t = document.activeElement || el;
    t.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "F2", code: "F2", keyCode: 113 }));
    await wait(200);
    return editorAt(x, y);
  }
  const rowLike = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const h = e.getBoundingClientRect().height;
      if (h > 80) return null;
      if (e.tagName === "TR" || e.getAttribute("role") === "row" || /(^|[\s_-])(row|tr)([\s_-]|$)|grid.?row|row\d/i.test(typeof e.className === "string" ? e.className : "")) return e;
    }
    return null;
  };

  // 스크롤되는 상자(표 본문) 찾기
  function scroller(el) {
    for (let e = el && el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2) return e;
    }
    return document.scrollingElement;
  }
  // 줄 안에서 x 위치(내용 칸)에 있는 글자
  function textAtX(row, x) {
    let out = "";
    for (const e of row.querySelectorAll("*")) {
      const r = e.getBoundingClientRect();
      if (!r.width || x < r.left || x > r.right) continue;
      if (e.matches("input, textarea, select")) { out += e.value || ""; continue; }
      if (!e.children.length) out += e.textContent || "";
    }
    return out.trim();
  }
  // 같은 종류의 줄: 태그가 같고 높이가 비슷한 것 (선택된 줄·홀짝 줄은 class가 달라도 같은 줄로 본다)
  const sameKind = (r, row0) => r && r.nodeType === 1 && r.tagName === row0.tagName && r.getClientRects().length > 0 &&
    Math.abs(r.getBoundingClientRect().height - row0.getBoundingClientRect().height) < 6;

  async function fillGridPoint(start, heads, rows, report) {
    const cx = k => (heads[k].left + heads[k].right) / 2;
    const sr = start.getBoundingClientRect();
    let y = sr.top + sr.height / 2;
    const cell0 = under(cx(0), y, start) || start;
    const row0 = rowLike(cell0) || rowLike(start);
    const rowH = row0 ? row0.getBoundingClientRect().height : (cell0.getBoundingClientRect().height > 8 && cell0.getBoundingClientRect().height < 60 ? cell0.getBoundingClientRect().height : sr.height + 2);
    const box = row0 ? row0.parentElement : null;
    report.byPoint = true;

    // 다음 빈 줄: 아래 줄들 → 스크롤해서 더 찾기 → [행추가]
    const emptyRows = () => box ? [...box.children].filter(r => sameKind(r, row0) && !used.has(r) && !textAtX(r, cx(0))) : [];
    const used = new Set();
    async function nextEmpty() {
      let c = emptyRows();
      if (c.length) return c[0];
      const sc = scroller(row0 || start);
      for (let tries = 0; tries < 30 && sc; tries++) {
        const before = sc.scrollTop;
        sc.scrollTop += Math.max(rowH * 3, sc.clientHeight * 0.6);
        await wait(250);
        if ((c = emptyRows()).length) { report.scrolled = true; return c[0]; }
        if (sc.scrollTop === before) break; // 끝까지 내려감
      }
      if (clickAddRow(box || row0 || start)) {
        report.addedRows++;
        await wait(700);
        if (sc) { sc.scrollTop = sc.scrollHeight; await wait(250); }
        if ((c = emptyRows()).length) return c[0];
      }
      return null;
    }

    let cur = row0;
    if (cur) used.add(cur);
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) {
        if (box) {
          const r = await nextEmpty();
          if (!r) { report.failed.push(`${i + 1}번째 줄: 빈 줄을 찾지 못함 ([행추가]를 눌러 주세요)`); break; }
          cur = r; used.add(r);
          r.scrollIntoView({ block: "nearest", inline: "nearest" });
          await wait(150);
          const rr = r.getBoundingClientRect();
          y = rr.top + rr.height / 2;
        } else {
          y += rowH;
          if (y > innerHeight - 4) { window.scrollBy(0, rowH * 3); y -= rowH * 3; await wait(200); }
        }
      }
      let ok = true;
      for (let k = 0; k < HEAD.length; k++) {
        const v = rows[i][k];
        if (v === null || v === undefined || v === "" || !heads[k]) continue;
        if (k === 5) continue; // 예상금액은 에듀파인이 계산한다
        const ed = await openCell(cx(k), y);
        if (!ed) { ok = false; report.failed.push(`${i + 1}번째 줄 '${HEAD[k]}' 칸이 열리지 않음`); continue; }
        if (!setValue(ed, v)) { ok = false; report.failed.push(`${i + 1}번째 줄 '${HEAD[k]}'에 "${v}"를 넣지 못함`); }
        ed.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));
        await wait(60);
        if (document.activeElement === ed) ed.blur();
        await wait(80);
      }
      if (ok) report.done++;
    }
    return report;
  }

  // 품목내역: 선생님이 클릭한 칸(첫 줄 '내용')부터 아래로 채운다.
  // rows의 각 줄 순서: 내용, 규격, 수량, 단위, 예상단가, 예상금액
  async function fillGrid(start, rows) {
    let row = rowOf(start);
    const heads = findHeaders(start);
    let cells = cellsIn(row);
    const col = Math.max(0, cells.indexOf(start));
    const report = { done: 0, failed: [], addedRows: 0, byHeader: !!heads };
    // 첫 줄에 수량·단가 입력칸이 미리 없으면 좌표 방식으로
    if (heads) {
      const t0 = cellsByHeader(row, heads);
      if ((heads[2] && !t0[2]) || (heads[4] && !t0[4])) return fillGridPoint(start, heads, rows, report);
    }
    if (heads) {
      for (let i = 0; i < rows.length; i++) {
        if (i > 0) {
          let nr = nextRow(row);
          if (!nr && clickAddRow(row.closest("table, [role=grid]") || row)) { report.addedRows++; await wait(600); nr = nextRow(row); }
          if (!nr) { report.failed.push(`${i + 1}번째 줄: 빈 줄을 찾지 못함 ([행추가]를 눌러 주세요)`); break; }
          row = nr;
        }
        const target = cellsByHeader(row, heads);
        let ok = true;
        for (let k = 0; k < HEAD.length; k++) {
          const v = rows[i][k];
          if (v === null || v === undefined || v === "") continue;
          if (!target[k]) { if (k !== 5) { ok = false; report.failed.push(`${i + 1}번째 줄 '${HEAD[k]}' 칸을 못 찾음`); } continue; }
          if (!setValue(target[k], v)) { ok = false; report.failed.push(`${i + 1}번째 줄 '${HEAD[k]}'에 "${v}"를 넣지 못함`); }
          await wait(30);
        }
        if (ok) report.done++;
      }
      return report;
    }
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) {
        let nr = nextRow(row);
        if (!nr) {
          if (clickAddRow(row.closest("table, [role=grid]") || row)) { report.addedRows++; await wait(500); nr = nextRow(row); }
        }
        if (!nr) { report.failed.push(`${i + 1}번째 줄: 빈 줄을 찾지 못함`); break; }
        row = nr;
      }
      cells = cellsIn(row).slice(col);
      const vals = rows[i];
      let ok = true;
      for (let k = 0; k < vals.length && k < cells.length; k++) {
        if (vals[k] === null) continue;
        if (!setValue(cells[k], vals[k])) { ok = false; report.failed.push(`${i + 1}번째 줄 ${k + 1}번째 칸(값: ${vals[k]})`); }
        await wait(30);
      }
      if (ok) report.done++;
    }
    return report;
  }

  function describe(el) {
    const lab = el.labels && el.labels[0] ? el.labels[0].innerText.trim() : "";
    const row = rowOf(el);
    return {
      tag: el.tagName.toLowerCase(), type: el.type || "", id: el.id || "", name: el.name || "",
      cls: (el.className && typeof el.className === "string") ? el.className.slice(0, 80) : "",
      title: el.title || "", placeholder: el.placeholder || "", aria: el.getAttribute("aria-label") || "",
      label: lab.slice(0, 40), editable: !!el.isContentEditable, hasValue: !!(el.value || el.innerText),
      rowTag: row ? row.tagName.toLowerCase() : "", rowCls: row && typeof row.className === "string" ? row.className.slice(0, 60) : "",
      visible: visible(el), readOnly: !!el.readOnly, disabled: !!el.disabled,
      options: el.tagName === "SELECT" ? [...el.options].slice(0, 40).map(o => o.text.trim()) : undefined
    };
  }

  function diagnose() {
    const fields = [...document.querySelectorAll("input, select, textarea, [contenteditable='true']")].slice(0, 400).map(describe);
    const buttons = [...document.querySelectorAll("button, a, input[type=button], input[type=submit], input[type=image], img[alt], [title]")]
      .map(b => { const t = labelOf(b); return t && t.length < 30 ? (b.id ? `${t} #${b.id}` : t) : ""; }).filter(Boolean).slice(0, 300);
    const headers = [...document.querySelectorAll("th, [role='columnheader']")].map(h => h.innerText.trim()).filter(Boolean).slice(0, 100);
    return {
      url: location.origin + location.pathname, title: document.title, isTop: window === window.top,
      lastFocused: S.el ? describe(S.el) : null,
      fields, buttons, headers,
      iframes: [...document.querySelectorAll("iframe, frame")].map(f => (f.getAttribute("src") || "").slice(0, 120)),
      gridHints: {
        tables: document.querySelectorAll("table").length,
        roleGrid: document.querySelectorAll("[role='grid']").length,
        websquare: !!document.querySelector("[id^='mf_'], .w2grid, [class*='w2']"),
        nexacro: !!window.nexacro
      }
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    (async () => {
      try {
        if (msg.type === "fillText" || msg.type === "fillBody") {
          const el = S.el;
          if (!el || !el.isConnected) return reply({ ok: false, why: "nofocus" });
          const ok = msg.type === "fillBody" ? insertBody(el, msg.text) : setValue(el, msg.text);
          return reply({ ok });
        }
        if (msg.type === "fillGrid") {
          // 입력칸이 안 열린 채 칸만 클릭했으면 그 클릭한 곳에서 시작한다
          const el = S.click && S.click.isConnected && S.ct > S.t ? S.click : S.el;
          if (!el || !el.isConnected) return reply({ ok: false, why: "nofocus" });
          const report = await fillGrid(el, msg.rows);
          return reply({ ok: report.done > 0, report });
        }
        if (msg.type === "focusInfo") {
          const f = S.el && S.el.isConnected ? S.el.id || "" : "";
          const c = S.click && S.click.isConnected ? S.click.id || "" : "";
          return reply({ ok: true, id: (S.ct > S.t ? c || f : f || c) });
        }
        if (msg.type === "diagnose") return reply({ ok: true, data: diagnose() });
        reply({ ok: false, why: "unknown" });
      } catch (e) {
        reply({ ok: false, why: String(e && e.message || e) });
      }
    })();
    return true;
  });

  // 옆 창이 "가장 최근에 칸을 클릭한 프레임"을 찾을 때 쓴다.
  window.__pumuiLastFocus = () => Math.max(S.el && S.el.isConnected ? S.t : 0, S.click && S.click.isConnected ? S.ct : 0);
})();
