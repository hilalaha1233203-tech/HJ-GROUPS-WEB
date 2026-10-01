-- HJ GROUPS baseline: Telegram-backed content tables.
-- This is the repository's initial schema migration. Production may already
-- contain these objects; every statement is intentionally idempotent.

create table if not exists public.stories (
  id bigint generated always as identity primary key,
  title text not null,
  genre text default 'Fantasy',
  language text default 'Tamil',
  cover_file_id text,
  telegram_message_id bigint,
  description text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.episodes (
  id bigint generated always as identity primary key,
  story_id bigint not null references public.stories(id) on delete cascade,
  number int not null,
  title text not null,
  type text not null check (type in ('audio', 'video')),
  language text default 'Tamil',
  file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (story_id, number)
);

create table if not exists public.books (
  id bigint generated always as identity primary key,
  title text not null,
  author text default '',
  description text default '',
  type text not null check (type in ('pdf', 'epub')),
  category text default 'Other',
  language text default 'Tamil',
  cover_file_id text,
  file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  created_at timestamptz not null default now()
);

create table if not exists public.video_stories (
  id bigint generated always as identity primary key,
  title text not null,
  category text default 'Action',
  language text default 'Tamil',
  cover_file_id text,
  telegram_message_id bigint,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  created_at timestamptz not null default now()
);

create table if not exists public.video_episodes (
  id bigint generated always as identity primary key,
  video_story_id bigint not null references public.video_stories(id) on delete cascade,
  number int not null,
  title text not null,
  language text default 'Tamil',
  file_id text,
  access_type text not null default 'free'
    check (access_type in ('free', 'vip', 'premium', 'ads')),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (video_story_id, number)
);

create table if not exists public.telegram_ingest_log (
  id bigint generated always as identity primary key,
  update_id bigint not null unique,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;
alter table public.episodes enable row level security;
alter table public.books enable row level security;
alter table public.video_stories enable row level security;
alter table public.video_episodes enable row level security;
alter table public.telegram_ingest_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Public read - stories') then
    create policy "Public read - stories" on public.stories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Public read - episodes') then
    create policy "Public read - episodes" on public.episodes for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Public read - books') then
    create policy "Public read - books" on public.books for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Public read - video_stories') then
    create policy "Public read - video_stories" on public.video_stories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Public read - video_episodes') then
    create policy "Public read - video_episodes" on public.video_episodes for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='stories') then
    alter publication supabase_realtime add table public.stories;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='episodes') then
    alter publication supabase_realtime add table public.episodes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='books') then
    alter publication supabase_realtime add table public.books;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='video_stories') then
    alter publication supabase_realtime add table public.video_stories;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='video_episodes') then
    alter publication supabase_realtime add table public.video_episodes;
  end if;
end $$;