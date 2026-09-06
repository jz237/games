# Visual presentation systems

Version 1.4 "Red Cinema" added two presentation passes on top of 1.3's violence
tiers; version 1.5 "Showtime" added seven more waves (44 features) on the same
contract. Everything here is render/presentation-only: driven by `visualRandom`,
`presentationHash01` or the simulation tick, gated by the performance profile,
and invisible to rollback checksums. Nothing in this file affects gameplay
outcomes.

## 1.5 "Showtime" wave map (where to look in game.js)

| Wave | Systems | Key symbols |
| --- | --- | --- |
| 1 fighters | rim lights, hit smears, dizzy ghosts, breathing idle, contact shadows, grit auras, last-legs desperation | `STAGE_RIM_LIGHTS`, `tintedSilhouette`, `presentationDebug` |
| 2 damage | accumulating battle damage composited into the sprite; key-light cast shadows | `pushBattleDamageMark`, `drawFighterCastShadows` |
| 3 stages | rack-focus blur, practical lights, floor battle scars, time-of-day drift, ambient weather, foreground occluders, crowd flashbulbs + round-win beats | `blurredStageCover`, `stageScars`, `drawStageWeather` |
| 4 impact | counter-hit invert flash, projectile lighting, swipe ribbons, corner wall-splat, super focus lines, impact light spill | `spawnWallImpact`, `drawSuperFocusLines`, `counterFocus` |
| 5 HUD | damage ghost bars, announcer letter-slam, combo heat tiers, round slash wipe, select lock-in/VS slam, victory entrance, pip flip, timer urgency | `updateDamageGhosts`, `hudFxDebug`, `#screenWipe` |
| 6 camera | KO punch-in, intro dolly + letterbox, FINISH THEM dread creep, counter/dizzy pops, fatality handheld + dutch tilt, win-pose settle, directional recoil | `cinematicCamera`, `snapshot().camera.presentation` |
| 7 tech | quarter-res bloom, RGB-split aberration, distortion rings, DPR-sharp backing store, slow-mo motion blur, CRT mode, super portrait cut-in | `applyBackingStoreResolution`, SHARP RENDER / CRT MODE toggles |

Wave rules that keep this safe (binding for future work): spawn from sim paths
only behind `if (rollbackResimulating)` + simulation-tick dedupe; camera motion
must ease back to exact identity (assert `snapshot().camera.presentation` is
1/0/0/0); one-shot DOM events use monotonic `hudFxDebug` counters because the
per-frame `presentationDebug` reset would race a sampler; battery profile skips
every wave-7 pass; reducedMotion calms or skips every animation and
highContrast keeps text legible.

## Scene dressing (`game.js`, above `drawParticles`)

| System | How it works | Gate |
| --- | --- | --- |
| Floor reflections | The fighters are drawn a second time, mirrored through the floor line via `ctx.filter: opacity()`, clipped to a 128px sheen band and faded into the floor. Per-stage strength in `STAGE_REFLECTIONS` (buffet tile 0.34 → dry Vet lot 0.15). | `performance.shadows` (battery skips the second sprite pass) |
| Super spotlight | `superDimLevel` eases toward 1 in the simulation tick while any `attacking.superMove` is live. The stage fills with darkness scaled by it; each fighter keeps a warm radial pool of light. | always (static, not motion) |
| Dash afterimages | Every other tick of a dash pushes an `afterimage` effect capturing the current base-bank pose; drawn at fading alpha before the fighters. | `performance.trailScale > 0` and not reduced-motion |
| Layered hit sparks | `spawnHit` adds additive `sparkLine` streaks along the hit direction on every clean hit, and a `shockRing` on heavy/special/super/weapon/counter. | particle budget scaling |
| Foot dust | `spawnFootDust` on dash start and both landing branches. | particle budget scaling |
| Stage colour grade | One soft-light tint per stage (`STAGE_GRADES`) plus an edge vignette, applied post-world in `drawStageGrade`. | skipped under high-contrast |

## Fatality realism (behind the GRAPHIC FATALITIES toggle)

