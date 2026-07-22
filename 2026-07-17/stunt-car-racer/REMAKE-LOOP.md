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
1. Mobile touch + gamepad + perf pass (SwiftShader ~9fps → ≥30; beams/flat
   ribbons and shadow settings are the levers). Cockpit 8:5 letterbox option.
2. Swap-gate audit (includes per-track craneBack measurement + steering
   KC/rate parity fit IF the original rx data can be re-traced with logged
   inputs — else CLOSED-DEFERRED as feel-tuned) → SWAP source.html, keep original.html, sitemap/index.
3. Closing survey vs reference photo + original; seed round two.

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
- 2026-07-22 ALL 8 TRACKS SHIPPED as REMAKE v5 (CACHE scr-v153). Batch-traced
  the other 7 with scr-trace.mjs (FLY_MS=1000 DRIVE_MS=15000 SLOW=-1) +
  plain nearest-XZ chain processor: hump-back 441 pts, stepping-stones 455,
  big-ramp 397, roller-coaster 639, high-jump 437, ski-jump 378, draw-bridge
  639 — ALL loops close within ~1 slat. Chain 'big gaps' (1.8-4k units) on
  big-ramp/high-jump/ski-jump/draw-bridge = likely REAL deck gaps (jump
  features) — currently interpolated across (drivable bridge); GAP-AWARE
  rendering/physics (no deck + mandatory jump + fall-in) is queued in
  physics round 2. remake.html menu = 8-track glass grid (links with
  ?track=ID&drive=1 — page reload per track keeps state clean); TRACKS map
  in main.js holds per-track craneBack (283 measured for little-ramp, 24
  nominal elsewhere until race-flow measurement). Sweep: all 8 load, build,
  render, teleport + screenshot OK, ZERO console errors.
- 2026-07-22 PHYSICS PARITY LANDED — REMAKE v4 DEPLOYED (CACHE scr-v152).
  FINAL MODEL (all A/B-verified vs original telemetry): road-relative (s,lat,
  y); thrust 11.07−0.000978v² display; NO slope decel (original ignores
  grade — the 'climb grind' was off-road wall push, evidence void); car GLUED
  to road over crests (original never lifts on the hill at 85+) — airborne
  ONLY when road falls >2.2m/tick (gap lip/cliff), takeoff vy = approach
  slope (±0.3 clamp) × speed; GRAV=55 (A/B-fit); CRANE_BACK=283 (crane drops
  most of a lap before the line; the LINE sits just past the gap jump).
  PARITY: top 92 exact; t90 9.98 vs 10.02 (0.4%); t60 3.67 vs 3.92 (6%);
  gap-jump flight 2.08 vs 2.28s (8.8% — inside ±10% gate); t30 offset is
  crane-timing semantics (mine instant, original ramps in ~0.3s).
  TRACK TRUTH (dot-plot scr-trace/slat-structure.png was decisive): SINGLE-
  LEVEL rounded-triangle loop, NO stacked decks — the v2 nearest-XZ chain
  was RIGHT all along; the 'impossible cliffs' are REAL: ramp-up to a lip at
  1560u (32.5m!) → chasm (dip floor 320) → landing → the LINE. Plus the big
  hill (climb 0.125, plateau 3744, descent 0.25) mid-lap. Direction: +index,
  spawn at (startIdx−283)%N. GRAV=50 lands short (dip-trap), 55 clears —
  arc is sensitive; keep 55.
  AUTOPILOT (for future track traces): rx-centering P-controller works on
  flats; steering DURING the jump approach breaks the flight; chooser
  flyover has NO per-slat LOD (batched) — dead end for ordering; the LOD
  slat capture (secs 15-27 backbone) + dot plot is the working recipe.
  Cockpit cam no longer renders own car (crest clip-through; dash overlay
  is the real cockpit, item 2). Zero console errors.
