import type { RetailerId } from './types';

/**
 * Sigma Computer feed — the Playwright worker's output.
 *
 * Sigma cannot be scraped by the serverless sync (see `docs/RETAILER_STRATEGY.md`):
 * its catalogue only exists after the client bundle renders. `scripts/sigma_worker.py`
 * therefore runs on a schedule, renders the real page, and writes
 * `public/data/sigma_products.json`. This module fetches that file *relative to the
 * deploy base*, caches it for the session, and hands back rows in the same shape as
 * the other retailers so nothing downstream needs to special-case Sigma.
 *
 * Failure is not an error state: no file, a stale file, or a malformed file all
 * resolve to an empty list and the UI keeps its honest "Pending" badge.
 */

export interface FeedProduct {
  retailerId: RetailerId;
  externalId: string;
  name: string;
  category: string | null;
  priceEgp: number;
  originalPriceEgp: number | null;
  stockStatus: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';
  productUrl: string;
  imageUrl: string | null;
  /**
   * Scrape payload, optional.
   *
   * The worker publishes whatever the store rendered; the app infers the rest
   * (`lib/specInference`) at read time. Types are deliberately loose because the
   * feed is JSON produced by a Python script, not by this schema.
   */
  specs?: Record<string, unknown> | null;
}

export interface RetailerFeed {
  capturedAt: string | null;
  downloaded: boolean;
  products: FeedProduct[];
}

const FEED_PATH = 'data/sigma_products.json';

let cached: Promise<RetailerFeed> | null = null;
let retryAfter = 0;
const RETRY_DELAY_MS = 30_000;
const FEED_TIMEOUT_MS = 8_000;

const EMPTY: RetailerFeed = { capturedAt: null, downloaded: false, products: [] };

function feedUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${FEED_PATH}`;
}

function isValid(row: unknown): row is FeedProduct {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Partial<FeedProduct>;
  return (
    typeof candidate.name === 'string' &&
    candidate.name.length > 3 &&
    typeof candidate.priceEgp === 'number' &&
    candidate.priceEgp > 0 &&
    typeof candidate.productUrl === 'string' &&
    candidate.productUrl.startsWith('http')
  );
}

/** Load Sigma's published feed. Failed/empty reads retry after a short cooldown. */
export function loadSigmaFeed(): Promise<RetailerFeed> {
  if (cached) return cached;
  if (Date.now() < retryAfter) return Promise.resolve(EMPTY);

  cached = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
      const res = await fetch(feedUrl(), {
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Sigma feed returned HTTP ${res.status}`);

      const payload = (await res.json()) as { capturedAt?: string; products?: unknown[] };
      const products = (payload.products ?? []).filter(isValid).map((row) => ({
        ...row,
        retailerId: 'sigma' as const,
      }));
      if (!products.length) throw new Error('Sigma feed contains no valid products');

      retryAfter = 0;
      return { capturedAt: payload.capturedAt ?? null, downloaded: true, products };
    } catch (error) {
      // Avoid a retry loop when a CDN or network outage persists, but recover
      // automatically instead of caching an empty response for the full session.
      cached = null;
      retryAfter = Date.now() + RETRY_DELAY_MS;
      if (import.meta.env.DEV) console.warn('[retailers] Sigma feed unavailable; retry scheduled.', error);
      return EMPTY;
    } finally {
      clearTimeout(timer);
    }
  })();

  return cached;
}
