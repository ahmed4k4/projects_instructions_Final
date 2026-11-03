/**
 * Canonical application URL.
 *
 * Why an env var at all: a share link must point at the PUBLIC address, and
 * `window.location.origin` is wrong in three real cases —
 *   · a preview/staging deploy sharing links that point at the preview host,
 *   · the app served under a sub-path (GitHub Pages project sites),
 *   · a link generated in a test or a worker with no `window`.
 *
 * `VITE_APP_URL` wins when set; otherwise the current origin is used, so local
 * development and single-origin deploys need no configuration.
 */

/** Trailing slashes are stripped so callers can concatenate a path safely. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function appUrl(): string {
  const configured = import.meta.env.VITE_APP_URL?.trim();

  if (configured) {
    // A relative or malformed value would produce broken share links; fall back
    // rather than emit them.
    try {
      const parsed = new URL(configured);
      return trimTrailingSlash(parsed.origin + parsed.pathname);
    } catch {
      // fall through to the runtime origin
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    // BASE_URL keeps sub-path deploys working (e.g. /nexus/).
    const base = import.meta.env.BASE_URL ?? '/';
    const path = base === '/' ? '' : trimTrailingSlash(base);
    return trimTrailingSlash(window.location.origin) + path;
  }

  return '';
}

/** Absolute URL for an in-app path (`/b/slug` → `https://host/b/slug`). */
export function absoluteUrl(path: string): string {
  const base = appUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
