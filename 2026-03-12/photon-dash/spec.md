# Photon Dash — Full Build Specification

Single self-contained HTML5 canvas game. Mobile-first. 60fps. One index.html file, no external dependencies.

## GAME OVERVIEW
You are a photon — a beam of light racing forward through an endless crystal corridor. The corridor scrolls toward you (pseudo-3D perspective). Crystal prisms appear at junctions. Swipe left/right to refract your beam through them. Collect all 7 spectrum colors to complete rainbow cycles for bonus points. Miss a prism or hit a wall = game over.

## STATE MACHINE
TITLE → PLAYING → PAUSED → GAME_OVER → HIGH_SCORE_ENTRY → LEADERBOARD → TITLE

### Title Screen
- Black background with slowly rotating prismatic light beams emanating from center
- Title "PHOTON DASH" rendered large, white text with rainbow chromatic aberration offset (red shifted left, blue shifted right)
- Subtitle "Swipe to Refract" pulsing gently
- "TAP TO START" prompt
- "🏆 HIGH SCORES" button bottom-right
- Tap anywhere (not on button) → PLAYING
- High scores button → LEADERBOARD

### Playing State
- Pseudo-3D corridor rushing toward camera (like a tunnel runner)
- Player photon is a bright glowing orb at bottom-center of screen (fixed Y ~80% down)
- Photon can move left/right across 3 lanes (left, center, right)
- Corridor walls rendered as converging perspective lines with neon glow
- HUD top: Score (left), Level (center), Rainbow Meter (right)

### Paused State
- Tap pause icon (top-left, small ⏸ icon) → overlay dims screen 50%
- "PAUSED" text centered, "Resume" and "Quit" buttons
- Resume → PLAYING, Quit → TITLE

### Game Over State
- Photon shatters into prismatic explosion (100+ particles in rainbow colors fanning out)
- Screen white-flashes then fades to dim
- "SCATTERED" text with glitch/chromatic aberration animation
- Show final score, level, rainbow cycles completed
- If qualifies for top 10 → HIGH_SCORE_ENTRY
- Else → "TAP TO CONTINUE" → TITLE

### High Score Entry
- 3-letter initials, touch friendly
- 3 columns, each showing current letter with ▲/▼ buttons above and below
- Letters cycle A-Z, 0-9, space
- "CONFIRM" button at bottom
- New entry highlighted gold in subsequent leaderboard view
- After confirm → LEADERBOARD

### Leaderboard
- "HIGH SCORES" title with rainbow underline
- Top 10 entries: rank, initials, score, level
- New entry highlighted with gold glow
- "BACK" button → TITLE

## CORRIDOR RENDERING (Pseudo-3D)
- Vanishing point at screen center, ~30% from top
- Draw 2 converging lines from bottom corners to vanishing point = corridor walls
- Horizontal lines at increasing intervals (closer together near vanishing point) = depth markers
- Color: deep indigo/purple base with neon blue edge glow
- Animate depth markers scrolling toward player (speed = current game speed)
- Add subtle star field in the background (tiny white dots drifting slowly)

## LANES
- 3 lanes: left (25% X), center (50% X), right (75% X)
- Player smoothly lerps between lanes (200ms transition, ease-out)
- Swipe left → move one lane left (if not already leftmost)
- Swipe right → move one lane right
- Swipe detection: horizontal swipe > 30px within 300ms

## OBSTACLES & COLLECTIBLES

### Crystal Prisms (Collectibles)
- Appear in lanes, scroll toward player with perspective scaling
- Rendered as hexagonal gem shapes with internal rainbow refraction pattern
- Each prism has a spectrum color (one of ROYGBIV, rendered as that color with white highlight)
- Collecting = photon passes through, burst of colored particles, score +100
- Drawing: hexagon outline with gradient fill, internal light rays, slight rotation animation

### Dark Shards (Obstacles)
- Black/dark purple crystalline shapes
- Hit = game over
- Rendered as jagged angular shapes with dark purple glow
- Appear starting level 3

### Prism Gates (Bonus)
- Full-width rainbow arcs spanning all 3 lanes
- Pass through = all spectrum colors at once + 500 bonus
- Appear rarely (every 30-40 seconds)
- Visual: shimmering rainbow arc with particle aura

## SPECTRUM / RAINBOW METER
- 7 segments in HUD: R, O, Y, G, B, I, V
- Each collected prism fills corresponding segment (glow effect when filled)
- Completing all 7 = Rainbow Cycle: screen flashes rainbow, 1000 bonus points, meter resets
- Partial display: filled segments glow bright, unfilled segments are dim outlines
- Rainbow cycles count shown as small number next to meter

## SCORING
- Crystal prism collected: 100 pts
- Prism gate: 500 pts
- Rainbow cycle completed: 1000 pts
- Distance bonus: 10 pts/second survived
- Level clear bonus: 500 × level number
- Combo: collecting prisms without missing any in sequence. Multiplier: ×1, ×2 (3 in row), ×3 (6 in row), ×5 (10 in row)
- Combo text appears briefly near photon: "×2!", "×3!" etc with scale-up animation

