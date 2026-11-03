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
}

export interface RetailerFeed {
  capturedAt: string | null;
  downloaded: boolean;
  products: FeedProduct[];
}

const FEED_PATH = 'data/sigma_products.json';

let cached: Promise<RetailerFeed> | null = null;

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

/** Load the Sigma feed once per session. Never throws. */
export function loadSigmaFeed(): Promise<RetailerFeed> {
  cached ??= (async () => {
    try {
      const res = await fetch(feedUrl(), { headers: { Accept: 'application/json' } });
      if (!res.ok) return EMPTY;

      const payload = (await res.json()) as { capturedAt?: string; products?: unknown[] };
      const products = (payload.products ?? []).filter(isValid).map((row) => ({
        ...row,
        retailerId: 'sigma' as const,
      }));

      return { capturedAt: payload.capturedAt ?? null, downloaded: true, products };
    } catch {
      // Not deployed yet, blocked by the host, or offline — Sigma simply has no
      // data, which the UI already communicates.
      return EMPTY;
    }
  })();

  return cached;
}
