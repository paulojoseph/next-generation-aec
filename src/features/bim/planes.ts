/**
 * @fileoverview BIM plane list
 *
 * The planes drawn by the BIM overlay and listed in the sidebar, built from a
 * RoomLayout. Both read this one list, so their names and sizes cannot drift.
 *
 * Pure module: no React, no three.js.
 */

import type { PlaneInfo } from '@/types';
import type { RoomLayout } from './roomLayout';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** Every plane name, in sidebar order. Step planes exist only in stepped rooms. */
export const PLANE_NAMES = [
  'Wall_Left',
  'Wall_Right',
  'Wall_Back',
  'Wall_Front',
  'Step_Wall',
  'Step_Ceiling',
  'Ceiling',
  'Floor',
] as const;

export type PlaneName = (typeof PLANE_NAMES)[number];

export interface PlaneSpec extends PlaneInfo {
  name: PlaneName;
  /** Width x height of the bounding rectangle, metres (shown in the sidebar) */
  width: number;
  height: number;
  isHorizontal: boolean;
  /** Centre of the bounding rectangle, viewer frame */
  position: Vec3;
  /** Euler XYZ that turns the local XY plane into place */
  rotation: Vec3;
  /**
   * Counter-clockwise polygon in local XY, centred on `position`.
   * A rectangle, or an L for the back/front walls of a stepped room.
   */
  outline: Vec2[];
}

const HALF_PI = Math.PI / 2;

function rectangle(width: number, height: number): Vec2[] {
  const w = width / 2;
  const h = height / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]];
}

/**
 * L-shaped outline of the back or front wall of a stepped room.
 *
 * The profile is drawn in world X (floor at 0), then moved to local
 * coordinates. The front wall is turned by PI around Y, so its local X runs
 * the other way: mirror it and reverse the order to stay counter-clockwise.
 */
function steppedOutline(layout: RoomLayout, wall: 'back' | 'front'): Vec2[] {
  const { leftX, rightX, mainHeight: h, step } = layout;
  if (!step) throw new Error('steppedOutline needs a step');
  const { x: sx, recessHeight: rh } = step;

  const profile: Vec2[] =
    step.side === 'right'
      ? [[leftX, 0], [rightX, 0], [rightX, rh], [sx, rh], [sx, h], [leftX, h]]
      : [[leftX, 0], [rightX, 0], [rightX, h], [sx, h], [sx, rh], [leftX, rh]];

  const cx = (leftX + rightX) / 2;
  const local = profile.map(([x, y]): Vec2 => [
    wall === 'back' ? x - cx : cx - x,
    y - h / 2,
  ]);
  return wall === 'back' ? local : local.reverse();
}

/**
 * Build the plane list for a room layout, in PLANE_NAMES order.
 *
 * Vertical walls are full height except the recess wall of a stepped room;
 * the ceiling covers the main section and Step_Ceiling the lowered one.
 */
