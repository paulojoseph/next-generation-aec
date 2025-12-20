🏗️ System Architecture & Design SpecificationDocument Status: ActiveVersion: 1.0.0Last Update: December 2025Author: Paulo Marques (Founding Engineer)Compliance Classification: Internal1. Executive SummaryNextGen AEC is a Cloud-Native Digital Twin Platform designed to solve the "Last Mile" problem in construction tech: rendering gigabyte-scale LiDAR datasets in a standard web browser without the high cost of server-side GPU rendering (Pixel Streaming).Traditional solutions (Autodesk, Bentley) often rely on heavy desktop clients or expensive cloud rendering (~$2/user/hour). This project proves that modern WebGL (Three.js/React Three Fiber) combined with Smart Data Streaming and a Thick Client philosophy can achieve desktop-class performance on consumer hardware at near-zero marginal cost.2. High-Level ArchitectureWe employ a Jamstack approach optimized for 3D streaming. The architecture prioritizes Latency and Cost Efficiency over centralized processing.Snippet de códigograph TD
    subgraph "Data Layer (AWS S3 / Local)"
        Raw[Raw PLY Files]
        Optimized[Optimized Binary Chunks]
        Manifest[dataset_manifest.json]
    end

    subgraph "Delivery Layer (Vercel Edge)"
        CDN[Edge Network]
        Auth[NextAuth Middleware]
    end

    subgraph "Presentation Layer (Client Browser)"
        Loader[Stream Loader (Worker)]
        Parser[Binary Parser]
        Scene[Three.js Scene / WebGL]
        UI[React UI State]
    end

    Raw -->|Python ETL| Optimized
    Optimized -->|Signed URL| CDN
    CDN -->|Stream| Loader
    Loader -->|ArrayBuffer| Parser
    Parser -->|Geometry| Scene
    UI -.->|Control| Scene
3. Architecture Decision Records (ADR)We treat architectural decisions as immutable records to ensure governance and traceability.Decision ContextAlternative ConsideredChosen StrategyRationale & Business ValueRendering StrategyServer-Side (Pixel Streaming)Client-Side (CSR)Cost & Scalability. SSR scales linearly with cost. CSR offloads compute to the user's GPU, reducing cloud costs by ~95%.Data FormatLAZ (Compressed) / E57Binary PLYParsing Speed. PLY maps directly to GPU buffers (ArrayBuffer), minimizing CPU overhead during load time.3D State MgmtVanilla Three.jsReact Three FiberMaintainability. Declarative binding allows complex UI/3D state sync (e.g., sidebars) with 10x less boilerplate code.StylingSCSS / Styled ComponentsTailwindCSSVelocity. Utility-first approach speeds up UI iteration and ensures design system consistency.4. Technical StackLayerTechnologyPurposeFrontendNext.js 16 (App Router)SSR framework for layout and SEO.3D EngineThree.js + React Three FiberWebGL abstraction and scene graph management.StateReact Context + LevaGlobal state management and debug controls.StylingTailwindCSSRapid UI development.Data PipelinePython (Pandas/NumPy)ETL processing for raw LiDAR data.InfrastructureVercel + AWS S3 (Mocked)Edge delivery and object storage.5. Data Pipeline & EngineeringThe core value lies in how data is prepared before it ever reaches the browser. The ETL pipeline (scripts/) transforms raw Stanford3dDataset files into web-optimized assets.5.1 The Data FlowPlaintext[Raw TXT/LAS] 
    ⬇️ (Extract)
[process_semantic.py] -> Normalization & Coordinate Alignment
    ⬇️ (Transform)
[Binary PLY] -> Little Endian Encoding (GPU Ready) + JSON Metadata
    ⬇️ (Load)
[dataset_manifest.json] -> Acts as a read-only registry for the frontend
5.2 Key TransformationsCoordinate Alignment: Localizes massive world coordinates to a scene-relative origin to prevent floating-point jitter in WebGL.Downsampling: Reduces point density in overlapping areas to optimize vertex count.Binary Encoding: Converts ASCII data to Binary PLY to allow direct memory mapping.6. Frontend Engineering PatternsWe strictly enforce a separation of concerns between View (Presentation), Logic (Hooks), and Data (Loaders).6.1 Directory StructureThe structure reflects a Domain-Driven Design (DDD) approach within a modular monolith:src/
├── app/                  # Next.js App Router (Routing Layer)
├── core/                 # Shared utilities and base configurations
├── features/             # Feature Modules (The Heart of the App)
│   ├── ui/               # 2D Interface (Sidebars, HUDs)
│   └── viewer/           # 3D Logic
│       ├── components/   # Pure R3F Components (SmartGhosts, ProceduralRoom)
│       ├── hooks/        # 3D Logic (Loaders, Raycasters, Navigation)
│       ├── materials/    # Custom Shader Materials
│       └── Viewer3D.tsx  # The Composition Root
├── lib/                  # External libraries wrappers
└── types/                # TypeScript Definitions (Strict Mode)
6.2 Key Components & HooksusePointCloudLoader.ts:Responsibility: Fetches binary data and manages the BufferGeometry.Optimization: Uses typed arrays (Float32Array) for zero-copy transfer to the GPU.SmartGhosts.tsx (The "Smart Measure" Engine):Problem: Users clicking "empty space" between points in a cloud.Solution: A heuristic algorithm that casts rays in orthogonal axes (X, Y, Z) to predict the user's intended surface, snapping measurements to walls/floors automatically.LidarMaterial.ts (Shader Optimization):Technique: Custom Vertex Shader.Benefit: Handles size attenuation and color grading on the GPU, freeing up the CPU for React's reconciliation cycle.7. Performance & ConstraintsTo ensure a smooth 60 FPS experience on average hardware:Vertex Budget: Hard limit of ~2 Million points per scene for non-instanced rendering.Raycasting: Throttled to 250ms intervals to prevent main-thread blocking during mouse movement.Culling: Frustum culling is actively managed; points outside the camera view are not drawn.8. Future Roadmap[Q1] Octree LOD: Implement Potree-like Level-of-Detail streaming to support 10GB+ datasets (billions of points).[Q2] WASM Parser: Port the PLY parser to Rust/WASM to achieve near-native parsing speeds (expecting ~30% boost).[Q3] VR/AR: WebXR integration for immersive on-site inspections.