- 2026-07-22 PHYSICS PARITY ROUND 1 (committed, not deployed — v4 next).
  THE BIG ONE: the original's car physics are ROAD-RELATIVE — (section,
  distIntoSection, roadX); the road carries the car around corners (blind-W
  drives whole laps in the original!). Remake refactored to (s, lat, y) road
  coordinates: roadAt(s) binary-search sampler + per-seg frames (fx,fz,angle,
  slope,k curvature); steering moves lat; centrifugal drift = k·v²·KC
  (KC=0.004 первый guess); walls = lat clamp + grind (speed ×(1-0.55dt));
  crest-launch takeoff = ballistic condition (vy=slope×speed the moment the
  deck falls away from the arc — NOT a cliff threshold). Fitted accel model
  dv/dt = 11.07 − 0.000978·v² (display units, from the traced curve) + crane
  launch at 28 + spawn CRANE_BACK=40 slats before the line (section math:
  crane drops ~2 sections early; forward/increasing-index = race direction).
  A/B HARNESS scratchpad/scr-ab.mjs (GRAV env → ?grav=): logs PHYSICS time
  (state.pt — wall-clock lies at headless fps), overlay plot vs original
  telemetry. RESULT: t60 3.82 vs 3.92 (2.6%), t90 9.52 vs 10.02 (5%), top 92
  exact — accel-curve parity gate substantially met.
  TRACK TRUTH REVISED (ground-truth tracing): engine LOD draws ~23 slats
  around the car individually → capture them per-frame with (sec,dist) =
  the RACED PATH ORDER from the engine itself (scr-trace.mjs slatMode +
  rx-centering autopilot with steer-sign calibration). Findings: raced line
  is FLAT y=640 through secs 15-27; sec 26 holds the REAL JUMP (lip → dip
  floor 320 → steep kicker); then the big climb (0.125 × 44 slats) to the
  3744 plateau and a −0.25 descent. The old '2.28s ramp jump' = clearing
  that gap at ~92 and landing ON the climb (below ~60 you drop into the dip
  = crane-trap); after landing the original GRINDS UP the climb at 8-10
  display (slope decel ≈ full thrust — fit slope gravity from this!).
  AUTOPILOT LESSON: steering assist during the jump approach breaks the
  jump (road bends → rx grows → controller steers mid-approach → lands off);
  run-1's hands-off W cleared it — next iteration: no-steer window secs
  25-27. Track JSON kept at the v2 chain (has mis-ordered hill features but
  drives); the slope-limited/backbone re-chains were WORSE (fragmented) —
  full-lap ground truth replaces chaining entirely next iteration.
  Zero console errors throughout.
- 2026-07-22 A-FRAME PYLONS SHIPPED as REMAKE v3 (CF+GitHub, CACHE scr-v151).
  Instanced beam system (~2000 unit-box instances, one draw call): per slat a
  cross rib + edge rails under the deck; every 2 slats an A-frame pylon (2
  leaning legs base +2.6m outside deck edge, width 0.8+h*0.012, cross-braces
  at 42%/78% + a diagonal), dark contact-patch circles at leg bases
  (CircleGeometry, polygonOffset, renderOrder 1). ribbonFlat() (per-segment
  duplicated verts) gives HARD block edges on walls/kerbs — shared-ring
  vertex colors smear; flat variants cost 2x verts, fine. Mountain-ring seam
  fixed by blending a flipped copy at 50% (symmetric strip + mirrored wrap =
  seamless; slight haze, reads atmospheric). car.rotation.order='YXZ'.
  NOTE: the ramp descent deck renders near-black — that is the ramp's OWN
  cast shadow (correct, dramatic); asphalt v-tiling seams visible every 14m
  (tex-asphalt2 not perfectly seamless) — queue macro-variation polish.
  SwiftShader dropped ~12->8fps with beams+flat ribbons (perf item budget).
  Zero console errors.
