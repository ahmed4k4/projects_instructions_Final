#!/usr/bin/env node
/**
 * Fails the build if any Gemini key material reaches `dist/`.
 *
 * Phase 2 checked this by hand after every build. A secret that ships once is
 * compromised forever, so this runs in `pnpm audit:all` and before deploys.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

/** Patterns that must never appear in a shipped bundle. */
const FORBIDDEN = [
  { name: 'Google API key (AIza…)', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'AI Studio key (AQ.…)', re: /AQ\.[A-Za-z0-9_-]{20,}/ },
  { name: 'VITE_GEMINI_API_KEY reference', re: /VITE_GEMINI_API_KEY/ },
  { name: 'Gemini key env read', re: /GEMINI_API_KEY\s*[:=]/ },
  { name: 'Supabase service role key', re: /service_role[\s"':=]+eyJ/ },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let failures = 0;

if (!statSync(DIST, { throwIfNoEntry: false })) {
  console.error(`✖ ${DIST}/ not found — run \`pnpm build\` first.`);
  process.exit(1);
}

for (const file of walk(DIST)) {
  // Fonts and images are binary; only scan text assets.
  if (/\.(woff2?|png|jpe?g|gif|svg|ico|webp)$/i.test(file)) continue;

  const content = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    const match = rule.re.exec(content);
    if (match) {
      failures += 1;
      const line = content.slice(0, match.index).split('\n').length;
      console.error(`✖ ${file}:${line} contains ${rule.name}: ${match[0].slice(0, 24)}…`);
    }
  }
}

if (failures > 0) {
  console.error(`\n✖ secret scan failed (${failures} finding(s)).`);
  process.exit(1);
}

console.log('✔ secret scan clean — no key material in dist/');
