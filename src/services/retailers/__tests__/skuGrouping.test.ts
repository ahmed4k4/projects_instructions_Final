import { describe, expect, it } from 'vitest';
import { skuKey } from '@/lib/skuGrouping';

/**
 * Cross-store grouping.
 *
 * Phase 13 report: "the same product from different stores appears as separate
 * items". The exact pair named in the brief was failing —
 *
 *   Elnekhely: "ASUS Dual RTX 5070 OC 12GB"          → `5070|12`
 *   Elbadr:    "ASUS Dual GeForce RTX 5070 OC 12GB"  → `geforce|5070|12`
 *
 * — because the GPU rule only recognised the words "GeForce"/"Radeon". Two
 * separate result cards, never compared, for the same card.
 */
describe('skuKey — cross-store identity', () => {
  it('groups the same card written with and without "GeForce"', () => {
    expect(skuKey('ASUS Dual RTX 5070 OC 12GB')).toBe(skuKey('ASUS Dual GeForce RTX 5070 OC 12GB'));
  });

  it('groups a "GTX" listing with its "GeForce GTX" spelling', () => {
    expect(skuKey('ASUS TUF GTX 1660 Super')).toBe(skuKey('ASUS TUF GeForce GTX 1660 Super'));
  });

  it('treats "8G" and "8GB" as the same capacity', () => {
    expect(skuKey('MSI GeForce RTX 4060 Ventus 2X Black 8G')).toBe(skuKey('MSI RTX 4060 Ventus 2X 8GB'));
  });

  it('keeps a Ti variant separate from the base card', () => {
    expect(skuKey('ASUS Dual RTX 5070 OC 12GB')).not.toBe(skuKey('ASUS Dual RTX 5070 Ti OC 16GB'));
  });

  it('keeps different capacities separate', () => {
    expect(skuKey('GIGABYTE RTX 5060 Ti 8GB')).not.toBe(skuKey('GIGABYTE RTX 5060 Ti 16GB'));
  });

  it('does not confuse a Ryzen with a Radeon', () => {
    expect(skuKey('AMD Ryzen 7 7800X3D')).not.toBe(skuKey('AMD Radeon RX 7800 XT'));
  });

  it('keeps different wattages separate', () => {
    expect(skuKey('Corsair RM850x 850W')).not.toBe(skuKey('Corsair RM750x 750W'));
  });
});
