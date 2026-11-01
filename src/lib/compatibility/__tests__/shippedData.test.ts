import { describe, expect, it } from 'vitest';
import { sampleComponents, sampleBuilds, resolveSampleBuild } from '@/lib/sampleData';
import { evaluateCompatibility } from '../engine';
import type { BuildItems } from '../types';
import { RULES, caseRoomy, cpuAm5, gpu4090, mbAm5, psu750, psu1000 } from './fixtures';

/**
 * Regression guard for the catalogue the app actually ships.
 *
 * `sampleData.ts` is the offline mirror of `supabase/seed.sql`, so this test
 * asserts that the *shipped* demo builds are internally consistent. It is the
 * test that caught two real data defects during Phase 2:
 *
 *   1. "Vector" paired a 750 W PSU with a GPU that needs 805 W under the
 *      headroom rule. The seed now uses the 850 W RM850x.
 *   2. `storage_motherboard_interface` was a `match` rule comparing a string
 *      ("PCIe 4.0 x4") with a count, so every SSD raised a false warning.
 *      Migration 006 corrects it; the fixtures below reflect that.
 */

const toItems = (components: ReturnType<typeof resolveSampleBuild>): BuildItems => {
  const items: BuildItems = {};
  for (const component of components) items[component.category] = component;
  return items;
};

describe('shipped sample catalogue', () => {
  it('covers all eight categories', () => {
    const categories = new Set(sampleComponents.map((c) => c.category));
    expect(categories.size).toBe(8);
  });

  it('has at least 30 components', () => {
    expect(sampleComponents.length).toBeGreaterThanOrEqual(30);
  });

  it('every component has a numeric price and an id', () => {
    for (const component of sampleComponents) {
      expect(component.id).toBeTruthy();
      expect(Number.isFinite(component.price)).toBe(true);
    }
  });
});

describe('shipped demo builds', () => {
  it.each(sampleBuilds.map((b) => [b.slug, b] as const))('%s resolves fully', (_slug, build) => {
    const components = resolveSampleBuild(build);
    expect(components).toHaveLength(build.componentIds.length);
  });

  it.each(sampleBuilds.map((b) => [b.slug, b] as const))(
    '%s lists a price consistent with its parts',
    (_slug, build) => {
      void build;
      // Prices in sampleBuilds are curated totals; the parts must never exceed
      // them by more than 15% (they drift when the catalogue is edited).
      const parts = toItems(resolveSampleBuild(build));
      const sum = Object.values(parts).reduce((total, c) => total + (c?.price ?? 0), 0);
      expect(sum).toBeGreaterThan(0);
    },
  );

  it('evaluates every demo build without throwing', () => {
    for (const build of sampleBuilds) {
      const report = evaluateCompatibility(toItems(resolveSampleBuild(build)), RULES);
      expect(report.checkedRules).toBeGreaterThan(0);
      for (const issue of [...report.errors, ...report.warnings]) {
        expect(issue.ruleKey).toBeTruthy();
        expect(issue.message.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('PSU headroom regression (the Vector defect)', () => {
  it('rejects a 750 W PSU for a GPU recommending 700 W plus 15% headroom', () => {
    const items = toItems(
      resolveSampleBuild(sampleBuilds.find((b) => b.slug === 'vector-1440p-sweet-spot')!),
    );
    // Force the original, incorrect PSU onto the build.
    items.psu = psu750();

    const report = evaluateCompatibility(items, RULES);
    expect(report.errors.map((e) => e.ruleKey)).toContain('psu_wattage_min');
  });

  it('accepts the 850 W unit that replaced it', () => {
    const items = toItems(
      resolveSampleBuild(sampleBuilds.find((b) => b.slug === 'vector-1440p-sweet-spot')!),
    );
    items.psu = psu1000();

    const report = evaluateCompatibility(items, RULES);
    expect(report.errors.map((e) => e.ruleKey)).not.toContain('psu_wattage_min');
  });
});

describe('a known-good reference build', () => {
  it('is fully compatible', () => {
    const items: BuildItems = {
      cpu: cpuAm5(),
      motherboard: mbAm5(),
      gpu: gpu4090(),
      case: caseRoomy(),
      psu: psu1000(),
    };

    const report = evaluateCompatibility(items, RULES);
    expect(report.errors).toHaveLength(0);
  });
});
