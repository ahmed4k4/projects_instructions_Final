import { describe, expect, it } from 'vitest';
import { skuKey, groupLabel } from '@/lib/skuGrouping';
import { rankOffers, groupListings } from '@/services/searchService';
import type { RetailerOffer } from '@/services/retailers/types';

/**
 * Search grouping and ranking.
 *
 * Every case here was a real defect found against live Egyptian listings — the
 * grouping key decides which prices get compared, so a wrong merge publishes a
 * wrong price comparison.
 */

describe('skuKey', () => {
  it('keeps different CPU models apart', () => {
    // Taking the first number ("5" from "Ryzen 5") collapsed 8 processors.
    expect(skuKey('AMD Ryzen 5 5600X')).not.toBe(skuKey('AMD Ryzen 5 7600X'));
    expect(skuKey('AMD Ryzen 7 7800X3D')).toBe('ryzen|7800x3d');
  });

  it('treats memory size as part of the identity', () => {
    expect(skuKey('GIGABYTE GeForce RTX 5060 Ti 8GB')).not.toBe(skuKey('GIGABYTE GeForce RTX 5060 Ti 16GB'));
  });

  it('keeps GPU variants apart', () => {
    expect(skuKey('ASUS GeForce RTX 5070')).not.toBe(skuKey('ASUS GeForce RTX 5070 Ti'));
    expect(skuKey('ASUS GeForce RTX 5080')).not.toBe(skuKey('ASUS GeForce RTX 5080 SUPER'));
  });

  it('merges the same card from different board partners', () => {
    expect(skuKey('ASUS TUF Gaming GeForce RTX 5070 Ti 16GB')).toBe(
      skuKey('PNY GeForce RTX 5070 Ti ARGB 16GB'),
    );
  });

  it('does not merge a CPU with a GPU that shares a model number', () => {
    expect(skuKey('AMD Ryzen 7 7800X3D')).not.toBe(skuKey('AMD Radeon RX 7800 XT'));
  });

  it('keeps distinct motherboards apart', () => {
    // Keying on the chipset merged a Gigabyte Aero, an ASUS Strix-E and a
    // Crosshair HERO into one price table.
    const aero = skuKey('Gigabyte X870E AERO X3D WIFI6E Motherboard');
    const strix = skuKey('ASUS ROG Strix X870E-E Gaming WiFi Motherboard');
    const hero = skuKey('ASUS ROG Crosshair X870E Hero');
    expect(new Set([aero, strix, hero]).size).toBeGreaterThan(1);
  });

  it('returns null rather than guessing', () => {
    expect(skuKey('Cable Management Kit')).toBeNull();
  });
});

describe('groupLabel', () => {
  /**
   * A name with no model number and no board-partner line is a worse label than
   * a complete one: "RTX 5070 Ti" alone does not say WHOSE card it is, and the
   * comparison table is about choosing between brands.
   */
  it('prefers a complete name over a bare model', () => {
    expect(groupLabel(['RTX 5070 Ti', 'PNY GeForce RTX 5070 Ti ARGB Overclocked Triple Fan 16GB'])).toBe(
      'PNY GeForce RTX 5070 Ti ARGB Overclocked Triple Fan 16GB',
    );
  });

  it('prefers the shorter complete name', () => {
    expect(
      groupLabel(['ASUS Dual GeForce RTX 5070 OC 12GB', 'ASUS Dual GeForce RTX 5070 OC 12GB GDDR7 Graphics Card']),
    ).toBe('ASUS Dual GeForce RTX 5070 OC 12GB');
  });

  /**
   * The label has to survive a two-line clamp.
   *
   * Two genuinely different cards from one shop — GIGABYTE's EAGLE and
   * WINDFORCE 5070 Ti — were labelled with the same opening words, so the grid
   * showed what looked like one product at two prices. The label therefore
   * prefers a name whose board-partner line appears early.
   */
  it('picks the name that distinguishes its board-partner line', () => {
    const label = groupLabel([
      'GIGABYTE GeForce RTX 5070 Ti WINDFORCE OC SFF 16G – NVIDIA Blackwell GPU, 256-bit',
      'GIGABYTE GeForce RTX 5070 Ti EAGLE OC SFF 16GB GDDR7',
    ]);
    expect(label.toLowerCase()).toContain('eagle');
  });

  it('drops marketing tail words when choosing', () => {
    const label = groupLabel([
      'ASUS Dual GeForce RTX 5070 OC 12GB GDDR7 Graphics Card – NVIDIA Blackwell Architecture',
      'ASUS Dual GeForce RTX 5070 OC 12GB',
    ]);
    expect(label).toBe('ASUS Dual GeForce RTX 5070 OC 12GB');
  });
});

