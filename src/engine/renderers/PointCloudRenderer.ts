/**
 * @fileoverview Point Cloud Renderer
 *
 * Specialized renderer for LiDAR point cloud visualization.
 * Manages shader compilation, material updates, and GPU memory.
 *
 * Architecture Decisions:
 * - Uses THREE.Points for efficient point rendering
 * - Custom shader injection for object selection highlighting
 * - Clipping planes for ceiling slice visualization
 * - Splat texture for soft point rendering (optional)
 */

import * as THREE from 'three';
import type { PointCloudConfig } from '../core/types';

/**
 * Creates a radial gradient texture for soft splat rendering.
 * Uses canvas 2D for texture generation to avoid external dependencies.
 */
function createSplatTexture(size = 64): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Shader uniforms for selection highlighting and animation.
 */
interface PointCloudUniforms {
  uSelectedId: { value: number };
  uTime: { value: number };
}

/**
 * PointCloudRenderer - GPU-optimized point cloud visualization.
 *
 * Handles material creation, shader injection for selection highlighting,
 * and efficient geometry updates. Designed for real-time interaction
 * with million-point datasets.
 *
 * @example
 * ```ts
 * const renderer = new PointCloudRenderer();
 *
 * // Set geometry
 * renderer.setGeometry(pointCloudGeometry);
 *
 * // Add to scene
 * scene.add(renderer.getObject());
 *
 * // Update each frame
 * renderer.update(elapsedTime);
 *
 * // Highlight selected object
 * renderer.setSelectedObject(42);
 * ```
 */
export class PointCloudRenderer {
  private points: THREE.Points | null = null;
  private material: THREE.PointsMaterial | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private splatTexture: THREE.Texture;
  private uniforms: PointCloudUniforms;
  private clippingPlanes: THREE.Plane[] = [];

  constructor() {
    this.splatTexture = createSplatTexture();
    this.uniforms = {
      uSelectedId: { value: -1 },
      uTime: { value: 0 },
    };
  }

  /**
   * Configure rendering parameters.
   * Call before setGeometry for initial setup, or anytime to update appearance.
   */
  configure(config: Partial<PointCloudConfig>): void {
    if (!this.material) {
      this.createMaterial(config);
      return;
    }

    if (config.pointSize !== undefined) {
      this.material.size = config.pointSize;
    }

    if (config.opacity !== undefined) {
      this.material.opacity = config.opacity;
    }

    if (config.useSplatting !== undefined) {
      this.material.map = config.useSplatting ? this.splatTexture : null;
      this.material.alphaTest = config.useSplatting ? 0.01 : 0.5;
      this.material.needsUpdate = true;
    }

    if (config.ceilingCut !== undefined) {
      this.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(0, -1, 0), config.ceilingCut)
      ];
      this.material.clippingPlanes = this.clippingPlanes;
    }
  }

  /**
   * Set or replace the point cloud geometry.
   * Disposes previous geometry to prevent memory leaks.
   */
  setGeometry(geometry: THREE.BufferGeometry): void {
    if (this.geometry) {
      this.geometry.dispose();
    }

    this.geometry = geometry;

    if (!this.material) {
      this.createMaterial({});
    }

    if (!this.points) {
      this.points = new THREE.Points(geometry, this.material!);
      this.points.frustumCulled = false;
    } else {
      this.points.geometry = geometry;
    }
  }

  /**
   * Get the Three.js object for scene addition.
   */
  getObject(): THREE.Points | null {
    return this.points;
  }

  /**
   * Update per-frame uniforms.
   * Call from animation loop for selection pulse effect.
   */
  update(elapsedTime: number): void {
    this.uniforms.uTime.value = elapsedTime;
  }

  /**
   * Set the currently selected object ID for highlighting.
   */
  setSelectedObject(objectId: number | null): void {
    this.uniforms.uSelectedId.value = objectId ?? -1;
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    this.geometry?.dispose();
    this.material?.dispose();
    this.splatTexture.dispose();
    this.geometry = null;
    this.material = null;
    this.points = null;
  }

  /**
   * Create material with custom shader injection for selection highlighting.
   */
  private createMaterial(config: Partial<PointCloudConfig>): void {
    const uniforms = this.uniforms;

    this.material = new THREE.PointsMaterial({
      vertexColors: true,
      size: config.pointSize ?? 0.035,
      sizeAttenuation: true,
      map: config.useSplatting ? this.splatTexture : null,
      alphaTest: config.useSplatting ? 0.01 : 0.5,
      transparent: true,
      opacity: config.opacity ?? 1.0,
      depthWrite: true,
      clippingPlanes: this.clippingPlanes,
      clipShadows: true,
    });

    // Inject custom shader code for selection highlighting
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSelectedId = uniforms.uSelectedId;
      shader.uniforms.uTime = uniforms.uTime;

      // Vertex shader: pass objectId to fragment
      shader.vertexShader = `
        attribute float objectId;
        varying float vObjectId;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vObjectId = objectId;`
      );

      // Fragment shader: highlight selected objects with pulse effect
      shader.fragmentShader = `
        uniform float uSelectedId;
        uniform float uTime;
        varying float vObjectId;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (abs(vObjectId - uSelectedId) < 0.1) {
          float pulse = (sin(uTime * 3.0) + 1.0) * 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.2, 0.2), 0.7 + pulse * 0.3);
          diffuseColor.a = 1.0;
        }`
      );
    };
  }
}
