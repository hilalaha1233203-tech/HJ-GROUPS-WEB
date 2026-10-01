-- HJ GROUPS: one purchase entitlement per user/story/product.
-- Ensure the entitlement table exists before creating its idempotency index,
-- so a clean migration reset is reproducible.

create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id bigint references public.stories(id) on delete cascade,
  product_type text not null default 'story',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists purchases_user_story_product_unique
  on public.purchases(user_id, story_id, product_type)
  where story_id is not null;
