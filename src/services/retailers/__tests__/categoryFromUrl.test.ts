import { describe, expect, it } from 'vitest';
import { categoryFromTitle, categoryFromUrl, resolveCategory } from '@/lib/categoryRules';

/**
 * Filters were misclassifying products because the category came from keyword
 * matching on the NAME: a "CPU Liquid Cooler" became a CPU, a chassis that
 * advertises "420mm GPU" became a GPU. The URL is the store's own
 * classification, so it is the authority.
 *
 * Every URL below is a real listing from the Egyptian retailers.
 */
describe('categoryFromUrl', () => {
  it('reads the collection segment, not the product slug', () => {
    // A WooCommerce PRODUCT path carries no category: `en`, `product`, `<slug>`.
    // The slug is the name with dashes, so nothing is derived from it and the
    // caller keeps the category of the page it was scraped from.
    expect(
      categoryFromUrl(
        'https://alfrensia.com/en/product/pny-geforce-rtx-5070-ti-argb-overclocked-triple-fan-16gb-gddr7-graphics-card/',
      ),
    ).toBe('');

    // "…-with-heatsink" must NOT make an SSD a cooling product.
    expect(
      categoryFromUrl(
        'https://alfrensia.com/en/product/sabrent-rocket-4-plus-1tb-pcie-gen-4-nvme-ssd-heatsink/',
      ),
    ).toBe('');

    // A collection that carries an SSD heatsink in its slug is still storage.
    expect(categoryFromUrl('https://alfrensia.com/product-category/storage/')).toBe('storage');

    // "…-8-fan-argb-mid-tower-case" is a product slug — no category from it.
    expect(
      categoryFromUrl(
        'https://alfrensia.com/en/product/xigamtek-heaven-air-8-fan-argb-pwm-e-atx-support-btf-mb/',
      ),
    ).toBe('');
  });

  it('handles the three store path shapes', () => {
    expect(categoryFromUrl('https://alfrensia.com/product-category/processor/')).toBe('cpu');
    expect(categoryFromUrl('https://alfrensia.com/product-category/air-liquid-cooling/')).toBe('cooling');
    expect(categoryFromUrl('https://www.elnekhelytechnology.com/graphics-card')).toBe('gpu');
    expect(
      categoryFromUrl('https://www.elnekhelytechnology.com/cases/corsair-6500d-airflow-mid-tower-case-black'),
    ).toBe('case');
    expect(categoryFromUrl('https://elbadrgroupeg.store/vga')).toBe('gpu');
    expect(categoryFromUrl('https://elbadrgroupeg.store/power-supply')).toBe('psu');
  });

  it('a chassis path is a case even for COOLER MASTER or with an AIO in the slug', () => {
    expect(
      categoryFromUrl(
        'https://www.elnekhelytechnology.com/cases/lian-li-a4-h2o-black-11l-mini-itx-case-aluminum-aio-pcie-riser-psu',
      ),
    ).toBe('case');
    expect(
      categoryFromUrl('https://www.elnekhelytechnology.com/power-supply/cooler-master-elite-gold-850w'),
    ).toBe('psu');
  });

  it('prefers cooling over cpu for a cooler path', () => {
    expect(categoryFromUrl('https://elbadrgroupeg.store/cpu-cooler/corsair-h100i')).toBe('cooling');
    expect(categoryFromUrl('https://elbadrgroupeg.store/cpu')).toBe('cpu');
  });

  it('returns nothing for a flat slug (Elbadr product URLs)', () => {
    // No collection in the path: the caller keeps the scraped page category.
    expect(categoryFromUrl('https://elbadrgroupeg.store/amd-ryzen-7-7800x3d-mpk')).toBe('');
    expect(categoryFromUrl('')).toBe('');
    expect(categoryFromUrl(null)).toBe('');
  });
});

describe('categoryFromTitle', () => {
  it('files a CPU cooler as cooling, not as a CPU', () => {
    expect(categoryFromTitle('Corsair iCUE H100i Elite CPU Liquid Cooler')).toBe('cooling');
    expect(categoryFromTitle('ASUS Prime LC 360 ARGB LCD AIO Liquid CPU Cooler')).toBe('cooling');
  });

  it('files a chassis as case even when it advertises GPU clearance', () => {
    expect(categoryFromTitle('Xigmatek Crystal Storm E-ATX 420mm GPU Mid Tower Case')).toBe('case');
  });

  it('still recognises a processor and a graphics card', () => {
    expect(categoryFromTitle('AMD Ryzen 7 7800X3D 8-Core Processor')).toBe('cpu');
    expect(categoryFromTitle('ASUS Dual GeForce RTX 5070 OC 12GB')).toBe('gpu');
  });

  it('says nothing rather than guessing', () => {
    expect(categoryFromTitle('ADATA SC750 1TB USB 3.2 Gen 2')).toBe('');
  });
});

describe('resolveCategory', () => {
  it('URL beats the name and the stored value', () => {
    expect(
      resolveCategory({
        url: 'https://alfrensia.com/product-category/air-liquid-cooling/x/',
        title: 'AMD Ryzen 9 9950X Processor',
        stored: 'cpu',
      }),
    ).toBe('cooling');
  });

  it('falls back to the stored page category for flat URLs', () => {
    expect(
      resolveCategory({ url: 'https://elbadrgroupeg.store/amd-ryzen-7-7800x3d-mpk', stored: 'cpu' }),
    ).toBe('cpu');
  });

  it('uses the title when neither URL nor stored category says anything', () => {
    expect(resolveCategory({ title: 'MSI MPG A850G 850W 80 Plus Gold Power Supply' })).toBe('psu');
  });
});
