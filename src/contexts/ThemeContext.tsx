'use client';

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

// Theme preset definitions - 9 total: 6 dark + 3 light
export type ThemePreset = 'default' | 'cyberpunk' | 'elegant' | 'minimal' | 'neon' | 'ocean' | 'aurora' | 'forest' | 'sakura';

// Google Fonts optimized for AEC/Technical use
export type FontFamily = 'inter' | 'roboto' | 'jetbrains' | 'outfit' | 'space-grotesk' | 'poppins';

export interface ThemeConfig {
  preset: ThemePreset;
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'full';
  layoutSpacing: 'none' | 'compact' | 'normal';
  colorScheme: 'dark' | 'midnight' | 'abyss' | 'light' | 'warm' | 'fresh';
  accentColor: string;
  glassEffect: boolean;
  animationSpeed: 'none' | 'fast' | 'normal' | 'slow';
  fontFamily: FontFamily;
}

// Font configuration with Google Fonts
const FONT_FAMILIES: Record<FontFamily, { name: string; css: string; description: string }> = {
  'inter': {
    name: 'Inter',
    css: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    description: 'Clean & Modern'
  },
  'roboto': {
    name: 'Roboto',
    css: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
    description: 'Professional'
  },
  'jetbrains': {
    name: 'JetBrains Mono',
    css: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    description: 'Technical'
  },
  'outfit': {
    name: 'Outfit',
    css: "'Outfit', 'DM Sans', sans-serif",
    description: 'Geometric'
  },
  'space-grotesk': {
    name: 'Space Grotesk',
    css: "'Space Grotesk', 'Inter', sans-serif",
    description: 'Futuristic'
  },
  'poppins': {
    name: 'Poppins',
    css: "'Poppins', 'Inter', sans-serif",
    description: 'Bold & Trendy'
  }
};

// 9 Theme presets: 6 dark + 3 light
const THEME_PRESETS: Record<ThemePreset, Partial<ThemeConfig>> = {
  // === DARK THEMES ===
  default: {
    borderRadius: 'lg',
    layoutSpacing: 'normal',
    colorScheme: 'dark',
    accentColor: '#22d3ee',
    glassEffect: true,
    animationSpeed: 'normal',
    fontFamily: 'inter'
  },
  cyberpunk: {
    borderRadius: 'none',
    layoutSpacing: 'compact',
    colorScheme: 'abyss',
    accentColor: '#e879f9',
    glassEffect: true,
    animationSpeed: 'fast',
    fontFamily: 'space-grotesk'
  },
  elegant: {
    borderRadius: 'md',
    layoutSpacing: 'normal',
    colorScheme: 'midnight',
    accentColor: '#fbbf24',
    glassEffect: true,
    animationSpeed: 'slow',
    fontFamily: 'outfit'
  },
  minimal: {
    borderRadius: 'none',
    layoutSpacing: 'none',
    colorScheme: 'dark',
    accentColor: '#71717a',
    glassEffect: false,
    animationSpeed: 'none',
    fontFamily: 'roboto'
  },
  neon: {
    borderRadius: 'full',
    layoutSpacing: 'compact',
    colorScheme: 'abyss',
    accentColor: '#4ade80',
    glassEffect: true,
    animationSpeed: 'fast',
    fontFamily: 'jetbrains'
  },
  ocean: {
    borderRadius: 'lg',
    layoutSpacing: 'normal',
    colorScheme: 'midnight',
    accentColor: '#38bdf8',
    glassEffect: true,
    animationSpeed: 'normal',
    fontFamily: 'inter'
  },
  // === LIGHT/COLORFUL THEMES ===
  aurora: {
    borderRadius: 'lg',
    layoutSpacing: 'normal',
    colorScheme: 'warm',
    accentColor: '#f97316',
    glassEffect: true,
    animationSpeed: 'normal',
    fontFamily: 'poppins'
  },
  forest: {
    borderRadius: 'md',
    layoutSpacing: 'normal',
    colorScheme: 'fresh',
    accentColor: '#10b981',
    glassEffect: true,
    animationSpeed: 'slow',
    fontFamily: 'outfit'
  },
  sakura: {
    borderRadius: 'full',
    layoutSpacing: 'compact',
    colorScheme: 'light',
    accentColor: '#ec4899',
    glassEffect: true,
    animationSpeed: 'normal',
    fontFamily: 'poppins'
  }
};

// CSS variable mappings
const BORDER_RADIUS_MAP = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '16px'
};

const LAYOUT_SPACING_MAP = {
  none: '0px',
  compact: '8px',
  normal: '16px'
};

