# Turrican II — Redux : how to play & how to build

## Controls (keyboard)
- **Move:** ← → (or A / D)
- **Jump:** Space (or W / K) — single jump, variable height (release early = shorter)
- **Fire:** J or X (hold) · **Aim up:** hold ↑ while firing · **Aim down (airborne):** hold ↓
- **Aim beam:** ↑ / ↓ while firing the BEAM weapon (sweeps the lightning beam)
- **Crouch:** ↓ (real hitbox shrink) · **Swim (W2 water):** hold Jump/↑ to rise, ↓ to dive
- **Morph wheel:** Shift (or M) — grinding roll, fits 1-tile gaps; drop mines with Fire
- **Switch weapon:** Q · **Freeze / smart-bomb:** C (locks a boss core OPEN) · **Power line:** V
- **Pause:** P / Esc (menu: resume / restart stage / quit) · **Mute:** N
- **World 3 is an on-rails shmup:** steer the fighter with ←↑↓→, hold Fire.
- **Gamepad** (stick/d-pad + A jump, X fire, B morph, Y switch, RB bomb, Start pause, rumble)
  and **touch** (d-pad + 6 buttons) are fully supported.

## Structure
- 5 worlds / 11 stages (2/2/3/2/2): Desert → Submerged Dungeon → Corridor (shmup)
  → Walker Factory → Alien Ship, ending vs **THE MACHINE** (3 phases).
- Every world ends in a boss arena (WARNING banner → sealed wall → weakpoint
  windows). The exit stays LOCKED until the guardian falls.
- Mid-stage **checkpoints**, 3 **continues**, secret **buried vaults** (shoot the
  crate plug open with a down-aimed shot, roll in with the wheel).
- **Difficulty** (easy/normal/hard), volume mixers, CRT toggle in OPTIONS —
  persisted in localStorage. Local top-5 high scores.
- **Voice announcer** (Harry) reacts to events with pooled variants: mission
  start, sector clear, boss warn/down, 1UP, low energy, low time, weapon
  upgrades, deaths, victory.

## Build / test
- Engine unit tests: `node tools/test-engine.mjs` (1300+ assertions)
- Traversability bot (all 11 stages + boss duels): `node tools/playthrough.mjs`
- Browser smoke test + screenshots: `NODE_PATH=$(npm root -g) node tools/browser-test.mjs [port]`
- Deploy copy = `index.html` + `assets/**` (js, img, audio). Source of truth =
  `SPEC.md` + `notes/research/`.

## Deploy
Copy `index.html` + `assets/` into
`jez237-website/games/2026-07-06/turrican-2/`, register in the games index, then
push jz237/jez237-site main (CF Pages) and verify on
https://jez237.com/games/2026-07-06/turrican-2/.
