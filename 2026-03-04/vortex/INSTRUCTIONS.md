# VORTEX — Build Instructions

## Stack
- Pure HTML5 Canvas, no dependencies
- Single `index.html` file

## Architecture

### Player Vortex
```js
vortex = { x, y, radius: 40, health: 5, mode: 0, score: 0, rotation: 0 }
```
- Rendered as 4 spinning arc arms around a glowing core
- `rotation += 0.05` each frame
- Core color maps to current mode

### Orb System
```js
orb = { x, y, vx, vy, color: 0-3, radius: 12, trail: [], alive: true }
```
- Spawn every 800ms at random edge position
- Drift toward screen center with slight random curve
- Trail: store last 8 positions for rendering
- Absorption radius = vortex.radius * 1.2

### Collision & Logic
- Each frame: check all orbs against vortex absorption circle
- Match: `orb.color === vortex.mode` → absorb animation, score++, vortex radius grows 0.5px (max 80)
- Mismatch: health--, screen shake, vortex radius shrinks 2px
- Orb off-screen → remove

### Screen Shake
- On wrong absorption: `shakeDuration = 20` frames, offset canvas transform by `sin(frame)*intensity`

### Visual Rendering
- Background: radial gradient dark purple, aurora bands drawn as bezier curves slowly scrolling
- Vortex: 4 arcs rotated, `shadowBlur` glow in mode color
- Orbs: filled circle + `shadowBlur` + trail rendered as fading dots
- Finger ripple on touch: expanding ring at touch point

### Levels
- Level 1 (0-100 pts): 2 colors, slow orbs
- Level 2 (100-250 pts): 3 colors, faster + more orbs
- Level 3 (250+ pts): 4 colors, orbs curve toward vortex, combos (hit 3 same = bonus)

### Controls
- Touch drag → move vortex to finger position
- Tap (no drag) → cycle color mode
- Visual: finger ripple ring on every touch
