/**
 * Strict i18n audit — the release gate for "zero untranslated UI text".
 *
 *   node scripts/audit-i18n-strings.mjs [--list]
 *
 * Three patterns, because each catches a different class of leak:
 *   1. JSX text nodes with letters            `>Meticulously curated<`
 *   2. user-visible JSX attributes            `placeholder="Add a part…"`
 *   3. prose-shaped string literals           `toast.error('Export failed')`
 *      (toasts, thrown errors, config labels — invisible to a JSX scan)
 *
 * `--list` prints the JSON the migration script consumes.
 *
 * Paths that are not user interface copy are exempted explicitly, by file or by
 * folder, rather than by loosening the heuristics — a looser check silently stops
 * catching the very strings it exists for.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIST_MODE = process.argv.includes('--list');

/* -------------------------------------------------------------------------- */
/*  Scope                                                                     */
/* -------------------------------------------------------------------------- */

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

/** Folders whose contents are not UI copy. */
const EXEMPT_DIRS = [
  'src/i18n/', // the translations themselves
  'src/services/ai/', // model prompts and tool descriptions
  'src/lib/compatibility/', // pure engine: emits a ruleKey the UI translates
  'src/lib/scoring/', // engine notes and letter grades (domain output, not UI copy)
  'src/lib/sampleData', // catalogue seed data
  'src/services/supabaseClient', // error formatting
  'src/services/retailers/', // retailer registry (brand names) and scraped data
  'src/services/prompts/', // system instructions and tool schemas sent to the model
  // Agent/tool internals: results go back to the MODEL, and every user-facing
  // string they produce is passed through `t()` before it reaches the UI.
  'src/services/buildAgent',
  'src/services/advisorAgent',
  'src/services/aiTools',
  'src/services/buildDoctor',
  'src/services/smartBuilder',
  'src/hooks/useCatalogue', // seed copy for the compatibility rules (translated by ruleKey)
  'src/types/', // type-only
];

/** Files with brand names, format strings or unit labels. */
const EXEMPT_FILES = new Set(['src/main.tsx', 'src/router.tsx', 'src/lib/motion.ts', 'src/lib/constants.ts']);

const isExempt = (file) => EXEMPT_FILES.has(file) || EXEMPT_DIRS.some((dir) => file.startsWith(dir));

/* -------------------------------------------------------------------------- */
/*  Patterns                                                                  */
/* -------------------------------------------------------------------------- */

const TEXT_NODE = />([^<>{}\n]*[A-Za-z]{3,}[^<>{}\n]*)</g;
const ATTR = /\b(placeholder|aria-label|title|alt)="([^"]{4,})"/g;
const QUOTED = /(['"])((?:\\.|(?!\1)[^\\\n]){4,})\1/g;

const PROSE =
  /\b(the|your|this|that|with|from|for|are|is|was|will|not|cannot|please|you|all|more|select|enter|choose|failed|error|loading|retry|empty|unable|already|first|then|which|when|where|build|save|load|add|remove|search|compare|needs|has|have|only|every|everyone|nothing|something)\b/i;

/** Tokens that are brands, units or model codes, never prose. */
const BRAND_OR_CODE =
  /^(Nexus|EGP|AR|EN|OK|AI|PC|CPU|GPU|RAM|SSD|HDD|PSU|USB|RGB|AM4|AM5|LGA|DDR\d?|RTX|GTX|RX|Intel|AMD|NVIDIA|B\d{3}|\d)/;

/** Tailwind utilities, CSS declarations and selectors — never user copy. */
const CLASS_TOKENS =
  /\b(absolute|relative|flex|grid|inline|block|hidden|min-|max-|size-|w-|h-|px-|py-|ps-|pe-|pt-|pb-|mt-|mb-|ml-|mr-|gap-|rounded|border|bg-|text-|font-|leading-|tracking-|transition|duration-|ease-|place-|items-|justify-|overflow-|shrink|grow|truncate|antialiased|shadow|ring|backdrop|from-|via-|to-|opacity-|z-|inset|start-|end-|top-|bottom-|cursor-|select-none|whitespace-|motion-|sr-only|peer|group|hover:|focus:|dark:|data-|aria-|rtl:|ltr:|sm:|md:|lg:|xl:)\S*/;

const isClassList = (value) => {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const classy = tokens.filter((token) => CLASS_TOKENS.test(token)).length;
  // One or two utilities inside a sentence is still copy; a majority is CSS.
  return classy / tokens.length >= 0.5;
};

/** Keycaps and e-mail examples are UI chrome, not copy to translate. */
const NON_COPY = /^(Enter|Esc|Tab|Shift|Ctrl|Cmd|Alt|↑|↓|←|→|[\w.+-]+@[\w.-]+\.\w{2,})$/;

const findings = [];
const push = (file, line, kind, text) => findings.push({ file, line, kind, text });

/** Strip a line's leading indent and reject comment / import lines. */
const isCodeLine = (trimmed) =>
  !trimmed.startsWith('//') &&
  !trimmed.startsWith('*') &&
  !trimmed.startsWith('/*') &&
  !trimmed.startsWith('import');

for (const file of walk('src')) {
  const relative = file.replace(/\\/g, '/');
  if (isExempt(relative)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!isCodeLine(trimmed)) return;
    // Anything already routed through t() on this line is translated.
    if (/\bt\(/.test(line)) return;

    for (const match of line.matchAll(TEXT_NODE)) {
      const text = match[1].trim();
      if (text.length < 4 || BRAND_OR_CODE.test(text) || NON_COPY.test(text) || /^[{«]/.test(text)) continue;
      if (!/[A-Za-z]{3,}/.test(text)) continue;
      if (!PROSE.test(text) && !/^[A-Z][a-z]+(?:\s+[a-z]+)+/.test(text)) continue;
      push(relative, index + 1, 'jsx', text);
    }

    for (const match of line.matchAll(ATTR)) {
      const text = match[2].trim();
      if (text.includes('{') || BRAND_OR_CODE.test(text) || NON_COPY.test(text) || !PROSE.test(text)) continue;
      push(relative, index + 1, match[1], text);
    }

    for (const match of line.matchAll(QUOTED)) {
      const raw = match[2];
      // Tailwind class lists and CSS values are not copy. They are the bulk of
      // the false positives a bare literal scan produces.
      if (isClassList(raw)) continue;
      if (!/^[A-Za-z][A-Za-z0-9 ,.'’\-—:!?()/%]*$/.test(raw)) continue;
      if (BRAND_OR_CODE.test(raw) || NON_COPY.test(raw)) continue;
      // Prose: a sensible sentence in title case or plain lower-case words.
      if (!/^[A-Z][a-z]/.test(raw) && !/^[a-z]+ [a-z]/.test(raw)) continue;
      if (!PROSE.test(raw)) continue;
      if (/^[a-z-]+$/.test(raw)) continue;
      push(relative, index + 1, 'string', raw);
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Report                                                                    */
/* -------------------------------------------------------------------------- */

if (LIST_MODE) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(findings.length ? 1 : 0);
}

if (!findings.length) {
  console.log('✔ no untranslated UI text found');
  process.exit(0);
}

const byFile = new Map();
for (const finding of findings) {
  const list = byFile.get(finding.file) ?? [];
  list.push(finding);
  byFile.set(finding.file, list);
}

for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${file} (${list.length})`);
  for (const finding of list.slice(0, 20)) {
    console.log(`  ${String(finding.line).padStart(4)} [${finding.kind}] ${finding.text.slice(0, 90)}`);
  }
}

console.log(`\n${findings.length} untranslated string(s) in ${byFile.size} file(s)`);
process.exit(1);