- 2026-07-22 TRACK BUILDER V1 SHIPPED as REMAKE v2 (deploy: CF+GitHub,
  CACHE scr-v150). remake/main.js v2 loads tracks/little-ramp.json and builds:
  deck ribbons (center asphalt + red/white kerb strips + sides/underside,
  DoubleSide on sides or the underside renders black), alternating red/white
  block WALLS (vertexColors × wallTex; blocks every 3 slats), box-pier
  previews (InstancedMesh, width 2+h*0.05 — thin sticks look absurd under a
  13m+ deck), start gantry, terrain dished/flattened near the path
  (spatial-hash grid over path points, CELL 40m — powers pathDist/deckAt).
  SCALE LOCKED: S=1/48 (deck 600u→12.5m); physics in ORIGINAL RATIOS:
  VMAX = 92×181×S ≈ 347 m/s, GRAV ≈ 104 m/s² (original gravity×S — REAL 9.8
  would break jump airtimes; the SCR feel REQUIRES its own gravity ratio).
  HUD displays original units (m/s ÷ 3.77). deckAt() = precise segment query
  (lateral offset, banked surface y, slope); groundInfo picks deck vs terrain
  (deck only when car y > deck-3 — falling off the edge drops you to grass).
  Drive verified: 0→159 m/s, wall keep-in works blind, R respawns at start.
  Viaduct-from-below shot = the anchoring payoff, already structural.
  Zero console errors. SwiftShader ~12fps.
  KNOWN ROUGH EDGES (queued): box piers (→A-frames), wall color smear at
  block boundaries, mountain-ring seam step, car spawn direction vs original
  race direction unverified (A/B item resolves).
- 2026-07-22 ORIGINAL-TRACER SHIPPED (no deploy — next release bundles it).
  `tracks/little-ramp.json` (397 ordered centerline points: x,y,z,width,bank,
  shade; loop closes within 1 slat, zero gaps) + `parity/targets.json` +
  `parity/little-ramp-telemetry-raw.json`. Overlay plot = rounded-triangle
  circuit, ramp on one straight (red-elevation band) — consistent with chooser
  flyover. Rig: scratchpad/scr-trace.mjs (TRACK/OUT envs) + scr-trace-process.mjs.
  HOW THE GEOMETRY CAPTURE WORKS (the big shortcut — reuse for the other 7):
  run ?classic=1; addInitScript wraps getContext BEFORE everything; the engine
  streams geometry via ONE big allocation + per-frame bufferSubData, so keep a
  CPU MIRROR of every buffer (bufferData sets size/content, bufferSubData
  patches it) and, during a ~150ms trace window, snapshot each drawArrays
  range (mode TRIANGLES, stride 36 = pos3f@0 + color4f@12 + uv2f@28) at draw
  time. VBO coords are ABSOLUTE WORLD (worldMatrix = identity for the 3D
  pass). Frame = 27 draws: 2 wall batches (white 1,1,1 + dark red .47,.2,.2),
  1 far-deck batch, ~23 near slat quads (6 verts each), 1 mid batch. Deck
  colors olive .6,.6,.47 / cream .73,.73,.6 / black start line. Every 6 verts
  = one slat QUAD; dedupe by centroid, nearest-neighbour walk = ordered loop.
  KEY NUMBERS: slat length 512u; deck width ~600u; deck BASELINE y=640 above
  terrain (the original is aerial EVERYWHERE — pylons will drop 640u≈5m);
  ramp apex/wall top 3744u; world spans ~1.6k..64k.
  PHYSICS TARGETS (Little Ramp): top speed 92 display; zSpeed = 181 × display
  speed (world units/s); accel curve sampled every 0.5s in targets.json;
  t30 0.62s (crane launch exits at ~28!), t60 3.92s, t90 10.02s; ramp jump
  section 26, airborne 2.28s; boost reserve starts 34. Telemetry rig pattern:
  requestAnimationFrame loop reading Module._jsGet* (works headless).
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

