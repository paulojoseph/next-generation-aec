'use client';

import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { PointCloudBounds } from './hooks/usePointCloudLoader';
import { buildRoomLayout, type BimRoom } from '@/features/bim/roomLayout';
import { buildPlanes, snapCandidates } from '@/features/bim/planes';

interface BIMOverlayProps {
  bimRoom: BimRoom | null;  // Entry of bim_data.json for this room
  visible: boolean;
  showLabels: boolean;
  pointCloudBounds: PointCloudBounds | null;
  isMeasuring?: boolean;
  hiddenPlanes?: Set<string>;
  selectedPlane?: string | null;
  onTogglePlane?: (planeName: string) => void;
  onBIMMeasuring?: (isMeasuring: boolean) => void;  // Notify parent when BIM measurement is active
}

/**
 * BIMOverlay - Renders the room planes built from bim_data.json
 * (layout and planes: src/features/bim). Supports measurement tool for
 * distances between planes
 */
export function BIMOverlay({ bimRoom, visible, showLabels, pointCloudBounds, isMeasuring, hiddenPlanes, selectedPlane, onTogglePlane, onBIMMeasuring }: BIMOverlayProps) {
  const [hoveredPlane, setHoveredPlane] = useState<string | null>(null);

  // Measurement state
  const [measurementPoints, setMeasurementPoints] = useState<THREE.Vector3[]>([]);
  const [smartCandidates, setSmartCandidates] = useState<Record<string, THREE.Vector3>>({});
  // Track if measurement was initiated via Shift+Click (persists until complete)
  const [shiftMeasuring, setShiftMeasuring] = useState(false);

  // Effective measuring state: either button mode OR shift-initiated
  const isEffectivelyMeasuring = isMeasuring || shiftMeasuring;

  // Keyboard listener for WASD+Space snap - BLOCKS camera movement during measurement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      // If we have smart candidates showing (mid-measurement), capture WASD keys
      if (Object.keys(smartCandidates).length > 0) {
        // Block WASD and Space from propagating to camera controls
        if (['w', 'a', 's', 'd', ' '].includes(k)) {
          e.preventDefault();
          e.stopPropagation();
        }

        if (smartCandidates[k] || (e.key === ' ' && smartCandidates[' '])) {
          const candidate = smartCandidates[k] || smartCandidates[' '];
          setMeasurementPoints(prev => {
            if (prev.length === 1) {
              // Measurement complete, reset shift state
              setShiftMeasuring(false);
              return [...prev, candidate];
            }
            return prev;
          });
          setSmartCandidates({});
        }
      }

      // ESC to cancel measurement
      if (e.key === 'Escape' && isEffectivelyMeasuring) {
        e.preventDefault();
        setMeasurementPoints([]);
        setSmartCandidates({});
        setShiftMeasuring(false);
      }
    };

    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [smartCandidates, isEffectivelyMeasuring]);

  // Reset measurement when isMeasuring button is turned off (but not for shift mode)
  useEffect(() => {
    if (!isMeasuring && !shiftMeasuring) {
      setMeasurementPoints([]);
      setSmartCandidates({});
    }
  }, [isMeasuring, shiftMeasuring]);

  // Notify parent when BIM measurement is active (so camera WASD can be disabled)
  useEffect(() => {
    if (onBIMMeasuring) {
      onBIMMeasuring(Object.keys(smartCandidates).length > 0);
    }
  }, [smartCandidates, onBIMMeasuring]);

  // Room layout in the viewer frame: the viewer puts the point cloud's robust
  // floor (rawFloor) at Y = 0; until it is known, the pipeline's convention
  const layout = useMemo(
    () => (bimRoom ? buildRoomLayout(bimRoom, { viewerFloorY: pointCloudBounds?.rawFloor }) : null),
    [bimRoom, pointCloudBounds]
  );
  const planes = useMemo(() => (layout ? buildPlanes(layout) : []), [layout]);

  // One geometry per plane, rebuilt only when the layout changes
  const geometries = useMemo(
    () => new Map(planes.map((plane) => [
      plane.name,
      new THREE.ShapeGeometry(new THREE.Shape(plane.outline.map(([u, v]) => new THREE.Vector2(u, v)))),
    ])),
    [planes]
  );
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  // Create wall meshes
  const wallMeshes = useMemo(() => {
    if (!layout || !visible) return null;

    return planes
      .filter(plane => !hiddenPlanes?.has(plane.name)) // Filter hidden planes
      .map((plane) => {
        const geometry = geometries.get(plane.name)!;

        const isHovered = hoveredPlane === plane.name;
        const isSelected = selectedPlane === plane.name;
        // Color priority: selected (purple) > hovered (green) > default (blue)
        const color = isSelected ? '#a855f7' : isHovered ? '#22c55e' : '#3b82f6';

        return (
          <group
            key={plane.name}
            position={plane.position}
            rotation={new THREE.Euler(...plane.rotation)}
          >
            <mesh
              geometry={geometry}
              onPointerOver={(e) => { e.stopPropagation(); setHoveredPlane(plane.name); }}
              onPointerOut={(e) => { e.stopPropagation(); setHoveredPlane(null); }}
              onClick={(e) => {
                e.stopPropagation();
                // Prevent hitting multiple planes along the same ray
                if (e.nativeEvent) {
                  e.nativeEvent.stopImmediatePropagation();
                }

                // CTRL+click = toggle visibility
                if (e.ctrlKey && onTogglePlane) {
                  onTogglePlane(plane.name);
                  return;
                }

                // Normal click in measurement mode OR Shift+click
                if (!isMeasuring && !e.shiftKey) return;

                // If Shift+click, set shiftMeasuring to persist the measurement
                if (e.shiftKey && !isMeasuring) {
                  setShiftMeasuring(true);
                }

                const point = e.point.clone();

                // If we have 0 or 2 points, start fresh
                if (measurementPoints.length === 0 || measurementPoints.length === 2) {
                  setMeasurementPoints([point]);

                  // Smart candidates for WASD+Space (src/features/bim/planes.ts)
                  const candidates: Record<string, THREE.Vector3> = {};
                  const targets = snapCandidates(layout, plane, [point.x, point.y, point.z]);
                  for (const [key, [x, y, z]] of Object.entries(targets)) {
                    candidates[key] = new THREE.Vector3(x, y, z);
                  }
                  setSmartCandidates(candidates);
                } else if (measurementPoints.length === 1) {
                  // Second point - complete measurement
                  setMeasurementPoints(prev => [...prev, point]);
                  setSmartCandidates({});
                  setShiftMeasuring(false);
                }
              }}
            >
              <meshStandardMaterial
                color={color}
                transparent
                opacity={isHovered ? 0.4 : 0.2}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>

            <lineSegments>
              <edgesGeometry args={[geometry]} />
              <lineBasicMaterial color={isHovered ? '#22c55e' : '#60a5fa'} linewidth={2} />
            </lineSegments>

            {(isHovered || showLabels) && !plane.isHorizontal && (
              <Html
                position={[0, plane.height / 2 + 0.3, 0.1]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: '#22d3ee',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {plane.name}
                  </div>
                  <div style={{ color: '#94a3b8' }}>
                    {plane.width.toFixed(2)}m × {plane.height.toFixed(2)}m
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>
                    {(plane.width * plane.height).toFixed(1)} m²
                  </div>
                </div>
              </Html>
            )}

            {/* Labels for horizontal planes (Floor, Ceiling) */}
            {(isHovered || showLabels) && plane.isHorizontal && (
              <Html
                position={[0, 0.5, 0]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: plane.name === 'Floor' ? '#4ade80' : '#f472b6',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  border: `1px solid ${plane.name === 'Floor' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(244, 114, 182, 0.3)'}`,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {plane.name}
                  </div>
                  <div style={{ color: '#94a3b8' }}>
                    {plane.width.toFixed(2)}m × {plane.height.toFixed(2)}m
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>
                    {(plane.width * plane.height).toFixed(1)} m²
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      });
  }, [layout, planes, geometries, visible, hoveredPlane, showLabels, hiddenPlanes, selectedPlane, onTogglePlane, isMeasuring, measurementPoints]);

  if (!layout || !visible) return null;

  // Calculate distance if we have 2 points
  const distance = measurementPoints.length === 2
    ? measurementPoints[0].distanceTo(measurementPoints[1])
    : null;

  return (
    <group>
      {wallMeshes}

      {/* Measurement visualization */}
      {measurementPoints.length > 0 && (
        <>
          {/* First point marker */}
          <mesh position={measurementPoints[0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
          </mesh>

          {/* Premium laser visualization with distances */}
          {Object.entries(smartCandidates).map(([key, pos]) => {
            const distance = measurementPoints[0].distanceTo(pos);
            const midPoint = new THREE.Vector3().addVectors(measurementPoints[0], pos).multiplyScalar(0.5);

            // Color coding by direction
            const colorMap: Record<string, string> = {
              'w': '#22c55e', // Green - up
              's': '#f97316', // Orange - down
              'a': '#3b82f6', // Blue - left
              'd': '#8b5cf6', // Purple - right
              ' ': '#ec4899', // Pink - front/back
            };
            const color = colorMap[key] || '#22c55e';

            return (
              <group key={key}>
                {/* Laser line from origin to candidate */}
                <Line
                  points={[measurementPoints[0], pos]}
                  color={color}
                  lineWidth={2}
                  transparent
                  opacity={0.6}
                  dashed
                  dashSize={0.1}
                  gapSize={0.05}
                />

                {/* Endpoint sphere */}
                <mesh position={pos}>
                  <sphereGeometry args={[0.04, 16, 16]} />
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
                </mesh>

                {/* Key label at endpoint */}
                <Html position={[pos.x, pos.y + 0.12, pos.z]} center style={{ pointerEvents: 'none' }}>
                  <div style={{
                    background: color,
                    color: 'white',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>
                    {key === ' ' ? '␣ SPACE' : key.toUpperCase()}
                  </div>
                </Html>

                {/* Distance label at midpoint */}
                <Html position={[midPoint.x, midPoint.y + 0.08, midPoint.z]} center style={{ pointerEvents: 'none' }}>
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.85)',
                    color: color,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    border: `1px solid ${color}`,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}>
                    {distance.toFixed(2)}m
                  </div>
                </Html>
              </group>
            );
          })}

          {/* Second point and line */}
          {measurementPoints.length === 2 && (
            <>
              <mesh position={measurementPoints[1]}>
                <sphereGeometry args={[0.05, 16, 16]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
              </mesh>

              {/* Measurement line */}
              <Line
                points={[measurementPoints[0], measurementPoints[1]]}
                color="#fbbf24"
                lineWidth={3}
              />

              {/* Distance label */}
              <Html
                position={[
                  (measurementPoints[0].x + measurementPoints[1].x) / 2,
                  (measurementPoints[0].y + measurementPoints[1].y) / 2 + 0.2,
                  (measurementPoints[0].z + measurementPoints[1].z) / 2
                ]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <div style={{
                  background: 'rgba(0, 0, 0, 0.9)',
                  color: '#fbbf24',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  border: '2px solid #fbbf24',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                  📏 {distance?.toFixed(2)}m
                </div>
              </Html>
            </>
          )}
        </>
      )}
    </group>
  );
}
