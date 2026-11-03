/**
 * Brand extraction for retailer product names.
 *
 * Egyptian stores write names in many shapes:
 *   "ASUS TUF Gaming GeForce RTX 5070 Ti"
 *   "GIGABYTE GeForce RTX 5090 MASTER 32G"
 *   "VGA MSI RTX 4060 Ventus 2X 8G"
 *   "AMD Ryzen 7 9800X3D Processor"
 *
 * The filter rail needs ONE canonical brand per listing, so shoppers can narrow
 * by manufacturer. A fixed list is used rather than "first word wins": names
 * frequently open with a category word ("VGA …", "Motherboard …") or a product
 * line ("TUF …"), which would produce junk brands like "VGA".
 */

/**
 * Known manufacturers, longest first.
 *
 * Longest-first matters: "Gigabyte" must win over "GB", and "Asus" over "A".
 * Matching is word-bounded, so "MSI" never matches inside another word.
 */
const BRANDS = [
  'ASUS',
  'ASRock',
  'AORUS',
  'Gigabyte',
  'MSI',
  'Corsair',
  'Kingston',
  'Crucial',
  'Samsung',
  'Western Digital',
  'Seagate',
  'SanDisk',
  'TeamGroup',
  'G.Skill',
  'Patriot',
  'HyperX',
  'ADATA',
  'Lexar',
  'PNY',
  'Palit',
  'Zotac',
  'Inno3D',
  'Sapphire',
  'PowerColor',
  'XFX',
  'Colorful',
  'Manli',
  'Gainward',
  'EVGA',
  'Intel',
  'AMD',
  'NVIDIA',
  'Lian Li',
  'NZXT',
  'Fractal Design',
  'Cooler Master',
  'DeepCool',
  'Thermaltake',
  'be quiet!',
  'Noctua',
  'Arctic',
  'ID-COOLING',
  'Phanteks',
  'Antec',
  'Montech',
  'SilverStone',
  'Seasonic',
  'Super Flower',
  'FSP',
  'Cougar',
  'DarkFlash',
  'Redragon',
  'Logitech',
  'Razer',
  'SteelSeries',
].sort((a, b) => b.length - a.length);

/** Escape a brand for regex use ("be quiet!" and "G.Skill" have metacharacters). */
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MATCHERS = BRANDS.map((brand) => ({
  brand,
  pattern: new RegExp(`(^|[^A-Za-z0-9])${escape(brand)}([^A-Za-z0-9]|$)`, 'i'),
}));

/**
 * The brand of a product name, or `null` when no known manufacturer appears.
 *
 * Returning null is deliberate: the rail must not offer a "VGA" or "GeForce"
 * pseudo-brand invented from a name's first word.
 */
export function extractBrand(name: string): string | null {
  if (!name) return null;
  for (const { brand, pattern } of MATCHERS) {
    if (pattern.test(name)) return canonicalBrand(brand);
  }
  return null;
}

/** Display form: the canonical casing from the list. */
function canonicalBrand(brand: string): string {
  // A few brands are written in caps by convention; keep their list form.
  return brand;
}

/**
 * Do two names share a manufacturer?
 *
 * Used by grouping: two listings from different stores are only the same product
 * if the same brand made them. GIGABYTE's "Gaming OC" and ASUS's "Dual OC" are
 * both `geforce|5070|12` but are not the same card.
 */
export function sameBrand(a: string, b: string): boolean {
  const brandA = extractBrand(a);
  const brandB = extractBrand(b);
  if (!brandA || !brandB) return false;
  return brandA.toLowerCase() === brandB.toLowerCase();
}
