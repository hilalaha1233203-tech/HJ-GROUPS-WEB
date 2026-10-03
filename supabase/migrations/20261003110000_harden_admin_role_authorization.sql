-- HJ GROUPS: harden admin authorization around Supabase app_metadata role.
-- The admin password remains owned by Supabase Auth and is never stored in the app database/source.

create or replace function public.is_hj_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $func$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$func$;

revoke all on function public.is_hj_admin() from public;
grant execute on function public.is_hj_admin() to authenticated;

-- Existing HJ admin account is assigned the non-user-editable app role by UUID.
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where id = '0f21f003-f6ac-4a68-a859-9b7bd519e278';
