import { useRef } from 'react';
import { useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

/**
 * Pointer-driven 3D tilt, with a glow that follows the cursor.
 *
 * Why hand-rolled instead of `react-parallax-tilt`: that package is ~15 kB for
 * one effect and drives the transform through inline styles on every mousemove,
 * while Framer's motion values stay off the React render path entirely.
 *
 * Accessibility and performance rules baked in:
 *   · **Mouse only** — `pointer: fine` is required, so a touch device never
 *     tilts a card while scrolling.
 *   · `prefers-reduced-motion` disables the tilt completely (motion values stay
 *     at 0, so the card renders flat and static).
 *   · The transform is small (±6°) and spring-damped: a card that swings far
 *     enough to read as broken is worse than no effect.
 *   · `transformPerspective` is applied to the card itself rather than a
 *     wrapper, so layout and hit-testing are unaffected.
 */
export function useCardTilt() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // Normalised pointer position, -0.5 … 0.5 in both axes.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-6, 6]), spring);

  /** Cursor position as percentages, for the radial highlight. */
  const glowX = useTransform(px, [-0.5, 0.5], ['0%', '100%']);
  const glowY = useTransform(py, [-0.5, 0.5], ['0%', '100%']);

  const enabled = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && !reduce;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
  };

  return {
    ref,
    enabled,
    style: reduce ? undefined : { rotateX, rotateY, transformPerspective: 900 },
    glowStyle: { left: glowX, top: glowY },
    handlers: { onPointerMove, onPointerLeave },
  };
}
