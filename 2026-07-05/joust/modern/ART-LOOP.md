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
