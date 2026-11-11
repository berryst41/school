// 학급 운영 자료실: ① 관리자가 "시트에서 온 자료"를 고치면 그 시트 칸에 바로 써요.
//              ② 자료실에서 새로 넣는 자료도 그 주차 줄의 빈 분류 칸(왼쪽부터)을 찾아 시트에 써요(빈 칸이 없으면 자료실 안에만 저장).
// 종류·요일·주차·연도는 시트 칸 자리로 정해지므로 안 바꿈. 제목·내용·태그·링크만 받아 시트 칸 글로 씀.
import { createClient } from 'npm:@supabase/supabase-js@2';

// parse.js의 COLS와 같아야 해요(칸 이름 → [종류, 요일])
const COLS: Record<string, [string, string?]> = {
  '월 멘트': ['아침멘트', '월'], '화 멘트': ['아침멘트', '화'], '수 멘트': ['아침멘트', '수'],
  '목 멘트': ['아침멘트', '목'], '금 멘트': ['아침멘트', '금'],
  '중간 놀이': ['중간놀이', '수'], '금 놀이': ['금요놀이', '금'],
  '단단 마인드': ['단단마인드'], '수업놀이 추천': ['수업놀이'], '특별활동': ['목힘', '목'],
  '교사마인드': ['교사마인드'], '주간 교육': ['주간교육']
};
const clean = (s: unknown) => String(s ?? '').replace(/\r\n?/g, '\n').trim();
const colName = (s: unknown) => clean(s).replace(/\s+/g, ' ');
const colLetter = (ci: number) => String.fromCharCode(65 + ci);
// 같은 종류 칸이 여러 개 필요하면 시트에 "특별활동2"처럼 끝에 숫자를 붙인 칸을 추가해도 같은 종류로 인식해요.
const kindOf = (h: string) => COLS[h] || COLS[h.replace(/\s*\d+$/, '')];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ── 서비스 계정 JWT로 구글 접속 열쇠 받기 ─────────────────────────────
function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));

async function importKey(pem: string) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function sheetToken(sa: { client_email: string; private_key: string; token_uri: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlStr(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: sa.token_uri, iat: now, exp: now + 3600
  }));
  const key = await importKey(sa.private_key);
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`)));
  const r = await fetch(sa.token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${claim}.${sig}`
  });
  const d = await r.json();
  if (!r.ok) throw new Error('구글 인증 실패: ' + (d.error_description || d.error || r.status));
  return d.access_token as string;
}

async function writeCell(token: string, spreadsheetId: string, tab: string, addr: string, text: string) {
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${addr}`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[text]] })
  });
  if (!r.ok) throw new Error('시트 쓰기 실패: ' + await r.text());
}

async function readValues(token: string, spreadsheetId: string, range: string) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error('시트 읽기 실패: ' + await r.text());
  return ((await r.json()).values || []) as string[][];
}

async function tabsOf(token: string, spreadsheetId: string) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error('시트 목록 못 읽음: ' + await r.text());
  return ((await r.json()).sheets || []).map((s: any) => s.properties.title as string);
}

// 그 달 탭에서 이 주차 줄의 빈 분류 칸을 왼쪽부터 찾아요. kindWanted가 있으면 그 칸을 먼저 보고, 없거나 이미 찼으면 아무 빈 칸이나.
async function findSlot(token: string, spreadsheetId: string, tab: string, week: number, kindWanted?: string) {
  const rows = await readValues(token, spreadsheetId, `'${tab.replace(/'/g, "''")}'!A1:Z80`);
  const head = (rows[0] || []).map(colName);
  const ri = rows.slice(1).findIndex(row => +((clean(row[0]).match(/(\d+)/) || [])[1]) === week);
  if (ri < 0) return null;
  const row = rows[1 + ri];
  const cols = head.map((h, ci) => ({ ci, kind: kindOf(h) })).filter(c => c.kind && c.ci > 0);
  const empty = cols.filter(c => !clean(row[c.ci]));
  if (!empty.length) return null;
  const pick = (kindWanted && empty.find(c => c.kind[0] === kindWanted)) || empty[0];
  return { addr: `${colLetter(pick.ci)}${ri + 2}`, kind: pick.kind[0], day: pick.kind[1] || null };
}

