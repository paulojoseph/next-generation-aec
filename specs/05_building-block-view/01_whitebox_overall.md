# 05. Building Block View - Whitebox Overall System

**Version**: 1.0.0
**Last Updated**: 2025-12-20
**Status**: Approved

---

## 1. System Context (C4 Level 1)

O NextGen AEC Platform opera em um ecossistema híbrido que conecta processamento offline de dados LiDAR com visualização em tempo real no navegador.

```mermaid
C4Context
    title System Context - NextGen AEC Platform

    Person(engineer, "AEC Engineer", "Analisa espaços 3D e extrai medições")
    Person(analyst, "Spatial Analyst", "Processa datasets de nuvens de pontos")

    System(nextgen, "NextGen AEC Platform", "Plataforma web de visualização 3D de dados LiDAR")

    System_Ext(s3dis, "S3DIS Dataset", "Stanford 3D Indoor Semantics Dataset")
    System_Ext(lidar, "LiDAR Scanner", "Dispositivos de captura 3D")
    System_Ext(s3, "AWS S3", "Data Lake para armazenamento de PLY")

    Rel(engineer, nextgen, "Visualiza e mede", "HTTPS/WebGL")
    Rel(analyst, nextgen, "Configura e processa", "Python Scripts")
    Rel(s3dis, nextgen, "Fornece dados", "Download/ETL")
    Rel(lidar, nextgen, "Captura raw scans", "Export PLY")
    Rel(nextgen, s3, "Armazena/Recupera", "HTTPS")
```

---

## 2. Container Diagram (C4 Level 2)

```mermaid
C4Container
    title Container Diagram - NextGen AEC Platform

    Person(user, "AEC Professional", "Visualiza e analisa dados 3D")

    System_Boundary(platform, "NextGen AEC Platform") {
        Container(webapp, "Next.js Web App", "TypeScript, React 19", "Interface de visualização 3D com Three.js/R3F")
        Container(api, "Edge API Routes", "Next.js API", "Endpoints para geração procedural de dados")
        Container(scripts, "Python ETL Scripts", "Python 3.11, Open3D", "Processamento e conversão de datasets")
    }

    System_Ext(vercel, "Vercel Edge Network", "CDN e hosting")
    System_Ext(s3, "AWS S3 Bucket", "Armazenamento de PLY/GLB")
    System_Ext(cdn, "Static Assets", "Arquivos PLY pré-processados")

    Rel(user, webapp, "Acessa", "HTTPS")
    Rel(webapp, api, "Gera dados demo", "fetch()")
    Rel(webapp, cdn, "Carrega PLY", "HTTP GET")
    Rel(scripts, s3, "Upload processado", "boto3")
    Rel(s3, cdn, "Sincroniza", "S3 Sync")
    Rel(vercel, webapp, "Serve", "Edge Functions")
```

---

## 3. Component Diagram - Frontend (C4 Level 3)

```mermaid
C4Component
    title Component Diagram - Next.js Web Application

    Container_Boundary(webapp, "Next.js Web App") {
        Component(page, "Page Orchestrator", "page.tsx", "Gerencia estado global e layout")
        Component(viewer, "Viewer3D", "React Component", "Orquestra renderização Three.js")
        Component(loader, "usePointCloudLoader", "Custom Hook", "Carrega e parseia arquivos PLY")
        Component(interaction, "useViewerInteraction", "Custom Hook", "Raycasting e seleção de objetos")
        Component(navigation, "useCameraNavigation", "Custom Hook", "Controle WASD + Q/E")
        Component(material, "LidarMaterial", "GLSL Shaders", "Shaders customizados para LiDAR")
        Component(bim, "BIMOverlay", "React Component", "Renderiza planos detectados")
        Component(sidebar, "CombinedSidebar", "React Component", "Lista de objetos e planos")
        Component(telemetry, "TelemetryPanel", "React Component", "Métricas de performance")
    }

    Rel(page, viewer, "Renderiza", "props")
    Rel(viewer, loader, "Carrega dados", "hook")
    Rel(viewer, interaction, "Gerencia seleção", "hook")
    Rel(viewer, navigation, "Controla câmera", "hook")
    Rel(viewer, material, "Aplica shaders", "uniforms")
    Rel(viewer, bim, "Sobrepõe planos", "children")
    Rel(page, sidebar, "Lista objetos", "props")
    Rel(page, telemetry, "Exibe stats", "props")
```

---

## 4. Component Diagram - ETL Pipeline (C4 Level 3)

```mermaid
C4Component
    title Component Diagram - Python ETL Pipeline

    Container_Boundary(scripts, "Python ETL Scripts") {
        Component(semantic, "process_semantic.py", "Python Script", "Processa S3DIS para PLY binário")
        Component(mesh, "mesh_pipeline.py", "Python Script", "Reconstrução de superfície Poisson")
        Component(batch, "process_batch.py", "Python Script", "Orquestrador de processamento em lote")
        Component(scan, "scan_to_bim.py", "Python Script", "Conversão LiDAR raw para BIM")
    }

    System_Ext(s3dis, "S3DIS Dataset", "Arquivos .txt raw")
    System_Ext(output, "Output Directory", "Arquivos .ply processados")
    System_Ext(o3d, "Open3D Library", "Algoritmos de geometria 3D")

    Rel(s3dis, semantic, "Lê annotations", "file I/O")
    Rel(semantic, output, "Grava PLY binário", "file I/O")
    Rel(semantic, mesh, "Alimenta", "file path")
    Rel(mesh, o3d, "Usa algoritmos", "import")
    Rel(mesh, output, "Grava GLB mesh", "file I/O")
    Rel(batch, semantic, "Orquestra", "subprocess")
```

