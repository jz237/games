# Mycelium Network — Build Instructions

## Engine
**Browser-native Canvas2D** (no framework). Ships as a single HTML file with vanilla JS. For a full game: **Godot 4** with custom shader for glow effects.

## Art Style Implementation
- Background: radial gradient from #0a0a0a to #161a12
- Tendrils: `ctx.strokeStyle` with globalAlpha 0.8, lineWidth 2–4px, lineCap=round
- Glow effect: draw line 3× with increasing lineWidth and decreasing alpha (bloom trick)
- Nutrients: radial gradient orbs, animated scale pulse (sin wave on radius)
- Dead tendril: tween alpha 1→0 over 2s while curling (rotate control points)

## Core Systems

### 1. Node Graph (Week 1)
- Network stored as directed graph: `Node {x, y, energy, connections[]}`
- Growth: add child node at direction vector from parent
- Energy propagation: BFS from nutrient nodes inward every tick
- Tendril renderer: walk graph, draw Bézier curves between nodes (control points = perpendicular offset for organic look)

### 2. Growth Simulation (Week 1–2)
- Player clicks tip → queues growth job (4s timer)
- AI: pathfinding toward nearest uncontested nutrient (A* on continuous space)
- Tendril tip actively seeks direction: slight random angle drift (Perlin noise offset per frame)
- Collision detection: circle vs circle on node positions (radius = 8px)

### 3. Energy System (Week 2)
- Each node has `energyLevel` 0–100
- Nutrient node drains at rate 2/s into connected network
- Each tendril segment costs 0.1 energy/s to maintain
- If segment drops to 0 → die animation, remove from graph
- Player energy shown as aggregate of all nodes

### 4. AI Colony Logic (Week 3)
- Easy: random growth with nutrient bias
- Medium: greedy nearest-nutrient pathfinding
- Hard: Voronoi-based territory planning, intercepts player paths
- Two AIs in demo mode: watch them compete

### 5. Visual Polish (Week 3–4)
- Glow bloom: offscreen canvas, blur filter, composite back
- Pulsing animation: each tendril segment oscillates opacity with offset phase
- Particle effects: spore burst = radial particle explosion
- Soundtrack: generative ambient drone (Web Audio API oscillators)

## Dev Roadmap
| Week | Milestone |
|------|-----------|
| 1 | Graph system + basic growth rendering |
| 2 | Energy propagation + collision |
| 3 | AI + full game loop |
| 4 | Glow shaders + sound + mobile touch |

## Stack
- HTML5 Canvas, vanilla JS (demo)
- Godot 4 (full release)
- Shaders: GLSL glow pass
- Mobile: portrait, pinch-zoom on petri dish
