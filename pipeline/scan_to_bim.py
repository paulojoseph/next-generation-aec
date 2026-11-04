"""
Elite Scan-to-BIM Pipeline
===========================
RANSAC Plane Detection + Wall Extraction + Room Segmentation

This script transforms raw LiDAR point clouds into measured BIM geometry:

  1. iterative RANSAC plane detection (hypotheses scored on a random subset,
     winner verified and refit on all points)
  2. classification relative to the scan: lowest horizontal level = floor,
     highest = ceiling, table tops / tilted surfaces ignored
  3. walls: fragments of the same wall merged, planes cutting through the
     middle of the room dropped
  4. measurements: walls, room footprint, floor-to-ceiling height

Dependencies: numpy
Output: a single JSON file (default: public/bim/bim_data.json) consumed by
        src/features/viewer/BIMOverlay.tsx

Usage:
    python pipeline/scan_to_bim.py                         # defaults below
    python pipeline/scan_to_bim.py --input public/scans --output public/bim/bim_data.json
    python pipeline/scan_to_bim.py --input room.ply --seed 7 --max-rooms 0

Importing this module has no side effects; the pipeline only runs via main()
or run_pipeline().
"""

import argparse
import glob
import json
import os
import sys
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

# Defaults (relative to the repo root, matching the original hardcoded paths)
DEFAULT_INPUT = "public/scans"
DEFAULT_OUTPUT = os.path.join("public", "bim", "bim_data.json")
DEFAULT_SEED = 42
DEFAULT_MAX_ROOMS = 2  # 0 = process every PLY found

# Kept for backwards compatibility with older imports
INPUT_DIR = DEFAULT_INPUT
OUTPUT_DIR = os.path.dirname(DEFAULT_OUTPUT)

# ============================================================================
# RANSAC PLANE DETECTION (Custom Implementation)
# ============================================================================

