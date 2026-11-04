/**
 * @fileoverview BIM plane list tests
 *
 * Outlines are checked in world space (local outline -> rotation -> position)
 * so a wrong rotation or a mirrored L-shape shows up as a plane in the wrong
 * place, not just as different numbers.
 */

import { describe, it, expect } from 'vitest';
import bimDataJson from '../../../public/bim/bim_data.json';
import { buildRoomLayout, findBimRoom, type RoomLayout } from './roomLayout';
import {
  buildPlanes,
  snapCandidates,
  PLANE_NAMES,
  type PlaneSpec,
  type Vec2,
  type Vec3,
} from './planes';

// ============================================================================
// HELPERS
// ============================================================================

/** Rotate with three.js Euler 'XYZ' order: R = Rx * Ry * Rz, so Rz applies first. */
function rotate([ax, ay, az]: Vec3, [x, y, z]: Vec3): Vec3 {
  [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
  [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
  [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
  return [x, y, z];
}

/** Local outline point -> world. */
function toWorld(plane: PlaneSpec, [u, v]: Vec2): Vec3 {
  const [x, y, z] = rotate(plane.rotation, [u, v, 0]);
  return [x + plane.position[0], y + plane.position[1], z + plane.position[2]];
}

/** Direction of the plane's front face (local +Z) in world space. */
const normal = (plane: PlaneSpec) => rotate(plane.rotation, [0, 0, 1]);

function signedArea(outline: Vec2[]): number {
  return outline.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = outline[(i + 1) % outline.length];
    return sum + (x1 * y2 - x2 * y1) / 2;
  }, 0);
}

function worldBox(plane: PlaneSpec) {
  const pts = plane.outline.map((p) => toWorld(plane, p));
  const axis = (i: number) => [Math.min(...pts.map((p) => p[i])), Math.max(...pts.map((p) => p[i]))];
  return { x: axis(0), y: axis(1), z: axis(2), pts };
}

const byName = (planes: PlaneSpec[]) =>
  Object.fromEntries(planes.map((p) => [p.name, p])) as Record<string, PlaneSpec>;

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function expectRange(actual: number[], expected: number[], label: string) {
  expect(actual[0], label).toBeCloseTo(expected[0], 9);
  expect(actual[1], label).toBeCloseTo(expected[1], 9);
}

/** Checks that hold for every room: outlines, placement, orientation. */
function expectConsistentPlanes(layout: RoomLayout, planes: PlaneSpec[]) {
  const { leftX, rightX, backZ, frontZ, floorY, mainHeight, step } = layout;
  const top = floorY + mainHeight;
  const roomCenter: Vec3 = [(leftX + rightX) / 2, floorY + mainHeight / 2, (backZ + frontZ) / 2];

  for (const plane of planes) {
    // Counter-clockwise, centred, and as big as its width x height
    expect(signedArea(plane.outline), plane.name).toBeGreaterThan(0);
    const us = plane.outline.map((p) => p[0]);
    const vs = plane.outline.map((p) => p[1]);
    expect(Math.max(...us) - Math.min(...us), plane.name).toBeCloseTo(plane.width, 9);
    expect(Math.max(...vs) - Math.min(...vs), plane.name).toBeCloseTo(plane.height, 9);
    expect(Math.max(...us) + Math.min(...us), plane.name).toBeCloseTo(0, 9);
    expect(Math.max(...vs) + Math.min(...vs), plane.name).toBeCloseTo(0, 9);

    // Everything stays inside the room box
    const box = worldBox(plane);
    expect(box.x[0], plane.name).toBeGreaterThanOrEqual(leftX - 1e-9);
    expect(box.x[1], plane.name).toBeLessThanOrEqual(rightX + 1e-9);
    expect(box.z[0], plane.name).toBeGreaterThanOrEqual(backZ - 1e-9);
    expect(box.z[1], plane.name).toBeLessThanOrEqual(frontZ + 1e-9);
    expect(box.y[0], plane.name).toBeGreaterThanOrEqual(floorY - 1e-9);
    expect(box.y[1], plane.name).toBeLessThanOrEqual(top + 1e-9);

    // Front face points into the room (the floor up, ceilings down)
    const n = normal(plane);
    const toCenter = roomCenter.map((c, i) => c - plane.position[i]);
    const facing = plane.name === 'Floor' ? n[1] : plane.isHorizontal ? -n[1] : n[0] * toCenter[0] + n[2] * toCenter[2];
    expect(facing, plane.name).toBeGreaterThan(0);
  }

  const p = byName(planes);
  const flat = (name: string, axis: 0 | 1 | 2, value: number) =>
    expect(worldBox(p[name]).pts.every((pt) => near(pt[axis], value)), name).toBe(true);

  flat('Wall_Left', 0, leftX);
  flat('Wall_Right', 0, rightX);
  flat('Wall_Back', 2, backZ);
  flat('Wall_Front', 2, frontZ);
  flat('Ceiling', 1, top);
  flat('Floor', 1, floorY);
  expectRange(worldBox(p.Floor).x, [leftX, rightX], 'Floor');
  expectRange(worldBox(p.Wall_Left).z, [backZ, frontZ], 'Wall_Left');

  if (step) {
    const outerX = step.side === 'right' ? rightX : leftX;
    flat('Step_Wall', 0, step.x);
    flat('Step_Ceiling', 1, floorY + step.recessHeight);
    expect(worldBox(p.Step_Wall).y[0]).toBeCloseTo(floorY + step.recessHeight, 9);
    expect(worldBox(p.Step_Wall).y[1]).toBeCloseTo(top, 9);
    expectRange(worldBox(p.Step_Ceiling).x, [Math.min(step.x, outerX), Math.max(step.x, outerX)], 'Step_Ceiling');
    expectRange(worldBox(p.Ceiling).x, step.side === 'right' ? [leftX, step.x] : [step.x, rightX], 'Ceiling');

    // Back and front walls are low on the step side and full height elsewhere,
    // seen from the world (catches a mirrored front wall)
    for (const name of ['Wall_Back', 'Wall_Front']) {
      const { pts } = worldBox(p[name]);
      const heightAt = (x: number) =>
        Math.max(...pts.filter((pt) => near(pt[0], x)).map((pt) => pt[1]));
      expect(heightAt(outerX), name).toBeCloseTo(floorY + step.recessHeight, 9);
      expect(heightAt(step.side === 'right' ? leftX : rightX), name).toBeCloseTo(top, 9);
    }
  } else {
    expectRange(worldBox(p.Ceiling).x, [leftX, rightX], 'Ceiling');
  }
}

// ============================================================================
// REAL DATA: Area_1_conferenceRoom_1
// ============================================================================

describe('buildPlanes on bim_data.json (conferenceRoom_1)', () => {
  const layout = buildRoomLayout(findBimRoom(bimDataJson, 'Area_1_conferenceRoom_1')!)!;
  const planes = buildPlanes(layout);
  const p = byName(planes);

  it('lists the eight planes in sidebar order', () => {
    expect(planes.map((pl) => pl.name)).toEqual([...PLANE_NAMES]);
    expect(planes.filter((pl) => pl.isHorizontal).map((pl) => pl.name)).toEqual([
      'Step_Ceiling',
      'Ceiling',
      'Floor',
    ]);
  });

  it('has the sizes shown in the sidebar', () => {
    const sizes = Object.fromEntries(
      planes.map((pl) => [pl.name, [+pl.width.toFixed(3), +pl.height.toFixed(3)]])
    );
    expect(sizes).toEqual({
      Wall_Left: [4.379, 3.121],
      Wall_Right: [4.379, 2.193],
      Wall_Back: [5.164, 3.121],
      Wall_Front: [5.164, 3.121],
      Step_Wall: [4.379, 0.928],
      Step_Ceiling: [0.474, 4.379],
      Ceiling: [4.691, 4.379],
      Floor: [5.164, 4.379],
    });
  });

  it('splits the floor width between the ceiling and the step ceiling', () => {
    expect(p.Ceiling.width + p.Step_Ceiling.width).toBeCloseTo(p.Floor.width, 9);
  });

  it('places every plane on the room it describes', () => {
    expectConsistentPlanes(layout, planes);
  });

  it('keeps the L-shapes and rotations of the previous overlay', () => {
    // Previous overlay: outline with its origin on the floor, step on the right.
    // Ours is centred, so shift it down by half the wall height.
    const { leftX, rightX, mainHeight: h, step } = layout;
    const halfW = (rightX - leftX) / 2;
    const stepWidth = step!.x - leftX;
    const rh = step!.recessHeight;
    const down = (pts: Vec2[]) => pts.map(([x, y]) => [x, y - h / 2]);

    const previousBack: Vec2[] = [
      [-halfW, 0], [halfW, 0], [halfW, rh], [-halfW + stepWidth, rh], [-halfW + stepWidth, h], [-halfW, h],
    ];
    const previousFront: Vec2[] = [
      [-halfW, 0], [halfW, 0], [halfW, h], [halfW - stepWidth, h], [halfW - stepWidth, rh], [-halfW, rh],
    ];
    const sameShape = (a: Vec2[], b: number[][]) => {
      expect(a).toHaveLength(b.length);
      // Same vertices, possibly starting from another one
      const key = (pt: number[]) => pt.map((c) => c.toFixed(9)).join(',');
      expect(new Set(a.map(key))).toEqual(new Set(b.map(key)));
    };
    sameShape(p.Wall_Back.outline, down(previousBack));
    sameShape(p.Wall_Front.outline, down(previousFront));

    expect(Object.fromEntries(planes.map((pl) => [pl.name, pl.rotation]))).toEqual({
      Wall_Left: [0, Math.PI / 2, 0],
      Wall_Right: [0, -Math.PI / 2, 0],
      Wall_Back: [0, 0, 0],
      Wall_Front: [0, Math.PI, 0],
      Step_Wall: [0, -Math.PI / 2, 0],
      Step_Ceiling: [Math.PI / 2, 0, 0],
      Ceiling: [Math.PI / 2, 0, 0],
      Floor: [-Math.PI / 2, 0, 0],
    });
  });
});

// ============================================================================
// SYNTHETIC LAYOUTS
// ============================================================================

const boxLayout: RoomLayout = {
  leftX: -2,
  rightX: 3,
  backZ: -1.5,
  frontZ: 2.5,
  floorY: 0,
  mainHeight: 3,
  step: null,
  wallIds: { left: 1, right: 2, back: 3, front: 4, step: null },
};

describe('buildPlanes on synthetic layouts', () => {
  it('drops the step planes in a room without a step', () => {
    const planes = buildPlanes(boxLayout);
    expect(planes.map((pl) => pl.name)).toEqual([
      'Wall_Left', 'Wall_Right', 'Wall_Back', 'Wall_Front', 'Ceiling', 'Floor',
    ]);
    const p = byName(planes);
    expect(p.Wall_Back.outline).toHaveLength(4);
    expect(p.Wall_Right.height).toBe(3);
    expect(p.Ceiling.width).toBe(5);
    expectConsistentPlanes(boxLayout, planes);
  });

  it('mirrors everything for a step on the left', () => {
    const layout: RoomLayout = { ...boxLayout, step: { side: 'left', x: -1.4, recessHeight: 2.2 } };
    const planes = buildPlanes(layout);
    expect(planes.map((pl) => pl.name)).toEqual([...PLANE_NAMES]);
    const p = byName(planes);
    expect([p.Wall_Left.height, p.Wall_Right.height]).toEqual([2.2, 3]);
    expect(p.Step_Wall.height).toBeCloseTo(0.8, 9);
    expect(p.Step_Ceiling.width).toBeCloseTo(0.6, 9);
    expect(p.Ceiling.width).toBeCloseTo(4.4, 9);
    expect(p.Step_Wall.rotation).toEqual([0, Math.PI / 2, 0]);
    expect(signedArea(p.Wall_Back.outline)).toBeCloseTo(5 * 3 - 0.6 * 0.8, 9);
    expectConsistentPlanes(layout, planes);
  });

  it('moves planes with the floor level without changing their sizes', () => {
    const stepped: RoomLayout = { ...boxLayout, step: { side: 'right', x: 2.5, recessHeight: 2.2 } };
    const base = buildPlanes(stepped);
    const raised = buildPlanes({ ...stepped, floorY: 0.04 });
    raised.forEach((pl, i) => {
      expect(pl.position[1] - base[i].position[1]).toBeCloseTo(0.04, 9);
      expect({ ...pl, position: [pl.position[0], 0, pl.position[2]] }).toEqual({
        ...base[i],
        position: [base[i].position[0], 0, base[i].position[2]],
      });
    });
    expectConsistentPlanes({ ...stepped, floorY: 0.04 }, raised);
  });
});

// ============================================================================
// MEASUREMENT SNAP TARGETS
// ============================================================================

/**
 * The click handler of the previous BIMOverlay.tsx, copied as it was, with
 * THREE.Vector3 replaced by arrays. Its floor was always at Y = 0.
 */
function previousSnap(
  g: {
    leftX: number; stepX: number | null; recessX: number; backZ: number; frontZ: number;
    mainHeight: number; recessHeight: number; hasStep: boolean;
  },
  rotation: Vec3,
  point: { x: number; y: number; z: number }
): Record<string, Vec3> {
  const candidates: Record<string, Vec3> = {};
  const { leftX, stepX, recessX, backZ, frontZ, mainHeight, recessHeight, hasStep } = g;
  const yRotation = rotation[1];
  const isWallPerpendicularToX = Math.abs(Math.sin(yRotation)) > 0.7;
  const isInRecessArea = hasStep && stepX && point.x > stepX;
  const ceilingY = isInRecessArea ? recessHeight : mainHeight;
  candidates['w'] = [point.x, ceilingY, point.z];
  candidates['s'] = [point.x, 0, point.z];
  if (isWallPerpendicularToX) {
    candidates['a'] = [point.x, point.y, frontZ];
    candidates['d'] = [point.x, point.y, backZ];
    const midX = (leftX + recessX) / 2;
    if (point.x > midX) {
      candidates[' '] = [leftX, point.y, point.z];
    } else {
      const rightTarget = (isInRecessArea && stepX) ? stepX : recessX;
      candidates[' '] = [rightTarget, point.y, point.z];
    }
  } else {
    candidates['a'] = [recessX, point.y, point.z];
    const leftTarget = (isInRecessArea && stepX) ? stepX : leftX;
    candidates['d'] = [leftTarget, point.y, point.z];
    const midZ = (frontZ + backZ) / 2;
    if (point.z > midZ) {
      candidates[' '] = [point.x, point.y, backZ];
    } else {
      candidates[' '] = [point.x, point.y, frontZ];
    }
  }
  return candidates;
}

/** Points spread over a plane's bounding rectangle, in world space. */
function samplePoints(plane: PlaneSpec): Vec3[] {
  const steps = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1];
  return steps.flatMap((fu) =>
    steps.map((fv) => toWorld(plane, [(fu - 0.5) * plane.width, (fv - 0.5) * plane.height]))
  );
}

