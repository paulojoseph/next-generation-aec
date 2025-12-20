# 04. Solution Strategy - Technology Stack

**ID**: ARC42-04
**Status**: Approved
**Last Updated**: 2025-12-20

---

## Executive Summary

NextGen AEC is a **scalable 3D engine for digital inspections and spatial analysis** built on a zero-server-compute architecture. The platform demonstrates foundational engineering principles designed for maintainability and scalability, while solving the hard problem of **real-time visualization of large LiDAR datasets** in the browser.

---

## Core Framework (EXACT Versions from package.json)

| Technology | Version | Decision |
|------------|---------|----------|
| **Next.js** | 16.0.8 | App Router, React 19, Edge Functions |
| **React** | 19.2.1 | Concurrent rendering for heavy 3D UI |
| **TypeScript** | ^5 | Strict mode, no implicit any |
| **Tailwind CSS** | ^4 | Utility-first, zero runtime CSS |

---

## 3D Engine Stack (EXACT Versions from package.json)

| Library | Version | Role |
|---------|---------|------|
| **Three.js** | ^0.181.2 | WebGL renderer, BufferGeometry |
| **React Three Fiber** | ^9.4.2 | Declarative scene graph |
| **@react-three/drei** | ^10.7.7 | OrbitControls, GizmoHelper, Html |
| **Leva** | ^0.10.1 | Real-time parameter controls |
| **@loaders.gl/core** | ^4.3.4 | Data loading infrastructure |
| **@loaders.gl/ply** | ^4.3.4 | PLY format support |

---

## Data Pipeline (Python ETL - Phase 1)

| Tool | Purpose |
|------|---------|
| **Python 3.11** | ETL runtime |
| **Open3D** | Point cloud algorithms |
| **NumPy** | Array operations |
| **struct** | Binary PLY encoding (18 bytes/vertex) |

> **Note**: Python ETL is the Phase 1 implementation. See [ROADMAP.md](../../docs/ROADMAP.md) for the Rust/WASM migration plan.

---

## Infrastructure

| Service | Role |
|---------|------|
| **Vercel Edge Network** | Edge hosting, global CDN, zero-config |
| **AWS S3** | PLY file storage, immutable assets |
| **GitHub** | Version control, CI/CD |

---

## Key Architectural Decisions

### 1. Zero Server Compute (Infinite Scale)

All WebGL computation runs on user GPU. Server serves static files only.

**Rationale**:
- Zero server GPU costs ($0 vs $2.50/hr GPU instances)
- Infinite horizontal scale
- Edge caching eliminates origin load

### 2. Binary PLY Format (Optimized Wire Format)

18-byte vertex stride: `float32 xyz + uint8 rgb + uint8 label + uint16 objectId`

**Rationale**:
- 5-10x smaller than ASCII PLY
- Direct memory mapping to BufferGeometry
- Zero-copy parsing with DataView

### 3. Custom Hooks Architecture (Separation of Concerns)

| Hook | Responsibility |
|------|----------------|
| `usePointCloudLoader` | Stream + parse + cache PLY data |
| `useViewerInteraction` | Raycasting, selection, hover state |
| `useCameraNavigation` | WASD + Q/E keyboard controls |

**Rationale**:
- Testable in isolation
- Single responsibility per hook
- Clean dependency graph

### 4. AI-Assisted Development Guardrails

The project uses AI-assisted development with 39 quality rules enforced by automated tooling.

**Rationale**:
- Consistent code quality across AI-generated code
- Documentation-first approach ensures architectural integrity
- Measurable quality gates (SOLID, Object Calisthenics)

---

## Performance Strategy

| Technique | Implementation |
|-----------|----------------|
| **LOD (Level of Detail)** | Skip-rate decimation (1/1 to 1/50) |
| **Raycasting Throttle** | 4fps (250ms) to prevent jank |
| **Raw Data Cache** | `rawDataRef` avoids re-download on quality change |
| **Shader Optimization** | Custom GLSL, point size attenuation |
| **Percentile Floor/Ceiling** | Robust bounds from 1st/99th percentile |

---

## Evolution Roadmap

| Phase | Status | Technology | Impact |
|-------|--------|------------|--------|
| **Phase 1** | Current | Python ETL | Offline processing, 1GB+ datasets |
| **Phase 2** | Planned | Rust/WASM Parser | 10x parse speed, edge processing |
| **Phase 3** | Future | Octree Streaming | Billion-point datasets |
| **Phase 4** | Future | WebGPU Compute | GPU-accelerated analysis |

See [docs/ROADMAP.md](../../docs/ROADMAP.md) for detailed migration plan.

---

**Previous**: [03. Context](../03_context/003_context-and-scope.md) | **Next**: [05. Building Block View](../05_building-block-view/01_whitebox_overall.md)
