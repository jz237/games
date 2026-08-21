# Stage crowds

## Kensington & Allegheny

The K&A street is now genuinely occupied. `engine/crowd.mjs` builds **32
pedestrians** once per round from the match seed and animates them purely from the
simulation tick, so the crowd is byte-identical under replay, rollback, the
AI-vs-AI demo and automated tests while never touching gameplay state.

**At least 27 are on screen at any moment** — the walking band is only slightly
wider than the 1280px frame, so the street never empties.

### Depth

Three layers, each with its own scale, walking speed, opacity, detail level and
parallax factor:

| Layer | People | Scale | Speed | Opacity | Parallax |
| --- | --- | --- | --- | --- | --- |
| far | 14 | 0.58 | 0.42 | 0.72 | 0.09 |
| mid | 11 | 0.74 | 0.68 | 0.82 | 0.17 |
| near | 7 | 0.92 | 1.00 | 0.90 | 0.29 |

Every layer sits well above the fighters' floor line and none of them are in
collision space — the crowd is drawn before the fighters and has no simulation
presence whatsoever.

### Variety

Each pedestrian is generated with its own posture archetype, build, height, width,
shoulder slope, head tilt, direction, pace, gait phase, pause rhythm, coat,
trousers, accent colour, hood, hat and bag. There are seven posture archetypes,
weighted so **hunched, shuffling, stooping and lingering figures make up around
84%** of the crowd, with a minority of upright walkers and leaners for contrast.

Nothing is synchronised: pace, gait phase, pause period, pause length and pause
offset are all independent, so two neighbours on the same layer drift apart within
seconds and stop at different times for different lengths.

### Contrast

The palette is deliberately mid-tone and desaturated, the crowd is drawn behind
the fighters, and every figure carries a soft contact shadow so it sits on the
pavement. The brightest values, sharpest edges and strongest effects stay with the
playable characters.

### Reactions

A landed special stirs the crowd slightly, a super stirs it hard, and the
finishing prompt stirs it hardest. Reacting pedestrians flinch and hunch for a
moment, then decay back to their routes — they never become interactive.

### Performance

Figures are drawn with plain canvas primitives, culled the moment their
parallaxed position leaves the frame, and drop bag and hat detail on the far
layer. The browser suite asserts the crowd stays at 25 or more visible on the
844x390 landscape target as well as on desktop.

## The Vet Parking Lot

The same crowd engine drives a completely different scene. `STAGE_CROWD_VARIANT`
maps the Vet to the **tailgate** variant, which swaps the posture set, the palette
and adds looping background fights.

### The fans

Eight tailgate postures replace the street set, weighted so **drinking, chugging,
toasting, pouring and stumbling make up over 60%** of the lot: people raise cups,
tip cans back, clink toasts, pour drinks, wave flags, hold up handmade signs and
mill about. Props are drawn in the raised hand — plastic cups, cans, flags on
poles and hand-scrawled signs whose marks are deliberately abstract scribbles.

The palette is a wholly original fictional bird team: deep greens, whites,
silvers and blacks, with a third of the crowd wearing face paint stripes. **There
are no official Philadelphia Eagles, NFL or sponsor marks anywhere** — no real
logos, no real wordmarks, no reproduced merchandise. The identity comes entirely
from colour, face paint, flags and handmade signage.

### The scuffles

Five simultaneous fight loops run at any time, drawn from eight distinct kinds:
arguing, shoving, shirt-grabbing, a wild swing, wrestling, a friend holding two
people apart, a table bump and flip, and post-fight celebration. Each group has
its own place, scale, mirror, loop period, playback speed and phase offset, so no
two beat together and the lot never looks like one animation played in unison. A
puff of dust at the peak of each clash makes them read as fights rather than
people standing close. The violence stays rowdy and physical — shoving, grabbing
and missing — with no graphic detail.

### Props and reactions

Coolers, folding tables and grills are placed along the lot, with the grills
giving off drifting smoke. When the crowd is stirred hardest — a super, or the
finishing prompt — cups are thrown into the air across the whole lot, then
everything settles back to its routes.

### Not in the way

Every fan, scuffle and prop is drawn before the fighters, sits above the fight
floor line, and has no simulation presence at all. Nothing can enter combat
collision space or cover the fighters or HUD.

## Wildwood Boardwalk

