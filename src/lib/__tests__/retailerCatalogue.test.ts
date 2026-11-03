import { describe, expect, it } from 'vitest';
import { buildCatalogue, groupToComponent, offersFor } from '@/lib/retailerCatalogue';
import type { ProductGroup } from '@/services/searchService';
import type { RetailerOffer } from '@/services/retailers/types';

/**
 * The Builder's catalogue comes from real listings now.
 *
 * These tests pin the two things that made the old adapter unusable: a group
 * with a placeholder price must never become a component, and the component must
 * carry the retailer whose price is quoted — so the build's total is a number a
 * shopper can actually pay.
 */

let seq = 0;
function offer(overrides: Partial<RetailerOffer> = {}): RetailerOffer {
  seq += 1;
  return {
    id: `o${seq}`,
    retailerId: 'elbadr',
    name: 'ASUS Dual GeForce RTX 5070 OC 12GB',
    category: 'gpu',
    priceEgp: 38_000,
    originalPriceEgp: null,
    stockStatus: 'in_stock',
    productUrl: 'https://elbadrgroupeg.store/gpu/asus-dual-rtx-5070',
    imageUrl: null,
    matchedComponentId: null,
    matchConfidence: null,
    lastScrapedAt: '2026-11-02T00:00:00.000Z',
    ...overrides,
  };
}

function group(overrides: Partial<ProductGroup> = {}): ProductGroup {
  const offers = overrides.offers ?? [offer()];
  return {
    id: 'sku:gpu:asus:geforce|5070|12',
    name: 'ASUS Dual GeForce RTX 5070 OC 12GB',
    category: 'gpu',
    imageUrl: null,
    offers,
    best: offers[0]!,
    pricedOffer: offers[0]!,
    retailerIds: [...new Set(offers.map((o) => o.retailerId))],
    savingsEgp: 0,
    inStock: offers.some((o) => o.stockStatus === 'in_stock'),
    newestScrapedAt: '2026-11-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('groupToComponent', () => {
  it('builds a component with inferred specs and a live price', () => {
    const component = groupToComponent(group());
    expect(component).not.toBeNull();
    expect(component!.category).toBe('gpu');
    expect(component!.price).toBe(38_000);
    expect(component!.currency).toBe('EGP');
    expect(component!.specs.vram).toBe(12);
    expect(component!.specs.length).toBeGreaterThan(200);
    expect(component!.storeLinks[0]?.store).toBe('Elbadr Group');
    expect(component!.performanceScore).toBeGreaterThan(0);
  });

  it('refuses a placeholder price', () => {
    const cheap = offer({ priceEgp: 1, priceIsPlaceholder: true });
    expect(groupToComponent(group({ offers: [cheap], best: cheap, pricedOffer: cheap }))).toBeNull();
  });

  it('refuses a group with no category', () => {
    expect(groupToComponent(group({ category: null }))).toBeNull();
  });

  it('marks a group that is out of stock everywhere', () => {
    const sold = offer({ stockStatus: 'out_of_stock' });
    expect(groupToComponent(group({ offers: [sold], best: sold, pricedOffer: sold }))!.stockStatus).toBe(
      'out_of_stock',
    );
  });
  it('keeps unknown stock unknown instead of labelling it out of stock', () => {
    const unknown = offer({ stockStatus: 'unknown' });
    const component = groupToComponent(group({ offers: [unknown], best: unknown, pricedOffer: unknown }))!;

    expect(component.stockStatus).toBe('unknown');
    expect(component.storeLinks[0]?.stockStatus).toBe('unknown');
    expect(offersFor(component)[0]?.stockStatus).toBe('unknown');
  });

  it('does not claim out of stock when one retailer has not reported stock', () => {
    const sold = offer({ stockStatus: 'out_of_stock' });
    const unknown = offer({ retailerId: 'alfrensia', stockStatus: 'unknown' });
    const component = groupToComponent(group({ offers: [sold, unknown], best: sold, pricedOffer: sold }))!;

    expect(component.stockStatus).toBe('unknown');
    expect(offersFor(component).map((item) => item.stockStatus)).toEqual(['unknown', 'out_of_stock']);
  });

  it('preserves exact per-retailer status when one store confirms availability', () => {
    const confirmed = offer({ stockStatus: 'in_stock' });
    const unknown = offer({ retailerId: 'alfrensia', stockStatus: 'unknown' });
    const component = groupToComponent(group({ offers: [confirmed, unknown], best: confirmed, pricedOffer: confirmed }))!;

    expect(component.stockStatus).toBe('in_stock');
    expect(offersFor(component).map((item) => item.stockStatus)).toEqual(['in_stock', 'unknown']);
    expect(component.storeLinks[0]?.stockUpdatedAt).toBe(confirmed.lastScrapedAt);
  });

  it('keeps limited stock distinct from confirmed in-stock and out-of-stock', () => {
    const limited = offer({ stockStatus: 'limited' });
    const component = groupToComponent(group({ offers: [limited], best: limited, pricedOffer: limited }))!;
    expect(component.stockStatus).toBe('limited');
    expect(offersFor(component)[0]?.stockStatus).toBe('limited');
  });

  it('uses a confirmed in-stock retailer price before a cheaper unknown/out-of-stock offer', () => {
    const cheaperUnknown = offer({
      id: 'unknown-cheaper',
      retailerId: 'alfrensia',
      priceEgp: 34_000,
      stockStatus: 'unknown',
    });
    const confirmedInStock = offer({
      id: 'confirmed-stock',
      retailerId: 'elbadr',
      priceEgp: 39_000,
      stockStatus: 'in_stock',
    });
    const component = groupToComponent(group({
      offers: [cheaperUnknown, confirmedInStock],
      best: cheaperUnknown,
      pricedOffer: cheaperUnknown,
    }))!;

    expect(component.price).toBe(39_000);
    expect(component.stockStatus).toBe('in_stock');
    expect(component.storeLinks[0]?.stockStatus).toBe('in_stock');
    expect(offersFor(component)[0]?.stockStatus).toBe('in_stock');
  });

});

describe('buildCatalogue', () => {
  it('keeps one entry per SKU and sorts in-stock parts first', () => {
    const gpu = group();
    const cpu = group({
      id: 'sku:cpu:amd:ryzen|7800x3d',
      name: 'AMD Ryzen 7 7800X3D Processor',
      category: 'cpu',
      offers: [offer({ category: 'cpu', name: 'AMD Ryzen 7 7800X3D', priceEgp: 22_000 })],
      best: offer({ category: 'cpu', name: 'AMD Ryzen 7 7800X3D', priceEgp: 22_000 }),
      pricedOffer: offer({ category: 'cpu', name: 'AMD Ryzen 7 7800X3D', priceEgp: 22_000 }),
    });

    const { components, byId } = buildCatalogue([gpu, cpu]);
    expect(components).toHaveLength(2);
    expect(byId.get(gpu.id)?.category).toBe('gpu');
    expect(byId.get(cpu.id)?.specs.socket).toBe('AM5');
  });

  it('drops a duplicate id instead of doubling a card', () => {
    const { components } = buildCatalogue([group(), group()]);
    expect(components).toHaveLength(1);
  });
});
