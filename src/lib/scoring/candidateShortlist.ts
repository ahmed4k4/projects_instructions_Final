import type { PCComponent } from '@/types/components';

const STOCK_RANK: Record<PCComponent['stockStatus'], number> = {
  in_stock: 0,
  limited: 1,
  unknown: 2,
  out_of_stock: 3,
};

/**
 * Build a price-aware shortlist for AI selection.
 *
 * A pure performance sort tends to hide the cheapest parts from each category.
 * That makes an otherwise feasible low-budget PC impossible for the model to
 * assemble. Keep a balanced mix: affordable options, high-performance options,
 * and strong performance-per-pound options, while preferring fresher stock.
 */
export function selectBudgetBalancedCandidates(
  rows: readonly PCComponent[],
  budget: number,
  limit = 12,
): PCComponent[] {
  if (!Number.isFinite(budget) || budget <= 0 || limit <= 0) return [];

  const eligible = rows.filter(
    (component) =>
      Number.isFinite(component.price) &&
      component.price > 0 &&
      component.price <= budget &&
      component.stockStatus !== 'out_of_stock',
  );
  const stock = (component: PCComponent) => STOCK_RANK[component.stockStatus] ?? 2;
  const affordable = [...eligible].sort(
    (a, b) => stock(a) - stock(b) || a.price - b.price || (b.performanceScore ?? 0) - (a.performanceScore ?? 0),
  );
  const performance = [...eligible].sort(
    (a, b) => stock(a) - stock(b) || (b.performanceScore ?? 0) - (a.performanceScore ?? 0) || a.price - b.price,
  );
  const value = [...eligible].sort((a, b) => {
    const aValue = (a.performanceScore ?? 0) / Math.max(a.price, 1);
    const bValue = (b.performanceScore ?? 0) / Math.max(b.price, 1);
    return stock(a) - stock(b) || bValue - aValue || a.price - b.price;
  });

  const selected = new Map<string, PCComponent>();
  const take = (source: readonly PCComponent[], count: number) => {
    for (const component of source) {
      if (selected.size >= limit || count <= 0) break;
      if (selected.has(component.id)) continue;
      selected.set(component.id, component);
      count -= 1;
    }
  };

  take(affordable, Math.ceil(limit * 0.5));
  take(performance, Math.ceil(limit * 0.25));
  take(value, limit - selected.size);
  take(affordable, limit - selected.size);

  return [...selected.values()];
}
