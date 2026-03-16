# Crystal Cavern — Full Build Specification

## Overview
A vertical descent game where the player controls a luminous crystal orb falling through a dark, procedurally-generated cave. Dynamic lighting means you only see what the orb illuminates. Collect orbiting gems to increase light radius and score multiplier. Hit walls to shatter. Single self-contained index.html.

---

## SCREENS & STATE MACHINE

### States: TITLE → PLAYING → GAMEOVER
- **TITLE:** Dark cave background with slow-drifting crystal particles. Game title "CRYSTAL CAVERN" in crystalline font (CSS text-shadow glow). "TAP TO DESCEND" pulsing below. "HIGH SCORES" button bottom-right.
- **PLAYING:** Main gameplay. HUD overlay: depth (top-left), score (top-right), pulse charges (bottom-center as glowing orbs).
- **GAMEOVER:** Freeze frame → shatter animation → fade to overlay showing: "DEPTH: X", "SCORE: X", "GEMS: X". If high score, show initials entry. Always show leaderboard. "DESCEND AGAIN" button.

### Transitions
- TITLE → PLAYING: tap anywhere (not on High Scores button). 1-second zoom-in effect.
- PLAYING → GAMEOVER: collision with wall. 2-second shatter sequence then overlay fades in.
- GAMEOVER → PLAYING: tap "DESCEND AGAIN". Quick fade.
- GAMEOVER → TITLE: "MENU" button.

---

## CAVE GENERATION

The cave is generated procedurally as segments. Each segment is a horizontal "slice" of the cave.

### Algorithm:
- Maintain a `caveCenter` (x position) and `caveWidth` that evolve over time
- `caveCenter` follows a smooth sine-wave path with random frequency/amplitude changes
- `caveWidth` narrows gradually with depth (starts at 70% of screen, minimum 25%)
- Every ~500 depth units, add a "squeeze" section (caveWidth drops to 60% of current for ~100 units)
- Store cave as array of {leftWall, rightWall} entries, one per pixel row

### Crystal Formations:
- Stalactites hang from the top-wall at random intervals (triangular/angular shapes)
- Stalagmites grow from bottom-wall
- Moving formations: after depth 1500, some crystals slide horizontally across the passage
- Lava streams (depth 3000+): horizontal lines of glowing orange particles that cross the cave

### Wall Rendering:
- Walls are jagged polygonal shapes (not smooth curves)
- Each wall segment: generate 3-5 angular points per ~40px vertical span
- Color: base color from depth palette, with lighter specular highlights where orb light hits
- Light falloff: walls fade into blackness based on distance from orb

---

## ORB (PLAYER)

