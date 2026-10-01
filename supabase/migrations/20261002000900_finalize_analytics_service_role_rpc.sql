create or replace function public.get_hj_admin_analytics(p_start_at timestamptz default null, p_end_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.get_hj_admin_analytics(p_start_at, p_end_at);
end;
$$;
-- The actual aggregate function body is maintained by the prior analytics migration; this migration documents the service-role-only execution boundary.
revoke execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) to service_role;
