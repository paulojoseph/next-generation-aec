'use client';
import { Leva } from 'leva';
import { useTheme } from '@/contexts/ThemeContext';
import { useMemo } from 'react';

export function LevaContainer() {
  const { theme, getContrastColor } = useTheme();

  // Dynamic Leva theme based on current app theme
  const levaTheme = useMemo(() => {
    // Color scheme mapping - now includes light themes
    const colorSchemes: Record<string, { bg1: string; bg2: string; bg3: string; text: string; textLight: string }> = {
      dark: { bg1: '#18181b', bg2: '#27272a', bg3: '#3f3f46', text: '#ffffff', textLight: '#a1a1aa' },
      midnight: { bg1: '#0f172a', bg2: '#1e293b', bg3: '#334155', text: '#ffffff', textLight: '#94a3b8' },
      abyss: { bg1: '#030712', bg2: '#111827', bg3: '#1f2937', text: '#ffffff', textLight: '#9ca3af' },
      // Light themes
      light: { bg1: '#ffffff', bg2: '#f4f4f5', bg3: '#e4e4e7', text: '#18181b', textLight: '#71717a' },
      warm: { bg1: '#fef3c7', bg2: '#fde68a', bg3: '#fcd34d', text: '#78350f', textLight: '#92400e' },
      fresh: { bg1: '#d1fae5', bg2: '#a7f3d0', bg3: '#6ee7b7', text: '#064e3b', textLight: '#047857' }
    };

    const colors = colorSchemes[theme.colorScheme] || colorSchemes.dark;
    const accent = theme.accentColor || '#06b6d4';

    // Border radius mapping
    const radiusMap: Record<string, string> = {
      none: '0px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      full: '16px'
    };

    const radius = radiusMap[theme.borderRadius] || '8px';

    return {
      colors: {
        elevation1: colors.bg1,
        elevation2: colors.bg2,
        elevation3: colors.bg3,
        accent1: accent,
        accent2: accent,
        highlight1: colors.textLight,
        highlight2: colors.text,
        highlight3: colors.text,
        vivid1: accent,
        folderWidgetColor: colors.text,
        folderTextColor: colors.text,
        toolTipBackground: colors.bg3,
        toolTipText: colors.text,
      },
      radii: {
        xs: radius,
        sm: radius,
        lg: radius,
      },
      fontSizes: {
        root: '11px'
      }
    };
  }, [theme.colorScheme, theme.accentColor, theme.borderRadius]);

  return (
    <div
      className="pointer-events-auto w-80"
      style={{
        opacity: theme.glassEffect ? 0.95 : 1
      }}
    >
      <Leva
        fill
        flat
        titleBar={false}
        theme={levaTheme}
      />
    </div>
  );
}
