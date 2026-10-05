-- HJ GROUPS: allow authenticated users to write only through the existing RLS policy.
grant insert on table public.analytics_session_links to authenticated;
