-- Surgical separation of rewarded Ads and Shortener entitlements.
-- Existing legacy ad_unlocks rows are intentionally left untouched (provider NULL).
alter table public.ad_unlocks
  add column if not exists provider text;

alter table public.ad_unlocks
  drop constraint if exists ad_unlocks_provider_check;

alter table public.ad_unlocks
  add constraint ad_unlocks_provider_check
  check (provider is null or provider = 'rewarded_ad');

drop index if exists public.ad_unlocks_user_content_idx;

create index if not exists ad_unlocks_provider_active_idx
  on public.ad_unlocks (user_id, provider, content_type, story_id, start_episode_number, end_episode_number, expires_at);


create table if not exists public.rewarded_ad_unlock_intents (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('audio','video')),
  content_id bigint not null,
  story_id bigint null,
  start_episode_number integer null,
  end_episode_number integer null,
  status text not null default 'pending' check (status in ('pending','completed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz null
);

create index if not exists rewarded_ad_unlock_intents_user_idx on public.rewarded_ad_unlock_intents (user_id, status, expires_at);

alter table public.rewarded_ad_unlock_intents enable row level security;
drop policy if exists "Deny client access - rewarded ad intents" on public.rewarded_ad_unlock_intents;
create policy "Deny client access - rewarded ad intents"
  on public.rewarded_ad_unlock_intents for all using (false) with check (false);
revoke all on table public.rewarded_ad_unlock_intents from anon, authenticated;
grant all on table public.rewarded_ad_unlock_intents to service_role;

create table if not exists public.shortener_unlocks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('audio','video','book')),
  content_id bigint not null,
  provider text not null check (provider in ('arolinks','earn4link')),
  story_id bigint null,
  start_episode_number integer null,
  end_episode_number integer null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shortener_unlocks_episode_range_check check (
    (start_episode_number is null and end_episode_number is null)
    or
    (story_id is not null and start_episode_number is not null and end_episode_number is not null
      and start_episode_number >= 1 and end_episode_number >= start_episode_number)
  )
);

create index if not exists shortener_unlocks_active_idx
  on public.shortener_unlocks (user_id, content_type, story_id, start_episode_number, end_episode_number, expires_at);

alter table public.shortener_unlocks enable row level security;

drop policy if exists "Deny client access - shortener unlocks" on public.shortener_unlocks;
create policy "Deny client access - shortener unlocks"
  on public.shortener_unlocks
  for all
  using (false)
  with check (false);

revoke all on table public.shortener_unlocks from anon, authenticated;
grant all on table public.shortener_unlocks to service_role;

alter table public.user_activity
  drop constraint if exists user_activity_event_type_check;

alter table public.user_activity
  add constraint user_activity_event_type_check check (
    event_type = any (array[
      'story_view','episode_play','episode_complete','video_play','video_complete',
      'book_open','book_page','ad_unlock_started','ad_unlock_completed',
      'shortener_unlock_started','shortener_unlock_completed'
    ])
  );
