'use client';

import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { PointCloudBounds } from './hooks/usePointCloudLoader';

interface Wall {
  id: number;
  name: string;
  length: number;
  height: number;
  area: number;
  orientation: string;
  centroid: number[];
  min: number[];
  max: number[];
  point_count: number;
}

interface Room {
  width: number;
  depth: number;
  floor_area: number;
  ceiling_height: number;
  volume: number;
  perimeter: number;
  center: number[];
  bounds: {
    min: number[];
    max: number[];
  };
}

interface CenteringOffset {
  x: number;
  y: number;
  z: number;
}

interface BIMData {
  name: string;
  point_count: number;
  planes_detected: number;
  centering_offset?: CenteringOffset;
  walls: Wall[];
  room: Room | null;
  classification: {
    floor_count: number;
    ceiling_count: number;
    wall_count: number;
  };
}

interface BIMOverlayProps {
  roomName: string;
  visible: boolean;
  showLabels: boolean;
  pointCloudBounds: PointCloudBounds | null;
  isMeasuring?: boolean;
  hiddenPlanes?: Set<string>;
  selectedPlane?: string | null;
  onTogglePlane?: (planeName: string) => void;
  onBIMMeasuring?: (isMeasuring: boolean) => void;  // Notify parent when BIM measurement is active
}

interface WallConfig {
  width: number;
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
  name: string;
  isStep?: boolean;
  isHorizontal?: boolean;
  hasDoor?: boolean;
  doorPosition?: number; // Position along wall width (0 to 1)
  doorWidth?: number;
  doorHeight?: number;
  // Stepped wall properties (L-shaped)
  isSteppedWall?: boolean;
  stepWidth?: number;   // Width of taller section
  stepHeight?: number;  // Height of taller section
  recessWidth?: number; // Width of shorter section
  recessHeight?: number; // Height of shorter section
  mirrorLShape?: boolean; // Mirror the L-shape horizontally
}

// Standard door dimensions (meters)
const DOOR_WIDTH = 0.9;  // 90cm standard door
const DOOR_HEIGHT = 2.1; // 210cm standard door height
const DOOR_OFFSET = 0.3; // 30cm from back wall

/**
 * BIMOverlay - Renders detected walls as 2D planes with step geometry
 * Supports measurement tool for distances between planes
 */
