// 학급 운영 자료실: 관리자가 웹에서 "시트에서 온 자료"를 고치면 구글 시트 칸에도 바로 써요.
// 종류·요일·주차·연도는 시트 칸 자리로 정해지므로 안 바꿈. 제목·내용·태그·링크만 받아 시트 칸 글로 되돌려 씀.
import { createClient } from 'npm:@supabase/supabase-js@2';

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

async function writeCell(sa: any, spreadsheetId: string, tab: string, addr: string, text: string) {
  const token = await sheetToken(sa);
  const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${addr}`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[text]] })
  });
  if (!r.ok) throw new Error('시트 쓰기 실패: ' + await r.text());
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const { code, id, title, body: text, tags, links } = body;
  if (!code || !id) return json({ error: 'bad request' }, 400);
  if (!(await db.rpc('cls_is_admin', { p_code: code })).data) return json({ error: 'denied' }, 403);

  const { data: item } = await db.from('cls_items').select('*').eq('id', id).single();
  if (!item || !item.src) return json({ error: 'not a sheet item' }, 400);
  const [, tab, addr] = item.src.split('|');

  let sa;
  try { sa = JSON.parse(Deno.env.get('CLS_SHEET_SA') || ''); }
  catch { return json({ error: '구글 열쇠(CLS_SHEET_SA)가 설정 안 됐어요' }, 500); }

  const { data: cfg } = await db.from('cls_config').select('sheets').eq('id', 1).single();
  const s = (cfg?.sheets || []).find((x: any) => x.year === item.year);
  if (!s) return json({ error: `${item.year}년 시트를 못 찾았어요` }, 404);

  const safeText = String(text || '');
  const extraLinks = (links || []).filter((l: any) => l?.url && !safeText.includes(l.url));
  const cellText = [
    (tags || []).length ? (tags as string[]).map(t => '#' + t).join(' ') : '',
    safeText,
    ...extraLinks.map((l: any) => (l.name ? l.name + ': ' : '') + l.url)
  ].filter(Boolean).join('\n\n');

  try {
    await writeCell(sa, s.id, tab, addr, cellText);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const { data: r, error } = await db.from('cls_items')
    .update({ title, body: safeText, links: links || [], tags: tags || [], updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, item: r });
});
