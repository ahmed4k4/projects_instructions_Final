import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';

interface LogoProps {
  compact?: boolean;
  to?: string;
  className?: string;
}

/** RIGPILOT mark: a precision chip frame with a forward signal path. */
export function Logo({ compact = false, to = '/', className }: LogoProps) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();

  return (
    <Link
      to={to}
      aria-label={t('common.logoHome', { name: APP_NAME })}
      className={cn('group flex items-center gap-3 outline-none pointer-coarse:min-h-11', className)}
    >
      <motion.span
        className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-primary/35 bg-[linear-gradient(145deg,rgb(var(--surface-elevated)),rgb(var(--surface-inset)))] shadow-[0_8px_28px_-13px_rgb(var(--primary)/0.72)] pointer-coarse:size-11"
        whileHover={reduce ? undefined : { y: -1, scale: 1.035 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <span className="absolute inset-[5px] rounded-lg border border-secondary/25" />
        <svg viewBox="0 0 40 40" className="relative size-[29px]" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="rigpilot-chip" x1="5" y1="5" x2="35" y2="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgb(66 217 245)" />
              <stop offset="1" stopColor="rgb(154 135 255)" />
            </linearGradient>
          </defs>
          <rect x="7" y="7" width="26" height="26" rx="5.5" stroke="url(#rigpilot-chip)" strokeWidth="1.8" />
          <path d="M13 3v4M20 3v4M27 3v4M13 33v4M20 33v4M27 33v4M3 13h4M3 20h4M3 27h4M33 13h4M33 20h4M33 27h4" stroke="rgb(112 231 255)" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="13" y="13" width="14" height="14" rx="2.5" fill="rgb(66 217 245 / 0.09)" stroke="rgb(154 135 255)" strokeWidth="1.35" />
          <path d="M15.5 20h8.1M20.5 16.6 24 20l-3.5 3.4" stroke="rgb(184 243 107)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="pointer-events-none absolute -inset-1 rounded-2xl border border-primary/0 transition-colors duration-300 group-hover:border-primary/20" />
      </motion.span>

      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-sm font-extrabold tracking-[0.14em] text-foreground">
            {APP_NAME}<span className="text-primary">.</span>
          </span>
          <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            {t('app.subtitle')}
          </span>
        </span>
      )}
    </Link>
  );
}
