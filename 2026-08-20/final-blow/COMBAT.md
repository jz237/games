# Final Blow combat direction

Version 1.3 adds the **Tournament Feel** pass documented in `TOURNAMENT.md`: a
120-normal frame/box audit, shoulder-clearance cross-up collision, all-28-matchup
CPU simulation, deterministic repetition limits, telegraphed/capped hazards,
expanded Training and faster round flow. The full-stage arena camera remains fixed
outside authored finisher cinematics.

Version 1.1C rebuilds the fight around **Street Fighter II: Hyper Fighting** neutral
and **Mortal Kombat 3** impact. The roster, Grit identity, signature moves, supers and
finishers are unchanged — only the mechanical proportions moved.

## What changed and why

### Neutral and tempo

| Value | 1.0 | 1.1C | Reason |
| --- | --- | --- | --- |
| Forward walk | 292 | 336 | Walking is a real approach option again. |
| Back walk | 224 | 262 | Whiff-punishing needs the space to step back into. |
| Jump velocity / gravity | −748 / 1850 | −815 / 2180 | Same apex, ~45-frame arc instead of ~48. Jumps stay committal but the round moves. |
| Forward dash | 580 × 11f | 620 × 10f | Faster, but… |
| Dash cooldown | 9f | 14f | …no longer repeatable enough to replace walking. |
| Backdash invulnerability | 6f | 4f | Backdash escapes pressure, it does not bypass footsies. |

Jump arcs are fixed: there is no air steering, no air block, and landing costs 7
frames — 11 after an air attack — so a whiffed jump-in is a real commitment that
grounded anti-airs punish.

### Impact and punish windows

All authored per-fighter frame data passes through one choke point,
`ARCADE_TUNING` in `engine/foundation.mjs`:

- **Damage** ×1.15 light, ×1.22 heavy, ×1.14 special, ×1.16 throw. Individual hits
  land harder than a modern combo-heavy fighter.
- **Recovery** ×1.08 light, ×1.28 heavy, ×1.32 special, ×1.24 throw. Recovery grows
  faster than damage, so a missed heavy, sweep, uppercut, throw or projectile leaves
  a punish window while light pokes stay fast enough to hold space.
- **Chip** ×1.4 on specials. Blocking a fireball costs real health but can never take
  the last point.
- **Launch velocities** ×2180/1850 so every authored juggle and multi-hit rhythm
  survives the gravity change untouched.

Counter hits pay ×1.3 damage and +7 frames of hitstun, so stepping into a whiff is
the strongest thing in neutral.

### Shorter combos

- Scaling curve steepened from `[1, .9, .8, .72, …]` to `[1, .74, .52, .38, …]` with a
  floor of 0.15. A two-hit confirm is worth having; a five-hit string is not.
- Juggle limit dropped from 4 to 2 and the juggle scale floor from 0.68 to 0.4.
- Cancel routes trimmed. A light confirms into **one** heavy, a heavy confirms into a
  special. There is no light-into-light chain and no universal route, so pressure has
  to be earned with spacing instead of buttons.
- A single authored multi-hit move (a super, an EX rekka) is exempt from both the
  juggle limit and the harshest scaling — its length is already bounded by its own
  `maxHits`/`rehitFrames`, and `COMBO_RULES.multiHitFloor` keeps its later hits worth
  landing. Supers stay the biggest single payoff without taking a third of the bar.

### Dizzy

`STUN_RULES` in `engine/defense.mjs`:

- Clean unblocked hits add stun — 9 for a light, 17 for a heavy, 20 for a special,
  plus a small bonus for overheads, lows, air hits and counter hits. Throws add none.
- Multi-hit moves divide their gain so a single super cannot stun on its own.
- The meter holds for 48 frames after the last hit, then bleeds at 0.62/frame.
- At 100 the fighter is **DIZZY** for 128 frames: helpless, with orbiting stars, a
  drain bar, a label, a screen flash and a music duck.
- Mashing buttons or directions shortens the dizzy by 5 frames a press but can never
  drop it below 46 elapsed frames, so the punish window is always real.
