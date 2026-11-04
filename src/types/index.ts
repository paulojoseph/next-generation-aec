/**
 * @fileoverview Application-Wide Type Definitions
 *
 * Centralized type exports for UI components and data structures.
 * Engine-internal types are defined in src/engine/core/types.ts.
 */

import * as THREE from 'three';

// ============================================================================
// DATA TYPES
// ============================================================================

/**
 * Manifest entry for a room in the dataset.
 */
export interface ManifestEntry {
  name: string;
  file: string;
  objects?: string;
}

/**
 * Complete manifest structure mapping areas to rooms.
 */
export type Manifest = Record<string, ManifestEntry[]>;

/**
 * Scene object metadata from BIM annotations.
 */
export interface SceneObject {
  /** Unique object identifier */
  id: number;
  /** Human-readable name (e.g., 'table_1', 'chair_3') */
  name: string;
  /** Semantic class (e.g., 'Table', 'Chair', 'Wall') */
  class: string;
  /** Instance count within the class */
  count: number;
}

// ============================================================================
// VIEWER TYPES
// ============================================================================

/**
 * Runtime statistics for the 3D viewer.
 * Displayed in the telemetry panel.
 */
export interface ViewerStats {
  /** Room width in meters */
  width: number;
  /** Room height in meters (floor to ceiling) */
  height: number;
  /** Room depth in meters */
  depth: number;
  /** Floor area in square meters */
  area: number;
  /** Volume in cubic meters */
  volume: number;
  /** Rendered point count */
  points: number;
  /** Current frames per second */
  fps?: number;
  /** WebGL draw calls */
  drawCalls: number;
  /** Cached data size in MB */
  memory?: number;
}

/**
 * Hover tooltip information.
 */
export interface HoverInfo {
  /** World X coordinate */
  x: number;
  /** World Y coordinate */
  y: number;
  /** World Z coordinate */
  z: number;
  /** Display label (object name + class) */
  label: string;
}

/**
 * Custom LiDAR shader uniforms.
 */
export interface LidarMaterialUniforms {
  uTime: number;
  uScanlineY: number;
  uScanWidth: number;
  uCutoff: number;
}

/**
 * Model metrics from point cloud analysis.
 */
export interface ModelMetrics {
  /** Room height (robust ceiling detection) */
  height: number;
  /** Geometric center of the model */
  center: THREE.Vector3;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * BIM plane metadata for sidebar display.
 * Built from bim_data.json by src/features/bim/planes.ts (PlaneSpec).
 */
export interface PlaneInfo {
  name: string;
  width: number;
  height: number;
  isHorizontal?: boolean;
}

/**
 * View mode for camera positioning.
 */
export type ViewMode = 'perspective' | 'top';

/**
 * Application-level loading state.
 */
export interface LoadingState {
  /** Currently loading data */
  isLoading: boolean;
  /** Loading progress (0-100) */
  progress: number;
  /** Current operation description */
  message: string;
}

/**
 * Keyboard shortcut definition.
 */
export interface KeyboardShortcut {
  key: string;
  description: string;
  category: 'navigation' | 'tools' | 'ui';
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * BIM class labels from S3DIS dataset.
 */
export const CLASS_LABELS: Record<number, string> = {
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
