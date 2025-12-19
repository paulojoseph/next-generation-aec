/**
 * @fileoverview Scene Engine - Core 3D Engine Controller
 *
 * Orchestrates the lifecycle of the 3D visualization independent of React.
 * This separation enables:
 * - Testability without React testing utilities
 * - Performance optimization without React re-renders
 * - Clean state management through events
 *
 * Architecture: Command pattern for interactions, Observer pattern for state.
 * The engine owns all Three.js resources and exposes a minimal event-based API.
 */

import * as THREE from 'three';
import { EventEmitter, type EngineEvents } from './core/EventEmitter';
import { PLYStreamLoader } from './loaders/PLYStreamLoader';
import { PointCloudRenderer } from './renderers/PointCloudRenderer';
import type {
  PointCloudConfig,
  PointCloudBounds,
  ModelMetrics,
  EngineStats,
  BIM_CLASS_LABELS,
} from './core/types';

/**
 * SceneEngine configuration options.
 */
export interface SceneEngineConfig {
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * SceneEngine - Decoupled 3D engine for LiDAR visualization.
 *
 * Manages point cloud loading, rendering, and interaction without
 * React lifecycle dependencies. Communicates state changes through
 * a type-safe event emitter.
 *
 * @example
 * ```ts
 * const engine = new SceneEngine();
 *
 * // Subscribe to events
 * engine.events.on('stats:update', (stats) => {
 *   updateUI(stats);
 * });
 *
 * // Load point cloud
 * await engine.loadPointCloud({
 *   fileUrl: 'https://cdn.example.com/scan.ply',
 *   qualityPreset: 10,
 *   pointSize: 0.035,
 *   useSplatting: false,
 *   ceilingCut: 10.0,
 *   opacity: 1.0,
 * });
 *
 * // Get Three.js objects for scene addition
 * const pointCloud = engine.getPointCloudObject();
 * scene.add(pointCloud);
 * ```
 */
export class SceneEngine {
  /** Event emitter for state changes */
  readonly events: EventEmitter<EngineEvents>;

  private loader: PLYStreamLoader;
  private pointCloudRenderer: PointCloudRenderer;
  private rawDataCache: ArrayBuffer | null = null;
  private currentConfig: PointCloudConfig | null = null;
  private bounds: PointCloudBounds | null = null;
  private metrics: ModelMetrics | null = null;
  private debug: boolean;

  // FPS tracking
  private frameCount = 0;
  private lastFpsTime = 0;
  private currentFps = 0;

  constructor(config: SceneEngineConfig = {}) {
    this.events = new EventEmitter();
    this.loader = new PLYStreamLoader();
    this.pointCloudRenderer = new PointCloudRenderer();
    this.debug = config.debug ?? false;
  }

  /**
   * Load a point cloud from URL.
   * Caches raw data for quality switching without re-download.
   */
  async loadPointCloud(config: PointCloudConfig): Promise<void> {
    this.currentConfig = config;
    this.pointCloudRenderer.configure(config);

    try {
      if (this.debug) {
        console.log(`[SceneEngine] Loading: ${config.fileUrl} (1/${config.qualityPreset})`);
      }

      const result = await this.loader.load(
        config.fileUrl,
        { skipRate: config.qualityPreset },
        (loaded, total) => {
          this.events.emit('pointcloud:progress', { loaded, total });
        }
      );

      this.bounds = result.bounds;
      this.metrics = result.metrics;

      this.pointCloudRenderer.setGeometry(result.geometry);

      this.events.emit('pointcloud:loaded', {
        pointCount: result.pointCount,
        bounds: result.bounds,
      });

      this.emitStats(result.pointCount);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.events.emit('pointcloud:error', { message, code: 'LOAD_FAILED' });
      throw error;
    }
  }

  /**
   * Re-process cached data with new quality setting.
   * Avoids network request when switching LOD presets.
   */
  reprocessWithQuality(qualityPreset: number): void {
    if (!this.rawDataCache || !this.currentConfig) {
      console.warn('[SceneEngine] No cached data available for reprocessing');
      return;
    }

    const result = this.loader.parseBuffer(this.rawDataCache, qualityPreset);

    this.bounds = result.bounds;
    this.metrics = result.metrics;

    this.pointCloudRenderer.setGeometry(result.geometry);
    this.emitStats(result.pointCount);
  }

  /**
   * Update rendering configuration.
   */
  updateConfig(config: Partial<PointCloudConfig>): void {
    this.pointCloudRenderer.configure(config);
    if (this.currentConfig) {
      this.currentConfig = { ...this.currentConfig, ...config };
    }
  }

  /**
   * Get the Three.js Points object for scene addition.
   */
  getPointCloudObject(): THREE.Points | null {
    return this.pointCloudRenderer.getObject();
  }

  /**
   * Get calculated point cloud bounds.
   */
  getBounds(): PointCloudBounds | null {
    return this.bounds;
  }

  /**
   * Get model metrics (center, height, dimensions).
   */
  getMetrics(): ModelMetrics | null {
    return this.metrics;
  }

  /**
   * Set the currently selected object for highlighting.
   */
  setSelectedObject(objectId: number | null): void {
    this.pointCloudRenderer.setSelectedObject(objectId);
    this.events.emit('selection:change', { objectId });
  }

  /**
   * Update per-frame state.
   * Call from animation loop for smooth animations and FPS tracking.
   */
  update(elapsedTime: number): void {
    this.pointCloudRenderer.update(elapsedTime);
    this.updateFps(elapsedTime);
  }

  /**
   * Release all resources.
   */
  dispose(): void {
    this.loader.abort();
    this.pointCloudRenderer.dispose();
    this.events.off();
    this.rawDataCache = null;
    this.currentConfig = null;
    this.bounds = null;
    this.metrics = null;
  }

  /**
   * Track and emit FPS statistics.
   */
  private updateFps(elapsedTime: number): void {
    this.frameCount++;
    const elapsed = elapsedTime - this.lastFpsTime;

    if (elapsed >= 1.0) {
      this.currentFps = Math.round(this.frameCount / elapsed);
      this.frameCount = 0;
      this.lastFpsTime = elapsedTime;

      if (this.metrics) {
        this.emitStats(
          this.pointCloudRenderer.getObject()?.geometry.attributes.position?.count ?? 0
        );
      }
    }
  }

  /**
   * Emit current statistics to subscribers.
   */
  private emitStats(pointCount: number): void {
    if (!this.metrics) return;

    const { width, height, depth } = this.metrics.dimensions;

    this.events.emit('stats:update', {
      points: pointCount,
      fps: this.currentFps,
      drawCalls: 1,
      memory: Math.round((this.rawDataCache?.byteLength ?? 0) / 1024 / 1024),
      width,
      height,
      depth,
      area: width * depth,
      volume: width * height * depth,
    });
  }
}

// Re-export types for convenience
export type { PointCloudConfig, PointCloudBounds, ModelMetrics, EngineStats };
