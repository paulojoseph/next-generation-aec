# 06. Runtime View - Critical Scenarios

**Version**: 1.0.0
**Last Updated**: 2025-12-20
**Status**: Approved

---

## 1. Overview

Este documento descreve os cenários de runtime críticos do NextGen AEC Platform, detalhando o fluxo de dados, interações entre componentes e estados do sistema durante a execução.

---

## 2. Scenario 01: User Opens Viewer

### 2.1 Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant User as User Browser
    participant Page as page.tsx
    participant Manifest as dataset_manifest.json
    participant Viewer as Viewer3D
    participant Loader as usePointCloudLoader
    participant CDN as CDN/S3
    participant GPU as WebGL Context

    User->>Page: Navigate to /
    activate Page
    Page->>Manifest: fetch('/dataset_manifest.json')
    Manifest-->>Page: { areas: [{ rooms: [...] }] }
    Page->>Page: Select demo room (conferenceRoom_1)
    Page->>Viewer: <Viewer3D fileUrl={modelUrl} />
    activate Viewer
    Viewer->>Loader: usePointCloudLoader(fileUrl)
    activate Loader
    Loader->>CDN: fetch(fileUrl, { mode: 'cors' })
    Note over Loader,CDN: Streaming download (~50-200MB)
    CDN-->>Loader: ArrayBuffer (PLY binary)
    Loader->>Loader: Cache in rawDataRef
    Loader->>Loader: Parse PLY header
    Loader->>Loader: Parse PLY body (vertices)
    Loader->>Loader: Calculate floor/ceiling (percentile)
    Loader->>Loader: Center coordinates
    Loader->>Loader: Create BufferGeometry
    Loader-->>Viewer: { geometry, stats, bounds }
    deactivate Loader
    Viewer->>GPU: Upload BufferGeometry
    Viewer->>Viewer: Apply LidarMaterial
    Viewer->>Page: onStatsUpdate(stats)
    deactivate Viewer
    Page->>User: Render 3D Scene
    deactivate Page
```

### 2.2 Step-by-Step Flow

| Step | Component | Action | Duration |
|------|-----------|--------|----------|
| 1 | Browser | Navega para `/` | - |
| 2 | page.tsx | Monta e inicia fetch do manifest | ~50ms |
| 3 | page.tsx | Parseia manifest e seleciona room | ~10ms |
| 4 | Viewer3D | Recebe `fileUrl` via props | - |
| 5 | usePointCloudLoader | Inicia download do PLY | ~2-10s (rede) |
| 6 | usePointCloudLoader | Cache do ArrayBuffer em memória | ~100ms |
| 7 | usePointCloudLoader | Parse do header (count, stride) | ~5ms |
| 8 | usePointCloudLoader | Parse do body (vertices loop) | ~500ms-2s |
| 9 | usePointCloudLoader | Cálculo de bounds (1st/99th percentile) | ~100ms |
| 10 | usePointCloudLoader | Centralização de coordenadas | ~50ms |
| 11 | usePointCloudLoader | Criação do BufferGeometry | ~100ms |
| 12 | WebGL | Upload para GPU VRAM | ~200ms |
| 13 | Viewer3D | Aplicação do LidarMaterial | ~10ms |
| 14 | page.tsx | Atualização de stats no TelemetryPanel | ~5ms |
| 15 | Render Loop | Primeiro frame renderizado | ~16ms |

### 2.3 State Transitions

```mermaid
stateDiagram-v2
    [*] --> Idle: Page Mount
    Idle --> Downloading: fetch() initiated
    Downloading --> Parsing: ArrayBuffer received
    Parsing --> Processing: Header parsed
    Processing --> Ready: BufferGeometry created
    Ready --> Rendering: GPU upload complete
    Rendering --> [*]: Render loop active

    Downloading --> Error: Network failure
    Parsing --> Error: Invalid PLY format
    Error --> Idle: Retry/Fallback
```

---

## 3. Scenario 02: Fetcher Downloads PLY Header

### 3.1 Header Parsing Detail

```mermaid
flowchart TB
    subgraph Download["Download Phase"]
        FETCH["fetch(url)"]
        BUFFER["await response.arrayBuffer()"]
        CACHE["rawDataRef.current = buffer"]
    end

    subgraph Parse["Header Parse Phase"]
        DECODER["TextDecoder('ascii')"]
        HEADER["Extract header text<br/>(until 'end_header')"]
        VERTEX["Parse 'element vertex N'"]
        PROPS["Parse 'property float x/y/z'"]
        STRIDE["Calculate byte stride<br/>(18 bytes typical)"]
    end

    subgraph Validate["Validation"]
        CHECK["Validate vertex count > 0"]
        FORMAT["Confirm binary_little_endian"]
        OFFSET["Calculate data offset"]
    end

    FETCH --> BUFFER --> CACHE
    CACHE --> DECODER --> HEADER
    HEADER --> VERTEX --> PROPS --> STRIDE
    STRIDE --> CHECK --> FORMAT --> OFFSET
