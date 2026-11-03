import type { ComponentCategory } from '@/types/components';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import snapshot from './bootstrap.json';
import { compareOffers } from '@/lib/offerRanking';
import { resolveCategory } from '@/lib/categoryRules';
import { loadSigmaFeed } from './sigmaFeed';
import {
  RETAILERS,
  type PriceComparison,
  type RetailerId,
  type RetailerOffer,
  type RetailerProductFilters,
} from './types';

/**
 * Retailer price aggregation.
 *
 * Reads `public.retailer_products` and groups rows per catalogue component. The
 * browser never scrapes: the data is written nightly by the `retailer-sync`
 * Edge Function (migration 008 + 009) and this module only reads.
 *
 * Every function is null-safe: with Supabase unconfigured it returns empty data
 * and the UI simply shows no comparison — never an error, never a network call.
 */

/** Minimum match confidence before a scraped row is trusted as a real match. */
export const MIN_MATCH_CONFIDENCE = 0.55;

// One ranking policy for the whole app — see `lib/offerRanking`.
export { MIN_REAL_PRICE_EGP, isPlaceholderPrice } from '@/lib/offerRanking';

/* -------------------------------------------------------------------------- */
/*  Local snapshot fallback                                                   */
/* -------------------------------------------------------------------------- */

interface SnapshotProduct {
  retailerId: RetailerId;
  externalId: string;
  name: string;
  category: string | null;
  priceEgp: number;
  /** Store printed a placeholder price (1 EGP) — never quoted as a price. */
  priceIsPlaceholder?: boolean;
  originalPriceEgp: number | null;
  stockStatus: RetailerOffer['stockStatus'];
  productUrl: string;
  imageUrl: string | null;
  specs?: Record<string, unknown>;
}

/**
 * The category a listing belongs to, recomputed at READ time.
 *
 * The snapshot's stored category was written by the keyword classifier, and the
 * database still holds rows written before Phase 15. Deriving it from the URL
 * here means one code path fixes the snapshot, the bootstrap subset, the Sigma
 * feed and the live table at once — a snapshot produced by the old scraper can
 * never resurrect a fan as a CPU.
 *
 * Returns null for an ACCESSORY (see `ACCESSORY` in categoryRules) — a mounting
 * bracket or thermal paste is not a component, and the caller drops it.
 */
function categoryOf(product: { category?: string | null; name?: string; productUrl?: string }): ComponentCategory | null {
  const resolved = resolveCategory({
    url: product.productUrl,
    title: product.name,
    stored: product.category ?? null,
  });
  return resolved ? (resolved as ComponentCategory) : null;
}

/**
 * Why a snapshot exists.
 *
 * Live prices normally come from `retailer_products`, written nightly by the
 * `retailer-sync` Edge Function. When Supabase is unconfigured — a fresh clone,
 * or before the first sync has run — the UI would otherwise show nothing. This
 * snapshot is produced by the SAME parser (scripts/snapshot-retailers.mjs) from a
 * real scrape, so the numbers are genuine EGP prices with a visible capture date
 * rather than invented demo data.
 *
 * Sigma is appended at runtime from its own Playwright feed (`sigmaFeed.ts`):
 * that retailer cannot be scraped server-side, so its rows travel separately but
 * are merged into the same offer list before anything is grouped or ranked.
 */
/**
 * Two sources, on purpose.
 *
 * `bootstrap.json` is a 48-product subset compiled into the bundle: it answers on
 * first paint, before any request resolves. The FULL catalogue (3,000+ listings,
 * ~1.9 MB) lives in `public/data/retailer_snapshot.json` and is fetched once — as
 * a bundled import it became a 1.5 MB JS chunk, which every visitor paid for
 * whether or not they opened the builder.
 */
const BOOTSTRAP = snapshot as unknown as {
  capturedAt: string;
  retailers: string[];
  products: SnapshotProduct[];
};

interface SnapshotFeed {
  capturedAt: string;
  products: SnapshotProduct[];
}

