import type { PCComponent } from '@/types/components';

/**
 * Stock status is a retailer observation, not a permanent product attribute.
 * The feed is normally refreshed daily; after 48 hours we no longer present a
 * positive or negative stock claim as current.
 */
export const STOCK_STATUS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function getFreshStockStatus(
  status: PCComponent['stockStatus'],
  checkedAt: string | null | undefined,
  now = Date.now(),
): PCComponent['stockStatus'] {
  if (!status || status === 'unknown') return 'unknown';
  if (typeof checkedAt !== 'string' || checkedAt.trim() === '') return 'unknown';

  const timestamp = Date.parse(checkedAt);
  if (!Number.isFinite(timestamp)) return 'unknown';
  const age = now - timestamp;
  if (age < -5 * 60 * 1000 || age > STOCK_STATUS_MAX_AGE_MS) return 'unknown';
  return status;
}
