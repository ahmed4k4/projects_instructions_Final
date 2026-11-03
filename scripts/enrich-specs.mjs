#!/usr/bin/env node
/**
 * Enrich the scraped catalogue with the specs the compatibility engine needs.
 *
 *   node scripts/enrich-specs.mjs            # rewrite the snapshot
 *   node scripts/enrich-specs.mjs --dry-run  # report coverage only
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * A retailer feeds us a name, a price and a link. The builder additionally needs
 * a GPU's length and TDP, a CPU's socket and RAM type, a board's form factor, a
 * PSU's wattage, a case's clearance — the numbers `lib/compatibility/engine.ts`
 * compares. Phase 14 measured that only ~2 % of titles state a card length, so
 * a catalogue built from titles could not answer a single compatibility rule;
 * that is why the builder kept a hand-written sample set.
 *
 * These values are a property of the CHIP, though, not of the board partner's
 * shroud: every RTX 5070 Ti is 16 GB and ~300 W. `src/lib/specInference.ts`
 * holds that table, with tests, and the app uses it at READ time. This script
 * applies the same rules to the stored snapshot so the specs are also available
 * to anything that reads the JSON directly (and to the `retailer_products`
 * upsert path).
 *
 * The table below is a deliberate COPY, not an import: the app builds from
 * TypeScript and this runs from Node with no build step, exactly like the other
 * crawler scripts. `src/lib/__tests__/specInference.test.ts` pins the rules the
 * app uses; `scripts/verify-catalogue-specs.mjs` pins that this copy agrees with
 * them on a sample of real titles.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SNAPSHOT_PATH = 'public/data/retailer_snapshot.json';
const BOOTSTRAP_PATH = 'src/services/retailers/bootstrap.json';
const dryRun = process.argv.includes('--dry-run');

/* ── GPU chips ─────────────────────────────────────────────────────────────── */

