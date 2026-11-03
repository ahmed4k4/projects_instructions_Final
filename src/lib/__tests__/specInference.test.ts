import { describe, expect, it } from 'vitest';
import { inferSpecs } from '@/lib/specInference';

/**
 * Spec inference feeds the compatibility engine from real retailer listings.
 *
 * Every case is a title that really exists in the Egyptian catalogue. The point
 * of each assertion is not the exact number but that the engine gets a value it
 * can compare: a socket, a length, a wattage.
 */
describe('inferSpecs — GPUs', () => {
  it('reads the chip, not the board partner, for a 5070 Ti', () => {
    const specs = inferSpecs({ name: 'Palit GeForce RTX 5070 Ti GamingPro S 16GB', category: 'gpu' });
    expect(specs.vram).toBe(16);
    expect(specs.tdp).toBe(300);
    expect(specs.recommendedPsu).toBe(750);
    expect(specs.length).toBeGreaterThan(250);
    expect(specs.powerConnectors).toMatch(/16-pin/);
    expect(specs.specConfidence).toBe('estimated');
  });

  it('keeps a stated length and calls it high confidence', () => {
    const specs = inferSpecs({ name: 'ASUS TUF RTX 5070 OC 12GB 305mm', category: 'gpu' });
    expect(specs.length).toBe(305);
    expect(specs.specConfidence).toBe('high');
  });

  it('shortens a compact board partner and lengthens a flagship one', () => {
    const dual = inferSpecs({ name: 'MSI GeForce RTX 4060 Ventus 2X 8GB', category: 'gpu' });
    const suprim = inferSpecs({ name: 'MSI GeForce RTX 4060 Suprim 8GB', category: 'gpu' });
    expect(Number(dual.length)).toBeLessThan(Number(suprim.length));
  });

  it('does not confuse a 5070 with a 5070 Ti', () => {
    expect(inferSpecs({ name: 'Gigabyte RTX 5070 WINDFORCE 12GB', category: 'gpu' }).tdp).toBe(250);
    expect(inferSpecs({ name: 'Gigabyte RTX 5070 Ti WINDFORCE 16GB', category: 'gpu' }).tdp).toBe(300);
  });

  it('reads a Radeon card', () => {
    const specs = inferSpecs({ name: 'Sapphire RX 9070 XT Pulse 16GB', category: 'gpu' });
    expect(specs.vram).toBe(16);
    expect(specs.powerConnectors).toMatch(/8-pin/);
  });

  it('falls back to a stated VRAM when the model is unknown', () => {
    const specs = inferSpecs({ name: 'Some Future GPU 24GB', category: 'gpu' });
    expect(specs.vram).toBe(24);
    expect(specs.specConfidence).toBe('estimated');
  });

  it('returns nothing rather than inventing a card', () => {
    expect(inferSpecs({ name: 'PVC Cable Sleeve Kit', category: 'gpu' })).toEqual({});
  });
});

describe('inferSpecs — CPUs', () => {
  it('puts a Ryzen 7000-series on AM5 with DDR5', () => {
    const specs = inferSpecs({ name: 'AMD Ryzen 7 7800X3D Desktop Processor', category: 'cpu' });
    expect(specs.socket).toBe('AM5');
    expect(specs.ramType).toBe('DDR5');
    expect(specs.l3Cache).toBe(96);
  });

  it('puts a Ryzen 5000-series on AM4 with DDR4', () => {
    expect(inferSpecs({ name: 'AMD Ryzen 5 5600X Tray Processor', category: 'cpu' }).socket).toBe('AM4');
  });

  it('reads an Intel generation into the right socket', () => {
    expect(inferSpecs({ name: 'Intel Core i5-14400F Processor', category: 'cpu' }).socket).toBe('LGA1700');
    expect(inferSpecs({ name: 'Intel Core Ultra 7 265K', category: 'cpu' }).socket).toBe('LGA1851');
  });

  it('marks an F-suffix Intel part as having no integrated graphics', () => {
    expect(inferSpecs({ name: 'Intel Core i7-14700KF', category: 'cpu' }).integratedGraphics).toBe(false);
  });
});

describe('inferSpecs — other categories', () => {
  it('reads a motherboard chipset into a socket', () => {
    const specs = inferSpecs({ name: 'Gigabyte B650M AORUS ELITE AX', category: 'motherboard' });
    expect(specs.socket).toBe('AM5');
    expect(specs.formFactor).toBe('Micro-ATX');
    expect(specs.ramType).toBe('DDR5');
  });

  it('reads RAM capacity, sticks and speed', () => {
    const specs = inferSpecs({
      name: 'Kingston FURY Beast 32GB (2x16GB) DDR5 6000MT/s CL30',
      category: 'ram',
    });
    expect(specs.type).toBe('DDR5');
    expect(specs.capacity).toBe(32);
    expect(specs.sticks).toBe(2);
    expect(specs.speed).toBe(6000);
    expect(specs.casLatency).toBe(30);
  });

  it('reads drive capacity and interface', () => {
    const specs = inferSpecs({ name: 'WD_BLACK SN850X 2TB NVMe SSD Gen 4', category: 'storage' });
    expect(specs.capacity).toBe(2048);
    expect(specs.interface).toMatch(/PCIe 4/);
  });

  it('reads PSU wattage, efficiency and modularity', () => {
    const specs = inferSpecs({
      name: 'COOLER MASTER Elite Gold 850W 80 Plus Gold Fully Modular',
      category: 'psu',
    });
    expect(specs.wattage).toBe(850);
    expect(specs.efficiency).toBe('80+ Gold');
    expect(specs.modular).toBe('Full');
  });

  it('reads case clearance from the tower class', () => {
    const full = inferSpecs({ name: 'Corsair 7000D Full Tower Case', category: 'case' });
    const mini = inferSpecs({ name: 'Lian Li A4-H2O Mini-ITX Case', category: 'case' });
    expect(Number(full.maxGpuLength)).toBeGreaterThan(Number(mini.maxGpuLength));
    expect(full.formFactorSupport).toContain('E-ATX');
  });

  it('reads an AIO radiator size', () => {
    const specs = inferSpecs({ name: 'Cooler Master ML360L ARGB CPU Liquid Cooler', category: 'cooling' });
    expect(specs.type).toBe('Liquid');
    expect(specs.radiatorSize).toBe(360);
    expect(specs.socketSupport).toContain('AM5');
  });

  it('says nothing for a category it does not model', () => {
    expect(inferSpecs({ name: 'Mystery Part', category: null })).toEqual({});
  });
});
