import type { ComponentCategory } from '@/types/components';

/**
 * What a listing IS, decided from its URL and title — never from keywords alone.
 *
 * ── The bug this replaces ───────────────────────────────────────────────────
 * Listings were filed by `classifyByName`: a fan named "Corsair iCUE H100i Elite
 * CPU Liquid Cooler" contains "CPU" and landed in the CPU bucket, a chassis that
 * advertised "420mm GPU clearance" landed in GPUs. Selecting the CPU filter then
 * showed fans and thermal paste, and the GPU filter showed cases.
 *
 * A product name is marketing copy. The store's own classification is the URL
 * it published the product under, and that is what wins here:
 *
 *   /product-category/graphics-card/…  → gpu
 *   /vga, /gpu                         → gpu
 *   /processors, /cpu                  → cpu
 *   /cpu-cooler, /fans-coolers         → cooling   (checked BEFORE /cpu)
 *   /pc-cases, /chassis                → case      (checked BEFORE /gpu)
 *
 * The name is used only when the URL carries no signal at all.
 *
 * The same rules exist in `scripts/reclassify-catalogue.mjs` (which rewrites the
 * scraped snapshot) and in `supabase/functions/retailer-sync/parsers.ts` (which
 * files new rows at write time). `src/services/retailers/__tests__/categoryFromUrl.test.ts`
 * keeps them honest against real retailer URLs.
 */

export type CategorySignal = ComponentCategory | '';

/**
 * Collection-path rules, ordered.
 *
 * The order is the whole point: "cpu-cooler" must reach `cooling` before the
 * `cpu` rule sees it, and a "gpu-ready" chassis must reach `case` before `gpu`.
 *
 * Anchored on path SEPARATORS, so a brand word cannot win: "cooler-master-…" is
 * not a cooling product because the company is called Cooler Master, and
 * "…-case-fan" is a fan because `/fans?/` matches after the brand.
 */
const PATH_RULES: ReadonlyArray<readonly [RegExp, ComponentCategory]> = [
  [
    /(?:^|\/)chassis(?:\/|$)|(?:^|\/)pc[-_]?cases?(?:\/|$)|(?:^|\/)cases?(?:\/|$)/,
    'case',
  ],
  [
    /cpu[-_]?coolers?(?:\/|$)|(?:^|\/)cooling(?:\/|$)|(?:^|\/)coolers?(?:\/|$)|water[-_]?cooling|liquid[-_]?cool(?:ing)?|(?:^|\/)aio(?:\/|$)|(?:^|\/)fans?(?:\/|$)|fans[-_]?coolers(?:\/|$)|heatsinks?(?:\/|$)|air[-_]?cooling/,
    'cooling',
  ],
  [
    /(?:^|\/)graphics?[-_]?cards?(?:\/|$)|(?:^|\/)graphics?(?:\/|$)|(?:^|\/)vga(?:\/|$)|(?:^|\/)gpus?(?:\/|$)|video[-_]?cards?(?:\/|$)/,
    'gpu',
  ],
  [
    /(?:^|\/)processors?(?:\/|$)|(?:^|\/)cpus?(?:\/|$)|cpu[-_]?processor(?:\/|$)|microprocessor(?:\/|$)/,
    'cpu',
  ],
  [/(?:^|\/)motherboards?(?:\/|$)|mainboards?(?:\/|$)/, 'motherboard'],
  /**
   * CHIPSETS BEFORE CPUs.
   *
   * A board is named by the CPU it supports: "GIGABYTE Z890 AORUS Master Intel
   * Core Ultra (Series 2) LGA 1851 Motherboard" and "ROG STRIX B860-G GAMING WIFI
   * | Intel Core Ultra 1851 Micro-ATX …". The CPU rule matched first and filed
   * three boards as processors — measured in `verify-catalogue-categories`.
   *
   * A chipset is a letter set plus three digits, with an optional board suffix.
   */
  [/\b(?:x870|b850|x670|b650|a620|x570|b550|a520|z890|b860|h810|z790|b760|h770|h710|z690|b660|h610|wrx80|trx40|x399|b840)[a-z]{0,2}\b/i, 'motherboard'],
  [/(?:^|\/)ram(?:\/|$)|desktop[-_]?memory(?:\/|$)|(?:^|\/)memory(?:\/|$)/, 'ram'],
  [
    /(?:^|\/)storage(?:\/|$)|(?:^|\/)ssds?(?:\/|$)|(?:^|\/)hdd(?:\/|$)|hard[-_]?drives?(?:\/|$)|(?:^|\/)nvme(?:\/|$)/,
    'storage',
  ],
  [/power[-_]?suppl(?:y|ies)(?:\/|$)|(?:^|\/)psus?(?:\/|$)/, 'psu'],
];



