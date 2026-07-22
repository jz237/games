# REMAKE-LOOP — Stunt Car Racer: from-scratch photorealistic rewrite

Self-paced /loop ledger. READ THIS FIRST each iteration — it is authoritative.
GOAL: rebuild Stunt Car Racer as an ORIGINAL Three.js engine that plays as close
as possible to the 1989 game, with fully ANCHORED photorealistic graphics —
elevated track ribbons on real A-frame steel pylons planted into the terrain,
contact shadows, real lighting — and ship it AT THE SAME URL, replacing the
WASM build only after it passes the SWAP GATES below.

## WHY A REWRITE (context)
The current build is the sealed olefriis WASM port wearing an HD paint layer
(hd-graphics.js). The paint layer can restyle pixels but can NEVER add geometry,
so the elevated tracks float with nothing holding them up. Owning the engine
means owning every vertex: pylons, shadows, realism. The trade: exact-original
physics/layout become targets to MEASURE AND MATCH, not givens.

## NORTH-STAR LOOK (user's reference photo, plus v147 aesthetic)
Bright summer alpine valley: lush green grassy hills with oaks/pines, near-black
coarse asphalt deck, weathered red/white concrete-block side walls, red/white
kerb stones, sandy run-off patches, snow-capped mountains, cumulus sky, warm
saturated grading. THE ELEVATED TRACK IS A STRUCTURE: grey steel A-frame pylons
+ cross-bracing every ~2 track-widths, planted in the grass with dark contact
patches; the deck underside is visible steel/board framing, not a floating sheet.

## MEASURE THE ORIGINAL (do this FIRST — it is the parity foundation)
The original WASM game lives in this same folder (entry original reference =
current source.html until the swap; afterwards original.html). Its wrapper
exposes REAL telemetry: `Module._jsGetPlayerRoadSection()`,
`_jsGetPlayerDistanceIntoSection()`, `_jsGetPlayerRoadXPosition()`,
`_jsGetDisplaySpeed()`, `_jsGetPlayerZSpeed()`, `_jsIsTouchingRoad()`,
`_jsGetBoostReserve()`, `_jsGetDamage()`, `_jsIsPlayerWrecked()`, and
hd-graphics captures the per-frame VIEW MATRIX (world is CAMERA-RELATIVE:
view has zero translation; position lives in worldMatrix — see HD-LOOK-LOOP.md).
- **Track tracing**: drive each of the 8 tracks in the original headlessly
  (Playwright, scripted keys) while logging {roadSection, distIntoSection,
  roadX, camera pose from inverse-view, touching, time} every frame → fit a
  centerline polyline + banking per section per track → save as
  `tracks/<name>.json`. Chooser flyover screenshots cross-check silhouettes.
- **Physics curves**: from the same logs extract: accel curve (speed vs t from
  standstill), top speed, boost delta, jump arcs over known ramps (altitude vs
  distance from camera pose), landing bounce profile, wreck thresholds
  (damage delta vs impact), lap time on Little Ramp. These are the NUMERIC
  PARITY TARGETS; store `parity/targets.json`. A/B harness: run the SAME
  scripted inputs in remake vs original, overlay curves, iterate until within
  tolerance (speed ±5%, jump apex ±10%, Little Ramp flying lap ±10%).
- 8 tracks (division order): Little Ramp, Hump Back | Stepping Stones,
  Big Ramp | Roller Coaster, High Jump | Ski Jump, Draw Bridge.

## ARCHITECTURE
- `remake.html` + `remake/` modules in THIS folder; Three.js VENDORED locally
  (`remake/three.module.js` or min build — site CSP blocks all CDNs).
- Track builder: centerline JSON → extruded deck mesh (asphalt PBR), side walls
  (red/white block texture, alternating segments), kerbs, START gantry, and
  PYLONS: A-frame trusses from deck underside to terrain height, spacing ~2
  deck-widths, with cross-braces + darkened grass contact decals. Undersides get
  steel framing. LOD: far pylons simplified.
- Terrain: heightfield valley (gentle hills) + grass PBR + scattered tree
  billboards/low-poly trees + sand patches + distant photo mountain ring +
  sky dome (existing sky.jpg) + soft directional sun with PCF shadows (the
  anchoring seller: track+pylon shadows fall on the ground).
