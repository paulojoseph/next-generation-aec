# 🗺️ Strategic Roadmap & Evolution Plan

> **Status**: Active Strategy
> **Context**: Transition from PoC to Production-Grade AEC Platform
> **Target**: Scalable Digital Inspection Engine

## 🚩 Executive Summary

NextGen AEC is currently in **Phase 1 (Validation)**. The architecture successfully validates the "Thick Client" thesis, handling 1GB+ datasets using Client-Side Rendering and Python ETL.

**Phase 2** is strategically focused on migrating the data pipeline to **Rust/WASM** to unlock edge-computing capabilities and 10x faster parsing, directly aligning with the requirement for high-performance systems engineering.

---

## 📅 Phased Evolution

### ✅ Phase 1: The Foundation (Current Status)
**Goal**: Prove zero-server-compute architecture viability.
- [x] **Core Engine**: Three.js + React Three Fiber integration.
- [x] **Data Protocol**: Binary PLY (Little Endian) streaming (18 bytes/vertex).
- [x] **ETL Pipeline**: Python scripts (NumPy/Open3D) for offline processing.
- [x] **Smart Features**: "Smart Ghosts" measurement system and Semantic selection.
- [x] **Infrastructure**: Vercel Edge + AWS S3 (Static Delivery).

### 🚧 Phase 2: Performance & Systems Engineering (Next Quarter)
**Goal**: Migrate hot-paths to systems-level languages (Rust/WASM) for massive scale.
- [ ] **Rust Parser (WASM)**: Migrate `usePointCloudLoader` parsing logic to Rust compiled to WebAssembly.
    - *Impact*: Reduce parsing time by ~60% via zero-copy memory sharing.
- [ ] **Edge ETL**: Refactor Python pipelines into a high-performance Rust CLI for CI/CD integration.
- [ ] **Octree Streaming**: Implement Potree-compatible hierarchical chunking to support **10GB+ datasets** (Billions of points).

### 📐 Phase 3: Advanced Spatial Analysis (Digital Inspection)
**Goal**: Deepen the engineering toolkit for AEC professionals.
- [ ] **Edge Snapping Engine**: Enhance "Smart Ghosts" to detect sharp edges, door frames, and ceiling corners automatically.
- [ ] **Volumetric Calculation**: Real-time area and volume calculation of enclosed selections.
- [ ] **BIM Interoperability**: Export measurements and annotations to standard **IFC format**.
- [ ] **PDF Reporting**: Generate automated inspection reports with screenshots and dimension logs.

### 🔮 Phase 4: AI & Future Tech
**Goal**: AI-assisted workflows and Next-Gen Rendering.
- [ ] **WebGPU Backend**: Migrate materials to WGSL for compute-shader analytics.
- [ ] **AI Classification**: Edge-inference to auto-classify unlabeled point clouds (e.g., "Detect all windows").
- [ ] **Real-time Collaboration**: WebSocket integration for multi-user inspection sessions.

---

## 🛠️ Technical Debt & Quality Assurance

| Item | Priority | Strategy |
|------|----------|----------|
| **Test Coverage** | High | Implement Vitest for 3D math logic in `useViewerInteraction`. |
| **Accessibility** | Medium | Keyboard navigation for all panels & ARIA labels on canvas. |
| **Strict Types** | Low | Refactor any remaining legacy types in geometry helpers. |