/**
 * Tool executor for the AI agents.
 *
 * Every tool the model can call lands here. Reads go to the real Egyptian
 * catalogue (see `hooks/useComponents` / `lib/retailerCatalogue`), and every
 * judgement (compatibility, score) is delegated to the deterministic engines —
 * the model never computes a number itself.
 *
 * The executor also keeps a per-run catalogue of everything it has shown the
 * model, so `validateFinalBuild` can prove no component ID was invented and that
 * every recommended part is one a shopper can actually buy.
 */
import type { ComponentCategory, PCComponent } from '@/types/components';
import type { ToolCall, ToolTraceEntry } from '@/types/ai';
import { evaluateCompatibility } from '@/lib/compatibility/engine';
import type { BuildItems, CompatibilityRule } from '@/lib/compatibility/types';
import { calculateBuildScore } from '@/lib/scoring/buildScore';
import type { UseCase } from '@/types/build';
import { loadCatalogueForAI } from '@/hooks/useComponents';
import { getCompatibilityRules } from './componentsService';

const CATEGORIES: ComponentCategory[] = [
  'cpu',
  'gpu',
  'motherboard',
  'ram',
  'storage',
  'psu',
  'case',
  'cooling',
];

/** Compact projection sent to the model — keeps the context small. */
export interface CompactComponent {
  id: string;
  category: ComponentCategory;
  brand: string;
  model: string;
  price: number;
  perf: number | null;
  watts: number | null;
  specs: Record<string, unknown>;
}

function compact(c: PCComponent): CompactComponent {
  return {
    id: c.id,
    category: c.category,
    brand: c.brand,
    model: c.model,
    price: c.price,
    perf: c.performanceScore,
    watts: c.powerDrawWatts,
    specs: c.specs,
  };
}

export class ToolExecutor {
  /** Every component the model has been allowed to see during this run. */
  private readonly seen = new Map<string, PCComponent>();
  private rulesCache: CompatibilityRule[] | null = null;
  private readonly catalogueCache = new Map<string, PCComponent[]>();

  readonly trace: ToolTraceEntry[] = [];

  /** Load (once) the catalogue and rules used by this run. */
  private async catalogue(category?: ComponentCategory): Promise<PCComponent[]> {
    const key = category ?? 'all';
    const cached = this.catalogueCache.get(key);
    if (cached) return cached;
    let rows: PCComponent[];
    try {
      rows = await loadCatalogueForAI(category);
    } catch {
      rows = [];
    }
    this.catalogueCache.set(key, rows);
    for (const row of rows) this.seen.set(row.id, row);
    return rows;
  }

