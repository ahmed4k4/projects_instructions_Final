/**
 * Deterministic build scoring.
 *
 * Five sub-scores are computed from database data and the compatibility report,
 * then combined with fixed weights. No I/O, no clock — the same build always
 * produces the same score, which is what lets the AI trust the number as a
 * reward signal while it selects components.
 *
 * ── Performance (0–100) ───────────────────────────────────────────────────
 *   Σ (use-case weight[category] × component.performanceScore)
 *   Missing category → 0 for that slice.
 *
 * ── Compatibility (0–100) ─────────────────────────────────────────────────
 *   100 − 25 × errors − 8 × warnings, floored at 0.
 *
 * ── Value (0–100) ─────────────────────────────────────────────────────────
 *   perfPerThousand = performance / (price / 1000)
 *   100 × min(1, perfPerThousand / REFERENCES.bestPerfPerThousandDollars)
 *   Only meaningful once a performance score exists; a $0 build scores 0.
 *
 * ── Efficiency (0–100) ────────────────────────────────────────────────────
 *   wattsPerPerfPoint = totalWatts / performance
 *   100 × min(1, REFERENCES.wattsPerPerfPoint / wattsPerPerfPoint)
 *
 * ── Upgradability (0–100) ─────────────────────────────────────────────────
 *   0.5 × socket longevity
 * + 0.2 × PSU headroom (capped)        headroom = psuWattage / (draw × 1.3)
 * + 0.15 × free RAM slots / total slots
 * + 0.15 × case expansion room
 *
 * ── Total ─────────────────────────────────────────────────────────────────
 *   0.30 perf + 0.25 compat + 0.20 value + 0.15 efficiency + 0.10 upgradability
 */
import type { BuildScoreBreakdown, UseCase } from '@/types/build';
import type { BuildItems, CompatibilityReport } from '@/lib/compatibility/types';
import {
  DEFAULT_SOCKET_LONGEVITY,
  FORM_FACTOR_ROOM,
  REFERENCES,
  SCORE_WEIGHTS,
  SOCKET_LONGEVITY,
  USE_CASE_WEIGHTS,
} from './reference';

export interface ScoreInputs {
  items: BuildItems;
  compatibility: CompatibilityReport;
  totalPrice: number;
  totalWatts: number;
  useCase: UseCase;
  budget?: number;
  /** Free-text preferences from the intake wizard ("quiet", "rgb", …). */
  preferences?: string[];
}

export interface BuildScore {
  total: number;
  breakdown: BuildScoreBreakdown;
  /** Human-readable notes explaining the weakest sub-scores. */
  notes: string[];
}

const clamp = (n: number, min = 0, max = 100): number => Math.min(max, Math.max(min, n));
const round = (n: number): number => Math.round(n);

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/*  Sub-scores                                                                */
/* -------------------------------------------------------------------------- */

export function performanceScore(items: BuildItems, useCase: UseCase): number {
  const weights = USE_CASE_WEIGHTS[useCase];
  let total = 0;
  for (const [category, weight] of Object.entries(weights) as Array<[keyof typeof weights, number]>) {
    const component = items[category];
    if (!component) continue; // missing → contributes 0
    total += (component.performanceScore ?? 0) * weight;
  }
  return clamp(total);
}

export function compatibilityScore(report: CompatibilityReport): number {
  const score = 100 - report.errors.length * 25 - report.warnings.length * 8;
  return clamp(score);
}

export function valueScore(performance: number, totalPrice: number): number {
  if (totalPrice <= 0 || performance <= 0) return 0;
  const perThousand = performance / (totalPrice / 1000);
  return clamp((perThousand / REFERENCES.bestPerfPerThousandDollars) * 100);
}

export function efficiencyScore(performance: number, totalWatts: number): number {
  if (performance <= 0) return 0;
  // A build that draws 0 W has nothing to judge (incomplete build).
  if (totalWatts <= 0) return 0;
  const wattsPerPoint = totalWatts / performance;
  if (wattsPerPoint <= 0) return 100;
  return clamp((REFERENCES.wattsPerPerfPoint / wattsPerPoint) * 100);
}

