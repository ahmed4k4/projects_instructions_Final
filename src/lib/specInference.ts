/**
 * Spec inference for scraped Egyptian listings.
 *
 * ── Why infer instead of scrape ─────────────────────────────────────────────
 * The builders' compatibility engine needs numbers retailers do not publish in
 * a list view: GPU length (does it fit the case?), TDP (is the PSU big enough?),
 * CPU socket (does it match the board?). Phase 14 measured that only ~2 % of
 * listing names carry a card length, so a catalogue built from retailer titles
 * could not answer a single compatibility question — which is why the builder
 * kept a hand-authored sample set.
 *
 * Most of what the engine needs is a property of the CHIP, though, not of the
 * board partner's cooler shroud: every RTX 5070 Ti is a GB203 with 16 GB and the
 * same nominal power. The model number in the title is enough to look that up,
 * and the few genuinely per-model numbers (card length, cooler height) are
 * estimated from the board partner's line with a stated margin.
 *
 * Every inferred value is written with the confidence it deserves:
 *
 *   source: 'inferred'      — from the chip/model table below
 *   confidence: 'high'      — the model number is unambiguous (socket, VRAM, TDP)
 *   confidence: 'estimated' — a physical dimension guessed from the product line
 *
 * Nothing here invents a value where the shape of the data does not support one;
 * the function returns `{}` and the UI simply shows fewer chips.
 */

export type SpecConfidence = 'high' | 'estimated';

export interface InferredSpecs {
  [key: string]: unknown;
  /** Where the values came from, so the UI can label them honestly. */
  specSource?: 'inferred';
  specConfidence?: SpecConfidence;
}

interface ChipSpec {
  /** Nominal board power (W). */
  tdp: number;
  /** Reference VRAM in GB, when the memory size is part of the model. */
  vram?: number;
  /** Recommended system PSU in W. */
  recommendedPsu?: number;
  /** Reference card length in mm; board partners vary by ±25 mm. */
  length?: number;
  slotWidth?: number;
}

/* -------------------------------------------------------------------------- */
/*  GPUs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * NVIDIA RTX 50/40/30 series. `tdp` is the reference board power; partner cards
 * stay within ±10 % and the PSU recommendation already carries headroom.
 *
 * 16-pin cards (40-series and up) are listed with the connector string the
 * compatibility rule reads.
 */
