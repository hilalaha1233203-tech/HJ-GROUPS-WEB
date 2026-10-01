-- HJ GROUPS: one purchase entitlement per user/story/product.
create unique index if not exists purchases_user_story_product_unique
  on public.purchases(user_id, story_id, product_type)
  where story_id is not null;