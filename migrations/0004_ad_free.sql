-- Monetization moves from metered energy to ads: playing is free and unlimited, an ad break follows
-- every finished session (src/features/ads), and one purchase removes the breaks for good.
-- energy_wallets and energy_ledger are no longer written; they stay as a record of what was sold.

-- set once, by the order that bought it (worker/payments.ts); admins never see ads either
alter table profiles add column ad_free_at text;

-- The store: the energy packs and Plus are retired (kept, inactive, for the orders that point at
-- them) and the ad-free pass is added. Widening the kind check means rebuilding store_products.
-- Dropping a table that payment_orders still references breaks its foreign key even when the
-- replacement takes the same name, so the orders are set aside and payment_orders is rebuilt too
-- (which also adds its ad_free column).
create table store_products_new (
  id text primary key,
  -- 'energy' and 'plus' were sold before this migration
  kind text not null check (kind in ('energy', 'plus', 'ad_free')),
  name text not null,
  description text,
  price_vnd integer not null check (price_vnd >= 2000),
  active integer not null default 1,
  sort integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into store_products_new (id, kind, name, description, price_vnd, active, sort, created_at)
  select id, kind, name, description, price_vnd, 0, sort, created_at from store_products;

insert into store_products_new (id, kind, name, description, price_vnd, sort) values
  ('ad_free', 'ad_free', 'Gỡ quảng cáo vĩnh viễn', 'Trả một lần, không bao giờ thấy quảng cáo nữa.', 49000, 10);

create table payment_orders_old as select * from payment_orders;
drop table payment_orders;
drop table store_products;
alter table store_products_new rename to store_products;

-- as in 0002_app.sql, plus ad_free
create table payment_orders (
  -- PayOS orderCode: a positive integer, unique for the merchant
  order_code integer primary key,
  -- kept when the account is deleted: it is a financial record
  user_id text references profiles (id) on delete set null,
  product_id text not null references store_products (id),
  -- the product as it was sold, so a later price change doesn't rewrite history
  amount_vnd integer not null check (amount_vnd > 0),
  energy integer not null default 0,
  plus_days integer not null default 0,
  -- bought the ad-free pass
  ad_free integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired', 'failed')),
  provider text not null default 'payos',
  checkout_url text,
  payment_link_id text,
  provider_payload text,
  -- set by the one call that turned the order paid, so only that call credits it (worker/payments.ts)
  fulfil_token text,
  paid_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into payment_orders (order_code, user_id, product_id, amount_vnd, energy, plus_days, status, provider, checkout_url,
    payment_link_id, provider_payload, fulfil_token, paid_at, created_at, updated_at)
  select order_code, user_id, product_id, amount_vnd, energy, plus_days, status, provider, checkout_url,
    payment_link_id, provider_payload, fulfil_token, paid_at, created_at, updated_at from payment_orders_old;

drop table payment_orders_old;

create index payment_orders_user on payment_orders (user_id, created_at desc);
