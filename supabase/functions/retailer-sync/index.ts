/**
 * `retailer-sync` — Supabase Edge Function (Deno).
 *
 * Scrapes the Egyptian retailers, links each product to a catalogue component,
 * and upserts into `retailer_products`. Runs daily from pg_cron (migration 009)
 * and can be triggered manually:
 *
 *   POST /functions/v1/retailer-sync  { "mode": "all" | "elbadr" | ... }
 *
 * Design notes
 *   · Politeness: robots.txt is honoured, requests are sequential with a 2 s gap
 *     per retailer, and each retailer has a page budget.
 *   · A retailer that yields zero products is recorded as `blocked` in
 *     `retailer_sync_runs` and does NOT fail the run — partial data is the norm
 *     for scraped feeds.
 *   · Matching is name-based and conservative: an unmatched product is still
 *     stored (so prices are visible in the raw feed) but contributes nothing to
 *     the best-price view until it clears the confidence threshold.
 *
 * Deploy:  supabase functions deploy retailer-sync --no-verify-jwt
 * Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { RETAILERS, isAllowed, type RetailerConfig, type ScrapedProduct } from './parsers.ts';

const USER_AGENT = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';
/** 2s between requests to the same retailer — both spec and courtesy. */
const REQUEST_DELAY_MS = 2000;
/** Belt-and-braces: a run must never exceed the Edge Function wall clock. */
const MAX_RUNTIME_MS = 240_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RunStats {
  pages: number;
  seen: number;
  upserted: number;
  matched: number;
}

/* -------------------------------------------------------------------------- */
/*  Fetch                                                                     */
/* -------------------------------------------------------------------------- */

async function fetchText(url: string): Promise<{ status: number; body: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text(), finalUrl: response.url };
  } catch {
    return { status: 0, body: '', finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*  Matching                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Normalise a product name for comparison: drop marketing noise, case, accents
 * and punctuation so "ASUS TUF Gaming GeForce RTX 4070 Ti SUPER OC 16GB" and
 * "Asus TUF-RTX4070TIS-O16G-GAMING" still share their tokens.
 */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'gaming',
  'edition',
  'new',
  'original',
  'lhr',
  'graphics',
  'card',
  'processor',
  'tray',
  'box',
  'retail',
  'gt',
  'series',
  'super',
  'ti',
  'xt',
  'xtx',
  'oc',
  'mb',
  'gb',
  'khz',
  'mhz',
  'core',
  'thread',
  'threads',
  'desktop',
  'unlocked',
  'mpk',
  'ddr4',
  'ddr5',
  'ddr6',
  'gddr6',
  'gddr7',
  'rgb',
  'argb',
  'white',
  'black',
  'fan',
  'fans',
  'كارت',
  'شاشة',
  'معالج',
  'ذاكرة',
  'مزود',
  'طاقة',
  'اصلية',
  'جديد',
]);

/** Token runs containing a digit: "RTX 4070" → ["4070"], "7800X3D" → ["7800x3d"]. */
const modelTokens = (name: string): string[] => tokens(name).filter((t) => /\d/.test(t));

/**
 * Score a scraped name against a catalogue name, 0..1.
 *
 * Two signals, because either alone is wrong:
 *   · COVERAGE — share of the catalogue's tokens present in the product name.
 *                Tolerates marketing suffixes ("MPK", "ARGB", "OC Edition").
 *   · MODEL    — every model identifier in the catalogue name must appear in the
 *                product name. Without this gate, coverage scores "RTX 3050"
 *                against "RTX 4090" at 0.5 — enough to publish the wrong price.
 *
 * A failed model gate multiplies the score by 0.3, so it can never clear a
 * threshold that coverage alone would.
 */
export function scoreMatch(
  productName: string,
  catalogueName: string,
): { score: number; coverage: number; modelMatch: boolean } {
  const productTokens = new Set(tokens(productName));
  const catalogueTokens = tokens(catalogueName);
  if (!catalogueTokens.length) return { score: 0, coverage: 0, modelMatch: false };

  let covered = 0;
  for (const token of catalogueTokens) if (productTokens.has(token)) covered += 1;
  const coverage = covered / catalogueTokens.length;

  const productModels = new Set(modelTokens(productName));

  /**
   * Model identifiers must match EXACTLY — and the product must not be a variant.
   *
   * Two looser rules were tried against live listings and both published wrong
   * prices:
   *   · `p.includes(m)` — "7800x3d" (Ryzen CPU) matched "7800" (Radeon GPU).
   *   · prefix + non-digit — "14900KF" (no iGPU, cheaper) matched "14900K".
   * A CPU/GPU SKU is an exact identifier; anything else is a different product.
   */
  const catalogueModels = modelTokens(catalogueName);
  const modelMatch = catalogueModels.every((m) => productModels.has(m));
  const variant = catalogueModels.some((m) => [...productModels].some((p) => p !== m && p.startsWith(m)));

  const valid = modelMatch && !variant;

  return {
    score: Number((valid ? coverage : coverage * 0.3).toFixed(3)),
    coverage: Number(coverage.toFixed(3)),
    modelMatch: valid,
  };
}

interface CatalogueEntry {
  id: string;
  name: string;
  category: string;
}

/**
 * Best catalogue match for a scraped product.
 *
 * Only compares within the same category — a GPU must never match a CPU just
 * because both say "AMD". Returns null when nothing clears the floor, which is
 * the honest answer for parts we do not carry.
 */
