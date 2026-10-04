-- HJ GROUPS: server-authoritative per-user VIP grants.
create table if not exists public.user_vip_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  note text not null default '',
  constraint user_vip_grants_expiry_check check (expires_at is null or expires_at > granted_at)
);

create index if not exists user_vip_grants_expires_at_idx
  on public.user_vip_grants (expires_at);

alter table public.user_vip_grants enable row level security;
revoke all on table public.user_vip_grants from anon, authenticated;
grant select, insert, update, delete on table public.user_vip_grants to authenticated;

drop policy if exists user_vip_grants_admin_select on public.user_vip_grants;
create policy user_vip_grants_admin_select
on public.user_vip_grants
for select
to authenticated
using ((select public.is_hj_admin()));

drop policy if exists user_vip_grants_admin_insert on public.user_vip_grants;
create policy user_vip_grants_admin_insert
on public.user_vip_grants
for insert
to authenticated
with check ((select public.is_hj_admin()));

drop policy if exists user_vip_grants_admin_update on public.user_vip_grants;
create policy user_vip_grants_admin_update
on public.user_vip_grants
for update
to authenticated
using ((select public.is_hj_admin()))
with check ((select public.is_hj_admin()));

drop policy if exists user_vip_grants_admin_delete on public.user_vip_grants;
create policy user_vip_grants_admin_delete
on public.user_vip_grants
for delete
to authenticated
using ((select public.is_hj_admin()));
