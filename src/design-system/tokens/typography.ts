/**
 * @fileoverview Typography Design Tokens
 *
 * Type scale following modular scale (1.25 ratio).
 * Optimized for technical/data-heavy interfaces.
 */

export const FontFamilyTokens = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
} as const;

export const FontSizeTokens = {
  /** 10px - Micro labels */
  '2xs': '0.625rem',
  /** 11px - Small labels */
  xs: '0.6875rem',
  /** 12px - Captions */
  sm: '0.75rem',
  /** 14px - Body small */
  base: '0.875rem',
  /** 16px - Body */
  lg: '1rem',
  /** 18px - Lead */
  xl: '1.125rem',
  /** 20px - Heading 4 */
  '2xl': '1.25rem',
  /** 24px - Heading 3 */
  '3xl': '1.5rem',
  /** 30px - Heading 2 */
  '4xl': '1.875rem',
  /** 36px - Heading 1 */
  '5xl': '2.25rem',
} as const;

export const FontWeightTokens = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const LineHeightTokens = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
} as const;

export const LetterSpacingTokens = {
  tight: '-0.025em',
  normal: '0',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
} as const;
