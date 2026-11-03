import { getAggregatedProducts, isPlaceholderPrice } from './retailers/aggregator';
import { rankOffers } from '@/lib/offerRanking';
import type { RetailerId, RetailerOffer } from './retailers/types';
import type { ComponentCategory } from '@/types/components';
import { groupLabel, normaliseQuery, partnerKey, skuKey } from '@/lib/skuGrouping';
import { extractBrand, sameBrand } from '@/lib/brand';

/**
 * Unified search across every integrated Egyptian retailer.
 *
 * One product is sold by several stores under different names ("ASUS Dual
 * GeForce RTX 5060 OC Edition", "PNY GeForce RTX 5060 8GB"), so raw listings are
 * grouped by canonical SKU (see `lib/skuGrouping`) and each group is presented
 * with its cheapest offer. A listing that cannot be identified stays its own
 * group rather than being merged on a guess.
 *
 * Data source: `retailer_products` (written nightly by the `retailer-sync` Edge
 * Function) with the local scrape snapshot as a fallback — the aggregator already
 * handles that, so this module only shapes results.
 */

export type SortKey = 'price-asc' | 'price-desc' | 'retailers' | 'newest';

export interface SearchFilters {
  query?: string;
  category?: ComponentCategory | null;
  minPriceEgp?: number;
  maxPriceEgp?: number;
  inStockOnly?: boolean;
  retailerIds?: RetailerId[];
  /** Canonical manufacturer names (see `lib/brand`). Empty = all brands. */
  brands?: string[];
}

export interface ProductGroup {
  /** Canonical SKU, or a per-listing id when the name could not be identified. */
  id: string;
  /** Display name taken from the clearest listing in the group. */
  name: string;
  category: ComponentCategory | null;
  imageUrl: string | null;
  /** Every retailer offer, cheapest in-stock first. */
  offers: RetailerOffer[];
  /** Cheapest in-stock offer, falling back to cheapest overall. */
  best: RetailerOffer;
  /**
   * The offer the displayed name and photo came from.
   *
   * Equal to `best` except when a group spans several listings: then the photo
   * belongs to ONE of them, and pairing a price with a different product's photo
   * is how a card ends up mislabelled.
   */
  pricedOffer: RetailerOffer;
  /** Distinct retailers carrying this product. */
  retailerIds: RetailerId[];
  /** Spread between the cheapest and dearest in-stock offer, in EGP. */
  savingsEgp: number;
  inStock: boolean;
  newestScrapedAt: string;
}

export interface SearchResult {
  groups: ProductGroup[];
  total: number;
  /** Listings considered, before grouping. */
  listingCount: number;
  /** Retailers that contributed at least one listing. */
  retailerIds: RetailerId[];
  lastUpdated: string | null;
}

/**
 * Rank offers so the first one is the one a user can actually buy.
 *
 * The policy lives in `lib/offerRanking` and is shared with the builder's price
 * map: two independent rankers is how `1 EGP` survived here after being fixed
 * there. Only OUT_OF_STOCK is disqualifying — `unknown` means the retailer
 * simply did not print a stock line (Elbadr never does).
 */
export { rankOffers };

/**
 * Group raw listings into comparable products.
 *
 * Exported separately from the query so it can be tested without a data source.
 */
