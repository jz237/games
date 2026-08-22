# Final Blow 1.3 — Tournament Feel

Version 1.3 is the tournament-readiness pass. It keeps the eight-fighter roster,
four-button rules and rollback protocol intact while tightening input, collision,
CPU fairness, practice tools, balance guardrails and match flow.

## The seven completed areas

1. **Input responsiveness** — a tested 4–6 frame input window, bounded motion
   leniency, and one explicit priority order: Super → EX → Special → Throw →
   Normal. An invalid high-priority action falls through instead of swallowing a
   legal lower-priority action.
2. **Normals and hitboxes** — an automated audit covers 15 tournament roles for
   every fighter: 120 normals total. Startup, active, recovery, damage, range,
   hitbox extent and active-frame ownership must all remain inside guardrails.
3. **Collision and corners** — grounded and low-air pushboxes remain solid in
   center stage and both corners. A side switch is legal only after a jump clears
   the standing fighter's shoulders. Authored grabs and explicit
   `ignorePushbox` moves remain intentional exceptions.
4. **Fair, distinctive CPU** — every active difficulty retains reaction delay
   and execution error. Fighter archetypes still drive decisions, while bounded
   repeat limits break projectile/trap/action loops with deterministic
   repositioning.
5. **Training upgrades** — Stand, Guard, Guard After First, Crouch, Jump,
   Reversal, Wakeup, Record, Playback and CPU dummy modes; visible hitboxes;
   a 10-second P2 recording loop; and two character-specific combo trials for
   each of the eight fighters.
6. **Balance sweep** — all 28 unordered roster matchups are enumerated. The audit
   also covers eight personal objects, five stage weapons, projectiles, traps and
   fighter identity/movement signatures. Persistent hazards are telegraphed,
   capped and unable to create knockdown loops.
7. **Faster match flow** — any attack or Up skips intros and round-over waits
   without becoming an accidental attack. Results expose Instant Rematch and,
   in local versus, Same Fighters / New Stage. Controller disconnects pause local
   play with a clear player-specific reason.

The regular arena camera remains fixed and full-stage. Cinematic zoom is reserved
for finishers.

## Release gates

```sh
node --check game.js
node --test tests/*.test.mjs
node tests/browser-smoke.mjs
cd signaling && npx wrangler dev --port 8787 --local
FINAL_BLOW_SIGNALING_API=http://127.0.0.1:8787 node ../tests/online-browser-smoke.mjs
```

The browser suite includes a deterministic four-second CPU simulation of all 28
matchups and rejects non-finite state, non-exempt grounded overlap, inactive CPU
brains, or projectile/trap counts above tournament caps. It also covers the new
training controls, intro/result skips, same-fighters stage selection, fixed camera,
controller-disconnect pause and 844×390 touch layout.
