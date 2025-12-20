import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';

export function useCameraNavigation(movementSpeed: number, isLocked: boolean) {
  const { camera, controls } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const onUp = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useFrame((state, delta) => {
    if (isLocked) return;

    const speed = movementSpeed * delta;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;

    if (forward.lengthSq() > 0.001) forward.normalize();
    else forward.set(0, 0, -1);

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();
    if (keys.current['w']) move.add(forward);
    if (keys.current['s']) move.sub(forward);
    if (keys.current['d']) move.add(right);
    if (keys.current['a']) move.sub(right);
    if (keys.current['q']) move.y -= 1;  // Q descends
    if (keys.current['e']) move.y += 1;  // E ascends

    if (move.length() > 0) {
      move.normalize().multiplyScalar(speed);
      camera.position.add(move);
      // @ts-ignore
      if (controls && controls.target) {
        // @ts-ignore
        controls.target.add(move);
      }
    }
  });
}
