import { useQuery } from '@tanstack/react-query';
import {
  getBestPricesForComponents,
  getRetailerHealth,
  getRetailerOffersForComponent,
} from '@/services/retailers/aggregator';
import { RETAILERS } from '@/services/retailers/types';
import { SIGMA_SNAPSHOT } from '@/services/retailers/sigmaSnapshot';
import { isSupabaseConfigured } from '@/services/supabaseClient';

/**
 * React Query wrappers for the retailer aggregator.
 *
 * Prices change nightly, not per keystroke, so these use a long stale time and
 * `keepPreviousData`-style behaviour through React Query's cache. Every hook is a
 * no-op when Supabase is unconfigured (the aggregator returns empty data), so the
 * app runs unchanged with zero network calls on a fresh clone.
 */

const PRICE_STALE_MS = 30 * 60 * 1000;

/** Cheapest offer per component across every retailer. */
export function useBestPrices(componentIds: string[]) {
  // Sorting makes the key stable regardless of selection order.
  const key = [...componentIds].sort().join(',');
  return useQuery({
    queryKey: ['retailer-best-prices', key] as const,
    queryFn: () => getBestPricesForComponents(componentIds),
    staleTime: PRICE_STALE_MS,
    enabled: isSupabaseConfigured && componentIds.length > 0,
  });
}

/** All offers for one component, for the comparison modal. */
export function useRetailerOffers(componentId: string | null) {
  return useQuery({
    queryKey: ['retailer-offers', componentId] as const,
    queryFn: () => getRetailerOffersForComponent(componentId as string),
    staleTime: PRICE_STALE_MS,
    enabled: isSupabaseConfigured && Boolean(componentId),
  });
}

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
    data.filter((r) => r.status === 'ok' || r.status === 'partial').map((r) => r.retailerId),
  );
  return Object.values(RETAILERS).map((meta) => ({
    ...meta,
    // Sigma has no database sync row at all — it publishes a JSON feed from a
    // Playwright worker — so its availability is "does that feed have rows?".
    // The bundled capture answers immediately, before any request resolves.
    live:
      meta.id === 'sigma'
        ? healthy.has('sigma') || SIGMA_SNAPSHOT.products.length > 0
        : meta.live && (healthy.size === 0 || healthy.has(meta.id)),
  }));
}
