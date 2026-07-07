# Turrican II — Redux (enhanced browser tribute)

A faithful, original **homage** to *Turrican II: The Final Fight* (Amiga, 1991) —
rebuilt as an HTML5 canvas run-and-gun exploration platformer with **enhanced,
modern graphics** and original audio.

## What it is
- Fast, heavy, controllable side-scrolling action: run, jump, shoot, **morph**
  into a spinning wheel, sweep the **rotatable lightning beam**, drop the
  **power line**, and trigger a **freeze/smart-bomb**.
- Faithful **5-world / 11-stage** structure (see `SPEC.md` §1): Desert →
  Submerged Dungeon → Corridor (shmup) → Walker Factory → Alien Ship → "The
  Machine".
- Three upgradable primary weapons (Multiple / Beam / Bounce), diamonds, 1-UPs,
  energy, and secret-friendly maze levels.

## What it is NOT
- **No copyrighted ROM data, ripped graphics, ripped audio, or reproduced
  melodies.** Every sprite, tile, palette, effect, and sound is original,
  created for this tribute. Research (`notes/research/`) informed structure and
  mood only. See `SPEC.md` §8 (Asset provenance).

## Tech
- Modular UMD engine (`assets/engine.js`) — pure, deterministic, 60 Hz fixed
  tick, headless-testable in Node.
- `data.js` config + deterministic level builder · `render.js` canvas graphics
  + particles · `audio.js` original WebAudio synth · `input.js` keyboard/touch/
  gamepad · `game.js` loop + menus.
- Enhanced background plates generated with an image model, downscaled to
  web-optimized JPEGs (~40–70 KB each). All assets local (strict-CSP safe).

Built and iterated via a self-paced deploy → compare → fix → enhance loop.
