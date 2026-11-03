import { describe, expect, it, vi } from 'vitest';
import { probeModels } from '../models';

describe('probeModels quota handling', () => {
  it('stops after the first rate-limit response instead of probing every model', async () => {
    const check = vi.fn(async () => 'rate_limited' as const);
    const result = await probeModels('chat', check);
    expect(check).toHaveBeenCalledTimes(1);
    expect(result.rateLimited).toBe(true);
    expect(result.modelId).toBeNull();
    expect(result.attempts).toHaveLength(1);
  });
});
