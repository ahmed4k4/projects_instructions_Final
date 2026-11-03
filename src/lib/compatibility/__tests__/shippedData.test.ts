import { describe, expect, it } from 'vitest';
import { evaluateCompatibility } from '../engine';
import type { BuildItems } from '../types';
import { RULES, caseRoomy, cpuAm5, gpu4090, mbAm5, psu750, psu1000 } from './fixtures';

/**
 * Consistency of the data the app SHIPS.
 *
 * This file used to assert on `sampleData.ts` — the 32-component demo catalogue
 * and six hand-written builds. That catalogue was deleted in Phase 15 (see
 * docs/AUDIT.md § 63): the Builder, the AI advisor and the Prebuilt page now run
 * on real Egyptian retailer listings, so a test over a deleted file asserted
 * nothing about what users actually see.
 *
 * What still matters — and is genuinely at risk of regressing — is that the
 * rules and the catalogue AGREE. That is what these fixtures pin:
 *
 *   · the PSU headroom rule rejects a 750 W unit for a card recommending 700 W
 *     (this was the real "Vector" defect, and it is rule behaviour, not data);
 *   · a known-good build evaluates with zero errors;
 *   · every rule produces a message a human can act on.
 *
 * The catalogue itself is covered by the data gates that run in `pnpm audit:all`:
 * `verify-catalogue-categories.mjs` (a fan is never in CPUs) and
 * `verify-catalogue-specs.mjs` (every bucket carries the spec its rules read).
 */
const toItems = (components: Array<{ category: keyof BuildItems }>): BuildItems => {
  const items: BuildItems = {};
  for (const component of components) {
    const typed = component as unknown as NonNullable<BuildItems[keyof BuildItems]>;
    items[typed.category] = typed;
  }
  return items;
};

describe('rule fixtures', () => {
  it('every rule carries a message a user can act on', () => {
    for (const rule of RULES) {
      expect(rule.ruleKey).toBeTruthy();
      expect(rule.message.length).toBeGreaterThan(10);
    }
  });
});

describe('PSU headroom regression (the Vector defect)', () => {
  it('rejects a 750 W PSU for a GPU recommending 700 W plus 15% headroom', () => {
    const items = toItems([cpuAm5(), mbAm5(), gpu4090(), caseRoomy(), psu750()]);

    const report = evaluateCompatibility(items, RULES);
    expect(report.errors.map((e) => e.ruleKey)).toContain('psu_wattage_min');
  });

  it('accepts the 1000 W unit that fixed it', () => {
    const items = toItems([cpuAm5(), mbAm5(), gpu4090(), caseRoomy(), psu1000()]);

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
