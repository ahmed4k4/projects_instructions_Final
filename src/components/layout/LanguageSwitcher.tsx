import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { Languages } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Language switcher: a segmented EN / ع control with a shared-layout pill.
 *
 * The pill animates with `layoutId`, so switching language feels like one
 * element moving rather than two fading — the same treatment as the sidebar
 * indicator.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);
  const reduce = useReducedMotion();

  const options = [
    { id: 'en' as const, label: 'EN', title: t('language.english') },
    { id: 'ar' as const, label: 'ع', title: t('language.arabic') },
  ];

  return (
    <div
      role="group"
      aria-label={t('language.switchTo')}
      className={cn(
        'relative flex items-center gap-0.5 rounded-lg border border-border bg-surface/60 p-0.5',
        className,
      )}
    >
      <Languages className="mx-1.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {options.map((option) => {
        const active = language === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setLanguage(option.id)}
            aria-pressed={active}
            title={option.title}
            className={cn(
              'relative rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId="language-pill"
                className="absolute inset-0 rounded-md border border-border-strong bg-surface-elevated"
                transition={reduce ? { duration: 0 } : spring}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
