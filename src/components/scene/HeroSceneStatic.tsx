import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { HERO_IMAGE_PNG, HERO_IMAGE_WEBP } from '@/lib/assets';

/**
 * Static replacement for `Hero3DScene`.
 *
 * Used in three situations, all of which must look identical:
 *   · phones and low-end devices (`hooks/useSceneCapability`)
 *   · the Suspense fallback while the Three.js chunk loads
 *   · **WebGL failed** — context lost, driver reset, blocklisted GPU. The
 *     `SceneErrorBoundary` renders this instead of a dead canvas.
 *
 * The image is a real render of the same 3D scene (captured by
 * `scripts/shot.mjs`), not a stock photo, so the hero does not change shape
 * across device tiers — it simply stops moving.
 *
 * Both formats ship: WebP is 16 kB, the PNG 309 kB. `<picture>` lets the browser
 * pick WebP when it can decode it and fall back automatically. If neither file
 * can be fetched (an odd CSP, a broken deploy) the box still holds its size and
 * shows the ambient glow, so layout never jumps.
 */
export function HeroSceneStatic({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn('relative', className)}>
      {failed ? (
        <div
          role="img"
          aria-label={t('landing.sceneAlt')}
          className="h-full w-full rounded-2xl border border-white/5 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(20,190,173,0.18),transparent_70%)]"
        />
      ) : (
        <picture>
          <source srcSet={HERO_IMAGE_WEBP} type="image/webp" />
          <img
            src={HERO_IMAGE_PNG}
            alt={t('landing.sceneAlt')}
            width={960}
            height={516}
            // Above the fold: eager in the DOM, but the chunk/decoder is async so
            // it never blocks the hero text from painting.
            decoding="async"
            fetchPriority="high"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(20,190,173,0.22)]"
          />
        </picture>
      )}
      {/* Same ambient glow the live scene produces, so the swap is invisible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-6 -z-10 rounded-full bg-primary/20 blur-[110px]"
      />
    </div>
  );
}

export default HeroSceneStatic;
