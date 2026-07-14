# SUBWAY SIEGE: BLACKOUT v2.0 — Full Enhancement Prompt

> Same treatment as the shipped Stellar Drift v2 / Subway Siege v2: enhance the base game
> graphically and functionally into a full-featured game — ElevenLabs audio, elaborate title
> + options, deep gameplay — then test, self-critique, iterate, and ship. Adapted to Blackout's
> top-down blackout tank-survival identity (searchlight/darkness engine, auto-aim turret,
> camera-follow arena, one-finger drive-stick).

## The Prompt (executed)

### 1. Audio — ElevenLabs (the game had NONE; synth-only)
- 3 music tracks (title / patrol / boss) crossfaded on state changes, over the existing
  `Snd` module (now: WebAudio SFX buffers + HTMLAudio music + the synth as fallback).
- 14 real SFX: cannon fire, small/big explosion, barrel chain, pickup, player hit, wave clear,
  boss horn, upgrade, achievement, menu click, combo, overdrive, perfect.
- Mixer: music + SFX volume sliders (Options), music duck under barrel blasts, kept the looped
  engine drone; the mute button still works.

### 2. Title & all options
- Menu: **DEPLOY · GARAGE · OPTIONS · RECORDS · FIELD MANUAL**.
- **Garage**: 3 selectable tanks — RANGER balanced / SCOUT fast-fragile / BULWARK heavy-shielded —
  distinct top-down silhouettes, stat bars, persisted; each maps onto speed / fire cadence / armor /
  starting shield / searchlight width+range / turret turn.
- **Options**: music + SFX sliders, screen shake (full/low/off), particles (auto/high/low),
  show FPS, reset local scores (double-tap). Persisted.
- **Field Manual**: device-aware controls + combo/overdrive/districts/new-enemy briefing.
- **Records** tabs: Scores / Medals / Service (lifetime stats).
- **Pause** menu with live stats + Options.

### 3. Gameplay depth
- **Combo** chain (kills within a window) multiplies score; **Overdrive** at combo ×12 grants
  piercing rapid fire (plus the existing overdrive pickup).
- **Two new enemies**: STALKER (cloaked ambusher, only reveals point-blank; turret can't auto-lock
  it until it commits) and MORTAR (stationary, lobs telegraphed splash shells you dodge off the reticle).
- **Perfect wave** bonus (clear a wave without losing armor).
- **Post-boss upgrade**: pick 1 of 3 permanent modules (autoloader, plating, shield cell, scavenger
  magnet, hollow-point crit, floodlight searchlight).
- **12 achievements** (toast + gallery) + **lifetime stats**.

### 4. Graphics & feel
- **5 named DISTRICT themes** (Station Plaza / Crimson Yard / Cold Terminal / Toxic Siding /
  Violet Depot) that recolor the ground + darkness fog every 5 waves, with an "entering district"
  banner. Adaptive-quality FPS watchdog, hit-stop on kills, combo/district HUD, mortar telegraph reticles.

### 5. Robustness & QA
- `window.__blackoutQA` hooks (snapshot / tick / setWave / spawn / killAll / grantOverdrive /
  setCombo / selectTank / god / addPickup / recTab / bootAudio …). Kept the global leaderboard
  slug `subway-siege-blackout` and local top-10.

## Shipped (2026-07-06, v2.0.0)
- No source folder existed — established `games-source/2026-06-09/subway-siege-blackout/` from the
  deployed copy. Built via a design workflow (7 designers + parity critic) then an adversarial
  review workflow. The design synthesis flagged real correctness items folded in first: an
  accumulator **spiral guard** (the fixed-timestep loop, needed before hit-stop could safely
  early-return), hp-max scatter (Bulwark's 140 armor), and stalker turret fairness.
- Audio in `audio/`: 3 music (112k mp3) + 14 SFX (ogg), ~3.3 MB, `?v=` cache-busted.
- 22/22 headless CDP checks green, no console errors; every screen verified at 430×880.
- Notable engine facts: enemies die ONLY via `killEnemy()` (no hp-sweep); the darkness engine
  punches destination-out holes into an offscreen light canvas.
