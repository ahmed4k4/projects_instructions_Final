import { describe, expect, it } from 'vitest';
import { isModelScopedQuotaFailure, parseGoogleApiError } from '../googleError';

describe('parseGoogleApiError', () => {
  it('reads RetryInfo and per-model QuotaFailure details', () => {
    const parsed = parseGoogleApiError({
      error: {
        message: 'Quota exceeded for this project.',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '18s' },
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [
            { quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-3.5-flash-lite' } },
          ] },
        ],
      },
    });
    expect(parsed.message).toContain('Quota exceeded');
    expect(parsed.status).toBe('RESOURCE_EXHAUSTED');
    expect(parsed.retryAfterSeconds).toBe(18);
    expect(parsed.quotaLabels.join(' ')).toContain('gemini-3.5-flash-lite');
    expect(isModelScopedQuotaFailure(parsed)).toBe(true);
  });

  it('prefers Retry-After header and supports app-owned quota responses', () => {
    expect(parseGoogleApiError({ retryAfterSeconds: 60, error: { message: 'Site quota reached' } }).retryAfterSeconds).toBe(60);
    expect(parseGoogleApiError({ error: { message: 'Slow down' } }, '9').retryAfterSeconds).toBe(9);
  });

  it('does not treat a project-wide quota as a model-scoped quota', () => {
    const parsed = parseGoogleApiError({ error: { message: 'Daily project quota exceeded.' } });
    expect(isModelScopedQuotaFailure(parsed)).toBe(false);
  });

  it('does not invent a retry delay when the provider omitted it', () => {
    expect(parseGoogleApiError({ error: { message: 'Quota exceeded' } }).retryAfterSeconds).toBeNull();
  });
});
