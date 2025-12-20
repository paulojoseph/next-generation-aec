# 02. Architectural Constraints

**ID**: ARC42-02
**Status**: Approved
**Last Updated**: 2025-12-20

---

## Overview

Technical and organizational constraints that shape the NextGen AEC architecture. These constraints define the engineering philosophy: **foundational architecture designed for maintainability and scalability**.

---

## Technical Constraints

### TC-001: Next.js 16 with App Router

**Constraint**: Frontend uses Next.js 16.0.8 with App Router.

**Rationale**:
- React 19 concurrent features for heavy 3D UI
- Server Components for initial bundle optimization
- Turbopack for sub-second dev reload

### TC-002: TypeScript Strict Mode

**Constraint**: All code uses TypeScript ^5 with strict mode enabled.

**Configuration**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### TC-003: Three.js/R3F for 3D Engine (EXACT Versions)

**Constraint**: 3D rendering uses Three.js via React Three Fiber.

**Stack** (from package.json):
- three: ^0.181.2
- @react-three/fiber: ^9.4.2
- @react-three/drei: ^10.7.7
- leva: ^0.10.1
- @loaders.gl/ply: ^4.3.4

### TC-004: Zero Server Compute

**Constraint**: All WebGL computation runs on client GPU. Server serves static files only.

**Rationale**:
- Zero GPU server costs (vs $2.50/hr for cloud GPU)
- Infinite horizontal scale via edge caching
- Simplified deployment: static hosting only

### TC-005: Binary PLY Format (Wire Protocol)

**Constraint**: Point clouds use binary little-endian PLY format.

**Schema** (18 bytes per vertex):
```
float32 x, y, z     (12 bytes)  - Position
uint8 r, g, b       (3 bytes)   - Color
uint8 label         (1 byte)    - Semantic class
uint16 objectId     (2 bytes)   - Instance ID
```

**Rationale**: 5-10x smaller than ASCII, direct memory mapping.

---

## Organizational Constraints

### OC-001: Founding Engineer Phase

**Constraint**: Platform architected as if by founding engineer of a startup.

**Implications**:
- Documentation-first approach (Arc42)
- AI-assisted development with quality guardrails
- Decisions documented in ADRs

### OC-002: Feature-Based Folder Structure

**Structure**:
```
src/
├── app/            # Next.js App Router
├── features/
│   ├── viewer/     # 3D visualization domain
│   │   ├── components/
│   │   ├── hooks/
│   │   └── materials/
│   └── ui/         # Interface components
├── contexts/       # React contexts
├── lib/            # Utilities
└── types/          # TypeScript interfaces
```

### OC-003: Vercel Edge Deployment

**Constraint**: MVP deployed on Vercel Edge Network.

**Rationale**:
- Zero-config Next.js deployment
- Global CDN with 100+ edge locations
- Automatic HTTPS and compression

---

## Quality Constraints

### QC-001: 60fps Rendering Target

**Constraint**: Maintain 60fps with 1M+ points.

**Strategies**:
- LOD via skip-rate decimation (1/1 to 1/50)
- Raycasting throttled to 4fps (250ms)
- Shader-based point rendering with attenuation

### QC-002: AI-Assisted Development Guardrails

The project follows 39 quality rules enforced by automated tooling:

| Category | Rules | Focus |
|----------|-------|-------|
| Object Calisthenics | 001-009 | Code hygiene |
| SOLID Principles | 010-014 | OO design |
| Package Principles | 015-020 | Module cohesion |
| Code Quality | 021-039 | DRY, KISS, YAGNI |

**Rationale**: Ensures consistent quality across AI-generated and human-written code.

---

## Future Extensibility Constraints

### FC-001: Rust/WASM Ready Architecture

**Constraint**: Parser architecture designed for Rust/WASM migration.

**Preparation**:
- Isolated parsing logic in `usePointCloudLoader`
- Clear TypeScript interfaces for WASM interop
- Binary format designed for zero-copy in Rust

See [ROADMAP.md](../../docs/ROADMAP.md) for migration plan.

---

**Previous**: [01. Introduction](../01_introduction/001_introduction-and-goals.md) | **Next**: [03. Context](../03_context/003_context-and-scope.md)