export function BIMOverlay({ roomName, visible, showLabels, pointCloudBounds, isMeasuring, hiddenPlanes, selectedPlane, onTogglePlane, onBIMMeasuring }: BIMOverlayProps) {
  const [bimData, setBimData] = useState<BIMData | null>(null);
  const [hoveredWall, setHoveredWall] = useState<number | null>(null);

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

  // Load BIM data (keep ALL walls for analysis, don't filter)
  useEffect(() => {
    if (!roomName) return;

    fetch('/bim/bim_data.json')
      .then(res => res.json())
      .then((data: BIMData[]) => {
        const searchName = `Area_1_${roomName}`;
        const found = data.find(d => d.name === searchName);
        if (found) {
          console.log(`🏗️ [BIM] Loaded: ${found.name}, ${found.walls.length} walls`);
          setBimData(found);
        } else {
          setBimData(null);
        }
      })
      .catch(err => {
        console.error('BIM load error:', err);
        setBimData(null);
      });
  }, [roomName]);

  // Get centering offset
  const offset = useMemo(() => {
    if (!bimData?.centering_offset) return { x: 0, y: 0, z: 0 };
    return bimData.centering_offset;
  }, [bimData]);

  // Analyze walls and compute geometry
  const roomGeometry = useMemo(() => {
    if (!bimData || bimData.walls.length < 4) return null;

    const walls = bimData.walls;

    // Separate walls by orientation
    const ewWalls = walls.filter(w => w.orientation === 'E-W' && w.area > 8);
    const nsWalls = walls.filter(w => w.orientation === 'N-S' && w.area > 6);

    if (ewWalls.length < 2 || nsWalls.length < 2) return null;

    // Sort to find positions
    ewWalls.sort((a, b) => a.centroid[2] - b.centroid[2]); // Back to front
    nsWalls.sort((a, b) => a.centroid[0] - b.centroid[0]); // Left to right

    const backWall = ewWalls[0];
    const frontWall = ewWalls[ewWalls.length - 1];
    const leftWall = nsWalls[0];

    // Find right-side walls (may have 2: step wall and recess wall)
    const rightNsWalls = nsWalls.filter(w => w.centroid[0] > 0);
    rightNsWalls.sort((a, b) => a.centroid[0] - b.centroid[0]);

    // Find the step wall (full height, more to the left)
    // and the recess wall (shorter height, more to the right)
    let stepWall: Wall | null = null;
    let recessWall: Wall | null = null;

    for (const wall of rightNsWalls) {
      if (wall.height > 2.8) {
        // This is likely the step wall (full height)
        if (!stepWall || wall.centroid[0] < stepWall.centroid[0]) {
          stepWall = wall;
        }
      } else if (wall.height > 2.0 && wall.height < 2.8) {
        // This is likely the recess wall (shorter)
        if (!recessWall || wall.centroid[0] > recessWall.centroid[0]) {
          recessWall = wall;
        }
      }
    }

    // If no distinct step/recess walls, use the rightmost as the only right wall
    if (!stepWall && !recessWall && rightNsWalls.length > 0) {
      recessWall = rightNsWalls[rightNsWalls.length - 1];
    }

    // Calculate positions in viewer space
    const leftX = (leftWall.min[0] + leftWall.max[0]) / 2 - offset.x;
    const backZ = (backWall.min[2] + backWall.max[2]) / 2 - offset.z;
    const frontZ = (frontWall.min[2] + frontWall.max[2]) / 2 - offset.z;

    const stepX = stepWall
      ? (stepWall.min[0] + stepWall.max[0]) / 2 - offset.x
      : null;

    const recessX = recessWall
      ? (recessWall.min[0] + recessWall.max[0]) / 2 - offset.x
      : (stepX || leftX + 5);

    // Heights - USE POINT CLOUD BOUNDS for precision if available
    // Fall back to wall heights from BIM data
    const bimMainHeight = Math.max(leftWall.height, frontWall.height, backWall.height);
    const bimRecessHeight = recessWall?.height || bimMainHeight;

    // Use point cloud ceiling if available (more accurate, includes actual data)
    const mainHeight = pointCloudBounds?.ceiling || bimMainHeight;
    const recessHeight = pointCloudBounds
      ? pointCloudBounds.ceiling * (bimRecessHeight / bimMainHeight) // Scale proportionally
      : bimRecessHeight;

    const hasStep = stepWall && recessWall && (mainHeight - recessHeight > 0.5);

    console.log(`📐 [BIM] Using heights - main: ${mainHeight.toFixed(3)}m, recess: ${recessHeight.toFixed(3)}m (from pointCloud: ${!!pointCloudBounds})`);

    return {
      leftX,
      stepX,
      recessX,
      backZ,
      frontZ,
      mainHeight,
      recessHeight,
      hasStep,
      leftWall,
      backWall,
      frontWall,
      stepWall,
      recessWall
    };
  }, [bimData, offset, pointCloudBounds]);

  // Create wall meshes
  const wallMeshes = useMemo(() => {
    if (!roomGeometry || !visible) return null;

    const { leftX, stepX, recessX, backZ, frontZ, mainHeight, recessHeight, hasStep } = roomGeometry;

    const roomDepth = frontZ - backZ;
    const mainWidth = (stepX || recessX) - leftX;  // Width of main section
    const recessWidth = hasStep && stepX ? (recessX - stepX) : 0;

    const wallConfigs: WallConfig[] = [];

    // ========== MAIN PERIMETER WALLS ==========
    // Full width from leftX to recessX
    const fullWidth = recessX - leftX;

    // Wall_Back: E-W wall at backZ - UNIFIED L-SHAPED if stepped
    if (hasStep && stepX) {
      // Create single L-shaped wall using isSteppedWall flag
      wallConfigs.push({
        width: fullWidth,
        height: mainHeight,
        position: [leftX + fullWidth / 2, 0, backZ], // Y=0, centered
        rotation: [0, 0, 0],
        name: 'Wall_Back',
        isSteppedWall: true,
        stepWidth: mainWidth,
        stepHeight: mainHeight,
        recessWidth: recessWidth,
        recessHeight: recessHeight
      });
    } else {
      wallConfigs.push({
        width: fullWidth,
        height: mainHeight,
        position: [leftX + fullWidth / 2, mainHeight / 2, backZ],
        rotation: [0, 0, 0],
        name: 'Wall_Back'
      });
    }

    // Wall_Front: E-W wall at frontZ - UNIFIED L-SHAPED if stepped
    // Note: mirrorLShape compensates for 180° rotation
    if (hasStep && stepX) {
      wallConfigs.push({
        width: fullWidth,
        height: mainHeight,
        position: [leftX + fullWidth / 2, 0, frontZ], // Y=0, centered
        rotation: [0, Math.PI, 0],
        name: 'Wall_Front',
        isSteppedWall: true,
        stepWidth: mainWidth,
        stepHeight: mainHeight,
        recessWidth: recessWidth,
        recessHeight: recessHeight,
        mirrorLShape: true // Flip L-shape for rotated wall
      });
    } else {
      wallConfigs.push({
        width: fullWidth,
        height: mainHeight,
        position: [leftX + fullWidth / 2, mainHeight / 2, frontZ],
        rotation: [0, Math.PI, 0],
        name: 'Wall_Front'
      });
    }

    // Wall_Left: N-S wall at leftX, full height (no door here)
    wallConfigs.push({
      width: roomDepth,
      height: mainHeight,
      position: [leftX, mainHeight / 2, (backZ + frontZ) / 2],
      rotation: [0, Math.PI / 2, 0],
      name: 'Wall_Left'
    });

    // Wall_Right (recess): N-S wall at recessX, shorter height WITH DOOR
    // Door is positioned where point cloud gap is (center of wall)
    wallConfigs.push({
      width: roomDepth,
      height: recessHeight,
      position: [recessX, recessHeight / 2, (backZ + frontZ) / 2],
      rotation: [0, -Math.PI / 2, 0],
      name: 'Wall_Right',
      hasDoor: true,
      doorPosition: 0.4, // 40% from front (where gap is in point cloud)
      doorWidth: DOOR_WIDTH,
      doorHeight: DOOR_HEIGHT
    });

    // ========== STEP GEOMETRY (if present) ==========
    if (hasStep && stepX) {
      const stepHeight = mainHeight - recessHeight;

      // Step_Wall: Vertical N-S plane at stepX, from recessHeight to mainHeight
      // This is the "B" in the user's image - the vertical face of the step
      wallConfigs.push({
        width: roomDepth,
        height: stepHeight,
        position: [stepX, recessHeight + stepHeight / 2, (backZ + frontZ) / 2],
        rotation: [0, -Math.PI / 2, 0],
        name: 'Step_Wall',
        isStep: true
      });

      // Step_Ceiling (Plane A): Horizontal plane at recessHeight level, covering the recess
      // This goes from stepX to recessX (the width of the step area)
      wallConfigs.push({
        width: recessWidth,
        height: roomDepth,
        position: [(stepX + recessX) / 2, recessHeight, (backZ + frontZ) / 2],
        rotation: [Math.PI / 2, 0, 0],  // Rotate to be horizontal
        name: 'Step_Ceiling',
        isStep: true,
        isHorizontal: true
      });

      // NOTE: Back_Ext and Front_Ext are now consolidated into Wall_Back_Low and Wall_Front_Low above
    }

    // ========== CEILING ==========
    // Main_Ceiling: Horizontal plane at mainHeight covering the main area
    wallConfigs.push({
      width: mainWidth,
      height: roomDepth,
      position: [leftX + mainWidth / 2, mainHeight, (backZ + frontZ) / 2],
      rotation: [Math.PI / 2, 0, 0],  // Rotate to be horizontal
      name: 'Ceiling',
      isHorizontal: true
    });

    // ========== FLOOR ==========
    // Floor: Horizontal plane at Y=0 covering the entire room footprint
    wallConfigs.push({
      width: fullWidth,
      height: roomDepth,
      position: [leftX + fullWidth / 2, 0, (backZ + frontZ) / 2],
      rotation: [-Math.PI / 2, 0, 0],  // Rotate to be horizontal, facing up
      name: 'Floor',
      isHorizontal: true
    });

    return wallConfigs
      .filter(config => !hiddenPlanes?.has(config.name)) // Filter hidden planes
      .map((config, index) => {
        // Create geometry - supports: stepped walls, walls with doors, plain walls
        let geometry: THREE.BufferGeometry;

        if (config.isSteppedWall && config.stepWidth && config.stepHeight && config.recessWidth && config.recessHeight) {
          // Create L-shaped wall geometry for stepped walls
          const shape = new THREE.Shape();
          const fullW = config.stepWidth + config.recessWidth;
          const halfW = fullW / 2;

          if (config.mirrorLShape) {
            // Mirrored L-shape: tall section on RIGHT, short section on LEFT
            // Used for Wall_Front which has 180° rotation
            shape.moveTo(-halfW, 0);                                   // 1. Bottom left
            shape.lineTo(halfW, 0);                                    // 2. Bottom right (full width)
            shape.lineTo(halfW, config.stepHeight);                    // 3. Up to full height (right side - tall)
            shape.lineTo(halfW - config.stepWidth, config.stepHeight); // 4. Left to step position
            shape.lineTo(halfW - config.stepWidth, config.recessHeight); // 5. Down to recess height
            shape.lineTo(-halfW, config.recessHeight);                 // 6. Left to short section top
            shape.closePath();
          } else {
            // Normal L-shape: tall section on LEFT, short section on RIGHT
            shape.moveTo(-halfW, 0);                                    // 1. Bottom left
            shape.lineTo(halfW, 0);                                     // 2. Bottom right (full width)
            shape.lineTo(halfW, config.recessHeight);                   // 3. Up to recess height (right side)
            shape.lineTo(-halfW + config.stepWidth, config.recessHeight); // 4. Left to step position
            shape.lineTo(-halfW + config.stepWidth, config.stepHeight); // 5. Up to full height
            shape.lineTo(-halfW, config.stepHeight);                    // 6. Left to top-left
            shape.closePath();
          }

          geometry = new THREE.ShapeGeometry(shape);
        } else if (config.hasDoor && config.doorWidth && config.doorHeight) {
          // Create wall shape with door cutout
          const shape = new THREE.Shape();
          const halfW = config.width / 2;
          const halfH = config.height / 2;

          // Wall rectangle (centered at origin)
          shape.moveTo(-halfW, -halfH);
          shape.lineTo(halfW, -halfH);
          shape.lineTo(halfW, halfH);
          shape.lineTo(-halfW, halfH);
          shape.closePath();

          // Door hole (positioned from bottom-left of wall)
          const doorPos = (config.doorPosition || 0) * config.width - halfW;
          const doorW = config.doorWidth;
          const doorH = config.doorHeight;

          const doorHole = new THREE.Path();
          doorHole.moveTo(doorPos, -halfH);
          doorHole.lineTo(doorPos + doorW, -halfH);
          doorHole.lineTo(doorPos + doorW, -halfH + doorH);
          doorHole.lineTo(doorPos, -halfH + doorH);
          doorHole.closePath();

          shape.holes.push(doorHole);
          geometry = new THREE.ShapeGeometry(shape);
        } else {
          geometry = new THREE.PlaneGeometry(config.width, config.height);
        }

        const isHovered = hoveredWall === index;
        const isSelected = selectedPlane === config.name;
        // Color priority: selected (purple) > hovered (green) > default (blue)
        const color = isSelected ? '#a855f7' : isHovered ? '#22c55e' : '#3b82f6';

        return (
          <group
            key={config.name}
            position={config.position}
            rotation={new THREE.Euler(...config.rotation)}
          >
            <mesh
              geometry={geometry}
              onPointerOver={(e) => { e.stopPropagation(); setHoveredWall(index); }}
              onPointerOut={(e) => { e.stopPropagation(); setHoveredWall(null); }}
              onClick={(e) => {
                e.stopPropagation();
                // Prevent hitting multiple planes along the same ray
                if (e.nativeEvent) {
                  e.nativeEvent.stopImmediatePropagation();
                }

                // CTRL+click = toggle visibility
                if (e.ctrlKey && onTogglePlane) {
                  onTogglePlane(config.name);
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

                  // Calculate smart candidates for WASD+Space based on plane geometry
                  // Direction is FROM USER PERSPECTIVE (looking at the scene)
                  // A = left, D = right from user's view
                  const candidates: Record<string, THREE.Vector3> = {};

                  // Get room geometry for calculating snap points
                  if (roomGeometry) {
                    const { leftX, stepX, recessX, backZ, frontZ, mainHeight, recessHeight, hasStep } = roomGeometry;

                    // Determine wall orientation from rotation
                    // Y rotation ~= 0 or π → wall is perpendicular to Z (front/back walls)
                    // Y rotation ~= ±π/2 → wall is perpendicular to X (left/right walls)
                    const yRotation = config.rotation[1];
                    const isWallPerpendicularToX = Math.abs(Math.sin(yRotation)) > 0.7; // ~±90°

                    // Determine if point is in recess area
                    const isInRecessArea = hasStep && stepX && point.x > stepX;

                    // W = Up (to ceiling) - always vertical
                    const ceilingY = isInRecessArea ? recessHeight : mainHeight;
                    candidates['w'] = new THREE.Vector3(point.x, ceilingY, point.z);

                    // S = Down (to floor) - always vertical
                    candidates['s'] = new THREE.Vector3(point.x, 0, point.z);

                    if (isWallPerpendicularToX) {
                      // Clicked on LEFT/RIGHT wall → A/D go along Z axis, SPACE goes X
                      // From user perspective: A = towards front (positive Z), D = towards back (negative Z)
                      candidates['a'] = new THREE.Vector3(point.x, point.y, frontZ);
                      candidates['d'] = new THREE.Vector3(point.x, point.y, backZ);
                      // SPACE = opposite wall on X axis
                      const midX = (leftX + recessX) / 2;
                      if (point.x > midX) {
                        candidates[' '] = new THREE.Vector3(leftX, point.y, point.z);
                      } else {
                        const rightTarget = (isInRecessArea && stepX) ? stepX : recessX;
                        candidates[' '] = new THREE.Vector3(rightTarget, point.y, point.z);
                      }
                    } else {
                      // Clicked on FRONT/BACK wall or FLOOR/CEILING → A/D go along X axis, SPACE goes Z
                      // From user perspective: A = towards right wall (positive X), D = towards left wall (negative X)
                      candidates['a'] = new THREE.Vector3(recessX, point.y, point.z);
                      const leftTarget = (isInRecessArea && stepX) ? stepX : leftX;
                      candidates['d'] = new THREE.Vector3(leftTarget, point.y, point.z);
                      // SPACE = opposite wall on Z axis (front/back)
                      const midZ = (frontZ + backZ) / 2;
                      if (point.z > midZ) {
                        candidates[' '] = new THREE.Vector3(point.x, point.y, backZ);
                      } else {
                        candidates[' '] = new THREE.Vector3(point.x, point.y, frontZ);
                      }
                    }
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

            {(isHovered || showLabels) && !config.isHorizontal && (
              <Html
                position={[0, config.height / 2 + 0.3, 0.1]}
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
                    {config.name}
                  </div>
                  <div style={{ color: '#94a3b8' }}>
                    {config.width.toFixed(2)}m × {config.height.toFixed(2)}m
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>
                    {(config.width * config.height).toFixed(1)} m²
                  </div>
                </div>
              </Html>
            )}

            {/* Labels for horizontal planes (Floor, Ceiling) */}
            {(isHovered || showLabels) && config.isHorizontal && (
              <Html
                position={[0, 0.5, 0]}
                center
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                <div style={{
                  background: 'rgba(0, 0, 0, 0.85)',
                  color: config.name === 'Floor' ? '#4ade80' : '#f472b6',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  border: `1px solid ${config.name === 'Floor' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(244, 114, 182, 0.3)'}`,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {config.name}
                  </div>
                  <div style={{ color: '#94a3b8' }}>
                    {config.width.toFixed(2)}m × {config.height.toFixed(2)}m
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>
                    {(config.width * config.height).toFixed(1)} m²
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      });
  }, [roomGeometry, visible, hoveredWall, showLabels, hiddenPlanes, selectedPlane, onTogglePlane]);

  if (!bimData || !visible) return null;

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
