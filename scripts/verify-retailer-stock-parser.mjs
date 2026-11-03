#!/usr/bin/env node
/** Conservative Schema.org stock parsing regression checks. */
import assert from 'node:assert/strict';
import { parseSchemaOrgStockStatus } from '../supabase/functions/retailer-sync/parsers.ts';

const cases = [
  ['https://schema.org/InStock', 'in_stock'],
  ['InStock', 'in_stock'],
  ['https://schema.org/OnlineOnly', 'in_stock'],
  ['https://schema.org/LimitedAvailability', 'limited'],
  ['LimitedAvailability', 'limited'],
  ['https://schema.org/OutOfStock', 'out_of_stock'],
  ['SoldOut', 'out_of_stock'],
  ['Discontinued', 'out_of_stock'],
  ['PreOrder', 'unknown'],
  ['BackOrder', 'unknown'],
  ['', 'unknown'],
  [undefined, 'unknown'],
  [null, 'unknown'],
  ['schema:SomeFutureAvailabilityState', 'unknown'],
];

for (const [input, expected] of cases) {
  assert.equal(parseSchemaOrgStockStatus(input), expected, `availability ${String(input)} should map to ${expected}`);
}

console.log(`PASS: ${cases.length}/${cases.length} Schema.org stock cases mapped conservatively`);
