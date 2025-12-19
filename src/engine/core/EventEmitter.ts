/**
 * @fileoverview Type-safe Event Emitter
 *
 * Lightweight Observer pattern implementation for decoupling engine
 * components from React lifecycle. Enables pub/sub communication
 * between rendering layer and UI without tight coupling.
 *
 * Architecture: Using generics to enforce type-safe event contracts,
 * preventing runtime errors from mismatched event payloads.
 */

type EventCallback<T = unknown> = (payload: T) => void;

export interface EngineEvents {
  [key: string]: unknown;  // Index signature to satisfy Record<string, unknown>
  'pointcloud:loaded': { pointCount: number; bounds: PointCloudBounds };
  'pointcloud:progress': { loaded: number; total: number };
  'pointcloud:error': { message: string; code: string };
  'stats:update': ViewerStats;
  'hover:update': HoverInfo | null;
  'selection:change': { objectId: number | null };
  'measurement:start': { origin: [number, number, number] };
  'measurement:complete': { distance: number; points: [number, number, number][] };
  'camera:move': { position: [number, number, number]; target: [number, number, number] };
}

interface PointCloudBounds {
  floor: number;
  ceiling: number;
  centerX: number;
  centerZ: number;
}

interface ViewerStats {
  points: number;
  fps: number;
  drawCalls: number;
  memory: number;
  width: number;
  height: number;
  depth: number;
  area: number;
  volume: number;
}

interface HoverInfo {
  x: number;
  y: number;
  z: number;
  label: string;
}

/**
 * EventEmitter - Core pub/sub system for engine communication.
 *
 * Decouples Three.js rendering from React state management by providing
 * a type-safe event bus. The engine emits events that React components
 * can subscribe to without creating bidirectional dependencies.
 *
 * @example
 * ```ts
 * const emitter = new EventEmitter<EngineEvents>();
 *
 * // Subscribe
 * const unsubscribe = emitter.on('stats:update', (stats) => {
 *   console.log(`FPS: ${stats.fps}`);
 * });
 *
 * // Emit
 * emitter.emit('stats:update', { fps: 60, points: 1000000, ... });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export class EventEmitter<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<EventCallback<unknown>>>();

  /**
   * Subscribe to an event.
   * @returns Unsubscribe function for cleanup
   */
  on<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): () => void {
    const callbacks = this.listeners.get(event) ?? new Set();
    callbacks.add(callback as EventCallback<unknown>);
    this.listeners.set(event, callbacks);

    return () => {
      callbacks.delete(callback as EventCallback<unknown>);
    };
  }

  /**
   * Subscribe to an event for a single emission.
   */
  once<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): () => void {
    const wrapper: EventCallback<TEvents[K]> = (payload) => {
      callback(payload);
      unsubscribe();
    };
    const unsubscribe = this.on(event, wrapper);
    return unsubscribe;
  }

  /**
   * Emit an event to all subscribers.
   */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const callbacks = this.listeners.get(event);
    callbacks?.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[EventEmitter] Error in listener for "${String(event)}":`, error);
      }
    });
  }

  /**
   * Remove all listeners for an event or all events.
   */
  off<K extends keyof TEvents>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
      return;
    }
    this.listeners.clear();
  }

  /**
   * Get subscriber count for debugging.
   */
  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