| System | How it works | Where |
| --- | --- | --- |
| Time dilation | The fatal impact sets `finisher.slowMotionTicks = 42`; while positive, the authored timeline advances at 38% speed. Plain counters on finisher state → exact under rollback. `performFinisher` returns `duration + 1.1` so round-over never clips the aftermath. | `triggerFinisherImpact` / `updateFinisher` |
| Arterial spray | `finisher.arterialFrames = 156` pumps droplet jets on a heartbeat (`sin(tick * 0.16)`), arcing away from the attacker under gravity. | `updateFinisher` tail |
| Floor staining | Each landed droplet becomes a persistent `bloodDecal` with `stain: true` plus a two-droplet splash back up. The stain layer caps at 56 so it can never evict combat text from the trimmed effect budget. | particle integration loop |
| Colour drain | Through the aftermath a `saturation`-blend grey wash rises to 0.55, leaving the pool, spray and red vignette as the only saturated elements. | `drawStageGrade` head |
| Corpse spasms | The victim's `cinematicRotation` gets decaying twitch bursts — a slow sine gating a fast one — settling over 2.4s. | `updateFinisher`, skipped under reduced-motion |

## Testing

`snapshot().violence` exposes `sparkLines`, `shockRings`, `afterimages`,
`superDim`, `reflections`, `arterialSprays`, `bloodStains` and `fatalitySlowMo`.
Browser smoke has two probes: a scene-dressing probe (dash ghosts + dust,
reflections on K&A, spark/ring peaks on a landed heavy, spotlight rise and
fall) and a fatality probe (dilation fires, spray sustains past 10 concurrent
droplets, stains land, cap holds). Spark/ring lifetimes are ≤0.28s — sample
per-frame peaks, never a single late snapshot.

## CINEMA 3D gameplay reads (5.1)

Until 5.0 the only world pass that drew projectiles, thrown objects, the stage
weapon, Post's wire traps, the dizzy / guard-crush markers and combat text sat
inside `if (!cinema3dWorld)` in `draw()`, so with CINEMA 3D on a player was
hit by pizzas he could not see and never saw the weapon he was meant to
contest. The reads now exist in both renderers, from ONE set of drawings:

- **Painters take a context.** `drawThrowableWith(c, …)`,
  `drawProjectileBodyWith(c, …)` and `drawPaintTrapWith(c, …)` are the old
  bodies with the canvas passed in; `drawThrowable` / `drawProjectiles` /
  `drawPaintTraps` call them with the game `ctx` (verified byte-identical: 84
  recorded call logs, old vs new, every style × 3D-dressing × debug, 0
  mismatches). The host bridge exposes them as `paintProjectile` / `paintTrap`
  plus `stageWeaponProfile` and `fighterScale`.
- **`renderer/three/world-objects.mjs`** paints each live object about its
  centre into a per-object canvas every frame (1 canvas px = 1 sim px at 2×)
  and shows it as a quad the same size in world units, so the spinning pizza
  wheel, the cane, the needle glint are the same drawings. `paintExtent()`
  budgets the canvas per style from measured painter reach (cup straw 73 px
  on 64×78, cane crook 49 on 90×16, orb trail 112 + 24 blur). World-space
  parts are rebuilt in 3D: throwable ground shadow as a floor disc, the
  travelling light pool as an additive floor disc + a real `PointLight` (the
  object lights the boards and the near fighter), the mouse cable and the hex
  charm's ballistic mist tail as line strips, the stage-weapon telegraph as
  the scorch decal + drop streak. Objects sit at z=+0.1 (a read never hides
  behind a body); the carried weapon at z=−0.03 like the 2D draw order (the
  hand covers it). `__finalBlowThree.stats().objects` / `.objectKinds` count
  what reached the frame.
- **Overlay pass** `drawCinema3dOverlayReads(time)` runs after the world
  `ctx.restore()` while the 3D world is live: dizzy stars / CRUSHED shards
  with their drain bars, Ali's rhythm rings, combat text and the weapon name
  tag are drawn by the SAME 2D functions, re-anchored through
  `renderer.projectSim` and scaled by the projected size of 100 sim px (the
  CRT-punch pattern), so a punch-in scales the read with its fighter.
  `presentationDebug.cinema3dOverlayReads` counts them.
- **Super-ready in 3D** was a 0.14–0.30 emissive lift nobody could read. Now:
  `uFbReadyRim` (pulsing accent silhouette stroke on the existing edge term,
  program cache key v11), an additive accent aura at hip height behind the
  body, and the seven shoulder embers from the 2D formula verbatim (hashed
  from the sim tick — nothing to rewind). Gated like 2D: reduced motion holds
  the pulse, battery `trailScale` drops the embers.
