import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface AnimatedNumberProps {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Count-up number driven by a motion value (no re-renders per frame).
 * When the user prefers reduced motion the final value is rendered instantly.
 */
export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString('en-US'),
  duration = 0.9,
  className,
  prefix,
  suffix,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const source = useMotionValue(reduce ? value : 0);
  const text = useTransform(source, (latest) => format(latest));
  const isFirst = useRef(true);

  useEffect(() => {
    if (reduce) {
      source.set(value);
      return;
    }
    const controls = animate(source, value, {
      duration: isFirst.current ? duration : Math.min(duration, 0.6),
      ease: [0.22, 1, 0.36, 1],
    });
    isFirst.current = false;
    return () => controls.stop();
  }, [value, source, duration, reduce]);

  return (
    <span className={cn('tabular tabular-nums', className)}>
      {prefix}
      <motion.span>{text}</motion.span>
      {suffix}
    </span>
  );
}
