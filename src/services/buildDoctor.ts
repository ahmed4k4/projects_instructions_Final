/**
 * Build Doctor + Upgrade Advisor.
 *
 * Deterministic work happens first — this module finds the upgrades that
 * actually raise the score, priced against the real catalogue. Gemini then
 * interprets that grounded snapshot (and may re-rank within the candidates it
 * is given). If the AI is unavailable the deterministic result still ships with
 * a locally written summary.
 */
import type { BuildDoctorReport, DoctorUpgrade } from '@/types/ai';
import type { PCComponent, ComponentCategory } from '@/types/components';
import type { BuildItems, CompatibilityRule } from '@/lib/compatibility/types';
import type { UseCase } from '@/types/build';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { calculateBuildScore } from '@/lib/scoring/buildScore';
import type { BuildScore } from '@/lib/scoring/buildScore';
import { geminiClient } from './geminiService';
import { getCompatibilityRules } from './componentsService';
import {
  DOCTOR_RESPONSE_SCHEMA,
  doctorSystemInstruction,
  doctorUserPrompt,
  type DoctorInput,
} from './prompts/buildDoctor';

export interface DoctorBuild {
  name: string;
  useCase: UseCase;
  items: BuildItems;
  budget?: number;
  rules: CompatibilityRule[];
}

export interface BuildHealth {
  score: BuildScore;
  compatibility: ReturnType<typeof evaluateCompatibility>;
  totalPrice: number;
  totalWatts: number;
}

/** Deterministic health snapshot used by the builder panel and the doctor. */
export function analyseBuildHealth(build: {
  items: BuildItems;
  useCase: UseCase;
  rules: CompatibilityRule[];
}): BuildHealth {
  const components = Object.values(build.items).filter((c): c is PCComponent => Boolean(c));
  const totalPrice = components.reduce((sum, c) => sum + c.price, 0);
  const totalWatts = components.reduce((sum, c) => sum + (c.powerDrawWatts ?? 0), 0);
  const compatibility = evaluateCompatibility(build.items, build.rules);
  const score = calculateBuildScore({
    items: build.items,
    compatibility,
    totalPrice,
    totalWatts,
    useCase: build.useCase,
  });
  return { score, compatibility, totalPrice, totalWatts };
}

/* -------------------------------------------------------------------------- */
/*  Deterministic upgrade search                                              */
/* -------------------------------------------------------------------------- */

export interface UpgradeCandidate {
  category: ComponentCategory;
  fromComponentId: string | null;
  toComponentId: string;
  component: PCComponent;
  scoreDelta: number;
  priceDelta: number;
  /** Score gain per EGP — the ranking key. */
  efficiency: number;
}

interface SearchOptions {
  items: BuildItems;
  useCase: UseCase;
  rules: CompatibilityRule[];
  catalogue: PCComponent[];
  /** Only consider parts that keep the build inside this budget. */
  budget?: number;
  limit?: number;
}

/**
 * Try every catalogue part in every category and keep the ones that raise the
 * score. Deterministic and exhaustive over a 32-part catalogue, so it is cheap.
 */
export function findUpgrades(options: SearchOptions): UpgradeCandidate[] {
  const { items, useCase, rules, catalogue, budget, limit = 3 } = options;
  const base = analyseBuildHealth({ items, useCase, rules });
  const candidates: UpgradeCandidate[] = [];

  for (const replacement of catalogue) {
    const current = items[replacement.category];
    if (current?.id === replacement.id) continue;
    if (replacement.stockStatus === 'out_of_stock') continue;

    const nextItems: BuildItems = { ...items, [replacement.category]: replacement };
    const nextPrice = Object.values(nextItems).reduce((sum, c) => sum + (c?.price ?? 0), 0);
    const priceDelta = nextPrice - base.totalPrice;

    if (budget !== undefined && nextPrice > budget) continue;

    const next = analyseBuildHealth({ items: nextItems, useCase, rules });
    const scoreDelta = next.score.total - base.score.total;
    if (scoreDelta <= 0) continue;

    candidates.push({
      category: replacement.category,
      fromComponentId: current?.id ?? null,
      toComponentId: replacement.id,
      component: replacement,
      scoreDelta,
      priceDelta,
      efficiency: priceDelta <= 0 ? Number.POSITIVE_INFINITY : scoreDelta / priceDelta,
    });
  }

  candidates.sort((a, b) => b.efficiency - a.efficiency || b.scoreDelta - a.scoreDelta);

  // At most one suggestion per category, otherwise three GPU swaps look silly.
  const perCategory = new Set<ComponentCategory>();
  const picked: UpgradeCandidate[] = [];
  for (const candidate of candidates) {
    if (perCategory.has(candidate.category)) continue;
    perCategory.add(candidate.category);
    picked.push(candidate);
    if (picked.length >= limit) break;
  }
  return picked;
}

/* -------------------------------------------------------------------------- */
/*  Doctor (AI-interpreted)                                                   */
/* -------------------------------------------------------------------------- */