## LEVELS / DIFFICULTY RAMP
- Level 1 (0-15s): Speed 1×. Only prisms, 2 lanes used. Easy intro.
- Level 2 (15-35s): Speed 1.3×. All 3 lanes. More prisms.
- Level 3 (35-60s): Speed 1.5×. Dark shards introduced, 1 per wave.
- Level 4 (60-90s): Speed 1.7×. More shards, first prism gates.
- Level 5 (90-130s): Speed 2×. Dense patterns, shards in pairs.
- Level 6+ (130s+): Speed increases 0.1× per level. Increasingly complex patterns. Shards can appear in 2 lanes simultaneously. "Dark zones" where corridor walls go invisible for 3 seconds.
- Level transitions: brief "LEVEL X" text with expanding ring animation, 1.5s pause

## PARTICLE EFFECTS
1. **Photon trail**: Constant stream of small glowing white/pale-blue particles behind the photon orb, fading out over 0.5s. ~20 particles per frame.
2. **Prism collect**: 30 particles in the prism's color, burst radially outward, shrink and fade over 0.4s
3. **Prism gate**: 60 rainbow particles cascade down like sparks
4. **Rainbow cycle**: 100 particles in all 7 colors spiral outward from photon
5. **Death explosion**: 150 particles, all rainbow, burst from photon position, slow down and fade over 1.5s
6. **Combo text**: floating text that scales up then fades
7. **Wall glow particles**: subtle particles drifting along corridor walls
8. **Dark shard warning**: red glow particles around shards

## SCREEN SHAKE
- On collecting prism: micro-shake (2px, 100ms)
- On rainbow cycle: medium shake (5px, 300ms)
- On death: heavy shake (10px, 500ms)
- Implementation: offset canvas translate randomly, decay linearly

## VISUAL EFFECTS
- **Bloom/Glow**: All bright objects get a second pass drawn at larger size with low opacity (simulated bloom)
- **Chromatic aberration on title**: Red, green, blue layers offset by 2-3px
- **Speed lines**: At higher speeds, thin white lines streak past in perspective
- **Dark zones**: corridor walls fade to invisible, only stars and objects visible. Eerie.
- **Background**: deep space black with subtle blue-purple nebula gradient at edges

## SOUND DESIGN (Web Audio API, procedural)
All sounds generated procedurally with oscillators and filters. No external files.

1. **Prism collect**: bright "ding" — sine wave 800Hz→1200Hz, 150ms, with high-pass filter. Different pitch per spectrum color (R=C, O=D, Y=E, G=F, B=G, I=A, V=B)
2. **Dark shard near-miss**: low rumble — sine 80Hz, 200ms, quick fade
3. **Prism gate**: ascending arpeggio — C-E-G-C rapid 50ms each, bright sine
4. **Rainbow cycle**: major chord swell — C+E+G, 500ms, sawtooth with low-pass, volume swell then fade
5. **Death**: descending chromatic — start 600Hz, drop to 100Hz over 800ms, add noise burst
6. **Level up**: two ascending tones — 400Hz→600Hz, 600Hz→800Hz, 100ms each, triangle wave
7. **Combo multiplier**: quick chirp — 1000Hz, 50ms, square wave
8. **Background hum**: very subtle, continuous low drone 60Hz at 5% volume, gentle pulse

## PHOTON PLAYER RENDERING
- Core: solid white circle, radius 12px (scales with canvas)
- Inner glow: radial gradient white→transparent, radius 20px
- Outer glow: radial gradient (current spectrum pursuit color)→transparent, radius 30px, 30% opacity
- Pulse: radius oscillates ±2px at 2Hz
- Trail: last 15 positions stored, drawn as decreasing-opacity circles

## CONTROLS
- **Swipe left/right**: Change lanes (primary control)
- **Touch and hold left/right half**: Alternative lane control — holding left side moves left, right side moves right
- **Tap pause button**: Pause game (small button, top-left corner, 44×44px touch target)
- Touch is PRIMARY input method
- Keyboard fallback: left/right arrows, P for pause, Enter for confirm

## RESPONSIVE DESIGN
- Canvas fills full viewport
- All positions calculated as ratios of canvas width/height
- Recalculate on resize
- Portrait orientation preferred but landscape works too
- HUD text sizes scale with canvas width

## PERFORMANCE
- Object pooling for particles (pre-allocate 300 particle objects, reuse)
- Only update/draw objects within visible area
- Use requestAnimationFrame with delta-time for consistent speed
- Target 60fps on mid-range phones

## INITIALIZATION
- All arrays (particles, obstacles, collectibles, trail, scores) initialized at declaration as empty arrays []
- No undefined references before first frame
- Game loop starts only after all setup complete

## localStorage HIGH SCORE
- Key: "photon-dash-highscores"
- Store: JSON array of {initials, score, level, rainbows, date}
- Top 10 only
- Check on game over if score qualifies
- Load on title screen for display