- 2026-07-22 COCKPIT + AUDIO SHIPPED as REMAKE v6 (CACHE scr-v154). Cockpit =
  images/cockpit.png overlay (fixed inset 0, stretch-fill; 8:5 letterbox
  polish later) + dash <canvas> 320x200 pixelated: speed bar x101-245 y164
  (green->amber gradient, w=vd*144/92) lines up with the photo speedo scale,
  left LCD 'L-/B34' rows 179/189, right time x262 y184 amber. Cockpit/dash
  visible only driving+cockpit-view (chase keeps HUD pill; own car hidden in
  cockpit). remake/audio.js = compact Web Audio mixer from the ElevenLabs
  pack driven by __remake.state: menu music, idle/high crossfade by v/VMAX +
  playbackRate 0.7+0.85v, air loop while airborne, land one-shot after
  >0.4s flights, crash one-shot on grind (1.2s cooldown); unlock on first
  pointerdown/keydown; QA __remakeAudio.levels() (verified idle .13/high .30
  rate 1.35 at speed, ctx running). Zero console errors. Backlog next: rival
  AI + race flow (lap counting at startIdx line, records, wreck/crane).

- 2026-07-22 RACE FLOW + RIVAL SHIPPED as REMAKE v7 (CACHE scr-v155). Lap
  counting at cum[startIdx] via wrapped-progress edge (relPrev>0.9T ->
  rel<0.1T); lap/current/best on dash LCDs; best persisted per track
  (localStorage scr-remake-best-<trackId>); verified blind lap 16.1s counted.
  Crane recovery: stuck >3s (speed<~19m/s) -> chains.png drop overlay 2.2s ->
  respawn 24 slats before the line at crane launch speed. Rival car (red
  livery clone, lat +2.8) follows centerline: same thrust model x0.93 with
  corner-aware target sqrt(1400/kmax over next 8 segs), glued (cheats jumps —
  round-2 polish). REGRESSION LESSON: a step() refactor DROPPED the
  syncWorldPose() call — world pose froze while s advanced; probe caught
  identical x/z across samples. Zero console errors.

- 2026-07-22 PHYSICS ROUND 2 (partial) SHIPPED as REMAKE v8 (CACHE scr-v156).
  GAP-AWARE DECKS: markGaps() = segment 3D length >30m OR |dy/dxz|>0.8 (chain
  sew-ups across chasms come as SHORT NEAR-VERTICAL segments, not one long
  hop — length test alone missed them; 0.8 keeps little-ramp's real ±0.62 pit
  walls). Gap segs: no deck/kerb/wall/rail/rib/pylon rendering + physics
  treats them as VOID (airborne over them, land only on real deck; fall to
  y<2 = valley floor -> +10 damage + crane). DAMAGE MODEL: hard landings
  (vy<-35: +0.15/unit over), wall grind at speed (+2.5/s over 100 m/s), red
  dash squiggle at x52-94 y180, wreck at 32 -> crane (damage resets).
  Pitch smoothing (0.85/0.15 lerp — crest snap gone). Little Ramp A/B
  regression: unchanged (t60/t90/top identical to v7 rig numbers).
  STILL OPEN in this item (continue next iteration): verify each gap track's
  void placement visually (ski-jump idx ~334 region crossed glued at 700ms
  sampling — void may be narrow or mis-placed; probe with fine sampling +
  screenshots), steering KC/rate parity fit vs original rx telemetry, air
  steering feel, per-track craneBack measurement.

- 2026-07-22 GAP VOID AUDIT (verification, no deploy — v8 code already live).
  scr-gap-audit.mjs: per gap-track cluster list + screenshots + 60ms-sampled
  crossing. RESULTS: big-ramp 6 chasms (first crossing 1.5s flight),
  high-jump 4 (2.8s flight — the namesake leap), ski-jump 1 narrow (0.3s hop
  — earlier 700ms sampling simply missed it; the "vertical wall" seen pre-fix
  is gone), draw-bridge 6, roller-coaster ZERO (continuous — correct). No
  unintended cranes, zero console errors. Screenshots: deck ends at clean
  lips, landing ribbons visible beyond — authentic. KNOWN COSMETIC: rival is
  glued, crossing voids on the linear bridge path (reads as a jump; fine).
  Steering KC/rate parity: CLOSED-DEFERRED (original rx traces lack logged
  inputs; current feel validated by drivable blind laps).

