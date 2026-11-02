import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-lg border border-border-strong bg-surface-inset/60 px-3 py-2 text-sm text-foreground',
      'placeholder:text-muted-foreground/70',
      'transition-[border-color,box-shadow,background-color] duration-200 ease-nexus',
      'hover:border-white/20 focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/25',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      // 44px min tap target on touch only (WCAG 2.5.5); desktop keeps h-10.
      '[@media(pointer:coarse)]:min-h-11',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full resize-none rounded-lg border border-border-strong bg-surface-inset/60 px-3 py-2 text-sm',
        'placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] duration-200 ease-nexus',
        'hover:border-white/20 focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/25',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Input, Textarea };