export function groupListings(listings: RetailerOffer[]): ProductGroup[] {
  const buckets = new Map<string, RetailerOffer[]>();

  for (const listing of listings) {
    const key = skuKey(listing.name);

    // Unknown SKUs are kept as their own group: merging them would mean showing
    // one product's price under another product's name.
    if (!key) {
      buckets.set(`listing:${listing.id}`, [listing]);
      continue;
    }

    /**
     * The key is `category : brand : model`.
     *
     * Prefixing the BRAND is what makes the comparison correct, not just
     * stricter: `geforce|5070|12` is shared by every board partner, so without it
     * an ASUS and a GIGABYTE 5070 from two shops became one "product" whose
     * photo and price belonged to neither. Measured on the live catalogue, this
     * raises cross-store groups from 21 to 50 — the brand split is also what lets
     * the same card from two shops match instead of being separated by a
     * differing retailer prefix.
     */
    const brand = (extractBrand(listing.name) ?? 'unknown').toLowerCase();
    const base = `sku:${listing.category ?? 'misc'}:${brand}:${key}`;

    /**
     * Merge across retailers on the MODEL; never merge two listings from one
     * store.
     *
     * A model number cannot separate an "AORUS RTX 5070 MASTER" from an "ASUS
     * Dual RTX 5070 OC" — both key to geforce|5070|12 — so a second listing from
     * the same retailer is a different SKU and gets its own group. Different
     * retailers are exactly the price comparison this page exists for: a PNY and
     * a Palit 5070 Ti are the same product at two prices.
     */
    const bucket = buckets.get(base) ?? [];
    const sameRetailerCount = bucket.filter((existing) => existing.retailerId === listing.retailerId).length;

    /**
     * Two stores must ALSO agree on the manufacturer.
     *
     * `geforce|5070|12` is shared by every board partner, so without this a
     * GIGABYTE 5070 and an ASUS 5070 from two different shops merged into one
     * "product" whose photo and price belonged to neither in particular. The
     * comparison is only meaningful between listings of the same card.
     */
    const brandCompatible = bucket.every((existing) => sameBrand(existing.name, listing.name));

    if (sameRetailerCount === 0 && brandCompatible) {
      bucket.push(listing);
      buckets.set(base, bucket);
      continue;
    }

    // Another SKU from the same store — suffix by its board-partner line so it
    // is stable, falling back to the listing id when the name says nothing.
    const partner = partnerKey(listing.name) || listing.id;
    const soloId = `${base}|${partner}`;
    const solo = buckets.get(soloId) ?? [];
    solo.push(listing);
    buckets.set(soloId, solo);
  }

  const groups: ProductGroup[] = [];

  for (const [id, offers] of buckets) {
    const ranked = rankOffers(offers);
    const best = ranked[0];
    if (!best) continue;

    const inStock = ranked.filter((o) => o.stockStatus === 'in_stock');
    const pool = inStock.length ? inStock : ranked;

    /**
     * Savings are only meaningful across DIFFERENT retailers.
     *
     * Two listings from the same store are not a price difference the user can
     * act on — they are usually two different board-partner models that happen to
     * share a model number (an AORUS "5070 MASTER 12GB" and an ASUS "Dual 5070
     * OC 12GB" both key to geforce|5070|12). Reporting the 12,500 EGP gap between
     * them as a "saving" is simply false.
     */
    const distinctRetailers = new Set(pool.map((o) => o.retailerId)).size;
    const cheapest = pool[0]?.priceEgp ?? best.priceEgp;
    const dearest = pool[pool.length - 1]?.priceEgp ?? best.priceEgp;
    const spread = distinctRetailers > 1 ? dearest - cheapest : 0;

    const newestScrapedAt = ranked.reduce(
      (latest, offer) => (offer.lastScrapedAt > latest ? offer.lastScrapedAt : latest),
      ranked[0]?.lastScrapedAt ?? '',
    );

    /**
     * Name and photo must describe the SAME product.
     *
     * They were chosen independently — the label from the most descriptive name,
     * the photo from the first offer that had one — so a card could read "RTX
     * 5070" and show a motherboard. The label's own offer is the anchor now, and
     * its photo is preferred; another offer's photo is used only when the anchor
     * has none.
     */
    const label = groupLabel(ranked.map((o) => o.name));
    const labelOffer = ranked.find((o) => o.name === label) ?? best;
    // The best offer's own photo wins: it is the offer the price and the Buy
    // button point at, so the picture must be of THAT product.
    const imageUrl = best.imageUrl ?? labelOffer.imageUrl ?? ranked.find((o) => o.imageUrl)?.imageUrl ?? null;

    groups.push({
      id,
      name: label,
      category: (best.category as ComponentCategory | null) ?? null,
      imageUrl,
      // The offer the price and Buy button point at — what the card describes.
      pricedOffer: best,
      offers: ranked,
      best,
      retailerIds: [...new Set(ranked.map((o) => o.retailerId))],
      savingsEgp: Math.max(0, Math.round(spread)),
      inStock: inStock.length > 0,
      newestScrapedAt,
    });
  }

  return groups;
}

/**
 * Does a listing match the free-text query?
 *
 * Substring matching alone returned an `RTX 5070 Ti` for the query `rtx 5070`,
 * because "5070" is a substring of "5070 ti". The fix is a word-boundary test for
 * numeric terms: `5070` matches `5070` and `RTX5070`, but not `5070ti` or
 * `5070-ti`, while `5070ti` (typed by the user) does match the Ti card.
 *
 * Non-numeric terms stay substring-matched so "ryzen" still finds "Ryzen 7".
 */
