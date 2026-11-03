import { describe, expect, it } from 'vitest';
import { categoryFromPath, resolveCategory } from '../../../../supabase/functions/retailer-sync/parsers';

/**
 * Scrape-time classification.
 *
 * The scraper used to file every row with `classifyByName`, so a cooler named
 * "… CPU Liquid Cooler" became a CPU and a chassis advertising "420mm GPU"
 * became a graphics card. The store's own listing path decides now, and the name
 * is only consulted when the path names nothing.
 */
describe('categoryFromPath', () => {
  it('classifies an Elbadr listing path', () => {
    expect(categoryFromPath('https://elbadrgroupeg.store/gpu/msi-geforce-rtx-5080')).toBe('gpu');
    expect(categoryFromPath('https://elbadrgroupeg.store/cpu')).toBe('cpu');
  });

  it('classifies an Alfrensia collection', () => {
    expect(categoryFromPath('https://alfrensia.com/product-category/air-liquid-cooling/')).toBe('cooling');
    expect(categoryFromPath('https://alfrensia.com/product-category/processor/')).toBe('cpu');
  });

  it('classifies an Elnekhely listing path', () => {
    expect(categoryFromPath('https://www.elnekhelytechnology.com/fans-coolers/x')).toBe('cooling');
    expect(categoryFromPath('https://www.elnekhelytechnology.com/fans-coolers')).toBe('cooling');
    expect(categoryFromPath('https://www.elnekhelytechnology.com/power-supply/x')).toBe('psu');
  });

  it('says nothing for a path with no category', () => {
    expect(categoryFromPath('https://www.elnekhelytechnology.com/search?q=rtx')).toBe('');
    expect(categoryFromPath('')).toBe('');
  });
});

describe('resolveCategory', () => {
  it('prefers the product path', () => {
    expect(
      resolveCategory(
        'https://elbadrgroupeg.store/cooling/corsair-h100i-elite-cpu-liquid-cooler',
        'https://elbadrgroupeg.store/cpu',
        'Corsair iCUE H100i Elite CPU Liquid Cooler',
      ),
    ).toBe('cooling');
  });

  it('falls back to the listing page the row came from', () => {
    expect(
      resolveCategory(
        'https://alfrensia.com/en/product/pny-geforce-rtx-5070-ti-gaming/',
        'https://alfrensia.com/product-category/graphics-card/',
        'PNY GeForce RTX 5070 Ti 16GB',
      ),
    ).toBe('gpu');
  });

  it('uses the name only when nothing else says anything', () => {
    expect(
      resolveCategory(
        'https://store.example/x1',
        'https://store.example/',
        'MSI MPG A850G 850W 80 Plus Gold',
      ),
    ).toBe('psu');
  });
});
