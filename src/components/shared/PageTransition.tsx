import type { ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import { EASE_OUT } from '@/lib/motion';

/**
 * AnimatePresence wrapper around the router outlet.
 *
 * `key` is the pathname so a route change mounts/animates the new page.
 * `MotionConfig reducedMotion="user"` makes every nested animation honour
 * prefers-reduced-motion automatically.
 *
 * The horizontal shift is direction-neutral (both x and y are used), so it
 * reads correctly in LTR and RTL without a mirrored variant.
 */
export function PageTransition({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const outlet = useOutlet();

  const variants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease: EASE_OUT } },
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* No `initial={false}`: with the shell mounted for the first time it
          suppresses the very first child and the route renders empty. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-h-full"
        >
          {children ?? outlet}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