- **Tempo / Re-Arm tells in 3D (5.1)**: `uFbWhiffRim` (hot red — never the
  accent, so it cannot be mistaken for the super aura) strokes the edge term
  through a whiffed swing's tail and fades across the re-arm gap;
  `uFbRearmDim` washes the body toward pale grey for the gap and pops paler
  for a press the gap ate. Both are driven by `whiffTellState()` from
  `engine/tempo-tells.mjs` — the same function `drawFighter`'s 2D pass reads
  (fringe + extension-cell ghosts + dust crescent under/over the sprite) —
  so the tells land on identical ticks in both worlds. The `WHIFF` combat
  text reaches 3D through the overlay pass like every other label. Program
  cache key `fb-sprite-grade-v12`. See COMBAT.md "Tempo and Re-Arm tells".
- **Host contract is explicit**: `renderer/three/host-contract.mjs` lists
  every member (16 required, 18 optional); `createRenderer` asserts it first
  and the loader's catch reports a missing member by name instead of a black
  world. `tests/cinema-host.test.mjs` pins the list against both ends of the
  bridge (every `host.<x>` read in `renderer/three/*.mjs` is declared; every
  declared member is a key of the literal `game.js` passes).

## CINEMA 3D fighter layer (5.1)

Three fixes to how the sprites are lit and built in 3D (items #40, #44,
#45 of the 5.1 sweep). The pose-parity half (Post's mirror, the prone
settle, the tremble and the hunch) is in MOTION-ATLAS.md.

