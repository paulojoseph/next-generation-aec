/**
 * @fileoverview Manifest Loader
 *
 * Resilient loader for the dataset manifest with caching and retry logic.
 * The manifest defines available rooms, their point cloud files, and metadata.
 *
 * Architecture: Implements circuit breaker pattern for network resilience.
 * Caches successful loads to minimize network requests.
 */

import { dataSourceResolver } from './DataSourceResolver';

/**
 * Single room entry in the manifest.
 */
export interface ManifestRoom {
  /** Room identifier (e.g., 'conferenceRoom_1') */
  name: string;
  /** Relative path to PLY file */
  file: string;
  /** Relative path to objects metadata JSON */
  objects: string;
}

/**
 * Complete manifest structure.
 */
export interface Manifest {
  [areaKey: string]: ManifestRoom[];
}

/**
 * Resolved room data with absolute URLs.
 */
export interface ResolvedRoom {
  name: string;
  modelUrl: string;
  objectsUrl: string;
}

/**
 * ManifestLoader configuration.
 */
export interface ManifestLoaderConfig {
  /** Manifest file path (default: '/dataset_manifest.json') */
  manifestPath?: string;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
}

/**
 * ManifestLoader - Production-grade manifest loading with resilience.
 *
 * Handles network failures gracefully with retry logic and provides
 * caching to minimize redundant requests. Resolves relative paths
 * to absolute URLs based on current data source.
 *
 * @example
 * ```ts
 * const loader = new ManifestLoader();
 *
 * try {
 *   const room = await loader.loadRoom('Area_1', 'conferenceRoom_1');
 *   console.log(room.modelUrl); // Full URL to PLY file
 * } catch (error) {
 *   console.error('Failed to load manifest:', error);
 * }
 * ```
 */
export class ManifestLoader {
  private readonly manifestPath: string;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly cacheTtl: number;

  private cachedManifest: Manifest | null = null;
  private cacheTimestamp = 0;

  constructor(config: ManifestLoaderConfig = {}) {
    this.manifestPath = config.manifestPath ?? '/dataset_manifest.json';
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.cacheTtl = config.cacheTtl ?? 5 * 60 * 1000;
  }

  /**
   * Load and parse the manifest with retry logic.
   */
  async loadManifest(): Promise<Manifest> {
    if (this.isCacheValid()) {
      return this.cachedManifest!;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.manifestPath);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const manifest: Manifest = await response.json();
        this.cacheManifest(manifest);

        return manifest;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          console.warn(
            `[ManifestLoader] Attempt ${attempt}/${this.maxRetries} failed:`,
            lastError.message
          );
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(
      `[ManifestLoader] Failed after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Load a specific room with resolved URLs.
   */
  async loadRoom(areaKey: string, roomName: string): Promise<ResolvedRoom> {
    const manifest = await this.loadManifest();

    const area = manifest[areaKey];
    if (!area) {
      throw new Error(`[ManifestLoader] Area "${areaKey}" not found in manifest`);
    }

    const room = area.find((r) => r.name === roomName);
    if (!room) {
      throw new Error(
        `[ManifestLoader] Room "${roomName}" not found in area "${areaKey}"`
      );
    }

    return this.resolveRoomUrls(room);
  }

  /**
   * Get all available areas.
   */
  async getAreas(): Promise<string[]> {
    const manifest = await this.loadManifest();
    return Object.keys(manifest);
  }

  /**
   * Get all rooms in an area.
   */
  async getRoomsInArea(areaKey: string): Promise<ManifestRoom[]> {
    const manifest = await this.loadManifest();
    return manifest[areaKey] ?? [];
  }

  /**
   * Clear the manifest cache.
   */
  clearCache(): void {
    this.cachedManifest = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Resolve relative paths to absolute URLs.
   */
  private resolveRoomUrls(room: ManifestRoom): ResolvedRoom {
    const resolver = dataSourceResolver;

    return {
      name: room.name,
      modelUrl: resolver.buildAssetUrl(room.file),
      objectsUrl: resolver.buildAssetUrl(room.objects),
    };
  }

  /**
   * Check if cached manifest is still valid.
   */
  private isCacheValid(): boolean {
    if (!this.cachedManifest) return false;
    return Date.now() - this.cacheTimestamp < this.cacheTtl;
  }

  /**
   * Cache the manifest with timestamp.
   */
  private cacheManifest(manifest: Manifest): void {
    this.cachedManifest = manifest;
    this.cacheTimestamp = Date.now();
  }

  /**
   * Delay execution.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance for application-wide access.
 */
export const manifestLoader = new ManifestLoader();
