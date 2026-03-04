# PRISM — Build Instructions

## Stack
- Pure HTML5 Canvas, no dependencies
- Single `index.html` file

## Architecture

### Grid System
- 8×8 grid of cells, each 64px
- Cell types: `empty`, `emitter`, `mirror`, `prism`, `target`
- Each cell stores: `type`, `direction` (0–7, in 45° increments), `color`, `lit` (bool)

### Laser Tracing
- On any state change, re-trace all lasers from scratch
- `traceLaser(startX, startY, dx, dy, color, depth)`:
  - Walks the grid cell-by-cell
  - On empty: draw beam segment
  - On mirror: reflect using angle lookup table, recurse
  - On prism: fire two output beams, recurse each
  - On target: mark as `lit`, draw target glow
  - On wall/emitter: stop
  - Max depth 30 to prevent infinite loops

### Rendering
- Background: dark gradient + subtle hex grid
- Beams: `ctx.shadowBlur = 20`, neon colors, 2px stroke
- Spark particles at every bounce: `requestAnimationFrame` particle pool
- Mirror/prism: polygon shapes with metallic gradient fill

### Interaction
- Touch/click on mirror or prism → rotate 45°, retrace all beams
- Animated rotation tween (150ms)

### Levels
```
Level 1: 2 mirrors, 1 emitter, 1 target — linear path
Level 2: 3 mirrors, 1 prism, 2 emitters, 2 targets — split beam needed
Level 3: 4 mirrors, 2 prisms, 2 emitters, 3 targets — crossed beams, resonance target
```

### Win Condition
All targets lit → level complete overlay → advance (or victory screen on level 3)

### HUD
- Level indicator top-left
- "Rotations" counter (score = fewer rotations = better)
- Animated glow border when level complete
