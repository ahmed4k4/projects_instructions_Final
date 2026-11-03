#!/usr/bin/env node
import assert from 'node:assert/strict';
import { selectBudgetBalancedCandidates } from '../src/lib/scoring/candidateShortlist.ts';

const component = (id, price, performanceScore, stockStatus = 'in_stock') => ({
  id, price, performanceScore, stockStatus,
});
const rows = [
  component('budget-1', 1_500, 20),
  component('budget-2', 2_000, 25),
  component('budget-3', 2_500, 30),
  component('mid-1', 5_000, 60),
  component('mid-2', 6_000, 65),
  component('high-1', 18_000, 98),
  component('high-2', 19_000, 99),
  component('limited-cheap', 1_200, 15, 'limited'),
  component('unknown-cheap', 1_100, 12, 'unknown'),
  component('sold-out', 500, 100, 'out_of_stock'),
  component('over-budget', 20_001, 100),
];

const selected = selectBudgetBalancedCandidates(rows, 20_000, 8);
const ids = selected.map((item) => item.id);
assert.ok(ids.includes('budget-1'), 'shortlist must retain affordable choices');
assert.ok(ids.includes('high-2'), 'shortlist must retain strong performance choices');
assert.ok(ids.includes('limited-cheap'), 'limited stock remains eligible after in-stock choices');
assert.ok(!ids.includes('sold-out'), 'confirmed sold-out rows must be excluded');
assert.ok(!ids.includes('over-budget'), 'individual prices above the whole budget must be excluded');
assert.ok(selected.length <= 8, 'shortlist must stay bounded');
assert.deepEqual(selectBudgetBalancedCandidates(rows, 0, 8), []);
console.log('PASS: budget-balanced AI shortlist (8 checks)');
