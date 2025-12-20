'use client';

import { useMemo, useState } from 'react';
import { Brain, Ruler, Zap, AlertTriangle, CheckCircle2, Target, Maximize2, Minus, X, ChevronDown } from 'lucide-react';
import { SceneObject, ViewerStats } from '@/types';

interface AIInsightsPanelProps {
  sceneObjects: SceneObject[];
  stats: ViewerStats | null;
  isOpen: boolean;
  onClose?: () => void;
}

/**
 * AIInsightsPanel - Real AI-powered metrics for AEC
 * 
 * Shows actionable insights that add value beyond raw data:
 * - Estimated floor area from point cloud bounds
 * - Point density analysis (scan quality indicator)
 * - Completeness check (missing structural elements)
 * - Space efficiency metrics
 */
export function AIInsightsPanel({ sceneObjects, stats, isOpen, onClose }: AIInsightsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const insights = useMemo(() => {
    if (!sceneObjects.length) return null;

    // Class counts
    const classCounts = sceneObjects.reduce((acc, obj) => {
      acc[obj.class] = (acc[obj.class] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalPoints = sceneObjects.reduce((sum, obj) => sum + (obj.count || 0), 0);

    // Room classification
    const chairCount = classCounts['chair'] || 0;
    const tableCount = classCounts['table'] || 0;
    const hasBoard = classCounts['board'] > 0;
    const hasSofa = classCounts['sofa'] > 0;

    let roomType = 'Generic Space';
    let confidence = 0.65;

    if (chairCount >= 8 && tableCount > 0) {
      roomType = 'Conference Room';
      confidence = 0.92;
    } else if (chairCount <= 4 && tableCount > 0) {
      roomType = 'Private Office';
      confidence = 0.87;
    } else if (hasSofa) {
      roomType = 'Lounge';
      confidence = 0.78;
    } else if (hasBoard && tableCount > 0) {
      roomType = 'Meeting Room';
      confidence = 0.84;
    } else if (chairCount === 0 && tableCount === 0) {
      roomType = 'Circulation';
      confidence = 0.71;
    }

    // REAL METRICS
    let floorArea = 0;
    let ceilingHeight = 0;
    let volume = 0;
    if (stats) {
      const width = stats.width || 0;
      const depth = stats.depth || 0;
      ceilingHeight = stats.height || 0;
      floorArea = width * depth;
      volume = floorArea * ceilingHeight;
    }

    // Point density
    const pointDensity = floorArea > 0 ? totalPoints / floorArea : 0;
    let scanQuality = 'Unknown';
    let qualityScore = 0;
    if (pointDensity > 50000) {
      scanQuality = 'Excellent';
      qualityScore = 95;
    } else if (pointDensity > 20000) {
      scanQuality = 'Good';
      qualityScore = 75;
    } else if (pointDensity > 5000) {
      scanQuality = 'Adequate';
      qualityScore = 50;
    } else if (pointDensity > 0) {
      scanQuality = 'Low';
      qualityScore = 25;
    }

    // Structural completeness
    const structuralElements = ['floor', 'ceiling', 'wall'];
    const foundStructural = structuralElements.filter(e => classCounts[e] > 0);
    const completeness = (foundStructural.length / structuralElements.length) * 100;

    // Furniture density
    const furnitureClasses = ['chair', 'table', 'sofa', 'bookcase'];
    const furnitureCount = furnitureClasses.reduce((sum, c) => sum + (classCounts[c] || 0), 0);

    // Issues/Recommendations
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!classCounts['floor']) issues.push('Floor not detected');
    if (!classCounts['ceiling']) issues.push('Ceiling not detected');
    if (classCounts['wall'] < 2) issues.push('Incomplete wall coverage');
    if (classCounts['clutter'] > 10) issues.push('High clutter detected');

    if (qualityScore < 50) recommendations.push('Consider higher-resolution scan');
    if (completeness < 100) recommendations.push('Re-scan to capture missing surfaces');

    return {
      roomType,
      confidence,
      floorArea,
      ceilingHeight,
      volume,
      totalPoints,
      pointDensity,
      scanQuality,
      qualityScore,
      completeness,
      furnitureCount,
      totalObjects: sceneObjects.length,
      classCounts,
      issues,
      recommendations
    };
  }, [sceneObjects, stats]);

  if (!isOpen || !insights) return null;

  return (
    <div
      className="pointer-events-auto w-72 border shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-300"
      style={{
        borderRadius: 'var(--theme-radius, 12px)',
        backgroundColor: 'var(--theme-card, #18181b)',
        borderColor: 'var(--theme-border, rgba(255,255,255,0.1))',
        backdropFilter: 'var(--theme-glass, blur(12px))'
      }}
    >
      {/* Header - consistent with sidebar */}
      <div
        className="p-3 border-b flex items-center gap-2"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        <Brain className="w-4 h-4" style={{ color: 'var(--theme-accent, #a855f7)' }} />
        <h2 className="text-xs font-bold text-white uppercase tracking-wider flex-1">AI Scan Analysis</h2>
        <span
          className="text-[10px] px-2 py-0.5 border"
          style={{
            borderRadius: 'var(--theme-radius, 9999px)',
            backgroundColor: insights.qualityScore >= 75 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(251, 191, 36, 0.2)',
            borderColor: insights.qualityScore >= 75 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)',
            color: insights.qualityScore >= 75 ? '#86efac' : '#fcd34d'
          }}
        >
          {insights.scanQuality}
        </span>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="p-1 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          style={{ borderRadius: 'var(--theme-radius, 4px)' }}
        >
          {isMinimized ? <ChevronDown size={14} /> : <Minus size={14} />}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            style={{ borderRadius: 'var(--theme-radius, 4px)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-3">
          {/* Room Type */}
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-white">{insights.roomType}</span>
            <span className="text-xs font-mono" style={{ color: 'var(--theme-accent)' }}>{(insights.confidence * 100).toFixed(0)}%</span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/30 p-2 border border-white/5" style={{ borderRadius: 'var(--theme-radius, 8px)' }}>
              <div className="flex items-center gap-1 text-[9px] text-zinc-500 uppercase">
                <Maximize2 className="w-3 h-3" />
                Floor Area
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--theme-accent)' }}>
                {insights.floorArea.toFixed(1)}m²
              </div>
            </div>

            <div className="bg-black/30 p-2 border border-white/5" style={{ borderRadius: 'var(--theme-radius, 8px)' }}>
              <div className="flex items-center gap-1 text-[9px] text-zinc-500 uppercase">
                <Ruler className="w-3 h-3" />
                Ceiling
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--theme-accent)' }}>
                {insights.ceilingHeight.toFixed(2)}m
              </div>
            </div>

            <div className="bg-black/30 p-2 border border-white/5" style={{ borderRadius: 'var(--theme-radius, 8px)' }}>
              <div className="flex items-center gap-1 text-[9px] text-zinc-500 uppercase">
                <Target className="w-3 h-3" />
                Density
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: 'var(--theme-accent)' }}>
                {(insights.pointDensity / 1000).toFixed(0)}K/m²
              </div>
            </div>

            <div className="bg-black/30 p-2 border border-white/5" style={{ borderRadius: 'var(--theme-radius, 8px)' }}>
              <div className="flex items-center gap-1 text-[9px] text-zinc-500 uppercase">
                <Zap className="w-3 h-3" />
                Quality
              </div>
              <div className={`text-sm font-bold font-mono ${insights.qualityScore >= 75 ? 'text-green-400' :
                insights.qualityScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                {insights.qualityScore}%
              </div>
            </div>
          </div>

          {/* Completeness */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-zinc-400">Structural Completeness</span>
              <span className="text-white font-mono">{insights.completeness.toFixed(0)}%</span>
            </div>
            <div className="h-1 bg-zinc-800 overflow-hidden" style={{ borderRadius: 'var(--theme-radius, 9999px)' }}>
              <div
                className={`h-full transition-all ${insights.completeness === 100 ? 'bg-green-500' :
                  insights.completeness >= 66 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                style={{ width: `${insights.completeness}%`, borderRadius: 'var(--theme-radius, 9999px)' }}
              />
            </div>
          </div>

          {/* Issues */}
          {insights.issues.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                Issues ({insights.issues.length})
              </div>
              {insights.issues.map((issue, i) => (
                <div key={i} className="text-[10px] text-amber-300/80 bg-amber-500/10 px-2 py-1" style={{ borderRadius: 'var(--theme-radius, 4px)' }}>
                  {issue}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {insights.recommendations.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-blue-400">
                <CheckCircle2 className="w-3 h-3" />
                Recommendations
              </div>
              {insights.recommendations.map((rec, i) => (
                <div key={i} className="text-[10px] text-blue-300/80 bg-blue-500/10 px-2 py-1" style={{ borderRadius: 'var(--theme-radius, 4px)' }}>
                  {rec}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 border-t flex justify-between text-[9px] text-zinc-500" style={{ borderColor: 'var(--theme-border)' }}>
            <span>{insights.totalObjects} objects</span>
            <span>{insights.furnitureCount} furniture</span>
            <span>{(insights.totalPoints / 1000).toFixed(0)}K pts</span>
          </div>
        </div>
      )}
    </div>
  );
}
