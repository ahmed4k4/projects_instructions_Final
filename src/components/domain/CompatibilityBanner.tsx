import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from 'lucide-react';
import type { CompatibilityReport } from '@/lib/compatibility/types';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

interface CompatibilityBannerProps {
  report: CompatibilityReport;
  className?: string;
}

/**
 * Sticky status strip above the builder grid.
 * Green when clean, amber for warnings only, red for errors — click to expand
 * the full list. Announced politely so screen readers hear state changes.
 */
export function CompatibilityBanner({ report, className }: CompatibilityBannerProps) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const errors = report.errors;
  const warnings = report.warnings.filter((w) => !w.ruleKey.startsWith('missing_'));
  const missing = report.warnings.filter((w) => w.ruleKey.startsWith('missing_'));

  const state = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

  const tone = {
    ok: {
      icon: CheckCircle2,
      wrap: 'border-success/30 bg-success/[0.07] text-success',
      label:
        missing.length > 0
          ? t('builder.banner.allCompatibleMissing', { count: missing.length })
          : t('builder.banner.allCompatible'),
    },
    warning: {
      icon: AlertTriangle,
      wrap: 'border-warning/30 bg-warning/[0.07] text-warning',
      label: t('builder.banner.warnings', { count: warnings.length }),
    },
    error: {
      icon: XCircle,
      wrap: 'border-danger/30 bg-danger/[0.07] text-danger',
      label: t('builder.banner.errors', { count: errors.length }),
    },
  }[state];

  const Icon = tone.icon;
  const issues = [...errors, ...warnings];
  const expandable = issues.length > 0;

  return (
    <div className={cn('overflow-hidden rounded-xl border', tone.wrap, className)} aria-live="polite">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-start text-xs font-medium md:min-h-0',
          expandable ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default',
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1">{tone.label}</span>
        {expandable && (
          <ChevronDown
            className={cn('size-3.5 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
            className="space-y-1 border-t border-current/10 px-4 py-2.5"
          >
            {issues.map((issue) => (
              <li
                key={`${issue.ruleKey}-${issue.componentAId}-${issue.componentBId}`}
                className="flex items-start gap-2 text-[11.5px] leading-relaxed"
              >
                {issue.severity === 'error' ? (
                  <XCircle className="mt-0.5 size-3 shrink-0 text-danger" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                )}
                <span className={issue.severity === 'error' ? 'text-danger' : 'text-warning'}>
                  {issue.message}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
