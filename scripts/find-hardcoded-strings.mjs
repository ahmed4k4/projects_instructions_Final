/**
 * Find hardcoded user-facing strings in JSX.
 *
 *   node scripts/find-hardcoded-strings.mjs
 *
 * Reports text nodes and string-literal attributes that are not routed through
 * `t()`. Heuristic but effective: it flags things a translator would have to
 * change, and ignores code, identifiers, class names and numerals.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) return e === '__tests__' ? [] : walk(f);
    return /\.tsx$/.test(e) ? [f] : [];
  });

/** Words that indicate real prose rather than a token or a code path. */
const PROSE =
  /\b(the|and|your|this|that|with|from|for|are|is|will|not|has|have|you|all|more|less|find|add|remove|save|search|compare|buy|price|prices|available|loading|error|retry|empty|no|yes)\b/i;

/** Attributes that render to the user. */
const ATTRS = /(placeholder|aria-label|title|alt)="([^"]{4,})"/g;

/** JSX text nodes: `>Some words<` with no `{`. */
const TEXT_NODE = />\s*([A-Z][^<>{}\n]{3,}?)</g;

const IGNORE = /(<code|<kbd|className|http|@|\/|\b[A-Z]{2,}\b|RTX|GTX|Ryzen|Intel|AMD|NVIDIA|Ryzen|\d)/;

const findings = [];

for (const file of walk('src')) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    // Skip comments and imports.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import')) return;

    for (const m of line.matchAll(TEXT_NODE)) {
      const text = m[1].trim();
      if (text.length < 4 || !PROSE.test(text) || IGNORE.test(text)) continue;
      findings.push({ file, line: index + 1, text, kind: 'text' });
    }

    for (const m of line.matchAll(ATTRS)) {
      const text = m[2].trim();
      if (!PROSE.test(text) || IGNORE.test(text)) continue;
      // `{t('…')}` values never match ATTRS because they contain braces.
      findings.push({ file, line: index + 1, text, kind: m[1] });
    }
  });
}

if (findings.length === 0) {
  console.log('✔ no hardcoded user-facing strings found');
  process.exit(0);
}

const byFile = new Map();
for (const f of findings) {
  const list = byFile.get(f.file) ?? [];
  list.push(f);
  byFile.set(f.file, list);
}

for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${file}  (${list.length})`);
  for (const f of list.slice(0, 12)) {
    console.log(`  ${String(f.line).padStart(4)} [${f.kind}] ${f.text.slice(0, 70)}`);
  }
}

console.log(`\n${findings.length} candidate(s) in ${byFile.size} file(s)`);
