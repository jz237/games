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

## Unified bank (3.0 pilot) — one generation, one whole vocabulary

The recommendation the 2.9 critic round closed on, built and measured on one
fighter. `assets/unified/deathblow.webp` is deathblow's ENTIRE constantly-
visible animation vocabulary — 16 cells — authored in a SINGLE generation, so
it is self-consistent by construction rather than by measurement.

**Result: the cross-bank costume problem is SOLVED. The walk cycle is NOT.**
Twelve of sixteen cells are accepted. The four walk keys are `accept: false`
after four full generations failed the phase mirror identically. Nothing is
wired: `game.js` and `engine/` were not touched, the other nine fighters were
not generated, and this bank does not draw.

### The grammar (16 cells, 4x4, one generation)

1280x1280, 320px cells, row-major, all right-facing, one global scale from the
tallest STANDING figure normalised to 306px, foot bottoms on floor row 315,
torso centroid on the cell centre. Physically identical to every other bank, so
`drawAtlasFrame`, `tintedSilhouette`, the crossfade ghost, the palette remap,
the damage compositor and the 3D bank builder would all read it unchanged.

| # | id | # | id |
| --- | --- | --- | --- |
| 0 | `idle` | 8 | `jump-rise` |
| 1 | `walk-contact-a` | 9 | `jump-tuck` |
| 2 | `walk-passing-a` | 10 | `punch-extension` |
| 3 | `walk-contact-b` | 11 | `kick-extension` |
| 4 | `walk-passing-b` | 12 | `light-hit` |
| 5 | `crouch` | 13 | `big-hit` |
| 6 | `crouch-trans` | 14 | `stagger` |
| 7 | `guard` | 15 | `knockdown` |

Rare and bracketed beats (fatality poses, signature showcase) stay on the
existing banks by design.

**The generation layout is NOT the atlas grammar.** The four walk keys were
generated as the sheet's contiguous TOP ROW — the 1x4 filmstrip that 2.10
records as decisive for phase — and the slicer permutes generation panels to
atlas cells (`slice16.py --order 1,2,3,4,0,5,...`). The grammar puts the walk at
cells 1-4, which straddles a row break, so generating in grammar order would
have split the filmstrip. Worth keeping for any repeat: the two orderings are
independent and only the slicer needs to know.

### THE MEASUREMENT THIS PILOT EXISTS TO MAKE

The 2.9 round named the exact beat: deathblow's clear glasses become opaque
SUNGLASSES and his red plaid forearms become gunmetal GAUNTLETS on every walk
entry and exit, because the idle cell is from the base generation and the walk
cell is from the walk generation. Same metric set, three idle→walk pairs:

| pair | cap dE | head dE | gauntlet texture Δ |
| --- | --- | --- | --- |
| **A** same-gen: base idle → base walk (the null model) | 0.63–1.03 | 1.81–2.04 | 0.067–0.093 |
| **B** CROSS-gen: base idle → walk bank (shipped disabled) | **11.42–11.89** | **7.86–8.20** | **0.198–0.200** |
| **C** same-gen: unified idle → unified walk / guard / light-hit | **0.60–1.66** | 2.51–4.52 | **0.027–0.035** |

**One-pass whole-vocabulary authoring collapses the idle→walk costume delta
from 11.4–11.9 dE to 0.6–1.7 dE — inside the base bank's own 0.63–1.03 dE pose
noise.** The strobe is not reduced, it is removed, for every beat the sheet
covers. That is the durable fix, and it is now measured rather than argued.

The caveat is in the same table. Unified idle against BASE idle measures cap
9.52 dE and gauntlet texture 0.237 apart: the unified sheet is a different
draughtsman from the base atlas, exactly as expected, and the 1:1 read agrees
(slimmer, more red-check-dominant gauntlets; a smaller, simpler shark). So a
unified bank must own EVERY beat it covers — one base cell falling through as a
fallback re-creates the strobe it was built to remove. It cannot be an nth bank
beside n-1 others; that is the whole point of it.

### U1 internal consistency, and why the literal thresholds had to be re-derived

**The spec thresholds (head-band width spread ≤ 8%, head-region palette ≤ 2.5
dE) are unreachable on ANY 16-pose sheet, including the base atlas itself.**
Measured with the identical code, the BASE ATLAS — one generation, one
character, the identity reference — spreads **48.4%** on head width and **15.22
dE** on head palette across its own 16 cells. motion2 spreads 96.3% and 14.56
dE. A crouch, a jump-tuck and a knockdown draw the head at wildly different
angles and foreshortenings, so a fixed head metric over 16 poses measures POSE.
This is the 2.10 chest-band finding again, one bank later: **any metric taken at
a fixed body landmark across a full 16-pose vocabulary is a pose metric until
proved otherwise.** Every number is therefore reported twice — all 16 cells, and
a pose-comparable UPRIGHT SUBSET — beside the same subset on the fighter's own
sheets, and the gate applied is the brief's own fallback, *meet or beat
motion2*.

| sheet / subset | headW % | head dE | head dE mean | cap dE | gauntlet tex % | shoe dE | decal aspect % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **unified all-16** | 111.2 | 11.09 | 4.04 | 12.38 | 20.6 | 12.21 | 137.1 |
| **unified upright-9** | **41.8** | **7.19** | **3.03** | **3.30** | **13.1** | **4.78** | **116.9** |
| base all-16 | 48.4 | 15.22 | 4.12 | 3.26 | 63.6 | 14.71 | 99.0 |
| base upright-8 | 9.1 | 4.02 | 1.78 | 3.26 | 20.9 | 3.52 | 61.2 |
| motion2 all-16 | 96.3 | 14.56 | 4.96 | 7.27 | 26.6 | 32.92 | 140.9 |
| motion2 upright-9 | 54.3 | 10.07 | 4.21 | 5.02 | 21.6 | 16.93 | 128.4 |

**The unified sheet beats motion2 on all seven features on both subsets — U1
PASSES its benchmark gate.** Base's upright-8 is tighter still, but that subset
is its idle plus its four near-duplicate walk redraws, i.e. the single-phase
defect masquerading as tightness; MOTION-ATLAS already records why it is not a
fair floor.

Detector notes for the next agent. All of them are anchored to a NAMED COSTUME
OBJECT rather than a height fraction, because the 2.9 round proved deathblow's
real swap is glasses *geometry*, gauntlet *plating* and decal *shape* inside an
unchanged palette. The head is found by locating the OLIVE CAP blob, so it is
still the head on a knockdown or a jump-tuck.
* **Cap colour is the strongest identity feature on this fighter.** 15 of 16
  cells sit within 2.35 dE of the sheet median `[79,77,46]`. The lone outlier is
  cell 13 (big-hit) at 10.64 dE, where the head is thrown fully back, the cap is
  seen from underneath in shadow and only a sliver is detected — that one cell
  drives the entire all-16 figure of 12.38.
* **The eyewear number cannot decide.** The unified sheet reads eyeDarkFrac
  0.38–0.68, inside the base atlas's own 0.406–0.671 — but so does the WALK
  BANK, whose opaque sunglasses are the named 2.9 defect, at 0.59–0.62. The
  detector separates nothing. At 1:1 the unified lenses are transparent with
  eyes and brows visible in every face-on cell, and that read is the decision.
  Third wave running, the same lesson: the number is a screen, the eye decides.

### U2 walk phase — FAILED, four generations, identically

| | cells 1 / 3 (contact) | cells 2 / 4 (passing) |
| --- | --- | --- |
| stride separation | 128.0 / 129.5 px (need ≥ 66.7, base mean 111.1) — PASS | 56.5 / 72.0 px |
| ground-contact runs | 2 / 2 — PASS | 1 / 1 — PASS |
| near/far leg luminance | **+21.2 vs +16.4 — SAME SIGN, no inversion** | **+28.2 vs +35.8 — SAME SIGN** |
| adjacent-key IoU | max 0.574 vs the base bank's 0.927 — PASS | |
| non-adjacent IoU | **cells 1–3: 0.842** | **cells 2–4: 0.878** |

Everything except the phase passes, and the phase is the point. The adjacent
IoU says the four drawings genuinely differ; the non-adjacent IoU gives it away
— the two contact keys are near-duplicates of each other and so are the two
passing keys. The 1:1 read agrees with the metric: in cells 1 and 3 alike the
front leg is the brighter, unbroken, drawn-on-top one.

Four generations, four identical failures. What was tried, so nobody pays for it
twice:
1. **Walk keys in grammar order** (row 0 cells 1-3, row 1 cell 4), occlusion
   language, a tonal near/far rule bound to the black sneakers, and the closing
   object sequence. Round 1: +26.6 / +22.0, no inversion. Also drew him OBESE
   rather than heavyset-muscular — the mirror image of the 2.9 round-2 failure,
   which overshot into heroic caricature. "Heavy through the ribs and belly"
   pushed too far; "heavyset POWERLIFTER'S build, chest deeper than his belly,
   bulky not fat" fixed the build in one round and held for three.
2. **An explicit shading swap stated as a test** — "in panel 2 the front sneaker
   is the LIGHT one; in panel 4 that is REVERSED" — plus reversed counter-swing.
   Round 2: +12.1 / +13.3, no inversion.
3. **The walk moved to its own contiguous filmstrip row**, the 2.10 fix, plus
   the occlusion rule restated as "the leg you can see whole and unbroken from
   hip to sneaker". Round 3: +17.4 / +18.3, no inversion, and the contact keys
   stopped planting two feet.
4. **A binary visible/hidden costume marker instead of a shading gradient** —
   each sneaker has a small red heel tab, only the near one shows it, and the
   test is "red tab in front in panel 1, red tab BEHIND in panel 3" — with the
   whole walk block promoted above the character bible. Round 4: +21.2 / +16.4,
   no inversion. The tabs are drawn; they just do not swap.

**The finding, and it is the useful one: the walk phase does not survive being
one-sixteenth of a prompt.** The 2.10 wave cleared this same gate with the same
techniques — but on a generation that was ONLY four walk keys, and it still took
two to three rounds per fighter. Here the identical language, including the
dedicated filmstrip row, loses to the other twelve panels every time. The model
converges on one canonical walking man and redraws him. Occlusion, tonal rules
and named-object sequences are necessary and are not sufficient at this prompt
density.

### U4 / U5

**U4 PASS.** Foot bottoms 313–316, spread **3px** against a 6px gate, all 16
cells, no per-cell nudges.

**U5 PASS with one marginal.** 15 of 16 cells read as their named beat at
gameplay size (deathblow renders at 330 × 1.14 × 1.068 = 402px per 320px cell,
so roughly 1:1 after canvas fit). Cells 12, 14 and 15 read unambiguously as
reactions and never as strikes — the failure class that caused a real bug this
month. The marginal is cell 13 `big-hit`, drawn far more horizontal than asked
in all four generations: it reads as a body already thrown rather than a
standing fighter arched under a knockback, so it overlaps the `thrown` read.
Cell 6 `crouch-trans` reads as a low stance more than a transition — fine for a
2-3 tick press key, marginal for a long hold.

### THE VERDICT

**One-pass whole-vocabulary authoring solves the problem it was built to solve,
and only that problem.** The cross-bank costume strobe — four waves' worth of
disabled cells, the thing that put 40 cells behind `accept: false` — collapses
to below the base bank's own pose noise the moment idle and walk are born in the
same generation. That result is unambiguous and it is the expensive half.

It does **not** buy the walk cycle. Phase is an orthogonal problem that gets
*harder* as the vocabulary grows, because the walk stops being the prompt's
subject. So the honest shape of a 3.0 rollout is **two generations per fighter,
not one**: a 12-cell unified sheet for everything except the walk, plus the 2.10
dedicated 4-key walk filmstrip, sliced into one atlas. Both halves are then
one-generation-consistent with the base atlas's *replacement*, and the walk gets
a prompt where it is the only subject — the configuration that has actually
passed W1d. The cost is that the two halves are different draughtsmen from each
other, so that seam has to be measured before it is believed; on this fighter
the pair to check is unified `idle` against walk-filmstrip `contact`.

**Recommendation for the other nine fighters: roll out, but as the two-
generation shape above, and only after one fighter has cleared that seam.** Do
not repeat this pilot's single-generation form — it spends four generations
losing the walk. And do not re-litigate the U1 thresholds: 8% / 2.5 dE is a
four-pose number, the base atlas scores 48% / 15.2 dE on its own sixteen, and
the benchmark that means something is *beat your own motion2 sheet on the
upright subset*.

---

### THE ROSTER ROLLOUT — the other nine fighters, one generation each

The pilot's recommendation (two generations per fighter, splitting off a
dedicated walk filmstrip) was **rejected before this wave started**, and the
reason is the pilot's own data: the 0.6–1.7 dE result exists *because*
everything is one generation, and splitting reintroduces a cross-generation
seam at idle→walk — the most common transition in the game. The walk here is
**single-phase**, which is **parity** with the shipping base bank (37 of its 40
walk cells share one lead foot), not a regression. Regeneration budget went to
identity and vocabulary; none of it went to chasing phase inversion.

**Result: 8 of 9 fighters shipped whole. 128 of 144 roster cells are
`accept:true`. One fighter — `cyraxx` — ships `accept:false` on all sixteen
after three generations. Fifteen fal calls total. Nothing is wired.**

| fighter | rounds | shipped | accept |
| --- | --- | --- | --- |
| `jez` | 1 | r1 | 16/16 |
| `benny` | 1 | r1 | 16/16 |
| `donald` | 1 | r1 | 16/16 |
| `ali` | 1 | r1 | 16/16 |
| `alan` | 2 | r2 | 16/16 |
| `post` | 2 | r2 | 16/16 |
| `commissioner` | 2 | r2 | 16/16 |
| `devil` | 2 | r2 | 16/16 |
| `cyraxx` | 3 | r1 | **0/16** |

#### U2 — the decisive measurement, nine more times

Same three pairs as the pilot, same code, per fighter. **A** is the null model
(base idle → base walk, one generation, pose noise only). **B** is the
cross-generation strobe (base idle → that fighter's walk bank, or motion2's
walk keys where no walk bank exists: `alan`, `commissioner`, `devil`, `donald`).
**C** is the unified sheet's own idle → walk / guard / light-hit.

| fighter | **A** null: headwear dE / torso dE | **B** CROSS-gen | **C** unified same-gen |
| --- | --- | --- | --- |
| `jez` | 1.54–2.18 / 0.48–0.90 | 4.88–5.72 / **19.83–26.32** | **1.61–2.27 / 1.25–1.65** |
| `alan` | 3.29–6.52 / 1.56–1.99 | 3.37–3.67 / 4.47–4.70 | **1.60–7.10 / 0.00–1.64** |
| `post` | 1.38–1.67 / 0.00–0.00 | 1.13–1.72 / 2.97–5.19 | **1.20–3.72 / 0.75–1.97** |
| `benny` | 1.39–1.98 / 1.53–1.80 | **11.00–11.12** / **16.86–20.52** | **0.00–2.55 / 1.15–2.74** |
| `donald` | 2.10–5.01 / 1.29–1.92 | **14.73–14.82** / 8.05–9.69 | **2.03–7.77 / 2.22–5.43** |
| `cyraxx` | 0.87–2.09 / 2.50–3.15 | 4.11–4.22 / **11.84–12.26** | **0.73–1.27 / 2.78–4.37** |
| `ali` | 0.51–0.51 / 1.29–2.24 | **13.87–14.38** / **15.79–15.94** | **0.66–2.72 / 0.84–1.61** |
| `commissioner` | 2.21–2.25 / 2.36–4.12 | 4.38–4.47 / 4.91–5.51 | **1.08–1.61\* / 0.41–2.31** |
| `devil` | 7.46–10.16 / 2.03–2.45 | **25.85–27.13** / 7.48–8.17 | 8.06–24.55† / **0.65–0.86** |

…and the limb-accessory texture feature, which is the one the 2.9 round proved
a colour-mass metric cannot see:

| fighter | A null | B CROSS-gen | C unified |
| --- | --- | --- | --- |
| `jez` (white forearm wrap) | 0.010–0.045 | 0.100–0.249 | **0.003–0.019** |
| `alan` (white fist wraps) | 0.038–0.047 | 0.090–0.094 | **0.007–0.022** |
| `post` (black gloves) | 0.138–0.249 | **0.599–0.708** | **0.014–0.053** |
| `benny` (black gloves) | 0.024–0.118 | **0.673–0.743** | **0.012–0.054** |
| `donald` (gold club head/trim) | 0.007–0.010 | 0.032–0.041 | **0.003–0.037** |
| `cyraxx` (worn trousers) | 0.002–0.002 | 0.039–0.041 | **0.001–0.043** |
| `ali` (gold chain + mic) | 0.000–0.005 | 0.061–0.075 | **0.001–0.019** |
| `commissioner` (leather coat) | 0.005–0.052 | **0.358–0.361** | **0.002–0.082** |
| `devil` (green limb wrappings) | 0.004–0.022 | 0.131–0.183 | **0.019–0.031** |

**The pilot's result reproduces on the whole roster.** `benny` is the cleanest
replication: an 11.0–11.1 dE cross-generation headwear delta — the same 11-ish
figure MOTION-ATLAS records as deathblow's shipped-disabled strobe — collapsing
to 0.0–2.55 dE inside one generation, with torso 16.9–20.5 → 1.2–2.7 and glove
texture 0.67–0.74 → 0.01–0.05. `ali` (13.9–14.4 → 0.7–2.7), `donald`
(14.7–14.8 → 2.0–7.8) and `devil` (25.9–27.1 → torso 7.5–8.2 → 0.65–0.86) are
the same story. **In all nine, C lands at or below A and far below B on the
features their detectors can actually see.** One-pass whole-vocabulary
authoring is not a deathblow-shaped result; it is the general one.

\* `commissioner`'s C-headwear reads **17.56 dE on the idle→guard pair only**,
and that is a DETECTOR artefact, not a costume swap: his head anchor is
"topmost bright-neutral blob", and in cells 7 and 8 he raises the cane so its
**polished silver knob** sits above his silver hair and steals the anchor. The
walk and light-hit pairs, where the cane is low, read 1.08 / 1.61 / 1.39.
Same lesson as the pilot's eyewear column, in a new costume: *the number is a
screen, the eye decides.*

† `devil`'s headwear anchor is his **glowing amber eye** — a 7–28px specular
highlight, not a garment. It is a fine *locator* (16/16 on the candidate after
dilation) and a useless *colour* feature: it scores 26.7 dE on the unified
sheet, 36.4 on the base atlas and 39.1 on motion2, i.e. it is noise on every
sheet including the identity reference. His same-generation claim rests on the
torso and limb-wrapping columns, where it is unambiguous.

#### U1 — benchmark against each fighter's own motion2 sheet

The pilot's re-derived gate, applied nine more times: report every feature twice
(all 16 cells, and the pose-comparable upright subset), always beside the same
subset measured on that fighter's own sheets, and **meet or beat motion2**. The
number below is the **geometric mean of the seven candidate/motion2 ratios** —
below 1.000 means the unified sheet is tighter than motion2 overall.