export function upgradabilityScore(items: BuildItems, totalWatts: number): number {
  const socket = String(items.cpu?.specs.socket ?? '');
  const socketScore = SOCKET_LONGEVITY[socket.toUpperCase()] ?? DEFAULT_SOCKET_LONGEVITY;

  const psuWatts = num(items.psu?.specs.wattage, 0);
  const required = Math.max(1, totalWatts * 1.3);
  const headroom = psuWatts > 0 ? clamp((psuWatts / required) * 100) : 0;

  const ramSlots = num(items.motherboard?.specs.ramSlots, 0);
  const usedRamSlots = num(items.ram?.specs.sticks, 0);
  const freeRam = ramSlots > 0 ? clamp(((ramSlots - usedRamSlots) / ramSlots) * 100) : 0;

  // Case expansion: the largest form factor the case accepts, mapped to how
  // much room that leaves for future cards and drives.
  const supported = items.case?.specs.formFactorSupport;
  const caseRoom = Array.isArray(supported)
    ? Math.max(...supported.map((f) => FORM_FACTOR_ROOM[String(f).toUpperCase()] ?? 50), 0)
    : items.case
      ? 50
      : 0;

  return clamp(socketScore * 0.5 + headroom * 0.2 + freeRam * 0.15 + caseRoom * 0.15);
}

/* -------------------------------------------------------------------------- */
/*  Aggregate                                                                 */
/* -------------------------------------------------------------------------- */

export function calculateBuildScore(input: ScoreInputs): BuildScore {
  const { items, compatibility, totalPrice, totalWatts, useCase } = input;

  const perf = round(performanceScore(items, useCase));
  const compat = round(compatibilityScore(compatibility));
  const value = round(valueScore(perf, totalPrice));
  const efficiency = round(efficiencyScore(perf, totalWatts));
  const upgradability = round(upgradabilityScore(items, totalWatts));

  const breakdown: BuildScoreBreakdown = {
    compatibility: compat,
    performance: perf,
    value,
    efficiency,
    upgradability,
  };

  const total = round(
    perf * SCORE_WEIGHTS.performance +
      compat * SCORE_WEIGHTS.compatibility +
      value * SCORE_WEIGHTS.value +
      efficiency * SCORE_WEIGHTS.efficiency +
      upgradability * SCORE_WEIGHTS.upgradability,
  );

  return { total: clamp(total), breakdown, notes: explain(breakdown, input) };
}

function explain(breakdown: BuildScoreBreakdown, input: ScoreInputs): string[] {
  const notes: string[] = [];
  const { items, budget, totalPrice } = input;

  if (breakdown.compatibility < 100)
    notes.push(`${input.compatibility.errors.length} compatibility error(s) cap the score.`);
  if (!items.gpu && input.useCase !== 'programming')
    notes.push('No GPU selected — performance is scored for CPU-only tasks.');
  if (breakdown.value < 50) notes.push('Performance per dollar is below the reference builds.');
  if (breakdown.upgradability < 60)
    notes.push('Limited headroom for future upgrades (socket, PSU or slots).');
  if (budget && totalPrice > budget) notes.push(`Over budget by $${Math.round(totalPrice - budget)}.`);

  return notes;
}

/** Compact "87 · strong value" label for cards. */
export function gradeBuild(total: number): { grade: 'A' | 'B' | 'C' | 'D'; label: string } {
  if (total >= 85) return { grade: 'A', label: 'Excellent' };
  if (total >= 70) return { grade: 'B', label: 'Solid' };
  if (total >= 55) return { grade: 'C', label: 'Workable' };
  return { grade: 'D', label: 'Needs work' };
}

/** Convenience wrapper when only the breakdown is needed. */
export function scoreToBreakdown(score: BuildScore): BuildScoreBreakdown {
  return score.breakdown;
}
