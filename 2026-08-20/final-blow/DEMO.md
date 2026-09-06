# Watch Demo / Attract Mode

Final Blow 1.0E can run a complete CPU-vs-CPU exhibition from the title screen.

## Player experience

- `WATCH DEMO · CPU VS CPU` starts immediately.
- Both sides use the same delayed-observation, archetype-aware AI available to normal play, each on its kit's demo persona (5.4 — see below).
- Each exhibition is a normal best-of-three match: the timer, rounds, Grit, enhanced attacks, supers, knockouts, and character-specific Final Blows are unchanged.
- The director alternates a full-Grit showcase side and opens every card on one of four seeded OPENERS (walk-in super, throw, dash-in heavy, or a footsies feel-out) before the choreographer and the archetype AI take over; one card in four is ON THE CLOCK (see 5.4 below).
- Rounds end four ways — Final Blow A, Final Blow B, a plain knockout with the collapse and curtain call, or a decision at the buzzer — chosen per round by a seeded closer (5.4).
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
  round card and commits to its Final Blow promptly. The Final Blow ceremony
  itself is the showcase and is deliberately untouched; since 5.4 it is no
  longer EVERY round's ending (see "5.4 FIGHT NIGHT" below — the plain-KO
  hold went back to the full 4.9 s there). Every one of these is gated on
  `state.mode === "demo"`, so ranked/versus/arcade/tournament/online
  presentation is unchanged.
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

## 5.4 FIGHT NIGHT — how a round ends, how a card opens

The 5.4 sweep traced the attract loop the way a TV viewer sees it: 6
exhibitions, 16 rounds, seeds 237 / 1234 / 9001 in headless Chrome (a 5-tick
sampler over `qa.demo(seed)` → `qa.step` → `qa.status()` at every phase edge).
Every one of the 16 rounds ended the same way: Final Blow, variant A, ~17 s
after the bell. The clock never read below 80. No round was ever a plain
knockout, so the 5.3 KO collapse, the thud and the two-beat curtain call were
unreachable; no round ever reached 0, so the TIME OVER buzzer, the DECISION
banner, its stinger and the announcer's timeover bank were unreachable; the
second authored fatality of every fighter had never once played in attract
(AFTERSHOCK BURIAL, VINYL WRAP, WEST STAINES MASSIVE, YOU'RE FIRED!, INTERNET
MELTDOWN, HOOF STOMP…). And every card opened identically: walk-in, full-meter
super at tick 20-25 after the bell, 6 of 6. The ceremony was 25.5 s of every
74 s cycle — 34% of the loop was the same nine-second cut-scene.

Two causes, both in `aiInput`'s demo branch: `input.final` was set the moment
the winner's 0.35 s reaction clock ran out, unconditionally, and the AI input
never carried `finisherVariant`, so `tryFinish` always resolved type 0
(`resolveInput` had forwarded the field since 1.x; the demo brain just never
set it).

**The CLOSER** (`engine/demo.mjs demoCloserPlan`, called from `checkKnockout`'s
demo branch the tick the KO lands). Pure on the round state plus a session
ledger, so a seed replays the same show:

- match point (this round closes the match), a comeback (evening a match it
  was losing, won under half health) or a round won from the brink (winner at
  30 or less) takes the Final Blow;
- every other round lapses into a PLAIN KNOCKOUT: the winner steps off the
  fallen man, no FINISH THEM banner, prompt or "FINAL BLOW READY" cue is
  promised, the window is the 0.9 s KO freeze instead of 6 s, and `finishRound`
  lays the loser down (`koCollapseOnRoundEnd`) into the FULL 4.9 s curtain
  call — `DEMO_KO_HOLD_SECONDS` is `ROUND_WIN_HOLD_SECONDS` again, because
  the 3.1 s demo hold was a hold no attract round had ever reached and the
  second victory beat needs 3.4 s or more (`roundWinShowcaseCell`);
- when it does finish, the variant alternates per fighter through
  `demoSession.finisherLedger` (a sibling of `coverageCarry`, reset with the
  session), passed as `finisherVariant` on the AI input;
- a loser knocked out in the AIR is handed to the ceremony (`reason:
  "airborne"`): the plain path freezes him where he is for the whole hold
  (`koCollapseOnRoundEnd` lays down grounded fighters only), which is a
  feet-in-the-air read. Measured 10 of 63 rounds. Letting an airborne KO fall
  before the hold is a 5.3 bookends follow-up that would return most of those
  rounds to the plain path in every mode.

**The CLOCK card.** One card in four (`engine/demo.mjs` show stream: a
shuffled four-bag, never the first card of a session, never two in a row).
Both CPUs are built on the registered `demo-clock` tier, the choreographer
stands down (`DEMO_CLOCK_COVERAGE_BLEND` 0), the card opens on footsies with
no free Grit, the chip says ON THE CLOCK and the HUD clock starts at 30. The
number is measured, not chosen: the demo brain with more patience alone
ended clock rounds in 11-28 s (the coverage scripts were the aggressor — one
clock-tier round under a 0.3 blend was a perfect in 11 s); brain-only, still
10-50 s, median 27; an even more patient tier made no difference (median 24),
because the kit tables always swing inside the clinch whatever `patience`
says. A per-hit trace showed why 99 s can never be honest: a counter-hit
HEAVY HAND is 26.7, a SOUTH STREET SLAM 25 — five landed heavies is the bar.
The new `swing` knob on `selectKitAiIntent` (scales every attack roll in the
kit table; 1 everywhere but the clock tier, which runs 0.3) plus no
back-jump into the other brain's anti-air (`spaceJumpShare` 0) stretched
brain-only rounds to 16-104 s, median 36: 11 of 16 reach a 30 s buzzer. The
card gets two rounds to put a decision on the board, then its fighters go
back to the standard brain and the 99 s clock. The decision itself is the
w51/5.3 path untouched — the buzzer, "WINS · DECISION", the timeover stinger,
the announcer's timeover bank, no knockout groan.

