-- Keep the Web Push dispatcher cursor server-only; browser roles never need access.
alter table public.web_push_dispatch_state enable row level security;
revoke all on table public.web_push_dispatch_state from anon, authenticated;
revoke all on table public.web_push_dispatch_state from public;
