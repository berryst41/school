// AI 없이 장바구니 읽기 (무료).
// 장바구니 페이지 안에서 실행된다. 쿠팡·G마켓·11번가·아이스크림몰처럼
// 상품마다 체크칸이 하나씩 있는 장바구니를 읽는다.
// 이 파일은 함수 하나만 정의하고, 옆 창이 chrome.scripting으로 페이지에 넣어 실행한다.
function pumuiReadCart() {
  const PRICE = /([\d]{1,3}(?:,\d{3})+|\d+)\s*원/;
  const toNum = s => Number(String(s).replace(/[^\d]/g, "")) || 0;
  const SKIP = /^(옵션|삭제|선택|쿠폰|적립|무료배송|로켓|도착|내일|오늘|모레|한달구매|품절|수량|변경|장바구니|구매|바로\s*구매|주문|할인|판매자|상품금액|주문금액|할인금액|배송비|단일상품|전체|타임딜|프로모션|최저가|찜하기|상품명\s*[:：]?$|\(|[-−+%×x⊖⊕]|[★☆♡♥×])|^[\d,:.\s]+(원|개|%)?$|도착|적립|구매하기|추가 시|이상 주문|원 이상|배송 상품|옵션\/수량|남은\s*시간|툴팁/;
  const BADCTX = /적립|할인금액|쿠폰|배송비|추가 시|이상 주문|원 이상|무료배송|상품금액|주문합계|정가/;
  // 상품명 안에 "+N페이2000원"처럼 금액이 섞일 수 있어, 짧은 줄만 금액 줄로 본다
  const okName = l => l.length >= 4 && !SKIP.test(l) && !(PRICE.test(l) && l.length < 20) && !/\/\s*\d+\s*개\s*$/.test(l);
  const textOf = el => (el.innerText || el.textContent || "");
  const linesOf = el => textOf(el).split("\n").map(s => s.trim()).filter(Boolean);
  const hasPrice = el => textOf(el).replace(/([\d,]+)\s*\n\s*원/g, "$1원").split("\n").some(l => PRICE.test(l) && l.trim().length < 20);

  const boxes = [...document.querySelectorAll("input[type=checkbox]")];
  const boxCount = el => boxes.filter(b => el.contains(b)).length;

  // 1) 상품 묶음: 체크칸에서 위로 올라가며 가격과 상품명이 처음 보이는 덩어리.
  //    다른 체크칸을 품게 되면 더 올라가지 않는다(옆 상품과 섞이지 않게).
  function blockOf(anchor) {
    let el = anchor;
    while (el.parentElement && el.parentElement !== document.body && boxCount(el.parentElement) <= 1) {
      el = el.parentElement;
      if (hasPrice(el) && linesOf(el).some(okName)) return el;
    }
    return null;
  }
  let anchors = boxes;
  let blocks = anchors.map(b => [b, blockOf(b)]).filter(([, bl]) => bl);
  // 체크칸이 없는 장바구니: 수량 칸을 기준으로
  if (!blocks.length) {
    anchors = [...document.querySelectorAll("input[type=number], input[title*=수량], input[class*=qty], input[class*=quantity], input[name*=qty]")];
    const qCount = el => anchors.filter(q => el.contains(q)).length;
    blocks = anchors.map(a => {
      let el = a;
      while (el.parentElement && el.parentElement !== document.body && qCount(el.parentElement) <= 1) {
        el = el.parentElement;
        if (hasPrice(el) && linesOf(el).some(okName)) return [null, el];
      }
      return [null, null];
    }).filter(([, bl]) => bl);
  }

  const isStruck = (node, stop) => {
    for (let el = node; el && el !== stop; el = el.parentElement) {
      if (/^(DEL|S|STRIKE)$/.test(el.tagName)) return true;
      if (getComputedStyle(el).textDecorationLine.includes("line-through")) return true;
    }
    return false;
  };

  const items = [];
  const notes = [];
  const used = new Set();
  for (const [box, block] of blocks) {
    if (used.has(block)) continue;
    used.add(block);
    if (box && !box.checked) continue; // 선택 해제된 상품은 뺀다
    const lines = linesOf(block);

    // 상품명: 링크·이름 칸 중 가장 긴 것, 없으면 상품명처럼 보이는 가장 긴 줄
    //   (링크 안에 "브랜드" 줄과 "상품명" 줄이 같이 있을 수 있어 줄마다 본다)
    const cand = [...block.querySelectorAll("a, [class*=name], [class*=title]")]
      .flatMap(e => linesOf(e)).filter(okName);
    const name = ((cand.sort((a, b) => b.length - a.length)[0]) ||
                 (lines.filter(okName).sort((a, b) => b.length - a.length)[0]) || "")
                 .replace(/^상품명\s*[:：]\s*/, "");
    if (!name) continue;

    // 수량: 입력칸 → "/ 3개" → "수량 3" → 1
    let qty = 0;
    for (const q of block.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select")) {
      const v = String(q.value).trim();
      if (/^\d{1,4}$/.test(v) && Number(v) > 0) { qty = Number(v); break; }
    }
    const all = lines.join("\n");
    if (!qty) { const m = all.match(/\/\s*(\d+)\s*개/) || all.match(/수량\s*[:：]?\s*(\d+)/); if (m) qty = Number(m[1]); }
    if (!qty) qty = 1;

    // 규격(옵션)
    let spec = "";
    const optLine = lines.find(l => /^옵션(\s*[:：]|\s)/.test(l));
    if (optLine) spec = optLine.replace(/^옵션\s*[:：]?\s*/, "");
    else {
      const sl = lines.find(l => /\S\s*\/\s*\d+\s*개\s*$/.test(l));
      if (sl) spec = sl.replace(/\s*\/\s*\d+\s*개\s*$/, "").trim();
    }
    if (/^단일\s*상품$/.test(spec)) spec = "";

    // 가격: "1개당 9,800원"이 있으면 그것, 없으면 줄그은 정가 등을 뺀 금액 중 가장 큰 것
    let unit = 0;
    const per = all.match(/(?:1\s*개당|개당)\s*([\d,]+)\s*원/);
    if (per) unit = toNum(per[1]);
    if (!unit) {
      const prices = [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = walker.nextNode())) {
        const p = t.parentElement;
        if (!p || isStruck(p, block)) continue;
        // 화면에 안 보이는 글자(접힌 안내창·툴팁 등)의 금액은 읽지 않는다
        if (!p.getClientRects().length) continue;
        const cs = getComputedStyle(p);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        const ctx = textOf(p.closest("li, div, p, dd, td, dl") || p);
        if (BADCTX.test(ctx) && !/^\s*[\d,]+\s*원?\s*$/.test(ctx)) continue;
        // 바로 바깥 칸에 "이상 구매 시", "최대", "할인받기" 같은 말이 붙은 금액도 가격이 아니다
        const outer = textOf(p.parentElement && p.parentElement.parentElement || p);
        if (outer.length < 60 && /이상|최대|할인\s*받기|혜택|구매\s*시/.test(outer)) continue;
        let txt = t.textContent;
        if (txt.trim().length > 20) continue; // 상품명·설명 속 금액은 가격이 아니다
        // "9,800" 과 "원"이 다른 칸에 나뉜 경우
        if (/^\s*[\d,]+\s*$/.test(txt)) {
          const nx = (t.nextSibling && t.nextSibling.textContent) || (p.nextSibling && p.nextSibling.textContent) || "";
          if (/^\s*원/.test(nx)) txt += "원";
        }
        const m = txt.match(PRICE);
        if (m) prices.push({ v: toNum(m[1]), lab: (p.closest("div, dd, li, td") || p).parentElement?.textContent || "" });
      }
      // "할인모음가 15,700원 / 판매가 17,440원"처럼 이름표가 붙어 있으면 실제 내는 값(할인가)을 쓴다
      const DISC = /할인\s*(모음)?\s*가|할인\s*적용\s*가|쿠폰\s*적용\s*가|혜택가|최종\s*(판매)?\s*가|구매\s*가/;
      const own = o => o.lab.length < 40 ? o.lab : "";
      const disc = prices.filter(o => DISC.test(own(o)));
      const use = disc.length ? disc : prices;
      unit = use.length ? Math.max(...use.map(o => o.v)) : 0;
    }
    if (!unit) notes.push(`${name.slice(0, 15)}… 가격을 못 찾음`);
    // 수량이 2개 이상인데 "1개당"이 없으면, 보이는 금액이 1개 값인지 합계인지 아래에서 가린다
    const unsure = !per && qty > 1 && unit > 0 && unit % qty === 0;
    items.push({ name, spec, qty, unit: "개", price: unit, unsure });
  }

  // 같은 상품이 두 번 잡히면 하나만
  const seen = new Set();
  const uniq = items.filter(o => { const k = o.name + "|" + o.spec; if (seen.has(k)) return false; seen.add(k); return true; });

  // 배송비, 화면에 보이는 금액들(합계 확인용)
  const page = textOf(document.body);
  let shipping = 0;
  for (const m of page.matchAll(/배송비[^\d\n]{0,10}\n?\s*\+?\s*([\d,]+)\s*원/g)) shipping = Math.max(shipping, toNum(m[1]));
  const pagePrices = [...new Set([...page.matchAll(/([\d]{1,3}(?:,\d{3})+|\d+)\s*원/g)].map(m => toNum(m[1])))];

  // 1개 값인지 합계인지: 각 경우의 총액이 화면의 금액(배송비 포함·제외)과 맞는 쪽을 고른다.
  // 맞는 쪽이 없으면 보이는 금액을 그대로 1개 단가로 둔다.
  const amb = uniq.filter(o => o.unsure).slice(0, 10);
  if (amb.length) {
    const fixed = uniq.filter(o => !amb.includes(o)).reduce((a, o) => a + o.qty * o.price, 0);
    let pick = -1;
    for (let mask = 0; mask < (1 << amb.length) && pick < 0; mask++) {
      const t = fixed + amb.reduce((a, o, i) => a + (mask >> i & 1 ? o.price : o.qty * o.price), 0);
      if (pagePrices.includes(t) || (shipping && pagePrices.includes(t + shipping))) pick = mask;
    }
    amb.forEach((o, i) => {
      if (pick >= 0 && (pick >> i & 1)) o.price = o.price / o.qty; // 보이는 금액이 합계였음
      else if (pick < 0) notes.push(`${o.name.slice(0, 15)}… ${o.qty}개: 단가 ${o.price.toLocaleString()}원이 1개 값이 맞는지 확인`);
    });
  }
  uniq.forEach(o => delete o.unsure);
  return { items: uniq, shipping, pagePrices, notes };
}
