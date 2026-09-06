# Final Blow 1.8E four-button controls

Version 1.8E uses the approved classic layout: one directional control plus
**LP, HP, LK, HK**. No legacy
guard, special, super, throw or Final Blow button is required anywhere in the game.

Tournament input uses a six-frame default buffer (never less than four), bounded
motion leniency, and the shared priority **Super → EX → Special → Throw → Normal**.
If a high-priority buffered action is not currently legal, the engine continues to
the next legal action instead of swallowing the press. During intro and round-over,
any attack or Up skips the wait and is consumed so it cannot become an accidental
opening normal.

## Movement and defence

| Input | Result |
| --- | --- |
| Left / Right | Walk. Holding **away** from the opponent blocks standing, mid and high attacks. |
| Up | Jump. Up-toward and up-away give the forward and back jump arcs. |
| Down | Crouch. Crouching alone does **not** block. |
| Down + away | Crouch-block, which is the only way to guard lows. |
| Tap away ≤4 frames before impact | **Perfect Guard**: no chip, shorter blockstun, +3 Grit, no guard-gauge pressure. Release and tap away again *inside* blockstun to re-arm it against the next hit of a string. |
| Away + special motion, or LP+HP, in blockstun | **Guard reversal** (30 Grit). |
| Double-tap left / right | Dash. Backdash keeps its startup invulnerability. |
| Flick the touch pad left / right | Dash on a phone (5.x). A quick sweep of the thumb to the pad edge is read as the same double-tap; see **Touch** below. |

## The four buttons

| Button | Keyboard P1 | Keyboard P2 | XInput | Attack |
| --- | --- | --- | --- | --- |
| LP | J | Num 1 | X | Jab |
| HP | K | Num 2 | Y | Hook |
| LK | N | Num 4 | A | Light kick |
| HK | M | Num 5 | B | Roundhouse |

PlayStation and Nintendo pads are detected from the gamepad id and relabelled
(□ △ ✕ ○ and Y X B A respectively). Every binding is remappable and persisted.

Attack names stay in the move list and training data, but they are not shown as
combat-text popups during play. Tactical alerts such as **COUNTER**, **LOW**,
**OVERHEAD** and **GUARD CRUSH** remain visible.

Each button authors a distinct normal in every stance:

| Stance | LP | HP | LK | HK |
| --- | --- | --- | --- | --- |
| Standing | jab | hook | light kick | roundhouse |
| Forward | body check | overhead | roundhouse | roundhouse |
| Crouching | low jab | crouching strong | short kick | **sweep** (low, knockdown) |
| Air | jump punch | jump strong | jump kick | jump roundhouse |

## Specials, enhanced moves and supers

| Command | Move |
| --- | --- |
| ↓ → + LP/HP | Signature command special |
| ↓ ← + LP/HP | Back special |
| ↓ → + LK/HK | Base special (works in the air as the air special) |
| → ↓ → + LP/HP | Rising launcher / anti-air |
| ← → + LK/HK | Running heavy |
| Motion + LP&HP or LK&HK | Enhanced (EX) version · 25 Grit |
| ↓ → ↓ → + LP/HP, or HP&HK | Grit super · 100 Grit |
| ↓ ← + LK/HK (EX: LK&HK) | Personal throwable — two per round, the pips under the Grit bar |
| ↓ + HP over a grounded stage object · HP again throws (toward = the hard throw) | Stage weapon |
| Double-tap ↓, then LK&HK | Taunt (+8 Grit, punishable) |

Chords are two of the existing four buttons pressed together — no fifth button is
added. The chord is accepted when one button edges while its partner is held, and it
can also take over during the first six frames of a normal it accidentally started.

## Throws and the finishing window

- **Throw:** stand touching a grounded opponent and press **toward + LP or LK** to
  throw forward, or **away + LP or LK** to throw backward and swap corners. Outside
  the 104px grab range the same press is an ordinary normal — there is no grab-whiff
  animation.
- A grab needs a grounded, close, correctly facing opponent who is not in hitstun,
  blockstun, knockdown, wake-up or throw invulnerability.
- **The grab is visible.** A landed throw opens a clinch: the victim is locked to the
  thrower's hands, lifted and rotated for that fighter's hold length, then released.
  Damage, knockdown and Grit all land on release, not on contact. Every fighter has
  its own hold length, lift height, hold offset, victim rotation, release arc and
  screen shake (see `THROW_STYLES` in `game.js`), so DeathBlow's slam reads nothing
  like Ali G's judo arc or Jez's low trip.
