#!/usr/bin/env node
/**
 * Verify the DEPLOYED shape of the AI function, not just its source.
 *
 *   node scripts/verify-ai-route-bundle.mjs
 *
 * Why this exists
 * ---------------
 * A `500 FUNCTION_INVOCATION_FAILED` on Vercel was caused by the function
 * importing `src/server/geminiProxy.ts` while the build emitted
 * `geminiProxy.js` — the specifier survived compilation, the file did not. Every
 * request failed at module load, before any handler code ran, so no log line
 * ever mentioned the key.
 *
 * Unit tests and `verify-ai-function.mjs` both load the TypeScript source
 * directly and therefore could not catch it. This script runs Vercel's own
 * bundler and inspects what is actually shipped:
 *
 *   1. `vercel build` produces `.vercel/output/functions/api/ai/[...path].func`
 *   2. every relative import in the emitted entry must resolve to a file that
 *      exists inside the function directory
 *
 * Exits 1 on any dangling import, so `pnpm audit:all` fails rather than shipping
 * a function that cannot start.
 *
 * Requires the Vercel CLI (fetched on demand) and network access for the first
 * run. When the CLI is unavailable the check is SKIPPED, not failed — a local
 * machine without network should not block a build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNC = join(ROOT, '.vercel/output/functions/api/ai/[...path].func');
const ENTRY = join(FUNC, 'api/ai/[...path].js');

/* ── 1. Build ─────────────────────────────────────────────────────────────── */
let built = false;
try {
  execFileSync('npx', ['--yes', 'vercel@latest', 'build', '--yes'], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: true,
    timeout: 300_000,
  });
  built = true;
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  if (/ENOTFOUND|EAI_AGAIN|network|offline/i.test(output)) {
    console.log('~ SKIP: Vercel CLI unavailable offline — bundle not verified.');
    process.exit(0);
  }
  console.error('✖ vercel build failed:');
  console.error(output.slice(-1500));
  process.exit(1);
}

if (!built || !existsSync(ENTRY)) {
  console.error(`✖ expected function entry at ${ENTRY}`);
  process.exit(1);
}

/* ── 2. Every relative import must resolve inside the function ────────────── */
const source = readFileSync(ENTRY, 'utf8');
const specifiers = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);

const unique = [...new Set(specifiers)];
const dangling = [];

for (const spec of unique) {
  const target = resolve(dirname(ENTRY), spec);
  const candidates = [target, `${target}.js`, `${target}.mjs`, `${target}.cjs`, join(target, 'index.js')];
  if (!candidates.some((candidate) => existsSync(candidate))) dangling.push(spec);
}

console.log(`function entry imports ${unique.length} local module(s)`);
for (const spec of unique) console.log(`  ${dangling.includes(spec) ? 'MISSING' : 'ok     '} ${spec}`);

if (dangling.length) {
  console.error(`\n✖ ${dangling.length} import(s) do not resolve in the deployed bundle.`);
  console.error('   Write the specifier WITHOUT a file extension so Vercel resolves the compiled .js.');
  process.exit(1);
}

console.log('\n✔ AI function bundle resolves every local import');
