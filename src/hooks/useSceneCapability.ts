import { useEffect, useState } from 'react';

/**
 * Capability probe for the hero scene.
 *
 * The 3D motherboard costs ~250 kB gzip of Three.js plus a live WebGL context —
 * defensible on a desktop, wasteful on a mid-range phone that will render it at
 * 12 fps. This decides once, before the lazy chunk is ever requested, so low-end
 * devices never download Three.js at all.
 *
 * Signals, in order of reliability:
 *   · `hardwareConcurrency` — 4 or fewer logical cores is a strong low-end hint.
 *   · `deviceMemory` (Chromium only) — ≤ 4 GB.
 *   · viewport width < 768px — phones are treated as static by default.
 *     Deliberately below the `md` breakpoint so a 768px tablet (which lays out
 *     the full desktop grid) still gets the scene.
 *   · `prefers-reduced-motion` — an explicit user preference, always honoured.
 *   · WebGL availability — if a context cannot be created, there is nothing to show.
 */
export interface SceneCapability {
  /** Render the interactive 3D scene. */
  use3d: boolean;
  /** Still probing — render nothing yet to avoid a flash of the wrong variant. */
  pending: boolean;
  reason: 'desktop' | 'mobile' | 'low-end' | 'reduced-motion' | 'no-webgl' | 'context-lost';
}

/**
 * Set for the rest of the session once a GPU context has been lost.
 *
 * The context-loss event fires on the canvas, not the page, so it cannot be
 * caught by a React boundary on its own — and re-mounting the scene after a loss
 * usually just loses it again (the driver is in a bad state). Once seen, every
 * later visit in this tab renders the static image.
 */
let contextLostForSession = false;

export function markSceneContextLost(): void {
  contextLostForSession = true;
}

/** True when `detect()` should refuse the 3D variant after a context loss. */
export function isSceneBlacklisted(): boolean {
  return contextLostForSession;
}

function detect(): SceneCapability {
  if (typeof window === 'undefined') return { use3d: false, pending: true, reason: 'no-webgl' };

  if (contextLostForSession) return { use3d: false, pending: false, reason: 'context-lost' };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { use3d: false, pending: false, reason: 'reduced-motion' };
  }

  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;

  // Probe WebGL once. A throw or null context means the scene cannot run.
  let hasWebGl = false;
  try {
    const canvas = document.createElement('canvas');
    hasWebGl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    hasWebGl = false;
  }
  if (!hasWebGl) return { use3d: false, pending: false, reason: 'no-webgl' };

  if (window.innerWidth < 768) return { use3d: false, pending: false, reason: 'mobile' };
  if (cores <= 4 || memory <= 4) return { use3d: false, pending: false, reason: 'low-end' };

  return { use3d: true, pending: false, reason: 'desktop' };
}

export function useSceneCapability(): SceneCapability {
  // Start `pending` so the server/first paint shows nothing rather than the
  // heavy variant, then resolve in an effect (matchMedia is not SSR-safe).
  const [capability, setCapability] = useState<SceneCapability>({
    use3d: false,
    pending: true,
    reason: 'no-webgl',
  });

  useEffect(() => {
    setCapability(detect());
  }, []);

  return capability;
}

export default useSceneCapability;
