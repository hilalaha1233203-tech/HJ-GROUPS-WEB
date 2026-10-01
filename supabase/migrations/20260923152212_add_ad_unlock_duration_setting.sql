-- HJ GROUPS: configurable Ads unlock duration.

create table if not exists public.content_access_settings (
  id text primary key default 'default',
  audio_free_episodes integer not null default 10 check (audio_free_episodes >= 0 and audio_free_episodes <= 100),
  video_free_episodes integer not null default 10 check (video_free_episodes >= 0 and video_free_episodes <= 100),
  book_free_pages integer not null default 50 check (book_free_pages >= 0 and book_free_pages <= 500),
  updated_at timestamptz not null default now()
);

alter table public.content_access_settings
  add column if not exists ad_unlock_duration_minutes integer not null default 360
  check (ad_unlock_duration_minutes between 1 and 1440);

alter table public.content_access_settings enable row level security;
grant select on public.content_access_settings to anon, authenticated;
grant insert, update, delete on public.content_access_settings to authenticated;

insert into public.content_access_settings (id, audio_free_episodes, video_free_episodes, book_free_pages, ad_unlock_duration_minutes)
values ('default', 10, 10, 50, 360)
on conflict (id) do nothing;