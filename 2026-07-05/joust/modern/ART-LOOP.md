# Modern 3D Joust — ART LOOP ledger

Loop goal: make `modern/` look BETTER than `retro/` in honest screenshots. ART ONLY —
no engine/gameplay changes, nothing under `retro/`. Worktree: `/home/jez237/projects/joust-art-wt`
(off origin/main 9a83c1d). Baseline: modern v1.1.1, both test suites green, headless rAF ~31fps.

North star: **stylized volcanic cavern** — near-black basalt walls, lava lighting the scene
from below, drifting embers, rim-lit birds with readable silhouettes, warm-orange vs
cool-blue palette. Concept image: `modern/assets/tex/concept.jpg` (gpt-image-2).

## Baseline critique — 10 biggest reasons modern looks worse than retro (fix in order)

1. **Global tonality is murky brown-purple soup** — no true blacks, no dynamic range; hemisphere
   flood + fog lift everything to midtone. Retro wins with pure black sky + saturated accents.
2. **No shadows / light interplay** — platforms and birds float, evenly lit from nowhere;
   no lava up-light gradient on rock undersides, no contact grounding.
3. **No bloom** — lava/emissives clip flat instead of glowing; moon uses a fake square-ish sprite halo.
4. **Lava reads as orange clouds** with red ketchup blobs — no dark crust plates, no bright
   crack network, no glow bleeding onto nearby rock. Fills half the frame and flattens it.
5. **Birds unreadable** — small dull-green blobs, plank box wings, rider a red smudge, thin dark
   lance. Retro's sprites have crisp white lances and clear silhouettes at half the size.
6. **Sky is generic night-sky with a moon** (colliding with the JOUST wordmark on title!) —
   flat triangle mountains like paper cutouts. Target is a volcanic CAVERN, not open sky.
7. **Platform geometry artifacts + invisible tops** — needle-spike protrusions at profile corners,
   black boxy bases, standable top surface doesn't read (retro's bright walkway band does).
8. **Stripey composition** — huge black base band + lava filling bottom half + horizon band merge;
   no mist/depth layering between arena and backdrop.
9. **Palette lacks warm-vs-cool** — everything warm-brown murk; needs orange lava vs cool blue
   rim/skylight/spawn accents.
10. **Cheap atmosphere/FX** — sparse dim embers, no heat shimmer/god rays, spawn pads invisible,
    dark "S/G/E/P" next-special glyph floating bottom-right.

## Iteration plan

- [ ] A: lighting rig + shadows, custom bloom post (vendored, CSP-safe), lava shader rework,
      palette table, platform rebuild (no spikes, hot readable top lip), fog/exposure. (fixes 1,2,3,4,7,9)
- [ ] B: cavern skybox pano (gpt-image-2) + parallax rock layers + stalactites, bird/ptero
      redesign (shaped wings, visible knight+lance, rim light). (fixes 5,6,8)
- [ ] C: embers/atmosphere polish, spawn pads, title/HUD art pass, ambient loop (optional),
      LOW/MED/HIGH gating, mobile landscape + touch verify, 60fps check.
- [x] SHIP (2026-07-12): __V3 1.2.0 + ?v= bumped, art/modern.webp re-rendered, all suites
      green, deployed — site commit 86d72bf00 (Cloudflare deploy 7b80e9bd, top Production row
      verified mine), games repo 4877a0e (github.io mirror "built"). Live probes: HTML __V3
      1.2.0 ×3, pano/render3d/ambience/hubcard all 200, live headless render clean (no CSP
      errors), live QA hook v1.2.0. Memory note updated.

## Assets (generate ONCE, reuse forever)

