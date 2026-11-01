import { CATEGORY_MAP } from '@/lib/constants';
import type { ComponentCategory } from '@/types/components';
import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  primary: 'border-primary/25 bg-primary/10 text-primary-glow',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  secondary: 'border-secondary/25 bg-secondary/10 text-secondary',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
};

interface CategoryIconProps {
  category: ComponentCategory;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'size-8 rounded-md [&_svg]:size-4',
  md: 'size-10 rounded-lg [&_svg]:size-5',
  lg: 'size-12 rounded-xl [&_svg]:size-6',
} as const;

export function CategoryIcon({ category, size = 'md', className }: CategoryIconProps) {
  const meta = CATEGORY_MAP[category];
  const Icon = meta.icon;
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center border', sizes[size], tones[meta.tone], className)}
    >
      <Icon />
    </span>
  );
}
