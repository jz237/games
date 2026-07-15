# Hard Hat Mac - Remastered (v2.2) Design Doc

## Overview

Hard Hat Mac is a modern canvas-platformer reinterpretation of the 1983 Apple II
game. It preserves the construction-site objectives, hazards, timer pressure, and
looping rounds while adding a fourth level, seeded runs, daily shifts, three
difficulty modes, power-ups, combo scoring, achievements, replay ghosts, procedural
audio, responsive controls, and optional global scores.

The game is dependency-free and runs from static files on desktop, touch devices,
and gamepads. `index.html` owns the renderer and simulation, while
`game-support.js` contains reusable validation, daily-seed, quality, replay, resume,
and PWA helpers.

## Levels

### Level 1 - Building Framework (dawn)

- Carry four girders to marked gaps, then hold Down to jackhammer each one tight.
- Five connected floors, ladders, an elevator shaft, and a springboard shortcut.
- Falling bolts, the Vandal, and the inspector pressure the route.

### Level 2 - Construction Site (dusk)

- Collect five lunchboxes, power the electromagnet, and ride the conveyor below it.
- Pincers, dynamite, poison, a duckable squasher, and concrete drips create timing
  challenges around a central elevator shaft.

### Level 3 - The Factory (night)

- Carry five crates, one at a time, to the processor hopper.
- Conveyors feed toward a drowning pool and springboards create vertical shortcuts.
- Electrical arc vents telegraph before energizing, adding a readable route hazard
  without creating unfair spawn damage.

### Level 4 - Crane Heights (golden hour)

- Carry four plates to sockets and jackhammer them in.
- A crane-hook pendulum crosses the roof gap; a wrecking ball and rising beams form
  alternate timed routes.
- Electrical arc vents increase later-round pressure.
- Completion raises the flag and ends the shift with fireworks.

### Rounds

After Level 4, the game loops into a harder round. Enemies gain awareness and pace,
timers shorten, and extra vandals appear. Scaling is capped to keep late rounds
possible rather than merely fast.

## Run modes and difficulty

- New Shift: random seeded run.
- Daily Shift: one deterministic seed per UTC date, suitable for fair comparison.
- Practice: four lives, longer timers, fewer enemies, and a 0.75 score multiplier.
- Standard: baseline balance, three lives, and normal scoring.
- Foreman: two lives, shorter timers, denser enemies, and a 1.25 score multiplier.
- A safe checkpoint is saved during active play and on pause/page exit. Resume
  restores objective state at a safe level start; resumed runs cannot submit global
  scores.

## Simulation and game logic

- Deterministic 60 Hz fixed-step simulation with a seeded PRNG.
- Acceleration movement, coyote time, jump buffering, variable jump height, moving
  platform deltas, ladders, one-way surfaces, and squash/stretch feedback.
- Enemy agents patrol, inspect, alert, chase, recover, seek ladders, and climb between
  connected navigation floors.
- The navigation graph includes reachable walking, climbing, elevator, springboard,
  and short-jump links. Objective and power-up spawns are checked against connected
  components and hazard clearance.
- Per-level objective state survives deaths; carried objects safely respawn.
- Power-ups include coffee, gold hard hat, stopwatch/freeze, and cash.
- Rapid actions chain up to a x5 combo. Extra lives are awarded at score thresholds.
- Eight local achievements cover first points, combo mastery, clean clears, medals,
  full and daily shifts, Level 4, and shield use.

## Presentation and adaptive quality

- Procedural vector-style construction art, animated machinery, character puppets,
  parallax skies, skyline windows, lighting, telegraphs, particles, and indicators.
- Auto graphics quality samples frame rate and adjusts DPR, particle density, glow,
  skyline detail, stars, and clouds. Manual Low/Medium/High overrides are available.
- Particle pools and render-detail caps protect long mobile sessions.
- Normal, deuteranopia, tritanopia, and monochrome color modes are available alongside
  high contrast, reduced flash, reduced motion, and scalable HUD settings.
- Level briefing and menu headings measure their text to fit narrow displays.

## Audio

- Synthesized Web Audio SFX and procedural per-level chiptune music; no sample files.
- Independent SFX and music volume controls, plus mute toggles.
- Sound captions announce explosions, electrical arcs, clock warnings, magnet action,
  and crane movement.
- Resumed shifts restart the correct level music.

## Controls

- Desktop: remappable arrows/WASD, Space/Z jump, Down work/duck, P/Escape pause, and
  M mute. Canvas menus support keyboard focus and semantic button activation.
- Touch: multi-touch D-pad and Jump, pointer capture, slide-between-button input,
  haptics, pause, size/opacity controls, and a drag editor. Portrait and landscape
  positions are saved independently.
- Gamepad: analog stick/D-pad, A/B jump, Start pause, menu navigation, adjustable
  deadzone, disconnect cleanup, and supported vibration.
- Portrait reserves a control shelf. Landscape touch uses side gutters so controls
  do not cover the playfield.

## Accessibility

- Semantic mirror buttons expose every canvas menu to assistive technology.
- Focused mirror buttons activate their matching canvas action without bubbling into
  the canvas-level keyboard handler.
- Dynamic application labels and live regions report menu state, gameplay objectives,
  captions, achievements, pause, resume, and errors.
- High contrast, four color modes, reduced motion, reduced flash, screen-shake toggle,
  captions, scalable HUD, and adjustable controls are persisted locally.
- Blur and visibility loss clear held input and pause active play.

## Replay and progression

- Input frames are run-length encoded and checksummed.
- The best local run stores sparse ghost positions and can be shown as a translucent
  competitor on a matching seed.
- Medals, achievements, settings, bindings, touch layouts, best replay, local scores,
  and resumable progress use versioned/sanitized local storage.

## Scores

- Global endpoint: `https://game-scores.jez237.workers.dev/scores/hard-hat-mac`.
- Client submissions include initials, score, round, seed, mode, difficulty, elapsed
  time, replay checksum, and a proof record.
- Payload shape, ranges, runtime, checksum, mode, and difficulty are validated before
  sending. Practice and resumed runs stay local.
- Responses are sanitized and requests use timeouts, duplicate-submit protection,
  and a local top-10 fallback.
- The score Worker source is not part of this repository, so equivalent validation
  must also be enforced by that service for authoritative anti-cheat protection.

## PWA and offline support

- `manifest.webmanifest` provides fullscreen standalone metadata and the hard-hat
  icon.
- `sw.js` precaches core game files, uses network-first navigation, and serves cached
  local assets offline.
- Settings expose fullscreen and the browser install prompt when available.

## Verification and debug

`window.__g` exposes diagnostics including state, score, lives, player, entities,
seed, navigation spots, `skipToLevel(n)`, `winLevel()`, `kill()`, `give(kind)`,
`step(ms)`, `snap(w)`, `selfTest()`, and `soak()`.

- `?selftest=1` runs focused browser regressions.
- `?soak=100` runs 100 deterministic seeds across all four levels and varied rounds/
  difficulties. It checks objective reachability, fair spawns, finite simulation
  values, first-frame rendering, and completion invariants.
- `?preview=...` exposes responsive score-entry and completion states for visual QA.
