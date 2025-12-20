import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { HoverInfo, SceneObject } from '@/types';

// DICIONÁRIO BIM
const CLASS_LABELS: Record<number, string> = {
  0: 'Ceiling', 1: 'Floor', 2: 'Wall', 3: 'Beam', 4: 'Column',
  5: 'Window', 6: 'Door', 7: 'Table', 8: 'Chair', 9: 'Sofa',
  10: 'Bookcase', 11: 'Board', 12: 'Clutter', 13: 'Stairs'
};

export function useViewerInteraction(
  bufferGeometry: THREE.BufferGeometry | null,
  isMeasuring: boolean,
  onHoverUpdate?: (info: HoverInfo | null) => void,
  onObjectSelect?: (id: number) => void,
  sceneObjects?: SceneObject[]  // Added for object name lookup
) {
  const { camera, raycaster, mouse } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  
  // Build objectId -> object name lookup map
  const objectNameMap = useMemo(() => {
    const map = new Map<number, string>();
    if (sceneObjects && sceneObjects.length > 0) {
      sceneObjects.forEach(obj => {
        map.set(obj.id, obj.name);
      });
    }
    return map;
  }, [sceneObjects]);
  
  // Hover State
  const lastHoverLabel = useRef<string | null>(null);

  // Measure State
  const [measurementPoints, setMeasurementPoints] = useState<THREE.Vector3[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [smartCandidates, setSmartCandidates] = useState<Record<string, THREE.Vector3>>({});
  const isDragging = useRef(false);
  const pointerDownPos = useRef(new THREE.Vector2());

  // 1. Hover Loop - Heavily Throttled to prevent freezing
  const lastMousePos = useRef({ x: 0, y: 0 });
  
  useFrame((state) => {
    if (!pointsRef.current || !bufferGeometry || !onHoverUpdate) return;

    // Skip raycasting if mouse hasn't moved significantly
    const mouseMoved = Math.abs(mouse.x - lastMousePos.current.x) > 0.01 || 
                       Math.abs(mouse.y - lastMousePos.current.y) > 0.01;
    if (!mouseMoved) return;
    
    // Throttle: Only raycast every 250ms (4fps) - aggressive to prevent freezing
    const time = state.clock.getElapsedTime();
    if (time - (pointsRef.current.userData.lastRaycast || 0) < 0.25) return;
    pointsRef.current.userData.lastRaycast = time;
    lastMousePos.current = { x: mouse.x, y: mouse.y };
    
    // Set a small threshold for point picking to reduce intersection count
    if (raycaster.params.Points) {
      raycaster.params.Points.threshold = 0.02;
    }
    
    raycaster.setFromCamera(mouse, camera);
    
    // Use firstHitOnly to minimize computation
    raycaster.firstHitOnly = true;
    const intersects = raycaster.intersectObject(pointsRef.current, false);
    raycaster.firstHitOnly = false;

    if (intersects.length > 0) {
      const hit = intersects[0];
      const p = hit.point;
      let labelText = "Unclassified";
      const labelAttr = bufferGeometry.attributes.label;
      const idAttr = bufferGeometry.attributes.objectId;

      if (hit.index !== undefined) {
        let className = 'Unknown';
        let objectName = '';
        
        if (labelAttr) {
          const classId = labelAttr.getX(hit.index);
          className = CLASS_LABELS[classId] || `Class #${classId}`;
        }
        
        if (idAttr) {
          const objectId = idAttr.getX(hit.index);
          // Look up real object name from sceneObjects
          const realName = objectNameMap.get(objectId);
          objectName = realName || `object_${objectId}`;
        }
        
        // Format: "chair_5 (Chair)" - name first, then class
        labelText = objectName ? `${objectName} (${className})` : className;
      }

      if (lastHoverLabel.current !== labelText) {
        lastHoverLabel.current = labelText;
        onHoverUpdate({ x: p.x, y: p.y, z: p.z, label: labelText });
      }
    } else {
      if (lastHoverLabel.current !== null) {
        lastHoverLabel.current = null;
        onHoverUpdate(null);
      }
    }
  });

  // 2. Scan Direction Helper - Projects laser to find opposite surfaces
  const scanDirection = (origin: THREE.Vector3, dir: THREE.Vector3, ignoreId: number, ignoreClass: number): THREE.Vector3 | null => {
    if (!pointsRef.current) return null;
    
    // CRITICAL FIX: Offset the origin ALONG the ray direction to escape the surface
    // This prevents the raycast from immediately hitting the same surface we clicked on
    const offsetOrigin = origin.clone().add(dir.clone().multiplyScalar(0.2));
    
    // Create raycaster with much longer range for room-scale measurements
    const ray = new THREE.Raycaster(offsetOrigin, dir.normalize(), 0, 30);
    
    // Use a very small threshold to reduce noise interference
    if (ray.params.Points) ray.params.Points.threshold = 0.03;

    const hits = ray.intersectObject(pointsRef.current);

    for (const hit of hits) {
      // Ignore hits that are too close (within 1m) - these are likely noise or same surface
      if (hit.distance < 1.0) continue;
      
      let hitOid = -1;
      let hitClass = -1;
      if (hit.index !== undefined && bufferGeometry) {
        if (bufferGeometry.attributes.objectId) hitOid = bufferGeometry.attributes.objectId.getX(hit.index);
        if (bufferGeometry.attributes.label) hitClass = bufferGeometry.attributes.label.getX(hit.index);
      }

      // Skip points belonging to the same object we clicked on
      if (hitOid === ignoreId && ignoreId !== -1) continue;
      
      // For structural elements (walls, floors, ceilings - classes 0,1,2), require greater distance
      // to avoid hitting the same structural plane
      if (hitClass === ignoreClass && ignoreClass !== -1 && hitClass <= 2) {
        if (hit.distance < 2.0) continue;
      }
      
      return hit.point;
    }
    return null;
  };

  // 3. Handle Click
  const onPointerDown = (e: any) => {
    isDragging.current = false;
    pointerDownPos.current.set(e.clientX, e.clientY);
  };

  const onPointerUp = (e: any) => {
    const dist = Math.sqrt(Math.pow(e.clientX - pointerDownPos.current.x, 2) + Math.pow(e.clientY - pointerDownPos.current.y, 2));
    if (dist > 5) { isDragging.current = true; return; }
    isDragging.current = false;
    handleClick(e);
  };
  
  const handleClick = (e: any) => {
    if (!e.point) return;

    if (isMeasuring || e.shiftKey) {
      e.stopPropagation();
      const p = e.point.clone();
      // Unsink
      const nudge = camera.position.clone().sub(p).normalize().multiplyScalar(0.05);
      p.add(nudge);

      if (measurementPoints.length === 0 || measurementPoints.length === 2) {
        setMeasurementPoints([p]);
        setDistance(null);

        let originId = -1;
        let originClass = -1;
        if (e.index !== undefined && bufferGeometry) {
          if (bufferGeometry.attributes.objectId) originId = bufferGeometry.attributes.objectId.getX(e.index);
          if (bufferGeometry.attributes.label) originClass = bufferGeometry.attributes.label.getX(e.index);
        }

        // Smart Candidates Logic - Using numpad 1-5 to avoid conflict with camera navigation
        const viewDir = new THREE.Vector3().subVectors(p, camera.position);
        viewDir.y = 0; viewDir.normalize();

        let mainAxis = new THREE.Vector3(0, 0, -1);
        if (Math.abs(viewDir.x) > Math.abs(viewDir.z)) mainAxis.set(Math.sign(viewDir.x), 0, 0);
        else mainAxis.set(0, 0, Math.sign(viewDir.z));

        const opposite = mainAxis.clone().negate();
        const leftDir = new THREE.Vector3(-mainAxis.z, 0, mainAxis.x);
        const rightDir = new THREE.Vector3(mainAxis.z, 0, -mainAxis.x);

        const candidates: Record<string, THREE.Vector3> = {};
        
        // Changed from WASD+Space to 1-5 to avoid conflict with camera movement
        const up = scanDirection(p, new THREE.Vector3(0, 1, 0), originId, originClass);
        if (up) candidates['1'] = up;  // Was 'w' (up/ceiling)

        const down = scanDirection(p, new THREE.Vector3(0, -1, 0), originId, originClass);
        if (down) candidates['2'] = down;  // Was 's' (down/floor)

        const left = scanDirection(p, leftDir, originId, originClass);
        if (left) candidates['3'] = left;  // Was 'a' (left wall)

        const right = scanDirection(p, rightDir, originId, originClass);
        if (right) candidates['4'] = right;  // Was 'd' (right wall)

        const fwd = scanDirection(p, opposite, originId, originClass);
        if (fwd) candidates['5'] = fwd;  // Was Space (forward/opposite wall)

        setSmartCandidates(candidates);

      } else if (measurementPoints.length === 1) {
        setMeasurementPoints(prev => [...prev, p]);
        setSmartCandidates({});
      }
      return;
    }

    if (e.index !== undefined && bufferGeometry && bufferGeometry.attributes.objectId && onObjectSelect) {
      e.stopPropagation();
      const id = bufferGeometry.attributes.objectId.getX(e.index);
      onObjectSelect(id);
    }
  };

  // Keyboard for Smart Snap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (Object.keys(smartCandidates).length === 0) return;
      const k = e.key.toLowerCase();
      if (smartCandidates[k]) {
        setMeasurementPoints(prev => {
          if (prev.length === 1) return [...prev, smartCandidates[k]];
          return prev;
        });
        setSmartCandidates({});
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [smartCandidates]);

  // Reset measure logic when component mounts/unmounts or measuring stops
  useEffect(() => {
    if (!isMeasuring) {
      setMeasurementPoints([]);
      setSmartCandidates({});
      setDistance(null);
    }
  }, [isMeasuring]);

  return {
    pointsRef,
    measurementPoints,
    distance,
    smartCandidates,
    onPointerDown,
    onPointerUp
  };
}
