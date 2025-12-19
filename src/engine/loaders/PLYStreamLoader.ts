/**
 * @fileoverview Binary PLY Stream Loader
 *
 * High-performance binary PLY parser optimized for massive LiDAR datasets.
 * Uses streaming download with progressive parsing to minimize memory pressure.
 *
 * Architecture Decisions:
 * - Direct ArrayBuffer manipulation to avoid intermediate string conversions
 * - Single-pass parsing with configurable decimation (skipRate)
 * - Pre-allocated typed arrays to minimize GC pressure during streaming
 * - Percentile-based bounds calculation to filter outlier noise
 *
 * Binary PLY Format (S3DIS processed):
 * - Stride: 18 bytes per vertex
 * - Layout: float32 x, y, z (12 bytes) + uint8 r, g, b (3 bytes) +
 *           uint8 label (1 byte) + uint16 objectId (2 bytes)
 */

import * as THREE from 'three';
import type { PointCloudBounds, ParsedPointCloud, ModelMetrics } from '../core/types';

const VERTEX_STRIDE = 18; // bytes per vertex
const HEADER_SEARCH_LIMIT = 1000; // bytes to search for header end

/**
 * Result from header parsing.
 */
interface PLYHeader {
  vertexCount: number;
  headerEndOffset: number;
}

/**
 * Progress callback for streaming feedback.
 */
export type LoadProgressCallback = (loaded: number, total: number) => void;

/**
 * Parse PLY header to extract vertex count and data offset.
 * Uses byte-by-byte search to handle variable header sizes.
 */
function parsePLYHeader(buffer: ArrayBuffer): PLYHeader {
  const searchLimit = Math.min(buffer.byteLength, HEADER_SEARCH_LIMIT);
  const view = new DataView(buffer, 0, searchLimit);

  let headerText = '';
  for (let i = 0; i < searchLimit; i++) {
    headerText += String.fromCharCode(view.getUint8(i));
    if (headerText.endsWith('end_header\n')) {
      break;
    }
  }

  const vertexMatch = headerText.match(/element vertex (\d+)/);
  const vertexCount = vertexMatch ? parseInt(vertexMatch[1], 10) : 0;
  const headerEndOffset = headerText.indexOf('end_header') + 11;

  return { vertexCount, headerEndOffset };
}

/**
 * Calculate percentile value from sorted array.
 * Used for robust floor/ceiling detection that ignores noise.
 */
function percentile(sortedArray: Float32Array, p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.floor(sortedArray.length * p);
  return sortedArray[Math.min(index, sortedArray.length - 1)];
}

/**
 * PLYStreamLoader - Production-grade binary PLY parser.
 *
 * Designed for LiDAR point clouds with millions of points.
 * Implements quality-based decimation for real-time LOD switching.
 *
 * @example
 * ```ts
 * const loader = new PLYStreamLoader();
 *
 * const result = await loader.load(
 *   'https://cdn.example.com/scan.ply',
 *   { skipRate: 10 }, // Load 1/10th of points
 *   (loaded, total) => console.log(`${(loaded/total*100).toFixed(0)}%`)
 * );
 *
 * scene.add(new THREE.Points(result.geometry, material));
 * ```
 */
export class PLYStreamLoader {
  private abortController: AbortController | null = null;

  /**
   * Stream and parse a binary PLY file.
   *
   * @param url - URL to binary PLY file
   * @param options - Loading options
   * @param onProgress - Progress callback
   * @returns Parsed point cloud with geometry and metadata
   */
  async load(
    url: string,
    options: { skipRate?: number } = {},
    onProgress?: LoadProgressCallback
  ): Promise<ParsedPointCloud> {
    const skipRate = options.skipRate ?? 1;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`[PLYStreamLoader] HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('[PLYStreamLoader] ReadableStream not supported');
    }

    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    const buffer = await this.streamToBuffer(response.body, contentLength, onProgress);

    return this.parseBuffer(buffer, skipRate);
  }

  /**
   * Parse a pre-loaded ArrayBuffer.
   * Useful for re-processing cached data with different quality settings.
   */
  parseBuffer(buffer: ArrayBuffer, skipRate: number): ParsedPointCloud {
    const { vertexCount, headerEndOffset } = parsePLYHeader(buffer);

    const bodyLength = buffer.byteLength - headerEndOffset;
    const maxPoints = Math.floor(bodyLength / VERTEX_STRIDE);
    const pointsToLoad = Math.floor(maxPoints / skipRate);

    // Pre-allocate typed arrays to minimize GC during parsing
    const positions = new Float32Array(pointsToLoad * 3);
    const colors = new Float32Array(pointsToLoad * 3);
    const objectIds = new Float32Array(pointsToLoad);
    const yValues = new Float32Array(pointsToLoad);

    const dataView = new DataView(buffer);
    let offset = headerEndOffset;
    let writeIndex = 0;

    let minX = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxZ = -Infinity;

    // Single-pass parsing with decimation
    while (offset + VERTEX_STRIDE <= buffer.byteLength && writeIndex < pointsToLoad) {
      const x = dataView.getFloat32(offset, true);
      const y = dataView.getFloat32(offset + 4, true);
      const z = dataView.getFloat32(offset + 8, true);

      positions[writeIndex * 3] = x;
      positions[writeIndex * 3 + 1] = y;
      positions[writeIndex * 3 + 2] = z;

      yValues[writeIndex] = y;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);

      // RGB normalized to [0, 1]
      colors[writeIndex * 3] = dataView.getUint8(offset + 12) / 255.0;
      colors[writeIndex * 3 + 1] = dataView.getUint8(offset + 13) / 255.0;
      colors[writeIndex * 3 + 2] = dataView.getUint8(offset + 14) / 255.0;

      objectIds[writeIndex] = dataView.getUint16(offset + 16, true);

      writeIndex++;
      offset += VERTEX_STRIDE * skipRate;
    }

    // Robust floor/ceiling using percentile analysis
    const sortedY = yValues.slice(0, writeIndex).sort((a, b) => a - b);
    const rawFloor = percentile(sortedY, 0.01);
    const rawCeiling = percentile(sortedY, 0.99);

    // Center the point cloud at origin with floor at Y=0
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const floorY = rawFloor;

    for (let i = 0; i < writeIndex; i++) {
      positions[i * 3] -= centerX;
      positions[i * 3 + 1] -= floorY;
      positions[i * 3 + 2] -= centerZ;
    }

    const bounds: PointCloudBounds = {
      floor: 0,
      ceiling: rawCeiling - floorY,
      centerX,
      centerZ,
      rawFloor,
      rawCeiling,
    };

    const width = maxX - minX;
    const depth = maxZ - minZ;
    const height = bounds.ceiling;

    const metrics: ModelMetrics = {
      height,
      center: new THREE.Vector3(0, height / 2, 0),
      dimensions: { width, height, depth },
    };

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('objectId', new THREE.BufferAttribute(objectIds, 1));
    geometry.computeBoundingSphere();

    return {
      geometry,
      bounds,
      metrics,
      pointCount: writeIndex,
    };
  }

  /**
   * Abort any in-progress download.
   */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Stream response body to ArrayBuffer with progress reporting.
   */
  private async streamToBuffer(
    body: ReadableStream<Uint8Array>,
    contentLength: number,
    onProgress?: LoadProgressCallback
  ): Promise<ArrayBuffer> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      if (onProgress && contentLength > 0) {
        onProgress(receivedLength, contentLength);
      }
    }

    const combined = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.length;
    }

    return combined.buffer;
  }
}
