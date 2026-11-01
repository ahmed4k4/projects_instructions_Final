import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { scaleIn } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border-strong',
        'bg-surface/40 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-2xl" aria-hidden />
        <div className="relative grid size-14 place-items-center rounded-2xl border border-border-strong bg-surface-elevated">
          <Icon className="size-6 text-primary-glow" />
        </div>
      </div>
      <div className="max-w-sm space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
