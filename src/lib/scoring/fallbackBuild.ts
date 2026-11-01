/**
 * Deterministic build generator — the fallback when Gemini is unavailable,
 * rate-limited, or returns component IDs that were never fetched.
 *
 * Never consults AI. Produces a valid, catalogue-sourced, platform-consistent
 * build for whatever budget it is given.
 *
 * ── Algorithm ─────────────────────────────────────────────────────────────
 * 1. Anchor the platform: pick the CPU, then the motherboard and RAM that
 *    agree with it.
 * 2. For every remaining slot, pick the best part that still leaves enough
 *    money to buy the cheapest *consistent* part for each slot after it.
 * 3. Spend any surplus upgrading the category this use case cares about most.
 */
import type { PCComponent, ComponentCategory } from '@/types/components';
import type { AIBuildRequest, AIBuildResponse } from '@/types/ai';
import type { BuildItems, CompatibilityRule } from '@/lib/compatibility/types';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { USE_CASE_MAP } from '@/lib/constants';

export const BUDGET_ALLOCATION: Record<string, Record<ComponentCategory, number>> = {
  gaming: {
    gpu: 0.42,
    cpu: 0.2,
    motherboard: 0.11,
    ram: 0.06,
    storage: 0.05,
    psu: 0.06,
    case: 0.07,
    cooling: 0.03,
  },
  ai: {
    gpu: 0.5,
    cpu: 0.15,
    motherboard: 0.08,
    ram: 0.09,
    storage: 0.06,
    psu: 0.05,
    case: 0.04,
    cooling: 0.03,
  },
  editing: {
    gpu: 0.32,
    cpu: 0.26,
    motherboard: 0.1,
    ram: 0.09,
    storage: 0.09,
    psu: 0.05,
    case: 0.05,
    cooling: 0.04,
  },
  programming: {
    gpu: 0.18,
    cpu: 0.3,
    motherboard: 0.12,
    ram: 0.12,
    storage: 0.12,
    psu: 0.06,
    case: 0.06,
    cooling: 0.04,
  },
  workstation: {
    gpu: 0.3,
    cpu: 0.28,
    motherboard: 0.1,
    ram: 0.11,
    storage: 0.09,
    psu: 0.05,
    case: 0.04,
    cooling: 0.03,
  },
  streaming: {
    gpu: 0.36,
    cpu: 0.25,
    motherboard: 0.1,
    ram: 0.08,
    storage: 0.07,
    psu: 0.06,
    case: 0.05,
    cooling: 0.03,
  },
};

const PICK_ORDER: ComponentCategory[] = [
  'cpu',
  'motherboard',
  'ram',
  'gpu',
  'storage',
  'psu',
  'case',
  'cooling',
];

/**
 * The only rules that matter while *selecting* parts. Kept local so the
 * fallback still works when the rule table cannot be fetched.
 * `compatibility_rules` remains the source of truth for the live builder.
 */
const PLATFORM_RULES: CompatibilityRule[] = [
  {
    ruleKey: 'cpu_motherboard_socket',
    categoryA: 'cpu',
    categoryB: 'motherboard',
    ruleType: 'match',
    specPathA: 'socket',
    specPathB: 'socket',
    config: {},
    message: 'Socket mismatch',
    severity: 'error',
  },
  {
    ruleKey: 'cpu_ram_type',
    categoryA: 'cpu',
    categoryB: 'ram',
    ruleType: 'match',
    specPathA: 'ramType',
    specPathB: 'type',
    config: {},
    message: 'RAM type not supported by this CPU',
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
    message: 'RAM type mismatch',
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
    message: 'Cooler mounting unsupported',
    severity: 'error',
  },
];

/** Categories that must agree with each other to form a platform. */
const PLATFORM_CATEGORIES: ComponentCategory[] = ['cpu', 'motherboard', 'ram', 'cooling'];

