# Final Blow combat direction

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