| asset | file | status |
|---|---|---|
| concept north star | modern/assets/tex/concept.jpg | DONE (gpt-image-2) |
| cavern equirect pano | modern/assets/tex/cavern-pano.jpg | DONE (gpt-image-2 21:9→2:1 stretch, seam-blend, bottom fade) |
| rock albedo (tileable) | modern/assets/tex/rock2.jpg | DONE (gpt-image-2, seam-blend; old rock.jpg deleted) |
| rock normal maps | rock2-n.jpg / rock-top-n.jpg | DONE (Sobel-derived in tex-prep, not AI) |
| walkway albedo | modern/assets/tex/rock-top.jpg | DONE (contrast-lifted derivative, no API spend) |
| lava crack emissive | modern/assets/tex/lava-cracks.jpg | DONE (gpt-image-2, seam-blend) |
| ambience loop | modern/assets/audio/ambience.ogg | DONE (ElevenLabs SFX 5s seamless, 22KB) |
| ember sprite | procedural softDotTexture + bloom | kept procedural (looks right) |

Raw AI outputs live in notes/art-raw/ (committed for provenance / future edit-endpoint input).
Regeneration prompts are in the tex-prep header + this file's history.

## Iteration log

- **it0 (baseline)**: shots in tools/shots/ (modern-title/wave1/wave5/wave8 + retro wave-*).
  Both suites pass. Critique above.
- **it1 (lighting+post+lava+platforms)**: new rig (cool key w/ shadows, rim, warm bounce,
  camera fill, 4 lava points), custom PostFX bloom (HDR RT + MSAA + 4-mip blur + ACES),
  texture-driven lava shader (pool mask, HDR cracks), cavern pano dome, jagged ridge layers ×3,
  platform rebuild (lobed profile, AO verts, rock2+normal, hot under-rim).
- **it2 (readability)**: platform "walkway" = segmented cool edge lights (retro's bright line,
  cave-style) after chasing a phantom texture bug — tops sat in the ACES toe; texture pipeline
  was fine (test-plane instrumentation proved it). Per-face world UVs on lip boxes.
