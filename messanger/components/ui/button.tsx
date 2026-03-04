'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-deep-space',
  {
    variants: {
      variant: {
        default:
          'bg-primary/90 text-primary-foreground shadow-glow-sm hover:bg-primary/100 ring-offset-deep-space',
        secondary:
          'bg-secondary/80 text-deep-space hover:bg-secondary shadow-glow-md ring-offset-deep-space',
        ghost: 'bg-transparent text-foreground hover:bg-white/5 border border-white/10',
        outline: 'border border-white/20 text-foreground hover:border-white/40 hover:bg-white/5',
        accent:
          'bg-accent/80 text-accent-foreground hover:bg-accent/90 shadow-[0_0_25px_rgba(106,247,217,0.35)] ring-offset-deep-space',
      },
      size: {
        default: 'px-5 py-2.5',
        sm: 'px-4 py-2 text-xs',
        lg: 'px-6 py-3 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
