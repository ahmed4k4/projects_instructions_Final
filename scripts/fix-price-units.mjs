/**
 * Wash the USD-shaped prices in the hosted database into EGP.
 *
 *   node scripts/fix-price-units.mjs           # dry run
 *   node scripts/fix-price-units.mjs --apply
 *
 * This is the client-side twin of `supabase/migrations/010_price_units.sql` for
 * deployments where the Supabase CLI is not available. It writes with the anon
 * key, so it only works when the project's RLS allows it — and it reports
 * precisely that when it does not, rather than pretending to have succeeded.
 *
 * The rule is the same as the migration's: a component priced below 2,500 is a
 * US figure (the cheapest genuine EGP part is ~2,700), so multiply by the rate.
 */
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const RATE = 50;
const THRESHOLD = 2500;

const env = readFileSync('.env.local', 'utf8');
const url = /VITE_SUPABASE_URL=(.*)/.exec(env)?.[1]?.trim();
const key = /VITE_SUPABASE_ANON_KEY=(.*)/.exec(env)?.[1]?.trim();

if (!url || !key) {
  console.error('✖ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const components = await fetch(`${url}/rest/v1/components?select=id,name,price`, { headers });
if (!components.ok) {
  console.error(
    `✖ could not read components: ${components.status} ${(await components.text()).slice(0, 200)}`,
  );
  process.exit(1);
}

const rows = await components.json();
const usd = rows.filter((row) => Number(row.price) > 0 && Number(row.price) < THRESHOLD);

console.log(`${rows.length} components, ${usd.length} look USD-denominated`);
for (const row of usd.slice(0, 6)) {
  console.log(
    `  ${String(row.price).padStart(8)} -> ${String(Math.round(row.price * RATE)).padStart(8)}  ${row.name.slice(0, 40)}`,
  );
}

if (!usd.length) {
  console.log('\n✔ nothing to convert');
  process.exit(0);
}

if (!APPLY) {
  console.log('\n(dry run — pass --apply to write)');
  process.exit(0);
}

let updated = 0;
let denied = 0;
for (const row of usd) {
  const res = await fetch(`${url}/rest/v1/components?id=eq.${row.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ price: Math.round(Number(row.price) * RATE) }),
  });

  if (res.ok) updated += 1;
  else if (res.status === 401 || res.status === 403) denied += 1;
  else console.error(`  ✖ ${row.name}: ${res.status} ${(await res.text()).slice(0, 120)}`);
}

console.log(`\nupdated ${updated}, refused ${denied}`);
if (denied) {
  console.error(
    '\n✖ The anon key cannot write to `components` (expected under RLS).\n' +
      '  Run the SQL instead:  supabase db push   (applies 010_price_units.sql)',
  );
  process.exit(1);
}
