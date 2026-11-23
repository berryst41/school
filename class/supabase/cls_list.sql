-- cls_list: 표(SETOF) 대신 JSON 하나로 돌려줌 (2026-11-13, 한 번에 가져오는 줄 수 제한 회피)
drop function cls_list(text);

create function cls_list(p_code text) returns json
language plpgsql
stable security definer set search_path to 'public'
as $$
begin
  if (cls_who(p_code)).code is null then raise exception 'denied'; end if;
  return coalesce((
    select json_agg(t order by t.year desc, t.month nulls last, t.week nulls last, t.sort nulls last, t.created_at)
    from cls_items t
  ), '[]'::json);
end $$;

revoke all on function cls_list(text) from public;
grant execute on function cls_list(text) to anon, authenticated;
