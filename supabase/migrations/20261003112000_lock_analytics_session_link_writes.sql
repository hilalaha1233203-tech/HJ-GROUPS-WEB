-- HJ GROUPS: lock analytics session-link writes to the signed-in owner.
create or replace function public.link_analytics_session(p_session_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if v_user_id is null then
    return false;
  end if;

  if length(v_session_id) < 16 or length(v_session_id) > 128 then
    return false;
  end if;

  insert into public.analytics_session_links(session_id, user_id)
  values (v_session_id, v_user_id)
  on conflict (session_id, user_id) do nothing;

  return true;
end;
$function$;

revoke all on function public.link_analytics_session(text) from public;
grant execute on function public.link_analytics_session(text) to authenticated;

alter table public.analytics_session_links enable row level security;

drop policy if exists "Authenticated insert own analytics session links" on public.analytics_session_links;
create policy "Authenticated insert own analytics session links"
on public.analytics_session_links
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Admin read analytics session links" on public.analytics_session_links;
create policy "Admin read analytics session links"
on public.analytics_session_links
for select
to authenticated
using ((select public.is_hj_admin()));
