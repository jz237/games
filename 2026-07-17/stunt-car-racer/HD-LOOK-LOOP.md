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
2. **Kerb treatment on road edges** — the engine's red edge lines are flat polys;
   give the isRed-and-narrow (near-track, low-height) fragments a kerb-stone texture
   (new fal texture: angled red/white kerb top-down) instead of wall blocks.
3. **Photo mountain backdrop** — mountains/lake are the engine's 2D screen-space
   pipeline (shader 2/3, NO world coords — cannot world-texture). Experiment: render
   a fal mountain-panorama strip into MY sky quad's lower band, and mute the 2D
   mountains by rewriting shader 3 to discard/fade its distinctive mountain colors
   (RISK: same 2D pipeline draws HUD lines — gate by color families only, test
   heavily; abort if HUD damaged and record why).
4. **Contact shadows** — fake AO: darken ground/asphalt fragments within ~40 units of
   walls (needs wall proximity — approximate via screen-space: NOT feasible per-fragment
   without data; try instead a soft dark band at the BASE of wall faces via vWorld.y
   proximity to local ground height captured…  investigate first, may be CLOSED-HARD).
5. **Chain-link fence** — billboard strips along wall TOPS need per-wall positions
   (no track data exported). Investigate reading vertex buffers in the bufferData
   hook to harvest wall-top spans once per track load. Stretch goal; timebox it.
6. **Grass calibration vs reference** — brightness/saturation A/B against REFERENCE.jpg
   (current grass slightly deep; reference is sunnier). Tune modulation + macro floors.
7. **Title screen art iteration** — regenerate menu.jpg with fal until composition ≈
   reference (ramp right, valley center, mountains behind); keep UI clear-zone center.
8. **Damage holes + flag/stopwatch icons** — replace remaining pixel art (cracked-glass
   strip + tiny photoreal icons; keep positions/ids).
9. **Sun/bloom pass** — subtle warm tint + vignette via a final fullscreen quad after
   the frame? (needs end-of-frame hook — investigate requestAnimationFrame wrap; may
   conflict with engine loop — timebox).
10. **Closing survey** — fresh-eyes shots of every screen vs reference; seed next round.

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

## ITERATION LOG
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
