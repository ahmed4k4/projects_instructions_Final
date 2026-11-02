import { describe, expect, it } from 'vitest';
import { retailerImageUrl } from '../retailerImage';

describe('retailerImageUrl', () => {
  it('passes through a normal CDN photo', () => {
    const url = 'https://elbadrgroupeg.store/image/cache/catalog/products_2025/gpu-250x250.webp';
    expect(retailerImageUrl(url)).toBe(url);
  });

  it('keeps Sigma image-proxy URLs intact', () => {
    const url =
      'https://sigma-computer.com/_next/image?url=https%3A%2F%2Fapi.sigma-computer.com%2Fmedia%2Fabc&w=384&q=75';
    expect(retailerImageUrl(url)).toBe(url);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['/image/placeholder.png'],
    ['https://shop.example/static/no_image.jpg'],
    ['https://shop.example/img/spacer.gif'],
    ['not-a-url'],
  ])('rejects %s', (value) => {
    expect(retailerImageUrl(value as string | null | undefined)).toBeNull();
  });

  it('does not reject a filename that merely starts with a placeholder word', () => {
    const url = 'https://shop.example/image/blanket-gpu.jpg';
    expect(retailerImageUrl(url)).toBe(url);
  });
});
