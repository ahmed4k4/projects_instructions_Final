import { describe, expect, it } from 'vitest';
import { classifyByName } from '../../../../supabase/functions/retailer-sync/parsers';
/**
 * Category precedence â€” the rule that decides which bucket a product lands in.
 *
 * Each case below was a live misfiling found by looking at a filtered grid:
 * `/search?cat=gpu` was showing 31 Mid-Tower CASES and 13 motherboards because
 * a chassis described itself by the GPU it accepts.
 */
describe('classifyByName precedence', () => {
  it('files a case under case even when it advertises GPU clearance', () => {
    expect(
      classifyByName('Xigmatek Crystal Storm E-ATX 420mm GPU 360mm Radiator Mid Tower Case', 'gpu'),
    ).toBe('case');
  });

  it('files a board under motherboard even when it lists a GPU slot', () => {
    expect(classifyByName('ASUS Prime B650M-A WIFI PCIe x16 for GPU', 'gpu')).toBe('motherboard');
  });

  it('still recognises a real GPU', () => {
    expect(classifyByName('ASUS TUF Gaming GeForce RTX 5070 Ti OC 16GB', 'case')).toBe('gpu');
  });

  it('prefers PSU watts over a GPU marketing word', () => {
    expect(classifyByName('MSI MPG A850G PCIE5 850W 80 Plus Gold GeForce-ready', 'gpu')).toBe('psu');
  });

  it('keeps an APU as a CPU despite the iGPU name', () => {
    expect(classifyByName('AMD Ryzen 5 8600G (Zen 4 & Radeon 760M)', 'gpu')).toBe('cpu');
  });
});
