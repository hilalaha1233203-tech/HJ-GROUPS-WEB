revoke execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) to service_role;
