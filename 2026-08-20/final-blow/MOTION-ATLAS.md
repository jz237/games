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

## Motion2 bank (2.9)

Every fighter carries a fourth 4x4 sheet, `assets/motion2/<id>.webp`: sixteen
in-between and transition keys targeting every beat that still snaps after 2.7.
Same physical format as the motion bank — 1280x1280 RGBA, 320px cells, ALL
RIGHT-FACING, one global scale per sheet (tallest of frames 0-11 → 95.6% cell
height, matching the base banks' world size; deathblow's walk cells measured
304px against the base sheet's 303-304px as the cross-bank verification).
Manifest: `assets/motion2/MANIFEST.json`, same shape as bank 1 (no signature
slots — every id in this bank is fixed across the roster).

### The grammar (fixed across all ten fighters)

| # | id | pose contract |
| --- | --- | --- |
| 0 | `windup-punch` | cocked-back fist, weight loaded on the rear leg — the anticipation key before bank-1 `punch-ext` |
| 1 | `windup-kick` | chambered knee on the support leg — the anticipation key before bank-1 `kick-ext` |
| 2 | `walk-a` | walking mid-stride passing pose |
| 3 | `walk-b` | walking opposite-stride contact pose |
| 4 | `crouch-trans` | half-lowered between stand and crouch |
| 5 | `turnaround` | mid-pivot seen from behind-ish, weight shifting |
| 6 | `dash-brake` | dash-exit gather — rising from the horizontal lunge, one foot braking, arms trailing |
| 7 | `jump-rise` | ascending body, knees starting to draw up — the pre-tuck key |
| 8 | `block-hit` | guard flinch — arms up absorbing, head turned, slight skid |
| 9 | `light-hit` | small head-jolt and shoulder turn — much less than bank-1 `bighit` |
| 10 | `dizzy` | staggering sway, rubber legs, head lolling |
| 11 | `thrown` | airborne victim held/hurled pose, limbs loose |
| 12 | `throw-grab` | attacker seizing with both hands, weight forward |
| 13 | `air-attack` | jumping strike — body tilted, limb extended downward-forward |
| 14 | `getup-a` | ground rise phase 1 — knee up, hand pushing off the floor |
| 15 | `getup-b` | ground rise phase 2 — half-risen crouch, head coming up |

Physiology adaptations are in-grammar, not exceptions: the devil's walk pair is
a prowling all-fours gait, his turnaround a mid-wing-pivot, his throw-grab a
rearing two-claw seize, his block-hit a wing-shield; the commissioner keeps the
cane wherever natural (walking stick in the walk pair, brace on crouch-trans /
dizzy / getup, a bar across the body on block-hit, raised behind the seize on
throw-grab, a spear thrust on air-attack) and drops it mid-air on `thrown`,
consistent with his empty-handed base hit cells.

### Where the frames want to live (integration intent, next agent)

- `windup-punch` / `windup-kick`: 1-2 startup ticks immediately before the
  active window on the matching kit-less normal, so the bank-1 extension stops
  appearing from a neutral guard. Never on moves with authored windups.
- `walk-a` / `walk-b`: cycle with the walk speed as in-between keys of the base
  walk cells (a → base → b → base). Donald's pair is club-less while his base
  walk carries the club — cycle his two motion2 cells as a self-contained pair
  or skip him.
- `crouch-trans`: 2-3 ticks on stand→crouch AND crouch→stand.
- `turnaround`: 2-3 ticks when the fighter's facing flips.
- `dash-brake`: the dash-exit gather — replaces the tail of bank-1 `dash`'s
  exit through the base gather cell (stretch → brake → upright).
- `jump-rise`: the ascent band between takeoff and the bank-1 `tuck`.
- `block-hit`: flash on guarded contact (blockstun impact), then back to the
  guard cell.
- `light-hit`: light/medium hit reactions — the beat between "no reaction" and
  the bank-1 `bighit` head-snap.
- `dizzy`: loop/hold during the dizzy state (alternate with the base stagger
  read if one exists).
- `thrown`: the throw victim arc while held/hurled, before the launched-victim
  reads (`bighit`/`airrec`/`crumple`) take over.
- `throw-grab`: attacker's throw startup/grab connect, before the throw cinematic
  beat.
- `air-attack`: active window of air normals (replaces the ground punch cell
  the jump attacks currently borrow).
- `getup-a` → `getup-b`: sequenced on wake-up between the down cell and
  standing, ending the teleport-to-feet.

Rejected slots ship `accept: false` in the manifest and MUST fall back to the
current beat exactly like bank 1 — a motion2 cell is a bonus, never a
dependency. (The generation wave landed 160/160 accepted; the 2.9 CRITIC ROUND
then rejected all twenty `walk-a`/`walk-b` cells — see below — leaving
140/160.)

### Pipeline notes (2.9 wave)

Same pipeline as bank 1 (bible → one full-sheet magenta generation per fighter
→ key/despill → slice → identity gate), with one upgrade now standard: every
sheet was sliced by BLOB CLUSTERING (the 2.8 method) instead of row-scanline
splits, so interleaved figures never get severed at row boundaries. All ten
sheets landed on the first generation — zero single-cell retries this wave.
The identity gate compared 3+ cells per fighter against the base-atlas idle at
1:1; benny/donald/cyraxx-style exposed fingertips were verified at 3x to be
painted skin highlights, not magenta spill. Cyraxx was generated with zero
energy effects by design — transition beats read cleaner and the CYRAXX.md
no-tint rule cannot be violated by an effect that does not exist.

World size: same normalisation as the base banks; the Commissioner's motion2
sheet needs the SAME +4.6% `MOTION_SHEET_ADJUST` entry as his bank-1 sheet
(one more row in the existing table, both renderers already read it).

### Integration (wired, 2.9)

The cells are live on bank 1's exact architecture: descriptors stay pure
sim-state (`MOTION2_CELLS`/`motion2Pose`/`wakeupMotionPose` +
`attackMotionBeat`'s new `windup`/`airAttack` beats in fighter-kits.mjs, the
state-driven beats in `fighterPoseDescriptor`), `resolveMotionPose` now walks
CHAINED fallbacks with a bank-routed drawable gate (motion2 → bank-1/base →
base), and both renderers lazy-load `assets/motion2/` behind the same
accept-mask machinery — SD only, never renderer/hd/. Battle damage, alt
palettes, tinted silhouettes and the crossfade ghost all key on the atlas, so
motion2 cells inherited every compositor for free.

Beat map as wired (2.9):

- **windup-punch/kick** re-skins the last 2-4 startup ticks of kit-less
  STANDING heavies immediately before the smear window (kick heavies, having
  no arm smear, hand off windup → extension directly; the Commissioner's
  bare-fist normals windup → extension too, preserving the no-cane rule).
  Never on lights, crouch/air normals, overheads, driveHeavy, or authored-
  windup kit moves; startup length untouched.
- **walk-a/b** — WITHDRAWN by the 2.9 critic round; the walk is base-only again,
  exactly as 2.8 shipped it. See "Critic round" below.
- **crouch-trans / turnaround** hold 3 ticks off render-only edge latches in
  the motion observers (crouch flip both ways; grounded facing flip — the
  cross-up defender wears the pivot). Never advanced during rollback resim.
- **dash-brake** replaces the 2.7 base-gather dash-exit bridge (final 2 dash
  ticks): stretch → brake → upright. **jump-rise** owns the ascent between
  takeoff and the bank-1 tuck band (covers reduced motion — it is a pose).
- **block-hit** owns the whole standing blockstun window (checked ABOVE the
  hit-flash read so blocked contacts flinch instead of borrowing the clean-
  hit cell; crouch blockstun keeps the crouch guard cell).
- **light-hit** opens the reaction track for light hits, then sequences into
  the 2.6 progressive stagger; heavies/specials keep bank-1 bighit.
- **dizzy** alternates with the base stagger cell at the old sway cadence
  (also covers guard crush — the shared branch).
- **thrown** rides the victim through the grab clinch AND the rising half of
  the hurl (`lastHitResult === "throw" && vy < 0`) before bighit/airrec/
  crumple take the fall. **throw-grab** holds the attacker through the grab
  clinch, falling back to the kit's own throw art.
- **air-attack** owns the whole active window of kit-less air normals
  (replacing the borrowed ground punch cells and the grounded follow read).
- **getup-a → getup-b** sequence the wake-up countdown (>9 / ≤9 of the
  16-frame recovery), ending the teleport-to-feet.
- **P1-seat flash layering** (2.7 critic J2): during smear / final-2-tick
  charge flashes the attacker draws LAST in the pair, so the flash cells stop
  vanishing behind the opponent from the P1 seat. Scoped to those beats only.
- **Micro-crossfades** came free: the 2.6 torso-clipped pose crossfade arms
  on every bank switch, and paletteAtlas/bankSheetAdjust resolve "motion2"
  for the ghost pass, so motion2 ↔ bank-1 ↔ base transitions all fade.

Demo coverage: `crouchTrans`, `turnaround` and `airAttack` joined DEMO_BEATS
(turnaround actively staged as a close-range cross-up; the other two fall out
of the staged crouch/air normals) so the choreographer provably parades the
new keys. Contracts live in tests/motion2-cells.test.mjs.

## Critic round (2.9) — the base bank's frame grammar is NOT uniform

A three-critic animation panel scored the motion2 integration 4/10 and 3.5/10.
One root cause explained four of the five blockers: **every wave up to 2.9
handed off to HARDCODED base indices as if the base atlas bank's frame grammar
were uniform across the roster. It is not.** Verified cell by cell against
`assets/atlases/<id>.webp` at 1:1 with silhouette/area/foot-cluster
measurement:

- `base(12)`, assumed "standing-ish, fine for guard", is a DEEP SQUAT on
  deathblow / ali / benny / donald / post and a wing-wrapped cocoon on the
  devil. Standing guard therefore dropped them into a crouch, and 2.9's
  standing block-flinch made them rise ~80px INTO the punch. Those squat cells
  are also drawn OVERSIZED — measured 1.13x-1.33x the standing figure's mass —
  so entering crouch ballooned the character in one tick.
- `base(13)`, assumed "second strike / stagger", is an ATTACK POSE on nine of
  ten fighters (benny's high kick, ali's overhead mic swing, the devil's
  airborne claw lunge, donald's golf swing with baked crescent VFX, alan's high
  kick, jez's knee chamber, post's spray raise, cyraxx's airborne tuck) and on
  DEATHBLOW is a DIFFERENT COSTUME (long tactical trousers, knee pads, combat
  boots against his shorts + sneakers everywhere else). Only the Commissioner's
  13 is the arms-out recoil the code assumed.

**The fix is `BASE_CELL_ROLES` in `engine/fighter-kits.mjs`** — a per-fighter
semantic map naming which base indices genuinely are `{guard, crouch, stagger,
hit, secondStrike, walk, idle}`, plus an `attack` set (legal in an attack beat,
never in a reaction) and an `unusable` set (art defects that must never draw at
all, routed away by `swap` at the single choke point inside
`resolveMotionPose`, which every consumer already reads through). Every beat
consults the map; where a fighter has no suitable base cell the beat prefers an
authored motion/motion2 cell. `tests/motion2-cells.test.mjs` asserts that no
role a non-attack beat consumes can resolve to an attack or unusable cell.

Also landed in this round:

- **The walk is base-only again.** The motion2 walk pair could not be blended
  into the base cycle (different generation: build, cap, decal, boots and arm
  carriage all part; the devil's pair is an all-fours prowl against an upright
  bipedal cycle; donald's is club-less against a club-carrying base walk), and
  it cannot stand alone either — measured foot-cluster positions prove `walk-a`
  and `walk-b` are the SAME STRIDE PHASE for all ten fighters (walk-b is the
  same pose with a wider stance), so the pair is not a cycle and skates. All
  twenty cells are `accept: false` with the measurements recorded; the art is
  retained, not deleted.
- **Reaction / dizzy / guard / air-normal handoffs** are authored or
  map-resolved end to end. Dizzy holds one authored key carried by a procedural
  sway instead of alternating with an attack cell; air normals wear the
  authored jumping-strike key for their WHOLE window (startup, active AND
  recovery) instead of borrowing grounded cells and then snapping.
- **Throw timing.** `thrown` (a fully airborne horizontal body) is gated to the
  real lift window; the grounded clinch wears a standing flinch so attacker and
  victim agree in space.
- **Crossfade ghost.** The old fixed "clip below 72% of the cell" rect assumed
  the head lives in the top 28% — false for most authored cells, so the dash
  stretch's mid-cell head drew a legible second face at the fighter's hip. The
  ghost is now masked by the INCOMING pose's own silhouette (nothing can appear
  outside the live body, by construction) and softened on any non-cycle pose
  change so it carries colour but no readable features.
- **Anticipation fills the startup room** (the 2.8 charge-gate shape) instead
  of a 4-tick cap, so long-startup heavies stop leaking vestigial base cells.
- **Per-cell draw corrections** (`baseCellDrawAdjust`, `cellFloorOffset`, both
  shared with CINEMA 3D through the existing host bridge): the oversized crouch
  cells are mass-normalised, and the Commissioner's base bank — the roster's
  only registration outlier, content bottoming anywhere from 277 to 320 where
  every other sheet is a flat 316 — is planted per cell. His
  `MOTION_SHEET_ADJUST` was re-fitted from 1.046 (fitted to his 320px outlier
  cell) to 1.033 (his actual 316px standing cells).
