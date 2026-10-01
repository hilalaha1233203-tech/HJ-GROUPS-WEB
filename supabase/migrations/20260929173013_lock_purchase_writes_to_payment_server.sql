-- HJ GROUPS: purchases are activated only by the verified payment server.

create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id bigint references public.stories(id) on delete cascade,
  product_type text not null default 'story',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

drop policy if exists "Users insert own purchases" on public.purchases;
revoke insert, update, delete on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;