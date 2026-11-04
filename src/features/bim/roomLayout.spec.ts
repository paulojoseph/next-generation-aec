/**
 * @fileoverview Room layout tests
 *
 * The first block runs on the real pipeline output (public/bim/bim_data.json).
 * If that file is regenerated and these fail, check the new numbers against
 * the scan before updating them. The synthetic rooms cover what the real file
 * does not (left step, no step, missing blocks...).
 */

import { describe, it, expect } from 'vitest';
import bimDataJson from '../../../public/bim/bim_data.json';
import {
  buildRoomLayout,
  findBimRoom,
  MIN_STEP_HEIGHT,
  type BimRoom,
  type BimWall,
  type WallOrientation,
} from './roomLayout';

const bimData = bimDataJson as BimRoom[];

// ============================================================================
// REAL DATA: Area_1_conferenceRoom_1
// ============================================================================

describe('buildRoomLayout on bim_data.json (conferenceRoom_1)', () => {
  const bim = bimData.find((r) => r.name === 'Area_1_conferenceRoom_1');
  if (!bim) throw new Error('Area_1_conferenceRoom_1 missing from bim_data.json');
  const wall = (id: number) => bim.walls.find((w) => w.id === id)!;
  const layout = buildRoomLayout(bim)!;

  it('builds a layout', () => {
    expect(layout).not.toBeNull();
  });

  it('uses the outermost walls as sides and Wall_5 as the step wall', () => {
    expect(layout.wallIds).toEqual({ left: 3, right: 4, back: 2, front: 1, step: 5 });
  });

  it('ignores Wall_6, the low plane in front of the back wall', () => {
    const w6 = wall(6);
    expect(w6.orientation).toBe('E-W');
    expect(w6.height).toBeLessThan(1);
    expect(Object.values(layout.wallIds)).not.toContain(6);
    expect(layout.backZ).toBeLessThan(w6.min[2]);
  });

  it('places the perimeter in the viewer frame', () => {
    expect(layout.leftX).toBeCloseTo(-2.6115, 3);
    expect(layout.rightX).toBeCloseTo(2.553, 3);
    expect(layout.backZ).toBeCloseTo(-2.1805, 3);
    expect(layout.frontZ).toBeCloseTo(2.1985, 3);
  });

  it('detects the lowered section on the right', () => {
    expect(layout.step).not.toBeNull();
    expect(layout.step!.side).toBe('right');
    expect(layout.step!.x).toBeCloseTo(2.0795, 3);
    expect(layout.step!.x).toBeGreaterThan(layout.leftX);
    expect(layout.step!.x).toBeLessThan(layout.rightX);
  });

  it('measures heights from the floor plane to the wall tops', () => {
    // Floor plane (room.center y) sits 4.5 cm above the scan's lowest point
    expect(layout.floorY).toBeCloseTo(0.045, 3);
    expect(layout.mainHeight).toBeCloseTo(3.121, 3); // top of Wall_5
    expect(layout.step!.recessHeight).toBeCloseTo(2.193, 3); // top of Wall_4
  });

  it('agrees with the room block measured independently by the pipeline', () => {
    const room = bim.room!;
    // Ceiling plane vs wall tops: two independent estimates of the same height
    expect(Math.abs(layout.mainHeight - room.ceiling_height)).toBeLessThan(0.03);
    // The floor runs under the wall surfaces, so its extent is slightly larger
    const width = layout.rightX - layout.leftX;
    const depth = layout.frontZ - layout.backZ;
    expect(room.width - width).toBeGreaterThanOrEqual(0);
    expect(room.width - width).toBeLessThan(0.15);
    expect(room.depth - depth).toBeGreaterThanOrEqual(0);
    expect(room.depth - depth).toBeLessThan(0.15);
  });

  it('applies the viewer floor shift to vertical positions only', () => {
    const viewerFloorY = bim.centering_offset!.y + 0.02;
    const shifted = buildRoomLayout(bim, { viewerFloorY })!;
    expect(shifted.floorY).toBeCloseTo(layout.floorY - 0.02, 6);
    expect({ ...shifted, floorY: 0 }).toEqual({ ...layout, floorY: 0 });
  });
});

