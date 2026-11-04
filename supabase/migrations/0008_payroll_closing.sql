-- 월 마감: 그 달 급여를 그대로 저장(스냅샷)하고, 그 달 배정·야간 계획은 잠금
create table public.payroll_closings (
  month       date primary key check (extract(day from month) = 1),
  closed_at   timestamptz not null default now(),
  closed_by   uuid default auth.uid(),
  closed_by_name text,
  total       bigint not null default 0
);
create table public.payroll_lines (
  month       date not null references public.payroll_closings(month) on delete cascade,
  member_id   bigint,
  member_name text not null,
  days        int not null default 0,
  exh_count   int not null default 0,
  out_count   int not null default 0,
  etc_count   int not null default 0,
  hour_count  int not null default 0,
  hours       numeric(6,1) not null default 0,
  night_count int not null default 0,
  rate_exh    int, rate_out int, rate_hour int,
  pay         bigint not null default 0,
  primary key (month, member_name)
);
alter table public.payroll_closings enable row level security;
alter table public.payroll_lines enable row level security;
create policy admin_read on public.payroll_closings for select to authenticated using ((select private.is_admin()));
create policy admin_read on public.payroll_lines    for select to authenticated using ((select private.is_admin()));
-- 마감 취소 = 관리자가 마감 줄을 지움 (급여 줄은 함께 지워짐)
create policy admin_reopen on public.payroll_closings for delete to authenticated using ((select private.is_admin()));

create or replace function private.block_closed_month() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  foreach d in array array[case when tg_op <> 'INSERT' then old.work_date end, case when tg_op <> 'DELETE' then new.work_date end] loop
    if d is not null and exists (select 1 from public.payroll_closings where month = date_trunc('month', d)::date) then
      raise exception '%월은 급여 마감된 달이라 바꿀 수 없어요. 인원·급여 화면에서 마감을 취소한 뒤 고쳐 주세요.', extract(month from d)::int using errcode = 'P0001';
    end if;
  end loop;
  return coalesce(new, old);
end $$;
create trigger block_closed_month before insert or update or delete on public.assignments
  for each row execute function private.block_closed_month();
create trigger block_closed_month before insert or update or delete on public.night_plans
  for each row execute function private.block_closed_month();

-- 마감하기 (관리자만): 배정 1칸 = 1회 × 일당(전시/외부), 야간 시간이 정해진 야간은 시간 × 시급
create or replace function public.close_month(p_month date) returns bigint
language plpgsql security definer set search_path = public as $$
declare m0 date := date_trunc('month', p_month)::date; m1 date := (date_trunc('month', p_month) + interval '1 month')::date; t bigint;
begin
  if not private.is_admin() then raise exception '관리자만 마감할 수 있어요.' using errcode = '42501'; end if;
  if exists (select 1 from payroll_closings where month = m0) then raise exception '이미 마감된 달이에요.' using errcode = 'P0001'; end if;
  insert into payroll_closings (month, closed_by, closed_by_name)
    values (m0, auth.uid(), (select name from members where user_id = auth.uid()));
  insert into payroll_lines (month, member_id, member_name, days, exh_count, out_count, etc_count, hour_count, hours, night_count, rate_exh, rate_out, rate_hour, pay)
  select m0, m.id, m.name, x.days, x.exh, x.outc, x.etc, x.hr, x.hours, x.nights, m.rate_exh, m.rate_out, m.rate_hour,
         x.exh * coalesce(m.rate_exh, 0) + x.outc * coalesce(m.rate_out, 0) + round(x.hours * coalesce(m.rate_hour, 0))
  from (
    select a.member_id,
      count(distinct a.work_date) days,
      count(*) filter (where not h.hourly and e.type = '전시') exh,
      count(*) filter (where not h.hourly and e.type = '외부') outc,
      count(*) filter (where not h.hourly and coalesce(e.type, '') not in ('전시', '외부')) etc,
      count(*) filter (where h.hourly) hr,
      coalesce(sum(np.hours) filter (where h.hourly), 0) hours,
      count(*) filter (where a.shift = '야간') nights
    from assignments a
    join events e on e.id = a.event_id
    left join night_plans np on np.event_id = a.event_id and np.work_date = a.work_date
    cross join lateral (select (a.shift = '야간' and coalesce(np.hours, 0) > 0) as hourly) h
    where a.work_date >= m0 and a.work_date < m1
    group by a.member_id
  ) x join members m on m.id = x.member_id;
  select coalesce(sum(pay), 0) into t from payroll_lines where month = m0;
  update payroll_closings set total = t where month = m0;
  return t;
end $$;
revoke all on function public.close_month(date) from public, anon;
grant execute on function public.close_month(date) to authenticated;
