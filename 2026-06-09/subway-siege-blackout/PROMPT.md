# SUBWAY SIEGE: BLACKOUT v3.x — Immersion Overhaul (the /loop build)

> v2.0 gave the game its identity: top-down blackout tank survival — searchlight/darkness engine,
> auto-aim turret, camera-follow arena, one-finger drive-stick, ElevenLabs audio, tanks, districts.
> v3.x (built 2026-07-14 by the self-paced immersion /loop; ledger: BLACKOUT-V3-LOOP.md) turned it
> into a full arsenal-and-city game. Design thesis: **in a blackout, every effect is a light source.**

## v3.1.0 — The Arsenal
- **5 weapons** (data-driven WEAPONS defs; garage ARMAMENT row; persisted `ssb_weapon`):
  CANNON (all-round, v2-exact baseline) · SCATTER (5-pellet close burst) · RAILGUN (instant
  hitscan lance, raycast vs world, pierces the whole line) · INCINERATOR (jittered flame cone +
  stacking burn DoT through killEnemy; burning enemies glow, flicker, and lose stalker cloak) ·
  TESLA (chain arc, ≤4 hops between REVEALED enemies, turret cloak rule, per-frame crackle render).
- **Weapon crates**: own 5% drop band; grant a random other weapon for the run (loadout restored
  on restart).

## v3.2.0 — Ordnance + Feel + Voice
- **FLARE (Q / touch button)**: lobbed 8s pool of light — pins reveal≥90 in 170px, THE cloak
  counter. Ammo 2/run cap 5, resupply pickups.
- **EMP (E / touch button)**: arena-wide reveal (cloak-piercing) + 1.5s stun (boss 0.75s); the
  whole blackout lifts in an expanding wave and crushes back. Ammo 1/run cap 3, rare pickups.
- **VFX**: tinted muzzle/explosion glows (light holes are colorless — color lives on the main
  canvas), velocity tracers, per-weapon directional impact sparks, casings+smoke only on ballistic
  guns, explosion light BLOOMS (grow-as-fade), persistent scorch + wreckage debris (capped pool).
- **Accessibility**: Flash FX setting (Full/Low/Min — floor 0.25, light is information) applied to
  flashes/glows/EMP pulse; prefers-reduced-motion defaults shake+flash to reduced on first run.
- **Audio**: 7 ElevenLabs SFX (per-weapon fire, flare launch, EMP blast w/ music duck, metal
  impact ping w/ throttle), loudness-matched to the v2 bed, synth fallbacks kept.

## v3.3.0 — The Living City
- **9 districts** (waves 1–45 then wrap): STATION PLAZA, CRIMSON YARD, COLD TERMINAL, TOXIC
  SIDING, VIOLET DEPOT + new HARBOR GATE, EMBER WORKS, GHOST MARKET, AZURE CIRCUIT.
- **District engine** (`districtFx`, rebuilt per district): prop layer (crates, vents, glowing
  signs, benches, kiosks, freight containers, puddles, hazard drums, neon panels — camera-culled),
  flickering ambient light wells, weather (rain / embers / tinted motes / rolling fog banks).
- **Hazards** (≤1 per district): STEAM VENTS (COLD/TOXIC/EMBER — telegraphed bursts scald machines
  via killEnemy and slow the tank 45%; deliberately NOT damagePlayer, preserving perfect-wave) ·
  POWER SURGES (CRIMSON/VIOLET/GHOST — warn, then searchlight −45% and city lights out ~2.7s).
- **Ambience**: 3 seamless 5s loops (city hum / rain / industrial) mapped via ambKey, on the sfx
  bus, stops on game over.

## v3.4.0 — Balance + Polish
- **Balance from a measured DPS matrix** (rig probes; ticks-to-kill single brute / 4-drone line):
  railgun 3→2.5 dmg (still one-shots scouts/drones; generalist dominance removed), incinerator
  0.11 dmg + burn 80 (was weakest). Final spread 1.7×, every weapon top-2 in its niche. Railgun
  blind-fire through darkness KEPT (physical lance; cd-60 makes spam unprofitable).
- **16 achievements** (+QUARTERMASTER fire all 5, NOWHERE TO HIDE flare-expose a stalker,
  GRID KILLER 6+ stunned by one EMP, END OF THE LINE reach wave 41).
- **QA hooks gated behind `?qa=1`** (family convention). FIELD MANUAL covers armament/ordnance/
  hazards. Touch verified end-to-end (tap = one shot; stick coexists; landscape clean).

## Engine invariants (violating these caused real bugs — see ledger)
- Fixed timestep (accumulator, spiral guard steps<5); piercing/multi-hit dedupe via b.hitSet
  across the 2 substeps; enemies die ONLY via killEnemy(); stalker turret rule reveal<40;
  mortar `!b.splash` guard; every `el.volume` write clamped [0,1]; all per-run state reset in
  startGame; `?v=AUDIO_V` on every audio URL (AUDIO_V 3.3.0, 24 files).

## Tooling
- `tests/run.mjs`: 43-check suite / shots / perf (gate ≤3.0ms worst-case) / probe '<expr>' [shot]
  — self-managed server+chrome (PID-killed, DevToolsActivePort), touch emulation, SSB_VIEW=WxH.
- Leaderboard slug unchanged: `game-scores.jez237.workers.dev/scores/subway-siege-blackout`.

## Shipped
- v3.1.0 / v3.2.0 / v3.3.0 LIVE 2026-07-14 (site + jz237.github.io mirror); v3.4.0 ships with
  this batch. One real OpenClaw deploy revert observed and survived (~2min; redeploy converges).
