# Personal throwable objects

Every main fighter carries one recognisable physical object, thrown with the same
command on keyboard, controller and touch: **↓ ← + LK or HK**. That is the last
unused quarter-circle in the four-button vocabulary, so no fifth button is added
and the command works identically on every control method.

## The roster

| Fighter | Object | Archetype it reinforces | Per round |
| --- | --- | --- | --- |
| DeathBlow | Whole pizza | Slow space control — a broad spinning disc with a wobble that is hard to walk under | 2 |
| Jez | Corded computer mouse | Tether — reels a clean hit in, slips harmlessly off a block, long punishable whiff | 2 |
| Allan | Loogies | Close pressure — a short sticky arc that staggers and never zones | 4 |
| Post | Tangled ball of wires | Trap control — lobs, bounces once, uncoils into a floor hazard that slows | 2 |
| Benny | X-Acto knife | Quick harassment — fast, precise, narrow, punishable if it misses | 3 |
| Donald | Golf ball | Low bounce — skips off the floor twice and covers ground awkwardly | 3 |
| Cyraxx | Bed bugs | Trickster trap — a slow crawling swarm that lingers on the floor | 2 |
| Ali G | Vinyl record | Anti-air arc — the steepest lob, knocks down, punishes hesitation | 3 |
| Pinelands Devil | Hex charm | Curse lob — a slow bone-and-twine arc that jolts whoever it marks (EX: LINGERING CURSE, a settling zone that slows) | 2 |
| The Commissioner | Steel cane | Authority spacing — one flat end-over-end steel throw that staggers and opens the walk-in (EX: GOLD-TIP CANE, a knockdown) | 2 |

The Commissioner's steel cane shipped in R2.0 FAMILY wave 16, once the eight
requested fighters were signed off — exactly the order the backlog asked for.
The Devil's hex charm followed in wave 17 with the tenth roster slot.

## Decisions taken

- **Limited per round, no Grit cost.** The backlog asks for limits wherever an
  unlimited object would erase the intended archetype, and that is true for most of
  this set — an unlimited pizza or vinyl record is just a fireball. Counts refresh
  each round and are shown as pips in the HUD beside the Grit bar, so an object is a
  decision rather than a button to hold down. Allan's loogies are the most plentiful
  because their reach is deliberately tiny.
- **No shared fireball code path.** Objects have their own physics: gravity, launch
  arc, bounce count and damping, floor-hazard lifetime, tether behaviour, spin and
  wobble. `stepThrowable` in `engine/throwables.mjs` is pure and frame-based, so
  flight, bounces and hazards reproduce exactly under replay and rollback.
- **Every object is drawn as a physical thing**, not a recoloured orb — crust and
  pepperoni, a mouse trailing its cable, a spinning labelled record, a swarm of bugs
  with moving legs — plus a ground shadow so the arc and landing point read clearly.
- **Impact sounds are synthesized, one per object**, from a tone sweep plus a shaped
  noise burst (`OBJECT_SOUNDS` in `game.js`). See the blocker note below.
- **Fighter-specific outcomes**: the wires and bed bugs settle into hazards, Post's
  wires apply a 48-frame movement snare, Allan's loogies and Cyraxx's bugs add a
  short stagger, Ali G's record knocks down, and Jez's cable teleports a cleanly hit
  opponent to just outside his own poke range with a "GET OVER HERE" callout.

## Blocker

The ElevenLabs MCP server on this box is misconfigured — it is holding an API key
**ID** rather than an API key, so `text_to_sound_effects` returns
`api_key_id_used_as_api_key`. Rather than block the iteration, the eight object
impacts are synthesized in WebAudio instead. They are genuinely distinct, work
offline, add no download weight, and are trivially replaceable with recorded samples
by adding entries to `audioAssets` later. Rotating the ElevenLabs key would unblock
recorded SFX.

## Verification

The browser suite throws all eight objects and asserts: every fighter spawns a
distinct style, each throw costs a use, supply is bounded at 2-4, every throw leaves
at least 24 frames of recovery, and the objects behave as different archetypes — the
X-Acto out-ranges the loogies by 1.6x and flies dead straight, the pizza is a broad
disc, the vinyl record arcs highest, the golf ball and wires bounce, the wires and
bed bugs leave hazards, and the loogies stay short. It also verifies Jez's tether
reels in on a clean hit but not on block, and that DeathBlow gets exactly two pizzas
before the supply runs dry.

---

# Stage weapons

Separate system, separate command, separate look. Exactly one themed pickup type
per stage, one physical weapon on the playfield at a time, once per round.

| Stage | Weapon | Behaviour |
| --- | --- | --- |
| Somerset SEPTA Station | Discarded needle | Quick pickup, very fast straight dart, tiny hitbox, low damage and brief hitstun, bright glint for readability, one use, no status effect |
| The Vet Parking Lot | Beer bottle | Quick one-handed pickup, fast short-to-medium arc, moderate damage and a stagger, glass shatter with shards that vanish immediately |
| Wildwood Boardwalk | Dead pigeon | Floppy tumbling arc, broad soft hitbox, feather burst, removed cleanly on landing |
| Chinese Buffet | Serving tongs | Medium-speed end-over-end throw, narrow hitbox, sharp metallic clang |
| Cruise-Ship Pool Deck | Souvenir cup | Backlog left this TBD. A giant frozen-drink cup is the most on-theme object on a budget pool deck: slow, wobbly, big soft hitbox, slushy burst that briefly slows |

## Rules

- **Arrival** is seeded from the match seed, stage and round, so the same fight
  always drops the weapon at the same moment and the same floor slot on every
  peer and every replay. It lands somewhere between 16 and 62 seconds into the
  round — never off the opening bell — at one of five fair positions spanning the
  walkable stage, including dead centre.
- **It never arrives at an unfair moment.** `canWeaponArrive` blocks the drop
  during intros, hitstop, supers, any knockdown, the finishing prompt, fatalities,
  Final Blows and while paused. A blocked arrival waits rather than being lost.
- **It telegraphs** for 48 frames with a falling object, a pulsing landing ring, a
  drop line, a name tag and its own audio cue and caption, so both fighters can
  see it coming and contest it.
- **Pickup is down + HP** while standing over it. Outside pickup range that press
  is the ordinary crouching HP, so nothing is taken away from the normal game.
- **While carrying, the weapon replaces HP entirely.** A heavy press throws it or
  is swallowed — it never leaks out as a normal. Carrying slows the walk to 72%
  and stops you jumping, and getting hit makes you drop it.
- **Throwing** is HP: forward is the committed attacking throw, neutral or away is
  a safer short toss with much less recovery. One use — the weapon is gone once it
  lands, and does not respawn inside the round.
- **STAGE WEAPONS: ON/OFF** is a persistent option, default ON. Training has a
  SPAWN STAGE WEAPON button for practice. A Passive CPU never collects or uses one.
- The whole lifecycle — plan, arrival, ownership, carry timer, flight, collision
  and removal — lives in rollback snapshots, so online play and replays stay exact.
