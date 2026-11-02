import { describe, expect, it } from 'vitest';
// The shared module, not the Edge Function file: `src/` is the single copy that
// the scraper, the snapshot builder and the aggregator all import.
import { parseEgpPrice, classifyByName, isAllowed, scoreNameMatch } from '@/lib/retailerParsing';

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
