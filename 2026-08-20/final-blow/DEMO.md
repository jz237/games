# Watch Demo / Attract Mode

Final Blow 1.0E can run a complete CPU-vs-CPU exhibition from the title screen.

> **5.4 "Fight Night"** (2026-09-06): the attract show became a card of fights —
> the seeded closer and the CLOCK card, per-archetype personas and the Grit
> policy, the attract audio gate, the TV-safe broadcast bug and the hidden-tab
> hold, the next pair's warm-up, `?demo=<seed>` links, the camera and cadence
> director, the versus card and ring introduction, the session layer (tonight's
> card, stories, the ledger and standings), the lower third, and the neutral
> budget with the okizeme family. Each has its own section below.

## Player experience

- `WATCH DEMO · CPU VS CPU` starts immediately.
- Both sides use the same delayed-observation, archetype-aware AI available to normal play, each on its kit's demo persona (5.4 — see below).
- Exhibitions run as a CARD OF THE NIGHT (5.4 session layer): four one-round QUICK BOUTS on the undercard, a best-of-three CO-MAIN EVENT and a best-of-five MAIN EVENT, then a new card. Inside a bout the timer, rounds, Grit, enhanced attacks, supers, knockouts, and character-specific Final Blows are unchanged.
- Every card tells a seeded STORY — GRUDGE MATCH, ROOKIE VS VETERAN, SHOWBOAT, ZONING WAR or THE CLOCK — which names its opener (walk-in super, throw, dash-in heavy, a footsies feel-out, or none), which side leads it, how each side is allowed to yield and which per-seat tier plays over the archetype persona; the story and the bout are on the broadcast bug (see 5.4 below).
- A session ledger carries wins, losses, streaks and round scores across bouts; the standings board persists in localStorage per build, and the result hold is a NEXT UP panel (score, tonight's records, the standings band, the next matchup, a sign-off line).
- Rounds end four ways — Final Blow A, Final Blow B, a plain knockout with the collapse and curtain call, or a decision at the buzzer — chosen per round by a seeded closer (5.4).
- Results remain on screen for 2.4 s (the countdown is real, and the announcer
  reads the next pair's names from their reviewed name takes), then the next
  pair is introduced on a versus card over a 2.6 s clock stop before ROUND 1
  (5.4 Fight Night, below).
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

## The session layer: tonight's card, the stories, the ledger (5.4 Fight Night, sweep #3 / #11 / #14 / #15 / #16 / #25)

Nothing carried across cycles and every exhibition had the same skeleton.
Measured on the 5.4 head (headless, seeds 237 / 1234 / 9001 × 4 cards,
`qa.demo(seed)` stepped to every result): 12 of 12 exhibitions were
best-of-three (mean 75 s of sim, 54-96), the first result of a WATCH DEMO
press came 64-71 s in, the leader's yield ran 12-27% of every card's fight
ticks (the choreographer's one fixed tolerance, whoever was fighting), the
showcase side strictly alternated, taunts were 0-2 per fighter per card,
and the result screen read `WATCH DEMO · CYCLE 1 / POST WINS / WET PAINT /
a quote / NEXT RANDOM FIGHT IN 5 SECONDS` with the recap, the score card and
the board all hidden — the round score (2-1) was nowhere, no fighter had a
record, nothing said who was next, and on a cabinet with a high score the
1.8 takeover (`#attractScores`, `inset: 0`, ~90% opaque) covered the winner
for the whole five seconds. The director's bags forgot everything but the
current bag.

`engine/demo-session.mjs` is the new pure module (the card, the ledger, the
board's serialisation, every line of text); `engine/demo.mjs` gained the
STORIES and a third seeded rng for them; the choreographer reads the story;
game.js wires it, gated on the demo at every site (pinned from source in
`tests/demo-session.test.mjs`).

**The card of the night** (`demoBoutPlan(cycle)`). Six bouts per card:
slots 1-4 are one-round QUICK BOUTS (`roundsToWin` 1), slot 5 the CO-MAIN
EVENT (best of three), slot 6 the MAIN EVENT (best of five). The format
reaches the sim through `state.matchRules.roundsToWin` in
`applyMatchRulesForMatch` — the field the ONE-ROUND SHOWDOWN mutator sets —
under `state.mode === "demo"` only. A quick bout is match point from the
bell, which would hand every undercard bout the nine-second ceremony the
5.4 closer rations, so `demoCloserPlan` takes a `quickBout` flag: match
point alone earns nothing there, the brink and airborne rules still finish,
and a seeded `quickFinisher` coin from the director gives half the undercard
its Final Blow anyway (reason `quick`). The best-of-five needed an honest
round card: "ROUND 3" spoke `finalround` unconditionally, wrong at 1-1, so
the demo's `resetRound` banner is `demoRoundCardPlan` — FINAL ROUND +
`finalround` only on the decider, `setpoint` when one side is on match
point, `round1`/`round2` on rounds one and two, caption-only otherwise — and
its sub-line carries the running score (`MAIN EVENT · JEZ 2–1 ALLAN`).
Every other mode announces exactly what it always has. The round-1 card is
the fight card (`BOUT 6 · MAIN EVENT / JEZ VS ALLAN · ZONING WAR · CHINESE
BUFFET`) — the ROUND ONE call was already booked by startMatch.

**The stories** (`DEMO_STORIES`, `demoStoryFor(id, { flip, cycle })`). The
director's third rng draws a four-bag of standard stories (never the same
one back to back, even across a refill), a casting coin, a sign-off variant
bag and the quick-bout coin for every card; a CLOCK card is the clock story
and leaves the story bag alone, so the clock positions of every existing
seed are unchanged and `peek()` can name the next card's story and bout for
the NEXT UP panel. The story SETS the round-ends and personas hooks instead
of duplicating them:

- GRUDGE MATCH — the throw opener; both seats on the `grudge` overlay (no
  patience, throw and grab up, the dash-in, no disrespect); NO yield on
  either seat.
- ROOKIE VS VETERAN — the walk-in super, led by the veteran (seat `flip`);
  the veteran plays its persona under a FINAL-grade overlay (6-frame
  reactions, 0.87 guard), the rookie under a ROOKIE-grade one (17-frame
  reactions, 0.22 errors, a 0.5 guard); the veteran yields EARLY (coverage
  gap 2 / health gap 14 instead of 4 / 26), the rookie never; and when the
  veteran reaches match point the rookie opens the round with a full bar
  (`demoStoryRoundGrit`, the same demo-only free-Grit write the showcase
  seat gets at the bell).
- SHOWBOAT — the dash-in; one seat (`flip`) on the `showboat` overlay
  (`tauntChance` 0.6) AND the choreographer's `showboatSide`, which stages
  a taunt on EVERY knockdown regardless of the one-per-exhibition beat
  ledger (a 150-tick cooldown so one knockdown is one taunt).
- ZONING WAR — no forced opener (`opener: "none"`, the brains own the
  bell); both seats on the `spacing` overlay (spacing 1.35, a 200 px clinch
  line, hold slack 55, the ranged share 2.5, no dash-in) — the grappler
  keeps away too, which is the story.
- THE CLOCK — the round-ends clock card exactly as it was (format `clock`,
  footsies, the clock brain, 30 s).

The overlays are registered at load over every persona
(`demo-<persona>-<overlay>`, plus `demo-<overlay>` over the fallback tier),
so a seat keeps its archetype under the story; `demoStoryTierFor(kitId,
overlay)` with no overlay IS `demoPersonaFor(kitId)` (pinned). The story's
lead seat replaces the strict alternation where the story names one; the
choreographer takes `story` (per-seat yield tolerance, `showboatSide`) and
keeps the 2.9 constants when handed none. `qa.demoNextShow({ story, bout,
format, opener })` forces any of it for a probe (`bout: "co-main"` is what
the demo-mode probe uses to get a best-of-three on card 1).

**The ledger and the board.** `demoSession.ledger` banks every settled bout
at `showResult` (winner, loser, round score, whether it closed on a Final
Blow, the story, the slot) and keeps per fighter wins / losses / the live
streak / best streak / rounds won and lost / finishers. It opens on the
standings stored under `final-blow-demo-standings-v1:<build>` and writes
back after every bout, so a reload resumes the night's standings and a new
build opens a clean board (a stored streak is capped at the wins that could
have built it). The bout log is bounded at 60; the sim never reads any of it.

**The result hold is tonight's card.** The eyebrow is the card's address
(`WATCH DEMO · CARD 1 · BOUT 6 OF 6 · MAIN EVENT`); the set-score card
(`#setScoreCard`, the winner-stays scoreboard the demo never used) carries
`ZONING WAR · MAIN EVENT / JEZ 3 — 2 ALLAN / TONIGHT · JEZ 1-1 · ALLAN
0-1` with a pip per round; the recap line carries the SIGN-OFF — one family
per situation (the main event closed the card / a streak of three or more /
the co-main handing over to the headliner / plain), four or five variants
each, the variant from the director's seeded bag so the same line never
runs twice in a row; `#demoResultStatus` is the NEXT UP line from the
director's peek with a real countdown (`NEXT UP · DEATHBLOW VS PINELANDS
DEVIL · THE VET PARKING LOT · QUICK BOUT · BEST OF 1 · ZONING WAR · IN 4
SECONDS · PRESS ANY BUTTON TO PLAY`, a 250 ms render-side ticker; the held
wording the demo-hold probe pins is unchanged); and the board is a
STANDINGS BAND across the bottom of the screen (`body.demo-active
.attract-scores.demo-standings`, bottom-anchored, a gradient that leaves
the winner's name and pose alone) with the fighters' records as chips and,
in attract mode, the top three high scores on its last line — no takeover
any more. The announcer reads the next pair's two `<id>-name` takes 1.5 s
into the hold (bag-drawn, behind the attract gate like every call; the
`-wins` call from the KO is long finished by then). The bug gained a STORY
row between the matchup and the cycle line (`GRUDGE MATCH · BOUT 2 OF 6 ·
QUICK BOUT · BEST OF 1`); the cycle line the seed-url probe pins is verbatim.

**Measured, same harness after (seeds 237 / 1234 / 9001 × 6 cards = 18
bouts, every one reaching the result, zero runtime errors):**

    bout length     quick 20-37 s of sim (mean 26.6), co-main 47-81 (67),
                    main event 103-130 (120); before: 54-96 (75) for all 12
    first result    20 s / 23 s / 37 s after a WATCH DEMO press
                    (before 67 / 64 / 71)
    stories         every seed's six cards tell 4-5 distinct stories; over
                    seven seeds × 50 director cycles EVERY window of ten
                    consecutive cards tells all five (pinned)
    yield share     grudge 0 / 0 / 0 % (before: 12-27 % on every card)
                    rookie-veteran 0 / 9.5 / 0 · showboat 0 / 0 / 4.4 / 10.3
                    zoning war 5-17 · clock 0-11
    showboat        the cast seat taunted 1 / 2 / 1 / 5 times, the other
                    seat 0 / 0 / 1 / 0 (before: 0-2 per fighter, any seat)
    tiers           demo-zoner-veteran vs demo-rushdown-rookie,
                    demo-grappler-grudge vs demo-skirmisher-grudge,
                    demo-zoner-spacing vs demo-rushdown-spacing … per story
    closers         plain KO 15 · match-point FB 6 · brink 4 · quick 4 ·
                    airborne 3 · comeback 2 · decision 1 (34 rounds)
    result DOM      eyebrow / title / finisher / quote / sign-off / score card
                    / NEXT UP / standings band all populated on 18 of 18

**A played match is byte-identical.** Same page, same harness, base
(e54cfa3) and after: `qa.aiFight("deathblow", "jez", "pro")` over 7200
ticks hashes `4075328251` before and after, `qa.aiFight("post", "ali",
"street")` over 3600 ticks `237946992` before and after (FNV-1a over every
fighter's x / y / health / meter / action / state plus the phase and the
round score per tick). The seeded demo's hash moved (`1291551043` →
`1847897611` at tick 1800 — the show changed: card 1 is a quick bout with a
story) and is identical for two `qa.demo(237)` runs in one page. Every new
site is reached through `state.mode === "demo"` / `demoSession.active`
(the rules choke point, `makeFighter`'s tier pick, `resetRound`'s comeback
bar and round card, `demoPlanCloser`, `showResult`, the hold) — pinned from
source. Built-in AI tiers carry no `overlay` or `persona` (pinned).

Verification: `node --test tests/demo-session.test.mjs` (the card, the
director's story stream and its ten-cycle guarantee, the casting, the tier
overlays over every persona, the choreographer's yield refusal and showboat,
the quick-bout closer, the ledger / board round-trip, every line of text,
the source gates); `tests/demo-round-ends.test.mjs` moved its opener pin
from an eight-card window to a ten-card one (the story bag's guarantee;
reason in the comment) and, with `tests/demo-personas.test.mjs`, its tier
pin to `demoStoryTierFor(kitId, demoStoryOverlayFor(kitId))`; `node
tests/browser-smoke.mjs
--only=fighter-framing-desktop,demo-mode,demo-seed-url,demo-hud,demo-hold,mobile-landscape`
(demo-mode forces `bout: "co-main"` on card 1 and reads the story and
`roundsToWin` off the snapshot; demo-seed-url's ledger pin is "at least
one round" because card 1 is a quick bout).

## The neutral budget and the okizeme family (5.4 Fight Night, sweep #5 / #4)

The Fight Night sweep traced two things a TV viewer never saw. There was no
neutral game: both fighters free on the same tick 7.4% of the fight in the
sweep's trace (15.9% at the personas head — the personas gave the brains
their own bands, the choreographer still walked straight into each move's),
first contact 0.3-1.5 s after every bell, and each side swinging or being hit
60% of the time. And the 5.3 okizeme / close-range package was almost
invisible: 48 knockdowns produced 7 meaties, 1 meaty throw and 3 clinch
techs; a throw happened once per fighter per match, even for the grappler.
Two causes in the pipeline. `finishDirective` restarts the next showcase 0-3
ticks later and the approach phase walks into the band, so there was never
a moment for two fighters to walk the edge of range; and every knockdown
was handed either to the taunt moment beat or to a lead directive that
started the instant the attacker was `stageable` — `runPressure` paced at
96-168 px over the body — so the brain's okizeme path (`ai.mjs` meaty /
meaty-throw) almost never owned the rise. `throw` was a PAIR beat (one per
exhibition, whichever side got there first) and one least-shown checklist
item.

**Measured before, on the 5.4 personas head** (headless Chrome, a per-tick
sampler over `qa.demo(seed)` → `qa.step(1/60)` → `engine.snapshot()`, seeds
237 / 1234 / 9001 × 2 exhibitions, 15,967 fight ticks; the harness is
`trace-demo.mjs` in the sweep's scratchpad and every number below comes
from it): both free 16.2% of fight ticks (12.3% at >150 px); first contact
median 42 ticks after the bell (min 16, max 284 — the footsies opener);
rounds a median 983 ticks (16 s); 34 knockdowns → 16 presses over a rise, 4
hits on a rising fighter, 2 meaty throws, 2 clinch techs; 13 throws pressed
across the twelve fighter-slots, six of them never threw; rises quick 21 /
delay 7 / plain 6.

**THE NEUTRAL BUDGET** (`engine/demo-choreo.mjs`, the header block above
`demoOkiProfile`). A per-round FOOTSIES WINDOW — both lanes refused, both
sides scripted — of 90..150 ticks (seeded), armed three ways:

- at the bell: the first fight tick the choreographer sees. Round 2 and 3
  open on it directly; round 1 gets it the moment the opener's exchange has
  resolved, because the openers item deliberately makes three of the four
  openers land their contact 30-40 ticks after the bell and that decision
  stands;
- after every knockdown the plan below decides is a RESET, starting on the
  rise;
- by the budget: while the round's both-free share is under
  `NEUTRAL_TARGET_SHARE` (0.3) and the last window ended 240+ ticks ago, at
  most three budget windows a round (`NEUTRAL_BUDGET_MAX_PER_ROUND`).

The script: each side walks to ITS OWN band — the kit's `preferredRange` ×
the persona's spacing, clamped to 170..340 px (`neutralBandFor`; the
grappler's 82 px clamps up to 170, Donald's 276 × 1.3 down to 340), so the
grappler walks in and the zoner walks out — and rocks in and out of it on two
different periods so the pair never mirrors. One side (seeded) throws a
deliberate WHIFF just outside the real reach of its least-shown plain punch
normal: the bait. The other side reads the tempo tells the 5.1 pass painted:
a fresh whiff tell or a re-arm gap on the opponent is a WALK-FORWARD read
(step in, punish inside a heavy's band with the least-shown of standHeavy /
crouchHeavy / driveHeavy); an opponent that has been walking in for six
straight ticks is a WALK-BACK read (step out behind the guard, or — a seeded
choice — meet it with one poke at the edge). A window allows ONE read-attack
in total besides the bait: measured with a poke and a punish per side, half
the window's ticks had someone swinging and it read as another exchange. The
aggressor (the less patient persona) closes the window walking or dashing
in. A lead that has not started its move is set aside for a window as a
REORDER (its item stays least-shown — the stun / Grit pre-emption rule); a
lead mid-press makes the window wait. The window's presses are coverage:
`noteMove` counts them like any other.

**MOTION HYGIENE, found the hard way.** Every press inside a window or over a
body follows a rock — a back / forward alternation — and the recogniser
bridges an 18-frame gap, so a KICK pressed there resolves as ←→+KICK: the
first traced "crouch light" meaty came out as a drive heavy every time. The
bait, the pokes and the punish are therefore punch normals (their motions
all need a fresh ↓ token) or the drive heavy pressed as itself, and the
meaty is a crouching light thrown after the attacker has crouched over the
body for `SPACE_SETTLE_FRAMES` — the low meaty is the read anyway.

**THE KNOCKDOWN PLAN** (`demoKnockdownPlan`, drawn in `noteBeat` the tick
`enterKnockdown` reports the fall, five rng draws whatever the branch).
Persona-driven: `demoOkiProfile(kitId)` reads the attacker's `meatyChance` /
`grabPressureChance` and the victim's `clinchTechChance` /
`wakeupReversalChance` / `patience` straight off the registered
`demo-<persona>` tier, so the choreographer and the brain agree by
construction — deathblow pressures the rise at 0.7 and grabs on it at 0.4;
Donald resets half the time and grabs at 0.1.

- kind — an unshown taunt or a weapon the pickup beat can still stage keep
  their knockdown (the moment beats are unchanged); otherwise OKIZEME or
  RESET. The first knockdown of an exhibition is always okizeme and the
  first after that a reset, so both reads are on screen before the dice run;
  at most four plans a round (`OKI_PLANS_MAX_PER_ROUND` — a real round has
  one or two knockdowns that are not the KO; the cap bound 1 of 87 in the
  trace and exists for the sim-lite harness, which knocks down every ~150
  ticks).
- option — a meaty STRIKE, or a meaty THROW at `grabPressureChance`, refused
  after a throw knockdown (the 40-frame immunity makes it a whiff by
  construction). A throw cannot touch a downed or rising fighter, and a
  strike knockdown hands the riser eight more immune frames, so the grab is
  timed to be active on the first throwable tick.
- rise — the victim's option, scripted through the same inputs a human uses
  (Up pulse = quick rise, Down held = delay) at `DEMO_RISE_MIX` 0.4 / 0.3 /
  plain 0.3. The persona tiers inherit pro's 0.55 / 0.16, which the sweep
  measured as quick-rise in 29 of 36 rises; a read needs all three.
- guess — the attacker's READ of that option, right at
  `DEMO_OKI_READ_ACCURACY` (0.6). The press is timed for the guessed rise
  (`meatyPressFrameFor`: 48 down −14 quick / +12 delay, 16 rising, active on
  the first vulnerable frame — 54 / 38 / 68 for a 5-frame light), so a wrong
  guess is a swing into a body still on the floor (a WHIFF, the tax, the
  victim rises into a free punish) or into a fighter already up (block or
  reversal). The clock it is timed on is the victim's VISIBLE one — ticks on
  which the knockdown / wake countdown advanced — because the sim freezes
  both fighters for the hit's hitstop: traced, a sweep's knockdown reached
  its rise 61 ticks after the fall, not 48, and a schedule on the sim tick
  was late every time.
- answer — the victim's: the EX-launcher reversal on the last rising frames
  (meter permitting, at 0.6 × `wakeupReversalChance`), a wake-up BUTTON (the
  jab a meaty exists to counter-hit, 0.25 + up to 0.15 for an impatient
  persona), or the block; against a throw, the tech (a grab of its own
  buffered as the throw comes for the 6-frame pre-contact window and again
  inside the 8-frame clinch window) at `clinchTechChance`, or the hold. A
  victim expecting the grab stands its ground behind a walking guard (a
  guard with a direction held blocks and walks — stepping back, 0 of 4 meaty
  throws reached anything). And whenever the attacker is caught in its whiff
  tail on the rise, the victim PUNISHES: the throw inside grab reach, a heavy
  outside it.

The taunt beat, the weapon pickup, the dizzy and wall-splat moment beats and
the CLOCK card are untouched: on a clock card (blend 0) the plan is recorded
for the ledger and never staged, no window arms and no throw is offered, so
the measured brain-only clock rounds stand.

**THROWS.** `throw` is a PER-SIDE beat on a 150-tick cooldown whose repeat
share is the persona's `throwChance` × 2.2 (deathblow 0.66, Donald 0.11),
and the family gains two duet beats the 5.3 pass authored: THROW TECH (the
lead grabs inside reach, the feed breaks it inside the tech windows) and
THROW WHIFF (the lead grabs from the commit band 8-24 px outside reach, the
feed holds the band and punishes the 42-51 frame tail). Through the beat
lottery alone (one candidate in ten, 22% of picks) none of this made a
measurable difference — 11 throws pressed in six exhibitions before and
after — so a THROW OPPORTUNITY is taken ahead of the blend the way the
brain takes its own throw roll in the clinch: opponent inside
`attemptRange` + 20 and free, at `throwChance` × 2.5 + 0.1, once per side
per 300 ticks and at most 2 + `throwChance` × 8 times a side per exhibition
(the grappler 4, the zoner 2 — measured without the cap a counter-puncher
teched ten throws in one card). All four new beats — meaty, meatyThrow,
throwTech, throwWhiff — are OBSERVED off the view in `observe()` (a hit
taken on a rising frame, a hold beginning inside the rise's throw immunity,
a tech flash on the fighter who was being grabbed, a throw closing on
nothing); no sim call site reports them.

**Measured after, 12 exhibitions** (seeds 237 / 1234 / 9001 / 4242 × 3, 32
rounds, 39,764 fight ticks, same sampler):

    both free            16.2% → 25.1% of fight ticks (>150 px: 12.3% → 18.5%)
    first contact        median 42 → 78 ticks after the bell (max 284 → 466)
    round length         median 983 → 1223 ticks (16 s → 20 s), mean 1064 → 1243
    distance             <150 px 51% → 48%, 150-300 39% → 42%, ≥300 10% → 10%
    per-side state       walking 21% → 32%, attacking 36% → 30%, in hitstun 23% → 19%, still 6% → 5%
    footsies windows     62 (bell 24 · reset 17 · budget 21), 7,059 ticks = 18% of the fight,
                         61 baits, 105 reads (17 walk-forward punishes, 88 walk-back)
    knockdown plans      87 knockdowns: okizeme 48 · reset 29 · taunt 11 · weapon 3 · capped 1
                         options meaty 28 · meaty throw 6; the guess right 23 / wrong 11;
                         rises quick 14 · delay 10 · plain 10; answers block 12 · press 10 ·
                         reversal 6 · eat 4 · tech 2
    meaties              hits on a rising fighter 4 of 34 knockdowns → 18 of 87
                         (0.12 → 0.21 per knockdown; 18 meaty beats in the ledger)
    throws               13 pressed / 6 landed over 12 slots → 64 / 28 over 24 slots
                         (six slots never threw → three); tech flashes 4 → 28
                         (throwTech 14, throwWhiff 18, throw 28 in the ledger); clinch techs 2 → 5
    moves shown          per fighter per exhibition, standard cards: median 19.5 → 18.5
                         (13-22; the exhibition got 25% longer, so the windows cost the
                         checklist under a move a side, and the cumulative ledger carries it)

The meaty throw is still the family's weak beat (6 planned, 1 in the ledger
over these twelve cards — the hold has to begin inside 14 ticks of the wake,
and the victim's walking guard was the last fix); the read is on screen as
the grab attempt, but a probe that wants it landed should force the plan.
Follow-up.

**A played match is byte-identical.** The only game.js change is eight
visible fields on `demoChoreoFighterView` — the knockdown clock, whether the
fall was a throw, the live swing's level, the re-arm gap, the whiff tell's
tick and kind, the hold's frame and the tech flash; the hidden wake option
is deliberately not among them, because the rise is the thing the attacker
is supposed to be guessing — and that view is built on `aiInput`'s demo
branch only (pinned from source in `tests/demo-neutral-okizeme.test.mjs`).
Three CPU-vs-CPU matches hashed in headless Chrome (`qa.aiFight`, 7,200
ticks, FNV of every fighter's x / y / health / meter / action / state per
tick) are identical before and after: pro deathblow-jez 3259556714, street
post-benny 659240027, final ali-alan 749667803. `qa.demo(237)` twice in one
page hashes to 2766973502 both times, and the sim-lite harness pins two
worlds on one seed to identical stats, coverage and plans.

Verification: `node --test tests/demo-neutral-okizeme.test.mjs
tests/demo-coverage.test.mjs` — the new file enumerates the plan on a roll
grid (the fairness rule, the persona shares, the throw-knockdown refusal, the
rise mix, the guess accuracy, the answers with and without meter), pins the
meaty timing to the sim's wake-up rules (active on the first vulnerable
frame of the guessed rise; the 26-frame spread between quick and delayed),
and runs the sim-lite world for windows (armed, lanes refused, bait and
reads taken), plans (one per knockdown, presses on the rise), the throw
family's cap, liveliness inside windows, the clock card standing down, and
determinism. `tests/demo-mock-world.mjs` gained the close-range model the
family needs — a throw hold the victim can tech inside the two windows, the
whiff tell and re-arm gap, the tech flash, the throw fall. The coverage
file's exhibition length moved 2400 → 3200 ticks with the reason above (the
real exhibition got 25-32% longer; a fixed budget would have measured the
windows against an exhibition that no longer ends that early — the sim-lite
world also knocks down 3-4× as often as the sim), its Grit-policy floor 26 →
24 (the single-exhibition floor), and the air-row pin allows one late entry
across the six runs (deathblow's airHeavy on seed 237 lands at 3600 ticks).
`node tests/browser-smoke.mjs --only=fighter-framing-desktop,demo-mode,demo-seed-url,demo-hud,demo-hold`
passes unchanged: the seed-url probe's tick-for-tick pin holds because every
draw is the choreographer's own rng in sim order.

## The versus card and the ring introduction (5.4 Fight Night, sweep #8 / #20, on #16's budget)

Between two exhibitions the attract show spent 8.0 s of wall clock and told
the couch almost nothing in it. Measured on the 5.3 head in headless Chrome
(`?demo=237` on the wall clock, exhibition 1 forced to its result the way the
`demo-hold` probe does): result screen at 5.23 s, next intro at 10.18 s (the
5 s hold, static `NEXT RANDOM FIGHT IN 5 SECONDS`), then one banner —
`WATCH DEMO · CYCLE 2 / PINELANDS DEVIL VS DEATHBLOW` — with the big type
spent on the words WATCH DEMO and the names on the 20 px amber sub-line;
`FIGHT!` at 11.33 s; the bell at 13.24 s. `ROUND 1 / <stage>` never survived a
frame: `startNextDemoMatch` announced the WATCH DEMO card straight after
`startMatch` had announced ROUND 1, and `announce()` rebuilds the box, so the
screen said WATCH DEMO while `round1-1.mp3` said ROUND ONE. The announcer
never named either fighter or the stage in a demo, although every fighter has
three recorded `<id>-name` takes (the manifest), the roster carries a title
(`SOUTH JERSEY CRYPTID`), the kit an archetype (`WINGED BARRENS PREDATOR /
HIT-AND-RUN`) and the arcade's dialogue-card DOM sat unused outside a rival
bout.

**The budget is repartitioned, not lengthened.** The 8.0 s stays 8.0 s: the
result hold drops from 5 s to 2.4 s (`DEMO_RESULT_HOLD_MS`, engine/demo.mjs)
and the 2.6 s it gives back is spent on the fight screen as a VERSUS hold
(`DEMO_VERSUS_HOLD_MS`, engine/demo-versus.mjs) — a demo-only *floor* under
the intro art hold (`holdDecision` gained `floorMs`; zero outside the demo, so
its answer for a played match is byte-identical, pinned in
`tests/demo-versus.test.mjs`). The sim clock stands still under the card the
way it does for a cold sheet, the FIGHT! timer is shifted by the release as it
always was, and the tick stream is untouched: `qa.aiFight('deathblow','jez',
'pro')` hashed per tick over 20 s (`8991723d`), `qa.demo(237)` over 45 s
(`bc53f9e5`, ledger `1:1:0:1718`) and `qa.demo(237, 3)` over 30 s
(`235802ce`) are identical on the base tree and this one, and the
`demo-seed-url` probe still matches a link boot to `qa.demo(237)` tick for
tick. After: result screen at 5.13 s, the card at 7.55 s (a 2.42 s hold),
ROUND 1 at 10.20 s, FIGHT! at 11.35 s, the bell at 13.23 s — 8.1 s, the same
seam to within a frame, and at the 0.75x demo rate exactly (the old 3.0 s
intro is unchanged; only the wall clock ahead of it moved).

**The card** rides `#introDialogue` / `.speech-card` with a `versus` modifier
(no second panel): a full-frame scrim under the announcer, then a row at a
fifth of the frame's height — the left corner card, the VS mark with `TONIGHT
AT · <stage>` and `WATCH DEMO · CYCLE n[ · ON THE CLOCK]`, the right corner
card. Each corner card is the portrait (`assets/fighters/<id>.webp`), `IN THE
LEFT/RIGHT CORNER`, the name in the announcer's Impact at 2.9vw (42 px at
1440 wide, 40+ pinned by the `demo-versus` probe; the old matchup line was
20 px), the roster title, the kit archetype and the night's record —
`FIRST BOUT TONIGHT`, then `2-1 TONIGHT` from `demoSession.standings`, a
per-fighter fold of every settled exhibition (`demoStandingsAfterMatch`,
written at `showResult` on the demo path; the round ledger is bounded at 64
and a cabinet runs for hours). Unrevealed cards keep their box (visibility,
not display) so nothing shifts as the introduction fills in; cards reveal by
their own `data-card` index, not DOM position, because the row is laid out
left / stage / right and the stage row is last. On 844x390 the row measures
inside the viewport with the name at 24 px and the stage line ellipsised
rather than wrapped.

**The ring introduction** is a plan (`demoRingIntroPlan`), in broadcast
order, that the `demo-versus` probe and the unit test both pin:

    at (ms)   beat     shows                                     speaks
    0         corner   left card + "<NAME> / IN THE LEFT CORNER · <title>"   <left>-name
    1000      corner   right card + the same for the right corner         <right>-name
    1900      stage    VS row + "<STAGE> / WATCH DEMO · CYCLE n"             (nothing: no stage cue is recorded)
    2600      round    ROUND 1 / <stage> — at the hold's release            round1
    3750      fight    FIGHT! — startMatch's own timer, shifted by the hold  fight

No voice was generated: the corner calls are the reviewed `<id>-name` takes
(679-2847 ms; the announcer's busy window pushes the right corner behind a
long left take rather than stacking them) through `announce()`'s explicit
`speak` plan, ROUND 1 and FIGHT! keep their banks. The corner and stage beats
fire from the card's own wall clock in the dialogue reveal loop
(`updateIntroDialogue`, kind `versus`), the ROUND card at the hold's release
(`releaseDemoVersusCard`, from `releaseIntroArtHold`) — the same release that
shifts FIGHT! — and a release because the sim already *left* the intro (the
QA manual clock stepping through it) announces nothing, so `qa.demo(seed)`
plus `qa.step()` reads exactly what it did. The attract audio gate still opens
on `demoRoundCard()` at the top of the intro, which is now the card, so the
first sound an armed show makes is the left corner's name. Measured order on
the wall clock (`qa.demoRingIntro().log`, ms from the card): corner 0, corner
1034, stage 1915, round 2638 (release reason `floor`), fight 3837. While the
card is up the announcer sits at 63% instead of 44% (`.game-frame:has(...)`)
so the corner and stage slams land over the dimmed fighters, never on the
cards; ROUND 1 goes up after the box is cleared and lands where it always
has. Reduced motion drops the slides but keeps the beat order (the arcade
exchange still collapses to both cards at once, as shipped).

Rounds 2 and 3 are untouched (`DEMO_ROUND_INTRO_SECONDS` 1.15 s, ROUND n /
SETTLE IT); a `&cycle=n` link and `qa.demo(seed, n)` open on card n's versus
card. Known interplay, unchanged in kind from the art hold: the card's clock
is wall time, so a tab hidden *during* the 2.6 s comes back with the missed
beats fired in order and the ROUND card up at once (`demoRingIntroDue` walks
the plan; the hidden-tab hold freezes the result countdown and FIGHT! as
before).

Verification: `node --test tests/demo-versus.test.mjs` (the card copy, the
record line and standings fold, the plan's order / cues / times against the
manifest's take lengths, the due-beat walk, the hold floor and its
byte-identical no-floor path, the 2.4 + 2.6 = 5 s budget, and the game.js
gates from source — every entry point behind `state.mode === "demo" &&
demoSession.active`, round 1 only, never on a resimulation, and the WATCH DEMO
slam gone); `tests/demo-hud.test.mjs` re-pins the prompt at 2 SECONDS; `node
tests/browser-smoke.mjs --only=fighter-framing-desktop,demo-mode,demo-seed-url,demo-hud,demo-hold,demo-versus,mobile-landscape`
(`demo-versus` reads the card, its sizes and the announcer plan order on a
link boot, then round 2's plain card; `demo-hold` pins the 2.4 s remaining).

## A camera and a cadence for the attract show (5.4 Fight Night, sweep #7 / #17)

The demo had no camera and no tempo. Measured on the 5.4 head (headless
Chrome, 1920x1080, `?demo=237` on the wall clock, 175 s sampled every 100 ms,
3 exhibitions): **92.5% of fight-phase frames sat at presentation zoom
exactly 1.00** (80.8% across the whole fight screen, max 1.113 — a
counter pop), and every one of the 911 fight-screen samples read the same
`0.75×`. The only demo-conditional framing in the code made the shot WIDER:
the 2D `DEMO_PULLBACK_ZOOM = 0.86` and the 3D `FramingCamera`'s demo branch
(margin 0.78, fill floor 1.1, every punch-in capped at 1.12). The played
game's camera is deliberately "identity by default" — a 1.08 intro dolly, a
1.04 FINISH THEM creep, a 1.03 win settle, a 0.08 KO punch — which is right
for a match you are playing and wrong for one you are watching from a couch:
the super cut-in's banner is huge but the world behind it does not move, and
the round-ending hit passes at the same 0.75x as a whiffed jab and then jumps
straight into the 0.35 s Final Blow reaction. Slow motion existed only inside
finisher scripts (`sloMoBlurFrames 12` in 175 s, all of them fatalities).
CINEMA 3D was framed flatter still. Jez's bar is that a graphics pass must be
visibly obvious; across a room, camera motion and tempo are the two most
visible things a broadcast adds.

`engine/demo-camera.mjs` is the pure half; game.js wires it, `renderer/three/
camera.mjs` reads it. Everything is presentation: the shots compose into the
existing `cinematicCamera` pose (the same zoom-about-a-focus / dutch primitives
the KO punch-in and the intro dolly use), the slow-motion beat rides the 3.2
transport's cadence (a tick CADENCE multiplier, never a dt), and every call
site is gated on the demo session (`demoCameraActive()` = `state.mode ===
"demo" && demoSession.active`). A played match is byte-identical:
`aiFight('deathblow','jez','pro')` + 20 s checksums `b7b988e0` at tick
1500 (fight opened on tick 152) on the 5.4 head and after this pass, and the seeded demo
(`qa.demo(237)` + 30 s) checksums `e62a3763` at tick 1800 before
and after — the camera never reads back into the sim, and the cadence never
changes which ticks run.

**The seeded shot list.** Two shuffle bags (the director's own `refillBag`, so
no variant ever plays twice in a row), seeded from the demo seed alone
(`hashSeed("FINAL-BLOW-DEMO-CAMERA", seed)`) and consumed in event order, which
the tick stream fixes — so `?demo=237` draws the same shot at the same tick on
every load, and a second `qa.demo(237)` on the same page replays it (pinned by
the `demo-camera` smoke probe). Three SUPER shots fire from
`latchSuperPresentation` on the attacker's chest for the cut-in's life:
`tight` (1.32, snap in, hold), `creep` (1.24, a slow 0.65 s push with 0.9° of
dutch), `snap` (1.40 in six frames, long release). Three KO shots fire from
`latchKoCameraPunch` on the victim and each carries its own slow-motion beat:
`freeze` (1.26, 0.35x for 24 ticks, 1.2° dutch), `creep` (1.20 eased over
0.9 s, 0.5x for 30 ticks), `smash` (1.32 in three frames, 0.25x for 18 ticks).
With the 0.86 pull-back a 1.32 pose is a 1.135 net frame — from wide to tight,
not from flat to slightly less flat. Between the set pieces an EXCHANGE LEAN
(1.07 on the pair's midpoint, eased at 2.6/s) breathes in while the cadence is
at exchange tempo and back out in neutral, so the frame follows the fight.
Reduced motion keeps the tempo and the bars and drops every move.

**The tempo-aware cadence.** `createDemoCadence()` is a tick-keyed state
machine shown one view per rendered frame (phase, tick, hitstop, whether
anyone is attacking / stunned / down / grabbing or a projectile is in flight,
the pair's distance, the KO tick and its shot): **1x** while both fighters are
free and more than 200 px apart (`DEMO_CONTACT_RANGE`, ~1.9 body widths),
**0.75x** once anyone swings, is hit, or the pair is inside range — held for a
24-tick dwell after the last contact so a string with gaps does not flicker —
the drawn shot's **slow-motion beat** from the KO tick, **0.75x** for the
ceremony, the intro and the round card. The transport gained `setCadence()` /
`effectiveRate()`: the cadence scales the SAME wall-clock seconds the rate
does, so the tick stream is identical either way (`tests/demo-camera.test.mjs`
runs 900 frames at 1 / 0.75 / 0.35 against the real `FixedStepClock` and
checks every dt and every tick index). The operator always wins: any transport
key, or an explicit `qa.demoSpeed(rate)`, LOCKS the cadence off for the
session, and a demo started on a non-default rate (`?speed=`) starts locked.
The rate tag in the bug follows the cadence frame by frame — `1×` (live) in
neutral, `0.75×` in an exchange, **`SLOW-MO`** (amber, pulsing) on the KO beat
— and never prints `0.35×` at a viewer. The fatality smear (`updateSlowMoBlur`)
runs through the KO beat too.

**The KO beat's letterbox.** `letterboxLevel`'s target is 1 through the finish
phase from the KO tick, so the intro bars drop on the round-ending hit and stay
through the FINISH THEM stand-off; a Final Blow's own overlay bars take over
seamlessly (`drawIntroLetterbox` already stands down for a finisher) and a
plain KO's retract with the roundover call.

**CINEMA 3D.** `FramingCamera` keeps its 4.3 demo framing (wide margin, fill
floor) and its 1.12 punch-in cap — except while `cinematic.demoShot` names a
live shot, when the cap lifts to `DEMO_3D_SHOT_ZOOM_CAP` (1.45): the fov
narrows from 26.8° to 22.7° on a 1.32 super pose, the gaze steers to the
attacker, and the shot frames one fighter on purpose, which is exactly what
"the pair never leaves frame" is meant to break for a second. A played match
in 3D is uncapped as before.

Measured after, same harness, same seed, same 175 s: **2D 2.2% of
fight-phase frames at zoom 1.00** (was 92.5), 6.4% across the
fight screen (was 80.8), max zoom 1.426 (was 1.113), beats
intro 64 · neutral 23 · exchange 763 · ko 24 · ceremony 70 samples (the sim gives the show almost no neutral — sweep #5 — so 1x is rare by the fight's own doing), rates 1x 24 · 0.75x 897 · 0.5x 9 · 0.35x 2 · 0.25x 12, 35 KO-beat letterbox samples, slow-mo
smear frames 28 (was 12). **CINEMA 3D 3.1%** at zoom 1.00 (was
90.7), max zoom 1.419 (was 1.079). Screenshots of the super
push-in, the KO slow-mo frame and the KO letterbox in both renderers are in
the integration notes.

One pre-existing bug this pass had to fix to keep its own promise: every
render-side one-shot is deduped against the sim tick (`superCutInTick`,
`cameraKoTick`, the counter/dizzy/guard-crush/recoil latches, the distortion
ring, the crowd swell), which is right for a stream that only grows and wrong
the moment a seeded demo rewinds it. Measured: a second `qa.demo(237)` on the
same page fired its opener super on tick 663 again, found `superCutInTick ===
663` from the first run and skipped the cut-in, the ring and the shot.
`resetPresentationTickLatches()` now rewinds them from startDemo's seeded
rewind (and only there); the `demo-camera` probe's replay half is what caught
it. The CINEMA 3D numbers above come from the same harness under SwiftShader,
where the 3D page renders ~7 ticks a second (142 samples in 175 s, one card),
so the 3D KO frame was captured on the QA clock instead (`qa.demo(237)`, a
quiet tick past 700, `qa.demoKnockout(0)`: zoom 1.425, letterbox 0.93, beat
`ko` at 0.25x, shot `smash`, in both renderers).

Verification: `node --test tests/demo-camera.test.mjs` (the shot lists, the
envelope, seeded/non-repeating draws, the policy and its dwell, the KO beat's
length per shot, the transport's tick-stream identity, the lock, the tag, and
the game.js / camera.mjs source pins); `node tests/browser-smoke.mjs
--only=fighter-framing-desktop,demo-mode,demo-seed-url,demo-hud,demo-hold,demo-camera`
(the `demo-camera` probe drives a seeded demo to its opener super and a
synthetic KO, reads the live shot, the beat, the push-in and the bars, replays
the seed for the same shots at the same ticks, then proves a played match
draws nothing).

## The lower third — what just happened, and whom the room wants (5.4 Fight Night, sweep #12 / the text half of #21)

**Why.** The sweep counted 22 announcer calls and 53 crowd swells in a 175 s
attract run and nothing readable on the screen: the centre letter-slam lives
0.55-2.4 s, the attack-name popups are 9 px, and a muted TV — the common case
for an attract loop — has no voice at all. The crowd has taken sides since 5.3
(`createCrowd` deals a favourite per painted person from a per-round house
lean of 34-66%) and the HUD never said whom the room was backing. Reproduced
here on `qa.demo(237)` under the QA clock: 175 s of stepping books 17
announcer calls and 17 crowd swells (one card — the result hold is a
wall-clock timer, so the QA clock plays one exhibition) and zero lines of
text a spectator could read; `#demoHudLine` and `#demoHudRoom` did not exist.

**What.** `engine/demo-commentary.mjs` is an EVENT BUS plus a TEXT LINE. The
demo's sim call sites feed sixteen kinds through one gate in game.js —
`demoCommentaryEmit` (super, EX, counter hit, throw, tech, weapon pickup and
committed throw, wall bounce, perfect guard, guard crush), `demoCommentaryHit`
(FIRST BLOOD once per round, then the counter), `demoCommentaryObserve` (the
per-tick health observer: CLUTCH the first tick a standing side is at or
under `DEMO_CLUTCH_HEALTH` 20, COMEBACK the first tick a side that was in the
clutch AND `DEMO_COMEBACK_DEFICIT` 25 behind while there holds the lead),
`demoCommentaryRoundStart` (the bell: the round's latches reset and the room
read is taken from the painted crowd's favourites) and
`demoCommentaryRoundEnd` (finishRound: the round line with the score, the
Final Blow with the score, or — for a winner who was in the clutch a real
deficit down and never led before the KO — the comeback). Every kind has four
or five authored all-caps variants drawn through `drawFromBag` (the
announcer/crowd/stinger contract: every variant before a repeat, never the
same line back to back across a bag border) from a bus-private
`DeterministicRng` seeded `hashSeed(directorSeed, "commentary", cycle)` —
its own lane beside the choreographer's, so a `?demo=` link replays the same
lines on the same ticks. A hold/priority policy (`DEMO_COMMENTARY_POLICY`,
2-5 s holds; a fresh higher line is protected for 45 ticks against a lesser
one, which is counted as dropped and never shown) keeps it a lower third
rather than a ticker. The bell's room read is priority 1 on purpose: first
contact lands 0.3-1.5 s after the bell (sweep #5) and the first draft
swallowed FIRST BLOOD behind it. The deficit rule is also measured: without
it a two-round card on seed 237 called FOUR comebacks as two fighters under
20 traded the lead; with it, one (`POST FROM 19%`, round 2).

Text only, on purpose — voiced colour commentary is a later, owner-approved
item (new voice lines need his sign-off). The seam is there: every accepted
event is published to `bus.subscribe(listener)` frozen, with `cue:
"demo-<kind>"`, `side`, `line`, `variant` and the tokens, so a voice bank
subscribes without touching a call site (`stats().subscribers` reports how
many are listening; the shipped page has none).

**On the bug.** Two grid rows inside `#demoHud` (`"line line"` under the
matchup, `"room room"` under it — no second panel): `#demoHudLine`, Impact at
1.95em of the bug's base, measured 21.9 px at 1440x900 (the matchup is 19.7),
bordered in the fighter's own accent (`--line-accent`) and amber for the big
three (super, comeback, Final Blow), cyan for the room read; `#demoHudRoom`,
`THE ROOM BACKS POST · 5-3` / `THE ROOM IS SPLIT · 4-4` / `NO CROWD ON THIS
STREET` (Janney has no painted people). `syncDemoLowerThird` runs once per
rendered frame behind `demoSession.active` and writes the DOM only when the
shown line's id changes; it reads the bus's clock — the sim tick — so a line
freezes with the hidden-tab hold or PAUSED and scales with the transport
rate. Both rows collapse when hidden: with the room row up the bug measures
488x96 px and its top sits at 84% of the frame (the smoke's 78% floor), 95
px with the line hidden. A live line lifts the screensaver dim
(`.demo-hud.calling { opacity: 1 }`) while the tuck itself is unchanged — the
bug is quiet chrome until it has something to say. Reduced motion kills the
slide-in.

**Measured** (`qa.demo(237)`, 175 s of the QA clock in 2.5 s steps, headless
1440x900): 31 lines emitted, 3 dropped by the policy, 13 of the 16 kinds in
one two-round card (first-hit 2, super 1, EX 7, counter 7, throw 1, weapon
pickup 1 and throw 1, wall bounce 2, perfect guard 1, clutch 4, comeback 1,
finisher 2, round-start 1; no tech, guard crush or plain round line on this
seed), 14 distinct lines caught at the 2.5 s sampling cadence — `THE ROOM IS
BEHIND POST · 5-3`, `COUNTER HIT · POST`, `FULL GRIT SUPER · POST`, `ALI G
READ THAT ONE`, `ALI G ON THE BRINK · 17%`, `POST ENDS IT · 1-0`, `ALI G LANDS
THE OPENER`, `ALI G PUTS POST INTO THE WALL`, `POST EATS THE CORNER`, `EX PAINT
THE TOWN · POST`, `COMEBACK · POST FROM 19%`, `THAT IS THE FINAL BLOW · POST ·
2-0`. (A kit's EX move is often named "… EX" already; the call site strips the
word and the line puts it back once — the first trace read `EX PAINT THE TOWN
EX`.) The screenshots at the super and at the comeback are in the item's
scratch (`lower-third-super.png`, `lower-third-comeback.png`).

**A played match is byte-identical.** The gate is pinned from source
(`tests/demo-commentary.test.mjs`: every helper asks `demoCommentaryLive()`
first, one creation site in `startNextDemoMatch`, the render sync behind the
session, no `state.` writes in the block) and traced: the seeded demo,
`qa.demo(237)` + 30 s, checksums `e62a3763` at tick 1800 before and after —
the bus is live on that run, so the sim paths it observes (hit, beginAttack,
the guard crush, the wall bounce, techThrow, the weapon, finishRound, the
step) are proven not to move a byte; the played CPU match,
`aiFight('deathblow','jez','pro')` + 20 s, checksums `0795b4ea` at tick 1300
and `ae3e4ad2` at tick 1302 on both trees (the title screen ticks the clock,
so a sample's origin drifts with load time — only same-tick samples compare,
and every same-tick pair agreed), and with the origin pinned (`qa.step` to
tick 130 before `aiFight`) `17c742d5` at tick 1330, twice on each tree.
`#demoHud` stays hidden and the line row is never painted outside a demo.

Verification: `node --test tests/demo-commentary.test.mjs` (the kinds, the
banks, the bag rule per kind over 25 refills, seed replay, hold/priority, the
observer's clutch/comeback/deficit, the round line, the allegiance read, the
source gates, the DOM/CSS); `qa.demoCommentary()` in the browser (the line on
screen by the sim clock, what the DOM shows, the room read, the round's
latches, the recent list, the tally); `node tests/browser-smoke.mjs
--only=fighter-framing-desktop,demo-mode,demo-seed-url,demo-hud,demo-hold`
(the bug's corner and size with the new rows, and the tick-for-tick
determinism the seed-url probe pins — `demoSnapshot().commentary` carries the
tally, so two loads of one link are compared on it too).

## Ringside — the attract show, spoken (5.4.1, 2026-09-06)

5.4 painted the lower third, the sign-offs and the versus card as text and
left every new line caption-only, because a new announcer line needs the
owner's approval. He approved all four groups on 2026-09-06 and this pass
generated them in the announcer's own voice (`VOICE-CAST.json`: FB2 Atlas
Announcer, `eleven_v3`, `mp3_44100_128`, stability 0.5 — the casting the
2026-08-30 batch used), NEW files only: none of the 45 reviewed takes or the
four music tracks was touched.

**How a line is spoken** (`engine/demo-voice.mjs`). The text banks carry
tokens no take can say — a fighter's name, a special's name, a health
percentage, a round score. A spoken line is therefore a SEQUENCE the
announcer queue (`announcerSay`, one call after another on the busy window)
plays back to back, the way `K.O.! · POST · WINS!` already does: a generated
fragment (`dc-<kind>-<n>`, `so-<family>-<n>`), the seat's reviewed
`<id>-name` take, the stage weapon's own take (`weapon-<id>`), the streak
lead-in (`so-streak-k3..k5`, `-kx` past five). Percentages and scores stay on
screen. So `FIRST BLOOD · POST` is heard as *FIRST BLOOD!* … *POST!*, `POST
PUTS ALI G INTO THE WALL` as *ALI G!* … *INTO THE WALL!*, `CLUTCH · JEZ HOLDS
ON AT 14%` as *CLUTCH!* … *JEZ!* … *HOLDS ON!*. The finisher and round-end
lines add only their fragment after the round's own K.O./name/wins calls, and
the round-end line stays silent when the `-wins` bank just closed the match.

**Policy.** An exchange line is spoken only when the MC is free (the busy
window within 150 ms of now) and 3 s after the last spoken line — the painted
line is the record of everything, speech is the highlights; the bell's room
read (*THE ROOM IS BEHIND… POST!*) waits 700 ms so FIGHT! lands first, and the
finisher / round-end fragments ride the queue. Every call still passes the
attract audio gate and the sound toggle. `qa.demoVoice()` reports lines
spoken and dropped, sign-offs, venue calls and the busy window.

**The result hold speaks the sign-off** — the fragment and the winner's name
take (`QUICK WORK FROM… POST!`, `JEZ! … OVER… ALLAN!`, `THREE STRAIGHT FOR…
DEATHBLOW! … WHO STOPS THAT?`). The 5.4 next-pair name reads that sat there
are gone: they doubled the versus card's corner calls a second later. The
hold is 3.0 s (was 2.4) so the sign-off lands before the card.

**The versus card calls the venue.** The stage beat speaks `stage-<id>`
(*TONIGHT AT SOMERSET SEPTA STATION!*, one take per stage) and the card now
holds while the MC is still talking: the art hold's floor becomes the moment
the announcer's window clears plus 250 ms (`demoVersusSpeechFloor`, never
under the card's 2.6 s, capped at 6 s), so ROUND 1 follows the venue call
instead of landing under it. Measured on seed 237's first card the release
comes at 4–5.5 s; the seam between bouts is 3.0 s + the card, under the 8 s
it was at 5.3.

**The clock call** (MISSING-AUDIO.md Priority 6) has its three takes;
`tenseconds` is no longer caption-only.

**The batch.** 107 files, 679–3866 ms (mean 1752), mean level -19.9…-13.0 dB, peak -3.2…-0.6 dB, 3 takes re-rolled on a peak above -0.5 dB, 0 fallbacks off eleven_v3. `tools/audio/build_manifest.mjs` re-baked the
manifest (228 announcer takes / 143 cues) and the legacy announcer count
file. `node --test tests/demo-voice.test.mjs`: every painted line has a plan,
the file list is the manifest's contract, the takes are on disk at the
announcer's length contract, the resolvers, the gate, and the game.js wiring
pinned from source.
