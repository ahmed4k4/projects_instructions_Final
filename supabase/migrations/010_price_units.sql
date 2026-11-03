-- -----------------------------------------------------------------------------
-- 010 — Convert seeded prices from USD to EGP
--
-- The Phase 1 catalogue was authored in US list prices ("Ryzen 7 7800X3D = 379"),
-- but every money column is read as EGP by the application
-- (`CURRENCY = 'EGP'` in src/lib/constants.ts). A fresh `db push` inherited that
-- mismatch, so the Community page showed "Signal — 4K Gaming Flagship" at
-- 3,462 EGP — about the cost of its case — while the same build scored 94/100.
--
-- `seed.sql` converts on insert from now on. This migration repairs databases
-- that were seeded before that change.
--
-- The guard is `price < 2500`: the cheapest genuine EGP component in the
-- catalogue is a ~2,700 EGP entry-level GPU, so anything below that is a US
-- price. The migration is idempotent — after conversion those rows are above the
-- threshold and a re-run touches nothing.
-- -----------------------------------------------------------------------------

update public.components
set
  price = round(price * 50),
  store_links = (
    select coalesce(
      jsonb_agg(link || jsonb_build_object('price', round((link ->> 'price')::numeric * 50))),
      '[]'::jsonb
    )
    from jsonb_array_elements(store_links) as link
  )
where price > 0
  and price < 2500;

-- Build totals are derived from their items, so recompute rather than convert:
-- converting the stored total would drift from the sum of the parts.
update public.builds b
set total_price = coalesce(
  (
    select sum(c.price * bi.quantity)
    from public.build_items bi
    join public.components c on c.id = bi.component_id
    where bi.build_id = b.id
  ),
  b.total_price
)
where exists (select 1 from public.build_items bi where bi.build_id = b.id);
