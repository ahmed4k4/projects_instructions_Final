import { useQuery } from '@tanstack/react-query';
import type { ComponentCategory, PCComponent } from '@/types/components';
import { getAggregatedProducts } from '@/services/retailers/aggregator';
import { groupListings } from '@/services/searchService';
import { buildCatalogue } from '@/lib/retailerCatalogue';

/**
 * The Builder's catalogue: real Egyptian retailer listings, one entry per SKU.
 *
 * ── Why this replaced `useComponents` + `sampleData` ────────────────────────
 * The builder used to read `lib/sampleData.ts` whenever Supabase was unconfigured
 * (and the seeded `components` table otherwise). Either way the parts a user
 * added to a build were not the parts the price comparison could quote, so the
 * same page showed "Ryzen 7 7800X3D — EGP 21,000" next to a live retailer price
 * for a different SKU.
 *
 * Every page that builds — Builder, AI advisor, Prebuilt — now reads this hook,
 * so what you add is what you can buy.
 *
 * Data flow:
 *   retailer_products (or the scrape snapshot)
 *     → aggregator offers (URL-derived category, inferred specs)
 *     → groupListings (one entry per SKU, cheapest offer wins)
 *     → buildCatalogue (PCComponent with store links)
 *
 * The whole chain runs in the browser on data that is already in memory: the
 * snapshot is 3,000 rows, grouping them is a few milliseconds, and there is no
 * extra request per category.
 */
export const CATALOGUE_KEY = ['retailer-catalogue'] as const;

/** 30 minutes: prices change nightly, not per keystroke. */
const STALE_MS = 30 * 60 * 1000;

const CATALOGUE_CACHE_MS = 5 * 60 * 1000;
let catalogueCache: { rows: PCComponent[]; loadedAt: number } | null = null;
let catalogueInFlight: Promise<PCComponent[]> | null = null;
const aiCatalogueCache = new Map<string, { rows: PCComponent[]; loadedAt: number }>();
const aiCatalogueInFlight = new Map<string, Promise<PCComponent[]>>();

async function createCatalogue(includeSigma: boolean, category?: ComponentCategory): Promise<PCComponent[]> {
  const offers = await getAggregatedProducts(category ? { category } : {}, { includeSigma });
  return offers.length === 0 ? [] : buildCatalogue(groupListings(offers)).components;
}

/** Shared in-memory catalogue cache for pages, agents and repeated chat turns. */
export async function loadCatalogue(): Promise<PCComponent[]> {
  if (catalogueCache && Date.now() - catalogueCache.loadedAt < CATALOGUE_CACHE_MS) return catalogueCache.rows;
  if (catalogueInFlight) return catalogueInFlight;

  catalogueInFlight = createCatalogue(true)
    .then((rows) => {
      catalogueCache = { rows, loadedAt: Date.now() };
      return rows;
    })
    .finally(() => { catalogueInFlight = null; });
  return catalogueInFlight;
}

/** Fast AI catalogue: uses live retailer DB or the full snapshot, but skips the
 * separately-hosted Sigma feed so an unreachable feed cannot delay an answer. */
export async function loadCatalogueForAI(category?: ComponentCategory): Promise<PCComponent[]> {
  const key = category ?? 'all';
  const cached = aiCatalogueCache.get(key);
  if (cached && Date.now() - cached.loadedAt < CATALOGUE_CACHE_MS) return cached.rows;
  const inFlight = aiCatalogueInFlight.get(key);
  if (inFlight) return inFlight;

  const pending = createCatalogue(false, category)
    .then((rows) => {
      aiCatalogueCache.set(key, { rows, loadedAt: Date.now() });
      return rows;
    })
    .finally(() => { aiCatalogueInFlight.delete(key); });
  aiCatalogueInFlight.set(key, pending);
  return pending;
}

/** Start loading only when the user asks a catalogue-dependent AI question. */
export function warmCatalogueForAI(): void {
  void loadCatalogueForAI().catch(() => undefined);
}

/** Explicit refresh hook for sync/admin flows. */
export function invalidateCatalogueCache(): void {
  catalogueCache = null;
  catalogueInFlight = null;
  aiCatalogueCache.clear();
  aiCatalogueInFlight.clear();
}

/**
 * Components of one category (or the whole catalogue).
 *
 * The query key is the catalogue itself, not the category: one fetch fills every
 * category, so switching between CPU and GPU does not re-group 3,000 rows.
 */
export function useComponents(category?: ComponentCategory): {
  data: PCComponent[] | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: CATALOGUE_KEY,
    queryFn: loadCatalogue,
    staleTime: STALE_MS,
  });

  return {
    data: query.data
      ? category
        ? query.data.filter((component) => component.category === category)
        : query.data
      : undefined,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Number of parts per category, for the builder's sidebar badges.
 *
 * Counts EVERY listing the grid will show, including out-of-stock ones, because
 * the badge and the grid are the same claim: "Motherboard · 560 available" beside
 * a grid of 572 cards is a bug a user can see. Out-of-stock parts are still
 * listed (they are real, priced, and often the only carrier of a spec), they are
 * simply sorted last.
 */
export function useCategoryCounts(): Partial<Record<ComponentCategory, number>> {
  const { data } = useComponents();
  const counts: Partial<Record<ComponentCategory, number>> = {};
  for (const component of data ?? []) {
    counts[component.category] = (counts[component.category] ?? 0) + 1;
  }
  return counts;
}
