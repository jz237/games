# Prism Cascade — Build Instructions

## Engine
**HTML5 Canvas (vanilla JS)** for browser demo. Full game: **Godot 4** with custom beam shaders.

## Core Systems

### 1. Ray Marching Engine (Week 1)
The heart of the game. A beam is traced cell by cell:
```js
function traceBeam(startX, startY, dirX, dirY, color, depth=0) {
  if (depth > 20) return; // prevent infinite loops
  let cell = getNextCell(startX, startY, dirX, dirY);
  if (!cell) return drawBeam(startX, startY, screenEdge, color);
  
  switch(cell.type) {
    case 'mirror': 
      reflectDir(dirX, dirY, cell.orientation);
      traceBeam(cell.x, cell.y, newDirX, newDirY, color, depth+1);
      break;
    case 'prism':
      let rays = splitBeam(color, dirX, dirY);
      rays.forEach(r => traceBeam(cell.x, cell.y, r.dx, r.dy, r.color, depth+1));
      break;
    case 'filter':
      let filtered = applyFilter(color, cell.filterColor);
      if (filtered) traceBeam(cell.x, cell.y, dirX, dirY, filtered, depth+1);
      break;
    case 'target':
      scoreTarget(cell, color);
      break;
  }
  drawBeam(startX, startY, cell.x, cell.y, color);
}
```

### 2. Color Model (Week 1)
- Colors stored as `{r: 0|1, g: 0|1, b: 0|1}` (additive light, not pigment)
- White = {r:1, g:1, b:1}
- Prism split: white → [{r:1,g:0,b:0}, {r:0,g:1,b:0}, {r:0,g:0,b:1}]
- Mix at intersection: OR the channels → Red+Green = {r:1,g:1,b:0} = Yellow
- Filter: AND the channels with filter mask
- Render: convert to CSS `rgb(r*255, g*255, b*255)`

### 3. Grid & Placement (Week 2)
- 8×12 grid (portrait mobile)
- Drag pieces from sidebar onto grid
- Snap to cell, rotate with double-tap (90° increments)
- Highlight valid placements (green overlay)
- Undo/redo stack
- Recalculate all beams on every piece change

### 4. Beam Rendering (Week 2)
```js
function drawBeam(x1, y1, x2, y2, color) {
  // Glow layer
  ctx.shadowBlur = 15;
  ctx.shadowColor = cssColor(color);
  ctx.strokeStyle = cssColor(color);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Core bright layer
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  ctx.stroke();
}
```

### 5. Puzzle System (Week 3)
- Level format: JSON with source positions, target positions+colors, available pieces
- 30 handcrafted levels + procedural generator
- Procedural: place pieces randomly, trace solution, shuffle pieces back to inventory
- AI solver: beam-tracing + backtracking search

### 6. AI Demo Mode (Week 3)
- AI places pieces one at a time, re-traces beams after each
- Uses beam coverage heuristic (maximize colored beam reaching targets)
- Animated: shows each piece being picked up and placed
- After solving: auto-plays cascade animation

## Dev Roadmap
| Week | Milestone |
|------|-----------|
| 1 | Ray marching + color model |
| 2 | Grid + piece placement + rendering |
| 3 | Puzzle set + AI solver |
| 4 | Bloom shaders + sound + difficulty curve |

## Stack
- HTML5 Canvas + vanilla JS (demo)
- Godot 4 with GLSL bloom post-process (full game)
- Sound: crystalline ping on beam activation (Web Audio)
- Mobile: touch drag-and-drop, double-tap to rotate
