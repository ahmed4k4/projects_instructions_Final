/**
 * Retailer scrapers.
 *
 * â”€â”€ Why regex and not cheerio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * The three sites that respond are server-rendered templates with stable, shallow
 * structure (OpenCart `.product-layout` cards, WooCommerce `.product-small`
 * blocks). A DOM parser would pull ~1 MB into the Edge Function cold start to do
 * what five anchored regexes do â€” and the class names are the contract, not the
 * nesting. Each parser is deliberately narrow so a template change returns FEWER
 * products rather than wrong ones.
 *
 * â”€â”€ Politeness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *   آ· robots.txt is checked before each host is used (see `isAllowed`).
 *   آ· One request every `REQUEST_DELAY_MS` per retailer, sequential.
 *   آ· An identifiable bot User-Agent.
 *   آ· A hard page budget per run so a runaway category cannot become a crawl.
 *
 * Every parser is pure: `(html, cfg) => Product[]`. That keeps them testable
 * against saved fixtures without network access.
 */

export type RetailerId = 'sigma' | 'alfrensia' | 'elnekhely' | 'elbadr';

export interface ScrapedProduct {
  retailerId: RetailerId;
  externalId: string;
  name: string;
  category: string | null;
  priceEgp: number;
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
   * Extra pages to fetch, appended as `?page=N` (OpenCart) â€” see `pageUrl`.
   * Measured: Elbadr returns 28 cards per page, Elnekhely 12 per page but 503s
   * on page 2, Alfrensia 20 per page.
   */
  pages?: number;
}

/**
 * URL of page `n` (1-based) for a target.
 *
 * The two platforms paginate differently, and using the wrong one silently
 * returns page 1 again (which looks like "page 2 has the same products"):
 *   آ· OpenCart (Elbadr, Elnekhely):  `/vga?page=2`
 *   آ· WooCommerce (Alfrensia):       `/product-category/gpu/page/2/`
 * The distinction is detected from the URL shape, so callers stay declarative.
 */
export function pageUrl(target: CategoryTarget, n: number): string {
  if (n <= 1) return target.url;

  // WooCommerce permalinks live under /product-category/.
  if (/\/product-category\//.test(target.url)) {
    const base = target.url.replace(/\/?$/, '/');
    return `${base}page/${n}/`;
  }

  const url = new URL(target.url);
  url.searchParams.set('page', String(n));
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

const EGP = /(?:EGP|ط¬\.ظ…|LE)\b/i;

/**
 * Parse an Egyptian price.
 *
 * Handles `6,799 EGP`, `EGP 6,799.00`, `ظ¦ظ¬ظ§ظ©ظ©` (Arabic-Indic digits) and
 * `6.799,00` (European ordering). Returns null when the text is not a price so
 * callers skip the row instead of inserting a zero.
 */
export function parseEgpPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Normalise Arabic-Indic digits to ASCII before any numeric work.
  const normalised = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  const match = /(\d[\d.,]*)/.exec(normalised);
  if (!match) return null;

  let digits = match[1];

  // "6.799,00" â†’ thousands '.' and decimal ','  (European)
  if (/,\d{1,2}$/.test(digits)) digits = digits.replace(/\./g, '').replace(',', '.');
  // "6,799" or "6,799.00" â†’ ',' is a thousands separator
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

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '));
}

/**
 * Collapse whitespace INSIDE tags.
 *
 * These stores emit pretty-printed markup, so attributes are frequently on
 * their own line: `<div\nclass="name">`. Every parser here anchors on
 * `<div class="â€¦">`, which would then never match. Normalising the tag
 * interiors once keeps the parsers readable and the anchors reliable.
 *
 * Only `<â€¦>` runs are touched, so text content (product names) is unaffected.
 */
function normaliseTags(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => tag.replace(/\s+/g, ' '));
}

