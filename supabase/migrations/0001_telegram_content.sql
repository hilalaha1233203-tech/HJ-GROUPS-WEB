-- HJ GROUPS — Telegram-backed content tables
-- Run this in Supabase SQL Editor (or `supabase db push`).
--
-- Design:
--   * These tables are the PRODUCTION content source (episodes/books/
--     video episodes). Frontend reads them directly + subscribes via
--     Supabase Realtime. Existing localStorage admin content keeps
--     working unchanged for backward compatibility (see App.jsx).
--   * Only the telegram-webhook Edge Function writes to these tables,
--     using the service_role key (never exposed to the browser).
--   * `file_id` / `cover_file_id` store Telegram's file_id. The
--     browser never talks to Telegram directly — it always requests
--     /functions/v1/telegram-file?file_id=... from OUR backend, which
--     resolves + streams the bytes server-side on every request (so
--     Telegram's temporary file paths are never a problem).

create table if not exists stories (
  id bigint generated always as identity primary key,
  title text not null,
  genre text default 'Fantasy',
  cover_file_id text,
  description text default '',
  created_at timestamptz not null default now()
);

create table if not exists episodes (
  id bigint generated always as identity primary key,
  story_id bigint not null references stories(id) on delete cascade,
  number int not null,
  title text not null,
  type text not null check (type in ('audio', 'video')),
  file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (story_id, number)
);

create table if not exists books (
  id bigint generated always as identity primary key,
  title text not null,
  author text default '',
  description text default '',
  type text not null check (type in ('pdf', 'epub')),
  category text default 'Other',
  cover_file_id text,
  file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  created_at timestamptz not null default now()
);

create table if not exists video_stories (
  id bigint generated always as identity primary key,
  title text not null,
  category text default 'Action',
  cover_file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  created_at timestamptz not null default now()
);

create table if not exists video_episodes (
  id bigint generated always as identity primary key,
  video_story_id bigint not null references video_stories(id) on delete cascade,
  number int not null,
  title text not null,
  file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (video_story_id, number)
);

-- Raw log of every Telegram update the webhook has processed —
-- useful for debugging admin uploads and for idempotency (Telegram
-- can redeliver the same update).
create table if not exists telegram_ingest_log (
  id bigint generated always as identity primary key,
  update_id bigint not null unique,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- Public (anon) can only ever READ. Only the service_role key
-- (used exclusively inside the telegram-webhook Edge Function,
-- never the browser) can write.
-- =========================================================

alter table stories enable row level security;
alter table episodes enable row level security;
alter table books enable row level security;
alter table video_stories enable row level security;
alter table video_episodes enable row level security;
alter table telegram_ingest_log enable row level security;

create policy "Public read - stories" on stories for select to anon, authenticated using (true);
create policy "Public read - episodes" on episodes for select to anon, authenticated using (true);
create policy "Public read - books" on books for select to anon, authenticated using (true);
create policy "Public read - video_stories" on video_stories for select to anon, authenticated using (true);
create policy "Public read - video_episodes" on video_episodes for select to anon, authenticated using (true);

-- telegram_ingest_log is intentionally not readable by anon/authenticated —
-- it's an internal debug log, service_role only (RLS default-denies
-- everyone else once enabled with no policy for them).

-- =========================================================
-- REALTIME
-- =========================================================

alter publication supabase_realtime add table stories;
alter publication supabase_realtime add table episodes;
alter publication supabase_realtime add table books;
alter publication supabase_realtime add table video_stories;
alter publication supabase_realtime add table video_episodes;
