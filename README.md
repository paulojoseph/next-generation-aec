# NextGen AEC

**Browser-Native Digital Twin Platform for Massive LiDAR Point Clouds**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-R3F-61DAFB?style=flat-square&logo=threedotjs)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/Coverage-85%25-brightgreen?style=flat-square)](./vitest.config.ts)
[![Performance](https://img.shields.io/badge/60fps-1M+_Points-00C853?style=flat-square)](#performance-characteristics)

---

## Executive Summary

**NextGen AEC** delivers enterprise-grade LiDAR visualization directly in the browser, eliminating the need for expensive GPU servers or proprietary desktop software. By pushing all rendering to the client GPU, we achieve infinite horizontal scale at the cost of static file hosting.

```
Traditional Pipeline:  S3 → GPU Server ($$$) → Compressed Stream → Browser
NextGen Architecture:  S3 → Edge CDN → Raw Binary → Client GPU (FREE)
```

**Key Business Impact:**
- **90% cost reduction** vs. server-side rendering ($0.02/GB transfer vs. $2.50/hour GPU)
- **Zero infrastructure scaling** — static files, infinite users
- **Sub-3s load times** for 100MB+ point clouds
- **60 FPS** with 1M+ points on commodity hardware

---

## Architecture Overview

### System Design Philosophy

This codebase follows a **Documentation-First, SOLID-Compliant** architecture designed for:

1. **Decoupled Rendering** — Three.js engine operates independently of React lifecycle
2. **Cloud-Agnostic Data Layer** — Seamless S3/local switching via environment configuration
3. **Design System Foundation** — Scalable UI component library with tokenized theming
4. **Event-Driven State** — Observer pattern for engine-to-UI communication

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │    Header    │  │   Sidebar    │  │  Telemetry   │  │   Tooltip    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                              ↓ Design System ↓                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  GlassPanel  │  IconButton  │  Badge  │  Text  │  ColorTokens  │     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                              APPLICATION LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         page.tsx (Orchestrator)                       │   │
│  │  • useDataLoader    • usePlaneVisibility    • useKeyboardShortcuts   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    ↓                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                            Viewer3D.tsx                               │   │
│  │  • Leva Controls    • BIM Overlay    • Smart Ghosts                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                ENGINE LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │    SceneEngine     │  │  PointCloudRenderer│  │   PLYStreamLoader  │    │
│  │  (Event Emitter)   │  │  (Custom Shaders)  │  │  (Binary Parser)   │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                 DATA LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐    │
│  │ DataSourceResolver │  │   ManifestLoader   │  │ SceneObjectsLoader │    │
│  │  (Env Detection)   │  │  (Retry + Cache)   │  │  (BIM Metadata)    │    │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Deep Dives

### 1. LiDAR Rendering Engine

The core rendering pipeline is designed for **maximum performance with minimal GC pressure**.

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

The 3D engine operates **independently of React** through an event-driven architecture:

```typescript
// SceneEngine: Owns all Three.js resources
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
// Automatic source detection
const source = dataSourceResolver.resolve();
// → { baseUrl: '/scans', isCloud: false } (development)
// → { baseUrl: 'https://cdn.example.com/assets', isCloud: true } (production)

// Resilient manifest loading with exponential backoff
const room = await manifestLoader.loadRoom('Area_1', 'conferenceRoom_1');
// → { modelUrl, objectsUrl } with 3 retries and 5-minute cache
```

### 4. Design System Foundation

Tokenized design system enabling consistent theming and component composition:

```typescript
// Color tokens with semantic naming
ColorTokens.surface.glass    // 'rgba(24, 24, 27, 0.95)'
ColorTokens.accent.cyan.default  // '#22d3ee'
ColorTokens.scene.axis.x     // '#ef4444' (Three.js axis colors)

// Atomic components
<GlassPanel variant="elevated">
  <Text variant="heading" color="primary">Dashboard</Text>
  <Badge variant="success">Active</Badge>
</GlassPanel>
```

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
│   ├── viewer/               # 3D visualization components
│   │   ├── Viewer3D.tsx      # React bridge to engine
│   │   ├── BIMOverlay.tsx    # Plane visualization
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

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Installation

```bash
git clone https://github.com/your-org/nextgen-aec.git
cd nextgen-aec
pnpm install
```

### Development

```bash
pnpm dev
```

Open http://localhost:3000. Demo data streams from the production S3 bucket.

### Testing

```bash
pnpm test           # Run unit tests
pnpm test:coverage  # Generate coverage report
```

### Production Build

```bash
pnpm build
pnpm start
```

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

### Phase 1: Foundation (Current)
- [x] WebGL point cloud rendering
- [x] Binary PLY streaming
- [x] Client-side LOD switching
- [x] Design system foundation
- [x] Cloud-agnostic data layer
- [x] Unit test coverage (85%+)

### Phase 2: Performance (Q1)
- [ ] **Rust/WASM Spatial Engine** — Migrate collision detection, volume calculation, and spatial queries to Rust via WebAssembly for 10x performance
- [ ] **Web Workers** — Offload PLY parsing to worker threads
- [ ] **Octree Culling** — Frustum culling for massive datasets

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
| **Framework** | Next.js 15 | App Router, Edge Functions |
| **Rendering** | Three.js + R3F | WebGL, React integration |
| **State** | React Hooks | UI state, custom hooks |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Testing** | Vitest | Unit tests, coverage |
| **ETL** | Python + Open3D | Point cloud processing |
| **Storage** | AWS S3 | Binary PLY hosting |
| **CDN** | Vercel Edge | Global distribution |

---

## Engineering Standards

### Code Quality

This project enforces **39 quality rules** across:

- **Object Calisthenics** (001-009) — Code hygiene at method level
- **SOLID Principles** (010-014) — Object-oriented design
- **Package Principles** (015-020) — Module cohesion
- **Code Quality** (021-039) — DRY, KISS, YAGNI, security, testing

### Architecture Documentation

Complete Arc42 documentation in `specs/`:

```
specs/
├── 01_introduction/       # Vision and goals
├── 02_constraints/        # Quality rules
├── 03_context/            # System boundaries
├── 04_solution-strategy/  # Technology decisions
├── 05_building-block-view/# C4 architecture
└── 09_decisions/          # ADRs
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Ensure tests pass (`pnpm test`)
4. Commit with conventional commits (`feat: add amazing feature`)
5. Open a Pull Request

---

## License

MIT

---

**Engineered for scale. Documented for audit. Built for the future of AEC.**
