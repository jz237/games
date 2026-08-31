# The MOTION atlas — authored in-betweens (2.7 "Frames")

Every fighter carries a third 4x4 sheet, `assets/motion/<id>.webp`, holding the
sixteen frames the animation critics kept asking for: true full-extension
contacts, painted smears, a real tuck, a real crumple. Same format as the other
two banks — 1280x1280 RGBA, 320px cells, one global scale, feet on the cell
floor, magenta-keyed through `tools/build_atlas.py` — and, unlike Post's legacy
sheets, **every motion cell is authored facing RIGHT**, so no fighter needs an
`ATLAS_FACING` override for the `motion` bank.

## The grammar (fixed across all ten fighters)

Frame index = row * 4 + column, exactly like the base and specials banks.

| # | id | pose contract |
| --- | --- | --- |
| 0 | `punch-ext` | punch at complete full extension toward the target, weight committed |
| 1 | `kick-ext` | kick at complete full extension, support leg planted |
| 2 | `smear-h` | horizontal strike SMEAR — the limb painted as a streaked, semi-abstract motion-blur arc |
| 3 | `smear-v` | vertical / rising strike SMEAR — the limb streaking upward |
| 4 | `follow` | follow-through — weight over the front foot, striking arm carried across the body |
| 5 | `tuck` | mid-flip TUCK BALL — knees to chest, tight silhouette |
| 6 | `land` | deep landing compress — full squat, arms out for balance |
| 7 | `dash` | dash stretch — body horizontally stretched mid-lunge |
| 8 | `bighit` | big hit reaction — body bent backward, feet leaving the ground |
| 9 | `crumple` | crumple key — mid-collapse, knees buckling |
| 10 | `wallsplat` | wall-splat flatten — slammed against a surface, limbs spread |
| 11 | `airrec` | air recovery arch — back arched mid-air, twisting to footing |
| 12 | `charge` | charge-up stance — braced, gathering power |
| 13 | `victory2` | alternate victory pose |
| 14 | `sig1` | fighter's signature motion, slot 1 (per-fighter, listed in the manifest) |
| 15 | `sig2` | fighter's signature motion, slot 2 (per-fighter, listed in the manifest) |

## Where the frames want to live (integration notes, next agent)

`fighterAnimationPose` (game.js) and `attackAnimationPose` (engine/fighter-kits.mjs)
already sequence the base bank; the motion cells are drop-in stronger keys:

- `punch-ext` / `kick-ext`: the active-window peak beat (base 9/10) for the
  matching limb — the full-extension contact the base sheets never had.
