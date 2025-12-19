/**
 * @fileoverview Engine Core Types
 *
 * Centralized type definitions for the 3D engine layer.
 * These types are engine-internal and distinct from React component props.
 */

import type * as THREE from 'three';

/**
 * Configuration for point cloud rendering.
 * Immutable after initialization to prevent mid-render mutations.
 */
export interface PointCloudConfig {
  /** URL to binary PLY file */
  readonly fileUrl: string;
  /** Decimation factor (1 = full, 10 = 1/10th of points) */
  readonly qualityPreset: number;
  /** Point size in world units (meters) */
  readonly pointSize: number;
  /** Enable soft splat rendering */
  readonly useSplatting: boolean;
  /** Ceiling clipping plane height */
  readonly ceilingCut: number;
  /** Opacity [0-1] */
  readonly opacity: number;
}

/**
 * Robust bounds calculated from percentile analysis.
 * Outliers are filtered using 1st/99th percentile thresholds.
 */
export interface PointCloudBounds {
  /** Robust floor Y (1st percentile, after centering = 0) */
  floor: number;
  /** Robust ceiling Y (99th percentile) */
  ceiling: number;
  /** Original X center for coordinate transforms */
  centerX: number;
  /** Original Z center for coordinate transforms */
  centerZ: number;
  /** Raw floor before centering */
  rawFloor: number;
  /** Raw ceiling before centering */
  rawCeiling: number;
}

/**
 * Parsed result from binary PLY processing.
 */
export interface ParsedPointCloud {
  geometry: THREE.BufferGeometry;
  bounds: PointCloudBounds;
  metrics: ModelMetrics;
  pointCount: number;
}

/**
 * Spatial metrics derived from point cloud analysis.
 */
export interface ModelMetrics {
  /** Room height based on robust ceiling detection */
  height: number;
  /** Geometric center of the point cloud */
  center: THREE.Vector3;
  /** Bounding box dimensions */
  dimensions: { width: number; height: number; depth: number };
}

/**
 * Runtime statistics for performance monitoring.
 */
export interface EngineStats {
  /** Current frames per second */
  fps: number;
  /** Rendered point count (after decimation) */
  pointCount: number;
  /** WebGL draw calls per frame */
  drawCalls: number;
  /** Estimated GPU memory usage (MB) */
  memoryMB: number;
  /** Point cloud dimensions */
  dimensions: {
    width: number;
    height: number;
    depth: number;
    area: number;
    volume: number;
  };
}

/**
 * Hover intersection result.
 */
export interface HoverResult {
  point: THREE.Vector3;
  objectId: number;
  classId: number;
  objectName: string;
  className: string;
}

/**
 * Measurement state machine states.
 */
export type MeasurementState = 'idle' | 'origin_selected' | 'complete';

/**
 * Measurement result.
 */
export interface MeasurementResult {
  origin: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
  axis: 'x' | 'y' | 'z' | 'diagonal';
}

/**
 * BIM class labels from S3DIS dataset.
 */
export const BIM_CLASS_LABELS: Record<number, string> = {
  0: 'Ceiling',
  1: 'Floor',
  2: 'Wall',
  3: 'Beam',
  4: 'Column',
  5: 'Window',
  6: 'Door',
  7: 'Table',
  8: 'Chair',
  9: 'Sofa',
  10: 'Bookcase',
  11: 'Board',
  12: 'Clutter',
  13: 'Stairs',
} as const;
