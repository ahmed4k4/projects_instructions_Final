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
  //
  // `8G` (MSI) and `8GB` (most others) are the same capacity — matching only
  // `8gb` split "RTX 4060 … 8G" from "RTX 4060 … 8GB" into two products.
  const memory = firstNumber(n, /\b(\d{1,2}) ?g(?:b)?\b/);

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
  /**
   * A GPU is identified by its FAMILY WORD, and retailers do not agree on it.
   *
   * The one product this page exists for arrives under both spellings:
   *
   *   Elnekhely: "ASUS Dual RTX 5070 OC 12GB"        (no "GeForce")
   *   Elbadr:    "ASUS Dual GeForce RTX 5070 OC 12GB"
   *
   * Matching only `\bgeforce\b` gave those two different keys (`5070|12` vs
   * `geforce|5070|12`), so the same card appeared as two separate results and was
   * never compared. The brand prefixes RTX/GTX/RX are unambiguous on their own.
   */
  const family = /\bgeforce\b|\brtx\b|\bgtx\b/.test(n)
    ? 'geforce'
    : /\bradeon\b|\brx\b/.test(n)
      ? 'radeon'
      : null;

  if (family) {
    // "GeForce RTX 5070 Ti" → 5070 ; "ASUS Dual RTX 5070" → 5070 ; "RX 9060 XT" → 9060
    const model =
      firstNumber(n, new RegExp(`\\b${family}\\s+(?:rtx|rx)?\\s*(\\d{3,4})\\b`)) ||
      firstNumber(n, /\b(?:rtx|gtx)\s*(\d{3,4})\b/) ||
      firstNumber(n, /\brx\s*(\d{4})\b/);
    if (!model) return null;  // "RTX 5070" → no fallthrough to other rules

    // Only look a short way past the model number: "Ti" is a variant, a "Ti"
    // appearing 30 characters later is a different sentence.
    const tail = n.slice(n.indexOf(model)).slice(0, 24);
    const variant = VARIANT_WORDS.filter((v) => new RegExp(`\\b${v}\\b`).test(tail));

    return [family, model, ...variant, memory].filter(Boolean).join('|');
  }

  /* ── Motherboards ─────────────────────────────────────────────────────── */
  /**
   * A chipset is NOT the model.
   *
   * Keying on brand + chipset + generic line words merged five different ASUS
   * boards (PRIME Z790-P, H610M-A, B760-PLUS D4, B860M-A-CSM, …) into ONE price
   * group — measured with scripts/measure-grouping.mjs against the live
   * catalogue, which is how the merge was found.
   *
   * The board CODE is the model, and its suffix is the part that differs:
   * PRIME B650M-K ≠ PRIME B650M-R ≠ PRIME B650M-A II. A brand word ("Intel") is
   * not a code, and a case that merely "supports ... Motherboards" is not a board
   * (the caller has already excluded the case category, but ``line`` never
   * matches a real board name).
   */
  if (/\b(motherboard|mainboard|atx|matx|itx)\b/.test(n) || /\bx?[bza]\d{3}[a-z]*\b/.test(n)) {
    /**
     * The board CODE, never the socket.
     *
     * The generic `[a-z]{2,5}\d{3}` shape matched "lga1700" — the socket every
     * LGA1700 board shares — so ASUS PRIME Z790-P, H610M-A, B760-PLUS and
     * B860M-A collapsed into ONE price group and one board's price appeared under
     * another's name. Measured by scripts/measure-grouping.mjs after the previous
     * fix: 5 listings in one group.
     *
     * A chipset is a letter set plus three digits (Z790, B650, H610M, X870E), and
     * the suffix after it is part of the model (B650M-K ≠ B650M-R). Socket names
     * (LGA1700/AM5) and the Intel/AMD brand words are excluded explicitly.
     */
    const board =
      firstNumber(n, /\b([xbza]\d{3}[a-z]{0,3}(?:[-\s][a-z0-9]{1,4})?)\b/) ??
      firstNumber(n, /\b([a-z]{2,5}\d{3}[a-z0-9]{0,6})\b/);
    if (!board || /^(lga\d{3,4}|am[45]|intel|amd|nvidia|geforce|radeon|ddr[45])$/.test(board)) return null;

    const brand = firstNumber(n, /\b(asus|msi|gigabyte|asrock|biostar|evga|nzxt|aorus)\b/) || 'generic';
    const family = firstNumber(
      n,
      /\b(rog strix|rog crosshair|rog maximus|tuf gaming|prime|proart|aorus|aero|master|elite|tomahawk|mag|mpg)\b/,
    );

    return ['mb', brand, board, family].filter(Boolean).join('|');
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
  /**
   * Choose the label that distinguishes this group from its siblings — not just
   * the shortest name.
   *
   * Measured on the live catalogue: "GIGABYTE GeForce RTX 5070 Ti EAGLE OC SFF
   * 16G – Blackwell Architecture…" and "… WINDFORCE OC SFF 16G – NVIDIA
   * Blackwell GPU…" are two different cards, but a two-line clamp cut both at
   * "GIGABYTE RTX 5070 TI", so the grid showed what looked like a duplicate with
   * two prices. `groupLabel` therefore prefers a name whose board-partner line
   * (EAGLE / WINDFORCE / TUF / SUPRIM …) appears EARLY — inside the part a card
   * actually displays — before falling back to brevity.
   */
  const MARKETING = /\b(blackwell architecture|nvidia blackwell gpu|graphics card|gaming graphics|oc edition|architecture)\b/i;

  /**
   * Brevity is the tie-breaker ONLY, never the leader: a short name is easier to
   * read, but two short names that share an opening can describe different
   * products. `partnerKey` therefore wins when it is present and early, and
   * length decides between two otherwise equal candidates.
   */
  const scored = names
    .map((name) => {
      const partner = partnerKey(name).split('|').filter(Boolean).pop() ?? '';
      const partnerAt = partner ? name.toLowerCase().indexOf(partner) : -1;
      // A distinguishing word within the first ~42 characters survives the clamp
      // (the card truncates at two lines).
      const early = partnerAt >= 0 && partnerAt < 42;
      const noise = (name.match(MARKETING) ?? []).length;

      return {
        name,
        // 1st: the board-partner line, early. 2nd: brevity (0..~2). 3rd: a model
        // number present. Marketing tail is a penalty, not a filter.
        score: (early ? 10 : 0) - name.length / 60 - noise * 2 + (/\d/.test(name) ? 0.5 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.name ?? names[0] ?? '';
}

/** Query normalisation shared by search + grouping. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}
