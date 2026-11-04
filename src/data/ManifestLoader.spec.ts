/**
 * @fileoverview ManifestLoader Unit Tests
 *
 * Tests for manifest loading, caching, and retry logic.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ManifestLoader, type Manifest } from './ManifestLoader';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockManifest: Manifest = {
  Area_1: [
    { name: 'conferenceRoom_1', file: 'Area_1/room.ply', objects: 'Area_1/room_objects.json' },
    { name: 'office_1', file: 'Area_1/office.ply', objects: 'Area_1/office_objects.json' },
  ],
  Area_2: [
    { name: 'hallway_1', file: 'Area_2/hallway.ply', objects: 'Area_2/hallway_objects.json' },
  ],
};

describe('ManifestLoader', () => {
  let loader: ManifestLoader;

  beforeEach(() => {
    mockFetch.mockReset();
    loader = new ManifestLoader({ maxRetries: 3, retryDelay: 10, cacheTtl: 100 });
  });

  afterEach(() => {
    loader.clearCache();
  });

  describe('loadManifest', () => {
    it('should load and parse manifest successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockManifest,
      });

      const result = await loader.loadManifest();

      expect(result).toEqual(mockManifest);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use cached manifest on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockManifest,
      });

      await loader.loadManifest();
      await loader.loadManifest();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockManifest,
        });

      const result = await loader.loadManifest();

      expect(result).toEqual(mockManifest);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(loader.loadManifest()).rejects.toThrow('Failed after 3 attempts');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(loader.loadManifest()).rejects.toThrow('Failed after 3 attempts');
    });
  });

  describe('loadRoom', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockManifest,
      });
    });

    it('should resolve room with correct URLs', async () => {
      const room = await loader.loadRoom('Area_1', 'conferenceRoom_1');

      expect(room.name).toBe('conferenceRoom_1');
      expect(room.modelUrl).toContain('Area_1/room.ply');
      expect(room.objectsUrl).toContain('Area_1/room_objects.json');
    });

    it('should throw for unknown area', async () => {
      await expect(loader.loadRoom('Unknown_Area', 'room')).rejects.toThrow(
        'Area "Unknown_Area" not found'
      );
    });

    it('should throw for unknown room', async () => {
      await expect(loader.loadRoom('Area_1', 'unknown_room')).rejects.toThrow(
        'Room "unknown_room" not found'
      );
    });
  });

  describe('findRoomArea', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockManifest,
      });
    });

    it('should return the area that contains the room', async () => {
      expect(await loader.findRoomArea('conferenceRoom_1')).toBe('Area_1');
      expect(await loader.findRoomArea('hallway_1')).toBe('Area_2');
    });

    it('should throw for a room in no area', async () => {
      await expect(loader.findRoomArea('unknown_room')).rejects.toThrow(
        'Room "unknown_room" not found in any area'
      );
    });

    it('should throw when several areas have the room', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockManifest, Area_3: [mockManifest.Area_1[0]] }),
      });
      await expect(loader.findRoomArea('conferenceRoom_1')).rejects.toThrow(
        'Room "conferenceRoom_1" is in several areas: Area_1, Area_3'
      );
    });
  });

  describe('getAreas', () => {
    it('should return all area keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockManifest,
      });

      const areas = await loader.getAreas();

      expect(areas).toEqual(['Area_1', 'Area_2']);
    });
  });

  describe('getRoomsInArea', () => {
    it('should return rooms for valid area', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockManifest,
      });

      const rooms = await loader.getRoomsInArea('Area_1');

      expect(rooms).toHaveLength(2);
      expect(rooms[0].name).toBe('conferenceRoom_1');
    });

    it('should return empty array for unknown area', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockManifest,
      });

      const rooms = await loader.getRoomsInArea('Unknown');

      expect(rooms).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should force reload after cache clear', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockManifest,
      });

      await loader.loadManifest();
      loader.clearCache();
      await loader.loadManifest();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
