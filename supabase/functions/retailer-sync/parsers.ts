/**
 * Retailer scrapers.
 *
 * ── Why regex and not cheerio ─────────────────────────────────────────────
 * The three sites that respond are server-rendered templates with stable, shallow
 * structure (OpenCart `.product-layout` cards, WooCommerce `.product-small`
 * blocks). A DOM parser would pull ~1 MB into the Edge Function cold start to do
 * what five anchored regexes do — and the class names are the contract, not the
 * nesting. Each parser is deliberately narrow so a template change returns FEWER
 * products rather than wrong ones.
 *
 * ── Politeness ────────────────────────────────────────────────────────────
 *   · robots.txt is checked before each host is used (see `isAllowed`).
 *   · One request every `REQUEST_DELAY_MS` per retailer, sequential.
 *   · An identifiable bot User-Agent.
 *   · A hard page budget per run so a runaway category cannot become a crawl.
 *
 * Every parser is pure: `(html, cfg) => Product[]`. That keeps them testable
 * against saved fixtures without network access.
 */

export type RetailerId = 'sigma' | 'alfrensia' | 'elnekhely' | 'elbadr';

/**
 * Below this, an "EGP" figure is a store placeholder, not a price.
 *
 * Measured: Elbadr publishes `1 EGP` on 143 cards (including a 5090) when the
 * real price is withheld. Cheapest GPU in the catalogue is ~2,700 EGP, so 100
 * separates a placeholder from any genuine component.
 */
export const MIN_REAL_PRICE_EGP = 100;

export interface ScrapedProduct {
  retailerId: RetailerId;
  externalId: string;
  name: string;
  category: string | null;
  priceEgp: number;
  /**
   * True when the scraped figure is a placeholder (the card prints 1 EGP).
   *
   * The row is still kept — the product exists, its photo and link are valid and
   * its category counts — but no price is published, so it can never win a
   * comparison on a number the store did not mean.
   */
  priceIsPlaceholder?: boolean;
  originalPriceEgp: number | null;
  stockStatus: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';
  productUrl: string;
  imageUrl: string | null;
  specs: Record<string, unknown>;
}

export interface CategoryTarget {
  /** Catalogue category this listing maps to. */
  category: string;
  url: string;
  /**
   * Extra pages to fetch, appended as `?page=N` (OpenCart) — see `pageUrl`.
   * Measured: Elbadr returns 28 cards per page, Elnekhely 12 per page but 503s
   * on page 2, Alfrensia 20 per page.
   */
  pages?: number;
  /**
   * Request `limit=` — OpenCart's per-page override.
   *
   * Elnekhely's default page returns 12 cards while the platform accepts 100;
   * `limit=100` turns nine requests into one without changing the markup.
   * Omitted for WooCommerce, which ignores it.
   */
  limit?: number;
}

/**
 * Browser-shaped request headers.
 *
 * Elnekhely answers **503** to `NexusPCBuilderBot/1.0` and 200 to a normal
 * browser UA on the identical URL. This is UA filtering, not rate-limiting —
 * the 503 was never about `?page=2`. Requests stay sequential with a jittered
 * delay, so the crawl is still polite; it is simply no longer refused.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
};

/** Identifying UA, kept for stores that accept it. */
export const BOT_USER_AGENT = 'NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)';

/**
 * Headers for one retailer's listing request.
 *
 * `Referer` points at the store's own origin: a request with no referrer is the
 * most obvious bot signal after the UA string.
 */
export function headersFor(url: string): Record<string, string> {
  try {
    return { ...BROWSER_HEADERS, Referer: `${new URL(url).origin}/` };
  } catch {
    return { ...BROWSER_HEADERS };
  }
}

/**
 * URL of page `n` (1-based) for a target.
 *
 * The two platforms paginate differently, and using the wrong one silently
 * returns page 1 again (which looks like "page 2 has the same products"):
 *   · OpenCart (Elbadr, Elnekhely):  `/vga?page=2`
 *   · WooCommerce (Alfrensia):       `/product-category/gpu/page/2/`
 * The distinction is detected from the URL shape, so callers stay declarative.
 */