/**
 * Category from a product URL.
 *
 * Only the COLLECTION part of the path is considered. On WooCommerce / OpenCart
 * the final segment is the product slug, which is just the name with dashes — so
 * "…/en/product/pny-geforce-rtx-5070-ti-argb-overclocked-triple-fan…/" must not
 * be read as `cooling` because of "fan", and "…/cases/corsair-6500d-…" must be
 * read as `case` from the `cases` prefix and not from the slug.
 */
export function categoryFromUrl(url: string | null | undefined): CategorySignal {
  if (!url) return '';

  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Not absolute — treat the input as a path. A bare word has no signal.
    pathname = url.split('?')[0] ?? url;
    if (!pathname.includes('/')) return '';
  }

  const segments = pathname.toLowerCase().split('/').filter(Boolean);
  if (segments.length === 0) return '';

  /**
   * `/product-category/<collection>/` and `/category/<collection>` are
   * COLLECTION pages: the segment AFTER the marker is the category.
   *
   * Checked first because a collection is the store explicitly naming a
   * category — stronger evidence than a page category deeper in the path.
   */
  const collectionAt = segments.findIndex((segment) => /^(product-category)$/.test(segment));
  if (collectionAt >= 0) {
    const slug = segments[collectionAt + 1] ?? '';
    for (const [pattern, category] of PATH_RULES) {
      if (pattern.test(`/${slug}/`)) return category;
    }
    // A collection that names no category (`/product-category/featured/`) is not
    // a product path: classify from its own slug rather than guessing.
    return categoryFromTitleLike(slug.replace(/[-_]+/g, ' '));
  }

  /**
   * Walk the path FORWARD and take the first segment that names a category.
   *
   * Forward, not "last segment": `/gpu/msi-geforce-rtx-5070-ti-gaming-trio…`
   * keeps the listing next to its category, while the slug — the product name
   * with dashes — is never consulted.
   */
  const productAt = segments.findIndex((segment) => /^(product|products|item|items)$/.test(segment));

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? '';
    // The last segment of a nested product path IS the slug.
    if (segments.length > 1 && index === segments.length - 1) break;
    if (productAt >= 0 && index > productAt) break; // everything after /product/

    for (const [pattern, category] of PATH_RULES) {
      if (pattern.test(`/${segment}/`)) return category;
    }
  }

  /**
   * A FLAT path is a slug — Elbadr publishes `/<product-name>` — so there is no
   * segment left to read and the listing keeps the category of the page it was
   * scraped from.
   *
   * The slug is deliberately NOT classified. Measured on the live catalogue it
   * is wrong often enough to matter: "Cooler Master HAF 700 EVO Full Tower Case"
   * (a chassis, but the company is called Cooler Master), "AMD Ryzen 5 5600 with
   * Wraith Stealth Fan" (a CPU, but it ships with a fan), "RTX 5090 LIGHTNING Z
   * Liquid Cooled GPU". The page category is the store's own classification and
   * has none of those ambiguities.
   */
  return '';
}