- **Per-stage sprite lighting.** The sprite shader's position-driven
  terms — left/right silhouette rims, the crown strip and top-down body
  gradient, the two lateral body fills, the floor bounce on the shins, the
  zone grade and the mirror's hue — were Somerset constants on every stage:
  K&A magenta rims, station-lamp green crowns and sodium floor bounce on
  the Vet, the buffet and the cruise deck. `renderer/three/stage-lighting.mjs`
  is a per-stage table (`spriteLightFor(id)`, `spriteLightFrame(light, fx,
  hitSmear)`); each stage builder returns `spriteLight` and `main.mjs` hands
  it to `FighterLayer.setStageLight` on every (re)build. Somerset's entry is
  the old constant set number for number (pinned to 1e-9 against the
  pre-5.1 formulas), so the hero stage did not move. The Vet is stadium
  floodlight (white top with a huge spread, so both crowns read floodlit
  everywhere, near-white body tint) with sodium lot lamps on BOTH sides and
  grill-fire amber off the asphalt; the buffet is amber heat lamps
  overhead (warm body tint), the red sign screen-right, carpet-orange
  bounce; the cruise deck is sky/moon from above with the lit pool throwing
  turquoise up the legs; Wildwood pink/cyan neon; Janney sodium/violet.
  The top-light body multiplier that was baked into the shader
  (`vec3(0.88, 1.12, 0.99)`, the lamp's green) is the `uFbTopTint` uniform
  now — program cache key `fb-sprite-grade-v12`.
  `__finalBlowThree.stats().banks.stageLight` names the descriptor in use.
- **Idle-time bank builds.** A fighter bank (colour map, normal map,
  smeared mirror map, foot metrics) was built synchronously on the render
  thread the first frame a pose landed in it — four full-sheet pixel
  kernels, a hundreds-of-ms hitch on the first jab / hit / crouch of a 3D
  fight. `buildBank` now returns a DRAWABLE shell at once (the raw sheet as
  the colour map — the shader's 1 px-eroded alpha test hides most of the
  fringe the bleed kills — plus a shared flat 1x1 normal map so the program
  never recompiles) and queues the chain on an `IdleQueue`
  (`renderer/three/atlas-pixels.mjs`: requestIdleCallback with a timeout,
  setTimeout(0) on iOS): foot metrics → bled colour map → smeared mirror →
  normal map → HD composite, one or more steps per idle slice. The bleed
  itself walks the silhouette FRONTIER instead of re-scanning the sheet
  seven times (byte-identical output, pinned against a copy of the old
  scan), the three consumers share ONE `getImageData`, and the balanced
  tier builds a half-resolution normal map (never none: the rims are gated
  by it). `buildRig` warms every authored bank whose OWN sheet is decoded
  (host `fighterBankSheet` — `paletteAtlas` falls back to the base sheet for
  a bank a fighter lacks, which the warm-up must not mistake for one),
  priority-ordered behind base and specials, so a normal fight builds
  nothing on a gameplay frame; a sheet that decodes late still gets its
  shell on first use and is counted (`stats().banks.lateFallbacks`).
  `__finalBlowThree.drainBankQueue()` runs everything now for probes.
- **Eviction.** `disposeRig` cancels the rig's queued steps, disposes
  every texture and clears the sheet's pixel read / bled canvas / smear /
  normal-map texture / HD composite from the module caches in
  `textures.mjs` unless the other live rig still draws that sheet
  (`releaseAtlasCaches`). Rigs with no fighters for 3 s (menus, the ladder
  between pairs) are released too. `stats().banks` reports built / ready /
  warmed / lateFallbacks / evicted, per-side bank stages and cache sizes —
  the probe for "no growth across an arcade ladder".

## The wake-up vulnerable rim (5.3, sweep #10)

Before 5.3 a rising fighter had no hurtboxes at all, so there was nothing to draw —
and nothing to aim at. Now the last 4-8 rising frames are real (the count moves with
the quick-rise / delayed-rise option), and that window has to be **seen** or a meaty
is a guess about invisible state.

- **What draws.** In `drawFighter`'s local space, under the sprite, on the same layer
  as the whiff fringe: an enlarged silhouette in amber `#ffb347` at 1.055-1.08 scale
  (so the sprite covers all but a 4-8 px rim), plus a screen-blended ground arc under
  the feet. Both pop on the exact frame `isWakeupVulnerable` turns true and brighten
  as the window closes — 0.55 → 0.90 alpha across it.
- **Why amber.** It is deliberately neither the whiff tell's hot red `#ff3f55` nor
  any fighter's accent, so "my swing met air", "I am super-ready" and "this body is
  hittable right now" can never read as one another.
- **Never dropped.** Like the whiff fringe and the super aura this is gameplay
  information, so reduced motion and the battery profile keep the rim and the arc
  (there are no trails or ghosts here to drop).
- **Probe.** `presentationDebug.wakeupTells` counts rims drawn **this frame** — the
  whole of `presentationDebug` is zeroed every rendered frame — and is surfaced as
  `snapshot().violence.wakeupTells` and `__finalBlowQa.oki().wakeupTells`. Pause on a
  vulnerable frame and it reads 1; pause on a standing fighter and it reads 0.
- **Gap.** The CINEMA 3D fighter layer has no counterpart yet; the whiff tell's
  `uFbWhiffRim` is the pattern to copy when it does (and that means a program cache
  key bump in `renderer/three/host-contract.mjs`).

## CINEMA 3D: the stage reacts, and the effects arrive (5.3, sweep #16/#43/#47/#48)

Toggling CINEMA 3D used to trade a living scene for a flat card. Five of the six
stages (`renderer/three/stage-generic.mjs` — vet / wildwood / buffet / cruise /
janney) were a graded backdrop, a dark ground and a three-point rig whose
`update()` was an empty function; Somerset's own `update(timeSec)` was a
wall-clock loop of flickers that never read `state`. Every ambient reaction 5.0
and 5.1 shipped is drawn by `drawStageAmbient`, and `drawStage`'s only caller
sits inside `if (!cinema3dWorld)` — so in 3D there were no floodlights, no
fireworks, no wheel chase, no wok, no pool flash and no sodium lamp. Worse: the
**KO pulse latch itself** lived inside `drawStageAmbient`, so a KO in 3D never
even latched a pulse, and 5.0's headline measurement ("both floodlight regions
+27 mean brightness at the KO tick") read exactly 0 with the toggle on.

Four whole effect families had the same shape of bug: `updateElementalVfx`
integrates up to ~190 flipbook sprites every frame *before* the renderer
handoff, `drawElementalVfx` / `drawAfterimages` / `drawParticles` are all inside
the same 2D-only branch. The CPU paid for them and nothing drew them.

### The bridge

Seven new members on `renderer/three/host-contract.mjs` (all optional, all
guarded by their readers):

- **`ambientPulse()`** — `{ level, age, ko, hold, pulseAge, kind, latchTick,
  frame, reduced }` from `stageSurge()`. This is the fix for the missing latch:
  `stageSurge -> readAmbientPulse -> ambientPhaseChange` is where the KO edge
  is caught, so the 3D stage layer calling it every frame is what makes a 3D KO
  fire at all. The latch is one-shot per phase edge and the crowd-hold latch is
  idempotent, so both renderers calling it changes nothing.
- **`crowdReaction()`** — the crowd's *drawn* reaction (held through the KO),
  folded in as a floor under the surge: `min(0.55, reaction * 0.4)`, so a
  sustained roar lights the stage between the discrete pulses.
- **`elementSprites()` / `elementSheet(name)` / `elementCharge(side)`** — the
  live flipbook pool, one resolved `assets/vfx` sheet, and the charging limb.
- **`battleDamage(side)` / `paintBattleDamage(ctx, side)`** — the mark list plus
  its revision, and the SAME painter the 2D compositor uses (extracted from
  `drawDamagedAtlasFrame` as `paintBattleDamageWith`, on the `paintProjectile`
  foreign-context pattern).

### `engine/stage-practicals.mjs` — the practicals as data

Positions are **plate coordinates**: the 1280x720 canvas `drawStageAmbient`
paints into, which is also the backdrop image the 3D card hangs at depth. That
is what makes the two renderers agree — the Vet's screen-left floodlight is
`[125, 88]` in `drawStageAmbient` and `x: 125, y: 88` here, and
`plateToWorld()` maps it through the backdrop card's own size (30 x 16.9 at
z -13.5) **and its barrel bend** (`-|x/15|^1.7 * 2`, the same expression that
displaces the mesh), so a card at the plate edge sits on the curved plane
instead of punching through it. `tests/cinema-spectacle.test.mjs` pins both
ends of that pairing.

