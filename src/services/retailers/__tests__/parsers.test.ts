import { describe, expect, it } from 'vitest';
// The real parser — the same module the snapshot builder, the Edge Function and
// `scripts/verify-*.mjs` import. Testing a second copy is how the two drift apart.
import {
  parseEgpPrice,
  classifyByName,
  isAllowed,
  pageUrl,
  cleanProductUrl,
  cleanImageUrl,
  headersFor,
} from '../../../../supabase/functions/retailer-sync/parsers';
import { scoreNameMatch } from '@/services/retailers/aggregator';

/**
 * Retailer-parsing unit tests.
 *
 * These pin the behaviours that broke against real Egyptian storefronts — they
 * are regression tests, not illustrations. Each case below was a live bug during
 * Phase 7.
 */

describe('parseEgpPrice', () => {
  it('reads the formats the four stores actually use', () => {
    expect(parseEgpPrice('6,799 EGP')).toBe(6799);
    expect(parseEgpPrice('EGP 129,000.00')).toBe(129000);
    expect(parseEgpPrice('1,800 ج.م')).toBe(1800);
    expect(parseEgpPrice('12,500 LE')).toBe(12500);
  });

  it('reads Arabic-Indic digits', () => {
    expect(parseEgpPrice('٦٬٧٩٩ ج.م')).toBe(6799);
  });

  it('handles European ordering', () => {
    expect(parseEgpPrice('12.500,50')).toBe(12500.5);
  });

  it('returns null for non-prices instead of 0', () => {
    // A zero would be written to the DB and win every "cheapest" comparison.
    expect(parseEgpPrice('')).toBeNull();
    expect(parseEgpPrice('Out of stock')).toBeNull();
    expect(parseEgpPrice(null)).toBeNull();
  });
});

describe('classifyByName', () => {
  it('files an APU as a CPU even though its name says Radeon', () => {
    // "Ryzen 5 8600G (Zen 4 & Radeon 760M)" was landing in the GPU category.
    expect(classifyByName('AMD Ryzen 5 8600G (Zen 4 & Radeon 760M)', 'gpu')).toBe('cpu');
  });

  it('recognises the eight catalogue categories', () => {
    expect(classifyByName('ASUS TUF GeForce RTX 4070 OC', 'gpu')).toBe('gpu');
    expect(classifyByName('MSI MAG B650 Tomahawk Motherboard', 'cpu')).toBe('motherboard');
    expect(classifyByName('Samsung 990 Pro 2TB NVMe SSD', 'gpu')).toBe('storage');
    expect(classifyByName('Corsair RM850x 850W 80 Plus Gold', 'gpu')).toBe('psu');
  });

  it('drops accessories rather than mis-categorising them', () => {
    // Elbadr's CPU page lists mice and monitors; '' makes the caller skip the row.
    expect(classifyByName('Logitech G502 Hero Gaming Mouse', 'cpu')).toBe('');
    expect(classifyByName('Samsung Odyssey G5 Monitor 27"', 'gpu')).toBe('');
  });
});

