import { motion, useReducedMotion } from 'framer-motion';
import { cn, scoreTone } from '@/lib/utils';
import { AnimatedNumber } from '@/components/shared/AnimatedNumber';

const toneStroke: Record<ReturnType<typeof scoreTone>, string> = {
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  primary: 'rgb(var(--primary))',
  danger: 'rgb(var(--danger))',
};

interface BuildScoreRingProps {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

/** Circular build score with an animated stroke and count-up value. */
export function BuildScoreRing({
  score,
  size = 120,
  strokeWidth = 8,
  label = 'Build score',
  className,
}: BuildScoreRingProps) {
  const reduce = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeScore = score === null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference - (safeScore / 100) * circumference;
  const tone = scoreTone(safeScore);

  return (
    <div
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null ? `${label}: not scored` : `${label}: ${Math.round(score)} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--foreground) / 0.07)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={toneStroke[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 ${strokeWidth}px ${toneStroke[tone].replace(')', ' / 0.35)')})` }}
        />
      </svg>
      {/* `dir="ltr"` isolates the numeric readout: inside an RTL page the
          "/ 100" caption otherwise reorders to "100 /". */}
      <div className="absolute inset-0 grid place-items-center" dir="ltr">
        <div className="text-center">
          <div className="font-mono text-2xl font-semibold leading-none tabular-nums">
            {score === null ? '—' : <AnimatedNumber value={safeScore} duration={1.1} />}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">/ 100</div>
        </div>
      </div>
    </div>
  );
}
