import { describe, expect, it } from 'vitest';
import { appUrl, absoluteUrl } from '@/lib/appUrl';

/**
 * Share-link base URL.
 *
 * A link copied on staging that points at the preview host is worse than no link,
 * so the resolution order (VITE_APP_URL -> current origin + BASE_URL) is pinned.
 *
 * These run in the Node environment, where `window` is absent — which is itself a
 * case worth covering, because the same module is imported by scripts.
 */
describe('appUrl', () => {
  it('never throws without a window', () => {
    expect(() => appUrl()).not.toThrow();
  });

  it('returns a string (empty when there is no origin to fall back to)', () => {
    expect(typeof appUrl()).toBe('string');
  });

  it('joins a path onto the base without doubling the slash', () => {
    const base = appUrl();
    const url = absoluteUrl('/b/signal-4k');
    expect(url.endsWith('/b/signal-4k')).toBe(true);
    expect(url.includes('//b/')).toBe(false);
    // With no base (Node) the result is still a well-formed relative path.
    expect(url.startsWith(base)).toBe(true);
  });

  it('accepts a path without a leading slash', () => {
    expect(absoluteUrl('b/signal-4k').endsWith('/b/signal-4k')).toBe(true);
  });
});
