'use client';
import { Activity, Minus, X, ChevronDown } from 'lucide-react';
import { ViewerStats } from '@/types';
import { useState } from 'react';

interface TelemetryPanelProps {
  stats: ViewerStats | null;
  isOpen: boolean;
  onClose?: () => void;
  realFps?: number;
}

export function TelemetryPanel({ stats, isOpen, onClose, realFps }: TelemetryPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen || !stats) return null;

  const displayFps = realFps ?? stats.fps ?? '--';

  return (
    <div
      className={`pointer-events-auto border w-72 animate-in fade-in slide-in-from-bottom-4 shadow-2xl z-20 overflow-hidden ${isMinimized ? '' : 'p-4'}`}
      style={{
        borderRadius: 'var(--theme-radius, 0.75rem)',
        backgroundColor: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
        backdropFilter: 'var(--theme-glass, blur(12px))',
        color: 'var(--theme-text)'
      }}
    >
      {/* Header with minimize/close */}
      <div className={`flex items-center gap-2 ${isMinimized ? 'p-3' : 'mb-4 pb-2'}`} style={{ borderBottom: isMinimized ? 'none' : '1px solid var(--theme-border)' }}>
        <Activity size={16} style={{ color: 'var(--theme-accent)' }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--theme-text)' }}>Live Telemetry</span>
        <div className="ml-auto flex items-center gap-2">
          {!isMinimized && (
            <>
              <div className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ color: 'var(--theme-text)', opacity: 0.7, backgroundColor: 'var(--theme-border)', borderColor: 'var(--theme-border)' }}>
                {displayFps} FPS
              </div>
              <div className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </div>
            </>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--theme-text)', opacity: 0.6 }}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronDown size={12} /> : <Minus size={12} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-500/20 rounded transition-colors text-red-400"
              title="Close"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible content */}
      {!isMinimized && (
        <div className="grid grid-cols-2 gap-y-6 gap-x-8">
          {/* Dimensions */}
          <div className="col-span-2 grid grid-cols-3 gap-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--theme-border)' }}>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-center" style={{ color: 'var(--theme-text)', opacity: 0.5 }}>Width</span>
              <span className="text-sm font-mono text-center" style={{ color: 'var(--theme-text)' }}>{stats.width?.toFixed(1)}m</span>
            </div>
            <div className="flex flex-col" style={{ borderLeft: '1px solid var(--theme-border)', borderRight: '1px solid var(--theme-border)' }}>
              <span className="text-[9px] uppercase font-bold text-center" style={{ color: 'var(--theme-text)', opacity: 0.5 }}>Height</span>
              <span className="text-sm font-mono text-center" style={{ color: 'var(--theme-text)' }}>{stats.height?.toFixed(1)}m</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-center" style={{ color: 'var(--theme-text)', opacity: 0.5 }}>Depth</span>
              <span className="text-sm font-mono text-center" style={{ color: 'var(--theme-text)' }}>{stats.depth?.toFixed(1)}m</span>
            </div>
          </div>

          {/* Area & Volume */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: 'var(--theme-text)', opacity: 0.5 }}>Total Area</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--theme-text)' }}>{stats.area?.toFixed(1) || 0}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--theme-text)', opacity: 0.6 }}>m²</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: 'var(--theme-text)', opacity: 0.5 }}>Volume</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--theme-text)' }}>{stats.volume?.toFixed(0) || 0}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--theme-text)', opacity: 0.6 }}>m³</span>
            </div>
          </div>

          {/* Point Stats */}
          <div className="col-span-2 flex justify-between items-center pt-2" style={{ borderTop: '1px solid var(--theme-border)' }}>
            <div className="flex gap-2 text-xs" style={{ color: 'var(--theme-text)', opacity: 0.6 }}>
              <span>Points: <span className="font-mono" style={{ color: 'var(--theme-text)', opacity: 0.8 }}>{((stats.points || 0) / 1000000).toFixed(2)}M</span></span>
              <span>•</span>
              <span>Size: <span className="font-mono" style={{ color: 'var(--theme-text)', opacity: 0.8 }}>{((stats.points || 0) * 16 / 1024 / 1024).toFixed(1)}MB</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