| fighter | all-16 geomean | features ≥ | upright geomean | features ≥ |
| --- | --- | --- | --- | --- |
| `alan` | **0.747** | 6/7 | **0.537** | 5/7 |
| `benny` | **0.869** | 4/7 | **0.523** | 7/7 |
| `jez` | **0.903** | 5/7 | **0.729** | 5/7 |
| `devil` | **0.911** | 4/7 | **0.944** | 6/7 |
| `post` | **0.934** | 4/7 | **0.797** | 6/7 |
| `ali` | **0.959** | 3/7 | **0.570** | 6/7 |
| `donald` | 1.165 | 3/7 | **0.696** | 6/7 |
| `commissioner` | 1.214 | 1/7 | **0.992** | 4/7 |
| `cyraxx` | 1.080 | 3/7 | **1.173** | 2/7 |

Eight of nine clear the gate on the upright subset; six of nine clear it on all
sixteen as well. `donald` and `commissioner` are all-16 misses with clean
upright passes, which is precisely the contamination the pilot's
`thresholdFinding` describes — and in `donald`'s case the *base atlas* scores
235.7% headW and 70.24 dE on the same detector, because his baked golden
crescent VFX hijacks the blond anchor in two of its own cells. That row is a
measurement of his base sheet's baked effects, not of its costume.

`benny` beating motion2 on **7/7 upright features** is the roster's high-water
mark and the closest reproduction of the pilot's sweep.

#### `cyraxx` — the one honest failure

Three generations, and the best of them is still **1.080 all-16 / 1.173 upright**
against his own motion2 sheet. Rounds 2 and 3 were worse (1.176/1.264 and
1.253/1.236), so the trend is not a bad roll. `accept:false` on all sixteen
cells; he keeps his existing banks.

It is worth recording *how* he fails, because it is not a costume failure:
* He **passes U2** — torso 11.8–12.3 dE cross-generation collapsing to 2.8–4.4
  same-generation, headwear 4.1–4.2 → 0.7–1.3.
* He **passes U3**, and does something no other cyraxx sheet on the project
  does: he obeys the standing rule. His base atlas *and* his walk bank both
  carry keyed purple/green energy flecks on his forearms, hem and shoes; this
  sheet measures a keyed-tint fraction of **0.0 on all sixteen cells**.
* He **passes U4** (0px) and **U5**.
* He loses on exactly two of the seven U1 features: **head-band width spread**
  (60.1% vs motion2's 31.2%) and **accessory texture spread** (22.7% vs 9.3%).
  Both are pose metrics on a man whose long hair and long beard change
  silhouette every time he turns his head, and whose "accessory" object is a
  pair of trousers. His costume *colour* features beat motion2 comfortably
  (head palette 8.29 vs 15.51 dE, head mean 4.48 vs 7.48 dE).

**For the next agent:** before regenerating him a fourth time, re-measure the
existing sheet with a hair-independent head detector. The suspicion is that
cyraxx fails a *detector* built for fighters who wear a hat.

#### Prop continuity — the beat the 2.9 wave actually shipped broken

Four fighters carry a constantly-visible prop, and the props are the reason two
of the four needed a second generation:

* **`post`'s spray can** vanished from cell 13 (big-hit) and cell 14 (stagger)
  in round 1, because both poses open the hands.
* **`commissioner`'s cane** vanished from cell 13 (big-hit) in round 1 — the
  *exact* cell class MOTION-ATLAS records as the 2.9 bug, where the cane blinked
  out of his hand on every standing reaction.

The fix that worked, both times, in one round: promote the prop to **"the most
important rule on this sheet"**, then **enumerate all sixteen panels by number**
and call out the reaction panels by name — *"and this is where it is usually
forgotten — panel 13, PANEL 14 (even with his arms flung out and back, his
fingers stay CLOSED AROUND THE CANE), PANEL 15, panel 16"*. Verified at 1:1 on
the shipped sheets: **club, cane, spray can, mic and boombox are present in
16/16 cells on all four prop fighters**, knockdown included.

`commissioner`'s round 2 scores materially worse on U1 than his round 1
(1.214/0.992 against 0.943/0.537) and was shipped anyway. That is deliberate and
it follows the pilot's own conclusion: *a unified bank must own EVERY beat it
covers*, so a hole at big-hit would have handed that beat back to another
generation and re-created the strobe the bank exists to remove. A worse number
on a complete sheet beats a better number on a sheet with a hole in it.

#### Build language, and the drift that came back

`alan` round 1 drew him **obese** — a soft round belly in front of a smaller
chest. That is the same drift the pilot hit on deathblow, and the pilot's
sentence fixed it verbatim in one round:

> a HEAVYSET POWERLIFTER'S build. His **CHEST IS DEEPER AND WIDER THAN HIS
> BELLY**. Upper arms as thick as his own head … BULKY, NOT FAT.

All-16 geomean went 0.975 → **0.747**. **Build language that pins proportions
against each other ("X is deeper than Y") beats any number of adjectives.**
Third wave running.

`devil` needed his second round for the opposite reason: round 1 scored *better*
on U1 (0.666/0.695 vs 0.911/0.944) but drew his wings **coral-red with pink
spots**, and the wings are the largest single element of his silhouette. Round 2
pins them — *"the same dull earth brown as his hide, never red, never coral,
never pink, no coloured spots"* — and matches the base atlas. **U3 outranks U1
when they disagree.** Worth recording separately: **the quadruped prowl that got
his cells rejected twice in earlier waves did not appear once**, in either
round, on any cell. `HE IS A BIPED` stated as an absolute rule, with the failure
modes enumerated (*"never on all fours, prowling, crawling, pouncing … his wings
are NEVER used as front legs"*), holds at this prompt density.

#### U4 — and a registration bug worth not paying for twice

**All nine sheets register at 0px spread.** That is not luck; the pilot's 3px
was the honest number for its slicer, and the same slicer produced **9px on
`post` and 17px on `donald`** here before it was fixed.

The cause is a **measurement disagreement, not a drawing that floats**. The
slicer finds the foot bottom on the pre-composite crop at `ALPHA_SOLID = 140`;
the U4 gate re-finds it on the finished cell at `ALPHA_T = 40`. On an upright
figure the two rules land on the same row. On a **PRONE knockdown** the body is
300px wide, so "the lowest row at 12% of max row width" is a *much* higher row
under one threshold than the other, and the cell lands 8–17px off its own floor.

`slice16.py` now runs a **second pass**: re-measure every finished cell with the
gate's own detector and nudge it onto floor row 315. Measured nudges across the
nine sheets are 0 or −1 on 129 of 144 cells (sub-pixel resampling disagreement)
and 2–16 on the prone and airborne cells. **If a future bank measures its
registration with a different alpha threshold than it registered with, it will
hit this again.**

#### Detector notes for whoever measures the next bank

Nine fighters needed nine head anchors, and the pilot's doctrine — anchor on a
NAMED COSTUME OBJECT, never on a height fraction — held every time. What it
cost:

* **A relative area floor fails.** `alan`'s hair blob is ~140px; the deep shadow
  gaps between his arm and his torso are ~470px and pass any "within 45% of the
  biggest" filter. The rule that works is an **absolute** area floor plus
  *topmost*.
* **Bound your predicates on both sides.** `post`'s auburn hair and his
  orange-red coverall are both warm; the hair separates only because the
  predicate caps `r − g` at 56 (hair ≈ 25, coverall ≈ 70).
* **Warm vs neutral separates dark from dark.** `alan`'s hair (r−g ≈ 26) and his
  brown boots (r−g ≈ 11) are the same *value*; only the hue tells them apart.
* **Tiny anchors need dilating before the component pass.** `devil`'s glowing
  eye is 7–28px and arrives as three or four fragments, none of which clears an
  area floor alone. Dilate by 2, label, then read the palette back from the
  *undilated* pixels.
* **Anything bright and neutral competes with silver hair.** `commissioner`'s
  cane knob steals his anchor in the two cells where he raises it. Foreseeable;
  not foreseen.
* **The energy-tint predicate must exclude plain garment blue.** `cyraxx`'s
  standing rule is "no energy tinting", not "no blue", and his own shirt is
  blue. The predicate that means something is violet ∪ acid-green ∪ hot-pink.

#### Verdict

**The unified bank is ready to become the primary source for these sixteen beats
on eight fighters, and it is the right shape for the ninth once its detector is
re-examined.** The thing it was built to fix is fixed, roster-wide and by
construction: idle and walk are born in the same generation, so the costume
cannot strobe between them, and the numbers say so on every fighter whose
detectors can see the costume at all. Registration is exact, every named beat
reads, no reaction reads as a strike, and every prop stays in every hand.

Two caveats for the integration agent, both inherited from the pilot and both
now roster-wide:
1. **It must own every beat it covers.** Every one of these sheets is a
   different draughtsman from its base atlas — `donald` measures 22.5 dE from
   his base idle, `jez` 11.1, `ali` 9.9. A single base cell falling through as a
   fallback re-creates the exact strobe the bank removes. Cover all sixteen
   beats from the unified sheet or cover none.
2. **The walk is single-phase.** That is parity with what ships today and it is
   `accept:true` here, but it is not an improvement, and nothing in this wave
   should be read as claiming it is.

---

### THE INTEGRATION — the unified bank wired as the primary source (3.0)

`game.js`, `engine/fighter-kits.mjs` and `renderer/three/fighters.mjs` now read
`assets/unified`. The bank rides the same lazy-sheet, manifest-gated machinery
as banks 1-3 and the walk bank, and it is registered in `AUTHORED_BANKS`, so
`resolveMotionPose`, the palette remap, `tintedSilhouette`, the crossfade ghost,
the damage compositor and the CINEMA 3D bank builder all consume it with no
bank-specific code. One rule is new, and it is the whole integration.

#### ALL SIXTEEN OR NOTHING, and who that leaves off the bank

`buildUnifiedAcceptMasks` collapses any sheet that is not 16/16 `accept: true`
to an **all-false** mask. There is no partial mode: `unifiedCellDrawable` is
either true for every one of the sixteen cells or false for all of them, so no
tick can exist in which a fighter draws his idle from this bank and his walk
from another. That is the caveat above, enforced in one function.

> **SUPERSEDED IN PART — see "Critic round (3.0) — CONNECTED REGIONS" at the
> end of this file.** Two things below are now stale: `deathblow` was re-cut to
> 16/16 and is on the bank (NINE fighters, not eight), and the routing list in
> "The sixteen beats, and where they are routed" was cut back by measurement —
> four of the sixteen are drawn, measured, accepted and deliberately NOT
> routed. The all-or-nothing rule itself is unchanged.

**Nine fighters are on the bank: `deathblow`, `jez`, `alan`, `post`, `benny`,
`donald`, `ali`, `commissioner`, `devil`.**

**One is not, and stays byte-identical to 2.9: `cyraxx` (0/16, failed U1 three
times).** The rule is not "12 of 16 is most of it" — a fighter whose idle,
guard and reactions came from the unified sheet and whose WALK came from his
base atlas is precisely the 11.4-11.9 dE glasses-to-sunglasses strobe this
programme exists to delete, aimed at the one transition the 2.9 round named.
`cyraxx` keeps his existing banks whole. When a 16/16 sheet lands for him,
dropping it in is the entire integration: no code changes.

Measured in the browser, ten fighters x nine scenes (idle, walk, light, heavy
punch, heavy kick, special, jump, crouch, guard), 490 ticks each:

| | unified ticks | base ticks | motion/2/3 + specials |
| --- | --- | --- | --- |
| the eight on the bank | **69-77%** | **4-8%** | 17-23% |
| `cyraxx`, `deathblow` | **0%** | 71-73% | 27-29% |

#### The sixteen beats, and where they are routed

idle - the four walk keys - crouch - crouch-transition (enter, leave and the
landing gather) - guard - jump-rise - jump-tuck - punch-extension -
kick-extension - light-hit (the flat recoil, the throw-clinch flinch and the
reaction snap) - big-hit (the heavy reaction opener and the launched victim) -
stagger (the reaction fold and the super-storm writhe) - knockdown.

Every routed site is a `uni(cell, <the exact 2.9 descriptor>)` wrap or a `ukey`
prepended to a key track's chain. The data-driven tracks are otherwise
untouched — `jumpArcKeys`, `airNormalKeys`, `heavyWindupKeys`,
`throwClinchKeys`, `reactionTrackKeys` and `wakeupKeys` keep their band
structure exactly; only the bank supplying those bands changed. Nothing was
interleaved with the base walk cells: the four unified walk keys cycle among
themselves on the identical `walkTime * 10` cadence.

**The idle -> walk seam, filmstripped at 1 tick on four fighters.** `donald`,
`benny`, `commissioner` and `jez`, idle -> walk -> idle: `unified:0` ->
`unified:1..4` -> `unified:0`, with **zero** cross-bank transitions on any
tick. Read at 1:1 across the seam, donald's club, the Commissioner's cane,
benny's cap/glasses/belt pouch and jez's white forearm wrap are present and
unchanged in every frame on both sides of it.

#### One 2.9 workaround retired, three measured and KEPT

* **RETIRED: M4's guard-flinch numbers, for the eight fighters on the bank.**
  That correction matches the authored block-flinch (`motion2:8`) to the
  fighter's STANDING GUARD, and for a unified fighter that drawing moved from
  `base(roles.guard)` to `unified:7`. Left alone, jez's flinch would have drawn
  255 x 1.20 = 306px against a 279px guard — M4's own defect with the sign
  flipped, the fighter GROWING 10% on a blocked hit.
  `UNIFIED_GUARD_FLINCH_ADJUST` re-derives it from the same measurement
  (content height, alpha >= 24, at 1:1): jez 1.20 -> **1.094**, donald 1.16 ->
  0.962 (**clamped to 1**), ali 1.18 -> **1.058**, post 1.16 -> **1.038**,
  benny 1.11 -> **1.040**, alan 1.09 -> 0.979 (**clamped to 1**), devil 1.08 ->
  **1.127**, commissioner 1.03 -> **1.000**. The floor of 1 and the cap of 1.22
  are unchanged. `deathblow` and `cyraxx` are not in the table and reach their
  2.9 values through the default path.
* **KEPT: `BASE_WALK_ADJUST`.** Probed in the browser across eleven scenes: the
  `devil` still reaches base cells **5, 6 and 7** — his `motion2:6` dash-brake
  is `accept: false`, so his dash tail falls through to the base walk cells the
  table corrects. It is not moot.
* **KEPT: `BASE_CELL_ROLES.crouchAdjust`.** Same probe: the `devil` still
  reaches **base:12**. A unified fighter's CROUCH BEAT no longer uses it (0
  base ticks in the crouch scene on all eight), but base:12 remains the
  fallback under the dash tail, the jump descent and the wake-up gather.
* **KEPT: the 40 cells behind the 2.9 consistency gate.** The walk bank is
  simply unused by a unified fighter — the unified keys outrank it — and it is
  still the shipping read for the two fighters off the bank, so its
  `accept: false` stays. Same for motion3 on deathblow and donald.

#### Registration and scale

* `UNIFIED_SHEET_ADJUST = { commissioner: 1.033 }`, its own table beside
  `MOTION_SHEET_ADJUST` and `WALK_SHEET_ADJUST`. The sheets share motion2's
  build rule (`targetH: 306` on all ten), so only the Commissioner's older
  full-cell base atlas needs the correction, and it is the same 316/306 he
  already takes on banks 1-3.
* **No unified cell takes a per-cell draw adjust.** One global scale per sheet,
  mutually registered by construction — the point of the bank.
* **No unified cell needs a floor offset.** Measured foot bottoms sit at
  315-319 of 320 against the base bank's 316.
* `CELL_BODY_CENTRE` gains a measured 16-cell `unified` row for all ten
  fighters, so B2's airborne body-centre anchoring covers `jump-rise`,
  `jump-tuck`, the airborne `big-hit` and the `knockdown`. Verified: the tuck
  registers lower in its cell than the rise on every sheet, so a jump cannot
  drop the body at the handoff.
* **The wake-up settle target moved with the idle.** R5 lands the standing cell
  at the height the last rung was drawn at, and the unified idle is 8-15%
  shorter than the base idle on every sheet (a settled wide fighting stance,
  not a scale defect — verified at 1:1: same head size, knees bent, feet
  apart). `WAKEUP_RISE_HEIGHT.standUnified` carries the new target; five of the
  eight were hitting the 0.86 settle floor against the base target and none of
  them does against the unified one.

#### The hold census, and the one real cost

Longest run of one identical drawing, measured in the browser at 1 tick per
step with a RAF awaited per tick, unified fighter beside the `cyraxx` control:

| beat | 3.0 (a fighter on the bank) | 2.9 control (`cyraxx`) |
| --- | --- | --- |
| walk cycle | `unified:1/2/3/4`, 6-7 ticks per key | `base:4/5/6/7`, 6 ticks per key |
| crouch enter/hold/exit | `u:6` x3, `u:5` x18, `u:6` x3 | `m2:4` x3, `base:12` x13, `m2:4` x3 |
| jump arc | `u:8` x9, `u:9` x8, `m3:2` x5, `m3:3` x6, `m:11` x10, `m:6` x8, `u:6` x7 | `m2:7` x9, `m:5` x7, `m3:2` x5, `m3:3` x6, `m:11` x10, `m:6` x8, `m2:4` x7 |
| blocked heavy | `u:7` -> `m2:8` x12 -> `u:7` | `base:11` -> `m2:8` x12 -> `base:11` |
| light reaction | `u:12` x7, `u:14` x7, `m2:10` x7, `u:14` x8 | `m2:9` x7, `base:15` x7, `m2:10` x7, `base:8` x8 |
| heavy reaction | `u:13` x7, `m3:7` x7, `u:12` x7, `u:14` x8, `u:7` x4 | `m:8` x7, `m3:7` x7, `m2:9` x7, `base:8` x8, `base:11` x4 |
| wake-up | `m:9` x2, `m2:14` x7, `m2:15` x6 | identical |
| heavy punch | `m2:0` x2, `m3:0` x2, `u:6` x2, `m:2` x2, `u:10` x5, `m:4` x7, `base:11` x3 | same shape, `m2:4` and `m:0` in place of `u:6`/`u:10` |

**Every beat's worst hold is tick-for-tick what 2.9 measured.** Routing through
one bank merged no band. The unit audit asserts this as a property rather than
a snapshot: `longestBeatHold` under the unified resolver must be `<=` the 2.9
number for all thirteen tracks, and the band COUNT must be equal.

**The one real cost, and it is unavoidable: the idle is now ONE drawing.** The
base bank gives a fighter a four-cell breathing cycle at ~12 ticks a cell; the
unified grammar has exactly one idle. Measured, the base idle cycle's
adjacent-cell silhouette IoU runs 0.26-0.98 — on most of the roster a slow sway,
on `benny` genuinely four drawings — and all of it is lost. It cannot be kept:
every base idle cell is 9.9-22.5 dE of costume from the unified walk keys, so
cycling base cells under a unified walk IS the strobe. The procedural breathing
scaleY and the idle bob still run underneath it.

One band had to be given a key rather than left empty. The light reaction's
band 1 degrades to the ladder's `snap`, which on the base sheets is a DIFFERENT
drawing from the authored light-hit above it and on this bank is the SAME one —
so it takes the unified **stagger** instead, a drawing 2.9's ladder can only
reach on two of ten sheets. The unified reaction tail is therefore three
distinct drawings (`light-hit` -> `stagger` -> `guard`) on all eight fighters,
where R4 had to DROP the third band on the eight base sheets whose `stagger` is
null or equal to `hit`.

#### Residual risk — where a unified fighter still touches another generation

Named bluntly, because none of it is fixable without more art:

1. **Kit-less normals. This is the big one.** The light/heavy startup and
   recovery cells are raw base indices (`[8,9,10,11]`, `[8,13,13,11]`) and are
   not part of the sixteen, so a unified fighter's punch runs
   `unified:0 idle -> base:8/9 -> unified:10 extension -> motion:4 -> base:11 ->
   unified:7 guard`. Measured at **24-42 ticks of base cells per 490**, entirely
   inside light/heavy normals and never in idle, walk, crouch, guard, jump or
   special. In 2.9 that whole sequence was one generation. **This wave moves the
   seam off the game's most common transition and onto its normals.** That is
   the trade, made deliberately: idle<->walk happens constantly and idle->jab is
   bracketed by a smear, a flash and an impact.
2. **The block flinch.** There is no block-flinch drawing in the unified
   grammar, so a blocked hit still cuts `unified:7 -> motion2:8 -> unified:7`.
   The HEIGHTS are reconciled (above); the generation is not.
3. **The airborne tail.** `unified:9` tuck hands to `motion3` apex/descent and
   then to `motion:11` air-recovery and `motion:6` landing gather — three
   generations in one arc, exactly as 2.9 has it, with unified now supplying
   the first two rungs instead of motion2/motion.
4. **The load window.** The gate is all-or-nothing per fighter, so the tick the
   sheet finishes decoding flips that fighter's ENTIRE core vocabulary at once.
   `preloadAuthoredBanks` requests and `.decode()`s it as soon as a matchup is
   known — and only for whole fighters, so nothing is downloaded for the two
   off the bank — but a cold cache on a slow link can still put that flip on
   screen once, before FIGHT!.
5. **Inside the sixteen: nothing.** Asserted per fighter, per beat, on both the
   ordinary and the bare-handed resolution path.

---

## Critic round (3.0) — CONNECTED REGIONS, the idle/walk height, and the reaction rewind

Two critics scored the first 3.0 cut 6/FIX (costume) and 5/FIX (regressions).
The headline promise was kept and proven — deathblow's idle->walk costume seam
measures **0.97-3.36 dE** against a same-generation floor of **3.15** and a
known-bad strobe of **7.29-7.45** — but the wave had one design flaw and one
blocker, and both were fixable by ROUTING, not by art. Nothing in
`assets/unified/` changed in this round except the deletion of one dead file.

### The metric, and the calibration everything below is quoted on

The critics' **weighted-Lab cluster metric**, reproduced verbatim (adaptive
k-means, k=6, fixed seed, over the Lab colours of a cell's opaque pixels
(alpha > 200), scored as the mean of the two weighted nearest-cluster
distances). Deathblow's calibration:

| reference | dE |
| --- | --- |
| same-generation floor (his base idle vs his base walk cell 4) | **3.15** |
| his unified idle vs his four unified walk keys | 1.97 / 3.36 / 1.69 / 0.97 |
| known-bad strobe (his base idle vs the rejected 2.9 cross-gen walk) | **7.29 - 7.45** |

### RULE 2 — the bank owns CONNECTED REGIONS, not every beat it can draw

The first cut was given ISOLATED BEATS. The measurement that settles it:
**`motion` and `motion2` are costume-compatible with each other** —
deathblow's `motion:0` against `motion2:6` is **2.62 dE**, they share the same
white-side-stripe sneaker. The motion family is ONE generation. So dropping a
unified cell into the middle of a motion chain does not remove a seam, it CUTS
a chain that was already consistent. The visible tell was the shoe: unified
draws a black low-top with a cream midsole and a red heel tab and no side
stripe, motion/motion2 draw a bold white midsole with a white jazz side stripe,
`base:11` a cream sole with a red heel patch — three designs alternating five
times inside one heavy punch.

**THE RULE, now enforced by test (U-F): the unified bank owns a beat only if it
can own that beat's WHOLE CONNECTED NEIGHBOURHOOD.** Where a beat sits inside a
chain the motion banks already own consistently, it stays there. This does not
weaken the all-or-nothing contract — that contract is per FIGHTER (a fighter is
wholly on the bank or wholly off it, so nobody gets a unified idle with a base
walk). Which BEATS the bank owns is a uniform design decision applied to every
fighter identically.

### The ownership decision, and the boundary table that made it

Every candidate assignment was scored on all nine unified fighters. Generation
crossings are counted over the whole move including its entry from and return
to the (unified) stance; "worst" is the largest dE of any crossing, quoted on
deathblow.

| route | 2.9 | first 3.0 cut | **shipping** |
| --- | --- | --- | --- |
| heavy punch | 2 crossings, 7.01 | **5 crossings, 9.51** | **2 crossings, 7.01** |
| heavy kick | 2, 7.01 | **5, 6.14** | **2, 7.01** |
| jump arc | 2, 6.35 | 2, **7.56** | **2, 5.55** |
| crouch in / out | 4, 8.61 | **0** | **0** |
| idle -> walk -> idle | 0 | **0** | **0** |
| light reaction | 4, 6.60 | 2, 7.98 | **0** |
| heavy reaction | 2, 5.98 | 2, 6.34 | **0** |
| air normal | 0 | 1, 6.17 | **0** |
| air-tech flip | 0 | 1, 7.56 | **0** |
| throw clinch | 1, 8.65 | 3, 5.25 | **1, 4.80** |
| blockstun | 2, 7.34 | 2, 5.72 | **2, 5.72** |

**The bank owns two connected regions and nothing else.**

* **GROUNDED NEUTRAL** — `0` idle, `1-4` the walk keys, `5` crouch, `6`
  crouch-transition (enter, leave and the landing gather), `7` guard. Every
  neighbour of every one of them is another one of them.
* **REACTIONS** — `12` light-hit, `13` big-hit, `14` stagger, `15` knockdown,
  and now the WHOLE ladder rather than three of its bands.

**Four cells are RETIRED FROM ROUTING** — `8` jump-rise, `9` jump-tuck, `10`
punch-extension, `11` kick-extension:

* **The extensions** sit between the motion smear and the motion follow-through.
  Routed, deathblow's heavy punch ran `motion2:0 -> motion2:6 -> unified:6 ->
  motion:2 -> unified:10 -> motion:4 -> base:11` — five crossings, and the
  follow-through boundary went **3.87 -> 6.95 dE**, into the strobe band. Two
  of the five had no smear, flash or impact over them at all (`motion2:6 ->
  unified:6` at 5.26, `motion:4 -> base:11` at 7.01). Off the route the swing is
  the 2.9 read exactly, one generation from the cock to the follow-through.
* **The jump cells** were the worst seam in the build: `unified:9 -> motion:11`
  at **7.56 dE, HELD 15+ ticks fully airborne, centre-frame, with no VFX cover**.
  The arc's descent, air-recovery and landing all come from motion, so the
  first two rungs were the odd ones out. Retired, the arc's worst crossing is
  **5.55 dE** — better than the first cut (7.56) AND better than 2.9 (6.35) —
  and both surviving crossings are single ticks at the moment the fighter
  leaves and rejoins the street, under takeoff/landing dust.

The same rule retired `unified:6` from two motion-chain uses it had been given
(the heavy-windup COMPRESS band and the throw-clinch LOAD band) while keeping
it in the crouch and landing neighbourhoods where it belongs. **The art stays
on the sheet**, inside the 16/16 accept gate, measured by the same U1
benchmark: a future wave that can own a whole airborne or attack chain has the
drawings waiting. `UNIFIED_ROUTED_CELLS` and `UNIFIED_RETIRED_CELLS` in
`engine/fighter-kits.mjs` are that decision as data, and the contract test
walks both lists.

### B1 — THE IDLE<->WALK HEIGHT POP (blocker)

`cellDrawAdjust` returned 1 for every unified cell "by design", on the
reasoning that one sheet generated in one pass at one global scale needs no
per-cell correction. The scale is global; the DRAWING is not. Every sheet
paints the idle as a settled wide fighting stance with the knees bent and the
walk keys as an upright figure mid-stride, so **inside one self-consistent
sheet the two beats differ in content height by 3.9-12.9%** — a size change in
a single tick, on the exact transition this whole bank exists to perfect. The
costume was finally stable across it and the fighter changed SIZE instead.

Measured at 1:1 (opaque pixels, alpha >= 24, floor row 315):

| fighter | unified idle | unified walk 1-4 | pop | correction applied |
| --- | --- | --- | --- | --- |
| deathblow | 272 | 298 / 306 / 300 / 305 | +9.6 .. +12.5% | 0.913 / 0.889 / 0.907 / 0.892 |
| jez | 271 | 306 / 306 / 300 / 300 | +10.7 .. +12.9% | 0.886 / 0.886 / 0.903 / 0.903 |
| alan | 274 | 306 / 306 / 303 / 305 | +10.6 .. +11.7% | 0.895 / 0.895 / 0.904 / 0.898 |
| post | 279 | 295 / 294 / 294 / 290 | +3.9 .. +5.7% | 0.946 / 0.949 / 0.949 / 0.962 |
| donald | 261 | 286 / 289 / 289 / 285 | +9.2 .. +10.7% | 0.913 / 0.903 / 0.903 / 0.916 |
| devil | 283 | 303 / 303 / 306 / 303 | +7.1 .. +8.1% | 0.934 / 0.934 / 0.925 / 0.934 |
| ali | 271 | 303 / 306 / 303 / 301 | +11.1 .. +12.9% | 0.894 / 0.886 / 0.894 / 0.900 |
| benny | 279 | 306 / 306 / 305 / 303 | +8.6 .. +9.7% | 0.912 / 0.912 / 0.915 / 0.921 |
| commissioner | 278 | 303 / 306 / 302 / 306 | +8.6 .. +10.1% | 0.917 / 0.908 / 0.921 / 0.908 |

All nine land within **0.05%** of their own idle.

**The IDLE is the anchor**, for three independent reasons: it is the sheet's U1
reference cell, it is what `WAKEUP_RISE_HEIGHT.standUnified` was measured on,
and it is what the 2.9 precedent does (`BASE_WALK_ADJUST` lands each walk cell
on the fighter's own idle height). Only cells that depict an UPRIGHT STANDING
figure were candidates, and of those only the walk keys needed anything: guard
measures -2.3..+3.0% of the idle and light-hit +0.0..+4.8%, both inside the 5%
deadband the T4 table uses. **crouch, crouch-transition, jump-tuck, stagger,
big-hit and knockdown are legitimately shorter drawings and are deliberately
untouched** — normalising those would flatten the poses, not the pop.

Unlike T4 the correction goes on ALL FOUR keys whenever ANY is outside the
deadband (post's cycle spans 3.9-5.7%): correcting only the out-of-band keys
would flatten the idle->walk step and leave a smaller pop INSIDE the cycle.

**Verified with a 1-tick A/B burst** (deathblow, cruise-deck stage for
contrast, cap-top tracked by his olive-cap colour signature, 46 ticks of
idle -> walk -> idle):

| | idle cap-top | walk-key cap-tops | worst single-tick move |
| --- | --- | --- | --- |
| before | 325-331 | 285-301 | **41 px** (t7 `unified:0` 328 -> t8 `unified:2` 287) |
| after | 325-334 | 327-335 | **4 px** — inside the idle bob's own range |

### M1 — THE LIGHT REACTION WAS A-B-A ON ALL NINE

It played the unified stagger, moved to the rubber-legs key, then RETURNED to
the same stagger drawing for 6-8 ticks:

`unified:12 -> unified:14 -> motion2:10 -> unified:14 -> unified:7`

Returning to a drawing the animation has already left is the exact rewind hitch
the 2.9 throw-recovery fix (R7) was written to eliminate, and the two `motion2`
boundaries measured 9.85 dE each on jez with nothing over them. The cause was
structural: the track's unified links and the CALLER's snap/fold/settle band
ladder in `game.js` were a band out of step.

The ladder is now ONE table, `unifiedReactionLadder`, read by both the track
and the caller, and it is explicit, monotonic and entirely inside one
generation:

```
light   12 light-hit -> 14 stagger -> 6 crouch-trans -> 7 guard -> 0 idle
heavy   13 big-hit  -> 12 light-hit -> 14 stagger    -> 7 guard -> 0 idle
```

Read at 1:1 that is a rising recovery: struck, folded over with the knees
buckled, half-risen with the guard reforming, braced, back to the stance.
`crouch-trans` earns its place in the light track — it is not a duck, it is a
compressed fighting stance with the fists already up, the missing in-between
between a folded stagger and a standing brace, and the same kind of re-use
`motion2:4` already gets as the heavy-windup coil and the landing gather. Both
tracks end on the guard, whose drawn height is within 3% of the idle on all
nine sheets, so the last transition of every reaction is height-flat. The 2.9
M5 contract survives: the openings differ (13 vs 12) and so do the middles
(12 vs 14). Non-unified fighters read byte-for-byte what 2.9 read — every 2.9
chain is preserved in order and the unified rung is stacked in FRONT of it,
where `defaultBeatKeyResolve` skips it exactly as it skips a motion3 slot.

### m1 — the Commissioner's settle band

2.9 DROPPED its third tail band for any fighter whose base sheet cannot supply
three distinct non-attack drawings (`reactionFallbackCells` returns
`settle: null` when `stagger` is null or equal to `hit`) — that is eight of the
nine, the Commissioner among them (guard 12 === hit 12, stagger null). The
first cut handed the band back unconditionally, and because a measured reaction
runs ~30 ticks against a 44-tick band grid, band 4 is only ever 2-3 ticks: he
got a **two-tick flash** of the unified brace before the idle. A 2-tick band is
a blip, not a beat.

Both ladders now hand to the breathing idle **from band 4** on every fighter.
Confirmed against a 2.9 capture: his 2.9 light reaction runs
`motion2:9 x7 -> base:12 x7 -> motion2:10 x7 -> base:12 x8 -> idle` and reaches
the idle cycle at tick 29; the shipping unified read runs
`unified:12 x7 -> 14 x7 -> 6 x7 -> 7 x8 -> unified:0` and reaches it at tick 29.
Same handoff tick, no flash, and no per-fighter branch — where the ladder ends
is a uniform decision, like which beats the bank owns. (2.9's own commissioner
reaction was itself A-B-A: `base:12 -> motion2:10 -> base:12`. That is gone too.)

### m3 — the dead sheet

`assets/unified/cyraxx.webp` shipped at 293KB while `accept: false` on all
sixteen. Not one pixel of it could ever reach the screen:
`buildUnifiedAcceptMasks` collapses a non-16/16 sheet to an all-false mask and
`unifiedCellDrawable` consults the manifest BEFORE it requests an `Image`. The
file is removed. His manifest entry, his U1 measurements and his rejection
reason are kept in full, and `format.cyraxxNote` records WHY he has no sheet so
a future wave regenerates against the recorded thresholds rather than assuming
one is missing.

### What still crosses a generation, named bluntly

| where | boundary | dE | ticks | cover |
| --- | --- | --- | --- | --- |
| entry to a heavy | `unified:0 -> motion2:0/1` | 5.97 / 6.06 | 1 | the swing's first anticipation frame |
| a normal's recovery | `motion:4 -> base:11` | 7.01 | 1 | none — **pre-existing in 2.9, unchanged** |
| return to stance | `base:11 -> unified:7` | 6.40 | 1 | none — the move ending |
| jump takeoff | `unified:0 -> motion2:7` | 5.13 | 1 | takeoff dust |
| jump landing | `motion:6 -> unified:6` | 5.55 | 1 | landing dust + squash |
| blocked hit | `unified:7 -> motion2:8 -> unified:7` | 5.72 / 5.57 | 1 each | the block flash and guard spark |
| throw release | `motion:4 -> unified:7` | 4.80 | 1 | the hurl's cinematic rotation |
| knockdown into wake-up | `unified:15 -> motion:9` | 5.65 | 1 | the impact and the landing dust |

Every surviving crossing is a **single tick**, all but one at a genuine action
boundary, and all of them at or below the same-generation floor's neighbourhood
rather than in the 7.29-7.45 strobe band — with the one exception of
`motion:4 -> base:11` at 7.01, which is 2.9's own boundary, is not created by
this bank, and cannot be closed without an extension/recovery drawing that no
generation has. **Nothing crosses a generation while the fighter is idle,
walking, crouching, guarding or reacting.**

## v3.1 — the six-key walk, and the first alternating legs in the game

The owner asked for two things, the second of them mid-wave: *"put the effort
back in to the sprites, make them all animate more and move smoother"*, then
*"not just the walking, add frame animations to all movements"*. So: more cells
per fighter, and the walk defect this file has carried since the walk bank was
authored — **37 of the 40 original walk cells share one lead foot, and the 3.0
unified keys were single-phase "by design"** — finally attacked rather than
documented.

Result: **four fighters ship live** (jez, alan, benny, the Commissioner), each
with **24 cells from ONE generation** instead of 16, and each with a **six-key
walk cycle whose two contact keys genuinely lead with opposite legs**. Cyraxx passes
every gate for the first time, but is held at `accept:false` with his art kept
out of the repo, for the integration reason given below. Five fighters failed a gate and **keep their 3.0
sheets untouched**.

### Where the cell ceiling actually is

The interesting finding is that **the ceiling is fal's output resolution, not
the model's patience.** Asked for a 6x6 = 36-panel sheet, `openai-gpt-image-2`
returned all 36 panels, coherent, on the first attempt, with the walk filmstrip
and every named beat where it was asked for. Thirty-six poses in one prompt is
not the limit.

What *is* the limit: `square_hd` (1024x1024) is the largest canvas the endpoint
returns. Measured, not assumed — `aspect_ratio: 2:3` returns **1024x768** and
`portrait_16_9` returns **608x1088**, both *fewer* pixels than square. And the
generator draws each figure to fill its cell **height** (measured: 125px of a
128px cell), so **rows set per-cell fidelity and columns are nearly free**:

| grid | cells | cell size | drawn figure | vs the 3.0 sheets |
| --- | --- | --- | --- | --- |
| 4x4 | 16 | 256x256 | ~240px | the 3.0 baseline |
| **6x4** | **24** | **170x256** | **~210-230px** | **-8% to -14%** |
| 5x5 | 25 | 205x205 | ~190px | -21% |
| 6x6 | 36 | 170x170 | ~165px | -31% |

A 3x Clarity upscale of the 36-panel sheet was tried and is visibly mushier than
what ships — the face smears, the prescription glasses stop reading as glasses,
the gauntlet plates dissolve. So the answer is **wide, not tall**. Six columns
by four rows is the largest grid that holds the fidelity bar, and a six-column
top row *is* a six-panel walk filmstrip, which is where the two extra walk keys
came from. Seven columns (28 cells) was not attempted: the figure is about 0.7
cell-widths wide, so the eighth column would start clipping the wide poses.

The honest cost: six narrow columns make the model draw a slightly shorter
figure than four wide ones, so build scale rose from 1.24-1.37 to 1.33-1.49.
That is 8% less source detail on jez and benny and 14% on the Commissioner. At
1:1 against the 3.0 sheets it is not visible. It is recorded so the next wave
knows the trade it is making.

### The walk wording that finally worked

Every previous attempt — five in the 2.10 wave, more since — asked the model to
**swap which leg is drawn on top** between the two contact keys. It either
ignored that or alternated it every panel. The fix inverts the framing:

> The NEAR leg is **one fixed physical leg**. It is drawn on top and carries the
> light in **all six panels**. The only thing that changes is **which way it
> points** — forward in panels 1-3, backward in panels 4-6 — and that swap
> happens **once**, between panel 3 and panel 4, and nowhere else. *Do not
> alternate it panel by panel.*

Then close with a panel-by-panel census of where the bright footwear is, and
*"if your panel 4 has the bright shoe in front the way panel 1 does, you have
drawn it wrong."* Don't ask for a swapping relationship; declare a constant
limb and move it.

It landed on **five of ten** fighters. The other five say something useful about
why:

- **The tonal cue needs an object that already differs between the legs.**
  Where one existed the inversion landed and is legible at 1:1: benny's **thigh
  cargo pocket** swapping thighs, the Commissioner's **red coat lining and pale
  cane tip** swapping sides, alan's faded-denim highlight, cyraxx's pale sneaker,
  ali's black outside-seam stripe. Where both legs are identical — donald's navy
  trousers, devil's matched shin wraps, post's saturated orange coveralls — it
  did not.
- **Bare symmetric legs are as hard as uniformly dark trousers, for the opposite
  reason.** This file already records the Commissioner failing in 2.9 because
  pushing the tonal split far enough put his trousers outside their own value
  range. Deathblow fails the mirror image: with both lower legs the same bare
  skin, the model binds "lit leg" to the **pose** — whichever leg catches the
  key light, always the forward one — so a fixed-limb contract has nothing to
  grip. Five generations, one compliant panel out of twelve chances.
- **The model will swap a held prop but not a leg.** Donald's generations
  applied the "swap once between panel 3 and 4" rule to his **golf club**
  correctly while drawing all six walk panels in the same stride phase.

Note also that **silhouette IoU cannot see walk phase.** A true leg exchange
keeps almost the same outline — alan's inverted contact keys score 0.823 against
each other. IoU separates "different drawing" from "duplicate"; the phase read
is occlusion and tone, and on an all-black costume like the Commissioner's the
luminance proxy is simply blind (it scores his new sheet and his 3.0 sheet
identically, and both times it is wrong). **The 1:1 read is the verdict.**

### The real failure mode of this wave was props, not the walk

Three fighters produced a sheet with a genuinely better walk and then dropped
their signature prop. Post lost the **spray can** from cells 2, 6 and 13; ali
lost the **microphone** from up to four cells; donald lost the **golf club**
from cell 6. Because `buildUnifiedAcceptMasks` collapses any sheet that is not
16/16 to an all-false mask, a single prop-less main cell voids the whole
fighter — and for post the missing cell was a **walk key**, so shipping it would
have flickered the can on every stride, which is precisely the artefact this
bank exists to remove. Hardening the prop language in a later generation
reliably cost the walk inversion or the head anchor instead. **Fixing props and
walk phase in the same single generation is the open problem for the next
wave.**

One cheap pipeline win worth keeping: devil lost two generations to **panel
dropout** (a row rendered with five figures instead of six, which aborts the
slicer). Counting figures *before* spending any judgement, and simply re-rolling
on a short count, ended it — four subsequent rolls all came back 24/24.

### What shipped

| fighter | walk alternates | contact IoU new / 3.0 | ground reg. | outcome |
| --- | --- | --- | --- | --- |
| jez | **yes** (+23.8 / -4.0) | 0.509 / 0.668 | 1px / 4px | ships, 24 cells |
| alan | **yes** (+33.1 / -7.4) | 0.823 / 0.688 | 0px / 4px | ships, 24 cells |
| benny | **yes** (+35.2 / -7.4) | 0.700 / 0.912 | 1px / 4px | ships, 24 cells |
| commissioner | **yes** (1:1; metric blind) | 0.633 / 0.832 | 5px / 4px | ships, 24 cells |
| cyraxx | **yes** (+65.6 / -53.4) | 0.720 / — | 6px | passes, held off-repo |
| deathblow | no (5 gens) | — | — | keeps 3.0 |
| post | yes, but lost the can | — | — | keeps 3.0 |
| donald | no (5 gens) | — | — | keeps 3.0 |
| ali | yes, but lost the mic | — | — | keeps 3.0 |
| devil | no (7 gens) | — | — | keeps 3.0 |

### The eight new cells, and why nothing is wired

Cells 0-15 keep the 3.0 grammar exactly and the main sheet keeps its
1280x1280 / 4x4 / 320px / 306px / floor-row-315 geometry, so the four shipped
sheets are **drop-in replacements that start drawing immediately**. The eight
new cells ride a second file, `<id>-ext.webp`, at 1280x640 / 4x2 / 320px:

```
16 idle-breathe   17 walk-down-a   18 walk-down-b   19 jump-ascent
20 jump-descend   21 punch-windup  22 kick-windup   23 mid-reaction
```

`drawAtlasFrame`'s hardcoded `cell = 320` with `frame % 4` / `floor(frame / 4)`
addresses a 4x2 sheet correctly with **no code change**, so ext frames 0-7 are
cells 16-23 and wiring them is a lookup change and nothing else. They are
authored, measured and inert: `format.cellCount` stays 16, `format.poseIds`
stays the 16-id grammar, and every fighter's `cells` array stays 16 entries,
because `tests/unified-bank.test.mjs` asserts all three and this wave is
asset-only. The new cells live in a parallel `format.extPoseIds` +
per-fighter `extSheet` / `extCells` block that nothing reads yet.

Integration order, highest value first: the **six-key walk**
`1 -> 17 -> 2 -> 3 -> 18 -> 4`; then the **jump arc** `8 -> 19 -> 9 -> 20`,
which today holds one tuck drawing across both apex and descent; then the
attack ramps `21 -> 10` and `22 -> 11`; then `12 -> 23 -> 13` in the reaction
ladder and `0 <-> 16` on the breathing idle.

### Cyraxx, and the one line that turns him on

He has been off the bank since 3.0, rejected three times because his long hair
and beard swing head-band metrics regardless of what his costume does. Measured
hair-independently this time — face and shirt, not hair outline — **zero of 24
cells change his costume**; every width outlier is a hair or beard event with
the shirt, trousers, sneakers and face intact. His shirt is within 2.3 dE of the
idle in 14 of 24 cells and 5.1 dE in 22 of 24. He beats **his own base atlas**
by 33% on head width spread and 44% on head palette max dE, his walk inverts by
the widest margin on the roster, and the energy speckle his base bank carries at
the hands and feet is gone (0.019% high-saturation interior pixels against
0.165%).

He is nonetheless `accept:false` on all 24, **and his art is deliberately not in
the repo** — for the same reason m3 deleted his last sheet. Turning him on takes
the roster from nine whole sheets to ten, which `tests/unified-bank.test.mjs`
U-B pins by name, and the same file asserts at line 782 that he has *no sheet in
the repo at all*. This wave is asset-only and may not touch tests, so committing
a 300KB sheet that cannot draw a single pixel would recreate exactly the dead
weight m3 removed. What wave 14 does instead is small and fully specified in
`format.cyraxxNote31`: ship the two files, flip 24 flags, update the roster
lists and that one assertion. Regenerating him is **not** required if the raw
generation is preserved — the note records the file, the prompt and the build
scale.

## v4.0 — WIRING THE 24 CELLS: the alternating walk on screen, and cyraxx

The 3.1 art wave drew the cells and stopped at the loader. This wave routes
them. Six of the eight ext cells are spent on the beat they were drawn for, the
seventh is refused with a reason, the walk becomes a six-key cycle **for the
first time in this game with contact keys that genuinely lead with opposite
legs**, and cyraxx comes onto the bank after three waves off it.

### The two numberings, because getting them confused is the whole trap

| | main sheet | ext sheet |
| --- | --- | --- |
| file | `<id>.webp` 1280x1280, 4x4 | `<id>-ext.webp` 1280x640, 4x2 |
| GRAMMAR cell (manifest, this doc) | 0-15 | **16-23** |
| SHEET frame (what a descriptor carries) | 0-15 | **0-7** |
| bank | `unified` | `unified-ext` |

`unifiedExtFrame` / `unifiedExtCell` convert. A descriptor must never carry a
grammar number — 23 on a two-row sheet addresses row 5 of a four-row grid. The
reaction ladder is the one place that names cells in grammar numbering across
both sheets, and `urung` / `unifiedRungPose` dispatch it to the right bank.

### The padding, and the manifest note that was half right

`format.extSheet` says a 4x2 sheet needs no code because `drawAtlasFrame`'s
`frame % 4` / `floor(frame / 4)` addresses it correctly. **That is true of the
2D canvas and false of CINEMA 3D**, whose `applyAtlasFrame` builds UVs from a
hardcoded `ATLAS_ROWS = 4` and would have sampled a quarter-height slice of
every cell — the two renderers disagreeing about what a frame *is*.

The decoded sheet is therefore padded once, lazily, into the 1280 square. That
is not a workaround, it is the convention: the walk sheets carry art on row 0
only and motion3 on 8 of 16, both at 1280x1280. **Full-height sheets with dead
rows are how every bank in this game ships, and 1280x640 was the outlier.**

### The six-key walk, and the cadence trap

Cycle `1 -> 17 -> 2 -> 3 -> 18 -> 4`, where 17 and 18 are the weight-sinking
beats between each contact and the passing that follows it.

**The cadence is the part that is easy to get wrong.** The four keys ran at
`walkTime * 10`, so a gait cycle took 0.4s. Six keys at the same 10/s would take
0.6s — the legs would cycle 33% slower than the body travels and the fighter
would **skate**, which is the exact fault the 3.5 stride clock exists to remove.
The six-key cycle therefore runs at **15 keys/s**: same 0.4s period, same ground
distance per stride, 50% more drawings. Measured in the demo at 1 tick: an ext
fighter holds each key **4 ticks** and a holdout holds each key **6**, and both
complete a stride in **24 ticks**.

Everything about the retreat is untouched. `strideClockAdvance` still signs the
phase by `vx * facing`, `walkCycleFrameExt` normalises a negative phase the same
way `walkCycleFrame` does, so a back-walk plays `4 -> 18 -> 3 -> 2 -> 17 -> 1`
and un-steps through the new in-betweens too.

### What each ext cell was spent on

| cell | beat | routed? |
| --- | --- | --- |
| 16 idle-breathe | the breathing idle, alternating with cell 0 every 8 ticks | yes |
| 17 walk-down-a | six-key walk | yes |
| 18 walk-down-b | six-key walk | yes |
| 19 jump-ascent | the jump's ascent band, with unified:8 un-retired | yes |
| **20 jump-descend** | — | **NO — see below** |
| 21 punch-windup | the kit-less heavy punch chamber | yes |
| 22 kick-windup | the kit-less heavy kick chamber | yes |
| 23 mid-reaction | band 1 of the heavy ladder, band 2 of the light | yes |

The breathing idle is the one to notice. 3.0 collapsed a unified fighter's idle
to **one drawing** on purpose — the base bank's four-cell breathing cycle is
9.5-22.5 dE of costume away from the unified walk keys, so cycling base cells
under a unified walk *is* the strobe — and recorded the cost as real. Cell 16 is
that cost paid back from inside the same generation, at 8 ticks per drawing,
which is exactly `MOTION_HOLD_BUDGET`.

### Cell 20 is a hit reaction, on all five sheets

`19 jump-ascent` came back correct. **`20 jump-descend` did not.** The prompt
asked for "torso upright, legs unfolding and REACHING DOWN, arms out for
balance". Every one of the five sheets returned a figure with its **head thrown
back, spine arched backward and arms flung open and limp** — read at 1:1 against
that fighter's own cells 12 and 13 it is their sibling. Benny's is nearly
horizontal; alan's is all but indistinguishable from his own big-hit.

This was found twice independently: the 3.1 art wave marked alan's and benny's
`accept:false` for exactly this reason and called the Commissioner's "the
weakest cell on the sheet", and the 4.0 read of all five reached the same
verdict on jez's too. Routed, **every jump would flinch on the way down** — a
worse fault than the hold it would have broken.

So the cell is **accepted and retired from routing**, the same shape 3.0 used
for cells 8-11, and for the same reason it is *not* the same shape: 3.0's four
are waiting on a routing decision and can be switched on with no new art, while
this one is waiting on a **redraw**. Wave 15's fix is one panel.

**Consequence for the jump.** With no usable descent the bank cannot own the
airborne middle, so `unified:9` (the apex tuck) stays retired with it — a tuck
handing straight to a motion cell in mid-air is precisely the 7.56 dE held-15-
ticks configuration the 3.0 critic round measured and removed. What the arc gets
instead is the **ascent as a connected sub-region**: `unified:0 idle ->
unified:8 rise -> ext:19 ascent -> motion:5 tuck`, three consecutive drawings
from one generation, with the arc's single generation crossing moved one band
later rather than added to. The measured payoff is the arc's longest hold: the
rise went from **one drawing for 10 ticks to two for 5 each**.

Because that is an ext-only array, `jumpArcKeys` takes an `extended` flag and a
fighter without an ext sheet gets the 3.0 array unchanged, retired cells and
all. That branch is not a preference — routing 8 for a fighter who has no 19
rebuilds the broken chain 3.0 removed.

### The gate counts the ROUTED cells

`buildUnifiedExtAcceptMasks` requires every **routed** ext frame accepted, plus
a whole main sheet underneath. Gating on all eight would have cost alan and
benny their entire ext sheet — walk in-betweens, chambers, breathing idle,
mid-reaction — over one cell no beat can reach, which is the 3.0 dead-weight
failure inverted. The retired frame is additionally forced **false** in the
mask, so the refusal is enforced at the gate as well as in the tracks.

### The tables the art wave could not touch

3.1 was correctly asset-only, which left four fighters wearing height
reconciliations fitted to sheets that no longer exist. Re-measured here on the
sheets actually in the repo (alpha >= 24, cell of 320) — and every one of the
five *untouched* fighters reproduces its recorded numbers exactly, which is what
confirms the measurement rather than the correction:

* `UNIFIED_CELL_ADJUST` was **undershooting** all four. Benny's contact key drew
  3.3% below his idle and the Commissioner's second contact 4.7% below — the B1
  idle<->walk pop, quietly re-opened in the other direction.
* `UNIFIED_GUARD_FLINCH_ADJUST` had drifted with the redrawn guard cell.
* `WAKEUP_RISE_HEIGHT.standUnified` and its `unified:5` rung, likewise.
* `CELL_BODY_CENTRE`'s unified rows, likewise — including the two airborne cells
  the B2 anchor depends on.

Two sheets also put the **guard** 5-6% below their own idle where 3.0 had every
guard inside the deadband uncorrected. The guard is an upright standing drawing,
which is the B1 candidate class, so it now takes the same idle-anchored
correction the walk keys do, and the contract test asserts the **drawn** height
rather than the raw one. After correction every fighter's six-key cycle and
guard land within 0.05% and 3.3% of their own idle respectively.

A useful recovered fact: `CELL_BODY_CENTRE` is the **bounding-box midpoint**,
not the mass centroid the comment calls a "content-centroid". A mass centroid
misses the recorded values by up to 29 rows; the bbox midpoint reproduces all
16 cells of three untouched fighters exactly. Measure it that way or the
airborne anchor drifts.

### cyraxx, after three waves off the bank

Sliced from the archived winning generation rather than regenerated
(`final-blow-art-archive/unified-v31/raw-cyraxx-g3.png`, prompt
`p-cyraxx-g3.txt`, 6x4, scale 1.4712 — confirmed rather than assumed: the
tallest standing blob is 208px and 208 x 1.4712 = 306.0 = `targetH`).

He passes decisively. **His walk inverts by the widest margin on the roster**,
leg luminance +64.86 in cell 1 against -52.60 in cell 3, reproducing the
archived +65.6 / -53.4 to within one unit. At 1:1 and then again on the live
canvas: the pale cream sneaker is the forward planted foot in cell 1 and the
trailing heel-up foot in cell 3, and the lighter trouser leg swaps with it.
Torso-median Lab dE against his own idle maxes at 15.05 — better than three of
the four sheets already shipping. Energy speckle 0.025% of interior pixels, the
cleanest sheet on the roster. All 24 cells on floor row 314 and on the torso-band
centre column within 1.2px. His six-key cycle measures +0.3% to +3.4% of his
idle, the tightest on the roster.

Two slicing conventions had to be recovered by measurement because the recorded
ones are wrong: **the shared floor row is 314, not the 315 the manifest names**
(315 is the exclusive bottom edge — all 96 reference cells measure 314), and
**horizontal registration is not the full-figure centroid** (sd 7.34, landing
anywhere from 142 to 188) but the centroid of the rows between **20% and 57.5%
of figure height**, a torso band, which lands on column 160 with sd 0.41 across
all 96 reference cells.

### Known defects this wave is shipping, both one-panel fixes

1. **Cell 20 is a hit reaction** on all five sheets. Retired; see above.
2. **Cell 18 does not invert.** The six-key cycle's second in-between carries
   cell 17's phase rather than cell 3's, so the cycle reads `1 pale-forward ->
   17 pale-forward -> 2 passing -> 3 pale-REAR -> 18 pale-forward -> 4 passing`
   — a one-key phase pop on the down-B beat. Measured on all five sheets (jez
   +30.29, alan +55.54, benny +49.91, cyraxx +49.43, all positive where cell 3
   is negative), so it is a generation-wide prompt failure, not a bad fighter.
   It is shipped rather than worked around because the alternatives are worse:
   dropping cell 18 gives the A half three keys and the B half two, which is a
   limp, and both down cells carry the same phase so no re-ordering fixes it.
   **The contacts — the keys that carry the read — do alternate**, which is the
   defect the owner asked about twice, and the fix here is one redrawn panel.

### What is still one drawing, and why

The census below is per beat, at the worst-case span each beat can run.

| beat | span | 3.5 worst hold | 4.0 worst hold (ext fighter) | drawings |
| --- | --- | --- | --- | --- |
| jump arc | 46 | **12** (motion2:7 x10, motion:6 x12) | **12** (rise now 5+5; the tail is unchanged) | 6 -> 7 |
| windup punch | 11 | 4 | 4 | 3 -> 3 |
| windup kick | 17 | 7 | 7 | 3 -> 3 |
| reaction heavy | 44 | 8 | 8 | 6 -> 6 |
| reaction light | 44 | 8 | 8 | 6 -> 6 |
| idle (neutral) | held | **unbounded, ONE drawing** | **8** | 1 -> 2 |
| air normal | 31 | 9 | 9 | 5 (no ext cell exists for it) |
| attack recovery | 28 | 9 | 9 | 4 (ditto) |
| throw clinch | 24 | 9 | 9 | 3 (ditto) |
| throw recovery | 34 | 9 | 9 | 4 (ditto) |
| dash | 16 | 5 | 5 | 4 |
| blockstun | 17 | 8 | 8 | 3 |
| wakeup | 16 | 6 | 6 | 4 |

The jump's remaining 12 is the **landing gather**, `motion:6` from 0.72 of the
arc to touchdown. No ext cell depicts it and splitting it with `unified:6` would
change the five holdouts, whose motion must stay byte-identical this wave. The
air normal, both throw beats and the attack recovery are over budget exactly as
they were in 3.5: the ext sheet contains no drawing for any of them, and the
honest answer to "why is this beat still one drawing for 9 ticks" is that the
art for it has not been made. Those four are the shopping list for wave 15,
alongside the two redraws.

## v4.1 — PROPS AND THE WALK IN ONE GENERATION: ali converts, and what actually carries a phase reversal

The 3.1 wave ended with a precise open problem: *"Fixing props and walk phase in the
same single generation is the open problem for the next wave."* Three fighters —
post, ali, donald — had produced a genuinely alternating walk and then dropped
their signature prop, and `buildUnifiedAcceptMasks` voids a fighter for one empty
hand. Two more — deathblow and devil — had never inverted at all across five and
seven generations.

**One fighter converted.** ali ships a 24-cell sheet from one generation whose two
contact keys genuinely lead with opposite legs and whose prop is in his fist in all
24 cells. post, deathblow, donald keep their 3.0 sheets; devil was not reached.
Eight fal calls, no regressions shipped.

### The finding: markers make legs trackable, props make them reverse

Three levers were tried. The results separate cleanly and the separation is the
useful part of this wave.

**LEVER 1 — bind the tonal/occlusion anchor to the PROP HAND, so the prop and the
walk are one instruction instead of two competing ones. THIS IS THE ONE THAT
WORKED.** The wording makes the prop hand *be* the near hand — same physical hand,
always gripping, always drawn in front, always lit — and then makes the single thing
that reverses between panels 3 and 4 **where the prop is**: swung back behind the hip
in panels 1-3, forward past the front hip in panels 4-6. The near leg is then pinned
to it by ordinary anatomy, because a man's near arm and near leg always point
opposite ways.

That is deliberately the swap this file already recorded the model performing: 3.1
noted that donald's generations *"applied the swap rule to his GOLF CLUB correctly
while drawing all six walk panels in the same stride phase."* The model will swap a
held prop. So stop asking it to swap a leg and ask it to swap the prop instead.

On ali it landed on the first attempt and the legs followed: the named leg marker
sits FORWARD in all three A-half keys (1 +0.210, 17 +0.333, 2 +0.140) and REAR in all
three B-half keys (3 −0.445, 18 −0.398, 4 −0.450). A clean 3/3 split with the swap
exactly where it was asked for. His shipped 3.0 sheet does not alternate at all
(+0.319 / +0.275, both forward, contact keys 92% identical).

**LEVER 2 — name an existing asymmetry, or introduce a minimal in-character one.
This half-worked, and the half that failed is the interesting half.** A
presence/absence marker — an object on ONE leg and absent from the other — is
*reliably drawn*. deathblow's black shin wrap, donald's single knee guard and post's
single rolled cuff were each held on exactly one leg across all six walk panels,
never duplicated, never jumping legs. The design works.

**And every one of those legs was still the FORWARD leg in all six panels.** The
marker made the two legs trackable; it did not make them exchange.

> **Tracking is not reversing.** A marker tells the model which leg is which. It does
> not give the model a reason to put the marked one behind him. Something that
> physically *swings* — a held prop — is what carries the reversal, and the leg comes
> along because arm and leg oppose.

That predicts the roster exactly: the fighters who converted this wave and last are
the ones with a swinging anchor, and the two that have never inverted in twelve
generations between them — deathblow and devil — have no prop at all. **Giving a
prop-less fighter something that swings is the next thing to try**, not another
marker.

**LEVER 3 — prop loss is repairable by same-generation compositing.** True, and it
mattered, but not in the direction expected. With the LEVER 1 prop block the props
**stopped going missing altogether** and started occasionally **duplicating** instead:
ali's cells 2 and 11 each carried a second microphone head at the hip as well as the
one in the raised fist, because the bible stages the mic both "in the near fist" and
"raised beside his jaw". That is a strictly better failure mode. Both were removed by
cloning clean thigh from elsewhere in the same cell, feathered, clipped to the
original alpha, and verified at 11x: the thigh gradient and the fabric fold lines run
straight through and there is no seam.

**Removals composite invisibly; additions do not.** An addition was attempted on gen
1's cell 13 — transplanting a fist-and-mic onto a splayed open hand — and abandoned:
the donor could not be masked cleanly out of its own cell, and the paste read as
pasted. That cell was fixed by **regenerating with better wording** instead. The
honest ordering is therefore: *repair removals, regenerate additions.*

The wording that fixed it is worth keeping. Every prop the wave lost went missing in a
pose that OPENS THE HANDS — big-hit, mid-reaction, jump-descend. Rewriting exactly
those panels so the **far** arm opens while **"HIS NEAR FIST STAYS CLENCHED SHUT"** on
the prop took ali from 15/16 to 24/24 without touching the walk block, so the
inversion survived the fix.

### Both 4.0 ext defects are fixed at the source, and cannot be back-fitted

The v4.1 pose lines fix both defects this file shipped in 4.0, on any sheet
regenerated with them. Cell 20 was rewritten to forbid the hit-reaction reading
outright — torso upright, head level, legs reaching down, *"THIS IS NOT A HIT
REACTION"* — and came back as a real feet-first descent. Cell 18 came back on the
correct half of the cycle. **ali's new sheet has neither defect** and his cell 20 is
the first routable jump-descend on the roster.

**They stay retired on jez, alan, benny, commissioner and cyraxx, and this wave
establishes why they cannot be patched.** Both are WHOLE-BODY POSE errors, not missing
objects: cell 20 measures IoU 0.47–0.77 against that fighter's own hit cells, and cell
18 measures +26.15 / +42.34 / +39.40 / +3.98 / +47.46, all positive where their own
cell 3 is negative. Same-generation compositing can transplant a **rigid prop**; it
cannot synthesise a new drawing of a whole figure, and no other cell on those sheets
contains a B-half weight-sink or a controlled descent to lift from. A single-panel
**regeneration** is worse: it is a different generation, 11–14 dE against a 0–3.4 dE
same-generation floor, so the repaired panel would strobe against its own sheet every
time it played. The fix is a whole-sheet regeneration with the v4.1 pose lines —
proven, but wave 15's job, not a patch.

### The despill bug, which cost three generations

A despill written as `max(green, channel - spill)` **clamps every channel up to
green**, destroying any colour whose blue sits below its green — which is every gold,
orange and warm skin tone on this roster. It turned post's safety orange into salmon
and ali's gold satin into pink, and three generations were rejected as "colour
regressions" that were in fact clean. It was caught by sampling the RAW png: raw torso
[125, 74, 11] against a keyed [123, 74, 74], blue lifted 63 points to meet green.

The corrected slicer reproduces the archived cyraxx sheet within **0.93–2.14 dE**
(it was validated against that sheet before any judgement was spent, which is the
only reason the bug was found at all). **Sample the raw generation before blaming the
model for a colour shift**, and validate a slicer against a known-good sheet first.

Two other measurement notes. `CELL_BODY_CENTRE` is the **bounding-box midpoint**,
`round((y0 + y1 - 1) / 2)`; this was re-confirmed by reproducing post's recorded
16-value row **exactly, 16/16**. And sheets are written **lossless** — lossy WebP at
q97 introduces a mean |dRGB| of 3.29 on this art, which would consume the entire
same-generation floor the one-generation law rests on. The cost is size: ali.webp is
937KB against the 3.0 sheet's 415KB.

### What shipped

| fighter | gens | walk alternates | contact IoU new / 3.0 | prop | outcome |
| --- | --- | --- | --- | --- | --- |
| **ali** | 2 | **yes** (+0.210 → −0.445, 3/3 split) | **0.609 / 0.922** | 24/24 after 2 repairs | **ships, 24 cells** |
| post | 2 | no (+0.502 / +0.458) | 0.602 / 0.895 | 16/16 | keeps 3.0 |
| deathblow | 1 | no (marker held, stayed forward) | 0.455 / 0.842 | n/a | keeps 3.0 |
| donald | 1 | no (marker held, stayed forward) | 0.620 / 0.808 | 24/24 | keeps 3.0 |
| devil | 0 | not attempted | — | — | keeps 3.0 |

ali's other gates: identity 4.19 dE against the shipped idle torso; ground
registration 1px spread with the torso-band centre column inside 159.3–160.8 (sd
0.38); adjacent walk IoU max 0.839 against a 0.922 bar; all 24 cells read as their
named beat. W2 is **mixed and shipped anyway** — his costume is tighter than the 3.0
sheet (18.26 / 10.47 dE against 21.26 / 13.94) and his head anchor is looser (beanie
width spread 52.8% / 25.9% against 30.7% / 16.1%), with both far tighter than the
base atlas's 123.6% / 118.3%, which is the identity reference itself.

**The leg-luminance proxy is blind on ali** — his gold satin is uniformly specular, so
it reads +20.9 / +17.6 and sees nothing where the marker metric reads +0.210 / −0.445.
This is the same blindness this file records on the Commissioner's all-black suit.
**A named physical marker is measurable where luminance is not**, and it is the metric
to use on any fighter whose costume defeats the tonal read.

One deliberate design change carries the result: ali's broad black outside-seam stripe
is now on **one** trouser leg where the 3.0 sheet had one on each. That is what makes
his two legs trackable and is the direct cause of the inversion. A single side-stripe
is ordinary tracksuit styling and reads as the same costume at gameplay size.

### ali's ext sheet was held at the loader, and was wired in 4.1 (commit 9735785)

> RESOLVED — the four steps below were performed: the pending keys were renamed,
> the ext roster went five to six, his stale tables were re-measured (CELL_BODY_CENTRE
> drift up to 35 rows at the jump-rise), and his cell 20 routed as the roster's first
> real jump-descend. The historical note is kept below for the reasoning.

### (historical) ali's ext sheet is held at the loader, and his main sheet is not

`ali-ext.webp` is on disk and its eight cells are measured and accepted, but the data
is parked under `extCellsPending` / `extSheetPending` rather than `extCells`. This is
the same hold 3.1 used on cyraxx and for the same reason: `buildUnifiedExtAcceptMasks`
keys off `extCells`, so naming it that takes the ext roster from five fighters to six,
and `tests/unified-ext.test.mjs` pins that roster **by name** in three places. This
wave is asset-only and may not touch tests. All 44 test files pass as delivered.

**His main sheet is not held.** `ali.webp` is a 16-cell drop-in on the unchanged
1280x1280 / 4x4 / 320px geometry, so his alternating walk is live on the four main
walk keys the moment it lands.

Turning the ext sheet on takes four steps and no new art, all specified in
`fighters.ali.wave14Hold` and `internal.wave14.integrationNotes`: rename the two
pending keys; add ali to the by-name roster in X-B/X-E/X-H; install the measured
`CELL_BODY_CENTRE` ext row and refit his `UNIFIED_CELL_ADJUST` (his old unified row is
stale by up to **35 rows** at cell 8, the jump-rise the airborne anchor reads); and
relax the X-E assertion that every cell-20 note matches `/RETIRED FROM ROUTING/`,
because ali's is the first one that does not need to.

## v4.2 — THE SWINGING ANCHOR REVERSES ON EVERY FIGHTER, AND THE LEGS STILL DO NOT FOLLOW

4.1 ended on a hypothesis and a prediction. The hypothesis: *"Tracking is not
reversing. A phase reversal needs a SWINGING anchor; a static marker will never
supply one."* The prediction: *"Giving a prop-less fighter something that swings
is the next thing to try."*

This wave tried it on all four remaining fighters. On the two prop-less ones the
anchor was something they already own, named as an object and swung: deathblow's
**red-and-black armoured gauntleted fist**, devil's **clawed hand**, each
described as *"ONE SOLID PROP that his arm carries around, exactly as if he were
holding a weapon."* On post and donald the anchor was the actual prop.

**The anchor reverses. On all four fighters, on demand, usually first time,
including on the two that have no prop at all — which is new, and which 4.1
predicted. The legs still do not follow it.** Twelve fal calls, nothing shipped,
no regression shipped. The full table is in `unified-v42/RESULTS.txt`.

### The numbers

Cycle order is the six walk keys 1, 17, 2 | 3, 18, 4. Positive = the thing sits on
the FORWARD (right) half of the figure, negative = the REAR half. An inversion
flips sign between the two halves.

| gen | anchor | leg marker | |
| --- | --- | --- | --- |
| deathblow g2 | −0.454 −0.488 −0.563 \| −0.047 +0.004 +0.002 | +0.430 +0.426 +0.124 \| +0.422 +0.497 +0.479 | anchor reverses, legs forward in all six |
| devil g2 | −0.277 −0.183 −0.143 \| **+0.370 +0.350 +0.343** | +0.392 +0.463 +0.425 \| +0.125 +0.233 +0.245 | textbook 3/3 anchor swap, legs never cross |
| post g1 | −0.325 −0.214 −0.292 \| **+0.857 +0.859 +0.845** | +0.725 +0.747 +0.388 \| +0.684 +0.458 +0.452 | textbook anchor swap, legs forward |
| **post g2** | −0.208 na na \| **+0.698 +0.767 +0.804** | +0.727 +0.720 +0.755 \| +0.437 **−0.616 −0.557** | **legs partially follow, one panel late** |
| donald g2 | reverses (verified by eye) | +0.416 +0.719 +0.602 \| +0.748 na +0.751 | club swaps perfectly, legs forward |

`unified-v42/viz-deathblow-g2.png` is the wave in one picture. The cyan overlay is
the shin-wrap detector. The gauntlet is down at his hip in panels 1–3 and folded
high in front of his chest in panels 4–6, exactly as instructed. The wrapped leg
is the forward leg in every panel regardless.

### post moved, and that is the one result worth building on

`unified-v42/viz-post-g2.png`: the pale rolled cuff is cleanly on exactly one leg
in all six panels, forward in panels 1–4 and **genuinely on the rear leg in panels
5 and 6.** The legs really do exchange. **They exchange one panel late** — the arm
swaps between panels 3 and 4 as instructed (cell 3's anchor is already +0.698),
the legs swap between 4 and 5.

That is a different failure from deathblow's, devil's and donald's, where the legs
never move at all, and a much smaller one. So the honest statement of the result
is not "the legs never follow" but:

> **A swinging anchor reverses reliably on every fighter. Whether the legs follow
> it is fighter-dependent, and where they do follow, they lag it by one panel.**
> Necessary, still not sufficient, but not inert either.

### Four levers, and which one to keep

**LEVER 1 — make the anchor's two states impossible to confuse. This is what
fixed the anchor.** 4.1 already recorded that post and donald were given the
held-prop block and did not convert, which means "has a prop" was never the
discriminator. Putting the three 4.1 filmstrips side by side shows what is: ali's
microphone travels from *down at his hip, half hidden behind him* to *raised in
front of his chest, silhouetted against the magenta*, while donald's club sat in
the same diagonal in all six panels and post's can moved a few centimetres. 4.1
asked for "swung back behind the hip" versus "forward past the front hip", and
**those two states look nearly identical on the page**, so the model drew one of
them six times. v4.2 replaces them with LOW-AND-BEHIND-THE-HIP versus
HIGH-AND-IN-FRONT-OF-THE-CHEST, and the anchor has reversed on every fighter
since, prop or no prop.

**LEVER 2 — stop binding the marker to prominence. This is the one that moved a
leg, and the wording to keep is `unified-v42/p-post-g2.txt`.** Every walk block
since 3.1 bound three properties to the marked leg at once: it is the MARKED leg,
it is DRAWN ON TOP, and it is THE LIT one. In a side-view stride the leg that is
naturally on top and lit **is the front leg.** So the prompt had been quietly
requesting that the marker sit on the front leg in every panel, and that is
exactly what sixteen generations delivered. It was never "the model refuses to
reverse a leg" — it was asked twice, contradictorily, and obeyed the easier half.
v4.2 hands on-top-and-lit to whichever leg happens to be in front, leaves the
marking as the only property that persists with its limb, and adds *"if you find
yourself drawing the marker on the front leg in panel 4 just because the front leg
is the prominent one, STOP — that is the mistake."* post g2 is the result.

**LEVER 3 — drop anatomy, specify raw panel geometry.** Per-panel lines reading
"IN THIS PANEL THE MARKED BOOT IS THE RIGHT-HAND ONE OF HIS TWO BOOTS" for panels
1–3 and "THE LEFT-HAND ONE" for 4–6, plus a closing *"which boot is further right
on the page"* checklist — literally the quantity the gate measures, with no
anatomical inference required. It did not help. On devil the B-half drifted from
+0.427 to +0.201 and never crossed zero; on post g5 it scrambled the phase
outright (+0.508 +0.502 −0.030 | −0.249 −0.314 +0.547) and regressed W2 and W3.

**LEVER 4 — a timing-only instruction, tried alone: "THE LEGS EXCHANGE ON THE SAME
FRAME AS THE ARM, NOT ONE FRAME LATER". It backfired.** On post g4 it desynced the
*arm* instead of advancing the legs — the prop swap itself landed late. Naming the
lag makes the model move the wrong end of the coupling. Do not use it alone.

### What this means for ali

4.1 read ali's conversion as caused by the microphone. post g2 partially
reproduces that causation and is the first independent support it has had — but
three other fighters given the same, better-specified mechanism did not convert.
The defensible position is that **the anchor raises the probability of a leg swap
rather than determining it.** ali's sheet is good and still ships; it is not a
reproducible recipe, and no future wave should budget as though it were.

### Two measurement traps, both of which cost real time here

**devil's leg-marker row is invalid and is published only for completeness.** He
wears moss-green wraps on BOTH lower legs by design; only one is *torn*. No colour
key separates them, so the detector returns the centroid of both
(`unified-v42/viz-devil-g2.png` shows it lighting up each leg). His
non-alternation rests on the picture and on adjacent IoU, not on that row.

**donald's anchor row is invalid in the opposite direction, and it briefly
produced a false negative.** `ANCHORS["donald"]` keys his WHITE SHIRT — 950–1260px,
large and centred — so it returns ≈0.0 in every panel and reads as *"the club never
moved."* That is wrong. A second attempt keyed warm gold instead and caught his
GOLDEN-BLONDE HAIR, also ~1000px and hard right in every panel, and was equally
wrong. `viz-donald-g2-row1.png` settles it by eye: the club trails down and back
with its head near the ground in panels 1–3 and is raised up and forward at head
height in panels 4–6. A textbook reversal that two different detectors denied.

The rule, which also caught 4.1's despill bug: **render the selection mask over
the cell and look at it before believing any marker number** — and on a costume
that repeats the marker's colour elsewhere, just look at the picture.

deathblow's marker is the counter-example that makes the wave conclusive: a single
black sleeve on an otherwise bare tanned leg, cleanly separable, unambiguous at a
glance. **He is the clean experiment and the conclusion rests on him.**

### Registration, and a manifest correction

The four 3.0 sheets measured here (deathblow, devil, donald, post) sit at floor
rows **315–319, a 4px spread**, against a manifest recording a flat `floorRow:
315`. That passes the 6px gate, but the recorded value is the minimum, not the
row. Horizontal registration on those sheets spans 142.5–174.4 (torso-band
centroid, sd 3.5–5.4). Every v4.2 sheet came off the slicer on row **314** with a
0–1px spread and a torso sd of 0.31–2.0. **Registration was never what is holding
these fighters back**, and the 4.1 slicer needs no further work.

The slicer was re-validated against the archived cyraxx sheet before any colour
judgement was spent — **0.41–3.56 dE across the 16 torso bands, floor row 314 on
both** — so the 4.1 despill fix is intact. `measure42.py` was validated the same
way, reproducing ali's recorded 4.1 marker row **exactly, 6/6**.

### Where the roster goes from here

**Prompt wording is exhausted.** Twenty-two generations across three waves, four
fundamentally different framings, and the failure is now precisely located: it is
not in the instruction, it is in what the generator will condition the lower body
on. It draws a walking figure from a side-view prior in which one particular leg
leads, restates the arm/leg opposition rule back at you correctly, and still does
not re-derive the legs from the arm. More words will not move it.

Three things might, none of which is a prompt. In cost order:

* **Mirror the legs inside one cell.** Generate one contact key and build the
  opposite key by horizontally mirroring the leg region only, compositing within
  the same cell. The pixels are same-generation so nothing strobes, and 4.1
  already established that same-cell compositing is invisible when it *removes*
  or *relocates* existing material. The open question is only whether a leg-only
  mirror reads cleanly at the hip. **This is the cheapest of the three and the
  only one that respects every law already established — it should be wave 16's
  first move.**
* **Generate the walk row on its own** as a 6x1 image and composite it in. Breaks
  the one-generation law across cells, so it needs the cross-generation problem
  solved first (11–14 dE against a 0–3.4 dE same-generation floor).
* **An image-to-image / edit endpoint.** The fal tool in use is prompt-only, so
  this needs a different endpoint entirely.

deathblow, devil, donald and post all keep their 3.0 sheets.

## v4.3 — THE OPPOSITE CONTACT KEY, BUILT FROM PIXELS. THREE SHIP, ZERO GENERATIONS

4.2 ended by saying prompt wording was exhausted and naming the mirror as wave
16's first move. This wave took that instruction and found that the mirror is
the *second*-best answer, and that the first is simpler, cheaper and provably
invisible.

**Three of the four remaining fighters — deathblow, post and devil — now lead
with opposite limbs on their two contact keys. No fal call was made. Not one.
donald keeps his 3.0 sheet.**

### The thing that reframes it: the two contact keys have the SAME silhouette

`fb.iou(cell1, cell3)` on the shipped 3.0 sheets is **0.842 (deathblow), 0.895
(post), 0.808 (donald), 0.668 (devil)**. In this art the two contact keys of a
stride are the *same stride shape drawn twice*. That is not a defect — it is what
a side-view contact pose is: both legs at maximum extension, heel forward, toe
back, and the pose is nearly symmetric about the hip.

Which means **the lead foot is not carried by the outline. It is carried by limb
identity — which leg is drawn on top, which is lit, which wears the marker.** So
"build the opposite contact key" does not require moving a leg anywhere. It
requires the two legs to *exchange roles in place.*

That is Method A in the brief — "exchange their roles… each keeping its own
painted shading and its own foot" — read literally, and it turns out to have a
form with no seam in it at all.

### METHOD A, as shipped: the in-place leg-region role exchange

Segment the two legs below the garment split. Repaint each with the *other*
limb's tonal statistics, taken from the same fighter's own cell 1 (the
best-exposed contact key). Each leg is split into a mask-aware blurred BASE — the
depth modelling, which is exchanged outright through a gain/offset learned from
cell 1 — and a high-pass DETAIL layer, which keeps its own structure but is
rescaled to the other limb's amplitude, so the newly-near leg crisps up and the
newly-far leg softens instead of merely changing brightness.

**Nothing moves.** Silhouettes, both feet, soles, floor contact, the ink outline
and the light direction are the source pixels. The alpha channel is
**bit-identical on all 16 cells**. Cells 0, 1, 2 and 5–15 are **byte-identical
everywhere alpha>0**, so W2 (headW spread, costume dEmax), W3 (idle torso/head
dE), W3-PROP and W4 (floor rows, torso column) are not merely passing, they are
**unchanged to the digit — 0.000 dE, identical floor rows**. There is no
regression available to make.

Restricted to a per-fighter MATERIAL mask (bare tanned skin / safety-orange twill
/ olive hide and moss wrap) so the shared black footwear and the shared outline
are never touched.

### The numbers

W1 sign convention: **+ = the NEAR (lit, drawn-on-top) limb is the FORWARD one,
− = the REAR one.** A genuine inversion flips the sign between cells 1/2 and 3/4.
This replaces v4.2's colour-keyed marker row, which was **structurally incapable
of showing an inversion on two of these three fighters** — post's rolled cuff is
on BOTH legs and devil's moss wrap is on BOTH legs, so the detector returned the
centroid of two markers. That is the same trap 4.2 documented for devil; post had
it too and it was not noticed.

| fighter | 3.0 on disk (cells 1 2 3 4) | v4.3 | contact keys |
| --- | --- | --- | --- |
| deathblow | +0.318 −0.079 +0.245 +0.003 | +0.318 −0.079 **−0.300 −0.523** | +0.318 vs **−0.300** — OPPOSITE |
| post | +0.270 +0.047 +0.286 +0.070 | +0.270 +0.047 **−0.245 −0.455** | +0.270 vs **−0.245** — OPPOSITE |
| devil | +0.212 +0.134 +0.031 +0.186 | +0.212 +0.134 **−0.394 −0.180** | +0.212 vs **−0.394** — OPPOSITE |
| donald | +0.619 +0.401 +0.482 +0.447 (gold row) | unchanged | still same-sign — KEEPS 3.0 |

The wave-13 band metric agrees: deathblow's cell-3 `legLumDelta` goes **+21.1 →
−21.3**, post's **+11.5 → −12.5**, devil's **+7.5 → −6.7**.

### METHOD B — the mirror — was built, and it is the runner-up

`comp.mirror_shear` reflects the leg block about an axis that **slides linearly
from the hip silhouette midpoint down to the midpoint of the two ankles**, so the
cut row reflects onto itself (no step at the hip) and each shin lands exactly on
the other leg's foot. Every row is still a pure reflection, so widths and painted
material are preserved; rows below the ankle are never touched.

It works, and it has one advantage the role exchange does not: **it moves
asymmetric hardware.** On donald it put the gold knee plate on the rear leg
first try. Three findings, all reusable:

* **A pure mirror points the feet backwards.** They must be handled separately —
  either left in place (the shear axis makes the shins land on them) or
  translated unmirrored. Reflecting the shoes is never acceptable.
* **The ankle x must be read from the LAST SHIN ROW, not the first shoe row.**
  A shoe collar flares immediately and its centre is not the ankle's; using it
  puts a skin wedge through the heel. That cost three iterations.
* **A kept prop must be excluded from the SOURCE as well as the destination**, or
  it reappears mirrored on the far side. donald's club head landed at x=65.
* **The hip join needs a garment edge.** Where the cut falls mid-fabric the
  tonal discontinuity is visible and needs a 6-row feather; where it falls on a
  hem (deathblow's shorts) it is free.

**But the mirror flips each limb's internal lighting, and at 11x that is
detectable.** On donald the relocated knee plate's gold rim highlight and its
teal specular end up facing left while every other specular in the cell faces
right. By the stated W6 rule — *if a composite is detectable, it fails* — that is
a fail. **Method A won on all three shipping fighters and would have won on
donald too if he had no plate.**

### Why donald keeps 3.0, and it is not close

He is the only one of the four with a genuinely **asymmetric leg detail** — a
large gold-rimmed knee plate on one knee, a smaller gold thigh strap on the
other. A tonal role exchange cannot move it, so the hard marker would fight the
soft shading cue. The mirror does move it, but **cannot be applied to cell 4 at
all**: cell 4 is a passing key with one leg lifted and largely hidden, and
reflecting it puts the lifted leg in front. Mirroring cell 3 alone would make the
plate read *front, front, REAR, front* across the stride — precisely the
mid-cycle marker flicker that wave 13 recorded as animating **worse than a
consistent non-inversion**. Rejected on that alone, before the 11x lighting
failure was even counted.

One more thing about donald for whoever picks him up: **his two trouser legs
merge into a single raster run on cells 1, 3 and 4.** Run-based leg segmentation
returns one limb. Any region method on him needs a hand mask or a real matte, not
a smarter heuristic.

### Two segmentation traps, in the v4.2 tradition of writing them down

* **devil's tail hijacks the rear-leg label.** It is thin, it is attached at the
  hip and it swings out to the left, so a run-chaining segmenter adopts it as
  limb 1 and the two real legs both become limb 2. Seed on runs ≥18px wide and
  chain on ≥12px with a gap tolerance of 5 and it resolves. His legs also only
  separate cleanly **below row 250**, so only his shanks carry the exchange.
* **Never pick near/far from brightness on a passing key.** deathblow's cell 4
  shows 1932px of front leg and **144px** of rear leg — a sliver of lifted shoe —
  and a brightness test picked the sliver as "near" and turned his planted leg
  grey. On every one of these sheets the right-hand limb is the near one in all
  four walk cells; that IS the defect being repaired, so assert it, do not infer
  it.

### Housekeeping

The slicer was re-validated against the archived cyraxx sheet before any colour
judgement was spent: **0.41–3.56 dE across the 16 torso bands, floor row 314 on
both**, reproducing v4.2's record exactly. Floor rows were measured per fighter
this wave, not read from the manifest: **315–319, a 4px spread, on all four**,
unchanged by the composite because every operation is horizontal or tonal.

A caution for anyone copying assets in this tree: **`assets/unified/*.webp` were
hardlinked to an earlier session's scratchpad snapshot**, so `cp` over them
silently rewrote the "before" backup too. Replace the file (`rm` then `cp`), do
not overwrite it in place. `final-blow-goal` was never linked and was never
touched.

Everything — the three shipped sheets, the compositor, the gates and the
before/after crops — is archived in `unified-v43/`.

## v4.4 — THE TENTH FIGHTER: MOVE THE HARDWARE, NOT THE LEG. THE ROSTER IS COMPLETE

4.3 shipped nine of ten and left donald with a precise diagnosis: he is the only
fighter whose limbs differ by **hard asymmetric hardware** rather than by
shading, so an in-place tonal role exchange leaves the marker behind, and the
mirror that *does* move the marker flips its internal lighting and cannot be
applied to a passing key at all. Its closing line was the right one: *"he needs
a hand matte, not a better heuristic."*

**donald now leads with opposite limbs on his two contact keys. Zero new
generations. Cells 0, 1, 2 and 5–15 are byte-identical to the 3.0 sheet.**

### The finding that made it tractable: the asymmetry is a DRAWING CONVENTION

donald wears a gold-rimmed knee shield on **both** knees. It is plainly there on
the idle, the punch, the kick and the guard. What the walk keys do is draw the
**near** limb's shield in full and reduce the **far** limb's to its mounting
strap and brass buckle.

So "a gold knee plate on one leg and a thigh strap on the other" is not a
costume fact — it is how this artist renders the far knee. Which changes the
whole shape of the problem. The composite does **not** have to swap two
different objects between two legs. It has to move **one** object, the shield,
and let the convention follow the limb:

| | near limb | far limb |
| --- | --- | --- |
| 3.0 cells 1 and 3 | forward leg: full shield | rear leg: band + buckle |
| v4.4 cell 3 | **rear** leg: full shield | forward leg: band + buckle |

The band and buckle are **common hardware on both legs** and are never touched:
on both knees they stay as original paint, correctly lit and correctly wrapped.
That is why the forward knee does not end up bare — it ends up wearing exactly
the marker the rear knee wore in the source.

### What actually moves, and what does not

**One object moves.** The shield is hand-matted and translated intact —
**unmirrored and unrotated** — from the forward knee to the rear knee, dimmed to
the far limb's exposure (gain 0.86). Because it is not reflected, its gold rim
highlight and its teal specular still face the light, which is precisely the
11x failure that disqualified Method B in v4.3.

**The trousers do not move at all.** Their near/far roles are exchanged in place
by the v4.3 routine, so no silhouette, no foot, no shoe, no floor contact and no
hip join is disturbed and there is no geometric seam anywhere to detect. The
knee the shield vacated is healed with trouser cloned from **within the same
cell**, and the outline the shield used to form is redrawn from a hand
polyline.

**The passing key needs nothing moved.** After the inversion the swing limb is
the shield limb, and a swing knee is drawn behind the planted leg — so the
shield is simply not visible, exactly as the strap limb's buckle is all but
invisible on the phase-A passing key. Cell 4 is therefore the shield *lifted*,
the knee healed, and the band and buckle left in place so the planted leg reads
as the strap limb. Nothing is relocated, and the v4.3 objection — that
reflecting a passing key puts the lifted leg in front — never arises.

### The mattes

Four hand-drawn polygons per key, in cell pixel coordinates, saved as
`unified-v44/donald-mattes.json` so a later wave can reopen or refine them
rather than re-derive them:

* `shield` — the gold-rimmed plate alone, WITHOUT its mounting band.
* `band` — the leather band and brass buckle, PROTECTED from the lift.
* `split` — the boundary between the two trouser legs. This is the one that had
  to be hand-drawn: donald's legs are a **single raster run** above the crotch
  notch (row 228 on cell 3, row 268 on cell 4), so run-chaining segmentation
  returns one limb, exactly as v4.3 recorded.
* `fwd_edge` / `rear_edge` / `edge` — the knee's own trouser outline where the
  shield used to stand proud of it.

The polygon is the **extent**, decided by eye off 12–18x gridded renders; a
colour predicate (`b − r < 10`, warm hardware against navy twill) resolves the
exact **edge**. Hand where judgement is needed, paint where measurement is
better.

### Four things this cost, all worth writing down

* **A HARD CUT ROW LEAVES A HORIZONTAL SEAM.** The v4.3 exchange runs below a
  single cut row. On donald that row has to sit at the crotch notch, which is
  mid-fabric, and a hard cut there put a **6.9-luminance step straight across
  the forward thigh** — measured row by row on the pixels that are navy in both
  sheets. Ramping the exchange in from row 200 (just under the jacket hem, where
  the amount is zero) to row 226 removes it: the largest row-to-row jump falls
  to 1.7, inside the fabric's own variation. devil needed a 6-row feather for
  the same reason; donald needed 26.
* **LAPLACE DIFFUSION PULLS FROM EVERY NEIGHBOUR, NOT JUST THE ONES YOU SEED
  FROM.** The first healed knee came out with a maroon bruise across it. The
  cause was not the seed — it was the transparent pixels just past the
  silhouette, whose leftover RGB is a dark purple, and the shield's dark-red rim
  antialiasing, both sitting on the hole's boundary and diffusing inward. The
  fix is a **masked** solve: renormalise by the count of *legal* (trouser)
  neighbours so nothing else can enter. Seeding correctly is not enough.
* **THE PROP MUST BE EXCLUDED FROM TONAL WORK, NOT JUST FROM GEOMETRY.** The
  club shaft crosses the trousers on both walk keys and its antialiased edge is
  navy enough to pass the trouser material test. Without an explicit prop mask
  the ramp nudged 18 and 41 shaft pixels by one luminance unit — invisible, and
  still the prop. With it, changed club pixels are **0 and 0**.
* **WEBP LOSSLESS IS NOT LOSSLESS UNDER ALPHA=0.** Pillow's encoder zeroes the
  RGB of fully transparent pixels unless `exact=True` is passed, which is why
  v4.3 could only claim byte-identity *everywhere alpha>0*. With `exact=True`
  the untouched cells are byte-identical outright.

### The detector, and the three traps it is built around

W1 is measured on the shield: the largest **warm** (b − r ≤ −12) hardware blob
inside the leg band. Two guards, both earned:

* **The brass club head is warm too.** It is excluded by requiring a blob to be
  bedded in navy twill — worn hardware scores 119–178 trouser pixels in its
  ring, the club head scores 0–3. v4.3 recorded a bogus "the club never moved"
  reading from a detector with no such guard.
* **The band and buckle are on BOTH legs**, so blob position alone cannot decide
  which limb wears the shield — the same trap 4.2 found on devil's wraps and 4.3
  found on post's cuff. Shield presence is confirmed instead by the plate's dark
  green-teal **face** area: shield blobs 61–97px, band-only blobs 0–14px.
* And the first version of this detector picked donald's **front shoe** as the
  shield, 464px of it, because black patent leather carries big neutral
  speculars and a "green-ish" test adopts them wholesale. Rendering the mask and
  looking at it is what caught it — as it has every wave.

### The numbers

W1 sign: **+ = the shield is on the FORWARD limb, − = the REAR one.**

| | cells 1 2 3 4 | contact keys |
| --- | --- | --- |
| 3.0 on disk | +0.350 +0.000 +0.332 +0.052 | +0.350 vs +0.332 — SAME |
| v4.4 | +0.350 +0.000 **−0.218** **absent** | +0.350 vs **−0.218** — OPPOSITE |

Which physical leg wears the shield, per key: **1 FORWARD, 2 FORWARD (planted),
3 REAR, 4 not visible (swing limb, knee occluded).** It is the same physical leg
throughout and it travels front → support → rear → swing → front. There is no
frame in which it appears on the other leg, so there is no mid-cycle marker
flicker — the failure wave 13 recorded as animating worse than a consistent
non-inversion.

W2 headW spread 173.98% → 173.98% and costume dEmax 12.270 → 12.270; W3 idle
torso and head dE **0.0000**; W3-PROP club pixels changed **0**; W4 floor rows
identical on all sixteen cells, max |d| **0px**, torso column max |d| **0.000**.
Fourteen cells are byte-identical. Alpha changes only where the shield used to
stand proud of the trouser outline — 187px on cell 3, 213px on cell 4.

### W6, by eye at 8–11x

PASS. There is no hip seam because nothing crosses the hip; no doubled or
missing foot because no foot was touched; no depth-order error because the
forward slot is still drawn on top and only which *limb* occupies it has
changed; no lighting contradiction because the shield was translated, never
reflected. The healed knee is marginally smoother than the fabric around it at
11x and is invisible at 1:1. Crops: `unified-v44/w6-donald-*.png`.

**Ten of ten fighters now walk with alternating legs.**

## v4.9 — IN-BETWEENS: THE THIRD SHEET, GENERATED FROM THE FIGHTER'S OWN SHEET

Every fighter now carries `assets/unified/<id>-ext2.webp` (bank `unified-ext2`,
grammar cells 24-39): a punch and kick WIND-UP and RECOVER, the heavy's deeper
pair, the crouch pair, the throw's reach and release, plus two reserved special
cells. The one-generation law said a second generation would strobe at 11-14
dE; the way round it was to stop generating from text alone. Each sheet was
produced by `openai/gpt-image-2/edit` with the fighter's unified sheet as the
image-to-image reference (`tools/inbetweens/grammar.txt`, `gen_all.py`), then
colour-matched onto that sheet with a per-cluster LAB mean shift
(`color_match.py`; offsets under 5 units). Measured against each fighter's
unified sheet: keyed raws 2.3-2.6 weighted dE (gi-blue cluster up to 5.5),
matched sheets 0.9-1.3 — the shipped ext sheets sit at 0.66, the known strobe
at 7.3+. Cell-to-cell, the in-betweens sit 1.2-2.7 dE from the unified palette
against 4.7-6.1 for the motion cells they hand to and 3.4-11.1 for the base:11
recovery cell they replace.

Slicer (`build_ext2.py`): un-premultiplied edge despill (round-trips a shipped
sheet at 0.09 RGB), bleed-over heads from the next row dropped by the
bottom-edge rule, one scale per sheet from the tallest STANDING cell to 306,
feet on row 314, torso band (20-57.5%) on column 160; a wide wind-up whose
limbs would leave the cell is fit-scaled about that column and the engine
draws it back up through `UNIFIED_EXT2_CELL_ADJUST` (1.0-1.23; commissioner's
1.033 folded in per cell, bankSheetAdjust untouched).

Routing (`inbetween` option, passed only when the fighter's ext2 sheet is
whole — every track is byte-identical without it): a LIGHT's whole startup is
the new `cock` beat on the cocked limb (crouching heavies too), and its
extension now holds through the active window instead of dropping to base 10;
the heavy windup's LOAD band opens on the deep wind-up (what deathblow and
donald, motion3 off, never had); `attackRecoveryKeys` band 0.24 is the limb's
recover cell (was base 11); the throw clinch opens on the reach and the throw
recovery's second band on the release. Verified in real play by frame
attribution: jab `ext2:0 x3 -> motion:0 -> motion:4 -> ext2:1 -> unified:7 ->
idle`, heavy `ext:5 -> ext2:4 -> motion2:4 -> motion:2 -> motion:0 -> motion:4
-> ext2:5 -> unified:7 -> idle`, in both renderers.

## v5.0 — FULL SWING: THE STRIKE AND THE REACTION ON THE FIGHTER'S OWN SHEET, AND ALI IS ONE MAN AGAIN

Two more sheets per fighter, generated the 4.9 way (image-to-image from the
fighter's own unified sheet, per-cluster LAB match, `tools/swing/`):
`<id>-ext3.webp` (bank `unified-ext3`, cells 40-55: punch and kick EXTENSION,
follow-through, horizontal smear, crouch punch extension, sweep, air punch, air
kick, chambered air cell, vertical smear, landing, kick follow, crouch guard,
heavy punch and heavy kick extension, sweep follow) and `<id>-ext4.webp`
(`unified-ext4`, cells 56-71: guard flinch, head snap, body blow, big hit,
stagger, dizzy, launched, air hit, wall splat, crumple, falling, floor bounce,
get-up A, get-up B, thrown, KO). Matched sheets sit 0.9-1.3 weighted dE from
their unified sheet. Built at the fighter's UNIFIED scale rather than
scale-from-tallest (a lunge is the tallest cell on a strike sheet and overshot
by 4-8%); a wide strike is fit-scaled about its torso column and drawn back up
through `UNIFIED_EXT3_CELL_ADJUST` (heavy kick extensions run to 1.7). The
purple impact strokes the model paints around a wall splat, floor bounce,
launch and air hit are keyed out on those four ext4 cells.

THE SUBSTITUTION LAYER, not new tracks: `swingSubstitute(bank, frame, ctx)`
(engine) maps the motion/motion2 cell a track resolved to onto its
same-generation equivalent, and `swingResolve` (game.js, after
`resolveMotionPose` in `fighterAnimationPose`) applies it when the target cell
can draw — through the bank-routed gate, since a substitute may land on the
unified crouch transition, the ext2 crouch recover or the ext descent, and a
target may carry an `alt` (the descent's chambered-air fallback for the five
sheets that never accepted their descent). Every track and hold budget of 4.9
is byte-identical; only the drawing changes. Punch/kick extension by stance and
weight, follow by limb (a crouching punch holds its crouched recover — a
standing follow would pop him upright), both smears, land, the attacker's
air chamber, the heavy compress band on the unified crouch transition, the
air attack by limb; block hit -> guard flinch, light hit -> head snap, big hit
-> big hit or launched, wall splat, crumple, dizzy, get-ups, thrown; the
victim's air recover -> falling once the knockdown is pending, launched while
carried. The air-hit cell came out INVERTED on every sheet (head down, feet in
the air — the read 4.6 took off the floor), so it is drawn and never routed;
crouch guard, stagger, body blow, floor bounce and KO wait for a later pass.
The two ext2 special cells reserved in 4.9 route through `attackAnimationPose`:
a plain special's gather for the first half of its startup and its settle for
the last 45% of its recovery, kit cell otherwise. A crouching normal's active
window, which never had a motion cell (it drew a base cell), draws the crouch
extension or the sweep directly.

The wake-up rung follows the drawing: the stretch and the settle key off the
resolved cell, so with the get-up substituted the rung is `unified-ext4:13`
and `wakeupRungHeight` measures it on that sheet (without this every swing
fighter lost the rise and reopened the seam). On the ext4 rung the settles are
deathblow 0.893 (deepest), post 0.926, devil 0.937, cyraxx 0.980, ali 0.986,
donald 0.989, the other four at their idle.

AMBIENT REACTIONS: `pulseAmbient(kind, amount)` latches from `stirCrowd` at
0.7 and above and from the KO phase change; `drawStageAmbient` reads the pulse
(0..1 over 48 ticks) into each stage's own furniture — the Vet's floodlights
swell and a burst goes up over the bowl (two on a KO), the other stages their
sign chases, gull scatter and pool-deck flash. Measured on the Vet canvas: both
floodlight regions +27 mean brightness at the KO tick, decayed by KO+170, the
plain sky flat at 74.5 throughout.

Verified by frame attribution in real play (jez): jab `ext2:0 -> ext3:0 ->
ext3:2 -> ext2:1 -> unified:7 -> idle`; heavy kick `ext:6 -> ext2:6 ->
unified:6 -> ext3:14 -> ext3:11 -> ext2:7 -> unified:7`; crouch jab `ext2:8 ->
ext3:4 -> ext2:9 -> unified:7`; sweep `ext2:10 -> ext3:5 -> ext3:15 -> ext2:11`;
air kick `ext3:8 -> ext3:7 -> motion3:4 -> ext3:8 -> ext3:10 -> unified:6`
(the motion3 jump-descent is the one cross-generation cell left on that arc).

ALI IS ONE MAN AGAIN. "The DJ turns from a white guy to a black guy and back."
The 4.1 unified sheet (and the ext, ext2 and motion generations after it) drew
a heavier, dark-skinned man — a different person from the base atlas, the
portrait and the specials (a slim, light-skinned man with a goatee and a
boombox on his back; skin L 33 against 46), so every bank change strobed him
between two people. The fix is one 24-panel (6x4) generation with the base
atlas AND the portrait as image-to-image references
(`grammar-ali-unified-v3.txt`): candidates without the boombox (g2, g4) lost
the design's prop — every in-play bank carries it — and one that flickered it
(g3) was rejected; g5 holds it in all 24 cells, alternates its contact keys,
and is the tightest cycle on the roster (walk keys +0.3% to +2.3% off the idle,
walk-down keys within 1%, no fit-scaling anywhere), colour-matched onto the
base atlas at 1.74 dE. ext2/ext3/ext4 were regenerated from that sheet with
the boombox in the prompt, at their own scales (1.26/1.36/1.44) — a 6x4 panel
draws its figure smaller than a 4x4 one, so the unified scale does not carry
(1.15/1.23/1.02 dE). The motion, motion2, motion3 and walk banks were
skin-matched toward the base atlas (L 33 -> 38-40) for the cells the
substitution does not cover. Tables re-derived: idle 299, guard 292 (flinch
1.127 against the 259px block hit), crouch 207, all four walk keys corrected
onto the idle (0.977/0.977/0.997/0.980 — the table's justification is now the
1% drawn line, not the 3% reporting line, which this sheet is the first to sit
entirely under), wake-up aimed at 299. Residuals: the passing keys' leg
exchange is unverified frame by frame; the motion-bank skin sits a little dark
of the design; a stray fragment was purged from ext3:14 after slicing.

### Engineering pass after 5.0 — the resolver, the pulse and the pipeline under test

No drawing changed. Three things 5.0 shipped with no test reaching them are
now engine modules with tests, and game.js calls them:

`engine/swing-resolve.mjs` — `swingContext(fighter)` (the seven fields the
substitution table reads plus `crouchActive`, the crouching normal's active
window) and `swingResolve(pose, ctx, drawable)` (the table, the crouch
extension / sweep override for that window, the bank-routed gate with its
`alt` fallback). `fighterAnimationPose` applies them with
`motionBankCellDrawable` as the gate; the old inline `swingResolve(fighter,
pose)` is gone. `tests/swing-resolve.test.mjs` pins the context derivation
(the attack's cancel profile answers `crouching` over the stance; `falling`
is the descent with a knockdown pending), the override switching on and off
with `attackFrame`, the alt taken only when the descent cannot draw, and a
sweep of every bank x cell x 256 contexts x 4 gates proving the resolver
never produces the inverted ext4 air-hit cell and never an ungated one. The
five frame chains above are pinned at node level: the gate is built from the
shipped manifests, the track pieces are the engine's, and the kit-less
strike branch of `fighterPoseDescriptor` is mirrored in the test (with its
source lines pinned, until #52 makes it an import). All five chains — jab,
heavy kick, crouch jab, sweep, air kick — reproduce the real-play attribution
exactly, and with the swing sheets gated off the jab and the air kick are
the 4.9 read while the heavy kick keeps its compress-band substitute (the
UNIFIED crouch transition) and the crouch jab its crouched recover (ext2)
in place of the standing follow — both land on non-swing sheets, which is
the case the bank-routed gate exists for.

The QA surface gained `poseTrace(count, side)` / `poseTraceReset()`: a
64-entry per-side ring of pose TRANSITIONS (tick, bank, frame), written at
the resolution choke point and deduped, so a browser probe can assert the
order a strike's drawings arrived in instead of reading it off by eye. Only
the live fighter on each side is traced.

`engine/ambient.mjs` — the ambient-pulse state machine (`stirPulseKind`,
`pulseAmbientLatch`, `ambientPhaseChange`, `ambientPulseLevel`; the 0.7 /
1.0 thresholds, the 1.4 KO latch, the 48-tick linear decay, reduced motion
zeroing the level but not the age). `__finalBlowQa.ambient()` reports the
latch and its level. See STAGES.md.

`tools/inbetweens` is folded into `tools/swing` (one `color_match` /
`measure_de` / `fal_edit` / `gen_all`; the 4.9 grammar is
`grammar-ext2.txt`, `build_ext2.py` was `build_sheet.py --bank ext2`); every
script derives the checkout from its own location (`repo_root.py`,
`FINAL_BLOW_ROOT` overrides) instead of one hard-coded path, and
`tools/README.md` documents the numpy venv and the exact commands.
## v5.1 — THE KO MOMENT: THE CROWD STAYS UP FOR THE HOLD, AND IT HAS A VOICE

Sweep items #14 and #24. Measured with the real `createCrowd` over 20 seeds
before this: a heavy-hit KO (stir 0.34 against painted thresholds of 0.3-0.8,
decaying 0.016/tick) put 6-10% of the crowd on the cheer cell for 2.5 ticks,
then the 4.9 s roundover hold played to a crowd already back on its routes;
a non-super KO never popped a flashbulb (reaction > 0.7) and never made a
sound but the synth swell.

THE HOLD (render-side, `updateCrowdKoHoldLatch` in game.js, curve in
`engine/crowd-voice.mjs`). Latched on the roundover phase edge the way
`roundWinBeatStartTick` is — a fatality round latches on the kill itself,
observed through `finisher.slowMotionHits`, so the crowd stays hushed under
the pre-kill cinematic. While latched, `crowdDrawReaction()` (max of the sim
value and the hold curve) is what the crowd draw, `crowdBillboards()` for
CINEMA 3D, the scuffles, the tailgate cups and the crowd bed read. The curve
opens at 0.3 (the lowest painted threshold: nobody up on tick 0) and climbs to
0.95 over 20 ticks, so a person with threshold t throws their arms up at tick
(t - 0.3) / 0.5 * 20 — the crowd goes up person by person over a third of a
second, everyone by tick 20, and stays up for the full 294 ticks. Past their
threshold each person pumps between the cheer and weight-shift cells for half
their own shift window (`crowdKoHoldColumn`) and bounces 3 px on the spot, so
measured over 20 seeds on every painted stage (32-44 people) 88% of the crowd
is arms-up on an average tick (66-100% on any one) against 6-10% for 2.5 ticks
before; the scuffles drop their quarrel for the
celebrate choreography; the phones come out at three per 8-tick window (7.5/s
against the fight's 3/s cap), lit 5 of 8. Reduced motion keeps the old cells
and the single dim steady flash. The sim's `state.crowdReaction` is untouched
(the smoke's "settles to 0" pin still holds); `finishRound` adds a
`stirCrowd(1.4, "ko")` — the FINISH prompt's amount, sim path, deterministic
on both rollback peers — so the KO is the round's biggest stir.

THE VOICE (`assets/audio/crowd/`, twelve takes). Generated with the ElevenLabs
sound-effects tool — gasp x3 (1.5-1.8 s), ooh x3 (2.0-2.2 s), roar x3
(3.5 s), sustained cheer x3 (4.0 s) — and normalised with ffmpeg: static gain
to -14 LUFS (the shipped hits sit at -11, the announcer at -13.4), limiter at
-1 dBTP, 0.32 s tail fade, mono 44.1 kHz 96 kbps, 18-49 KB each; every
measurement is in the directory's MANIFEST.json and pinned by
`tests/crowd-ko-moment.test.mjs`. New generated media on the
`elementAudioAssets` pattern — the 45 reviewed takes and the four music tracks
are untouched, and the takes do NOT join `sfxPools` (its round-robin cursor
can land the same take twice across pool borders). `playCrowdVoice(cue,
amount)` draws from a per-cue shuffle bag with a no-repeat border (the
announcer contract, rng-injected so node proves it), at the cue volume x
`crowdVoiceLevel(amount)` (0.4-1: a special's gasp 0.61, a super's ooh 0.79,
the KO roar 0.93) x the SFX slider, behind a per-cue minimum gap and a shared
busy window so a gasp never lands on a roar still sounding (roar and cheer may
layer). Routing: every swell the sim latches now also picks a take by amount —
>= 1.2 roar (FINISH, KO, fatal blow), 0.7-1.2 ooh (wall bounce, super),
0.5-0.7 gasp (special, throw, weapon) — over the synth swell, which stays
underneath and gains a KO-only recipe (0.25 s attack, ~2 s, a second wave at
0.9 s) so the round-winning hit never reuses the mid-round whoop; the
sustained cheer follows the roar 36 ticks into the hold, once; a taunt (0.25,
under the swell latch) answers with an ooh at taunt level. Captions read
CROWD GASPS / CROWD: OOOH / CROWD ROARS / CROWD CHEERS. Debug:
`snapshot().violence.crowdVoicePlays`, `crowdVoiceRecent` (the last twelve as
cue-take, for the never-repeat assertion), `crowdVoiceLast`, `crowdKoHold`,
`crowdKoHoldAge`, `crowdDrawReaction`. sw.js is unchanged on purpose: the
shell test pins that runtime media stays out of the install cache, and the
bank warms with the painted sheets in `ensureCrowdMedia()`.

Not done here: a boo/laugh bank for the taunt (it borrows the ooh), the
per-stage KO ambient beats for the four stages without one (item #15), and
the 3D stages' own reaction to the hold (the billboards carry it; the stage
furniture in `renderer/three` does not — item #43).
## v5.1 — EXT4 ROUTING: THE REACTION SHEET REACHES THE SCREEN, AND THE GUARD FLINCH STOPS GROWING

Routing only, no art. Two findings from the post-5.0 sweep, both against the
ext4 reaction sheet 5.0 shipped.

THE GUARD FLINCH RE-OPENED M4. `blockstunKeys` band 0 resolves motion2:8 and
the substitution draws ext4:0, but `guardFlinchAdjust` only ever reconciled
motion2:8 (and floors at 1, so it could not have shrunk a cell). Measured on
screen (UNIFIED_EXT4_CELL_HEIGHT x its ADJUST against the unified guard, the
commissioner's 1.033 on both sides): benny +13.1%, cyraxx +11.4%, alan +9.1%,
ali +3.8%, jez +3.7%, commissioner +1.5%, deathblow -5.7%, donald -4.3% — a
blocked hit made three of the most-played fighters GROW for the impact ticks,
in both renderers. The ext4 flinch is an upright figure against the settled
knees-bent guard: the walk-key gap, with the walk-key cure.

`swingStandInAdjust` (engine/fighter-kits.mjs, third factor of
`cellDrawAdjust`, so CINEMA 3D reads the same number) lands every routed
stand-in on the height of the unified rung it replaces, per body PLAN:
match in both directions when the plans agree — ext4:0 guard flinch onto
unified:7, ext4:1 head snap onto unified:12 (measured +9.4 jez, +13.7 benny,
+15.9 cyraxx, +15.6 commissioner, +9.0 alan), ext3:12 crouch guard onto
unified:5 (-8.1 alan .. +12.8 commissioner); CEILING only (never taller
than the idle, never enlarged) for the body blow, big hit and reel, whose
depth differs per drawing and which the 3.0 reasoning leaves alone rather
than flatten. 3% deadband, clamp 0.80..1.22. Resulting factors: guard flinch
benny 0.884, cyraxx 0.945, alan 0.917, jez 0.964, ali 0.964, deathblow 1.061,
donald 1.045; head snap jez 0.914, alan 0.918, benny 0.891, cyraxx 0.917,
commissioner 0.894, ali 0.948, post 1.043, devil 1.061; crouch guard
deathblow 0.952, jez 1.063, alan 1.088, post 0.932, benny 0.924, cyraxx
0.958, commissioner 0.916, devil 0.888; ceilings on cyraxx's big hit (+8.7% of
idle) and reel (+7.7%), the commissioner's big hit (+8.2%), benny's and
alan's big hit. Contract test: every stand-in within 3% of its rung or at or
under the idle, on all ten sheets; the get-up rung the wake-up seam is
measured on, the crumple and the thrown cell take exactly 1.

HALF THE SHEET NEVER DREW. 5.0 keyed the head snap on motion2:9 and the big
hit on motion:8, but every chain carrying those links leads with a UNIFIED
rung (`reactionTrackKeys` stacks `urung(ladder[band])` in front of the 2.9
chain; the airborne victim and the clinch read `uni(...)` first) and all ten
fighters are whole on the unified bank, so the resolved pose was always
unified:12/13/14 and the substitution never fired. Traced with every sheet
whole: light `unified:12 -> unified:14 -> ext:7 -> unified:7 -> idle`, heavy
`unified:13 -> ext:7 -> unified:14 -> unified:7 -> idle`. `swingSubstitute`
keys on the resolved UNIFIED reaction cells now (same generation — ext4 is
generated from that sheet — so RULE 2's connected-region objection does not
apply; idle, walk, guard and crouch are never substituted):

    unified:12 light hit   -> ext4:2 body blow when the last contact was
                              LOW or the victim is crouching (MID is the
                              level nearly every normal carries — a jab is
                              a face hit — so it snaps the head), else
                              ext4:1 head snap
    unified:13 big hit     -> ext4:6 launched while carried, else ext4:3
    unified:14 stagger     -> ext4:4 (a backward reel)
    unified:15 knockdown   -> ext4:15 KO, only once the round is decided
                              against the fighter (finish/roundover/result
                              and health <= 0); a plain knockdown keeps
                              unified:15 so the wake-up chain is untouched
    motion2:10 dizzy       -> ext4:4 reel for the first 12 ticks of a dizzy
                              or guard crush, then ext4:5 sway
    motion2:8  block hit   -> ext3:12 crouch guard when crouching

The level read is a new presentation field `fighter.lastHitLevel` (melee,
projectile and paint-trap contacts set it; snapshotted beside
`lastHitResult`, out of the checksum) because `lastHitResult` drops the level
on a counter hit.

CROUCH BLOCKSTUN HAD NO FLINCH. The standing track is gated on `!crouch`
(motion2:8 is a standing cover) and the crouch stance held unified:5 through
the window — worse, the contact-flash read below it drew the STANDING light
hit for the flash ticks, so a crouched block popped the fighter upright.
`crouchBlockstunKeys` (same band grid as the standing track: the flinch owns
the impact to BLOCK_EXIT_AT, empty recovery bands hand to the crouch read)
draws ext3:12 over unified:5, and the R6 flinch-exit bridge rides the crouch
too. Byte-identical for a fighter without the cell.

Traced chains (jez, every sheet whole, hold ticks): light
`ext4:1 x7 -> ext4:4 x7 -> ext:7 x7 -> unified:7 x8 -> idle`; light LOW
`ext4:2 x7 -> ext4:4 x7 -> ext:7 x7 -> unified:7 x8 -> idle`; heavy
`ext4:3 x7 -> ext:7 x7 -> ext4:4 x7 -> unified:7 x8 -> idle`; heavy airborne
opener `ext4:6`; standing block `ext4:0 x8 -> unified:7 x9`; crouched block
`ext3:12 x8 -> unified:5 x9`; dizzy `ext4:4 x12 -> ext4:5 x116`; KO
`ext4:9 (crumple) -> ext4:15`; wake-up unchanged `ext4:9 x3 -> ext4:12 x7 ->
ext4:13 x6`. No track or hold budget changed; the drawings did.

STILL UNROUTED, BY DECISION: ext4:7 air hit (inverted, as 5.0 recorded) and
ext4:11 FLOOR BOUNCE — inspected at 1:1 on all ten sheets, it is a body on
its shoulders with the legs in the air (the read 4.6 took off the floor and
the owner's rule), and there is no ground-bounce sim state for it to mean
anything. Both stay drawn, gated and pinned unreachable. The KO cell lies
flat with the head on the same side as unified:15 on every sheet, so
`downTiltFor` measures it at 0 and the down-tilt rule holds.

## v5.1 — CINEMA 3D DRAWS THE SAME FIGHTER: POST'S MIRROR, THE PRONE SETTLE, THE TREMBLE AND THE HUNCH

Three animation reads the 2D path owned never crossed the bridge into the
3D fighter layer (renderer/three/fighters.mjs). They do now, through
`renderer/three/sprite-pose.mjs` — a dependency-free module Node pins
against drawFighter in `tests/cinema-fighters.test.mjs`, which registers a
stub `three` and DRIVES poseRig with a mock host.

THE MIRROR. drawFighter draws with `facing * atlasFrameFacing(id, bank,
frame)` (1.9E: Post's base bank is left-authored on 13/16 cells, his
specials on 12/16). poseRig used the facing alone, so in 3D Post read
backward on every one of those cells and looked away from his opponent
through every special — the exact bug Jez reported on the 2D path, still
live in the renderer he showcases. `spriteMirror()` is now the sign of the
quad's x scale, of the shader's screen-space edge orientation
(`uFbFacing`, which the rims and fills key on) and of everything drawFighter
applies AFTER `ctx.scale(renderMirror, 1)`: the lunge, the attack tilt, the
new hunch. Everything it applies before (down tilt, air-tech flip, the
tremble) keeps the sim facing. Pinned on all 64 Post cell x facing
combinations: `sign(mesh.scale.x) === facing * atlasFrameFacing`.

THE PRONE SETTLE. The 2D down pose is `rotate(-facing*tilt);
translate(-facing*45*share, 17*share)` — and that translate is in the
ROTATED frame. Resolved to world axes at full tilt it is +6.7 px toward
the facing and 47.6 px DOWN THE SCREEN, which on the 2D perspective floor
reads as "lying nearer the camera". The 3D layer had been applying the raw
x term as a 45 px world slide BACKWARD and ignoring the rest, and because
the quad pivots at the feet, a tilted body's back half sat under the
boards while an authored-flat KO cell floated by its bottom padding (the
"feet in the air" read Flat Out exists to kill). `proneTransform()` now
resolves the nudge (only the world-x part is applied — a vertical
billboard cannot lie "nearer the camera", and 47 px of -y would bury it),
and `proneSettleLift()` rotates the cell's measured silhouette box (foot
metrics now record `extent` per cell) and rests its lowest corner 2 px
under the ground plane: a tilted cell LIFTS by about half the body width,
a flat cell DROPS its padding. Grounded only; a body still in the air keeps
its sim height. The 2D drawing did not change.

THE TREMBLE AND THE HUNCH. MOTION FIX 4's 1-2 px hitstun shiver (hashed
from `simulationTick*2 + side*17` through presentationHash01, the copy in
sprite-pose pinned verbatim against game.js) and the 0.085 rad exhaustion
lean under 25% health now run in 3D with the 2D gates (reduced motion off,
cinematic frames off, super storms on). The tremble moves the body and the
mirror but not the contact shadows, as in 2D.
## v5.1 — STAGE KO BEATS: THE OTHER FOUR STAGES ANSWER THE KO

Stage art, not fighter art, so the detail lives in STAGES.md ("5.1 — stage
KO beats"). The short version: the 5.0 AMBIENT REACTIONS paragraph above
claimed "sign chases, gull scatter and pool-deck flash" for the stages
below the Vet; only the Vet actually reached the owner's visible bar (the
pool-deck flash did not exist). The buffet, the cruise deck, Somerset and
Wildwood now draw big hits and the KO from one shared surge read (the 5.0
pulse plus the 5.1 crowd KO hold, `engine/ambient.mjs`), each with its own
furniture — wok fireball, pass-through flood and steam eruption; pool and
deck flash, horn, funnel jet, cannonball and gulls; station-lamp surge, sign
flare, the KO train and a street flash; rim chase, sign flood, held chase
bulbs and pier fireworks — measured on the canvas at the KO tick at +32 to
+130 mean brightness on the landmark rectangles (numbers in STAGES.md),
decayed by KO+170, sky flat. Reduced motion zeroes all of it; the horn
still sounds.
## v5.1 — THE FIRST FIGHT ON A PHONE: SHEETS BEFORE FIGHT!, AND HALF THE BYTES WHERE THE GATE ALLOWS

Three findings from the 5.1 sweep (#35, #36, #38), one story: the first
fight of a session on a phone raced its own art. `preloadAuthoredBanks` had
one call site, inside `makeFighter`, so 8–14 MB of sheets started
downloading against a 2.25 s intro; the motion banks were requested FIRST
(synchronously) while the unified family waited a manifest round trip, and
the browser then scheduled the stage plate and the crowd ahead of it; nothing
held the intro. Over cellular the fight opened on base cells and popped bank
by bank for 5–30 s — the cross-generation strobe the one-generation law took
out of the art, delivered by the network. Jez plays on a phone.

### Sheets at select, the unified family first, and a capped hold

- **The select screens warm the matchup.** `updateRosterUI` preloads the
  highlighted seats after a 400 ms dwell (a decoded family is 30–35 MB of
  RGBA per fighter, so a browse across the roster must not decode ten of
  them); a lock and the stage screen warm at once, the stage screen warms
  voice too (`warmFighterAudio` by id, off the audio manifest). Block War
  warms every picked teammate; the arcade FINAL BOUT substitutes the boss.
  The select and stage screens are 5–15 s of cover the first fight used to
  waste.
- **Request order is the point.** Every authored sheet is now built by
  `authoredSheetImage(bank, url)`, which sets `img.fetchPriority` BEFORE
  `src` — `high` on the main, ext and ext2 sheets (the idle/walk, the six-key
  walk, the first jab), `low` on motion3 and walk. The whole preload runs
  behind the unified manifest (fetched at boot, so this is a microtask by the
  time anyone picks), the family first, the two motion banks next, the bonus
  banks last and only when their manifest says the fighter has a sheet
  (motion3 was requested unconditionally before — a 0/8 fighter's sheet
  went out for nothing). Order and priorities live in
  `engine/art-readiness.mjs` (`PRELOAD_PLAN`), pinned by
  `tests/art-readiness.test.mjs`.
- **The intro holds, capped.** `startMatch` arms `armIntroArtHold` for the
  two fighters; while any sheet of either unified family is still decoding
  (`fighterArtReadiness` — the same predicate the drawable gates use, so a
  decoded-but-unpadded ext is still pending, exactly the state that would
  draw the four-key walk), `loop()` hands the fixed-step clock ZERO seconds
  under a LOADING FIGHTERS curtain, for at most `INTRO_ART_HOLD_MS` = 1500.
  Then the fallback chain takes over as before. The hold never touches the
  sim — no tick runs, the accumulator does not build — so the tick stream a
  replay records is identical with or without it; it never runs online
  (rollback owns both clocks), never in the attract demo, never for a
  replay. The FIGHT! call is a wall-clock timer armed at the top of the
  intro, so a release re-arms it shifted by the held time
  (`shiftedAnnouncementDelay`); a timer that fires mid-hold defers to the
  release. A failed sheet counts as settled (a 404 must not hold every intro
  to the cap). Readiness and the hold's counters are on
  `snapshot().artReadiness` and `qa.artReadiness(ids)`; `qa.artHold(false)`
  opts a timing-sensitive probe out.

Measured in the browser against a server that delays every unified sheet
2.5 s: alan vs post from a cold select goes `LOADING FIGHTERS 0 / 9 SHEETS`,
the hold releases `ready` the frame the last sheet pads, FIGHT! follows
1.15 s later; the same pair again is `skipped` (reason `ready`) with no
curtain. `bankPreloads` still counts one per fighter, at the first
highlight now rather than at FIGHT.

### The sheets: lossy WebP with exact alpha, gated by the costume measure

36 of the 46 sheets in `assets/unified` shipped lossless (VP8L) — 32.0 of the
directory's 34.2 MB — because every builder here saves `lossless=True`.
`tools/swing/encode_sheets.py` re-encodes each from its lossless master
(the `swing-v50/lossless-51` archive; a shipped VP8L file with no archive
master is its own master; a sheet already lossy is left alone) as lossy WebP
via PIL — quality 90 then 92, method 6, `alpha_quality` 100, `exact=True` —
and keeps the encode only if the alpha plane is byte-identical (the cell
metrics, foot rows and 3D UVs are read off alpha) AND `measure_de.py`'s
weighted per-cluster dE against the master is under **0.7**. A sheet that
fails keeps its lossless bytes. Settings and per-sheet numbers are recorded
in `MANIFEST.json` `format.encoding`.

The gate is tighter than the size win the sweep predicted: measure_de
re-assigns the candidate's pixels to the master's clusters by their own
colour, and the encoder's 4:2:0 chroma on the outline pixels moves enough of
them between neighbouring clusters that quality barely matters (q90, q92 and
a q98 probe land within 0.05 of each other). **14 sheets passed, 22 stayed
lossless.** Directory: 34.42 MB → 26.35 MB (`du -sb`, manifest included);
sheets alone 34.07 MB → 25.99 MB (76 %).

| sheet | lossless | shipped | q | weighted dE | mean per-pixel dE |
| --- | --- | --- | --- | --- | --- |
| `alan-ext2.webp` | 1051 KB | 320 KB | q90 | 0.54 | 2.9 |
| `alan-ext3.webp` | 810 KB | 257 KB | q90 | 0.47 | 3.3 |
| `alan-ext4.webp` | 927 KB | 295 KB | q90 | 0.56 | 3.1 |
| `commissioner-ext2.webp` | 814 KB | 245 KB | q90 | 0.56 | 2.5 |
| `commissioner-ext3.webp` | 756 KB | 238 KB | q90 | 0.57 | 2.6 |
| `commissioner-ext4.webp` | 839 KB | 264 KB | q90 | 0.53 | 2.6 |
| `cyraxx-ext3.webp` | 757 KB | 284 KB | q92 | 0.70 | 3.4 |
| `deathblow.webp` | 701 KB | 242 KB | q90 | 0.44 | 2.5 |
| `devil.webp` | 893 KB | 354 KB | q90 | 0.60 | 2.8 |
| `donald.webp` | 842 KB | 237 KB | q90 | 0.34 | 2.5 |
| `jez-ext2.webp` | 956 KB | 314 KB | q90 | 0.54 | 3.7 |
| `jez-ext3.webp` | 773 KB | 261 KB | q90 | 0.62 | 3.9 |
| `jez-ext4.webp` | 852 KB | 288 KB | q90 | 0.69 | 3.9 |
| `post.webp` | 794 KB | 280 KB | q90 | 0.60 | 3.1 |

Kept lossless (weighted dE at q90 / q92): ali-ext 1.50/1.53, ali-ext2
1.94/1.92, ali-ext3 1.90/1.93, ali-ext4 1.90/1.88, ali 1.75/1.77 (every Ali
sheet — his saturated reds sit on cluster boundaries), benny-ext2 0.84/0.86,
benny-ext3 0.82/0.84, benny-ext4 0.87/0.87, cyraxx-ext2 0.84/0.85,
cyraxx-ext4 0.85/0.86, deathblow-ext2 0.92/0.90, deathblow-ext3 0.96/0.97,
deathblow-ext4 0.95/0.95, devil-ext2 1.25/1.26, devil-ext3 1.26/1.23,
devil-ext4 1.08/1.07, donald-ext2 0.71/0.71 (a hair over), donald-ext3
1.22/1.22, donald-ext4 0.96/0.97, post-ext2 1.25/1.23, post-ext3 1.30/1.30,
post-ext4 1.38/1.36. Per-fighter unified family on the wire, before → after:
deathblow 3.25 → 2.78 MB, jez 3.08 → 1.32, alan 3.32 → 1.36, post 3.74 →
3.21, benny 2.89 → 2.89, donald 3.46 → 2.84, cyraxx 2.97 → 2.49, ali 4.51 →
4.51, devil 3.95 → 3.40, commissioner 2.89 → 1.19.

Two things tried and rejected: extending the RGB of the transparent pixels
outward before encoding (the outline chroma smear is not where the drift
comes from — it moved the number by 0.03) and quality 95/98 (same numbers,
40 % more bytes). Getting the other 22 under the gate wants `cwebp
-sharp_yuv` or VP8L near-lossless, neither of which PIL exposes and neither
of which is installed here; the tool re-runs in one command when either is.

### The service worker keeps what it fetched

`sw.js` now has a second cache, `final-blow-media-<build>` (derived from the
shell name, so one version bump keys both): GET requests under `assets/`,
`renderer/hd/` and `renderer/vendor/` are cache-first, a miss is fetched and
stored (whole same-origin 200s only — a media element's byte-range request
bypasses it), and a 120 MB byte cap evicts oldest-first so the cache can
never recreate the 19 MB / 162-request install that was rejected in 3.3.
Activate purges every older build's caches, media included, because a sheet
is addressed by an un-versioned URL and a 5.0 sheet must never draw under a
5.1 manifest. The shell path is untouched (`tests/service-worker-guard`),
and `tests/service-worker-media.test.mjs` runs the worker in a vm against a
fake CacheStorage to pin the policy.

## v5.1 — TRUTH: THE WAVE IN ONE PLACE

Fourteen items from the post-5.0 sweep, built in parallel on isolated
worktrees and integrated onto the despilled 5.0 tree; each has its own
section above or in the sibling docs:
announcer and clock truth (a time-over is a DECISION, a dizzy is not a KO, the
last ten seconds tick — COMBAT.md); the build-time audio manifest (zero voice
probes, real announcer take lengths); the block economy (one blocked
voltage/flow cancel per string, reversal-invulnerable moves negative on block,
half Grit on block, per-projectile Grit cap, Perfect Guard re-arms — COMBAT.md);
the ext4 routing pass above; the tempo tells (whiff fringe, ghosts, WHIFF text,
re-arm wash and click, the lab's taxed readout — COMBAT.md, VISUALS.md); shared
sample variation (pitch/level jitter, a synthesised dash scuff and weapon
clatter); the KO moment above; the four other stages' KO beats above; flick-to-
dash and the governor's memory (CONTROLS.md); the first fight on a phone above;
the pause move list, first-run card, Fight School 8-12, CPU Team Battle and
the Devil/Commissioner trials (CONTROLS.md, DEMO.md); CINEMA 3D gameplay reads
(world-objects, the explicit host contract — VISUALS.md) and the 3D fighter
layer above; the resolver, ambient pulse and tools pipeline under test. Every
generated sheet was also rebuilt with the despill (see the manifest's
`format.despill`). Seams closed at integration: the body blow opens on a LOW
contact or a crouched victim (there is no HIGH level — a MID jab snaps the
head), a blocked contact keeps its stance through the hit flash, and the
wake-up rung is measured on the ext4 get-up it draws from.