const purchasable = (catalogue: PCComponent[], category: ComponentCategory): PCComponent[] =>
  catalogue
    .filter((c) => c.category === category && c.stockStatus !== 'out_of_stock')
    .sort((a, b) => a.price - b.price);

/**
 * Does `candidate` fit the platform already in `items`?
 * Only rules whose opposite side is present are judged — a CPU cannot be
 * failed for a RAM type before any RAM has been chosen.
 */
function fitsPlatform(category: ComponentCategory, candidate: PCComponent, items: BuildItems): boolean {
  const probe: BuildItems = { ...items, [category]: candidate };
  const rules = PLATFORM_RULES.filter(
    (r) =>
      (r.categoryA === category && probe[r.categoryB]) || (r.categoryB === category && probe[r.categoryA]),
  );
  return rules.length === 0 || evaluateCompatibility(probe, rules).errors.length === 0;
}

/**
 * Cheapest complete, platform-consistent way to fill `categories` given `base`.
 * Returns `Infinity` when no consistent completion exists.
 */
function cheapestCompletion(
  categories: ComponentCategory[],
  base: BuildItems,
  catalogue: PCComponent[],
): number {
  const probe: BuildItems = { ...base };
  let total = 0;

  for (const category of PICK_ORDER.filter((c) => categories.includes(c))) {
    if (probe[category]) continue;

    const options = purchasable(catalogue, category);
    const candidate = PLATFORM_CATEGORIES.includes(category)
      ? options.find((option) => fitsPlatform(category, option, probe))
      : options[0];

    if (!candidate) return Number.POSITIVE_INFINITY;
    probe[category] = candidate;
    total += candidate.price;
  }

  return total;
}

/** Best value pick for a slot that still fits the platform and a price cap. */
function pickBest(
  category: ComponentCategory,
  catalogue: PCComponent[],
  cap: number,
  items: BuildItems,
): PCComponent | null {
  const options = purchasable(catalogue, category);
  const fitting = options.filter((c) => c.price <= cap);

  const byPerformance = (list: PCComponent[]) =>
    [...list].sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0) || a.price - b.price);

  // 1. Best compatible part within the cap.
  const compatibleFitting = byPerformance(fitting.filter((c) => fitsPlatform(category, c, items)));
  if (compatibleFitting[0]) return compatibleFitting[0];

  // 2. Cheapest compatible part, even above the cap (the caller re-checks).
  const compatibleAny = options.filter((c) => fitsPlatform(category, c, items));
  if (compatibleAny[0]) return compatibleAny[0];

  // 3. Nothing compatible exists — cheapest available, so the build is at least complete.
  return options[0] ?? null;
}

function reasonFor(component: PCComponent, useCase: string): string {
  const perf = component.performanceScore ?? 0;
  switch (component.category) {
    case 'cpu':
      return `Best ${component.brand} CPU in budget for ${useCase}; ${perf}/100 performance score.`;
    case 'gpu':
      return `Highest-performing GPU that fits the ${useCase} allocation (${perf}/100).`;
    case 'motherboard':
      return `${component.specs.chipset ?? 'Chipset'} board matching the CPU socket, with expansion headroom.`;
    case 'ram':
      return `${component.specs.capacity ?? ''} GB ${component.specs.type ?? ''} kit matching the platform's memory type.`;
    case 'storage':
      return `${component.specs.capacity ?? ''} GB NVMe for fast boots and scratch space.`;
    case 'psu':
      return `${component.specs.wattage ?? ''} W unit with headroom for transient spikes.`;
    case 'case':
      return 'Case with the airflow and GPU clearance this build needs.';
    case 'cooling':
      return "Cooler rated above the CPU's TDP to hold boost clocks.";
    default:
      return 'Balanced pick for this budget.';
  }
}

/**
 * Produce a complete build without any AI involvement.
 * Deterministic: the same catalogue + request always yields the same build.
 */
