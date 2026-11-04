-- (DB에는 2026-11-04 12:32에 적용돼 있었으나 저장소에 빠져 있던 변경 — 그대로 기록)
-- 팀원에 카카오 이름·프로필·연결 시각 칸 추가 (현재 웹 화면에서는 아직 쓰지 않음)
alter table public.members add column if not exists kakao_name text;
alter table public.members add column if not exists kakao_avatar text;
alter table public.members add column if not exists linked_at timestamptz;
update public.members m set kakao_name = coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name'), linked_at = now()
from auth.users u where u.id = m.user_id and m.kakao_name is null;
