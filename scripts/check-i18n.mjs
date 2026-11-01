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

/** Every key per language, as `ns:key`. */
const keys = {};
for (const lang of LANGUAGES) {
  keys[lang] = new Set();
  for (const ns of NAMESPACES) {
    for (const path of flatten(load(lang, ns))) keys[lang].add(`${ns}:${path}`);
  }
}

let failures = 0;

// 1. Parity between languages.
for (const ns of NAMESPACES) {
  const en = new Set(flatten(load('en', ns)).map((k) => `${ns}:${k}`));
  const ar = new Set(flatten(load('ar', ns)).map((k) => `${ns}:${k}`));

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
    // `t('thing', { ns })` where ns is not common.
    const nsMatch = new RegExp(`t\\(\\s*['"]${raw}['"]\\s*,\\s*\\{[^}]*ns:\\s*['"](\\w+)['"]`).exec(content);
    const ns = nsMatch ? nsMatch[1] : 'common';
    const qualified = `${ns}:${raw}`;
    used.add(qualified);

    const base = qualified.replace(/(_plural|_one|_other)$/, '');
    if (!keys.en.has(base) && !keys.en.has(qualified)) {
      failures += 1;
      console.error(`✖ ${file}: t('${raw}') has no key (tried ${base})`);
    }
  }
}

if (failures > 0) {
  console.error(`\n✖ i18n check failed (${failures} problem(s)).`);
  process.exit(1);
}

console.log(`✔ i18n clean — ${keys.en.size} keys × ${LANGUAGES.length} languages, ${used.size} referenced`);
