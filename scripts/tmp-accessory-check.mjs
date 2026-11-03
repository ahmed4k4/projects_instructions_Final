/** Which stored rows are accessories that slipped through classification? */
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('public/data/retailer_snapshot.json', 'utf8'));
const sigma = JSON.parse(readFileSync('public/data/sigma_products.json', 'utf8'));
const all = [...data.products, ...sigma.products];

const PROBE = [
  'fan tray',
  'flash drive',
  'usb drive',
  'black ridge',
  'pcie extension',
  'power module',
  'fan hub',
  'argb hub',
];

for (const needle of PROBE) {
  const rows = all.filter((p) => p.name.toLowerCase().includes(needle));
  console.log(`\n"${needle}": ${rows.length}`);
  for (const p of rows.slice(0, 3)) {
    console.log(`   [${p.retailerId}/${p.category}] ${p.priceEgp} — ${p.name.slice(0, 58)}`);
  }
}
