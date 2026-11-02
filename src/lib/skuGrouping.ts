/**
 * Product identity for grouping.
 *
 * The search page's job is "which retailer sells the cheapest RTX 5070 Ti?" — so
 * grouping has to answer "are these two listings the same product?" without ever
 * grouping two different SKUs together. A wrong merge shows one SKU's price under
 * another SKU's name, which is worse than showing them separately.
 *
 * ── Why this is not the Phase 7 matcher ──────────────────────────────────
 * `scoreNameMatch` answers "does this listing correspond to catalogue row X?"
 * using fuzzy coverage. Grouping needs a *canonical identity* instead: a
 * deterministic key that is equal for the same part at any retailer and
 * different for every distinct SKU. Fuzzy similarity is the wrong tool — two
 * different GPUs share most of their words.
 *
 * ── Rules learned from live Egyptian listings ────────────────────────────
 *   · The FIRST number in a CPU name is the series, not the model
 *     ("Ryzen 5 5600X" → 5). Taking it collapsed 8 processors into one group.
 *   · Memory size is part of the identity: RTX 5060 Ti **8GB** ≠ **16GB**.
 *   · Variant suffixes are separate products: 4070 ≠ 4070 SUPER ≠ 4070 Ti ≠
 *     4070 Ti SUPER.
 *   · Board partners (ASUS TUF, MSI Ventus, Palit GamingPro) are the SAME
 *     product — that is exactly what price comparison is for.
 *
 * Returning `null` means "cannot identify this SKU" — the caller then shows the
 * listing as its own group rather than guessing.
 */

/** Words that create a genuinely different SKU when they follow the model number. */
const VARIANT_WORDS = ['ti', 'super', 'xtx', 'xt', 'x3d', 'kf', 'ks', 'k', 'f', 'g', 'x'];