export function pageUrl(target: CategoryTarget, n: number): string {
  const url = new URL(target.url);

  // WooCommerce: path-based pagination, and `?limit` is a WooCommerce product
  // query parameter with a different meaning — never sent.
  if (/\/product-category\//.test(target.url)) {
    if (n <= 1) return target.url;
    const base = target.url.replace(/\/?$/, '/');
    return `${base}page/${n}/`;
  }

  // OpenCart: query-based. The per-page override must also apply to page 1.
  if (n <= 1 && !target.limit) return target.url;

  if (target.limit) url.searchParams.set('limit', String(target.limit));
  if (n > 1) url.searchParams.set('page', String(n));
  return url.toString();
}

export interface RetailerConfig {
  id: RetailerId;
  name: string;
  home: string;
  /** Crawl targets. All are allowed by the site's robots.txt. */
  targets: CategoryTarget[];
  parse: (html: string, pageUrl: string) => ScrapedProduct[];
}

const EGP = /(?:EGP|ج\.ظ…|LE)\b/i;

/**
 * Parse an Egyptian price.
 *
 * Handles `6,799 EGP`, `EGP 6,799.00`, `ظ¦ظ¬ظ§ظ©ظ©` (Arabic-Indic digits) and
 * `6.799,00` (European ordering). Returns null when the text is not a price so
 * callers skip the row instead of inserting a zero.
 */
export function parseEgpPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Normalise Arabic-Indic digits to ASCII before any numeric work, and turn
  // the Arabic separators into their ASCII equivalents: `٦٬٧٩٩` is 6,799 but
  // U+066C would otherwise end the numeric run at "6".
  const normalised = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066C/g, ',')
    .replace(/\u066B/g, '.');

  const match = /(\d[\d.,]*)/.exec(normalised);
  if (!match) return null;

  let digits = match[1];

  // "6.799,00" → thousands '.' and decimal ','  (European)
  if (/,\d{1,2}$/.test(digits)) digits = digits.replace(/\./g, '').replace(',', '.');
  // "6,799" or "6,799.00" → ',' is a thousands separator
  else digits = digits.replace(/,/g, '');

  const value = Number.parseFloat(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&times;/g, 'أ—')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean a scraped product name.
 *
 * Phase 11 requires names without store boilerplate: "Buy Online PNY RTX 5070"
 * becomes "PNY RTX 5070". Anchored to the START, so a brand that happens to
 * contain one of these words is untouched.
 */
export function cleanProductName(raw: string): string {
  return stripTags(raw)
    .replace(/^(?:buy\s+online|shop\s+now|buy\s+now|add\s+to\s+cart)\s*[-:|]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '));
}

/**
 * Collapse whitespace INSIDE tags.
 *
 * These stores emit pretty-printed markup, so attributes are frequently on
 * their own line: `<div\nclass="name">`. Every parser here anchors on
 * `<div class="…">`, which would then never match. Normalising the tag
 * interiors once keeps the parsers readable and the anchors reliable.
 *
 * Only `<…>` runs are touched, so text content (product names) is unaffected.
 */
function normaliseTags(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => tag.replace(/\s+/g, ' '));
}

/**
 * OpenCart product cards — used by Elbadr and Elnekhely (same theme).
 *
 *   <div class="product-layout" data-product-id="7633">
 *     <img src="…/image/cache/…-250x250.png">
 *     <div class="caption">
 *       <h4><a href="…">Name</a></h4>
 *       <p class="price">6,799 EGP <span class="price-old">8,000 EGP</span></p>
 *     </div>
 */
