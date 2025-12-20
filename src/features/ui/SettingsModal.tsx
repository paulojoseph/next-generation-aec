'use client';

import { Settings, X, Check, Palette, Layout } from 'lucide-react';
import { useState, CSSProperties } from 'react';
import { useTheme, ThemePreset, ThemeConfig, FontFamily } from '@/contexts/ThemeContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Theme preview card with ACCURATE visual representation
function ThemePreviewCard({ preset, name, isSelected, onClick }: {
  preset: ThemePreset;
  name: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  // Each preset's complete visual identity
  const previewStyles: Record<ThemePreset, {
    accent: string;
    bg: string;
    desc: string;
    radius: string;
    font: string;
    isLight: boolean;
  }> = {
    default: {
      accent: '#22d3ee',
      bg: '#18181b',
      desc: 'Clean & Professional',
      radius: '12px',
      font: 'Inter',
      isLight: false
    },
    cyberpunk: {
      accent: '#e879f9',
      bg: '#111827',
      desc: 'Sharp & Futuristic',
      radius: '0px',
      font: 'Space Grotesk',
      isLight: false
    },
    elegant: {
      accent: '#fbbf24',
      bg: '#0f172a',
      desc: 'Refined & Sophisticated',
      radius: '8px',
      font: 'Outfit',
      isLight: false
    },
    minimal: {
      accent: '#71717a',
      bg: '#18181b',
      desc: 'Simple & Focused',
      radius: '0px',
      font: 'Roboto',
      isLight: false
    },
    neon: {
      accent: '#4ade80',
      bg: '#111827',
      desc: 'Vibrant & Dynamic',
      radius: '16px',
      font: 'JetBrains',
      isLight: false
    },
    ocean: {
      accent: '#38bdf8',
      bg: '#0f172a',
      desc: 'Deep & Calming',
      radius: '12px',
      font: 'Inter',
      isLight: false
    },
    aurora: {
      accent: '#f97316',
      bg: '#fef3c7',
      desc: 'Warm & Vibrant',
      radius: '12px',
      font: 'Poppins',
      isLight: true
    },
    forest: {
      accent: '#10b981',
      bg: '#d1fae5',
      desc: 'Fresh & Natural',
      radius: '8px',
      font: 'Outfit',
      isLight: true
    },
    sakura: {
      accent: '#ec4899',
      bg: '#fce7f3',
      desc: 'Soft & Elegant',
      radius: '16px',
      font: 'Poppins',
      isLight: true
    }
  };

  const style = previewStyles[preset];
  const textColor = style.isLight ? '#18181b' : '#ffffff';

  return (
    <button
      onClick={onClick}
      className="relative p-3 border-2 transition-all duration-200 text-left min-h-[100px]"
      style={{
        borderRadius: style.radius,
        backgroundColor: style.bg,
        borderColor: isSelected ? style.accent : 'rgba(128,128,128,0.3)',
        boxShadow: isSelected ? `0 0 20px ${style.accent}33` : 'none'
      }}
    >
      {isSelected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center"
          style={{
            backgroundColor: style.accent,
            borderRadius: style.radius === '0px' ? '0px' : '50%'
          }}
        >
          <Check size={12} className="text-black" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-2.5 h-2.5"
          style={{
            backgroundColor: style.accent,
            borderRadius: style.radius === '0px' ? '0px' : '50%'
          }}
        />
        <span className="font-bold text-xs uppercase tracking-wider" style={{ color: textColor }}>{name}</span>
      </div>
      <p className="text-[9px] opacity-60 mb-2" style={{ color: textColor }}>{style.desc}</p>

      {/* Mini preview showing actual radius and colors */}
      <div className="flex gap-1 items-center">
        <div
          className="w-6 h-4"
          style={{
            backgroundColor: style.isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
            borderRadius: style.radius
          }}
        />
        <div
          className="w-8 h-4"
          style={{
            backgroundColor: style.accent + '33',
            borderRadius: style.radius
          }}
        />
        <div
          className="w-5 h-4 flex items-center justify-center"
          style={{
            backgroundColor: style.accent,
            borderRadius: style.radius
          }}
        >
          <span className="text-[8px] font-bold text-black">A</span>
        </div>
        <span className="text-[8px] ml-auto opacity-50" style={{ color: textColor }}>{style.font}</span>
      </div>
    </button>
  );
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, applyPreset, updateTheme, getContrastColor, fonts } = useTheme();
  const [activeTab, setActiveTab] = useState<'themes' | 'customize'>('themes');

  if (!isOpen) return null;

  const themeNames: Record<ThemePreset, string> = {
    default: 'Default',
    cyberpunk: 'Cyberpunk',
    elegant: 'Elegant',
    minimal: 'Minimal',
    neon: 'Neon',
    ocean: 'Ocean',
    aurora: 'Aurora',
    forest: 'Forest',
    sakura: 'Sakura'
  };

  const contrastColor = getContrastColor(theme.accentColor);

  const buttonBaseStyle: CSSProperties = {
    borderRadius: 'var(--theme-radius, 0.5rem)',
    transition: 'all var(--theme-animation, 300ms) ease',
    border: '1px solid var(--theme-border)'
  };

  const activeButtonStyle: CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: 'var(--theme-accent)',
    color: contrastColor,
    border: '1px solid var(--theme-accent)'
  };

  const inactiveButtonStyle: CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#a1a1aa'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl mx-4 shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-200"
        style={{
          borderRadius: 'var(--theme-radius, 1rem)',
          backgroundColor: 'var(--theme-card, #27272a)',
          borderColor: 'var(--theme-border, rgba(255,255,255,0.1))',
          backdropFilter: 'var(--theme-glass, blur(12px))'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/5" style={{ borderRadius: 'var(--theme-radius)' }}>
              <Settings size={20} style={{ color: 'var(--theme-accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Settings</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Customize your experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 transition-colors"
            style={{ borderRadius: 'var(--theme-radius)' }}
          >
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <button
            onClick={() => setActiveTab('themes')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'themes' ? 'text-white border-b-2' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            style={{ borderColor: activeTab === 'themes' ? 'var(--theme-accent)' : 'transparent' }}
          >
            <Palette size={16} />
            Theme Presets
          </button>
          <button
            onClick={() => setActiveTab('customize')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'customize' ? 'text-white border-b-2' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            style={{ borderColor: activeTab === 'customize' ? 'var(--theme-accent)' : 'transparent' }}
          >
            <Layout size={16} />
            Customize
          </button>
        </div>

        {/* Content - Fixed height */}
        <div className="p-6 h-[400px] overflow-y-auto custom-scrollbar">
          {activeTab === 'themes' && (
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(themeNames) as ThemePreset[]).map(preset => (
                <ThemePreviewCard
                  key={preset}
                  preset={preset}
                  name={themeNames[preset]}
                  isSelected={theme.preset === preset}
                  onClick={() => applyPreset(preset)}
                />
              ))}
            </div>
          )}

          {activeTab === 'customize' && (
            <div className="space-y-6">
              {/* Accent Color */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">
                  Accent Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {['#22d3ee', '#e879f9', '#fbbf24', '#4ade80', '#f43f5e', '#38bdf8', '#f97316', '#10b981', '#ec4899'].map(color => (
                    <button
                      key={color}
                      onClick={() => updateTheme({ accentColor: color })}
                      className={`w-8 h-8 border-2 transition-all ${theme.accentColor === color ? 'scale-110 ring-2 ring-white/30' : ''
                        }`}
                      style={{
                        backgroundColor: color,
                        borderRadius: 'var(--theme-radius)',
                        borderColor: theme.accentColor === color ? 'white' : 'transparent'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Border Radius */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">
                  Border Radius
                </label>
                <div className="flex gap-2">
                  {(['none', 'sm', 'md', 'lg', 'full'] as const).map(radius => (
                    <button
                      key={radius}
                      onClick={() => updateTheme({ borderRadius: radius })}
                      className="flex-1 py-2 px-3 text-xs font-medium"
                      style={theme.borderRadius === radius ? activeButtonStyle : inactiveButtonStyle}
                    >
                      {radius.charAt(0).toUpperCase() + radius.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout Spacing */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">
                  Layout Spacing
                </label>
                <div className="flex gap-2">
                  {(['none', 'compact', 'normal'] as const).map(spacing => (
                    <button
                      key={spacing}
                      onClick={() => updateTheme({ layoutSpacing: spacing })}
                      className="flex-1 py-2 px-3 text-xs font-medium"
                      style={theme.layoutSpacing === spacing ? activeButtonStyle : inactiveButtonStyle}
                    >
                      {spacing.charAt(0).toUpperCase() + spacing.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">
                  Font Family
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(fonts) as [FontFamily, { name: string; description: string }][]).map(([key, font]) => (
                    <button
                      key={key}
                      onClick={() => updateTheme({ fontFamily: key })}
                      className="py-2 px-3 text-xs text-left"
                      style={theme.fontFamily === key ? activeButtonStyle : inactiveButtonStyle}
                    >
                      <div className="font-medium">{font.name}</div>
                      <div className="text-[9px] opacity-70">{font.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <span className="text-xs text-zinc-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Changes apply in real-time
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 font-medium text-sm"
            style={activeButtonStyle}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
