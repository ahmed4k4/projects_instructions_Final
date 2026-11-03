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
        className="relative grid size-10 place-items-center rounded-xl border border-primary/35 bg-[linear-gradient(145deg,rgb(var(--surface-elevated)),rgb(var(--surface-inset)))] shadow-[0_8px_24px_-12px_rgb(var(--primary)/0.8)] pointer-coarse:size-11"
        whileHover={reduce ? undefined : { rotate: -4, scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <span className="absolute inset-1 rounded-lg border border-accent/20" />
        <svg viewBox="0 0 32 32" className="relative size-6" fill="none" aria-hidden>
          <rect x="5" y="5" width="22" height="22" rx="5" stroke="rgb(var(--primary-glow))" strokeWidth="1.6" />
          <rect x="10" y="10" width="12" height="12" rx="2" fill="rgb(var(--primary)/0.16)" stroke="rgb(var(--accent))" strokeWidth="1.4" />
          <path d="M13 2v3M19 2v3M13 27v3M19 27v3M2 13h3M2 19h3M27 13h3M27 19h3" stroke="rgb(var(--primary-glow))" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M13 16h6M16 13v6" stroke="rgb(var(--accent))" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </motion.span>

      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-[0.12em]">{APP_NAME}<span className="text-primary-glow">.</span></span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t('app.subtitle')}
          </span>
        </span>
      )}
    </Link>
  );
}
