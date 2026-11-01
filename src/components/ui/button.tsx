import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ' +
    'transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-nexus ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-[0_0_40px_-10px_rgba(99,102,241,0.6)] ' +
          'hover:bg-primary-glow hover:shadow-[0_0_44px_-8px_rgba(129,140,248,0.75)] ' +
          'active:brightness-95',
        secondary:
          'border border-border-strong bg-surface-elevated text-foreground hover:border-primary/40 hover:bg-surface hover:shadow-glow-sm',
        ghost: 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:border-primary/50 hover:bg-primary/5',
        glass: 'glass text-foreground hover:bg-primary/10 hover:border-primary/30',
        danger: 'bg-danger/90 text-white hover:bg-danger',
        link: 'text-primary-glow underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4',
        lg: 'h-12 rounded-xl px-7 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size }),
          'active:scale-[0.97] motion-reduce:active:scale-100',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