export function buildPlanes(layout: RoomLayout): PlaneSpec[] {
  const { leftX, rightX, backZ, frontZ, floorY, mainHeight, step } = layout;
  const width = rightX - leftX;
  const depth = frontZ - backZ;
  const cx = (leftX + rightX) / 2;
  const cz = (backZ + frontZ) / 2;

  const vertical = (
    name: PlaneName,
    w: number,
    h: number,
    position: Vec3,
    rotation: Vec3,
    outline = rectangle(w, h)
  ): PlaneSpec => ({ name, width: w, height: h, isHorizontal: false, position, rotation, outline });

  const horizontal = (
    name: PlaneName,
    w: number,
    x: number,
    y: number,
    facing: 'up' | 'down'
  ): PlaneSpec => ({
    name,
    width: w,
    height: depth,
    isHorizontal: true,
    position: [x, y, cz],
    rotation: [facing === 'up' ? -HALF_PI : HALF_PI, 0, 0],
    outline: rectangle(w, depth),
  });

  const leftHeight = step?.side === 'left' ? step.recessHeight : mainHeight;
  const rightHeight = step?.side === 'right' ? step.recessHeight : mainHeight;
  const wallOutline = (wall: 'back' | 'front') =>
    step ? steppedOutline(layout, wall) : rectangle(width, mainHeight);

  // Main (full-height) section along X
  const mainFrom = step?.side === 'left' ? step.x : leftX;
  const mainTo = step?.side === 'right' ? step.x : rightX;

  const planes: PlaneSpec[] = [
    vertical('Wall_Left', depth, leftHeight, [leftX, floorY + leftHeight / 2, cz], [0, HALF_PI, 0]),
    vertical('Wall_Right', depth, rightHeight, [rightX, floorY + rightHeight / 2, cz], [0, -HALF_PI, 0]),
    vertical('Wall_Back', width, mainHeight, [cx, floorY + mainHeight / 2, backZ], [0, 0, 0], wallOutline('back')),
    vertical('Wall_Front', width, mainHeight, [cx, floorY + mainHeight / 2, frontZ], [0, Math.PI, 0], wallOutline('front')),
  ];

  if (step) {
    const drop = mainHeight - step.recessHeight;
    const outerX = step.side === 'right' ? rightX : leftX;
    planes.push(
      // Faces the main section, like the side wall on the same side
      vertical(
        'Step_Wall',
        depth,
        drop,
        [step.x, floorY + step.recessHeight + drop / 2, cz],
        [0, step.side === 'right' ? -HALF_PI : HALF_PI, 0]
      ),
      horizontal('Step_Ceiling', Math.abs(outerX - step.x), (outerX + step.x) / 2, floorY + step.recessHeight, 'down')
    );
  }

  planes.push(
    horizontal('Ceiling', mainTo - mainFrom, (mainFrom + mainTo) / 2, floorY + mainHeight, 'down'),
    horizontal('Floor', width, cx, floorY, 'up')
  );

  return planes;
}

// ============================================================================
// MEASUREMENT SNAP TARGETS
// ============================================================================

export type SnapKey = 'w' | 'a' | 's' | 'd' | ' ';

/**
 * Snap targets for a measurement started at `point` on `plane`, one per key,
 * from the user's point of view (unchanged from the previous overlay):
 *
 * - W: up to the ceiling above the point (the lowered one inside the recess)
 * - S: down to the floor
 * - On the left/right walls: A toward the front wall, D toward the back wall,
 *   Space across to the opposite side wall.
 * - On the back/front walls, the floor and the ceilings: A to the right wall,
 *   D to the left wall, Space across to the opposite back/front wall. From
 *   inside the recess, the one going toward the main section stops at the
 *   step wall.
 */
export function snapCandidates(
  layout: RoomLayout,
  plane: Pick<PlaneSpec, 'rotation'>,
  [x, y, z]: Vec3
): Record<SnapKey, Vec3> {
  const { leftX, rightX, backZ, frontZ, floorY, mainHeight, step } = layout;
  const inRecess = !!step && (step.side === 'right' ? x > step.x : x < step.x);
  const ceiling = inRecess && step ? step.recessHeight : mainHeight;

  const vertical = {
    w: [x, floorY + ceiling, z] as Vec3,
    s: [x, floorY, z] as Vec3,
  };

  // Left/right walls are turned about +-90 degrees around Y
  const onSideWall = Math.abs(Math.sin(plane.rotation[1])) > 0.7;
  if (onSideWall) {
    // The step wall is always in its side's half of the room, so the
    // opposite side wall is never behind it
    return {
      ...vertical,
      a: [x, y, frontZ],
      d: [x, y, backZ],
      ' ': [x > (leftX + rightX) / 2 ? leftX : rightX, y, z],
    };
  }

  return {
    ...vertical,
    a: [inRecess && step?.side === 'left' ? step.x : rightX, y, z],
    d: [inRecess && step?.side === 'right' ? step.x : leftX, y, z],
    ' ': [x, y, z > (backZ + frontZ) / 2 ? backZ : frontZ],
  };
}