- A completed special motion always beats the proximity grab, so close-range command
  specials stay reachable.
- The existing throw-tech window is unchanged: pressing a grab of your own inside the
  tech window breaks it, pushes both fighters apart and grants both sides throw
  invulnerability. A tech cancels any clinch that had already started.
- The CPU grabs and techs on a per-difficulty profile (`throwTechChance` and
  `grabPressureChance` in `engine/ai.mjs`), and holds a real direction when it does so
  it goes through the same proximity rule a human uses.
- **Final Blow:** once the finishing prompt appears, one fresh press of **LP** selects
  Finisher A or one fresh press of **LK** selects Finisher B. HP, HK and multi-button
  chords do not execute finishers. There is no proximity requirement: LP or LK works
  from anywhere on the stage. The window only arms after every combat button has
  been released, so the KO-causing attack and held buttons can never trigger one.
- With **Graphic Fatalities** enabled, every fighter's two finishers are focused
  three-beat executions: restraint, that fighter's assigned signature special,
  then one explicit arm or leg sever. A complete limb remains in the aftermath
  while the wound pumps arterial blood. See `FATALITIES.md` for the full matrix.

## Touch

The landscape HUD is an eight-direction movement pad on the left and an LP/HP/LK/HK
cluster on the right. Punches are the amber top row, kicks the cyan bottom row. The
button size is derived from the viewport height so the pad fits the 844×390 landscape
target; left-handed mode mirrors the two clusters. A prompt above the cluster shows
the super command when Grit is full and `FINISH HIM · LP = A · LK = B · ANY DISTANCE`
during the finishing window.

### Flick to dash (5.x, sweep #41)

Until 5.0 the only phone dash was lifting the thumb and re-landing in the same
sector inside the 12-frame double-tap window, which the sector pad never signalled
and QA never drove. A **flick** now dashes: sweep the thumb at least 0.6 of the pad
radius horizontally inside 100 ms (6 frames) and land at least 0.45 R out in that
direction (`TOUCH_PAD_RULES.flick*`, `touchPadFlick` in `engine/controls.mjs`; on the
844×390 target the radius is ~75 px, so a flick is ~45 px of travel). The landing test
is what stops the thumb's return swing from reading as a backdash. The flick is
translated into exactly what the sim already understands — two direction presses two
ticks apart, played on the touch Set as lift / tap / lift / tap / settle, one real sim
tick per stage from `runSimulationStep` — so `DirectionTapTracker` fires, `readInput`
is untouched and no new net bit exists. Double-tap still works. The first three
touch-controlled fights open with `FLICK THE PAD TO DASH · DOUBLE-TAP WORKS TOO` on the
touch prompt (per install, `final-blow-touch-flick-coach`), and the first three flicks
of a session flash `DASH ▶▶` / `◀◀ DASH` for a beat; super and finish labels always
outrank the tip. QA: `__finalBlowQa.touchFlick(direction, hold)` and
`touchDebug().flicks / flickPulses`.

### Performance governor memory (5.x, sweep #37)

The adaptive governor (`engine/polish.mjs`) used to be rebuilt from the static
baseline at every fight, so a boundary phone re-lived 2–8 s of dropped frames and the
COOLING toast at the top of every round 1. It now keeps its machine alive across the
result/select/title screens (frozen, not fed — a menu's frame times are not fight
evidence), drops it only when a static gate closes (forced profile, cabinet, online),
and writes the landed tier to `localStorage` under
`final-blow-governor-tier:<application-version>` with a device signature (UA,
`hardwareConcurrency`, `deviceMemory`, static baseline). The next session's first
fight starts on that tier silently; the memory can never seed above the static
baseline; the step-up path still needs 30 s of headroom and rewrites the memory when
it lands. QA: `__finalBlowQa.governorMemory()` / `governorForget()`, and
`snapshot().governor.{retained, seededFrom, remembered}`.

## Modes & onboarding (5.1, sweep #29–#33)

### One command table, every style

