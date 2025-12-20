import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';
import * as THREE from 'three';

export const LidarMaterialImpl = shaderMaterial(
  {
    uTime: 0,
    uScanlineY: -1000,
    uScanWidth: 0.0,
    uCutoff: 100.0,
    uSelectedId: -1,
  },
  // Vertex Shader
  `
    varying float vHeight;
    varying vec3 vColor;
    varying float vObjectId;
    attribute vec3 color;
    attribute float objectId;
    
    void main() {
      vHeight = position.y;
      vColor = color;
      vObjectId = objectId; // Pass objectId to fragment
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = 400.0 / -mvPosition.z; 
    }
  `,
  // Fragment Shader
  `
    uniform float uCutoff;
    uniform float uSelectedId;
    uniform float uTime;
    
    varying float vHeight;
    varying vec3 vColor;
    varying float vObjectId;
    
    void main() {
      if (vHeight > uCutoff) discard;
      
      vec2 coord = gl_PointCoord - vec2(0.5);
      if (length(coord) > 0.5) discard;
      
      vec3 finalColor = vColor;
      
      // Highlight Logic
      if (abs(vObjectId - uSelectedId) < 0.1) {
          float pulse = (sin(uTime * 3.0) + 1.0) * 0.5; 
          finalColor = mix(finalColor, vec3(1.0, 0.2, 0.2), 0.7 + pulse * 0.3);
      }

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
);

extend({ LidarMaterial: LidarMaterialImpl });
