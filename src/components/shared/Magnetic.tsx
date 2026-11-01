import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** How far the element drifts toward the pointer, in px. */
  strength?: number;
}

/**
 * Magnetic hover: the wrapped element leans toward the cursor and springs back
 * on leave.
 *
 * Pointer position is tracked on the wrapper (a larger hit area than the button
 * itself) so the pull begins just before the cursor reaches the edge. Disabled
 * entirely under `prefers-reduced-motion`, and on coarse pointers where hovering
 * is meaningless.
 */
export function Magnetic({ children, className, strength = 12 }: MagneticProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 260, damping: 22, mass: 0.5 });
  const y = useSpring(rawY, { stiffness: 260, damping: 22, mass: 0.5 });

  if (reduce) return <div className={className}>{children}</div>;

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
    const offsetY = (event.clientY - rect.top) / rect.height - 0.5;
    rawX.set(offsetX * strength * 2);
    rawY.set(offsetY * strength * 2);
  };
  const reset = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x, y }}
      className={cn('inline-block will-change-transform', className)}
    >
      {children}
    </motion.div>
  );
}

export default Magnetic;
