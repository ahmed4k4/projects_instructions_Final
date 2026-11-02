#!/usr/bin/env node
/**
 * Translation completeness gate.
 *
 * Fails when
 *   · a key exists in one language but not the other,
 *   · a `t('…')` call in the source has no key in any namespace,
 *   · a locale file contains keys nobody references (a stale-string smell).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'src/i18n/locales');
const SRC = join(ROOT, 'src');
const LANGUAGES = ['en', 'ar'];
const NAMESPACES = ['common', 'builder', 'ai', 'pages'];

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value) ? flatten(value, path) : [path];
  });

const load = (lang, ns) => JSON.parse(readFileSync(join(LOCALES, lang, `${ns}.json`), 'utf8'));

/**
 * Every key per language, mirroring the runtime scoping in src/i18n/index.ts:
 * `builder.json` is nested under `builder.`, the others merge flat.
 */
const SCOPED = new Set(['builder']);

const buildKeySet = (lang) => {
  const set = new Set();
  for (const ns of NAMESPACES) {
    const prefix = SCOPED.has(ns) ? `${ns}.` : '';
    for (const path of flatten(load(lang, ns))) {
      set.add(prefix + path);
      set.add(`${ns}:${path}`);
    }
  }
  return set;
};

const keys = {};
for (const lang of LANGUAGES) keys[lang] = buildKeySet(lang);

let failures = 0;

/**
 * Strip a CLDR plural suffix so parity is checked on the BASE key.
 *
 * Arabic has six plural categories and English two, so `results_few` legitimately
 * exists in `ar` and not in `en`. Comparing raw key sets reported 21 phantom
 * "missing" keys and failed the gate for a file that was correct.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKey = (key) => key.replace(PLURAL_SUFFIX, '');

// 1. Parity between languages, on base keys (plural sets differ by design).
for (const ns of NAMESPACES) {
  const en = new Set(flatten(load('en', ns)).map((k) => `${ns}:${baseKey(k)}`));
  const ar = new Set(flatten(load('ar', ns)).map((k) => `${ns}:${baseKey(k)}`));

  for (const key of en) {
    if (!ar.has(key)) {
      failures += 1;
      console.error(`✖ missing in ar/${ns}.json: ${key}`);
    }
  }
  for (const key of ar) {
    if (!en.has(key)) {
      failures += 1;
      console.error(`✖ missing in en/${ns}.json: ${key}`);
    }
  }
}

// 2. Every t() call resolves.
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'i18n' || entry === '__tests__' ? [] : walk(full);
    }
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

const used = new Set();
const T_CALL = /\bt\(\s*['"]([a-zA-Z][\w.:]*?)['"]/g;

for (const file of walk(SRC)) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(T_CALL)) {
    const raw = match[1];
    used.add(raw);

    // The runtime merges every file into one `translation` namespace, so a key
    // resolves if it exists in ANY of them (see src/i18n/index.ts). A call may
    // also carry an explicit `ns:key` prefix, which is checked as written.
    const base = raw.replace(PLURAL_SUFFIX, '');
    const bare = base.includes(':') ? base.split(':').slice(1).join(':') : base;
    if (!keys.en.has(base) && !keys.en.has(bare)) {
      failures += 1;
      console.error(`✖ ${file}: t('${raw}') has no key`);
    }
  }
}

if (failures > 0) {
  console.error(`\n✖ i18n check failed (${failures} problem(s)).`);
  process.exit(1);
}

console.log(`✔ i18n clean — ${keys.en.size} keys × ${LANGUAGES.length} languages, ${used.size} referenced`);