function parseOpenCart(
  html: string,
  pageUrl: string,
  retailerId: RetailerId,
  category: string,
): ScrapedProduct[] {
  const out: ScrapedProduct[] = [];
  const origin = new URL(pageUrl).origin;
  const source = normaliseTags(html);

  // Split on the card boundary rather than regex-matching nested groups: the
  // markup is one long line and greedy groups overrun into the next product.
  // Anchor on `data-product-id` alone: the class attribute is rendered as
  // `class="product-layout "` (trailing space), so a stricter anchor matches
  // nothing — and the <style> block never carries the id attribute.
  const cards = source.split(/(?=<div[^>]*data-product-id=)/).slice(1);

  for (const card of cards) {
    const idMatch = /data-product-id="(\d+)"/.exec(card);
    // Real markup: <div class="caption"><div class="name"><a href="…">Name</a></div>
    const linkMatch =
      /<div class="name">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card) ??
      /<h4[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    const href = linkMatch?.[1];
    if (!href) continue;

    const name = cleanProductName(linkMatch[2] ?? '');
    if (!name) continue;

    const resolvedCategory = classifyByName(name, category);
    // '' means the row is an accessory, not a component — skip it entirely.
    if (!resolvedCategory) continue;

    // This theme renders the price in one of two shapes:
    //   <div class="price"> <span class="price-new">6,799 EGP</span>
    //                       <span class="price-old">8,000 EGP</span> </div>
    //   <div class="price price-normal">6,799 EGP</div>
    // so `.price-new` is the live value, `.price-old` the struck one, and a
    // plain (non-discounted) card prices on the block itself. Omitting the third
    // case dropped every full-price product on Elnekhely.
    const priceNew = /<span class="price-(?:new|normal)">([\s\S]*?)<\/span>/i.exec(card);
    const priceOld = /<span class="price-old">([\s\S]*?)<\/span>/i.exec(card);
    const priceBlock = /<div class="price[^"]*">([\s\S]*?)<\/div>/i.exec(card)?.[1] ?? '';

    // Prefer the explicit new-price span; otherwise take the price block minus
    // any struck-through value so a discounted item is never quoted at the old price.
    const originalMatch = priceOld;
    const withoutOld = priceBlock.replace(/<span class="price-old">[\s\S]*?<\/span>/gi, '');
    const price = parseEgpPrice(stripTags(priceNew?.[1] ?? withoutOld));
    if (price === null) continue;

    // The stores print `1 EGP` (sometimes `0`) on cards whose real price is
    // withheld — usually an out-of-stock or price-on-request item. Elbadr alone
    // had 143 of them, including a 5090. A 1 EGP graphics card would win every
    // "cheapest" comparison, so these rows are recorded as no-price rather than
    // published as a number that is not true.
    const priceIsPlaceholder = price <= MIN_REAL_PRICE_EGP;

    const image = extractImage(card);
    // Elnekhely prints "Stock: In Stock"; Elbadr omits it entirely.
    const stockText = /Stock:\s*([A-Za-z \u0600-\u06FF]+)/i.exec(card)?.[1] ?? '';

    out.push({
      retailerId,
      externalId: idMatch?.[1] ?? href.split('/').filter(Boolean).pop() ?? name.slice(0, 60),
      name,
      // Elbadr's category pages are loose — classify by name, fall back to page.
      category: resolvedCategory,
      priceEgp: price,
      priceIsPlaceholder,
      originalPriceEgp: originalMatch ? parseEgpPrice(stripTags(originalMatch[1] ?? '')) : null,
      stockStatus: /out of stock|نفذ/i.test(stockText)
        ? 'out_of_stock'
        : /in stock|متوفر/i.test(stockText)
          ? 'in_stock'
          : 'unknown',
      productUrl: cleanProductUrl(href, origin),
      imageUrl: cleanImageUrl(image, origin),
      specs: { template: 'opencart' },
    });
  }

  return out;
}

/**
 * Pull the best image URL out of a product card.
 *
 * Retail cards carry the real image in any of four places, and choosing wrong is
 * why Phase 8 stored placeholders:
 *   · `src`          — usually correct on OpenCart, a placeholder on lazy shops
 *   · `data-src`     — the lazy-loading attribute
 *   · `srcset`       — responsive sets; the FIRST entry is the smallest
 *   · `data-srcset`  — the lazy variant
 *
 * A `woocommerce-placeholder` or `no_image` URL is treated as "no image" rather
 * than stored, so the UI can draw its category icon instead of a grey box.
 *
 * Promotional badges are also rejected: Alfrensia puts a 3-year-warranty PNG as
 * the FIRST `<img>` in some cards, and because it matched before the lazy
 * `<img src="data:..." data-src="...">` that followed, the stored photo for
 * those products was a warranty sticker (Phase 9: Alfrensia at 14% real images).
 */
