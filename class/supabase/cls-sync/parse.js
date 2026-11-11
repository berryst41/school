// 구글 시트(xlsx) 한 파일을 자료 목록으로 바꿔요.
// 시트 모양: 탭 = 달(3월, 4월 …), 1줄 = 칸 이름, A열 = "N주차", 나머지 칸 = 그 주의 자료 한 개씩.

// 칸 이름 → [종류, 요일]
const COLS = {
  '월 멘트': ['아침멘트', '월'], '화 멘트': ['아침멘트', '화'], '수 멘트': ['아침멘트', '수'],
  '목 멘트': ['아침멘트', '목'], '금 멘트': ['아침멘트', '금'],
  '중간 놀이': ['중간놀이', '수'], '금 놀이': ['금요놀이', '금'],
  '단단 마인드': ['단단마인드'], '수업놀이 추천': ['수업놀이'], '특별활동': ['목힘', '목'],
  '교사마인드': ['교사마인드'], '주간 교육': ['주간교육']
};

const clean = s => String(s ?? '').replace(/\r\n?/g, '\n').trim();
const colName = s => clean(s).replace(/\s+/g, ' ');
// 같은 종류 칸이 여러 개 필요하면 시트에 "특별활동2"처럼 끝에 숫자를 붙인 칸을 추가해도 같은 종류로 인식해요.
const kindOf = h => COLS[h] || COLS[h.replace(/\s*\d+$/, '')];

function linkName(u) {
  if (/youtu\.?be/.test(u)) return '영상';
  if (/blog\.naver/.test(u)) return '블로그';
  if (/drive\.google|docs\.google/.test(u)) return '자료 파일';
  if (/padlet/.test(u)) return '패들렛';
  if (/canva/.test(u)) return '캔바';
  return '링크';
}

function makeItem(text, extraUrls) {
  const lines = text.split('\n');
  const tags = [...new Set((text.match(/#[^\s#]+/g) || []).map(t => t.slice(1)))];
  // 맨 위의 해시태그만 있는 줄은 본문에서 뺌
  while (lines.length && /^\s*(#[^\s#]+\s*)*$/.test(lines[0])) lines.shift();
  const body = lines.join('\n').trim();
  const first = (body.match(/<([^<>\n]{2,40})>/) || [])[1] ||
    (body.split('\n').map(l => l.replace(/^["“'*■●▶\s-]+/, '').trim()).find(l => l && !/^https?:/.test(l)) || '');
  const title = first.length > 42 ? first.slice(0, 40) + '…' : first;
  const urls = [...new Set([...extraUrls, ...(text.match(/https?:\/\/[^\s<>"')]+/g) || [])])];
  return { title: title || '(제목 없음)', body, tags, links: urls.map(url => ({ name: linkName(url), url })) };
}

// skipTexts: 다른 해 시트에 똑같이 있는 칸(복사해 둔 탭)은 건너뛰려고 받음
export function parseWorkbook(X, wb, year, skipTexts = new Set()) {
  const out = [];
  for (const tab of wb.SheetNames) {
    if (/사본|copy/i.test(tab)) continue;
    const month = +((tab.match(/(\d+)\s*월/) || [])[1]) || null;
    const ws = wb.Sheets[tab];
    const rows = X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    const head = (rows[0] || []).map(colName);
    rows.slice(1).forEach((row, ri) => {
      const week = +((clean(row[0]).match(/(\d+)/) || [])[1]) || null;
      row.forEach((cell, ci) => {
        if (ci === 0) return;
        const text = clean(cell);
        if (text.length < 5 || skipTexts.has(text)) return;
        const [kind, day] = kindOf(head[ci]) || ['기타'];
        const addr = X.utils.encode_cell({ r: ri + 1, c: ci });
        const hl = ws[addr]?.l?.Target;
        out.push({
          ...makeItem(text, hl ? [hl] : []),
          ...(kind === '아침멘트' && week ? { title: `${week}주차 ${day}요일 아침 멘트` } : {}),
          year, month, week, kind, day: day || null,
          sort: ci, src: `${year}|${tab}|${addr}`, raw: text
        });
      });
    });
  }
  return out;
}
