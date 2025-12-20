'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useControls } from 'leva';
import * as THREE from 'three';

// Hooks
import { usePointCloudLoader } from './hooks/usePointCloudLoader';
import { useViewerInteraction } from './hooks/useViewerInteraction';
import { useCameraNavigation } from './hooks/useCameraNavigation';

// Components
import { SmartGhosts } from './components/SmartGhosts';
import { BIMOverlay } from './BIMOverlay';

// Materials
import './materials/LidarMaterial'; // Register shader
import { createSplatTexture } from './utils/textureUtils';

// Types
import { ViewerStats, HoverInfo, SceneObject } from '@/types';

interface Viewer3DProps {
  fileUrl: string;
  roomName?: string;  // For BIM overlay lookup
  onStatsUpdate: (stats: ViewerStats) => void;
  onLoadingChange: (loading: boolean) => void;
  isMeasuring: boolean;
  resetTrigger?: number;
  viewMode?: 'perspective' | 'top';
  onHoverUpdate?: (info: HoverInfo | null) => void;
  selectedObjectId?: number | null;
  onObjectSelect?: (id: number) => void;
  sceneObjects?: SceneObject[];  // For semantic hover labels
  hiddenPlanes?: Set<string>;
  selectedPlane?: string | null;
  onTogglePlane?: (planeName: string) => void;
}

