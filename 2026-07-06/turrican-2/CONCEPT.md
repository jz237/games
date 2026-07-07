# Turrican II — Redux (enhanced browser tribute) · v1.0.0

A faithful, original **homage** to *Turrican II: The Final Fight* (Amiga, 1991) —
rebuilt as an HTML5 canvas run-and-gun exploration platformer with **enhanced,
modern graphics**, original audio, and a full voice announcer.

## What it is
- Fast, heavy, controllable side-scrolling action: run, jump, shoot (with
  vertical aiming), **morph** into a grinding wheel, sweep the **rotatable
  lightning beam**, drop mines, and trigger a **freeze/smart-bomb** that locks
  boss cores open.
- Faithful **5-world / 11-stage** structure (SPEC §1): Desert → Submerged
  Dungeon (all-directional swimming) → Corridor (**dedicated on-rails shmup**)
  → Walker Factory (conveyors, crushers) → Alien Ship → **"The Machine"**
  (3-phase final boss).
- **Six bosses** with telegraphs, guarded/open weakpoint windows, phase shifts,
  sealed arenas and WARNING banners. Exit gates until the guardian falls.
- Per-world themed enemy rosters (scarabs/wasps, eels/bubble-mines,
  interceptors/seekers, statues/bolt-crushers, huggers/egg-pods) on shared
  behavioral archetypes.
- Wind gusts (W1), an updraft wind-climb finale (2-2), waterfalls, buried
  secret vaults (shoot the crate plug open), checkpoints, continues,
  difficulty levels, options menu, local high scores.
- **Voice announcer** with per-event pools + variants (no immediate repeats):
  mission start, sector clear, boss warn/down, 1UP, low energy/time, weapon
  upgrades, deaths, game over, victory.
- Original per-world **composed chiptune** (WebAudio-clock scheduler: bass /
  lead / pads / drums per SPEC §6 moods), boss theme, jingles, ducking.

## What it is NOT
- **No copyrighted ROM data, ripped graphics, ripped audio, or reproduced
  melodies.** Every sprite, tile, palette, effect, sound and voice line is
  original, created for this tribute. Research (`notes/research/`) informed
  structure and mood only. See `SPEC.md` §8 (Asset provenance).

## Tech
- Modular UMD engine (`assets/engine.js`) — pure, deterministic, 60 Hz fixed
  tick, headless-testable in Node (1300+ assertions + an 11-stage
  traversability bot that also duels every boss).
- `data.js` config + deterministic level/corridor builders · `render.js`
  canvas graphics (per-world tile atlas, parallax, particles, DPR-crisp) ·
  `audio.js` original WebAudio synth + music scheduler + voice pools ·
  `input.js` keyboard/touch/gamepad (tap-latching, rumble) · `game.js` state
  machine + menus + settings.
- Enhanced background plates generated with an image model; voice lines
  generated with ElevenLabs (Harry). All assets local (strict-CSP safe).

Built and iterated via a self-paced test → verify-in-browser → fix → enhance
loop (14 iterations for v1.0.0).
