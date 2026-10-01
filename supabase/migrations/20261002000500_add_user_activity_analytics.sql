-- HJ GROUPS: private, non-critical user activity telemetry.

create table if not exists public.user_activity (
  id bigint generated always as identity primary key,
  user_id uuid null references auth.users(id) on delete set null,
  session_id text null,
  event_type text not null check (event_type in (
    'story_view','episode_play','episode_complete',
    'video_play','video_complete','book_open','book_page',
    'ad_unlock_started','ad_unlock_completed'
  )),
  story_id bigint null references public.stories(id) on delete set null,
  episode_id bigint null references public.episodes(id) on delete set null,
  book_id bigint null references public.books(id) on delete set null,
  video_story_id bigint null references public.video_stories(id) on delete set null,
  video_episode_id bigint null references public.video_episodes(id) on delete set null,
  access_type text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_activity_identity_check check (
    (user_id is not null and session_id is null)
    or
    (user_id is null and session_id is not null and length(session_id) between 16 and 128)
  )
);

alter table public.user_activity enable row level security;
revoke all on public.user_activity from anon, authenticated;
grant insert on public.user_activity to anon, authenticated;

create policy "Anonymous analytics insert"
on public.user_activity for insert to anon
with check (user_id is null and session_id is not null);

create policy "Authenticated analytics insert"
on public.user_activity for insert to authenticated
with check (user_id = (select auth.uid()) and user_id is not null and session_id is null);

create policy "Admin analytics read"
on public.user_activity for select to authenticated
using ((select public.is_hj_admin()));

create index if not exists user_activity_created_at_idx on public.user_activity (created_at);
create index if not exists user_activity_event_type_created_at_idx on public.user_activity (event_type, created_at);
create index if not exists user_activity_user_id_created_at_idx on public.user_activity (user_id, created_at);
create index if not exists user_activity_session_id_created_at_idx on public.user_activity (session_id, created_at);
create index if not exists user_activity_story_id_created_at_idx on public.user_activity (story_id, created_at);
create index if not exists user_activity_episode_id_created_at_idx on public.user_activity (episode_id, created_at);

create or replace function public.get_hj_admin_analytics(p_start_at timestamptz default null, p_end_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := coalesce(p_start_at, 'epoch'::timestamptz);
  v_end timestamptz := coalesce(p_end_at, 'infinity'::timestamptz);
begin
  if not public.is_hj_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'overview', jsonb_build_object(
      'registered_users', (select count(*) from auth.users where created_at >= v_start and created_at < v_end),
      'active_logged_in_users', (select count(distinct user_id) from public.user_activity where created_at >= v_start and created_at < v_end and user_id is not null),
      'active_anonymous_sessions', (select count(distinct session_id) from public.user_activity where created_at >= v_start and created_at < v_end and session_id is not null),
      'story_views', (select count(*) from public.user_activity where created_at >= v_start and created_at < v_end and event_type='story_view'),
      'episode_plays', (select count(*) from public.user_activity where created_at >= v_start and created_at < v_end and event_type='episode_play'),
      'episode_completions', (select count(*) from public.user_activity where created_at >= v_start and created_at < v_end and event_type='episode_complete'),
      'ad_unlock_starts', (select count(*) from public.user_activity where created_at >= v_start and created_at < v_end and event_type='ad_unlock_started'),
      'ad_unlock_completions', (select count(*) from public.user_activity where created_at >= v_start and created_at < v_end and event_type='ad_unlock_completed'),
      'actual_ad_unlocks', (select count(*) from public.ad_unlocks where created_at >= v_start and created_at < v_end),
      'premium_vip_accesses', (select count(*) from public.purchases where created_at >= v_start and created_at < v_end)
    ),
    'stories', '[]'::jsonb,
    'episodes', '[]'::jsonb,
    'users', '[]'::jsonb,
    'anonymous_sessions', '[]'::jsonb,
    'ad_activity', '[]'::jsonb,
    'actual_unlocks', '[]'::jsonb
  );
end;
$$;

revoke execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.get_hj_admin_analytics(timestamptz,timestamptz) to service_role;