```

### 3.2 PLY Header Example

```
ply
format binary_little_endian 1.0
element vertex 2847593
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
property uchar label
property uint16 objectId
end_header
```

### 3.3 Binary Layout

```
Offset 0-3:   float32 X coordinate (Little Endian)
Offset 4-7:   float32 Y coordinate
Offset 8-11:  float32 Z coordinate
Offset 12:    uint8 Red (0-255)
Offset 13:    uint8 Green (0-255)
Offset 14:    uint8 Blue (0-255)
Offset 15:    uint8 Semantic Label (0-13)
Offset 16-17: uint16 Object ID (0-65535)
-------------------------------------------
Total: 18 bytes per vertex
```

---

## 4. Scenario 03: Worker Parses PLY Data

### 4.1 Parsing Algorithm

```mermaid
flowchart TB
    subgraph Input["Input Data"]
        BUFFER["ArrayBuffer<br/>(~100MB)"]
        OFFSET["Header offset<br/>(~200 bytes)"]
        COUNT["Vertex count<br/>(~2M points)"]
        SKIP["Skip rate<br/>(1, 2, 5, 10...)"]
    end

    subgraph Parse["Parse Loop"]
        VIEW["new DataView(buffer)"]
        LOOP["for i = 0 to count step skip"]
        READ["Read 18 bytes at offset"]
        XYZ["Extract X, Y, Z (float32)"]
        RGB["Extract R, G, B (uint8)"]
        ID["Extract objectId (uint16)"]
    end

    subgraph Transform["Transform"]
        PERC["Calculate 1st/99th percentile Y"]
        CENTER["Center X, Z to origin"]
        FLOOR["Set floor Y = 0"]
        CEIL["Store ceiling height"]
    end

    subgraph Output["Output"]
        POS["Float32Array positions"]
        COLOR["Float32Array colors (normalized)"]
        OBJ["Float32Array objectIds"]
        GEOM["BufferGeometry"]
    end

    BUFFER --> VIEW
    OFFSET --> LOOP
    COUNT --> LOOP
    SKIP --> LOOP
    VIEW --> LOOP
    LOOP --> READ --> XYZ --> RGB --> ID
    XYZ --> PERC --> CENTER --> FLOOR
    FLOOR --> CEIL
    XYZ --> POS
    RGB --> COLOR
    ID --> OBJ
    POS --> GEOM
    COLOR --> GEOM
    OBJ --> GEOM
```

### 4.2 Code Flow (usePointCloudLoader)

```typescript
// Phase 1: Download
const response = await fetch(fileUrl);
const buffer = await response.arrayBuffer();
rawDataRef.current = buffer; // Cache for quality changes

// Phase 2: Parse Header
const headerText = new TextDecoder('ascii').decode(buffer.slice(0, 1000));
const vertexMatch = headerText.match(/element vertex (\d+)/);
const vertexCount = parseInt(vertexMatch[1]);
const headerEndIndex = headerText.indexOf('end_header') + 11;

// Phase 3: Parse Body
const dataView = new DataView(buffer, headerEndIndex);
const stride = 18; // bytes per vertex
const skipRate = qualityPreset;
const outputCount = Math.floor(vertexCount / skipRate);

const positions = new Float32Array(outputCount * 3);
const colors = new Float32Array(outputCount * 3);
const objectIds = new Float32Array(outputCount);

for (let i = 0, j = 0; i < vertexCount; i += skipRate, j++) {
  const offset = i * stride;
  positions[j * 3] = dataView.getFloat32(offset, true);     // X
  positions[j * 3 + 1] = dataView.getFloat32(offset + 4, true); // Y
  positions[j * 3 + 2] = dataView.getFloat32(offset + 8, true); // Z
  colors[j * 3] = dataView.getUint8(offset + 12) / 255;     // R
  colors[j * 3 + 1] = dataView.getUint8(offset + 13) / 255; // G
  colors[j * 3 + 2] = dataView.getUint8(offset + 14) / 255; // B
  objectIds[j] = dataView.getUint16(offset + 16, true);     // ID
}

