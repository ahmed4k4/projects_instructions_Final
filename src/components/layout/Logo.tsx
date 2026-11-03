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

export function Logo({ compact = false, to = '/', className }: LogoProps) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();

  return (
    <Link
      to={to}
      aria-label={t('common.logoHome', { name: APP_NAME })}
      className={cn(
        'group flex items-center gap-2.5 outline-none',
        // A finger target: the mark itself is 36px, which is under the 44px rule.
        'pointer-coarse:min-h-11',
        className,
      )}
    >
      <motion.span
        className="relative grid size-9 place-items-center rounded-lg border border-primary/30 bg-surface-elevated pointer-coarse:size-11"
        whileHover={reduce ? undefined : { rotate: -6, scale: 1.04 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <span className="absolute inset-0 rounded-lg bg-primary/20 blur-md transition-opacity group-hover:opacity-100 opacity-0" />
        <svg viewBox="0 0 24 24" className="relative size-5" fill="none" aria-hidden>
          <path
            d="M6 18V6l12 12V6"
            stroke="url(#logo-grad)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="6" r="1.8" fill="rgb(var(--accent))" />
          <defs>
            <linearGradient id="logo-grad" x1="6" y1="6" x2="18" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgb(var(--primary-glow))" />
              <stop offset="1" stopColor="rgb(var(--accent))" />
            </linearGradient>
          </defs>
        </svg>
      </motion.span>

      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('app.subtitle')}
          </span>
        </span>
      )}
    </Link>
  );
}