describe('findBimRoom', () => {
  it('finds a room by its full name', () => {
    expect(findBimRoom(bimDataJson, 'Area_1_conferenceRoom_1')?.walls).toHaveLength(6);
  });

  it('returns null for an unknown room or a file that is not a list', () => {
    expect(findBimRoom(bimDataJson, 'conferenceRoom_1')).toBeNull();
    expect(findBimRoom({ name: 'Area_1_conferenceRoom_1' }, 'Area_1_conferenceRoom_1')).toBeNull();
    expect(findBimRoom(null, 'x')).toBeNull();
    expect(findBimRoom([null, 3, { name: 'x' }], 'x')).toEqual({ name: 'x' });
  });
});

// ============================================================================
// SYNTHETIC ROOMS
// ============================================================================

let nextId = 1;

/** A wall at `pos` (x for N-S, z for E-W), spanning `from..to` along it. */
function makeWall(
  orientation: WallOrientation,
  pos: number,
  { from = -2, to = 2, bottom = 0, top = 3 } = {}
): BimWall {
  const t = 0.05; // half thickness of the inlier band
  const along: [number, number] = [from, to];
  const min = orientation === 'N-S' ? [pos - t, bottom, along[0]] : [along[0], bottom, pos - t];
  const max = orientation === 'N-S' ? [pos + t, top, along[1]] : [along[1], top, pos + t];
  const id = nextId++;
  return {
    id,
    name: `Wall_${id}`,
    length: to - from,
    height: top - bottom,
    area: (to - from) * (top - bottom),
    orientation,
    centroid: [(min[0] + max[0]) / 2, (bottom + top) / 2, (min[2] + max[2]) / 2],
    min,
    max,
    point_count: 1000,
  };
}

const ns = (x: number, opts?: Parameters<typeof makeWall>[2]) => makeWall('N-S', x, opts);
const ew = (z: number, opts?: Parameters<typeof makeWall>[2]) => makeWall('E-W', z, opts);

/** 4 m x 4 m room, floor at y = 0, 3 m walls, scan frame == viewer frame. */
function makeRoom(walls: BimWall[], overrides: Partial<BimRoom> = {}): BimRoom {
  return {
    name: 'Area_1_synthetic',
    point_count: 0,
    planes_detected: walls.length,
    centering_offset: { x: 0, y: 0, z: 0 },
    walls,
    room: {
      width: 4,
      depth: 4,
      floor_area: 16,
      ceiling_height: 3,
      volume: 48,
      perimeter: 16,
      center: [0, 0, 0],
      bounds: { min: [-2, 0, -2], max: [2, 0, 2] },
    },
    classification: { floor_count: 1, ceiling_count: 1, wall_count: walls.length },
    ...overrides,
  };
}

const box = () => [ns(-2), ns(2), ew(-2), ew(2)];

