# Commando HD

A real-time 3D rebuild of Commando HD (three.js r181, vendored, no build step).
Three areas — Landing Zone (day), River Crossing (dusk, rain), Prison Camp
(night) — then the mission loops, harder each time round. It replaced the 2D v0.x build
(painted plates + sprites) on 2026-09-24 — that build is in git history, last
at v0.72.0-reel; `sw.js` here only retires its offline service worker.

Why a rebuild: the 2D build mixed straight-down painted backgrounds with
front-facing, frame-by-frame generated sprites, so perspective, scale, light
and animation never agreed, and collision came from hand-drawn masks over the
paintings. Here everything shares one camera and one sun, and every prop's
collider is built from the same data as its mesh.

Since build v5 the soldiers, vehicles, many props and much of the vegetation
are real models from poly.pizza: [Quaternius](https://quaternius.com/) (CC0 —
Ultimate Modular Men for the soldiers, Stylized Nature MegaKit, a few Toon
Shooter Game Kit props) and KolosStudios' Military Pack
(CC BY — tank, army trucks, tent, container, water tank; credited on the title
screen). Build v6 replaced v5's chunky cartoon soldiers and props with these
normal-proportion ones, for the action-movie tone. Build v7 added scanned
ground (five CC0 Poly Haven textures blended per vertex by biome, by height on
high quality), billowing fireballs and smoke plumes, burning wrecks, film
grain, lens fringe and FXAA. Build v8 rebuilt the palms (a ringed trunk in
code wearing the MegaKit bark, crowned with MegaKit fern fronds), gave water
depth shading and shore foam, and dressed the trenches with posts and
duckboards. Terrain shape, water, buildings, the fortresses,
barrels and the remaining foliage are still built from primitives in code.

## Build v9 (2026-09-26): fourteen ways to die, and a watchable demo

**Deaths** (`src/deaths.js`). Every enemy used to play the one Death clip
with the same `enemy-down` sound. Now each kill picks a death from what hit
him and where he stood, and each has its own motion, effects and voice
(ElevenLabs renders in `assets/sfx/die-*`, `body-*`, `bike-crash`):
bullets — classic drop, double-hit stagger, spin-out, drop to the knees and
face-plant, stiff-plank topple, thrown flying backwards (point blank or on a
kill streak); blasts — launched tumbling end over end, corkscrewed straight
up, log-rolled along the ground, scorched soot-black and coughing before he
drops; situational — splash into water, flailing fall from towers and ledges,
motorcycle riders thrown over the handlebars, and the officer's theatrical
exit (reels round, waves goodbye, then falls). Choice is weighted and never
repeats the previous death; voices are gated to two per 250 ms so a grenade
among six men is not six screams at once. Purely visual: the soldier is dead
the moment he is hit. Two rules the first draft broke, both now in the code:
styles that end in the Death clip must not add their own 90° tilt (the clip
already lies him on his back — together they buried him head-first), and the
rig is posed upright before the body is tilted (the kneeling IK works in
world space). `__cmd.game.forceDeath = 'launch'` forces a style;
`game.deathTally` counts them.

**WATCH DEMO** (title menu). The autopilot plays a full scored campaign from
Area 1 with the HUD, banners and music a player gets; game over is an
automatic continue, and after MISSION ACCOMPLISHED it hands back to the
title. Any key or tap exits. Its score never touches the saved hi-score
(`newGame({ showcase: true })`). Verified: all three areas in ~5 min of game
time with zero continues. Test hooks: `__cmd.watchDemo()`, `__cmd.demoState()`.

## Build v10 (2026-09-26): soldiers that move like people

"The characters are too stiff, they have no ragdoll, and he isn't holding the
gun right." Six changes, all in the rig code; the game still drives the same
parameters.

**The rifle hold** (`src/soldier.js`). The weapon used to be baked onto the
right wrist in the rig's pistol pose (`Idle_Gun_Pointing`), so every rifleman
held his AK out at arm's length like a handgun. It now has a bone of its own
(`Gun`) that pose() places every frame: stock in the right shoulder pocket,
barrel down the aim line, torso bladed so the support shoulder leads; two-bone
IK puts the right hand on the pistol grip and the left under the handguard,
with the wrists turned to wrap the grip. The rig's arms are short for its
height, so the rifle is carbine-length and slides back until both hands reach.
Recoil kicks the stock back and the muzzle up through the arms and rocks the
shoulders; running without firing drops it to a low ready. The officer's SMG
is held the same way.

