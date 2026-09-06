# Watch Demo / Attract Mode

Final Blow 1.0E can run a complete CPU-vs-CPU exhibition from the title screen.

## Player experience

- `WATCH DEMO · CPU VS CPU` starts immediately.
- Both sides use the same delayed-observation, archetype-aware `Pro` AI available to normal play.
- Each exhibition is a normal best-of-three match: the timer, rounds, Grit, enhanced attacks, supers, knockouts, and character-specific Final Blows are unchanged.
- The director alternates a full-Grit showcase side and briefly brings both CPUs into range, guaranteeing one opening super before normal archetype AI takes over.
- Results remain on screen for five seconds before the next exhibition begins.
- Keyboard, pointer/touch, or gamepad input exits to the title immediately.
- `IDLE WATCH DEMO · 45 SECONDS` in Options enables or disables automatic attract mode. It is enabled by default and never tries to bypass browser audio-autoplay rules.

## Nonrepeating director

`engine/demo.mjs` uses deterministic shuffle bags:

- all 28 unordered eight-fighter matchups play before a matchup repeats;
- fighters are randomly assigned to the left or right side;
- every stage and all six soundtracks are exhausted before their bags refill (four until 5.3; the wildwood and cruise beds joined the rotation with the two new stage tracks);
- bag boundaries are repaired so the previous matchup, stage, or soundtrack cannot repeat immediately.

The director retains only the current bounded bags, so it does not accumulate match history during long unattended runs.

## Coverage choreography (2.9 FLOW)

`engine/demo-choreo.mjs` layers a deterministic choreographer over the two
demo CPUs so every exhibition works through the featured pair's entire kit
instead of whatever the archetype tables happen to roll:

- Per-fighter checklist: all punch/kick normals (standing, crouching, air),
  the forward command normals and overhead, every special, every EX version,
  the super, the grab, the personal throwable (base + EX) — plus staged beats:
  wall splat, juggle, counter-hit, dizzy, knockdown/wake-up, guarded contact,
  taunt, both dashes, all three jump arcs and the stage-weapon pickup where
  the stage plans one.
- **Two lanes.** Each side either LEADS a showcase of its own, FEEDS a beat
  that needs a partner (block for guarded contact, swing into a counter-hit,
  walk into a throw, brace for a stun string or a corner herd, plant for a
  cross-up), or is handed straight back to the archetype brain. Both fighters
  can be showcasing at once, and the feed role is an active script.
- **Nothing stands still.** Guarding in this sim is SF2 directional and the
  sim pins `vx` to zero for a crouch and for a directionless guard, so a
  fighter holding either is a literally frozen sprite. Every idle and feed
  mode therefore carries a direction — the fighter blocks WHILE stepping —
  crouches are capped at a few ticks and never run back to back, and the
  liveliness watchdog judges "did the sprite move" (grounded, free, `|vx| < 3`,
  not dashing) on a nine-tick fuse instead of counting a crouch as motion. It
  only ever replaces a NEUTRAL input, so a press, a held direction or a crouch
  a showcase deliberately asked for is never disturbed. The scripts that used
  to wait — the counter-hit bait, the juggle launch, the pressure and corner
  strings standing over a downed victim, the guard feed's whole lease — rock
  on the spot inside the window they have to hold instead of freezing.
- **Interruption is not failure.** A showcase that takes a poke mid-approach
  used to be abandoned on the spot, which was both the largest single source
  of abandoned directives and the visible "approach, pause, reset" cadence.
  It now rides the punishment out with its budget PAUSED and resumes its
  approach, giving up only after a sustained grace.
- **Cancel chains only off a confirmed hit.** `combos.mjs canCancelAttack()`
  bails on an empty `attackConnected`, so a link pressed blind behind a WHIFF
  could never come out: the directive waited out its chain window having shown
  nothing. Measured over twenty exhibitions that single mistake was 199 of 316
  abandoned directives. The sim's own confirm flag is now the gate, checked
  once per tick while the swing is still animating.
- **Showcases open during their own recovery.** The sim buffers a press for
  six frames and fires it the instant a recovery ends, so a directive whose
  spacing is already right arms its press through the tail of the previous
  swing instead of waiting for the fighter to be free and only then starting
  to walk. Jumps and dashes still wait for a genuinely free fighter.
