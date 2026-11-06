-- 팀원에게 보여 줄 공지 (메모는 관리자 전용으로 유지)
alter table public.events add column if not exists notice text;

-- 팀원 화면 v2: 내 일정 + 같은 날 같은 행사 동료 + 행사 상세(장소·담당자·연락처·팀원 공지)
-- (예전 my_schedule 은 반환 칸이 달라 그대로 두고 v2 를 새로 만듦. 웹은 v2 만 씀)
create or replace function public.my_schedule_v2(p_from date, p_to date)
returns table (
  work_date date, event_id bigint, event_name text, event_type text, place text,
  start_date date, end_date date, shift text, member_name text, cert text, is_me boolean,
  manager text, contact text, notice text
)
language sql stable security definer set search_path = public as $$
  with me as (select private.my_member_id() as mid),
  mine as (
    select distinct a.work_date, a.event_id
    from assignments a, me
    where a.member_id = me.mid and a.work_date between p_from and p_to
  )
  select a.work_date, e.id, e.name, e.type, e.place, e.start_date, e.end_date,
         a.shift, m.name, m.cert, (a.member_id = (select mid from me)),
         e.manager, e.contact, e.notice
  from assignments a
  join mine  using (work_date, event_id)
  join events  e on e.id = a.event_id
  join members m on m.id = a.member_id
  order by a.work_date, e.start_date, e.name, m.sort_order, m.name;
$$;
revoke all on function public.my_schedule_v2(date, date) from public, anon;
grant execute on function public.my_schedule_v2(date, date) to authenticated;
