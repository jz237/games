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
knockdown/wake-up were retuned (48/16) to keep okizeme readable. **Superseded in part
by the 5.3 close-range pass below**: the 40 frames are now paid only after a throw or
a tech, and the wake-up carries hurtboxes for its last few frames.

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
  `dizzyRings`, `clockCallouts` and `decisionCalls`. **5.3:** none of that was
  reachable from a probe — a round starts at 99 and nothing waits 89 seconds —
  so `__finalBlowQa.setTimer(seconds)` forces the clock. It writes the value
  the way the sim does (whole seconds, carry cleared) and leaves `updateHud()`
  to book the edge, so the counters stay honest, and it throws unless
  `state.qaManualMode` is set: a match the player started from the menu can
  never have its clock written. browser-smoke's `announcer-decision` probe
  proves the guard, then walks :11 -> :10 -> :00 in about 30 ms.
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

### The round bookends got a music channel (5.3 "Spectacle", sweep #25)

The sound of a round ending was a duck: a KO dropped `fightMusic` to 0.28 for
2.6 s and the same loop came back, and a match ending touched the music not at
all. There is now a **second Audio channel above the bed** — twelve new
stingers in four banks (`roundstart`, `ko`, `decision`, `matchwin`), three takes
each, drawn from the same shuffle bag the voiced crowd uses so no take ever
follows itself. `musicStingerForRoundEnd()` in `engine/music.mjs` picks the bank
from the facts `finishRound` already computes for the announcer
(`roundEndCause`, whether this round closed the match, whether a Final Blow is
playing); a Final Blow deliberately gets none, because `performFinisher` ducks
the bed to 0.1 to hand the frame to the gore mix. Each stinger ducks the bed
under itself for its own measured length, and only ever *downward* —
`Math.min(spec.duck, state.musicDuck)` means it can never lift a deeper duck
already in flight.

The same wave replaced the low-health filter sweep with a real crossfade to a
percussion/drone stem, and composed the two stage beds release 1.6 planned.
Measurements, the loop maths and the browser verification live in **STAGES.md →
*5.3 — Music***. QA: `__finalBlowQa.music()` carries the picked track, the
stinger log (`lastEvent`, `stingerRecent`) and the crossfade
(`dangerStem.mix` / `.bedGain` / `.enters`); `snapshot().violence` carries
`stingerPlays`, `dangerStemMix` and `dangerStemEnters`. Unit coverage in
`tests/music.test.mjs`.
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

## Close range: okizeme and the throw (5.3 "Spectacle", sweep #10 and #13)

Two close-range situations had no read in them at all. Both are fixed here, and both
fixes are read-shaped: a new option on one side always comes with the answer to it on
the other.

### The wake-up was a hard reset (#10)

`getHurtboxes` returned `[]` for `down || knockdownFrames > 0 || wakeupFrames > 0`,
so **nothing could be timed against a rising fighter for 64 frames** (76 after a
delayed rise), and the wake tick then handed out 40 throw-immune frames on *every*
knockdown — measured on the live build, a TREMOR TAP knockdown left the victim
untouchable for 64 frames and unthrowable for 104, while the knockdown starters that
put them there are −12 to −20 on block. The round genuinely restarted after every
knockdown. DeathBlow's AFTERSHOCK GRAB and the Commissioner's BINDING CLAUSE could
never follow one, which contradicted their own kit summaries.

| Value | Before | After | Why |
| --- | --- | --- | --- |
| Hurtboxes while `down` / `knockdownFrames > 0` | none | none | Unchanged — the lie-down is not a fair target. |
| Hurtboxes on the 16 rising frames | none for all 16 | none for the first **10**, the **crouch shape** for the last **6** (`DEFENSE_RULES.wakeupVulnerableFrames`) | A meaty has a timing. `wakeupInvulnerableFrames: 10` was dead config; it is now the derived complement and the depth test pins the pair. |
| Rising body shape | — | crouch (`HURTBOX_SHAPES.crouch`, 2 boxes vs the standing 3) | A rising fighter has not stood up; a meaty is aimed at the floor, not at head height. |
| Guard while rising | impossible | the vulnerable frames accept back / down-back | The meaty is a **high/low read**, not a tax on being knocked down. The riser still cannot attack, walk, dash or jump. |
| Perfect Guard while rising | n/a | never (`guardStartedTick` is stamped `-Infinity` on those frames) | The rising guard goes false→true on the first vulnerable frame, so without the exclusion every blocked meaty would land inside the 4-frame just-defend window and pay the *blocker* Grit. |
| Reversal window after a landed meaty | 4 invulnerable frames regardless | **0** when the riser is in hitstun or blockstun at the wake tick | You were touched before you stood up. Without this a landed meaty handed the victim 4 invulnerable frames mid-hitstun and dropped its own combo. |
| Hitstun / blockstun clocks during the rise | frozen | tick normally | Otherwise a meaty's hitstun froze until the fighter finished standing and the move's frame data lied. |
| Throw immunity on the wake tick | **40 on every knockdown** | 40 only after a **throw or a tech** (`throwKnockdown` latch); **8** after a strike (`strikeKnockdownThrowImmuneFrames`) | 40 is the anti-throw-loop rule and belongs to throws. 8 is long enough that a grab cannot be pre-buffered onto the wake tick and short enough that a command grab is a real okizeme option. |
| Meaty window vs the wake option | — | neutral **6**, quick rise **8**, delayed rise **4** (`WAKEUP_RULES.quickRiseVulnerableBonusFrames` / `delayVulnerableReductionFrames`) | The 1.7 DEPTH rise options finally change something the attacker cares about. |

