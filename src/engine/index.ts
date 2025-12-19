/**
 * @fileoverview 3D Engine Entry Point
 *
 * Unified export for the decoupled 3D engine layer.
 * This engine operates independently of React and communicates
 * through events for loose coupling.
 */

export { SceneEngine, type SceneEngineConfig } from './SceneEngine';
export { PLYStreamLoader, type LoadProgressCallback } from './loaders/PLYStreamLoader';
export { PointCloudRenderer } from './renderers/PointCloudRenderer';
export { EventEmitter, type EngineEvents } from './core/EventEmitter';
export * from './core/types';
