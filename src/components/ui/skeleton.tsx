import { cn } from '@/lib/utils';

/** Shimmer block — the single loading primitive of the app (no spinners). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn('shimmer rounded-md bg-surface-elevated/70', className)} {...props} />
  );
}
