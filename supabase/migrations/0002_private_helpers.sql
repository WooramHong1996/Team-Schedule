-- 권한 확인용 도우미 함수를 API에 노출되지 않는 private 스키마로 옮김
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_admin() set schema private;
alter function public.my_member_id() set schema private;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.my_member_id() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.my_member_id() to authenticated;

create or replace function public.my_schedule(p_from date, p_to date)
returns table (
  work_date date, event_id bigint, event_name text, event_type text, place text,
  start_date date, end_date date, shift text, member_name text, cert text, is_me boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select private.my_member_id() as mid),
  mine as (
    select distinct a.work_date, a.event_id
    from assignments a, me
    where a.member_id = me.mid and a.work_date between p_from and p_to
  )
  select a.work_date, e.id, e.name, e.type, e.place, e.start_date, e.end_date,
         a.shift, m.name, m.cert, (a.member_id = (select mid from me))
  from assignments a
  join mine  using (work_date, event_id)
  join events  e on e.id = a.event_id
  join members m on m.id = a.member_id
  order by a.work_date, e.start_date, e.name, m.sort_order, m.name;
$$;
revoke all on function public.my_schedule(date, date) from public, anon;
grant execute on function public.my_schedule(date, date) to authenticated;
