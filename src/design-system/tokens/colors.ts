/**
 * @fileoverview Color Design Tokens
 *
 * Centralized color palette following semantic naming conventions.
 * These tokens map directly to CSS custom properties and provide
 * type-safe color references throughout the application.
 *
 * Architecture Decision: Using object literals over enums for tree-shaking
 * and better TypeScript inference in template literals.
 */

export const ColorTokens = {
  // === NEUTRALS (Zinc Scale) ===
  neutral: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b',
  },

  // === SEMANTIC COLORS ===
  background: {
    primary: '#09090b',
    secondary: '#18181b',
    elevated: '#27272a',
    overlay: 'rgba(9, 9, 11, 0.8)',
  },

  surface: {
    default: '#18181b',
    hover: '#27272a',
    active: '#3f3f46',
    glass: 'rgba(24, 24, 27, 0.95)',
  },

  text: {
    primary: '#ffffff',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.5)',
    muted: 'rgba(255, 255, 255, 0.3)',
    inverse: '#09090b',
  },

  border: {
    default: 'rgba(255, 255, 255, 0.1)',
    subtle: 'rgba(255, 255, 255, 0.05)',
    strong: 'rgba(255, 255, 255, 0.2)',
  },

  // === ACCENT COLORS ===
  accent: {
    cyan: {
      default: '#22d3ee',
      hover: '#06b6d4',
      muted: 'rgba(34, 211, 238, 0.2)',
    },
    emerald: {
      default: '#10b981',
      hover: '#059669',
      muted: 'rgba(16, 185, 129, 0.2)',
    },
    amber: {
      default: '#f59e0b',
      hover: '#d97706',
      muted: 'rgba(245, 158, 11, 0.2)',
    },
    rose: {
      default: '#f43f5e',
      hover: '#e11d48',
      muted: 'rgba(244, 63, 94, 0.2)',
    },
  },

  // === SEMANTIC STATUS ===
  status: {
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    info: '#3b82f6',
  },

  // === 3D SCENE SPECIFIC ===
  scene: {
    background: '#09090b',
    fog: '#09090b',
    grid: {
      primary: '#27272a',
      secondary: '#18181b',
    },
    axis: {
      x: '#ef4444',
      y: '#22c55e',
      z: '#3b82f6',
    },
  },
} as const;

export type ColorToken = typeof ColorTokens;
