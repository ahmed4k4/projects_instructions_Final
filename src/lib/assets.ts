/**
 * Public asset URLs.
 *
 * Every file under `public/` is served from `import.meta.env.BASE_URL`, which is
 * `/` on a normal deploy and a sub-path (e.g. `/beta/`) when `base` is configured.
 * A literal `/media/…` silently 404s in the second case, so paths are always
 * built here rather than written into components.
 */

const BASE = import.meta.env.BASE_URL || '/';

/** Join a public asset path with the deploy base. */
function publicAsset(path: string): string {
  const clean = path.replace(/^\/+/, '');
  return `${BASE.endsWith('/') ? BASE : `${BASE}/`}${clean}`;
}

export const HERO_IMAGE_PNG = publicAsset('media/hero-scene.png');
export const HERO_IMAGE_WEBP = publicAsset('media/hero-scene.webp');
