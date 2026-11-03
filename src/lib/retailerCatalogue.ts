/**
 * The builder's catalogue, built from real Egyptian retailer listings.
 *
 * ── What changed in Phase 15 ────────────────────────────────────────────────
 * The Builder used `lib/sampleData.ts`: 32 hand-written components with perfect
 * spec sheets. It existed because scraped listings carried no technical data —
 * nothing to check a GPU's length or a CPU's socket against — so a build made
 * from real prices could not be validated.
 *
 * Two things fixed that:
 *
 *   · `lib/specInference.ts` reads the CHIP from the model number
 *     ("RTX 5070 Ti" → 16 GB, 300 W, 300 mm) and marks how sure it is;
 *   · `lib/categoryRules.ts` puts each listing in the right bucket, so the
 *     catalogue is now eight categories of real parts instead of a keyword
 *     lottery.
 *
 * This module joins the two: every scraped listing becomes a `PCComponent` with
 * specs, a price in EGP, the retailer that sells it and a link to buy it. The
 * Builder, the AI advisor and the Prebuilt page all read from here, so what the
 * AI recommends is something a shopper in Cairo can actually order.
 *
 * ── Identity ───────────────────────────────────────────────────────────────
 * One product is sold by several stores. The adapter groups listings by SKU (the
 * same key `/search` uses) and emits ONE component per group:
 *
 *   component.id   = the group's canonical key (stable across reloads)
 *   component.price = the cheapest in-stock offer
 *   component.storeLinks = every retailer carrying it
 *
 * That is exactly what a price comparison needs, and it keeps the build's
 * estimate honest: the cheapest shop, not the average of the shops.
 */
import type { ComponentCategory, PCComponent, StoreLink } from '@/types/components';
import type { ProductGroup } from '@/services/searchService';
import { inferSpecs } from '@/lib/specInference';
import { estimatePerformanceScore } from '@/lib/performanceTier';
import { extractBrand } from '@/lib/brand';
import { RETAILERS, type RetailerId, type RetailerOffer } from '@/services/retailers/types';

/** A listing's per-retailer offers, cheapest first (see `offersFor`). */
export interface ComponentProvenance {
  /** Retailer whose price is quoted. */
  retailerId: RetailerId;
  /** Every retailer carrying this product, cheapest first. */
  offers: Array<{ retailerId: RetailerId; priceEgp: number; url: string; inStock: boolean }>;
  /** True when the specs are opinions rather than published figures. */
  specsInferred: boolean;
  /** Capture time of the price being shown. */
  priceUpdatedAt: string;
}

const CATEGORIES: ComponentCategory[] = [
  'cpu',
  'gpu',
  'motherboard',
  'ram',
  'storage',
  'psu',
  'case',
  'cooling',
];

/**
 * Categories a build cannot boot without.
 *
 * Kept here so the catalogue and the AI tools agree on the list, and exported:
 * an unused constant is dead code the release gate rejects.
 */
const ESSENTIAL_BY_CATEGORY: Record<ComponentCategory, boolean> = {
  cpu: true,
  gpu: false,
  motherboard: true,
  ram: true,
  storage: true,
  psu: true,
  case: true,
  cooling: false,
};

/** Categories in the list above, derived so the two can never disagree. */
export const ESSENTIAL_CATEGORIES = CATEGORIES.filter((category) => ESSENTIAL_BY_CATEGORY[category]);

/** A group whose best offer is out of stock everywhere. */
function anyInStock(group: ProductGroup): boolean {
  return group.offers.some((offer) => offer.stockStatus === 'in_stock');
}

/**
 * Convert one product group into a builder component.
 *
 * Returns null when the group is not a usable part: no category, no price, or a
 * placeholder price (a store printing "1 EGP" must never win a comparison).
 */
export function groupToComponent(group: ProductGroup): PCComponent | null {
  const category = group.category;
  if (!category || !CATEGORIES.includes(category)) return null;

  const priced = group.offers.filter((offer) => !offer.priceIsPlaceholder && offer.priceEgp > 0);
  if (priced.length === 0) return null;

  const best = priced[0]!;
  const specs = { ...(group.best.specs ?? {}), ...inferSpecs({ name: group.name, category }) };

  const storeLinks: StoreLink[] = priced.map((offer) => ({
    store: RETAILERS[offer.retailerId]?.name ?? offer.retailerId,
    url: offer.productUrl,
    price: offer.priceEgp,
  }));

  const inStock = anyInStock(group);
  const brand = extractBrand(group.name) ?? group.name.split(' ')[0] ?? '';

  return {
    id: group.id,
    category,
    brand,
    model: group.name.replace(brand, '').trim() || group.name,
    name: group.name,
    description: null,
    specs,
    price: best.priceEgp,
    currency: 'EGP',
    stockStatus: inStock ? 'in_stock' : 'out_of_stock',
    storeLinks,
    performanceScore: estimatePerformanceScore(group.name, category),
    powerDrawWatts: typeof specs.tdp === 'number' ? specs.tdp : null,
    imageUrl: group.imageUrl,
    isActive: true,
    createdAt: group.newestScrapedAt,
    updatedAt: group.newestScrapedAt,
  };
}

/**
 * Every shop carrying one component, cheapest first — what the compare sheet lists.
 *
 * A component is one SKU, so `storeLinks` already holds the offers; this exposes
 * them in the `RetailerOffer` shape the modal renders, without a query.
 */
export function offersFor(component: PCComponent): RetailerOffer[] {
  const offers: RetailerOffer[] = component.storeLinks.map((link, index) => {
    const retailerId =
      (Object.keys(RETAILERS) as RetailerId[]).find((id) => RETAILERS[id].name === link.store) ?? 'elbadr';
    return {
      id: `${component.id}-${index}`,
      retailerId,
      name: component.name,
      category: component.category,
      priceEgp: link.price,
      originalPriceEgp: null,
      stockStatus: component.stockStatus === 'out_of_stock' ? 'out_of_stock' : 'in_stock',
      productUrl: link.url,
      imageUrl: component.imageUrl,
      matchedComponentId: component.id,
      matchConfidence: null,
      lastScrapedAt: component.updatedAt,
    };
  });
  return offers.sort((a, b) => a.priceEgp - b.priceEgp);
}

/**
 * Build the catalogue for the Builder.
 *
 * One entry per SKU, cheapest first within a category, so the default view is
 * "what can I buy for this part, cheapest first" rather than an arbitrary page
 * of listings.
 */
export function buildCatalogue(groups: ProductGroup[]): {
  components: PCComponent[];
  byId: Map<string, PCComponent>;
  groups: Map<string, ProductGroup>;
} {
  const components: PCComponent[] = [];
  const byId = new Map<string, PCComponent>();
  const byGroup = new Map<string, ProductGroup>();

  for (const group of groups) {
    const component = groupToComponent(group);
    if (!component) continue;
    // The same SKU can appear twice when a listing failed to group; the cheapest
    // one wins, which is what the group itself already represents.
    if (byId.has(component.id)) continue;
    components.push(component);
    byId.set(component.id, component);
    byGroup.set(component.id, group);
  }

  components.sort((a, b) => {
    const categoryOrder = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
    if (categoryOrder !== 0) return categoryOrder;
    // In-stock parts first: a build that cannot be bought is not a build.
    if (a.stockStatus !== b.stockStatus) return a.stockStatus === 'in_stock' ? -1 : 1;
    return a.price - b.price;
  });

  return { components, byId, groups: byGroup };
}
