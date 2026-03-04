# Void Echo — Build Instructions

## Engine
**HTML5 Canvas + Web Audio API** — this game's entire aesthetic is achievable in pure browser code. No framework needed. Full game in Godot 4 with AudioStreamPlayer for real 3D sound.

## Core Systems

### 1. Sonar Ring Renderer (Week 1)
```js
// Each pulse = expanding circle
class Pulse {
  constructor(x, y, maxRadius, power) {
    this.x = x; this.y = y;
    this.radius = 0;
    this.maxRadius = maxRadius; // 300 base, power multiplier
    this.alpha = 0.8;
    this.speed = 200; // px/s
  }
  update(dt) {
    this.radius += this.speed * dt;
    this.alpha = 0.8 * (1 - this.radius / this.maxRadius);
    return this.radius < this.maxRadius;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180,220,255,${this.alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
```

### 2. Object Illumination (Week 1)
- Store all objects (asteroids, voids, nodes) as circles in world space
- Each frame: test all active pulses vs all objects
- On intersection: set object.glowUntil = now + 500ms
- Render: if glowing, draw with appropriate color + alpha falloff

### 3. Ship Physics (Week 2)
- Momentum: velocity decays slowly (drag coefficient 0.98/frame)
- Tap/click adds velocity toward tap point
- Boundary: wrap or bounce at screen edge
- Collision: ship vs asteroid = death

### 4. Void AI (Week 2)
- Void: circle entity, no visual in dark
- State machine: IDLE → HUNTING → ATTACKING
- IDLE: random drift
- HUNTING: on pulse detected, set target = pulse origin, move toward it (speed 80px/s)
- HUNTING decay: if no pulse for 3s, return to IDLE
- ATTACKING: if within 40px of ship = kill
- Voids spawn at screen edge every 10s

### 5. Destruction Mechanic (Week 2–3)
- Track all active pulses
- If two pulses intersect AND a Void is in the intersection zone → destroy Void
- Visual: white flash at intersection point, Void explodes into fading red particles

### 6. Audio (Week 3)
- Pulse emit: synthesized sonar ping (Web Audio: sine wave, 440Hz, 0.1s, exponential rolloff)
- Void detection (after reveal): low rumble (noise oscillator)
- Destruction: harmonic burst (multiple sine waves)
- Ambient: very quiet white noise (space hiss)
- Audio cue: Voids make faint sound when close, even in dark

### 7. AI Players (Week 3)
- Aggressive AI: pulse every 1.5s, seeks Void intersections
- Ghost AI: pulse every 5s, prioritizes evasion, rarely destroys
- Demo mode: two AIs running simultaneously with split stats

## Dev Roadmap
| Week | Milestone |
|------|-----------|
| 1 | Pulse renderer + object illumination |
| 2 | Ship physics + Void AI + death |
| 3 | Destruction mechanic + audio + scoring |
| 4 | Level progression + polish + mobile |

## Mobile Notes
- Large tap zones (whole screen = pulse + steer)
- Vibration API on Void proximity (navigator.vibrate)
- Dark mode only — looks stunning on OLED