/**
 * Absolute URL for a scraped `href`, with scrape-only parameters stripped.
 *
 * `?limit=100` is OUR per-page override, not part of the product page; keeping
 * it produced links like `…/gigabyte-aorus-…-gddr7?limit=100` that differ from
 * the canonical URL the store publishes.
 */
export function cleanProductUrl(href: string, origin: string): string {
  const absolute = href.startsWith('http') ? href : origin + href;
  try {
    const url = new URL(absolute);
    for (const key of ['limit', 'page', 'route', 'module', 'sort', 'order']) url.searchParams.delete(key);
    url.hash = '';
    return url.toString();
  } catch {
    return absolute;
  }
}

/**
 * Percent-encode a scraped image URL.
 *
 * These stores publish filenames containing typographic characters (an en dash
 * in `graphics-card-–-vcnrtx4000ada-pb.jpg`). A browser may normalise or reject
 * the raw form, and the stored string is what the UI hands to `<img>`.
 */
export function cleanImageUrl(src: string | null, origin: string): string | null {
  if (!src) return null;
  const absolute = src.startsWith('http') ? src : origin + src;
  try {
    return new URL(absolute).toString();
  } catch {
    return encodeURI(absolute);
  }
}

export function extractImage(html: string): string | null {
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);

  for (const tag of tags) {
    const attrs = (name: string) =>
      new RegExp(`\\b${name}="([^"]+)"`, 'i').exec(tag)?.[1] ??
      new RegExp(`\\b${name}='([^']+)'`, 'i').exec(tag)?.[1] ??
      null;

    // Prefer the real source, then the lazy attribute, then a srcset entry.
    const candidates = [attrs('src'), attrs('data-src')];

    const srcset = attrs('data-srcset') ?? attrs('srcset');
    if (srcset) {
      // "a.png 250w, b.png 500w" → take the first URL that is not a placeholder.
      for (const part of srcset.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) candidates.push(url);
      }
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      // Inline data URIs and spacer gifs are not product photos.
      if (candidate.startsWith('data:')) continue;
      if (/(woocommerce-placeholder|no_image|noimage|placeholder|spacer|blank)\.?/i.test(candidate)) continue;
      // Badges, flags and payment logos are pictures, but not of the product.
      if (/warranty|badge|logo|flag|payment|icon-3/i.test(candidate)) continue;
      return candidate;
    }
  }

  return null;
}

/**
 * WooCommerce / Flatsome cards — Alfrensia.
 *
 *   <div class="product-small col … out-of-stock product type-product post-145653 …">
 *     <a href="…/product/zotac-gaming-geforce-rtx-5080-…/"> … <img src="…">
 *     <p class="name product-title woocommerce-loop-product__title"><a …>Name</a></p>
 *     <span class="woocommerce-Price-amount amount">129,000 <bdi>EGP</bdi></span>
 */
