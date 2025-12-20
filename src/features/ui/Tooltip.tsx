'use client';
import { useRef, useEffect } from 'react';
import { HoverInfo } from '@/types';

interface TooltipProps {
  hoverInfo: HoverInfo | null;
}

export function Tooltip({ hoverInfo }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (ref.current) {
        // Direct DOM update for 60FPS performance without React Re-renders
        ref.current.style.transform = `translate(${e.clientX + 20}px, ${e.clientY + 20}px)`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Always track mouse, even when hidden, to prevent "fly-in" from 0,0
  // Toggle visibility with opacity instead of mounting/unmounting
  const isVisible = !!hoverInfo;

  return (
    <div
      ref={ref}
      className={`fixed top-0 left-0 pointer-events-none z-[100] px-4 py-2 bg-zinc-900/95 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl flex flex-col gap-0.5 transition-opacity duration-150 will-change-transform ${isVisible ? 'opacity-100' : 'opacity-0'
        }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-indigo-500" />
        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Scanned Object</span>
      </div>
      <span className="text-base font-bold text-white leading-none whitespace-nowrap">
        {hoverInfo?.label || '...'}
      </span>
      <div className="flex gap-2 mt-1 pt-1 border-t border-white/10">
        <span className="text-[10px] text-zinc-500 font-mono">X: {hoverInfo?.x?.toFixed(1) || '0.0'}</span>
        <span className="text-[10px] text-zinc-500 font-mono">Y: {hoverInfo?.y?.toFixed(1) || '0.0'}</span>
        <span className="text-[10px] text-zinc-500 font-mono">Z: {hoverInfo?.z?.toFixed(1) || '0.0'}</span>
      </div>
    </div>
  );
}
