-- 구글 시트(읽기 전용 사본)용: 비밀 키로 전체 데이터를 받아 가는 함수
-- 키는 DB 안(private.settings)에서 무작위로 만들어지고 저장소에는 올라가지 않음
create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings (key, value)
values ('sheet_export_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function public.sheet_export(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_key is null or p_key <> (select value from private.settings where key = 'sheet_export_key') then
    raise exception 'invalid key' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'cert', cert, 'note', note, 'rate_out', rate_out, 'rate_exh', rate_exh, 'rate_hour', rate_hour, 'active', active) order by active desc, sort_order, id), '[]') from members),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'type', type, 'start', start_date, 'end', end_date, 'memo', memo, 'place', place, 'manager', manager, 'contact', contact, 'need_day', need_day, 'need_night', need_night) order by start_date, id), '[]') from events),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_array(a.work_date, m.name, a.shift, e.name) order by a.work_date, m.sort_order, a.shift), '[]')
                    from assignments a join members m on m.id = a.member_id join events e on e.id = a.event_id),
    'nights', (select coalesce(jsonb_agg(jsonb_build_array(n.work_date, e.name, n.hours, n.memo) order by n.work_date), '[]') from night_plans n join events e on e.id = n.event_id),
    'needs', (select coalesce(jsonb_agg(jsonb_build_array(n.work_date, e.name, n.need_day, n.need_night, n.memo) order by n.work_date), '[]') from need_overrides n join events e on e.id = n.event_id),
    'exported_at', now()
  );
end $$;
revoke all on function public.sheet_export(text) from public;
grant execute on function public.sheet_export(text) to anon, authenticated;