- `smear-h` / `smear-v`: one-or-two-tick insert between windup and contact on
  heavies/specials (horizontal vs rising by the move's launch direction).
- `follow`: the three-beat follow-through key (currently the recovery cell
  arriving early — index 3 of the active window).
- `tuck`: `airTechFlipFrames` (currently base 13) and forward-flip jumps.
- `land`: the pre-touchdown gather and landing squash (currently base 12).
- `dash`: `dashFrames > 2` (currently walk cells 5-7).
- `bighit`: heavy-hit head-snap key (currently base 15).
- `crumple`: the knockdown transition between hit (15) and down (15).
- `wallsplat`: corner splat when a launched fighter meets the arena bound.
- `airrec`: airborne juggle victim (currently the flying-hit read of base 15).
- `charge`: super/EX startup and the Grit-charge idle.
- `victory2`: round-win / taunt rotation so the single kit victory frame stops
  repeating.
- `sig1`/`sig2`: per-fighter — see `assets/motion/MANIFEST.json` `signature`.

Rejected slots (see manifest `cells[*].accept`) MUST fall back to the current
base-bank cell for that beat; a motion cell is a bonus, never a dependency.

## Pipeline (what built these sheets, repeatable)

1. **Bible first.** Read several cells of the fighter's existing base + specials
   atlases at 1:1 and write the exact outfit, colors, build, hair, props and
   rendering style into the generation prompt. The fal MCP `generate_image`
   tool remains prompt-only (probed again this wave: the `-edit` model 422s
   with no way to attach an image), so the words are the reference.
2. **One sheet, one call.** Generate the whole 16-cell sheet as a single
   magenta-keyed image (GPT Image 2 via fal, 1:1) so the character cannot
   drift between separately generated cells — the CYRAXX.md lesson.
3. **`tools/build_atlas.py` raw → atlas.** Soft magenta key + despill, real
   row-band detection, one global scale, fragment drop, 320px cells,
   `assets/motion/<id>.webp`. One extra fallback this wave (driver-side, the
   tool itself is untouched): when a thin effect bridges two figures in a row
   (Post's spray mist, the Devil's wing tip) the merged column segment is
   split at its emptiest interior column — the same emptiest-scanline
   philosophy build_atlas.py already applies to touching rows.
4. **IDENTITY GATE.** The processed sheet is read next to the fighter's
   existing atlas at 1:1. Same face, same outfit down to the accents, same
   painted rendering — or the sheet is rejected and regenerated. Per-cell
   failures are recorded as `accept: false` in the manifest rather than
   shipping a wrong-costume frame.

## Manifest

`assets/motion/MANIFEST.json`: per fighter — sheet path, build scale, the
`signature` pair, and 16 `cells` entries `{ frame, id, accept, note }`.
Integration consumes `accept` for fallback; notes carry the reviewer's reason
on any rejected slot.

## Integration (wired, 2.7)

The cells are live. Selection is pure sim-state logic in the pose functions —
`fighterPoseDescriptor`/`fighterAnimationPose` (game.js) and
`attackAnimationPose`/`attackMotionBeat` (engine/fighter-kits.mjs) — emitting
descriptors `{ bank: "motion", frame, fallback: { bank, frame } }` where the
fallback is byte-for-byte the pre-2.7 beat. `resolveMotionPose` holds the
motion bank only while the fighter's sheet is decoded AND the manifest accepts
the cell, so a missing/loading sheet or a rejected slot (cyraxx smear-v)
degrades to exactly the old read in BOTH renderers; CINEMA 3D lazily builds a
motion texture bank from the same SD sheet (there are no HD motion sheets and
the 3D path never requests renderer/hd/ for this bank).

Decisions a future wave should know about:

- **Battle damage:** ALL motion cells run through the same per-side damage
  compositor as base cells (`drawDamagedAtlasFrame` keys on atlas+frame, so
  the extension came free). The 1-2-frame smears therefore also carry marks —
  they are painted limb streaks on the fighter's own body, and one extra
  scratch rebuild per flash frame is the same cost any pose change pays.
- **World size:** every motion sheet shares the base banks' build
  normalisation (tallest standing frame → 95.6% cell height; the manifest's
  `scale` records each sheet's raw build scale), so motion cells match
  base-cell world size at 1.0. The measured exception is the Commissioner,
  whose older base atlas normalises to the full 320px cell —
  `MOTION_SHEET_ADJUST` (game.js) scales his motion cells up 4.6% to meet it;
  both renderers read the same table.
- **Beat map as wired (2.7 critic round):** punch/kick-ext replace the
  kit-less normals' active peak (the procedural extension envelope thins to a
  reduced translate while the authored cell draws — never double-stretched);
  heavies HOLD the extension cell through the mid-band into the follow key —
  the old early drop back to the raised-fist base cell read as
  punch/re-cock/punch (the beat's fallback IS that base cell, so a missing
  bank keeps the 2.6 read); smears flash ≤2 frames before contact on standing
  heavies/specials/supers (risers get smear-v, overheads keep authored windup
  — no downward smear exists, and no KICK-limb smear either: both smear
  cells are painted ARM streaks; the Commissioner's bare-fist kit-less
  normals also skip the smear — his authored smears are cane thrusts and the
  cane must not materialise for two frames on a bare-hand punch); follow
  rides the late-active third; tuck owns the ballistic tumbling band and the
  air-tech spin (donald's band opens almost at takeoff — his base ascent
  cell is the golf swing with a baked crescent); land covers the
  pre-touchdown gather + landing recovery; dash replaces the dash walk-cycle
  and exits through the base gather cell for its final two ticks (stretch →
  gather → upright, no 90° pop); bighit/crumple/wallsplat/airrec sequence
  the launched-victim reads (crumple only engages in the last ~55px of the
  fall — knees may not buckle on air); charge holds super/EX startups for
  WHATEVER room exists above a 2-tick minimum, reserving only the smear
  flash — not just startups ≥8 (and feeds the 3D super portrait);
  victory2/sig2 rotate with the kit victory cell on taunt and round-win by
  match-seed parity; sig1/sig2 hold the intro stance (devil's sig2 pounce
  was flipped in-sheet to the grammar's right-facing, 2026-08-31).
- **Skipped:** super-flash portrait moments beyond the charge-stance capture
  (the cut-in already composes from the live pose), and smears on overheads/
  crouch/air normals (no matching cell in the grammar).
