/**
 * @fileoverview Scene Objects Loader
 *
 * Loads BIM metadata (semantic objects) for a room.
 * Provides object name and class lookups for hover labels.
 */

/**
 * Scene object metadata.
 */
export interface SceneObject {
  id: number;
  name: string;
  class: string;
  count: number;
}

/**
 * SceneObjectsLoader - BIM metadata loader with fallback.
 *
 * Loads semantic object data for a room. Gracefully handles
 * missing metadata by returning an empty array.
 *
 * @example
 * ```ts
 * const loader = new SceneObjectsLoader();
 * const objects = await loader.load('https://cdn.example.com/room_objects.json');
 *
 * const table = objects.find(o => o.name === 'table_1');
 * ```
 */
export class SceneObjectsLoader {
  /**
   * Load scene objects from URL.
   *
   * @param url - URL to objects JSON file
   * @returns Array of scene objects, empty array on failure
   */
  async load(url: string): Promise<SceneObject[]> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[SceneObjectsLoader] Metadata not found: ${url}`);
        return [];
      }

      const data: SceneObject[] = await response.json();

      if (!Array.isArray(data)) {
        console.warn('[SceneObjectsLoader] Invalid metadata format');
        return [];
      }

      return data;

    } catch (error) {
      console.warn('[SceneObjectsLoader] Failed to load metadata:', error);
      return [];
    }
  }

  /**
   * Build a lookup map from object ID to name.
   */
  buildNameMap(objects: SceneObject[]): Map<number, string> {
    const map = new Map<number, string>();
    objects.forEach((obj) => map.set(obj.id, obj.name));
    return map;
  }

  /**
   * Build a lookup map from object ID to class.
   */
  buildClassMap(objects: SceneObject[]): Map<number, string> {
    const map = new Map<number, string>();
    objects.forEach((obj) => map.set(obj.id, obj.class));
    return map;
  }
}

export const sceneObjectsLoader = new SceneObjectsLoader();
