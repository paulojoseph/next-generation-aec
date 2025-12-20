"""
Elite Scan-to-BIM Pipeline
===========================
RANSAC Plane Detection + Wall Extraction + Room Segmentation

This script transforms raw LiDAR point clouds into measured BIM geometry.

Dependencies: numpy (already installed with process scripts)
Output: walls.json, rooms.json, measurements.json
"""

import numpy as np
import json
import os
import struct
from collections import defaultdict
from typing import List, Tuple, Dict, Optional
import glob

# Configuration
INPUT_DIR = "public/scans"
OUTPUT_DIR = "public/bim"

os.makedirs(OUTPUT_DIR, exist_ok=True)

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

def ransac_plane(points: np.ndarray, 
                 threshold: float = 0.02,  # 2cm tolerance
                 iterations: int = 1000,
                 min_points: int = 100) -> Optional[Dict]:
    """
    RANSAC algorithm to detect a single plane in point cloud.
    
    Returns dict with:
        - normal: plane normal vector
        - d: plane equation constant
        - inliers: indices of points on this plane
        - centroid: center of plane
    """
    if len(points) < min_points:
        return None
    
    best_inliers = []
    best_normal = None
    best_d = None
    
    for _ in range(iterations):
        # Sample 3 random points
        idx = np.random.choice(len(points), 3, replace=False)
        sample = points[idx]
        
        # Fit plane to sample
        try:
            normal, d = fit_plane_svd(sample)
        except:
            continue
        
        # Count inliers
        distances = point_to_plane_distance(points, normal, d)
        inlier_mask = distances < threshold
        inliers = np.where(inlier_mask)[0]
        
        if len(inliers) > len(best_inliers):
            best_inliers = inliers
            best_normal = normal
            best_d = d
    
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
                      min_points: int = 500) -> List[Dict]:
    """
    Iteratively detect all major planes in point cloud.
    """
    planes = []
    remaining_points = points.copy()
    remaining_indices = np.arange(len(points))
    
    for i in range(max_planes):
        if len(remaining_points) < min_points:
            break
            
        plane = ransac_plane(remaining_points, min_points=min_points)
        if plane is None:
            break
        
        # Map back to original indices
        plane['original_indices'] = remaining_indices[plane['inliers']]
        planes.append(plane)
        
        # Remove inliers for next iteration
        mask = np.ones(len(remaining_points), dtype=bool)
        mask[plane['inliers']] = False
        remaining_points = remaining_points[mask]
        remaining_indices = remaining_indices[mask]
        
        print(f"  Plane {i+1}: {plane['point_count']} points, normal={plane['normal'].round(3)}")
    
    return planes

# ============================================================================
# PLANE CLASSIFICATION
# ============================================================================

def classify_plane(plane: Dict) -> str:
    """
    Classify plane as FLOOR, CEILING, or WALL based on normal direction.
    """
    normal = plane['normal']
    # Normalize
    normal = normal / np.linalg.norm(normal)
    
    # Check if horizontal (floor/ceiling) or vertical (wall)
    # Y is up in our coordinate system
    y_component = abs(normal[1])
    
    if y_component > 0.8:  # Mostly horizontal
        # Check if pointing up (floor) or down (ceiling)
        if plane['centroid'][1] < 1.0:  # Lower than 1m = floor
            return 'FLOOR'
        else:
            return 'CEILING'
    else:
        return 'WALL'

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

def extract_room_from_floor(floor_plane: Dict, points: np.ndarray, walls: List[Dict]) -> Dict:
    """
    Extract room boundary and measurements from floor plane.
    """
    floor_points = points[floor_plane['original_indices']]
    
    # Get floor bounds (XZ plane)
    min_coords = floor_points.min(axis=0)
    max_coords = floor_points.max(axis=0)
    
    width = max_coords[0] - min_coords[0]
    depth = max_coords[2] - min_coords[2]
    floor_area = width * depth
    
    # Estimate ceiling height from wall heights
    ceiling_height = 2.8  # Default
    if walls:
        wall_heights = [w['height'] for w in walls]
        ceiling_height = max(wall_heights)
    
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

def load_ply_points(filepath: str) -> np.ndarray:
    """Load point positions from our custom PLY format."""
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
        
        # Read binary data
        # Format: x,y,z (float32), r,g,b (uint8), label (uint8), objectId (uint16)
        # = 12 + 3 + 1 + 2 = 18 bytes per vertex
        points = []
        for _ in range(vertex_count):
            data = f.read(18)
            if len(data) < 18:
                break
            x, y, z = struct.unpack('<fff', data[:12])
            points.append([x, y, z])
        
        return np.array(points, dtype=np.float64)

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def process_room(ply_path: str) -> Dict:
    """
    Full Scan-to-BIM pipeline for a single room.
    """
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
    planes = detect_all_planes(points, max_planes=15, min_points=1000)
    print(f"  Found {len(planes)} planes")
    
    # Classify planes
    print("\nClassifying planes...")
    classified = {'FLOOR': [], 'CEILING': [], 'WALL': []}
    for plane in planes:
        plane_type = classify_plane(plane)
        plane['type'] = plane_type
        classified[plane_type].append(plane)
    
    print(f"  FLOOR: {len(classified['FLOOR'])}")
    print(f"  CEILING: {len(classified['CEILING'])}")
    print(f"  WALLS: {len(classified['WALL'])}")
    
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
        room = extract_room_from_floor(classified['FLOOR'][0], points, walls)
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

def main():
    print("="*60)
    print("🏗️  ELITE SCAN-TO-BIM PIPELINE")
    print("   RANSAC Plane Detection + Automatic Measurements")
    print("="*60)
    
    # Process a sample room
    ply_files = glob.glob(os.path.join(INPUT_DIR, "*.ply"))
    
    if not ply_files:
        print("❌ No PLY files found in", INPUT_DIR)
        return
    
    # Process first 2 rooms as demo
    results = []
    for ply_path in ply_files[:2]:
        result = process_room(ply_path)
        results.append(result)
    
    # Save results
    output_file = os.path.join(OUTPUT_DIR, "bim_data.json")
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n{'='*60}")
    print(f"✅ Results saved to: {output_file}")
    print("="*60)

if __name__ == "__main__":
    main()
