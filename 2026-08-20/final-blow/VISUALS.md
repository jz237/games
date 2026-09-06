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

## Traps

- `ctx.filter` is also used by `drawFighter` for hit flashes; the reflection
  pass tolerates the brief override because the sheen-band fade caps how
  visible any one frame of reflection can be.
- The stain cap scan runs inside the particle integration loop — keep it a
  cheap `reduce`, or hoist a counter, before raising the cap.
- `superDimLevel` is module-level and deliberately not snapshotted; a rollback
  resimulation just re-eases it.
