-- HJ GROUPS Web Push + Library notification targeting
create table if not exists public.user_story_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id bigint not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, story_id)
);
create index if not exists user_story_library_story_idx on public.user_story_library(story_id, user_id);

create table if not exists public.web_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text not null default '',
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_push_subscription_endpoint_len check (length(endpoint) between 20 and 4096),
  constraint web_push_subscription_shape check (jsonb_typeof(subscription) = 'object' and subscription ? 'endpoint' and subscription ? 'keys')
);
create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions(user_id, active);
create index if not exists web_push_subscriptions_active_idx on public.web_push_subscriptions(active, updated_at desc);

create table if not exists public.web_push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_episodes boolean not null default true,
  new_stories boolean not null default true,
  promotions boolean not null default true,
  announcements boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.web_push_episode_dispatches (
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id bigint not null references public.episodes(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

create table if not exists public.web_push_notifications (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('promotion','announcement','new_story','new_episode')),
  title text not null,
  message text not null,
  target_url text not null,
  target_type text not null,
  target_story_id bigint references public.stories(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.web_push_dispatch_state (
  id integer primary key check (id = 1),
  last_episode_created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.web_push_dispatch_state(id, last_episode_created_at)
values (1, now())
on conflict (id) do nothing;

alter table public.user_story_library enable row level security;
alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_preferences enable row level security;
alter table public.web_push_episode_dispatches enable row level security;
alter table public.web_push_notifications enable row level security;
alter table public.web_push_dispatch_state enable row level security;

revoke all on public.user_story_library from anon;
revoke all on public.web_push_subscriptions from anon;
revoke all on public.web_push_preferences from anon;
revoke all on public.web_push_episode_dispatches from anon;
revoke all on public.web_push_notifications from anon;
revoke all on public.web_push_dispatch_state from anon;

grant select, insert, update, delete on public.user_story_library to authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
grant select, insert, update, delete on public.web_push_preferences to authenticated;
grant select on public.web_push_notifications to authenticated;

drop policy if exists user_story_library_owner_select on public.user_story_library;
create policy user_story_library_owner_select on public.user_story_library for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists user_story_library_owner_insert on public.user_story_library;
create policy user_story_library_owner_insert on public.user_story_library for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists user_story_library_owner_delete on public.user_story_library;
create policy user_story_library_owner_delete on public.user_story_library for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists web_push_subscriptions_owner_all on public.web_push_subscriptions;
create policy web_push_subscriptions_owner_all on public.web_push_subscriptions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists web_push_preferences_owner_all on public.web_push_preferences;
create policy web_push_preferences_owner_all on public.web_push_preferences for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists web_push_notifications_admin_select on public.web_push_notifications;
create policy web_push_notifications_admin_select on public.web_push_notifications for select to authenticated using (public.is_hj_admin());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_story_library') then
    alter publication supabase_realtime add table public.user_story_library;
  end if;
end $$;