// Color schemes - including 3 new light schemes
const COLOR_SCHEME_MAP = {
  // Dark schemes
  dark: {
    bg: '#09090b',
    card: '#18181b',
    cardAlpha: 'rgba(24, 24, 27, 0.95)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#ffffff'
  },
  midnight: {
    bg: '#020617',
    card: '#0f172a',
    cardAlpha: 'rgba(15, 23, 42, 0.95)',
    border: 'rgba(148, 163, 184, 0.15)',
    text: '#ffffff'
  },
  abyss: {
    bg: '#030712',
    card: '#111827',
    cardAlpha: 'rgba(17, 24, 39, 0.95)',
    border: 'rgba(75, 85, 99, 0.2)',
    text: '#ffffff'
  },
  // Light schemes
  light: {
    bg: '#fafafa',
    card: '#ffffff',
    cardAlpha: 'rgba(255, 255, 255, 0.95)',
    border: 'rgba(0, 0, 0, 0.1)',
    text: '#18181b'
  },
  warm: {
    bg: '#fffbeb',
    card: '#fef3c7',
    cardAlpha: 'rgba(254, 243, 199, 0.95)',
    border: 'rgba(251, 191, 36, 0.2)',
    text: '#78350f'
  },
  fresh: {
    bg: '#ecfdf5',
    card: '#d1fae5',
    cardAlpha: 'rgba(209, 250, 229, 0.95)',
    border: 'rgba(16, 185, 129, 0.2)',
    text: '#064e3b'
  }
};

const ANIMATION_SPEED_MAP = {
  none: '0ms',
  fast: '150ms',
  normal: '300ms',
  slow: '500ms'
};

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

interface ThemeContextType {
  theme: ThemeConfig;
  setTheme: React.Dispatch<React.SetStateAction<ThemeConfig>>;
  applyPreset: (preset: ThemePreset) => void;
  updateTheme: (updates: Partial<ThemeConfig>) => void;
  presets: typeof THEME_PRESETS;
  fonts: typeof FONT_FAMILIES;
  getContrastColor: (hexColor: string) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DEFAULT_THEME: ThemeConfig = {
  preset: 'default',
  borderRadius: 'lg',
  layoutSpacing: 'normal',
  colorScheme: 'dark',
  accentColor: '#22d3ee',
  glassEffect: true,
  animationSpeed: 'normal',
  fontFamily: 'inter'
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const colorScheme = COLOR_SCHEME_MAP[theme.colorScheme];
    const contrastColor = getContrastColor(theme.accentColor);
    const fontConfig = FONT_FAMILIES[theme.fontFamily];

    // Set CSS variables on root
    root.style.setProperty('--theme-radius', BORDER_RADIUS_MAP[theme.borderRadius]);
    root.style.setProperty('--theme-spacing', LAYOUT_SPACING_MAP[theme.layoutSpacing]);
    root.style.setProperty('--theme-accent', theme.accentColor);
    root.style.setProperty('--theme-contrast', contrastColor);
    root.style.setProperty('--theme-bg', colorScheme.bg);
    root.style.setProperty('--theme-card', colorScheme.card);
    root.style.setProperty('--theme-card-alpha', colorScheme.cardAlpha);
    root.style.setProperty('--theme-border', colorScheme.border);
    root.style.setProperty('--theme-text', colorScheme.text);
    root.style.setProperty('--theme-animation', ANIMATION_SPEED_MAP[theme.animationSpeed]);
    root.style.setProperty('--theme-glass', theme.glassEffect ? 'blur(12px)' : 'blur(0px)');
    root.style.setProperty('--theme-glass-opacity', theme.glassEffect ? '0.95' : '1');
    root.style.setProperty('--theme-font', fontConfig.css);

    // Force body styles directly
    body.style.fontFamily = fontConfig.css;
    body.style.backgroundColor = colorScheme.bg;
    body.style.color = colorScheme.text;
  }, [theme]);

  const applyPreset = useCallback((preset: ThemePreset) => {
    const presetConfig = THEME_PRESETS[preset];
    setTheme(prev => ({
      ...prev,
      ...presetConfig,
      preset
    }));
  }, []);

  const updateTheme = useCallback((updates: Partial<ThemeConfig>) => {
    setTheme(prev => ({
      ...prev,
      ...updates,
      preset: 'default'
    }));
  }, []);

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      applyPreset,
      updateTheme,
      presets: THEME_PRESETS,
      fonts: FONT_FAMILIES,
      getContrastColor
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
