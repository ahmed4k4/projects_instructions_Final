/**
 * Retailer image URLs.
 *
 * Product photos are hotlinked from each store's CDN. Sigma's media host
 * (`api.sigma-computer.com/media/…`) answers 200 in isolation but rejects the
 * hotlinked `<img>` request in a browser, so the worker emits those URLs through
 * the store's own Next.js image proxy (`sigma-computer.com/_next/image?url=…`),
 * which serves them as WebP to anyone.
 *
 * Everything about "how do I display this retailer photo" lives here so the
 * search card, the autocomplete list and the compare table cannot drift apart.
 */

/** True for URLs that are placeholders rather than photographs. */
const UNUSABLE = /(placeholder|no_image|noimage|spacer|blank|pixel)\b/i;

/**
 * Normalise a retailer image URL for use in an `<img src>`.
 *
 * Returns null when the URL is missing or known-unusable, so callers fall back to
 * the category illustration instead of rendering an empty frame.
 */
export function retailerImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (UNUSABLE.test(url)) return null;
  return url;
}