- Recovery grants **320 frames of stun immunity**, which is what makes dizzy loops
  impossible.

Every value is integer or frame-based and lives on the fighter, so dizzy is fully
deterministic under replay and rollback.

### Round shape

Best-of-three with the existing 99-count timer, unchanged. Post-throw invulnerability
rose from 30 to 40 frames so there is no throw loop without a defensive answer, and
knockdown/wake-up were retuned (48/16) to keep okizeme readable.

#### Announcer and clock truth (roadmap2 w51, sweep #22/#27)

The round-end call now says what happened. `engine/announcer.mjs` classifies every
`finishRound` (`roundEndCause`: finisher / knockout / decision) and builds the spoken
plan (`roundEndAnnouncerPlan`); game.js only executes it.

- **Time over is a DECISION.** The clock reaching 0 with the loser still holding
  health shows `<NAME> WINS · DECISION`, the announcer opens on the `timeover` bank
  ("TIME OVER — DECISION!" / "THE CLOCK CALLS IT!" / "TIME! JUDGES' DECISION!")
  instead of "K.O.!", and `knockout.mp3` does not play — nobody went down. The old
  duplicate time-over story callout (1.1 s later) is gone. PERFECT / COMEBACK still
  layer over a decision when true.
- **Round win vs match win.** After the KO (or time-over) call the announcer speaks
  the winner's `<id>-name` bank for a round win and the `<id>-wins` bank
  ("THE WINNER — BENNY!") only for the round that reaches `roundsToWin` — so the
  match-winner lines are heard once per match, not after round 1 of a first-to-2.
- **Dizzy is not a KO.** `enterDizzy` no longer plays `knockout.mp3` (the reviewed
  shared KO groan — for the Commissioner/Devil their long defeat take). It rings a
  synthesised three-chirp wobble (`dizzyRingAudio`, tick-hash variant so consecutive
  dizzies differ); the dazed voice bark still layers over it.
- **The last ten seconds tick.** On the same HUD edge that pulses the red digits,
  `clockTickAudio` plays a triangle ladder — 880 Hz at :10 rising 22 Hz a second,
  brighter/shorter 1320 Hz+ under :05 — and a square two-partial buzzer at :00, so
  no two consecutive ticks sound alike and the ear can count down without reading a
  20 px timer. At :10 the announcer calls `tenseconds` once per round
  ("TEN SECONDS!" / "CLOCK'S RUNNING!" / "TIME'S ALMOST UP!"). No recorded takes
  exist yet, so that line is caption-only (zero requests; work order in
  MISSING-AUDIO.md Priority 6). All of it sits behind the updateHud/announce()
  rollback guards; replays and resims stay silent. QA: `snapshot().violence`
  exposes `timerTicks` (must equal `timerPulses`), `clockTicksVoiced`,
  `dizzyRings`, `clockCallouts` and `decisionCalls`.
- Every announcer cue draws from a shuffle bag (`drawFromBag`, now unit tested):
  each take plays once per bag and the same take never lands back to back.

## Verification

```sh
node --test tests/*.test.mjs
node tests/browser-smoke.mjs
```

The browser suite asserts the *rules* rather than frozen numbers wherever the arcade
tuning can move them: recovery must exceed the authored base, a whiffed sweep must be
punishable, light pokes must stay meaningfully faster than heavies, chip must be
meaningful but never lethal, every super must out-damage a single heavy while leaving
most of the bar, dizzy must trigger from repeated clean hits, must last long enough to
punish, and must grant immunity on recovery.

## CPU difficulty and Passive mode

The ladder is now **PASSIVE · ROOKIE · STREET · PRO · FINAL**, shown as a visible
picker on the fighter-select screen whenever a CPU is actually in the match (Arcade,
and Training with a CPU dummy). It is hidden in local versus, stays in sync with the
options screen, and the choice persists in `final-blow-ai-difficulty`.

