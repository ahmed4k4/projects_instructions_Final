import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { CURRENCY } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

interface BudgetMeterProps {
  spent: number;
  budget: number;
  currency?: string;
  className?: string;
}

/**
 * Horizontal spend meter that shifts indigo → amber → red as it approaches and
 * passes the budget.
 *
 * Both figures are formatted with `Intl.NumberFormat` in the active language, so
 * currency placement and digit grouping follow the locale. In RTL the bar fills
 * from the right automatically (it uses logical inset properties).
 */
export function BudgetMeter({ spent, budget, currency = CURRENCY, className }: BudgetMeterProps) {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();

  const format = (value: number) =>
    new Intl.NumberFormat(i18n.language === 'ar' ? 'ar' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  const ratio = budget > 0 ? spent / budget : 0;
  const percent = Math.min(100, Math.round(ratio * 100));

  const state = ratio > 1 ? 'over' : ratio > 0.9 ? 'tight' : 'ok';
  const bar = {
    ok: 'bg-primary-gradient',
    tight: 'bg-gradient-to-r from-primary via-warning to-warning',
    over: 'bg-gradient-to-r from-warning to-danger',
  }[state];

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="flex flex-wrap items-baseline gap-1 text-muted-foreground">
          <span className="font-mono text-foreground tabular-nums">{format(spent)}</span>
          <span>/</span>
          <span className="font-mono tabular-nums">{format(budget)}</span>
        </span>
        <span
          className={cn(
            'font-mono tabular-nums',
            state === 'over' ? 'text-danger' : state === 'tight' ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {state === 'over'
            ? t('builder.summary.overBudget', { amount: format(spent - budget) })
            : `${percent}%`}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
        <motion.div
          className={cn('h-full rounded-full', bar)}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: reduce ? 0 : 0.5, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}
