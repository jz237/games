# SLASH — Build Instructions

## Stack
- Pure HTML5 Canvas, no dependencies
- Single `index.html` file

## Architecture

### Enemy System
```js
enemy = { x, y, vx, vy, hp: 1|2, color, radius: 18, angle: 0, shape: 3-6 sides, echo: bool }
```
- Spawn at random edge, spiral toward center (center-seeking velocity + slight tangential drift)
- Angular polygon shapes, rotating slowly
- HP 2 = shielded (rendered with outer ring), requires 2 cuts

### Slash System
- `pointerdown` → start recording points: `slashPoints = [{x,y,t}...]`
- `pointermove` → append point
- `pointerup` → finalize slash
- Render: bezier-smooth line through points, luminous white with glow, fades over 400ms
- After release: run intersection checks against all enemies

### Slash Intersection
- For each enemy: check if any segment of the slash path passes within `enemy.radius` of `enemy.x, enemy.y`
- `linePointDist(p1, p2, point)` function
- Track kills in one slash → calculate combo: kills² × 10

### Circle Detection
- On slash end: compute centroid and average radius of path
- If start ≈ end (dist < 50px) AND path forms rough loop → trigger bomb
- Bomb: expanding ring animation from center, any enemy within ring at moment of pass = killed

### Echo Enemies
- 30% chance on kill: spawn echo at same position
- Echo: semi-transparent, same shape, slower drift
- Still damages center on contact

### Center Sacred Seal
- Rendered as rotating mandala at canvas center (SVG-like polygon drawing)
- Flash red + screen shake when HP decreases
- Game over at HP 0

### Levels
- Level 1 (0-200 pts): 3 colors, 1 hp, no echoes, slow
- Level 2 (200-500 pts): 4 colors, some 2hp enemies, echo chance 20%, faster
- Level 3 (500+ pts): all 4 colors, shields common, echoes, bomb cooldown +5s

### Finger Ripple
- On every touchstart: draw expanding translucent ring at touch point
