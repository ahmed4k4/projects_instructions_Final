import type { ComponentCategory } from '@/types/components';

/**
 * Retailer domain types.
 *
 * Everything here is EGP-denominated and read-only: the browser never scrapes.
 * Data is written by the `retailer-sync` Edge Function into
 * `public.retailer_products` (migration 008) and read through
 * `services/retailers/aggregator.ts`.
 */

export type RetailerId = 'sigma' | 'alfrensia' | 'elnekhely' | 'elbadr';

export type RetailerStockStatus = 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';

/** Static presentation metadata — logos are drawn in-app, not fetched. */
export interface RetailerMeta {
  id: RetailerId;
  name: string;
  nameAr: string;
  /** Two-letter monogram for the compact logo tile. */
  monogram: string;
  /** Brand hue used for the tile background. */
  tone: string;
  homeUrl: string;
  /**
   * Whether the sync function currently returns products for this retailer.
   * `false` is surfaced honestly in the UI rather than hidden.
   */
  live: boolean;
}

/**
 * Retailer registry.
 *
 * `live: false` means the scraper cannot read the store today — Sigma renders its
 * catalogue client-side from React Server Component streams, so it is listed but
 * never shown with a price (see docs/AUDIT.md § Retailer status).
 */
export const RETAILERS: Record<RetailerId, RetailerMeta> = {
  sigma: {
    id: 'sigma',
    name: 'Sigma Computer',
    nameAr: 'سيجما كمبيوتر',
    monogram: 'Σ',
    tone: 'primary',
    homeUrl: 'https://sigma-computer.com/en',
    live: false,
  },
  alfrensia: {
    id: 'alfrensia',
    name: 'Alfrensia',
    nameAr: 'الفورنسيا',
    monogram: 'A',
    tone: 'accent',
    homeUrl: 'https://alfrensia.com/',
    live: true,
  },
  elnekhely: {
    id: 'elnekhely',
    name: 'Elnekhely Technology',
    nameAr: 'النخيلي تكنولوجي',
    monogram: 'N',
    tone: 'success',
    homeUrl: 'https://www.elnekhelytechnology.com/',
    live: true,
  },
  elbadr: {
    id: 'elbadr',
    name: 'Elbadr Group',
    nameAr: 'مجموعة البدر',
    monogram: 'B',
    tone: 'warning',
    homeUrl: 'https://elbadrgroupeg.store/',
    live: true,
  },
};

export const RETAILER_IDS = Object.keys(RETAILERS) as RetailerId[];

/** One retailer's listing for a product. */
export interface RetailerOffer {
  id: string;
  retailerId: RetailerId;
  name: string;
  /** Catalogue category of the listing (null when the retailer page was ambiguous). */
  category?: ComponentCategory | null;
  priceEgp: number;
  originalPriceEgp: number | null;
  stockStatus: RetailerStockStatus;
  productUrl: string;
  imageUrl: string | null;
  matchedComponentId: string | null;
  matchConfidence: number | null;
  lastScrapedAt: string;
}

/** Aggregated view used by cards and the comparison modal. */
export interface PriceComparison {
  componentId: string;
  componentName: string;
  /** Cheapest in-stock offer; falls back to cheapest overall. */
  best: RetailerOffer | null;
  offers: RetailerOffer[];
  /** Savings vs. the most expensive in-stock offer, in EGP. */
  savingsEgp: number;
  lastScrapedAt: string | null;
}

export interface RetailerProductFilters {
  category?: ComponentCategory;
  retailerId?: RetailerId;
  maxPriceEgp?: number;
  inStockOnly?: boolean;
  limit?: number;
}
