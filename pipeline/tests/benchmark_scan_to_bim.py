"""
Benchmark for pipeline/scan_to_bim.py on a synthetic room of ~1.1M points.

Not collected by pytest. Run from the repo root:

    python pipeline/tests/benchmark_scan_to_bim.py [--points 1100000] [--keep]

The room mimics the real S3DIS conference rooms: six large faces, a table
top, a thick wall and ~10% unstructured clutter (which, like in the real
scans, produces phantom planes until max_planes is reached).
"""

import argparse
import contextlib
import io
import os
import sys
import tempfile
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import scan_to_bim  # noqa: E402
from test_scan_to_bim import box_room_points, rect_points, write_ply  # noqa: E402


def make_room(total_points: int, seed: int = 1) -> np.ndarray:
    width, height, depth = 5.2, 3.1, 4.4
    clutter = int(total_points * 0.10)
    table, thick = 12_000, 15_000
    per_face = (total_points - clutter - table - thick) // 6
    rng = np.random.default_rng(seed + 1)
    scatter = rect_points(rng, clutter, (-width / 2, width / 2), (0.0, height),
                          (-depth / 2, depth / 2))
    return box_room_points(width, height, depth, per_face, seed=seed,
                           table_points=table, thick_wall_points=thick,
                           extra=[scatter])


def timed(label: str, func, *args):
    t0 = time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()):
        result = func(*args)
    dt = time.perf_counter() - t0
    print(f"  {label:<28} {dt:8.2f} s")
    return result, dt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--points", type=int, default=1_100_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--keep", action="store_true", help="keep the generated PLY")
    args = parser.parse_args()

    folder = tempfile.mkdtemp(prefix="bim_bench_")
    ply = os.path.join(folder, "Area_1_bench.ply")
    points = make_room(args.points)
    write_ply(ply, points)
    print(f"Synthetic room: {len(points):,} points -> {ply}")

    print("\nStages:")
    loaded, t_load = timed("load_ply_points", scan_to_bim.load_ply_points, ply)
    rng = np.random.default_rng(args.seed)
    planes, t_detect = timed("detect_all_planes", scan_to_bim.detect_all_planes,
                             loaded, 15, 1000, rng)
    classified, t_classify = timed("classify_planes", scan_to_bim.classify_planes, planes, loaded)
    (walls, rejected), t_refine = timed("refine_walls", scan_to_bim.refine_walls,
                                        classified["WALL"], loaded)

    print("\nEnd to end:")
    result, t_total = timed("process_room", scan_to_bim.process_room, ply, args.seed)

    print(f"\nplanes={result['planes_detected']} classification={result['classification']} "
          f"room={result['room']['width']}x{result['room']['depth']} "
          f"h={result['room']['ceiling_height']}")
    print(f"walls: {[(w['orientation'], round(w['centroid'][0], 2), round(w['centroid'][2], 2)) for w in result['walls']]}")

    if not args.keep:
        os.remove(ply)
        os.rmdir(folder)
    return 0


if __name__ == "__main__":
    sys.exit(main())