// Phase 4: Create Geometry
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('objectId', new THREE.BufferAttribute(objectIds, 1));
```

---

## 5. Scenario 04: Render Loop Initialization

### 5.1 Render Pipeline

```mermaid
flowchart TB
    subgraph Init["Initialization"]
        CANVAS["<Canvas> mount"]
        CONTEXT["WebGL2 context creation"]
        SCENE["THREE.Scene setup"]
        CAMERA["PerspectiveCamera<br/>FOV: 45, Near: 0.1, Far: 1000"]
    end

    subgraph Geometry["Geometry Setup"]
        GEOM["BufferGeometry"]
        MATERIAL["LidarMaterial (custom)"]
        POINTS["THREE.Points mesh"]
        ADD["scene.add(points)"]
    end

    subgraph Loop["Render Loop (60fps)"]
        RAF["requestAnimationFrame"]
        CONTROLS["OrbitControls.update()"]
        UNIFORMS["Update uniforms<br/>(uTime, uSelectedId)"]
        RENDER["renderer.render(scene, camera)"]
        FRAME["Swap buffers"]
    end

    subgraph Shaders["Shader Execution"]
        VERTEX["Vertex Shader<br/>- Point size attenuation<br/>- Pass vColor, vObjectId"]
        FRAGMENT["Fragment Shader<br/>- Discard above ceiling<br/>- Highlight selected<br/>- Apply color"]
    end

    CANVAS --> CONTEXT --> SCENE --> CAMERA
    GEOM --> MATERIAL --> POINTS --> ADD
    ADD --> RAF
    RAF --> CONTROLS --> UNIFORMS --> RENDER --> FRAME
    FRAME --> RAF
    RENDER --> VERTEX --> FRAGMENT
```

### 5.2 LidarMaterial Uniforms

```typescript
uniforms: {
  uTime: { value: 0 },              // Animation clock
  uSelectedId: { value: -1 },       // Highlighted object
  uCutoff: { value: 50 },           // Ceiling Y clipping
  uPointSize: { value: 0.02 },      // Base point size
  uOpacity: { value: 1.0 },         // Global opacity
  uSplatTexture: { value: null }    // Optional splat texture
}
```

### 5.3 Frame Timing Budget

```
Target: 60 FPS (16.67ms per frame)

Phase Breakdown:
├── JavaScript Logic:     ~2ms
│   ├── useFrame hooks:   ~1ms
│   ├── Raycasting:       ~0.5ms (throttled to 4fps)
│   └── State updates:    ~0.5ms
├── GPU Rendering:        ~10-12ms
│   ├── Vertex shader:    ~3ms (per 1M points)
│   ├── Fragment shader:  ~5ms (with discard)
│   └── Blending/Output:  ~2ms
└── Idle/Swap:            ~2-4ms
```

---

## 6. Scenario 05: Object Selection via Raycasting

### 6.1 Interaction Flow

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant Canvas as Canvas
    participant Hook as useViewerInteraction
    participant Raycaster as THREE.Raycaster
    participant Geometry as BufferGeometry
    participant State as React State
    participant Shader as LidarMaterial

    User->>Canvas: Click on point cloud
    Canvas->>Hook: onPointerDown(event)
    Hook->>Hook: Record mouse position
    Hook->>Hook: Wait for next useFrame

    loop Every 250ms
        Hook->>Raycaster: setFromCamera(mouse, camera)
        Raycaster->>Geometry: intersectObject(points)
        Geometry-->>Raycaster: IntersectionArray
        Raycaster-->>Hook: { point, index, distance }
        Hook->>Geometry: getAttribute('objectId')
        Geometry-->>Hook: objectId at index
        Hook->>State: setSelectedObjectId(id)
        State->>Shader: uniforms.uSelectedId.value = id
        Shader->>Canvas: Highlight matching points
    end

    Canvas->>User: Visual feedback (pulsing red)
```

### 6.2 Raycasting Optimization

```typescript
// Throttle raycasting to 4fps
const RAYCAST_INTERVAL = 0.25; // seconds
let timeSinceLastRaycast = 0;

useFrame((_, delta) => {
  timeSinceLastRaycast += delta;
  if (timeSinceLastRaycast < RAYCAST_INTERVAL) return;
  timeSinceLastRaycast = 0;

  // Skip if mouse hasn't moved
  if (Math.abs(mouse.x - lastMouse.x) < 0.01 &&
      Math.abs(mouse.y - lastMouse.y) < 0.01) return;

  raycaster.setFromCamera(mouse, camera);
  raycaster.params.Points.threshold = 0.05; // Hit tolerance

  const intersects = raycaster.intersectObject(pointsRef.current, false);
  if (intersects.length > 0) {
    const hit = intersects[0];
    const objectId = geometry.attributes.objectId.getX(hit.index);
    onObjectHover(objectId);
  }
});
```