**The OPENERS.** A standard card draws super / throw / dash-in from a seeded
three-bag (no two consecutive cards open the same way; the clock card's
footsies is the fourth). The throw walks all the way into grab reach and
throws through the partner's standing guard; the dash-in taps its dash from
430 px and lands a heavy off it against the partner's LIVE brain (so the hit
has to beat a real reaction); footsies holds both men off the buttons for 96
ticks of spacing — advance past 330, retreat inside 230, rock in and out of
the band between — the neutral read the sweep found the demo never had.
`superShown` in the snapshot now means "the opener has fired".

**Measured, 24 cycles (seeds 237 / 1234 / 9001 × 8), same sampler:**

    round endings   before 16 FB-A / 0 FB-B / 0 KO / 0 decision   (16 rounds)
                    after  26 FB-A / 18 FB-B / 16 plain KO / 3 decision (63 rounds)
    closer reasons  match-point 23 · plain 16 · airborne 10 · comeback 7 · brink 4 · clock 3
    clock cards     6 of 24; 3 put a decision on the board (the other three
                    ended with 7-11 s on the clock, the countdown already playing)
    openers         super 6 · throw 6 (the lead threw in 6/6) · dash-in 6 (dashed 6/6) · footsies 6
    first contact   super 30-40 ticks after the bell · dash-in 30-35 · throw 40-110 · footsies 100-235
                    (before: 20-25 in 6/6)
    ceremony        before 25.5 s per cycle = 34.3% of sim ticks
                    after  22.3 s per cycle = 30.7%; a Final Blow round is 9.2 s,
                    a plain knockout 5.8 s (0.9 window + 4.9 hold), a decision 4.9 s
    lowest clock    before 80-86 in every card; after 1 on every decision card