let snapshotOffers: RetailerOffer[] | null = null;
let sigmaOffers: RetailerOffer[] = [];
let snapshotPromise: Promise<SnapshotFeed> | null = null;

const FEED_TIMEOUT_MS = 8_000;

function isSnapshotProduct(value: unknown): value is SnapshotProduct {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SnapshotProduct>;
  return (
    typeof row.retailerId === 'string' && row.retailerId in RETAILERS &&
    typeof row.externalId === 'string' &&
    typeof row.name === 'string' && row.name.trim().length > 2 &&
    typeof row.priceEgp === 'number' && Number.isFinite(row.priceEgp) && row.priceEgp > 0 &&
    typeof row.productUrl === 'string' && /^https?:\/\//i.test(row.productUrl)
  );
}

/** Fetch the full snapshot once on success; retry later when the network fails. */
async function loadFullSnapshot(timeoutMs = FEED_TIMEOUT_MS): Promise<SnapshotFeed> {
  if (snapshotPromise) return snapshotPromise;

  snapshotPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const base = import.meta.env.BASE_URL || '/';
      const url = `${base.endsWith('/') ? base : `${base}/`}data/retailer_snapshot.json`;
      const res = await fetch(url, {
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Retailer snapshot returned HTTP ${res.status}`);

      const payload = (await res.json()) as Partial<SnapshotFeed>;
      const products = Array.isArray(payload.products) ? payload.products.filter(isSnapshotProduct) : [];
      if (!products.length) throw new Error('Retailer snapshot did not contain valid products');

      CURRENT_FEED = {
        capturedAt: typeof payload.capturedAt === 'string' ? payload.capturedAt : BOOTSTRAP.capturedAt,
        products,
      };
      // Rebuild the offer list from the richer feed.
      snapshotOffers = null;
      return CURRENT_FEED;
    } catch (error) {
      // The bundled subset remains usable. Reset the promise so the next read
      // can recover when a transient CDN/network failure has cleared.
      snapshotPromise = null;
      if (import.meta.env.DEV) console.warn('[retailers] Snapshot load failed; using bootstrap data.', error);
      return CURRENT_FEED;
    } finally {
      clearTimeout(timer);
    }
  })();

  return snapshotPromise;
}

let CURRENT_FEED: SnapshotFeed = { capturedAt: BOOTSTRAP.capturedAt, products: BOOTSTRAP.products };

/**
 * Merge the Sigma worker's feed into the snapshot offers, once.
 *
 * Rows are de-duplicated on (retailer, product URL): the feed is regenerated
 * from scratch on every worker run, but a category can legitimately surface the
 * same product twice (e.g. a GPU that also appears under "Graphic Card &
 * Accessories" in Sigma's rail).
 */
async function loadSigmaOffers(): Promise<void> {
  if (sigmaOffers.length) return;

  const feed = await loadSigmaFeed();
  const seen = new Set<string>();

  sigmaOffers = feed.products
    .filter((product) => {
      const key = `${product.retailerId}:${product.productUrl}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((product, index): RetailerOffer => {
      const category = categoryOf(product);
      const match = matchSnapshotToCatalogue(product.name, category);
      return {
        id: `sigma-${index}`,
        retailerId: 'sigma' as const,
        name: product.name,
        category,
        priceEgp: product.priceEgp,
        originalPriceEgp: product.originalPriceEgp,
        stockStatus: product.stockStatus,
        productUrl: product.productUrl,
        imageUrl: product.imageUrl,
        matchedComponentId: match?.id ?? null,
        matchConfidence: match?.confidence ?? null,
        lastScrapedAt: feed.capturedAt ?? new Date().toISOString(),
        specs: product.specs ?? undefined,
      };
    });
}

/**
 * Set once the DB reports `retailer_products` does not exist (PGRST205).
 *
 * A missing table is a SETUP state — migration 008 has not been applied yet —
 * not a runtime error. Without this flag every page issued the query again,
 * React Query retried it, and the console filled with 404s. Once flipped, the
 * app reads the snapshot directly and makes no further requests.
 */
let retailerTableMissing = false;
let retailerTableUnavailableUntil = 0;
/** Resolves once: does `retailer_products` exist? Shared by every reader. */
let tableProbe: Promise<void> | null = null;
const TABLE_PROBE_TIMEOUT_MS = 2_500;

/**
 * Probe the table exactly once per session.
 *
 * Retailers are optional infrastructure: before migration 008 is applied the
 * table genuinely does not exist, and every read would otherwise issue a 404.
 * One cheap HEAD-style request, cached forever, keeps the console clean and the
 * behaviour obvious ("no DB yet → snapshot").
 */
async function ensureTableProbed(): Promise<void> {
  if (retailerTableMissing || !isSupabaseConfigured || !supabase) return;
  if (Date.now() < retailerTableUnavailableUntil) return;
  retailerTableUnavailableUntil = 0;
  if (tableProbe) return tableProbe;

  const client = supabase;
  tableProbe = (async () => {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const probe = client.from('retailer_products').select('id').limit(1);
      const timeout = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, TABLE_PROBE_TIMEOUT_MS);
      });
      const result = await Promise.race([probe, timeout]);
      if (timeoutId) clearTimeout(timeoutId);

      if (result === null) {
        // Do not let a sleeping DB block the first AI response indefinitely.
        retailerTableUnavailableUntil = Date.now() + 30_000;
        return;
      }
      if (result.error && isMissingTable(result.error)) {
        retailerTableMissing = true;
        return;
      }
      if (result.error) retailerTableUnavailableUntil = Date.now() + 30_000;
    } catch {
      if (timeoutId) clearTimeout(timeoutId);
      retailerTableUnavailableUntil = Date.now() + 30_000;
    } finally {
      // Failed probes must be retried after the cooldown, rather than caching
      // a resolved promise forever and silently treating the DB as healthy.
      if (timedOut || retailerTableUnavailableUntil > Date.now()) tableProbe = null;
    }
  })();

  await tableProbe;
}

