'use client';

import { useGLTF, Stage, OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect } from 'react';
import * as THREE from 'three';

interface ViewerMeshProps {
  fileUrl: string;
  onLoadingChange: (loading: boolean) => void;
}

export function ViewerMesh({ fileUrl, onLoadingChange }: ViewerMeshProps) {
  const { scene } = useGLTF(fileUrl);
  const { camera } = useThree();

  // --- ENGENHARIA VISUAL ---
  // Percorre todos os objetos da malha e força configurações de Arquitetura
  useLayoutEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const material = mesh.material as THREE.MeshStandardMaterial;

          // 1. DOUBLE SIDE: Resolve o problema de paredes invisíveis por trás
          material.side = THREE.DoubleSide;
          
          // 2. FLAT SHADING: Dá um look mais "low poly" técnico, evita sombras arredondadas estranhas
          material.flatShading = true; 
          
          // 3. VERTEX COLORS: Habilita as cores que vamos gerar no Python
          material.vertexColors = true;
          
          // 4. MELHORIA DE MATERIAL
          material.roughness = 0.8; // Paredes não são espelhos
          material.metalness = 0.1;
          
          material.needsUpdate = true;
        }
      });
      onLoadingChange(false);
    }
  }, [scene, onLoadingChange]);

  useEffect(() => {
    if (scene) {
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      camera.position.set(center.x + size.x, center.y + size.y, center.z + size.z);
      camera.lookAt(center);
    }
  }, [scene, camera]);

  return (
    <>
      {/* Ambiente de iluminação neutro para engenharia */}
      <Stage intensity={0.8} environment="city" adjustCamera={false} shadows={false}>
        <primitive object={scene} />
      </Stage>
      <OrbitControls makeDefault />
    </>
  );
}