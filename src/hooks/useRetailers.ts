import { useQuery } from '@tanstack/react-query';
import { getRetailerHealth } from '@/services/retailers/aggregator';
import { RETAILERS } from '@/services/retailers/types';
import { SIGMA_SNAPSHOT } from '@/services/retailers/sigmaSnapshot';

/**
 * React Query wrappers for the retailer aggregator.
 *
 * ── What was removed in Phase 15 ───────────────────────────────────────────
 * `useBestPrices(ids)` and `useRetailerOffers(id)` looked up offers by a
 * CATALOGUE component id — the id of a row in the hand-written `components`
 * table. That table is no longer what the Builder shows: a component IS a
 * retailer listing now (grouped by SKU, see `lib/retailerCatalogue`), and its
 * shops travel with it in `storeLinks`. So both hooks had nothing left to query
 * and were deleted rather than left to return `undefined` forever.
 *
 * Health is kept: it is how the UI stays honest about a retailer that has
 * stopped returning data.
 */

const PRICE_STALE_MS = 30 * 60 * 1000;

/** Last sync outcome per retailer, so the UI can be honest about stale feeds. */
function useRetailerHealth() {
  return useQuery({
    queryKey: ['retailer-health'] as const,
    queryFn: getRetailerHealth,
    staleTime: PRICE_STALE_MS,
    // Health is also the only source of Sigma's availability: its rows come from
    // the Playwright feed, not from the database, so this must run even when
    // Supabase is unconfigured.
    enabled: true,
  });
}

/** Retailers that currently return data (registry flag AND a healthy last run). */
export function useLiveRetailers() {
  const { data = [] } = useRetailerHealth();
  const healthy = new Set(
    data.filter((r) => r.status === 'ok' || r.status === 'partial' || r.status === 'snapshot').map((r) => r.retailerId),
  );
  return Object.values(RETAILERS).map((meta) => ({
    ...meta,
    // Sigma has no database sync row at all — it publishes a JSON feed from a
    // Playwright worker — so its availability is "does that feed have rows?".
    // The bundled capture answers immediately, before any request resolves.
    live:
      meta.id === 'sigma'
        ? healthy.has('sigma') || SIGMA_SNAPSHOT.products.length > 0
        : meta.live && healthy.has(meta.id),
  }));
}
