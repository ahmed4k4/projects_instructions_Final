import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ' +
    'transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-nexus ' +
      'disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ' +
    // Touch targets wherever the input is a finger.
    //
    // This used to key off the `max-md` breakpoint, which missed exactly one
    // class of device: a 768–1024px tablet reports `pointer: coarse` but lays
    // out the desktop grid, so its buttons were 32–36px. `pointer-coarse` is the
    // input capability, which is what the 44px rule is actually about.
    'max-md:min-h-11 max-md:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
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
      /**
       * Sizes are measured against the 44×44 px touch minimum (WCAG 2.5.5).
       *
       * On touch devices `min-h-11 min-w-11` (44px) is applied by the base
       * classes below, so a compact button still looks compact on desktop but
       * becomes a full-size tap target on a phone. Visual size is unchanged —
       * the extra height is padding, not type.
       */
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4',
        lg: 'h-12 rounded-xl px-7 text-base',
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
