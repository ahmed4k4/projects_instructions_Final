import { describe, expect, it } from 'vitest';
import { inferSpecs } from '@/lib/specInference';

/**
 * Regression: the cheaper configurations reported "0 W".
 *
 * Measured on /prebuilt — Starter and Balanced showed `0 W` while Flagship showed
 * 340 W. The cause is not in the generator: it is that `powerDrawWatts` is read
 * from `specs.tdp`, and an Intel CPU with no stated wattage resolved to a socket
 * and RAM type but NO `tdp`, so the build's total was 0.
 *
 * A CPU always draws power. When the title states a wattage it wins; otherwise
 * the table's default for that family must be present, because the PSU rule
 * (`psu_wattage_min`) and the card's power line both read it.
 */
describe('inferSpecs always yields a CPU power figure', () => {
  const cases = [
    'Intel Core i7-14700 MPK Processor',
    'Intel Core Ultra 5 250K Plus 18 Core 5.3GHz LGA1851 125W Tray Processor',
    'AMD Ryzen 7 8700G 8 Core 16 Thread 5.1GHz AM5 65W Tray Processor',
    'AMD Ryzen 5 5600X Tray Processor',
    'Intel Core i5-12400F Processor',
  ];

  it.each(cases)('%s carries a positive tdp', (name) => {
    const specs = inferSpecs({ name, category: 'cpu' });
    expect(specs.socket).toBeTruthy();
    expect(Number(specs.tdp)).toBeGreaterThan(20);
  });

  it('reads the stated wattage rather than the family default', () => {
    const specs = inferSpecs({ name: 'AMD Ryzen 9 9950X 170W Processor', category: 'cpu' });
    expect(specs.tdp).toBe(170);
  });
});
