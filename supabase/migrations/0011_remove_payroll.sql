-- 급여 기능 삭제 (2026-11-12, 윗선 요청: 간부에게도 임금을 공개하지 않음)
-- 일당·시급, 월 마감 급여 기록, 변경 기록(audit_log)에 남은 일당 값까지 DB에서 지움. 되돌릴 수 없음.

-- 1) 월 마감: 배정 잠금 트리거 → 마감 함수 → 마감 표
drop trigger if exists block_closed_month on public.assignments;
drop trigger if exists block_closed_month on public.night_plans;
drop function if exists private.block_closed_month();
drop function if exists public.close_month(date);
drop table if exists public.payroll_lines;
drop table if exists public.payroll_closings;

-- 2) 시트 사본용 함수: 팀원 일당 빼고 (일당 열을 지우기 전에 바꿔야 함)
create or replace function public.sheet_export(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_key is null or p_key <> (select value from private.settings where key = 'sheet_export_key') then
    raise exception 'invalid key' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'cert', cert, 'note', note, 'active', active) order by active desc, sort_order, id), '[]') from members),
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

-- 3) 변경 기록에 남아 있는 일당 값 지우기 (팀원 표 기록의 rate_* 항목만)
update public.audit_log
   set old_row = case when old_row is null then null else old_row - 'rate_out' - 'rate_exh' - 'rate_hour' end,
       new_row = case when new_row is null then null else new_row - 'rate_out' - 'rate_exh' - 'rate_hour' end
 where tbl = 'members'
   and (old_row ?| array['rate_out','rate_exh','rate_hour'] or new_row ?| array['rate_out','rate_exh','rate_hour']);

-- 4) 팀원 일당·시급 열 삭제
alter table public.members
  drop column if exists rate_out,
  drop column if exists rate_exh,
  drop column if exists rate_hour;
