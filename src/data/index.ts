/**
 * @fileoverview Data Layer Entry Point
 *
 * Cloud-agnostic data loading infrastructure with resilience patterns.
 * Supports seamless switching between local development and S3 production.
 */

export {
  DataSourceResolver,
  dataSourceResolver,
  type DataSource,
} from './DataSourceResolver';

export {
  ManifestLoader,
  manifestLoader,
  type Manifest,
  type ManifestRoom,
  type ResolvedRoom,
  type ManifestLoaderConfig,
} from './ManifestLoader';

export {
  SceneObjectsLoader,
  sceneObjectsLoader,
  type SceneObject,
} from './SceneObjectsLoader';
