# Chromal Drift — Build Instructions

## Engine
**Godot 4** (GDScript) or **web-first with PixiJS** for immediate browser play. For mobile: Godot export to Android/iOS.

## Art Tools
- **Krita** for background textures and canvas grain (export as PNG sprites)
- **Inkscape** for UI elements (wooden frame, target rings)
- Procedural fluid: custom particle system (no physics engine needed — simple verlet integration)

## Core Systems to Build

### 1. Flow Simulation (Week 1)
- Particle stream: spawn N particles/second from source point
- Each particle has `(x, y, vx, vy, color: RGB)` and falls under gravity
- Collision vs. redirector walls: reflect velocity vector
- Color merge: when two streams occupy same cell → average RGB (capped to prevent mudding too fast)

### 2. Grid & Placement (Week 1)
- Tilemap grid (16×24 cells)
- Drag-and-drop redirectors from toolbar
- Snap to grid, rotation in 45° increments
- Validate placement (no overlap, no blocking sources)

### 3. Drain Logic (Week 2)
- Each drain has a target color (shown as ring)
- When particle hits drain: compare RGB, compute match score (Euclidean distance in Lab color space)
- Score = 100 × (1 - distance/max_distance)

### 4. Canvas Render (Week 2)
- RenderTexture below particles: each particle "bleeds" a soft radial gradient onto the texture
- Alpha accumulates — heavy flow = darker pigment
- Export RenderTexture as PNG for art gallery feature

### 5. AI Solver (Week 3)
- Greedy path-planning: trace flow path per stream, find best redirector placement
- Minimax for two-player competitive variant
- Difficulty: Easy = 1-lookahead, Hard = 5-lookahead

### 6. Polish (Week 4)
- Particle bloom shader (Godot ShaderMaterial)
- Paper grain overlay texture
- Sound: gentle water trickle, satisfying "ding" on drain match
- Level editor (optional)

## Dev Roadmap
| Week | Milestone |
|------|-----------|
| 1 | Particle flow + grid placement |
| 2 | Color mixing + drain scoring |
| 3 | Full level set (20 levels) + AI |
| 4 | Art export + polish + mobile build |

## Stack
- Godot 4.3 + GDScript
- Target: 60fps on mid-range Android (Pixel 6)
- Canvas resolution: 1080×1920 (portrait)