Measured in the browser (deathblow TREMOR TAP knockdown, jez rising, `__finalBlowQa.oki()`):

- Rise frames 16→7 report `hurtboxes: 0`; frames 6→1 report `hurtboxes: 2, vulnerable: true`;
  frame 0 reports `invulnerableFrames: 4` (the reversal window).
- Throw immunity on the wake tick: **8** after the special knockdown, **40** after a
  CONCRETE POUR — the latch reads `throwKnockdown: false` / `true` respectively.
- Meaty press window with deathblow's jab (S4): pressed at rise frames **8–14** the
  active window lands on the vulnerable frames and `meaties` increments; pressed at
  4–7 the jab arrives after the rise, meets the 4 reversal frames, and is exactly the
  attempt a wake-up DP beats.
- The high/low read, WRECKING HOOK (overhead) vs SPINE SPLITTER (crouching, mid):
  overhead into a high-guarding riser is **0 damage, `blocked-overhead`**; the same
  overhead into a low-guarding riser is **20.7**; the crouching heavy chips 5.6 either
  way. Rising guard never registers as `perfect-guard` any more.
- Total untouchable frames after a knockdown: **64 → 58** neutral, **76 → 72** delayed,
  **50 → 42** on a quick rise.

The wake-up window is drawn: a hot amber rim (`#ffb347`, deliberately neither the
whiff fringe's red nor the fighter's accent) pops onto the body on the frame the
hurtboxes appear and brightens as the window closes, with a low ground arc under the
feet. It is gameplay information, so reduced motion and the battery profile keep it.
`snapshot().violence.wakeupTells` is its per-frame draw count (presentationDebug is
zeroed every rendered frame, unlike the monotonic totals beside it). A strike that
lands on those frames prints **MEATY** (or **MEATY BLOCKED**) exactly the way a
counter-hit prints COUNTER.

### The throw had no whiff and no reactable tech (#13)

`techThrow` was only ever called at contact, gated on `lastThrowInputFrame` being
within 6 frames — a *pre-emption*, not a reaction. `updateGrabHolds` ran the 11–18
frame clinch with no tech check at all, so CONTROLS.md's "a tech cancels any clinch
that had already started" was simply false. And an out-of-range →+LP silently became
the forward light, which is safe on block and advances 131–192 px/s: at close range
→+LP was a no-loss option-select (throw / tech / safe poke).

| Value | Before | After | Why |
| --- | --- | --- | --- |
| Throw reach | press gated at 119 (104 × the 1.14 scale); **contact by hitbox only, which reaches 152–167** | 119 at the press **and again at contact** (`THROW_RULES.grabRange`) | The documented 104px is now literally true. The old slop meant a throw pressed at the gate still landed after the victim had walked ~38 units away — a back-walk or a backdash could not escape a grab it had already seen. Command grabs (level THROW, kind `"special"`) keep their own authored reach untouched. |
| Where →+LP commits | inside 119 only; outside it, the forward light | out to **160** (`THROW_RULES.attemptRange`, 140 × the scale) | The 41-unit band between reach and commitment is the whiff risk. Every state gate is unchanged — a press during a blockstring is still the frame trap, never a whiffed grab. |
| Whiffed throw | could not happen | runs the full move + the 4.4 tax + the 4.5 re-arm gap | `WHIFF_RECOVERY_TAX.throw` (0.25) already existed; nothing had ever whiffed a throw for it to charge. |
| Tech window | 6 frames, all **before** contact | 6 before **+ clinch frames 1–7** (`DEFENSE_RULES.clinchTechWindowFrames: 8`) | 14 ticks ≈ **233 ms** — a reaction to the lift animation instead of a pre-emption of it, which is what the docs have promised since 1.1C. |
| Throw damage and knockdown | 15.1–20.9, unblockable, knockdown | unchanged | The fix is risk, not a nerf. |

