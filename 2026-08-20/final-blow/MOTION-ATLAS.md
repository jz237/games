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
  retained, not deleted. A follow-up regeneration experiment failed to fix
  them — see "Walk regeneration attempt" below.
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

## Walk regeneration attempt (2.9, bounded experiment — FAILED)

The twenty `walk-a`/`walk-b` cells were re-generated from scratch to try to
clear the two defects that killed them (same stride phase, and art graded apart
from the base bank). The attempt **failed its gate** and nothing was wired: the
locomotion beat is still the 2.8 base-only cycle, all twenty cells are still
`accept: false`, and `game.js` was not touched. Recorded here so the next agent
does not pay for the same experiment twice.

**Method.** `openai-gpt-image-2` via fal, prompt-only (reference-image input
returns 422 — confirmed a third time; the fal image tool exposes no image
parameter at all). Seven generations across three pilot fighters — deathblow
(3), jez (2), benny (2). Each generation is a two-figure magenta strip: a
mid-swing passing pose with the swing leg BEHIND, and its counter-swung mirror
with the swing leg AHEAD. Prompts carried the base cells' measured build,
costume, arm carriage and quantised clothing hexes as words. Keyed and sliced
with the standard `tools/build_atlas.py` conventions and normalised to each
fighter's measured base walk height.

**Gate.** Foot clusters, band widths at fixed height fractions, per-region Lab
palette and an upper-body outer-mass arm centroid — the same code measuring the
base walk cells and the candidates.

**Result: 0 of 3 pilot fighters passed.** Not one candidate pair cleared build,
palette or arm carriage in any round; the failures are large and systematic,
not marginal.