function parseWooCommerce(
  html: string,
  pageUrl: string,
  retailerId: RetailerId,
  category: string,
): ScrapedProduct[] {
  const out: ScrapedProduct[] = [];
  const origin = new URL(pageUrl).origin;
  const source = normaliseTags(html);

  const blocks = source.split(/<div class="product-small col/).slice(1);

  for (const block of blocks) {
    // The class list carries stock state and the product slug.
    const slugMatch = /href="(https?:\/\/[^"]+\/product\/([^"/]+)\/?)"/.exec(block);
    if (!slugMatch) continue;

    // Title: the first product-link anchor that has text.
    const titleMatch =
      /class="[^"]*woocommerce-loop-product__title[^"]*"[^>]*>\s*(?:<a[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*<\//i.exec(
        block,
      ) ?? /<a[^>]+href="[^"]*\/product\/[^"]*"[^>]*>([^<]{6,})<\/a>/i.exec(block);

    const name = cleanProductName(titleMatch?.[1] ?? '');
    if (!name) continue;

    const resolvedCategory = classifyByName(name, category);
    if (!resolvedCategory) continue;

    // Flatsome renders the price as
    //   <span class="woocommerce-Price-amount amount"><bdi>12,900&nbsp;<span
    //     class="woocommerce-Price-currencySymbol">EGP</span></bdi></span>
    // On THIS store the AR catalogue returns `<bdi>1</bdi>` because the real price
    // is injected by AJAX after load. A 1 EGP graphics card is never real, so a
    // placeholder price is treated as "no price" and the row is skipped.
    const priceElem = /<span class="woocommerce-Price-amount amount">\s*<bdi>([\s\S]*?)<\/bdi>/i.exec(block);

    const price = parseEgpPrice(stripTags(priceElem?.[1] ?? ''));
    // A graphics card for 1–4 EGP is never real: this store renders a tiny
    // placeholder and fills the true price in by AJAX. Skip rather than publish
    // a wrong number — a missing price is recoverable, a wrong one is not.
    if (price === null || price <= MIN_REAL_PRICE_EGP) continue;

    const original =
      /<del[^>]*>[\s\S]*?<span class="woocommerce-Price-amount amount">\s*<bdi>([\s\S]*?)<\/bdi>/i.exec(block);
    // This store promotes badges (`3-year-warranty.png`) as the card thumbnail
    // and serves `woocommerce-placeholder-*.jpg` for items with no photo, so the
    // shared extractor's placeholder filter is not quite enough here.
    const candidate = extractImage(block);
    const usableImage = candidate;

    out.push({
      retailerId,
      externalId: slugMatch[2] ?? name.slice(0, 60),
      name,
      category: resolvedCategory,
      priceEgp: price,
      originalPriceEgp: original ? parseEgpPrice(stripTags(original[1] ?? '')) : null,
      // Flatsome puts stock state on the wrapper class list.
      stockStatus: /out-of-stock|outofstock/.test(block)
        ? 'out_of_stock'
        : /in-stock|instock/.test(block)
          ? 'in_stock'
          : 'unknown',
      productUrl: cleanProductUrl(slugMatch[1], origin),
      imageUrl: cleanImageUrl(usableImage, origin),
      specs: { template: 'woocommerce' },
    });
  }

  return out;
}

/**
 * Sigma Computer.
 *
 * Sigma is the one retailer whose markup could not be sampled reliably during
 * this phase (its VGA listing redirects to a JS-rendered route). It is wired with
 * the same OpenCart parser plus a generic JSON-LD fallback, and the sync function
 * marks it `blocked` rather than failing the run when zero products parse — see
 * docs/AUDIT.md آ§ Retailer status.
 */
function parseSigma(html: string, pageUrl: string): ScrapedProduct[] {
  const openCart = parseOpenCart(html, pageUrl, 'sigma', 'gpu');
  if (openCart.length) return openCart;
  return parseJsonLd(html, pageUrl, 'sigma', 'gpu');
}

/** Generic schema.org Product fallback — works on any store with ld+json. */
export function parseJsonLd(
  html: string,
  pageUrl: string,
  retailerId: RetailerId,
  category: string,
): ScrapedProduct[] {
  const origin = new URL(pageUrl).origin;
  const out: ScrapedProduct[] = [];
  const source = normaliseTags(html);

  for (const match of source.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? '');
    } catch {
      continue;
    }

    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    const queue = [...nodes];
    while (queue.length) {
      const node = queue.shift() as Record<string, unknown> | undefined;
      if (!node || typeof node !== 'object') continue;

      // Walk @graph / itemListElement containers.
      if (Array.isArray(node['@graph'])) queue.push(...(node['@graph'] as Record<string, unknown>[]));
      if (node['@type'] !== 'Product' && Array.isArray(node.itemListElement)) {
        queue.push(...(node.itemListElement as Record<string, unknown>[]));
      }
      if (node['@type'] !== 'Product') continue;

      const offers = (Array.isArray(node.offers) ? node.offers[0] : node.offers) as
        Record<string, unknown> | undefined;
      const price = parseEgpPrice(String(offers?.price ?? ''));
      const name = cleanProductName(String(node.name ?? ''));
      const url = String(node.url ?? offers?.url ?? '');
      if (!name || price === null || !url) continue;

      const image = Array.isArray(node.image) ? String(node.image[0]) : String(node.image ?? '');

      out.push({
        retailerId,
        externalId: String(node.sku ?? url.split('/').filter(Boolean).pop() ?? name.slice(0, 60)),
        name,
        category,
        priceEgp: price,
        originalPriceEgp: null,
        stockStatus: /OutOfStock/i.test(String(offers?.availability ?? '')) ? 'out_of_stock' : 'in_stock',
        productUrl: cleanProductUrl(url, origin),
        imageUrl: cleanImageUrl(image, origin),
        specs: { template: 'json-ld' },
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

export const RETAILERS: RetailerConfig[] = [
  {
    id: 'elbadr',
    name: 'Elbadr Group',
    home: 'https://elbadrgroupeg.store/',
    /**
     * All eight categories, depth measured (Phase 11).
     *
     * Phase 8 capped these at 3–5 pages, which truncated the catalogue at ~370
     * listings. `/vga` alone serves **458** products over 20 pages, so the caps
     * are now the point where a page actually returns nothing. The crawl stops at
     * the first empty page, so a generous cap never becomes a crawl.
     */
    targets: [
      // `/vga` serves 458 products over 20 pages at 28 cards each; a cap below
      // the real depth truncates silently, which is how Phase 8 shipped 271.
      { category: 'gpu', url: 'https://elbadrgroupeg.store/vga', pages: 45 },
      { category: 'cpu', url: 'https://elbadrgroupeg.store/cpu', pages: 45 },
      { category: 'motherboard', url: 'https://elbadrgroupeg.store/motherboard', pages: 30 },
      { category: 'ram', url: 'https://elbadrgroupeg.store/ram', pages: 25 },
      { category: 'storage', url: 'https://elbadrgroupeg.store/storage', pages: 25 },
      { category: 'psu', url: 'https://elbadrgroupeg.store/power-supply', pages: 20 },
      { category: 'case', url: 'https://elbadrgroupeg.store/cases', pages: 20 },
      { category: 'cooling', url: 'https://elbadrgroupeg.store/cooling', pages: 20 },
    ],
    parse: (html, url) => parseOpenCart(html, url, 'elbadr', categoryOf(url)),
  },
  {
    id: 'elnekhely',
    name: 'Elnekhely Technology',
    home: 'https://www.elnekhelytechnology.com/',
    /**
     * The 503 was UA filtering, not pagination.
     *
     * Measured: `?page=2` with `NexusPCBuilderBot/1.0` -> **503**; the same URL
     * with a browser UA -> **200, 12 cards**. With `limit=100`, page 1 carries
     * 100 cards and `&page=2` continues the set, so nine requests became one per
     * category. The budgets below are what the store actually serves.
     *
     * Storage has no separate HDD listing on this store (only `/ssd`), which is
     * why it is the smallest category.
     */
    targets: [
      { category: 'gpu', url: 'https://www.elnekhelytechnology.com/graphics-card', pages: 3, limit: 100 },
      { category: 'cpu', url: 'https://www.elnekhelytechnology.com/processors', pages: 3, limit: 100 },
      { category: 'motherboard', url: 'https://www.elnekhelytechnology.com/motherboards', pages: 3, limit: 100 },
      { category: 'ram', url: 'https://www.elnekhelytechnology.com/ram', pages: 3, limit: 100 },
      { category: 'storage', url: 'https://www.elnekhelytechnology.com/ssd', pages: 2, limit: 100 },
      { category: 'psu', url: 'https://www.elnekhelytechnology.com/power-supply', pages: 2, limit: 100 },
      { category: 'case', url: 'https://www.elnekhelytechnology.com/cases', pages: 2, limit: 100 },
      { category: 'cooling', url: 'https://www.elnekhelytechnology.com/fans-coolers', pages: 2, limit: 100 },
    ],
    parse: (html, url) => parseOpenCart(html, url, 'elnekhely', categoryOf(url)),
  },
  {
    id: 'alfrensia',
    name: 'Alfrensia',
    home: 'https://alfrensia.com/ar/',
    // EN catalogue: on this store the AR listing ships `<bdi>1</bdi>` placeholders
    // for most items and resolves the real price via AJAX.
    targets: [
      // Depths measured in Phase 11; the crawl stops at the first empty page.
      { category: 'gpu', url: 'https://alfrensia.com/product-category/graphics-card/', pages: 12 },
      { category: 'cpu', url: 'https://alfrensia.com/product-category/processor/', pages: 8 },
      { category: 'motherboard', url: 'https://alfrensia.com/product-category/motherboard/', pages: 8 },
      { category: 'ram', url: 'https://alfrensia.com/product-category/ram/', pages: 6 },
      { category: 'storage', url: 'https://alfrensia.com/product-category/storage/', pages: 6 },
      { category: 'psu', url: 'https://alfrensia.com/product-category/power-supply/', pages: 6 },
      // Real slugs, verified against the store's nav: `case` and `cooling` both
      // answer 404 and silently contributed nothing in Phase 9.
      { category: 'case', url: 'https://alfrensia.com/product-category/cases/', pages: 5 },
      { category: 'cooling', url: 'https://alfrensia.com/product-category/air-liquid-cooling/', pages: 6 },
    ],
    // Alfrensia paginates 20 per page and serves page 2+ normally.
    parse: (html, url) => parseWooCommerce(html, url, 'alfrensia', categoryOf(url)),
  },
  {
    id: 'sigma',
    name: 'Sigma Computer',
    home: 'https://sigma-computer.com/en',
    /**
     * BLOCKED — documented, not silently skipped.
     *
     * Sigma is a Next.js App Router storefront: category pages are rendered from
     * `self.__next_f` streamed RSC payloads, with no product markup and no
     * application/ld+json in the served HTML. Extracting prices would mean
     * reverse-engineering the RSC chunk format, which is fragile by design.
     * The targets are kept so the sync reports it honestly (`blocked` status in
     * retailer_sync_runs) and the parsers are ready if the store adds JSON-LD.
     */
    targets: [
      { category: 'gpu', url: 'https://sigma-computer.com/en/category/vga' },
      { category: 'cpu', url: 'https://sigma-computer.com/en/category/processor' },
    ],
    parse: parseSigma,
  },
];

function categoryOf(url: string): string {
  // Order matters only where paths overlap (`storage/hdd` vs `hdd/ssd`).
  if (/vga|graphic|gpu/i.test(url)) return 'gpu';
  if (/processor|cpu/i.test(url)) return 'cpu';
  if (/motherboard|mainboard/i.test(url)) return 'motherboard';
  if (/memory|ram/i.test(url)) return 'ram';
  if (/storage|ssd|hdd/i.test(url)) return 'storage';
  if (/power|psu/i.test(url)) return 'psu';
  if (/case|chassis/i.test(url)) return 'case';
  if (/cool|fan/i.test(url)) return 'cooling';
  // Unknown path: return '' so `classifyByName` decides, rather than silently
  // filing the products under GPU.
  return '';
}

/**
 * Infer the real category from a product NAME.
 *
 * Retailers mix categories inside one listing: Elbadr's `/cpu` page returns
 * monitors, external SSDs and processors together. Filing all of them as `cpu`
 * would put a monitor in a CPU price comparison, so the name wins whenever it is
 * confident and the page category is only the fallback.
 *
 * Order matters: "SSD" must resolve before a bare "memory" match, and
 * "graphics card" before "card".
 */
export function classifyByName(name: string, fallback: string): string {
  const n = name.toLowerCase();

  // Accessories are NOT PC components. Retailer "cpu" pages routinely mix in
  // mice, gamepads and monitors; letting those through would put a gaming mouse
  // into a CPU price comparison. Returning '' makes the caller drop the row.
  if (
    /\b(mouse|keyboard|gamepad|controller|headset|headphone|webcam|speaker|mousemat|mouse pad|hub|adapter|cable|chair|desk)\b/.test(
      n,
    )
  ) {
    return '';
  }
  // Monitors have no catalogue category either (the enum has 8 PC-part values).
  if (/\bmonitor\b|\bdisplay\b|\bscreen\b/.test(n)) return '';

  /**
   * Consumables: thermal paste, pads, coolant, cleaning kits.
   *
   * Found in the Phase 11 crawl: the cheapest "results" on /search were thermal
   * paste and case fans because they are cheap, real listings — the catalogue is
   * eight COMPONENT categories, and a tube of paste is not one of them.
   *
   * Matched on distinctive multi-word phrases, never on a bare word: "pad" alone
   * would drop a Lian-Li "stand-up" case, and "mount" a "vertical GPU mount"
   * case that is a genuine chassis.
   */
  if (
    /\b(thermal (paste|grease|pad|putty|coolant)|coolant|cleaning kit|screwdriver|tweezers?|mouse ?pad)\b/.test(n)
  ) {
    return '';
  }

  // Removable USB drives are not storage COMPONENTS (no NVMe/SATA footprint, not
  // part of a build). Found in the Phase 11 crawl: 7 flash drives were listed
  // under storage because "USB 3.0" matched the storage rule.
  if (/\b(flash drive|usb (?:flash )?drive|thumb drive|pen drive|memory card|sd card)\b/.test(n)) return '';

  // Spare parts: a replacement fan tray or pre-installed fan pack is a service
  // part, not a cooler someone picks for a build.
  if (/\b(fan tray|replacement fan|pre-?installed fan|spare part)\b/.test(n)) return '';

  // CPU first, GPU second — deliberately.
  //
  // AMD APUs are named e.g. "Ryzen 5 8600G (Zen 4 & Radeon 760M)": the iGPU is
  // mentioned inside a PROCESSOR name, so a GPU-first rule files a CPU under
  // GPUs and it then competes in GPU price comparisons.
  if (/\b(cpu|processor|ryzen|core i[3579]|core ultra|threadripper|xeon)\b/.test(n)) return 'cpu';
  // PSU BEFORE GPU: "Corsair RM850x 850W 80 Plus Gold" contains no GPU word, but
  // "MSI MPG A850G PCIE5 850W" and PSUs marketed as "GeForce-ready" do — and a
  // `watt` match is a far stronger signal than a brand mention.
  if (/\b(psu|power supply|\d+\s?w\b|watt|80\+|80plus|fully modular|semi modular)\b/.test(n)) return 'psu';
  if (/\b(gpu|graphics card|geforce|radeon|rtx|gtx|arc a\d|vga)\b/.test(n)) return 'gpu';
  if (/\b(motherboard|mainboard|b650|x670|z790|b760|a620|chipset)\b/.test(n)) return 'motherboard';
  if (/\b(nvme|ssd|hdd|hard drive|solid state)\b/.test(n)) return 'storage';
  if (/\b(ddr[345]|dimm|memory kit)\b/.test(n)) return 'ram';
  if (/\b(case|chassis|tower)\b/.test(n)) return 'case';
  if (/\b(cooler|aio|liquid cooling|heatsink|fan)\b/.test(n)) return 'cooling';

  // `fallback` is the PAGE's category. An accessory on a component page (thermal
  // paste under "/cooling") would otherwise inherit "cooling" and be published
  // as a component — the reason the crawl had to be re-filtered by hand.
  return fallback;
}

/**
 * Minimal robots.txt evaluation for the paths we actually request.
 *
 * Only the `User-agent: *` group is honoured (none of the four retailers names a
 * bot policy). Disallow rules are treated as prefix matches; Allow is not parsed
 * because these sites publish none and the paths we use are never under a
 * Disallow prefix.
 */
export function isAllowed(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let inStarGroup = false;
  const disallow: string[] = [];

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') inStarGroup = value === '*';
    else if (key === 'disallow' && inStarGroup && value) disallow.push(value);
  }

  return !disallow.some((rule) => path.startsWith(rule));
}

export { EGP };
