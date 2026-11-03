import type { UseCase } from '@/types/build';
import type { ComponentCategory } from '@/types/components';

/**
 * Performance weights per use case.
 *
 * They must sum to 1.0 — asserted by the unit tests. A missing component
 * contributes 0 for its slice, which is what makes a half-built system score
 * low *and* makes the score jump when the missing part is added.
 */
export const USE_CASE_WEIGHTS: Record<UseCase, Partial<Record<ComponentCategory, number>>> = {
  gaming: { gpu: 0.55, cpu: 0.3, ram: 0.1, storage: 0.05 },
  ai: { gpu: 0.7, cpu: 0.15, ram: 0.15 },
  editing: { cpu: 0.4, gpu: 0.35, ram: 0.15, storage: 0.1 },
  programming: { cpu: 0.45, ram: 0.3, storage: 0.25 },
  workstation: { cpu: 0.4, ram: 0.3, gpu: 0.2, storage: 0.1 },
  streaming: { gpu: 0.45, cpu: 0.35, ram: 0.1, storage: 0.1 },
};

/** Top-level weighting of the five sub-scores. Sums to 1.0. */
export const SCORE_WEIGHTS = {
  performance: 0.3,
  compatibility: 0.25,
  value: 0.2,
  efficiency: 0.15,
  upgradability: 0.1,
} as const;

/**
 * Reference points, derived from the seeded catalogue so the value and
 * efficiency curves land in a useful range for $800–$4,000 builds.
 *
 * `perfPerDollar` is the perf-score-per-$1,000 of the best seeded build;
 * `value` is scored as a ratio against it (capped at 100).
 */
export const REFERENCES = {
  /** Highest total price among the seeded reference builds. */
  premiumPrice: 3249,
  /** Lowest "sweet spot" price. */
  budgetPrice: 1299,
  /**
   * Best observed performance-score per $1,000 (RTX 4090 build ≈ 96 perf
   * points for $3.2k → ≈ 30). Used as the denominator for the value curve.
   */
  bestPerfPerThousandDollars: 30,
  /** Typical watts-per-performance-point of the seeded builds (~6.2). */
  wattsPerPerfPoint: 6.2,
} as const;

/** Socket longevity used by the upgradability sub-score (0–100). */
export const SOCKET_LONGEVITY: Record<string, number> = {
  AM5: 100,
  LGA1851: 80,
  LGA1700: 60,
  AM4: 30,
  LGA1200: 20,
};

export const DEFAULT_SOCKET_LONGEVITY = 50;

/**
 * Residual-slot capacity of a case form factor, used for the
 * "room to grow" part of upgradability.
 */
export const FORM_FACTOR_ROOM: Record<string, number> = {
  'E-ATX': 100,
  ATX: 85,
  mATX: 60,
  'Mini-ITX': 25,
  ITX: 25,
};
