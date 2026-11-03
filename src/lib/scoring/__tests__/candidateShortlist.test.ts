import { describe, expect, it } from 'vitest';
import type { PCComponent } from '@/types/components';
import { selectBudgetBalancedCandidates } from '../candidateShortlist';

function component(id: string, price: number, performanceScore: number): PCComponent {
  return {
    id, category: 'cpu', name: id, brand: 'Test', price, currency: 'EGP',
    performanceScore, stockStatus: 'in_stock', specs: {}, powerDrawWatts: 65,
  } as PCComponent;
}

describe('selectBudgetBalancedCandidates', () => {
  it('keeps affordable parts visible beside the highest-performance options', () => {
    const rows = [
      component('cheap-1', 1_500, 20),
      component('cheap-2', 2_000, 25),
      component('cheap-3', 2_500, 30),
      component('mid-1', 5_000, 60),
      component('mid-2', 6_000, 65),
      component('high-1', 18_000, 98),
      component('high-2', 19_000, 99),
      component('oos', 500, 100),
      component('over-budget', 20_001, 100),
    ];
    const selected = selectBudgetBalancedCandidates(rows, 20_000, 6);
    const ids = selected.map((row) => row.id);
    expect(ids).toContain('cheap-1');
    expect(ids).toContain('cheap-2');
    expect(ids).toContain('high-2');
    expect(ids).not.toContain('oos');
    expect(ids).not.toContain('over-budget');
    expect(selected).toHaveLength(6);
  });

  it('returns an empty shortlist for an invalid budget', () => {
    expect(selectBudgetBalancedCandidates([], 0)).toEqual([]);
  });
});