---

## 7. Scenario 06: Quality Preset Change

### 7.1 Re-processing Flow

```mermaid
flowchart TB
    subgraph Trigger["User Action"]
        LEVA["Leva Control: qualityPreset = 25"]
    end

    subgraph Hook["usePointCloudLoader"]
        EFFECT["useEffect([skipRate])"]
        CHECK["rawDataRef.current exists?"]
        REPARSE["processData(rawData, newSkipRate)"]
        GEOMETRY["Create new BufferGeometry"]
    end

    subgraph GPU["GPU Update"]
        DISPOSE["Dispose old geometry"]
        UPLOAD["Upload new geometry"]
        RENDER["Re-render with fewer points"]
    end

    LEVA --> EFFECT
    EFFECT --> CHECK
    CHECK -->|Yes| REPARSE
    CHECK -->|No| EFFECT
    REPARSE --> GEOMETRY
    GEOMETRY --> DISPOSE --> UPLOAD --> RENDER
```

### 7.2 Performance Comparison

| Quality Preset | Skip Rate | Points (2M original) | GPU Memory | FPS |
|----------------|-----------|----------------------|------------|-----|
| 1 (Ultra) | 1 | 2,000,000 | ~150MB | 30-45 |
| 2 (High) | 2 | 1,000,000 | ~75MB | 45-55 |
| 5 (Medium) | 5 | 400,000 | ~30MB | 55-60 |
| 10 (Low) | 10 | 200,000 | ~15MB | 60 |
| 25 (Very Low) | 25 | 80,000 | ~6MB | 60 |
| 50 (Minimal) | 50 | 40,000 | ~3MB | 60 |

---

## 8. Error Handling Scenarios

### 8.1 Network Failure

```mermaid
flowchart TB
    FETCH["fetch(fileUrl)"]
    CATCH["catch(error)"]
    TOAST["showToast('Failed to load', 'error')"]
    FALLBACK["Load demo data from /api/lidar"]
    RETRY["Retry after 5 seconds"]

    FETCH -->|Network error| CATCH
    CATCH --> TOAST
    TOAST --> FALLBACK
    FALLBACK -->|Still fails| RETRY
```

### 8.2 Invalid PLY Format

```typescript
try {
  const headerText = decoder.decode(buffer.slice(0, 1000));
  if (!headerText.startsWith('ply')) {
    throw new Error('Invalid PLY magic number');
  }
  if (!headerText.includes('binary_little_endian')) {
    throw new Error('Only binary little-endian PLY supported');
  }
} catch (error) {
  console.error('PLY parse error:', error);
  showToast(`Failed to parse PLY: ${error.message}`, 'error');
  setLoading(false);
}
```

---

## 9. Performance Monitoring

### 9.1 Telemetry Metrics

```typescript
interface ViewerStats {
  points: number;       // Loaded point count
  width: number;        // X extent (meters)
  height: number;       // Y extent (meters)
  depth: number;        // Z extent (meters)
  area: number;         // Floor area (m²)
  volume: number;       // Room volume (m³)
  fps: number;          // Render FPS
  drawCalls: number;    // Always 1 for point cloud
  memory: number;       // Estimated GPU memory (MB)
}
```

### 9.2 FPS Tracking

```typescript
useFrame((state) => {
  frameCount++;
  const elapsed = state.clock.getElapsedTime() - lastFpsTime;
  if (elapsed >= 1.0) {
    const fps = Math.round(frameCount / elapsed);
    onStatsUpdate({ ...stats, fps });
    frameCount = 0;
    lastFpsTime = state.clock.getElapsedTime();
  }
});
```

---

## 10. Related Documentation

- [05. Building Block View](../05_building-block-view/01_whitebox_overall.md) - Component architecture
- [08. Technical Concepts](../08_concepts/01_technical_decisions.md) - Design patterns
- [BDD Scenario: LiDAR Viewer](scenarios/lidar_viewer.md) - User story format

---

**Document Owner**: Lead Software Architect
**Review Cycle**: Quarterly
**Next Review**: 2026-03-20
