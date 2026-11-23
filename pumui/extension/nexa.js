// 에듀파인(넥사크로) 화면 전용. 페이지 안쪽(MAIN)에서 실행된다.
// 넥사크로 표는 화면에 보이는 몇 줄만 그려 두기 때문에, 칸을 클릭하는 대신
// 표에 연결된 데이터(데이터셋)에 직접 값을 넣는다. 저장·상신은 하지 않는다.
window.__pumuiNexa = (() => {
  const norm = s => String(s ?? "").replace(/[\s*※]/g, "");
  const children = o => {
    const out = [];
    if (!o || typeof o !== "object") return out;
    if (o.form) out.push(o.form);
    for (const c of [o.frames, o.components, o.all]) {
      if (c && typeof c.length === "number") for (let i = 0; i < c.length; i++) if (c[i]) out.push(c[i]);
    }
    return out;
  };
  // "mainframe.A.B.form.divWork.form.grd" 같은 이름 경로로 넥사크로 화면 요소를 찾는다
  function resolve(path) {
    const nx = window.nexacro;
    if (!nx || !nx.getApplication) return null;
    const app = nx.getApplication();
    const parts = path.split(".");
    let o = null;
    for (const k of parts) {
      if (o === null) { if (k !== "mainframe") return null; o = app.mainframe; continue; }
      let n = o[k];
      if (n == null && o.components) n = o.components[k];
      if (n == null && o.frames) n = o.frames[k];
      if (n == null && o.all) n = o.all[k];
      if (n == null) { o = undefined; break; }
      o = n;
    }
    if (o) return o;
    // 경로로 못 찾으면 이름으로 전체를 훑는다
    const name = parts[parts.length - 1];
    const seen = new Set(), q = [app.mainframe];
    while (q.length && seen.size < 20000) {
      const c = q.shift();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      if ((c.name === name || c.id === name)) return c;
      q.push(...children(c));
    }
    return null;
  }
  const dsOf = (form, x) => typeof x === "string" ? (form[x] || (form.objects && form.objects[x]) || null) : x;
  // [행추가] 버튼: 품목내역 표 바로 위에 있는 것만 누른다.
  // (에듀파인에는 위쪽 예산내역 표에도 [행추가]가 있어서, 아무거나 누르면 예산 줄이 늘어난다)
  function findAddButton(grid, gridPath) {
    const gEl = document.getElementById(grid._unique_id || gridPath) || document.getElementById(gridPath);
    if (!gEl) return null;
    const g = gEl.getBoundingClientRect();
    // 같은 화면(폼) 전체에서 찾는다: 표가 든 폼에서 두 단계씩(폼 → 묶음칸 → 폼) 위로
    let top = grid.parent;
    for (let k = 0; k < 4; k++) {
      const up = top && top.parent && top.parent.parent;
      if (!up || typeof up.components === "undefined") break;
      top = up;
    }
    const q = [top || grid.parent], seen = new Set(), cands = [];
    while (q.length && seen.size < 20000) {
      const c = q.shift();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      const t = String(c.text ?? "") + " " + String(c.tooltiptext ?? "");
      if (typeof c.click === "function" && /행\s*추가|추가\s*행/.test(t) && !/삭제/.test(t)) {
        const el = document.getElementById(c._unique_id || "");
        if (el && el.getClientRects().length) {
          const r = el.getBoundingClientRect();
          const above = g.top - r.bottom;           // 표 머리글 위쪽으로 얼마나 떨어져 있나
          const overlap = r.right > g.left - 10 && r.left < g.right + 10;
          if (above >= -5 && above < 120 && overlap) cands.push({ c, d: above });
        }
      }
      q.push(...children(c));
    }
    cands.sort((x, y) => x.d - y.d);
    return cands.length ? cands[0].c : null;
  }

  function fill(gridPath, rows, HEAD) {
    const grid = resolve(gridPath);
    if (!grid || typeof grid.getCellProperty !== "function") return { ok: false, why: "nogrid" };
    const form = grid.parent;
    const ds = (grid.getBindDataset && grid.getBindDataset()) || dsOf(form, grid.binddataset);
    if (!ds || typeof ds.setColumn !== "function") return { ok: false, why: "nods" };

    // 머리글 이름 → 그 열에 연결된 데이터 이름
    const map = {};
    const nH = grid.getCellCount("head"), nB = grid.getCellCount("body");
    const bodyByCol = {};
    for (let i = 0; i < nB; i++) bodyByCol[grid.getCellProperty("body", i, "col")] = i;
    for (let j = 0; j < nH; j++) {
      const k = HEAD.indexOf(norm(grid.getCellProperty("head", j, "text")));
      if (k < 0 || map[k]) continue;
      const cell = bodyByCol[grid.getCellProperty("head", j, "col")];
      if (cell === undefined) continue;
      const m = String(grid.getCellProperty("body", cell, "text") ?? "").match(/^bind:(.+)$/);
      map[k] = { cell, bind: m ? m[1].trim() : null };
    }
    if (!map[0] || !map[0].bind) return { ok: false, why: "nocol", found: Object.keys(map) };

    const report = { done: 0, failed: [], addedRows: 0, byNexa: true };
    const content = r => String(ds.getColumn(r, map[0].bind) ?? "").trim();
    const setCell = (r, k, v) => {
      const m = map[k];
      if (!m || !m.bind) return k === 5 ? true : `'${HEAD[k]}' 칸을 못 찾음`;
      let val = v;
      const kind = String(grid.getCellProperty("body", m.cell, "edittype") ?? "") + " " + String(grid.getCellProperty("body", m.cell, "displaytype") ?? "");
      if (/combo/i.test(kind)) {
        const cds = dsOf(form, grid.getCellProperty("body", m.cell, "combodataset"));
        const cc = grid.getCellProperty("body", m.cell, "combocodecol"), dc = grid.getCellProperty("body", m.cell, "combodatacol");
        if (cds && cc && dc) {
          let f = -1;
          for (let x = 0; x < cds.rowcount && f < 0; x++) if (String(cds.getColumn(x, dc) ?? "").trim() === String(v)) f = x;
          for (let x = 0; x < cds.rowcount && f < 0; x++) if (String(cds.getColumn(x, dc) ?? "").includes(String(v))) f = x;
          if (f < 0) return `'${HEAD[k]}'에 "${v}"가 목록에 없음`;
          val = cds.getColumn(f, cc);
        }
      } else if (k === 2 || k === 4 || k === 5) val = Number(v) || 0;
      ds.setColumn(r, m.bind, val);
      return true;
    };

    let r = grid.currentrow >= 0 ? grid.currentrow : 0;
    if (ds.rowcount === 0) r = -1;
    let last = -1;
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 || r < 0) {
        // 다음 빈 줄 → 없으면 [행추가] 버튼 → 그래도 안 되면 데이터에 줄 추가
        let n = Math.max(r, last) + 1;
        while (n < ds.rowcount && content(n)) n++;
        if (n >= ds.rowcount) {
          const before = ds.rowcount;
          const btn = findAddButton(grid, gridPath);
          if (!btn) { report.failed.push(`${i + 1}번째 줄: 품목내역 [행추가] 버튼을 못 찾음. 품목내역의 [행추가]를 직접 ${rows.length - i}번 누른 뒤 다시 넣어 주세요`); break; }
          try { btn.click(); } catch (e) {}
          if (ds.rowcount === before) { report.failed.push(`${i + 1}번째 줄: [행추가]를 눌렀지만 줄이 생기지 않음`); break; }
          report.addedRows++;
          n = last + 1;
          while (n < ds.rowcount && content(n)) n++;
          if (n >= ds.rowcount) { report.failed.push(`${i + 1}번째 줄: 빈 줄을 찾지 못함`); break; }
        }
        r = n;
      }
      if (typeof ds.set_rowposition === "function") ds.set_rowposition(r);
      let ok = true;
      for (let k = 0; k < HEAD.length; k++) {
        const v = rows[i][k];
        if (v === null || v === undefined || v === "") continue;
        const res = setCell(r, k, v);
        if (res !== true) { ok = false; report.failed.push(`${i + 1}번째 줄 ${res}`); }
      }
      last = r;
      if (ok) report.done++;
    }
    report.ok = report.done > 0;
    return report;
  }

  // 제목·본문 칸: 화면에 넣은 글자가 넥사크로 값에도 들어갔는지 확인하고, 아니면 맞춰 준다
  function setText(path, text) {
    const c = resolve(path);
    if (!c || typeof c.set_value !== "function") return { ok: false };
    if (c.value !== text) c.set_value(text);
    return { ok: c.value === text };
  }
  // 위쪽 예산내역 표에서 지금 선택된 예산(세부사업·세부항목·산출내역)을 읽는다
  function budgetName(gridPath) {
    const pg = resolve(gridPath);
    if (!pg) return "";
    let top = pg.parent;
    for (let k = 0; k < 4; k++) {
      const up = top && top.parent && top.parent.parent;
      if (!up || typeof up.components === "undefined") break;
      top = up;
    }
    const WANT = ["세부사업", "세부항목", "산출내역"];
    const q = [top], seen = new Set();
    while (q.length && seen.size < 20000) {
      const g = q.shift();
      if (!g || seen.has(g)) continue;
      seen.add(g);
      q.push(...children(g));
      if (g === pg || typeof g.getCellProperty !== "function") continue;
      const nH = g.getCellCount("head"), nB = g.getCellCount("body");
      const bodyByCol = {};
      for (let i = 0; i < nB; i++) bodyByCol[g.getCellProperty("body", i, "col")] = i;
      const cells = {};
      for (let j = 0; j < nH; j++) {
        const k = WANT.indexOf(norm(g.getCellProperty("head", j, "text")));
        if (k >= 0 && cells[k] === undefined) cells[k] = bodyByCol[g.getCellProperty("head", j, "col")];
      }
      if (cells[0] === undefined && cells[2] === undefined) continue;
      const ds = (g.getBindDataset && g.getBindDataset()) || dsOf(g.parent, g.binddataset);
      if (!ds || !ds.rowcount) return "";
      const row = g.currentrow >= 0 && g.currentrow < ds.rowcount ? g.currentrow : 0;
      const text = c => {
        if (c === undefined) return "";
        let t = "";
        try { t = g.getCellText ? g.getCellText(row, c) : ""; } catch (e) {}
        if (!t) { const m = String(g.getCellProperty("body", c, "text") ?? "").match(/^bind:(.+)$/); if (m) t = ds.getColumn(row, m[1].trim()); }
        return String(t ?? "").trim();
      };
      return [0, 1, 2].map(k => text(cells[k])).filter(Boolean).join(" / ");
    }
    return "";
  }
  return { fill, setText, budgetName };
})();