export function matchComponent(
  product: ScrapedProduct,
  catalogue: CatalogueEntry[],
): { id: string; confidence: number } | null {
  let best: { id: string; confidence: number } | null = null;

  for (const entry of catalogue) {
    if (entry.category !== product.category) continue;
    const { score } = scoreMatch(product.name, entry.name);
    if (!best || score > best.confidence) best = { id: entry.id, confidence: score };
  }

  // Calibrated against real listings (scripts/_matcher-test.mjs): true matches
  // score 0.75–1.0, non-matches score ≤0.2. 0.5 sits clear of both bands.
  return best && best.confidence >= 0.5 ? best : null;
}

/* -------------------------------------------------------------------------- */
/*  Sync one retailer                                                         */
/* -------------------------------------------------------------------------- */

async function syncRetailer(
  supabase: ReturnType<typeof createClient>,
  retailer: RetailerConfig,
  catalogue: CatalogueEntry[],
): Promise<{ stats: RunStats; status: 'ok' | 'partial' | 'failed' | 'blocked'; error: string | null }> {
  const stats: RunStats = { pages: 0, seen: 0, upserted: 0, matched: 0 };
  const failures: string[] = [];
  const started = Date.now();

  // robots.txt gate — respect it before touching any listing.
  const origin = new URL(retailer.home).origin;
  const robots = await fetchText(`${origin}/robots.txt`);
  if (robots.status === 200) {
    for (const target of retailer.targets) {
      if (!isAllowed(robots.body, new URL(target.url).pathname)) {
        failures.push(`robots.txt disallows ${target.url}`);
      }
    }
    if (failures.length === retailer.targets.length) {
      return { stats, status: 'blocked', error: failures.join('; ') };
    }
  }

  const byExternalId = new Map<
    string,
    ScrapedProduct & { matchedId: string | null; confidence: number | null }
  >();

  for (const target of retailer.targets) {
    if (Date.now() - started > MAX_RUNTIME_MS) {
      failures.push('runtime budget exhausted');
      break;
    }
    if (failures.some((f) => f.includes(target.url))) continue;

    const page = await fetchText(target.url);
    stats.pages += 1;

    if (page.status !== 200 || !page.body) {
      failures.push(`${target.url} → HTTP ${page.status || 'error'}`);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    let products: ScrapedProduct[] = [];
    try {
      products = retailer.parse(page.body, page.finalUrl);
    } catch (error) {
      failures.push(`${target.url} → parse: ${(error as Error).message}`);
    }

    for (const product of products) {
      const match = matchComponent(product, catalogue);
      byExternalId.set(product.externalId, {
        ...product,
        matchedId: match?.id ?? null,
        confidence: match ? Number(match.confidence.toFixed(3)) : null,
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const rows = [...byExternalId.values()];
  stats.seen = rows.length;

  if (rows.length > 0) {
    // Upsert in one round-trip: the unique (retailer_id, external_id) constraint
    // turns this into "insert or refresh".
    const payload = rows.map((row) => ({
      retailer_id: row.retailerId,
      external_id: row.externalId,
      name: row.name.slice(0, 400),
      category: row.category,
      price_egp: row.priceEgp,
      original_price_egp: row.originalPriceEgp,
      currency: 'EGP',
      stock_status: row.stockStatus,
      product_url: row.productUrl,
      image_url: row.imageUrl,
      specs: row.specs,
      matched_component_id: row.matchedId,
      match_confidence: row.confidence,
      last_scraped_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('retailer_products')
      .upsert(payload, { onConflict: 'retailer_id,external_id' });

    if (error) {
      return { stats, status: 'failed', error: `upsert failed: ${error.message}` };
    }

    stats.upserted = payload.length;
    stats.matched = rows.filter((r) => r.matchedId).length;
  }

  const status = rows.length === 0 ? 'blocked' : failures.length > 0 ? 'partial' : 'ok';

  return {
    stats,
    status,
    error: failures.length ? failures.join('; ').slice(0, 500) : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                   */
/* -------------------------------------------------------------------------- */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase env is not configured.' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let mode = 'all';
  try {
    const body = (await request.json()) as { mode?: string };
    if (body?.mode) mode = body.mode;
  } catch {
    /* no body → run everything */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Catalogue is small (tens of rows); one read serves every match.
  const { data: components, error: catalogueError } = await supabase
    .from('components')
    .select('id, name, category')
    .eq('is_active', true);

  if (catalogueError) {
    return new Response(JSON.stringify({ error: `catalogue read failed: ${catalogueError.message}` }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const catalogue = (components ?? []) as CatalogueEntry[];
  const targets = RETAILERS.filter((r) => mode === 'all' || r.id === mode);
  const results = [];

  for (const retailer of targets) {
    const { data: runRow } = await supabase
      .from('retailer_sync_runs')
      .insert({ retailer_id: retailer.id, status: 'running' })
      .select('id')
      .single();

    const startedAt = new Date().toISOString();
    let outcome;
    try {
      outcome = await syncRetailer(supabase, retailer, catalogue);
    } catch (error) {
      outcome = {
        stats: { pages: 0, seen: 0, upserted: 0, matched: 0 },
        status: 'failed' as const,
        error: (error as Error).message,
      };
    }

    if (runRow?.id) {
      await supabase
        .from('retailer_sync_runs')
        .update({
          status: outcome.status,
          finished_at: new Date().toISOString(),
          pages_fetched: outcome.stats.pages,
          products_seen: outcome.stats.seen,
          products_upserted: outcome.stats.upserted,
          products_matched: outcome.stats.matched,
          error: outcome.error,
        })
        .eq('id', runRow.id);
    }

    results.push({
      retailer: retailer.id,
      status: outcome.status,
      startedAt,
      ...outcome.stats,
      error: outcome.error,
    });
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
