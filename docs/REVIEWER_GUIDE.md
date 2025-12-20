# 🎯 Technical Reviewer Walkthrough

**Welcome!** This guide is designed to take you on a 5-minute tour of the technical highlights of this project. It focuses on the engineering challenges solved rather than just features.

---

## 🔬 1. The "Performance First" Test
**Context**: Rendering millions of points in a browser usually kills the frame rate.

**What to do**:
1. Open the application.
2. Open the **Telemetry Panel** (Top Right).
3. Observe the **FPS Counter**.
4. Use `Left Click + Drag` to rotate rapidly.
5. **Expected Result**: Frame rate stays near 60 FPS (or monitor refresh rate) despite the heavy load. This is achieved via custom GLSL Shaders and direct GPU memory management.

## 📏 2. "Smart Measure" System
**Context**: Measuring in 3D point clouds is notoriously difficult because "points" have no volume—clicks often pass through them or hit a point behind the target.

**What to do**:
1. Click the **Ruler Icon** in the toolbar (activates Measure Mode).
2. **Click** on a wall.
3. Move your mouse. Notice the **Ghost Guides** (Red/Blue/Green dots) appearing.
    - These represent "Smart Snap" candidates (Orthogonal projections).
    - Press `Space`, `W`, `A`, `S`, or `D` to snap to these reliable axis-aligned points.
4. **Why this matters**: This UX pattern mimics CAD software behavior, solving the "shaky hand" problem in a web interface.

## 🖌️ 3. Real-time Shaders
**Context**: We need to visualize depth and height structure without heavy lighting calculations.

**What to do**:
1. Open the **Controls Panel** (Top Left, "Visual Settings").
2. Adjust the `Ceiling Slice` slider.
3. **Observation**: The slicing happens instantly. This is NOT filtering the data array (which would be slow); it is a **fragment shader discard operation**. It determines visibility per-pixel on the graphics card, enabling real-time CT-scan style visualization.

## 🏗️ 4. Code Quality & Architecture
**Context**: A Senior codebase must be maintainable.

**Where to look**:
- `src/features/viewer/hooks/`: Notice how logic is extracted out of UI components.
- `src/features/viewer/materials/LidarMaterial.ts`: Raw GLSL code embedded in TypeScript for performance.
- `docs/ARCHITECTURE.md`: Detailed breakdown of the System Design decisions.

---

**Ready to dive deep?** Check out [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.
