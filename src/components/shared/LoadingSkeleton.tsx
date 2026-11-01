import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  variant?: 'card' | 'row' | 'page';
  count?: number;
  className?: string;
}

/** Shimmer skeletons — the only loading treatment in the app. */
export function LoadingSkeleton({ variant = 'card', count = 1, className }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, index) => index);

  if (variant === 'row') {
    return (
      <div className={cn('space-y-2', className)}>
        {items.map((index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3"
          >
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'page') {
    return (
      <div className={cn('container py-12', className)} aria-busy>
        <Skeleton className="mb-4 h-8 w-56 rounded-lg" />
        <Skeleton className="mb-10 h-4 w-80" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)} aria-busy>
      {items.map((index) => (
        <div key={index} className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
