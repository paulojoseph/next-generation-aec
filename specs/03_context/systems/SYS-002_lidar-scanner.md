# SYS-002: LiDAR Data Source

**ID**: SYS-002
**Status**: Approved
**Last Updated**: 2025-12-20

---

## Identification

| Field | Value |
|-------|-------|
| **Name** | LiDAR Data Source |
| **Type** | Offline Dataset |
| **Provider** | Stanford 3D Indoor Semantics (S3DIS) |
| **Dependency Level** | Low (offline data) |

---

## Description

The PoC uses pre-processed point cloud data from the S3DIS dataset. Raw data is converted to binary PLY format via Python ETL scripts before deployment.

---

## Data Flow

```
S3DIS Dataset (.txt annotations)
        │
        ↓ [Python ETL - Offline]
scripts/process_semantic.py
        │
        ↓
Binary PLY Files (18 bytes/vertex)
        │
        ↓ [Manual Upload]
AWS S3 Bucket
        │
        ↓ [CDN Caching]
Vercel Edge / public/scans/
```

---

## PLY Format

| Field | Type | Bytes |
|-------|------|-------|
| X, Y, Z | float32 | 12 |
| R, G, B | uint8 | 3 |
| Label | uint8 | 1 |
| ObjectId | uint16 | 2 |
| **Total** | | **18** |

---

## Rooms Available

From `dataset_manifest.json`:

- Area_1_conferenceRoom_1 (demo)
- Area_1_office_1 through office_10
- Area_1_hallway_1 through hallway_4
- ~50 rooms total

---

## Processing Script

```bash
python scripts/process_semantic.py input.txt output.ply
```

---

**Back**: [003_context-and-scope.md](../003_context-and-scope.md)