/** Snapshot rows plus whatever the Sigma worker last published. */
async function allOffers(includeSigma = true): Promise<RetailerOffer[]> {
  // AI has a tighter fallback deadline; the UI/catalogue can wait longer.
  await loadFullSnapshot(includeSigma ? FEED_TIMEOUT_MS : 2_500);
  const base = loadSnapshotOffers();
  // AI recommendations do not need Sigma to answer. Sigma is a separate feed
  // and may time out on a mobile connection; keep it out of the AI hot path.
  if (includeSigma) await loadSigmaOffers();
  return includeSigma && sigmaOffers.length ? [...base, ...sigmaOffers] : base;
}

/** Build offers from one snapshot page, linking each to a catalogue id by name. */
function mapSnapshotOffers(products: SnapshotProduct[], capturedAt: string, prefix = 'snap'): RetailerOffer[] {
  return products.map((product, index) => {
    const category = categoryOf(product);
    const match = matchSnapshotToCatalogue(product.name, category);
    return {
      id: `${prefix}-${index}`,
      retailerId: product.retailerId,
      name: product.name,
      category: category ?? null,
      priceEgp: product.priceEgp,
      priceIsPlaceholder: product.priceIsPlaceholder,
      originalPriceEgp: product.originalPriceEgp,
      stockStatus: product.stockStatus,
      productUrl: product.productUrl,
      imageUrl: product.imageUrl,
      matchedComponentId: match?.id ?? null,
      matchConfidence: match?.confidence ?? null,
      lastScrapedAt: capturedAt,
    };
  });
}

/** Full feed mapping is cached; category shards keep AI catalogue lookups small. */
function loadSnapshotOffers(): RetailerOffer[] {
  if (!snapshotOffers) snapshotOffers = mapSnapshotOffers(CURRENT_FEED.products, CURRENT_FEED.capturedAt);
  return snapshotOffers;
}

const categorySnapshotPromises = new Map<ComponentCategory, Promise<RetailerOffer[] | null>>();

