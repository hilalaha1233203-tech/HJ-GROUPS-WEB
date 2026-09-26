-- HJ GROUPS temporary shortener unlock schema
-- Applied to production separately; keep this file as the reproducible SQL definition.

create table if not exists public.shortener_links (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('audio','video','book')),
  content_id bigint not null,
  provider text not null check (provider in ('arolinks','earn4link')),
  short_url text not null,
  destination_path text not null,
  provider_chain text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shortener_links_active_content_idx
  on public.shortener_links (content_type, content_id)
  where active = true;

create index if not exists shortener_links_provider_idx
  on public.shortener_links (provider);

alter table public.shortener_links enable row level security;
revoke all on public.shortener_links from anon, authenticated;
grant all on public.shortener_links to service_role;

create table if not exists public.ad_unlock_intents (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('audio','video','book')),
  content_id bigint not null,
  provider text not null check (provider in ('arolinks','earn4link')),
  destination_path text not null,
  return_path text not null default '/',
  status text not null default 'pending' check (status in ('pending','completed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists ad_unlock_intents_user_content_idx
  on public.ad_unlock_intents (user_id, content_type, content_id, status);

create index if not exists ad_unlock_intents_expiry_idx
  on public.ad_unlock_intents (expires_at)
  where status = 'pending';

alter table public.ad_unlock_intents enable row level security;
revoke all on public.ad_unlock_intents from anon, authenticated;
grant all on public.ad_unlock_intents to service_role;

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

alter table public.ad_unlocks enable row level security;
revoke all on public.ad_unlocks from anon, authenticated;
grant all on public.ad_unlocks to service_role;
