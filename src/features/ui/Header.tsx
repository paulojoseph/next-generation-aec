'use client';
import { Target, Grid, Ruler, Layers, Activity, Box, Brain, Settings, Keyboard } from 'lucide-react';
import { Dispatch, SetStateAction, CSSProperties, useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  onResetCamera: () => void;
  viewMode: 'perspective' | 'top';
  setViewMode: Dispatch<SetStateAction<'perspective' | 'top'>>;
  isMeasuring: boolean;
  setIsMeasuring: Dispatch<SetStateAction<boolean>>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  isTelemetryOpen: boolean;
  setIsTelemetryOpen: Dispatch<SetStateAction<boolean>>;
  isAIOpen: boolean;
  setIsAIOpen: Dispatch<SetStateAction<boolean>>;
  onSettingsOpen?: () => void;
  onHelpOpen?: () => void;
}

export function Header({
  onResetCamera,
  viewMode,
  setViewMode,
  isMeasuring,
  setIsMeasuring,
  isSidebarOpen,
  setIsSidebarOpen,
  isTelemetryOpen,
  setIsTelemetryOpen,
  isAIOpen,
  setIsAIOpen,
  onSettingsOpen,
  onHelpOpen
}: HeaderProps) {
  const { theme, getContrastColor } = useTheme();
  const [showHelpHint, setShowHelpHint] = useState(false);

  // Show hint for first-time users
  useEffect(() => {
    const hasSeenHelp = localStorage.getItem('keyboard-help-seen');
    if (!hasSeenHelp) {
      // Delay showing hint for smoother UX
      const showTimer = setTimeout(() => setShowHelpHint(true), 2000);
      // Auto-hide after 8 seconds
      const hideTimer = setTimeout(() => setShowHelpHint(false), 10000);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, []);

  // Base button style using CSS variables
  const baseButtonStyle: CSSProperties = {
    borderRadius: 'var(--theme-radius, 0.75rem)',
    backgroundColor: 'var(--theme-card)',
    borderColor: 'var(--theme-border)',
    backdropFilter: 'var(--theme-glass, blur(12px))',
    transition: 'all var(--theme-animation, 300ms) ease',
    color: 'var(--theme-text)'
  };

  // Active button style with theme accent
  const getActiveStyle = (accentOverride?: string): CSSProperties => {
    const accent = accentOverride || theme.accentColor;
    return {
      ...baseButtonStyle,
      backgroundColor: accent,
      borderColor: accent,
      boxShadow: `0 0 20px ${accent}44`
    };
  };

  // Calculate icon color based on button background
  const getIconColor = (isActive: boolean, accentOverride?: string): string => {
    if (!isActive) return 'var(--theme-text)';
    const accent = accentOverride || theme.accentColor;
    return getContrastColor(accent);
  };

  return (
    <header className="col-span-full flex justify-between items-start pointer-events-auto">
      {/* Brand Badge */}
      <div
        className="flex items-center gap-4 p-2 pr-6 shadow-2xl border"
        style={{
          ...baseButtonStyle,
          borderRadius: 'var(--theme-radius, 1rem)'
        }}
      >
        <div
          className="w-10 h-10 flex items-center justify-center"
          style={{
            borderRadius: 'var(--theme-radius, 0.75rem)',
            background: `linear-gradient(135deg, ${theme.accentColor}, #3b82f6)`,
            boxShadow: `0 0 15px ${theme.accentColor}55`
          }}
        >
          <Box style={{ color: getContrastColor(theme.accentColor) }} className="w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight leading-none drop-shadow-sm font-mono" style={{ color: 'var(--theme-text)' }}>
            NextGen <span style={{ color: theme.accentColor }}>AEC</span>
          </h1>
          <span className="text-[10px] font-medium tracking-wider uppercase mt-0.5" style={{ color: 'var(--theme-text)', opacity: 0.6 }}>
            Spatial Intelligence Engine
          </span>
        </div>
      </div>

      {/* Actions Group */}
      <div className="flex items-center gap-2">
        {/* Reset Camera */}
        <button
          onClick={onResetCamera}
          className="p-3 border shadow-lg"
          style={baseButtonStyle}
          title="Recenter Camera"
        >
          <Target size={20} style={{ color: 'var(--theme-text)' }} />
        </button>

        {/* Top View */}
        <button
          onClick={() => setViewMode(prev => prev === 'top' ? 'perspective' : 'top')}
          className="p-3 border shadow-lg"
          style={viewMode === 'top' ? getActiveStyle() : baseButtonStyle}
          title="Floor Plan View"
        >
          <Grid size={20} style={{ color: getIconColor(viewMode === 'top') }} />
        </button>

        {/* Measure - amber color */}
        <button
          onClick={() => setIsMeasuring(!isMeasuring)}
          className="flex items-center gap-2 px-4 py-3 border shadow-lg font-bold"
          style={isMeasuring ? getActiveStyle('#f59e0b') : baseButtonStyle}
        >
          <Ruler size={20} style={{ color: getIconColor(isMeasuring, '#f59e0b') }} />
          <span style={{ color: getIconColor(isMeasuring, '#f59e0b'), fontSize: '14px' }}>
            {isMeasuring ? 'ON' : 'Measure'}
          </span>
        </button>

        {/* Sidebar Toggle */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-3 border shadow-lg"
          style={isSidebarOpen ? getActiveStyle() : baseButtonStyle}
          title="Toggle Object List"
        >
          <Layers size={20} style={{ color: getIconColor(isSidebarOpen) }} />
        </button>

        {/* Telemetry Toggle */}
        <button
          onClick={() => setIsTelemetryOpen(!isTelemetryOpen)}
          className="p-3 border shadow-lg"
          style={isTelemetryOpen ? getActiveStyle() : baseButtonStyle}
          title="Toggle Telemetry"
        >
          <Activity size={20} style={{ color: getIconColor(isTelemetryOpen) }} />
        </button>

        {/* AI Insights - purple */}
        <button
          onClick={() => setIsAIOpen(!isAIOpen)}
          className="p-3 border shadow-lg"
          style={isAIOpen ? getActiveStyle('#9333ea') : baseButtonStyle}
          title="AI Insights"
        >
          <Brain size={20} style={{ color: getIconColor(isAIOpen, '#9333ea') }} />
        </button>

        {/* Keyboard Help */}
        <div className="relative">
          <button
            onClick={() => {
              onHelpOpen?.();
              setShowHelpHint(false);
            }}
            className="p-3 border shadow-lg"
            style={baseButtonStyle}
            title="Keyboard Shortcuts (H)"
          >
            <Keyboard size={20} style={{ color: 'var(--theme-text)' }} />
          </button>

          {/* First-time hint badge */}
          {showHelpHint && (
            <div
              className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap animate-in fade-in slide-in-from-top-2 duration-300 z-50"
              style={{
                backgroundColor: theme.accentColor,
                color: getContrastColor(theme.accentColor),
                boxShadow: `0 4px 12px ${theme.accentColor}44`
              }}
            >
              <span className="flex items-center gap-1.5">
                💡 Press <kbd className="px-1 py-0.5 bg-black/20 rounded text-[10px]">H</kbd> for shortcuts
              </span>
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                style={{ backgroundColor: theme.accentColor }}
              />
            </div>
          )}
        </div>

        {/* Settings */}
        {onSettingsOpen && (
          <button
            onClick={onSettingsOpen}
            className="p-3 border shadow-lg"
            style={baseButtonStyle}
            title="Settings"
          >
            <Settings size={20} style={{ color: 'var(--theme-text)' }} />
          </button>
        )}
      </div>
    </header>
  );
}

