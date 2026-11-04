'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// FEATURE IMPORTS
// ============================================================================

import { Viewer3D } from '@/features/viewer/Viewer3D';

// UI Components
import { Header } from '@/features/ui/Header';
import { CombinedSidebar } from '@/features/ui/CombinedSidebar';
import { TelemetryPanel } from '@/features/ui/TelemetryPanel';
import { Tooltip } from '@/features/ui/Tooltip';
import { LoadingOverlay } from '@/features/ui/LoadingOverlay';
import { LevaContainer } from '@/features/ui/LevaContainer';
import { KeyboardHelpOverlay } from '@/features/ui/KeyboardHelpOverlay';
import { AIInsightsPanel } from '@/features/ui/AIInsightsPanel';
import { SettingsModal } from '@/features/ui/SettingsModal';

// Data Layer
import { manifestLoader, sceneObjectsLoader, dataSourceResolver } from '@/data';
import { buildRoomLayout, findBimRoom, type BimRoom } from '@/features/bim/roomLayout';
import { buildPlanes, type PlaneSpec } from '@/features/bim/planes';

// Contexts
import { useToast } from '@/contexts/ToastContext';

// Types
import {
  SceneObject,
  ViewerStats,
  HoverInfo,
  ViewMode,
} from '@/types';

// ============================================================================
// BIM DATA
// ============================================================================

const ROOM = 'conferenceRoom_1';
const BIM_DATA_URL = '/bim/bim_data.json';

/**
 * Loads the room's entry from the Scan-to-BIM output. The pipeline names rooms
 * after the scan file, `${area}_${room}`. Never throws: without BIM data the
 * viewer still works, there are just no planes.
 */