`commandLabel(action, style)` / `styleCopy(template, style)` in `engine/controls.mjs`
are the single source of truth for "how do I do X in the active control style".
The table mirrors the resolver: MODERN's LP&LK chord is the command special
(neutral or ↓) and, held away, the back special — the base kick special, launcher
and super motion stay classic; LEGEND's HP is the command special, ↓ + HP the
launcher, ← + HP the back special, HK the base special, HP alone the super at full
Grit. EX chords, the throwable and the taunt are style-free. Four surfaces render
through it: the move list's COMMAND column, the FIGHT SCHOOL step labels, the
options dialog's SPECIALS / ENHANCED / SUPER lines (`data-style-copy` templates,
re-rendered on every style change) and the touch prompt's SUPER READY line.

| Action | CLASSIC | MODERN | LEGEND |
| --- | --- | --- | --- |
| Command special | ↓ → + PUNCH | LP&LK | HP |
| Back special | ↓ ← + PUNCH | ← + LP&LK | ← + HP |
| Base special | ↓ → + KICK | ↓ → + KICK | HK |
| Launcher | → ↓ → + PUNCH | → ↓ → + PUNCH | ↓ + HP |
| Super | ↓ → ↓ → + PUNCH or HP&HK | HP&HK at full Grit | HP at full Grit |

### Move list from the pause menu

**MOVE LIST** on the pause panel opens a compact overlay for the fighter P1 is
holding (the Commissioner included), with the command column in the active style
and a footer for the things the frame-data rows never listed: throwable, stage
weapon, dash, taunt, Perfect Guard and guard reversal. Escape / pad back closes
the overlay first, a second press resumes. The options dialog's fighter select is
now built from the live roster (the Pinelands Devil and an unlocked Commissioner
appear) instead of the static eight-option list. QA: `__finalBlowQa.moveListOverlay(open)`.

### First-run control card

The first human fight (arcade, versus, survival, team — never training, demo,
online or replay) raises a corner card through the round-1 intro and the opening
seconds: MOVE, BLOCK (hold away · down-away for lows), the four buttons for the
device actually in hand (keyboard bindings from the live keymaps, pad glyphs in the
detected label set, or the touch cluster), the style's special command and the
grab. It is dismissed by a tap/click, Escape, or its own 9.5 s timer, and shown
once per install (`final-blow-control-card`). It deliberately does **not** stretch
the intro clock: `phaseTime` is sim state, and a replay of that first fight would
re-run with the stock 2.1 s intro and desync. On the touch layout the card sits
top-left, away from the pad, and the flick-to-dash tip waits behind it — the card's
dismissal re-invokes `maybeCoachTouchFlick()`, so the tip is deferred, not lost.
The title screen shows a `NEW HERE? FIGHT SCHOOL · 3 MIN` ribbon until a match is
logged or a lesson is completed, and the school button reports real progress.
QA: `__finalBlowQa.controlCard()` / `controlCardReset()`.

### Fight School lessons 8–12

| # | Lesson | Steps (dummy script) | Event |
| --- | --- | --- | --- |
| 8 | THE JAWN | land the throwable, then HP behind it | projectile impact (`throwObject`) |
| 9 | GRIT ECONOMY | land any EX, then the super | `enhanced*` / `super` hits |
| 10 | SPLIT SECOND | Perfect Guard ×2 (overhead loop), then a guard reversal | block with `perfect`, `guardReversal` hit |
| 11 | OFF THE FLOOR | air tech (launcher script), quick rise, delayed wake (sweep script) | `airTech`, `wake` |
| 12 | STREET FURNITURE | pick the stage weapon up, land the throw | `pickup`, `stageWeapon` impact |

Labels are templates (`LAND {commandSpecial}`) resolved per style by
`fightSchoolStepLabel`; lesson 4's old hard-coded `↓ → + PUNCH` now reads LP&LK
under MODERN and HP under LEGEND. The school observes four new sim hooks (guarded
behind `rollbackResimulating`, training only, side 0): projectile impacts in
`triggerProjectile` (the throwable and the stage weapon never went through
`observeTrainingHit`), the weapon pick-up, `performAirRecovery`, and the wake-up
option. The guard reversal is an advanced move with no `kitAction`, so
`observeTrainingHit` now names it `guardReversal` instead of a plain `special`. The
STREET FURNITURE setup keeps an object on the floor (respawning after a throw lands
or the weapon expires) and restores the stage-weapon option on exit if it had to
switch it on. The first seven lesson ids are unchanged, so saved progress holds.

