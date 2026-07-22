# HD-LOOK-LOOP — Stunt Car Racer HD: match the reference photo

Self-paced /loop ledger. READ THIS FIRST each iteration — it is authoritative.
Goal: make gameplay AND title screen match the user's reference photo as closely
as the architecture allows, one shippable item per iteration.

## THE REFERENCE (user photo; if REFERENCE.jpg exists beside this file, compare to it directly)
Bright summer day at an outdoor stunt track:
- **Road**: near-black coarse-aggregate asphalt filling the foreground, slight sheen,
  subtle tire wear; climbs a hill crest ahead.
- **Kerbs/walls**: weathered red/white painted CONCRETE BLOCKS — big alternating
  segments on the barrier walls; lower angled red/white KERB STONES along the road
  edge in the foreground (3D curbstones with white caps, cracks, grime).
- **Terrain**: lush green grassy hills left and right with scattered broadleaf/conifer
  TREES and bushes; a sandy dirt run-off apron on the left behind a low wall.
- **Fence**: grey chain-link fence on posts atop the left barrier.
- **Backdrop**: green foothills, then grey rocky SNOW-CAPPED mountains; blue sky,
  puffy white cumulus, sun high right with gentle bloom/haze.
- Grading: rich, saturated, warm sunlight, soft long shadows.

## CURRENT STATE (v142, 21 Jul 2026 — deployed CF + GitHub)
Done already: photo textures in-engine (grass/dark asphalt/white block walls/sand,
units 1-4, triplanar, vertex-color modulated, isRed vivify), photo sky quad,
ray-cast textured ground plane, low-engine photoreal cockpit + dash remap,
boost flames, wheels, ElevenLabs audio layer, glass UI, title = green-valley
backdrop + 'HD vNNN' badge, ?classic=1 escape hatch.

## BACKLOG (top = next; one item per iteration; keep each shippable)
1. ~~Trackside trees~~ **DONE it.1** (treeSys: 283 billboards, oak+pine sheet unit 5,
   engine-identical transform, GEQUAL bug fixed → LEQUAL, cells 16000/EXCL 18000,
   heights 3200-5400).
2. ~~Kerb treatment~~ **DONE it.2** (procedural: isRed && Nn.y>0.6 → alternating
   red/white 900-unit stones over the concrete texture; no new texture unit needed).
3. ~~Photo mountain backdrop~~ **DONE it.3** (2D fragment rewrite discards the 5
   sampled backdrop colors — greens/teal/lake exact, snow gated above mid-screen —
   and sky.jpg carries a photo range amplified to the bottom 22%; SKY QUAD FIX:
   fullscreen-triangle UVs span the VIEWPORT, so the shader now remaps v to the
   actual sky band read from SCISSOR_BOX — image bottom rides the horizon).
4. ~~Contact shadows~~ **CLOSED-HARD it.4**: fragments have no neighbor-geometry or
   adjacency data; SSAO impossible (WebGL1 default framebuffer depth is unreadable);
   wall-base distance underivable from vWorld alone. Would need engine geometry.
5. ~~Chain-link fence~~ **CLOSED-TIMEBOX it.5**: harvesting wall-top spans means
   blind reverse-engineering of interleaved vertex buffers (layout unknown, per-track)
   with real regression risk for a thin distant visual — beyond any sane timebox.
6. ~~Grass calibration~~ **DONE it.4** (warm tint vec3(1.08,1.02,0.88) + brightness
   lift on both the geometry grass branch and the ground quad — sunny reference green).
7. ~~Title screen art~~ **DONE it.5** (reroll adopted: towering red/white-edged ramp
   right, green hills + trees, snow mountains — reference mood).
8. ~~Damage holes + icons~~ **DONE it.5** (PIL-drawn checkered flag, stopwatch dial,
   torn-gap hole, cracked smash — same files/ids/positions).
9. ~~Sun/bloom~~ **DONE it.6** (CSS grade on #canvas: saturate 1.07 / contrast 1.03 /
   brightness 1.01 — zero GL risk).
10. ~~Closing survey~~ **DONE it.6** — found + FIXED the Big Ramp pale-world bug.

## ROUND TWO BACKLOG
1. ~~Track sweep 1-8~~ **DONE it.7** — all 8 choosers + t1/t8 races verified green/textured.
2. Sliver-tree: NOT reproduced after the facing fix (it.7-8 runs) — WATCH-ONLY.
3. ~~Mobile pass~~ **DONE it.8** (title/badge/buttons fit portrait; race letterboxed as designed).
4. ~~End screens~~ **DONE it.8** (all three cards render: photoreal scenes + readable text;
   verified via class-injection — deterministic, same visual path as the real trigger).