**Passive** is an inert practice opponent, guaranteed structurally rather than by
tuning: its settings carry `inert: true`, and `stepAiBrain` short-circuits to an empty
input before it can even read an observation. `aiInput` also returns early so a
Passive CPU can never take a Final Blow or run the demo super opener. It therefore
never advances, chases, attacks, throws, techs, jumps, anti-airs, blocks, dodges,
retaliates, spends Grit, reverses on wake-up or finishes a round. It still takes
damage, still reacts to hits, and can still be grabbed and thrown.

The browser suite runs a Passive CPU for 1,920 frames across six distances and
asserts zero attacks, zero guards, zero jumps, zero grabs, zero Grit spent, zero
movement, and that the only state it ever occupies is `idle`.

## MK/SF2 fighter scale

`FIGHTER_SCALE = 1.14` in `engine/defense.mjs` is the single factor applied to every
spatial quantity that belongs to a fighter: body size, hitboxes, hurtboxes,
pushboxes, move reach and push, advance/retreat speeds, launch and juggle
velocities, walk and jump speeds, gravity, grab range, projectile origins, speeds
and sizes, and the drawn sprite. **Stage bounds are deliberately not scaled** — that
is what makes the arena read as narrower in body-widths, exactly like a classic 2D
fighter, while every spacing relationship between reach, walk speed and body size is
preserved untouched.

Measured against the live build: the 320px atlas cell is 95.6% character, the
playable fight area between the HUD and the floor line is 521 canvas px, and the
pre-scale roster averaged 62.4% of it. After scaling the roster sits at
**68.4% – 74.0%**, with per-character adjust values (0.99 for Ali G up to 1.068 for
DeathBlow) keeping body types visibly distinct inside that band.

The landscape HUD was made more compact so a 844×390 phone gets the same playable
area fraction as a desktop; framing now drifts by at most 0.2 percentage points
between the two.

### A latent bug this exposed

All eight fighters override every field of `MOVEMENT_RULES`, and those overrides
were absolute literals authored against the original 1.0 baseline. That meant the
arcade tempo change in 1.1C never reached a single fighter. `getFighterMovement` now
interprets kit movement as **ratios** of `AUTHORED_MOVEMENT_BASELINE`, so a fighter
authored at 246 against a 292 baseline stays at 84% of whatever the shared walk
currently is. Personality is preserved and every future tempo or scale change
propagates correctly. The kit test asserts this for all eight fighters.

## Shared-sample variation and the two synthesised movement cues (post-5.0)

Seven reviewed shared takes carry most of what a player hears: `body-hit.mp3`
on nearly every impact (hit-heavy is recorded for 0/8 fighters, hit-light for
1/8), `light-swing`/`heavy-swing` on most swings (2/8, 3/8), and until now
`jump.mp3` doubled as the dash and the `ui-select` menu click was the
stage-weapon drop. The takes are frozen by the audio review and are never
regenerated or re-encoded, so the variety happens at play time
(`engine/shared-sfx.mjs`):

- **Per-play pitch and level jitter on the shared pool.** `hit` ±8%, `light`
  ±7%, `heavy` ±6%, `jump` ±6% playbackRate with `preservesPitch` off, plus an
  independent ±1.5 dB (±1.2 dB for jump) level nudge. `distinctDraw()` keeps
  consecutive plays of one take at least 0.35 of the span apart (~2.8% on
  body-hit — clearly a different pitch), rejection-sampling and then stepping
  to the far side of the previous draw, so the guarantee holds even for a
  stuck random source. The draw uses `visualRandom` (checksum-exempt, the same
  stream the single-take fighter banks already use), never `state.rng`. The
  menu click and the once-a-round `finish`/`ko` takes play as reviewed.
- **Dash scuff** replaces the borrowed jump sample: a band-passed noise hiss
  sweeping 2200→900 Hz over 0.13 s with a short sine plant for the push-off;
  a back dash is the heel dragging (1650→700 Hz, 0.165 s). It plays under a
  fighter's own dash grunt where one is recorded, and is the whole cue where
  none is. Jitter comes from the tick hash salted by the scuff serial
  (the `impactLayerAudio` pattern) through the same no-repeat draw.
