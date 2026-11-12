-- 오픈톡방 → 자료실 자동 등록 (2026-11-12 Supabase bombanana에 이미 적용함. 기록용)
-- 토큰 값은 여기 적지 않아요: cls_config.inbox_token (관리자만 SQL로 볼 수 있음)
alter table cls_config add column if not exists inbox_token text;
update cls_config set inbox_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where id = 1 and inbox_token is null;

create table if not exists cls_inbox (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  sender text,
  room text,
  raw text not null,
  item_id uuid references cls_items(id) on delete set null,
  kind text,
  status text not null default 'new' check (status in ('new','ok','removed')),
  note text,
  dedupe text unique
);
alter table cls_inbox enable row level security;

-- 관리자: 최근 내역 200개 (자료가 아직 있으면 그 자료의 현재 모양도 함께)
create or replace function cls_inbox_list(p_code text) returns json
language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce((cls_who(p_code)).is_admin, false) then raise exception 'denied'; end if;
  return coalesce((
    select json_agg(r order by r.received_at desc) from (
      select b.id, b.received_at, b.sender, b.room, b.raw, b.status, b.note, b.item_id,
             i.kind, i.day, i.week, i.month, i.year, i.title
      from cls_inbox b left join cls_items i on i.id = b.item_id
      order by b.received_at desc limit 200
    ) r
  ), '[]'::json);
end $$;

-- 관리자: 'ok' 맞아요 / 'remove' 자료실에서 삭제 / 'ok_all' 새 것 전부 맞아요
create or replace function cls_inbox_set(p_code text, p_id uuid, p_action text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare b cls_inbox;
begin
  if not coalesce((cls_who(p_code)).is_admin, false) then raise exception 'denied'; end if;
  if p_action = 'ok_all' then
    update cls_inbox set status = 'ok' where status = 'new';
  elsif p_action = 'ok' then
    update cls_inbox set status = 'ok' where id = p_id;
  elsif p_action = 'remove' then
    select * into b from cls_inbox where id = p_id;
    if b.item_id is not null then delete from cls_items where id = b.item_id and src is null; end if;
    update cls_inbox set status = 'removed', item_id = null where id = p_id;
  end if;
end $$;
revoke all on function cls_inbox_list(text), cls_inbox_set(text, uuid, text) from public;
grant execute on function cls_inbox_list(text), cls_inbox_set(text, uuid, text) to anon, authenticated;
