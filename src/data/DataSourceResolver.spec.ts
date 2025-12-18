/**
 * @fileoverview DataSourceResolver Unit Tests
 *
 * Tests for environment-aware data source resolution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataSourceResolver } from './DataSourceResolver';

describe('DataSourceResolver', () => {
  const originalEnv = process.env.NEXT_PUBLIC_DATA_SOURCE;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_DATA_SOURCE = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_DATA_SOURCE;
    }
  });

  describe('resolve', () => {
    it('should return local source when no env variable set', () => {
      delete process.env.NEXT_PUBLIC_DATA_SOURCE;
      const resolver = new DataSourceResolver();
      const source = resolver.resolve();

      expect(source.baseUrl).toBe('/scans');
      expect(source.isCloud).toBe(false);
      expect(source.environment).toBe('development');
    });

    it('should return cloud source when HTTPS URL is set', () => {
      process.env.NEXT_PUBLIC_DATA_SOURCE = 'https://cdn.example.com/assets';
      const resolver = new DataSourceResolver();
      const source = resolver.resolve();

      expect(source.baseUrl).toBe('https://cdn.example.com/assets');
      expect(source.isCloud).toBe(true);
      expect(source.environment).toBe('production');
    });

    it('should normalize trailing slashes', () => {
      process.env.NEXT_PUBLIC_DATA_SOURCE = 'https://cdn.example.com/assets///';
      const resolver = new DataSourceResolver();
      const source = resolver.resolve();

      expect(source.baseUrl).toBe('https://cdn.example.com/assets');
    });
  });

  describe('buildAssetUrl', () => {
    it('should build correct URL for local source', () => {
      delete process.env.NEXT_PUBLIC_DATA_SOURCE;
      const resolver = new DataSourceResolver();
      const url = resolver.buildAssetUrl('Area_1/room.ply');

      expect(url).toBe('/scans/Area_1/room.ply');
    });

    it('should build correct URL for cloud source', () => {
      process.env.NEXT_PUBLIC_DATA_SOURCE = 'https://cdn.example.com/assets';
      const resolver = new DataSourceResolver();
      const url = resolver.buildAssetUrl('Area_1/room.ply');

      expect(url).toBe('https://cdn.example.com/assets/Area_1/room.ply');
    });

    it('should normalize leading slashes in path', () => {
      delete process.env.NEXT_PUBLIC_DATA_SOURCE;
      const resolver = new DataSourceResolver();
      const url = resolver.buildAssetUrl('/Area_1/room.ply');

      expect(url).toBe('/scans/Area_1/room.ply');
    });
  });
});
