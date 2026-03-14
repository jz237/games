# Magma Surfer — Full Build Specification

## Overview
An endless downhill lava surfing game rendered on HTML5 canvas with a dramatic 3D perspective view. The player rides an obsidian surfboard down a river of molten lava, dodging obstacles, collecting crystals, and surviving increasingly intense volcanic activity.

## Screen States & Transitions

### 1. Title Screen
- Animated lava background (same as gameplay but slower, no obstacles)
- "MAGMA SURFER" title in large embossed/molten text with glow effect
- Lava drips from letters (particle effect)
- "TAP TO START" pulsing text
- "🏆 HIGH SCORES" button in bottom-right
- Subtle rumble/vibration animation on title text

### 2. Gameplay Screen
- Full-screen canvas, 3D perspective view looking down the lava river
- HUD overlay: Score (top-left), Distance (top-center), Crystal count (top-right)
- Combo multiplier display when active (center, fades out)
- Pause button (top-right corner, small ⏸ icon)

### 3. Pause Overlay
- Semi-transparent dark overlay
- "PAUSED" text
- "RESUME" and "QUIT" buttons

### 4. Game Over Screen
- Screen flash red, then darken
- "GAME OVER" with lava drip effect
- Stats: Score, Distance, Crystals Collected, Best Combo
- If new high score: golden glow + "NEW HIGH SCORE!" banner
- Initials entry (if top 10): 3 columns, each with ▲/▼ buttons and letter display, A-Z cycling
- "SUBMIT" button after initials
- High score table showing top 10
- "PLAY AGAIN" and "MENU" buttons

## Visual Rendering (Canvas 2D)

