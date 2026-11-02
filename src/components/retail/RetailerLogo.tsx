import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { RETAILERS, type RetailerId } from '@/services/retailers/types';

/**
 * Retailer logo tile.
 *
 * Drawn as a monogram rather than an <img>: the real marks are trademarked, and
 * fetching them per row would add four third-party requests to every card. This
 * keeps the comparison scannable and the bundle external-dependency-free.
 */

const TONES: Record<string, string> = {
  primary: 'bg-primary/15 text-primary-glow ring-primary/25',
  accent: 'bg-accent/15 text-accent ring-accent/25',
  success: 'bg-success/15 text-success ring-success/25',
  warning: 'bg-warning/15 text-warning ring-warning/25',
};

export function RetailerLogo({
  retailerId,
  size = 'md',
  showName = false,
  className,
}: {
  retailerId: RetailerId;
  size?: 'sm' | 'md';
  showName?: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const meta = RETAILERS[retailerId];
  if (!meta) return null;

  const label = i18n.language.startsWith('ar') ? meta.nameAr : meta.name;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        title={label}
        aria-label={label}
        className={cn(
          'grid shrink-0 place-items-center rounded-md font-semibold ring-1',
          size === 'sm' ? 'size-6 text-[11px]' : 'size-8 text-sm',
          TONES[meta.tone] ?? TONES.primary,
        )}
      >
        {meta.monogram}
      </span>
      {showName ? <span className="truncate text-xs text-muted-foreground">{label}</span> : null}
    </span>
  );
}

export default RetailerLogo;