Each practical answers a surge with `idle + breath + level * (gain + koGain)`,
optionally routed through `ambientStutter` so a neon/bulb practical **breaks up**
under load instead of dimming (the 2D read exactly). The ones with a `spill`
budget also get a real `PointLight` pushed out toward the fight plane — that is
the difference between a distant decal brightening and the asphalt and the
fighters flaring. `practicalSpill` subtracts half the idle first, so a stage at
rest keeps its hand-tuned three-point rig.

Fireworks (Vet, Wildwood) go up through a single 52-point cloud on exactly the
shots the 2D pass fires: one on a big hit, a second 14 ticks later on a KO,
seeded from `ambientObs.pulseTick` so a replay puts the same shell in the same
place.

Somerset keeps its own builder: `update(timeSec, state, beat)` now runs a
`surgeResponders` list **after** the flickers, so a light the flicker already
rewrites every frame can safely be multiplied (`boost`) and a light nothing else
touches is set from its build-time base (`swell`). Never the other way round or
a surge would compound frame over frame. The sodium rim, the corner signal, the
K&A neon, the check-cashing sign, the bodega and laundromat glows, the shelter
and station lamps and the SOMERSET plate all answer.

### `renderer/three/effects-layer.mjs` — effect parity

One layer, so the whole thing is a handful of draw calls:

- **Element flipbooks**: one `InstancedMesh` per LIVE sheet (typically 1-3 at
  once), per-instance uv rect from the manifest's trimmed box, alpha and
  transform. The frame pick (`anim` / `flicker` / `scatter`) and the fade curve
  are `engine/vfx-bridge.mjs`, which the 2D `drawElementalVfx` now calls too —
  a flicker sheet forks on the same tick in both renderers.
- **Charge glow**: an additive halo at the 2D gradient's radius plus a small
  point light, both off `chargeGlowRadius` / `chargeGlowAlpha`.
- **The 2D particle pool**: MIRRORED, not re-simulated. The sim already
  integrated every mote this tick, so 3D copies positions into one points cloud
  (a tiny shader, because per-point alpha is what stops a fading blood mote
  going black instead of transparent) and up to three ring quads.
  `particleChannel` routes 30 kinds; the screen-space ones (`combatText`,
  `lensBlood`, `impactFlash`, the HUD tones) map to `skip`, because the CINEMA 3D
  overlay pass already draws those on the 2D canvas on top.

**Dash afterimages** live in the fighter layer instead: a pool of at most four
quads per side that borrow the side's LIVE bank texture, which already carries
the live frame window — so an echo can never show a pose its owner has left
(the same rule `drawAfterimages` enforces by re-reading the live pose), and a
trail costs no extra texture. The wash is `afterimageGhost`, shared with 2D.
`disposeRig` releases the borrowed maps before the textures under them go.

**Battle damage** is a per-side 320 px decal canvas painted by the game's own
mark painter and bound as `uFbDamage`, composited in **cell uv space**
(`vFbLocal` is the quad's own uv, which *is* the 320 px cell the marks are
authored in) as the first thing after the atlas read — so the bruise is graded,
cel-banded and rim-lit with the skin it sits on, exactly as the 2D path gets by
baking it into the cell first. Cell space is also why mirroring and the HD swap
need no special case. Rebuilt only when `damageDecalKey(revision, gore)` moves.
New uniforms mean a new program: cache key `fb-sprite-grade-v13` -> **v14**.

### Measured (headless Chrome, `?renderer=3d`, swiftshader, 1280x720)

