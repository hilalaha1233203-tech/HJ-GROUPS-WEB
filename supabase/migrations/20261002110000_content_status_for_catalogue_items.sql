alter table public.stories
  add column if not exists status text not null default 'ongoing';

alter table public.stories
  drop constraint if exists stories_status_check;

alter table public.stories
  add constraint stories_status_check
  check (status in ('ongoing','completed','upcoming'));

alter table public.video_stories
  add column if not exists status text not null default 'ongoing';

alter table public.video_stories
  drop constraint if exists video_stories_status_check;

alter table public.video_stories
  add constraint video_stories_status_check
  check (status in ('ongoing','completed','upcoming'));

alter table public.books
  add column if not exists status text not null default 'ongoing';

alter table public.books
  drop constraint if exists books_status_check;

alter table public.books
  add constraint books_status_check
  check (status in ('ongoing','completed','upcoming'));
