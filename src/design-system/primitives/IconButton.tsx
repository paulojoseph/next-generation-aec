'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'ghost' | 'outline' | 'solid' | 'danger';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /** Indicates active/pressed state */
  isActive?: boolean;
  /** Accessible label (required for icon-only buttons) */
  'aria-label': string;
}

const sizeStyles: Record<IconButtonSize, string> = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-11 h-11 text-base',
};

const variantStyles: Record<IconButtonVariant, { base: string; active: string }> = {
  ghost: {
    base: 'hover:bg-white/10 text-zinc-400 hover:text-white',
    active: 'bg-white/10 text-cyan-400',
  },
  outline: {
    base: 'border border-white/10 hover:border-white/20 text-zinc-400 hover:text-white',
    active: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400',
  },
  solid: {
    base: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white',
    active: 'bg-cyan-600 text-white',
  },
  danger: {
    base: 'hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400',
    active: 'bg-rose-500/10 text-rose-400',
  },
};

/**
 * IconButton - Minimal button for icon-only actions.
 *
 * Designed for toolbars and compact interfaces. Requires aria-label
 * for accessibility compliance.
 *
 * @example
 * ```tsx
 * <IconButton aria-label="Toggle sidebar" isActive={isOpen}>
 *   <MenuIcon />
 * </IconButton>
 * ```
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, size = 'md', variant = 'ghost', isActive = false, className, disabled, ...props }, ref) => {
    const styles = variantStyles[variant];

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg',
          'transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          sizeStyles[size],
          isActive ? styles.active : styles.base,
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
