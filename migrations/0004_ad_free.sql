-- Monetization moves from metered energy to ads: playing is free and unlimited, an ad break follows
-- every finished session (src/features/ads), and one purchase removes the breaks for good.
-- energy_wallets and energy_ledger are no longer written; they stay as a record of what was sold.

-- set once, by the order that bought it (worker/payments.ts); admins never see ads either
alter table profiles add column ad_free_at text;

-- what an order bought, snapshotted like its price
alter table payment_orders add column ad_free integer not null default 0;

-- The store: the energy packs and Plus are retired (kept, inactive, for the orders that point at
-- them) and the ad-free pass is added. Widening the kind check means rebuilding the table.
pragma defer_foreign_keys = true;

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

drop table store_products;
alter table store_products_new rename to store_products;