  private async rules(): Promise<CompatibilityRule[]> {
    if (this.rulesCache) return this.rulesCache;
    try {
      const rows = await getCompatibilityRules();
      this.rulesCache = rows.map((r) => ({
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
      this.rulesCache = [];
    }
    return this.rulesCache;
  }

  /** Resolve IDs to components from the memoised catalogue. */
  async resolve(ids: string[]): Promise<PCComponent[]> {
    const unresolved = ids.filter((id) => !this.seen.has(id));
    const catalogue = unresolved.length ? await this.catalogue() : [];
    return ids
      .map((id) => this.seen.get(id) ?? catalogue.find((c) => c.id === id))
      .filter((c): c is PCComponent => Boolean(c));
  }

  toItems(components: PCComponent[]): BuildItems {
    const items: BuildItems = {};
    for (const c of components) items[c.category] = c;
    return items;
  }

  /** True when the ID was exposed to the model through a tool result. */
  hasSeen(id: string): boolean {
    return this.seen.has(id);
  }

  /**
   * Register components the caller already supplied in the prompt context
   * (e.g. the advisor's loaded build) so citations to them are legitimate.
   */
  register(components: PCComponent[]): void {
    for (const component of components) this.seen.set(component.id, component);
  }

  async run(call: ToolCall): Promise<{ result: Record<string, unknown>; summary: string }> {
    const args = call.args as Record<string, unknown>;
    let result: Record<string, unknown>;
    let summary: string;

    switch (call.name) {
      case 'list_components': {
        const category = String(args.category ?? '') as ComponentCategory;
        if (!CATEGORIES.includes(category)) {
          throw new Error(`Unknown category "${args.category}".`);
        }
        const max = typeof args.budgetMax === 'number' ? args.budgetMax : null;
        const minPerf = typeof args.minPerfScore === 'number' ? args.minPerfScore : null;

        const rows = (await this.catalogue(category))
          .filter((c) => (max === null ? true : c.price <= max))
          .filter((c) => (minPerf === null ? true : (c.performanceScore ?? 0) >= minPerf))
          .sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0))
          .slice(0, 12)
          .map(compact);

        result = { category, count: rows.length, components: rows };
        summary = `Found ${rows.length} ${category.toUpperCase()} option(s)`;
        break;
      }

      case 'get_component_details': {
        const id = String(args.id ?? '');
        const component = this.seen.get(id) ?? (await this.catalogue()).find((c) => c.id === id) ?? null;
        if (!component) throw new Error(`No component with id "${id}".`);
        this.seen.set(component.id, component);
        result = { component: compact(component) };
        summary = `Inspected ${component.name}`;
        break;
      }

      case 'check_compatibility': {
        const ids = Array.isArray(args.componentIds) ? args.componentIds.map(String) : [];
        const components = await this.resolve(ids);
        const report = evaluateCompatibility(this.toItems(components), await this.rules());
        result = {
          isCompatible: report.isCompatible,
          errors: report.errors.map((e) => ({ rule: e.ruleKey, message: e.message })),
          warnings: report.warnings.map((w) => ({ rule: w.ruleKey, message: w.message })),
          checkedRules: report.checkedRules,
        };
        summary = report.isCompatible
          ? `Compatible (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})`
          : `${report.errors.length} compatibility error(s)`;
        break;
      }

      case 'get_build_score': {
        const ids = Array.isArray(args.componentIds) ? args.componentIds.map(String) : [];
        const useCase = (String(args.useCase ?? 'gaming') as UseCase) || 'gaming';
        const components = await this.resolve(ids);
        const items = this.toItems(components);
        const report = evaluateCompatibility(items, await this.rules());
        const totalPrice = components.reduce((sum, c) => sum + c.price, 0);
        const totalWatts = components.reduce((sum, c) => sum + (c.powerDrawWatts ?? 0), 0);
        const score = calculateBuildScore({ items, compatibility: report, totalPrice, totalWatts, useCase });
        result = {
          total: score.total,
          breakdown: score.breakdown,
          totalPrice,
          totalWatts,
          compatible: report.isCompatible,
          notes: score.notes,
        };
        summary = `Score ${score.total}/100 · EGP ${totalPrice.toLocaleString('en-US')} · ${totalWatts} W`;
        break;
      }

      case 'suggest_alternatives': {
        const id = String(args.componentId ?? '');
        const budget = typeof args.budget === 'number' ? args.budget : null;
        const current = await this.resolve([id]).then((c) => c[0]);
        if (!current) throw new Error(`No component with id "${id}".`);
        const alternatives = (await this.catalogue(current.category))
          .filter((c) => c.id !== current.id)
          .filter((c) => (budget === null ? true : c.price <= budget))
          .sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0))
          .slice(0, 3)
          .map(compact);
        result = { current: compact(current), alternatives };
        summary = `Found ${alternatives.length} alternative(s)`;
        break;
      }

      case 'get_build': {
        // The agent passes a pre-computed build snapshot from the page; the
        // tool exists so the model can "read" it as a tool result.
        result = { build: args.build ?? null };
        summary = 'Read the current build';
        break;
      }

      case 'finalize_build':
        // Handled by the agent loop — not executed here.
        return { result: {}, summary: 'Finalising build' };

      default:
        throw new Error(`Unknown tool "${call.name}".`);
    }

    this.trace.push({ name: call.name, args, ok: true, summary });
    return { result, summary };
  }
}

/**
 * Post-validation: every ID in the final build must have come from a tool call.
 * Returns the offending IDs (empty when the build is clean).
 */
export function validateFinalBuild(
  items: Array<{ category: string; componentId: string }>,
  executor: ToolExecutor,
): string[] {
  return items.map((i) => i.componentId).filter((id) => !executor.hasSeen(id));
}
