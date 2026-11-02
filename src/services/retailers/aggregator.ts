import type { ComponentCategory } from '@/types/components';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import snapshot from './snapshot.json';
import { sampleComponents } from '@/lib/sampleData';
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

/* -------------------------------------------------------------------------- */
/*  Local snapshot fallback                                                   */
/* -------------------------------------------------------------------------- */

interface SnapshotProduct {
  retailerId: RetailerId;
  externalId: string;
  name: string;
  category: string | null;
  priceEgp: number;
  originalPriceEgp: number | null;
  stockStatus: RetailerOffer['stockStatus'];
  productUrl: string;
  imageUrl: string | null;
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
 */
const SNAPSHOT = snapshot as unknown as {
  capturedAt: string;
  retailers: string[];
  products: SnapshotProduct[];
};

let snapshotOffers: RetailerOffer[] | null = null;

/**
 * Set once the DB reports `retailer_products` does not exist (PGRST205).
 *
 * A missing table is a SETUP state — migration 008 has not been applied yet —
 * not a runtime error. Without this flag every page issued the query again,
 * React Query retried it, and the console filled with 404s. Once flipped, the
 * app reads the snapshot directly and makes no further requests.
 */
let retailerTableMissing = false;
/** Resolves once: does `retailer_products` exist? Shared by every reader. */
let tableProbe: Promise<void> | null = null;

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

  tableProbe ??= (async () => {
    const client = supabase;
    if (!client) return;
    const { error } = await client.from('retailer_products').select('id').limit(1);
    if (error && isMissingTable(error)) retailerTableMissing = true;
  })();

  await tableProbe;
}

/** Build offers from the snapshot, linking each to a catalogue id by name. */
function loadSnapshotOffers(): RetailerOffer[] {
  if (snapshotOffers) return snapshotOffers;

  snapshotOffers = SNAPSHOT.products.map((product, index) => {
    const match = matchSnapshotToCatalogue(product.name, product.category);
    return {
      id: `snap-${index}`,
      retailerId: product.retailerId,
      name: product.name,
      category: (product.category as ComponentCategory | null) ?? null,
      priceEgp: product.priceEgp,
      originalPriceEgp: product.originalPriceEgp,
      stockStatus: product.stockStatus,
      productUrl: product.productUrl,
      imageUrl: product.imageUrl,
      matchedComponentId: match?.id ?? null,
      matchConfidence: match?.confidence ?? null,
      lastScrapedAt: SNAPSHOT.capturedAt,
    };
  });

  return snapshotOffers;
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
  productName: string,
  category: string | null,
): { id: string; confidence: number } | null {
  if (!category) return null;
  let best: { id: string; confidence: number } | null = null;

  for (const component of sampleComponents) {
    if (component.category !== category) continue;
    const confidence = scoreNameMatch(productName, component.name);
    if (!best || confidence > best.confidence) best = { id: component.id, confidence };
  }

  return best && best.confidence >= 0.5 ? best : null;
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
}

function toOffer(row: RetailerRow): RetailerOffer {
  return {
    id: row.id,
    retailerId: row.retailer_id as RetailerId,
    name: row.name,
    // numeric columns arrive as strings from PostgREST.
    priceEgp: Number(row.price_egp),
    originalPriceEgp: row.original_price_egp === null ? null : Number(row.original_price_egp),
    stockStatus: (row.stock_status as RetailerOffer['stockStatus']) ?? 'unknown',
    productUrl: row.product_url,
    imageUrl: row.image_url,
    matchedComponentId: row.matched_component_id,
    matchConfidence: row.match_confidence === null ? null : Number(row.match_confidence),
    lastScrapedAt: row.last_scraped_at,
  };
}

/** In-stock first, then cheapest. */
function byBestOffer(a: RetailerOffer, b: RetailerOffer): number {
  const aStock = a.stockStatus === 'in_stock' ? 0 : 1;
  const bStock = b.stockStatus === 'in_stock' ? 0 : 1;
  return aStock - bStock || a.priceEgp - b.priceEgp;
}

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
  return !isSupabaseConfigured || !supabase || retailerTableMissing;
}

