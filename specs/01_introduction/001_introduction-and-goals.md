# 01. Introduction and Goals

**ID**: ARC42-01
**Status**: Approved
**Last Updated**: 2025-12-20

---

## Vision Statement

**NextGen AEC** is a **scalable 3D engine for digital inspections and spatial analysis** in the AEC (Architecture, Engineering, Construction) industry. The platform solves the challenge of **real-time visualization of large LiDAR datasets** directly in the browser, with zero server-side GPU costs.

This is the foundational architecture for a next-generation AEC platform, designed for maintainability and scalability from day one.

---

## Business Goals

| Goal | Description | Metric |
|------|-------------|--------|
| **Zero Server Compute** | All rendering on client GPU | $0 GPU server cost |
| **Large Dataset Support** | Handle 1M+ points at 60fps | 60fps verified |
| **Professional Quality** | Measurement tools, semantic labels | Sub-cm precision |
| **Infinite Scale** | Static hosting only | $0.02/GB vs $2.50/hr GPU |

---

## Core Problem Solved

> **"How do you visualize gigabyte-scale LiDAR data in a web browser without expensive cloud GPU infrastructure?"**

**Solution**: Binary PLY streaming with client-side WebGL rendering. The browser becomes the compute platform.

---

## Functional Requirements (Implemented)

### FR-001: Scalable 3D Point Cloud Engine

- Stream binary PLY files from CDN (1GB+ datasets)
- LOD (Level of Detail) via skip-rate decimation (1/1 to 1/50)
- Maintain 60fps during real-time navigation
- Custom GLSL shaders optimized for LiDAR visualization

### FR-002: Smart Measurement System for Digital Inspections

- Click-to-measure with **Smart Ghosts** snap candidates
- Orthogonal axis detection (floor, ceiling, walls)
- Sub-centimeter precision (3 decimal places)
- Visual preview before commitment

### FR-003: Semantic Object Recognition

- Raycasting-based object picking (throttled 4fps)
- Pulsing highlight animation for selected objects
- Semantic class labels (Chair, Table, Wall, Floor, etc.)
- Object sidebar with grouping by category

### FR-004: BIM Plane Overlay

- 2D plane visualization for detected surfaces
- Per-plane toggle visibility
- Automatic alignment with point cloud bounds
- Robust floor/ceiling detection (1st/99th percentile)

---

## Non-Functional Requirements

| Requirement | Target | Current |
|-------------|--------|---------|
| Frame Rate | 60fps | 60fps (1M points) |
| Initial Load | <3s | ~2s (cached) |
| Memory Usage | <200MB | ~150MB |
| Quality Switch | <500ms | ~300ms |

---

## Architecture Differentiators

### 1. Foundational Architecture for Scale

- **Documentation-First**: Arc42, C4 diagrams, ADRs from day one
- **AI-Assisted Development**: 39 quality rules enforced by guardrails
- **Clean Separation**: Feature-based folders, custom hooks pattern

### 2. Performance-First Design

- **Binary Wire Format**: 18 bytes/vertex, zero-copy parsing
- **Smart Caching**: Raw data cached for instant quality switching
- **Throttled Raycasting**: Maintains 60fps during interaction

### 3. Evolution Ready

- **Rust/WASM Migration Path**: Parser isolated for future optimization
- **WebGPU Ready**: Shader architecture supports compute migration
- See [ROADMAP.md](../../docs/ROADMAP.md) for detailed evolution plan

---

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.0.8, React 19.2.1 |
| 3D Engine | Three.js ^0.181.2, React Three Fiber ^9.4.2 |
| Controls | @react-three/drei ^10.7.7, Leva ^0.10.1 |
| Styling | Tailwind CSS ^4 |
| ETL (Phase 1) | Python 3.11, Open3D, NumPy |
| Hosting | Vercel Edge, AWS S3 |

---

## Out of Scope (PoC Phase)

- User authentication
- Project management
- Real-time collaboration
- Database persistence
- LAS/LAZ file support (PLY only for now)
- Server-side processing

---

**Next**: [02. Constraints](../02_constraints/002_constraints.md)
