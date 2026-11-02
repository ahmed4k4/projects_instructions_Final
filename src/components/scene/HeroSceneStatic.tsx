import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Static replacement for `Hero3DScene` on phones and low-end devices.
 *
 * The image is a real render of the same 3D scene (captured by
 * `scripts/shot.mjs`), not a stock photo, so the hero looks identical across
 * device tiers — it simply stops moving. 309 kB PNG at 960×516, `loading="lazy"`
 * and `decoding="async"` so it never competes with the hero text for bandwidth.
 *
 * A `<picture>` with a WebP source means dropping `hero-scene.webp` into
 * `public/media/` upgrades this automatically, with the PNG as the fallback.
 */
export function HeroSceneStatic({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div className={cn('relative', className)}>
      <picture>
        <source srcSet="/media/hero-scene.webp" type="image/webp" />
        <img
          src="/media/hero-scene.png"
          alt={t('landing.sceneAlt')}
          width={960}
          height={516}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain drop-shadow-[0_24px_60px_rgba(79,107,255,0.25)]"
        />
      </picture>
      {/* Same ambient glow the live scene produces, so the swap is invisible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-6 -z-10 rounded-full bg-primary/20 blur-[110px]"
      />
    </div>
  );
}

export default HeroSceneStatic;
