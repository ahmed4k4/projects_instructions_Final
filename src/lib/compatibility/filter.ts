export type CandidateCompatibilityStatus = 'compatible' | 'incompatible' | 'unverified' | 'review';

/**
 * The compatible-only view hides only a confirmed hard conflict.
 * `unverified` and `review` must remain visible: missing counterpart parts or
 * missing specs do not prove incompatibility, and hiding them empties entire
 * GPU/PSU/cooling categories before their related parts have been selected.
 */
export function passesCompatibilityFilter(
  status: CandidateCompatibilityStatus | undefined,
  enabled: boolean,
): boolean {
  if (!enabled) return true;
  return status !== 'incompatible';
}
