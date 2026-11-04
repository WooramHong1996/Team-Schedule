-- 팀 스케줄: 기본 구조 + 권한(RLS)
-- 원칙
--  * 관리자: 모든 데이터 읽기/쓰기
--  * 팀원: 카카오 로그인 → 관리자가 팀원 명단과 연결(승인)한 뒤부터
--          본인 배정 + "같은 날 같은 행사"에 함께 들어간 사람 이름만 볼 수 있음
--  * 급여·연락처·메모는 관리자만 (본인 일당은 본인에게만)

create extension if not exists btree_gist;

-- ---------- 테이블 ----------
create table public.members (
  id          bigint generated always as identity primary key,
  name        text not null unique check (length(trim(name)) > 0),
  cert        text check (cert in ('있음','없음')),          -- null = 모름
  note        text,
  rate_out    integer,                                       -- 일당(외부)
  rate_exh    integer,                                       -- 일당(전시)
  rate_hour   integer,                                       -- 시급(야간 시간제)
  user_id     uuid unique references auth.users(id) on delete set null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.events (
  id          bigint generated always as identity primary key,
  name        text not null unique check (length(trim(name)) > 0),
  type        text check (type in ('전시','외부')),
  start_date  date not null,
  end_date    date not null,
  place       text,
  manager     text,
  contact     text,
  memo        text,
  need_day    integer check (need_day >= 0),
  need_night  integer check (need_night >= 0),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

-- 배정: 한 사람은 같은 날 같은 근무(주간/야간)에 행사 하나만
create table public.assignments (
  id          bigint generated always as identity primary key,
  work_date   date not null,
  member_id   bigint not null references public.members(id) on delete cascade,
  shift       text not null check (shift in ('주간','야간')),
  event_id    bigint not null references public.events(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  unique (work_date, member_id, shift)
);
create index on public.assignments (event_id, work_date);
create index on public.assignments (member_id, work_date);

-- 야간 계획 (hours 가 null 이면 일당, 숫자면 시간 × 시급)
create table public.night_plans (
  work_date   date not null,
  event_id    bigint not null references public.events(id) on delete cascade,
  hours       numeric(4,1) check (hours >= 0 and hours <= 24),
  memo        text,
  primary key (work_date, event_id)
);

-- 그날만 다른 필요 인원
create table public.need_overrides (
  work_date   date not null,
  event_id    bigint not null references public.events(id) on delete cascade,
  need_day    integer check (need_day >= 0),
  need_night  integer check (need_night >= 0),
  memo        text,
  primary key (work_date, event_id)
);

-- 관리자 목록
create table public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- 처음 로그인한 사람의 연결 요청 (관리자가 팀원과 연결하면 지움)
create table public.link_requests (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  claimed_name  text,                -- 본인이 적은 이름
  requested_at  timestamptz not null default now()
);

-- 변경 기록 (누가 언제 무엇을)
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid default auth.uid(),
  tbl         text not null,
  action      text not null,
  old_row     jsonb,
  new_row     jsonb
);

-- ---------- 도우미 함수 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.my_member_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and active;
$$;

-- ---------- 권한 ----------
alter table public.members        enable row level security;
alter table public.events         enable row level security;
alter table public.assignments    enable row level security;
alter table public.night_plans    enable row level security;
alter table public.need_overrides enable row level security;
alter table public.admins         enable row level security;
alter table public.link_requests  enable row level security;
alter table public.audit_log      enable row level security;

-- 관리자: 전부
create policy admin_all on public.members        for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.events         for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.assignments    for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.night_plans    for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.need_overrides for all using (public.is_admin()) with check (public.is_admin());
create policy admin_read on public.admins        for select using (public.is_admin());
create policy admin_all on public.link_requests  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_read on public.audit_log     for select using (public.is_admin());

-- 팀원: 본인 정보 / 본인 배정만 (함께 일하는 사람은 아래 함수로)
create policy self_read on public.members     for select using (user_id = auth.uid());
create policy self_read on public.assignments for select using (member_id = public.my_member_id());

-- 연결 요청: 본인 것만 만들고 볼 수 있음
create policy self_req_insert on public.link_requests for insert with check (user_id = auth.uid());
create policy self_req_read   on public.link_requests for select using (user_id = auth.uid());

-- ---------- 팀원 화면용 함수 ----------
-- 기간 안의 내 일정 + 같은 날 같은 행사에 들어간 사람 이름
create or replace function public.my_schedule(p_from date, p_to date)
returns table (
  work_date date, event_id bigint, event_name text, event_type text, place text,
  start_date date, end_date date, shift text, member_name text, cert text, is_me boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_member_id() as mid),
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

-- ---------- 변경 기록 트리거 ----------
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tbl, action, old_row, new_row)
  values (tg_table_name, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_members        after insert or update or delete on public.members        for each row execute function public.log_change();
create trigger audit_events         after insert or update or delete on public.events         for each row execute function public.log_change();
create trigger audit_assignments    after insert or update or delete on public.assignments    for each row execute function public.log_change();
create trigger audit_night_plans    after insert or update or delete on public.night_plans    for each row execute function public.log_change();
create trigger audit_need_overrides after insert or update or delete on public.need_overrides for each row execute function public.log_change();
