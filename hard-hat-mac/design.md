# Hard Hat Mac — Remastered (v2.0) Design Doc

## Overview
Complete modern rewrite of the 1983 Apple II classic "Hard Hat Mack" by Electronic Arts.
All original gameplay preserved (3 levels, vandal/OSHA enemies, full hazard set, bonus
timer, looping rounds) plus a brand-new fourth level, power-ups, combo scoring,
procedural music, global leaderboards, and modern platformer game-feel. Single-file
`index.html`, canvas 2D, no dependencies, runs on desktop + mobile + gamepad.

## Levels

### Level 1 — Building Framework (dawn)
- 5 girder floors connected by zig-zag ladders; elevator shaft on the left edge.
- Objective: carry 4 loose girders to the marked floor gaps, then **hold ▼ to
  jackhammer** each one tight (progress bar, sparks).
- Hazards: falling bolts (rain from above, aimed loosely at the player), the Vandal,
  the OSHA inspector (extra vandal at round 3+).
- Springboard at lower right launches through an open gap to floor 2.

### Level 2 — Construction Site (dusk)
- 4 floors, central elevator in an open 2-column shaft cut through every floor.
- Objective: collect 5 lunchboxes → the electromagnet powers up → ride the top
  conveyor under the magnet, which grabs Mack and lifts him out (level-end sequence).
- Hazards: 2 pincers (snap cycle — jump when open), dynamite (periodic explosion with
  blast radius), poison box, ceiling squasher (**duck with ▼** to pass), concrete
  spigot dripping blobs, Vandal + OSHA.

### Level 3 — The Factory (night interior)
- Factory backdrop: big windows w/ night sky, furnace glow, hanging work lamps.
- Objective: carry 5 crates (one at a time, overhead) to the processor hopper.
- The left conveyor belt feeds toward the **drowning pool** at bottom-left
  (the floor above the pool is open — fall in and you drown).
- Springboards for vertical shortcuts. Hazards: OSHA, vandals, spigot.

### Level 4 — Crane Heights (NEW, golden hour)
- Two rooftop towers separated by a wide gap, high above the city.
- **Crane hook pendulum** ferries between the two tower TOPS — ride it across.
- **Wrecking ball** swings low through the gap; **two rising steel beams**
  (opposite phases) are the lower crossing route — time your hops.
- Objective: carry 4 steel plates to the marked sockets and jackhammer them in.
- Completion: flag raise + fireworks → "SHIFT COMPLETE" (round complete).

### Rounds
After L4 the game loops (round++): enemies +22%/round (cap ~2×), timers −9%/round
(floor 62%), extra vandals appear at rounds 2–3.

## Systems

- **Physics/feel**: accel-based movement, coyote time (0.09s), jump buffering (0.12s),
  variable jump height, squash & stretch, hit-stop on death, screen shake, camera
  smoothing with facing look-ahead.
- **Ladders**: pass through the upper floor; the topmost ladder tile is a one-way
  platform (walk across it, climb up/down through it).
- **Power-ups** (spawn every ~16–26 s, despawn in 9 s): ☕ coffee (+42% speed, 10 s),
  ⛑️ golden hat (one free hit), ⏱️ stopwatch (+20 s clock & freezes enemies 5 s),
  💰 cash (+500).
- **Combo**: pickups/placements within 5 s chain a ×1…×5 multiplier.
- **Lives**: 3 to start, extra life at 10 k / 25 k / then every 25 k (cap 5).
- **Death**: keeps collection progress (girders stay riveted, boxes stay collected,
  a carried item respawns at its original spot); timer refills.
- **Medals**: per-level gold/silver/bronze by remaining clock (≥55% / ≥32%), best
  stored in localStorage.
- **Foreman radio**: personality toasts on level start, deaths, combos, low clock,
  power-ups.
- **First-run hints**: contextual floating tips (movement, climbing, jackhammer,
  squasher duck, crane hook), suppressed after the first session.

## Presentation

- Per-level parallax backdrops: gradient sky, sun, drifting clouds, twinkling stars,
  two layers of skyline with lit windows, crane silhouettes; L3 is a factory interior.
- Procedural art, no assets: I-beam tiles w/ rivets + cross-bracing, animated conveyor
  chevrons, springboards, hazard-striped machinery.
- Characters are runtime-drawn puppets with smooth limb animation (Mack walk/climb/
  jump/duck/carry/jackhammer/death poses; hoodie Vandal with glowing eyes & spray can;
  OSHA inspector with hi-vis vest, clipboard and check-pause animation).
- Lighting: additive glows, work lamps with light cones and flicker, vignette.
- Particles: dust, sparks, explosions, splashes, confetti, magnet arcs, score popups.

## Audio (all Web Audio, no samples)
- Master compressor → SFX bus + music bus (separate toggles, persisted).
- ~30 synthesized SFX (jump/land/steps, jackhammer, rivet, magnet hum, explosion,
  splash, springs, pickups w/ combo pitch, jingles…).
- **Procedural music sequencer**: per-level 2-bar chiptune tracks (title, L1 upbeat,
  L2 tense, L3 industrial, L4 golden-hour w/ pads), swing, echo on lead, kick/hats;
  switches to a "danger" hat pattern when the clock drops below 25%.

## Controls
- **Desktop**: WASD/arrows, SPACE/Z jump, S/▼ duck + jackhammer, P/Esc pause (auto on
  blur), Enter start/advance, M mute, typed initials.
- **Touch**: D-pad + JUMP overlay (multi-touch, haptics via `navigator.vibrate`).
- **Gamepad**: stick/d-pad, A/B jump, Start pause — hot-pluggable.
- Millipede desktop pass: logical-res cap (H≤960), letterboxed column, window-wide
  input, DPR cap 2.4. Mobile path identical (viewScale=1).

## Scores
- Global leaderboard: Cloudflare Worker, namespace `hard-hat-mac`
  (`GET/POST https://game-scores.jez237.workers.dev/scores/hard-hat-mac`,
  `{initials, score, extra:'R<round>'}`), localStorage fallback + local top-10.
- Submitting is optional (PUNCH IN / SKIP).

## Debug
`window.__g` exposes state/score/lives/player/entities, `skipToLevel(n)`,
`winLevel()`, `kill()`, `give(kind)`, `step(ms)` (manual frame for headless tests),
`snap(w)` (canvas JPEG data-URL).