**Ragdolls** (`src/ragdoll.js`). Every death now ends in a Verlet ragdoll:
16 particles on the joints (pelvis, mid-spine, neck, skull, shoulders, elbows,
wrists, hips, knees, ankles), rigid sticks for the braced pelvis and chest
blocks and the limb bones, soft ranges that keep the torso a torso, knee and
elbow hinges, hip limits (no splits, no leg swung up behind), gravity,
terrain with friction, water drag with fading buoyancy, and walls near the
ground. The pelvis and chest follow particle frames; every other bone swings
the least amount that points it at its particle, so twist stays stable. The
rifle drops out of the hand as its own two-particle body and settles on its
side. A settled body sleeps (1–3 s) and costs nothing; twelve fresh ragdolls
cost ~1 ms a frame. The fourteen v9 death styles became kicks: shots knock a
man back with the knees buckling (swung up to ~50° to one side — a fall
straight away from this camera reads as sitting down), point blank throws
him, blasts launch him end over end, corkscrew him or roll him along the
ground, towers drop him flailing off the front, riders go over the
handlebars. The stagger, spin, kneel, scorched daze and the officer's
farewell play their scripted openings first and hand over mid-motion (the
last two frames of joints become the ragdoll's velocity). Joe dies as a
ragdoll too and stands back up on respawn.

**Secondary motion.** Lean into the run and into turns (and into a
side-step); an acceleration lean; breathing and a slow weight shift at rest;
the head turns to the nearest threat (enemies watch Joe); the legs lag a
turn on the spot and step round (Walk legs) instead of pivoting; feet find
the ground on slopes (the hips drop for the downhill foot and the knees
re-solve with the clip's own bend).

**Hit reactions.** A flinch layer (spine and head snap away from the blow,
knees dip): Joe when he's hit or a blast goes off near him; enemies when a
round cracks past within a metre, and a stagger with a shove and a pause in
their fire when a blast just misses them.

**Grenades.** Overhand throw instead of a punch: wind up behind the head,
whip over the shoulder, follow through across the body, the torso turning
into it; the grenade is visible in the palm until release and leaves from
the hand. The rifle rides in the left hand meanwhile. Lobbers point their
free arm at the target. The mortar crew have their own kind (`crew`: rifle
uniform, hands free) and feed the tube with both hands.

**More clips** (`assets/anims/swat-extra.json`, 30 KB gzipped). The packer
had kept 11 of the Modular Men's 24 clips; `tools/extract-clips.mjs` pulls
six more from the pack's own Swat.glb (Quaternius, CC0; same rig, identical
clips to 0.006 rad, so no retargeting): Run_Back, Run_Left and Run_Right —
armed men now face their aim and strafe or back-pedal, blended by the angle
and kept in step by each clip's left-foot stance phase, with the chest held
square to the aim; Idle_Gun — a relaxed stance when not ready; HitRecieve_2
— a second reaction for the scripted death openings; and Roll — soldiers
just outside an incoming grenade's blast (never inside it) dive-roll clear.
Note `AnimationClip.parse` keeps the JSON's uuid and the mixer keys actions
by uuid: each parsed clip needs a fresh one or they all share one action.

Tuning lives in `RIG` (soldier.js). Tests: `__cmd.game.forceDeath`,
`game.joe.s.flinch(dx, dz, amp)`, `s.rag` (the live ragdoll).

## Layout

| file | what |
|---|---|
| `src/main.js` | boot, shader pre-warm, menus, attract demo, fixed 60 Hz loop, test hooks |
| `src/deaths.js` | the death catalogue: choosing a death, its scripted opening, ragdoll kick, effects and voice |
| `src/ragdoll.js` | build v10 Verlet ragdoll: joint particles, sticks, limits, terrain/water/walls, bones driven from particles, the dropped rifle |
| `src/game.js` | simulation: Joe, enemy AI, bullets, grenades, trucks, tank, motorcycles, searchlights, bunker, mortars, POWs and cages, finale, continues, scoring |
| `src/level1.js` … `level3.js` | area layouts in metres (props, water, encounters, POWs, patrol, finale) |
| `src/levels.js` | the campaign order and per-area lighting/weather (`AMBIENCE`) |
| `src/world.js` | builds an area's terrain, water, props, vegetation, night lights and colliders; disposed between areas |
| `src/terrain.js` | analytic height + colour + water function (rivers, wadeable swamp, causeways, cliffs, AO, craters, trenches); per-vertex texture-layer weights and the splat ground shader (the palette colour becomes a tint over the scans) |
| `src/assets.js` | loads the model GLBs at boot; turns models into shared, normalised geometry (vertex-coloured or textured), splits the tank |
| `src/models.js`, `src/models2.js` | the procedural models (buildings, fortresses, trucks, motorcycle…) and the tank wrapper |
| `src/soldier.js` | soldiers assembled from Modular Men parts + rifle (on its own Gun bone), baked per kind into one skinned mesh (one draw call each); leg / upper-body / finger clip groups blended from speed, strafe angle, crouch, readiness; procedural layers: shouldered rifle IK, lean, breathing, head look, turn steps, slope feet, flinch, overhand throw, mortar feed; hands over to the ragdoll |
| `assets/models/` | `adventurer.glb`, `swat.glb`, `beach.glb` (one rig; clips in `swat.glb`), `props.glb`, `nature.glb` — meshopt-compressed, WebP textures (2.6 MB total) |
| `assets/anims/` | `swat-extra.json`: six more Modular Men clips (strafe runs, rifle idle, second hit reaction, roll) |
| `assets/textures/` | `ground-albedo.webp` / `ground-normal.webp`: the five ground layers as strips (colour; normal X/Y + height), loaded as texture arrays |
| `tools/` | `pack-models.mjs` rebuilds `assets/models/` from the source GLBs in `models.txt`; `pack-textures.mjs` rebuilds `assets/textures/` from the Poly Haven 1K scans in `textures.txt`; `extract-clips.mjs` writes `assets/anims/` from the pack's Swat.glb |
| `src/fx.js` | particles, tracers, muzzle flashes, explosions, decals, lights, floating text |
| `src/render.js` | renderer, sky environment, sun + shadows, bloom + grade, camera rig |
| `src/bot.js` | autopilot (attract mode and playthrough tests); local A* around obstacles |
| `src/input.js`, `src/hud.js`, `src/audio.js` | controls, DOM HUD, wrapper over the shared `sfx.js` / `music.js` |

World units are metres: `x` right of the corridor centre, `p` north of the
landing zone (three.js `Z = -p`).

## Testing

Load with `?test` to stop the real-time clock and drive it from
`window.__cmd`: `start({bot, god})`, `step(n)`, `run(n, every)`, `warp(p)`,
`input(intent)`, `state()`, `frames()`, `area(n)`. `?area=N` starts on an
area, `?prof` logs slow frames, `?q=low` forces low quality, `?play` skips the
title.

Headless Chromium with `--use-angle=d3d11 --enable-gpu` renders on the real
GPU; the autopilot clears each area in 80–105 s of game time.

## Models

`tools/models.txt` lists every source model (name → poly.pizza GLB id). To
rebuild the packed files: download those GLBs into `tools/raw/<name>.glb`,
`npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp`,
then `node tools/pack-models.mjs assets/models`. The packer keeps only the
clips the game uses (in one character file only — they share the rig),
drops the MegaKit normal maps (wasted from a top-down camera), simplifies the
densest plants, dedupes textures and shrinks them to WebP. Sizes and placement
are tuned in code (`PROP_FIT` and `qKinds()` in `world.js`, `LOOKS` in
`soldier.js`, `TANK_FIT` in `assets.js`).

## Releasing

The site's CDN serves `.js`/`.css` with a 4-hour browser cache that overrides
`_headers`, but `index.html` is always revalidated. So `index.html` pins every
module (import map) and the stylesheet to `?v=N`: **bump `v=` in
`index.html` on every release** (all occurrences), or returning players can
run a mix of old and new modules for hours.
