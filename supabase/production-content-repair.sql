-- HJ GROUPS production Supabase repair/setup
-- Run ONCE in the Web Player Supabase SQL Editor.
-- Safe to re-run for the columns/tables/policies it manages.

begin;

-- -----------------------------
-- Stories / episodes (upgrade older schema)
-- -----------------------------
alter table public.stories add column if not exists cover_url text;
alter table public.stories add column if not exists cover_path text;
alter table public.stories add column if not exists telegram_message_id bigint;

alter table public.episodes add column if not exists number int;
alter table public.episodes add column if not exists type text default 'audio';
alter table public.episodes add column if not exists file_url text;
alter table public.episodes add column if not exists file_path text;
alter table public.episodes add column if not exists telegram_message_id bigint;
alter table public.episodes add column if not exists access_type text default 'free';
alter table public.episodes add column if not exists available boolean default true;
alter table public.episodes add column if not exists created_at timestamptz not null default now();

-- Older installations used episode_number/audio_url.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='episodes' and column_name='episode_number'
  ) then
    execute 'update public.episodes set number = coalesce(number, episode_number) where number is null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='episodes' and column_name='audio_url'
  ) then
    execute 'update public.episodes set file_url = coalesce(file_url, audio_url) where file_url is null';
  end if;
end $$;

-- -----------------------------
-- Books
-- -----------------------------
create table if not exists public.books (
  id bigint generated always as identity primary key,
  title text not null,
  author text default '',
  description text default '',
  type text not null default 'pdf' check (type in ('pdf','epub')),
  category text default 'Other',
  cover_file_id text,
  cover_url text,
  cover_path text default '',
  file_id text,
  file_url text,
  file_path text default '',
  telegram_message_id bigint,
  volumes jsonb not null default '[]'::jsonb,
  access_type text not null default 'free'
    check (access_type in ('free','vip','premium','ads')),
  created_at timestamptz not null default now()
);
alter table public.books add column if not exists cover_url text;
alter table public.books add column if not exists cover_path text default '';
alter table public.books add column if not exists file_url text;
alter table public.books add column if not exists file_path text default '';
alter table public.books add column if not exists telegram_message_id bigint;
alter table public.books add column if not exists volumes jsonb not null default '[]'::jsonb;

-- -----------------------------
-- Video stories / episodes
-- -----------------------------
create table if not exists public.video_stories (
  id bigint generated always as identity primary key,
  title text not null,
  category text default 'Action',
  cover_file_id text,
  cover_url text,
  cover_path text default '',
  telegram_message_id bigint,
  access_type text not null default 'free'
    check (access_type in ('free','vip','premium','ads')),
  created_at timestamptz not null default now()
);
alter table public.video_stories add column if not exists cover_url text;
alter table public.video_stories add column if not exists cover_path text default '';
alter table public.video_stories add column if not exists telegram_message_id bigint;

create table if not exists public.video_episodes (
  id bigint generated always as identity primary key,
  video_story_id bigint not null references public.video_stories(id) on delete cascade,
  number int not null,
  title text not null,
  type text not null default 'video' check (type='video'),
  file_id text,
  file_url text,
  file_path text default '',
  telegram_message_id bigint,
  access_type text not null default 'free'
    check (access_type in ('free','vip','premium','ads')),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (video_story_id, number)
);
alter table public.video_episodes add column if not exists type text default 'video';
alter table public.video_episodes add column if not exists file_url text;
alter table public.video_episodes add column if not exists file_path text default '';
alter table public.video_episodes add column if not exists telegram_message_id bigint;

-- -----------------------------
-- Purchases (required by current app read path)
-- -----------------------------
create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id bigint references public.stories(id) on delete cascade,
  product_type text not null default 'story',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------------
-- RLS + grants
-- -----------------------------
alter table public.stories enable row level security;
alter table public.episodes enable row level security;
alter table public.books enable row level security;
alter table public.video_stories enable row level security;
alter table public.video_episodes enable row level security;
alter table public.purchases enable row level security;

grant select on public.stories, public.episodes, public.books,
  public.video_stories, public.video_episodes to anon, authenticated;

grant insert, update, delete on public.stories, public.episodes,
  public.books, public.video_stories, public.video_episodes to authenticated;

grant select, insert on public.purchases to authenticated;

do $$
begin
  -- Public read
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

  -- Admin writes
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Admin insert stories') then
    create policy "Admin insert stories" on public.stories for insert to authenticated
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Admin update stories') then
    create policy "Admin update stories" on public.stories for update to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com')
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stories' and policyname='Admin delete stories') then
    create policy "Admin delete stories" on public.stories for delete to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Admin insert episodes') then
    create policy "Admin insert episodes" on public.episodes for insert to authenticated
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Admin update episodes') then
    create policy "Admin update episodes" on public.episodes for update to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com')
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='episodes' and policyname='Admin delete episodes') then
    create policy "Admin delete episodes" on public.episodes for delete to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Admin insert books') then
    create policy "Admin insert books" on public.books for insert to authenticated
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Admin update books') then
    create policy "Admin update books" on public.books for update to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com')
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='books' and policyname='Admin delete books') then
    create policy "Admin delete books" on public.books for delete to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Admin insert video_stories') then
    create policy "Admin insert video_stories" on public.video_stories for insert to authenticated
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Admin update video_stories') then
    create policy "Admin update video_stories" on public.video_stories for update to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com')
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_stories' and policyname='Admin delete video_stories') then
    create policy "Admin delete video_stories" on public.video_stories for delete to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Admin insert video_episodes') then
    create policy "Admin insert video_episodes" on public.video_episodes for insert to authenticated
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Admin update video_episodes') then
    create policy "Admin update video_episodes" on public.video_episodes for update to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com')
      with check ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_episodes' and policyname='Admin delete video_episodes') then
    create policy "Admin delete video_episodes" on public.video_episodes for delete to authenticated
      using ((select auth.jwt()->>'email')='hilalaha1233203@gmail.com');
  end if;

  -- Purchases belong to the signed-in user.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchases' and policyname='Users read own purchases') then
    create policy "Users read own purchases" on public.purchases for select to authenticated
      using ((select auth.uid())=user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='purchases' and policyname='Users insert own purchases') then
    create policy "Users insert own purchases" on public.purchases for insert to authenticated
      with check ((select auth.uid())=user_id);
  end if;
end $$;

-- -----------------------------
-- Realtime
-- -----------------------------
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

commit;