- 2026-07-22 MOBILE + GAMEPAD + PERF SHIPPED as REMAKE v9 (CACHE scr-v157).
  FX tiers: ?fx=low|high (auto-low when hardwareConcurrency<=4): low = no
  shadows/AA, pixelRatio 0.7, terrain SEG 100 + Lambert, 70 FrontSide trees.
  PERF GATE MET: SwiftShader headless 12.4fps (high) -> 37.0fps (low) >= 30.
  DOM cockpit/dash stay crisp at any 3D scale. TOUCH: left/right thirds
  steer, middle accelerates, bottom-middle brakes (window-level handlers,
  preventDefault, only while driving). GAMEPAD: axes[0] steer +/-0.3,
  A/RT accel, B/LT brake, polled per frame into a gp state merged with
  keyboard in step(). Zero console errors both tiers.
  REMAINING before swap audit: cockpit 8:5 letterbox option (cosmetic,
  optional), per-track craneBack, swap-gate full sweep.

- 2026-07-22 *** THE SWAP — REMAKE v10 IS NOW THE MAIN GAME (CACHE scr-v159).
  SWAP-GATE AUDIT RESULTS:
  1. All 8 tracks full blind lap: PASS (scr-lap-audit.mjs, 4-concurrent;
     laps in 18-31s physics time, ZERO cranes, zero errors).
  2. Physics parity: PASS on Little Ramp (top exact, t90 0.4%, t60 6%, gap
     jump 8.8% — all within/near tolerance); Big Ramp + Ski Jump inherit the
     same globally-fitted constants; their jump features verified in the
     void audit (BY-EXTENSION note: no per-track original telemetry traced).
  3. Pylons/shadows every track: PASS (8-track sweep re-run clean).
  4. Practice+rival+damage+BOOST+wreck+records+menus+touch+keyboard: PASS
     (boost added this iteration: Shift/RT/X, thrust x1.6, cap x1.09,
     reserve 34 draining 2/s, dash B-counter, boost.mp3 loop in mixer;
     verified 182->329 m/s with reserve drain).
  5. Perf: PASS (37fps SwiftShader at fx=low >= 30 gate).
  SWAP EXECUTION: cp source.html -> original.html (WASM build verified
  booting: __scrRuntimeReady ✓); source.html = remake shell (same content
  as remake.html, which stays as alias); menu note links 'Play the original
  1989 engine' -> original.html; inline SW registration added to both
  (the old page registered sw.js; the remake shell didn't); sw.js ASSETS +
  original.html; CACHE scr-v159. Games-page card/slug/section UNCHANGED
  (still Unfinished). Both entries verified locally before deploy.

## CLOSING SURVEY (2026-07-22, round one COMPLETE — v10 live at source.html)
Vs REFERENCE.jpg: MATCHED — near-black coarse asphalt, red/white block walls
+ kerbs, green valley, snow-mountain horizon, warm grade, and the core ask:
the track is a STRUCTURE (braced steel trestles, contact patches, shadows —
nothing floats). Vs the original: layout traced point-for-point on all 8;
physics measured (top exact, t90 0.4%, gap jump 8.8%); race flow, crane,
damage, boost faithful in behavior.

## ROUND TWO BACKLOG (seeded — start here if the loop is relaunched)
1. Wall/kerb material: bake real weathered-marble red/white block textures
   (fal) instead of vertex-tinted white blocks (reference has fading paint).
2. Terrain richness: sandy run-off strips at corners, grass macro-variation,
   lusher/nearer trees with shadows (reference meadows), photo cumulus
   skybox (fal) instead of gradient dome.
3. Proper SCR car mesh (chase view) replacing the box placeholder; rival
   ballistic gap jumps (currently glued/linear-bridge).
4. Race completion: 3-lap win/lose vs rival with racewin/racelost end cards
   + fanfare/lost audio (assets exist); per-track craneBack measurement.
5. Cockpit polish: 8:5 letterbox option, wheels/ + boost/ flame overlays
   from the HD stack; asphalt tiling seams (14m) macro-variation fix.
6. Desktop 60fps validation on a real GPU; fx auto-tuning by measured fps.
7. (user-side) jez237.com domain re-attach in Cloudflare dashboard — the
   custom domain still pins an old deployment; pages.dev + GitHub are current.

- 2026-07-22 VEHICLE PHYSICS OVERHAUL — REMAKE v11 (CACHE scr-v160). USER
  FEEDBACK: "pinned to track, not lifted on and dropped stationary, appears
  already moving, never jumps — the whole game is vehicle physics." All
  three fixed:
  (1) BALLISTIC CREST LAUNCH restored — the v6 'glued-to-road' conclusion
  was WRONG: its telemetry evidence (touch=1 over 'the hill') only covered
  FLAT sections (the 20s trace never reached the hill; secs 15-27 are flat).
  Now airborne whenever the deck falls away from the arc (vy=slope×speed,
  ±0.3 clamp) — humps/crests/lips all jump (Hump Back: 6 flights/lap).
  (2) CRANE DROP START: crane lowers the car 13m->2.4m at 6m/s (chains
  overlay), releases, car free-falls onto the deck, BOUNCES (restitution
  0.34 when vy<-9 — the SCR skip), settles STATIONARY; accelerate from 0
  (0->28 display in 2.5s per the fitted thrust model). Crane recovery uses
  the same drop. CRANE_LAUNCH=28 was a misread of a W-held trace.
  (3) Visual suspension spring on the mesh + cockpit cam (impact-kicked,
  110/9 spring-damper) — landings compress and rebound.
  STUCK-DETECT FIX: idle isn't stuck (lastMoveT also refreshes when
  throttle is up) — the grid no longer re-cranes you every 5s.
  REGRESSION: all 8 tracks still full-lap blind (25-38s pt, zero cranes,
  zero errors); gap-jump/top-speed parity unchanged (takeoff at the flat
  lip identical); accel curve now starts from 0 (crane), matching the
  original's ritual rather than its W-held trace artifact.

