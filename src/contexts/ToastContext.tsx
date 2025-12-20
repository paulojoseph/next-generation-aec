'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, Undo2 } from 'lucide-react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  action?: ToastAction;
}

interface ToastContextType {
  showToast: (message: string, type?: 'info' | 'success' | 'warning', action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Get contrast color based on background luminance
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [accentColor, setAccentColor] = useState('#22d3ee');
  const [contrastColor, setContrastColor] = useState('#000000');

  // Listen for theme changes
  useEffect(() => {
    const updateColors = () => {
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-accent').trim() || '#22d3ee';
      setAccentColor(accent);
      setContrastColor(getContrastColor(accent));
    };

    updateColors();

    // Watch for CSS variable changes
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    return () => observer.disconnect();
  }, []);

  // Counter for unique toast IDs
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info', action?: ToastAction) => {
    const id = `toast-${++toastIdRef.current}`;
    setToasts(prev => [...prev, { id, message, type, action }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container - positioned by theme spacing */}
      <div
        className="fixed z-50 flex flex-col gap-2 pointer-events-none"
        style={{
          bottom: 'var(--theme-spacing, 16px)',
          right: 'var(--theme-spacing, 16px)'
        }}
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 shadow-2xl border animate-in slide-in-from-right-4 duration-300"
            style={{
              borderRadius: 'var(--theme-radius, 12px)',
              backgroundColor: 'var(--theme-card, #18181b)',
              borderColor: 'var(--theme-border, rgba(255,255,255,0.1))',
              backdropFilter: 'var(--theme-glass, blur(12px))'
            }}
          >
            {/* Icon */}
            {toast.type === 'success' && <Eye size={16} style={{ color: accentColor }} />}
            {toast.type === 'warning' && <EyeOff size={16} style={{ color: accentColor }} />}
            {toast.type === 'info' && <Eye size={16} style={{ color: accentColor }} />}

            {/* Message */}
            <span className="text-sm text-white">{toast.message}</span>

            {/* Action Button with proper contrast */}
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  dismissToast(toast.id);
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80"
                style={{
                  borderRadius: 'var(--theme-radius, 4px)',
                  backgroundColor: accentColor,
                  color: contrastColor
                }}
              >
                <Undo2 size={12} />
                {toast.action.label}
              </button>
            )}

            {/* Dismiss */}
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              style={{ borderRadius: 'var(--theme-radius, 4px)' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
