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

The hidden Commissioner is deliberately left without one until the eight requested
fighters are signed off, exactly as the backlog asks.

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
