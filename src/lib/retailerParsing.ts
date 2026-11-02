/**
 * Shared retailer-parsing primitives.
 *
 * Lives in `src/` (not the Edge Function folder) because it is used by BOTH:
 *   · the `retailer-sync` Edge Function (`supabase/functions/retailer-sync`)
 *   · the offline snapshot builder (`scripts/snapshot-retailers.mjs`)
 *   · the aggregator's local fallback (`services/retailers/aggregator.ts`)
 *
 * Keeping one copy is the point: a price parser that disagrees with itself
 * between the scraper and the client is how subtly wrong prices ship.
 */

/**
 * Parse an Egyptian price.
 *
 * Handles `6,799 EGP`, `EGP 129,000.00`, `٦٬٧٩٩ ج.م` (Arabic-Indic digits) and
 * `12.500,50` (European ordering). Returns null when the text is not a price, so
 * callers skip the row instead of inserting a zero that would win every
 * "cheapest" comparison.
 */
export function parseEgpPrice(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Normalise Arabic-Indic digits to ASCII before any numeric work, and drop
  // the Arabic thousands separator (U+066C) and decimal separator (U+066B) —
  // otherwise "٦٬٧٩٩" parses as 6.
  const normalised = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066C/g, ',')
    .replace(/\u066B/g, '.');

  const captured = /(\d[\d.,]*)/.exec(normalised)?.[1];
  if (!captured) return null;

  let digits = captured;

  // "12.500,50" → thousands '.' and decimal ',' (European ordering)
  if (/,\d{1,2}$/.test(digits)) digits = digits.replace(/\./g, '').replace(',', '.');
  // "6,799" or "6,799.00" → ',' is a thousands separator
  else digits = digits.replace(/,/g, '');

  const value = Number.parseFloat(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Significant tokens: lowercased, punctuation stripped, marketing noise removed. */
const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'gaming',
  'edition',
  'new',
  'original',
  'lhr',
  'graphics',
  'card',
  'processor',
  'tray',
  'box',
  'retail',
  'gt',
  'series',
  'super',
  'ti',
  'xt',
  'xtx',
  'oc',
  'mb',
  'gb',
  'khz',
  'mhz',
  'core',
  'thread',
  'threads',
  'desktop',
  'unlocked',
  'mpk',
  'ddr4',
  'ddr5',
  'ddr6',
  'gddr6',
  'gddr7',
  'rgb',
  'argb',
  'white',
  'black',
  'fan',
  'fans',
  // Arabic equivalents, because Alfrensia lists some parts in Arabic.
  'كارت',
  'شاشة',
  'معالج',
  'ذاكرة',
  'مزود',
  'طاقة',
  'اصلية',
  'جديد',
]);

function tokenise(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Tokens containing a digit: "RTX 4070" → ["4070"], "7800X3D" → ["7800x3d"]. */
const modelTokens = (name: string): string[] => tokenise(name).filter((t) => /\d/.test(t));

/**
 * Score a scraped product name against a catalogue name, 0..1.
 *
 * Two signals, because either alone publishes wrong prices:
 *   · COVERAGE — share of the catalogue's tokens present in the product name.
 *                Tolerates marketing suffixes ("MPK", "ARGB", "OC Edition").
 *   · MODEL    — model identifiers must match EXACTLY and the product must not be
 *                a variant. Verified against live listings:
 *                  · substring matched "7800x3d" (Ryzen) to "7800" (Radeon)
 *                  · prefix matched "14900kf" (no iGPU) to "14900k"
 *                A CPU/GPU SKU is an exact identifier; anything else is a
 *                different product with a different price.
 *
 * A failed model gate multiplies the score by 0.3 so it can never clear 0.5.
 */
export function scoreNameMatch(productName: string, catalogueName: string): number {
  const productTokens = new Set(tokenise(productName));
  const catalogueTokens = tokenise(catalogueName);
  if (!catalogueTokens.length) return 0;

  let covered = 0;
  for (const token of catalogueTokens) if (productTokens.has(token)) covered += 1;
  const coverage = covered / catalogueTokens.length;

  const catalogueModels = modelTokens(catalogueName);
  const productModels = new Set(modelTokens(productName));

  const modelMatch = catalogueModels.every((m) => productModels.has(m));
  const variant = catalogueModels.some((m) => [...productModels].some((p) => p !== m && p.startsWith(m)));

  return modelMatch && !variant ? coverage : coverage * 0.3;
}

/** Shared match threshold — anything below this is not shown as a price. */
export const MIN_MATCH_CONFIDENCE = 0.5;

/**
 * Infer the real category from a product NAME.
 *
 * Retailers mix categories inside one listing (Elbadr's `/cpu` page returns
 * monitors, external SSDs and processors). Returning `''` means "not a component
 * we carry" and the caller must drop the row.
 *
 * CPU is checked before GPU on purpose: AMD APUs are named
 * "Ryzen 5 8600G (Zen 4 & Radeon 760M)", so a GPU-first rule files a processor
 * under GPUs.
 */
export function classifyByName(name: string, fallback: string): string {
  const n = name.toLowerCase();

  // Accessories and monitors are not catalogue components (the enum has 8 PC parts).
  if (
    /\b(mouse|keyboard|gamepad|controller|headset|headphone|webcam|speaker|mousemat|mouse pad|hub|adapter|cable|chair|desk)\b/.test(
      n,
    )
  ) {
    return '';
  }
  if (/\bmonitor\b|\bdisplay\b|\bscreen\b/.test(n)) return '';

  if (/\b(cpu|processor|ryzen|core i[3579]|core ultra|threadripper|xeon)\b/.test(n)) return 'cpu';
  // PSU before GPU: "Corsair RM850x 850W 80 Plus Gold" has no GPU keyword, but a
  // naive fallthrough filed it under whatever page it was listed on.
  if (/\b(psu|power supply|watt|80\s*plus|80\+)/.test(n)) return 'psu';
  if (/\b(gpu|graphics card|geforce|radeon|rtx|gtx|arc a\d|vga)\b/.test(n)) return 'gpu';
  if (/\b(motherboard|mainboard|b650|x670|z790|b760|a620|chipset)\b/.test(n)) return 'motherboard';
  if (/\b(nvme|ssd|hdd|hard drive|solid state)\b/.test(n)) return 'storage';
  if (/\b(ddr[345]|dimm|memory kit)\b/.test(n)) return 'ram';
  if (/\b(psu|power supply|watt|80\+)\b/.test(n)) return 'psu';
  if (/\b(case|chassis|tower)\b/.test(n)) return 'case';
  if (/\b(cooler|aio|liquid cooling|heatsink|fan)\b/.test(n)) return 'cooling';

  return fallback;
}

/**
 * Minimal robots.txt evaluation for the paths we actually request.
 *
 * Only the `User-agent: *` group is honoured (none of the four retailers names a
 * bot policy). Disallow rules are prefix matches.
 */
export function isAllowed(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let inStarGroup = false;
  const disallow: string[] = [];

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') inStarGroup = value === '*';
    else if (key === 'disallow' && inStarGroup && value) disallow.push(value);
  }

  return !disallow.some((rule) => path.startsWith(rule));
}