Measured in the browser (deathblow vs jez, `__finalBlowQa.oki()` / `.tempo()`):

- Press distance sweep, holding forward: **91–135 connects** (the forward walk closes
  ~17 units during the 4–5 frame startup, so the contact gate is met), **140–160 is a
  whiffed grab**, **165+ is the forward light** (BODY CHECK, 10.3 damage, 27 frames).
- The whiffed grab costs 38 → **46 frames** (tax 8) plus the 4-frame re-arm gap = **50
  frames, 833 ms**, and `tempo()` reports `phase: "whiff", taxFrames: 8` with the
  **WHIFF** text at the hand. Per kit the tax measures 5–8 frames and the whole
  commitment 39–52 frames — always more than double a whiffed jab's.
- A defender who **backdashes** on the grab now escapes it: the throw whiffs (tax 8,
  `throwWhiffs` +1) and the two end 222 units apart.
- Clinch tech: pressing an answering grab on observed clinch frames **1–7 breaks the
  hold** (0 damage, `throw-tech`, `clinchTechs` +1); frame **8 and later does not**
  and the throw lands for its full 19.7.

The break reads and sounds different from the pre-contact clash so the two are not one
event: **CLINCH TECH** in green rather than THROW TECH in cyan, a 330 (vs 260) push
apart, a 24-frame (vs 18) throw-tech flash pose, foot dust off both bodies and a block
ring at the point the hold came apart. Audio is a new synthesised layer over the
reviewed `block` take (no take was regenerated, re-encoded or renamed):
`clinchTechBreakParams` in `engine/shared-sfx.mjs` is a band-passed rip sweeping
1750→520 Hz — *downward*, the opposite of the dash scuff, so the two never blur — over
two falling detuned square partials, drawn through `distinctDraw` so two clinch techs
in a row can never share a pitch.

### The CPU plays both sides of it

`engine/ai.mjs` gains three chances per difficulty — `meatyChance`,
`clinchTechChance`, `throwWhiffPunishChance` (0 for Passive, rising through the ladder
to 0.72 / 0.66 / 0.84 at FINAL) — and two pure timing helpers,
`meatyTiming(observation, frame, startup)` and `whiffedThrowPunish(observation,
frame)`, which compensate for the reaction delay exactly the way `justDefendHold`
does. Everything is read off the **visible** observation; the wake option is
deliberately not observable, because guessing it is the read.

Both new reads are timed windows far inside the 7–18-frame decision cadence, so
`stepAiBrain` re-decides on the next frame while the intent is `oki-approach` or
`clinched`. The *take* is latched once per knockdown (`okiTake`) and once per clinch
(`clinchTake`) — `roll` is a fresh RNG draw every tick in game.js, so re-deciding
every frame buys timing and never extra probability. The brain also stops grabbing at
the edge of the commit band: its own throws stay strictly inside `grabRange`, because
feeding a 50-frame whiffed grab would be free money.

Measured (headless, `__finalBlowQa.oki()`): a FINAL CPU against a static seat over
9,000 frames converted **5 of 11 meaty attempts across 13 knockdowns** and took the
whiff risk 7 times; against a scripted grabber over 6,000 frames the clinch-tech rate
was **2/17 rookie, 1/9 street, 6/9 final** — the authored 0.08 / 0.22 / 0.66.

QA: `__finalBlowQa.oki()` returns the two ranges, both tech windows, and per side the
wake clock, the meaty window, the live hurtbox count, which throw immunity the riser
is owed and the live clinch, plus the `meaties` / `clinchTechs` / `throwWhiffs` /
`wakeupTells` / `clinchTechBreaks` totals. `snapshot().fighters[i]` adds
`wakeupVulnerable`, `wakeupVulnerableFrames`, `throwKnockdown` and
`lastThrowInputFrame`, and `__finalBlowQa.fighter(side, …)` can now set
`throwInvulnerableFrames` for probe setup. Tests: `tests/depth-defense.test.mjs` (the
hurtbox split, the derived pin, the rise options, the immunity split, the commit band,
the clinch window, and the game.js wiring pins), `tests/tempo.test.mjs` (the whiffed
throw's per-kit tax and commitment arithmetic, the band vs the back-walk),
`tests/ai.test.mjs` (meaty timing, the latches, the whiff punish, and a proof the CPU
never grabs outside its reach), `tests/shared-sfx.test.mjs` (the break snap).