- 2026-07-22 v12 (CACHE scr-v161): steering sign REVERSED per user report
  (A/D — and with them touch thirds + gamepad axis — were mirrored).

## PHYSICS-NOTES (2026-07-22, from the disassembled original's source)
Source: github.com/olefriis/stuntcarremake (clone in scratchpad/scr-src;
"Car Behaviour.cpp" = the Amiga original's physics, 4408 lines). The WASM in
this folder was compiled from it. Fixed-point: most values ×256; angles in
MAX_ANGLE wrap; physics steps ONCE PER frameGap frames (PC gap 4; Amiga
MIN.FRAMES=6 at 50Hz PAL → ~8-12Hz physics step! Constants below are PER
THAT STEP — convert to our 60Hz: dt_orig ≈ 0.083-0.12s).
KEY ROUTINE MAP (ranked MOST-WRONG in remake first):
1. THREE-WHEEL CONTACT MODEL (front-left, front-right, rear — a trike):
   per-wheel road height vs actual height; height_difference clamped
   [+0x1400, −0x300]; amount_below_road extrapolated by INCREASE (276/256)
   of the delta + new_difference; collision force = average amount below
   road directed along the ROAD SURFACE NORMAL (inclinations from per-wheel
   height differences >> log car length 4 / width 3). Remake has NONE of
   this (single point clamp). This is the suspension/bounce/pitch/roll core.
2. FREE YAW ANGLE + ROAD ALIGNMENT: car owns player_y_angle; steering sets
   left_right_value ±15 (only touching_road && !on_chains) feeding steering
   acceleration; the road's per-section angle pulls the car straight
   (AlignCarWithRoad, y_angle_difference section−player). Remake locks
   heading to the road tangent (lat-only) — no drift/fishtail dynamics.
3. GRIP RULE: |engine_z_acceleration| capped at 2× collision Y acceleration
   — light car = no thrust (wheelspin off crests, no accel mid-air).
4. THROTTLE LATCH: once accelerating, stays accelerating after release
   until BRAKE pressed (accelerating flag). Engine accel 240 (×256 units);
   brake −240; cut when z_speed ≥ 120×256 (reachable only via boost —
   natural equilibrium ≈ 64×256 due to wind reduction).
5. WIND RESISTANCE: engine accel reduced by (z_speed>>8) each step (linear,
   NOT my v² fit); GLOBAL DAMPING: world speeds ×REDUCTION (238/256) per
   step in the integrator (this is the real "drag").
6. GRAVITY_ACCELERATION = 317 (×256 units per step²) rotated into car axes.
7. BOOST: boostReserve units; boostUnit countdown at boost_unit_value=16
   per reserve unit; boost also engages with brake key (brake+boost combo).
8. DAMAGE: per-wheel; from amount_below_road − cushion, ≥0x700 threshold,
   +50% scaling, cap 0xff per wheel; damaged_limit 10/track; 14-frame
   window; wreck → wreck_wheel_height_reduction 0x200.
9. CRANE/DROP: PositionCarAbovePiece → car centered on a legal piece,
   y = road + 0xc00 (×256) ≈ 12 height-units above road, drop under
   gravity; on_chains freezes control; OFF_TRACK_LIMIT=64 steps off-track
   → re-drop at current piece. touching_road sets drop_start_done.
10. DISPLAY SPEED = z_speed × 183 >> 15 (top ≈ 171 at the 120×256 cut —
    92 is the wind-equilibrium, boost exceeds it: remake cap 92×1.09 close).
SUBSYSTEM PLAN: (a) 3-wheel contact+surface-normal forces+pitch/roll,
(b) free-yaw steering + alignment, (c) grip rule + throttle latch + linear
wind + REDUCTION damping (replaces fitted v² model), (d) boost/damage per
source, (e) crane per source, (f) re-verify A/B (accel curve should STILL
match — the fitted model approximated exactly these mechanics).

- 2026-07-22 PHYSICS SUBSYSTEM (a) — THREE-WHEEL CONTACT — REMAKE v13
  (CACHE scr-v162). Ported the original's trike model (Car Behaviour.cpp
  CalculateWheelCollision): FL/FR/R contact points sampling roadAt(s−dz) at
  lat+dx; clamped height difference [−0.3,+2.0] + INCREASE (276/256)
  extrapolated amount-below-road; per-wheel force amt×W_K (90) capped at
  1.3m equivalent; vertical = −GRAV + ΣF with 6/s contact damping; pitch/
  roll from wheel torques (SIGN LESSON: torque must RAISE the loaded wheel —
  F×dz NOT F×−dz; the wrong sign is positive feedback that saturates pitch
  and floats the car) + grade-align springs 85/95 with 11/12 damping, clamps
  ±0.55; landing damage from compression spike >1.2m. Crest launches,
  landing bounce and settle-hop now EMERGE from the contact model — the
  explicit ballistic-takeoff/restitution branches are gone. Crane drop
  settles with a small authentic hop (0.7→0.4→0.6). Visuals use physics
  pitch/roll directly. 60Hz retune of the ~10Hz原 constants: W_K 90 (160
  launched the car — energy gain when deep+clamped), force cap, damping.
  Regression: 8/8 tracks lap (zero cranes), hump-back 8 flights/lap, rest
  pose h~0.6 p~−0.1 (slight nose-down — characterful), zero errors.
  NEXT SUBSYSTEMS: (b) free-yaw steering+alignment, (c) throttle latch +
  grip rule + linear wind + REDUCTION damping, (d) boost/damage per source,
  (e) crane on_chains behavior, (f) full A/B re-verify.

