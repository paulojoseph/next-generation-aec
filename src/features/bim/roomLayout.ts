/**
 * @fileoverview Room layout from Scan-to-BIM output
 *
 * Turns one entry of public/bim/bim_data.json (written by
 * pipeline/scan_to_bim.py) into the room layout the BIM overlay draws:
 * the four perimeter walls, the floor/ceiling levels and an optional
 * lowered section (step) along the left or right wall.
 *
 * Pure module: no React, no three.js. Output is in the viewer frame
 * (the point cloud re-centred by the viewer, Y up, metres).
 */

// ============================================================================
// JSON SCHEMA (pipeline/scan_to_bim.py: process_room)
// ============================================================================

export type WallOrientation = 'E-W' | 'N-S';

export interface BimWall {
  id: number;
  name: string;
  length: number;
  height: number;
  area: number;
  /** 'N-S': normal along X, the wall runs along Z. 'E-W': normal along Z. */
  orientation: WallOrientation;
  /** Scan frame, [x, y, z] */
  centroid: number[];
  min: number[];
  max: number[];
  point_count: number;
}

export interface BimRoomBlock {
  width: number;
  depth: number;
  floor_area: number;
  ceiling_height: number;
  volume: number;
  perimeter: number;
  /** Centre of the floor plane's inliers, scan frame */
  center: number[];
  bounds: { min: number[]; max: number[] };
}

export interface BimCenteringOffset {
  x: number;
  y: number;
  z: number;
}

export interface BimRoom {
  name: string;
  point_count: number;
  planes_detected: number;
  centering_offset?: BimCenteringOffset;
  walls: BimWall[];
  room: BimRoomBlock | null;
  classification: {
    floor_count: number;
    ceiling_count: number;
    wall_count: number;
  };
}

/**
 * The entry for `name` (e.g. 'Area_1_conferenceRoom_1', the scan's file name)
 * in a parsed bim_data.json, or null if absent or the file is not a list.
 */
export function findBimRoom(data: unknown, name: string): BimRoom | null {
  if (!Array.isArray(data)) return null;
  const room = data.find((r) => r && typeof r === 'object' && r.name === name);
  return room ?? null;
}

// ============================================================================
// LAYOUT
// ============================================================================

export type StepSide = 'left' | 'right';

export interface RoomStep {
  side: StepSide;
  /** X of the full-height wall where the ceiling drops (viewer frame) */
  x: number;
  /** Floor to the lowered ceiling, taken from the outer (recess) wall top */
  recessHeight: number;
}

export interface RoomLayout {
  /** Perimeter walls, viewer frame. leftX < rightX, backZ < frontZ. */
  leftX: number;
  rightX: number;
  backZ: number;
  frontZ: number;
  /** Floor level, viewer frame */
  floorY: number;
  /** Floor to main ceiling: the highest top of the full-height walls */
  mainHeight: number;
  step: RoomStep | null;
  /** JSON wall ids used for each part of the layout */
  wallIds: {
    left: number;
    right: number;
    back: number;
    front: number;
    step: number | null;
  };
}

export interface RoomLayoutOptions {
  /**
   * Scan-frame Y that the viewer puts at Y = 0 (PointCloudBounds.rawFloor).
   * Defaults to centering_offset.y, the pipeline's own convention. Only
   * vertical positions depend on it; sizes do not.
   */
  viewerFloorY?: number;
}

/**
 * A wall shorter than this fraction of the longest wall with the same
 * orientation is a fragment (a pillar, a door frame), not a room side.
 */
export const MIN_WALL_LENGTH_RATIO = 0.5;

/** Minimum ceiling drop for a step (same threshold as the previous overlay). */
export const MIN_STEP_HEIGHT = 0.5;

const X = 0;
const Y = 1;
const Z = 2;

/** Coordinate of the wall along its normal: bounding box middle. */
function wallPosition(wall: BimWall): number {
  const axis = wall.orientation === 'N-S' ? X : Z;
  return (wall.min[axis] + wall.max[axis]) / 2;
}

