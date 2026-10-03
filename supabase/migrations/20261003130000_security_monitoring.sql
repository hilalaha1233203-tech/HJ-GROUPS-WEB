create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.security_scans (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.security_findings (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  severity text not null check (severity in ('critical','high','medium','low','informational')),
  category text not null check (category in ('security','performance','bug','dependency','infrastructure')),
  status text not null default 'new' check (status in ('new','investigating','confirmed','fix_required','fixed','retested','closed','not_verified')),
  component text not null,
  location text,
  description text not null,
  impact text,
  evidence text,
  root_cause text,
  recommended_fix text,
  verification text,
  recurring_count integer not null default 1,
  last_scan_id bigint references public.security_scans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_findings_status_idx on public.security_findings(status,severity);
create index if not exists security_findings_last_detected_idx on public.security_findings(last_detected_at desc);

alter table public.security_scans enable row level security;
alter table public.security_findings enable row level security;
revoke all on public.security_scans from anon, authenticated;
revoke all on public.security_findings from anon, authenticated;
grant select on public.security_scans to authenticated;
grant select on public.security_findings to authenticated;

create or replace function public.is_hj_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, auth
as $
  select coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false);
$$;

drop policy if exists security_scans_admin_select on public.security_scans;
create policy security_scans_admin_select on public.security_scans for select to authenticated using (public.is_hj_admin());
drop policy if exists security_findings_admin_select on public.security_findings;
create policy security_findings_admin_select on public.security_findings for select to authenticated using (public.is_hj_admin());

create or replace function public.security_monitor_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare result jsonb;
begin
  if current_user <> 'postgres' and coalesce((current_setting('request.jwt.claims',true)::jsonb->'app_metadata'->>'role'),'') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'tables', coalesce((select jsonb_agg(jsonb_build_object('table_name',tablename,'rls_enabled',rowsecurity)) from pg_tables where schemaname='public'), '[]'::jsonb),
    'security_definer_functions', coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'schema',n.nspname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef), '[]'::jsonb),
    'public_execute_security_definer', coalesce((select jsonb_agg(jsonb_build_object('name',p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.rolname='public' where n.nspname='public' and p.prosecdef and has_function_privilege(r.oid,p.oid,'EXECUTE')), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(jsonb_build_object('table_name',tablename,'policy_name',policyname,'cmd',cmd,'roles',roles,'qual',qual,'with_check',with_check)) from pg_policies where schemaname='public'), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.security_monitor_snapshot() from public, anon, authenticated;
grant execute on function public.security_monitor_snapshot() to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name='hj_security_monitor_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'hj_security_monitor_key','Internal HJ GROUPS daily security monitor authentication key');
  end if;
end $$;

create or replace function public.get_security_monitor_key()
returns text
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare value text;
begin
  if current_user <> 'postgres' and coalesce((current_setting('request.jwt.claims',true)::jsonb->>'role'),'') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  select decrypted_secret into value from vault.decrypted_secrets where name='hj_security_monitor_key';
  return value;
end $$;
revoke all on function public.get_security_monitor_key() from public, anon, authenticated;
grant execute on function public.get_security_monitor_key() to service_role;

select cron.schedule(
  'hj-groups-daily-security-scan',
  '15 3 * * *',
  $$ select net.http_post(
    url := 'https://yajkfglagnyvenddyvok.supabase.co/functions/v1/hj-security-monitor',
    headers := jsonb_build_object('Content-Type','application/json','x-hj-monitor-key',(select decrypted_secret from vault.decrypted_secrets where name='hj_security_monitor_key')),
    body := jsonb_build_object('scheduled',true,'time',now())
  ) $$ 
) where not exists (select 1 from cron.job where jobname='hj-groups-daily-security-scan');
