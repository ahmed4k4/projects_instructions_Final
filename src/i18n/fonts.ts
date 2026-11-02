/**
 * On-demand Arabic font loading.
 *
 * IBM Plex Sans Arabic is ~125 kB of woff2 across four weights and is useless to
 * an English visitor. It used to sit in the base stylesheet, where it downloaded
 * before first paint and was the single largest cost on a throttled phone
 * (240 kB of fonts against 234 kB of everything else).
 *
 * Now it lives in `arabicFontBundle.ts`, which Vite emits as its own chunk and
 * CSS asset. This module requests it the first time the UI switches to Arabic.
 * Until then the RTL font stack falls back to the system Arabic face, which is
 * already installed on the devices that need it.
 *
 * Keep `arabicFontBundle.ts` out of every eager import path.
 */

let loadPromise: Promise<void> | null = null;

/** Load the Arabic face. Idempotent — repeated calls reuse the same promise. */
export function loadArabicFont(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  loadPromise ??= import('@/styles/arabicFontBundle')
    .then(() => undefined)
    .catch(() => {
      // A missing font must never break the UI: the CSS stack already names a
      // system Arabic fallback.
    });

  return loadPromise;
}

/** True once the Arabic face has been requested (diagnostics / tests). */
export function isArabicFontRequested(): boolean {
  return loadPromise !== null;
}