/** Walls of one orientation that can be a room side, sorted by position. */
function sideCandidates(walls: BimWall[], orientation: WallOrientation): BimWall[] {
  const ofOrientation = walls.filter((w) => w.orientation === orientation);
  if (ofOrientation.length === 0) return [];
  const longest = Math.max(...ofOrientation.map((w) => w.length));
  return ofOrientation
    .filter((w) => w.length >= MIN_WALL_LENGTH_RATIO * longest)
    .sort((a, b) => wallPosition(a) - wallPosition(b));
}

/**
 * A step on `side`: the outermost N-S wall is the recess wall, and a wall
 * between it and the room centre reaches at least MIN_STEP_HEIGHT higher.
 * The nearest such wall is the step wall; lower planes in between (furniture
 * faces) are skipped.
 */
function findStep(
  nsWalls: BimWall[],
  side: StepSide,
  centerX: number,
  top: (w: BimWall) => number
): { outer: BimWall; inner: BimWall } | null {
  const outsideIn = side === 'right' ? [...nsWalls].reverse() : nsWalls;
  const outer = outsideIn[0];
  const onSide = (w: BimWall) =>
    side === 'right' ? wallPosition(w) > centerX : wallPosition(w) < centerX;
  const inner = outsideIn
    .slice(1)
    .find((w) => onSide(w) && top(w) - top(outer) >= MIN_STEP_HEIGHT);
  return inner ? { outer, inner } : null;
}

/**
 * Build the room layout for one bim_data.json entry.
 *
 * Returns null when the walls do not close a room (fewer than two usable
 * walls in either orientation).
 *
 * Sides are the outermost usable walls in each direction, so planes inside
 * the room (furniture faces, a step wall) never become a side. The floor level
 * is the floor plane from the room block (the scan's lowest point without
 * one), and heights are wall tops above it. If both sides have a step, only
 * the right one is used, as in the previous overlay.
 */
export function buildRoomLayout(
  bim: BimRoom,
  options: RoomLayoutOptions = {}
): RoomLayout | null {
  if (!Array.isArray(bim.walls)) return null;

  const ew = sideCandidates(bim.walls, 'E-W');
  const ns = sideCandidates(bim.walls, 'N-S');
  if (ew.length < 2 || ns.length < 2) return null;

  const offset = bim.centering_offset ?? { x: 0, y: 0, z: 0 };
  const floorRaw = bim.room?.center?.[Y] ?? offset.y;
  const viewerFloorY = options.viewerFloorY ?? offset.y;
  const top = (w: BimWall) => w.max[Y] - floorRaw;

  const back = ew[0];
  const front = ew[ew.length - 1];
  const left = ns[0];
  const right = ns[ns.length - 1];
  const centerX = (wallPosition(left) + wallPosition(right)) / 2;

  const rightStep = findStep(ns, 'right', centerX, top);
  const leftStep = rightStep ? null : findStep(ns, 'left', centerX, top);
  const stepSide: StepSide | null = rightStep ? 'right' : leftStep ? 'left' : null;
  const stepWalls = rightStep ?? leftStep;

  // Walls that reach the main ceiling: on the stepped side, the step wall
  // replaces the (lower) recess wall
  const fullHeightWalls = [
    back,
    front,
    leftStep ? leftStep.inner : left,
    rightStep ? rightStep.inner : right,
  ];
  const mainHeight = Math.max(...fullHeightWalls.map(top));

  return {
    leftX: wallPosition(left) - offset.x,
    rightX: wallPosition(right) - offset.x,
    backZ: wallPosition(back) - offset.z,
    frontZ: wallPosition(front) - offset.z,
    floorY: floorRaw - viewerFloorY,
    mainHeight,
    step:
      stepSide && stepWalls
        ? {
            side: stepSide,
            x: wallPosition(stepWalls.inner) - offset.x,
            recessHeight: top(stepWalls.outer),
          }
        : null,
    wallIds: {
      left: left.id,
      right: right.id,
      back: back.id,
      front: front.id,
      step: stepWalls ? stepWalls.inner.id : null,
    },
  };
}