The Wildwood, New Jersey boardwalk at night, framed to match the Philly After Dark
identity. A huge illuminated **WILDWOOD** sign in tall retro capitals sits high and
centred so it stays readable through all normal camera movement, with a lit Ferris
wheel, roller coaster, neon arcade fronts, food stands, striped awnings, benches
and litter bins around it, a low white railing, and the dark ocean beyond.

Wet plank decking catches the neon in long reflections. On top of the background:
drifting seagulls, a ride car climbing the coaster, and a soft sea haze rolling
along the railing line.

The crowd uses the **boardwalk** variant — strolling, ambling, leaning on the
railing looking at the ocean, snacking, pointing and cycling past.

Stage weapon: the **dead pigeon**.

## Chinese Buffet — Crab-Leg Section

The fight happens directly in front of the crab-leg line. A long stainless steam
table runs across the middle of the frame under a glass sneeze guard, heaped with
crab legs steaming under warm heat lamps, with serving tongs in the trays, stacked
plates and sauce tubs at each end, tiled walls, glowing menu panels, hanging
pendant lights, a second steam table behind and a pass-through to a bright kitchen.

On top of the background: steam pulsing on independent rhythms along the line, and
pendant lights swaying — harder for a moment after a big hit.

The crowd uses the **buffet** variant — patrons loading plates, reaching in with
tongs, competing over the trays, queueing, carrying overflowing dishes away and
occasionally spilling. Their plates are drawn heaped well past the rim.

Stage weapon: the **serving tongs**.

## Shared

Both stages are selectable from stage select, join the Arcade rotation, versus,
Training, online play, deterministic replays, random selection and the Watch Demo
shuffle bag, and are precached for offline play. Both share the same floor line
and stage bounds as the original two, so the enlarged fighters, their shadows,
projectiles, throwable objects, stage weapons and Final Blow cameras all frame
identically. Backgrounds are original art generated for this project.

### Blocker

Dedicated original music per stage is blocked on the same ElevenLabs
misconfiguration that blocked the object SFX — the MCP server holds an API key ID
rather than an API key. Both stages currently draw from the existing four original
soundtracks through the normal rotation, and their ambience is rendered visually
rather than as an audio bed. Rotating the ElevenLabs key would unblock a dedicated
track and ambience mix for each.

## Cruise-Ship Pool Deck

The fight happens on the open deck directly in front of the ship's main pool:
turquoise water, tiled edging, chrome handrails and ladders, rows of white
loungers with folded towels, closed parasols, an open bar with stools and hanging
glasses, a curved water slide, three tiers of balconies and railings, lifeboats, a
funnel and the ocean horizon beyond.

### The passengers

This is the densest crowd in the game: **44 passengers, at least 39 visible at
once**, across the far, mid and near layers.

Nine poolside postures carry the comedic high-chaos budget-vacation energy through
behaviour and styling rather than any branding: nursing an absurd souvenir cup with
a straw, filming everything on a phone, queueing impatiently, staggering along
overpacked, throwing a towel down to claim a lounger, dancing, stumbling, carrying
an overloaded plate, and staff squeezing through the crowd. The palette is loud
mismatched resort wear — clashing oranges, cyans, pinks, yellows, greens and
purples. **No Spirit Airlines, Nissan, cruise-line, alcohol or other corporate
marks appear anywhere.**

### The incidents

Six concurrent incident loops run at any time from six distinct kinds:
cannonballs, splashing, arguing over a lounger, cutting the bar line, spilling a
frozen drink and staff squeezing past. Each has its own place, scale, mirror, loop
period, speed and phase offset, so nothing beats together.

On top of that: splash plumes rising out of the pool on independent rhythms, a
rider running the water slide, and heat shimmer over the hot deck that intensifies
when the crowd is stirred.

### Safety and framing

The playable floor is clearly separated from the pool and every passenger. As on
every other stage, the crowd is drawn before the fighters, has no simulation
presence, and cannot enter combat collision space or cover the fighters or HUD.
The stage shares the same floor line and bounds as the rest of the roster.

Stage weapon: the **souvenir cup** — the backlog left this one TBD, and a giant
frozen-drink cup is the most on-theme object on a budget pool deck: slow, wobbly,
a big soft hitbox and a slushy burst that briefly slows whoever wears it.
