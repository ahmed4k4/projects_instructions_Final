import { describe, expect, it, vi } from 'vitest';

/**
 * The configuration names come from the i18n catalogue, and i18next's browser
 * detector touches `document` on import. The names are not what this test is
 * about, so it is mocked — everything else (pricing, compatibility, ids) is the
 * real implementation.
 */
vi.mock('@/i18n', () => ({
  default: { getFixedT: () => (key: string) => key },
}));

const { buildPrebuilts } = await import('@/lib/prebuiltFromCatalogue');
import type { PCComponent } from '@/types/components';

/**
 * Prebuilt configurations are generated from live stock.
 *
 * This replaces the three hand-written builds that referenced `sampleComponents`
 * ids: opening one loaded components that did not exist, and the totals were in
 * the old USD-era numbers. The generated versions must (a) be complete enough to
 * be a real build, and (b) reference components that exist in the catalogue.
 */

let n = 0;
function part(
  category: PCComponent['category'],
  price: number,
  specs: Record<string, unknown> = {},
): PCComponent {
  n += 1;
  return {
    id: `${category}-${n}`,
    category,
    brand: 'Test',
    model: `M${n}`,
    name: `Test ${category} ${n}`,
    specs,
    price,
    currency: 'EGP',
    stockStatus: 'in_stock',
    storeLinks: [{ store: 'Elbadr Group', url: 'https://x', price }],
    performanceScore: 70,
    powerDrawWatts: 100,
    imageUrl: null,
    isActive: true,
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  };
}

const CATALOGUE: PCComponent[] = [
  part('cpu', 30_000, { socket: 'AM5', ramType: 'DDR5', tdp: 120 }),
  part('cpu', 12_000, { socket: 'AM4', ramType: 'DDR4', tdp: 65 }),
  part('motherboard', 15_000, { socket: 'AM5', ramType: 'DDR5', formFactor: 'ATX', m2Slots: 2, maxRam: 128 }),
  part('motherboard', 6_000, { socket: 'AM4', ramType: 'DDR4', formFactor: 'ATX', m2Slots: 2, maxRam: 128 }),
  part('gpu', 90_000, { tdp: 300, recommendedPsu: 750, length: 300, powerConnectors: '1x 16-pin' }),
  part('gpu', 25_000, { tdp: 160, recommendedPsu: 550, length: 245 }),
  part('ram', 6_000, { type: 'DDR5', capacity: 32, sticks: 2, speed: 6000 }),
  part('ram', 3_000, { type: 'DDR4', capacity: 16, sticks: 2, speed: 3200 }),
  part('storage', 5_000, { type: 'NVMe SSD', interface: 'PCIe 4.0 x4', capacity: 1024 }),
  part('psu', 7_000, { wattage: 850, efficiency: '80+ Gold', pcieConnectors: 4 }),
  part('case', 4_000, { formFactorSupport: ['ATX', 'Micro-ATX'], maxGpuLength: 360, maxCoolerHeight: 170 }),
  part('cooling', 3_000, { type: 'Liquid', socketSupport: ['AM5', 'AM4'], height: 0, radiatorSize: 240 }),
];

describe('buildPrebuilts', () => {
  it('generates configurations that reference catalogue components', () => {
    const builds = buildPrebuilts(CATALOGUE, [], 'en');
    expect(builds.length).toBeGreaterThan(0);

    const ids = new Set(CATALOGUE.map((component) => component.id));
    for (const build of builds) {
      expect(build.componentIds.length).toBeGreaterThanOrEqual(6);
      for (const id of build.componentIds) expect(ids.has(id)).toBe(true);
    }
  });

  it('reports a real price and power draw', () => {
    const [build] = buildPrebuilts(CATALOGUE, [], 'en');
    expect(build!.totalPrice).toBeGreaterThan(0);
    expect(build!.totalPowerWatts).toBeGreaterThan(0);
  });

  it('localises the name and description', () => {
    const en = buildPrebuilts(CATALOGUE, [], 'en');
    const ar = buildPrebuilts(CATALOGUE, [], 'ar');

    // The same configurations resolve in both languages, and the name comes from
    // i18n (`prebuilt.configs.*`) rather than from a literal in the module. The
    // mocked `t` returns the key, so a name that is NOT a key would mean the
    // module hardcoded English.
    expect(en.length).toBeGreaterThan(0);
    expect(en.map((build) => build.id)).toEqual(ar.map((build) => build.id));
    for (const build of en) expect(build.name).toMatch(/^prebuilt\.configs\./);
  });

  it('returns nothing when the catalogue is empty, instead of advertising an impossible PC', () => {
    expect(buildPrebuilts([], [], 'en')).toEqual([]);
  });
});
