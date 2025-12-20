'use client';

interface LoadingOverlayProps {
  isLoading: boolean;
}

export function LoadingOverlay({ isLoading }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-[50] bg-zinc-950/80 backdrop-blur-sm pointer-events-none">
      <div className="bg-zinc-900 border border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold text-cyan-500 tracking-widest uppercase">Initializing Environment...</span>
      </div>
    </div>
  );
}
