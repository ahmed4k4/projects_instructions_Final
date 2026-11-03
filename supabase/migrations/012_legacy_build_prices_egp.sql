-- -----------------------------------------------------------------------------
-- 012 — Normalize legacy saved-build item prices and currency labels to EGP.
--
-- Migration 010 converted the legacy components.price values and recomputed
-- builds.total_price, but did not convert build_items.price_at_add or update the
-- components.currency label. This migration closes those two gaps.
-- Convert only values that are clearly still USD-shaped compared with the
-- already-normalized component price; then normalize the source currency marker.
-- -----------------------------------------------------------------------------

update public.build_items bi
set price_at_add = round(bi.price_at_add * 50)
from public.components c
where c.id = bi.component_id
  and bi.price_at_add > 0
  and bi.price_at_add < 2500
  and bi.price_at_add * 10 < c.price
  and c.currency is distinct from 'EGP';

update public.components
set currency = 'EGP'
where currency is distinct from 'EGP';
