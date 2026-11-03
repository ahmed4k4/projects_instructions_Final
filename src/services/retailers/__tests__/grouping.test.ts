import { describe, expect, it } from 'vitest';
import { groupListings } from '@/services/searchService';
import type { RetailerOffer } from '@/services/retailers/types';

/**
 * Module 3 — one card per product, measured on real Egyptian listings.
 *
 * The same card at two shops must merge (that is the whole point of the
 * comparison); two different SKUs must never merge (that shows one product's
 * price under another product's name). Both directions are pinned here with
 * titles copied from Elbadr and Elnekhely.
 */

let n = 0;
const offer = (retailerId: RetailerOffer['retailerId'], name: string, priceEgp: number): RetailerOffer => {
  n += 1;
  return {
    id: `o${n}`,
    retailerId,
    name,
    category: 'gpu',
    priceEgp,
    originalPriceEgp: null,
    stockStatus: 'in_stock',
    productUrl: `https://shop.example/${n}`,
    imageUrl: null,
    matchedComponentId: null,
    matchConfidence: null,
    lastScrapedAt: '2026-11-02T00:00:00.000Z',
  };
};

describe('groupListings across stores', () => {
  it('merges the same card sold by Elbadr and Elnekhely', () => {
    const groups = groupListings([
      offer(
        'elbadr',
        'GIGABYTE GeForce RTX 5070 Ti EAGLE OC SFF 16G – Blackwell Architecture, 16GB GDDR7 256-bit',
        52_800,
      ),
      offer(
        'elnekhely',
        'GIGABYTE GeForce RTX 5070 Ti EAGLE OC SFF 16GB GDDR7 Graphics Card – NVIDIA Blackwell GPU',
        78_999,
      ),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.retailerIds.sort()).toEqual(['elbadr', 'elnekhely']);
    // The cheaper shop is the one quoted.
    expect(groups[0]!.best.priceEgp).toBe(52_800);
    expect(groups[0]!.savingsEgp).toBe(26_199);
  });

  it('keeps a WINDFORCE and an EAGLE apart', () => {
    const groups = groupListings([
      offer('elbadr', 'GIGABYTE GeForce RTX 5070 Ti WINDFORCE OC SFF 16G', 71_000),
      offer('elbadr', 'GIGABYTE GeForce RTX 5070 Ti EAGLE OC SFF 16G', 52_800),
    ]);

    // Same store, different board-partner line: two products. (Two listings from
    // one shop are never merged — a store does not compete with itself.)
    expect(groups.length).toBe(2);
  });

  it('does not merge an 8 GB card with a 16 GB one', () => {
    const groups = groupListings([
      offer('elbadr', 'ASUS Dual GeForce RTX 5060 Ti 8GB', 31_000),
      offer('elnekhely', 'ASUS Dual GeForce RTX 5060 Ti 16GB', 39_000),
    ]);

    expect(groups.length).toBe(2);
  });

  it('keeps two different motherboards apart', () => {
    const groups = groupListings([
      offer('elbadr', 'ASUS PRIME B650M-K Motherboard', 8_000),
      offer('elbadr', 'ASUS PRIME B650M-R Motherboard', 8_500),
    ]);
    expect(groups.length).toBe(2);
  });

  it('reports "compare (N stores)" data on a merged group', () => {
    const groups = groupListings([
      offer('elbadr', 'ASUS Dual GeForce RTX 5070 OC 12GB', 38_000),
      offer('elnekhely', 'ASUS Dual GeForce RTX 5070 OC 12GB GDDR7', 41_500),
      offer('alfrensia', 'ASUS Dual GeForce RTX 5070 OC 12GB', 39_900),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.retailerIds).toHaveLength(3);
    expect(groups[0]!.best.priceEgp).toBe(38_000);
  });
});

describe('motherboard grouping', () => {
  /**
   * Measured regression: four DIFFERENT ASUS PRIME boards merged into one group.
   *
   * The code extractor matched `lga1700` — the socket every LGA1700 board shares —
   * instead of the board code, so PRIME Z790-P, H610M-A, B760-PLUS and B860M-A
   * produced one key and one board's price appeared under another's name.
   */
  it('keeps boards on different chipsets apart (socket is not the model)', () => {
    const groups = groupListings([
      offer('elbadr', 'ASUS PRIME Z790-P ATX Motherboard Intel LGA1700 Socket — Intel Z790 Chipset', 9_000),
      offer('elnekhely', 'ASUS PRIME H610M-A WIFI D4-CSM Micro-ATX Motherboard — LGA1700, Intel H610 Chipset', 4_500),
      offer('alfrensia', 'ASUS PRIME B760-PLUS D4 ATX Motherboard — LGA1700 Socket', 7_200),
    ]);

    expect(groups).toHaveLength(3);
  });

  it('keeps two suffix variants apart', () => {
    const groups = groupListings([
      offer('elbadr', 'ASUS PRIME B650M-K Motherboard', 8_000),
      offer('elbadr', 'ASUS PRIME B650M-R Motherboard', 8_500),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('merges the same board across shops, despite different descriptions', () => {
    const groups = groupListings([
      offer('elbadr', 'ASUS PRIME B650M-K — Socket AM5/B650/DDR5/S-ATA 6Gb/s/Micro ATX', 8_000),
      offer('elnekhely', 'ASUS PRIME B650M-K Micro-ATX Motherboard – AMD AM5 Socket, DDR5 Memory, PCIe 5.0 M.2', 9_100),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.best.priceEgp).toBe(8_000);
    expect(groups[0]!.retailerIds.sort()).toEqual(['elbadr', 'elnekhely']);
  });
});
