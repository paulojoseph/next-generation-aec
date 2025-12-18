/**
 * @fileoverview Spacing Design Tokens
 *
 * Consistent spacing scale based on 4px base unit.
 * Follows geometric progression for harmonious layouts.
 */

export const SpacingTokens = {
  /** 0px */
  none: '0',
  /** 2px - Hairline spacing */
  xxs: '0.125rem',
  /** 4px - Minimal spacing */
  xs: '0.25rem',
  /** 8px - Tight spacing */
  sm: '0.5rem',
  /** 12px - Compact spacing */
  md: '0.75rem',
  /** 16px - Default spacing */
  lg: '1rem',
  /** 24px - Comfortable spacing */
  xl: '1.5rem',
  /** 32px - Generous spacing */
  '2xl': '2rem',
  /** 48px - Section spacing */
  '3xl': '3rem',
  /** 64px - Large section spacing */
  '4xl': '4rem',
} as const;

export const RadiusTokens = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const ShadowTokens = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  glow: {
    cyan: '0 0 20px rgba(34, 211, 238, 0.3)',
    emerald: '0 0 20px rgba(16, 185, 129, 0.3)',
  },
} as const;

export type SpacingToken = keyof typeof SpacingTokens;
export type RadiusToken = keyof typeof RadiusTokens;
