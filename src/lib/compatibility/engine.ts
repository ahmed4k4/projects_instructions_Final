/**
 * Deterministic compatibility engine.
 *
 * Pure function: given the selected components and the rule set loaded from
 * Postgres, it returns the same report every time. No I/O, no clock, no
 * randomness — which is what makes it unit-testable and safe to run on every
 * keystroke in the builder.
 *
 * Rules are data, not code: `compatibility_rules` rows map two categories and
 * two spec paths to a comparison. Adding a rule is a DB insert (see
 * docs/COMPATIBILITY_RULES.md); adding a *new kind* of comparison is a handler.
 */
import type { PCComponent } from '@/types/components';
import { getCustomHandler } from './handlers';
import { ESSENTIAL_CATEGORIES } from './types';
import type {
  BuildItems,
  CompatibilityIssue,
  CompatibilityReport,
  CompatibilityRule,
  RuleContext,
  Severity,
} from './types';

/** Read a dotted path such as `socket` or `specs.socket` from a component. */
export function readSpecPath(component: PCComponent, path: string): unknown {
  const segments = path.split('.').filter(Boolean);
  // Bare keys resolve against `specs` first (that is where technical data lives).
  let current: unknown = component.specs;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  if (current !== undefined) return current;

  // Fall back to a top-level field (e.g. `powerDrawWatts`).
  let top: unknown = component;
  for (const segment of segments) {
    if (top === null || typeof top !== 'object') return undefined;
    top = (top as Record<string, unknown>)[segment];
  }
  return top;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

/** Case/space-insensitive comparison for sockets, form factors, RAM types. */
export function normaliseKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Total peak draw of the selected components. */
export function totalPowerWatts(items: BuildItems): number {
  return Object.values(items).reduce<number>((sum, c) => sum + (c?.powerDrawWatts ?? 0), 0);
}

function isAirCooler(component: PCComponent): boolean {
  return normaliseKey(component.specs.type) === 'air';
}

/** `appliesWhen: { type: 'Air' }` — the rule only applies to matching coolers. */
function appliesWhenMatches(a: PCComponent, b: PCComponent, config: Record<string, unknown>): boolean {
  const condition = config.appliesWhen as Record<string, unknown> | undefined;
  const target = condition?.type;
  if (!target) return true;
  const wanted = normaliseKey(target);
  // Without an air cooler on either side there is nothing to constrain.
  if (!isAirCooler(a) && !isAirCooler(b)) return false;
  return normaliseKey(a.specs.type) === wanted || normaliseKey(b.specs.type) === wanted;
}

/**
 * Evaluate every rule against the current selection.
 *
 * Missing components are skipped, never flagged — a half-built list is a valid
 * intermediate state and must not read as "incompatible".
 */
export function evaluateCompatibility(items: BuildItems, rules: CompatibilityRule[]): CompatibilityReport {
  const errors: CompatibilityIssue[] = [];
  const warnings: CompatibilityIssue[] = [];
  const ctx: RuleContext = { items, totalWatts: totalPowerWatts(items) };

  // A build cannot boot without these. Reported as warnings so the builder can
  // show "3 parts missing" instead of a misleading green "compatible".
  for (const category of ESSENTIAL_CATEGORIES) {
    if (!items[category]) {
      warnings.push({
        severity: 'warning',
        ruleKey: `missing_${category}`,
        message: `No ${category} selected yet.`,
        categoryA: category,
      });
    }
  }

  let checkedRules = 0;
  let skippedRules = 0;

  for (const rule of rules) {
    const a = items[rule.categoryA];
    const b = items[rule.categoryB];

    if (!a || !b) {
      skippedRules += 1;
      continue;
    }

    // Same component selected for both sides (defensive; shouldn't happen).
    if (a.id === b.id) {
      skippedRules += 1;
      continue;
    }

    if (!appliesWhenMatches(a, b, rule.config)) {
      skippedRules += 1;
      continue;
    }

    const outcome = evaluateRule(rule, a, b, ctx);
    if (outcome === null) {
      skippedRules += 1;
      continue;
    }

    checkedRules += 1;
    if (outcome.pass) continue;

    const issue: CompatibilityIssue = {
      severity: rule.severity,
      ruleKey: rule.ruleKey,
      message: outcome.detail ? `${rule.message} (${outcome.detail})` : rule.message,
      componentAId: a.id,
      componentBId: b.id,
      categoryA: rule.categoryA,
      categoryB: rule.categoryB,
    };
    (rule.severity === 'error' ? errors : warnings).push(issue);
  }

  return {
    isCompatible: errors.length === 0,
    errors,
    warnings,
    checkedRules,
    skippedRules,
  };
}

interface RuleOutcome {
  pass: boolean;
  detail?: string;
}

function evaluateRule(
  rule: CompatibilityRule,
  a: PCComponent,
  b: PCComponent,
  ctx: RuleContext,
): RuleOutcome | null {
  const valueA = readSpecPath(a, rule.specPathA);
  const valueB = readSpecPath(b, rule.specPathB);

  switch (rule.ruleType) {
    case 'match':
      return evaluateMatch(valueA, valueB);

    case 'formfactor': {
      const supported = toArray(valueA).map(normaliseKey);
      const actual = normaliseKey(valueB);
      if (supported.length === 0 || !actual) return null;
      return { pass: supported.includes(actual) };
    }

    case 'min': {
      const left = asNumber(valueA);
      const right = asNumber(valueB);
      if (left === null || right === null) return null;
      const headroom = asNumber(rule.config.headroomPercent) ?? 0;
      return { pass: left >= Math.ceil(right * (1 + headroom / 100)) };
    }

    case 'max': {
      // e.g. ram.capacity × sticks  <=  motherboard.maxRam
      const left = asNumber(valueA);
      const right = asNumber(valueB);
      if (left === null || right === null) return null;
      const multiplier = rule.config.multiplier === 'sticks' ? (asNumber(a.specs.sticks) ?? 1) : 1;
      return { pass: left * multiplier <= right };
    }

    case 'custom': {
      const handler = getCustomHandler(rule.ruleKey);
      if (!handler) return null;
      return handler(a, b, rule.config, ctx);
    }

    default:
      return null;
  }
}

/**
 * `match` covers three shapes:
 *   scalar === scalar      cpu.socket vs motherboard.socket
 *   member of array        cpu.socket ∈ cooling.socketSupport
 *   array ∩ array          not used today, kept for extensibility
 */
function evaluateMatch(valueA: unknown, valueB: unknown): RuleOutcome | null {
  if (Array.isArray(valueA) && valueA.length > 0) {
    const target = normaliseKey(valueB);
    if (!target) return null;
    return { pass: valueA.map(normaliseKey).includes(target) };
  }

  if (Array.isArray(valueB) && valueB.length > 0) {
    const target = normaliseKey(valueA);
    if (!target) return null;
    return { pass: valueB.map(normaliseKey).includes(target) };
  }

  const left = asString(valueA);
  const right = asString(valueB);
  if (left === null || right === null) return null;
  return { pass: normaliseKey(left) === normaliseKey(right) };
}

export function countBySeverity(report: CompatibilityReport, severity: Severity): number {
  return severity === 'error' ? report.errors.length : report.warnings.length;
}

/** Short human summary used by the builder banner. */
export function summariseCompatibility(report: CompatibilityReport): string {
  const { errors, warnings } = report;
  if (errors.length === 0 && warnings.length === 0) return 'All compatible';
  const parts: string[] = [];
  if (errors.length) parts.push(`${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`);
  if (warnings.length) parts.push(`${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`);
  return parts.join(' · ');
}
