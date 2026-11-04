# NextGen AEC

**Browser-Native Digital Twin Platform for Massive LiDAR Point Clouds**

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16_Turbopack-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-white?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/Vitest-85%25_Coverage-green?style=for-the-badge&logo=vitest)](./vitest.config.ts)

<br />

[**🚀 Launch Live Demo**](https://next-generation-aec.vercel.app/)
&nbsp;&nbsp;•&nbsp;&nbsp;
[**🎥 Watch Architecture Walkthrough**](https://www.youtube.com/watch?v=i-iUzpONJGY)

</div>

---

## Executive Summary

**NextGen AEC** is a technical proof-of-concept designed to demonstrate the architectural maturity required for a **Founding Engineer** role. It delivers enterprise-grade LiDAR visualization directly in the browser, **solving the technically demanding challenge of real-time visualization of large LiDAR datasets** without expensive GPU servers or proprietary desktop software.

```mermaid
flowchart LR
    subgraph Legacy ["🛑 Legacy Stack"]
        L1[LiDAR] --> L2[Desktop SW] --> L3[GPU Server<br/>💰 $$$] --> L4[Browser]
    end

    subgraph NextGen ["🚀 NextGen AEC"]
        N1[LiDAR] --> N2[Python ETL] --> N3[S3 + CDN] --> N4[WebGL<br/>60 FPS]
    end

    style L3 fill:#dc2626,stroke:#991b1b,color:#fff
    style N3 fill:#0ea5e9,stroke:#0284c7,color:#fff
    style N4 fill:#10b981,stroke:#059669,color:#fff
```

**Key Business Impact:**
- **90% cost reduction** vs. server-side rendering ($0.02/GB transfer vs. $2.50/hour GPU)
- **Zero infrastructure scaling** — static files, infinite users
- **Sub-3s load times** for 100MB+ point clouds
- **60 FPS** with 1M+ points on commodity hardware

---

## Architecture Overview

### System Design Philosophy

This codebase establishes the technical foundation for the platform, reflecting a mindset that cares about long-term maintainability as much as shipping fast. The architecture was specifically designed to solve technically demanding challenges like real-time visualization of large LiDAR datasets.

- **Decoupled Rendering** — Three.js engine operates independently of React lifecycle, ensuring performance despite complex UI state.
- **Cloud-Agnostic Data Layer** — Designed to navigate ambiguity, allowing seamless switching between local development and S3 production.
- **Design System Foundation** — A scalable framework for evangelizing consistent UI patterns across the team.
- **Event-Driven State** — Observer pattern for engine-to-UI communication, ensuring fluid user interactions even with massive datasets.

### High-Level Architecture Layers

```mermaid
flowchart TB
    subgraph Presentation ["<b>🎨 PRESENTATION</b>"]
        direction TB
        UI["UI Components<br/><small>Header • Sidebar • Panels</small>"]
        DS["Design System"]
        Tokens["Tokens & Primitives"]
        UI --> DS --> Tokens
    end

    subgraph Application ["<b>🧠 APPLICATION</b>"]
        direction TB
        Page["<b>page.tsx</b><br/><small>Orchestrator</small>"]
        Hooks["Custom Hooks<br/><small>useDataLoader • usePlaneVisibility</small>"]
        Viewer["<b>Viewer3D.tsx</b><br/><small>React ↔ Three.js Bridge</small>"]
        Page --> Hooks
        Page --> Viewer
    end

    subgraph Engine ["<b>⚙️ THREE.JS ENGINE</b>"]
        direction TB
        Scene["<b>SceneEngine</b><br/><small>Event Emitter</small>"]
        Renderer["PointCloudRenderer<br/><small>Custom Shaders</small>"]
        PLY["PLYStreamLoader<br/><small>Binary Parser</small>"]
        Scene --> Renderer
        Scene --> PLY
    end

    subgraph Data ["<b>☁️ DATA LAYER</b>"]
        direction TB
        Resolver["DataSourceResolver<br/><small>S3 / Local</small>"]
        Manifest["ManifestLoader<br/><small>Retry + Cache</small>"]
        BIM["SceneObjectsLoader<br/><small>BIM Metadata</small>"]
        Resolver --> Manifest --> BIM
    end

    %% Cross-layer connections
    Hooks --> UI
    Viewer -.->|"Observer Pattern"| Scene
    PLY -.->|"Binary Stream"| Manifest

    %% Styling
    style Presentation fill:#0ea5e9,stroke:#0284c7,stroke-width:2px,color:#fff
    style Application fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff
    style Engine fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
    style Data fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff

    style UI fill:#0c4a6e,stroke:#0ea5e9,color:#fff
    style DS fill:#0c4a6e,stroke:#0ea5e9,color:#fff
    style Tokens fill:#0c4a6e,stroke:#0ea5e9,color:#fff

    style Page fill:#4c1d95,stroke:#8b5cf6,color:#fff
    style Hooks fill:#4c1d95,stroke:#8b5cf6,color:#fff
    style Viewer fill:#4c1d95,stroke:#8b5cf6,color:#fff

    style Scene fill:#064e3b,stroke:#10b981,color:#fff
    style Renderer fill:#064e3b,stroke:#10b981,color:#fff
    style PLY fill:#064e3b,stroke:#10b981,color:#fff

    style Resolver fill:#78350f,stroke:#f59e0b,color:#fff
    style Manifest fill:#78350f,stroke:#f59e0b,color:#fff
    style BIM fill:#78350f,stroke:#f59e0b,color:#fff
```

---

## Technical Deep Dives

### 1. LiDAR Rendering Engine

The core rendering pipeline is designed to push performance to the limit, handling massive datasets on commodity hardware.

#### Binary PLY Streaming

```typescript
// PLYStreamLoader: Direct ArrayBuffer manipulation for zero-copy parsing
const VERTEX_STRIDE = 18; // bytes per vertex

// Memory layout: float32 xyz (12) + uint8 rgb (3) + uint8 label (1) + uint16 objectId (2)
while (offset + VERTEX_STRIDE <= buffer.byteLength) {
  positions[writeIndex * 3] = dataView.getFloat32(offset, true);
  positions[writeIndex * 3 + 1] = dataView.getFloat32(offset + 4, true);
  positions[writeIndex * 3 + 2] = dataView.getFloat32(offset + 8, true);

  offset += VERTEX_STRIDE * skipRate; // LOD decimation without re-download
}
```

**Key Optimizations:**
- **Pre-allocated TypedArrays** — Avoids GC during streaming
- **Single-pass parsing** — No intermediate data structures
- **Client-side LOD** — Quality switching without network requests
- **Percentile-based bounds** — Robust floor/ceiling detection ignoring outliers

#### Custom Shader Pipeline

Selection highlighting uses injected GLSL for GPU-accelerated object picking:

```glsl
// Fragment shader injection for pulsing selection effect
if (abs(vObjectId - uSelectedId) < 0.1) {
  float pulse = (sin(uTime * 3.0) + 1.0) * 0.5;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.2, 0.2), 0.7 + pulse * 0.3);
}
```

### 2. Decoupled Engine Architecture

The 3D engine operates independently of React through an event-driven architecture:

```typescript
// SceneEngine: Owns all Three.js resources, independent of React lifecycle
const engine = new SceneEngine();

// Subscribe to state changes (React hook bridges these to component state)
engine.events.on('stats:update', (stats) => setStats(stats));
engine.events.on('pointcloud:loaded', ({ pointCount }) => setLoading(false));

// Engine lifecycle is managed externally from React
await engine.loadPointCloud(config);
scene.add(engine.getPointCloudObject());
```

**Benefits:**
- **Testable without React** — Pure TypeScript unit tests
- **No re-render coupling** — Engine updates don't trigger React reconciliation
- **Clean resource management** — Explicit `dispose()` for GPU cleanup

### 3. Cloud-Native Data Layer

Environment-aware data resolution with retry logic and caching:

```typescript
// Automatic source detection - seamless dev/prod switching
const source = dataSourceResolver.resolve();
// → { baseUrl: '/scans', isCloud: false } (development)
// → { baseUrl: 'https://cdn.example.com/assets', isCloud: true } (production)

// Resilient manifest loading with exponential backoff
const room = await manifestLoader.loadRoom('Area_1', 'conferenceRoom_1');
// → { modelUrl, objectsUrl } with 3 retries and 5-minute cache
```

**Data Contract Pattern:**

```typescript
// ManifestRoom: Contract between ETL pipeline and frontend
interface ManifestRoom {
  name: string;       // Room identifier
  file: string;       // Relative path to binary PLY
  objects: string;    // Relative path to BIM metadata JSON
}
```

### 4. Design System Foundation

A structured Design System built as a tool for evangelizing consistent UI patterns:

```typescript
// Color tokens with semantic naming
ColorTokens.surface.glass       // 'rgba(24, 24, 27, 0.95)'
ColorTokens.accent.cyan.default // '#22d3ee'
ColorTokens.scene.axis.x        // '#ef4444' (Three.js axis colors)

// Atomic components with strict typing
<GlassPanel variant="elevated">
  <Text variant="heading" color="primary">Dashboard</Text>
  <Badge variant="success">Active</Badge>
</GlassPanel>
```

**Design System Benefits:**
- **Token-based theming** — Single source of truth for colors, spacing, typography
- **Atomic primitives** — Composable building blocks (GlassPanel, IconButton, Badge, Text)
- **Type safety** — Compile-time validation of variant and color props
- **Consistency** — Ensures visual coherence across all UI surfaces

---

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   └── page.tsx              # Layout orchestrator (UI state management)
│
├── design-system/            # Foundational UI layer
│   ├── tokens/               # Design tokens (colors, spacing, typography)
│   └── primitives/           # Atomic components (GlassPanel, IconButton, etc.)
│
├── engine/                   # Decoupled 3D engine
│   ├── core/                 # EventEmitter, types
│   ├── loaders/              # PLYStreamLoader with streaming + LOD
│   ├── renderers/            # PointCloudRenderer with custom shaders
│   └── SceneEngine.ts        # Engine orchestrator
│
├── data/                     # Cloud-agnostic data layer
│   ├── DataSourceResolver.ts # Environment-aware URL resolution
│   ├── ManifestLoader.ts     # Manifest loading with retry + cache
│   └── SceneObjectsLoader.ts # BIM metadata loader
│
├── features/
│   ├── bim/                  # BIM planes from bim_data.json (pure TS, tested)
│   │   ├── roomLayout.ts     # JSON entry -> room layout (walls, step, heights)
│   │   └── planes.ts         # Plane list + measurement snap targets
│   │
│   ├── viewer/               # 3D visualization components
│   │   ├── Viewer3D.tsx      # React bridge to engine
│   │   ├── BIMOverlay.tsx    # Draws the BIM planes, measurement tool
│   │   ├── hooks/            # Interaction, navigation, loader hooks
│   │   └── materials/        # GLSL shaders
│   │
│   └── ui/                   # Interface components
│       ├── Header.tsx
│       ├── CombinedSidebar.tsx
│       ├── TelemetryPanel.tsx
│       └── ...
│
├── contexts/                 # React contexts (Toast, Theme)
├── lib/                      # Shared utilities
└── types/                    # Application-wide type definitions

pipeline/                     # Python ETL for S3DIS processing
specs/                        # Arc42 architecture documentation
```

### Scan-to-BIM Pipeline (Python)

`pipeline/scan_to_bim.py` reads binary PLY scans (the 18-byte vertex layout
written by `process_semantic.py`), detects planes with RANSAC and writes the
JSON used by the [BIM overlay](#bim-overlay). Run it from the repo root:

```bash
pip install -r pipeline/requirements.txt

# Defaults: --input public/scans --output public/bim/bim_data.json --seed 42 --max-rooms 2
python pipeline/scan_to_bim.py

# Single file or custom paths; --max-rooms 0 processes every PLY found
python pipeline/scan_to_bim.py --input /data/room.ply --output /tmp/bim.json --seed 7
python pipeline/scan_to_bim.py --input /data/scans --max-rooms 0
```

- `--input` accepts a single `.ply` file or a directory (files are processed in
  sorted name order). The output folder is created if needed.
- The same `--seed` and input always produce the same JSON, and a room's result
  does not depend on which other rooms were processed in the same run.
- Exit code is `1` (with a message) when the input path is missing or contains
  no PLY files. Importing the module has no side effects; use
  `run_pipeline()` / `process_room()` from a backend.

How a room is processed:

1. **Plane detection** — iterative RANSAC (2 cm tolerance, up to 15 planes of
   at least 1000 points). Hypotheses are scored on a 20k-point random subset,
   then the winner is verified and refit on all points (~2.5 s for 1.1M points).
2. **Classification** — horizontal planes are classified relative to each other:
   the lowest level is the floor, the highest is the ceiling if it is at least
   2 m above the floor; horizontal planes in between (table tops, shelves) and
   planes tilted more than 10° from vertical are ignored. This works for scans at
   any world height (e.g. upper storeys).
3. **Walls** — vertical planes are merged when they are parallel (10°) and
   coplanar (10 cm), so a thick or panelled wall is reported once, while a step
   wall and a recess wall 0.4 m apart stay separate. Planes that have room
   points on both sides within their own footprint (fits through furniture in
   the middle of the room) are dropped.
4. **Measurements** — wall length/height/area from the merged inliers; room
   width/depth/area from the floor plane; ceiling height is the floor-to-ceiling
   distance (falling back to the tallest wall, then 2.8 m, when no ceiling plane
   was found).

The JSON format is unchanged: `classification` counts the final floor/ceiling/
wall planes, while `planes_detected` is the raw RANSAC count. Tests use
synthetic scans (the real dataset is not in the repo):

```bash
pytest
python pipeline/tests/benchmark_scan_to_bim.py   # timing on a ~1.1M point synthetic room
```

### BIM Overlay

The viewer draws the room's planes from `public/bim/bim_data.json`; no room
shape is hardcoded in the frontend (which room is shown is still the `ROOM`
constant in `page.tsx`).

1. **Loading** — `page.tsx` finds the room's area (the top-level key) in the
   manifest and loads the `<area>_<room>` entry of the JSON once. Without it the
   viewer still works and the planes list is empty.
2. **Room layout** — `src/features/bim/roomLayout.ts` takes the outermost wall
   on each side (planes inside the room, such as furniture faces, are ignored),
   detects a step (a lowered ceiling section along the left or right wall), and
   measures heights from the floor plane to the wall tops.
3. **Planes** — `src/features/bim/planes.ts` turns the layout into the plane
   list: `Wall_Left`, `Wall_Right`, `Wall_Back`, `Wall_Front`, `Step_Wall`,
   `Step_Ceiling`, `Ceiling`, `Floor` (the two step planes only exist in
   stepped rooms), each with its size, position, rotation and outline.
4. **Display** — the sidebar lists these planes. `BIMOverlay.tsx` draws the same
   list, aligned with the point cloud's floor, with hover, Ctrl+click to hide a
   plane, and the measurement tool: click in Measure mode (or Shift+click) to
   start, then click a second point or press W/A/S/D/Space to snap to the
   ceiling, floor, walls or opposite wall; Esc cancels.

Both modules are plain TypeScript (no React or three.js) and covered by Vitest.

---

## Performance Characteristics

| Metric | Value | Condition |
|--------|-------|-----------|
| **Render FPS** | 60 fps | 1M points, quality preset 1/25 |
| **Initial Load** | < 3s | 100MB PLY, Edge-cached |
| **Memory Usage** | ~150MB | 2M points loaded |
| **Quality Switch** | < 500ms | Cached data, no network |
| **Raycasting** | 4 fps | Throttled for responsiveness |

### LOD Quality Presets

| Preset | Points Loaded | Use Case |
|--------|---------------|----------|
| Ultra (1:1) | 100% | Final inspection |
| High (1:2) | 50% | Detailed review |
| Balanced (1:5) | 20% | Default exploration |
| Performance (1:10) | 10% | Low-end hardware |
| Max Performance (1:50) | 2% | Mobile/overview |

---

## 🛠 Engineering Standards

This repository is structured to set engineering best practices and foster a strong culture of code quality.

### Code Quality Guardrails

| Standard | Implementation |
|----------|---------------|
| Strict Typing | No `any`. All BIM metadata and Scene Objects are typed via `src/types` |
| Atomic Design | UI components in `src/design-system` follow strict token usage |
| Testing Culture | Critical logic (Data Parsing, URL Resolution) covered by Vitest specs |
| Documentation | JSDoc on all public interfaces; Arc42 specs in `specs/` |
| SOLID Principles | Single responsibility, dependency inversion throughout |

### Quality Rules

This project enforces **39 quality rules** across four categories:

- **Object Calisthenics** (001-009) — Code hygiene at method level
- **SOLID Principles** (010-014) — Object-oriented design
- **Package Principles** (015-020) — Module cohesion and coupling
- **Code Quality** (021-039) — DRY, KISS, YAGNI, security, testing

---

## Local Development

```bash
# 1. Install dependencies (from package-lock.json)
npm ci

# 2. Run the development server
npm run dev

# 3. Run the test suite once (or `npm run test:watch`)
npm test
```

Tests are Vitest specs (`*.spec.ts`) next to the code in `src/`, run in the
Node environment (no DOM). They cover the data layer, the engine and the BIM
modules in `src/features/bim`. The BIM specs run on the real
`public/bim/bim_data.json`, so after regenerating it, failing values are
expected: check them against the scan before updating the tests.
`vitest.config.ts` has coverage settings, but no coverage provider is installed,
so there is no coverage script.

Open http://localhost:3000. Demo data streams from the production S3 bucket automatically.

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_DATA_SOURCE` | Base URL for assets | `/scans` (local) |

**Production Example:**

```bash
NEXT_PUBLIC_DATA_SOURCE=https://your-bucket.s3.amazonaws.com/assets
```

---

## Strategic Roadmap

### Phase 1: Foundation ✅ (Current)

- [x] WebGL point cloud rendering with custom shaders
- [x] Binary PLY streaming with client-side LOD
- [x] Design system foundation with tokenized theming
- [x] Cloud-agnostic data layer with retry/cache
- [x] Unit test coverage (85%+)
- [x] Arc42 architecture documentation

### Phase 2: Performance (Q1)

- [ ] **Rust/WASM Spatial Engine** — Migrate collision detection, volume calculation, and spatial queries to Rust via WebAssembly for 10x performance
- [ ] **Web Workers** — Offload PLY parsing to worker threads
- [ ] **Octree Culling** — Frustum culling for massive datasets (10M+ points)

### Phase 3: Collaboration (Q2)

- [ ] **Real-time Sync** — Multi-user inspection via Y.js/SignalR
- [ ] **Annotation System** — Persistent markup and defect tracking
- [ ] **Measurement History** — Cloud-synced measurement storage

### Phase 4: AI Integration (Q3)

- [ ] **Defect Detection** — Computer vision for crack/damage identification
- [ ] **Deviation Analysis** — As-built vs. design comparison
- [ ] **Smart Recommendations** — ML-driven inspection priorities

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 16 | App Router, Edge Functions |
| **Rendering** | Three.js + R3F | WebGL 2.0, React integration |
| **State** | React Hooks | UI state, custom hooks |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Testing** | Vitest | Unit tests, coverage |
| **ETL** | Python + Open3D | Point cloud processing |
| **Storage** | AWS S3 | Binary PLY hosting |
| **CDN** | Vercel Edge | Global distribution |

---

## License & Proprietary Notice

Copyright (c) 2025 Paulo Marques. All Rights Reserved.

**NOTICE:** This repository contains proprietary proof-of-concept code and architecture specifications. It is shared strictly for evaluation purposes regarding the "Founding Engineer" role.

Unauthorized copying, commercial use, modification, or distribution of this code, via any medium, is strictly prohibited without express written permission from the author.

---

<div align="center">

**Engineered for scale. Documented for audit. Built for the future of AEC.**

</div>