const GEFORCE = [
  [
    /\b(?:rtx\s?)?5090\b/i,
    { tdp: 575, vram: 32, recommendedPsu: 1000, length: 304, slotWidth: 3 },
    '1x 16-pin (12V-2x6)',
  ],
  [
    /\b(?:rtx\s?)?5080\b/i,
    { tdp: 360, vram: 16, recommendedPsu: 850, length: 304, slotWidth: 3 },
    '1x 16-pin (12V-2x6)',
  ],
  [
    /\b(?:rtx\s?)?5070\s?ti\s?super\b/i,
    { tdp: 300, vram: 16, recommendedPsu: 750, length: 300, slotWidth: 3 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?5070\s?ti\b/i,
    { tdp: 300, vram: 16, recommendedPsu: 750, length: 300, slotWidth: 3 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?5070\b/i,
    { tdp: 250, vram: 12, recommendedPsu: 650, length: 290, slotWidth: 2 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?5060\s?ti\b/i,
    { tdp: 180, vram: 16, recommendedPsu: 600, length: 270, slotWidth: 2 },
    '1x 8-pin',
  ],
  [/\b(?:rtx\s?)?5060\b/i, { tdp: 145, vram: 8, recommendedPsu: 550, length: 245, slotWidth: 2 }, '1x 8-pin'],
  [
    /\b(?:rtx\s?)?4090\b/i,
    { tdp: 450, vram: 24, recommendedPsu: 850, length: 336, slotWidth: 3 },
    '1x 16-pin (12VHPWR)',
  ],
  [
    /\b(?:rtx\s?)?4080\s?super\b/i,
    { tdp: 320, vram: 16, recommendedPsu: 750, length: 310, slotWidth: 3 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?4080\b/i,
    { tdp: 320, vram: 16, recommendedPsu: 750, length: 304, slotWidth: 3 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?4070\s?ti\s?super\b/i,
    { tdp: 285, vram: 16, recommendedPsu: 700, length: 305, slotWidth: 3 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?4070\s?ti\b/i,
    { tdp: 285, vram: 12, recommendedPsu: 700, length: 305, slotWidth: 3 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?4070\s?super\b/i,
    { tdp: 220, vram: 12, recommendedPsu: 650, length: 270, slotWidth: 2 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?4070\b/i,
    { tdp: 200, vram: 12, recommendedPsu: 650, length: 270, slotWidth: 2 },
    '1x 16-pin',
  ],
  [
    /\b(?:rtx\s?)?4060\s?ti\b/i,
    { tdp: 160, vram: 8, recommendedPsu: 550, length: 245, slotWidth: 2 },
    '1x 8-pin',
  ],
  [/\b(?:rtx\s?)?4060\b/i, { tdp: 115, vram: 8, recommendedPsu: 550, length: 200, slotWidth: 2 }, '1x 8-pin'],
  [
    /\b(?:rtx\s?)?3090\b/i,
    { tdp: 350, vram: 24, recommendedPsu: 750, length: 313, slotWidth: 3 },
    '1x 12-pin',
  ],
  [
    /\b(?:rtx\s?)?3080\b/i,
    { tdp: 320, vram: 10, recommendedPsu: 750, length: 285, slotWidth: 3 },
    '1x 12-pin',
  ],
  [
    /\b(?:rtx\s?)?3070\s?ti\b/i,
    { tdp: 290, vram: 8, recommendedPsu: 750, length: 267, slotWidth: 2 },
    '1x 12-pin',
  ],
  [/\b(?:rtx\s?)?3070\b/i, { tdp: 220, vram: 8, recommendedPsu: 650, length: 242, slotWidth: 2 }, '1x 8-pin'],
  [
    /\b(?:rtx\s?)?3060\s?ti\b/i,
    { tdp: 200, vram: 8, recommendedPsu: 600, length: 242, slotWidth: 2 },
    '1x 8-pin',
  ],
  [
    /\b(?:rtx\s?)?3060\b/i,
    { tdp: 170, vram: 12, recommendedPsu: 550, length: 242, slotWidth: 2 },
    '1x 8-pin',
  ],
  [/\b(?:rtx\s?)?3050\b/i, { tdp: 130, vram: 8, recommendedPsu: 450, length: 200, slotWidth: 2 }, '1x 8-pin'],
];

const RADEON = [
  [/\brx\s?9070\s?xt\b/i, { tdp: 304, vram: 16, recommendedPsu: 750, length: 270, slotWidth: 3 }, '2x 8-pin'],
  [/\brx\s?9070\b/i, { tdp: 220, vram: 16, recommendedPsu: 700, length: 267, slotWidth: 2 }, '2x 8-pin'],
  [/\brx\s?9060\s?xt\b/i, { tdp: 160, vram: 16, recommendedPsu: 600, length: 245, slotWidth: 2 }, '1x 8-pin'],
  [
    /\brx\s?7900\s?xtx\b/i,
    { tdp: 355, vram: 24, recommendedPsu: 800, length: 287, slotWidth: 3 },
    '2x 8-pin',
  ],
  [/\brx\s?7900\s?xt\b/i, { tdp: 315, vram: 20, recommendedPsu: 800, length: 287, slotWidth: 3 }, '2x 8-pin'],
  [/\brx\s?7800\s?xt\b/i, { tdp: 263, vram: 16, recommendedPsu: 700, length: 267, slotWidth: 2 }, '2x 8-pin'],
  [/\brx\s?7700\s?xt\b/i, { tdp: 245, vram: 12, recommendedPsu: 650, length: 267, slotWidth: 2 }, '2x 8-pin'],
  [/\brx\s?7600\b/i, { tdp: 165, vram: 8, recommendedPsu: 550, length: 204, slotWidth: 2 }, '1x 8-pin'],
];

const ARC = [
  [
    /\barc\s?a770\b/i,
    { tdp: 225, vram: 8, recommendedPsu: 650, length: 268, slotWidth: 2 },
    '1x 8-pin + 1x 6-pin',
  ],
  [
    /\barc\s?a750\b/i,
    { tdp: 225, vram: 8, recommendedPsu: 650, length: 268, slotWidth: 2 },
    '1x 8-pin + 1x 6-pin',
  ],
  [/\barc\s?a380\b/i, { tdp: 75, vram: 6, recommendedPsu: 350, length: 200, slotWidth: 2 }, 'none'],
];

const LENGTH_DELTA = [
  [/\b(suprim|lightning|astral|master|strix|nitro|toxic|red devil|mercury|amp extreme)\b/i, 25],
  [/\b(tuf|gaming oc|gamingpro|windforce|eagle|trinity|hellhound|pulse)\b/i, 10],
  [/\b(ventus|dual|twin fan|2x|mini|low profile|low-profile)\b/i, -25],
];

/* ── CPUs ──────────────────────────────────────────────────────────────────── */

const AMD_CPU = [
  /**
   * Generation decides the platform, not an enumerated model list.
   *
   * Enumerating `9xxx / 8xxx / 7xxx / 5xxx / 4xxx / 3xxx` silently missed 9850X3D,
   * 9800X3D, 9950X3D and every "Ryzen™" title (the trademark glyph breaks a
   * `\bryzen\b` boundary). 7xxx and above is Zen 4/5 → AM5/DDR5; 5xxx and below
   * is Zen 2/3 → AM4/DDR4.
   */
  [
    /\bryzen[\s™®]*[3579][\s��]*(?:pro[\s]+)?([789]\d{3})[a-z0-9]*\b/i,
    { socket: 'AM5', ramType: 'DDR5', tdp: 120, cores: 8, threads: 16, boost: 5.2 },
  ],
  [
    /\bryzen[\s™®]*[3579][\s��]*(?:pro[\s]+)?([3-6]\d{3})[a-z0-9]*\b/i,
    { socket: 'AM4', ramType: 'DDR4', tdp: 105, cores: 6, threads: 12, boost: 4.6 },
  ],
  // Threadripper is a different socket, not a bigger Ryzen.
  [
    /\b(?:ryzen\s+)?threadripper(?:\s+pro)?\s*[\s-]*(7\d{3}|9\d{4})\b/i,
    { socket: 'sTR5', ramType: 'DDR5', tdp: 280, cores: 24, threads: 48, boost: 5.3 },
  ],
  [
    /\b(?:ryzen\s+)?threadripper(?:\s+pro)?\s*5\d{3}/i,
    { socket: 'sTRX4', ramType: 'DDR4', tdp: 280, cores: 16, threads: 32, boost: 4.5 },
  ],
];

const INTEL_CPU = [
  [/\bcore ultra\s*[3579]\b/i, { socket: 'LGA1851', ramType: 'DDR5', tdp: 125 }],
  // "Core I9 14900K" (capital I, a space) as well as "Core i9-14900K".
  [/\bi[3579][-\s]?14\d{3}[a-z]*\b/i, { socket: 'LGA1700', ramType: 'DDR5', tdp: 125 }],
  [/\bi[3579][-\s]?13\d{3}[a-z]*\b/i, { socket: 'LGA1700', ramType: 'DDR5', tdp: 125 }],
  [/\bi[3579][-\s]?12\d{3}[a-z]*\b/i, { socket: 'LGA1700', ramType: 'DDR4', tdp: 125 }],
  [/\bi[3579][-\s]?11\d{3}[a-z]*\b/i, { socket: 'LGA1200', ramType: 'DDR4', tdp: 125 }],
  [/\bi[3579][-\s]?10\d{3}[a-z]*\b/i, { socket: 'LGA1200', ramType: 'DDR4', tdp: 125 }],
];

const CHIPSET = [
  // A chipset is followed by a board suffix (B850M, B650E, X870E, H810M).
  [/\b(x870e?|x670e?|b850m?|b840m?|b650e?m?|a620m?)/i, { socket: 'AM5', ramType: 'DDR5' }],
  [/\b(x570e?|b550m?|a520m?)/i, { socket: 'AM4', ramType: 'DDR4' }],
  [/\b(z890|b860m?|h810m?)/i, { socket: 'LGA1851', ramType: 'DDR5' }],
  [/\b(z790|b760m?|h770|h710m?)/i, { socket: 'LGA1700', ramType: 'DDR5' }],
  [/\b(z690|b660m?|h610m?)/i, { socket: 'LGA1700', ramType: 'DDR4' }],
  [/\b(z590|b560m?|h510m?)/i, { socket: 'LGA1200', ramType: 'DDR4' }],
];

const CASE_CLEARANCE = [
  [/\b(full[- ]?tower|o11 (?:dynamic )?xl|haf 700|1000d|corsair 7000)\b/i, 420, 190],
  [
    /\b(mid[- ]?tower|midi[- ]?tower|o11 dynamic|lancool|meshify|define|4000d|h5 flow|h7 flow|masterframe|td500)\b/i,
    360,
    170,
  ],
  [/\b(mini[- ]?tower|m-?atx|micro[- ]?atx|a3|prime ap201)\b/i, 320, 160],
  [/\b(itx|a4[- ]h2o|nr200|meshlicious|q500l)\b/i, 320, 160],
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const first = (name, pattern) => pattern.exec(name)?.[1];

const isCardLength = (mm) => mm >= 150 && mm <= 400;

function lengthFromTitle(name) {
  const mm = Number(first(name, /(\d{3})\s?mm\b/i));
  // "128-bit" is a bus width, not a card length. Anything outside the physical
  // range of a graphics card is some other number the title happened to state.
  if (isCardLength(mm)) return mm;
  const cm = Number(first(name, /(\d{2}(?:\.\d)?)\s?cm\b/i));
  if (isCardLength(Math.round(cm * 10))) return Math.round(cm * 10);
  const inch = Number(first(name, /(\d{1,2}(?:\.\d)?)\s?(?:in|inch)\b/i));
  if (isCardLength(Math.round(inch * 25.4))) return Math.round(inch * 25.4);
  return null;
}

function wattageFromTitle(name) {
  const match = /(?<![\d.])(\d{3,4})\s?w(?:att)?s?\b/i.exec(name);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 250 && value <= 2000 ? value : null;
}

/** The same rules as `inferSpecs` in src/lib/specInference.ts. */
export function inferSpecs(name, category) {
  if (category === 'gpu') {
    const entry = [...GEFORCE, ...RADEON, ...ARC].find(([pattern]) => pattern.test(name));
    const statedVram = first(name, /(\d{1,2})\s?gb\b/i);
    if (!entry) {
      const stated = Number(statedVram);
      return stated > 4 ? { vram: stated, specSource: 'inferred', specConfidence: 'estimated' } : {};
    }
    const [, spec, connectors] = entry;
    const delta = LENGTH_DELTA.find(([pattern]) => pattern.test(name))?.[1] ?? 0;
    const statedLength = lengthFromTitle(name);
    return {
      vram: statedVram ? Number(statedVram) : spec.vram,
      tdp: spec.tdp,
      length: statedLength ?? Math.max(170, spec.length + delta),
      recommendedPsu: spec.recommendedPsu,
      slotWidth: spec.slotWidth,
      powerConnectors: connectors,
      gddr: /gddr\s?7/i.test(name) ? 'GDDR7' : /gddr\s?6x/i.test(name) ? 'GDDR6X' : 'GDDR6',
      specSource: 'inferred',
      specConfidence: statedLength ? 'high' : 'estimated',
    };
  }

  if (category === 'cpu') {
    const amd = AMD_CPU.find(([pattern]) => pattern.test(name));
    if (amd) {
      const [, spec] = amd;
      const stated = Number(first(name, /\b(65|105|120|170)\s?w\b/i));
      return {
        socket: spec.socket,
        ramType: spec.ramType,
        tdp: stated || spec.tdp,
        cores: spec.cores,
        threads: spec.threads,
        boostClock: spec.boost,
        integratedGraphics: /\d{4}g\b|radeon graphics|vega/i.test(name),
        ...(/x3d\b/i.test(name) ? { l3Cache: 96 } : {}),
        specSource: 'inferred',
        specConfidence: 'high',
      };
    }
    const intel = INTEL_CPU.find(([pattern]) => pattern.test(name));
    if (intel) {
      const [, spec] = intel;
      const stated = Number(first(name, /\b([5-9]\d|1[0-9]{2})\s?w\b/i));
      const unlocked = /\b1[2347]900k\b|\b13700k\b/i.test(name);
      return {
        socket: spec.socket,
        ramType: spec.ramType,
        tdp: stated || (unlocked ? 150 : spec.tdp),
        integratedGraphics: !/[fk]f\b/i.test(name) && !/\bi[3579]-?\d{4,5}f\b/i.test(name),
        specSource: 'inferred',
        specConfidence: 'high',
      };
    }
    return {};
  }

  if (category === 'motherboard') {
    const match = CHIPSET.find(([pattern]) => pattern.test(name));
    if (!match) return {};
    const [pattern, base] = match;
    const code = (pattern.exec(name)?.[1] ?? '').toLowerCase();
    const formFactor = /itx$/.test(code)
      ? 'Mini-ITX'
      : /m$/.test(code)
        ? 'Micro-ATX'
        : /\be[- ]?atx\b/i.test(name)
          ? 'E-ATX'
          : 'ATX';
    return {
      socket: base.socket,
      chipset: code.toUpperCase(),
      formFactor,
      ramType: base.ramType,
      maxRam: 128,
      ramSlots: 4,
      m2Slots: 2,
      specSource: 'inferred',
      specConfidence: 'high',
    };
  }

  if (category === 'ram') {
    const gen = first(name, /ddr\s?([345])/i);
    if (!gen) return {};
    const total = first(name, /(\d{1,3})\s?gb\b/i);
    const sticks = /\((\d)x(\d{1,3})\s?gb\)/i.exec(name);
    const speed = first(name, /(\d{4,5})\s?(?:mt\/s|mhz)/i);
    const cl = first(name, /\bcl\s?(\d{2})\b/i) ?? first(name, /c(\d{2})\b/i);
    return {
      type: `DDR${gen}`,
      capacity: total ? Number(total) : undefined,
      sticks: sticks ? Number(sticks[1]) : undefined,
      speed: speed ? Number(speed) : undefined,
      casLatency: cl ? Number(cl) : undefined,
      specSource: 'inferred',
      specConfidence: 'high',
    };
  }

  if (category === 'storage') {
    const capacity = /(\d{1,2})\s?tb\b/i.exec(name) ?? /(\d{3,4})\s?gb\b/i.exec(name);
    const gigabytes = capacity ? Number(capacity[1]) * (/tb\b/i.test(capacity[0]) ? 1024 : 1) : null;
    const nvme = /\bnvme\b|pcie/i.test(name);
    return {
      type: nvme ? 'NVMe SSD' : /\bssd\b/i.test(name) ? 'SATA SSD' : 'HDD',
      interface: nvme
        ? `PCIe ${/gen\s?5/i.test(name) ? '5.0' : /gen\s?4/i.test(name) ? '4.0' : '3.0'} x4`
        : 'SATA III',
      capacity: gigabytes ?? undefined,
      formFactor: nvme ? 'M.2' : '2.5"',
      specSource: 'inferred',
      specConfidence: gigabytes ? 'high' : 'estimated',
    };
  }

  if (category === 'psu') {
    const watts = wattageFromTitle(name);
    if (!watts) return {};
    const efficiency = first(name, /80\s?plus\s?(titanium|platinum|gold|silver|bronze)/i)?.trim();
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
    const statedGpu = first(name, /gpu[^,]{0,20}?(\d{3})\s?mm/i);
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
      maxGpuLength: statedGpu ? Number(statedGpu) : (clearance?.[1] ?? 330),
      maxCoolerHeight: clearance?.[2] ?? 165,
      radiatorSupport: /\b360\b/i.test(name) ? ['360mm'] : /\b280\b/i.test(name) ? ['280mm'] : ['240mm'],
      specSource: 'inferred',
      specConfidence: statedGpu ? 'high' : 'estimated',
    };
  }

  if (category === 'cooling') {
    const radiator =
      first(name, /(\d{3})\s?mm/i) ?? first(name.replace(/\d{4,}/g, ' '), /(?:^|[^\d])([2-4]\d{2})l?\b/i);
    const isLiquid = /aio|liquid/i.test(name);
    const sockets = ['AM5', 'AM4', 'LGA1700', 'LGA1851'].filter((socket) =>
      new RegExp(socket, 'i').test(name),
    );
    return {
      type: isLiquid ? 'Liquid' : 'Air',
      tdpRating: Number(first(name, /\b(\d{2,3})\s?w\b/i)) || (isLiquid ? 250 : 150),
      socketSupport: sockets.length ? sockets : ['AM5', 'AM4', 'LGA1700', 'LGA1851'],
      height: isLiquid ? 0 : 160,
      radiatorSize: isLiquid ? Number(radiator) || 240 : null,
      specSource: 'inferred',
      specConfidence: sockets.length ? 'high' : 'estimated',
    };
  }

  return {};
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const products = snapshot.products ?? [];

const coverage = {};
let enriched = 0;

for (const product of products) {
  const inferred = inferSpecs(product.name ?? '', product.category ?? '');
  const category = product.category ?? 'unknown';
  const bucket = (coverage[category] ??= { total: 0, withSpecs: 0 });
  bucket.total += 1;

  const hasSpecs = Object.keys(inferred).some((key) => key !== 'specSource' && key !== 'specConfidence');
  if (hasSpecs) bucket.withSpecs += 1;

  product.specs = { ...(product.specs ?? {}), ...inferred };
  if (hasSpecs) enriched += 1;
}

console.log(`catalogue: ${products.length} listings · ${enriched} with inferred specs\n`);
console.log('category       with specs    total   share');
console.log('──────────────────────────────────────────');
for (const [category, row] of Object.entries(coverage).sort()) {
  const share = row.total ? ((row.withSpecs / row.total) * 100).toFixed(0) : '0';
  console.log(
    `  ${category.padEnd(13)} ${String(row.withSpecs).padStart(9)} ${String(row.total).padStart(8)}   ${share.padStart(3)}%`,
  );
}

if (dryRun) {
  console.log('\n~ dry run: snapshot not written');
  process.exit(0);
}

writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ ...snapshot, products }, null, 2)}\n`, 'utf8');

/* Rebuild the bundled first-paint subset from the enriched rows. */
const buckets = new Map();
for (const product of products) {
  const key = `${product.retailerId}:${product.category}`;
  buckets.set(key, [...(buckets.get(key) ?? []), product]);
}
const bootstrap = [...buckets.values()].flatMap((rows) => rows.slice(0, 2));
writeFileSync(
  BOOTSTRAP_PATH,
  `${JSON.stringify(
    {
      capturedAt: snapshot.capturedAt,
      source: 'bootstrap subset of retailer_snapshot.json',
      retailers: [...new Set(bootstrap.map((p) => p.retailerId))].sort(),
      products: bootstrap,
    },
    null,
    1,
  )}\n`,
  'utf8',
);

console.log(`\n✔ ${enriched} listings enriched → ${SNAPSHOT_PATH}`);
