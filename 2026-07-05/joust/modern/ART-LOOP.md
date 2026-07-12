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
- [ ] SHIP: bump __V3 + all ?v=, re-render art/modern.webp hub card, run all suites
      (engine, retro browser, modern smoke), deploy jez237 + github mirror, verify live
      (wrangler list + hardened probe), update joust memory note.

## Assets (generate ONCE, reuse forever)

| asset | file | status |
|---|---|---|
| concept north star | modern/assets/tex/concept.jpg | pending |
| cavern equirect pano | modern/assets/tex/cavern-pano.jpg | pending |
| rock albedo (tileable) | modern/assets/tex/rock2.jpg | pending (keep old rock.jpg until replaced) |
| rock normal map | modern/assets/tex/rock2-n.jpg | derive from albedo in code (Sobel), not AI |
| lava crack emissive | modern/assets/tex/lava-cracks.jpg | pending |
| ember sprite | procedural (softDotTexture) unless it looks cheap | n/a |

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
