/**
 * A performance score for a retailer listing.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The builder sorts and scores with `PCComponent.performanceScore`, and the
 * fallback generator picks "the best part that fits the budget" by that number.
 * Real retailer listings have no benchmark data, so every component from the
 * catalogue would score 0 — which makes the generator pick arbitrarily and the
 * Build Doctor's "upgrade" suggestions meaningless.
 *
 * This is not a benchmark. It is a RELATIVE tier, derived from the model number
 * the listing already states, on a 0–100 scale that matches the old hand-written
 * catalogue's spread. It is good enough to answer "is an RX 9070 XT better than
 * an RTX 5060?" and is deliberately documented as an estimate wherever the UI
 * shows it.
 *
 * The tables are ordered strongest-first; the first match wins.
 */

import type { ComponentCategory } from '@/types/components';

/** GPU tiers by chip. */
const GPU_TIERS: Array<[RegExp, number]> = [
  [/\brtx\s?5090\b/i, 100],
  [/\brtx\s?5080\b/i, 93],
  [/\brtx\s?4090\b/i, 92],
  [/\brtx\s?5070\s?ti\b/i, 86],
  [/\brx\s?9070\s?xt\b/i, 85],
  [/\brtx\s?4080\b/i, 84],
  [/\brx\s?7900\s?xtx\b/i, 83],
  [/\brtx\s?4070\s?ti\b/i, 80],
  [/\brx\s?9070\b/i, 79],
  [/\brx\s?7900\s?xt\b/i, 78],
  [/\brtx\s?5070\b/i, 77],
  [/\brtx\s?4070\b/i, 72],
  [/\brx\s?7800\s?xt\b/i, 70],
  [/\brtx\s?5060\s?ti\b/i, 68],
  [/\brtx\s?3080\b/i, 67],
  [/\brx\s?7700\s?xt\b/i, 64],
  [/\brtx\s?4060\s?ti\b/i, 60],
  [/\brtx\s?3070\b/i, 58],
  [/\brtx\s?5060\b/i, 56],
  [/\brx\s?7600\b/i, 48],
  [/\brtx\s?4060\b/i, 46],
  [/\brtx\s?3060\s?ti\b/i, 44],
  [/\brtx\s?3060\b/i, 38],
  [/\brtx\s?3050\b/i, 30],
];

/** CPU tiers by model. */
const CPU_TIERS: Array<[RegExp, number]> = [
  [/\b9950x3d\b|\b9800x3d\b/i, 100],
  [/\b9950x\b|\b9900x\b/i, 95],
  [/\b9700x\b|\b9600x\b/i, 88],
  [/\bryzen\s?9\s?7\d{3}/i, 90],
  [/\bryzen\s?7\s?7800x3d\b/i, 96],
  [/\bryzen\s?7\s?7\d{3}/i, 87],
  [/\bryzen\s?5\s?7\d{3}/i, 80],
  [/\bryzen\s?7\s?5\d{3}x3d\b/i, 82],
  [/\bryzen\s?[57]\s?5[6-9]\d{2}/i, 74],
  [/\bryzen\s?5\s?5\d{3}/i, 70],
  [/\bryzen\s?[357]\s?3\d{3}/i, 48],
  [/\bcore ultra\s?9\b/i, 98],
  [/\bcore ultra\s?7\b/i, 92],
  [/\bcore ultra\s?5\b/i, 80],
  [/\bi9-?14\d{3}/i, 97],
  [/\bi7-?14\d{3}/i, 90],
  [/\bi5-?14\d{3}/i, 80],
  [/\bi9-?13\d{3}/i, 94],
  [/\bi7-?13\d{3}/i, 86],
  [/\bi5-?13\d{3}/i, 76],
  [/\bi[57]-?12\d{3}/i, 68],
  [/\bi[357]-?1[01]\d{3}/i, 55],
];

/** Storage tiers: interface first, then capacity. */
function storageScore(name: string): number {
  const gen5 = /gen\s?5|pcie\s?5/i.test(name);
  const gen4 = /gen\s?4|pcie\s?4/i.test(name);
  const nvme = /nvme|pcie/i.test(name);
  const hdd = /\bhdd\b|hard drive/i.test(name);
  if (hdd) return 20;
  if (!nvme) return 45;
  return gen5 ? 95 : gen4 ? 85 : 72;
}

/** RAM: capacity matters more than speed for the score's purpose. */
function ramScore(name: string): number {
  const gb = Number(/(\d{2,3})\s?gb\b/i.exec(name)?.[1] ?? 0);
  const speed = Number(/(\d{4,5})\s?(?:mt\/s|mhz)/i.exec(name)?.[1] ?? 0);
  const base = gb >= 64 ? 88 : gb >= 32 ? 80 : gb >= 16 ? 62 : 45;
  return Math.min(100, base + (speed >= 6000 ? 6 : 0));
}

/** PSU: a bigger, better-rated unit scores higher, but never as a "feature". */
function psuScore(name: string): number {
  const watts = Number(/(\d{3,4})\s?w\b/i.exec(name)?.[1] ?? 0);
  const tier = /titanium|platinum/i.test(name) ? 12 : /gold/i.test(name) ? 8 : /bronze/i.test(name) ? 2 : 0;
  const base = watts >= 1000 ? 85 : watts >= 850 ? 78 : watts >= 750 ? 72 : watts >= 650 ? 65 : 55;
  return Math.min(100, base + tier);
}

/** Case: clearance and airflow, from the tower class. */
function caseScore(name: string): number {
  if (/full[- ]?tower|o11 (?:dynamic )?xl|haf 700/i.test(name)) return 90;
  if (/mid[- ]?tower|midi[- ]?tower|meshify|o11|lancool/i.test(name)) return 78;
  if (/mini[- ]?itx|itx/i.test(name)) return 60;
  return 70;
}

/** Cooling: a 360 mm AIO beats a 240 mm, which beats a stock-class air cooler. */
function coolingScore(name: string): number {
  if (/360|aio.*360|liquid/i.test(name)) return 85;
  if (/240|280|aio/i.test(name)) return 72;
  if (/tower|nh-d15|dual tower|assassin/i.test(name)) return 84;
  return 60;
}

/**
 * Relative performance tier for a listing, 0–100.
 *
 * Unrecognised models get 50: the middle of the scale, so an unknown part is
 * neither promoted to a flagship slot nor buried under a known one.
 */
export function estimatePerformanceScore(name: string, category: ComponentCategory): number {
  if (category === 'gpu') {
    for (const [pattern, score] of GPU_TIERS) if (pattern.test(name)) return score;
    return 50;
  }
  if (category === 'cpu') {
    for (const [pattern, score] of CPU_TIERS) if (pattern.test(name)) return score;
    return 50;
  }
  if (category === 'storage') return storageScore(name);
  if (category === 'ram') return ramScore(name);
  if (category === 'psu') return psuScore(name);
  if (category === 'case') return caseScore(name);
  if (category === 'cooling') return coolingScore(name);
  return 50;
}
