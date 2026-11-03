/**
 * Offer ranking — the ONE place that decides which price a card headlines.
 *
 * Two modules used to rank independently (`services/retailers/aggregator` and
 * `services/searchService`), and a placeholder-price rule added to one did not
 * reach the other: the search page kept showing "EGP 1" for a 5090 while the
 * builder page was already correct. Ranking is a policy decision, so it lives
 * here and both call sites share it.
 */
import type { RetailerOffer } from '@/services/retailers/types';

/**
 * Below this, an "EGP" figure is a store placeholder, not a price.
 *
 * Measured: Elbadr prints `1 EGP` on 176 cards when the real price is withheld
 * (including a 5090); the cheapest genuine GPU is ~2,700 EGP.
 */
export const MIN_REAL_PRICE_EGP = 100;

/**
 * True when an offer's price cannot be presented as the product's price.
 *
 * The parser sets the flag; the threshold is the second net for older snapshots
 * captured before the flag existed.
 */
export function isPlaceholderPrice(offer: Pick<RetailerOffer, 'priceEgp' | 'priceIsPlaceholder'>): boolean {
  return offer.priceIsPlaceholder === true || offer.priceEgp < MIN_REAL_PRICE_EGP;
}

/**
 * The comparison order every consumer uses.
 *
 *   1. real prices before placeholders  (a 1 EGP 5090 must never win)
 *   2. confirmed in-stock before limited, unknown, and out-of-stock
 *   3. cheapest first
 *   4. stable tiebreak on retailer, so equal prices do not jump between renders
 */
export function compareOffers(a: RetailerOffer, b: RetailerOffer): number {
  const aReal = isPlaceholderPrice(a) ? 1 : 0;
  const bReal = isPlaceholderPrice(b) ? 1 : 0;
  if (aReal !== bReal) return aReal - bReal;

  const stockRank: Record<RetailerOffer['stockStatus'], number> = {
    in_stock: 0,
    limited: 1,
    unknown: 2,
    out_of_stock: 3,
  };
  const aStock = stockRank[a.stockStatus] ?? stockRank.unknown;
  const bStock = stockRank[b.stockStatus] ?? stockRank.unknown;
  if (aStock !== bStock) return aStock - bStock;

  return a.priceEgp - b.priceEgp || a.retailerId.localeCompare(b.retailerId);
}

/** `compareOffers` as an array helper. */
export function rankOffers(offers: RetailerOffer[]): RetailerOffer[] {
  return [...offers].sort(compareOffers);
}
