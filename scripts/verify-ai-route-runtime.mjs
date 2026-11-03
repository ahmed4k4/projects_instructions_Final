#!/usr/bin/env node
/**
 * Execute the BUNDLED serverless function, not the TypeScript source.
 *
 *   node scripts/verify-ai-route-runtime.mjs
 *
 * `verify-ai-route-bundle.mjs` proves every import *resolves*. This proves the
 * function actually *runs* once resolved — the difference between
 * "file not found" and "module threw on load", both of which surface to a user
 * as the same opaque 500 FUNCTION_INVOCATION_FAILED.
 *
 * Steps:
 *   1. `vercel build` → `.vercel/output/functions/api/ai/[...path].func`
 *   2. import the emitted entry in a child Node process
 *   3. call GET /api/ai/config and assert a JSON body comes back
 *
 * Runs with and without GEMINI_API_KEY so both branches are exercised.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, '.vercel/output/functions/api/ai/[...path].func/api/ai/[...path].js');

if (!existsSync(ENTRY)) {
  try {
    execFileSync('npx', ['--yes', 'vercel@latest', 'build', '--yes'], {
      cwd: ROOT,
      stdio: 'pipe',
      shell: true,
      timeout: 300_000,
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/ENOTFOUND|EAI_AGAIN|offline/i.test(output)) {
      console.log('~ SKIP: Vercel CLI unavailable offline.');
      process.exit(0);
    }
    console.error(output.slice(-1200));
    process.exit(1);
  }
}

const probe = `
  const { pathToFileURL } = require('node:url');
  (async () => {
    const mod = await import(pathToFileURL(${JSON.stringify(ENTRY)}).href);
    const handler = mod.default?.fetch ?? mod.GET ?? mod.default;
    const request = new Request('https://app.example/api/ai/config', { method: 'GET' });
    const response = await handler(request);
    const text = await response.text();
    process.stdout.write(JSON.stringify({ status: response.status, text }));
  })().catch((error) => {
    process.stdout.write(JSON.stringify({ error: String(error && error.stack || error) }));
  });
`;

for (const key of [undefined, 'test-key-not-real']) {
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  if (key) env.GEMINI_API_KEY = key;
  env.SUPABASE_URL = 'https://test-project.supabase.co';
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-not-real';

  const result = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8', timeout: 60_000 });
  const line = (result.stdout ?? '').trim().split('\n').pop() ?? '';

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.error(`✖ bundled function did not answer (exit ${result.status})`);
    console.error((result.stderr ?? '').slice(-900));
    process.exit(1);
  }

  const label = key ? 'key set  ' : 'key unset';

  if (parsed.error) {
    console.error(`✖ ${label}: module threw on load`);
    console.error(parsed.error.split('\n').slice(0, 6).join('\n'));
    process.exit(1);
  }

  let body;
  try {
    body = JSON.parse(parsed.text);
  } catch {
    console.error(`✖ ${label}: response was not JSON: ${String(parsed.text).slice(0, 200)}`);
    process.exit(1);
  }

  const expectedOk = Boolean(key);
  const pass = parsed.status === 200 && body.ok === expectedOk && typeof body.gemini === 'boolean';
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${label}  status=${parsed.status} ok=${body.ok} gemini=${body.gemini}`,
  );
  if (!pass) process.exitCode = 1;
}

if (!process.exitCode) console.log('\n✔ bundled AI function runs and answers correctly');