export async function runBuildDoctor(
  build: DoctorBuild,
  catalogue: PCComponent[],
  options: { signal?: AbortSignal } = {},
): Promise<BuildDoctorReport> {
  const health = analyseBuildHealth(build);
  const upgrades = findUpgrades({
    items: build.items,
    useCase: build.useCase,
    rules: build.rules,
    catalogue,
    budget: build.budget,
  });

  const input: DoctorInput = {
    buildName: build.name,
    useCase: build.useCase,
    totalPrice: health.totalPrice,
    totalWatts: health.totalWatts,
    budget: build.budget,
    score: {
      total: health.score.total,
      breakdown: health.score.breakdown,
    },
    compatibility: {
      errors: health.compatibility.errors.map((e) => e.message),
      warnings: health.compatibility.warnings
        .filter((w) => !w.ruleKey.startsWith('missing_'))
        .map((w) => w.message),
    },
    parts: Object.values(build.items)
      .filter((c): c is PCComponent => Boolean(c))
      .map((c) => ({
        id: c.id,
        category: c.category,
        name: c.name,
        price: c.price,
        perf: c.performanceScore,
      })),
    candidates: upgrades.map((u) => ({
      id: u.toComponentId,
      category: u.category,
      name: u.component.name,
      price: u.component.price,
      perf: u.component.performanceScore,
    })),
  };

  try {
    const report = await geminiClient.structured<BuildDoctorReport>(
      [{ role: 'user', parts: [{ text: doctorUserPrompt(input) }] }],
      DOCTOR_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      {
        model: 'quality',
        systemInstruction: doctorSystemInstruction(),
        temperature: 0.4,
        signal: options.signal,
      },
    );

    return sanitiseReport(report, upgrades);
  } catch {
    return localReport(build, health, upgrades);
  }
}

/** Drop upgrade rows whose IDs the model invented, and clamp deltas. */
function sanitiseReport(report: BuildDoctorReport, allowed: UpgradeCandidate[]): BuildDoctorReport {
  const allowedIds = new Map(allowed.map((u) => [u.toComponentId, u]));

  const upgrades: DoctorUpgrade[] = (report.upgrades ?? [])
    .filter((u) => allowedIds.has(u.toComponentId))
    .map((u) => ({
      category: u.category,
      fromComponentId: u.fromComponentId ?? allowedIds.get(u.toComponentId)?.fromComponentId ?? null,
      toComponentId: u.toComponentId,
      expectedScoreDelta: allowedIds.get(u.toComponentId)?.scoreDelta ?? 0,
      reason: u.reason,
    }));

  return {
    summary: report.summary || 'Review complete.',
    strengths: (report.strengths ?? []).slice(0, 5),
    weaknesses: (report.weaknesses ?? []).slice(0, 5),
    verdict: report.verdict ?? 'good',
    upgrades,
  };
}

/** Deterministic report when Gemini is unavailable. */
function localReport(
  build: DoctorBuild,
  health: BuildHealth,
  upgrades: UpgradeCandidate[],
): BuildDoctorReport {
  const { breakdown } = health.score;
  const weaknesses: string[] = [];
  const strengths: string[] = [];

  if (health.compatibility.errors.length)
    weaknesses.push(...health.compatibility.errors.map((e) => e.message));
  if (breakdown.value < 60) weaknesses.push('Performance per EGP is below the reference builds.');
  if (breakdown.efficiency < 60)
    weaknesses.push('The build draws more power than its performance justifies.');
  if (breakdown.upgradability < 60) weaknesses.push('Limited upgrade headroom (socket, PSU or slots).');
  if (health.totalWatts > 0 && !build.items.psu) weaknesses.push('No PSU selected.');

  if (breakdown.performance >= 80) strengths.push('Strong component performance for this workload.');
  if (breakdown.compatibility === 100) strengths.push('No compatibility conflicts.');
  if (breakdown.value >= 70) strengths.push('Good value for the money.');

  const verdict: BuildDoctorReport['verdict'] =
    health.score.total >= 85 && health.compatibility.errors.length === 0
      ? 'excellent'
      : health.score.total >= 70
        ? 'good'
        : health.score.total >= 50
          ? 'needs_work'
          : 'rebuild';

  return {
    summary: `Scored ${health.score.total}/100 with ${health.compatibility.errors.length} error(s) and ${health.compatibility.warnings.length} warning(s). This report was produced by the deterministic analyser (the AI reviewer was unavailable).`,
    strengths: strengths.length ? strengths : ['Components are internally consistent.'],
    weaknesses: weaknesses.length ? weaknesses : ['No major weaknesses found.'],
    verdict,
    upgrades: upgrades.map((u) => ({
      category: u.category,
      fromComponentId: u.fromComponentId,
      toComponentId: u.toComponentId,
      expectedScoreDelta: u.scoreDelta,
      reason: `Swap to ${u.component.name} for +${u.scoreDelta} points${u.priceDelta >= 0 ? ` (+EGP ${Math.round(u.priceDelta).toLocaleString('en-EG')})` : ` (-EGP ${Math.round(Math.abs(u.priceDelta)).toLocaleString('en-EG')})`}.`,
    })),
  };
}

/** Deterministic-only upgrade list (no AI), used by the dashboard cards. */
export async function suggestUpgrades(
  items: BuildItems,
  useCase: UseCase,
  catalogue: PCComponent[],
  budget?: number,
): Promise<UpgradeCandidate[]> {
  const rules = await loadRules();
  return findUpgrades({ items, useCase, rules, catalogue, budget });
}

async function loadRules(): Promise<CompatibilityRule[]> {
  try {
    const rows = await getCompatibilityRules();
    return rows.map((r) => ({
      ruleKey: r.rule_key,
      categoryA: r.category_a,
      categoryB: r.category_b,
      ruleType: r.rule_type,
      specPathA: r.spec_path_a,
      specPathB: r.spec_path_b,
      config: r.config as Record<string, unknown>,
      message: r.message,
      severity: r.severity,
    }));
  } catch {
    return [];
  }
}