- Car & physics (fixed-step 60Hz): raycast 4-wheel model tuned to the measured
  curves — springy long-travel suspension (the SCR bounce), pitch/roll from
  per-wheel contact, air control minimal, boost = thrust + fuel from measured
  reserve rates, damage accumulates on hard landings/wall hits (visual cracks
  on the existing damage line), wreck → crane respawn (reuse chains.png overlay
  + crane audio moment). Rival AI: follows the traced centerline with a tuned
  speed profile per division.
- Cockpit/UI: REUSE the existing photoreal cockpit stack as-is — cockpit.png,
  wheels/, boost/ flames, dash canvas glyph readouts (speedo x101-245 y164,
  LCDs x10..46 & x259..295 rows y172/182), damage squiggle, glass menus,
  title backdrop, HD badge (switch text to 'REMAKE vNNN'). Same game.css.
- Audio: REUSE audio/*.mp3 + the hd-audio.js mixer patterns (engine idle/high
  crossfade by speed, boost, air, crash by damage delta, wreck, fanfare/lost,
  menu synthwave). Drive it from the remake's own state object instead of
  Module exports.
- Saves: keep localStorage records (best laps per track); seasons later.

## SWAP GATES (do NOT replace source.html before ALL pass)
1. All 8 tracks drivable start→finish, matching traced layouts (overlay check).
2. Physics parity within tolerances above on at least Little Ramp + Big Ramp +
   Ski Jump (one flat, one huge jumps, one drop).
3. Pylons/shadows verified on every track (screenshot sweep) — NOTHING floats.
4. Practice + single-rival race + damage/boost/wreck/records working; menus,
   mobile touch (letterboxed 8:5 like today), keyboard; zero console errors.
5. Perf: 60fps desktop, ≥30fps SwiftShader headless proxy (frame time log).
THEN swap: source.html → remake entry; original preserved at original.html
(link it from the menu as 'Original 1989 engine'); bump SW CACHE + all v tokens;
keep the game in the games-page UNFINISHED set (both slugs already listed).
Until the swap, remake.html deploys ALONGSIDE — safe to ship every iteration.

## BACKLOG (top = next; one shippable item per iteration)
1. Original-tracer: Playwright harness logging telemetry+camera per frame on
   Little Ramp; fit centerline; `tracks/little-ramp.json`; overlay plot vs
   chooser flyover screenshot.
2. Track builder v1: deck+walls+kerbs from JSON; drive it.
3. PYLONS + contact shadows (the anchoring payoff) + underside framing.
4. Physics tuning round 1 vs parity targets (accel/top/jump arc on Little Ramp).
5. Trace remaining 7 tracks (batch the harness); build all; sweep screenshots.
6. Cockpit/HUD integration (reuse stack) + audio integration (reuse mixer).
7. Rival AI + race flow (crane start, laps, win/lose, damage/wreck/records).
8. Physics tuning round 2 (Big Ramp jumps, Ski Jump, wreck thresholds).
9. Mobile touch + gamepad + perf pass (LODs, shadow cascade budget; SwiftShader
   headless baseline is ~11fps at 1600x900 — needs to reach >=30 for the gate).
10. Swap-gate audit → SWAP source.html, keep original.html, sitemap/index
    descriptions updated ('remake' wording, still Unfinished).
11. Closing survey vs reference photo + original; seed round two.

## PROCESS (every iteration)
- Home: worktree `/home/jez237/.openclaw/workspace/worktrees/scr-hd`, game at
  `games/2026-07-17/stunt-car-racer/`. Commit early (sweeper); push: commit →
  `git fetch && git rebase origin/main` (RESOLVE conflicts — OpenClaw edits
  games/index.html too) → `push origin scr-hd:main`.
- Art: fal `openai-gpt-image-2` (returns 1024×768 RGB; transparency arrives as a
  painted checkerboard → BiRefNet remove_background). REUSE existing textures
  first: tex-grass/tex-asphalt2/tex-wall/tex-sand/tex-trees/sky.jpg/cockpit
  stack/audio pack. New needs: steel truss/pylon texture, deck underside,
  maybe hi-res skybox. ElevenLabs only if a new sound is truly missing.
- Rig: adapt scr-iter.mjs pattern for remake.html (serve worktree, screenshot
  menu/track/race, REQUIRE zero console errors); A/B parity harness for physics.
- RELEASE CHECKLIST: bump v tokens in source.html+sw.js + CACHE_NAME + hd-audio
  V + badge ('REMAKE vNNN · date'); add remake files to sw.js ASSETS; deploy
  `scripts/deploy_cloudflare_pages_site.sh <worktree>`; verify
  jez237-site.pages.dev (edges lag minutes; poll content, never first-touch new
  paths on jez237.com); sync GitHub mirror (scratchpad/gh-games: pull → rsync →
  commit as jz237 → push → poll pages build). jez237.com domain remains STUCK
  on an old deployment until the user re-attaches it in the dashboard.
- Keep the game in the games-page UNFINISHED section (slug set in
  games/index.html: 'stunt car racer' + 'stunt car racer hd' — add the remake
  title's slug if the card title changes).

## HARD-WON GOTCHAS (inherited — do not relearn)
- CSP: script-src 'self' — vendor EVERYTHING locally; no CDN, no external img.
- PWA: sw.js caches aggressively — every release MUST bump CACHE_NAME scr-vNNN
  + all ?v= tokens or players keep the old build.
- Playwright renders WebGL headless fine (SwiftShader); audio unlock gesture =
  click (8,8) — letter keys hit game bindings; headless runs slow-mo → poll.
- Games index sections come from the UNFINISHED slug set, NOT the card tag.
- The ORIGINAL engine's world is camera-relative (view matrix translation is
  zero) — when tracing, reconstruct world position by integrating car motion
  (speed + heading from view rotation), or use roadSection×sectionLength along
  the centerline as the primary coordinate and camera pose for elevation only.
- Full session history & fill/paint-layer lessons: HD-LOOK-LOOP.md beside this.

## ITERATION LOG
- (newest first: item, result, lesson)
- 2026-07-22 REMAKE v1 — BOOTSTRAP SHIPPED. remake.html + remake/main.js +
  vendored three r171 (three.module.min.js imports ./three.core.min.js — BOTH
  files required). Valley terrain (deterministic value-noise heightfield,
  `terrainH(x,z)` shared by mesh + physics), gradient sky dome, photo mountain
  ring (sky.jpg bottom 26% on an open cylinder, MirroredRepeatWrapping to hide
  strip seams), 140 billboard trees from tex-trees.png (2-column UV split),
  flat test ribbon (asphalt deck + ALTERNATING red/white 30u wall segments =
  reference look), placeholder box-car, fixed-step 60Hz kinematic drive
  (W/S/A/D, C chase cam, Esc menu), HUD pill, REFERENCE.jpg saved (user's
  target photo, extracted 1672x941). QA: window.__remake {ready, state, fps(),
  __t:{renderer,scene,sun,hemi,camera,THREE}}; rig scratchpad/scr-remake.mjs
  (?drive=1 auto-start; menu+standstill+accel+steer+chase shots; exit 1 on any
  console/page error). Zero errors; accel 0->49->66 of VMAX 92.
  LESSONS (shadows — cost 4 probes):
  (a) after resizing a DirectionalLight shadow frustum you MUST call
      shadow.camera.updateProjectionMatrix() — silently no shadows otherwise;
  (b) shadow.bias scales by (far-near): -0.0004 over a 3800u range = ~1.5 world
      units — ERASES contact shadows of low objects (car body!) while tall
      boxes still cast; use bias 0 + normalBias ~0.5;
  (c) keep the shadow ortho window TIGHT (±140) and near/far span narrow
      (800..2600) — follows the car each frame; crispness comes from window
      size, not mapSize;
  (d) debug ladder that worked: CameraHelper + giant test box (proves pipeline)
      -> readRenderTargetPixels histogram of the shadow map (proves caster is
      in the map) -> zoomed screenshot crop (shadow was there, just soft).
  SwiftShader headless: ~11fps at 1600x900 (perf gate work in item 9).
  Deployed alongside as REMAKE v1; main game untouched gameplay-wise (v149
  token/cache bump only, badge 'HD v149 · 22 Jul 2026').
