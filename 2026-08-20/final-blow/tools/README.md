# Asset pipeline

Small Pillow-only scripts that turn a generated character sheet into the exact
formats the runtime expects. No numpy, no other dependencies.

## Generating a fighter's art

1. Generate a **4x4 sprite sheet** with GPT Image 2 on a flat pure magenta
   (`#FF00FF`) background: 16 cells, one full-body figure each, all at the same
   scale, all facing right, all standing on the same ground line.
2. Composite it into the runtime atlas:

   ```sh
   python3 tools/build_atlas.py sheet.png out.png
   ```

   The builder keys the magenta with a soft edge and a despill pass, finds the
   four row bands (splitting at the emptiest scanline when figures touch), finds
   the four figures in each band, derives **one global scale** from the tallest
   standing frame so the character never pulses between frames, drops stray
   generator fragments, and writes a 1280x1280 RGBA atlas of 320px cells with the
   feet on each cell floor.

3. Cut the select portrait from a single-figure generation:

   ```sh
   python3 tools/build_portrait.py figure.png portrait.png
   ```

4. Save as WebP at quality 92 into `assets/atlases/`, `assets/moves/` and
   `assets/fighters/`.

## Frame roles

`assets/atlases/<id>.webp` — combat atlas:

| Frames | Role |
| --- | --- |
| 0-3 | idle stance |
| 4-7 | walk cycle (5-7 double as the dash) |
| 8-11 | attack: wind-up, extending, extended, recovering |
| 12 | crouch / block / throw-tech / late wake-up |
| 13 | jump and heavy overhead |
| 14 | special release |
| 15 | knockdown, hit reaction, early wake-up |

`assets/moves/<id>-specials.webp` — specials atlas, four rows of four, addressed
by `anim(row)` in the kit. **Frame 15 is the victory pose**, not a recovery frame.
