import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GradientMeshProps {
  className?: string;
  /** Visual intensity — hero sections want `strong`, page shells `subtle`. */
  intensity?: 'subtle' | 'strong';
}

/**
 * Ambient animated gradient mesh + grid overlay used behind hero sections.
 * Pure CSS transform animation (GPU friendly); collapses to a still frame when
 * the user prefers reduced motion.
 */
export function GradientMesh({ className, intensity = 'strong' }: GradientMeshProps) {
  const reduce = useReducedMotion();
  const strength = intensity === 'strong' ? 0.72 : 0.38;

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0 grid-overlay" />

      <motion.div
        className="absolute -left-[15%] -top-[25%] size-[52rem] rounded-full blur-[120px] animate-mesh-drift"
        style={{
          background: `radial-gradient(circle at center, rgb(var(--secondary) / ${0.22 * strength}), transparent 65%)`,
          opacity: reduce ? 0.7 : 1,
        }}
      />
      <motion.div
        className="absolute -right-[10%] -top-[10%] size-[44rem] rounded-full blur-[130px] animate-mesh-drift"
        style={{
          animationDelay: '-7s',
          background: `radial-gradient(circle at center, rgb(var(--primary) / ${0.16 * strength}), transparent 65%)`,
          opacity: reduce ? 0.7 : 1,
        }}
      />
      <motion.div
        className="absolute bottom-[-30%] left-[25%] size-[40rem] rounded-full blur-[140px] animate-mesh-drift"
        style={{
          animationDelay: '-14s',
          background: `radial-gradient(circle at center, rgb(var(--accent) / ${0.10 * strength}), transparent 65%)`,
          opacity: reduce ? 0.6 : 1,
        }}
      />

      {/* Bottom fade so content sits on a clean background */}
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-background" />
      <div className="absolute inset-0 noise opacity-60" />
    </div>
  );
}
