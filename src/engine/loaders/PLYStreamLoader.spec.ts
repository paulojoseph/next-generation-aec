/**
 * @fileoverview PLYStreamLoader Unit Tests
 *
 * Tests for binary PLY parsing, decimation, and bounds calculation.
 * Uses mock ArrayBuffers to simulate binary PLY data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PLYStreamLoader } from './PLYStreamLoader';

/**
 * Create a minimal valid PLY buffer for testing.
 * Format: 18 bytes per vertex (xyz float32 + rgb uint8 + label uint8 + objectId uint16)
 */
function createMockPLYBuffer(vertexCount: number, yRange: [number, number] = [0, 3]): ArrayBuffer {
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${vertexCount}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nproperty uchar label\nproperty ushort objectId\nend_header\n`;

  const headerBytes = new TextEncoder().encode(header);
  const stride = 18;
  const totalSize = headerBytes.length + vertexCount * stride;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Copy header
  const headerArray = new Uint8Array(buffer, 0, headerBytes.length);
  headerArray.set(headerBytes);

  // Generate vertex data
  let offset = headerBytes.length;
  for (let i = 0; i < vertexCount; i++) {
    const x = (Math.random() - 0.5) * 10;
    const y = yRange[0] + Math.random() * (yRange[1] - yRange[0]);
    const z = (Math.random() - 0.5) * 10;

    view.setFloat32(offset, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    view.setUint8(offset + 12, Math.floor(Math.random() * 255));
    view.setUint8(offset + 13, Math.floor(Math.random() * 255));
    view.setUint8(offset + 14, Math.floor(Math.random() * 255));
    view.setUint8(offset + 15, Math.floor(Math.random() * 14));
    view.setUint16(offset + 16, i % 100, true);

    offset += stride;
  }

  return buffer;
}

describe('PLYStreamLoader', () => {
  let loader: PLYStreamLoader;

  beforeEach(() => {
    loader = new PLYStreamLoader();
  });

  describe('parseBuffer', () => {
    it('should parse buffer with correct point count', () => {
      const buffer = createMockPLYBuffer(1000);
      const result = loader.parseBuffer(buffer, 1);

      expect(result.pointCount).toBe(1000);
      expect(result.geometry.attributes.position.count).toBe(1000);
    });

    it('should apply decimation correctly', () => {
      const buffer = createMockPLYBuffer(1000);
      const result = loader.parseBuffer(buffer, 10);

      expect(result.pointCount).toBe(100);
      expect(result.geometry.attributes.position.count).toBe(100);
    });

    it('should center point cloud at origin', () => {
      const buffer = createMockPLYBuffer(100);
      const result = loader.parseBuffer(buffer, 1);

      const positions = result.geometry.attributes.position.array as Float32Array;

      // Calculate bounds after centering
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (let i = 0; i < positions.length; i += 3) {
        minX = Math.min(minX, positions[i]);
        maxX = Math.max(maxX, positions[i]);
        minZ = Math.min(minZ, positions[i + 2]);
        maxZ = Math.max(maxZ, positions[i + 2]);
      }

      // Center should be near origin
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      expect(Math.abs(centerX)).toBeLessThan(0.1);
      expect(Math.abs(centerZ)).toBeLessThan(0.1);
    });

    it('should set floor at Y=0', () => {
      const buffer = createMockPLYBuffer(1000, [2, 5]);
      const result = loader.parseBuffer(buffer, 1);

      // Floor should be at 0 after centering
      expect(result.bounds.floor).toBe(0);

      // Ceiling should be approximately 3 (5-2)
      expect(result.bounds.ceiling).toBeGreaterThan(2);
      expect(result.bounds.ceiling).toBeLessThan(4);
    });

    it('should create valid geometry attributes', () => {
      const buffer = createMockPLYBuffer(100);
      const result = loader.parseBuffer(buffer, 1);

      expect(result.geometry.attributes.position).toBeDefined();
      expect(result.geometry.attributes.color).toBeDefined();
      expect(result.geometry.attributes.objectId).toBeDefined();
    });

    it('should calculate model dimensions', () => {
      const buffer = createMockPLYBuffer(1000, [0, 3]);
      const result = loader.parseBuffer(buffer, 1);

      expect(result.metrics.dimensions.width).toBeGreaterThan(0);
      expect(result.metrics.dimensions.height).toBeGreaterThan(0);
      expect(result.metrics.dimensions.depth).toBeGreaterThan(0);
    });
  });

  describe('load', () => {
    it('should call abort on existing request', () => {
      const abortSpy = vi.fn();
      const mockController = { abort: abortSpy, signal: new AbortController().signal };
      (loader as any).abortController = mockController;

      loader.abort();

      expect(abortSpy).toHaveBeenCalled();
    });
  });
});
