-- Streaming media source mapping owned by HJ Web.
-- Intentionally contains no data inserts. Populate only verified mappings.

create table if not exists public.streaming_media_sources (
  id bigint generated always as identity primary key,
  content_kind text not null check (content_kind in ('audio','video','book')),
  content_id bigint,
  source_group text,
  part_index integer not null default 0 check (part_index >= 0),
  part_count integer not null default 1 check (part_count >= 1),
  source_telegram_message_id bigint not null check (source_telegram_message_id > 0),
  media_kind text not null check (media_kind in ('audio','video','document')),
  file_id text not null,
  file_unique_id text,
  file_name text,
  mime_type text,
  file_size bigint,
  assembled_file_size bigint,
  duration numeric,
  width integer,
  height integer,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  original_telegram_message_id bigint,
  constraint streaming_media_sources_part_order_check
    check (part_index < part_count),
  constraint streaming_media_sources_original_message_check
    check (original_telegram_message_id is null or original_telegram_message_id > 0)
);

create index if not exists streaming_media_sources_content_idx
  on public.streaming_media_sources (content_kind, content_id);

create index if not exists streaming_media_sources_group_idx
  on public.streaming_media_sources (source_group, part_index);

create index if not exists streaming_media_sources_original_message_idx
  on public.streaming_media_sources (media_kind, original_telegram_message_id, part_index);

create unique index if not exists streaming_media_sources_original_part_unique
  on public.streaming_media_sources (media_kind, original_telegram_message_id, part_index);

create unique index if not exists streaming_media_sources_source_message_kind_unique
  on public.streaming_media_sources (media_kind, source_telegram_message_id);

alter table public.streaming_media_sources enable row level security;

revoke all on public.streaming_media_sources from anon;
revoke all on public.streaming_media_sources from authenticated;
grant select, insert, update, delete on public.streaming_media_sources to service_role;

drop policy if exists "service_role_only_streaming_media_sources"
  on public.streaming_media_sources;

create policy "service_role_only_streaming_media_sources"
  on public.streaming_media_sources
  for all
  to service_role
  using (true)
  with check (true);