const mirrorX = ([x, y, z]: Vec3): Vec3 => [-x, y, z];

describe('snapCandidates', () => {
  const bim = findBimRoom(bimDataJson, 'Area_1_conferenceRoom_1')!;
  // Floor at Y = 0, like the previous overlay
  const layout = buildRoomLayout(bim, { viewerFloorY: bim.room!.center[1] })!;
  const planes = buildPlanes(layout);

  it('matches the previous overlay on every plane of conferenceRoom_1', () => {
    expect(layout.floorY).toBe(0);
    const previousGeometry = {
      leftX: layout.leftX,
      stepX: layout.step!.x,
      recessX: layout.rightX,
      backZ: layout.backZ,
      frontZ: layout.frontZ,
      mainHeight: layout.mainHeight,
      recessHeight: layout.step!.recessHeight,
      hasStep: true,
    };
    let checked = 0;
    for (const plane of planes) {
      for (const point of samplePoints(plane)) {
        const [x, y, z] = point;
        expect(snapCandidates(layout, plane, point), `${plane.name} at ${point}`).toEqual(
          previousSnap(previousGeometry, plane.rotation, { x, y, z })
        );
        checked++;
      }
    }
    expect(checked).toBe(8 * 49);
  });

  it('uses the lowered ceiling and stops at the step wall inside the recess', () => {
    const p = byName(planes);
    const inRecess: Vec3 = [2.3, 1, 0]; // between the step wall and the right wall
    const onFloor = snapCandidates(layout, p.Floor, [2.3, 0, 0]);
    expect(onFloor.w[1]).toBeCloseTo(layout.step!.recessHeight, 9);
    expect(onFloor.d[0]).toBe(layout.step!.x);
    expect(onFloor.a[0]).toBe(layout.rightX);
    // Outside the recess, D goes all the way to the left wall
    expect(snapCandidates(layout, p.Floor, [0, 0, 0]).d[0]).toBe(layout.leftX);
    expect(snapCandidates(layout, p.Wall_Back, inRecess).w[1]).toBeCloseTo(
      layout.step!.recessHeight,
      9
    );
  });

  it('snaps to the floor and ceilings at the floor level', () => {
    const raised = { ...layout, floorY: 0.04 };
    const p = byName(buildPlanes(raised));
    const c = snapCandidates(raised, p.Wall_Left, [layout.leftX, 1.2, 0.5]);
    expect(c.s).toEqual([layout.leftX, 0.04, 0.5]);
    expect(c.w[1]).toBeCloseTo(0.04 + layout.mainHeight, 9);
    // Horizontal moves keep the clicked height
    expect(c.a[1]).toBe(1.2);
    expect(c[' '][1]).toBe(1.2);
  });

  it('mirrors A and D for a step on the left', () => {
    const right: RoomLayout = {
      ...boxLayout,
      leftX: -2.5,
      rightX: 2.5,
      step: { side: 'right', x: 2, recessHeight: 2.2 },
    };
    const left: RoomLayout = { ...right, step: { side: 'left', x: -2, recessHeight: 2.2 } };
    const rightPlanes = buildPlanes(right);
    const leftPlanes = byName(buildPlanes(left));

    for (const plane of rightPlanes) {
      // Same plane on the other side: the left/right walls swap names
      const twin =
        leftPlanes[
          plane.name === 'Wall_Left' ? 'Wall_Right' : plane.name === 'Wall_Right' ? 'Wall_Left' : plane.name
        ];
      for (const point of samplePoints(plane)) {
        const r = snapCandidates(right, plane, point);
        const l = snapCandidates(left, twin, mirrorX(point));
        const label = `${plane.name} at ${point}`;
        expect(l.w, label).toEqual(mirrorX(r.w));
        expect(l.s, label).toEqual(mirrorX(r.s));
        expect(l[' '], label).toEqual(mirrorX(r[' ']));
        if (Math.abs(Math.sin(plane.rotation[1])) > 0.7) {
          expect(l.a, label).toEqual(mirrorX(r.a));
          expect(l.d, label).toEqual(mirrorX(r.d));
        } else {
          // A goes to +X and D to -X, so mirroring swaps them
          expect(l.a, label).toEqual(mirrorX(r.d));
          expect(l.d, label).toEqual(mirrorX(r.a));
        }
      }
    }
  });
});
