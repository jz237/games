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
- every stage and all four soundtracks are exhausted before their bags refill;
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
  walk into a throw, brace for a stun string or a corner herd), or is handed
  straight back to the archetype brain. Both fighters can be showcasing at
  once, and the feed role is an active script — nothing ever stands inert.
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
- `window.__finalBlowQa.demoCoverage()` returns the live ledger: featured
  pair/stage, per-fighter move counts, beat counts, both lane roles, the
  per-item pick tally, the cumulative session ledger and the matchup keys the
  session has already featured.
- **Boss spoiler (deliberate).** On a locked cabinet the attract cycle
  features 9 of the 10 fighters: the Commissioner is the arcade boss and the
  roster only contains him once he is unlocked, exactly as on the select
  screen and the ladder. Attract does not get a private exception to that
  reveal. Once unlocked he joins the rotation and all 45 matchups play.

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
- `node tests/browser-smoke.mjs` checks two live AI brains, automatic Final Blow activation, result scheduling, 64 rapid cycles with one bounded intro timer, input-to-exit, mobile HUD bounds, hidden touch controls, and offline precaching.
