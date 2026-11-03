import { describe, expect, it } from 'vitest';
import type { PCComponent } from '@/types/components';
import type { UseCase } from '@/types/build';
import { BUDGET_ALLOCATION, fallbackBuild, fallbackNotice } from '../fallbackBuild';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import type { CompatibilityRule } from '@/lib/compatibility/types';

/** A small but complete catalogue with two platforms. */
function part(
  category: PCComponent['category'],
  model: string,
  price: number,
  specs: Record<string, unknown>,
  perf: number,
  watts: number | null = 0,
): PCComponent {
  return {
    id: `${category}-${model.replace(/\W+/g, '')}`,
    category,
    brand: model.split(' ')[0] ?? 'X',
    model,
    name: model,
    specs,
    price,
    currency: 'USD',
    stockStatus: 'in_stock',
    storeLinks: [],
    performanceScore: perf,
    powerDrawWatts: watts,
    imageUrl: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

const catalogue: PCComponent[] = [
  // CPUs
  part('cpu', 'AMD 7800X3D', 379, { socket: 'AM5', ramType: 'DDR5', tdp: 120 }, 96, 120),
  part('cpu', 'AMD 7600X', 229, { socket: 'AM5', ramType: 'DDR5', tdp: 105 }, 84, 105),
  part('cpu', 'Intel 14700K', 409, { socket: 'LGA1700', ramType: 'DDR5', tdp: 253 }, 90, 253),
  // Motherboards
  part(
    'motherboard',
    'X670E',
    399,
    { socket: 'AM5', formFactor: 'ATX', ramType: 'DDR5', maxRam: 128, ramSlots: 4, m2Slots: 4 },
    92,
    25,
  ),
  part(
    'motherboard',
    'B650',
    219,
    { socket: 'AM5', formFactor: 'ATX', ramType: 'DDR5', maxRam: 128, ramSlots: 4, m2Slots: 3 },
    80,
    20,
  ),
  part(
    'motherboard',
    'Z790',
    429,
    { socket: 'LGA1700', formFactor: 'ATX', ramType: 'DDR5', maxRam: 192, ramSlots: 4, m2Slots: 5 },
    91,
    28,
  ),
  // RAM
  part(
    'ram',
    'DDR5 32GB',
    119,
    { type: 'DDR5', capacity: 32, speed: 6000, casLatency: 30, sticks: 2 },
    90,
    12,
  ),
  part(
    'ram',
    'DDR4 32GB',
    74,
    { type: 'DDR4', capacity: 32, speed: 3600, casLatency: 18, sticks: 2 },
    70,
    10,
  ),
  // GPUs
  part(
    'gpu',
    'RTX 4090',
    1799,
    { vram: 24, tdp: 450, length: 304, recommendedPsu: 850, slotWidth: 3 },
    100,
    450,
  ),
  part(
    'gpu',
    'RTX 4070',
    549,
    { vram: 12, tdp: 200, length: 244, recommendedPsu: 650, slotWidth: 2 },
    76,
    200,
  ),
  // Storage / PSU / case / cooling
  part(
    'storage',
    '990 Pro 2TB',
    169,
    { type: 'NVMe', interface: 'PCIe 4.0 x4', capacity: 2000, formFactor: 'M.2 2280' },
    97,
    8,
  ),
  part(
    'storage',
    'P3 1TB',
    69,
    { type: 'NVMe', interface: 'PCIe 3.0 x4', capacity: 1000, formFactor: 'M.2 2280' },
    72,
    6,
  ),
  part('psu', 'RM850x', 139, { wattage: 850, efficiency: '80+ Gold' }, 92, null),
  part('psu', 'Pure Power 750W', 109, { wattage: 750, efficiency: '80+ Gold' }, 88, null),
  part('psu', 'Prime 1000W', 289, { wattage: 1000, efficiency: '80+ Titanium' }, 98, null),
  part(
    'case',
    'O11 Dynamic',
    179,
    { formFactorSupport: ['E-ATX', 'ATX', 'mATX'], maxGpuLength: 426, maxCoolerHeight: 167 },
    92,
  ),
  part(
    'case',
    'North',
    139,
    { formFactorSupport: ['ATX', 'mATX'], maxGpuLength: 355, maxCoolerHeight: 170 },
    88,
  ),
  part('cooling', 'NH-D15', 109, { type: 'Air', height: 165, socketSupport: ['AM5', 'LGA1700'] }, 92, 3),
  part('cooling', 'AIO 360', 129, { type: 'AIO', height: 63, socketSupport: ['AM5', 'LGA1700'] }, 97, 12),
];

const request = (budget: number, useCase: UseCase = 'gaming') => ({
  budget,
  currency: 'USD',
  useCase,
  resolution: '1440p',
});

describe('BUDGET_ALLOCATION', () => {
  it('sums to 1.0 for every use case', () => {
    for (const [useCase, allocation] of Object.entries(BUDGET_ALLOCATION)) {
      const sum = Object.values(allocation).reduce((a, b) => a + b, 0);
      expect(sum, useCase).toBeCloseTo(1, 5);
    }
  });

  it('covers every use case in the product', () => {
    for (const useCase of ['gaming', 'ai', 'editing', 'programming', 'workstation', 'streaming']) {
      expect(BUDGET_ALLOCATION[useCase]).toBeDefined();
    }
  });
});

describe('fallbackBuild', () => {
  it('returns a complete build with a reason for every part', () => {
    const build = fallbackBuild(request(2000), catalogue);

    expect(build.source).toBe('fallback');
    expect(build.items.length).toBe(8);
    expect(new Set(build.items.map((i) => i.category)).size).toBe(8);
    for (const item of build.items) expect(item.reason.length).toBeGreaterThan(10);
  });

  it('respects an explicit AMD CPU preference in fallback mode', () => {
    const build = fallbackBuild({ ...request(2000, 'programming'), preferences: ['AMD CPU'] }, catalogue);
    const cpu = build.items.find((item) => item.category === 'cpu');
    expect(cpu).toBeDefined();
    const selected = catalogue.find((component) => component.id === cpu?.componentId);
    expect(`${selected?.brand} ${selected?.name}`).toMatch(/amd|ryzen/i);
  });

  it('only ever references IDs that exist in the catalogue', () => {
    const ids = new Set(catalogue.map((c) => c.id));
    const build = fallbackBuild(request(1500), catalogue);
    for (const item of build.items) expect(ids.has(item.componentId)).toBe(true);
  });

  it('reports a total that matches the selected parts', () => {
    const build = fallbackBuild(request(2000), catalogue);
    const expected = build.items.reduce(
      (sum, i) => sum + (catalogue.find((c) => c.id === i.componentId)?.price ?? 0),
      0,
    );
    expect(build.totalPrice).toBe(Math.round(expected));
  });

  it('produces a compatible build (platform parts agree)', () => {
    const rules: CompatibilityRule[] = [
      {
        ruleKey: 'cpu_motherboard_socket',
        categoryA: 'cpu',
        categoryB: 'motherboard',
        ruleType: 'match',
        specPathA: 'socket',
        specPathB: 'socket',
        config: {},
        message: 'socket',
        severity: 'error',
      },
      {
        ruleKey: 'motherboard_ram_type',
        categoryA: 'motherboard',
        categoryB: 'ram',
        ruleType: 'match',
        specPathA: 'ramType',
        specPathB: 'type',
        config: {},
        message: 'ram',
        severity: 'error',
      },
      {
        ruleKey: 'cooling_socket_support',
        categoryA: 'cooling',
        categoryB: 'cpu',
        ruleType: 'match',
        specPathA: 'socketSupport',
        specPathB: 'socket',
        config: {},
        message: 'cooler',
        severity: 'error',
      },
    ];

    for (const budget of [1200, 2000, 3500]) {
      const build = fallbackBuild(request(budget), catalogue);
      const items = Object.fromEntries(
        build.items.map((i) => {
          const component = catalogue.find((c) => c.id === i.componentId)!;
          return [component.category, component];
        }),
      );
      const report = evaluateCompatibility(items, rules);
      expect(report.errors, `budget ${budget}`).toHaveLength(0);
    }
  });

  it('stays within budget when the catalogue allows it', () => {
    const build = fallbackBuild(request(2000), catalogue);
    expect(build.totalPrice).toBeLessThanOrEqual(2000);
  });

  it('shifts spend toward the GPU for AI workloads', () => {
    const gaming = fallbackBuild(request(3000, 'gaming'), catalogue);
    const ai = fallbackBuild(request(3000, 'ai'), catalogue);

    const gpuOf = (b: typeof gaming) => {
      const item = b.items.find((i) => i.category === 'gpu');
      return catalogue.find((c) => c.id === item?.componentId)?.price ?? 0;
    };

    expect(gpuOf(ai)).toBeGreaterThanOrEqual(gpuOf(gaming));
  });

  it('still returns something for a tiny budget', () => {
    const build = fallbackBuild(request(400), catalogue);
    expect(build.items.length).toBeGreaterThan(0);
  });

  it('records the degraded reason', () => {
    const build = fallbackBuild(request(2000), catalogue, 'rate limit reached');
    expect(build.degradedReason).toBe('rate limit reached');
    expect(fallbackNotice(build.degradedReason)).toContain('rate limit reached');
  });

  it('is deterministic', () => {
    expect(fallbackBuild(request(1800), catalogue)).toEqual(fallbackBuild(request(1800), catalogue));
  });

  it('skips out-of-stock parts', () => {
    const withStock = catalogue.map((c) =>
      c.model === 'RTX 4090' ? { ...c, stockStatus: 'out_of_stock' as const } : c,
    );
    const build = fallbackBuild(request(4000), withStock);
    expect(build.items.some((i) => i.componentId.includes('RTX4090'))).toBe(false);
  });
});
