#!/usr/bin/env node
/** Stock freshness safeguards: a stale or undated observation is never current. */
import assert from 'node:assert/strict';
import { getFreshStockStatus, STOCK_STATUS_MAX_AGE_MS } from '../src/lib/stockFreshness.ts';

const now = Date.parse('2026-11-03T20:00:00.000Z');
const fresh = new Date(now - 12 * 60 * 60 * 1000).toISOString();
const stale = new Date(now - STOCK_STATUS_MAX_AGE_MS - 1).toISOString();
const future = new Date(now + 10 * 60 * 1000).toISOString();
const cases = [
  ['in_stock', fresh, 'in_stock'],
  ['limited', fresh, 'limited'],
  ['out_of_stock', fresh, 'out_of_stock'],
  ['unknown', fresh, 'unknown'],
  ['in_stock', stale, 'unknown'],
  ['limited', stale, 'unknown'],
  ['out_of_stock', stale, 'unknown'],
  ['in_stock', null, 'unknown'],
  ['in_stock', 'not-a-date', 'unknown'],
  ['in_stock', future, 'unknown'],
];
for (const [status, checkedAt, expected] of cases) {
  assert.equal(getFreshStockStatus(status, checkedAt, now), expected);
}
console.log(`PASS: ${cases.length}/${cases.length} retailer stock freshness cases`);