/** Normalise to a padded, punctuation-free, lowercase token stream. */
function normalise(name: string): string {
  return ` ${name
    .toLowerCase()
    .replace(/[^a-z0-9.+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

const firstNumber = (text: string, pattern: RegExp): string => pattern.exec(text)?.[1] ?? '';

/**
 * Canonical SKU key for a product name, or null when it cannot be identified.
 *
 * The key is namespaced by family (`geforce|5070|ti|16`) so a Ryzen 7 and an RX
 * 7800 can never collide, and is stable across retailers.
 */
export function skuKey(name: string): string | null {
  const n = normalise(name);

  // Memory size belongs to the identity. Read it before trimming, because the
  // capacity is usually the last meaningful token.
  const memory = firstNumber(n, /\b(\d{1,2}) ?gb\b/);

  /* ── CPUs ─────────────────────────────────────────────────────────────── */
  if (/\bryzen\b/.test(n)) {
    // "Ryzen 7 7800X3D" → 7800x3d. Requires the 4-digit model AFTER the series.
    const model = firstNumber(n, /\bryzen\s+[3579]\s+(\d{4}[a-z0-9]*)\b/);
    return model ? `ryzen|${model}` : null;
  }

  if (/\bcore ultra\b/.test(n)) {
    const model = firstNumber(n, /\bcore ultra\s+[3579]\s+(\d{3}[a-z0-9]*)\b/);
    return model ? `core-ultra|${model}` : null;
  }

  if (/\bcore i[3579]\b/.test(n)) {
    const model = firstNumber(n, /\bcore i[3579][- ](\d{4,5}[a-z]*)\b/);
    return model ? `core|${model}` : null;
  }

  /* ── GPUs ─────────────────────────────────────────────────────────────── */
  for (const family of ['geforce', 'radeon'] as const) {
    if (!new RegExp(`\\b${family}\\b`).test(n)) continue;

    // "GeForce RTX 5070 Ti" → 5070 ; "Radeon RX 9060 XT" → 9060
    const model =
      firstNumber(n, new RegExp(`\\b${family}\\s+(?:rtx|rx)?\\s*(\\d{3,4})\\b`)) ||
      firstNumber(n, /\brx\s*(\d{4})\b/);
    if (!model) continue;

    // Only look a short way past the model number: "Ti" is a variant, a "Ti"
    // appearing 30 characters later is a different sentence.
    const tail = n.slice(n.indexOf(model)).slice(0, 24);
    const variant = VARIANT_WORDS.filter((v) => new RegExp(`\\b${v}\\b`).test(tail));

    return [family, model, ...variant, memory].filter(Boolean).join('|');
  }

  /* ── Motherboards ─────────────────────────────────────────────────────── */
  // A chipset is NOT a model: keying on X870E merged a Gigabyte Aero, an ASUS
  // Strix-E and a Crosshair HERO into one price group. The model is the vendor's
  // line name before the chipset ("ROG STRIX X870E-E", "MAG B650 TOMAHAWK").
  if (/\b(motherboard|mainboard|atx|matx|itx)\b/.test(n) || /\bx?[bza]\d{3}[a-z]*\b/.test(n)) {
    const chipset = firstNumber(n, /\b([xhbza]\d{3}[a-z]{0,2})\b/);
    if (!chipset) return null;

    // Brand + line tokens that precede the chipset identify the board.
    const brand = firstNumber(n, /\b(asus|msi|gigabyte|asrock|biostar|evga|nzxt)\b/) || 'generic';
    const lineWords = ['rog', 'strix', 'tuf', 'prime', 'proart', 'crosshair', 'aero', 'aorus',
      'tomahawk', 'mag', 'mpg', 'mpeg', 'edge', 'steel', 'legend', 'taichi', 'phantom', 'steel',
      'b650m', 'b760m', 'z790', 'tuf', 'plus', 'wifi', 'hero', 'e', 'a', 'gaming'];
    const line = lineWords.filter((w) => new RegExp(`\\b${w}\\b`).test(n));

    return ['mb', brand, chipset, ...line.slice(0, 3)].join('|');
  }

  /* ── Everything else ──────────────────────────────────────────────────── */
  // SSDs/PSUs/cases/coolers are identified by their model code:
  // SN850X, RM850x, 990 Pro, NH-D15.
  const generic = firstNumber(n, /\b([a-z]{0,3}\d{3,4}[a-z0-9]*)\b/);
  if (generic) return memory ? `${generic}|${memory}` : generic;

  return null;
}

/**
 * Board-partner / line identity, e.g. "asus|dual", "aorus|master".
 *
 * A model number alone cannot identify a GPU: an RTX 5070 "AORUS MASTER" and an
 * "ASUS Dual OC" are different products at different prices even though both are
 * `geforce|5070|12`. Grouping them produced a comparison table that listed an
 * ASUS card under an AORUS heading.
 *
 * This returns the brand-plus-line prefix when the name carries one, and an empty
 * string otherwise. Callers use it to split submissions from the SAME retailer,
 * where two listings are almost always different SKUs.
 */
const PARTNER_BRANDS = [
  'asus', 'msi', 'gigabyte', 'aorus', 'zotac', 'palit', 'pny', 'gainward', 'inno3d',
  'sapphire', 'powercolor', 'xfx', 'asrock', 'evga', 'galax', 'colorful', 'biostar',
  'sparkle', 'manli', 'maxsun', 'yeston', 'leadtek', 'gunnir', 'nvidia', 'amd', 'intel',
];

const PARTNER_LINES = [
  'tuf', 'strix', 'rog', 'prime', 'proart', 'dual', 'master', 'aero', 'aorus', 'gaming',
  'ventus', 'suprim', 'lightning', 'windforce', 'eagle', 'vision', 'trinity', 'amp',
  'twin', 'edge', 'sapphire', 'nitro', 'pulse', 'hellhound', 'red', 'devil', 'mercury',
  'challenger', 'steel', 'legend', 'taichi', 'phantom', 'founders', 'reference',
];

export function partnerKey(name: string): string {
  const n = normalise(name);
  const brand = PARTNER_BRANDS.find((b) => new RegExp(`\\b${b}\\b`).test(n)) ?? '';
  const line = PARTNER_LINES.find((l) => new RegExp(`\\b${l}\\b`).test(n)) ?? '';
  return brand || line ? `${brand}|${line}` : '';
}

/**
 * Human-readable label for a group, taken from the most descriptive listing.
 *
 * Retailers name the same card differently ("ASUS Dual GeForce RTX 5060 White OC
 * Edition"), so the label prefers the listing whose name carries the family and
 * model without a long marketing tail.
 */
export function groupLabel(names: string[]): string {
  if (names.length === 0) return '';
  const scored = names
    .map((name) => ({
      name,
      // Prefer the shortest name that still contains a model number.
      score: (/\d/.test(name) ? 100 : 0) - name.length / 4,
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.name ?? names[0] ?? '';
}

/** Query normalisation shared by search + grouping. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}
