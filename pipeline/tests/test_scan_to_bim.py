"""
Tests for pipeline/scan_to_bim.py

The real S3DIS scans are not part of the repository, so every test works on a
small synthetic "box room" written in the same binary PLY layout produced by
pipeline/process_semantic.py (18 bytes per vertex).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

import scan_to_bim

PIPELINE_DIR = Path(scan_to_bim.__file__).resolve().parent

# Contract consumed by src/features/viewer/BIMOverlay.tsx - key names AND order
ROOM_RESULT_KEYS = [
    "name", "point_count", "planes_detected", "centering_offset",
    "walls", "room", "classification",
]
WALL_KEYS = [
    "length", "height", "area", "orientation", "centroid", "min", "max",
    "point_count", "id", "name",
]
# Room width/depth come from the floor plane's bounding box. Whichever plane
# RANSAC finds first (a wall or the floor) claims the shared edge points
# within its 2 cm band, so dimensions can be short by up to ~3 cm per side.
DIM_TOL = 0.08

ROOM_KEYS = [
    "width", "depth", "floor_area", "ceiling_height", "volume", "perimeter",
    "center", "bounds",
]
CLASSIFICATION_KEYS = ["floor_count", "ceiling_count", "wall_count"]


# ----------------------------------------------------------------------------
# Synthetic scan helpers
# ----------------------------------------------------------------------------

def write_ply(path: Path, points: np.ndarray) -> None:
    """Write points using the custom binary PLY layout of process_semantic.py."""
    count = len(points)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {count}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "property uchar label\n"
        "property uint16 objectId\n"
        "end_header\n"
    )
    data = np.zeros(count, dtype=[
        ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
        ("r", "u1"), ("g", "u1"), ("b", "u1"),
        ("label", "u1"), ("objectId", "<u2"),
    ])
    if count:
        data["x"] = points[:, 0]
        data["y"] = points[:, 1]
        data["z"] = points[:, 2]
    with open(path, "wb") as f:
        f.write(header.encode("ascii"))
        f.write(data.tobytes())


POINTS_PER_FACE = 1500

# A table top: horizontal rectangle inside every test room (all rooms are at
# least 3 m x 3 m, so it fits with margin). Dense enough to pass the
# min_points=1000 threshold used by process_room, i.e. it WILL be found as a
# plane, just like real furniture is.
TABLE_HEIGHT = 0.75
TABLE_SIZE = (1.2, 0.8)        # x, z extent in metres
TABLE_CENTER = (0.5, -0.3)     # x, z
TABLE_POINTS = 1200

# The left wall (x = -width/2) is "thick": a second layer of points sits
# THICK_WALL_OFFSET behind the first one (panelling, skirting, a scan seeing
# both the plaster and the frame...). RANSAC's 2 cm threshold cannot cover
# both layers, so the wall is detected as two parallel planes that the
# pipeline has to merge back into one wall.
THICK_WALL_OFFSET = 0.05
THICK_WALL_POINTS = 1500

NOISE_SIGMA = 0.003  # well inside the 2 cm RANSAC threshold

Range = "float | tuple[float, float]"


def rect_points(rng, count: int, x, y, z) -> np.ndarray:
    """
    Uniformly sample `count` points in an axis-aligned rectangle. Each of
    x, y, z is either a fixed value or a (lo, hi) range. Gaussian noise added.
    """
    pts = np.empty((count, 3))
    for axis, spec in enumerate((x, y, z)):
        if isinstance(spec, tuple):
            pts[:, axis] = rng.uniform(spec[0], spec[1], count)
        else:
            pts[:, axis] = spec
    pts += rng.normal(0.0, NOISE_SIGMA, pts.shape)
    return pts


def box_room_points(width: float, height: float, depth: float,
                    per_face: int, seed: int,
                    table_points: int = TABLE_POINTS,
                    thick_wall_points: int = THICK_WALL_POINTS,
                    ceiling_y: float = None,
                    with_ceiling: bool = True,
                    extra=()) -> np.ndarray:
    """
    Sample points on the 6 faces of an axis-aligned room (Y up), centred on
    the origin in XZ with the floor at y=0 and walls up to `height`, plus a
    table top at TABLE_HEIGHT (table_points=0 for none) and a second layer
    on the left wall (thick_wall_points=0 for a plain wall).

    ceiling_y: height of the ceiling plane (default: same as the walls). A
               lower value mimics a dropped ceiling with walls continuing above.
    with_ceiling=False: no ceiling at all (open top / unscanned ceiling).
    extra: additional point arrays (see rect_points) stacked into the scan.
    """
    rng = np.random.default_rng(seed)
    hw, hd = width / 2, depth / 2
    if ceiling_y is None:
        ceiling_y = height
    xr, yr, zr = (-hw, hw), (0.0, height), (-hd, hd)

    parts = [
        rect_points(rng, per_face, xr, 0.0, zr),    # floor
        rect_points(rng, per_face, -hw, yr, zr),    # walls with normal along X -> "N-S"
        rect_points(rng, per_face, hw, yr, zr),
        rect_points(rng, per_face, xr, yr, -hd),    # walls with normal along Z -> "E-W"
        rect_points(rng, per_face, xr, yr, hd),
    ]
    if with_ceiling:
        parts.append(rect_points(rng, per_face, xr, ceiling_y, zr))
    if table_points:
        (tx, tz), (tw, td) = TABLE_CENTER, TABLE_SIZE
        parts.append(rect_points(rng, table_points,
                                 (tx - tw / 2, tx + tw / 2), TABLE_HEIGHT,
                                 (tz - td / 2, tz + td / 2)))
    if thick_wall_points:
        # Stops short of floor/ceiling so it only interacts with the wall logic
        parts.append(rect_points(rng, thick_wall_points, -hw - THICK_WALL_OFFSET,
                                 (0.1, height - 0.1), zr))
    parts.extend(extra)
    return np.vstack(parts)


ROOMS = {
    # name: (width, height, depth)
    "Area_1_room_a": (4.0, 2.5, 3.0),
    "Area_1_room_b": (5.0, 2.5, 4.0),
    "Area_1_room_c": (3.0, 2.5, 3.0),
}


@pytest.fixture(scope="session")
def scan_dir(tmp_path_factory) -> Path:
    """Directory with three synthetic rooms (sorted order: a, b, c)."""
    folder = tmp_path_factory.mktemp("scans")
    for i, (name, (w, h, d)) in enumerate(ROOMS.items()):
        write_ply(folder / f"{name}.ply",
                  box_room_points(w, h, d, per_face=POINTS_PER_FACE, seed=100 + i))
    (folder / "notes.txt").write_text("not a scan")
    return folder


@pytest.fixture(scope="session")
def batch_result(scan_dir, tmp_path_factory):
    """Default run (seed=42, max_rooms=2) over scan_dir, computed once."""
    out = tmp_path_factory.mktemp("out") / "bim_data.json"
    results = scan_to_bim.run_pipeline(str(scan_dir), str(out), seed=42, max_rooms=2)
    return results, out


# ----------------------------------------------------------------------------
# Import behaviour
# ----------------------------------------------------------------------------

def test_import_has_no_side_effects(tmp_path):
    """Importing the module must not create folders or touch the filesystem."""
    env = dict(os.environ, PYTHONPATH=str(PIPELINE_DIR))
    proc = subprocess.run(
        [sys.executable, "-c", "import scan_to_bim"],
        cwd=tmp_path, env=env, capture_output=True, text=True, check=True,
    )
    assert proc.stdout == ""
    assert list(tmp_path.iterdir()) == []


def test_defaults_match_original_hardcoded_paths():
    assert scan_to_bim.DEFAULT_INPUT == "public/scans"
    assert Path(scan_to_bim.DEFAULT_OUTPUT) == Path("public/bim/bim_data.json")
    assert scan_to_bim.DEFAULT_MAX_ROOMS == 2


# ----------------------------------------------------------------------------
# PLY loading
# ----------------------------------------------------------------------------

def test_load_ply_points_roundtrip(tmp_path):
    original = np.array([[0.5, -1.25, 3.0], [1e-3, 2.0, -7.5], [10.0, 0.0, 0.125]])
    ply = tmp_path / "scan.ply"
    write_ply(ply, original)

    loaded = scan_to_bim.load_ply_points(str(ply))

    assert loaded.dtype == np.float64
    np.testing.assert_allclose(loaded, original, rtol=1e-6)


def test_load_ply_points_empty_file(tmp_path):
    ply = tmp_path / "empty.ply"
    write_ply(ply, np.empty((0, 3)))
    assert scan_to_bim.load_ply_points(str(ply)).size == 0


# ----------------------------------------------------------------------------
# Input resolution
# ----------------------------------------------------------------------------

def test_collect_ply_files_directory_is_sorted_and_filtered(scan_dir):
    files = scan_to_bim.collect_ply_files(str(scan_dir))
    assert [Path(f).name for f in files] == [f"{n}.ply" for n in sorted(ROOMS)]


def test_collect_ply_files_accepts_single_file(scan_dir):
    single = scan_dir / "Area_1_room_b.ply"
    assert scan_to_bim.collect_ply_files(str(single)) == [str(single)]


def test_collect_ply_files_missing_path_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        scan_to_bim.collect_ply_files(str(tmp_path / "nope"))


# ----------------------------------------------------------------------------
# Geometry extraction
# ----------------------------------------------------------------------------

def test_process_room_recovers_box_geometry(batch_result):
    results, _ = batch_result
    result = results[0]
    width, height, depth = ROOMS["Area_1_room_a"]

    assert result["name"] == "Area_1_room_a"
    assert result["point_count"] == 6 * POINTS_PER_FACE + TABLE_POINTS + THICK_WALL_POINTS
    assert result["classification"]["floor_count"] >= 1
    assert result["classification"]["ceiling_count"] == 1
    assert result["classification"]["wall_count"] == 4
    assert result["classification"]["wall_count"] == len(result["walls"])

    orientations = {w["orientation"] for w in result["walls"]}
    assert orientations == {"N-S", "E-W"}

    room = result["room"]
    assert room["width"] == pytest.approx(width, abs=DIM_TOL)
    assert room["depth"] == pytest.approx(depth, abs=DIM_TOL)
    assert room["ceiling_height"] == pytest.approx(height, abs=0.02)
    assert room["floor_area"] == pytest.approx(width * depth, abs=0.5)

    offset = result["centering_offset"]   # bbox centre; the thick wall layer shifts x
    assert offset["x"] == pytest.approx(-THICK_WALL_OFFSET / 2, abs=0.02)
    assert offset["y"] == pytest.approx(0.0, abs=0.02)
    assert offset["z"] == pytest.approx(0.0, abs=0.02)


def test_table_top_is_detected_as_plane(scan_dir):
    """Sanity check for the furniture tests below: the table must be a plane."""
    points = scan_to_bim.load_ply_points(str(scan_dir / "Area_1_room_a.ply"))
    planes = scan_to_bim.detect_all_planes(
        points, max_planes=15, min_points=1000, rng=np.random.default_rng(42)
    )
    horizontal = [
        p for p in planes
        if abs(p["normal"][1]) / np.linalg.norm(p["normal"]) > 0.8
    ]
    table_like = [p for p in horizontal
                  if abs(p["centroid"][1] - TABLE_HEIGHT) < 0.05]
    assert len(table_like) == 1, [p["centroid"] for p in horizontal]
    assert table_like[0]["point_count"] >= 1000


def test_furnished_room_still_has_single_floor(batch_result):
    """A table top (0.75 m) is a horizontal plane but it is NOT a floor."""
    results, _ = batch_result
    for result in results:
        assert result["classification"]["floor_count"] == 1, (
            f'{result["name"]}: floor_count='
            f'{result["classification"]["floor_count"]}'
        )


def run_room(tmp_path, name: str, points: np.ndarray, seed: int = 42) -> dict:
    ply = tmp_path / f"{name}.ply"
    write_ply(ply, points)
    return scan_to_bim.process_room(str(ply), seed=seed)


def test_room_on_upper_floor_is_still_a_room(tmp_path):
    """Same furnished room, but the scan sits at y=3.5 (an upper storey)."""
    width, height, depth = ROOMS["Area_1_room_a"]
    points = box_room_points(width, height, depth, POINTS_PER_FACE, seed=100)
    points[:, 1] += 3.5

    result = run_room(tmp_path, "Area_2_upper", points)

    assert result["classification"]["floor_count"] == 1
    assert result["classification"]["ceiling_count"] == 1
    assert result["classification"]["wall_count"] >= 4
    room = result["room"]
    assert room is not None
    assert room["width"] == pytest.approx(width, abs=DIM_TOL)
    assert room["depth"] == pytest.approx(depth, abs=DIM_TOL)
    assert room["ceiling_height"] == pytest.approx(height, abs=0.02)
    assert room["center"][1] == pytest.approx(3.5, abs=0.02)
    assert result["centering_offset"]["y"] == pytest.approx(3.5, abs=0.02)


def test_ceiling_height_uses_floor_to_ceiling_distance(tmp_path):
    """
    conferenceRoom_1 case: walls continue above a dropped ceiling. The room
    height must be the floor-to-ceiling distance, not the tallest wall.
    """
    wall_height, ceiling = 3.1, 2.2
    points = box_room_points(4.0, wall_height, 3.0, POINTS_PER_FACE, seed=100,
                             ceiling_y=ceiling)

    result = run_room(tmp_path, "Area_1_dropped", points)

    assert result["classification"]["floor_count"] == 1
    assert result["classification"]["ceiling_count"] == 1
    assert max(w["height"] for w in result["walls"]) > ceiling + 0.5
    assert result["room"]["ceiling_height"] == pytest.approx(ceiling, abs=0.02)
    assert result["room"]["volume"] == pytest.approx(
        result["room"]["floor_area"] * ceiling, abs=0.3)


def test_ceiling_height_falls_back_to_tallest_wall_without_ceiling(tmp_path):
    height = 2.5
    points = box_room_points(4.0, height, 3.0, POINTS_PER_FACE, seed=100,
                             with_ceiling=False)

    result = run_room(tmp_path, "Area_1_open", points)

    assert result["classification"]["floor_count"] == 1
    assert result["classification"]["ceiling_count"] == 0
    tallest_wall = max(w["height"] for w in result["walls"])
    assert result["room"]["ceiling_height"] == pytest.approx(tallest_wall, abs=1e-3)
    assert result["room"]["ceiling_height"] == pytest.approx(height, abs=0.1)


# ----------------------------------------------------------------------------
# Walls: merging fragments, keeping close real walls, dropping phantom planes
# ----------------------------------------------------------------------------

def assert_no_duplicate_walls(walls):
    """No two reported walls may be parallel and (almost) coplanar."""
    for i, a in enumerate(walls):
        for b in walls[i + 1:]:
            if a["orientation"] != b["orientation"]:
                continue
            axis = 0 if a["orientation"] == "N-S" else 2
            gap = abs(a["centroid"][axis] - b["centroid"][axis])
            assert gap > scan_to_bim.WALL_MERGE_MAX_DISTANCE, (a["name"], b["name"], gap)


def test_thick_wall_is_detected_as_two_planes(scan_dir):
    """Sanity check: the test room really does produce a duplicated wall."""
    points = scan_to_bim.load_ply_points(str(scan_dir / "Area_1_room_a.ply"))
    planes = scan_to_bim.detect_all_planes(
        points, max_planes=15, min_points=1000, rng=np.random.default_rng(42)
    )
    hw = ROOMS["Area_1_room_a"][0] / 2
    left = [p for p in planes
            if abs(p["normal"][0]) > 0.9 and abs(p["centroid"][0] + hw) < 0.1]
    assert len(left) == 2
    assert abs(left[0]["centroid"][0] - left[1]["centroid"][0]) == pytest.approx(
        THICK_WALL_OFFSET, abs=0.01)


def test_duplicate_wall_planes_are_merged(batch_result):
    results, _ = batch_result
    result = results[0]
    width, height, depth = ROOMS["Area_1_room_a"]

    assert result["planes_detected"] == 8       # 6 faces + table + 2nd wall layer
    assert len(result["walls"]) == 4
    assert_no_duplicate_walls(result["walls"])

    left = [w for w in result["walls"]
            if w["orientation"] == "N-S" and w["centroid"][0] < 0]
    assert len(left) == 1
    left = left[0]
    # Merged wall keeps the points of both layers and spans both of them
    assert left["point_count"] > 1.8 * POINTS_PER_FACE
    assert left["min"][0] == pytest.approx(-width / 2 - THICK_WALL_OFFSET, abs=0.03)
    assert left["max"][0] == pytest.approx(-width / 2, abs=0.03)
    assert left["length"] == pytest.approx(depth, abs=DIM_TOL)
    assert left["height"] == pytest.approx(height, abs=0.1)


def test_wall_ids_are_consecutive_after_merging(batch_result):
    results, _ = batch_result
    for result in results:
        assert [w["id"] for w in result["walls"]] == list(range(1, len(result["walls"]) + 1))


def test_step_and_recess_walls_stay_separate(tmp_path):
    """
    conferenceRoom_1 right side: a full-height step wall and, 0.3 m behind
    it, a shorter recess wall. Close and parallel, but two real walls.
    """
    width, height, depth = ROOMS["Area_1_room_a"]
    hw, hd = width / 2, depth / 2
    step_gap, recess_height = 0.3, 2.2
    rng = np.random.default_rng(7)
    recess_wall = rect_points(rng, POINTS_PER_FACE, hw + step_gap, (0.0, recess_height), (-hd, hd))
    points = box_room_points(width, height, depth, POINTS_PER_FACE, seed=100, extra=[recess_wall])

    result = run_room(tmp_path, "Area_1_step", points)

    assert len(result["walls"]) == 5
    assert_no_duplicate_walls(result["walls"])
    right = sorted((w for w in result["walls"] if w["orientation"] == "N-S" and w["centroid"][0] > 0),
                   key=lambda w: w["centroid"][0])
    assert len(right) == 2
    step, recess = right
    assert step["centroid"][0] == pytest.approx(hw, abs=0.02)
    assert recess["centroid"][0] == pytest.approx(hw + step_gap, abs=0.02)
    assert step["height"] == pytest.approx(height, abs=0.1)
    assert recess["height"] == pytest.approx(recess_height, abs=0.1)


def test_vertical_plane_through_the_room_is_not_a_wall(tmp_path):
    """A plane fitted through furniture in the middle of the room (conferenceRoom_1 walls 7/9)."""
    width, height, depth = ROOMS["Area_1_room_a"]
    hw = width / 2
    rng = np.random.default_rng(8)
    phantom = rect_points(rng, 1200, (-hw, hw), (0.0, height), -0.5)
    points = box_room_points(width, height, depth, POINTS_PER_FACE, seed=100, extra=[phantom])

    result = run_room(tmp_path, "Area_1_phantom", points)

    assert result["planes_detected"] == 9                 # the phantom was found...
    assert len(result["walls"]) == 4                      # ...but is not a wall
    ew_positions = [w["centroid"][2] for w in result["walls"] if w["orientation"] == "E-W"]
    assert len(ew_positions) == 2
    assert all(abs(z + 0.5) > 0.5 for z in ew_positions)   # only the z = +-1.5 walls


def test_tilted_plane_is_not_a_wall(tmp_path):
    """A surface 30 degrees off vertical (ramp, leaning board) is not a wall."""
    width, height, depth = ROOMS["Area_1_room_a"]
    hw = width / 2
    rng = np.random.default_rng(9)
    tilt = np.radians(30)
    u = rng.uniform(-hw, hw, 1200)
    v = rng.uniform(-1.0, 1.0, 1200)
    tilted = np.column_stack([u, height / 2 + v * np.cos(tilt), 0.3 + v * np.sin(tilt)])
    tilted += rng.normal(0.0, NOISE_SIGMA, tilted.shape)
    points = box_room_points(width, height, depth, POINTS_PER_FACE, seed=100, extra=[tilted])

    result = run_room(tmp_path, "Area_1_tilted", points)

    assert result["planes_detected"] == 9
    assert len(result["walls"]) == 4
    assert result["classification"]["floor_count"] == 1
    assert result["classification"]["ceiling_count"] == 1


# ----------------------------------------------------------------------------
# Wall refinement (unit level, no RANSAC)
# ----------------------------------------------------------------------------

def wall_plane(points: np.ndarray, indices: np.ndarray) -> dict:
    pts = points[indices]
    normal, d = scan_to_bim.fit_plane_svd(pts)
    return {"normal": normal, "d": d, "centroid": pts.mean(axis=0),
            "point_count": len(indices), "original_indices": indices, "type": "WALL"}


def test_are_same_wall_distance_and_angle():
    def plane(normal, centroid):
        return {"normal": np.array(normal, float), "centroid": np.array(centroid, float)}
    a = plane((1, 0, 0), (-2.0, 1.0, 0.0))
    assert scan_to_bim.are_same_wall(a, plane((-1, 0, 0), (-2.05, 0.5, 1.0)))    # flipped normal, 5 cm
    assert not scan_to_bim.are_same_wall(a, plane((1, 0, 0), (-1.6, 1.0, 0.0)))  # 40 cm step
    assert not scan_to_bim.are_same_wall(a, plane((0, 0, 1), (-2.0, 1.0, 0.0)))  # perpendicular
    assert not scan_to_bim.are_same_wall(a, plane((1, 0, 0), (-2.0, 1.0, 0.0)) | {
        "normal": np.array([np.cos(np.radians(20)), 0, np.sin(np.radians(20))])})


def test_merge_wall_planes_combines_fragments_and_keeps_order():
    rng = np.random.default_rng(1)
    points = np.vstack([
        rect_points(rng, 500, -2.0, (0, 2.5), (-1.5, 1.5)),    # wall A, upper+lower fragments
        rect_points(rng, 500, -2.04, (0, 2.5), (-1.5, 1.5)),   # wall A, second layer
        rect_points(rng, 500, 2.0, (0, 2.5), (-1.5, 1.5)),     # wall B
        rect_points(rng, 500, 2.4, (0, 2.2), (-1.5, 1.5)),     # wall C (recess, 40 cm away)
    ])
    idx = np.arange(2000).reshape(4, 500)
    walls = [wall_plane(points, i) for i in idx]

    merged = scan_to_bim.merge_wall_planes(walls, points)

    assert len(merged) == 3
    assert merged[0]["point_count"] == 1000
    assert merged[0]["merged_from"] == 2
    assert merged[0]["centroid"][0] == pytest.approx(-2.02, abs=0.01)
    assert set(merged[0]["original_indices"]) == set(range(1000))
    assert merged[1] is walls[2]
    assert merged[2] is walls[3]


def test_has_room_on_one_side():
    rng = np.random.default_rng(2)
    room = box_room_points(4.0, 2.5, 3.0, 400, seed=3, table_points=0, thick_wall_points=0)
    phantom = rect_points(rng, 400, (-2.0, 2.0), (0, 2.5), -0.5)
    recess = rect_points(rng, 400, 2.3, (0, 2.2), (-1.5, 1.5))
    points = np.vstack([room, phantom, recess])
    n = len(room)
    right_wall = wall_plane(points, np.arange(2 * 400, 3 * 400))   # x = +2.0, recess behind it
    phantom_plane = wall_plane(points, np.arange(n, n + 400))
    recess_plane = wall_plane(points, np.arange(n + 400, n + 800))

    assert scan_to_bim.has_room_on_one_side(right_wall, points)
    assert scan_to_bim.has_room_on_one_side(recess_plane, points)
    assert not scan_to_bim.has_room_on_one_side(phantom_plane, points)


# ----------------------------------------------------------------------------
# Plane classification (unit level, no RANSAC)
# ----------------------------------------------------------------------------

def fake_plane(normal, centroid_y: float) -> dict:
    return {"normal": np.array(normal, dtype=float),
            "centroid": np.array([0.0, centroid_y, 0.0]),
            "point_count": 1000}


UP, SIDE = (0.0, 1.0, 0.0), (1.0, 0.0, 0.0)


def cloud(min_y: float, max_y: float) -> np.ndarray:
    return np.array([[0.0, min_y, 0.0], [0.0, max_y, 0.0]])


def types(classified: dict) -> dict:
    return {k: len(v) for k, v in classified.items()}


def test_classify_table_between_floor_and_ceiling_is_other():
    planes = [fake_plane(UP, 0.0), fake_plane(UP, 2.5), fake_plane(UP, 0.75),
              fake_plane(SIDE, 1.2)]
    classified = scan_to_bim.classify_planes(planes, cloud(0.0, 2.5))
    assert types(classified) == {"FLOOR": 1, "CEILING": 1, "WALL": 1, "OTHER": 1}
    assert classified["OTHER"][0]["centroid"][1] == 0.75
    assert all(p["type"] for p in planes)


def test_classify_is_independent_of_absolute_height():
    for offset in (0.0, 3.5, -12.0):
        planes = [fake_plane(UP, offset), fake_plane(UP, offset + 2.5),
                  fake_plane(UP, offset + 0.75)]
        classified = scan_to_bim.classify_planes(planes, cloud(offset, offset + 2.5))
        assert types(classified) == {"FLOOR": 1, "CEILING": 1, "WALL": 0, "OTHER": 1}


def test_classify_groups_fragments_of_the_same_surface():
    planes = [fake_plane(UP, 0.0), fake_plane(UP, 0.01), fake_plane(UP, -0.02),
              fake_plane(UP, 2.5), fake_plane(UP, 2.49)]
    classified = scan_to_bim.classify_planes(planes, cloud(0.0, 2.5))
    assert types(classified) == {"FLOOR": 3, "CEILING": 2, "WALL": 0, "OTHER": 0}


def test_classify_single_low_level_is_floor_even_with_table():
    planes = [fake_plane(UP, 0.0), fake_plane(UP, 0.75)]  # no ceiling scanned
    classified = scan_to_bim.classify_planes(planes, cloud(0.0, 2.5))
    assert types(classified) == {"FLOOR": 1, "CEILING": 0, "WALL": 0, "OTHER": 1}


def test_classify_single_high_level_is_ceiling():
    planes = [fake_plane(UP, 2.5), fake_plane(SIDE, 1.2)]  # floor occluded
    classified = scan_to_bim.classify_planes(planes, cloud(0.0, 2.5))
    assert types(classified) == {"FLOOR": 0, "CEILING": 1, "WALL": 1, "OTHER": 0}


def test_classify_tilted_plane_is_other():
    tilt = np.radians(30)
    tilted = fake_plane((0.0, np.sin(tilt), np.cos(tilt)), 1.2)
    slightly_off = fake_plane((0.0, np.sin(np.radians(5)), np.cos(np.radians(5))), 1.2)
    classified = scan_to_bim.classify_planes([tilted, slightly_off], cloud(0.0, 2.5))
    assert types(classified) == {"FLOOR": 0, "CEILING": 0, "WALL": 1, "OTHER": 1}
    assert classified["WALL"][0] is slightly_off


def test_classify_no_horizontal_planes():
    classified = scan_to_bim.classify_planes([fake_plane(SIDE, 1.0)], cloud(0.0, 2.5))
    assert types(classified) == {"FLOOR": 0, "CEILING": 0, "WALL": 1, "OTHER": 0}


def test_output_json_schema_is_unchanged(batch_result):
    """BIMOverlay.tsx depends on these keys; guard the contract."""
    _, out = batch_result
    data = json.loads(out.read_text())

    assert isinstance(data, list)
    for entry in data:
        assert list(entry.keys()) == ROOM_RESULT_KEYS
        assert list(entry["centering_offset"].keys()) == ["x", "y", "z"]
        assert list(entry["classification"].keys()) == CLASSIFICATION_KEYS
        assert list(entry["room"].keys()) == ROOM_KEYS
        assert list(entry["room"]["bounds"].keys()) == ["min", "max"]
        for i, wall in enumerate(entry["walls"], start=1):
            assert list(wall.keys()) == WALL_KEYS
            assert wall["id"] == i
            assert wall["name"] == f"Wall_{i}"


# ----------------------------------------------------------------------------
# Determinism
# ----------------------------------------------------------------------------

def test_same_seed_and_input_give_identical_json(scan_dir, tmp_path):
    single = str(scan_dir / "Area_1_room_c.ply")
    out1, out2 = tmp_path / "run1.json", tmp_path / "run2.json"

    scan_to_bim.run_pipeline(single, str(out1), seed=7)
    scan_to_bim.run_pipeline(single, str(out2), seed=7)

    assert out1.read_bytes() == out2.read_bytes()


def test_single_file_result_matches_batch_entry(scan_dir, batch_result):
    """Each room only depends on (file, seed), not on its position in the batch."""
    results, _ = batch_result
    alone = scan_to_bim.process_room(str(scan_dir / "Area_1_room_b.ply"), seed=42)
    assert alone == results[1]


# ----------------------------------------------------------------------------
# Room limit
# ----------------------------------------------------------------------------

def test_default_max_rooms_keeps_first_two(batch_result):
    results, out = batch_result
    names = [r["name"] for r in json.loads(out.read_text())]
    assert names == ["Area_1_room_a", "Area_1_room_b"]
    assert [r["name"] for r in results] == names


def test_max_rooms_one(scan_dir, tmp_path):
    out = tmp_path / "one.json"
    results = scan_to_bim.run_pipeline(str(scan_dir), str(out), max_rooms=1)
    assert [r["name"] for r in results] == ["Area_1_room_a"]


def test_max_rooms_zero_means_all(scan_dir, tmp_path):
    out = tmp_path / "all.json"
    results = scan_to_bim.run_pipeline(str(scan_dir), str(out), max_rooms=0)
    assert [r["name"] for r in results] == sorted(ROOMS)


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------

def test_cli_defaults():
    args = scan_to_bim.build_arg_parser().parse_args([])
    assert args.input == scan_to_bim.DEFAULT_INPUT
    assert args.output == scan_to_bim.DEFAULT_OUTPUT
    assert args.seed == scan_to_bim.DEFAULT_SEED
    assert args.max_rooms == scan_to_bim.DEFAULT_MAX_ROOMS


def test_cli_flags_write_output_and_create_parent_dirs(scan_dir, tmp_path):
    out = tmp_path / "nested" / "dir" / "bim_data.json"
    code = scan_to_bim.main([
        "--input", str(scan_dir / "Area_1_room_a.ply"),
        "--output", str(out),
        "--seed", "3",
        "--max-rooms", "1",
    ])
    assert code == 0
    data = json.loads(out.read_text())
    assert [r["name"] for r in data] == ["Area_1_room_a"]


def test_cli_missing_input_returns_error_code(tmp_path, capsys):
    code = scan_to_bim.main(["--input", str(tmp_path / "missing"),
                             "--output", str(tmp_path / "out.json")])
    assert code == 1
    assert not (tmp_path / "out.json").exists()
    assert "does not exist" in capsys.readouterr().out


def test_cli_directory_without_ply_returns_error_code(tmp_path, capsys):
    empty = tmp_path / "empty"
    empty.mkdir()
    code = scan_to_bim.main(["--input", str(empty),
                             "--output", str(tmp_path / "out.json")])
    assert code == 1
    assert "No PLY files found" in capsys.readouterr().out


def test_cli_entrypoint_runs_as_script(scan_dir, tmp_path):
    out = tmp_path / "script.json"
    proc = subprocess.run(
        [sys.executable, str(PIPELINE_DIR / "scan_to_bim.py"),
         "--input", str(scan_dir), "--output", str(out), "--max-rooms", "1"],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert out.exists()
    assert "Results saved to" in proc.stdout
