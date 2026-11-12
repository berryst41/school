// 학급 운영 자료실: 오픈톡방 카톡 → 자료실 자동 등록
// 부르는 곳: 폰의 알림 앱(MacroDroid 등)이 카톡 알림을 받을 때마다 POST { token, title, text } (또는 { sender, text })
// - token이 cls_config.inbox_token과 같아야 해요.
// - 메시지에 #이종대왕 이 없으면 아무것도 저장하지 않고 버려요(다른 사람 대화는 서버에 남기지 않음).
// - 있으면 index.html의 classify()와 같은 규칙(TAG_RULES)으로 종류·요일·주차를 정해 cls_items에 넣고,
//   확인용 내역을 cls_inbox에 남겨요(관리자 "📥 자동 등록" 탭에서 맞아요/삭제).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-inbox-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// index.html의 TAG_RULES / KIND_DAY와 같아야 해요
const TAG_RULES: [string, string[]][] = [
  ['아침멘트', ['아침멘트', '월밀', '월밀자료']],
  ['목힘', ['목힘', '수힘', '특별활동']],
  ['수업놀이', ['수업놀이1픽', '수업놀이', '수업놀이추천']],
  ['중간놀이', ['중간놀이', '짧은놀이', '수요일']],
  ['금요놀이', ['금요놀이', '금놀이', '인성놀이', '금요일', '교실놀이추천']],
  ['교사마인드', ['교사마인드']],
  ['주간교육', ['주간교육']],
  ['단단마인드', ['단단마인드']]
];
const KIND_DAY: Record<string, string> = { 중간놀이: '수', 목힘: '목', 금요놀이: '금' };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const monthRank = (m: number | null) => m == null ? 99 : (m + 9) % 12;

const tagsOf = (t: string) => [...new Set((t.match(/#[^\s#]+/g) || []).map(x => x.slice(1)))];
const urlsOf = (t: string) => [...new Set(t.match(/https?:\/\/[^\s<>"')]+/g) || [])];
function linkName(u: string) {
  if (/youtu\.?be/.test(u)) return '영상';
  if (/blog\.naver/.test(u)) return '블로그';
  if (/drive\.google|docs\.google/.test(u)) return '자료 파일';
  if (/padlet/.test(u)) return '패들렛';
  if (/canva/.test(u)) return '캔바';
  return '링크';
}
function bodyOf(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n');
  while (lines.length && /^\s*(#[^\s#]+\s*)*$/.test(lines[0])) lines.shift();
  return lines.join('\n').trim();
}
const titleFor = (kind: string, week: number | null, day: string, plain: string) =>
  kind === '아침멘트' && week && day ? `${week}주차 ${day}요일 아침 멘트` : plain;

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await db.from('cls_config').select('inbox_token').eq('id', 1).single();
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const token = req.headers.get('x-inbox-token') || body.token || url.searchParams.get('token');
  if (!cfg?.inbox_token || token !== cfg.inbox_token) return json({ error: 'denied' }, 403);

  // 알림은 보통 title=톡방 이름, text="보낸 사람 : 메시지". 앱이 따로 나눠 보내면 sender·text를 그대로 써요.
  let sender = String(body.sender || '').trim(), text = String(body.text || '').trim();
  const room = String(body.room || body.title || '').trim();
  if (!sender) {
    const m = text.match(/^([^\n:]{1,30}?) : ([\s\S]*)$/);
    if (m) { sender = m[1].trim(); text = m[2].trim(); }
  }
  if (!text.includes('#이종대왕')) return json({ ok: true, ignored: 'no tag' });

  // 같은 글이 알림으로 두 번 오는 일이 있어서, 같은 글은 한 번만
  const dedupe = await sha(text.replace(/\s+/g, ' '));
  const { data: dup } = await db.from('cls_inbox').select('id').eq('dedupe', dedupe).maybeSingle();
  if (dup) return json({ ok: true, ignored: 'duplicate' });

  const tags = tagsOf(text);
  const has = (t: string) => tags.includes(t);
  let kind: string | null = null, why = '';
  for (const [k, words] of TAG_RULES) {
    const w = words.find(has);
    if (w) { kind = k; why = '#' + w; break; }
  }
  if (!kind) {
    const others = tags.filter(t => t !== '이종대왕' && !/주차/.test(t));
    if (others.length) {
      const { data: sim } = await db.from('cls_items').select('kind, tags').overlaps('tags', others).limit(300);
      const score: Record<string, number> = {};
      for (const i of sim || []) for (const t of i.tags || []) if (others.includes(t)) score[i.kind] = (score[i.kind] || 0) + 1;
      const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
      if (best) { kind = best[0]; why = '비슷한 태그가 쓰인 자료'; }
    }
  }
  const notes: string[] = [];
  if (!kind) { kind = '기타'; notes.push('종류를 알려 주는 태그가 없어서 기타로 넣었어요'); }

  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const year = kst.getUTCFullYear();
  const dayTag = tags.map(t => (t.match(/^(월|화|수|목|금)요일$/) || [])[1]).find(Boolean);
  let day = dayTag || KIND_DAY[kind] || '';
  if (!day && kind === '아침멘트') day = DAYS[kst.getUTCDay()].replace(/[토일]/, '월');

  // 주차: #34주차 태그 → 없으면 이번 주(올해 가장 최근 주차)
  const { data: wk } = await db.from('cls_items').select('month, week').eq('year', year).not('week', 'is', null);
  const latest = (wk || []).sort((a, b) => (monthRank(b.month) * 100 + b.week) - (monthRank(a.month) * 100 + a.week))[0];
  const weekTag = tags.map(t => +((t.match(/^(\d+)(?:~\d+)?주차$/) || [])[1])).find(Boolean);
  const week = weekTag || latest?.week || null;
  const same = (wk || []).find(i => i.week === week && i.month);
  const month = same?.month || kst.getUTCMonth() + 1;

  const bodyText = bodyOf(text);
  if (!bodyText) return json({ ok: true, ignored: 'empty body' });
  if (/(…|\.\.\.)$/.test(text)) notes.push('알림 글이 잘렸을 수 있어요(끝이 …) — 원문을 확인해 주세요');
  const first = (bodyText.match(/<([^<>\n]{2,40})>/) || [])[1] ||
    (bodyText.split('\n').map(l => l.replace(/^["“'*■●▶\s-]+/, '').trim()).find(l => l && !/^https?:/.test(l)) || '');
  const plain = first.length > 42 ? first.slice(0, 40) + '…' : first;

  const links = urlsOf(text).map(u => ({ name: linkName(u), url: u }));
  const { data: item, error } = await db.from('cls_items').insert({
    year, month, kind, day: day || null, week, title: titleFor(kind, week, day, plain) || '(제목 없음)',
    body: bodyText, links, tags
  }).select('id').single();
  if (error) return json({ error: error.message }, 500);

  await db.from('cls_inbox').insert({
    sender: sender || null, room: room || null, raw: text, item_id: item.id, kind,
    note: [why ? `종류 근거: ${why}` : '', ...notes].filter(Boolean).join(' · ') || null, dedupe
  });
  return json({ ok: true, kind, week, day });
});
