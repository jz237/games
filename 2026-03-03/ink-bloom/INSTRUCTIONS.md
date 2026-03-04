# Ink Bloom — Build Instructions

## Engine & Stack
- **Prototype:** Plain HTML5 Canvas + vanilla JS (zero dependencies)
- **Full game:** Godot 4 with custom shader for ink fluid simulation
- **Art tools:** Procreate for ink texture assets; Photoshop for splash animations

## Architecture

### Grid System
```
16x16 cells, each with:
  - owner: 0 (empty) | 1 (player1) | 2 (player2) | 3 (dead/wax)
  - saturation: 0.0–1.0 (spread strength)
  - absorbency: 0.2–1.0 (random per cell, assigned at start)
  - isVent: bool
```

### Spread Algorithm
Each turn after a drop is placed:
1. BFS outward from all cells owned by current player
2. For each neighbor: `newSat = currentSat * absorbency * 0.85`
3. If newSat > neighbor.saturation → convert neighbor
4. If collision (both players touching same cell): average → dead cell if < 0.3 each

### AI Logic (simple)
- Scan for highest-absorbency unclaimed cells
- Prefer cells adjacent to enemy clusters (aggressive mode)
- Bloom Move triggers when behind by >10 cells

## Dev Roadmap
1. **Day 1:** Grid render + click-to-place drop
2. **Day 2:** Spread algorithm + collision/dead cells
3. **Day 3:** AI opponent (greedy heuristic)
4. **Day 4:** Bloom Move mechanic + vents
5. **Day 5:** Visual polish — ink feathering, pulse animation, victory bloom
6. **Day 6:** Sound (wet splat SFX, ambient drip loop)
7. **Day 7:** Mobile touch, score display, restart

## Art Direction
- Ink textures: hand-painted in Procreate, exported as sprite sheets
- Cell borders: invisible (ink flows freely)
- Fonts: "Playfair Display" for score — elegant, editorial feel