/* -------------------------------------------------------------------------- */
/*  Grouping + ranking                                                        */
/* -------------------------------------------------------------------------- */

const offer = (overrides: Partial<RetailerOffer>): RetailerOffer => ({
  id: Math.random().toString(36).slice(2),
  retailerId: 'elbadr',
  name: 'PNY GeForce RTX 5070 Ti 16GB',
  category: 'gpu',
  priceEgp: 70_000,
  originalPriceEgp: null,
  stockStatus: 'in_stock',
  productUrl: 'https://example.com/p',
  imageUrl: null,
  matchedComponentId: null,
  matchConfidence: null,
  lastScrapedAt: '2026-11-02T10:00:00.000Z',
  ...overrides,
});

describe('groupListings', () => {
  it('merges the same product across retailers', () => {
    const groups = groupListings([
      offer({ retailerId: 'elbadr', priceEgp: 71_000 }),
      offer({ retailerId: 'alfrensia', priceEgp: 63_887 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.retailerIds).toHaveLength(2);
    expect(groups[0]?.savingsEgp).toBe(7_113);
  });

  it('never merges two listings from the same retailer', () => {
    // An AORUS MASTER and an ASUS Dual share a model number but are different
    // products; grouping them put two unrelated cards under one heading.
    const groups = groupListings([
      offer({ retailerId: 'elnekhely', name: 'AORUS GeForce RTX 5070 MASTER 12GB', priceEgp: 59_999 }),
      offer({ retailerId: 'elnekhely', name: 'ASUS Dual GeForce RTX 5070 OC 12GB', priceEgp: 47_499 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('reports no saving when only one retailer carries the part', () => {
    const groups = groupListings([offer({ priceEgp: 50_000 })]);
    expect(groups[0]?.savingsEgp).toBe(0);
  });

  it('gives an unidentifiable listing its own group', () => {
    const groups = groupListings([offer({ name: 'Mystery Item A' }), offer({ name: 'Mystery Item B' })]);
    expect(groups).toHaveLength(2);
  });
});

describe('rankOffers', () => {
  it('puts an in-stock offer ahead of a cheaper out-of-stock one', () => {
    // The comparison page advertised 63,887 EGP for an unavailable card while
    // the buyable price was 71,000.
    const ranked = rankOffers([
      offer({ retailerId: 'alfrensia', priceEgp: 63_887, stockStatus: 'out_of_stock' }),
      offer({ retailerId: 'elbadr', priceEgp: 71_000, stockStatus: 'in_stock' }),
    ]);
    expect(ranked[0]?.retailerId).toBe('elbadr');
  });

  it('treats unknown stock as buyable', () => {
    // Elbadr never prints a stock line; treating "unknown" as unavailable let an
    // out-of-stock listing win on price.
    const ranked = rankOffers([
      offer({ retailerId: 'alfrensia', priceEgp: 63_887, stockStatus: 'out_of_stock' }),
      offer({ retailerId: 'elbadr', priceEgp: 71_000, stockStatus: 'unknown' }),
    ]);
    expect(ranked[0]?.retailerId).toBe('elbadr');
  });

  it('sorts by price within the same stock state', () => {
    const ranked = rankOffers([
      offer({ retailerId: 'elbadr', priceEgp: 71_000 }),
      offer({ retailerId: 'alfrensia', priceEgp: 63_887 }),
    ]);
    expect(ranked[0]?.priceEgp).toBe(63_887);
  });
});