/**
 * Title-only fallback.
 *
 * Order and anchoring were both decided by measuring the live catalogue:
 *
 *  · A CHASSIS IS NOT A PSU. "Tortox Zion ATX/ITX Gaming PC Case – Includes 350W
 *    Power Supply" is a case; the wattage describes what ships inside it.
 *  · AN APU IS NOT A GPU. "AMD Ryzen 5 3400G … with Radeon RX Vega 11" is a
 *    processor.
 *  · A DRIVE WITH A HEATSINK IS STORAGE. "WD_BLACK SN850X 2TB with Heatsink".
 *  · A LIQUID-COOLED CARD IS A GPU. "RTX 5090 LIGHTNING Z Liquid Cooled GPU".
 *  · A BRAND IS NOT A CATEGORY. "COOLER MASTER", "GIGABYTE" — matched words are
 *    anchored (`\b`) and the case rules come before the cooler rules.
 *  · A CHASSIS IS DESCRIBED BY CLEARANCE. "(AIR Up To 162mm)(VGA Up To 450mm)"
 *    is what fits inside a case, never what a graphics card needs.
 *
 * Anything it cannot name returns '' and the caller keeps the listing's page
 * category — a wrong guess is worse than an inherited truth.
 */
/**
 * Case clearance vocabulary.
 *
 * A chassis is described by what fits IN it: "(AIR Up To 162mm)(VGA Up To
 * 450mm)" is cooler and card clearance. A graphics card never states the case it
 * needs, so these phrases identify a chassis even when the word "case" is absent
 * — measured on an Aerocool P500C listing that was filed as a GPU.
 */
const CHASSIS_CLEARANCE = /\b(?:AIR|VGA|GPU|Cooler|Radiator)\s+Up\s+To\b/i;

const TITLE_RULES: ReadonlyArray<readonly [RegExp, ComponentCategory]> = [
  [
    /\b(cases?|chassis|mid[- ]?tower|full[- ]?tower|mini[- ]?tower)\b|\bpc case\b|\bMMA\b|\b(?:E-?ATX|Micro-?ATX|mATX|Mini-?ITX)\b[^|]{0,160}?\b(?:support|ready|case|chassis)\b/i,
    'case',
  ],
  /**
   * COOLING BEFORE CHIPSETS.
   *
   * A cooler model number can look exactly like a chipset: "ID-COOLING FROZN
   * **A620** PRO" matched the AM5 `A620` rule and eight coolers were filed as
   * motherboards. A product that names itself a cooler/fan/heatsink IS one, before
   * any chipset pattern is considered.
   */
  [
    /\b(cpu )?(air |liquid )?cooler\b|\bheatsink\b|\bheatpipe\b|\bdual tower\b|\bsingle tower\b|\d+\s?mm (?:pwm |rgb |argb )?fan\b|\brgb fan\b|\bcase fan\b/i,
    'cooling',
  ],
  [/\b(nvme|solid state drive|hard drive|hdd)\b/i, 'storage'],
  [/\b(graphics card|geforce (?:rtx|gtx)|radeon (?:rx|pro)|intel arc|arc a\d{3})\b/i, 'gpu'],
  [/\b(power supply|psu)\b|\b80 ?plus\b/i, 'psu'],
  [
    /(?:\((?:zen|radeon)\s*\d+(?:m)?\)|\bryzen\b)|\bprocessor\b|\bcore (?:i[3579]|ultra)\b|\bthreadripper\b/i,
    'cpu',
  ],
  [/\bmotherboards?\b|\bmainboards?\b/i, 'motherboard'],
  [
    /\bcpu (?:liquid |air )?cooler\b|\bliquid cooler\b|\bliquid cooled\b|\b(?:aio|liquid|air) (?:cpu )?cooler\b|\bheatsink\b/i,
    'cooling',
  ],
  [/\bddr[345]\b/i, 'ram'],
];

/**
 * Case-insensitive, and deliberately NOT lower-cased into a single blob: the
 * rules are written for the shape real titles have, including brand casing
 * ("COOLER MASTER", "AMD Ryzen").
 *
 * A GPU MODEL WITHOUT ITS NOUN still needs catching — "Palit RTX 5070 Ti GamingPro
 * S 16GB" never says "graphics card" — so a bare RTX/GTX/RX model number is
 * accepted, but only AFTER the chassis rule has had its chance.
 */