describe('buildRoomLayout on synthetic rooms', () => {
  it('builds a plain box without a step', () => {
    const layout = buildRoomLayout(makeRoom(box()))!;
    expect(layout).toMatchObject({
      leftX: -2,
      rightX: 2,
      backZ: -2,
      frontZ: 2,
      floorY: 0,
      mainHeight: 3,
      step: null,
    });
    expect(layout.wallIds.step).toBeNull();
  });

  it('detects a step on the left (mirror of conferenceRoom_1)', () => {
    const recess = ns(-2, { top: 2.2 });
    const stepWall = ns(-1.5, { top: 3.1 });
    const layout = buildRoomLayout(makeRoom([recess, stepWall, ns(2), ew(-2), ew(2)]))!;
    expect(layout.leftX).toBeCloseTo(-2);
    expect(layout.step).toEqual({ side: 'left', x: -1.5, recessHeight: 2.2 });
    expect(layout.wallIds.left).toBe(recess.id);
    expect(layout.wallIds.step).toBe(stepWall.id);
    // The step wall reaches the main ceiling, as Wall_5 does in conferenceRoom_1
    expect(layout.mainHeight).toBeCloseTo(3.1);
  });

  it('needs a ceiling drop of at least MIN_STEP_HEIGHT', () => {
    const small = buildRoomLayout(
      makeRoom([ns(-2), ns(1.6), ns(2, { top: 3 - MIN_STEP_HEIGHT + 0.01 }), ew(-2), ew(2)])
    )!;
    expect(small.step).toBeNull();

    const enough = buildRoomLayout(
      makeRoom([ns(-2), ns(1.6), ns(2, { top: 3 - MIN_STEP_HEIGHT - 0.01 }), ew(-2), ew(2)])
    )!;
    expect(enough.step?.side).toBe('right');
  });

  it('does not take a wall from the other half of the room as the step wall', () => {
    const layout = buildRoomLayout(
      makeRoom([ns(-2), ns(-0.5), ns(2, { top: 2.2 }), ew(-2), ew(2)])
    )!;
    expect(layout.step).toBeNull();
  });

  it('skips low planes between the recess wall and the step wall', () => {
    const cabinet = ns(1.8, { top: 0.8 });
    const stepWall = ns(1.4);
    const layout = buildRoomLayout(
      makeRoom([ns(-2), stepWall, cabinet, ns(2, { top: 2.2 }), ew(-2), ew(2)])
    )!;
    expect(layout.wallIds.step).toBe(stepWall.id);
    expect(layout.step!.x).toBeCloseTo(1.4);
  });

  it('uses only the right step when both sides have one', () => {
    const layout = buildRoomLayout(
      makeRoom([ns(-2, { top: 2.2 }), ns(-1.5), ns(1.5), ns(2, { top: 2.2 }), ew(-2), ew(2)])
    )!;
    expect(layout.step!.side).toBe('right');
    expect(layout.step!.x).toBeCloseTo(1.5);
  });

  it('ignores short fragments outside the room', () => {
    const frame = ew(2.4, { from: 0, to: 1 }); // 1 m, less than half of 4 m
    const front = ew(2);
    const layout = buildRoomLayout(makeRoom([...box().slice(0, 3), front, frame]))!;
    expect(layout.frontZ).toBeCloseTo(2);
    expect(layout.wallIds.front).toBe(front.id);
  });

  it('returns null when an orientation has fewer than two usable walls', () => {
    expect(buildRoomLayout(makeRoom([ns(-2), ns(2), ew(-2)]))).toBeNull();
    expect(buildRoomLayout(makeRoom([ns(-2), ew(-2), ew(2)]))).toBeNull();
    // Two E-W walls, but the second is only a fragment
    expect(
      buildRoomLayout(makeRoom([ns(-2), ns(2), ew(-2), ew(2, { from: 0, to: 1 })]))
    ).toBeNull();
    expect(buildRoomLayout(makeRoom([]))).toBeNull();
  });

  it('returns null for malformed data without walls', () => {
    const bad = { ...makeRoom(box()), walls: undefined } as unknown as BimRoom;
    expect(buildRoomLayout(bad)).toBeNull();
  });

  it('converts to the viewer frame with centering_offset', () => {
    const walls = [ns(9), ns(13), ew(-6), ew(-2)].map((w) => {
      // Raise everything by 10 m: a scan on an upper floor
      w.min[1] += 10;
      w.max[1] += 10;
      return w;
    });
    const layout = buildRoomLayout(
      makeRoom(walls, {
        centering_offset: { x: 11, y: 9.98, z: -4 },
        room: { ...makeRoom([]).room!, center: [11, 10, -4] },
      })
    )!;
    expect(layout.leftX).toBeCloseTo(-2);
    expect(layout.rightX).toBeCloseTo(2);
    expect(layout.backZ).toBeCloseTo(-2);
    expect(layout.frontZ).toBeCloseTo(2);
    expect(layout.floorY).toBeCloseTo(0.02);
    expect(layout.mainHeight).toBeCloseTo(3);
  });

  it('falls back to the scan floor without a room block', () => {
    const layout = buildRoomLayout(
      makeRoom(box(), { room: null, centering_offset: { x: 0, y: -0.1, z: 0 } })
    )!;
    expect(layout.floorY).toBe(0);
    expect(layout.mainHeight).toBeCloseTo(3.1);
  });

  it('treats a missing centering_offset as zero', () => {
    const layout = buildRoomLayout(makeRoom(box(), { centering_offset: undefined }))!;
    expect(layout.leftX).toBe(-2);
    expect(layout.floorY).toBe(0);
  });
});