**A played match is byte-identical.** Every new site is reached through
`state.mode === "demo"` (`checkKnockout`, `aiInput`, `makeFighter`,
`finishRound`, `roundClockSeconds`) — pinned from source in
`tests/demo-round-ends.test.mjs` — and a PRO CPU-vs-CPU match
(`qa.aiFight("deathblow", "jez", "pro")`, 7200 ticks, FNV hash of every
fighter's x / y / health / meter / action / state per tick) hashes to
3450718304 before and after. `selectKitAiIntent` at `swing: 1` is asserted
equal to the authored table across all ten kits × 10 distances × 41 rolls.

`qa.demoCoverage()` now carries `show` (format, opener, tier, the opener's
tick and what it turned out to be) and `closers` (the session ledger, the
live plan, the last round end and a bounded log of every round end:
kind / variant / fatality id / reason / clock / format);
`qa.demoNextShow({ format, opener })` forces the next card's show tag for a
probe (`sticky: true` for every following card). `tests/browser-smoke.mjs
--only=demo-mode` walks a plain first-round KO (no fatality, loser down,
"WINS · KNOCKOUT"), the match-point Final Blow with the ledger banked, a
forced clock card (both brains on `demo-clock`, the clock at 30, ON THE
CLOCK on the chip, the buzzer's DECISION, the standard brain and the 99 s
clock back for the next round), then the 64-cycle marathon as before.

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

The rate is always on screen — since 5.4 as the small tag inside the demo's
broadcast bug (see *TV-safe and phone-safe*, below); training keeps the canvas
chip. The key legend is hidden by default and shows itself for nine seconds
after any transport key, below the floor line so it can never cover a
fighter, and never on a coarse pointer. (v4.0 armed it on every demo start so
the keys announced themselves; 5.4 demoted it — from the couch it was the
loudest demo-specific text on the screen.)

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

## 5.4 — personas and the Grit policy (Fight Night sweep #2 / #5 / #6)

The 4.3 spacing pass made the attract loop readable and, measured a year
later, anonymous. Three findings from the Fight Night sweep, all against the
same trace (headless, seeds 237 / 1234 / 9001, two exhibitions each, 15,205
fight ticks):

- **One brain for ten fighters.** Sampling `decideAiIntent` 3000 rolls per
  fighter per distance on the flat `demo` tier: EVERY fighter's top intent at
  90-200 px was `retreat` (50-78%) and at 260-520 px `advance` (50-62%). The
  1.6x widening plus its 230/130/340 px floors had folded the grappler, the
  zoner and the counter-puncher into the same yo-yo — deathblow backed out of
  the clinch he is built for, Donald walked in on the band his golf ball was
  authored for, and alan's authored counter (`backSpecial`, counterRange 172)
  fired on 12% of the swings he saw because the block roll ran first.
- **The exhibition was a moves reel.** 87.5% of executed moves were
  choreographer `lead` directives, each id fired once (no id more than 5 times
  in a match); the brain executed 33 of 313.
- **Grit sat unspent.** A side was at 100 Grit for 28-41% of the fight and
  14 of 32 round-ends (this trace's count; the sweep's 20 of 32 sampled at the
  roundover) still had the bar full. `super` waited its turn behind 29 other
  least-shown ids and the brain's standalone super was 0.26 per decision.

**Personas** (`engine/demo.mjs DEMO_PERSONAS`). Each kit's `ai` table now
names an archetype persona — grappler (deathblow), rushdown (benny, ali),
counter (alan), zoner (post, donald), footsies (jez, commissioner), trickster
(cyraxx), skirmisher (devil) — and `demoPersonaFor(kitId)` resolves it to a
registered `demo-<persona>` tier. `makeFighter` picks it under
`state.mode === "demo"` only; the flat `demo` tier stays registered as the
fallback for a kit that names none. A persona is a PRO brain with:

- the kit's OWN ranges (`spacingFloors: null`) and its own clinch line
  (`spaceRange` — 0 for the grappler and the rushdown, whose game is the
  clinch; 190 for the zoner);
- band weights that `selectKitAiIntent` now takes — `rangedWeight` opens a
  ranged share inside the mid and preferred bands (Donald's golf ball and
  Post's trap fire ON the band they were authored for, not only past
  `approachRange`), `pokeWeight`, `throwWeight`, `closeWeight`, `holdSlack`
  (a wider hold hysteresis so a zoner holds its range instead of stepping in
  and out of it every decision), `counterChance` and `counterFirstChance`
  (the authored counter answers the swing before the block roll);
- a `dashInChance` — an empty-handed walk-in from the approach band becomes
  a →→ dash pressed as a real double tap (neutral / toward / neutral / toward)
  inside `dashTapWindowFrames`;
- its own reaction / decision cadence, so the two seats stop deciding on the
  same tick by construction.

The 1.6x widening survives in exactly one place: the APPROACH band of the
three close-range kits (deathblow 82 px, alan 96 px, benny 92 px). They still
open from a readable distance and walk in — the walk-in is the point of all
three — but they fight at their authored range.

**The blend.** `DEMO_COVERAGE_BLEND` 0.8 → 0.55. The cumulative attract
ledger (`priorShown` / `carryover`) finishes the checklist ACROSS cycles —
pinned: three carried exhibitions of the same pair reach 30/30 for both
fighters where one falls short — so a single exhibition no longer has to,
and nearly half its windows go to the persona brain.

**The Grit policy** (shared by every persona; every knob is undefined on the
player tiers):

- `comboFollowup`: a full bar on a CONFIRMED hit is the super
  (`superConfirmChance` 0.92), ahead of the combo roll. The gate is the same
  confirm window the sim opens for a human (`fighter.confirmWindowFrames`,
  set at every contact site); the intent reads `grit-confirm`.
- the standalone super's share rises from 0.38 to 0.6 of `meterChance`
  inside `superRange`; a half bar converts the band's own action to its EX
  version at 0.8 instead of 0.5 — EX at the band, because it is the band's
  action.
- the choreographer: with a full bar the next pick is a CONFIRM OPENER — the
  least-shown normal that cancels into the super (`demoSuperConfirmIds`, read
  off the kit's cancel routes) — and `recoverStep` chains `super` into the
  sim's confirm window. A plain unstarted showcase is pre-empted for it the
  same narrow way the near-full stun bar pre-empts, and the steer is
  rate-limited to one per `GRIT_STEER_FRAMES` (240) so a bar that stays full
  can never starve the free lane or the air row. `stats.gritOpeners /
  gritLinks / gritPreempts` count it.

**Measured** (same harness, same seeds, 12,139 fight ticks after):

- brain-lane share of executed moves 10.5% → 24.9% (33 of 313 → 59 of 237);
  22 dash-in decisions where there were none.
- per-band identity, 3000 rolls: deathblow at 90 px `throw` 29% /
  `driveHeavy` 23% (was `retreat` 50%), at 140 px `driveHeavy` 43% (was
  `retreat` 77%); Donald at 420 px `commandSpecial` 48% and at 520 px 77%
  (was `hold` 62% / `commandSpecial` 15%), at 140 px `retreat` 70%; Post at
  420-520 px `backSpecial` 37-79%; benny/ali at 260-520 px `commandSpecial`
  45% + dash-in 13-20%, `retreat` under 4%; alan on a swing at 140 px
  `backSpecial` 60% (was 13%).
- Grit at 100: 27.8% / 41.4% of fight ticks → 23.0% / 22.8%; round-ends with
  a full bar 14 of 32 → 7 of 32; all 13 supers now come off the brain's
  confirm (40 `grit-confirm` decisions in the trace).
- walk reversals per fighter-minute on the sweep's metric: 28.5 → 29.1 —
  unchanged, and the breakdown says why. Split by lane it is brain 8.9 → 10.7,
  choreographer lead 16.5 → 11.7, feed 3.2 → 6.7; and of the 46 brain-lane
  "reversals" after, 23 are two walk ticks ≤2 frames apart with the same
  held intent (a cross-up or a slide flipping the sign, not a decision) and
  12 resume walking after a 60+ tick exchange. The brain's genuine step-in /
  step-out reversals are 11 in 12,139 ticks. The remaining number lives in the
  choreographer's approach / rock / alive scripts — finding #5's neutral
  budget, not the persona half.
- distance under 150 px 54.5% → 51.1%; Donald's brain decisions in his own
  260-450 px band 7% → 21%, Post's 4% → 14%. The choreographer's approach
  phase still walks straight into each move's band (finding #5).

Byte-identity for a played match: `tests/demo-personas.test.mjs` compares
`selectKitAiIntent` at default knobs against an inlined copy of the 5.3 body
over a 100k-cell grid (and the 4.3 spacing path), asserts every built-in tier
carries none of the persona / Grit knobs, that no player tier ever emits a
`grit-confirm`, `dash-in` or `counter-read`, and reads the `state.mode ===
"demo"` gate off `game.js`. A node pin of `stepAiBrain` over 4000 scripted
frames per fighter per built-in tier hashed identically before and after.
Determinism: `qa.demo(237)` twice in one page replays identical rows, coverage
and stats.

Verification: `node --test tests/demo-personas.test.mjs tests/demo-coverage.test.mjs`
(the coverage file gained the confirm-opener derivation, the Grit spend, the
cross-cycle ledger and a steer rate-limit pin; its single-exhibition blend pin
moved from `> 0.5` to `0.5..0.6` and the free-lane pin from every exhibition
to a majority, both with the reason in the comment) and
`node tests/browser-smoke.mjs --only=demo-mode` (each seat's `ai.difficulty`
is a `demo-*` persona and matches `demoPersonaFor` in the page).

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

## Prewarming the next pair (5.4 "Fight Night", sweep #26 / #27)

Two faults the demo sweep measured, both at the exhibition swap, both because
the pair was only known at the boundary (`startNextDemoMatch` was the first
and only place `director.next()` ran):

- **CINEMA 3D rebuilt both fighter rigs on gameplay frames at every swap.**
  Headless Chrome on the box's Radeon 8060S, balanced tier, five forced
  cycles: the cycle-start rAF callback cost 250 / 103 / 146 / 251 / 100 ms of
  main-thread JS and the first two seconds of each new pair had 15 / 7 / 10 /
  5 / 4 frames over 33 ms — pixel reads, alpha bleeds, mirror smears, normal
  maps and texture uploads for two fighters the 3D world had had ~40 s of
  idle roundover-and-result time to prepare. A returning fighter who swapped
  sides was rebuilt from nothing as well (side 0's disposal evicted his
  caches before side 1 asked for them: 22 banks built on that boundary
  against 11 for a same-side return).
- **On a cold host the first seconds of a new fighter were base fallbacks.**
  25 Mbps / 40 ms RTT with the cache off: cycle 1 fetched 23 MB and reported
  the pair's unified family ready 4.9 s after the cycle started, 214 fight
  ticks in; cycle 2 (both new) 2.1 s / 101 ticks; a cycle with one new
  fighter 1.5 s / 70 ticks. `armIntroArtHold` refused the demo outright, so
  there was not even the 1.5 s curtain a played match gets — the opening
  super guarantee played on the wrong generation of art.

**The director now answers `director.peek()`** — the next unordered pair, stage and
track without consuming them. Bag semantics are untouched: a refill `peek()`
performs is the refill `next()` would have performed a moment later, from the
same rng draws in the same order, and the side coin flip stays in `next()`, so
a director that peeks before every `next()` produces the identical cycle
stream and the identical rng state as one that never peeks (pinned across two
bag boundaries in `tests/demo.test.mjs`). Sides are deliberately not part of
the answer: a warm-up is per fighter, not per seat.

**The running exhibition warms that pair in its second half.** The trigger is
the top of round 2 (`resetRound`, demo-gated and resim-guarded), the result
hold is the fallback for a bout that never got there, and the 45 s idle
countdown is the first exhibition's window: the attract director is created
`DEMO_IDLE_PREWARM_LEAD_MS` (20 s) before the demo would start, its first pair
warms through the rest of the countdown, and `startDemo({ attract })` adopts
it (a cursor twitch re-arms the countdown but keeps the pending director, so
the demo that eventually starts is the one that was warmed; a played match
abandons it and releases its 3D banks). What a warm-up does, in order:

1. `preloadAuthoredBanks(ids)` — the 5.1 request-ordered plan (unified family
   first at `fetchPriority: high`, the per-beat motion banks, then the bonus
   banks), decode tracking included, so `qa.artReadiness(pair)` can say when
   the next pair is drawable.
2. `warmFighterAudio(ids)` — the voice pools from the audio manifest
   (`preload="metadata"`, then `auto` on the top-up) plus the announcer's
   `<id>-name` and `<id>-wins` banks. Existing takes only; nothing generated.
3. In CINEMA 3D, `renderer.prewarmFighters(descriptors)` every 250 ms until
   the swap: `FighterLayer.prewarmFighters` is incremental (a sheet that
   decodes later gets its bank on a later pass, a bank already held is left
   alone), keyed by fighter id, built through the same idle-slice chain as a
   live bank but at `PREWARM_PRIORITY` (20) so it always sorts behind live
   work, and with one extra step — the GPU upload (`renderer.initTexture`)
   on an idle slice instead of the first frame that draws the texture.
   `buildRig` adopts a matching set whole at the swap (the rig then owns the
   prewarm key too, so disposal cancels both), the outgoing pair is evicted
   after it, and a set that was declared and never adopted is swept once
   nobody declares it. A returning fighter is never duplicated: his rig
   trades seats in `update()` when the pair crosses sides.

**The demo honours the intro art hold like a played match.** With the warm-up
this is the cold first cycle's safety net rather than the attract loop's
rhythm; it wears a `LOADING · n / m SHEETS` chip on the demo HUD instead of
the full-screen curtain (a LOADING FIGHTERS card over an attract loop reads as
a broken cabinet from across the room), and it still hands the fixed-step
clock zero seconds, so the tick stream — and a seeded `qa.demo(seed)`, which
drives the clock itself — is untouched.

Everything here is render/network-side and gated on the demo session: the
sim never reads `demoSession.prewarm`, no warm-up timer touches the clock,
and `tests/demo-prewarm.test.mjs` pins every call site's gate from source, the
fighter layer's adoption / sweep / side swap through the mock host, and the
bridge. A played match on the base build and on this one hashes identically
after 30 s of `qa.aiFight` (three pairs), as does `qa.demo(237)` after 30 s
and `qa.demo(555)` across three cycles — measured in the same headless Chrome
as the numbers above.

The QA read is `qa.demoPrewarm()` — the peeked pair, its art readiness, the
active / last warm-up (reason, passes, when the art became ready, how many 3D
banks were started) and the 3D layer's report (`stats().banks.prewarm`,
`adoptedSides`, `sideSwaps`, `uploaded`).

Measured after (same harness, same box, the exhibition allowed to reach round
2 before the result was forced): see the numbers in the release notes /
commit body of this item — the swap-frame JS, the first-two-seconds long
frames, the boundary bank builds and the cold-profile first-fallback-cell
ticks are the four before/after pairs.

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

## Shareable exhibitions — `?demo=<seed>[&cycle=n]` (5.4 Fight Night, sweep #30 / #12)

The deterministic seed path has existed since 2.9 (`qa.demo(seed)`), but only
under the QA manual clock — `qa.demo(237)` sat at tick 0 after 1.5 s of wall
clock — and the two ways a viewer actually starts a demo both seeded from the
wall clock: two WATCH DEMO presses measured director seeds 1991900429 and
3442111718, and `?demo=237` at boot was ignored (title screen, `demo.active:
false`). When the owner saw a good exhibition on the TV there was no way to
show it again or send it. A seed link is the cheapest highlight a
deterministic sim can offer, so this pass wires the address, not a recording.

**The grammar** (`engine/demo.mjs`, pure: `parseDemoSeed`, `parseDemoCycle`,
`parseDemoBootRequest`, `buildDemoShareUrl`):

    ?demo=<seed>            boot straight into the seeded exhibition
    ?demo=<seed>&cycle=<n>  ...opening on card n of that seed (1-500)
    ?mode=demo              a random exhibition (the manifest jump-list shortcut)

A seed is an unsigned decimal (`237`, up to uint32) or a slug of up to 32
`[A-Za-z0-9_-]` characters (`fight-night`). The director hashes `String(seed)`,
so `237` and `"237"` are one show and a slug is as good a seed as a number;
an all-digit value is judged as a number only, so a seed past uint32 is
refused rather than re-read as text. A seed that fails to parse is **no demo,
never a different one** — a mistyped link lands on the title, where something
visibly went wrong, instead of on an exhibition that quietly is not the one
that was shared.

**One entry.** The boot router (next to the `?mode=` jump-list block in
`game.js`) does exactly what `qa.demo(seed, cycle)` does — `showScreen("title")`,
suppress the one immersive attempt (there is no gesture), then
`startDemo({ attract: true, seed, cycle, source: "url" })`. It is an ATTRACT
start on purpose: a link opens with no user gesture, so the attract rules for
audio apply unchanged (nothing tries to unlock, nothing warns), the result
hold shows the cabinet's board, and any press ends the show. `&cycle=n`
advances the director through the same `startNextDemoMatch` loop
`qa.demoCycles` runs, so `?demo=237&cycle=3` *is* `qa.demo(237, 3)`: same
pair, stage, track, choreography seed and match serial (measured: both open
ALI G vs CYRAXX on Janney Street, track 3, share link `?demo=237&cycle=3`).

**The bug.** `#demoHudCycle` now names the exhibition's address — `CYCLE 1 ·
SOMERSET SEPTA STATION · SEED 237` — and a COPY LINK button sits on the HUD
(`#demoShareButton`). It is the one thing in the HUD that takes a pointer
(the HUD itself passes them through) and the one press that must not read as
"the viewer wants out": the capture-phase `pointerdown` listener consults
`isDemoShareTarget` before `noteUserActivity`, and the click handler stops its
own propagation. `navigator.share` where the platform has it (a phone hands
the link to any app), the clipboard everywhere else, and when neither is
reachable the address itself goes into the bug for nine seconds so it can be
read off the screen. A random button/attract show is shareable too: the RAW
seed is kept on the session (`demoSession.seed`; the director only exposes
its hash) and the link is built from the page's own address with only the
exhibition on it — `renderer`, `fighters` and `speed` ride along (presentation
and cadence, never a tick), `debug`, a mode deep-link and any invite are
dropped. Measured in headless Chrome: a real pointer on the bug leaves
`demo.active: true` with the label flipped to LINK COPIED; the next pointer
on the canvas exits to the title as before. The bug is 70×28 px on a 1440
canvas and keeps a 26 px minimum on a phone.

**What a link promises, and how far.** The sim is fixed-step and the demo's
wall-clock callbacks only announce, so a real-time run replays the same ticks
— but only *within a card*. The 5 s result hold is a wall-clock timer, and
the QA manual flag drops on the result screen, so card 2 opens on a
wall-clock tick. That is why the link for the card on screen carries
`&cycle=n`: it opens that card cold, which is exactly what the next viewer
gets. Two things follow and are documented rather than hidden. A card reached
by `&cycle=n` opens with an EMPTY coverage ledger (the cards before it were
skipped, not shown), so its choreography can differ from the same card
reached by watching through — the link says "card n of seed s as a cold
open", and two loads of it agree. And a link copied from a button-started
demo on a page that had already played matches replays the same CARDS and
choreography plan but not necessarily the same ticks: only an explicit seed
rewinds `matchSerial`/rng/tick to cold, and the random path deliberately does
not (the announcer/crowd edge trackers key on `matchSerial:round`, and a
rewind under a played page could swallow a call already booked under that
key). A URL boot is always a cold page, so a link always replays exactly.

**The round ledger.** Comparing two runs "at the same moment" needs a moment
the SIM chose, not whatever frame a probe sampled, so `finishRound` books one
entry per settled round on the demo path only (`demoLedgerRound`: cycle,
round, winner, finisher type, the tick it settled on, both health bars, each
side's coverage count; bounded to 64, cleared with the session, read by
`qa.demoRounds()` and never by the sim). The pin (`tests/browser-smoke.mjs`,
probe `demo-seed-url`): two fresh loads of `?demo=237` and the QA entry, each
parked by the transport pause and stepped to tick 6000, must agree on the
ledger, the live coverage ledger and both fighters' state. Measured, all
three identical:

    seed 237 · card 1 · POST vs ALI G · Somerset
    round 1  POST   Final Blow A  tick  974  health 82.49 / 0      shown post 9  ali 4
    round 2  ALI G  Final Blow A  tick 2675  health 0 / 43.39      shown post 18 ali 15
    round 3  POST   Final Blow A  tick 4287  health 63.44 / 0      shown post 22 ali 23
    coverage at tick 6000: post 22 / 30, ali 23 / 30

The same three rounds settled on the same ticks with the same bars and
counts in two loads left entirely to the wall clock (129 s each, no stepping,
`&speed=1`, 129 s and 109 s of real time). In that pair card 2's first round
(DEVIL vs DEATHBLOW) also settled on tick 6346 in both loads with the same
bars — reported, not pinned: the card boundary is the 5 s wall-clock hold,
so that agreement is the frame landing the same way twice, not a promise the
probe makes. The promise is per card, and `&cycle=n` is how a link names one.

**Verification.** `node --test tests/demo-share.test.mjs` (10 tests: the
grammar's accept/refuse table, `237 == "237"` through the director, the
cycle cap matching `qa.demoCycles`, the boot-request precedence, the share
link round-tripping through the parser and dropping what it must, and the
`game.js` wiring pinned from source — the one-entry property, the router
sitting behind the online-invite branches, the raw seed on the session, the
demo gating of every new site, the pointer guard ordering, the HUD text, the
manifest shortcut). `node tests/browser-smoke.mjs --only=demo-seed-url` is
the tick-for-tick pin above. The played-match proof is the gating: the ledger
has one call site behind `state.mode !== "demo"`, the bug only exists inside a
HUD that only exists during a demo, and the router fires only on a parsed
request — a boot without `?demo=`/`?mode=demo` takes the branch it always
took.

## The sound of the attract show (5.4 Fight Night, sweep #19 / #22 / #24)

The attract loop is the mode that plays the most music and speaks the most
announcer lines, and until 5.4 it was the one mode with no rule for *when* it
was allowed to make its first sound.

**What was wrong**, measured in a cold headless Chrome (no gesture, the 45 s
idle attract, the default autoplay policy):

- The show started at 45.4 s and every audio path held on
  `demoSession.attract && !state.audioUnlocked` — except two synth paths
  (`perfectGuardTink`, `objectSound`) that called `unlockAudio()` themselves. At
  7.8 s into the exhibition the first PERFECT GUARD flipped the flag, and from
  then on the game hammered the browser: **364 rejected `play()` calls
  (`NotAllowedError`) and 68 `AudioContext.resume()` attempts with no
  activation** in one 35 s exhibition. With autoplay allowed (a kiosk flag) the
  same run joined 8.8 s in — bed, crowd and announcer arriving mid-exchange with
  the ROUND card already spent. The exit gesture never armed audio, so the
  next idle cycle was as silent as the first.
- The bed came from the director's own track bag, independent of the stage
  bag: **the stage's own theme played in 103 of 600 director cycles (17.2%)**
  — wildwood 14/100, cruise 16/100, the two tracks 5.3 generated for exactly
  those stages. And a 138 s exhibition against an 80 s track ran out and
  jukebox-advanced to the next file mid-round.
- Fighter voice takes came off a 1,2,3,1,2,3 cursor.

**What ships** (`engine/demo-audio.mjs`, pure; `game.js` wires it):

1. **An arming gate — cold / armed / live.** It advances only on a user
   gesture Chrome counts as activation (`gestureArmsAudio` reads
   `navigator.userActivation.hasBeenActive` where it exists; without it,
   Chrome's table: a key that is not Escape, a mouse press, a touch *release*).
   Gestures that arm it: any key or pointer on the title (the next idle cycle
   opens armed), the exit key/press during a show, the transport keys, and a
   **TAP FOR SOUND** chip on the demo HUD — the one element on that panel that
   takes a pointer — which arms without exiting. Once armed the show does not
   join mid-fight: it goes **live at the next ROUND card**. The chip reads
   SOUND AT THE BELL in between and disappears when the show sounds. A gesture
   that lands while a card is still up (before FIGHT!) joins that same bell.
   `attractAudioHeld()` is the ONE gate: `sound`, `impactAudioAllowed`,
   `playCrowdVoice`, `playMusicStinger`, `announcerSay`, `fighterTauntCue`,
   `perfectGuardTink`, `objectSound`, `syncMusic`, both render beds and every
   synth one-shot (through `audioContextRunning`) ask it. Nothing calls
   `play()` before a gesture — the autoplay rules are honoured, not bypassed.
2. **The bed is the stage's own theme.** `startMatch` runs
   `applyAutoStageMusic()` for the demo as well (a manual track pick is
   honoured exactly as in a played match); the director's track bag still
   draws, so every seed's matchup order is unchanged, but it no longer picks
   the bed. The demo's bed **loops** for the exhibition, and is **restarted
   under the ROUND card** when less than a round (30 s) is left on it, so the
   seam lands on the punctuation rather than in the fight. The 5.3 stingers
   fire in the demo the moment the gate is live (round start on both FIGHT
   edges; KO / TIME OVER / match-win on the round end when a round ends that
   way — the attract's Final Blow ceremony still returns null there by
   design). `stageMusicTrackIndex` now delegates to `engine/music
   stageTrackIndex` so the binding is a pinned fact.
3. **Fighter voice draws from the shuffle bag in the demo** (`drawFromBag`,
   the announcer/crowd/stinger contract: every take once per bag, never the
   same take twice running across the border) on `visualRandom`, so a demo
   seed replays the same takes; a played match keeps its cursor untouched.

**Where a viewer hears the first sound.** Cold load, no touch: the show is
silent and the HUD says TAP FOR SOUND. Tap it (or press anything — that exits
and arms the next cycle) and the chip reads SOUND AT THE BELL. At the next
ROUND card the announcer's ROUND call is the first thing heard, the bed fades
in under it over 1.5 s, then FIGHT! and the round-start stinger, then the
fighters. A page that already has a gesture behind it opens every attract
cycle with sound from its first card.

**Measured after** (same harness, cold load, default autoplay policy):

    attract start 45.4 s   chip TAP FOR SOUND   play() calls 0   AudioContext 0
    chip press at +35.5 s (mid-fight)   demo keeps running   chip SOUND AT THE BELL
    play() calls still 0   hasBeenActive true
    +18.0 s ROUND 2 card:  philly-after-dark.mp3 (somerset's own bed, fading in)
                           round2-2.mp3                 <- the first sound
    +1.41 s                roundstart-1.mp3 (FIGHT edge stinger)
    +2.27 s                fight-3.mp3, then heavy-swing / light-3 / counter-3
    rejected play() calls over the whole run: 0 (was 364)
    exit press -> title, gate armed, next cycle opens with sound

    stage/bed agreement: 100/100 director cycles (seed 237; was 17/100),
    100% per stage; 600/600 over seeds 1/237/1234/9001/42 in
    tests/demo-audio.test.mjs (the director's own bag: 103/600)
    demo voice takes (seed 237, 60 s): 25 takes, 7 multi-take banks,
    0 back-to-back repeats; seed 9001: 34 takes, 9 banks, 0 repeats

**A played match is byte-identical.** `qa.aiFight('deathblow','jez','pro')`
stepped 20 s in the base tree and in this one: the tick-stripped trace
(positions, health, meter, action per second) is identical; the same
comparison over 45 s agrees through the ROUND 2 card and then diverges in
*both* base-vs-base and base-vs-branch, because `resetRound` clears
`qaManualMode` and the render loop ticks the sim on the wall clock from round
2 — a harness limit, not a change. The source pins in `tests/demo-audio.test.mjs`
carry the rest: `demoRoundCard`/`demoBell` return before touching anything
outside the demo, the gate is only consulted behind `demoSession.attract`,
`bedFadeLevel` only leaves 1 inside the gate's opening, `fightMusic.loop` and
the voice bag are behind `state.mode === "demo"`.

**Known limits.** Gamepad buttons are not activation in Chrome, so a pad-only
viewer arms with the chip or a key. The take order of a seeded demo replays
exactly while the sim is manual-clocked (round 1 in QA); from round 2 the
render loop's own `visualRandom` draws interleave on the wall clock, as they
always have for the announcer and crowd bags.

- `node --test tests/demo-audio.test.mjs` — 17 tests: the gate's state
  machine (cold hold, arm mid-fight, live at the next card, join at an open
  card, armed pages, the exit gesture arming the next cycle), the chip copy,
  the activation table, the fade, the loop/bag scoping, the bed-restart
  decision, the 1.6 resolver, the 600-cycle stage/bed agreement, the bag's
  no-repeat rule, and the game.js wiring from source.

## TV-safe and phone-safe: the broadcast bug, the hold and the screensaver (5.4 Fight Night, sweep #10 / #28 / #31 / #32)

The demo is watched from a couch and from a phone, for hours, and it was
dressed for neither. Measured at 1440x900 on the 5.3 head: the show chip that
said who was fighting was a 469x23 px strip at an **8.35 px** font (9 px at
1080p) parked at 13% from the top, while the loudest demo-specific text on the
screen was the operator's 20 px `DEMO SPEED · 0.75x` canvas chip and a
three-line keyboard legend that came up for nine seconds at every demo start.
Three prompts told a spectator to do things that either did nothing or killed
the show: `ANY ATTACK / START · SKIP` in every intro and roundover (any input
exits a demo; the CPU seats refuse the skip), `FINISH THEM · LP = A · LK = B`
(nobody is holding a controller), and the legend itself on a touch screen. On
844x390 the canvas is `object-fit: cover`, so the chip painted at canvas
(26,106-138) landed at CSS y 27-48 — straight through CPU 1's Grit row
(measured at y 34-43) — the legend's third line fell at y 399 on a 390 px
viewport, and the phone media query hid `PRESS ANY BUTTON TO PLAY` outright:
with the touch controls and pause button gone in a demo, a phone viewer had no
visible way out. A hidden tab kept cycling (rAF stops but the 5 s result timer
fires), so the viewer came back to a different pair mid-intro with FIGHT!
already spent — reproduced: hide during the result hold, 5.4 s later the next
exhibition had started unseen (`matches 2, phase intro, tick 123`). And the
footer ticker was only ever written by the select screen, so an evening of
exhibitions all ran under `SOMERSET SEPTA STATION` whatever the stage bag drew.

`engine/demo-hud.mjs` holds the logic; game.js only wires it, and every call
site is gated on the demo session (pinned from source in
`tests/demo-hud.test.mjs`). A played match is byte-identical: the same
`aiFight('deathblow','jez','pro')` + 20 s trace checksums `844be2ee` at tick
1494 before and after, and the seeded demo (`qa.demo(237)` + 30 s) checksums
`fa9806cb` at tick 1800 before and after — nothing here reads or writes sim
state.

**The broadcast bug** (`#demoHud`, same ids the smoke reads). One stable corner
element, bottom-left over the reflection band where the legend used to sit,
so it can never cover a fighter: `WATCH DEMO · CPU VS CPU` + the rate tag,
the matchup in Impact, the cycle · stage and the one prompt a viewer can act
on. At 1440x900 it measures 424x66 px with an 11.2 px base and a 19.7 px
matchup line (about 26 px at 1080p — the old chip was 8.35); on the phone it
is 253x44 px inside the 390 px viewport, the rate tag sits at y 338-350 against
a Grit row at y 34-43 (no intersection, asserted in `mobile-landscape`), and
the prompt reads `TAP TO PLAY` because a coarse pointer has no button to
press. The rate tag (`#demoHudSpeed`) replaces the canvas chip in demos —
`0.75×` / `PAUSED` / `HELD`, toned — so CSS owns its place on every viewport;
training keeps the canvas chip exactly as it was. The legend is demoted:
hidden by default, nine seconds after a transport key, never on a coarse
pointer. The skip hint is gated on `!demoSession.active`, and FINISH THEM's
sub-line becomes `POST MOVES IN FOR THE FINAL BLOW` in a demo while the
player's string stays byte-identical (`FINISH_THEM_PLAYER_SUBLINE`).

**The hidden-tab hold** (`createDemoHold`). On `visibilitychange` (and when a
phone turns portrait) a running demo freezes: the render loop hands the
fixed-step clock zero seconds, the way the intro art hold does, so the tick
stream simply waits; the 5 s result timer is cleared with its remaining time
remembered; the FIGHT! plan keeps its callback and drops its timer. On return
the bug reads RESUMING for a one-second beat — the viewer sees a frame before
anything moves — then the remaining hold is re-armed and the FIGHT! plan's
`armedAt` is shifted by exactly the time held (folded into the plan, so a
second hold or the art hold's own shift composes). The hold is deliberately
not the speed transport's pause: no key releases it and the chip never says
PAUSED for a state the viewer did not choose. Measured in headless Chrome:
hide during the result hold → `phase held, resultRemainingMs 4999`, 5.4 s
later still `matches 1, screen result`; show → `resuming`; 1.4 s later
`live, resultScheduled true, heldMs 6451`; the next exhibition then starts
after the remembered 5 s. The `demo-hold` smoke probe pins the sequence.

**Screensaver hygiene.** Two idle clocks run off real presence (mouse
movement, transport keys — anything else exits): the pointer hides after 3 s
(`body.demo-cursor-idle`, cabinet-idle's rule, measured `cursor: none` at
4.5 s quiet), and after 12 s the bug tucks toward its corner at 45%, the
top/footer chrome dims to 55% and the fight HUD joins a slow 60 s drift
(`body.demo-idle`). The HUD clock restarts on every new exhibition, so each
matchup is announced at full strength first. The bug always rides a ~8 px
60 s orbit (burn-in), reduced motion kills both animations. The footer ticker
is written from `startNextDemoMatch` so it follows the stage bag, and the
title gets its own ticker back on exit. The wake lock is unchanged: held for
the whole demo, released with the tab, re-acquired on return.

Verification: `node --test tests/demo-hud.test.mjs` (the bug text, the rate
tag, the three prompt gates, the idle clocks, the hold machine and its shift
arithmetic, the source pins); `node tests/browser-smoke.mjs
--only=fighter-framing-desktop,demo,mobile-landscape` (the `demo-hud` probe
measures the bug's corner, size and prompts at 1440x900, the ticker follow and
restore; `demo-hold` walks a hidden tab through hold → resuming → live;
`mobile-landscape` asserts the tag/Grit-row separation and the touch prompt at
844x390). The framing probe is listed because `mobile-landscape` reads its
desktop numbers.
