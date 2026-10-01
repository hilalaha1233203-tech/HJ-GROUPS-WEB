-- HJ GROUPS: range-based temporary Ads entitlements for audio/video episodes.
-- Legacy single-episode rows remain valid with NULL range fields.

create table if not exists public.ad_unlocks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('audio','video','book')),
  content_id bigint not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ad_unlocks_user_content_idx
  on public.ad_unlocks (user_id, content_type, content_id);

create index if not exists ad_unlocks_expiry_idx
  on public.ad_unlocks (expires_at);

alter table public.ad_unlocks
  add column if not exists story_id bigint,
  add column if not exists start_episode_number integer,
  add column if not exists end_episode_number integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ad_unlocks_episode_range_check'
      and conrelid = 'public.ad_unlocks'::regclass
  ) then
    alter table public.ad_unlocks
      add constraint ad_unlocks_episode_range_check
      check (
        (start_episode_number is null and end_episode_number is null)
        or (
          story_id is not null
          and start_episode_number is not null
          and end_episode_number is not null
          and start_episode_number >= 1
          and end_episode_number >= start_episode_number
        )
      );
  end if;
end $$;

create index if not exists ad_unlocks_user_story_range_idx
  on public.ad_unlocks (
    user_id,
    content_type,
    story_id,
    start_episode_number,
    end_episode_number,
    expires_at
  );

alter table public.ad_unlocks enable row level security;
revoke all on public.ad_unlocks from anon, authenticated;
grant all on public.ad_unlocks to service_role;