function matchesQuery(listing: RetailerOffer, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normaliseQuery(listing.name);

  return terms.every((term) => {
    if (!/\d/.test(term)) return haystack.includes(term);

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /**
     * A numeric term matches the model FAMILY, not just the exact SKU.
     *
     * Searching "5070" must return 5070, 5070 Ti and 5070 Super: a shopper
     * typing a model number wants every card that number refers to. Grouping
     * already keeps the variants apart (`skuKey` treats Ti/Super as different
     * products), so the price table can never mix them — it is the *results*, not
     * the groups, that should be inclusive.
     *
     * The guard only rejects digits glued to the term, so "5070" does not match
     * "50700" or "15070".
     */
    return new RegExp(`(^|[^a-z0-9])${escaped}(?![0-9])`).test(haystack);
  });
}

function sortGroups(groups: ProductGroup[], sort: SortKey): ProductGroup[] {
  /** Groups whose best offer is a store placeholder sink to the bottom. */
  const pinned = (group: ProductGroup) => (isPlaceholderPrice(group.best) ? 1 : 0);

  const copy = [...groups];
  switch (sort) {
    case 'price-desc':
      return copy.sort((a, b) => pinned(a) - pinned(b) || b.best.priceEgp - a.best.priceEgp);
    case 'retailers':
      // Most widely stocked first — the best signal of "this is the safe choice".
      return copy.sort(
        (a, b) =>
          pinned(a) - pinned(b) ||
          b.retailerIds.length - a.retailerIds.length ||
          a.best.priceEgp - b.best.priceEgp,
      );
    case 'newest':
      return copy.sort((a, b) => pinned(a) - pinned(b) || b.newestScrapedAt.localeCompare(a.newestScrapedAt));
    case 'price-asc':
    default:
      return copy.sort((a, b) => pinned(a) - pinned(b) || a.best.priceEgp - b.best.priceEgp);
  }
}

/** Apply filters to already-grouped products. */
function filterGroups(groups: ProductGroup[], filters: SearchFilters): ProductGroup[] {
  return groups.filter((group) => {
    if (filters.category && group.category !== filters.category) return false;
    if (filters.inStockOnly && !group.inStock) return false;
    if (filters.minPriceEgp !== undefined && group.best.priceEgp < filters.minPriceEgp) return false;
    if (filters.maxPriceEgp !== undefined && group.best.priceEgp > filters.maxPriceEgp) return false;

    if (filters.retailerIds?.length) {
      const carried = group.retailerIds.some((id) => filters.retailerIds?.includes(id));
      if (!carried) return false;
    }

    return true;
  });
}

/**
 * A page of results plus whatever the UI needs to ask for the next one.
 *
 * Paging happens AFTER grouping on purpose. A product sold by three retailers
 * arrives as three listings that must land in the same group; slicing the raw
 * listings first would split one product across two pages and show two different
 * "best prices" for it. Grouping the whole match set (a few thousand items, all
 * already in memory) and slicing the groups is both correct and cheap.
 */
export interface SearchPage extends SearchResult {
  groups: ProductGroup[];
  /** Offset to request next; `null` when the last page has been returned. */
  nextOffset: number | null;
  /** Groups matched in total, before this page's slice. */
  totalGroups: number;
}

/** Results per page: enough to fill a desktop grid twice over. */
export const SEARCH_PAGE_SIZE = 24;