/** Raw retailer listings, optionally filtered. */
export async function getAggregatedProducts(filters: RetailerProductFilters = {}): Promise<RetailerOffer[]> {
  await ensureTableProbed();
  if (shouldUseSnapshot() || !supabase) {
    return loadSnapshotOffers().filter(
      (offer) =>
        (!filters.category || offer.category === filters.category) &&
        (!filters.retailerId || offer.retailerId === filters.retailerId) &&
        (!filters.inStockOnly || offer.stockStatus === 'in_stock'),
    );
  }
  if (!isSupabaseConfigured || !supabase) {
    return loadSnapshotOffers().filter(
      (offer) =>
        (!filters.category || offer.category === filters.category) &&
        (!filters.retailerId || offer.retailerId === filters.retailerId) &&
        (!filters.inStockOnly || offer.stockStatus === 'in_stock'),
    );
  }

  let query = supabase
    .from('retailer_products')
    .select(
      'id, retailer_id, name, category, price_egp, original_price_egp, stock_status, product_url, image_url, matched_component_id, match_confidence, last_scraped_at',
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
  if (rows.length === 0) return getAggregatedProducts(filters);
  return rows;
}

/**
 * Every retailer's offer for one catalogue component, cheapest first.
 *
 * Rows below `MIN_MATCH_CONFIDENCE` are excluded: a wrong match is worse than no
 * comparison, because users act on prices.
 */
export async function getRetailerOffersForComponent(
  componentId: string,
): Promise<{ best: RetailerOffer | null; offers: RetailerOffer[] }> {
  await ensureTableProbed();
  if (shouldUseSnapshot() || !supabase) {
    const offers = loadSnapshotOffers()
      .filter((offer) => offer.matchedComponentId === componentId)
      .sort(byBestOffer);
    return { best: offers[0] ?? null, offers };
  }

  const { data, error } = await supabase
    .from('retailer_products')
    .select(
      'id, retailer_id, name, category, price_egp, original_price_egp, stock_status, product_url, image_url, matched_component_id, match_confidence, last_scraped_at',
    )
    .eq('matched_component_id', componentId)
    .or(`match_confidence.gte.${MIN_MATCH_CONFIDENCE},match_confidence.is.null`);

  if (error) {
    if (isMissingTable(error)) {
      retailerTableMissing = true;
      const offers = loadSnapshotOffers()
        .filter((offer) => offer.matchedComponentId === componentId)
        .sort(byBestOffer);
      return { best: offers[0] ?? null, offers };
    }
    throw new Error(`Failed to load retailer offers: ${error.message}`);
  }

  const offers = ((data ?? []) as RetailerRow[]).map(toOffer).sort(byBestOffer);
  if (offers.length) return { best: offers[0] ?? null, offers };

  // Nothing matched in the DB yet — use the snapshot for this component.
  const fallback = loadSnapshotOffers()
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

  await ensureTableProbed();

  if (shouldUseSnapshot() || !supabase) {
    return mapBestPrices(
      loadSnapshotOffers().filter(
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
    return mapBestPrices(loadSnapshotOffers());
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
    return mapBestPrices(loadSnapshotOffers());
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
    const all = loadSnapshotOffers();
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
      'id, retailer_id, name, category, price_egp, original_price_egp, stock_status, product_url, image_url, matched_component_id, match_confidence, last_scraped_at',
    )
    .ilike('name', `%${componentName.slice(0, 40)}%`)
    .limit(20);

  if (error) return [];
  return ((data ?? []) as RetailerRow[]).map(toOffer).sort(byBestOffer);
}

/** Which retailers are actually returning data right now (from the audit log). */
export async function getRetailerHealth(): Promise<
  Array<{ retailerId: RetailerId; status: string; productsUpserted: number; startedAt: string }>
> {
  // No sync log to read (DB unconfigured or unmigrated) — report the snapshot
  // capture time so the UI can still say how fresh the prices are.
  if (shouldUseSnapshot() || !supabase) {
    return [...new Set(SNAPSHOT.products.map((p) => p.retailerId))].map((retailerId) => ({
      retailerId,
      status: 'ok',
      productsUpserted: SNAPSHOT.products.filter((p) => p.retailerId === retailerId).length,
      startedAt: SNAPSHOT.capturedAt,
    }));
  }

  const { data, error } = await supabase
    .from('retailer_sync_runs')
    .select('retailer_id, status, products_upserted, started_at')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    // A missing audit table means migration 008/009 have not been applied at
    // all — flip the flag so no other query probes the DB this session.
    if (isMissingTable(error)) retailerTableMissing = true;
    return [];
  }

  const seen = new Set<string>();
  const out: Array<{ retailerId: RetailerId; status: string; productsUpserted: number; startedAt: string }> =
    [];
  for (const row of data ?? []) {
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
  return out;
}

export type { ComponentCategory, PriceComparison, RetailerId, RetailerOffer };
