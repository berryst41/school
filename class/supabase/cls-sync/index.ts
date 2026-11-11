// 학급 운영 자료실: 구글 시트 → cls_items 가져오기
// 부르는 곳: ① pg_cron (x-cron-secret 헤더) ② 자료실의 관리자 "시트에서 새로 가져오기" 단추 ({ code })
// 시트에서 온 자료는 src(연도|탭|칸)로 맞춰 넣고, 시트에서 사라진 칸은 지워요. 손으로 넣은 자료(src 없음)는 건드리지 않아요.
import * as X from 'npm:xlsx@0.18.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseWorkbook } from './parse.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await db.from('cls_config').select('*').eq('id', 1).single();

  const secret = req.headers.get('x-cron-secret');
  let ok = !!secret && secret === cfg.cron_secret;
  if (!ok) {
    const { code } = await req.json().catch(() => ({}));
    if (code) ok = !!(await db.rpc('cls_is_admin', { p_code: code })).data;
  }
  if (!ok) return json({ error: 'denied' }, 403);

  try {
    // 오래된 해부터 읽어서, 새 해 시트에 복사돼 있는 같은 칸은 건너뜀
    const sheets = [...cfg.sheets].sort((a: any, b: any) => a.year - b.year);
    const seen = new Set<string>();
    const items: any[] = [];
    for (const s of sheets) {
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${s.id}/export?format=xlsx`);
      if (!r.ok) throw new Error(`${s.year}년 시트를 못 읽었어요 (${r.status}). 공유가 "링크가 있는 모든 사용자"인지 확인해 주세요.`);
      const wb = X.read(new Uint8Array(await r.arrayBuffer()), { type: 'array' });
      const got = parseWorkbook(X, wb, s.year, seen);
      got.forEach((i: any) => seen.add(i.raw));
      items.push(...got);
    }
    const rows = items.map(({ raw, ...i }) => ({ ...i, updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('cls_items').upsert(rows.slice(i, i + 200), { onConflict: 'src' });
      if (error) throw error;
    }
    // 시트에서 지워진 칸 정리
    const keep = new Set(rows.map(r => r.src));
    const { data: old } = await db.from('cls_items').select('id, src').not('src', 'is', null);
    const gone = (old || []).filter(o => !keep.has(o.src)).map(o => o.id);
    if (gone.length) await db.from('cls_items').delete().in('id', gone);

    const result = `${rows.length}개 가져옴` + (gone.length ? `, ${gone.length}개 지움` : '');
    await db.from('cls_config').update({ last_sync: new Date().toISOString(), last_result: result }).eq('id', 1);
    return json({ ok: true, result });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await db.from('cls_config').update({ last_result: '실패: ' + msg }).eq('id', 1);
    return json({ error: msg }, 500);
  }
});
