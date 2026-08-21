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

## Verification

- `node --test tests/demo.test.mjs` checks determinism, full matchup coverage, stage/track rotation, boundary behavior, invalid configuration, and 10,000 bounded cycles.
- `node tests/browser-smoke.mjs` checks two live AI brains, automatic Final Blow activation, result scheduling, 64 rapid cycles with one bounded intro timer, input-to-exit, mobile HUD bounds, hidden touch controls, and offline precaching.
