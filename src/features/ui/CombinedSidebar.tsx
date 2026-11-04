'use client';
import { Layers, ChevronDown, ChevronUp, Minus, X, Box, Eye, EyeOff, RotateCcw, Pencil, EyeIcon } from 'lucide-react';
import { SceneObject, PlaneInfo } from '@/types';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface CombinedSidebarProps {
  sceneObjects: SceneObject[];
  selectedObjectId: number | null;
  onObjectSelect: (id: number | null) => void;
  planes: PlaneInfo[];
  hiddenPlanes: Set<string>;
  onTogglePlane: (planeName: string) => void;
  onToggleAllPlanes?: (showAll: boolean) => void;
  selectedPlane: string | null;
  onSelectPlane: (planeName: string | null) => void;
  isOpen: boolean;
  onClose?: () => void;
}

type ActiveTab = 'objects' | 'planes';

export function CombinedSidebar({
  sceneObjects,
  selectedObjectId,
  onObjectSelect,
  planes,
  hiddenPlanes,
  onTogglePlane,
  onToggleAllPlanes,
  selectedPlane,
  onSelectPlane,
  isOpen,
  onClose,
}: CombinedSidebarProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('planes');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [editingPlane, setEditingPlane] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Load custom names from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('plane-custom-names');
    if (saved) {
      try {
        setCustomNames(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load custom names');
      }
    }
  }, []);

  // Save custom names to localStorage
  const saveCustomNames = (names: Record<string, string>) => {
    setCustomNames(names);
    localStorage.setItem('plane-custom-names', JSON.stringify(names));
  };

  const groupedObjects = useMemo(() => {
    return sceneObjects.reduce((acc, obj) => {
      (acc[obj.class] = acc[obj.class] || []).push(obj);
      return acc;
    }, {} as Record<string, SceneObject[]>);
  }, [sceneObjects]);

  const toggleGroup = (className: string) => {
    setExpandedGroups(prev => ({ ...prev, [className]: !prev[className] }));
  };

  const handleStartEdit = (planeName: string) => {
    setEditingPlane(planeName);
    setEditValue(customNames[planeName] || planeName);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleSaveEdit = (originalName: string) => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== originalName) {
      const previousValue = customNames[originalName];
      const newNames = { ...customNames, [originalName]: trimmedValue };
      saveCustomNames(newNames);

      showToast(
        `Renamed to "${trimmedValue}"`,
        'success',
        {
          label: 'Undo',
          onClick: () => {
            if (previousValue) {
              saveCustomNames({ ...customNames, [originalName]: previousValue });
            } else {
              const restored = { ...customNames };
              delete restored[originalName];
              saveCustomNames(restored);
            }
            showToast('Rename undone', 'success');
          }
        }
      );
    }
    setEditingPlane(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingPlane(null);
    setEditValue('');
  };

  const handleResetAllNames = () => {
    const previousNames = { ...customNames };
    saveCustomNames({});
    showToast(
      'All names reset to original',
      'success',
      {
        label: 'Undo',
        onClick: () => {
          saveCustomNames(previousNames);
          showToast('Reset undone', 'success');
        }
      }
    );
  };

  const getDisplayName = (originalName: string) => customNames[originalName] || originalName;

  if (!isOpen) return null;

  const visiblePlanesCount = planes.filter(p => !hiddenPlanes.has(p.name)).length;
  const hasCustomNames = Object.keys(customNames).length > 0;

  return (
    <div
      className={`pointer-events-auto w-72 border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left-4 duration-300 flex-shrink-0 ${isMinimized ? '' : 'max-h-[calc(100vh-180px)]'}`}
      style={{
        borderRadius: 'var(--theme-radius, 0.75rem)',
        backgroundColor: 'var(--theme-card, rgb(24 24 27 / 0.95))',
        borderColor: 'var(--theme-border, rgba(255,255,255,0.1))',
        backdropFilter: 'var(--theme-glass, blur(12px))'
      }}
    >
      {/* Tabs Header */}
      <div className="flex border-b border-white/5" style={{ minHeight: 36 }}>
        <button
          onClick={() => setActiveTab('planes')}
          className="py-2.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap"
          style={{
            flex: activeTab === 'planes' ? '1 1 auto' : '0 0 40px',
            borderBottom: activeTab === 'planes' ? '2px solid var(--theme-accent, #22d3ee)' : '2px solid transparent',
            color: 'var(--theme-text)',
            opacity: activeTab === 'planes' ? 1 : 0.5,
            transition: 'flex 0.3s ease, opacity 0.2s ease'
          }}
          title={`Planes (${visiblePlanesCount}/${planes.length})`}
        >
          <Box size={12} style={{ color: activeTab === 'planes' ? 'var(--theme-accent, #22d3ee)' : undefined, flexShrink: 0 }} />
          <span style={{
            opacity: activeTab === 'planes' ? 1 : 0,
            transition: 'opacity 0.2s ease',
            marginLeft: activeTab === 'planes' ? 0 : -100
          }}>
            Planes ({visiblePlanesCount}/{planes.length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab('objects')}
          className="py-2.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap"
          style={{
            flex: activeTab === 'objects' ? '1 1 auto' : '0 0 40px',
            borderBottom: activeTab === 'objects' ? '2px solid var(--theme-accent, #22d3ee)' : '2px solid transparent',
            color: 'var(--theme-text)',
            opacity: activeTab === 'objects' ? 1 : 0.5,
            transition: 'flex 0.3s ease, opacity 0.2s ease'
          }}
          title={`Objects (${sceneObjects.length})`}
        >
          <Layers size={12} style={{ color: activeTab === 'objects' ? 'var(--theme-accent, #22d3ee)' : undefined, flexShrink: 0 }} />
          <span style={{
            opacity: activeTab === 'objects' ? 1 : 0,
            transition: 'opacity 0.2s ease',
            marginLeft: activeTab === 'objects' ? 0 : -100
          }}>
            Objects ({sceneObjects.length})
          </span>
        </button>

        {/* Toggle All / Minimize/Close */}
        <div className="flex items-center px-2 gap-1 border-l border-white/5">
          {/* Toggle All - Always visible but only active on Planes tab */}
          <button
            onClick={() => {
              if (activeTab !== 'planes') return;
              const allVisible = hiddenPlanes.size === 0;
              if (onToggleAllPlanes) {
                onToggleAllPlanes(!allVisible);
              } else {
                // Fallback: toggle each plane individually
                planes.forEach(plane => {
                  if (allVisible) {
                    if (!hiddenPlanes.has(plane.name)) onTogglePlane(plane.name);
                  } else {
                    if (hiddenPlanes.has(plane.name)) onTogglePlane(plane.name);
                  }
                });
              }
            }}
            className="p-1 rounded transition-colors"
            style={{
              color: 'var(--theme-accent, #22d3ee)',
              opacity: activeTab === 'planes' ? 1 : 0.3,
              cursor: activeTab === 'planes' ? 'pointer' : 'default'
            }}
            title={activeTab === 'planes' ? (hiddenPlanes.size === 0 ? 'Hide All Planes' : 'Show All Planes') : 'Switch to Planes tab'}
          >
            {hiddenPlanes.size === 0 ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-400 hover:text-zinc-200"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronDown size={12} /> : <Minus size={12} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-red-500/20 rounded transition-colors text-zinc-400 hover:text-red-400"
              title="Close"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {
        !isMinimized && (
          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[200px]" style={{ padding: 'var(--theme-padding, 0.5rem)' }}>

            {/* === PLANES TAB === */}
            {activeTab === 'planes' && (
              <div className="space-y-1">
                {planes.map((plane) => {
                  const isHidden = hiddenPlanes.has(plane.name);
                  const isSelected = selectedPlane === plane.name;
                  const isEditing = editingPlane === plane.name;
                  const displayName = getDisplayName(plane.name);

                  return (
                    <div
                      key={plane.name}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer group ${isSelected
                        ? 'border'
                        : 'hover:bg-white/5 border border-transparent'
                        } ${isHidden ? 'opacity-50' : ''}`}
                      style={{
                        backgroundColor: isSelected ? 'var(--theme-accent, #3b82f6)22' : undefined,
                        borderColor: isSelected ? 'var(--theme-accent, #3b82f6)55' : 'transparent',
                        borderRadius: 'var(--theme-radius, 0.5rem)'
                      }}
                      onClick={() => !isEditing && onSelectPlane(isSelected ? null : plane.name)}
                    >
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleSaveEdit(plane.name)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') handleSaveEdit(plane.name);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            className="w-full bg-black/50 border border-white/20 rounded px-2 py-0.5 text-[11px] text-white focus:outline-none focus:border-[var(--theme-accent)]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <div
                              className={`text-[11px] font-medium truncate flex items-center gap-1 ${isSelected ? 'text-white' : 'text-zinc-300'}`}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(plane.name);
                              }}
                            >
                              {displayName}
                              {customNames[plane.name] && (
                                <Pencil size={8} className="opacity-50" />
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono">
                              {plane.width.toFixed(2)}m × {plane.height.toFixed(2)}m
                              {plane.isHorizontal && <span className="ml-1 text-zinc-600">(H)</span>}
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        className={`p-1.5 rounded transition-all ${isHidden
                          ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
                          : 'hover:bg-white/10'
                          }`}
                        style={{ color: !isHidden ? 'var(--theme-accent, #22d3ee)' : undefined }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePlane(plane.name);
                        }}
                        title={isHidden ? 'Show plane' : 'Hide plane'}
                      >
                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  );
                })}

                {planes.length === 0 && (
                  <div className="text-center py-8 text-zinc-600 text-[10px] uppercase tracking-wider">
                    No planes detected
                  </div>
                )}
              </div>
            )}

            {/* === OBJECTS TAB === */}
            {activeTab === 'objects' && (
              <div className="space-y-1">
                {Object.entries(groupedObjects).map(([className, objects]) => (
                  <div key={className} className="space-y-0.5">
                    <button
                      onClick={() => toggleGroup(className)}
                      className="w-full flex items-center justify-between text-[11px] font-bold text-zinc-300 px-3 py-2 bg-black/20 hover:bg-white/5 rounded transition-colors uppercase tracking-wide border border-transparent hover:border-white/5"
                      style={{ borderRadius: 'var(--theme-radius, 0.5rem)' }}
                    >
                      <span className="flex items-center gap-2">
                        {expandedGroups[className] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        {className}
                      </span>
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-white/5">
                        {objects.length}
                      </span>
                    </button>

                    {expandedGroups[className] && (
                      <div className="space-y-0.5 ml-3 border-l border-white/10 pl-2 animate-in slide-in-from-top-1 duration-200">
                        {objects.map(obj => (
                          <button
                            key={obj.id}
                            onClick={() => onObjectSelect(obj.id === selectedObjectId ? null : obj.id)}
                            className={`w-full text-left px-3 py-1.5 rounded-md text-[11px] flex justify-between items-center transition-all ${obj.id === selectedObjectId
                              ? 'font-medium'
                              : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
                              }`}
                            style={{
                              backgroundColor: obj.id === selectedObjectId ? 'var(--theme-accent, #22d3ee)22' : undefined,
                              color: obj.id === selectedObjectId ? 'var(--theme-accent, #22d3ee)' : undefined,
                              borderRadius: 'var(--theme-radius, 0.375rem)'
                            }}
                          >
                            <span className="truncate">{obj.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {sceneObjects.length === 0 && (
                  <div className="text-center py-8 text-zinc-600 text-[10px] uppercase tracking-wider">
                    No objects loaded
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }

      {/* Footer hint for planes */}
      {
        !isMinimized && activeTab === 'planes' && planes.length > 0 && (
          <div className="px-3 py-2 border-t border-white/5 bg-black/20 flex items-center justify-between">
            <p className="text-[9px] text-zinc-500">
              Double-click to rename • <span style={{ color: 'var(--theme-accent, #22d3ee)' }}>Ctrl+Click</span> in 3D to toggle
            </p>
            {hasCustomNames && (
              <button
                onClick={handleResetAllNames}
                className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-zinc-300"
                title="Reset all names to original"
              >
                <RotateCcw size={10} />
              </button>
            )}
          </div>
        )
      }
    </div >
  );
}