- **Stage-weapon clatter** replaces the menu click: one material per weapon
  `style` in `STAGE_WEAPON_CLATTER` — two glassy tinks for the needle, a glass
  ring + thud + three ticks + roll for the bottle, a body thud and four wing
  flaps for the pigeon, two metal partials and hard ticks for the tongs, a
  hollow plastic clunk that bounces and rolls for the cup. Bounces arrive
  sooner and quieter each time; the draw detunes the whole event ±9% and
  stretches the bounce gaps ±20%.

`fallbackSoundKinds` no longer lists `dash` or `stage-weapon`; both route
through `SHARED_SYNTH_VOICES` in `sound()`. QA: `snapshot().audio.variation`
is the last shared draw (`kind`, `rate`, `db`, `gain`) and
`snapshot().violence` carries `sharedVariations`, `dashScuffs` and
`weaponClatters` totals. Unit coverage in `tests/shared-sfx.test.mjs`.
## Block economy (post-5.0 sweep)

The 4.4 Tempo / 4.5 Re-Arm pass made a *whiffed* swing pay; this pass makes the
*blocked* side of the exchange pay too, so a correct block is a real decision
rather than a slower way to lose. Four rules, all in `engine/combos.mjs` /
`engine/foundation.mjs` with the sim wiring in `game.js`:

| Rule | Before | Now |
| --- | --- | --- |
| Voltage / flow cancel on block | unlimited (Blitz→Blitz was a true blockstring: last hit f21, blockstun to f38, cancelled Blitz active f34; guard crush on rep 7, 168 Grit banked) | **one** blocked special→special cancel per string (`SPECIAL_CANCEL_RULES.blockedPerString`); the second is refused and the string ends on the move's own recovery (blocker free f38, Benny f45). On hit still unlimited. Normal→special cancels on block are untouched. |
| Reversal invulnerability | free back specials/launchers hurtbox-less from frame 0 in neutral; Ali/Benny/Cyraxx EX back specials +10/+9/+9 on block | invulnerability is granted only to a real reversal (wake-up window, guard reversal) or a paid move (EX/super); every invulnerable move must be ≤ −3 on block (`REVERSAL_BLOCK_DISADVANTAGE_FRAMES`, clamped in `createAttackInstance` and asserted across all ten kits) |
| Grit on a blocked strike | attacker 1.0× move meter, defender 0.45× | attacker **0.5×** (`GRIT_RULES.blockGainMultiplier`), defender 0.45× — close to neutral |
| Grit per projectile | flat 15 per touch, hit or block, no cap | **15 hit / 6 block**, paid once per projectile (`projectile.gritPaid`). Seven blocked Shockwaves in 5.25 s used to fund GOLDEN BACK NINE (105 Grit); now 42, the same wall needs seventeen orbs (~13 s) |
| Perfect Guard inside a string | first hit only — blockstun held `guarding` true, so no fresh stamp | releasing and **re-tapping away during blockstun** re-stamps the window (Garou-style tap-tap just-defend); the 4-frame window is still tighter than the roster's 6–8-frame rehit cadence |

Retuned recoveries (authored → tuned, on-block by the frame-data panel's
last-active-frame convention; a 3-hit move whose last hit lands mid-window is
effectively worse by the idle active frames, roughly −14 to −16 for the EX trio):

| Move | Recovery | On block |
| --- | --- | --- |
| BEAT SKIP EX (ali) | 6→18 (8→24) | +10 → **−6** |
| LIVE WIRE EX (benny) | 7→18 (9→24) | +9 → **−6** |
| BUFFER SKIP EX (cyraxx) | 7→18 (9→24) | +9 → **−6** |
| VINYL STEP EX (jez) | 10→15 (13→20) | +4 → **−3** |
| BEAT SKIP (ali) | 8→14 (11→18) | +4 → **−3** |
| LIVE WIRE (benny) | 9→14 (12→18) | +3 → **−3** |
| BUFFER SKIP (cyraxx) | 10→15 (13→20) | +3 → **−4** |
| BASSLINE RISER EX (ali) | 14→15 (18→20) | −2 → **−4** |