5. ~~Streaming-fill anchor~~ **SETTLED it.7**: fill plane now 800 below eye (the y=0
   plane degenerates — it IS eye level in camera-relative space); near band textured,
   distance = field-green (0.44,0.57,0.40); green 3D geometry unified to grass scale.
   The engine's clip mapping compresses the texture band toward the screen bottom —
   accepted (matches the reference's smooth fields).

## PROCESS (every iteration)
- Home: worktree `/home/jez237/.openclaw/workspace/worktrees/scr-hd` (branch scr-hd);
  game at `games/2026-07-17/stunt-car-racer/`. Commit early (OpenClaw sweeper commits
  stray tree changes within minutes). Push: commit → `git fetch && git rebase
  origin/main` → `push origin scr-hd:main`.
- Art: fal MCP, model `openai-gpt-image-2` (ignores aspect_ratio, returns 1024×768 RGB;
  transparency comes back as a PAINTED checkerboard — run BiRefNet remove_background,
  it cuts enclosed holes perfectly). Textures: center-crop square → 1024 POT →
  MIRRORED_REPEAT + mipmaps + aniso (NPOT breaks repeat in WebGL1).
- Rig: `cd <scratchpad>/ && SET=itNN node scr-iter.mjs` (envs: VIEW=mobile, CLASSIC=1,
  DIAG=1). Screenshots → scr-iter/itNN/. Compare 1-title/2-chooser/4-race/5-race/6-boost
  to THE REFERENCE section. Zero console errors + `HD: {...enabled:true}` required.
  Debug shader classes: `__hdGraphics.state.debugMul=1` (green=ground grey=track
  yellow=cream magenta=edge blue=rock cyan-tint=engine-textured).
- RELEASE CHECKLIST (deploy every 2-3 shipped items): bump `v=NNN` in source.html+sw.js,
  `CACHE_NAME scr-vNNN`, hd-audio `var V`, AND the title badge in game.css
  (`.main-menu-card::after` → 'HD vNNN · date'). Deploy
  `scripts/deploy_cloudflare_pages_site.sh <worktree>` → verify
  jez237-site.pages.dev (POLL: edges lag whole deployments for minutes; never
  first-touch a NEW path on jez237.com before pages.dev confirms — zone caches 404s).
  Then sync GitHub mirror: scratchpad/gh-games (pull → rsync game dir from worktree →
  commit as jz237 → push → poll `gh api repos/jz237/games/pages/builds/latest`).
  jez237.com custom domain is STUCK on an old deployment (needs user's dashboard
  re-attach) — verify via pages.dev + github.io, and via
  `curl --resolve jez237.com:443:$(getent ahostsv4 jez237-site.pages.dev | head -1 | awk '{print $1}')`.

## HARD-WON GOTCHAS (do not relearn)
- Engine = WASM, untouchable; ALL graphics live in hd-graphics.js runtime GL wrapping
  (shaderSource rewrite, clearColor/clear interception for sky+ground fills, matrix
  capture via getUniformLocation/uniformMatrix4fv, extra uniforms set on the engine's
  program during its viewMatrix upload). Engine convention: row-vector math,
  ndc.y flipped; ground plane groundY=0.
- Texture tiles MIP TO FLAT at distance → LOD bias + second larger-tile octave + fbm
  macro variation (already in the ground quad — reuse the pattern).
- Elevated olive = DECK (asphalt); lowland olive = grass; red-brown = sand. Height
  gate 60-170. World units are BIG (tracks span ~50k+; fog starts 45k).
- Cockpit HUD readouts are CANVAS BITMAP GLYPHS in game.js (drawCockpitReadouts),
  not DOM. Dash geometry (v142 art): speedo x101-245 y164 (bar speedBar*144/127),
  left LCD glyphs x10..46 rows y172/182, right time x259..295. Boost flame rims
  (1536-space): (355..640, ~660) + mirrored.
- Suite/probes: Playwright renders the WASM GL headless fine; neutral gesture for
  audio unlock = click (8,8) — letter keys trigger game bindings.
- Audio layer (hd-audio.js) wraps AudioContext; engine bus muted when HD on; QA via
  `__hdAudio.levels()`.
- heads.png (driver portraits) stays ORIGINAL (user-loved). No multiplayer — keep
  #mm-btn-twoplayer hidden; do NOT touch stuntcarracer.fly.dev/CSP.

## LOOP COMPLETE 2026-07-21 (v147 live CF + GitHub)
Two rounds, 8 iterations, v143→v147 deployed. The reference look is achieved:
green tree-dotted hills, dark aggregate asphalt with red/white kerbs, weathered
red/white block walls, photo snow-mountain horizon, photoreal low cockpit, HD
audio, cinematic end cards — all 8 tracks, desktop + mobile, zero console errors.
Resume anytime with the /loop prompt; candidate future items: per-track palette
variety (e.g. restore Big Ramp's icy mood as a grass variant), damage-glass art,
season-dusk aesthetic exploration (accidental beauty — engine dims for season
screens and the layers compose into twilight).

## POST-LOOP MAINTENANCE
- v148 (2026-07-21, user): ANCHORING — background ground-fill plane raised from
  800→250 below eye (st.groundDrop override hook added) so elevated track sections
  hug the ground instead of floating; safe because the fill draws behind ALL track
  geometry (depth 0.9999, no depth write) so it can never occlude the road. Verified
  chooser+race, near field unaffected. GAMES PAGE: game moved back to UNFINISHED
  section — the section is keyed on slugTitle in the UNFINISHED set (NOT the tag);
  renaming to "Stunt Car Racer HD" broke the match, so added 'stunt car racer hd'
  to the set; reverted card tag featured→experimental and removed the front-page promo.

## ITERATION LOG
- it.8 (2026-07-21): mobile + end-cards verified; sliver-tree not reproduced;
  round two CLOSED — loop complete.
- it.7 (2026-07-21): 8-track sweep green; fill architecture settled (below-eye plane,
  field-green distance, unified green-geometry grass). LESSON: in this engine EVERY
  mysterious flat region so far has been MY OWN fill's fog color — check
  scr-own2.mjs pixel-ownership FIRST, hypothesize second. v147 DEPLOYED.
- it.6 (2026-07-21): grade shipped; SURVEY caught Big Ramp pale-world. FIVE-HYPOTHESIS
  debugging chain ended in a REVELATION: the engine keeps the WORLD CAMERA-RELATIVE —
  viewMatrix has ZERO translation (cam pos [0,0,0] is CORRECT); worldMatrix carries it.
  Implications now recorded: my "vWorld" is camera-relative; fog distances were always
  right; the ground-fill plane at y=0 is EYE LEVEL so downward rays always miss → the
  fill's below-horizon output was ALWAYS the miss-color: recolored it hazy-green
  (0.58,0.68,0.60) — fixed t4 AND improved every horizon. Also: draw-time texture
  binds (engine stomps units mid-frame on textured tracks), tree billboards face
  per-tree camera, 2D-discard palette unchanged. TOOLS: pixel-ownership tracer
  (scr-own.mjs) + frame tracer (scr-dbg-frame.mjs) + readPixels probe — THE debug kit.
- it.5 (2026-07-21): fence CLOSED-TIMEBOX (blind vertex-buffer reverse-engineering);
  title reroll adopted (ramp-right composition); indicator sprites redrawn in PIL
  (no API needed for ≤64px art). v145 DEPLOYED (grass + title + sprites batch).
- it.4 (2026-07-21): shadows CLOSED-HARD (no adjacency/depth access at this layer);
  grass calibrated warm+bright on both paths. LESSON: when an investigation item
  dead-ends quickly, close it with reasons and pull the next quick win into the
  same iteration — thin iterations waste loop cadence.
- it.3 (2026-07-21): PHOTO MOUNTAINS SHIPPED — 2D backdrop discard + horizon-anchored
  sky mapping. LESSONS: (a) the sky quad's vUv covers the whole VIEWPORT (scissor just
  clips it) — anything positional in the sky image needs the SCISSOR_BOX remap;
  (b) 2D-pipeline rewrite is SAFE scoped to exact palette colors (HUD yellow/black
  untouched); other TRACKS may use different backdrop palettes — check each track's
  chooser later and extend the discard list if flat mountains reappear. v144 DEPLOYED.
- it.2 (2026-07-21): KERBS SHIPPED — horizontal red edge strips (Nn.y>0.6) become
  alternating red/white stones via `fract((x+z)/1800)` over the block texture;
  vertical red walls untouched. LESSON: prefer PROCEDURAL patterns keyed on the
  existing classification + normals before spending a texture unit. v143 DEPLOYED
  (trees) to CF+GitHub mid-loop at user request; jez237.com still stuck v139.
- it.1 (2026-07-21): TREES SHIPPED — 283 oak/pine billboards on the grass, correct
  depth vs walls/terrain, none on track. THREE HARD LESSONS: (a) NEVER combine the
  engine's matrices in JS for FORWARD projection — my row-vector mat4Mul product sent
  clip z ~1e5 out of range; pass view+proj separately and let GLSL do
  `pos * uV * uP` EXACTLY like the engine's own vertex shader (the ground quad's
  INVERSE path only worked because the roundtrip cancels the convention);
  (b) probe said depth clear=1 func=LESS — standard GL, use LEQUAL (my GEQUAL
  guess made zero pixels); (c) WORLD SCALE: the road is ~3000+ units wide — trees
  need heights 3200-5400, not 600 (bushes). Attribute packing: species*100000+h
  (4096 overflowed). scr-tree-probe.mjs = the in-page NDC/depth probe pattern.