- **it3 (birds)**: full redesign — war-ostrich (teardrop torso, fanned feather wings + tail fan,
  curved 2-seg neck, crest, bright beak), armored knight (cuirass, pauldrons, plume arc, shield
  + emblem, guarded lance + pennant), ptero with shaped membrane wings + ember eyes. 1.12 scale
  boost in an INNER group (outer scale belongs to poseBird's materialize squash).
- **it4 (presets+ambience+ship prep)**: LOW uBoost 0.75, MEDIUM pixelRatio clamped to dpr,
  ElevenLabs 5s cavern-rumble loop (assets/audio/ambience.ogg, 22KB) gesture-gated w/ state
  fades, raws moved to notes/art-raw/, __V3 1.2.0 + ?v= bumps, hub card art/modern.webp
  re-rendered. ALL SUITES GREEN (engine 160, retro browser, modern smoke, screens).
  fps SwiftShader: high 4.8 / med 4.0 / low 12 — presets scale; real-GPU 60fps expected but
  NOT verifiable on this box (no GPU).

- **it5 (v1.2.1 polish, user "continue")**: Arial Black outlined wordmark w/ tracking + hotter
  gradient, folded-wing splay halved, layered kill-pop (white core + warm body + ember risers).
  Shipped + live-verified. GOTCHA: `| tail -0` SIGPIPE-kills ffmpeg mid-encode — the v1.2.1 hub
  card initially shipped stale; re-encoded + re-pushed (site card md5 a289c108…, verify vs edge
  300s cache with the HTML page or after TTL).

**Verdict vs retro**: wave/egg/joust/title shots now read as a polished stylized remaster —
layered cavern depth, god rays, structured glowing lava, rim-lit readable silhouettes. Better
than retro to my eye. Remaining nits (diminishing returns): poof particles still dot-confetti,
folded-wing pose slightly splayed, title wordmark is plain Courier.

## Gotchas / decisions

- three.min.js is UMD r15x (REVISION var minified); examples/js addons don't exist for r150+ —
  post-processing will be a SMALL CUSTOM composer (RT + threshold + separable blur mips +
  additive composite w/ ACES in final shader), not ported UnrealBloomPass. CSP-safe, quality-gated.
- Equirect pano seam: camera yaw is fixed (slight sway) — rotate dome so the seam sits behind camera.
- SwiftShader headless fps is CPU-bound (~31 baseline) — use as relative regression signal only.
- Retro suite must stay green (shared files untouched; modern-only changes).

- **it6 (v1.3.0, owner feedback round)**: owner hit transient BLACK RECTANGLES on his GPU →
  root-caused to MSAA resolve of the HalfFloat scene RT; replaced with an FXAA final pass
  (samples:0, tonemap→LDR RT→FXAA). New reference image supplied by owner: pale worn-stone
  platform caps (gpt-image-2 stone-top.jpg + Sobel normals; rock-top.* deleted), warm rocky
  undersides via emissiveMap lifts (hex emissives are sRGB→linear — 0x3d454f ≈ 0.05 linear,
  useless; needed 0x707a88 @1.3), molten under-drips (z must clear the beveled face), cooler
  mid-band (ridges 0x100c12/0x090710/0x040309, horizon glow 0.13, warm light 0.68), hotter
  near lava, vendored Cinzel (assets/fonts/cinzel.woff2) for wordmark/headings/FLAP TO START
  with gold rule + chevron ornament. All suites green.

- **it7 (v1.4 billboard repaint — IN PROGRESS)**: owner-reference.png stand-in generated
  (owner's mockup not saved to disk; drop the real file in notes/art-raw/ to supersede).
  Pipeline PROVEN: plate-shot.mjs (empty-arena plate via null-snap render patch + per-platform
  screen rects + world boxes) → fal-edit.mjs (REST openai/gpt-image-2/edit, image_urls data
  URIs + image_size 1280x720 — layout held almost pixel-perfect BOTH masters) → full-plate
  platform MASK via the same edit endpoint (BiRefNet FAILED on dark-slab-vs-dark-scene; the
  mask trick keeps master pixels untouched) → slice-plate2.mjs (local crop+matte all 10,
  339KB total, plat-cards inline meta). Master1 had dark caps (readability regression) →
  master2 regenerated with pale-caps enforced = the keeper. render3d.buildPlatforms now
  builds unlit painted cards (z −8, wrap clones inside platGroups so burn-visibility works);
  platformMesh/bakeAO/scaleUV + rock/stone texture loads REMOVED. API spend: 6 calls.
  TODO next: LUT grade (histogram-match to master2/reference), egg/ptero/LOW/mobile checks,
  delete unused tex files (rock2*, stone-top*, concept? keep concept), suites, bump 1.4.0,
  hub card, deploy, verify, memory. Bird sprite side-by-side test frame for the owner.
  **it7 SHIPPED as v1.4.0**: LUT grade (tools/grade-lut.mjs — per-channel histogram match
  toward master2, 256x1 grade.png, applied post-gamma in COMP_FS; identity DataTexture until
  load; LOW = ungraded by design). Slicing gotchas fixed: neighbour rects overlap padding →
  connected-component flood filter (keep only pixels connected to the blob inside own rect)
  killed a stray lava-band bar that per-rect suppression missed; 1px mask erode kills cap
  halos. Unused rock2*/stone-top* deleted (tex payload 972K incl. concept+grade). fps proxy:
  HIGH 4.8→11.6, LOW 12→21 (cards are 2.4x cheaper than extruded rock). Bird sprite style
  test at notes/art-raw/bird-sprite-test.png — NOT integrated, owner decides. All suites
  green. API spend total: 8 calls.

- **it8 (v1.5 bird sprites — APPROVED by owner "approved, continue")**: convert birds to
  painted sprites in the master2 style. Plan: export birdView/pteroView builders → tools/
  bird-sheet.mjs poses variants on a black stage (3 sheets: p1+p2 6 cells, enemies 9 cells,
  ptero 4 cells incl OPEN-BEAK frames — the open beak is a gameplay tell, must stay readable)
  → fal edit repaint + mask per sheet (6 API calls) → slice frames → sprite views in
  render3d (frame swap from poseBird's existing state signals; scale.x flip for facing,
  retro-authentic lance mirroring). Ship as v1.5.0 with full protocol.
  **it8 SHIPPED as v1.5.0**: all birds + ptero are painted sprites (19 frames, 691KB).
  GOTCHAS: (1) ptero wingspans overflow tight staging cells → per-sheet layout (2x2 wide);
  (2) the mask model HALLUCINATED knight-shaped masks for the riderless ptero sheet — luma-key
  mode (bright-on-black, hi=90 band) mattes pteros without a mask call; (3) repaint model added
  riders to pteros until the prompt screamed WILD/NO RIDERS. Frame set: {p1,p2,bounder,hunter,
  shadow}×{up,down,stand} + ptero×{up,down}×{closed,open} — open beak = kill tell preserved.
  poseBird/posePtero swap materials by state; facing flips via rotation.y=PI on DoubleSide
  planes. 3D bird/ptero builders REMOVED (re-stage sheets from the pre-sprite commit
  ac73e9f-era). API total this loop: 17 of 25.

- **it9 (v1.6.0, owner playtest feedback)**: (1) mid-field AIRED OUT — lowerMid + upperR
  platforms and the upperR spawn pad removed MODERN-ONLY via an in-place splice in
  index.html after data.js loads (platformsForWave closes over the arrays — reassignment
  does nothing; retro untouched; engine Node tests unaffected). (2) Sprite glitches fixed
  by a rebuilt slicer: pure LUMA KEY (measured: repainted bg ≤8 max-channel, figures ≥15 —
  masks deleted from the pipeline entirely; the mask model was the failure source), Voronoi
  cell assignment, keep-largest-component (lances cross midlines; luma figures are one blob),
  morphological close r2 for armor pinholes, pad 90 (repaints GROW figures ~35% past staged
  cells). NO centroid shift (repaint mass differs; it clipped heads). (3) birds -20%
  (plane meta x0.8). (4) materialize = flicker only (Y-squash on a sprite reads as a glitch).
  GOTCHA: tools/shots is gitignored — bird sheets died with the old worktree; re-staged via
  `git show 89cf140:...render3d.js` (3D builders) + re-repainted (5 API calls, total 22).
  Sheets NOW archived in notes/art-raw/.

- **it10 (v1.6.1, owner: "wings don't flap, jousters flicker")**: root cause via per-frame
  trace — raw engine signals churn (wingDown lasts 6 ticks; skimming birds alternate
  grounded/airborne every 1-3 ticks) so the 3 very different painted frames STROBED at up
  to 30Hz. Fix: sprite animation STATE MACHINE in poseBird — a fresh flap edge triggers a
  held 130ms down-beat, min 90ms hold on all other transitions, and landing requires 70ms
  of stable ground contact. NOTE for future traces: SwiftShader renders ~10fps so holds
  expire between samples — trace validates logic, not felt cadence.

- **it11 (v1.6.2, owner round 2)**: (1) wings now actually FLAP — flap OSCILLATOR (fixed
  ~7.7Hz down/up while flap activity within 240ms) replaces edge-held beats: engine flap
  cadence (67-117ms) is FASTER than any watchable hold, so the previous beat never released.
  Airborne swaps exempt from the 90ms hold. (2) player sprites x0.8 (sheet1 was painted
  ~20% larger than sheet2). (3) "standing in lava" — bottom row floorL/floorR cards only
  contained the master plate's on-screen paint; their outer collision extent was invisible.
  They now borrow UV slices of plat-base.png (u 0.02-0.34 / 0.66-0.98, geometry UV remap —
  NEVER texture clones) spanning full collision width, tucked at z -8.6 under the base card.
  Also raised the visual lava surface to the engine stand line (FLOOR) — the walkable shore
  is ROM behaviour, troll punishes from W4. (4) collision = authentic ROM pixel masks; the
  player size fix narrows the visual/hitbox gap.

- **it15 (v1.10.0, owner: "version on title; no lava troll at all; hops on 1 leg not
  walking; spawn just flickers")**: (1) VERSION stamp brightened+enlarged (was #5a6378
  dim slate at H/48 — invisible on the dark title). (2) TROLL WAS INVISIBLE for two
  reasons: the v1.9 span filter matched `p.y === WORLD.FLOOR` but floor platforms sit at
  y=204 (their TOP) vs FLOOR=216 — filter by the `bridge:true` flag instead; and the
  engine only arms trolls from wave 4, so casual play never met one. Added IDLE POKES:
  every 3.5-8.5s a hand crests ~55% from a random lava gap, grasps, sinks (renderer-only
  ambience; target-reach band widened to FLOOR−70). (3) WALK: tools/legcut.mjs splits
  each stand frame into a legless body + LEG layer (bottom-up SEGMENT trace from the
  foot — row-width tests fail when tail plumage hangs beside the leg; skip the first
  16px, the claw foot itself is wide). Two leg planes (near + tinted far) scissor at the
  hip (sin swing ±0.52 rad, stride-scaled), double-frequency bob; at rest both align =
  the painted one-leg stance. p2's leg is genuinely a short shin under hanging plumage —
  its cut is small and that's correct. (4) MATERIALIZE: no more visibility flicker —
  per-view mats ramp opacity 0.25→1 with a 24Hz shimmer + cool blue tint fading out +
  rising sparkle motes (skipped on LOW). Reset mat colors when done (shared textures,
  per-view materials). API spend: 0 (total 28).

- **it14 (v1.9.0, owner: "flapping ok now; ptero looks bad; enemy sizes; no feet on landing;
  smoother walking; lava fire should reach up like the original")**: (1) FEET — the stand
  frames NEVER had them: the v1.5 slicer's hard Voronoi zeroed the foot (the painted leg
  dangles past the staged cell midline — p1's foot sat 16px into the next row's territory)
  and keep-largest-component dropped what survived. tools/restand.mjs re-slices from the
  ARCHIVED sheets: soft Voronoi (foreign cell must win by >25px), close r4 BEFORE labelling,
  keep components ≤40px from the largest (≥60px size). All five stands now have clawed feet.
  (2) SIZES — one CONTENT-width target (the player's) for all five jousters; K per variant.
  (3) PTERO — sail rendered BEHIND the body (in front it hides the head; the paintings show
  it rising from behind), sweep gain 0.6 + length-stretch damp 0.35 (rigid membrane at full
  analytic sweep reads flag-like), cadence 1.05s/beat. Meta flags: gain/lDamp/wingBehind.
  (4) SMOOTHNESS — per-view cloned materials (birdMatOwn; shared cached mats can't animate
  opacity per bird) drive a ground/air CROSSFADE (eased blend, debounced target — no pops at
  touchdown/takeoff); trot bob is 1−cos (C¹ — the |sin| hop had a kink every stride) with
  stride-scaled amplitude; velocity lean + skid tilt share one eased channel (no snaps).
  (5) LAVA TROLL — renderer-side REACH: when a bird skims open lava (info.trollActive,
  gap from live floor spans, y within FLOOR−52), a magma hand rises under it, fingers
  grasping, ember spray + light — pure art, engine stays authoritative; the engine-grab
  hand now clenches ON the bird, rises with it, fire + shake ramp with pull. trollView
  1.25×, molten-basalt material. Scenario proof: tools/anim-scenario.mjs (walk → land →
  dive → grab → escape at exact 60fps steps) asserts crossfade Δopacity smooth, wing
  continuity, reach>0.5, ≥1 grab, alive at end. API spend: 0 (total stays 28).

- **it13 (v1.8.0, owner: "still a flickering mess — take a different approach")**: PUPPET RIG.
  Frame-flipping AI-painted frames can never be temporally coherent — post-mortem found THREE
  stacked flicker sources in v1.7: (1) paint incoherence between frames, (2) the repaint
  DRIFTED content inside the sheet up to ~43px per frame (position jitter — slice boxes
  assumed staged layout), (3) per-frame painted content size wobbled (sc 0.85–1.03 → size
  pulsing). New approach: ONE body layer + ONE wing layer per variant (cutout animation),
  wing rotates continuously about a measured hinge along the ANALYTIC projected sweep of the
  3D rig's wing bone — smooth function of time, zero swaps in flight, cannot flicker.
  Pipeline (all local, ZERO new API images): puppet-stage.mjs (re-stage 89cf140 rig, 3 passes:
  full / rear-mass hidden / rider hidden too; live game EVICTED into a detached limbo group —
  visible=false is NOT enough, the attract demo re-shows its views every frame and one wandered
  into the v1.7 ptero sheet) → puppet-bones.mjs (projected shoulder→tip bone per phase; tips
  from farthest GEOMETRY CORNERS, mesh centres sit halfway down feathers; mask-derived angles
  are noise) → puppet-slice.mjs (per-frame IoU-scored similarity registration — hit-count
  scores COLLAPSE the scale term; wing seeds = staged wing CLEAR of the rear-less silhouette
  only (where the wing merely occludes body the paint shows body); body seeds = silhouette
  minus wing; GEODESIC labelling through painted alpha so the fan resolves along artwork
  connectivity; wing+TAIL cut as one mass — the paintings fuse them; knight+lance zone from
  the rider pass = hard veto; body holes filled from opposite phase then dilation-smeared;
  largest-component ghost filter; hinge = seam centroid). Sizes calibrated to v1.7 approved
  visuals via mean content width (×0.8 player / ×0.7 ptero preserved). Renderer: puppetParts
  body+wing+far-wing echo (tinted, lagged 0.05 cycles, skipped on LOW), flap oscillator
  (rate ease to 6.9Hz on flap edges, settle-forward to glide top when idle — NO phase snapping,
  it read as a 1.5-rad jump in the trace), body bob counter-phase, grounded = stand frame +
  procedural trot (no frame swaps), ptero attack = open-beak BODY plane toggle (wing keeps
  beating). Verify: tools/anim-video.mjs freezes rAF and drives sim+render at exact 60fps
  steps → anim.mp4 IS what a player sees (SwiftShader wall-clock irrelevant); continuity
  assert: max wing Δangle 0.674 rad/frame = the physical max of a 6.9Hz beat at 60fps
  (curve slope 5.74 rad/cycle × 0.115 cycles/frame), swaps 0, page errors 0. Tex payload
  2.9M → 1.5M (48 frame PNGs deleted). Pipeline artifacts COMMITTED to notes/art-raw/
  (pup-*.png, cells, bones, meta — tools/shots is gitignored; v1.7's sheets died with its
  worktree). All suites green. API spend this round: 0 (total stays 28).

- **it12 (v1.7.0, owner: "should be smooth flapping with many frames, like playing a video")**:
  8-PHASE FLAP CYCLES — tools/bird-flap-sheet.mjs stages every variant's wings on a cosine
  cycle from the pre-sprite 3D rig (swaps render3d in/out automatically), one sheet per
  variant so the repaint keeps the bird pixel-consistent across frames (it did — excellent
  consistency), tools/slice-flap.mjs luma-slices 48 frames (+ flap-meta inline). Playback:
  continuous ~18ms/frame cycle while flapActive(260ms), glide=f1, run alternates stand/f4,
  ptero 6-frame slow cycle + f6/f7 open-beak on attack, all mats warmed at view build (no
  load pops). Dual planes per bird (flap meta + stand meta). Ptero plane x0.7 (staging scale
  changed). Ambient motion: sky dome yaw drift, ridge sway, idle-bird breathing, falling
  platform drips (all skipped on LOW). Superseded up/down frames deleted (tex 2.9M).
  6 repaint calls, running total 28.