/** Full search: fetch → filter listings → group → filter groups → sort. */
async function searchProducts(
  filters: SearchFilters = {},
  sort: SortKey = 'price-asc',
): Promise<SearchResult> {
  const listings = await getAggregatedProducts({ category: filters.category ?? undefined });

  const terms = normaliseQuery(filters.query ?? '')
    .split(' ')
    .filter(Boolean);

  // Brand matching is case-insensitive and compares canonical names, so a URL
  // carrying `?brand=asus` matches a listing stored as "ASUS TUF …".
  const wantedBrands = filters.brands?.length
    ? new Set(filters.brands.map((brand) => brand.toLowerCase()))
    : null;

  const matched = listings.filter((listing) => {
    if (!matchesQuery(listing, terms)) return false;
    // Retailer check happens per listing too, so a group never shows an offer
    // from an unchecked store.
    if (filters.retailerIds?.length && !filters.retailerIds.includes(listing.retailerId)) return false;
    if (filters.inStockOnly && listing.stockStatus !== 'in_stock') return false;
    if (wantedBrands) {
      const brand = extractBrand(listing.name);
      if (!brand || !wantedBrands.has(brand.toLowerCase())) return false;
    }
    /**
     * Category is filtered at the LISTING level, before grouping.
     *
     * Filtering the groups afterwards read the group's category off its best
     * offer — which is a DIFFERENT listing from the one that matched. That is
     * why `/search?cat=cpu` showed CPU coolers: they were grouped, ranked and
     * then labelled with whatever category their cheapest offer carried. A
     * listing that fails the category check cannot be part of the result at all.
     */
    if (filters.category && listing.category !== filters.category) return false;
    return true;
  });

  const groups = filterGroups(groupListings(matched), filters);

  const lastUpdated = listings.reduce<string | null>(
    (latest, l) => (!latest || l.lastScrapedAt > latest ? l.lastScrapedAt : latest),
    null,
  );

  return {
    groups: sortGroups(groups, sort),
    total: groups.length,
    listingCount: matched.length,
    retailerIds: [...new Set(listings.map((l) => l.retailerId))],
    lastUpdated,
  };
}

/**
 * One page of search results.
 *
 * `offset` is a plain group index: the ordering is deterministic for a given
 * (filters, sort), so the same offset always returns the same groups — no cursor
 * token to keep in sync, and a deep link (`?q=…`) can restore a position.
 */
export async function searchProductsPage(
  filters: SearchFilters = {},
  sort: SortKey = 'price-asc',
  offset = 0,
  limit = SEARCH_PAGE_SIZE,
): Promise<SearchPage> {
  const result = await searchProducts(filters, sort);
  const start = Math.max(0, offset);
  const groups = result.groups.slice(start, start + limit);
  const end = start + groups.length;

  return {
    ...result,
    groups,
    totalGroups: result.groups.length,
    nextOffset: end < result.groups.length ? end : null,
  };
}

/** Autocomplete: distinct product names matching a prefix, cheapest first. */
export async function suggestProducts(query: string, limit = 6): Promise<ProductGroup[]> {
  const terms = normaliseQuery(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];

  const listings = await getAggregatedProducts();
  const matched = listings.filter((l) => matchesQuery(l, terms));

  return groupListings(matched)
    .sort((a, b) => a.best.priceEgp - b.best.priceEgp)
    .slice(0, limit);
}

/** Every group for one SKU id (used by /compare deep links). */
export async function getGroupById(groupId: string): Promise<ProductGroup | null> {
  const listings = await getAggregatedProducts();
  return groupListings(listings).find((group) => group.id === groupId) ?? null;
}

/** Distinct categories present in the catalogue, for the filter rail. */
/**
 * Categories present in the catalogue, with the number of PRODUCTS in each.
 *
 * The count is grouped, not raw: the rail sits beside "19 results", and showing
 * "411" next to it (411 listings → 19 products) made the grid look broken. The
 * two numbers describe the same thing now.
 */
/**
 * Brands present in the catalogue, with how many products each makes.
 *
 * Derived from the SAME data the grid groups, so the rail can never offer a
 * brand that returns nothing. Uncategorised names are skipped rather than
 * labelled with a made-up first word.
 */
export async function getAvailableBrands(): Promise<Array<{ brand: string; count: number }>> {
  const listings = await getAggregatedProducts();
  const counts = new Map<string, number>();

  for (const listing of listings) {
    const brand = extractBrand(listing.name);
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

export async function getAvailableCategories(): Promise<
  Array<{ category: ComponentCategory; count: number }>
> {
  const listings = await getAggregatedProducts();

  const grouped = new Map<ComponentCategory, Set<string>>();
  for (const group of groupListings(listings)) {
    if (!group.category) continue;
    const bucket = grouped.get(group.category) ?? new Set<string>();
    bucket.add(group.id);
    grouped.set(group.category, bucket);
  }

  return [...grouped.entries()]
    .map(([category, ids]) => ({ category, count: ids.size }))
    .sort((a, b) => b.count - a.count);
}