The stage numbers are an A/B on **the same frozen tick and pose** — only the
surge differs (`__finalBlowQa.crowdStir(1.4, 0)` between the two captures), so
the delta is the practicals and nothing else. `peak` is the hottest practical
level on that stage; the brightness columns are mean RGB over the frame below
the HUD band, and over the fight-plane band (62-90% of frame height) where the
practicals' spill lights actually land. Plate-region readings are NOT useful
here: the framing camera sees only part of the backdrop card, so a practical's
plate coordinate is not its screen coordinate in 3D.

| stage | practicals | peak level, rest -> surge | frame mean (below the HUD band) | fight-plane band | draw calls rest/surge |
| --- | --- | --- | --- | --- | --- |
| vet | 3 (2 spill) | 0.46 -> 1.96 (4.3x) | 39.06 -> 41.50 (+6.3%) | +4.14 | 127 / 128 |
| wildwood | 4 (2 spill) | 0.66 -> 2.59 (3.9x) | 45.00 -> 48.63 (+8.1%) | +8.83 | 105 / 106 |
| buffet | 7 (3 spill) | 0.39 -> 2.69 (6.8x) | 35.40 -> 39.90 (+12.7%) | +10.62 | 105 / 105 |
| cruise | 3 (2 spill) | 0.75 -> 2.34 (3.1x) | 72.95 -> 94.64 (+29.7%) | +15.85 | 165 / 165 |
| janney | 4 (1 spill) | 0.98 -> 2.71 (2.8x) | 33.56 -> 35.72 (+6.4%) | +4.00 | 42 / 42 |
| somerset | 10 responders | surge 0 -> 1 | 63.02 -> 68.06 (+8.0%) | +5.52 | 232 / 232 |

(Somerset's `peak` is the surge level itself, not a practical level — its ten
lights are `boost`/`swell` closures, not table rows. The buffet's `pass`
practical exists because of this measurement: without a spill light behind the
fight line the stage's whole surge landed on cards the framing camera barely
sees — +3.2% frame mean before it, +12.7% after. Only the Vet and Wildwood add
a draw call, and only while a firework is in the air.)

Draw calls, high tier, Vet: 127 at rest -> 128 with the surge live (the
fireworks cloud is the one extra). Balanced tier: idle 129 calls / 624 tris; a super
plus a live KO surge on the Vet peaks at **184 calls / 932 tris** with 57
element sprites on 2 sheets, 53 mirrored motes, 1 charge and a firework shot up.
The balanced tier keeps only the two biggest spill lights per stage.

Effects, high tier, a super on Somerset: up to 69 flipbook sprites across 2 sheets +
52 mirrored motes + the charge light, 242 draw calls (294 at the peak of the
freeze). Before 5.3 all of that was integrated and drawn by nobody.
A forward dash: 2 ghosts live at once across a 12-frame forward dash,
250 draw calls.
A round of heavies: the side-1 decal reaches revision 12 with GRAPHIC
FATALITIES on and is repainted 3 times (once per mark push, never per frame);
the marks are plainly visible on the jaw, chest, shoulder and forearm of the
3D sprite. A longer beat-down took it to revision 21 / 10 repaints.

Zero console errors across the whole run.

### Traps

- `host.ambientPulse()` **latches**. It is safe to call more than once a frame
  (the phase latch is one-shot per edge) but it must not be called from a
  resimulated tick — `pulseAmbient` already bails on `rollbackResimulating`.
- `stage.setDim()` runs AFTER `stage.update()` in `main.mjs`, so the generic
  stage's practicals read last frame's dim. Both write absolute values; keep it
  that way or a super will compound.
- `gl_PointSize` is in framebuffer pixels. `EffectsLayer.setPixelScale()` must
  be called whenever the backing store moves or the mirrored pool silently
  shrinks to a quarter of its canvas size on a hi-dpi display.
- The element sheet's blend mode is latched from the first sprite that asks for
  it. That is correct today because `ELEMENT_SHEET_PHYSICS` fixes `additive`
  per sheet; if a sheet ever gets a per-particle blend, the mesh has to split.

## Traps

- `ctx.filter` is also used by `drawFighter` for hit flashes; the reflection
  pass tolerates the brief override because the sheen-band fade caps how
  visible any one frame of reflection can be.
- The stain cap scan runs inside the particle integration loop — keep it a
  cheap `reduce`, or hoist a counter, before raising the cap.
- `superDimLevel` is module-level and deliberately not snapshotted; a rollback
  resimulation just re-eases it.