async function loadBimRoom(bimName: string): Promise<BimRoom | null> {
  try {
    const response = await fetch(BIM_DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bim = findBimRoom(await response.json(), bimName);
    if (!bim) {
      console.warn(`[BIM] ${bimName} not found in ${BIM_DATA_URL}`);
      return null;
    }

    if (!buildRoomLayout(bim)) console.warn(`[BIM] ${bimName}: walls do not close a room`);
    return bim;
  } catch (error) {
    console.warn('[BIM] Failed to load plane data:', error);
    return null;
  }
}

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Manages keyboard shortcuts for global actions.
 */
function useKeyboardShortcuts(handlers: { onToggleHelp: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) return;

      if (event.key.toLowerCase() === 'h') {
        handlers.onToggleHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

/**
 * Manages plane visibility state with batch operations.
 */
function usePlaneVisibility(
  planes: PlaneSpec[],
  showToast: (msg: string, type: 'success' | 'warning') => void
) {
  const [hiddenPlanes, setHiddenPlanes] = useState<Set<string>>(new Set());
  const [selectedPlane, setSelectedPlane] = useState<string | null>(null);

  const togglePlane = useCallback((planeName: string) => {
    const wasHidden = hiddenPlanes.has(planeName);

    setHiddenPlanes((prev) => {
      const next = new Set(prev);
      wasHidden ? next.delete(planeName) : next.add(planeName);
      return next;
    });

    showToast(
      wasHidden ? `${planeName} shown` : `${planeName} hidden`,
      wasHidden ? 'success' : 'warning'
    );
  }, [hiddenPlanes, showToast]);

  const toggleAllPlanes = useCallback((showAll: boolean) => {
    const planeNames = planes.map((p) => p.name);
    setHiddenPlanes(showAll ? new Set() : new Set(planeNames));
    showToast(
      showAll ? 'All planes shown' : 'All planes hidden',
      showAll ? 'success' : 'warning'
    );
  }, [planes, showToast]);

  return {
    hiddenPlanes,
    selectedPlane,
    setSelectedPlane,
    togglePlane,
    toggleAllPlanes,
  };
}

/**
 * Manages data loading with resilience and progress tracking.
 */
function useDataLoader(showToast: (msg: string, type: 'success' | 'warning') => void) {
  const [loading, setLoading] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);
  const [bimRoom, setBimRoom] = useState<BimRoom | null>(null);

  useEffect(() => {
    async function initializeData() {
      setLoading(true);

      try {
        const source = dataSourceResolver.resolve();
        console.log(`[System] ${source.environment} mode | Source: ${source.baseUrl}`);

        const area = await manifestLoader.findRoomArea(ROOM);
        const room = await manifestLoader.loadRoom(area, ROOM);

        setModelUrl(room.modelUrl);

        const objects = await sceneObjectsLoader.load(room.objectsUrl);
        setSceneObjects(objects);

        console.log(`[BIM] Loaded ${objects.length} objects from ${room.objectsUrl}`);

        setBimRoom(await loadBimRoom(`${area}_${room.name}`));

      } catch (error) {
        console.error('[System] Initialization failed:', error);
        showToast('Failed to load scene data. Check connectivity.', 'warning');
      } finally {
        setLoading(false);
      }
    }

    initializeData();
  }, [showToast]);

  return { loading, setLoading, modelUrl, sceneObjects, bimRoom };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Home - Application entry point and layout orchestrator.
 *
 * Separates concerns into:
 * - UI state management (panels, modals, selections)
 * - Data loading (manifest, objects)
 * - 3D rendering (delegated to Viewer3D)
 *
 * The Three.js Canvas is isolated at the bottom of the z-stack,
 * with UI panels overlaid using pointer-events management.
 */
export default function Home() {
  // ──────────────────────────────────────────────────────────────────────────
  // STATE: Viewer Statistics
  // ──────────────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);

  // ──────────────────────────────────────────────────────────────────────────
  // STATE: Navigation & Tools
  // ──────────────────────────────────────────────────────────────────────────
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('perspective');

  // ──────────────────────────────────────────────────────────────────────────
  // STATE: UI Panel Visibility
  // ──────────────────────────────────────────────────────────────────────────
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(true);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // HOOKS
  // ──────────────────────────────────────────────────────────────────────────
  const { showToast } = useToast();
  const { loading, setLoading, modelUrl, sceneObjects, bimRoom } = useDataLoader(showToast);
  // Sizes for the sidebar; the overlay builds the same planes at the viewer's floor level
  const planes = useMemo(() => {
    const layout = bimRoom && buildRoomLayout(bimRoom);
    return layout ? buildPlanes(layout) : [];
  }, [bimRoom]);
  const {
    hiddenPlanes,
    selectedPlane,
    setSelectedPlane,
    togglePlane,
    toggleAllPlanes,
  } = usePlaneVisibility(planes, showToast);

  useKeyboardShortcuts({
    onToggleHelp: () => setIsHelpOpen((prev) => !prev),
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CALLBACKS
  // ──────────────────────────────────────────────────────────────────────────
  const handleResetCamera = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <main className="w-full h-full relative bg-zinc-950 font-sans overflow-hidden selection:bg-cyan-500/30">
      {/* ════════════════════════════════════════════════════════════════════
          UI LAYER - Overlay panels with pointer-events management
          ════════════════════════════════════════════════════════════════════ */}
      <div
        className="absolute inset-0 pointer-events-none z-10 grid grid-rows-[auto_1fr] grid-cols-[auto_1fr_auto]"
        style={{ padding: 'var(--theme-spacing, 1rem)', gap: 'var(--theme-spacing, 1rem)' }}
      >
        {/* Header Row */}
        <Header
          onResetCamera={handleResetCamera}
          viewMode={viewMode}
          setViewMode={setViewMode}
          isMeasuring={isMeasuring}
          setIsMeasuring={setIsMeasuring}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isTelemetryOpen={isTelemetryOpen}
          setIsTelemetryOpen={setIsTelemetryOpen}
          isAIOpen={isAIOpen}
          setIsAIOpen={setIsAIOpen}
          onSettingsOpen={() => setIsSettingsOpen(true)}
          onHelpOpen={() => setIsHelpOpen(true)}
        />

        {/* Left Column - Sidebar & Telemetry */}
        <div className="flex flex-col overflow-hidden" style={{ gap: 'var(--theme-spacing, 0.75rem)' }}>
          <CombinedSidebar
            sceneObjects={sceneObjects}
            selectedObjectId={selectedObjectId}
            onObjectSelect={setSelectedObjectId}
            planes={planes}
            hiddenPlanes={hiddenPlanes}
            onTogglePlane={togglePlane}
            onToggleAllPlanes={toggleAllPlanes}
            selectedPlane={selectedPlane}
            onSelectPlane={setSelectedPlane}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />

          <TelemetryPanel
            stats={stats}
            isOpen={isTelemetryOpen}
            onClose={() => setIsTelemetryOpen(false)}
          />
        </div>

        {/* Center Spacer */}
        <div />

        {/* Right Column - Settings & AI */}
        <div className="flex flex-col items-end overflow-hidden" style={{ gap: 'var(--theme-spacing, 0.75rem)' }}>
          <LevaContainer />
          <div className="flex-1" />
          <AIInsightsPanel
            sceneObjects={sceneObjects}
            stats={stats}
            isOpen={isAIOpen}
            onClose={() => setIsAIOpen(false)}
          />
        </div>

        {/* Overlays */}
        <LoadingOverlay isLoading={loading} />
        <KeyboardHelpOverlay isVisible={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </div>

      {/* Floating Tooltip */}
      <Tooltip hoverInfo={hoverInfo} />

      {/* ════════════════════════════════════════════════════════════════════
          3D CANVAS LAYER - WebGL rendering surface
          ════════════════════════════════════════════════════════════════════ */}
      <div className="canvas-container absolute top-0 left-0 w-full h-full z-0">
        <Canvas
          camera={{ position: [10, 10, 10], fov: 45 }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
          }}
          shadows
        >
          {/* Scene Configuration */}
          <color attach="background" args={['#09090b']} />
          <fog attach="fog" args={['#09090b', 10, 60]} />

          {/* Lighting */}
          <ambientLight intensity={1.0} />
          <directionalLight
            position={[10, 20, 10]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />

          {/* Point Cloud Viewer */}
          {modelUrl && (
            <Viewer3D
              fileUrl={modelUrl}
              bimRoom={bimRoom}
              onStatsUpdate={setStats}
              onLoadingChange={setLoading}
              isMeasuring={isMeasuring}
              resetTrigger={resetTrigger}
              viewMode={viewMode}
              onHoverUpdate={setHoverInfo}
              selectedObjectId={selectedObjectId}
              onObjectSelect={setSelectedObjectId}
              sceneObjects={sceneObjects}
              hiddenPlanes={hiddenPlanes}
              selectedPlane={selectedPlane}
              onTogglePlane={togglePlane}
            />
          )}

          {/* Ground Grid */}
          <gridHelper args={[100, 50, '#27272a', '#18181b']} position={[0, -0.1, 0]} />

          {/* Camera Controls */}
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            maxPolarAngle={Math.PI}
            minDistance={0.5}
          />
        </Canvas>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </main>
  );
}