export function Viewer3D({
  fileUrl,
  roomName,
  onStatsUpdate,
  onLoadingChange,
  isMeasuring,
  resetTrigger,
  viewMode,
  onHoverUpdate,
  selectedObjectId,
  onObjectSelect,
  sceneObjects,
  hiddenPlanes,
  selectedPlane,
  onTogglePlane
}: Viewer3DProps) {

  // --- LEVA SETTINGS (CONTROLES VISUAIS) ---
  // Organized: Toggles first, then performance settings
  const { showPointCloud, showBIMPlanes, showPlaneLabels, qualityPreset, pointSize, pointOpacity, useSplatting, ceilingCut, movementSpeed } = useControls('Visual Settings', {
    // === VISIBILITY TOGGLES ===
    showPointCloud: { value: true, label: '☁️ Point Cloud', order: 0 },
    showBIMPlanes: { value: true, label: '📐 Detected Planes', order: 1 },
    showPlaneLabels: { value: true, label: '📏 Plane Labels', order: 2 },

    // === POINT CLOUD SETTINGS ===
    qualityPreset: {
      options: {
        'Ultra (Original)': 1,
        'High (1/2)': 2,
        'Balanced (1/5)': 5,
        'Performance (1/10)': 10,
        'Performance+ (1/25)': 25,
        'Max Performance (1/50)': 50
      },
      value: 25,
      label: 'Quality / Density',
      order: 3
    },
    pointSize: { value: 0.035, min: 0.005, max: 0.2, step: 0.001, label: 'Point Size (m)', order: 4 },
    pointOpacity: { value: 1.0, min: 0.1, max: 1.0, step: 0.1, label: 'Opacity', order: 5 },
    useSplatting: { value: false, label: 'Soft Splats', order: 6 },

    // === ADVANCED ===
    ceilingCut: { value: 10.0, min: 0.0, max: 50.0, label: 'Ceiling Slice (m)', order: 7 },
    movementSpeed: { value: 8.0, min: 1.0, max: 20.0, label: 'Speed (m/s)', order: 8 }
  });

  const { bufferGeometry, modelMetrics, pointCloudBounds } = usePointCloudLoader(
    fileUrl,
    qualityPreset,
    onStatsUpdate,
    onLoadingChange
  );

  // Ref to store loaded stats (to preserve width/depth when updating FPS)
  const loadedStatsRef = useRef<ViewerStats | null>(null);

  // LOD Point Size Calculation
  const effectivePointSize = useMemo(() => {
    return pointSize;
  }, [pointSize]);

  // --- INTERACTION ---
  const {
    pointsRef,
    measurementPoints,
    distance, // eslint-disable-line @typescript-eslint/no-unused-vars
    smartCandidates,
    onPointerDown,
    onPointerUp
  } = useViewerInteraction(bufferGeometry, isMeasuring, onHoverUpdate, onObjectSelect, sceneObjects || []);

  // Track when BIM overlay is in measurement mode (Shift+Click on planes)
  const [bimMeasuring, setBimMeasuring] = useState(false);

  // --- NAVIGATION ---
  // Lock camera WASD when EITHER point cloud OR BIM plane has measurement candidates
  useCameraNavigation(movementSpeed, Object.keys(smartCandidates).length > 0 || bimMeasuring);

  // --- VIEW MODE & CAMERA ---
  const { camera, controls } = useThree();

  useEffect(() => {
    if (viewMode === 'top' && modelMetrics && controls) {
      const center = modelMetrics.center;
      const height = modelMetrics.height * 1.5;
      camera.position.set(center.x, center.y + height + 5, center.z);
      camera.lookAt(center);
      // @ts-ignore
      controls.target.copy(center);
      // @ts-ignore
      controls.update();
    }
  }, [viewMode, modelMetrics, camera, controls]);

  // Auto-center camera lookAt when model loads for the first time
  // Keeps camera position at [10,10,10] but looks at model center instead of [0,0,0]
  const hasInitializedCamera = useRef(false);
  useEffect(() => {
    if (modelMetrics && controls && !hasInitializedCamera.current) {
      hasInitializedCamera.current = true;
      const center = modelMetrics.center;
      // Update only the target (lookAt), keep camera position
      // @ts-ignore
      controls.target.copy(center);
      // @ts-ignore
      controls.update();
    }
  }, [modelMetrics, controls]);

  useEffect(() => {
    if (resetTrigger && resetTrigger > 0 && modelMetrics && controls) {
      // @ts-ignore
      controls.target.copy(modelMetrics.center);
      // @ts-ignore
      controls.object.position.set(modelMetrics.center.x, modelMetrics.center.y, modelMetrics.center.z + 0.5);
      // @ts-ignore
      controls.update();
    }
  }, [resetTrigger, modelMetrics, controls]);

  // --- RENDER HELPERS ---
  const splatTexture = useMemo(() => createSplatTexture(), []);

  const clippingPlanes = useMemo(() => {
    const effectiveCut = viewMode === 'top' ? 1.5 : ceilingCut;
    return [new THREE.Plane(new THREE.Vector3(0, -1, 0), effectiveCut)];
  }, [ceilingCut, viewMode]);

  // --- SHADER INJECTION ---
  const uniforms = useMemo(() => ({
    uSelectedId: { value: -1 },
    uTime: { value: 0 }
  }), []);

  // FPS Measurement
  const fpsRef = useRef({ frames: 0, lastTime: 0, currentFps: 0 });

  useEffect(() => {
    uniforms.uSelectedId.value = selectedObjectId || -1;
  }, [selectedObjectId, uniforms]);

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime;

    // FPS Calculation
    fpsRef.current.frames++;
    const elapsed = state.clock.elapsedTime - fpsRef.current.lastTime;

    if (elapsed >= 1.0) {
      fpsRef.current.currentFps = Math.round(fpsRef.current.frames / elapsed);
      fpsRef.current.frames = 0;
      fpsRef.current.lastTime = state.clock.elapsedTime;

      // Update stats with real FPS while preserving loaded dimensions
      if (loadedStatsRef.current) {
        onStatsUpdate({
          ...loadedStatsRef.current,
          fps: fpsRef.current.currentFps
        });
      }
    }
  });

  const onBeforeCompile = useMemo(() => (shader: any) => {
    shader.uniforms.uSelectedId = uniforms.uSelectedId;
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = `
      attribute float objectId;
      varying float vObjectId;
      ${shader.vertexShader}
    `.replace('#include <begin_vertex>', `#include <begin_vertex>\nvObjectId = objectId;`);
    shader.fragmentShader = `
      uniform float uSelectedId;
      uniform float uTime;
      varying float vObjectId;
      ${shader.fragmentShader}
    `.replace('#include <color_fragment>', `#include <color_fragment>\n
      if (abs(vObjectId - uSelectedId) < 0.1) {
          float pulse = (sin(uTime * 3.0) + 1.0) * 0.5; 
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.2, 0.2), 0.7 + pulse * 0.3);
          diffuseColor.a = 1.0; 
      }`);
  }, [uniforms]);

  return (
    <>
      {showPointCloud && bufferGeometry && (
        <points
          ref={pointsRef}
          geometry={bufferGeometry}
          frustumCulled={false}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <pointsMaterial
            key={useSplatting ? "splat" : "basic"}
            vertexColors={true}
            size={effectivePointSize}
            sizeAttenuation={true}
            map={useSplatting ? splatTexture : null}
            alphaTest={useSplatting ? 0.01 : 0.5}
            transparent={true}
            opacity={pointOpacity}
            depthWrite={true}
            clippingPlanes={clippingPlanes}
            clipShadows={true}
            onBeforeCompile={onBeforeCompile}
          />
        </points>
      )}
      <SmartGhosts candidates={smartCandidates} measurementPoints={measurementPoints} />
      {roomName && <BIMOverlay roomName={roomName} visible={showBIMPlanes} showLabels={showPlaneLabels} pointCloudBounds={pointCloudBounds} isMeasuring={isMeasuring} hiddenPlanes={hiddenPlanes} selectedPlane={selectedPlane} onTogglePlane={onTogglePlane} onBIMMeasuring={setBimMeasuring} />}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="black" hideNegativeAxes />
      </GizmoHelper>
    </>
  );
}