async function handle(req: Request) {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const { code, id, title, body: text, tags, links, place, year, week, month, kind } = body;
  if (!code) return json({ error: 'bad request' }, 400);
  if (!(await db.rpc('cls_is_admin', { p_code: code })).data) return json({ error: 'denied' }, 403);

  let sa;
  try { sa = JSON.parse(Deno.env.get('CLS_SHEET_SA') || ''); }
  catch { return json({ error: '구글 열쇠(CLS_SHEET_SA)가 설정 안 됐어요' }, 500); }

  const safeText = String(text || '');
  const extraLinks = (links || []).filter((l: any) => l?.url && !safeText.includes(l.url));
  const cellText = [
    (tags || []).length ? (tags as string[]).map(t => '#' + t).join(' ') : '',
    safeText,
    ...extraLinks.map((l: any) => (l.name ? l.name + ': ' : '') + l.url)
  ].filter(Boolean).join('\n\n');

  // ② 자료실에서 새로 넣는 자료: 그 주차 줄의 빈 분류 칸(왼쪽부터)을 찾아 시트에 써요
  if (place) {
    if (!year || !week) return json({ error: 'bad request' }, 400);
    const { data: cfg } = await db.from('cls_config').select('sheets').eq('id', 1).single();
    const s = (cfg?.sheets || []).find((x: any) => x.year === +year);
    if (!s) return json({ error: `${year}년 시트를 못 찾았어요` }, 404);
    const token = await sheetToken(sa);
    const tabs = (await tabsOf(token, s.id)).filter(t => !/사본|copy/i.test(t));
    const tab = tabs.find(t => +((t.match(/(\d+)\s*월/) || [])[1]) === +month) || tabs[0];
    if (!tab) return json({ error: '달 탭을 못 찾았어요' }, 404);
    const slot = await findSlot(token, s.id, tab, +week, kind);
    if (!slot) return json({ ok: false, placed: false, reason: '그 주차에 빈 칸이 없어요' });
    await writeCell(token, s.id, tab, slot.addr, cellText);
    const src = `${year}|${tab}|${slot.addr}`;
    const { data: r, error } = await db.from('cls_items').upsert({
      year: +year, month: +month, week: +week, kind: slot.kind, day: slot.day,
      title, body: safeText, links: links || [], tags: tags || [],
      sort: slot.addr.charCodeAt(0) - 65, src, updated_at: new Date().toISOString()
    }, { onConflict: 'src' }).select().single();
    if (error) return json({ error: 'DB: ' + error.message }, 500);
    return json({ ok: true, placed: true, kind: slot.kind, item: r });
  }

  // ① 시트에서 이미 온 자료를 고침: 그 칸에 그대로 다시 씀
  if (!id) return json({ error: 'bad request' }, 400);
  const { data: item } = await db.from('cls_items').select('*').eq('id', id).single();
  if (!item || !item.src) return json({ error: 'not a sheet item' }, 400);
  const [, tab, addr] = item.src.split('|');

  const { data: cfg } = await db.from('cls_config').select('sheets').eq('id', 1).single();
  const s = (cfg?.sheets || []).find((x: any) => x.year === item.year);
  if (!s) return json({ error: `${item.year}년 시트를 못 찾았어요` }, 404);

  await writeCell(await sheetToken(sa), s.id, tab, addr, cellText);

  const { data: r, error } = await db.from('cls_items')
    .update({ title, body: safeText, links: links || [], tags: tags || [], updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) return json({ error: 'DB: ' + error.message }, 500);
  return json({ ok: true, item: r });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    return await handle(req);
  } catch (e) {
    console.error('cls-sheet-write error:', e);
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
