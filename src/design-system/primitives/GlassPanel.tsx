'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Visual variant affecting opacity and blur intensity.
 * - `default`: Standard glassmorphism (95% opacity)
 * - `elevated`: Higher contrast for floating elements
 * - `subtle`: Lower opacity for background panels
 */
type GlassPanelVariant = 'default' | 'elevated' | 'subtle';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: GlassPanelVariant;
  /** Disables backdrop blur for performance-critical scenarios */
  disableBlur?: boolean;
  /** Adds interactive hover state */
  interactive?: boolean;
}

const variantStyles: Record<GlassPanelVariant, string> = {
  default: 'bg-zinc-900/95 backdrop-blur-xl',
  elevated: 'bg-zinc-900/98 backdrop-blur-2xl shadow-lg',
  subtle: 'bg-zinc-900/80 backdrop-blur-md',
};

/**
 * GlassPanel - Foundational surface component with glassmorphism effect.
 *
 * Uses CSS backdrop-filter for GPU-accelerated blur. Falls back gracefully
 * on browsers without support by increasing background opacity.
 *
 * @example
 * ```tsx
 * <GlassPanel variant="elevated" className="p-4">
 *   <h2>Panel Content</h2>
 * </GlassPanel>
 * ```
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ children, variant = 'default', disableBlur = false, interactive = false, className, ...props }, ref) => {
    const blurClass = disableBlur ? 'backdrop-blur-none bg-zinc-900' : variantStyles[variant];

    return (
      <div
        ref={ref}
        className={cn(
          blurClass,
          'rounded-xl border border-white/10',
          'transition-colors duration-200',
          interactive && 'hover:border-white/20 hover:bg-zinc-800/95 cursor-pointer',
          'pointer-events-auto',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassPanel.displayName = 'GlassPanel';