/**
 * OpenCart product cards â€” used by Elbadr and Elnekhely (same theme).
 *
 *   <div class="product-layout" data-product-id="7633">
 *     <img src="â€¦/image/cache/â€¦-250x250.png">
 *     <div class="caption">
 *       <h4><a href="â€¦">Name</a></h4>
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
  // nothing â€” and the <style> block never carries the id attribute.
  const cards = source.split(/(?=<div[^>]*data-product-id=)/).slice(1);

  for (const card of cards) {
    const idMatch = /data-product-id="(\d+)"/.exec(card);
    // Real markup: <div class="caption"><div class="name"><a href="â€¦">Name</a></div>
    const linkMatch =
      /<div class="name">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card) ??
      /<h4[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    const href = linkMatch?.[1];
    if (!href) continue;

    const name = stripTags(linkMatch[2] ?? '');
    if (!name) continue;

    const resolvedCategory = classifyByName(name, category);
    // '' means the row is an accessory, not a component â€” skip it entirely.
    if (!resolvedCategory) continue;

    // This theme renders the price as
    //   <div class="price"> <span class="price-new">6,799 EGP</span>
    //                     <span class="price-old">8,000 EGP</span> </div>
    // so `.price-new` is the live value and `.price-old` is the struck one.
    const priceNew = /<span class="price-new">([\s\S]*?)<\/span>/i.exec(card);
    const priceOld = /<span class="price-old">([\s\S]*?)<\/span>/i.exec(card);
    const priceBlock = /<div class="price">([\s\S]*?)<\/div>/i.exec(card)?.[1] ?? '';

    // Prefer the explicit new-price span; otherwise take the price block minus
    // any struck-through value so a discounted item is never quoted at the old price.
    const originalMatch = priceOld;
    const withoutOld = priceBlock.replace(/<span class="price-old">[\s\S]*?<\/span>/gi, '');
    const price = parseEgpPrice(stripTags(priceNew?.[1] ?? withoutOld));
    if (price === null) continue;

    const image = extractImage(card);
    // Elnekhely prints "Stock: In Stock"; Elbadr omits it entirely.
    const stockText = /Stock:\s*([A-Za-z \u0600-\u06FF]+)/i.exec(card)?.[1] ?? '';

    out.push({
      retailerId,
      externalId: idMatch?.[1] ?? href.split('/').filter(Boolean).pop() ?? name.slice(0, 60),
      name,
      // Elbadr's category pages are loose â€” classify by name, fall back to page.
      category: resolvedCategory,
      priceEgp: price,
      originalPriceEgp: originalMatch ? parseEgpPrice(stripTags(originalMatch[1] ?? '')) : null,
      stockStatus: /out of stock|ظ†ظپط°/i.test(stockText)
        ? 'out_of_stock'
        : /in stock|ظ…طھظˆظپط±/i.test(stockText)
          ? 'in_stock'
          : 'unknown',
      productUrl: href.startsWith('http') ? href : origin + href,
      imageUrl: image ? (image.startsWith('http') ? image : origin + image) : null,
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
 *   آ· `src`          â€” usually correct on OpenCart, a placeholder on lazy shops
 *   آ· `data-src`     â€” the lazy-loading attribute
 *   آ· `srcset`       â€” responsive sets; the FIRST entry is the smallest
 *   آ· `data-srcset`  â€” the lazy variant
 *
 * A `woocommerce-placeholder` or `no_image` URL is treated as "no image" rather
 * than stored, so the UI can draw its category icon instead of a grey box.
 *
 * Promotional badges are also rejected: Alfrensia puts a 3-year-warranty PNG as
 * the FIRST `<img>` in some cards, and because it matched before the lazy
 * `<img src="data:..." data-src="...">` that followed, the stored photo for
 * those products was a warranty sticker (Phase 9: Alfrensia at 14% real images).
 */
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
      // "a.png 250w, b.png 500w" â†’ take the first URL that is not a placeholder.
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
 * WooCommerce / Flatsome cards â€” Alfrensia.
 *
 *   <div class="product-small col â€¦ out-of-stock product type-product post-145653 â€¦">
 *     <a href="â€¦/product/zotac-gaming-geforce-rtx-5080-â€¦/"> â€¦ <img src="â€¦">
 *     <p class="name product-title woocommerce-loop-product__title"><a â€¦>Name</a></p>
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

    const name = stripTags(titleMatch?.[1] ?? '');
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
    // A graphics card for 1â€“4 EGP is never real: this store renders a tiny
    // placeholder and fills the true price in by AJAX. Skip rather than publish
    // a wrong number â€” a missing price is recoverable, a wrong one is not.
    if (price === null || price <= 100) continue;

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
      productUrl: slugMatch[1],
      imageUrl: usableImage ? (usableImage.startsWith('http') ? usableImage : origin + usableImage) : null,
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
 * marks it `blocked` rather than failing the run when zero products parse â€” see
 * docs/AUDIT.md آ§ Retailer status.
 */
function parseSigma(html: string, pageUrl: string): ScrapedProduct[] {
  const openCart = parseOpenCart(html, pageUrl, 'sigma', 'gpu');
  if (openCart.length) return openCart;
  return parseJsonLd(html, pageUrl, 'sigma', 'gpu');
}