const GEFORCE: Array<{ pattern: RegExp; spec: ChipSpec; connectors: string }> = [
  {
    pattern: /\b(?:rtx\s?)?5090\b/i,
    spec: { tdp: 575, vram: 32, recommendedPsu: 1000, length: 304, slotWidth: 3 },
    connectors: '1x 16-pin (12V-2x6)',
  },
  {
    pattern: /\b(?:rtx\s?)?5080\b/i,
    spec: { tdp: 360, vram: 16, recommendedPsu: 850, length: 304, slotWidth: 3 },
    connectors: '1x 16-pin (12V-2x6)',
  },
  {
    pattern: /\b(?:rtx\s?)?5070\s?ti\s?super\b/i,
    spec: { tdp: 300, vram: 16, recommendedPsu: 750, length: 300, slotWidth: 3 },
    connectors: '1x 16-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?5070\s?ti\b/i,
    spec: { tdp: 300, vram: 16, recommendedPsu: 750, length: 300, slotWidth: 3 },
    connectors: '1x 16-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?5070\b/i,
    spec: { tdp: 250, vram: 12, recommendedPsu: 650, length: 290, slotWidth: 2 },
    connectors: '1x 16-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?5060\s?ti\b/i,
    spec: { tdp: 180, vram: 16, recommendedPsu: 600, length: 270, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?5060\b/i,
    spec: { tdp: 145, vram: 8, recommendedPsu: 550, length: 245, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?4090\b/i,
    spec: { tdp: 450, vram: 24, recommendedPsu: 850, length: 336, slotWidth: 3 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4080\s?super\b/i,
    spec: { tdp: 320, vram: 16, recommendedPsu: 750, length: 310, slotWidth: 3 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4080\b/i,
    spec: { tdp: 320, vram: 16, recommendedPsu: 750, length: 304, slotWidth: 3 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4070\s?ti\s?super\b/i,
    spec: { tdp: 285, vram: 16, recommendedPsu: 700, length: 305, slotWidth: 3 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4070\s?ti\b/i,
    spec: { tdp: 285, vram: 12, recommendedPsu: 700, length: 305, slotWidth: 3 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4070\s?super\b/i,
    spec: { tdp: 220, vram: 12, recommendedPsu: 650, length: 270, slotWidth: 2 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4070\b/i,
    spec: { tdp: 200, vram: 12, recommendedPsu: 650, length: 270, slotWidth: 2 },
    connectors: '1x 16-pin (12VHPWR)',
  },
  {
    pattern: /\b(?:rtx\s?)?4060\s?ti\b/i,
    spec: { tdp: 160, vram: 8, recommendedPsu: 550, length: 245, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?4060\b/i,
    spec: { tdp: 115, vram: 8, recommendedPsu: 550, length: 200, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3090\b/i,
    spec: { tdp: 350, vram: 24, recommendedPsu: 750, length: 313, slotWidth: 3 },
    connectors: '1x 12-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3080\b/i,
    spec: { tdp: 320, vram: 10, recommendedPsu: 750, length: 285, slotWidth: 3 },
    connectors: '1x 12-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3070\s?ti\b/i,
    spec: { tdp: 290, vram: 8, recommendedPsu: 750, length: 267, slotWidth: 2 },
    connectors: '1x 12-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3070\b/i,
    spec: { tdp: 220, vram: 8, recommendedPsu: 650, length: 242, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3060\s?ti\b/i,
    spec: { tdp: 200, vram: 8, recommendedPsu: 600, length: 242, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3060\b/i,
    spec: { tdp: 170, vram: 12, recommendedPsu: 550, length: 242, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\b(?:rtx\s?)?3050\b/i,
    spec: { tdp: 130, vram: 8, recommendedPsu: 450, length: 200, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
];

/** AMD RDNA 3/4 consumer cards, as sold in Egypt. */
const RADEON: Array<{ pattern: RegExp; spec: ChipSpec; connectors: string }> = [
  {
    pattern: /\brx\s?9070\s?xt\b/i,
    spec: { tdp: 304, vram: 16, recommendedPsu: 750, length: 270, slotWidth: 3 },
    connectors: '2x 8-pin',
  },
  {
    pattern: /\brx\s?9070\b/i,
    spec: { tdp: 220, vram: 16, recommendedPsu: 700, length: 267, slotWidth: 2 },
    connectors: '2x 8-pin',
  },
  {
    pattern: /\brx\s?9060\s?xt\b/i,
    spec: { tdp: 160, vram: 16, recommendedPsu: 600, length: 245, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
  {
    pattern: /\brx\s?7900\s?xtx\b/i,
    spec: { tdp: 355, vram: 24, recommendedPsu: 800, length: 287, slotWidth: 3 },
    connectors: '2x 8-pin',
  },
  {
    pattern: /\brx\s?7900\s?xt\b/i,
    spec: { tdp: 315, vram: 20, recommendedPsu: 800, length: 287, slotWidth: 3 },
    connectors: '2x 8-pin',
  },
  {
    pattern: /\brx\s?7800\s?xt\b/i,
    spec: { tdp: 263, vram: 16, recommendedPsu: 700, length: 267, slotWidth: 2 },
    connectors: '2x 8-pin',
  },
  {
    pattern: /\brx\s?7700\s?xt\b/i,
    spec: { tdp: 245, vram: 12, recommendedPsu: 650, length: 267, slotWidth: 2 },
    connectors: '2x 8-pin',
  },
  {
    pattern: /\brx\s?7600\b/i,
    spec: { tdp: 165, vram: 8, recommendedPsu: 550, length: 204, slotWidth: 2 },
    connectors: '1x 8-pin',
  },
];

/** Intel Arc (the A-series cards sold here are A750/A770/A380). */
const ARC: Array<{ pattern: RegExp; spec: ChipSpec; connectors: string }> = [
  {
    pattern: /\barc\s?a770\b/i,
    spec: { tdp: 225, vram: 8, recommendedPsu: 650, length: 268, slotWidth: 2 },
    connectors: '1x 8-pin + 1x 6-pin',
  },
  {
    pattern: /\barc\s?a750\b/i,
    spec: { tdp: 225, vram: 8, recommendedPsu: 650, length: 268, slotWidth: 2 },
    connectors: '1x 8-pin + 1x 6-pin',
  },
  {
    pattern: /\barc\s?a380\b/i,
    spec: { tdp: 75, vram: 6, recommendedPsu: 350, length: 200, slotWidth: 2 },
    connectors: 'none',
  },
];

/**
 * Board-partner line → length adjustment in mm.
 *
 * The reference length is the Founders/Reference card; a "Suprim", "Strix" or
 * "AORUS Master" cooler is longer, a "Ventus 2X" or "Dual" is shorter. These are
 * estimates and are marked as such.
 */
const LENGTH_DELTA: Array<[RegExp, number]> = [
  [/\b(suprim|lightning|astral|master|strix|nitro|toxic|red devil|mercury|amp extreme)\b/i, 25],
  [/\b(tuf|gaming oc|gamingpro|windforce|eagle|trinity|hellhound|pulse)\b/i, 10],
  [/\b(ventus|dual|twin fan|2x|mini|low profile|low-profile)\b/i, -25],
];

function specFor(name: string): { spec: ChipSpec; connectors: string; vram?: number } | null {
  for (const entry of GEFORCE) {
    if (entry.pattern.test(name)) return { spec: entry.spec, connectors: entry.connectors };
  }
  for (const entry of RADEON) {
    if (entry.pattern.test(name)) return { spec: entry.spec, connectors: entry.connectors };
  }
  for (const entry of ARC) {
    if (entry.pattern.test(name)) return { spec: entry.spec, connectors: entry.connectors };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  CPUs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * AMD AM5 first (Ryzen 9000/8000/7000), then AM4 (5000/4000/3000).
 *
 * The socket is a property of the model number: every "7xxx" is AM5, every
 * "5xxx" that is not a 5600X3D-class part is AM4. DDR generation follows the
 * socket on AMD, which is what the cpu_ram_type rule compares.
 */
const AMD_CPU: Array<{
  pattern: RegExp;
  socket: string;
  ramType: string;
  tdp: number;
  cores: number;
  threads: number;
  boost: number;
}> = [
  /**
   * Ryzen 9000-series first, by MISSION, not by a hardcoded list.
   *
   * The table used to enumerate `9xxx / 8xxx / 7xxx / 5xxx / 4xxx / 3xxx`, which
   * silently missed models the retailers actually sell — 9850X3D, 9800X3D,
   * 9950X3D, 7500X3D — and every Ryzen™ title (the trademark glyph breaks a
   * `\bryzen\b` boundary). Two facts decide the platform for ANY 4-digit model:
   *
   *   · 7xxx and above (Zen 4/5, incl. 9xxx) → AM5 / DDR5
   *   · 5xxx and below (Zen 2/3)            → AM4 / DDR4
   *
   * `[\s™®]*` after the brand absorbs "Ryzen™", `(?:pro[\s]*)?` absorbs the
   * enterprise "Ryzen 5 PRO 5650G" / "Threadripper PRO 9975WX" spelling, and
   * `[\s]*` before the model absorbs "9900X3D" written without a space.
   */
  {
    pattern: /\bryzen[\s™®]*[3579][\s™®]*(?:pro[\s]+)?([789]\d{3})[a-z0-9]*\b/i,
    socket: 'AM5',
    ramType: 'DDR5',
    tdp: 120,
    cores: 8,
    threads: 16,
    boost: 5.2,
  },
  {
    pattern: /\bryzen[\s™®]*[3579][\s™®]*(?:pro[\s]+)?([3-6]\d{3})[a-z0-9]*\b/i,
    socket: 'AM4',
    ramType: 'DDR4',
    tdp: 105,
    cores: 6,
    threads: 12,
    boost: 4.6,
  },
  {
    /** Threadripper / Threadripper PRO — sTR5 (7000) and sTRX4 (5000). */
    pattern: /\b(?:ryzen\s+)?threadripper(?:\s+pro)?\s*[\s-]*(?:7\d{3}|\d{4,5})[a-z]*\b/i,
    socket: 'sTR5',
    ramType: 'DDR5',
    tdp: 280,
    cores: 24,
    threads: 48,
    boost: 5.3,
  },
  {
    pattern: /\b(?:ryzen\s+)?threadripper(?:\s+pro)?\s*5\d{3}/i,
    socket: 'sTRX4',
    ramType: 'DDR4',
    tdp: 280,
    cores: 16,
    threads: 32,
    boost: 4.5,
  },
];

/**
 * Intel: the socket follows the generation prefix, which is in the model number.
 *
 * Core Ultra (LGA1851) → Core 14th (LGA1700) → 13th (LGA1700) → 12th (LGA1700)
 * → 11th (LGA1200) → 10th (LGA1200).
 */
const INTEL_CPU: Array<{ pattern: RegExp; socket: string; ramType: string; tdp: number; gen: number }> = [
  { pattern: /\bcore ultra\s*[3579]\b/i, socket: 'LGA1851', ramType: 'DDR5', tdp: 125, gen: 15 },
  /**
   * Egyptian listings write Intel's model three ways, and all three must resolve:
   *
   *   "Intel Core i9-14900K"               hyphen
   *   "Intel® Core™ i9 processor 14900KF"  trademark glyphs AND the word "processor"
   *   "Intel Ultra 9 285K"                 no "Core" at all
   *
   * The brand punctuation and the optional "processor" are absorbed so the model
   * number is found wherever it sits. The socket still follows the GENERATION
   * prefix of that number (14xxx → LGA1700, 265K → LGA1851), so the rules stay per
   * generation rather than one greedy catch-all.
   */
  {
    pattern: /\b(?:intel[®™\s]*)?(?:core[™®\s]*)?(?:ultra\s+)[3579][\s-]*\d{3}[a-z]*\b/i,
    socket: 'LGA1851',
    ramType: 'DDR5',
    tdp: 125,
    gen: 15,
  },
  {
    pattern: /\b(?:intel[®™\s]*)?(?:core[™®\s]*)?i[3579][™®\s-]*(?:processor[\s]+)?14\d{3}[a-z]*\b/i,
    socket: 'LGA1700',
    ramType: 'DDR5',
    tdp: 125,
    gen: 14,
  },
  {
    pattern: /\b(?:intel[®™\s]*)?(?:core[™®\s]*)?i[3579][™®\s-]*(?:processor[\s]+)?13\d{3}[a-z]*\b/i,
    socket: 'LGA1700',
    ramType: 'DDR5',
    tdp: 125,
    gen: 13,
  },
  {
    pattern: /\b(?:intel[®™\s]*)?(?:core[™®\s]*)?i[3579][™®\s-]*(?:processor[\s]+)?12\d{3}[a-z]*\b/i,
    socket: 'LGA1700',
    ramType: 'DDR4',
    tdp: 125,
    gen: 12,
  },
  { pattern: /\bi[3579]-?11\d{3}[a-z]*\b/i, socket: 'LGA1200', ramType: 'DDR4', tdp: 125, gen: 11 },
  { pattern: /\bi[3579]-?10\d{3}[a-z]*\b/i, socket: 'LGA1200', ramType: 'DDR4', tdp: 125, gen: 10 },
];

/* -------------------------------------------------------------------------- */
/*  Other components                                                          */
/* -------------------------------------------------------------------------- */

/** Chipset → socket/form factor for motherboards. */
const CHIPSET = [
  // A chipset is followed by a board suffix (B850M, B650E, X870E, H810M): `\b`
  // fails between "850" and "M" because M is a word character, which left every
  // micro-ATX board without a socket. `[A-Z0-9-]*` absorbs the suffix.
  {
    pattern: /\b(x870e?|x670e?|b850m?|b840m?|b650e?m?|a620m?)/i,
    socket: 'AM5',
    ramType: 'DDR5',
  },
  {
    pattern: /\b(x570e?|b550m?|a520m?)/i,
    socket: 'AM4',
    ramType: 'DDR4',
  },
  { pattern: /\b(z890|b860m?|h810m?)/i, socket: 'LGA1851', ramType: 'DDR5' },
  { pattern: /\b(z790|b760m?|h770|h710m?)/i, socket: 'LGA1700', ramType: 'DDR5' },
  { pattern: /\b(z690|b660m?|h610m?)/i, socket: 'LGA1700', ramType: 'DDR4' },
  { pattern: /\b(z590|b560m?|h510m?)/i, socket: 'LGA1200', ramType: 'DDR4' },
];

/**
 * Motherboards must be recognised by chipset OR by name — "GIGABYTE B650M AORUS
 * ELITE AX" carries no "motherboard" word at all, and the chipset regex above
 * looks for its own pattern, not the other way round.
 */
function chipsetFor(name: string): (typeof CHIPSET)[number] | null {
  for (const entry of CHIPSET) {
    // A `g` flag would make `test()` stateful; these are not global, but the
    // LAST match is taken for a reason — a title can name two chipsets
    // ("B650 board with X870 ..." does not happen; "… B650 … upgrade to X870"
    // does) and the board is the one it IS, not the one it supports.
    if (entry.pattern.test(name)) return entry;
  }
  return null;
}

/** Case families → GPU/cooler clearance. */
const CASE_CLEARANCE: Array<[RegExp, number, number]> = [
  [/\b(full[- ]?tower|o11 (?:dynamic )?xl|haf 700|1000d|corsair 7000)\b/i, 420, 190],
  [
    /\b(mid[- ]?tower|midi[- ]?tower|o11 dynamic|lancool|meshify|define|4000d|h5 flow|h7 flow|masterframe|td500)\b/i,
    360,
    170,
  ],
  [/\b(mini[- ]?tower|m-?atx|micro[- ]?atx|a3|prime ap201)\b/i, 320, 160],
  [/\b(itx|a4[- ]h2o|nr200|meshlicious|q500l)\b/i, 320, 160],
];

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

/** First card length in a title, e.g. "305mm", "31.2 cm". */
const isCardLength = (mm: number) => mm >= 150 && mm <= 400;

function lengthFromTitle(name: string): number | null {
  // "128-bit" is a memory bus width, not a card length: anything outside the
  // physical range of a graphics card is some other number the title states.
  const mm = Number(/(\d{3})\s?mm\b/i.exec(name)?.[1]);
  if (isCardLength(mm)) return mm;
  const cm = Number(/(\d{2}(?:\.\d)?)\s?cm\b/i.exec(name)?.[1]);
  if (isCardLength(Math.round(cm * 10))) return Math.round(cm * 10);
  const inch = Number(/(\d{1,2}(?:\.\d)?)\s?(?:in|inch)\b/i.exec(name)?.[1]);
  if (isCardLength(Math.round(inch * 25.4))) return Math.round(inch * 25.4);
  return null;
}

/** "750W", "750 W" — a standalone wattage, not "5070" or "360mm". */
function wattageFromTitle(name: string): number | null {
  const match = /(?<![\d.])(\d{3,4})\s?w(?:att)?s?\b/i.exec(name);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 250 && value <= 2000 ? value : null;
}

const VRAM_FROM_TITLE = /(\d{1,2})\s?gb\b/i;

/**
 * Infer the specs the compatibility engine needs for one listing.
 *
 * Returns `{}` when the category is not one the engine constrains or when the
 * model is not recognised — silence is better than a fabricated number.
 */
export function inferSpecs(input: {
  name: string;
  category: string | null;
  priceEgp?: number;
}): InferredSpecs {
  const name = input.name ?? '';
  /**
   * Lower-cased, because the category arrives in two spellings.
   *
   * `ComponentCategory` is lowercase (`'cpu'`), while the shipped snapshot and
   * the `retailer_products` column carry the DB enum (`'CPU'`). Comparing
   * case-sensitively returned `{}` for every row read from the snapshot, which is
   * why the spec coverage check disagreed with the enrichment script: both were
   * "right", they were just called with different casing.
   */
  const category = (input.category ?? '').toLowerCase();

  if (category === 'gpu') {
    const match = specFor(name);
    if (!match) {
      // Unknown model: still expose whatever the title states outright.
      const vram = VRAM_FROM_TITLE.exec(name);
      const watts = wattageFromTitle(name);
      if (!vram && !watts) return {};
      return {
        ...(vram ? { vram: Number(vram[1]) } : {}),
        ...(watts ? { tdp: watts } : {}),
        specSource: 'inferred',
        specConfidence: 'estimated',
      };
    }

    const delta = LENGTH_DELTA.find(([pattern]) => pattern.test(name))?.[1] ?? 0;
    const stated = lengthFromTitle(name);
    const statedVram = VRAM_FROM_TITLE.exec(name);

    return {
      vram: statedVram ? Number(statedVram[1]) : match.spec.vram,
      tdp: match.spec.tdp,
      length: stated ?? Math.max(170, (match.spec.length ?? 270) + delta),
      recommendedPsu: match.spec.recommendedPsu,
      slotWidth: match.spec.slotWidth,
      powerConnectors: match.connectors,
      gddr: /gddr\s?7/i.test(name) ? 'GDDR7' : /gddr\s?6x/i.test(name) ? 'GDDR6X' : 'GDDR6',
      specSource: 'inferred',
      specConfidence: stated ? 'high' : 'estimated',
    };
  }

  if (category === 'cpu') {
    for (const entry of AMD_CPU) {
      if (!entry.pattern.test(name)) continue;
      const x3d = /x3d\b/i.test(name);
      const statedTdp = /\b(65|105|120|170)\s?w\b/i.exec(name);
      return {
        socket: entry.socket,
        ramType: entry.ramType,
        tdp: statedTdp ? Number(statedTdp[1]) : entry.tdp,
        cores: entry.cores,
        threads: entry.threads,
        boostClock: entry.boost,
        integratedGraphics: /\d{4}g\b|radeon graphics|vega/i.test(name),
        ...(x3d ? { l3Cache: 96 } : {}),
        specSource: 'inferred',
        specConfidence: 'high',
      };
    }

    for (const entry of INTEL_CPU) {
      if (!entry.pattern.test(name)) continue;
      const unlocked = /\b1[2347]900k\b|\b13700k\b/i.test(name);
      const statedTdp = /\b([5-9]\d|1[0-9]{2})\s?w\b/i.exec(name);
      return {
        socket: entry.socket,
        ramType: entry.ramType,
        tdp: statedTdp ? Number(statedTdp[1]) : unlocked ? 150 : entry.tdp,
        // "F" and "KF" are the SKUs without integrated graphics.
        integratedGraphics: !/[fk]f\b/i.test(name) && !/\bi[3579]-?\d{4,5}f\b/i.test(name),
        specSource: 'inferred',
        specConfidence: 'high',
      };
    }

    return {};
  }

  if (category === 'motherboard') {
    const entry = chipsetFor(name);
    if (!entry) return {};

    const aio = /\b(?:wifi|wlan)\b/i.test(name);
    // The chipset suffix states the form factor: B650M / B760M / Z790M are
    // Micro-ATX, B650I is Mini-ITX. Fell back to the wording when there is none.
    const chipsetCode = entry.pattern.exec(name)?.[1]?.toLowerCase() ?? '';
    const formFactor =
      /i(tx)?$/.test(chipsetCode) || /\b(?:mini[- ]?itx|itx)\b/i.test(name)
        ? 'Mini-ITX'
        : /m$/.test(chipsetCode) || /\b(?:micro[- ]?atx|m-?atx)\b/i.test(name)
          ? 'Micro-ATX'
          : /\be[- ]?atx\b/i.test(name)
            ? 'E-ATX'
            : 'ATX';

    return {
      socket: entry.socket,
      chipset: chipsetCode.toUpperCase(),
      formFactor,
      ramType: entry.ramType,
      maxRam: 128,
      ramSlots: 4,
      m2Slots: 2,
      wireless: aio,
      specSource: 'inferred',
      specConfidence: 'high',
    };
  }

  if (category === 'ram') {
    // "32GB (2x16GB) DDR5 6000MT/s CL30"
    const total = /(\d{1,3})\s?gb\b/i.exec(name);
    const stick = /\((\d)x(\d{1,3})\s?gb\)/i.exec(name);
    const gen = /ddr\s?([345])/i.exec(name);
    const speed = /(\d{4,5})\s?(?:mt\/s|mhz)/i.exec(name);
    const cl = /\bcl\s?(\d{2})\b/i.exec(name) ?? /c(\d{2})\b/i.exec(name);
    if (!gen) return {};
    return {
      type: `DDR${gen[1]}`,
      capacity: total ? Number(total[1]) : undefined,
      sticks: stick ? Number(stick[1]) : undefined,
      speed: speed ? Number(speed[1]) : undefined,
      casLatency: cl ? Number(cl[1]) : undefined,
      height: /\b(?:low[- ]?profile|lpx)\b/i.test(name) ? 34 : 0,
      specSource: 'inferred',
      specConfidence: 'high',
    };
  }

  if (category === 'storage') {
    const capacity = /(\d{1,2})\s?tb\b/i.exec(name) ?? /(\d{3,4})\s?gb\b/i.exec(name);
    // The unit is decided by which pattern matched, not by its trailing group.
    const gigabytes = capacity ? Number(capacity[1]) * (/tb\b/i.test(capacity[0]) ? 1024 : 1) : null;
    const nvme = /\bnvme\b|pcie/i.test(name);
    return {
      type: nvme ? 'NVMe SSD' : /\bssd\b/i.test(name) ? 'SATA SSD' : 'HDD',
      interface: nvme
        ? `PCIe ${/gen\s?5/i.test(name) ? '5.0' : /gen\s?4/i.test(name) ? '4.0' : '3.0'} x4`
        : 'SATA III',
      capacity: gigabytes,
      formFactor: nvme ? 'M.2' : '2.5"',
      specSource: 'inferred',
      specConfidence: gigabytes ? 'high' : 'estimated',
    };
  }

  if (category === 'psu') {
    const watts = wattageFromTitle(name);
    if (!watts) return {};
    const efficiency = /80\s?plus\s?(titanium|platinum|gold|silver|bronze)/i.exec(name)?.[1]?.trim();
    const modular = /fully\s?modular|full\s?modular/i.test(name)
      ? 'Full'
      : /semi[- ]?modular/i.test(name)
        ? 'Semi'
        : /non[- ]?modular/i.test(name)
          ? 'No'
          : undefined;
    return {
      wattage: watts,
      efficiency: efficiency
        ? `80+ ${efficiency.charAt(0).toUpperCase()}${efficiency.slice(1).toLowerCase()}`
        : undefined,
      modular,
      atxStandard: /atx\s?3\.1/i.test(name) ? 'ATX 3.1' : 'ATX 3.0',
      pcieConnectors: watts >= 750 ? 4 : watts >= 550 ? 2 : 1,
      specSource: 'inferred',
      specConfidence: 'high',
    };
  }

  if (category === 'case') {
    const clearance = CASE_CLEARANCE.find(([pattern]) => pattern.test(name));
    const statedGpu = /gpu[^,]{0,20}?(\d{3})\s?mm/i.exec(name);
    const statedCooler = /(?:cooler|height)[^,]{0,20}?(\d{3})\s?mm/i.exec(name);
    if (!clearance && !statedGpu) return {};

    const formFactorSupport = /\bfull[- ]?tower\b|\be[- ]?atx\b|\b7000d\b|\bo11 dynamic xl\b/i.test(name)
      ? ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX']
      : /\b(?:micro[- ]?atx|m-?atx)\b/i.test(name)
        ? ['Micro-ATX', 'Mini-ITX']
        : /\b(?:mini[- ]?itx|itx)\b/i.test(name)
          ? ['Mini-ITX']
          : ['ATX', 'Micro-ATX', 'Mini-ITX'];

    return {
      formFactorSupport,
      maxGpuLength: statedGpu ? Number(statedGpu[1]) : (clearance?.[1] ?? 330),
      maxCoolerHeight: statedCooler ? Number(statedCooler[1]) : (clearance?.[2] ?? 165),
      radiatorSupport: /\b360\b/i.test(name) ? ['360mm'] : /\b280\b/i.test(name) ? ['280mm'] : ['240mm'],
      specSource: 'inferred',
      specConfidence: statedGpu || statedCooler ? 'high' : 'estimated',
    };
  }

  if (category === 'cooling') {
    // "ML360L", "360mm", "LT720" — the radiator size is a three-digit number
    // that ends the model or sits next to "mm".
    const radiator =
      /(\d{3})\s?mm/i.exec(name) ?? /(?:^|[^\d])([2-4]\d{2})l?\b/i.exec(name.replace(/\d{4,}/g, ' '));
    const isLiquid = /aio|liquid/i.test(name);
    const tdp = /\b(\d{2,3})\s?w\b/i.exec(name);

    // A CPU cooler supports the sockets its bracket list names; without a list,
    // both current desktop platforms are a safe assumption for a NEW cooler.
    const sockets = ['AM5', 'AM4', 'LGA1700', 'LGA1851'].filter((socket) =>
      new RegExp(socket, 'i').test(name),
    );
    return {
      type: isLiquid ? 'Liquid' : 'Air',
      tdpRating: tdp ? Number(tdp[1]) : isLiquid ? 250 : 150,
      socketSupport: sockets.length ? sockets : ['AM5', 'AM4', 'LGA1700', 'LGA1851'],
      height: isLiquid ? 0 : 160,
      radiatorSize: isLiquid ? (radiator ? Number(radiator[1]) : 240) : null,
      specSource: 'inferred',
      specConfidence: sockets.length ? 'high' : 'estimated',
    };
  }

  return {};
}
