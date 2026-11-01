import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Current UI locale, kept in sync by `setFormatLocale`.
 *
 * Prices used to be hardcoded to `en-US`, which rendered `US$1,800` inside an
 * otherwise Arabic page. The active language is injected once on
 * `languageChanged` so every formatter (including cached ones) agrees.
 */
let formatLocale = 'en-US';

const LOCALE_TAGS: Record<string, string> = {
  en: 'en-US',
  ar: 'ar-EG',
};

export function setFormatLocale(language: string): void {
  const next = LOCALE_TAGS[language.split('-')[0] ?? 'en'] ?? 'en-US';
  if (next === formatLocale) return;
  formatLocale = next;
  // Cached formatters were built for the previous locale.
  currencyFormatters.clear();
}

/** `$1,899.00` in English, `US$1,800` in Arabic — same currency, locale digits. */
export function formatCurrency(value: number, currency = 'USD', compact = false): string {
  const key = `${formatLocale}:${currency}:${compact ? 1 : 0}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(formatLocale, {
      style: 'currency',
      currency,
      maximumFractionDigits: compact ? 0 : value % 1 === 0 ? 0 : 2,
      notation: compact ? 'compact' : 'standard',
      // Keep Western digits: Arabic-Indic numerals next to "RTX 4090" read oddly
      // on a technical spec sheet.
      numberingSystem: 'latn',
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** "850 W" */
export function formatWatts(watts: number): string {
  return `${Math.round(watts).toLocaleString('en-US')} W`;
}

/** Score as a zero-padded integer, e.g. 87 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—';
  return Math.round(score).toString();
}

/** 2.4k / 18.3k views */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(formatLocale, {
    notation: 'compact',
    maximumFractionDigits: 1,
    numberingSystem: 'latn',
  }).format(value);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export function formatSpecValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined) return '—';
  return String(value);
}

/** Clamp helper used by rings and meters. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Colour token for a 0–100 score. */
export function scoreTone(score: number): 'success' | 'warning' | 'danger' | 'primary' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'primary';
  return 'danger';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