### Rendering:
- Circle radius: 12px
- Radial gradient: bright white center → crystal blue (#4fc3f7) → transparent edge
- Internal "refraction" effect: a smaller highlight arc that rotates slowly (2-second cycle)
- Outer glow: soft radial shadow blur

### Physics:
- Orb X position eases toward touch X with lerp factor 0.08
- When no touch: orb drifts slowly toward center with very weak force
- Orb Y position: fixed at 35% from top of screen (cave scrolls past)
- No gravity on orb itself — it's the cave that scrolls

### Pulse Ability:
- Double-tap triggers a shockwave ring expanding from orb
- Ring pushes any moving crystal formations away (not walls)
- Visual: expanding white ring with fade, screen flash
- Max 3 charges, shown as small orbs in HUD
- Earn 1 charge per 10 gems collected (cap at 3)

---

## GEMS

### Spawning:
- Gems spawn randomly within the cave passage, 1-3 per screen height
- Positioned away from walls (min 30px buffer)
- Each gem: small diamond shape, faint self-glow (pulsing)

### Collection:
- When orb center comes within 25px of gem center → collected
- Collection effect: gem bursts into 8 sparkle particles, brief screen flash, chime sound
- Collected gem joins the orbital ring around the orb

### Orbital Ring:
- Collected gems orbit the orb in a circle (radius: 20 + 3*gemCount, max radius 60)
- Each gem is a small (4px) glowing diamond rotating at different phases
- Orbital speed: ~2 seconds per revolution
- Each orbiting gem adds to the light radius (+5px per gem)
- Orbiting gems CAN collide with walls → if an orbiting gem hits a wall, it shatters (lost) and the orbital ring shrinks
- This creates risk/reward: more gems = more light but bigger effective hitbox

### Score:
- Base: 1 point per gem collected × current multiplier
- Multiplier: starts at 1x, +0.1x per gem in orbit (10 gems = 2x multiplier)
- Depth bonus: +1 point per 100 depth units

---

## LIGHTING SYSTEM

### Implementation:
- After rendering the cave and objects, apply a "darkness" overlay
- Draw a full-screen black rectangle with alpha 0.95
- Cut out a radial gradient circle centered on the orb (transparent center → black edge)
- Base light radius: 120px + 5px per orbiting gem
- Gems in the cave emit small secondary lights (radius 30px, very faint)

### Technical approach:
- Use canvas `globalCompositeOperation = 'destination-in'` with a radial gradient to create the light mask
- Or simpler: draw everything to an offscreen canvas, then draw darkness overlay with a "hole" using radial gradient

---

## DEPTH PALETTE

Smoothly interpolate between depth zones:
- **0-500:** Deep blue cave (#0a1628 walls, #1a3a5c highlights, gems glow cyan)
- **500-1500:** Amethyst (#1b0a2e walls, #4a2d7a highlights, gems glow purple-white)
- **1500-3000:** Ruby (#2e0a0a walls, #8b3030 highlights, gems glow red-orange)
- **3000+:** Molten (#2e1a00 walls, #c4950a highlights, gems glow gold, lava particles everywhere)

Transition: linear interpolation over 200 depth units at each boundary.

---

## VISUAL EFFECTS (JUICE)

### Constant:
- Sparkle trail behind orb (small white particles with short lifespan, 3-5 per frame)
- Orbiting gems leave faint trails
- Ambient dust particles drifting slowly in the light

### On Gem Collect:
- 8-12 sparkle particles burst outward from gem position
- Brief white flash (canvas alpha overlay, 100ms)
- Slight screen shake (2px, 100ms)
- Score popup floats up from collection point (+N text)

### On Wall Hit (Death):
- Orb SHATTERS: 30-50 crystal fragment particles with physics (gravity, rotation, bounce)
- Fragments are triangular, colored like the orb (white/blue)
- Orbiting gems scatter in all directions
- Major screen shake (8px, 500ms)
- Light expands briefly then fades to darkness over 1 second
- Deep rumble sound

### On Pulse:
- White ring expands from orb (radius 0 → 200px over 300ms)
- Ring has crisp inner edge, soft outer fade
- All particles briefly push outward
- Whoosh sound

### Parallax Background:
- 2 layers of faint stalactite/stalagmite silhouettes behind the walls
- Layer 1: 0.3x scroll speed, very faint
- Layer 2: 0.6x scroll speed, slightly brighter
- Only visible within the light radius

---

## SOUND DESIGN (Web Audio API, procedural)

All sounds generated procedurally, no external files:

1. **Gem collect:** Short high-pitched chime. Sine wave 800Hz→1200Hz, 100ms, quick decay. Each successive gem in a chain raises pitch slightly.
2. **Shatter/death:** Low rumble (60Hz sine, 500ms, heavy reverb) + high crackle (white noise burst, 200ms)
3. **Pulse:** Whoosh — filtered white noise sweep from low to high, 300ms
4. **Ambient:** Very subtle low drone (100Hz sine, barely audible) that shifts pitch with depth zone
5. **Wall scrape warning:** When orb is within 30px of wall, quiet crackling noise (short noise bursts)
6. **Depth milestone:** Every 500 depth, brief deep gong (low sine 80Hz, slow decay)

---

## SCROLL SPEED & DIFFICULTY

- Base scroll speed: 1.5 px/frame at depth 0
- Increases by 0.15 px/frame per 500 depth units
- Max speed: 5 px/frame (reached around depth 3500)
- Speed briefly pauses (0.5s) at depth zone transitions (500, 1500, 3000) with a zone title flash

---

## HUD

- **Top-left:** "DEPTH: XXXX" in small monospace font, white with subtle glow
- **Top-right:** "SCORE: XXXX" same style
- **Top-center:** Multiplier badge "x1.5" (only shown when > 1x), gold color, pulses on change
- **Bottom-center:** Pulse charge indicators (1-3 small orb icons, filled = available, empty = used)
- All HUD text has slight text-shadow for readability over dark background

---

## HIGH SCORE SYSTEM

- localStorage key: `crystal_cavern_highscores`
- Top 10 entries: { initials: "AAA", score: 0, depth: 0 }
- On game over: check if score qualifies for top 10
- If yes: show initials entry screen
  - 3 letter slots, each with ▲/▼ buttons (touch-friendly, large tap targets)
  - "SAVE" button to confirm
- Leaderboard display: ranked list with initials, score, depth
- New entry highlighted in gold with glow animation
- Accessible from title screen via "HIGH SCORES" button

---

## RESPONSIVE LAYOUT

- Canvas fills entire viewport
- All positions calculated as ratios of canvas width/height
- Cave width and orb size scale proportionally
- Touch input mapped to canvas coordinates properly
- Works portrait and landscape (but designed for portrait)

---

## PAUSE / RESUME

- No explicit pause button (keeps UI clean)
- Game auto-pauses if tab loses focus (visibilitychange event)
- On return: brief "TAP TO CONTINUE" overlay, game resumes on tap
- requestAnimationFrame loop handles tab-switch gracefully (cap dt to prevent jump)
