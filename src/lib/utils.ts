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
let formatLocale = 'en-EG';

/* LOCALE_TAGS is declared below, before setFormatLocale. */

/**
 * Formatting locales for Egyptian pricing.
 *
 * `en-EG` renders `EGP 6,799`; `ar-EG` renders `٦٬٧٩٩ ج.م.‏`. Both keep Western
 * digits (`numberingSystem: 'latn'`) because these sit next to Latin product
 * names and model numbers, where Arabic-Indic digits read as noise.
 */
const LOCALE_TAGS: Record<string, string> = {
  en: 'en-EG',
  ar: 'ar-EG',
};

export function setFormatLocale(language: string): void {
  const next = LOCALE_TAGS[language.split('-')[0] ?? 'en'] ?? 'en-EG';
  if (next === formatLocale) return;
  formatLocale = next;
  // Cached formatters were built for the previous locale.
  currencyFormatters.clear();
}

/** `$1,899.00` in English, `US$1,800` in Arabic — same currency, locale digits. */
export function formatCurrency(value: number, currency = 'EGP', compact = false): string {
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

/**
 * Relative "prices updated …" caption: "just now", "5 min ago", "3 h ago".
 *
 * Uses the caller's `t()` so the result is translated and pluralised, and falls
 * back to the raw date after a week — beyond that "17 d ago" stops being useful.
 */
export function formatRelativeShort(iso: string, t: (key: string, vars?: Record<string, unknown>) => string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';

  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 2) return t('search.updatedJustNow');
  if (minutes < 60) return t('search.updatedMinutes', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('search.updatedHours', { count: hours });

  const days = Math.floor(hours / 24);
  if (days <= 7) return t('search.updatedDays', { count: days });

  return formatDateShort(iso);
}

/**
 * Short, locale-aware date for "prices updated…" captions — e.g. `2 Nov` / `٢ نوفمبر`.
 * Returns an empty string for an unparseable value so callers never print `Invalid Date`.
 */
export function formatDateShort(value: string | Date, language = 'en'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_TAGS[language.split('-')[0] ?? 'en'] ?? 'en-EG', {
    day: 'numeric',
    month: 'short',
  }).format(date);
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