### Team Battle vs CPU

The title button reads `1–2 PLAYERS · TEAM BATTLE · 3V3`. After P1's third pick the
select screen raises **VS CPU · AUTO-DRAFT** / **VS PLAYER 2** (arrows or stick move
between them, Enter / A / any attack key confirms; the roster ignores picks until
the choice is made). VS CPU drafts three fighters P1 did not pick
(`draftCpuTeam` in `engine/modes.mjs`, drawn from `state.rng` — `seedMatch`
reseeds at FIGHT, so the draw never leaks into the match stream), stamps the three
cards one after another, raises the CPU difficulty bar and locks P2; FIGHT then
calls `beginTeamBattle(true)`, the path `sideIsCpuControlled` and the rematch flows
already honoured. QA: `__finalBlowQa.teamChoice("cpu" | "player")`.

### Combo trials for every kit

`TRAINING_COMBO_TRIALS` is generated for every `FIGHTER_KITS` id. The Pinelands
Devil (HOWL CONFIRM, BARRENS CASHOUT) and the Commissioner (GAVEL CONFIRM,
AUTHORITY CASHOUT) get the same bronze pair as the original eight plus the six
generated trials — eight each, the signature route included because Wing Flit and
Binding Clause both land on the standing dummy.



These were unspecified in the backlog and were resolved with reversible, data-driven
choices:

1. **Kick normals are derived, not hand-authored.** Each fighter's four kick normals
   are generated from that fighter's own punch normals with fixed SF2/MK3-shaped
   transforms (longer reach and push, slower startup and recovery, crouching HK
   becomes a knockdown sweep). This keeps all eight characters mechanically distinct
   without a second set of 48 authored moves, and the transforms live in one table in
   `engine/defense.mjs` so they are easy to retune.
2. **Punch terminals drive command specials, kick terminals drive the base special.**
   This keeps every previously reachable move reachable with four buttons and matches
   the SF2 convention that the strong motions end on a punch.
3. **Supers have two routes** — the classic double quarter-circle plus punch, and the
   HP&HK chord — because the backlog explicitly allows "a deliberate motion/chord".
4. **`input.guard` survives as an engine-internal channel only.** No key, pad button
   or touch button maps to it; it is still used by the CPU and the Training dummy so
   their existing behaviour is untouched. Human guarding is purely directional.
5. **Direction tokens are recorded on state change, not per frame.** Holding
   down-forward used to push alternating `down`/`forward` tokens every frame, which
   would have made the new five-token super motion trivially easy. Directions are now
   recorded once per change, expanded into their components.
6. **Rollback protocol bumped to version 2** with two new input bits: a limb selector
   (LK/HK versus LP/HP) and a back-throw modifier. Both peers run the same build, so
   the bump only guards against a stale client silently desyncing.
7. **The simplified ("modern") control style now uses the LP&LK chord** to reach the
   special without a motion, since there is no longer a dedicated special button.
8. **Throws resolve on release, not on contact.** Opening a clinch first makes the
   grab readable and gives the tech window somewhere to live, and it keeps the damage
   event in one place. The clinch is 11–18 frames depending on the fighter, which is
   long enough to read and short enough not to stall the round.
9. **Grab presentation is a data table, not per-fighter animation work.** Hold
   length, lift, offset, spin, release arc and shake are eight numbers per fighter in
   `THROW_STYLES`. Full authored grab art can replace this later without touching the
   simulation, and the table is trivially retunable.
10. **The CPU techs by throwing back.** Rather than a special-cased escape, the AI
    answers an incoming grab with its own grab inside the tech window — the same rule
    a human uses — so tech rates follow naturally from each difficulty's reaction
    profile.

## Verification

```sh
node --test tests/*.test.mjs
node tests/browser-smoke.mjs
cd signaling && npx wrangler dev --port 8787 --local
FINAL_BLOW_SIGNALING_API=http://127.0.0.1:8787 node tests/online-browser-smoke.mjs
```

The browser suite covers keyboard normals, motions, chords and the finishing window;
an emulated XInput pad including face buttons, D-pad guarding and D-pad jumping; the
844×390 landscape touch HUD layout in both handedness modes; Training, Arcade, Watch
Demo, PWA offline boot and the portrait gate. The online suite covers a real
two-browser rollback match with deliberate packet loss, reconnect and rematch.
