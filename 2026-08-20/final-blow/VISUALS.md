# Visual presentation systems

Version 1.4 "Red Cinema" added two presentation passes on top of 1.3's violence
tiers. Everything here is render/presentation-only: driven by `visualRandom` or
the simulation tick, gated by the performance profile, and invisible to rollback
checksums. Nothing in this file affects gameplay outcomes.

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

## Traps

- `ctx.filter` is also used by `drawFighter` for hit flashes; the reflection
  pass tolerates the brief override because the sheen-band fade caps how
  visible any one frame of reflection can be.
- The stain cap scan runs inside the particle integration loop — keep it a
  cheap `reduce`, or hoist a counter, before raising the cap.
- `superDimLevel` is module-level and deliberately not snapshotted; a rollback
  resimulation just re-eases it.