async function loadCategorySnapshotOffers(category: ComponentCategory): Promise<RetailerOffer[] | null> {
  const cached = categorySnapshotPromises.get(category);
  if (cached) return cached;

  const pending = (async (): Promise<RetailerOffer[] | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    try {
      const base = import.meta.env.BASE_URL || '/';
      const url = `${base.endsWith('/') ? base : `${base}/`}data/retailer_snapshot_by_category/${category}.json`;
      const response = await fetch(url, { cache: 'force-cache', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) return null;
      const payload = (await response.json()) as Partial<SnapshotFeed>;
      const products = Array.isArray(payload.products) ? payload.products.filter(isSnapshotProduct) : [];
      if (!products.length) return null;
      return mapSnapshotOffers(products, typeof payload.capturedAt === 'string' ? payload.capturedAt : BOOTSTRAP.capturedAt, `snap-${category}`);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();

  categorySnapshotPromises.set(category, pending);
  const result = await pending;
  if (!result) categorySnapshotPromises.delete(category);
  return result;
}

async function fallbackOffers(filters: RetailerProductFilters, includeSigma: boolean): Promise<RetailerOffer[]> {
  let base: RetailerOffer[] | null = null;
  if (filters.category) base = await loadCategorySnapshotOffers(filters.category);
  if (!base) return allOffers(includeSigma);
  if (!includeSigma) return base;
  await loadSigmaOffers();
  return sigmaOffers.length ? [...base, ...sigmaOffers] : base;
}

/**
 * Name matching against the local catalogue.
 *
 * Mirrors `scoreMatch` in retailer-sync/index.ts: coverage of the catalogue name
 * plus a hard model-identifier gate. Kept in sync deliberately — the alternative
 * (importing Deno code into the bundle) is worse than a small duplication.
 */
const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'gaming', 'edition', 'new', 'original', 'lhr',
  'graphics', 'card', 'processor', 'tray', 'box', 'retail', 'gt', 'series',
  'super', 'ti', 'xt', 'xtx', 'oc', 'mb', 'gb', 'khz', 'mhz', 'core', 'thread',
  'threads', 'desktop', 'unlocked', 'mpk', 'ddr4', 'ddr5', 'ddr6', 'gddr6',
  'gddr7', 'rgb', 'argb', 'white', 'black', 'fan', 'fans',
]);

const tokenise = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

const models = (name: string): string[] => tokenise(name).filter((t) => /\d/.test(t));

export function scoreNameMatch(productName: string, catalogueName: string): number {
  const productTokens = new Set(tokenise(productName));
  const catalogueTokens = tokenise(catalogueName);
  if (!catalogueTokens.length) return 0;

  let covered = 0;
  for (const token of catalogueTokens) if (productTokens.has(token)) covered += 1;
  const coverage = covered / catalogueTokens.length;

  const productModels = new Set(models(productName));
  const catalogueModels = models(catalogueName);

  /**
   * Model identifiers must match EXACTLY, and the product must not be a variant.
   *
   * Real data broke both looser rules:
   *   · substring → "7800x3d" (Ryzen) matched "7800" (Radeon)
   *   · prefix    → "14900kf" (no iGPU, cheaper) matched "14900k"
   * A CPU/GPU SKU is an exact identifier; anything else is a different product.
   */
  const modelMatch = catalogueModels.every((m) => productModels.has(m));
  const variant = catalogueModels.some((m) => [...productModels].some((p) => p !== m && p.startsWith(m)));

  return modelMatch && !variant ? coverage : coverage * 0.3;
}

function matchSnapshotToCatalogue(
  _productName: string,
  _category: ComponentCategory | null,
): { id: string; confidence: number } | null {
  /**
   * Retired in Phase 15.
   *
   * These columns linked a listing to the hand-written `sampleComponents`
   * catalogue. That catalogue is gone: the Builder builds from the retailer
   * listings themselves (`lib/retailerCatalogue.ts`), grouped by SKU, so a
   * listing IS the component and there is nothing to match against.
   *
   * The columns stay in the schema (migration 008, and its view
   * `component_best_price`) because dropping them would need a migration; the
   * read path simply stops populating them. `matchedComponentId` is kept as a
   * nullable field on `RetailerOffer` so the type does not lie about the data.
   */
  return null;
}

interface RetailerRow {
  id: string;
  retailer_id: string;
  name: string;
  category: string | null;
  price_egp: number | string;
  original_price_egp: number | string | null;
  stock_status: string;
  product_url: string;
  image_url: string | null;
  matched_component_id: string | null;
  match_confidence: number | string | null;
  last_scraped_at: string;
  specs?: Record<string, unknown> | null;
}

function toOffer(row: RetailerRow): RetailerOffer {
  return {
    id: row.id,
    retailerId: row.retailer_id as RetailerId,
    name: row.name,
    // Same rules as the snapshot: a row written before Phase 15 is corrected on
    // read rather than trusted.
    category: categoryOf({ category: row.category, name: row.name, productUrl: row.product_url }),
    // numeric columns arrive as strings from PostgREST.
    priceEgp: Number(row.price_egp),
    originalPriceEgp: row.original_price_egp === null ? null : Number(row.original_price_egp),
    stockStatus: (row.stock_status as RetailerOffer['stockStatus']) ?? 'unknown',
    productUrl: row.product_url,
    imageUrl: row.image_url,
    specs: row.specs ?? undefined,
    matchedComponentId: row.matched_component_id,
    matchConfidence: row.match_confidence === null ? null : Number(row.match_confidence),
    lastScrapedAt: row.last_scraped_at,
  };
}

const byBestOffer = compareOffers;

/**
 * Build a comparison from a set of offers for one component.
 * Exported for tests: the "best offer" rule is worth pinning down.
 */
export function summariseOffers(
  componentId: string,
  componentName: string,
  offers: RetailerOffer[],
): PriceComparison {
  const sorted = [...offers].sort(byBestOffer);
  const best = sorted[0] ?? null;

  const inStock = sorted.filter((o) => o.stockStatus === 'in_stock');
  const pool = inStock.length ? inStock : sorted;
  const cheapest = pool[0]?.priceEgp ?? 0;
  const dearest = pool[pool.length - 1]?.priceEgp ?? 0;

  const lastScrapedAt = sorted.reduce<string | null>(
    (latest, offer) => (!latest || offer.lastScrapedAt > latest ? offer.lastScrapedAt : latest),
    null,
  );

  return {
    componentId,
    componentName,
    best,
    offers: sorted,
    savingsEgp: Math.max(0, dearest - cheapest),
    lastScrapedAt,
  };
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                   */
/* -------------------------------------------------------------------------- */

/** True when the DB table is absent and the snapshot is the only source. */
export function isRetailerTableMissing(): boolean {
  return retailerTableMissing;
}

/**
 * Recognise "this table is not available" so callers degrade instead of throwing.
 *
 * Supabase answers differently depending on the path AND the key:
 *   · PostgREST, when a table is missing from the schema cache → `PGRST205`
 *     ("Could not find the table … in the schema cache").
 *   · The anon key hitting a table that does not exist yet → plain **401**, often
 *     with an empty body — there is no table to grant a policy on.
 * Treating only PGRST205 as "missing" left the 401 bubbling up and the whole
 * search page rendered its error state on an unmigrated project.
 */
function isMissingTable(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  // 42501 = insufficient_privilege. A table created without
  // `GRANT SELECT … TO anon` is unreachable even though it exists, and PostgREST
  // rejects before RLS is evaluated. From the app's point of view that is the
  // same state as "not migrated yet": no data to read, use the snapshot.
  if (error.code === '42501') return true;
  if (/could not find the table|does not exist|relation .* does not exist/i.test(error.message ?? '')) return true;
  if (/permission denied for table/i.test(error.message ?? '')) return true;
  // 401/404 with no usable body: nothing to query.
  return (error.status === 401 || error.status === 404) && !error.message;
}

/**
 * Gate for every DB read: Supabase unconfigured OR the table not yet migrated.
 * Both mean "use the snapshot", and both must produce zero network traffic.
 * Call sites follow it with `if (shouldUseSnapshot() || !supabase)`, which both
 * short-circuits and narrows `supabase` to non-null.
 */
function shouldUseSnapshot(): boolean {
  return !isSupabaseConfigured || !supabase || retailerTableMissing || Date.now() < retailerTableUnavailableUntil;
}

/** Raw retailer listings, optionally filtered. */
export interface AggregatedProductOptions {
  /** Set false for latency-sensitive AI paths that do not need the Sigma-only feed. */
  includeSigma?: boolean;
}

export async function getAggregatedProducts(
  filters: RetailerProductFilters = {},
  options: AggregatedProductOptions = {},
): Promise<RetailerOffer[]> {
  const includeSigma = options.includeSigma !== false;
  // Probe Supabase first. When the live table is healthy, avoid downloading the
  // large static snapshot entirely; it is only a fallback for missing/empty DB.
  await ensureTableProbed();
  if (shouldUseSnapshot() || !supabase) return snapshotOnly(await fallbackOffers(filters, includeSigma), filters);

  let query = supabase
    .from('retailer_products')
    .select(
      'id, retailer_id, name, category, price_egp, original_price_egp, stock_status, product_url, image_url, specs, matched_component_id, match_confidence, last_scraped_at',
    )
    .order('price_egp', { ascending: true });

  if (filters.category) query = query.eq('category', filters.category);
  if (filters.retailerId) query = query.eq('retailer_id', filters.retailerId);
  if (filters.maxPriceEgp) query = query.lte('price_egp', filters.maxPriceEgp);
  if (filters.inStockOnly) query = query.eq('stock_status', 'in_stock');
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load retailer prices: ${error.message}`);

  const rows = ((data ?? []) as RetailerRow[]).map(toOffer);

  // The DB is authoritative, but before the first sync it is empty — fall back
  // to the snapshot so the UI is not blank on day one.
  //
  // This MUST read the snapshot directly. Calling getAggregatedProducts() again
  // recursed infinitely on an empty table: the query succeeds with zero rows, so
  // the recursive call re-queried, returned zero again, and re-queried — the page
  // froze with "0 results" forever. `snapshotOnly()` makes the fallback terminal.
  if (rows.length === 0) return snapshotOnly(await fallbackOffers(filters, includeSigma), filters);
  return rows;
}

/** Snapshot rows matching the filters. Never touches the network. * Requires the `await` first: the Sigma feed is fetched from a static JSON file,
 * so this is the one read here that is not purely in-memory.
 */
function snapshotOnly(all: RetailerOffer[], filters: RetailerProductFilters): RetailerOffer[] {
  return all.filter(
    (offer) =>
      (!filters.category || offer.category === filters.category) &&
      (!filters.retailerId || offer.retailerId === filters.retailerId) &&
      (!filters.inStockOnly || offer.stockStatus === 'in_stock'),
  );
}

/**
 * DEPRECATED — kept for the name-based compare path only.
 *
 * These ids were catalogue rows from the hand-written `components` table. The
 * Builder's components are retailer LISTINGS now (`lib/retailerCatalogue`), so
 * `matched_component_id` is never populated and nothing calls this. It stays
 * because `comparePrices` (name-based, still used by advisor citations) shares
 * its fallback shape, and deleting it would mean rewriting that path too — see
 * docs/AUDIT.md § 65 for the follow-up.
 */
export async function getRetailerOffersForComponent(
  componentId: string,
): Promise<{ best: RetailerOffer | null; offers: RetailerOffer[] }> {
  await loadFullSnapshot();
  await ensureTableProbed();
  if (shouldUseSnapshot() || !supabase) {
    const offers = (await allOffers())
      .filter((offer) => offer.matchedComponentId === componentId)
      .sort(byBestOffer);
    return { best: offers[0] ?? null, offers };
  }

  const { data, error } = await supabase
    .from('retailer_products')
    .select(
      'id, retailer_id, name, category, price_egp, original_price_egp, stock_status, product_url, image_url, specs, matched_component_id, match_confidence, last_scraped_at',
    )
    .eq('matched_component_id', componentId)
    .or(`match_confidence.gte.${MIN_MATCH_CONFIDENCE},match_confidence.is.null`);

  if (error) {
    if (isMissingTable(error)) {
      retailerTableMissing = true;
      const offers = (await allOffers())
        .filter((offer) => offer.matchedComponentId === componentId)
        .sort(byBestOffer);
      return { best: offers[0] ?? null, offers };
    }
    throw new Error(`Failed to load retailer offers: ${error.message}`);
  }

  const offers = ((data ?? []) as RetailerRow[]).map(toOffer).sort(byBestOffer);
  if (offers.length) return { best: offers[0] ?? null, offers };

  // Nothing matched in the DB yet — use the snapshot for this component.
  const fallback = (await allOffers())
    .filter((offer) => offer.matchedComponentId === componentId)
    .sort(byBestOffer);
  return { best: fallback[0] ?? null, offers: fallback };
}

/**
 * Batched version for grids: one query for many components.
 *
 * A per-card query would be N round-trips on the builder; this reads the whole
 * matched set once and groups in memory.
 */
export async function getBestPricesForComponents(
  componentIds: string[],
): Promise<Map<string, { bestPriceEgp: number; retailerId: RetailerId; url: string; count: number }>> {
  if (componentIds.length === 0) return new Map();

  await loadFullSnapshot();
  await ensureTableProbed();

  if (shouldUseSnapshot() || !supabase) {
    return mapBestPrices(
      (await allOffers()).filter(
        (offer) => offer.matchedComponentId && componentIds.includes(offer.matchedComponentId),
      ),
    );
  }

  const { data, error } = await supabase
    .from('retailer_products')
    .select('matched_component_id, retailer_id, price_egp, product_url, stock_status, match_confidence')
    .in('matched_component_id', componentIds);

  // Any error — including PGRST205 "table not found" before migration 008 is
  // applied — degrades to the snapshot. A missing table is a setup state, not a
  // user-facing failure, so it must not surface as a console error either.
  if (error) {
    if (isMissingTable(error)) retailerTableMissing = true;
    return mapBestPrices(await allOffers());
  }

  const grouped = new Map<string, RetailerOffer[]>();
  for (const row of (data ?? []) as unknown as RetailerRow[]) {
    const confidence = row.match_confidence === null ? null : Number(row.match_confidence);
    if (confidence !== null && confidence < MIN_MATCH_CONFIDENCE) continue;
    if (!row.matched_component_id) continue;

    const list = grouped.get(row.matched_component_id) ?? [];
    list.push(toOffer(row));
    grouped.set(row.matched_component_id, list);
  }

  if (grouped.size === 0) {
    // DB reachable but not yet synced — snapshot keeps the UI useful.
    return mapBestPrices(await allOffers());
  }

  return mapBestPrices([...grouped.values()].flat());
}

/** Collapse offers to the cheapest per component. */
function mapBestPrices(
  offers: RetailerOffer[],
): Map<string, { bestPriceEgp: number; retailerId: RetailerId; url: string; count: number }> {
  const result = new Map<string, { bestPriceEgp: number; retailerId: RetailerId; url: string; count: number }>();
  const grouped = new Map<string, RetailerOffer[]>();

  for (const offer of offers) {
    if (!offer.matchedComponentId) continue;
    const list = grouped.get(offer.matchedComponentId) ?? [];
    list.push(offer);
    grouped.set(offer.matchedComponentId, list);
  }

  for (const [componentId, list] of grouped) {
    const sorted = [...list].sort(byBestOffer);
    const best = sorted[0];
    if (!best) continue;
    result.set(componentId, {
      bestPriceEgp: best.priceEgp,
      retailerId: best.retailerId,
      url: best.productUrl,
      count: sorted.length,
    });
  }

  return result;
}

/** Cheapest offer for one component (null when nothing has been matched yet). */
export async function getBestPriceForComponent(componentId: string): Promise<RetailerOffer | null> {
  const { best } = await getRetailerOffersForComponent(componentId);
  return best;
}

/**
 * Name-based comparison, for places that only know a display name (e.g. the
 * advisor's citations). Prefers an exact component id when available.
 */
export async function comparePrices(componentName: string, componentId?: string): Promise<RetailerOffer[]> {
  if (shouldUseSnapshot() || !supabase) {
    const all = await allOffers();
    if (componentId) {
      const exact = all.filter((o) => o.matchedComponentId === componentId);
      if (exact.length) return exact.sort(byBestOffer);
    }
    return all.filter((o) => o.name.toLowerCase().includes(componentName.toLowerCase().slice(0, 20)));
  }

  if (componentId) {
    const { offers } = await getRetailerOffersForComponent(componentId);
    if (offers.length) return offers;
  }

  // Fall back to a case-insensitive name search over the raw feed.
  const { data, error } = await supabase
    .from('retailer_products')
    .select(
      'id, retailer_id, name, category, price_egp, original_price_egp, stock_status, product_url, image_url, specs, matched_component_id, match_confidence, last_scraped_at',
    )
    .ilike('name', `%${componentName.slice(0, 40)}%`)
    .limit(20);

  if (error) return [];
  return ((data ?? []) as RetailerRow[]).map(toOffer).sort(byBestOffer);
}

/** Which retailers are actually returning data right now (from the audit log). */
async function getSnapshotRetailerHealth(): Promise<
  Array<{ retailerId: RetailerId; status: string; productsUpserted: number; startedAt: string }>
> {
  await loadFullSnapshot();
  await loadSigmaOffers();
  const fromSnapshot = [...new Set(CURRENT_FEED.products.map((p) => p.retailerId))].map((retailerId) => ({
    retailerId,
    // Snapshot data is usable, but it is not evidence of a recent live sync.
    status: 'snapshot',
    productsUpserted: CURRENT_FEED.products.filter((p) => p.retailerId === retailerId).length,
    startedAt: CURRENT_FEED.capturedAt,
  }));

  if (!sigmaOffers.length) return fromSnapshot;

  const latest = sigmaOffers.reduce((newest, offer) => (offer.lastScrapedAt > newest ? offer.lastScrapedAt : newest), '');
  return [
    ...fromSnapshot,
    { retailerId: 'sigma' as const, status: 'snapshot', productsUpserted: sigmaOffers.length, startedAt: latest },
  ];
}

/** Which retailers have usable data, distinguishing synced rows from snapshots. */
export async function getRetailerHealth(): Promise<
  Array<{ retailerId: RetailerId; status: string; productsUpserted: number; startedAt: string }>
> {
  if (shouldUseSnapshot() || !supabase) return getSnapshotRetailerHealth();

  const { data, error } = await supabase
    .from('retailer_sync_runs')
    .select('retailer_id, status, products_upserted, started_at')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    // A missing audit table is a setup state, not a reason to hide working
    // snapshot data. Other temporary DB failures use the same safe fallback.
    if (isMissingTable(error)) retailerTableMissing = true;
    return getSnapshotRetailerHealth();
  }

  if (!data?.length) return getSnapshotRetailerHealth();

  const seen = new Set<string>();
  const out: Array<{ retailerId: RetailerId; status: string; productsUpserted: number; startedAt: string }> = [];
  for (const row of data) {
    if (seen.has(row.retailer_id)) continue;
    seen.add(row.retailer_id);
    if (!(row.retailer_id in RETAILERS)) continue;
    out.push({
      retailerId: row.retailer_id as RetailerId,
      status: row.status,
      productsUpserted: row.products_upserted,
      startedAt: row.started_at,
    });
  }
  return out.length ? out : getSnapshotRetailerHealth();
}

export type { ComponentCategory, PriceComparison, RetailerId, RetailerOffer };