describe('scoreNameMatch', () => {
  it('matches a real listing to its catalogue part', () => {
    const score = scoreNameMatch(
      'AMD Ryzen 5 7600X MPK 6-Core 12-Thread Desktop Processor',
      'AMD Ryzen 5 7600X',
    );
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('rejects a different model number', () => {
    // Coverage alone scored this at 0.5 — enough to publish a wrong price.
    expect(scoreNameMatch('ASUS Dual GeForce RTX 3050 OC 6GB', 'NVIDIA GeForce RTX 4090')).toBeLessThan(0.5);
    expect(scoreNameMatch('AORUS GeForce RTX 5070 MASTER', 'NVIDIA GeForce RTX 4090')).toBeLessThan(0.5);
  });

  it('rejects a variant SKU', () => {
    // 14900KF has no integrated graphics and costs less than the 14900K.
    expect(scoreNameMatch('Intel Core i9-14900KF 24-Core LGA1700', 'Intel Core i9-14900K')).toBeLessThan(0.5);
  });

  it('does not match a CPU name against a GPU', () => {
    expect(scoreNameMatch('AMD Ryzen 7 7800X3D', 'AMD Radeon RX 7800 XT')).toBeLessThan(0.5);
  });
});

describe('robots.txt', () => {
  it('allows catalogue paths on these stores', () => {
    const robots = 'User-agent: *\nDisallow: /admin/\nDisallow: /checkout/\nDisallow: /api/';
    expect(isAllowed(robots, '/vga')).toBe(true);
    expect(isAllowed(robots, '/graphics-card')).toBe(true);
  });

  it('blocks disallowed prefixes', () => {
    const robots = 'User-agent: *\nDisallow: /admin/';
    expect(isAllowed(robots, '/admin/products')).toBe(false);
  });

  it('ignores rules aimed at other crawlers', () => {
    const robots = 'User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin/';
    expect(isAllowed(robots, '/vga')).toBe(true);
  });
});

/**
 * Phase 11 — Elnekhely.
 *
 * The store answered 503 to our identifying UA on EVERY url (page 1 included),
 * so the scraper recorded "pagination is blocked" when the truth was "we are
 * refused". These pin the fetch contract and the URL hygiene that fixed it.
 */
describe('Elnekhely request contract', () => {
  const target = {
    category: 'gpu',
    url: 'https://www.elnekhelytechnology.com/graphics-card',
    pages: 3,
    limit: 100,
  };

  it('sends browser-shaped headers with a same-origin referrer', () => {
    const headers = headersFor(target.url);
    expect(headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
    expect(headers.Referer).toBe('https://www.elnekhelytechnology.com/');
    expect(headers.Accept).toContain('text/html');
  });

  it('applies limit=100 to page 1 and every later page', () => {
    expect(pageUrl(target, 1)).toBe('https://www.elnekhelytechnology.com/graphics-card?limit=100');
    expect(pageUrl(target, 2)).toBe('https://www.elnekhelytechnology.com/graphics-card?limit=100&page=2');
  });

  it('never sends OpenCart limit= to a WooCommerce store', () => {
    const woo = { category: 'gpu', url: 'https://alfrensia.com/product-category/graphics-card/', limit: 100 };
    expect(pageUrl(woo, 1)).toBe('https://alfrensia.com/product-category/graphics-card/');
    expect(pageUrl(woo, 2)).toBe('https://alfrensia.com/product-category/graphics-card/page/2/');
  });

  it('leaves an OpenCart url untouched when no limit is configured', () => {
    const plain = { category: 'gpu', url: 'https://elbadrgroupeg.store/vga' };
    expect(pageUrl(plain, 1)).toBe('https://elbadrgroupeg.store/vga');
    expect(pageUrl(plain, 3)).toBe('https://elbadrgroupeg.store/vga?page=3');
  });
});

describe('scraped URL hygiene', () => {
  const origin = 'https://www.elnekhelytechnology.com';

  it('strips our own scrape parameters from product links', () => {
    expect(cleanProductUrl('/gigabyte-aorus-rtx-5080?limit=100', origin)).toBe(
      'https://www.elnekhelytechnology.com/gigabyte-aorus-rtx-5080',
    );
  });

  it('keeps meaningful product-page parameters', () => {
    const href = 'https://shop.example/index.php?route=product/product&product_id=99';
    expect(cleanProductUrl(href, origin)).toContain('product_id=99');
  });

  it('percent-encodes typographic characters in image paths', () => {
    const dirty = '/image/catalog/graphics-card–vcnrtx4000ada.jpg';
    const clean = cleanImageUrl(dirty, origin);
    expect(clean).not.toContain('–');
    expect(decodeURI(clean as string)).toContain('graphics-card–');
  });

  it('returns null rather than a string for a missing image', () => {
    expect(cleanImageUrl(null, origin)).toBeNull();
  });
});