export function fallbackBuild(
  req: AIBuildRequest,
  catalogue: PCComponent[],
  degradedReason?: string,
): AIBuildResponse {
  const allocation = BUDGET_ALLOCATION[req.useCase] ?? BUDGET_ALLOCATION.gaming!;
  const items: BuildItems = {};

  const spent = () => Object.values(items).reduce<number>((sum, c) => sum + (c?.price ?? 0), 0);

  // ── Pass 1: fill every slot, each time reserving a consistent completion ──
  for (const category of PICK_ORDER) {
    const remaining = req.budget - spent();
    if (remaining <= 0) break;

    // Reserve the cheapest consistent completion of everything still to come,
    // *including this slot's own platform peers*. `reserve` is exclusive of the
    // current slot, so the cap is simply what remains after reserving it.
    const upcoming = PICK_ORDER.slice(PICK_ORDER.indexOf(category) + 1);
    const reserve = cheapestCompletion(upcoming, items, catalogue);
    if (!Number.isFinite(reserve)) continue;

    const cap = Math.max(0, remaining - reserve);
    const pick = pickBest(category, catalogue, cap, items);

    // A build without a CPU or motherboard is not a build. If the reserve
    // pushed the cap below every option, take the cheapest one that still fits
    // what is actually left and let the later slots fall back to minimums.
    const mandatory = category === 'cpu' || category === 'motherboard';
    if (!pick || pick.price > cap) {
      if (!mandatory) continue;
      const affordable = purchasable(catalogue, category).find(
        (option) => option.price <= remaining && fitsPlatform(category, option, items),
      );
      if (!affordable || affordable.price > remaining) continue;
      items[category] = affordable;
      continue;
    }

    items[category] = pick;
  }

  // ── Pass 2: fill any slot the reserve forced out ──────────────────────────
  // Pass 1 may leave a category empty when its reserve was unaffordable. Now
  // that the platform is fixed, buy what the remaining money allows, cheapest
  // first, so the build is complete whenever the catalogue permits it.
  for (const category of PICK_ORDER) {
    if (items[category]) continue;
    const remaining = req.budget - spent();
    if (remaining <= 0) break;

    const options = purchasable(catalogue, category).filter((c) => c.price <= remaining);
    const compatible = options.filter((c) => fitsPlatform(category, c, items));
    const candidate = compatible[0] ?? options[0];
    if (!candidate) continue;
    items[category] = candidate;
  }

  // ── Pass 3: spend the surplus on what this use case cares about ───────────
  const priority = (Object.entries(allocation) as Array<[ComponentCategory, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);

  for (const category of priority) {
    const current = items[category];
    if (!current) continue;

    const headroom = req.budget - spent() + current.price;
    const better = pickBest(category, catalogue, headroom, items);
    if (!better || better.id === current.id || better.price <= current.price) continue;
    if (spent() - current.price + better.price > req.budget) continue;

    items[category] = better;
  }

  const chosen = Object.values(items).filter((c): c is PCComponent => Boolean(c));
  const useCaseLabel = USE_CASE_MAP[req.useCase]?.label ?? req.useCase;

  return {
    buildName: `${useCaseLabel} ${req.resolution ?? 'All-round'} Build`,
    items: chosen.map((c) => ({
      category: c.category,
      componentId: c.id,
      reason: reasonFor(c, useCaseLabel.toLowerCase()),
    })),
    totalPrice: Math.round(chosen.reduce((sum, c) => sum + c.price, 0)),
    explanation: `Rule-based selection for a ${useCaseLabel.toLowerCase()} system: the platform (CPU, board, memory) is fixed first, then every remaining slot is filled while reserving enough money to complete the build.`,
    source: 'fallback',
    degradedReason,
  };
}

/** Notice shown in the UI when a fallback build was used. */
export function fallbackNotice(reason?: string): string {
  return reason
    ? `AI temporarily unavailable — showing a rule-based build (${reason}).`
    : 'AI temporarily unavailable — showing a rule-based build.';
}
