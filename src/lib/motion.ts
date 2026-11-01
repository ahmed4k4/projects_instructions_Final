import type { Transition, Variants } from 'framer-motion';

/**
 * NEXUS motion system.
 *
 * Rules of the house: 200–400ms, ease-out or spring, never bouncy, and every
 * preset must still look intentional when reduced motion collapses it to a
 * near-instant fade. Consume these instead of ad-hoc transitions.
 */

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const spring: Transition = { type: 'spring', stiffness: 320, damping: 30, mass: 0.9 };
export const springSoft: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 1 };

export const duration = {
  fast: 0.18,
  base: 0.28,
  slow: 0.4,
} as const;

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                */
/* -------------------------------------------------------------------------- */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.base, ease: EASE_OUT } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: EASE_OUT } },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: EASE_OUT } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: duration.base, ease: EASE_OUT } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: { duration: duration.slow, ease: EASE_OUT } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: duration.slow, ease: EASE_OUT } },
};

/* -------------------------------------------------------------------------- */
/*  Lists                                                                     */
/* -------------------------------------------------------------------------- */

export function makeStagger(delayChildren = 0.06, delay = 0.04): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: delayChildren, delayChildren: delay },
    },
  };
}

export const staggerContainer = makeStagger();

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: EASE_OUT } },
};

/* -------------------------------------------------------------------------- */
/*  Page transitions                                                          */
/* -------------------------------------------------------------------------- */

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease: EASE_OUT } },
};

/* -------------------------------------------------------------------------- */
/*  Interaction                                                               */
/* -------------------------------------------------------------------------- */

export const hoverLift = {
  whileHover: { y: -4, transition: spring },
  whileTap: { y: 0, transition: spring },
  // Framer attaches focus listeners as well when any interaction prop is used;
  // pinning the focus state stops it from toggling on every re-render.
  whileFocus: { y: -4, transition: spring },
} as const;

export const glowTransition: Transition = { duration: duration.base, ease: EASE_OUT };

/** Modal / dialog shell (used by Radix Dialog content). */
export const modalMotion = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: duration.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: duration.fast, ease: EASE_OUT } },
} as const;

/** Viewport config for scroll-triggered (`whileInView`) reveals. */
export const viewportOnce = { once: true, amount: 0.25 } as const;