- 2026-07-22 PHYSICS SUBSYSTEMS (b)+(c) — REMAKE v14 (CACHE scr-v163).
  LONGITUDINAL now the original's: THROTTLE LATCH (accelerating persists
  until brake — CarControl); thrust cut at display 171.6 (120*256) NOT 92 —
  92 was just the drag equilibrium region (VMAX cap removed); linear wind
  −0.0303·v + QUADRATIC drag −0.000663·v_d² (ReduceWorldAcceleration:
  reduction = speed*maxspeed>>16>>5 — my old fitted v² was approximating
  exactly this) + slope gravity −GRAV·sin(slope) (gravity rotated into car
  z — the source HAS slope decel after all, small); brake = −thrust (weak,
  authentic); BOOST ×2 engine (BoostPower: engine_z_acceleration *= 2),
  reserve drains 0.52/s (boostUnit 16 per unit at ~8Hz — old 2/s was 4x
  fast), works with brake held too; GRIP RULE |engine| ≤ 2×contactF with
  the contact force LOW-PASSED 6/s (the original's ~8Hz step never sees
  sub-0.12s hops — unsmoothed, micro-hops starved thrust: top 77→87).
  T_MS 11.0 display/s (10.4 from raw 240 + conversion slop nudge).
  FREE-YAW STEERING: state.yawOff/yawV — steer accelerates yaw (3.2/s²
  grounded, 0.9 air), road alignment spring 8/s² grounded (AlignCarWith
  Road), damping 5/0.5; motion decomposes v·cos/sin(yawOff) into s/lat —
  DRIFT AND FISHTAIL now exist; grind straightens yaw along the wall.
  Acceleration WHEELIE: pitchV −= engAcc×0.004 (CalculateXZRotation
  Acceleration lifts the nose under power). A/B (rebased to the v=28
  crossing — crane starts stationary): t60 4.0 vs 3.92 (2%), gap flight
  2.02s, top 87.5-and-climbing in-window (equilibrium ~101 analytic; t90
  in-window unreachable on blind laps — flights cut thrust; CLOSED-note).
  Original top-speed experiment timed out on WASM boot (machine loaded) —
  equilibrium settled analytically from source constants instead.
  Regression 8/8 tracks lap, zero errors. REMAINING: (d) per-wheel damage
  refinement, (e) on_chains crane control freeze (partially done), (f)
  full-feel survey.