| candidate | chest band vs base | palette dE (base's own idle-vs-walk) | arm centroid vs base |
| --- | --- | --- | --- |
| deathblow r1 | -18.6% / +1.7% | 5.2 / 4.4 (3.0) | -40% / -34% |
| deathblow r2 | -42.4% / -36.2% | 4.3 / 4.4 (3.0) | +12.6% / +7.7% |
| jez r1 | -50.4% / -49.8% | 10.9 / 10.7 (1.7) | -17.0% / -18.1% |
| jez r2 | -28.6% / -17.0% | 5.5 / 5.1 (1.7) | -24.1% / -20.4% |
| benny r1 | -53.1% / -35.1% | 7.1 / 6.9 (2.2) | +19.0% / +5.5% |
| benny r2 | +23.6% / +23.0% | 9.6 / 9.0 (2.2) | -15.1% / -14.3% |

Height matched exactly (it is normalised on splice) and the phase goal was met
on four of the seven pairs, so the poses were reachable — the **identity** was
not. Describing a character in words re-draws a *different person of the same
description*: round 1 came back consistently too slim, round 2 (prompts pushed
toward the base bank's heroic mass) overshot into caricature, changed the face
and, on deathblow, overlapped the two figures into one blob. The visual gate
(base 4 → new a → base 6 → new b, read 1:1) shows an obvious identity strobe on
every candidate. Prompt-only generation cannot hit a specific existing sprite's
build; that needs reference-image conditioning this path does not have.

### The base walk bank is single-phase too

Measured while building the acceptance target, and the more useful finding:
**the base walk cells are not a cycle either.** Across all ten fighters, in 37
of 40 base walk cells the leading foot is forward of body centre and the
trailing foot behind it, and in **zero** cells is that configuration inverted
(the three exceptions are the Commissioner's cells, where his robe and cane
merge the feet into one blob). Silhouette IoU between a fighter's own four
base walk cells runs 0.43-0.88 — deathblow's four are 0.88, near-identical
redraws of one wide contact stance.

So the shipped walk is four takes on a single stride phase played in sequence:
the legs never swap, and the apparent motion is the x translation alone. The
`walk-a`/`walk-b` pair was rejected in the critic round for exactly the defect
the bank it was measured against also has. Consequences for anyone picking this
up:

- Dropping in an opposite-phase motion2 pair does **not** by itself produce a
  walk cycle — it produces one phase from the base bank and another from a
  differently-graded bank, which is the strobe all over again.
- The palette yardstick "no further from base than base cells are from each
  other" is unusable here: the four base walk cells are near-duplicate redraws,
  so their mutual distance is 1.0-3.5 dE (deathblow's is 1.0, i.e. below the
  just-noticeable threshold). Nothing generated independently can sit inside
  2x that. The honest same-sheet yardstick is base **idle** vs base **walk** —
  same generation, genuinely different pose — which measures 0.9-7.1 dE.
- Likewise the 10% build tolerance is tighter than several fighters' own
  intra-cycle spread: benny's four base walk cells vary 32.8% in chest band and
  ali's 41%, because the metric picks up arms at different extension.

The real fix is a full base-bank walk re-author (four genuine keys: contact,
passing, opposite contact, opposite passing) generated in ONE pass so the
grading matches by construction — not a two-cell patch bolted onto a bank that
has the same defect.

> **Followed up in 2.10** — that recommendation was built and measured; see
> "Walk bank (2.10)" below. The four-key one-pass grammar does solve phase and
> internal consistency, and two fighters shipped on it; it does NOT solve
> identity against the base atlas, which stays blocked on reference-image
> conditioning. One correction to the analysis above: the "37 of 40 cells"
> statistic is weaker evidence than it reads, because "the leading foot is
> forward of body centre" is close to tautological — any contact stance
> straddles the torso centroid, whichever leg leads. The load-bearing evidence
> that the base bank is single-phase is the adjacent-key silhouette IoU of
> 0.86-0.93, plus the near/far leg-shading sign, which never inverts across a
> fighter's own four cells (deathblow +9.6 / +11.2 / +9.7 / +13.8).

## Walk bank (2.10) — the first true walk cycle

The fix the 2.9 experiment recommended, built and measured: a SELF-CONTAINED
four-key walk cycle per fighter, `assets/walk/<id>.webp`, all four keys
generated in ONE pass and played as its own bank that is **never interleaved
with the base walk cells**. That removes both prior failure modes at once —
single stride phase, and cross-generation style mismatch.

**Result: it works as animation and fails as portraiture.** Phase alternation
and internal consistency are solved decisively. Identity against the base
atlas is not, for exactly the reason 2.9 recorded: prompt-only generation
cannot reproduce a specific existing sprite, and this fal path still has no
reference-image input (422 re-confirmed a fourth time). Two fighters shipped,
one was generated and rejected, seven were not generated.

### Format

Physically identical to the other banks — 1280x1280 RGBA WebP, 4x4 geometry,
320px cells, right-facing, feet on the cell floor — but only ROW 0 carries
art. Cells 0-3 are the four keys; 4-15 are empty and never addressed. That
choice is deliberate: `drawAtlasFrame`, `tintedSilhouette`, the crossfade
ghost, the palette remap, the battle-damage compositor and the 3D bank builder
all read the sheet with the game's standard cell geometry and needed no format
branching. A 640px-cell 2x2 sheet would have forced a cell-size branch through
every one of those.

| # | id | pose contract |
| --- | --- | --- |
| 0 | `contact-left` | left leg forward heel-striking, right leg back toe-off, RIGHT arm forward, torso upright |
| 1 | `passing-left` | right leg swinging through under the body knee bent, left leg planted straight, body at the high point of the bob, arms near neutral |
| 2 | `contact-right` | the PHASE MIRROR of key 0 — right leg forward, left leg back, LEFT arm forward. Same character facing the SAME direction, not a horizontal flip |
| 3 | `passing-right` | left leg swinging through, right leg planted, high point of the bob |

The cycle plays 0→1→2→3→0. The load-bearing property is that keys 0 and 2 have
OPPOSITE lead legs and keys 1/3 opposite swing legs.

### Scale and registration

ONE global scale per sheet, taken from the TALLEST key, so the passing keys
keep their genuine extra body height — **the bob comes from the art, never
from a per-cell rescale**. The tallest key is normalised to that fighter's
measured base walk cell height (deathblow 304px, jez 304px), which is how
world size is verified against the base bank; `WALK_SHEET_ADJUST` is therefore
empty by construction and is kept SEPARATE from `MOTION_SHEET_ADJUST` so a
Commissioner-style registration outlier cannot inherit the wrong correction.
Vertically each key is planted by its FOOT bottom, not its bbox bottom (the
devil's tail would otherwise lift his feet off the floor); horizontally by its
TORSO CENTROID, not its bbox centre, so the body stays put and the legs swing
around it instead of the fighter sliding sideways whenever a limb extends.

### The gate (and why two of its metrics had to be re-derived)

`scratchpad/walk30/gate.py`, built on the 2.9 experiment's measurement
harness so the numbers are apples-to-apples. Validated as a NEGATIVE CONTROL:
pointed at the base bank's own cells 4-7 it fails W1b, W1c, W1d and W1e on
every fighter, which is the documented single-phase defect.

- **W1a** contact stride separation >= 60% of the fighter's base mean.
- **W1b** passing separation <= 55% of the contact mean.
- **W1c** a contact key plants TWO feet, a passing key exactly ONE. Column-
  clustering the shin band (the 2.9 `feet` metric) merges the legs whenever
  they pass, so it reports stride 0 / lift 0 and cannot tell a passing pose
  from a one-legged blob; ground-CONTACT runs are unambiguous.
- **W1d** the lead leg INVERTS between keys 0 and 2. A right-facing figure
  shows the viewer its LEFT side, so the near limbs are lit and the far limbs
  shadowed; the sign of (forward leg luminance − rear leg luminance) must flip.
  Validated first on the base bank, where all four of deathblow's cells read
  the same sign at +9.6..+13.8 — the single-phase defect, measured directly.
  Where |delta| < 5 the costume cannot carry the cue and the call escalates to
  the eye at 2.6x.
- **W1e** ADJACENT-key silhouette IoU < 0.75. Not all-pairs: a correct cycle's
  two contact keys legitimately resemble each other, and so do its two passing
  keys — what must differ is CONSECUTIVE keys (legs spread vs legs together).
  The base bank scores 0.86-0.93 on every adjacent pair.
- **W2** head-band width spread <= 12% and HEAD-REGION palette <= 3.0 dE.
- **W4** foot bottoms within 6px.

Two spec metrics were unusable as written and are reported as ADVISORY:

- **Chest-band width** tracks the swinging ARMS, not the build. On the shipped
  deathblow sheet it reads 124/86/112/86 — the contact keys carry a gauntlet
  forward where it merges with the torso silhouette. Probed across the roster,
  a KNOWN-GOOD single-generation sheet spreads 1.2-31.1% on that band, so the
  literal 12% is unreachable by construction. The base bank's tight 5.5% is
  itself a symptom of its near-duplicate redraws, so it is not a fair floor.
- **All-region palette** is contaminated the same way: the legs/feet bands are
  sampled by height fraction, so a contact key (legs spread, background between
  them) and a passing key (legs overlapping) sample different content of the
  SAME character — worth 8-12 dE on jez while his head and torso sit at
  0.4-1.8. The head occupies the same pixels in every key, so grading drift
  shows there undiluted.

### Measured results

| fighter | W1a contact sep | W1b passing | W1c plants | W1d inversion | W1e adj IoU | W2 head / head-dE | W4 | W3 identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deathblow | 123.5 / 132.0 (need 69.0) | 0 / 0 | 2,1,2,1 | +16.6 → −1.2, eye-confirmed | 0.465 | 1.4% / 0.7 | 1px | marginal |
| jez | 108.0 / 124.5 (need 90.9) | 0 / 0 | 2,1,2,1 | +44.2 → −35.3 | 0.429 | 2.2% / 2.3 | 1px | marginal |
| devil | 115.5 / 117.0 (need 113.8) | 44.0 / 0 | 2,1,2,1 | +19.4 → −26.0 | 0.409 | 7.4% / 1.9 | 1px | **FAIL** |
| *base bank (control)* | 113.5 / 110.5 | **105.5 / 115.0** | **2,1,1,1** | **+9.5 / +9.8** | **0.927** | 3.8% / 1.0 | 1px | n/a |

A passing separation of 0 means the two legs merged into one cluster, which IS
the passing signature. Eight fal generations total: deathblow 2, jez 3,
devil 3. The seven remaining fighters were not generated — see below.

### What one-pass generation solved, and what it did not

**Solved — phase.** Every pilot cleared W1a/b/c/e, and after prompt iteration
all three cleared W1d. The decisive prompt moves were (a) a 1x4 FILMSTRIP
rather than a 2x2 grid, which stopped the model collapsing the two passing
keys into one identical drawing (round-1 deathblow scored IoU 0.998 between
keys 1 and 3); (b) OCCLUSION language — "which leg is drawn ON TOP where they
cross" — rather than left/right anatomy; and (c) an explicit TONAL rule making
the near leg lighter and the far leg darker, which is both the cue a viewer
reads and the cue W1d measures. jez went +11.5/+21.4 (no inversion) →
+2.0/−13.2 (too weak to call) → +44.2/−35.3 across those three rounds.

**Solved — internal consistency.** This is the clearest win. Head-band width
spreads 1.4-7.4% and head-region palette 0.7-2.3 dE across the four keys,
against the 2.9 cross-generation attempt's 4.3-10.9 dE. Generating four cells
in one pass genuinely holds one character together; the approach is not dead.

**Not solved — identity against the base atlas.** All three pilots deviate:
deathblow's signature gauntlets grade GUNMETAL-with-dark-red where the base
bank's are red-dominant, his shark decal is a flat silhouette against the
base's modelled shark and his shades changed shape; jez is leaner through the
arms with brown-tan boots against the base's dark ones; the devil is spindly
and gracile with markedly smaller wings against a thick-muscled base creature,
and reads as a different individual of the same species. This is the same wall
2.9 hit, from a different direction, and it is a GENERATION-PATH limit rather
than a grammar limit — it needs reference-image conditioning this fal path
does not expose.

The devil was also authored as an UPRIGHT BIPEDAL walk, deliberately not the
all-fours prowl the brief specified: his base atlas is bipedal in every walk
and idle cell, and a prowl bank would pass the cycle gates but fail the
idle↔walk transition by construction, swapping his whole body plan on entry.

### Integration (wired, 2.10)

Bank 1/2's exact architecture, third time. `walkCyclePose(walkTime, roles)` in
`engine/fighter-kits.mjs` emits `{ bank: "walk", frame, fallback }` where the
key index rides **the same `walkTime * 10` phase the base cycle has always
used** — so locomotion speed still drives cadence, and the fallback is
byte-for-byte the base cell that phase already showed. `resolveMotionPose` now
routes off a shared `AUTHORED_BANKS` list (`motion`, `motion2`, `walk`) that
both renderers read, so a bank cannot be gated in 2D and ungated in 3D.
`buildMotionAcceptMasks` takes a cell count so the walk bank builds a 4-entry
mask instead of a 16-entry one.

Eight of ten fighters have **no entry in the manifest at all**, so their mask
is undefined and `walkCellDrawable` returns false without ever requesting a
sheet — the manifest is consulted BEFORE the image, precisely so those eight
do not 404 on every step they take. Their locomotion is the pre-2.10 base-only
cycle, byte-identically; `tests/walk-cells.test.mjs` asserts that for all ten
fighters across a full cycle.

CINEMA 3D lazily builds a walk texture bank from the same SD sheet and never
requests `renderer/hd/` for it. Battle damage, alt palettes, tinted
silhouettes and the crossfade ghost all key on the atlas, so the walk cells
inherited every compositor for free.

**Verified in browser** (own CDP harness, port 9345): both wired fighters cycle
0→1→2→3→0 on the walk bank at 1-tick granularity with the in-game sprite
matching the sheet keys at 1:1; `walk → crouch → walk` hands off through the
2.9 `crouch-trans` key and back into the bank
(`walk:1 → base:12 → motion2:4 → base:12 → motion2:4 → walk:2`); `walk → dash`
hands off to bank-1 `dash` and the 2.9 `dash-brake`
(`walk:2 → motion:7 x10 → motion2:6 x2`); and one `?renderer=3d` boot resolved
all four walk keys with zero console errors. The lazy-decode window is covered
by the fallback and was observed live — a cold run rendered the base walk
cells for the whole burst and never glitched.

**Harness note for the next agent:** in this headless harness the game's own
loop does not advance the sim — `qa.step()` is the only thing that does, and
rAF only draws. A screenshot taken right after a step can therefore show a
composite drawn from a LATER state once the QA input override expires; the
first burst of this wave looked like the base bank was still drawing. Hold the
state across the capture window (step once, then await ~15 rAFs and re-read
`qa.pose()` to confirm it is stable) before believing any frame. Fighters also
spawn only 110px apart, so walking forward just presses into the opponent's
pushbox and never translates.

## Motion3 bank (2.9 hold-breaking)

A three-critic panel measured the 2.9 build and found the remaining
un-smoothness is **one thing**: single drawings held for 183-500ms and moved
around the screen by a transform. `assets/motion3/<id>.webp` is the answer —
eight cells per fighter, each one existing to break one specific measured hold.

Physical format: 1280x1280 RGBA WebP, 4x4 grid, 320px cells, **eight cells used
(frames 0-7, rows 0 and 1); rows 2-3 are intentionally empty** so the sheet is a
drop-in for the existing `frame = row * 4 + col` machinery in both renderers and
in `resolveMotionPose`'s bank routing. All cells RIGHT-FACING, feet on the cell
floor, one global scale per sheet. Manifest: `assets/motion3/MANIFEST.json`,
same shape as banks 1 and 2 plus a per-fighter `consistency` block carrying the
measured gate numbers.

**World size is mass-matched to motion2, not tallest-to-95.6%.** motion3
interleaves with motion2 and motion at 60fps, so the banks must agree on world
size at the beats where they touch, and three of the eight motion3 poses are
fully-extended airborne keys that would otherwise shrink the whole sheet under
the height rule. The scale is
`sqrt(median_opaque_area(motion2, 16) / median_opaque_area(motion3 raw, 8))`;
frames that overflow the cell clamp-shrink individually, exactly as the bank-1
and bank-2 format strings already allow. Every clamp >=3% is recorded in the
cell's manifest note, and clamps >12% carry an explicit caveat.

### The grammar (fixed across all ten fighters)

| # | id | pose contract | hold it breaks |
| --- | --- | --- | --- |
| 0 | `windup-punch-b` | SECOND punch anticipation — deeper coil than motion2:0, weight fully loaded on the rear leg, shoulder rotated further back, fist chambered tighter | heavy-punch windup: motion2:0 held **11 ticks / 183ms** |
| 1 | `windup-kick-b` | SECOND kick anticipation — knee chambered higher and tighter than motion2:1, support leg compressing, arms counter-balancing | heavy-kick windup: motion2:1 held **17 ticks / 283ms**, one drawing sliding forward |
| 2 | `jump-apex` | top of the arc — body extended and hanging, knees unfolding out of the tuck, arms rising slightly | jump: motion:5 (tuck) held **28 ticks / 467ms** covering the entire apex AND descent — the longest hold in the build |
| 3 | `jump-descent` | falling — legs reaching for the ground, body angled forward-down, arms trailing up | same 467ms tuck hold, descent half |
| 4 | `air-attack-b` | air strike FOLLOW-THROUGH — limb past full extension, body rotated further through the swing, on the way down | air normal: motion2:13 held **30 ticks / 500ms** with zero pose change through startup, active and recovery |
| 5 | `dash-body-b` | second dash key — the motion:7 horizontal lunge with the legs scissored the other way and the arms in the opposite drive | dash body: motion:7 held **10 ticks** static |
| 6 | `throw-recover` | attacker's post-throw recovery — arms coming down from the release, weight settling back, torso unwinding | throw attacker recovery: one kit cell held **28 ticks / ~470ms** while the victim's whole fall plays |
| 7 | `react-mid` | middle of a hit reaction — torso folded, head trailing, one arm flung, feet skidding | reaction tracks: light AND heavy both converge on one base cell held **6-7 ticks** mid-track |

### Intended sequencing (integration intent, next agent)

- **windup:** `motion2` key -> `motion3` key -> smear -> bank-1 extension ->
  `follow`. The wind-up becomes two drawings instead of one, and the smear
  window is untouched.
- **jump:** `motion2:7 jump-rise` -> `motion:5 tuck` -> `motion3:2 apex` ->
  `motion3:3 descent` -> `motion:6 land`. Five keys where 2.9 had a rise, a
  467ms tuck and a land.
- **air normal:** `motion2:13` -> `motion3:4`. The 500ms single-drawing window
  splits into a strike and a follow-through.
- **dash:** `motion:7` <-> `motion3:5` alternating, exiting through
  `motion2:6 dash-brake` as 2.9 already wires it. The dash body cycles instead
  of freezing.
- **throw:** `motion2:12 throw-grab` -> (kit throw art) -> `motion3:6`.
- **reaction:** opening key (`motion2:9 light-hit` or bank-1 `bighit`) ->
  `motion3:7` -> recovery. One mid-key serves BOTH tracks.

Rejected slots would ship `accept: false` and MUST fall back exactly like banks
1 and 2 — a motion3 cell is a bonus, never a dependency. This wave landed
**80/80 accepted**, with four takes rejected and regenerated before shipping.

### Physiology

The **devil's** eight cells are **BIPEDAL**, and the manifest records the body
plan per cell. His BASE atlas is an upright rearing biped in all sixteen of its
cells, and the 2.9 critic round rejected quadruped motion2 cells precisely
because they were wired into bipedal beats — so the quadruped idiom is
deliberately not used here. The wings carry the airborne keys (2/3) and the flat
winged lunge carries the dash key (5) without leaving the biped. The
**commissioner** keeps the cane in all eight cells (planted, braced, swung,
trailing). **Cyraxx** was generated with zero energy effects on purpose, per the
CYRAXX.md overlay rule. **Ali** keeps the boombox on his back, **post** the
spray can at the hip, and **donald** stays club-less, all consistent with their
motion2 sheets.

### The identity gate, and what it actually measured

The brief's literal thresholds (<=12% internal width spread, <=3.0 dE internal
palette, <=3.5 dE against motion2) are **not met by any sheet — and are not met
by motion2 measured against itself either.** motion2's own all-pairs
palette-set dE runs **2.18-7.47** across the roster, and its own standing-cell
band-width spread runs **6.7-84.1%**. Band widths at a fixed height fraction are
pose metrics, not identity metrics, once the set contains eight deliberately
different poses. Recording that is the point; the walk section below already
warned that a bank's own intra-bank spread is the only honest yardstick.

What was measured instead, per fighter, and recorded in the manifest:

1. **Internal spread** of opaque area, median horizontal opaque run length
   (limb thickness, far more pose-invariant than a band width), standing-cell
   head/chest bands, and adaptive-8 **palette-set dE** — each reported next to
   the SAME metric computed on that fighter's own motion2 sheet.
2. **Cross-bank palette-set dE per cell**, against the exact cell it will play
   next to rather than against the sheet mean.
3. The decisive **1:1 visual adjacency read** — every new cell exported beside
   its neighbour cell at full size and read for build, costume and grading.

| fighter | internal palette dE | motion2's own | cross-bank dE | ratio | takes |
| --- | --- | --- | --- | --- | --- |
| deathblow | 4.36 | 4.30 | 6.22 | 1.45 | 3 |
| jez | 6.97 | 7.20 | 9.58 | 1.33 | 2 |
| alan | 6.65 | 7.47 | 8.05 | 1.08 | 1 |
| post | 3.22 | 5.03 | 6.95 | 1.38 | 2 |
| benny | 2.75 | 3.53 | 3.97 | 1.13 | 1 |
| donald | 3.80 | 4.86 | 8.07 | 1.66 | 2 |
| cyraxx | 3.64 | 4.17 | 5.79 | 1.39 | 1 |
| ali | 5.11 | 5.56 | 7.03 | 1.26 | 1 |
| commissioner | 2.03 | 2.18 | 3.30 | 1.51 | 1 |
| devil | 2.64 | 2.84 | 4.14 | 1.46 | 3 |

**Every fighter's internal palette dE is at or below its own motion2 sheet's.**
One-pass eight-cell generation is at least as self-consistent as the bank
already shipping — the "generate all cells of a set in ONE pass" lesson from the
failed walk regeneration holds, and holds strongly.

**Cross-bank dE is 1.08x-1.66x the fighter's own intra-bank figure.** That gap
is real and no prompt-only path closed it: a separate generation is a separate
draughtsman. It is an order of magnitude smaller than the walk regeneration's
failure (4.3-10.9 dE against a 1.0-3.5 dE bank, with -53% to +24% build error)
because motion3 only has to sit next to motion2, which is itself a prompt-only
generation, rather than next to the base bank. Regenerating narrowed it every
time it was tried, but never to parity.

The one metric that stays systematically negative is the standing-cell **chest
band, -12% to -41%** against motion2's pose-matched cells. It is largely pose:
motion2's windup and guard cells carry both arms wide through the 30-45% height
band, while the motion3 windup-b poses chamber one arm tight to the ribs by
design. Recorded, not corrected.

### Pipeline (repeatable)

Same as banks 1 and 2 — bible from the fighter's own sheets at 1:1, one
full-sheet magenta generation per fighter, key/despill, blob-clustering slice,
identity gate — with two changes:

1. The bible is written from the fighter's **motion2** sheet, not the base
   atlas, because motion3 plays interleaved with motion2 and motion.
2. The slicer takes a **4-across x 2-down** source layout (3:2 aspect from
   `openai-gpt-image-2`, 1024x768) and emits frames 0-7 of a standard
   1280x1280 sheet. Reference-image conditioning still does not exist on this
   fal path; probed again this wave, unchanged.

## Critic round 2 (2.9) — THE HOLD BUDGET, and how the banks are sequenced

The round-1 integration wired every authored cell to the right beat and then
held it. Measured on that build with a 1-tick labelled burst: heavy-kick windup
**17 ticks** on one drawing, jump tuck **28** (covering the apex *and* the whole
descent), air normal **30** with zero pose change, throw attacker recovery
**31**, dash body **10**, reaction tracks 6-7 on one base cell. A slideshow slid
by a transform.

### The rule

`MOTION_HOLD_BUDGET = 8`. No single drawing may own a beat for longer than that
without advancing to another compatible authored cell. Beats are no longer
`if/else` ladders returning one cell — each long beat is a **key track**: an
ordered `{ at, chain }` list over the beat's own normalised progress, in
`engine/fighter-kits.mjs`. `beatPoseAt(keys, progress, fallback)` walks it.

A key's `chain` runs most-preferred → least, and the **caller supplies the
terminal fallback**, which is how one track serves both the kit-less path (base
cell fallback) and the kit path (kit frame fallback) without being written
twice. Bands may pin their own fallback (`key.fallback`) when the beat they
replace showed a different cell there — that is what keeps every track
byte-identical to the pre-fix read when no sheet is on disk.

`beatKeyRuns` / `longestBeatHold` are the audit hooks. `tests/motion-holds.test.mjs`
asserts the budget per track **with the motion3 bank absent**, i.e. against what
ships even if that bank is deleted. Adjacent bands that degrade to the same
drawing are merged first — two neighbouring keys falling back to one cell are
ONE hold, which is exactly the trap round 1 fell into.

### Motion3 slots — name-addressed, not index-addressed

`motion3` descriptors carry a **pose NAME**, resolved against the manifest's own
`format.poseIds` list at draw time (`buildMotion3KeyMap`, `motion3KeyDrawable`).
Absent manifest, absent sheet, absent pose id all mean "no", and every motion3
key carries a shipping-today key as its fallback. This bank is deliberately NOT
in `AUTHORED_BANKS`: those resolve by frame index against a fixed 16-cell
grammar, motion3 resolves by name against whatever it happens to ship, so the
two gates are different contracts.

The payoff was measured live: the bank landed mid-wave and **the throw-recovery
slot lit up with no code change at all**, because the art's `throw-recover` id
matched the name the track already asked for. The remaining seven ids were then
reconciled into `MOTION3_KEYS` (`windup-punch-b`/`windup-kick-b` are limb-
specific, so the windup mid-key is limb-aware too; `react-mid` goes to the HEAVY
reaction track only, because giving it to both would re-converge the two tracks
that M5 exists to keep apart). Reserved names that no bank supplies yet
(`air-startup`, `dash-launch`, `throw-clinch`, `attack-settle`, `block-settle`,
`getup-roll`) stay dormant and cost nothing.

### Airborne body-centre anchoring (B2)

Every cell is floor-anchored, which is right for a figure standing on the street
and wrong for one in the air. Measured: deathblow's jump-rise content centre
sits at row 174 of 320 and his tuck at 238 — both floor-anchored, so the handoff
dropped the body centre 64 cell px (~78 world px) and the **head 125 cell px**
(~152 world px, half a body height) on the tick vy was most negative.

`CELL_BODY_CENTRE` carries the measured content centroid of every cell of every
bank (PIL, opaque pixels at alpha ≥ 24, floor registration folded in) plus each
fighter's standing reference row. `airborneAnchorOffset` returns the shift that
puts a cell's centroid on that reference; `cellVerticalOffset` ramps it with
height (`AIRBORNE_ANCHOR_RAMP_PX = 110`) so it is **zero on the street and total
in the air**. Takeoff and touchdown stay feet-planted, the last ticks of a fall
read as the legs reaching down, and — because every airborne cell targets the
same row — **no airborne bank switch can move the body at all**. motion3's three
airborne keys are in the table, so the bank that exists to break the jump hold
cannot reintroduce the pop it was added to sit inside.

### Prop-cell prohibition (B4)

`BASE_CELL_ROLES.attack` answers "may this cell draw in an attack beat". That is
not "is this the right drawing for THIS move". donald's bare-fisted heavy punch
recovered onto base:11 — a full club-in-hand golf follow-through — and held it
23 ticks, and base:11 is in his `attack` set, so the round-1 contract test
passed it.

`PROP_CELLS` lists, per prop fighter and per bank, the cells that depict the
prop **in action** (swung / sprayed / struck with, or carrying baked prop VFX),
verified cell by cell at 1:1, plus a prop-free stand-in for each. A move is
bare-handed when it has no kit art of its own (`bareHandedAttack`), and
`resolveMotionPose(..., { bareHanded: true })` enforces it at the single
resolution choke point every renderer already reads through — so it covers every
present and future beat of a kit-less move, not just the recovery cell that got
caught. The contract test sweeps every bare-handed move, every frame, every
fallback chain, against every sheet-availability combination.

Worth recording: **ali's base bank has no clean bare-handed strike cell at all**
(8, 10, 11, 13, 14 all swing the mic; 9 carries it passively and is the only
safe target), and **donald has exactly one** club-free cell, base:8.

### Bank preload (B3)

`ensureMotionAtlas` / `ensureMotion2Atlas` were reachable only from the drawable
gate, so the FIRST authored draw of a match always missed: the sheet request
started on the tick the cell was first wanted and that tick fell through to the
base fallback. On donald the opening tick of his heavy punch drew his overhead
GOLF SWING, and the smear flash a dozen ticks later drew it again (bank 1's
first draw). `preloadAuthoredBanks` runs from `makeFighter` — the one choke
point every match-start path shares — and **decodes**, which is the half that
matters, since a complete-but-undecoded image still stalls the first blit.

### Turnaround precedence

The authored pivot key (motion2:5) measured **0-1 ticks of screen time across
~2800 fight ticks**. It sat below the guard/crouch and attack branches, and a
grounded facing flip essentially only happens in those states: pushboxes forbid
ground crossings, so a cross-up is almost always a jump, and the fighter who
flips is the DEFENDER, who is guarding or crouching when it resolves. The 3-tick
latch now outranks guard, crouch and the crouch-entry in-between, and stays
below hitstun, blockstun, knockdown, wake-up, grabs and dizzy — being hit
outranks turning around. Verified on a real cross-up: the jumper crosses at
tick 26, both facings flip, and the guarding defender draws motion2:5 for its
full three ticks.

## Critic round 3 (2.9 final) — THE CROSS-BANK CONSISTENCY GATE

The round-2 build shipped four authored banks. The panel scored smoothness 4.0
and reactions 3.5 and named four beats where the fighter **changes costume**
mid-animation at gameplay size — not grading drift, a different wardrobe:

* **walk / deathblow** — clear prescription glasses become opaque black
  SUNGLASSES, red plaid forearm wraps become segmented gunmetal GAUNTLETS, and
  the modelled grey shark decal becomes a flat white shark of a different
  outline. On every walk entry and exit.
* **walk / jez** — dark boots become tan, the saturated royal-blue gi goes pale
  grey-blue.
* **motion3:0 / deathblow** — barrel-chested brawler becomes a V-taper
  bodybuilder with horizontal red TAPE where the plaid was and an open-jawed
  shark, then back, four ticks into the middle of one punch.
* **motion3:0 / donald** — slim buttoned suit becomes a LARGE BELLY bulging out
  of an open jacket, and a different face, three times inside one punch.

### The gate

Two stages, per cell, roster-wide.

**Stage 1 — the measured screen.** A COSTUME DELTA SCORE against the cells the
bank actually plays beside (motion / motion2 / walk against the base bank's
eight idle+walk cells; motion3 against motion2, the bank it was authored to
interleave with — which is why the devil, whose motion2 already carries a brown
body and purple wings where his base bank is green, passes: motion3 matches
what it plays next to, and that is the only comparison the eye can make).

Seven features, all whole-figure opaque-mass fractions rather than region
bands, because a band at a fixed height fraction samples different body parts
in different poses — the contamination that broke every earlier attempt:
`red`, `blue`, `grey`, `white`, `black`, `skin`, plus `redTex`, the texture
energy INSIDE the red mass (a woven plaid check is high-frequency, a solid tape
band or a plated gauntlet is not — a mass fraction alone cannot tell red plaid
from red tape). Head-anchored eyewear darkness and shoulder/waist taper are
measured and REPORTED but not gated: probed this round, taper alone swings
0.54-1.47 across the base bank's own idle-vs-walk cells. It is a pose metric.

The null model is the fighter's own base cells 0-7 — one draughtsman, one
costume, eight different poses — so the spread of a feature across them is
exactly how much it moves for POSE reasons alone:
`z = |v - mean| / max(std, 0.12*mean, 0.010)`, `CDS = RMS(z)`, and
`R = CDS(bank median) / CDS(reference bank's own self-max)`. **Threshold
R >= 3.0.**

**Stage 2 — the 1:1 adjacency read, and it is the DECIDING stage.** Every
bank x fighter under review exported at full size beside its neighbour cell and
read for costume, accessories and build.

### The finding, and it is the important one

**A costume swap can be chromatically invisible, and the two worst swaps on the
roster are.** Stage 1 ranks deathblow's motion3 sheet at R=1.10 and donald's at
1.86 — the 26th and 31st worst cells on a 36-row table — while the devil's
motion BANK, which is fine on screen, scores R=19.45. Stage 1 caught four of
the six walk failures (jez 9.67, cyraxx 10.69, ali 5.56, benny 3.01) and NONE
of the motion3 failures, and it produced a false positive it would have
condemned (jez motion3, R=3.54, driven entirely by bare-arm skin exposure in
dynamic poses) that the 1:1 read cleared.

The reason is structural: deathblow's swap is glasses GEOMETRY, gauntlet
PLATING and decal SHAPE inside an unchanged black/red/skin palette. Nothing
that measures colour mass can see it. **A measured gate is a screen, never the
decision.** Do not ship a wave on the numbers alone.

### The pass/fail table

Stage 1 is reported for all four banks; it was applied as an auto-fail only to
the two banks under review this round. `motion` and `motion2` are not
re-litigated — they have shipped through two critic rounds and the panel
praised beats from both — but their R values are recorded here because they are
the evidence that the measure does not rank what the eye ranks.

| fighter | bank | vs | ref self-max | CDS med | R | stage 1 | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| alan | motion | base | 0.80 | 3.35 | 4.19 | FAIL | kept |
| ali | motion | base | 0.52 | 2.59 | 4.99 | FAIL | kept |
| benny | motion | base | 0.68 | 3.66 | 5.38 | FAIL | kept |
| commissioner | motion | base | 0.71 | 2.60 | 3.67 | FAIL | kept |
| cyraxx | motion | base | 0.57 | 4.07 | 7.14 | FAIL | kept |
| deathblow | motion | base | 0.68 | 1.34 | 1.97 | pass | kept |
| devil | motion | base | 0.38 | 7.39 | 19.45 | FAIL | kept |
| donald | motion | base | 0.79 | 2.15 | 2.72 | pass | kept |
| jez | motion | base | 0.55 | 3.51 | 6.39 | FAIL | kept |
| post | motion | base | 0.37 | 1.44 | 3.88 | FAIL | kept |
| alan | motion2 | base | 0.80 | 6.06 | 7.58 | FAIL | kept |
| ali | motion2 | base | 0.52 | 2.90 | 5.57 | FAIL | kept |
| benny | motion2 | base | 0.68 | 2.84 | 4.18 | FAIL | kept |
| commissioner | motion2 | base | 0.71 | 2.71 | 3.82 | FAIL | kept |
| cyraxx | motion2 | base | 0.57 | 2.76 | 4.85 | FAIL | kept |
| deathblow | motion2 | base | 0.68 | 1.62 | 2.38 | pass | kept |
| devil | motion2 | base | 0.38 | 4.91 | 12.92 | FAIL | kept |
| donald | motion2 | base | 0.79 | 2.71 | 3.44 | FAIL | kept |
| jez | motion2 | base | 0.55 | 2.30 | 4.19 | FAIL | kept |
| post | motion2 | base | 0.37 | 1.98 | 5.34 | FAIL | kept |
| alan | motion3 | motion2 | 1.43 | 2.67 | 1.87 | pass | kept |
| ali | motion3 | motion2 | 1.00 | 0.71 | 0.71 | pass | kept |
| benny | motion3 | motion2 | 1.52 | 1.72 | 1.13 | pass | kept |
| commissioner | motion3 | motion2 | 1.27 | 1.61 | 1.27 | pass | kept |
| cyraxx | motion3 | motion2 | 1.37 | 3.69 | 2.69 | pass | kept |
| deathblow | motion3 | motion2 | 1.80 | 1.98 | 1.10 | pass | **DISABLED** |
| devil | motion3 | motion2 | 1.06 | 2.13 | 2.01 | pass | kept |
| donald | motion3 | motion2 | 1.72 | 3.20 | 1.86 | pass | **DISABLED** |
| jez | motion3 | motion2 | 1.11 | 3.93 | 3.54 | FAIL | kept |
| post | motion3 | motion2 | 0.58 | 0.64 | 1.10 | pass | kept |
| ali | walk | base | 0.52 | 2.89 | 5.56 | FAIL | **DISABLED** |
| benny | walk | base | 0.68 | 2.05 | 3.01 | FAIL | **DISABLED** |
| cyraxx | walk | base | 0.57 | 6.09 | 10.69 | FAIL | **DISABLED** |
| deathblow | walk | base | 0.68 | 1.36 | 2.00 | pass | **DISABLED** |
| jez | walk | base | 0.55 | 5.32 | 9.67 | FAIL | **DISABLED** |
| post | walk | base | 0.37 | 0.76 | 2.04 | pass | **DISABLED** |

### What is disabled, and what a player gets

**40 cells, all of them whole sheets.** The accept mask never partially rejects
a sheet: interleaving a swapped costume with the correct one is worse than
either on its own.

* **The WALK bank is off roster-wide** — all four keys on all six sheeted
  fighters (deathblow, jez, post, cyraxx, ali, benny), 24 cells. Named
  mismatches, per fighter, in `assets/walk/MANIFEST.json`: deathblow's glasses
  and gauntlets and shark; jez's gi wash and tan boots; post losing most of his
  build (a bodybuilder redrawn as a thin man); ali's blocked black/yellow
  tracksuit panels becoming thin side stripes, with key 0 wearing BROWN
  trousers under the yellow jacket — not even internally consistent; benny's
  trousers alternating olive and khaki BETWEEN KEYS of one cycle, with tan
  boots where the base sheet has black; cyraxx growing hair over a bald crown.
  Six fighters having a "true four-key cycle" that swaps their glasses on every
  walk entry and exit is worse than none. Locomotion is the 2.8 base walk,
  byte-identically, through the chained fallback.
* **motion3 is off for deathblow and donald**, 16 cells. Their heavy-windup
  mid-key, jump apex/descent, dash body, air-attack, throw recovery and
  react-mid degrade to the shipping-today keys every motion3 descriptor already
  carried. The other eight fighters keep the bank.
* `motion` and `motion2` are untouched, 320 cells accepted.

### THE DURABLE FIX, and it is not another prompt

Prompt-only generation cannot match an existing sheet's costume closely enough
to INTERLEAVE with it. Three waves have now proved it from three directions:
the 2.9 walk regeneration (4.3-10.9 dE against a 1.0-3.5 dE bank, -53% to +24%
build error), motion3's cross-bank ratio floor of 1.08-1.66x that regenerating
narrowed every time and never closed, and this round's finding that the
residual is not even in the colour — it is in the accessories and the build,
where no measurement the pipeline has ever run would have caught it.

A separate generation is a separate draughtsman. Every sheet is internally
consistent — one-pass generation works, and motion3's internal palette dE is at
or below its own motion2 sheet's on all ten fighters — and every sheet is a
different character from the one next to it, by a small amount that is
invisible in aggregate and glaring on a two-tick cut.

**The recommendation for a future wave: re-author a fighter's ENTIRE sheet set
in ONE pass — base, motion, motion2, motion3, walk together, one generation,
one draughtsman, one costume — rather than adding an nth bank beside n-1
existing ones.** That is the only path that removes the interleave problem
instead of measuring it. Until then a new bank should be judged by ONE
question: at 1:1, beside the cell it will play next to, is this the same
character? The number is a screen. The eye decides.
