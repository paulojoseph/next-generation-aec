'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls, Edges, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { ViewerStats } from '@/types';

interface SemanticObjectData {
  id: number;
  label: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  size: [number, number, number];
  color: string;
  count: number;
}

interface ViewerSemanticProps {
  jsonUrl: string;
  onLoadingChange: (loading: boolean) => void;
  onStatsUpdate: (stats: ViewerStats) => void;
  selectedObjectId?: number | null;
  onObjectSelect?: (id: number) => void;
}

export function ViewerSemantic({
  jsonUrl,
  onLoadingChange,
  onStatsUpdate,
  selectedObjectId,
  onObjectSelect
}: ViewerSemanticProps) {

  const [objects, setObjects] = useState<SemanticObjectData[]>([]);
  const { camera, controls } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  // Controle para evitar re-posicionar a câmera toda hora
  const [cameraInitialized, setCameraInitialized] = useState(false);

  useEffect(() => {
    async function loadSemanticData() {
      onLoadingChange(true);
      try {
        const res = await fetch(jsonUrl);
        const rawData: SemanticObjectData[] = await res.json();

        // ============================================
        // PROCEDURAL BIM MODE: Clean Closed Box
        // Generates 4 walls from floor dimensions (closed rectangular room)
        // Labels: 0=ceiling, 1=floor, 2=wall
        // ============================================

        // 1. Get floor data (contains room dimensions)
        const originalFloor = rawData.find(o => o.label === 1);

        if (!originalFloor) {
          console.warn('No floor found');
          setObjects(rawData);
          return;
        }

        // 2. Extract room dimensions from floor OBB
        // floor.size[0] = room width (X axis)
        // floor.size[1] = room height (Y axis) - this is the important one!
        // floor.size[2] = room depth (Z axis)
        const roomWidth = originalFloor.size[0];
        const roomHeight = originalFloor.size[1]; // This is the ceiling height from OBB
        const roomDepth = originalFloor.size[2];

        // Floor level at Y=0 (grid level)
        const floorLevel = 0;
        const ceilingLevel = roomHeight;

        // Room bounds (floor is centered at 0,0)
        const halfWidth = roomWidth / 2;
        const halfDepth = roomDepth / 2;

        console.log('🏗️ Room Dimensions:', {
          width: roomWidth.toFixed(2),
          height: roomHeight.toFixed(2),
          depth: roomDepth.toFixed(2)
        });

        // 3. Generate structural elements
        const wallThickness = 0.15; // 15cm walls (realistic)
        const wallCenterY = floorLevel + roomHeight / 2;
        const identityQuat: [number, number, number, number] = [0, 0, 0, 1];

        // Floor slab (thin, at Y=0)
        const floor: SemanticObjectData = {
          id: 10000,
          label: 1,
          position: [0, floorLevel, 0],
          rotation: identityQuat,
          size: [roomWidth, 0.1, roomDepth],
          color: "#424242",
          count: 0
        };

        // Ceiling slab (thin, at top)
        const ceiling: SemanticObjectData = {
          id: 10001,
          label: 0,
          position: [0, ceilingLevel, 0],
          rotation: identityQuat,
          size: [roomWidth, 0.1, roomDepth],
          color: "#E0E0E0",
          count: 0
        };

        // 4 Walls forming closed box
        const walls: SemanticObjectData[] = [
          // NORTH wall (positive Z edge)
          {
            id: 10002,
            label: 2,
            position: [0, wallCenterY, halfDepth + wallThickness / 2],
            rotation: identityQuat,
            size: [roomWidth + wallThickness * 2, roomHeight, wallThickness],
            color: "#F5F5F5",
            count: 0
          },
          // SOUTH wall (negative Z edge)
          {
            id: 10003,
            label: 2,
            position: [0, wallCenterY, -halfDepth - wallThickness / 2],
            rotation: identityQuat,
            size: [roomWidth + wallThickness * 2, roomHeight, wallThickness],
            color: "#F5F5F5",
            count: 0
          },
          // EAST wall (positive X edge)
          {
            id: 10004,
            label: 2,
            position: [halfWidth + wallThickness / 2, wallCenterY, 0],
            rotation: identityQuat,
            size: [wallThickness, roomHeight, roomDepth],
            color: "#EEEEEE",
            count: 0
          },
          // WEST wall (negative X edge)
          {
            id: 10005,
            label: 2,
            position: [-halfWidth - wallThickness / 2, wallCenterY, 0],
            rotation: identityQuat,
            size: [wallThickness, roomHeight, roomDepth],
            color: "#EEEEEE",
            count: 0
          }
        ];

        const alignedData = [floor, ceiling, ...walls];

        console.log('🧱 Generated procedural room: floor + ceiling + 4 walls (closed box)');

        setObjects(alignedData);

        // Stats
        const floorArea = roomWidth * roomDepth;
        const volume = floorArea * roomHeight;

        onStatsUpdate({
          points: 0,
          fps: 60,
          drawCalls: alignedData.length,
          memory: Math.round(JSON.stringify(alignedData).length / 1024),
          width: roomWidth,
          height: roomHeight,
          depth: roomDepth,
          area: floorArea,
          volume: volume
        });

      } catch (e) {
        console.error("Error loading semantic boxes", e);
      } finally {
        onLoadingChange(false);
      }
    }
    loadSemanticData();
  }, [jsonUrl, onLoadingChange, onStatsUpdate]);

  // CONFIGURAÇÃO DE CÂMERA FIXA (Arquitetura)
  useEffect(() => {
    if (objects.length > 0 && !cameraInitialized) {
      // Câmera Isométrica Fixa
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);

      // Foca o OrbitControls no Zero Absoluto
      if (controls) {
        // @ts-ignore
        controls.target.set(0, 0, 0);
        // @ts-ignore
        controls.update();
      }

      setCameraInitialized(true);
    }
  }, [objects, camera, controls, cameraInitialized]);

  return (
    <>
      {/* Iluminação de Estúdio para ver bem as formas */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.5} />

      <group ref={groupRef}>
        {objects.map((obj) => {
          const isSelected = selectedObjectId === obj.id;

          return (
            <mesh
              key={obj.id}
              position={obj.position}
              quaternion={new THREE.Quaternion(...obj.rotation)}
              onClick={(e) => {
                e.stopPropagation();
                onObjectSelect?.(obj.id);
              }}
              castShadow
              receiveShadow
            >
              <boxGeometry args={obj.size} />
              <meshStandardMaterial
                color={isSelected ? '#ef4444' : obj.color}
                roughness={0.2}
                metalness={0.1}
                transparent
                opacity={isSelected ? 0.9 : 0.8}
                // Importante: false para evitar z-fighting em caixas sobrepostas
                depthWrite={false}
              />

              {/* Wireframe elegante */}
              <Edges
                color={isSelected ? "white" : "black"}
                threshold={15}
                opacity={0.3}
                transparent
              />

              {isSelected && (
                <Billboard
                  position={[0, obj.size[1] / 2 + 0.5, 0]}
                  follow={true}
                >
                  <Text
                    fontSize={0.3}
                    color="white"
                    outlineWidth={0.02}
                    outlineColor="black"
                    anchorX="center"
                    anchorY="bottom"
                  >
                    {`ID: ${obj.id}`}
                  </Text>
                </Billboard>
              )}
            </mesh>
          );
        })}
      </group>

      {/* Grid no chão (Y=0) para referência */}
      <gridHelper
        args={[30, 30, '#444444', '#222222']}
        position={[0, -0.01, 0]}
      />

      <OrbitControls makeDefault target={[0, 0, 0]} />
    </>
  );
}