function categoryFromTitleLike(text: string): CategorySignal {
  const name = (text ?? '').trim();
  if (!name) return '';

  // Case clearance vocabulary: "(AIR Up To 162mm)(VGA Up To 450mm)".
  if (CHASSIS_CLEARANCE.test(name)) return 'case';

  for (const [pattern, category] of TITLE_RULES) {
    if (pattern.test(name)) return category;
  }
  // Last: a bare RTX/GTX/RX model number — checked AFTER the chassis rule so a
  // case that names its VGA clearance is not read as a graphics card.
  if (/\b(?:rtx|gtx|radeon rx|rx)\s?\d{3,4}[a-z]*\b/i.test(name)) return 'gpu';
  return '';
}

export function categoryFromTitle(title: string): CategorySignal {
  // A cooler always names itself a cooler, a chassis a case: the noun wins over
  // a marketing mention of "CPU" or "GPU" further along the string.
  return categoryFromTitleLike(title);
}

/**
 * Accessories are not components.
 *
 * Retailer category pages mix them in: a "Vertical GPU Holder Kit" is listed
 * under Graphics Cards, an "Anti-Bend CPU Frame" under Processors, and a
 * "Water-Cooling Radiator Support Bracket" under Cooling. They are real listings
 * at real prices, so they survive every URL and page rule, and the landing page
 * featured an anti-bend frame as "CPU" before this check existed.
 *
 * Matched on multi-word phrases only ("mount" alone is a legitimate GPU mount
 * that ships WITH a case; "kit" alone appears in real cooler names).
 */
const ACCESSORY =
  /\b(holder|anti-?bend(?:ing)?|bend(?:ing)? frame|contact frame|riser cable|support bracket|vertical (?:gpu )?(?:mount|holder|bracket)|mounting kit|thermal (?:pad|paste|grease)|cleaning kit|screwdriver|thumb screws?)\b/i;

/**
 * The category a listing belongs to: URL, then title, then whatever the scraper
 * recorded (the store's own page), then `fallback`.
 *
 * Returns '' for an accessory: the caller drops the row rather than filing it in
 * a bucket where a shopper would see a mounting bracket where a graphics card
 * should be.
 */
export function resolveCategory(input: {
  url?: string | null;
  title?: string | null;
  stored?: string | null;
  fallback?: ComponentCategory | null;
}): CategorySignal {
  if (ACCESSORY.test(input.title ?? '')) return '';

  if (
    /\bmainboards?\b/i.test(input.title ?? '') &&
    !/\b(cases?|chassis|mid[- ]?tower|full[- ]?tower)\b/i.test(input.title ?? '')
  ) {
    return 'motherboard';
  }

  /**
   * CHIPSETS BEFORE CPUs (read time, mirrors the snapshot script).
   *
   * A board is named by the CPU it supports: "GIGABYTE Z890 AORUS Master Intel
   * Core Ultra (Series 2) LGA 1851 Motherboard" — the CPU rule matched first and
   * three boards were served as processors.
   */
  const chipsetTitle = input.title ?? '';
  if (
    /\b(?:x870|b850|x670|b650|a620|x570|b550|a520|z890|b860|h810|z790|b760|h770|h710|z690|b660|h610|wrx80|trx40|x399|b840)[a-z]{0,2}\b/i.test(
      chipsetTitle,
    ) &&
    !/\b(cases?|chassis|mid[- ]?tower|full[- ]?tower)\b/i.test(chipsetTitle) &&
    // A cooler's model number is not a chipset: "FROZN A620 PRO" is a heatsink.
    !/\b(cooler|heatsink|heatpipe|fan)\b/i.test(chipsetTitle)
  ) {
    return 'motherboard';
  }

  const fromUrl = categoryFromUrl(input.url);
  if (fromUrl) return fromUrl;

  const fromTitle = categoryFromTitle(input.title ?? '');
  if (fromTitle) return fromTitle;

  const stored = (input.stored ?? '').toLowerCase() as CategorySignal;
  if (stored) return stored;

  return input.fallback ?? '';
}
