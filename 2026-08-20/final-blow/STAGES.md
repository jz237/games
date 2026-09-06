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

### 4.8 — the crowd in CINEMA 3D

The painted crowd now stands in the 3D world too. The 2D crowd code resolves
every person and scuffle member each tick and hands the result over the
renderer bridge (`host.crowdBillboards()`); `renderer/three/crowd-layer.mjs`
places one fogged billboard per spec on the stage floor — the far, mid and
near bands at their own depths behind the fight plane, x spread scaled by
depth so the crowd fills the frame, feet on the ground, mirrored by facing,
the same cell, cheer and fatality-hold dim as the canvas. Stages without a
painted bank hand over nothing, so Somerset's bespoke silhouettes are never
doubled. `__finalBlowThree.stats().crowd` reports the billboard count.

### 5.0 ambient pulse — where the numbers live

The stage reaction to a big hit and a KO (the Vet's floodlights swell and a
burst goes up over the bowl — two on a KO — the K&A sign chase speeds up, the
wok flares, the gulls scatter, the moths flare) rides one pulse:
`engine/ambient.mjs`. A crowd stir of 0.7 and up latches it ("splat";
"big" from 1), the KO phase change latches it at 1.4 (clamped to 1), and it
decays linearly to nothing over 48 ticks; reduced motion zeroes the level
without moving the age, so the firework seeds stay put. game.js keeps only
the resim guard and the tick. `tests/ambient.test.mjs` pins the thresholds,
the decay and the one-shot KO latch (finish and roundover both, fight screen
only); `__finalBlowQa.ambient()` returns the latch and the level at the
current tick so a probe can confirm a pulse fired before it measures the
floodlights (+27 mean brightness at the KO tick on the Vet, measured by hand
for 5.0 — the browser probe for it is still to write).
### 5.1 — the crowd celebrates the KO, out loud

The roundover hold now belongs to the crowd: a render-side latch on the
phase edge pins an effective reaction that ramps past every painted
threshold in 20 ticks (arms up person by person) and holds for the whole
4.9 s, with each person pumping and bouncing so nothing freezes, the tailgate
scuffles switching to the celebrate choreography, cups flying and three
flashbulbs per 8-tick window; CINEMA 3D inherits all of it through
`host.crowdBillboards()`. Twelve generated crowd takes in
`assets/audio/crowd/` (gasp / ooh / roar / sustained cheer, three each, never
the same take twice in a row, level tied to the stir) play over the synth
swells on specials, throws, wall bounces, supers, the KO and the fatal blow,
and answer a taunt. Details and measurements in MOTION-ATLAS.md, "v5.1 — THE
KO MOMENT".

### 5.1 — stage KO beats: the other four stages answer the KO

5.0's pulse landed almost entirely on the Vet (floodlights, two bursts); the
buffet, the cruise deck and Somerset each had one small hook and no KO beat,
and Wildwood only sped its chase. Now every stage draws from one shared read
(`stageSurge()` in game.js — the pulse for a big hit, the crowd's KO hold
folded in as the KO beat through `engine/ambient.mjs` `ambientKoBeat` /
`ambientSurge`; whichever is stronger drives the furniture, both decaying
over 48 ticks, the hold flag riding the whole 4.9 s roundover). Per stage,
the pulse hooks and the KO beat:

| Stage | Big hit (pulse 0.7+) | KO beat (crowd hold) |
| --- | --- | --- |
| Buffet | wok fireball climbs out of the pass with a white-hot core; the five pendants stutter; ten specular glints hop along the tray line; all seven steam plumes erupt together (`drawBuffetAtmosphere`); the six heat-lamp cones flare and widen (`drawPracticalLights`) | the whole pass-through window floods with kitchen light |
| Cruise | pool surface and wet deck flash (the 5.0 note's "pool-deck flash", now real); the 26-bulb party string under the bar awning stutters; all five splash plumes fire together, bigger | the ship's horn (three synthesised blasts, never the same twice running — `AMBIENT_KO_HORNS` / `pickKoHorn`), a steam jet off the funnel under the horn light, a cannonball in the middle of the pool, six gulls up off the port rail |
| Somerset | nine station lamps under the El and the SOMERSET sign surge; corner signal and storefront neon stutter; pigeons scatter; the El's window band on the pavement flares (`drawPracticalLights`) | a second train through at speed (60 ticks end to end, lit windows smeared into a streak, its band sweeping the wet street) and a street-level flash |
| Wildwood | a bright sector chases round the wheel rim (a lap every 18 ticks); the WILDWOOD letters flood pink-gold; the chase bulbs run 4x faster; the neon pools on the planks surge (`drawPracticalLights`) | rim strobes in 6-tick alternation, every chase bulb held lit for the whole roundover (stuttering through the flash, then a double-speed chase), two fireworks over the pier |
| Vet | unchanged: floodlights swell, a burst over the bowl (two on a KO) | — |
| Janney | unchanged: moths flare, TV windows flare on the KO pulse | — |

Reduced motion zeroes the flash and drops the hold (`ambientKoBeat`) the way
it zeroes the pulse, so nothing strobes; the horn is audio and still sounds.
Everything is a pure function of the tick, the latch and the hold, so replay
and rollback draw the same frames. `__finalBlowQa.ambient()` now also
returns `beat`, `surge` and `stage`; `snapshot().violence.koHorns` counts
horns voiced. Measured on the canvas at the KO tick against the frame before
(mean brightness, landmark rectangles; the roundover's win-card dim is why
KO+170 reads below the pre-KO frame): buffet pass-through 59 -> 147, wok
46 -> 176, pendants 74 -> 87, tray line 93 -> 111; cruise pool 102 -> 136,
deck 86 -> 119, funnel 111 -> 186, party string 56 -> 87, sky flat (+1.5);
Somerset lamps 31 -> 99, SOMERSET sign 59 -> 144, street 34 -> 80, El band
25 -> 73; Wildwood sign 81 -> 124, wheel 57 -> 89, chase bulbs 27 -> 88,
plank neon 45 -> 51. All back to (or under) the pre-KO read by KO+170.

### 5.3 — crowd depth: two crowds, a flinch, real phones, and a living Somerset

Before 5.3 the crowd was a meter with faces. `state.crowdReaction` was a single
scalar with no author, so a hit by either fighter threw the same arms up on the
same people; the vector figures' flinch lean was never applied to the painted
ones and `crowdBillboards` sent `tilt: 0`, so since 4.7 nobody in the crowd had
ducked or winced; the flashbulb picked a person whose *posture* was named
"filming" off a stream independent of the *painting*, so it fired beside a beer
cup, a lollipop or a plate of crab legs; and the hero stage had no living crowd
at all.

**Who the hit was for.** `stirCrowd(amount, kind, { side, splatX })` now carries
the side that landed it, from every hit path (`applyViolenceResponse`, the wall
bounce, the floor slam, the throw, the counter-punch, the paint trap, the
projectile, FINISH THEM, the KO and the taunt); an authorless stir passes -1 and
keeps exactly the pre-5.3 read. `createCrowd` deals every painted person a
per-round **favourite** on its own seeded stream (`hashSeed(seed,
"crowd-favour", stage)`), so the people and their paintings stay byte-identical
to what every pre-5.3 pin measured. The room's lean is drawn once per round
(0.34–0.66) and then dealt from an *exact deck* and shuffled rather than flipped
per person — eight independent coins put Somerset's eight bystanders at 7/1 on
seed 42, and the whole point is that both halves are on screen for every hit.
Measured splits: Somerset 3/5, 5/3, 5/3, 4/4; the Vet 18/14, 14/18, 18/14,
13/19; the cruise deck 23/21, 23/21, 24/20, 17/27 (seeds 1, 42, 7, 99).

`engine/crowd.mjs` `crowdMemberMood()` resolves one member's tick — pure, so the
canvas, the 3D billboards and the QA trace can never disagree. Past their own
threshold, a favourite takes the **cheer** cell and leans 0.05 rad into the
fight; a rival takes the painted crowd's own **shift** cell, hunched, and leans
up to 0.16 rad *away* from it, scaled by the person's `loyalty` (0.55–1.0) and
by how far the stir cleared their threshold. Below threshold nobody moves,
either way. One hit therefore reads as half the room up and half the room
turning away: measured on one crowd stirred by each side in turn, the moods
mirror exactly — Somerset 4 cheer / 4 wince ↔ 4 wince / 4 cheer, the Vet 15/17 ↔
17/15, the cruise deck 15/29 ↔ 29/15 — and the frames differ by 57,013 (Somerset),
80,469 (Vet), 88,052 (cruise) and 260,816 (Wildwood) pixels past an 18/255
threshold.

**The flinch.** A wall splat, a floor slam, a throw, a super or a stage-weapon
hit passes its impact x as `splatX`. Anyone standing within 300 sim px rocks
back for 26 ticks — the shift cell, up to 0.26 rad away from the impact and a
6 px duck, falling off with the square of the distance and linearly with age —
and it *outranks* allegiance, because a body hitting the wall beside you is not
a scoreline. Measured with a splat at x 1050: 10 of the Vet's 32, 14 of the
cruise deck's 44 and 4 of Somerset's 8 flinch, all of them leaning away from
1050 (negative tilt to its left, positive to its right), while everyone outside
the radius keeps the mood their favourite gave them.

**Phones.** `assets/crowd/MANIFEST.json` (v5.3) now classifies every painted
character's prop — cup, can, flag, sign, food, foam, phone, bag, plush, plate,
tray, towel — and carries a per-cell `hand` point for the ones holding a phone.
Only `phone: true` can pop a flashbulb, and the starburst is placed *on* the
phone through the same blit maths the sprite uses. The census behind the change:
1 of 8 tailgate characters (sheet 2 row 2, the white puffer and beanie) and 1 of
8 poolside characters (sheet 1 row 2, the blue tank filming) hold one, at 55–80%
of body height in all four cells; boardwalk and buffet hold food, drinks, bags
and plates in every cell. Wildwood and the buffet therefore pop nothing until a
phone character is painted for them, which is the honest answer — before 5.3
they were flashing beside a pretzel. `tools/build_crowd_sheets.py` carries the
prop and hand tables so a regeneration keeps them.

**Somerset gets a crowd.** The plate's nine folded sitters are untouched, and no
pedestrian walks the band across the wet asphalt. Instead the variant declares
eight fixed **stations** the plate already reads as standable — three on the
right-hand sidewalk outside the roll-shuttered storefront, three under the
left-hand awnings, and two flanking the SOMERSET mouth, held wide of the
doorway's centre line because that is the fight lane — plus one street argument
(argue / shove / separate only; no tailgate celebration on a wet street). A
stationed person never walks: `roam` 0 is rooted and the rest sway at most 12–18
px either side of their mark, verified over 3,600 ticks. The two at the station
mouth carry a `lift` of 6 px for the step they are standing on, which the 3D
layer raises them by.

They are painted from a **borrowed** bank (`CROWD_SPRITE_BORROW`): four of the
eight tailgate characters — black puffer and beanie, grey sweatshirt, white
puffer with the phone, hooded track suit — because that is what a Kensington
platform looks like on a game night, and the El is how the city gets to and from
the stadium. The wing hat, the face paint, the jersey-and-sign and the bare-armed
hot dog stay in the parking lot. A borrowed bank is re-lit for the stage that
borrows it: `night` multiplies by #8095b8 and washes 22% of #26426e over it,
which takes the four characters from a mean 74.6 to 50.8 (a 31.8% drop, cooler),
so lot floodlights become sodium under the El. The 2D path bakes that into one
cached canvas per sheet; CINEMA 3D does it as a material colour. The scuffle's
clash dust is graded with them — the tailgate's cream puff reads as bokeh balls
on a dark wet street.

Somerset also gets the flashbulbs it never had (three of its eight bystanders
carry the phone painting) and hands 10 billboards to CINEMA 3D where it used to
hand zero, so the hero stage is the one that changed most.

**Both renderers.** `renderer/three/crowd-layer.mjs` now reads a real `tilt` for
people (not just scuffle members), a `lift` that raises a stationed person off
the ground plane, and a `grade` that re-tones a borrowed bank. Somerset's
billboards stand nearer the camera than its bespoke silhouette walkers
(z −5.6 / −7.8), so neither doubles the other.

**Reduced motion and determinism.** Reduced motion keeps the cell swap — that is
what makes the split readable at all — and drops every lean and duck to zero;
measured across a stirred and splatted crowd, 0 of 32 members carried a non-zero
tilt. Everything is a pure function of the tick, the seed and the stir, so
replay and rollback draw the same frames. `tests/crowd-sprites.test.mjs` pins the
manifest's prop and hand contract, the borrowed bank, the exact-deck favourite
split, Somerset's stations and roam bounds, the mood table both ways round and
the flinch curve; `__finalBlowQa.crowd()` returns every member's favourite,
mood, painted column, lean and phone flag plus the mood totals and the flash
picks, and `__finalBlowQa.crowdStir(amount, side, splatX)` drives a stir so a
probe can script "side 0 landed a heavy here" without landing one.