- **Throughput.** A directive ends the tick its move comes out rather than
  holding the pipeline through the whole recovery; the gap between directives
  is 0-3 ticks; timeouts are per-kind; and a confirmed hit chains the next
  unshown checklist item into the sim's cancel window, so a light → heavy →
  special string shows three entries in the animation time of one and a half.
- **Staging distances are derived**, not constant: each move's band comes from
  its own authored hitboxes (near edge to 90% of real reach, scaled and offset
  by the defender's hurtbox), with the SF2 proximity-grab range carved out of
  the forward-light bands so a showcase never silently converts to a throw.
- **Motion hygiene.** The forward and crouching command normals share their
  terminal button with ↓→+PUNCH, →↓→+PUNCH and ←→+KICK, and the recogniser
  bridges an 18-frame gap, so a stale `down` token from the previous showcase
  used to convert them into command specials. Each of those presses is now
  preceded by ~22 ticks of one steady direction (or a plain crouch), which is
  also the step-back-step-in these normals want on screen.
- Selection biases strongly toward the least-shown item, breaks ties with the
  cumulative attract ledger and then by spacing (an item already in range
  costs no approach), with a 80/20 blend against untouched Pro-AI windows so
  it still reads as a fight. Situational beats are staged opportunistically
  (downed opponent → taunt, grounded weapon → pickup and USE, cornered
  opponent → wall splat, filled stun bar → dizzy string, meter → super/EX),
  and every staged beat has an attempt budget with backoff so a spectacle the
  geometry will not allow right now can never starve the move checklist.
- **The spectacles ride the move lane, not their own.** A wall splat needs the
  victim against the clamp with the hit still carrying >220 vx, and a dizzy
  needs a hundred stun points at nine a light against a 0.62/frame decay —
  neither is something an exclusive directive can build from nothing, and in
  the first pass every attempt cost the kit a showcase and still only reached
  half the exhibitions. Both are now built for FREE: while either is unshown
  the picker prefers, among the equally-least-shown candidates, the entries
  that push the victim toward the wall they are already nearest or that carry
  stun; once the bar is nearly full or the victim is genuinely cornered a
  CLOSER tier takes the finishing move outright. The beat scripts themselves
  throw the least-shown checklist entry that serves them (the corner herd used
  to hammer one drive heavy 134 times across twenty exhibitions for no new
  coverage), so building a spectacle costs the kit nothing.
- **The movement beats repeat.** The authored dash-brake cell draws on a
  dash's last two ticks and the turnaround key for the 2-3 latch ticks after a
  grounded facing flip, so a one-shot ledger bought them 0.12% and 0.17% of an
  exhibition. Dashes and cross-ups now come back on a cooldown with their own
  offer share, and the idle script can dash on its own.
- **The attract cycle is cumulative.** A three-round exhibition is ~40 seconds
  of actual fight time per side and 30 moves is ~22 seconds of pure animation
  before movement, jumps, hitstun and knockdowns — so one match honestly shows
  a median of ~18 of 30 per fighter. The session therefore banks each
  exhibition's coverage per fighter and a returning fighter opens with what
  the cabinet has NOT shown yet: measured over a 16-exhibition attract run,
  every fighter with 3+ appearances reaches 30/30, and 2 appearances reach
  26-30.
- The AI brain still observes every tick; a scripted directive merely outranks
  its input. Fully deterministic: a private rng seeded from the demo cycle,
  no `Math.random`, `state.rng` untouched, and no leaks into ranked/vs CPU
  behaviour (everything is scoped to `state.mode === "demo"`). The one sim
  hook is demo-only too: an attract round pulls the stage weapon's arrival
  forward, because a weapon planned for the ordinary 16-62 second contest
  window never arrives before an exhibition KO.
- **Demo-only pacing.** An exhibition measured 54% actual fighting; the rest
  was the round card, the FINISH THEM window the winning CPU spent waiting out
  its ordinary reaction clock, and the ceremony. The attract loop shortens the
  round card, holds a plain KO a little less and commits to its Final Blow
  promptly. The Final Blow ceremony itself is the showcase and is deliberately
  untouched. Every one of those three is gated on `state.mode === "demo"`, so
  ranked/versus/arcade/tournament/online presentation is unchanged.
- **Same-page determinism.** Every match seed derives from `state.matchSerial`
  (`seedMatch`), which only ever grows across a page's lifetime, so a second
  `qa.demo(555)` used to replay the same choreography against a different sim
  stream. A SEEDED demo — the QA reproduction path, never the attract loop —
  now rewinds the serial and both rng streams to exactly their cold-load
  values, so a cold load is byte-identical to what it always was and a repeat
  in the same page matches it.
- `window.__finalBlowQa.demoCoverage()` returns the live ledger: featured
  pair/stage, per-fighter move counts, beat counts, both lane roles, the
  per-item pick tally, the cumulative session ledger and the matchup keys the
  session has already featured. `stats` also carries the round-2 diagnostics:
  `abandonedBy`/`abandonedKind`/`abandonedItem` name WHY a directive ended
  without its move, `substituted` catches a press the sim resolved as a
  different move, and `interrupted`/`resumed`/`stunLanePicks`/`pushLanePicks`
  measure the ride-out and the free lane.
- **Boss spoiler (deliberate).** On a locked cabinet the attract cycle
  features 9 of the 10 fighters: the Commissioner is the arcade boss and the
  roster only contains him once he is unlocked, exactly as on the select
  screen and the ladder. Attract does not get a private exception to that
  reveal. Once unlocked he joins the rotation and all 45 matchups play.

## The fourth pass (2.9 round 4)

Four defects the third critic panel left open, and what each turned out to be.

- **The air row was invisible.** Across 16 fighter-slots of the real sim
  (5 exhibitions on seed 1234 + 3 on seed 9001) `airLightKick` fired in 6,
  `airHeavyKick` in 4 and the rest of the row in 6-7. None of it was the sim's
  fault. (1) The closer and the free lane both narrow the least-shown pool to
  `PUSH_LANE_IDS` / `STUN_LANE_IDS`, and no air normal is in either set —
  while wall splat and dizzy stayed unshown, which was most of the
  exhibition, that narrowing was live for a majority of picks. (2) An air pick
  was DISCARDED outright when the fighter was in its own recovery tail, which
  is exactly when the pipeline deliberately starts showcases; `jump` is a
  buffered action, so it never needed to be. (3) An air NORMAL took its jump
  direction from the least-shown jump ARC beat, so it was regularly thrown out
  of a back or neutral jump — and the approach guard only ran for forward
  arcs, so nothing closed the gap either. The row now has a reserved share of
  the picks while it is still owed, starts from `stageable`, always jumps
  toward, and re-arms its press every airborne tick instead of once at
  rise + 6. Result: 15-16 of 16 slots for every one of the five.
- **Wall splat was chasing the wrong physics.** The herd's slam pressed
  `driveHeavy`, which qualifies for a corner wall bounce on NONE of the nine
  kits, and the raw `|vx| > 220` route needs the victim inside ~40px because
  hitstun bleeds the carry 10% a tick. The deterministic route is the ARMED
  bounce: a heavy/special-kind move carrying knockdown / knockdownOnFinal /
  launchVelocityY, landing while the victim is within ONE BODY WIDTH (105px)
  of the wall it is being driven toward, sets `carryVelocityX` 680 and the
  clamp then always fires `spawnWallImpact`. The slam set is now derived per
  fighter from `qualifiesForWallBounce` (7-11 ids each), the herd commits at
  the arming distance rather than a guess, and the slam lines up on its own
  band before pressing — eleven slam presses in one exhibition had previously
  produced zero splats because a sweep was being thrown from 215px.
- **The stun string was a series of pokes.** Each poke costs press, recovery
  and a re-approach — 55-70 ticks, against `STUN_RULES.decayGraceFrames` of
  48 — so the bar decayed between every hit and handed back 4-14 of the 17-20
  it had just gained. Whether the string leaned on lights or heavies barely
  mattered. A CANCEL has no such gap: `combos.mjs` opens the route the tick
  the sim confirms a hit, and the link lands inside the victim's hitstun. The
  string now opens with the kit's fastest stun carrier and cancels into the
  biggest non-knockdown hit it owns (a sweep would hand the decay the whole
  get-up). Measured peak stun across six exhibitions went 17-65 to 71-98.
- **A dominated fighter finished at 6 of 30.** Seed 1234 match 5: jez spent
  the exhibition in hitstun, so `stageable` was false whenever the pipeline
  looked at him and every directive he started was abandoned as `punished`.
  No pick-side tuning reaches that — the problem is that the other fighter
  will not stop hitting him. The attract loop is a showcase, not a
  competition, so the choreographer now watches the coverage gap (with the
  health gap as the early warning) and YIELDS the leading side: it keeps
  moving and defending but stops spending the stage, while the trailing side
  loses its natural-window roll and its decision gap entirely. Duty-cycled, so
  a leader never goes passive for a whole round, and moment beats are taken
  ahead of the yield so a perishable window is never thrown away for it.
- **The turnaround counter was lying.** `observe()` counted every grounded
  facing flip, but `fighterPoseDescriptor` only reaches the authored pivot
  when the flipper is grounded, not attacking, and not in hitstun / blockstun
  / knockdown / wake-up / a grab / dizzy. Most recorded flips were in exactly
  those states, so `qa.demoCoverage()` reported the beat FIRING while
  `motion2:5` drew for zero frames. A flip is now only banked when
  `turnaroundBlocker()` says the pivot could have reached the screen, and the
  rejects are recorded by reason in `stats.turnaroundBlind`. The check is a
  pure state test on the same view the picks read, so determinism is
  untouched. The RENDER-VERIFIED half lives in `game.js` as a cumulative
  per-cell draw tally (`presentationDebug.motion2CellDraws`, surfaced as
  `qa.demoCoverage().cellDraws` and `qa.probe().violence.motion2CellDraws`) —
  instrumentation only, never read back by the sim, the choreographer or any
  pose decision. Measured on the real-time burst harness: `motion2:5` draws 33
  times in 6000 rendered frames (0.55%) on seed 1234 and 28 in 4500 (0.62%)
  on seed 9001, against ZERO before.

Any cell-level claim about this module has to come from the real-time burst
harness (one `qa.step` plus one awaited `requestAnimationFrame` per tick). A
purely synchronous step loop never lets the authored banks decode or the
renderer run, so it can only ever support sim-state claims.

## Adjustable demo speed (3.2)

`engine/demo-speed.mjs`. Rates **1x / 0.5x / 0.25x / 0.1x**, plus pause and
single-frame step.

| Control | |
| --- | --- |
| `[` / `]` | one notch slower / faster |
| `1` `2` `3` `4` | jump straight to 1x / 0.5x / 0.25x / 0.1x |
| `\` or `Space` | pause / resume |
| `.` | advance exactly one sim tick (pauses first if running) |
| `?speed=0.25` | set the rate from the URL |
| `qa.demoSpeed(rate)` · `qa.demoPause()` · `qa.frameStep(n)` | the same three controls |

The rate chip is always on screen. The key legend shows itself for nine
seconds at the start of every demo session and again after any transport key,
below the floor line so it can never cover a fighter. Arming it on the session
start is what keeps the controls discoverable: 3.2-3.5 armed it only from the
retired A/B exhibition's entry point, so in an ordinary WATCH DEMO the keys
worked but never announced themselves.

**It scales the TICK CADENCE, never dt.** Every frame count in this sim is an
integer number of 1/60s ticks and every physics integration is written against
`SIMULATION_STEP_SECONDS`; a smaller dt would move all of it at once and two
peers integrating identical inputs at different dt is the definition of a
desync. So the rate multiplies the WALL-CLOCK SECONDS handed to
`FixedStepClock.advance`: the accumulator crosses `stepSeconds` proportionally
less often, and every tick it does take still runs at exactly 1/60s. Rendering
keeps running at the display rate (the presentation already interpolates off
`state.simulationAlpha`, which the smaller accumulator advance drives for
free). The tick STREAM is identical at every rate — same ticks, same order,
same dt — which is why three seeded demo runs at 1x, 0.25x and 0.1x
produce bit-identical state after 240 ticks. Frame-step runs the same fixed
step through the same driver, one tick per rendered frame, capped at four a
frame so a held key cannot dump a burst.

Scoped to `state.mode === "demo"` and `"training"` and refused outright for
online (twice: by mode and by an active session role), for replay playback
(its own transport) and while `qaManualMode` owns the clock. The transport also
defers to any key the player has bound, to a rebind capture in progress and to
a focused text field, so it can never steal an input that belongs to something
else.

## Verification

- `node --test tests/demo.test.mjs` checks determinism, full matchup coverage, stage/track rotation, boundary behavior, invalid configuration, and 10,000 bounded cycles.
- `node --test tests/demo-coverage.test.mjs` runs the choreographer against a
  sim-lite world (`tests/demo-mock-world.mjs`) and asserts 100% kit-move
  coverage plus every staged beat for the featured pair inside a bounded run,
  checklist completeness for all ten fighters, deterministic replay of the
  ledger, and the ten-fighter/six-stage rotation property. It also pins the
  2.9 second-pass fixes: a directive-throughput floor, at least one cancel
  chain, the fifteen moves the first pass never reached (the crouching and
  forward command normals, every air normal, both throwables), the motion
  beats that drew on zero ticks (guarded contact, both dashes, crouch
  transitions, the neutral jump, air attacks, the weapon pickup), per-move
  staging bands derived from real hitboxes, and the cumulative attract ledger.
  The round-2 naturalness contract is pinned there too, each assertion against
  a number the critic panel measured: an inertness ceiling per side plus a cap
  on the longest continuous still run, a directive completion floor, a
  single-exhibition coverage floor and median, the free lane that builds the
  stun string and the wall carry out of checklist moves, the rule that a
  cancel chain is never pressed off a whiff (the sim-lite world can switch
  confirms off), and repeatable dashes for the authored brake cell.
  The round-4 contract is pinned there as well: every one of the five air
  normals firing in every exhibition plus the reservation that makes it
  reachable, a floor on the TRAILING fighter's column and a cap on the gap
  between the two, a ceiling on the yield's duty cycle, the
  `turnaroundBlocker` truth table plus the requirement that blind flips are
  recorded rather than counted, the derived wall-slam table (which must never
  contain `driveHeavy` — it converts on no kit), the derived stun string
  (no knockdowns, no held directions, every link a legal cancel target), and
  both spectacles reaching a real share of exhibitions.
  `tests/demo-mock-world.mjs` was corrected in the same pass: it now models
  the ARMED corner bounce (it previously only modelled the secondary
  `|vx| > 220` route, which is why a herd of drive heavies looked like it
  worked), the real 48-frame stun decay grace, per-kit knockdown data read off
  the actual attack instances rather than a shared action-name list, and
  confirmed-hit cancels — without which the stun string the fix depends on
  would have looked impossible in the harness.
- `node tests/browser-smoke.mjs` checks two live AI brains, automatic Final Blow activation, result scheduling, 64 rapid cycles with one bounded intro timer, input-to-exit, mobile HUD bounds, hidden touch controls, and offline precaching.
- `node --test tests/demo-speed.test.mjs` pins the 3.2 contract: that the
  speed control is a tick-cadence multiplier and never a dt change (every tick
  is asserted to run at `SIMULATION_STEP_SECONDS` at every rate, and the tick
  stream is asserted identical across all four), that 0.5x/0.1x hit their
  cadences, that pause holds and frame-step advances exactly one tick per
  request with a burst cap, that the transport is scoped to demo/training and
  refuses online, replay and an out-of-scope context, the `?speed=` parser and
  the rate ladder, plus the choreographer's locomotion bias: that a mirror pair
  is a legal matchup, that `locomotion: 0` is byte-identical to the shipped
  attract choreography (rng included), that the bias spends a real share of
  ticks walking without abandoning the move checklist, and that it replays from
  its seed. The game.js call sites are asserted from source, because the
  scoping is the part that must never regress.

## 4.3 — demo spacing

Attract-mode CPUs run the registered `demo` AI tier (`engine/demo.mjs`): a PRO
brain with every kit range widened 1.6x (floors 230 / 130 / 340 px), the
mid-band pokes thinned (`patience` 0.55), slower decisions (12 frames), fewer
combo chases, and a gap-opening rule in `stepAiBrain` (back-jump or back-walk
when deep in the clinch with nothing incoming). `selectKitAiIntent` takes
`spacing` / `patience`; every other tier passes the defaults, so human-facing
AI is unchanged. Measured with the session's `fb-gap.mjs` probe (60 s, seed
237): mean gap 149 → ~155–205 px, time under 150 px 70% → ~30–57% depending on
the matchup — attacks still lunge in; that is the game's pushback doing its job.

## CPU Block War and the authored trial demos (5.1, sweep #32 / #33)

- **Team Battle vs CPU.** The Block War no longer needs a second seat: after
  P1's three picks the select screen offers `VS CPU · AUTO-DRAFT`, which draws
  three fighters P1 did not pick (`draftCpuTeam`, `engine/modes.mjs`), reveals
  them with the lock-in stamp and raises the difficulty bar. The CPU side runs
  the same archetype-aware AI as arcade at the chosen difficulty; eliminations,
  carried health and the walk-ins are unchanged. `VS PLAYER 2` is the old path.
- **Trial demos for all ten kits.** `WATCH DEMO` in the lab plays an authored
  input script for every trial of every fighter; the Pinelands Devil and the
  Commissioner had no trials to demonstrate. Each now carries eight (two
  authored bronze trials plus the six generated from the kit), and each demo was
  run through the real sim to completion before shipping.

## "What just happened" — the last-fight digest (5.3, sweep #30 / #31)

The records store has always answered *how have I done overall*. Nothing
answered *what just happened*, which is the only question a player has while the
WINS card is still on screen — and it is also the question the FIGHT SCHOOL
lesson graph needs answered before it can recommend anything.

**The digest is the single-match companion to the records store**
(`engine/progression.mjs`): same shape rules — plain data, tolerant load, no
clock, no `Math.random`, no sim reads — written at the same fold point
(`progressionMatchEnd`, once per `matchSerial`, behind the same
`rollbackResimulating` and CPU-seat guards), and kept in one localStorage slot
(`final-blow-last-fight`) so the title screen can still coach after a reload.

**Damage is attributed at the damage sites, not at round end.** The health delta
`progressionRoundEnd` folds cannot know *what* took the health, so
`progressionNoteDamage` now carries the amount and the attack's own flags and
`classifyDamageCause` resolves exactly one cause per landed hit, first-true-wins:

    blocked → chip · throw → throw · stage weapon → weapon · throwable → jawn
    super → super · special → special · air → jumpIn · low → low
    overhead → overhead · heavy → heavy · else → light

A blocked hit is chip whatever threw it; a stage weapon outranks the jawn
machinery that carries it. The four call sites are the paint trap, the
projectile, the throw and the main strike — `tests/onboarding-depth.test.mjs`
counts them from source and asserts every one passes an `amount`, because a
site added without one would silently under-report and nothing would fail.

Three signals have no single sim event and are sampled elsewhere: `meterPeak`
and `weaponOffered` once per frame in `updateHud` (already resim-exempt by its
first line), and a Perfect Guard books its own block at the guard site, because
it deals nothing and therefore never reaches the damage path — without that, a
flawless defensive round would have read as "never blocked".

Measured end-to-end in headless Chrome (jez vs deathblow, seven heavies, three
sweeps and a throw driven onto a standing P1, then two round wins):

    damageBy  { heavy: 73.2, low: 16.2, throw: 19.7 }
    hitsBy    { heavy: 4, low: 1, throw: 1 }
    hitsTaken 6 · blocks 0 · knockdownsTaken 1 · meterPeak 46.8 · damageTaken 109.1

    result line   WHAT JUST HAPPENED · 67% OF THE 109 DAMAGE YOU TOOK
                  CAME FROM HEAVY NORMALS · 4 OF THEM.
    coach card    NEXT · LESSON 2 · HIGH & LOW GUARD
                  YOU BLOCKED NOTHING ALL FIGHT. 109 DAMAGE WALKED STRAIGHT IN.

Ties in `topDamageCause` break on `DAMAGE_CAUSES` order, so two loads of the
same digest always agree; a fight where nothing landed says so rather than
dividing by zero, and a flawless one says FLAWLESS. The recap and the coach card
are suppressed wherever the digest is not the player's own fight — demo, replay,
tournament, online, and any flow with the CPU in seat 0, the same set the
records fold already refuses.
