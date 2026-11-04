-- 팀원이 보낸 연결 요청의 이름을 스스로 고칠 수 있게
create policy self_req_update on public.link_requests for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
