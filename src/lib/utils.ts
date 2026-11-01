import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** $1,899.00 style money formatting, cached per currency. */
export function formatCurrency(value: number, currency = 'USD', compact = false): string {
  const key = `${currency}:${compact ? 1 : 0}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: compact ? 0 : value % 1 === 0 ? 0 : 2,
      notation: compact ? 'compact' : 'standard',
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
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
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
