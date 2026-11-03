import { describe, expect, it } from 'vitest';
import { summariseOffers } from '@/services/retailers/aggregator';

/**
 * Phase 11 — a store "price" of 1 EGP must never win a comparison.
 *
 * Elbadr publishes `1 EGP` on 143 cards when the real price is withheld,
 * including a 5090. It reached the UI as "BEST PRICE EGP 1".
 */
describe('placeholder prices never win', () => {
  const offer = (id: string, priceEgp: number, stockStatus: 'in_stock' | 'out_of_stock' = 'in_stock') => ({
    id,
    retailerId: 'elbadr' as const,
    name: `Part ${id}`,
    priceEgp,
    originalPriceEgp: null,
    stockStatus,
    productUrl: 'https://example.com',
    imageUrl: null,
    matchedComponentId: null,
    matchConfidence: null,
    lastScrapedAt: '2026-11-02T00:00:00.000Z',
  });

  it('ranks a real offer above an in-stock 1 EGP placeholder', () => {
    const summary = summariseOffers('x', 'Part', [offer('a', 1), offer('b', 64_000)]);
    expect(summary.best?.id).toBe('b');
  });

  it('still prefers a cheaper real offer among genuine prices', () => {
    const summary = summariseOffers('x', 'Part', [offer('a', 70_000), offer('b', 64_000)]);
    expect(summary.best?.id).toBe('b');
  });

  it('never reports savings computed against a placeholder', () => {
    const summary = summariseOffers('x', 'Part', [offer('a', 1), offer('b', 64_000)]);
    expect(summary.savingsEgp).toBe(0);
  });
});
