-- 관리자가 다른 사람을 관리자(간부)로 지정·해제할 수 있게
create policy admin_insert on public.admins for insert to authenticated with check ((select private.is_admin()));
create policy admin_delete on public.admins for delete to authenticated using ((select private.is_admin()));
-- 마지막 관리자는 지울 수 없게
create or replace function private.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.admins) = 0 then
    raise exception '관리자가 최소 1명은 있어야 해요.' using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger keep_one_admin after delete on public.admins
  deferrable initially immediate for each row execute function private.keep_one_admin();
