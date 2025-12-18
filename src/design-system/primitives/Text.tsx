'use client';

import { type HTMLAttributes, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type TextVariant = 'body' | 'caption' | 'label' | 'mono' | 'heading';
type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';
type TextColor = 'primary' | 'secondary' | 'tertiary' | 'muted' | 'accent' | 'success' | 'warning' | 'error';

interface TextProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: ElementType;
  variant?: TextVariant;
  weight?: TextWeight;
  color?: TextColor;
  truncate?: boolean;
}

const variantStyles: Record<TextVariant, string> = {
  body: 'text-sm leading-relaxed',
  caption: 'text-xs leading-normal',
  label: 'text-[11px] uppercase tracking-wider',
  mono: 'font-mono text-xs tabular-nums',
  heading: 'text-lg font-semibold tracking-tight',
};

const weightStyles: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const colorStyles: Record<TextColor, string> = {
  primary: 'text-white',
  secondary: 'text-zinc-300',
  tertiary: 'text-zinc-400',
  muted: 'text-zinc-500',
  accent: 'text-cyan-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-rose-400',
};

/**
 * Text - Semantic typography component with consistent styling.
 *
 * Polymorphic component that renders as any HTML element while
 * maintaining design system consistency.
 *
 * @example
 * ```tsx
 * <Text variant="label" color="tertiary">SECTION</Text>
 * <Text as="h2" variant="heading">Dashboard</Text>
 * <Text variant="mono" color="accent">3.141592</Text>
 * ```
 */
export function Text({
  children,
  as: Component = 'span',
  variant = 'body',
  weight = 'normal',
  color = 'primary',
  truncate = false,
  className,
  ...props
}: TextProps) {
  // Cast to 'any' to avoid TypeScript issues with polymorphic 'as' prop
  // This is a known limitation when using ElementType with dynamic components
  const Comp = Component as any;

  return (
    <Comp
      className={cn(
        variantStyles[variant],
        weightStyles[weight],
        colorStyles[color],
        truncate && 'truncate',
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
