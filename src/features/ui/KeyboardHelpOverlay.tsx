'use client';

import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardHelpOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

const shortcuts = [
  {
    category: 'Navigation', items: [
      { keys: ['W', 'A', 'S', 'D'], action: 'Move camera' },
      { keys: ['Q', 'E'], action: 'Move up/down' },
      { keys: ['Mouse Drag'], action: 'Orbit camera' },
      { keys: ['Scroll'], action: 'Zoom in/out' },
    ]
  },
  {
    category: 'Measurement', items: [
      { keys: ['Shift', 'Click'], action: 'Place measurement point' },
      { keys: ['W', 'A', 'S', 'D'], action: 'Snap direction (while measuring)' },
      { keys: ['Space'], action: 'Confirm snap position' },
    ]
  },
  {
    category: 'Interface', items: [
      { keys: ['H'], action: 'Toggle this help' },
      { keys: ['Esc'], action: 'Close overlays' },
    ]
  },
];

export function KeyboardHelpOverlay({ isVisible, onClose }: KeyboardHelpOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Mark as seen in localStorage
  useEffect(() => {
    if (isVisible) {
      localStorage.setItem('keyboard-help-seen', 'true');
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-[60] backdrop-blur-sm pointer-events-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
      onClick={onClose}
    >
      <div
        className="border shadow-2xl p-6 max-w-lg w-full mx-4 animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: 'var(--theme-card, #18181b)',
          borderColor: 'var(--theme-border, rgba(255,255,255,0.1))',
          borderRadius: 'var(--theme-radius, 12px)',
          color: 'var(--theme-text, #ffffff)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 mb-6 pb-4"
          style={{ borderBottom: '1px solid var(--theme-border, rgba(255,255,255,0.1))' }}
        >
          <div className="flex items-center gap-3">
            <Keyboard className="w-6 h-6" style={{ color: 'var(--theme-accent, #22d3ee)' }} />
            <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: 'var(--theme-text, #ffffff)', opacity: 0.6 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts */}
        <div className="space-y-6">
          {shortcuts.map(section => (
            <div key={section.category}>
              <h3
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: 'var(--theme-accent, #22d3ee)' }}
              >
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div className="flex gap-1.5 flex-wrap">
                      {item.keys.map(key => (
                        <kbd
                          key={key}
                          className="px-2 py-1 border rounded text-xs font-mono"
                          style={{
                            backgroundColor: 'var(--theme-bg, #09090b)',
                            borderColor: 'var(--theme-border, rgba(255,255,255,0.1))',
                            color: 'var(--theme-text, #ffffff)',
                            opacity: 0.9
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                    <span className="text-sm" style={{ opacity: 0.6 }}>{item.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="mt-6 pt-4 text-center text-xs"
          style={{
            borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.1))',
            opacity: 0.5
          }}
        >
          Press <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-bg, #09090b)' }}>H</kbd> or{' '}
          <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--theme-bg, #09090b)' }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

