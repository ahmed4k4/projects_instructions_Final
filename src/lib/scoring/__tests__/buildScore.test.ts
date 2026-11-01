import { describe, expect, it } from 'vitest';
import type { CompatibilityReport } from '@/lib/compatibility/types';
import type { UseCase } from '@/types/build';
import {
  calculateBuildScore,
  compatibilityScore,
  efficiencyScore,
  gradeBuild,
  performanceScore,
  scoreToBreakdown,
  upgradabilityScore,
  valueScore,
} from '../buildScore';
import { SCORE_WEIGHTS, USE_CASE_WEIGHTS } from '../reference';

function report(errors = 0, warnings = 0): CompatibilityReport {
  return {
    isCompatible: errors === 0,
    errors: Array.from({ length: errors }, (_, i) => ({
      severity: 'error' as const,
      ruleKey: `e${i}`,
      message: 'error',
    })),
    warnings: Array.from({ length: warnings }, (_, i) => ({
      severity: 'warning' as const,
      ruleKey: `w${i}`,
      message: 'warning',
    })),
    checkedRules: 12,
    skippedRules: 0,
  };
}

/** Minimal components with the spec keys scoring reads. */
const part = (category: string, perf: number, specs: Record<string, unknown>, watts: number | null = 0) =>
  [
    category,
    {
      id: `${category}-1`,
      category,
      brand: 'X',
      model: category,
      name: category,
      specs,
      price: 100,
      currency: 'USD',
      stockStatus: 'in_stock',
      storeLinks: [],
      performanceScore: perf,
      powerDrawWatts: watts,
      imageUrl: null,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
  ] as const;

const build = (perf = { cpu: 90, gpu: 100, ram: 90, storage: 95 }) =>
  Object.fromEntries([
    part('cpu', perf.cpu, { socket: 'AM5' }, 120),
    part('gpu', perf.gpu, {}, 320),
    part('ram', perf.ram, { sticks: 2 }, 12),
    part('storage', perf.storage, {}, 8),
    part('psu', 90, { wattage: 850 }),
    part('motherboard', 90, { ramSlots: 4 }),
    part('case', 85, { formFactorSupport: ['E-ATX', 'ATX'] }),
  ]) as never;

describe('reference data', () => {
  it('use-case weights sum to 1.0 for every use case', () => {
    for (const [useCase, weights] of Object.entries(USE_CASE_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum, useCase).toBeCloseTo(1, 5);
    }
  });

  it('top-level weights sum to 1.0', () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('performanceScore', () => {
  it('applies the gaming weights (GPU 55 / CPU 30 / RAM 10 / SSD 5)', () => {
    const score = performanceScore(build(), 'gaming');
    // 0.55×100 + 0.30×90 + 0.10×90 + 0.05×95 = 95.75
    expect(score).toBeCloseTo(95.75, 5);
  });

  it('reweights for AI (GPU 70 / CPU 15 / RAM 15) and ignores storage', () => {
    const score = performanceScore(build(), 'ai');
    // 0.70×100 + 0.15×90 + 0.15×90 = 97
    expect(score).toBeCloseTo(97, 5);
  });

  it('counts a missing component as zero for its slice', () => {
    const items = build();
    delete (items as Record<string, unknown>).gpu;
    const score = performanceScore(items, 'ai');
    // Only CPU 0.15×90 + RAM 0.15×90 = 27
    expect(score).toBeCloseTo(27, 5);
  });

  it('is higher for a gaming build on unknown use cases than an empty build', () => {
    expect(performanceScore({}, 'gaming' as UseCase)).toBe(0);
  });
});

describe('compatibilityScore', () => {
  it('is 100 with no issues', () => {
    expect(compatibilityScore(report())).toBe(100);
  });

  it('subtracts 25 per error and 8 per warning', () => {
    expect(compatibilityScore(report(1, 0))).toBe(75);
    expect(compatibilityScore(report(0, 2))).toBe(84);
    expect(compatibilityScore(report(2, 1))).toBe(42);
  });

  it('floors at zero for very broken builds', () => {
    expect(compatibilityScore(report(9, 9))).toBe(0);
  });
});

describe('valueScore', () => {
  it('scores 0 for a free or unbuilt system', () => {
    expect(valueScore(90, 0)).toBe(0);
    expect(valueScore(0, 1500)).toBe(0);
  });

  it('hits 100 at the reference perf-per-dollar', () => {
    // 30 perf per $1,000 → 90 perf at $3,000
    expect(valueScore(90, 3000)).toBeCloseTo(100, 5);
  });

  it('scales down as price climbs', () => {
    const cheap = valueScore(90, 2000);
    const expensive = valueScore(90, 4000);
    expect(cheap).toBeGreaterThan(expensive);
    expect(expensive).toBeLessThan(cheap);
  });
});

describe('efficiencyScore', () => {
  it('returns 0 for a build with no draw', () => {
    expect(efficiencyScore(90, 0)).toBe(0);
    expect(efficiencyScore(0, 400)).toBe(0);
  });

  it('rewards low watts for the same performance', () => {
    const lean = efficiencyScore(90, 450); // 5 W/pt
    const thirsty = efficiencyScore(90, 700); // 7.8 W/pt
    expect(lean).toBeGreaterThan(thirsty);
    expect(lean).toBe(100);
  });
});

describe('upgradabilityScore', () => {
  it('prefers AM5 over LGA1700 for the same rest of build', () => {
    const am5 = build();
    const lga = build();
    (lga as Record<string, { specs: Record<string, unknown> }>).cpu!.specs = { socket: 'LGA1700' };
    expect(upgradabilityScore(am5, 450)).toBeGreaterThan(upgradabilityScore(lga, 450));
  });

  it('rewards PSU headroom', () => {
    const plenty = build();
    const tight = build();
    (tight as Record<string, { specs: Record<string, unknown> }>).psu!.specs = { wattage: 400 };
    expect(upgradabilityScore(plenty, 450)).toBeGreaterThan(upgradabilityScore(tight, 450));
  });

  it('scores an empty build low', () => {
    expect(upgradabilityScore({}, 0)).toBeLessThan(30);
  });
});

describe('calculateBuildScore', () => {
  const base = {
    items: build(),
    compatibility: report(),
    totalPrice: 2200,
    totalWatts: 460,
    useCase: 'gaming' as UseCase,
  };

  it('combines the sub-scores with the documented weights', () => {
    const { total, breakdown } = calculateBuildScore(base);
    const expected =
      breakdown.performance * 0.3 +
      breakdown.compatibility * 0.25 +
      breakdown.value * 0.2 +
      breakdown.efficiency * 0.15 +
      breakdown.upgradability * 0.1;
    expect(total).toBe(Math.round(expected));
    expect(total).toBeGreaterThan(50);
    expect(total).toBeLessThanOrEqual(100);
  });

  it('loses points when compatibility errors exist', () => {
    const clean = calculateBuildScore(base).total;
    const broken = calculateBuildScore({ ...base, compatibility: report(2, 1) }).total;
    expect(broken).toBeLessThan(clean);
  });

  it('adds a note when over budget', () => {
    const { notes } = calculateBuildScore({ ...base, budget: 1500 });
    expect(notes.some((n) => n.includes('Over budget'))).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    expect(calculateBuildScore(base).total).toBe(calculateBuildScore(base).total);
  });

  it('exposes the breakdown through scoreToBreakdown', () => {
    const score = calculateBuildScore(base);
    expect(scoreToBreakdown(score)).toEqual(score.breakdown);
  });
});

describe('gradeBuild', () => {
  it.each([
    [95, 'A'],
    [78, 'B'],
    [60, 'C'],
    [30, 'D'],
  ])('grades %i as %s', (total, grade) => {
    expect(gradeBuild(total).grade).toBe(grade);
  });
});
