-- 1) "오늘"은 항상 한국 시간 기준 (DB 기본 시간대는 UTC라 새벽 0~9시에 하루 어긋났음)
create or replace function private.today_kst() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Seoul')::date $$;
grant execute on function private.today_kst() to authenticated;

create or replace function private.protect_member_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.assignments where member_id = old.id and work_date < private.today_kst();
  if n > 0 then
    raise exception '지난 근무 기록이 %건 있는 팀원은 삭제할 수 없어요. 퇴사 처리를 해 주세요.', n using errcode = 'P0001';
  end if;
  return old;
end $$;

create or replace function private.protect_event_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.assignments where event_id = old.id and work_date < private.today_kst();
  if n > 0 then
    raise exception '지난 근무 기록이 %건 있는 행사는 삭제할 수 없어요.', n using errcode = 'P0001';
  end if;
  return old;
end $$;

-- 2) 배정 넣기·덮어쓰기를 한 번에 (확인 → 저장 사이에 다른 관리자가 끼어들지 못하게 잠금)
--    빼기는 화면에서 지우는 문장 하나로 처리 (그 자체로 한 번에 실행됨)
create or replace function public.set_assignments(
  p_dates date[], p_names text[], p_shift text, p_event text,
  p_overwrite boolean default false, p_night_hours numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ev bigint; v_ids bigint[]; v_missing text[]; v_conf jsonb; v_changed int := 0; n int;
begin
  if not private.is_admin() then raise exception '관리자만 배정을 바꿀 수 있어요.' using errcode = '42501'; end if;
  if p_shift not in ('주간', '야간') then raise exception '근무는 주간 또는 야간이에요.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('team_schedule_assign'));

  select id into v_ev from events where name = p_event;
  if v_ev is null then raise exception '행사를 찾지 못했어요: %', p_event using errcode = 'P0001'; end if;
  select coalesce(array_agg(id), '{}') into v_ids from members where name = any(p_names) and active;
  select coalesce(array_agg(x), '{}') into v_missing
    from unnest(p_names) x where not exists (select 1 from members m where m.name = x and m.active);

  select coalesce(jsonb_agg(jsonb_build_object('date', a.work_date, 'name', m.name, 'current', e.name) order by a.work_date, m.sort_order), '[]')
    into v_conf
    from assignments a join members m on m.id = a.member_id join events e on e.id = a.event_id
   where a.work_date = any(p_dates) and a.member_id = any(v_ids) and a.shift = p_shift and a.event_id <> v_ev;
  if jsonb_array_length(v_conf) > 0 and not p_overwrite then
    return jsonb_build_object('ok', false, 'conflicts', v_conf);
  end if;

  update assignments set event_id = v_ev, updated_by = auth.uid()
   where work_date = any(p_dates) and member_id = any(v_ids) and shift = p_shift and event_id <> v_ev;
  get diagnostics n = row_count; v_changed := v_changed + n;

  insert into assignments (work_date, member_id, shift, event_id)
  select d, mid, p_shift, v_ev from unnest(p_dates) d cross join unnest(v_ids) mid
  on conflict (work_date, member_id, shift) do nothing;
  get diagnostics n = row_count; v_changed := v_changed + n;

  if p_shift = '야간' and p_night_hours is not null then
    insert into night_plans (work_date, event_id, hours)
    select d, v_ev, p_night_hours from unnest(p_dates) d
    on conflict (work_date, event_id) do update set hours = excluded.hours;
  end if;
  return jsonb_build_object('ok', true, 'changed', v_changed, 'missing', to_jsonb(v_missing));
end $$;
revoke all on function public.set_assignments(date[], text[], text, text, boolean, numeric) from public, anon;
grant execute on function public.set_assignments(date[], text[], text, text, boolean, numeric) to authenticated;
