'use client';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'gradient' | 'ghost' | 'glass' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    const base =
      'inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]';
    const sizes = {
      sm: 'px-4 h-8 text-[13px]',
      md: 'px-5 h-10 text-sm',
      lg: 'px-7 h-12 text-[15px]',
      xl: 'px-8 h-14 text-base',
    };
    const variants = {
      primary: 'bg-cta text-ctaText hover:bg-white',
      gradient:
        'bg-brand-gradient text-white shadow-[0_8px_30px_-8px_rgba(255,60,172,0.5)] hover:shadow-[0_12px_40px_-8px_rgba(255,60,172,0.8)]',
      ghost: 'bg-transparent text-white hover:bg-white/5',
      glass:
        'glass text-white hover:bg-white/10',
      outline:
        'bg-transparent text-white border border-white/15 hover:border-white/30 hover:bg-white/5',
    };
    return (
      <button
        ref={ref}
        className={cn(base, sizes[size], variants[variant], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