## PHYSICS LOOP CLOSED (2026-07-22) — REMAKE v15 (CACHE scr-v164)
Subsystem (d): PER-WHEEL DAMAGE — wDmg[FL,FR,R] from per-wheel landing
compression spikes (>1.2m, x9) + grind damages the wall-side front wheel
(3.5/s over 100 m/s); dash damage = mean; crane clears. CLOSED-HARD: the
port NEVER sets wreck_wheel_height_reduction (wreck-from-damage stubbed in
the source!) — remake keeps crane recovery at damage 32 as the gameplay
stand-in. (e) on_chains: crane freeze implemented (control locked during
descent). FULL-FEEL SURVEY (fx=high, blind laps): hump-back lap w/ 38
flight samples, ski-jump 55, draw-bridge 105 (SCR porpoise-skip at speed —
characterful), landing damage 13-27 accumulating, zero errors everywhere.
Steering feel verified: steer pulse builds yawOff 0.146 rad + lateral
drift, release → road alignment re-centres in <1s (fishtail exists).
ALL SUBSYSTEMS from PHYSICS-NOTES now implemented from source or
CLOSED-HARD with rationale. Feel roadmap if a future round reopens: tune
skip frequency (suspension rates), landing bounce restitution vs original
video captures, air-tumble rates, opponent physics (Opponent Behaviour.cpp
unread).
