# Audio & Music — Research Notes

> Original homage. All music/SFX to be ORIGINALLY composed in the STYLE of the
> era. No ripped audio, no copyrighted tracks. Chris Huelsbeck's original score
> is referenced only for stylistic direction — do NOT reproduce it.

## Confirmed facts

- The original soundtrack is **Chris Huelsbeck's celebrated 7-channel
  ("7-Voice") Amiga score** — a landmark of Amiga music, driven by a custom
  multi-channel replayer on top of the Amiga's 4 hardware channels.
- The title theme is anthemic ("The Final Fight" title theme).
- World 5 (Alien Ship) uses eerie heartbeat / screech ambience (Giger theme).

## Style direction for ORIGINAL composition

Overall: chiptune / synth-driven, melodic, heroic, fast tempo to match the
run-and-gun pace. Emulate the "big" layered Amiga MOD sound (multi-channel
tracker feel) without copying any melody.

| Track | Context | Style notes (original) |
|-------|---------|------------------------|
| Title theme | Menu / intro | Anthemic, heroic, soaring lead over driving bass; slow build to a triumphant hook. |
| World 1 (Desert) | Outdoor platform | Adventurous, mid-fast, open and bright; propulsive bassline. |
| World 2 (Submerged Dungeon) | Underwater/cavern | Darker, echoey, mysterious; slower pulse, watery pads, reverb tails. |
| World 3 (Corridor) | Shmup | High-energy, fast arpeggios, relentless drive; pure adrenaline for the on-rails blaster. |
| World 4 (Walker Factory) | Industrial | Mechanical, percussive, metallic hits, driving industrial groove. |
| World 5 (Alien Ship) | Biomechanical | Eerie, dissonant; heartbeat kick, screech FX, sparse unsettling pads; tension over melody. |
| Boss theme | Any boss fight | Intense, urgent, faster tempo, minor key, heavy percussion. |
| Victory / ending | Post-final-boss | Triumphant reprise of the title hook, resolving major key. |
| Game over | On death-out | Short somber sting. |

## SFX list

- Player shot fire (per weapon: spread / laser / bounce)
- Power-line whip loop
- Morph transform (in/out)
- Mine/bomb drop + explosion
- Freeze / smart-bomb activation (whoosh + chime)
- Jump, land
- Damage taken (player) + death
- Enemy hit + enemy explosion (small / large)
- Boss hit + boss explosion (big, multi-stage)
- Pickup: weapon, upgrade, diamond, 1-UP, shield
- Extra-life jingle
- Countdown-timer warning (low-time beep)
- Underwater ambience loop (W2)
- Factory machinery / conveyor loop (W4)
- Alien heartbeat / screech ambience loop (W5)
- Menu move / select
- Stage-clear fanfare

## Implementation notes

- Prefer a lightweight WebAudio synth or small original chiptune/MOD-style
  files. If using ElevenLabs `compose_music` / `text_to_sound_effects`, generate
  ORIGINAL pieces in the described style; do not prompt for the real Huelsbeck
  tracks.
- Duck music under boss/large SFX. Loop world themes seamlessly.

## Sources

- https://en.wikipedia.org/wiki/Turrican_II:_The_Final_Fight
- World-structure notes (W5 Giger heartbeat/screech ambience).
- Research bundle audio facts (title theme = anthemic).
