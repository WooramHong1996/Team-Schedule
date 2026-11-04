-- 퇴사 처리용 날짜 + 지난 근무 기록이 있는 팀원·행사는 지울 수 없게 (급여 기록 보호)
alter table public.members add column if not exists retired_at timestamptz;

create or replace function private.protect_member_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.assignments where member_id = old.id and work_date < current_date;
  if n > 0 then
    raise exception '지난 근무 기록이 %건 있는 팀원은 삭제할 수 없어요. 퇴사 처리를 해 주세요.', n using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger protect_member_history before delete on public.members
  for each row execute function private.protect_member_history();

create or replace function private.protect_event_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.assignments where event_id = old.id and work_date < current_date;
  if n > 0 then
    raise exception '지난 근무 기록이 %건 있는 행사는 삭제할 수 없어요.', n using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger protect_event_history before delete on public.events
  for each row execute function private.protect_event_history();
