# Final Blow 1.3C four-button controls

Version 1.3C uses the approved classic layout: one directional control plus
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
| Double-tap left / right | Dash. Backdash keeps its startup invulnerability. |

## The four buttons

| Button | Keyboard P1 | Keyboard P2 | XInput | Attack |
| --- | --- | --- | --- | --- |
| LP | J | Num 1 | X | Light punch |
| HP | K | Num 2 | Y | Heavy punch |
| LK | N | Num 4 | A | Light kick |
| HK | M | Num 5 | B | Heavy kick |

PlayStation and Nintendo pads are detected from the gamepad id and relabelled
(□ △ ✕ ○ and Y X B A respectively). Every binding is remappable and persisted.

Each button authors a distinct normal in every stance:

| Stance | LP | HP | LK | HK |
| --- | --- | --- | --- | --- |
| Standing | jab | strong punch | low kick | roundhouse |
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

## Touch

The landscape HUD is an eight-direction movement pad on the left and an LP/HP/LK/HK
cluster on the right. Punches are the amber top row, kicks the cyan bottom row. The
button size is derived from the viewport height so the pad fits the 844×390 landscape
target; left-handed mode mirrors the two clusters. A prompt above the cluster shows
the super command when Grit is full and `FINISH HIM · LP = A · LK = B · ANY DISTANCE`
during the finishing window.

## Autonomous decisions taken for this checkpoint

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
