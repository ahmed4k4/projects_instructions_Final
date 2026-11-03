import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type CompatibilityStatus = 'ok' | 'warning' | 'error' | 'info';

const config: Record<
  CompatibilityStatus,
  { icon: typeof CheckCircle2; className: string; defaultLabel: string }
> = {
  ok: {
    icon: CheckCircle2,
    className: 'border-success/25 bg-success/10 text-success',
    defaultLabel: 'Compatible',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-warning/25 bg-warning/10 text-warning',
    defaultLabel: 'Check clearance',
  },
  error: {
    icon: XCircle,
    className: 'border-danger/25 bg-danger/10 text-danger',
    defaultLabel: 'Incompatible',
  },
  info: {
    icon: Info,
    className: 'border-secondary/25 bg-secondary/10 text-secondary',
    defaultLabel: 'Heads up',
  },
};

interface CompatibilityBadgeProps {
  status: CompatibilityStatus;
  label?: string;
  className?: string;
}

/** Colour-coded compatibility pill used by cards, summaries and build detail. */
export function CompatibilityBadge({ status, label, className }: CompatibilityBadgeProps) {
  const { icon: Icon, className: tone, defaultLabel } = config[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {label ?? defaultLabel}
    </span>
  );
}