def fit_plane_svd(points: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Fit a plane to 3D points using SVD.
    Returns (normal_vector, d) where ax + by + cz + d = 0
    """
    # Ensure float64 for numerical stability
    points = points.astype(np.float64)
    centroid = points.mean(axis=0)
    centered = points - centroid
    
    # Check for degenerate cases
    if centered.shape[0] < 3:
        raise ValueError("Need at least 3 points")
    
    try:
        _, _, vh = np.linalg.svd(centered, full_matrices=False)
        normal = vh[-1]  # Last row of V^T is normal to plane
        d = -np.dot(normal, centroid)
        return normal, d
    except np.linalg.LinAlgError:
        raise ValueError("SVD failed")

def point_to_plane_distance(points: np.ndarray, normal: np.ndarray, d: float) -> np.ndarray:
    """Calculate distance from points to plane ax + by + cz + d = 0"""
    return np.abs(np.dot(points, normal) + d) / np.linalg.norm(normal)

# Hypotheses are scored on a random subset of this many points. The plane
# with the most inliers in the subset is, with overwhelming probability, the
# one with the most inliers overall, at a fraction of the cost. The winner is
# then verified and refit on ALL points.
SCORE_SAMPLE_SIZE = 20_000
# Hypotheses are evaluated in batches of this size (memory: sample x batch).
SCORE_BATCH_SIZE = 128

def ransac_plane(points: np.ndarray, 
                 threshold: float = 0.02,  # 2cm tolerance
                 iterations: int = 1000,
                 min_points: int = 100,
                 rng: Optional[np.random.Generator] = None,
                 sample_size: int = SCORE_SAMPLE_SIZE) -> Optional[Dict]:
    """
    RANSAC algorithm to detect a single plane in point cloud.

    `rng` controls the random sampling; pass a seeded Generator for
    reproducible results. Defaults to an unseeded Generator.
    
    Returns dict with:
        - normal: plane normal vector
        - d: plane equation constant
        - inliers: indices of points on this plane
        - centroid: center of plane
    """
    n = len(points)
    if n < min_points:
        return None
    
    if rng is None:
        rng = np.random.default_rng()
    
    # Subset used both to draw hypotheses from and to score them
    if n > sample_size:
        sample = points[rng.choice(n, sample_size, replace=False)]
    else:
        sample = points
    m = len(sample)
    
    # Generate all hypotheses at once: a plane through 3 random sample points.
    # Degenerate triples (repeated or collinear points) have a ~zero normal
    # and are dropped.
    idx = rng.integers(0, m, size=(iterations, 3))
    p0, p1, p2 = sample[idx[:, 0]], sample[idx[:, 1]], sample[idx[:, 2]]
    normals = np.cross(p1 - p0, p2 - p0)
    norms = np.linalg.norm(normals, axis=1)
    valid = norms > 1e-12
    if not np.any(valid):
        return None
    normals = normals[valid] / norms[valid, None]
    offsets = -np.einsum('ij,ij->i', normals, p0[valid])
    
    # Score hypotheses on the sample, in batches (first best wins on ties).
    # float32 is plenty here: the PLY stores float32 coordinates and the
    # winner is verified and refit in float64 below.
    sample32 = sample.astype(np.float32)
    normals32 = normals.astype(np.float32)
    offsets32 = offsets.astype(np.float32)
    best_count = -1
    best_normal = best_d = None
    for start in range(0, len(normals), SCORE_BATCH_SIZE):
        batch_normals = normals32[start:start + SCORE_BATCH_SIZE]
        batch_offsets = offsets32[start:start + SCORE_BATCH_SIZE]
        distances = np.abs(sample32 @ batch_normals.T + batch_offsets)
        counts = np.count_nonzero(distances < threshold, axis=0)
        j = int(np.argmax(counts))
        if counts[j] > best_count:
            best_count = int(counts[j])
            best_normal = normals[start + j]
            best_d = offsets[start + j]
    
    # Verify the winner against every point
    distances = point_to_plane_distance(points, best_normal, best_d)
    best_inliers = np.flatnonzero(distances < threshold)
    if len(best_inliers) < min_points:
        return None
    
    # Refit plane using all inliers for better accuracy
    inlier_points = points[best_inliers]
    final_normal, final_d = fit_plane_svd(inlier_points)
    
    return {
        'normal': final_normal,
        'd': final_d,
        'inliers': best_inliers,
        'centroid': inlier_points.mean(axis=0),
        'point_count': len(best_inliers)
    }

def detect_all_planes(points: np.ndarray, 
                      max_planes: int = 20,
                      min_points: int = 500,
                      rng: Optional[np.random.Generator] = None) -> List[Dict]:
    """
    Iteratively detect all major planes in point cloud.
    """
    if rng is None:
        rng = np.random.default_rng()
    
    planes = []
    remaining_points = points.copy()
    remaining_indices = np.arange(len(points))
    
    for i in range(max_planes):
        if len(remaining_points) < min_points:
            break
            
        plane = ransac_plane(remaining_points, min_points=min_points, rng=rng)
        if plane is None:
            break
        
        # Map back to original indices
        plane['original_indices'] = remaining_indices[plane['inliers']]
        planes.append(plane)
        
        # Remove inliers for next iteration (np.compress is much faster
        # than boolean row indexing for large (N, 3) arrays)
        mask = np.ones(len(remaining_points), dtype=bool)
        mask[plane['inliers']] = False
        remaining_points = np.compress(mask, remaining_points, axis=0)
        remaining_indices = np.compress(mask, remaining_indices)
        
        print(f"  Plane {i+1}: {plane['point_count']} points, normal={plane['normal'].round(3)}")
    
    return planes

# ============================================================================
# PLANE CLASSIFICATION
# ============================================================================

# A plane is horizontal when its normal is mostly along Y (Y is up).
HORIZONTAL_NORMAL_Y = 0.8
# Horizontal planes within this distance of the floor/ceiling level are treated
# as fragments of that floor/ceiling (RANSAC often splits a surface in pieces).
LEVEL_TOLERANCE = 0.3
# Minimum plausible floor-to-ceiling distance; two horizontal levels closer
# than this cannot be a floor and a ceiling (e.g. floor + table top).
MIN_CEILING_HEIGHT = 2.0
# A wall must be vertical: its normal may deviate this much from horizontal.
WALL_MAX_TILT_DEG = 10.0
# Two wall planes are fragments of the same wall when they are parallel
# (within this angle) and coplanar (within this distance). Keep the distance
# well below real wall offsets such as a step/recess (~0.4 m).
WALL_MERGE_MAX_ANGLE_DEG = 10.0
WALL_MERGE_MAX_DISTANCE = 0.10
# A real wall has the room on one side only. Within the wall's own footprint,
# at least this fraction of the points must lie on a single side; planes that
# cut through the middle of the room (clutter, furniture) fail this test.
WALL_MIN_ONE_SIDE_FRACTION = 0.75

def unit_normal(plane: Dict) -> np.ndarray:
    return plane['normal'] / np.linalg.norm(plane['normal'])

def is_horizontal(plane: Dict) -> bool:
    return abs(unit_normal(plane)[1]) > HORIZONTAL_NORMAL_Y

def is_vertical(plane: Dict) -> bool:
    return abs(unit_normal(plane)[1]) <= np.sin(np.radians(WALL_MAX_TILT_DEG))

def classify_planes(planes: List[Dict], points: np.ndarray) -> Dict[str, List[Dict]]:
    """
    Classify planes as FLOOR, CEILING, WALL or OTHER (furniture, shelves,
    tilted surfaces...).

    Vertical planes (tilt <= WALL_MAX_TILT_DEG) are wall candidates; see
    refine_walls() for merging and the mid-room filter. Planes that are
    neither vertical nor horizontal are OTHER. Horizontal planes are classified relative to
    each other instead of with absolute heights, so the result does not depend
    on where the scan sits in world space (upper floors, re-centred scans):

      * floor level   = the lowest horizontal plane
      * ceiling level = the highest horizontal plane, if it is at least
                        MIN_CEILING_HEIGHT above the floor level
      * horizontal planes within LEVEL_TOLERANCE of a level belong to it,
        anything else in between (table tops, shelves) is OTHER

    When only one level exists, it is a floor if it lies in the lower half of
    the point cloud's vertical extent and a ceiling otherwise.
    Each plane gets a 'type' key; the returned dict groups them by type.
    """
    classified: Dict[str, List[Dict]] = {'FLOOR': [], 'CEILING': [], 'WALL': [], 'OTHER': []}
    horizontal = []
    for plane in planes:
        if is_horizontal(plane):
            horizontal.append(plane)
        elif is_vertical(plane):
            plane['type'] = 'WALL'
            classified['WALL'].append(plane)
        else:
            plane['type'] = 'OTHER'
            classified['OTHER'].append(plane)
    
    if not horizontal:
        return classified
    
    levels = [plane['centroid'][1] for plane in horizontal]
    lowest, highest = min(levels), max(levels)
    
    floor_y: Optional[float] = None
    ceiling_y: Optional[float] = None
    if highest - lowest >= MIN_CEILING_HEIGHT:
        floor_y, ceiling_y = lowest, highest
    else:
        # Single level: is it near the bottom or the top of the scan?
        min_y, max_y = points[:, 1].min(), points[:, 1].max()
        if lowest - min_y <= max_y - highest:
            floor_y = lowest
        else:
            ceiling_y = highest
    
    for plane in horizontal:
        y = plane['centroid'][1]
        if floor_y is not None and abs(y - floor_y) <= LEVEL_TOLERANCE:
            plane_type = 'FLOOR'
        elif ceiling_y is not None and abs(y - ceiling_y) <= LEVEL_TOLERANCE:
            plane_type = 'CEILING'
        else:
            plane_type = 'OTHER'
        plane['type'] = plane_type
        classified[plane_type].append(plane)
    
    return classified

# ============================================================================
# WALL REFINEMENT (merge fragments, drop mid-room planes)
# ============================================================================

def are_same_wall(a: Dict, b: Dict) -> bool:
    """Parallel within WALL_MERGE_MAX_ANGLE_DEG and coplanar within WALL_MERGE_MAX_DISTANCE."""
    na, nb = unit_normal(a), unit_normal(b)
    if abs(np.dot(na, nb)) < np.cos(np.radians(WALL_MERGE_MAX_ANGLE_DEG)):
        return False
    # Distance from b's centroid to a's plane, and vice versa (symmetric)
    dist_ab = abs(np.dot(na, b['centroid'] - a['centroid']))
    dist_ba = abs(np.dot(nb, a['centroid'] - b['centroid']))
    return max(dist_ab, dist_ba) <= WALL_MERGE_MAX_DISTANCE

def merge_plane_group(group: List[Dict], points: np.ndarray) -> Dict:
    """Combine the inliers of several plane fragments into a single plane."""
    if len(group) == 1:
        return group[0]
    indices = np.concatenate([p['original_indices'] for p in group])
    inlier_points = points[indices]
    normal, d = fit_plane_svd(inlier_points)
    return {
        'normal': normal,
        'd': d,
        'centroid': inlier_points.mean(axis=0),
        'point_count': len(indices),
        'original_indices': indices,
        'type': group[0]['type'],
        'merged_from': len(group),
    }

def merge_wall_planes(walls: List[Dict], points: np.ndarray) -> List[Dict]:
    """
    Merge wall planes that are fragments of the same physical wall (RANSAC
    splits a wall when it is thick, has panelling, or when a few points are
    left over after the first pass). Walls that are merely close, like a step
    wall and a recess wall 0.4 m apart, stay separate. Order is preserved:
    each merged wall takes the position of its first fragment.
    """
    groups: List[List[Dict]] = []
    for plane in walls:
        for group in groups:
            if are_same_wall(group[0], plane):
                group.append(plane)
                break
        else:
            groups.append([plane])
    return [merge_plane_group(group, points) for group in groups]

def has_room_on_one_side(plane: Dict, points: np.ndarray,
                         threshold: float = 0.02,
                         footprint_margin: float = 0.10) -> bool:
    """
    True when, inside the wall's own footprint (its horizontal extent and
    height, grown by `footprint_margin`), at least WALL_MIN_ONE_SIDE_FRACTION
    of the points that are not part of the wall lie on a single side of it.
    Real walls bound the room; planes fitted through furniture in the middle
    of the room have points on both sides. Restricting to the footprint keeps
    walls of L-shaped rooms valid.

    "Part of the wall" is the band spanned by the wall's own inliers (plus
    `threshold`), so a merged thick wall does not count against itself.
    """
    normal = unit_normal(plane)
    along = np.array([-normal[2], 0.0, normal[0]])   # horizontal, in-plane
    along_norm = np.linalg.norm(along)
    if along_norm == 0:
        return True
    along /= along_norm
    
    inlier_idx = plane['original_indices']
    inliers = points[inlier_idx]
    u_inl, y_inl = inliers @ along, inliers[:, 1]
    u_all, y_all = points @ along, points[:, 1]
    in_footprint = ((u_all >= u_inl.min() - footprint_margin) &
                    (u_all <= u_inl.max() + footprint_margin) &
                    (y_all >= y_inl.min() - footprint_margin) &
                    (y_all <= y_inl.max() + footprint_margin))
    
    signed = (points - plane['centroid']) @ normal
    wall_lo = signed[inlier_idx].min() - threshold
    wall_hi = signed[inlier_idx].max() + threshold
    front = np.count_nonzero(in_footprint & (signed > wall_hi))
    back = np.count_nonzero(in_footprint & (signed < wall_lo))
    total = front + back
    if total == 0:
        return True
    return max(front, back) / total >= WALL_MIN_ONE_SIDE_FRACTION

def refine_walls(wall_planes: List[Dict], points: np.ndarray) -> Tuple[List[Dict], List[Dict]]:
    """
    Turn raw vertical planes into walls: merge fragments of the same wall,
    then drop planes that do not bound the room.
    Returns (walls, rejected).
    """
    walls, rejected = [], []
    for plane in merge_wall_planes(wall_planes, points):
        if has_room_on_one_side(plane, points):
            walls.append(plane)
        else:
            plane['type'] = 'OTHER'
            rejected.append(plane)
    return walls, rejected

# ============================================================================
# WALL MEASUREMENT EXTRACTION
# ============================================================================

def extract_wall_measurements(plane: Dict, points: np.ndarray) -> Dict:
    """
    Extract wall dimensions from a wall plane.
    Returns: length, height, area, orientation
    """
    inlier_points = points[plane['original_indices']]
    
    # Get bounding box in world coordinates
    min_coords = inlier_points.min(axis=0)
    max_coords = inlier_points.max(axis=0)
    
    # Calculate dimensions
    width_x = max_coords[0] - min_coords[0]
    height_y = max_coords[1] - min_coords[1]
    depth_z = max_coords[2] - min_coords[2]
    
    # Wall length is the larger of X or Z span
    wall_length = max(width_x, depth_z)
    wall_height = height_y
    wall_area = wall_length * wall_height
    
    # Orientation based on normal
    normal = plane['normal']
    if abs(normal[0]) > abs(normal[2]):
        orientation = 'N-S'  # Wall faces East-West
    else:
        orientation = 'E-W'  # Wall faces North-South
    
    return {
        'length': float(round(wall_length, 3)),
        'height': float(round(wall_height, 3)),
        'area': float(round(wall_area, 2)),
        'orientation': orientation,
        'centroid': [float(x) for x in plane['centroid']],
        'min': [float(x) for x in min_coords],
        'max': [float(x) for x in max_coords],
        'point_count': int(plane['point_count'])
    }

# ============================================================================
# ROOM SEGMENTATION
# ============================================================================

def extract_room_from_floor(floor_plane: Dict, points: np.ndarray, walls: List[Dict],
                            ceiling_plane: Optional[Dict] = None) -> Dict:
    """
    Extract room boundary and measurements from floor plane.

    Ceiling height is the floor-to-ceiling distance when a ceiling plane is
    available. Otherwise it falls back to the tallest wall (which overestimates
    rooms whose walls continue above a dropped ceiling), then to 2.8 m.
    """
    floor_points = points[floor_plane['original_indices']]
    
    # Get floor bounds (XZ plane)
    min_coords = floor_points.min(axis=0)
    max_coords = floor_points.max(axis=0)
    
    width = max_coords[0] - min_coords[0]
    depth = max_coords[2] - min_coords[2]
    floor_area = width * depth
    
    ceiling_height = 2.8  # Default
    if ceiling_plane is not None:
        ceiling_height = ceiling_plane['centroid'][1] - floor_plane['centroid'][1]
    elif walls:
        ceiling_height = max(w['height'] for w in walls)
    
    volume = floor_area * ceiling_height
    perimeter = 2 * (width + depth)
    
    return {
        'width': float(round(width, 3)),
        'depth': float(round(depth, 3)),
        'floor_area': float(round(floor_area, 2)),
        'ceiling_height': float(round(ceiling_height, 3)),
        'volume': float(round(volume, 2)),
        'perimeter': float(round(perimeter, 3)),
        'center': [
            float((min_coords[0] + max_coords[0]) / 2),
            float((min_coords[1] + max_coords[1]) / 2),
            float((min_coords[2] + max_coords[2]) / 2)
        ],
        'bounds': {
            'min': [float(x) for x in min_coords],
            'max': [float(x) for x in max_coords]
        }
    }

# ============================================================================
# PLY LOADING
# ============================================================================

# Vertex layout written by process_semantic.py (18 bytes, little endian):
# x,y,z (float32), r,g,b (uint8), label (uint8), objectId (uint16)
PLY_VERTEX_DTYPE = np.dtype([
    ('x', '<f4'), ('y', '<f4'), ('z', '<f4'),
    ('rgb', 'u1', (3,)), ('label', 'u1'), ('objectId', '<u2'),
])
assert PLY_VERTEX_DTYPE.itemsize == 18

def load_ply_points(filepath: str) -> np.ndarray:
    """Load point positions (float64, shape (N, 3)) from our custom PLY format."""
    with open(filepath, 'rb') as f:
        # Read header
        vertex_count = 0
        while True:
            line = f.readline().decode('ascii').strip()
            if line.startswith('element vertex'):
                vertex_count = int(line.split()[-1])
            if line == 'end_header':
                break
        
        if vertex_count == 0:
            return np.array([], dtype=np.float64)
        
        # Read binary data in one go; a truncated file yields fewer vertices
        data = f.read(vertex_count * PLY_VERTEX_DTYPE.itemsize)
        count = len(data) // PLY_VERTEX_DTYPE.itemsize
        vertices = np.frombuffer(data, dtype=PLY_VERTEX_DTYPE, count=count)
        
        points = np.empty((count, 3), dtype=np.float64)
        points[:, 0] = vertices['x']
        points[:, 1] = vertices['y']
        points[:, 2] = vertices['z']
        return points

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def process_room(ply_path: str, seed: Optional[int] = DEFAULT_SEED) -> Dict:
    """
    Full Scan-to-BIM pipeline for a single room.

    A fresh random generator is created from `seed` for every room, so the
    result for a given (file, seed) pair does not depend on which other rooms
    were processed before it in the same run.
    """
    rng = np.random.default_rng(seed)
    room_name = os.path.basename(ply_path).replace('.ply', '')
    print(f"\n{'='*60}")
    print(f"Processing: {room_name}")
    print(f"{'='*60}")
    
    # Load points
    print("Loading point cloud...")
    points = load_ply_points(ply_path)
    print(f"  Loaded {len(points):,} points")
    
    # Detect planes
    print("\nDetecting planes (RANSAC)...")
    planes = detect_all_planes(points, max_planes=15, min_points=1000, rng=rng)
    print(f"  Found {len(planes)} planes")
    
    # Classify planes
    print("\nClassifying planes...")
    classified = classify_planes(planes, points)
    wall_candidates = classified['WALL']
    classified['WALL'], rejected = refine_walls(wall_candidates, points)
    classified['OTHER'].extend(rejected)
    
    print(f"  FLOOR: {len(classified['FLOOR'])}")
    print(f"  CEILING: {len(classified['CEILING'])}")
    print(f"  WALLS: {len(classified['WALL'])} "
          f"(from {len(wall_candidates)} vertical planes, {len(rejected)} mid-room planes dropped)")
    print(f"  OTHER (furniture, tilted, mid-room): {len(classified['OTHER'])}")
    
    # Calculate centering offset (same as viewer does)
    min_coords = points.min(axis=0)
    max_coords = points.max(axis=0)
    centerX = (max_coords[0] + min_coords[0]) / 2
    centerZ = (max_coords[2] + min_coords[2]) / 2
    bottomY = min_coords[1]
    
    centering_offset = {
        'x': float(centerX),
        'y': float(bottomY),
        'z': float(centerZ)
    }
    print(f"\n  Centering offset: x={centerX:.3f}, y={bottomY:.3f}, z={centerZ:.3f}")
    
    # Extract wall measurements
    print("\nExtracting wall measurements...")
    walls = []
    for i, wall_plane in enumerate(classified['WALL']):
        measurements = extract_wall_measurements(wall_plane, points)
        measurements['id'] = i + 1
        measurements['name'] = f"Wall_{i+1}"
        walls.append(measurements)
        print(f"  {measurements['name']}: {measurements['length']:.2f}m x {measurements['height']:.2f}m = {measurements['area']:.2f}m²")
    
    # Extract room measurements
    print("\nExtracting room measurements...")
    room = None
    if classified['FLOOR']:
        ceiling_plane = classified['CEILING'][0] if classified['CEILING'] else None
        room = extract_room_from_floor(classified['FLOOR'][0], points, walls, ceiling_plane)
        print(f"  Floor Area: {room['floor_area']:.2f} m²")
        print(f"  Dimensions: {room['width']:.2f}m x {room['depth']:.2f}m")
        print(f"  Ceiling Height: {room['ceiling_height']:.2f}m")
        print(f"  Volume: {room['volume']:.2f} m³")
    
    return {
        'name': room_name,
        'point_count': len(points),
        'planes_detected': len(planes),
        'centering_offset': centering_offset,  # NEW: for aligning with viewer
        'walls': walls,
        'room': room,
        'classification': {
            'floor_count': len(classified['FLOOR']),
            'ceiling_count': len(classified['CEILING']),
            'wall_count': len(classified['WALL'])
        }
    }

def collect_ply_files(input_path: str) -> List[str]:
    """
    Resolve `input_path` to a sorted list of PLY files.
    Accepts either a single .ply file or a directory containing .ply files.
    Sorting makes the selection (and therefore the output order) deterministic
    regardless of filesystem iteration order.
    """
    if os.path.isfile(input_path):
        return [input_path]
    if os.path.isdir(input_path):
        return sorted(glob.glob(os.path.join(input_path, "*.ply")))
    raise FileNotFoundError(f"Input path does not exist: {input_path}")

def write_results(results: List[Dict], output_path: str) -> None:
    """Write the BIM results to `output_path`, creating parent folders as needed."""
    output_dir = os.path.dirname(output_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

def run_pipeline(input_path: str = DEFAULT_INPUT,
                 output_path: str = DEFAULT_OUTPUT,
                 seed: Optional[int] = DEFAULT_SEED,
                 max_rooms: int = DEFAULT_MAX_ROOMS) -> List[Dict]:
    """
    Process the PLY file(s) at `input_path` and write the JSON to `output_path`.

    max_rooms: maximum number of rooms to process (0 = no limit).
    Returns the list of room results that was written.
    Raises FileNotFoundError if the input path is missing or has no PLY files.
    """
    ply_files = collect_ply_files(input_path)
    if not ply_files:
        raise FileNotFoundError(f"No PLY files found in {input_path}")
    if max_rooms > 0:
        ply_files = ply_files[:max_rooms]
    
    results = [process_room(ply_path, seed=seed) for ply_path in ply_files]
    write_results(results, output_path)
    return results

def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Scan-to-BIM: RANSAC plane detection + automatic measurements "
                    "from binary PLY LiDAR scans."
    )
    parser.add_argument(
        "--input", default=DEFAULT_INPUT,
        help="PLY file or directory containing .ply files (default: %(default)s)"
    )
    parser.add_argument(
        "--output", default=DEFAULT_OUTPUT,
        help="Path of the JSON file to write (default: %(default)s)"
    )
    parser.add_argument(
        "--seed", type=int, default=DEFAULT_SEED,
        help="Random seed for RANSAC sampling; same seed + same input => "
             "same output (default: %(default)s)"
    )
    parser.add_argument(
        "--max-rooms", type=int, default=DEFAULT_MAX_ROOMS,
        help="Maximum number of rooms to process, 0 = all (default: %(default)s)"
    )
    return parser

def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)
    
    print("="*60)
    print("🏗️  ELITE SCAN-TO-BIM PIPELINE")
    print("   RANSAC Plane Detection + Automatic Measurements")
    print("="*60)
    print(f"  input:     {args.input}")
    print(f"  output:    {args.output}")
    print(f"  seed:      {args.seed}")
    print(f"  max rooms: {args.max_rooms or 'all'}")
    
    try:
        run_pipeline(
            input_path=args.input,
            output_path=args.output,
            seed=args.seed,
            max_rooms=args.max_rooms,
        )
    except FileNotFoundError as exc:
        print(f"❌ {exc}")
        return 1
    
    print(f"\n{'='*60}")
    print(f"✅ Results saved to: {args.output}")
    print("="*60)
    return 0

if __name__ == "__main__":
    sys.exit(main())
