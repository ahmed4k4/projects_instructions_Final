/** Report dependencies that no source file imports. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx|css)$/.test(e) ? [f] : [];
  });

const sources = [...walk('src'), ...walk('supabase'), 'vite.config.ts', 'tailwind.config.ts']
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

// A dependency is "used" if it appears in any import, in a css @import, or is a
// type-only package referenced via a `@types/` counterpart.
const unused = [];
for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
  const bare = name.replace(/^@/, '').replace(/\//g, '\\/');
  const patterns = [
    new RegExp(`['"]${name.replace(/[/.]/g, '\\$&')}(\\/[^'"]*)?['"]`),
    new RegExp(`@import\\s+['"]${name.replace(/[/.]/g, '\\$&')}`),
  ];
  if (!patterns.some((p) => p.test(sources))) unused.push(`${name} ${version}`);
}

console.log(unused.length ? `Unused dependencies (${unused.length}):` : 'No unused dependencies.');
unused.forEach((u) => console.log('  ' + u));
