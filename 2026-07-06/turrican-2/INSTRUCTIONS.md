# Turrican II — Redux : how to play & how to build

## Controls (keyboard)
- **Move:** ← → (or A / D)
- **Jump:** Space (or W / K) — single jump, variable height (release early = shorter)
- **Fire:** J or X (hold)
- **Aim beam:** ↑ / ↓ while firing the BEAM weapon (sweeps the lightning beam)
- **Crouch / look down:** ↓ (or S)
- **Morph wheel:** Shift (or M) — invulnerable-ish roll, fits 1-tile gaps; drop mines with Fire
- **Switch weapon:** Q (cycles owned weapons)
- **Freeze / smart-bomb:** C · **Power line:** V
- **Pause:** P · **Mute:** N
- **Gamepad & touch** are also supported.

## Weapons
- **MULTIPLE** (spread) · **BEAM** (rotatable lightning) · **BOUNCE** (ricochet).
  Grab weapon power-ups to upgrade to L3. Levels persist across switches.

## Build / test
- Engine unit tests: `node tools/test-engine.mjs`
- Browser smoke test + screenshots: `NODE_PATH=$(npm root -g) node tools/browser-test.mjs [port]`
  → writes `tools/shots/{01-title,02-play,03-morph}.png`
- Deploy copy = `index.html` + `assets/**` (js, img, audio). Source of truth =
  `SPEC.md` + `notes/research/`.

## Deploy
Copy `index.html` + `assets/` into
`jez237-website/games/2026-07-06/turrican-2/`, register in the games index, then
run `scripts/deploy_cloudflare_pages_site.sh` from a clean worktree and verify
on https://jez237.com/games/2026-07-06/turrican-2/.