---

## 5. Data Flow Architecture

```mermaid
flowchart TB
    subgraph Sources["Data Sources"]
        S3DIS["S3DIS Dataset<br/>.txt files"]
        LIDAR["LiDAR Scanner<br/>Raw Scans"]
    end

    subgraph ETL["Python ETL Pipeline"]
        PROC["process_semantic.py<br/>Parse + Normalize"]
        MESH["mesh_pipeline.py<br/>Poisson Reconstruction"]
    end

    subgraph Storage["Storage Layer"]
        LOCAL["Local /public/scans<br/>Development"]
        S3["AWS S3 Bucket<br/>Production"]
    end

    subgraph Edge["Vercel Edge"]
        CDN["Global CDN<br/>Cached PLY files"]
        API["Edge Functions<br/>API Routes"]
    end

    subgraph Client["Browser Client"]
        FETCH["fetch() API<br/>ArrayBuffer download"]
        PARSE["PLY Parser<br/>Binary decode"]
        GPU["WebGL/GPU<br/>BufferGeometry"]
        RENDER["Three.js Render<br/>60fps loop"]
    end

    S3DIS --> PROC
    LIDAR --> PROC
    PROC --> LOCAL
    PROC --> MESH
    MESH --> LOCAL
    LOCAL --> S3
    S3 --> CDN
    CDN --> FETCH
    API --> FETCH
    FETCH --> PARSE
    PARSE --> GPU
    GPU --> RENDER
```

---

## 6. Building Block Responsibilities

### 6.1 Frontend Components

| Building Block | Responsabilidade | Interfaces | Dependências |
|----------------|------------------|------------|--------------|
| **page.tsx** | Orquestração de estado global | useState, useEffect | Viewer3D, Sidebar, Header |
| **Viewer3D** | Container da cena 3D | props: fileUrl, callbacks | usePointCloudLoader, Three.js |
| **usePointCloudLoader** | Download e parsing de PLY | return: bufferGeometry, stats | fetch API, DataView |
| **useViewerInteraction** | Raycasting e seleção | return: hoveredId, selectedId | THREE.Raycaster |
| **LidarMaterial** | Shaders GLSL customizados | uniforms: uSelectedId, uTime | ShaderMaterial |
| **BIMOverlay** | Renderização de planos BIM | props: roomName, bounds | @react-three/drei |

### 6.2 ETL Components

| Building Block | Responsabilidade | Input | Output |
|----------------|------------------|-------|--------|
| **process_semantic.py** | Converter S3DIS para PLY binário | .txt annotations | .ply (18 bytes/vertex) |
| **mesh_pipeline.py** | Reconstrução de superfície | .ply point cloud | .glb mesh |
| **process_batch.py** | Processamento paralelo | Directory path | Multiple .ply files |
| **scan_to_bim.py** | Extração de planos | Raw LiDAR | BIM-compatible format |

---

## 7. Technology Stack Overview

```mermaid
mindmap
  root((NextGen AEC))
    Frontend
      Next.js 16
      React 19
      TypeScript Strict
      Three.js / R3F
      @react-three/drei
      Leva Controls
    Backend
      Next.js API Routes
      Edge Functions
      Static File Serving
    ETL
      Python 3.11
      Open3D
      NumPy
      struct (binary)
    Storage
      AWS S3
      Vercel CDN
      Local /public
    DevOps
      Vercel Hosting
      Git Version Control
      pnpm Package Manager
```

---

## 8. Cross-Cutting Concerns

### 8.1 Performance

- **LOD (Level of Detail)**: Skip-rate de 1/50 para qualidade baixa
- **Raycasting Throttle**: 4fps (250ms) para evitar travamentos
- **Memory Cache**: PLY raw mantido em `rawDataRef` para re-processamento

### 8.2 Type Safety

- TypeScript strict mode em todo o frontend
- Interfaces centralizadas em `types/index.ts`
- Validação de bounds e null-checks em hooks

### 8.3 Error Handling

- Try-catch em operações de I/O (fetch, parse)
- Toast notifications para feedback de erro
- Fallback para dados demo quando PLY falha

---

## 9. Quality Attributes

| Atributo | Mecanismo | Building Block |
|----------|-----------|----------------|
| **Performance** | LOD + Shader optimization | usePointCloudLoader, LidarMaterial |
| **Usability** | Real-time controls + tooltips | Leva, ToastContext |
| **Reliability** | Cached raw data + error handling | usePointCloudLoader |
| **Maintainability** | Feature-based organization | /features/viewer, /features/ui |
| **Portability** | Web standards (WebGL, fetch) | All frontend components |

---

## 10. Related Documentation

- [04. Solution Strategy](../04_solution-strategy/stack.md) - Technology decisions
- [06. Runtime View](../06_runtime/scenarios/) - Runtime scenarios
- [08. Technical Concepts](../08_concepts/01_technical_decisions.md) - Design patterns

---

**Document Owner**: Lead Software Architect
**Review Cycle**: Quarterly
**Next Review**: 2026-03-20
