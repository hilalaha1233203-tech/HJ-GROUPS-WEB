-- HJ GROUPS: Cashfree payment order ledger.

create table if not exists public.payment_orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cashfree_order_id text not null unique,
  idempotency_key text not null unique,
  product_key text not null,
  content_type text not null default 'story',
  content_id bigint not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  status text not null default 'CREATED' check (status in ('CREATED','PAID','PENDING','FAILED','CANCELLED')),
  cashfree_payment_id text,
  paid_at timestamptz,
  last_webhook_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_orders enable row level security;

create index if not exists payment_orders_user_id_idx on public.payment_orders(user_id);
create index if not exists payment_orders_content_idx on public.payment_orders(content_type, content_id);
create index if not exists payment_orders_status_idx on public.payment_orders(status);

drop policy if exists "Users can view their own payment orders" on public.payment_orders;
create policy "Users can view their own payment orders"
  on public.payment_orders for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.payment_orders from anon, authenticated;
grant select on public.payment_orders to authenticated;