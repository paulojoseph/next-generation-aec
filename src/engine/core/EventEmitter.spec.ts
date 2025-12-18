/**
 * @fileoverview EventEmitter Unit Tests
 *
 * Tests for type-safe event pub/sub system.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter, type EngineEvents } from './EventEmitter';

describe('EventEmitter', () => {
  describe('on', () => {
    it('should subscribe and receive events', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const callback = vi.fn();

      emitter.on('stats:update', callback);
      emitter.emit('stats:update', {
        points: 1000,
        fps: 60,
        drawCalls: 1,
        memory: 100,
        width: 5,
        height: 3,
        depth: 4,
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ fps: 60 }));
    });

    it('should return unsubscribe function', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const callback = vi.fn();

      const unsubscribe = emitter.on('stats:update', callback);
      unsubscribe();

      emitter.emit('stats:update', {
        points: 1000,
        fps: 60,
        drawCalls: 1,
        memory: 100,
        width: 5,
        height: 3,
        depth: 4,
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      emitter.on('stats:update', callback1);
      emitter.on('stats:update', callback2);

      emitter.emit('stats:update', {
        points: 1000,
        fps: 60,
        drawCalls: 1,
        memory: 100,
        width: 5,
        height: 3,
        depth: 4,
      });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('should only fire once', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const callback = vi.fn();

      emitter.once('selection:change', callback);

      emitter.emit('selection:change', { objectId: 1 });
      emitter.emit('selection:change', { objectId: 2 });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ objectId: 1 });
    });
  });

  describe('off', () => {
    it('should remove all listeners for specific event', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const callback = vi.fn();

      emitter.on('stats:update', callback);
      emitter.off('stats:update');

      emitter.emit('stats:update', {
        points: 1000,
        fps: 60,
        drawCalls: 1,
        memory: 100,
        width: 5,
        height: 3,
        depth: 4,
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should remove all listeners when called without args', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const statsCallback = vi.fn();
      const selectionCallback = vi.fn();

      emitter.on('stats:update', statsCallback);
      emitter.on('selection:change', selectionCallback);
      emitter.off();

      emitter.emit('stats:update', {
        points: 1000,
        fps: 60,
        drawCalls: 1,
        memory: 100,
        width: 5,
        height: 3,
        depth: 4,
      });
      emitter.emit('selection:change', { objectId: 1 });

      expect(statsCallback).not.toHaveBeenCalled();
      expect(selectionCallback).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      const emitter = new EventEmitter<EngineEvents>();

      expect(emitter.listenerCount('stats:update')).toBe(0);

      emitter.on('stats:update', vi.fn());
      expect(emitter.listenerCount('stats:update')).toBe(1);

      emitter.on('stats:update', vi.fn());
      expect(emitter.listenerCount('stats:update')).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should catch and log errors in callbacks', () => {
      const emitter = new EventEmitter<EngineEvents>();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.on('stats:update', () => {
        throw new Error('Test error');
      });

      // Should not throw
      expect(() => {
        emitter.emit('stats:update', {
          points: 1000,
          fps: 60,
          drawCalls: 1,
          memory: 100,
          width: 5,
          height: 3,
          depth: 4,
        });
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
