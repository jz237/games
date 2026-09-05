# Stage crowds

## Somerset SEPTA Station

The former Kensington & Allegheny arena has been removed. Its replacement is a
highly detailed photoreal night view from the street into the Somerset station
entrance beneath the Market-Frankford elevated railway.

### Street composition

The entrance and **SOMERSET** sign sit clearly in the middle background. Blue El
girders, a silver-and-blue train, distressed rowhouses and storefronts, traffic
signals, parked cars, wet asphalt reflections and scattered litter retain the
movement, density and amber/cold-blue lighting language of the old stage. The
center foreground remains open for the fighters and stage weapon.

### Background people

Nine anonymous adults sit or crouch along the far and middle-background
sidewalks. Their clothing, anatomy and depth are rendered directly into the
photographic plate, and their torsos are deeply folded with their heads lowered
near their knees. They remain non-interactive, non-graphic and outside the fight
plane.

The old stage's 32 canvas pedestrians are disabled here. Overlaying those arcade
figures would cover the requested poses and break the realistic material
treatment. `engine/crowd.mjs` exposes the plate's actor count and posture as
deterministic metadata for QA without pretending the embedded people are moving
simulation entities.

### Activity and performance

The existing El motion and rumble, passing window-light sweep, drifting litter,
weather particles, wet-floor reflections, cool rim light and stage ambience stay
active. The optimized `assets/somerset-septa.webp` plate is 1280x720 and loaded
through the same on-demand media path as the other stage art.

## The Vet Parking Lot

The same crowd engine drives a completely different scene. `STAGE_CROWD_VARIANT`
maps the Vet to the **tailgate** variant, which swaps the posture set, the palette
and adds looping background fights.

### The fans

Eight tailgate postures replace the street set, weighted so **drinking, chugging,
toasting, pouring and stumbling make up over 60%** of the lot: people raise cups,
tip cans back, clink toasts, pour drinks, wave flags, hold up handmade signs and
mill about. Props are drawn in the raised hand — plastic cups, cans, flags on
poles and hand-scrawled signs. The new 1280x720 photoreal plate makes the setting
explicit: a dense adult **Philadelphia Eagles** tailgate in green, white, black
and silver, with wing hats, face paint, jerseys, flags and a large readable
**EAGLES** banner. The crowd remains anonymous and no identifiable real person
appears.

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

At least six polished steel beer kegs, pump taps, hoses and stacks of cups are
visible in the plate. Six more deterministic tapped-keg props sit along the far
left and right sides of the animated layer, together with folding tables,
coolers and smoking grills. The middle stays open for combat. When the crowd is
stirred hardest — a super, or the finishing prompt — cups are thrown into the air
across the whole lot, then everything settles back to its routes.

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

Every stage is selectable from stage select and joins Arcade, versus, Training,
online play, deterministic replays, random selection and the Watch Demo shuffle
bag. They share one floor line and one set of stage bounds, so the enlarged
fighters, shadows, projectiles, throwable objects, stage weapons and Final Blow
cameras frame identically. Backgrounds are original art generated for this
project and follow the small-shell PWA policy: code boots offline, while media is
loaded on demand.

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

## 4.7 — Painted bystanders and ambient life

The canvas pedestrians on the Vet, Wildwood, the buffet and the pool deck are
now **painted characters** instead of vector figures: eight per stage variant,
generated as one 4x4 sheet per four characters (`assets/crowd/<variant>-N.webp`,
built by `tools/build_crowd_sheets.py` from the archived raw generations), each
with a stand / weight-shift / cheer / stride cell. The crowd engine is unchanged
— routes, pauses, postures and palettes still come off the seeded crowd stream —
and a separate seeded stream deals each person a character (neighbours never
share one) and each scuffle or pool incident three distinct members. Walkers
alternate stride and stand on the gait clock, idlers shift their weight on a
personal timer, and a stirred crowd throws its arms up person by person past
each one's own threshold. Sheets load lazily; the vector figures remain the
fallback until they arrive. Somerset keeps its plate-baked people and Janney
its cats.

`drawStageAmbient` adds frame-driven background life pinned to plate landmarks:
Vet — breathing floodlights, a blimp, fireworks over the bowl; Wildwood —
turning wheel lights, a chasing sign, a passing plane, a ship on the horizon;
buffet — kitchen staff crossing the pass-through, a wok flare, breathing
pendants; cruise — funnel smoke, gulls, a horizon ship; Janney — moths at the
sodium lamp, TV flicker in the rowhouses, headlights sweeping the far street, a
plane; Somerset — a cycling corner signal, a car coming up the side street,
pigeons that scatter. Everything is a pure function of the simulation tick,
frozen under reduced motion and skipped on the battery profile.
