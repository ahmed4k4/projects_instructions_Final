#!/usr/bin/env node
/**
 * `pnpm audit:all` — the Phase 6 release gate.
 *
 * Runs every static check in order and fails fast, so a green run means:
 *   · types, lint and production build are clean
 *   · every UI string exists in both languages
 *   · the RTL rules hold
 *   · no secret leaked into the bundle
 *   · no unreachable source file was left behind
 *   · the test suite passes
 *
 * The live Gemini probes (scripts/verify-*.mjs) are intentionally NOT part of
 * this gate: they need a key and the network, and a flaky 503 must not block a
 * build. Run them by hand when touching the AI layer.
 */
import { spawnSync } from 'node:child_process';

const steps = [
  ['typecheck', 'pnpm', ['typecheck']],
  ['lint', 'pnpm', ['lint']],
  ['i18n', 'node', ['scripts/check-i18n.mjs']],
  ['rtl', 'node', ['scripts/check-rtl.mjs']],
  ['design system', 'node', ['scripts/check-design-system.mjs']],
  ['dependencies', 'node', ['scripts/check-deps.mjs'], { allowFindings: true }],
  ['build', 'pnpm', ['build']],
  ['bundle secrets', 'node', ['scripts/check-bundle-secrets.mjs']],
  ['unused files', 'node', ['scripts/audit-unused.mjs']],
  ['tests', 'pnpm', ['test']],
];

let failed = 0;

// `check-deps` reports rather than fails: `@types/three` is resolved implicitly
// by TypeScript with no import statement, so a non-empty list is expected.
const ADVISORY = new Set(['dependencies']);

for (const [name, cmd, args] of steps) {
  process.stdout.write(`\n──────── ${name} ────────\n`);

  // `shell: true` is required on Windows: pnpm is a .cmd shim and spawning it
  // directly yields a null status. Args here are constants, so no injection risk.
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0 && !ADVISORY.has(name)) {
    console.error(`\n✖ ${name} failed (exit ${result.status})`);
    failed += 1;
    break;
  }
  if (result.status !== 0 && ADVISORY.has(name)) {
    console.log(`\n~ ${name}: reported above (advisory, not a failure)`);
  }
}

if (failed) {
  console.error('\n✖ audit:all FAILED');
  process.exit(1);
}

console.log('\n✔ audit:all passed — types, lint, i18n, RTL, build, secrets, dead code, tests');
