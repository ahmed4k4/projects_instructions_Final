import { CURRENCY } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { AnimatedNumber } from './AnimatedNumber';
import { cn } from '@/lib/utils';

interface PriceTagProps {
  value: number;
  currency?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const sizes = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-3xl',
} as const;

/**
 * Monospace, tabular price with an animated value change.
 *
 * The default follows `CURRENCY` (EGP). It used to default to a literal 'USD',
 * which overrode the app-wide currency and kept `$` on every price tag.
 */
export function PriceTag({ value, currency = CURRENCY, className, size = 'md', animate = true }: PriceTagProps) {
  return (
    <span className={cn('font-mono font-medium tracking-tight tabular-nums', sizes[size], className)}>
      {animate ? (
        <AnimatedNumber value={value} format={(v) => formatCurrency(v, currency)} duration={0.7} />
      ) : (
        formatCurrency(value, currency)
      )}
    </span>
  );
}