/** Generic schema.org Product fallback â€” works on any store with ld+json. */
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
      const name = String(node.name ?? '').trim();
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
        productUrl: url.startsWith('http') ? url : origin + url,
        imageUrl: image ? (image.startsWith('http') ? image : origin + image) : null,
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
    // All eight categories, verified live (Phase 8 expanded coverage from 2).
    targets: [
      { category: 'gpu', url: 'https://elbadrgroupeg.store/vga', pages: 5 },
      { category: 'cpu', url: 'https://elbadrgroupeg.store/cpu', pages: 5 },
      { category: 'motherboard', url: 'https://elbadrgroupeg.store/motherboard', pages: 4 },
      { category: 'ram', url: 'https://elbadrgroupeg.store/ram', pages: 4 },
      { category: 'storage', url: 'https://elbadrgroupeg.store/storage', pages: 4 },
      { category: 'psu', url: 'https://elbadrgroupeg.store/power-supply', pages: 3 },
      { category: 'case', url: 'https://elbadrgroupeg.store/cases', pages: 3 },
      { category: 'cooling', url: 'https://elbadrgroupeg.store/cooling', pages: 3 },
    ],
    parse: (html, url) => parseOpenCart(html, url, 'elbadr', categoryOf(url)),
  },
  {
    id: 'elnekhely',
    name: 'Elnekhely Technology',
    home: 'https://www.elnekhelytechnology.com/',
    // Page 2+ of every listing answers **503** â€” the site rate-limits or blocks
    // paginated requests from bots even when page 1 is served normally (verified
    // by hand against `?page=2`, `/page/2/` and `&page=2`). The page budgets are
    // therefore a ceiling this retailer will not reach; ~100 products from page 1
    // of eight categories is its accessible maximum.
    //
    // The sync records `partial` rather than failing the whole retailer.
    targets: [
      { category: 'gpu', url: 'https://www.elnekhelytechnology.com/graphics-card', pages: 8 },
      { category: 'cpu', url: 'https://www.elnekhelytechnology.com/processors', pages: 6 },
      { category: 'motherboard', url: 'https://www.elnekhelytechnology.com/motherboards', pages: 6 },
      { category: 'ram', url: 'https://www.elnekhelytechnology.com/ram', pages: 5 },
      { category: 'storage', url: 'https://www.elnekhelytechnology.com/ssd', pages: 5 },
      { category: 'psu', url: 'https://www.elnekhelytechnology.com/power-supply', pages: 4 },
      { category: 'case', url: 'https://www.elnekhelytechnology.com/cases', pages: 4 },
      { category: 'cooling', url: 'https://www.elnekhelytechnology.com/fans-coolers', pages: 4 },
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
      { category: 'gpu', url: 'https://alfrensia.com/product-category/graphics-card/', pages: 4 },
      { category: 'cpu', url: 'https://alfrensia.com/product-category/processor/', pages: 3 },
      { category: 'motherboard', url: 'https://alfrensia.com/product-category/motherboard/', pages: 3 },
      { category: 'ram', url: 'https://alfrensia.com/product-category/ram/', pages: 2 },
      { category: 'storage', url: 'https://alfrensia.com/product-category/storage/', pages: 2 },
      { category: 'psu', url: 'https://alfrensia.com/product-category/power-supply/', pages: 2 },
      // Real slugs, verified against the store's nav: `case` and `cooling` both
      // answer 404 and silently contributed nothing in Phase 9.
      { category: 'case', url: 'https://alfrensia.com/product-category/cases/', pages: 2 },
      { category: 'cooling', url: 'https://alfrensia.com/product-category/air-liquid-cooling/', pages: 3 },
    ],
    // Alfrensia paginates 20 per page and serves page 2+ normally.
    // (Applied per-target below via `pages`.)
    parse: (html, url) => parseWooCommerce(html, url, 'alfrensia', categoryOf(url)),
  },
  {
    id: 'sigma',
    name: 'Sigma Computer',
    home: 'https://sigma-computer.com/en',
    /**
     * BLOCKED â€” documented, not silently skipped.
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

  // CPU first, GPU second â€” deliberately.
  //
  // AMD APUs are named e.g. "Ryzen 5 8600G (Zen 4 & Radeon 760M)": the iGPU is
  // mentioned inside a PROCESSOR name, so a GPU-first rule files a CPU under
  // GPUs and it then competes in GPU price comparisons.
  if (/\b(cpu|processor|ryzen|core i[3579]|core ultra|threadripper|xeon)\b/.test(n)) return 'cpu';
  if (/\b(gpu|graphics card|geforce|radeon|rtx|gtx|arc a\d|vga)\b/.test(n)) return 'gpu';
  if (/\b(motherboard|mainboard|b650|x670|z790|b760|a620|chipset)\b/.test(n)) return 'motherboard';
  if (/\b(nvme|ssd|hdd|hard drive|solid state)\b/.test(n)) return 'storage';
  if (/\b(ddr[345]|dimm|memory kit)\b/.test(n)) return 'ram';
  if (/\b(psu|power supply|watt|80\+)\b/.test(n)) return 'psu';
  if (/\b(case|chassis|tower)\b/.test(n)) return 'case';
  if (/\b(cooler|aio|liquid cooling|heatsink|fan)\b/.test(n)) return 'cooling';

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