### Lava River (Background)
- 3D perspective: vanishing point at top-center of screen
- River is ~60% of screen width at bottom, narrows to ~20% at horizon
- Lava surface: animated Perlin-noise-like pattern using overlapping sine waves
- Color: gradient from bright yellow (#FFD700) at wave peaks to deep orange (#FF4500) in troughs to dark red (#8B0000) at edges
- Animated flow: texture scrolls downward continuously
- River banks: dark volcanic rock (#1a1a1a to #333) with jagged edges
- Occasional lava waterfalls from bank edges (particle streams)

### Parallax Canyon Walls
- Layer 1 (far): Distant volcanic mountains, dark purple/red silhouettes
- Layer 2 (mid): Canyon walls, dark grey rock with orange lava veins/cracks
- Layer 3 (near): Close rocky outcrops that scroll past quickly
- All layers use perspective scaling (smaller at top, larger at bottom)

### Player (Obsidian Surfer)
- Position: lower third of screen
- Surfboard: dark glossy obsidian slab with glowing orange edges
- Surfer figure: simple but stylish silhouette, crouches/stands based on state
- Trail effect: twin lava spray trails behind surfboard (particle system)
- Lean animation: surfer tilts when moving left/right
- Jump animation: board lifts, shadow grows beneath
- Boost animation: surfer crouches, board glows brighter, speed lines appear

### Obstacles (spawn at horizon, grow as they approach)
1. **Lava Rocks** — Dark boulders sitting in the lava, static. Rounded shapes.
2. **Geysers** — Erupting columns of lava. Warning: orange circle pulsates on surface 1.5s before eruption. Eruption lasts 2s with massive particle fountain.
3. **Rock Arches** — Low stone arches spanning part of the river. Must crouch/boost to pass under, or go around.
4. **Lava Waves** — Transverse waves of extra-hot lava crossing the river. Must jump over.
5. **Falling Boulders** — Shadow appears first, then boulder crashes down from above. Screen shake on impact.
6. **Narrowing Canyon** — Banks close in temporarily, reducing safe area.

### Collectibles
- **Crystals**: Glowing gems (rotate, sparkle particle effect). Colors: red ruby, orange topaz, yellow citrine. Worth 100/200/500 points.
- **Shield Orb**: Blue-white glowing sphere. Grants 1-hit protection. Player gains blue aura.
- **Magnet Pickup**: Purple orb. Attracts nearby crystals for 10 seconds.
- **Score Multiplier**: Golden star. 2x score for 8 seconds.

### Particle Systems
1. **Lava Spray Trail** — Constant behind player. Orange/yellow particles arcing outward.
2. **Ember Ambient** — Floating embers rising from lava surface across entire screen. ~50 particles.
3. **Geyser Eruption** — Massive fountain. 200+ particles. Yellow core, orange mid, red outer.
4. **Crystal Collect** — Burst of colored sparkles matching crystal color. 30 particles.
5. **Death Explosion** — Player shatters. Obsidian shards + lava splash. 100+ particles. Screen flash.
6. **Boulder Impact** — Rock hits lava. Splash ring + debris. 50 particles.
7. **Shield Break** — Blue crystal shatter effect.
8. **Speed Lines** — During boost, white/yellow streaks in periphery.

### Screen Effects
- **Heat Distortion**: Subtle wavy distortion at top of screen (simulated with offset rendering of lava)
- **Screen Shake**: On boulder impact, geyser eruption, death
- **Vignette**: Dark edges, intensifies at higher speeds
- **Speed Blur**: Subtle motion blur effect at high speeds (drawn as transparent streaks)
- **Flash**: White flash on crystal collect, red flash on hit

## Controls

### Touch (Primary)
- **Steer**: Touch and drag left/right anywhere on screen. Player follows finger X position relative to river bounds. Smooth interpolation (lerp 0.15).
- **Jump**: Quick tap (< 200ms contact). Player jumps for 0.6s.
- **Crouch/Boost**: Touch and hold (> 400ms without moving). Player crouches, speed increases 30%. Release to stand.
- **Pause**: Tap pause button (top-right). Must check e.target before preventDefault on document touch.

### Keyboard (Secondary)
- Arrow keys or A/D: Steer
- Space: Jump
- Shift (hold): Crouch/Boost
- Escape: Pause

## Game Mechanics

### Speed System
- Base speed: 200 units/s
- Speed increases by 5 units/s every 10 seconds
- Max speed: 600 units/s
- Boost multiplier: 1.3x current speed
- Speed affects: obstacle scroll rate, particle intensity, score accumulation

### Scoring
- Distance: 1 point per unit traveled
- Crystals: 100/200/500 for red/orange/yellow
- Combo: Collecting crystals within 2s of each other builds combo (2x, 3x, 4x, max 5x)
- Near-miss bonus: +50 points for passing within 15px of obstacle
- Multiplier pickup: 2x all scoring for 8s

### Collision
- Player hitbox: rectangular, smaller than visual (forgiving)
- Obstacle hitboxes: circular for rocks, rectangular for arches
- Shield absorbs one hit, then breaks
- On collision without shield: death sequence

### Difficulty Progression
- **Level 1 (0-500m)**: Slow speed, only lava rocks, wide spacing. Tutorial feel.
- **Level 2 (500-1500m)**: Geysers introduced. Speed picks up.
- **Level 3 (1500-3000m)**: Rock arches added. Crystals more frequent.
- **Level 4 (3000-5000m)**: Lava waves. Falling boulders. Canyon narrows.
- **Level 5 (5000m+)**: Everything. High density. Maximum speed. Survival mode.
- Level displayed in HUD, visual announcement on level change ("LEVEL 2 — THE DEEP" etc.)
- Level names: "The Flow", "Eruption Zone", "Crystal Caverns", "The Narrows", "Inferno"

### Death Sequence
1. Screen freezes for 0.1s
2. Player explosion particle effect
3. Screen shakes violently for 0.5s
4. Screen fades to dark red over 1s
5. Game over screen slides in

## Sound Design (Web Audio API — Procedural)

### Continuous
- **Lava Ambience**: Low rumbling drone. Brown noise filtered through low-pass at 200Hz. Subtle volume oscillation.
- **Wind/Speed**: White noise through band-pass filter, frequency rises with speed (300Hz to 2000Hz).

### SFX (all procedural oscillator-based)
- **Jump**: Quick ascending sine sweep (200Hz to 800Hz, 0.15s)
- **Crystal Collect**: Bright chime — triangle wave at 880Hz + 1320Hz, quick decay (0.2s)
- **Boost Start**: Low whoosh — noise burst through rising band-pass
- **Geyser Eruption**: Noise burst with descending filter, long release (1s)
- **Boulder Impact**: Low thud — sine at 60Hz with fast decay + noise burst
- **Shield Break**: Glass shatter — high noise burst through resonant filter
- **Death**: Descending sine sweep (400Hz to 40Hz, 0.5s) + noise crash
- **Near Miss**: Quick high ping — sine at 1200Hz, very short (0.05s)
- **Level Up**: Ascending arpeggio — 3 quick sine tones ascending (C5, E5, G5)
- **New High Score**: Fanfare — ascending major chord sweep

## High Score System
- **Storage**: localStorage key "magma-surfer-highscores"
- **Format**: Array of {initials: "AAA", score: 12345, level: 3, distance: 4500}
- **Top 10 entries**
- **Initials Entry**: 3 letter slots. Each has ▲ and ▼ buttons cycling A-Z. Large touch targets (min 48px). Current letter highlighted. "SUBMIT" button below.
- **Leaderboard Display**: Rank, Initials, Score, Level. New entry highlighted in gold (#FFD700) with glow. Scrollable if needed.
- **Accessible from**: Title screen (trophy button) and Game Over screen.

## Technical Requirements
- Single self-contained index.html file
- Canvas-based rendering, requestAnimationFrame loop
- Delta-time based movement (not frame-dependent)
- Target 60fps
- Responsive: fills viewport, handles resize
- No external assets, fonts, or libraries