Startup, active frames, damage, the cross-through (`ignorePushbox`) and the
invulnerability frames are unchanged on all of them — the payoff stays, the
blocked read now belongs to the blocker. Tests: `tests/tempo.test.mjs` (Blitz
measurement, cancel budget, Grit rates, Shockwave arithmetic, clamp + neutral
gate pins), `tests/fighter-kits.test.mjs` (the invariant over every kit, and a
proof that the clamp never fires on authored data), `tests/combos.test.mjs`
(changed pin), `tests/depth-defense.test.mjs` (re-arm case).

## Tempo and Re-Arm tells (5.1)

4.4 Tempo (`WHIFF_RECOVERY_TAX`: light 0.5, heavy 0.35, special 0.3, throw
0.25 of the move's recovery, minimum 2f) and 4.5 Re-Arm (`ATTACK_REARM_FRAMES`
= 4) were measurable and invisible: a whiffed jez jab ran R12 + 6 tax + 4
re-arm and the lab still printed `R12`, because the FRAME DATA line was
snapshotted at attack start; a press inside the 4-frame gap was consumed by
`tryStartBufferedAttack` and refused by `beginAttack` with nothing on screen
or in the speakers. Now (`engine/tempo-tells.mjs`, pure and shared by both
renderers):

| Moment | Sim record | 2D body | CINEMA 3D body | Lab |
| --- | --- | --- | --- | --- |
| Active window closes on nothing (the tax lands) | `attack.whiffTaxed` + `attack.whiffTaxFrames`; `fighter.whiffTell = { tick, taxFrames, rearmFrames, kind, profileId }`; `WHIFF` combat text at the hand (tax > 0 only — projectile / trap / hurled swings connect later and tax nothing) | solid hot-red fringe (enlarged red silhouette under the sprite, 0.6 → 0.9 alpha into the taxed tail), 1–2 red ghosts of the extension cell falling back, a thin dust crescent in front of the fist | `uFbWhiffRim` — the same red as a stroke on the sprite's edge term; the combat text comes through the overlay pass | FRAME DATA becomes `JAB · S4 A3 R12+6 WHIFF · RE-ARM 4F`; the frame meter paints the taxed tail **magenta** (`whiff`) after the blue recovery |
| Re-arm gap (swing over, `attackRearmFrames` > 0) | — | fringe fading across the gap, the remembered extension cell dropping away behind the idle body, and a pale grey wash over the body (disarmed) | rim fades, `uFbRearmDim` desaturates the body toward pale grey | meter paints the gap **grey** (`rearm`) instead of idle |
| A press the gap eats (`beginAttack` refused with only the gap in the way) | `fighter.rearmDropTick`; `snapshot().violence.rearmDrops` | a sharper white pop for 6 ticks (outlives the gap) | `uFbRearmDim` pop | — |

The eaten press also clicks: `rearmClickParams` in `engine/shared-sfx.mjs` is
a dry lowpassed tick over a falling pip at 0.02 peak (under the dash scuff's
0.055), pitch-jittered through `distinctDraw` so two eaten presses in one gap
never share a pitch; human seats only (`sideIsCpuControlled`), never during
resimulation. The tells are gameplay information, so reduced motion and high
contrast keep the fringe, wash, pop and text and drop only the ghosts and the
crescent; the battery profile's `trailScale` drops the ghosts.

QA: `snapshot().violence.{whiffTells, rearmDrops, whiffFringes, whiffGhosts,
rearmFlashes, rearmDropFlashes, rearmClicks}`, `snapshot().fighters[i].{
attackRearmFrames, whiffTaxed, whiffTaxFrames, whiffTell}`, and
`__finalBlowQa.tempo()` (per-side phase/strength/taxLeft/rearmLeft/dropFlash,
the meter phase, the totals, what the last frame drew, the lab line). Tests:
`tests/tempo-tells.test.mjs` (phase arithmetic, meter, readout, source pins in
both renderers), `tests/shared-sfx.test.mjs` (click), `tests/cinema-host.test.mjs`
(program cache key v12 for the two new uniforms).
