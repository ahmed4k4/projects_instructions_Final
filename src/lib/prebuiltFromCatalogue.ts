import type { PCComponent } from '@/types/components';
import i18n from '@/i18n';
import type { BuildScoreBreakdown, UseCase } from '@/types/build';
import type { SampleBuild } from '@/lib/sampleData';
import { fallbackBuild } from '@/lib/scoring/fallbackBuild';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import { calculateBuildScore } from '@/lib/scoring/buildScore';
import type { CompatibilityRule } from '@/lib/compatibility/types';
import { USE_CASE_MAP } from '@/lib/constants';

/**
 * Prebuilt configurations, generated from what is actually on sale.
 *
 * These used to be three hand-written builds referencing `sampleComponents` ids.
 * They looked plausible and were wrong twice over: the parts were not the parts
 * any Egyptian retailer sells, and the totals were in the old USD-era numbers
 * (docs/AUDIT.md § 59). Worse, opening one loaded components that no longer
 * existed in the catalogue, so the builder silently emptied the slot.
 *
 * Now each configuration is a BUDGET for a use case, and the parts come from
 * `fallbackBuild` — the same deterministic engine the AI falls back to — run
 * against the live retailer catalogue. So:
 *
 *   · every part is in stock somewhere in Egypt, with a store link;
 *   · totals are real EGP prices;
 *   · the score is computed by the same engine the builder shows;
 *   · nothing is invented, and a regeneration after a re-scrape reflects it.
 *
 * The ids are deterministic (`prebuilt-<useCase>`), so links stay stable.
 */

interface PrebuiltSpec {
  id: string;
  slug: string;
  useCase: UseCase;
  budget: number;
  resolution: '1080p' | '1440p' | '4k';
  /** i18n keys under `prebuilt.configs.<id>`. */
  nameKey: string;
  descriptionKey: string;
}

/**
 * Three configurations that answer the three questions this page gets: "cheapest
 * build that games", "the balanced one", "the no-compromise one".
 */
const PREBUILT_SPECS: PrebuiltSpec[] = [
  {
    id: 'prebuilt-starter',
    slug: 'starter-1080p-gaming',
    useCase: 'gaming',
    budget: 45_000,
    resolution: '1080p',
    nameKey: 'prebuilt.configs.starter.name',
    descriptionKey: 'prebuilt.configs.starter.description',
  },
  {
    id: 'prebuilt-balanced',
    slug: 'balanced-1440p-gaming',
    useCase: 'gaming',
    budget: 95_000,
    resolution: '1440p',
    nameKey: 'prebuilt.configs.balanced.name',
    descriptionKey: 'prebuilt.configs.balanced.description',
  },
  {
    id: 'prebuilt-flagship',
    slug: 'flagship-4k-gaming',
    useCase: 'gaming',
    budget: 250_000,
    resolution: '4k',
    nameKey: 'prebuilt.configs.flagship.name',
    descriptionKey: 'prebuilt.configs.flagship.description',
  },
];

const EMPTY_BREAKDOWN: BuildScoreBreakdown = {
  compatibility: 0,
  performance: 0,
  value: 0,
  efficiency: 0,
  upgradability: 0,
};

function toBuild(
  spec: PrebuiltSpec,
  catalogue: PCComponent[],
  rules: CompatibilityRule[],
  language: 'en' | 'ar',
): SampleBuild | null {
  /**
   * Names and descriptions come from the i18n catalogue, not from a literal.
   *
   * `check-i18n` and `find-hardcoded-strings` both fail the build on user-visible
   * English in `src/`, and a configuration's title is as user-visible as a button
   * label. The language is used for the i18next instance, so a language switch
   * re-generates rather than leaving one card in the old language.
   */
  const translate = (key: string) => i18n.getFixedT(language)(key);
  const response = fallbackBuild(
    {
      budget: spec.budget,
      currency: 'EGP',
      useCase: spec.useCase,
      resolution: spec.resolution,
      notes: '',
      preferences: [],
    },
    catalogue,
  );

  const items = response.items
    .map((item) => catalogue.find((component) => component.id === item.componentId))
    .filter((component): component is PCComponent => Boolean(component));

  // An empty or partial build is not worth showing: a configuration that cannot
  // be completed from live stock would advertise a PC nobody can order.
  if (items.length < 6) return null;
  // …and neither is one with no CPU or GPU: without them the price and the power
  // figure describe a box of accessories, not a PC.
  const hasCompute =
    items.some((item) => item.category === 'cpu') && items.some((item) => item.category === 'gpu');
  if (!hasCompute) return null;

  const byCategory = Object.fromEntries(items.map((item) => [item.category, item])) as Record<
    string,
    PCComponent
  >;
  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
  /**
   * Peak draw comes from the parts that DRAW: CPU, GPU and (a little) everything
   * else. A case, PSU or cooler has no `tdp`, so summing `powerDrawWatts` over
   * every part reported "0 W" for a real build — measured on /prebuilt, where all
   * three configurations showed 0 W next to a 175,000 EGP price.
   */
  const totalWatts = items.reduce((sum, item) => sum + (item.powerDrawWatts ?? 0), 0);

  /**
   * A build whose parts carry no power figures must not claim "0 W".
   *
   * The catalogues' power values are INFERRED (`lib/specInference`): a CPU and a
   * GPU always resolve to a TDP, but a board, drive or case has none by design,
   * so a build of only those parts really is ~0 W. When CPU or GPU is missing
   * from the resolved items the figure is unknown, not zero — the card then
   * shows nothing rather than a misleading number.
   */
  const hasPowerSource = items.some(
    (item) => (item.category === 'cpu' || item.category === 'gpu') && (item.powerDrawWatts ?? 0) > 0,
  );
  const compatibility = evaluateCompatibility(byCategory, rules);
  const score = calculateBuildScore({
    items: byCategory,
    compatibility,
    totalPrice,
    totalWatts,
    useCase: spec.useCase,
  });

  return {
    id: spec.id,
    name: translate(spec.nameKey),
    slug: spec.slug,
    description: translate(spec.descriptionKey),
    useCase: USE_CASE_MAP[spec.useCase]?.label ?? spec.useCase,
    totalPrice: Math.round(totalPrice),
    totalPowerWatts: hasPowerSource ? totalWatts + Math.round(items.length * 5) : 0,
    buildScore: score.total,
    scoreBreakdown: score.breakdown ?? EMPTY_BREAKDOWN,
    isPublic: true,
    componentIds: items.map((item) => item.id),
    createdAt: new Date().toISOString(),
  };
}

/**
 * The three configurations, resolved against the current catalogue.
 *
 * Pure and cheap (three fallback runs over an in-memory array), so the page
 * memoises it rather than caching it.
 */
export function buildPrebuilts(
  catalogue: PCComponent[],
  rules: CompatibilityRule[],
  language: 'en' | 'ar',
): SampleBuild[] {
  if (catalogue.length === 0) return [];
  return PREBUILT_SPECS.map((spec) => toBuild(spec, catalogue, rules, language)).filter(
    (build): build is SampleBuild => build !== null,
  );
}

/**
 * Configurations resolve fully or not at all.
 *
 * A partial build would advertise a PC nobody can order: the page promises that
 * every part is in stock, and that promise is checked here rather than assumed.
 */
export function isBuildable(build: SampleBuild, catalogue: PCComponent[]): boolean {
  const ids = new Set(catalogue.map((component) => component.id));
  return build.componentIds.length >= 6 && build.componentIds.every((id) => ids.has(id));
}
