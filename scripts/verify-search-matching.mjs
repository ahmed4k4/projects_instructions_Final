/**
 * Query matching for a numeric model term.
 *
 * A bare model matches its whole FAMILY (5070 → 5070, 5070 Ti, 5070 Super),
 * because that is what a shopper means. Keeping the variants in separate GROUPS
 * is what prevents prices being mixed — not excluding them from the results.
 */
function termMatches(term, name) {
  const hay = name.toLowerCase();
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?![0-9])`).test(hay);
}

const CASES = [
  ['5070', 'PNY GeForce RTX 5070 Ti ARGB Overclocked', true, 'bare model matches the Ti'],
  ['5070', 'AORUS GeForce RTX 5070 MASTER 12GB', true, 'bare model, plain card'],
  ['5070', 'ASUS GeForce RTX 5070 SUPER', true, 'bare model matches the Super'],
  ['5070', 'AMD Radeon RX 50700', false, 'must not match a longer number'],
  ['5070', 'NVIDIA RTX 15070', false, 'must not match a prefixed number'],
  ['5060', 'GIGABYTE GeForce RTX 5060 Ti 8GB', true, 'bare model matches the Ti'],
  ['7800', 'AMD Radeon RX 7800 XT 16GB', true, 'bare model matches the XT'],
  ['ryzen', 'AMD Ryzen 7 7800X3D', true, 'word term stays substring'],
  ['rtx', 'NVIDIA GeForce RTX 4090', true, 'family word'],
];

let failed = 0;
for (const [query, name, expected, note] of CASES) {
  const got = termMatches(query, name);
  if (got !== expected) failed += 1;
  console.log(`${got === expected ? 'PASS' : 'FAIL'}  "${query}" → ${String(got).padEnd(5)} ${note}`);
}

console.log(failed ? `\n✗ ${failed} failure(s)` : '\n✓ all query-matching cases pass');
process.exit(failed ? 1 : 0);
