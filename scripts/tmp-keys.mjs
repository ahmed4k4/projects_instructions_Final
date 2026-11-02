import { readFileSync } from 'node:fs';

const files = ['common', 'builder', 'ai', 'pages'];
const merged = new Set();

const flatten = (obj, prefix = '') => {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path);
    else merged.add(path);
  }
};

for (const file of files) {
  flatten(JSON.parse(readFileSync(`src/i18n/locales/en/${file}.json`, 'utf8')), file === 'builder' ? 'builder' : '');
}

const groups = {};
for (const key of merged) {
  const root = key.split('.')[0];
  (groups[root] ??= []).push(key);
}

const search = process.argv.slice(2);
if (!search.length) {
  for (const [root, keys] of Object.entries(groups)) console.log(`${root} (${keys.length})`);
} else {
  for (const term of search) {
    const hits = [...merged].filter((key) => key.toLowerCase().includes(term.toLowerCase()));
    console.log(`${term}: ${hits.length ? hits.join(', ') : '— none —'}`);
  }
}
