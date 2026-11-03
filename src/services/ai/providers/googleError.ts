/** Parse Gemini REST error payloads without depending on browser or SDK types. */
export interface GoogleApiErrorDetails {
  message: string;
  status: string | null;
  retryAfterSeconds: number | null;
  quotaLabels: string[];
}

function durationSeconds(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(\d+(?:\.\d+)?)s\s*$/.exec(value);
  return match ? Math.max(0, Math.ceil(Number(match[1]))) : null;
}

function headerRetrySeconds(value: string | null | undefined, nowMs: number): number | null {
  if (!value) return null;
  const numeric = Number(value.trim());
  if (Number.isFinite(numeric) && numeric >= 0) return Math.ceil(numeric);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - nowMs) / 1000)) : null;
}

/**
 * Google may describe a 429 as RPM/TPM/RPD exhaustion in error.message and/or
 * include RetryInfo / QuotaFailure entries under error.details. Preserve those
 * diagnostics so the UI can distinguish a short throttle from a daily quota.
 */
export function parseGoogleApiError(
  payload: unknown,
  retryAfterHeader?: string | null,
  nowMs = Date.now(),
): GoogleApiErrorDetails {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const error = root.error && typeof root.error === 'object'
    ? root.error as Record<string, unknown>
    : root;
  const details = Array.isArray(error.details) ? error.details : [];
  const appRetry = typeof root.retryAfterSeconds === 'number' && Number.isFinite(root.retryAfterSeconds)
    ? Math.max(0, Math.ceil(root.retryAfterSeconds))
    : null;
  let retryAfterSeconds = headerRetrySeconds(retryAfterHeader, nowMs) ?? appRetry;
  const quotaLabels: string[] = [];

  for (const entry of details) {
    if (!entry || typeof entry !== 'object') continue;
    const detail = entry as Record<string, unknown>;
    const type = typeof detail['@type'] === 'string' ? detail['@type'] : '';
    if (type.includes('RetryInfo')) {
      retryAfterSeconds ??= durationSeconds(detail.retryDelay);
    }
    if (type.includes('QuotaFailure') && Array.isArray(detail.violations)) {
      for (const violation of detail.violations) {
        if (!violation || typeof violation !== 'object') continue;
        const item = violation as Record<string, unknown>;
        const quotaId = typeof item.quotaId === 'string' ? item.quotaId : '';
        const metric = typeof item.quotaMetric === 'string' ? item.quotaMetric : '';
        const dimensions = item.quotaDimensions && typeof item.quotaDimensions === 'object'
          ? Object.entries(item.quotaDimensions as Record<string, unknown>)
              .map(([key, value]) => `${key}=${String(value)}`)
              .join(', ')
          : '';
        const label = [quotaId || metric, dimensions].filter(Boolean).join(' — ');
        if (label && !quotaLabels.includes(label)) quotaLabels.push(label);
      }
    }
  }

  const message = typeof error.message === 'string'
    ? error.message
    : typeof root.message === 'string'
      ? root.message
      : 'Google Gemini returned an HTTP error without a message.';
  const status = typeof error.status === 'string' ? error.status : null;

  return { message: message.slice(0, 700), status, retryAfterSeconds, quotaLabels: quotaLabels.slice(0, 3) };
}
