# Final Blow v1.9E — Handoff

Paste this whole file to the next agent as context before asking it to touch
Final Blow. It describes what exists, where it lives, the traps, and how to
verify anything you change.

This file lives at `2026-08-20/final-blow/HANDOFF.md` in `jz237/games`.

---

## 1. What this is

`Final Blow: Philly After Dark` is a browser 2D versus fighting game.

**Version history since 1.8E** — 1.9 "Disrespect" added the wave-eleven
offensive-depth pass and encoded real attack buttons in online play. **1.9A**
is a facing bugfix release, with two distinct fixes in `engine/facing.mjs`:

1. **Shared pair axis.** Both fighters now derive facing from one axis instead
   of each deciding alone, so they can never end up pointing the same way. The
   overlap deadband holds that axis rather than each fighter's stale value, so a
   fighter free to turn is never stranded facing backwards. The axis is
   simulation state and rides along with rollback.
2. **Range-aware facing lock.** A committed attacker still holds its cross-up
   direction, but only while that direction can plausibly matter. Past
   `FACING_RULES.lockVisibilityFrames` — the same tolerance the browser suite's
   sustained-wrong-facing guard uses — a fighter whose opponent is outside the
   move's authored hitbox reach turns to face them. This ends the 1.9 defect
   where a long EX special (cyraxx BUFFER SKIP EX) left a fighter visibly facing
   away for over a third of a second at a distance it could never reach. Reach
   is derived from authored hitbox data and body extents, never per-fighter
   exceptions, so it tracks whatever the kits ship.

**1.9B "Approved Audio"** applies Jez's 170-sound review literally: 84
rejected recordings were removed from the game, 33 rejected candidates remain
outside it, and the 30 accepted kick candidates now drive light-kick and
roundhouse swings/impacts. Empty fighter pools use accepted shared sounds or
procedural audio. The generated policy and regression guard prevent rejected
files from returning or being requested at runtime.

**1.9E "Mobile Parity"** answers Jez's three phone-Chrome reports.
(1) POST FACED BACKWARD: his sheets mix authored orientations — idle/walk/
block/down painted facing left, punch and spray actives extending right —
while the renderer mirrored every cell as if right-authored.
`engine/atlas-facing.mjs` now records authored facing per fighter/bank/frame
and every mirrored draw (body, cast shadow, dash afterimage) multiplies by it.
`tests/atlas-facing.test.mjs` locks the mapping; `tests/mobile-parity.mjs`
locks the SHIPPED ART to the mapping with perceptual hashes and probes the
live renderer's effective mirror, because numeric-facing tests cannot see
this bug. Re-authoring a sheet: GENERATE_BASELINES=1 regenerates the hash
table, then re-verify facings by eye.
(2) LETTERING CUTS: the `.game-frame::before` scanline overlay sat at z 50,
above the announcer (z 9) and title screens (z 10); on mobile high-DPI
resampling its stripes carved through the large scaled glyphs. It now sits at
z 2 — above the canvas (gameplay keeps the arcade texture) and below every
DOM text layer.
(3) MOBILE AUTO-DOWNGRADE: coarse pointers were forced to the balanced
profile and banned from sharp DPR rendering. Profiles are now capability-
based (cores/memory; reduced-motion and data-saver still force battery) and
sharp rendering follows the profile with the desktop-proven 2x cap, so a
capable phone renders a crisp 2x backing store like a HiDPI desktop while
weak devices keep the cheap path. Simulation is untouched — profiles only drive render budgets, and the
effects they gate are checksum-exempt.

**1.9D "Mobile Gate"** makes the portrait gate environment-aware. The old
gate showed one ENTER FULLSCREEN button whose failure paths were all silent:
iPhones have no element fullscreen at all, and in-app browsers (the reported
case is Discord's WKWebView, which also pins itself to portrait so rotating
the phone does nothing) left the player trapped behind a dead button.
Capability checks — not user-agent sniffing — now pick the gate's mode at
render time: a capable browser keeps the immersive button; a browser with no
fullscreen support gets rotate guidance; a detected in-app container
additionally gets "Open in Safari/your browser" instructions plus a
COPY GAME LINK control (a page cannot launch Safari itself, so the copy never
claims to); and a fullscreen request that rejects at runtime retires the
button on the spot and surfaces the DOMException name in the hint. The UA
string only refines the wording for known containers. Landscape still clears
the gate in every mode, and `tests/orientation-gate.mjs` holds all five
scenarios — run it with GAME_ROOT pointing at a pre-1.9D checkout to watch it
catch the old silent failure.

**1.9C "Readability"** is a visual-clarity pass built from Jez's own playtest
notes ("not anchored to the ground", "too much happens at once", "they often
occupy the same space"):

1. **Ground anchoring.** The idle/walk bob is no longer a whole-sprite
   translate — it rides the same feet-anchored scaleY the breathing effect
   uses, so the feet and the contact shadow stay glued to the floor line and
   only the chest moves. Previously the contact shadow bobbed with the body
   while the directional cast shadow stayed planted, so the two ground cues
   disagreed by ±2.7px at ~1.6Hz and the fighters read as hovering.
2. **Punctuated pacing.** Hitstop moved to genre values (6f light / 8f heavy /
   10f special / 13f super, blocked 4f) and the freeze no longer eats inputs:
   simulatePreparedGameTick keeps running the full input pipeline (motion
   history, taunt taps, the rollback-snapshotted action buffer) through the
   stop, so links pressed during it come out the other side. COMBO_RULES
   grew by the same ~5 ticks the freeze added (gap is measured in ticks that
   keep counting through hitstop) — real fight-time combo timing unchanged.
   Sound captions are opt-in, ordinary hit flash is a glint (full-screen white
   is reserved for supers/dizzy/guard crush, render cap 0.5), and shake/flash
   decay through the freeze instead of holding at peak.
3. **No more body stacking.** The eight ignorePushbox lunges pass through only
   during startup+active; through recovery the pushbox re-engages and the
   separation is eased at 14px per fighter per tick instead of snapping the
   full overlap apart in one 60Hz step (measured: a cornered Buffer Skip used
   to teleport the pair 59px in a single tick). CPU-only modes can no longer
   flow-skip their own finisher — previously only decision-cadence luck
   protected the demo showcase from the AI's own button mashing.

`tools/visual-compare.mjs` captures the before/after evidence (idle anchoring
pair, impact overlays, corner-lunge overlap) from any checkout — see its
header comment.

Note that the detailed sections below still describe the 1.8E baseline; 1.9 did
not update them.

Version
**1.8E** shipped on 2026-08-23. It keeps the Tournament Feel, cinematic-finisher,
presentation and living-soundstage passes, then adds guard crush, Perfect Guard,
quick/delayed wake-up choices and air recovery. The four-button neutral roles are
now named consistently everywhere: **LP Jab, HP Hook, LK Light Kick, HK
Roundhouse**. CLEAN HITS removes the post-hit monochrome/inversion and automatic
move-name popups while preserving color-brightened hit feedback and tactical
callouts. PROJECTILE FATALITIES makes the assigned special the cause and visual
focus of all three finisher beats: the object is primed, traps or strikes the
chosen limb, then visibly delivers the severing final hit. The camera tracks the
pizza, corded mouse, loogie, tangled wires, X-Acto, golf ball, bed bugs or vinyl
record, while object-specific VFX and captions name every beat. Every one of the
16 variants leaves a complete limb, stump wound and sustained arterial spray in
the aftermath. Graphic Fatalities still gates every gore layer, while reduced
motion caps rendered camera snaps without removing the special-object focus.
REALITY BREAK changes the visual language only during a Final Blow: the current
arena crossfades into the 96 KB photoreal environment plate
`assets/final-blow-reality.webp`, while filmic split lighting, real-material
fighter detail, restrained grain and a deep vignette replace the normal arcade
finish. The render-only transition never enters rollback state. Reduced Motion
shortens the crossfade and freezes grain; High Contrast omits grain/portrait
detail without removing the photoreal environment or projectile choreography.
The environment plate follows the existing on-demand media policy and is not in
the service-worker install shell; filmic code-native lighting remains the
offline fallback if that image has never been fetched.
SOMERSET AFTER DARK removes the Kensington & Allegheny stage and replaces it
with a street-level view into Somerset SEPTA Station. The generated 1280x720
photoreal plate keeps the El, passing train, wet reflections, rowhouses,
storefronts, traffic lights and litter, while nine anonymous adult background
figures are realistically seated or crouched with their torsos deeply folded and
heads lowered near their knees. Those people are part of the photographic plate;
the old 32-person arcade crowd is disabled on this stage so it cannot cover them
or break the visual treatment. El motion, lighting, litter, ambience and the
existing stage weapon remain active.
EAGLES TAILGATE rebuilds the Veterans Stadium plate as a photoreal Philadelphia
Eagles pregame: a dense adult crowd in green, white, black and silver, wing hats,
face paint, jerseys, flags and a readable EAGLES banner. Rows of tapped steel
beer kegs, cups, tables, grills and cars line both sides while the middle fight
lane stays clear. The deterministic crowd layer exposes six keg stations for QA
and draws six additional steel kegs with pumps, cups, tables and grill smoke.

**Source of truth:** `git@github.com:jz237/games.git`, at `2026-08-20/final-blow/`.
The local working clone is:

```
/home/jez237/.openclaw/agents/gamemaster/workspace/final-blow-goal/
```

That clone is on a branch called `final-blow-goal` which tracks `origin/main`.
Do not create a new location for this game — the URLs below are fixed.

**Recovery tag:** `final-blow-v1.8e` on `jz237/games`.
If anything is ever lost, `git checkout final-blow-v1.8e` restores the exact
shipped state.

---

## 2. Where it is published — READ THIS BEFORE DEPLOYING

The game is intentionally live at **exactly two** URLs, both served from the
**`jez237-site`** repo:

| URL | Served by |
| --- | --- |
| `https://jez237.com/games/2026-08-20/final-blow/` | Cloudflare Pages on `jz237/jez237-site` |
| `https://jz237.github.io/jez237-site/games/2026-08-20/final-blow/` | GitHub Pages workflow on `jz237/jez237-site` |

It is **deliberately 404 on `https://jz237.github.io/games/2026-08-20/final-blow/`.**
Jez asked for it to be taken down there. The source still lives in `jz237/games`
(that is the canonical repo), but `.github/workflows/pages.yml` in that repo has
a step that drops the folder from the Pages artifact:

```yaml
- name: Drop games published elsewhere
  run: rm -rf 2026-08-20/final-blow
```

**Do not remove that step** unless Jez asks for the games-site URL back.

### How to publish a change

1. Commit and push to `jz237/games` `main` — this is the source of truth.
2. Mirror to `jez237-site`. `main` there is a **protected branch that rejects
   merge commits**, so do NOT use an old working clone. Use a fresh shallow clone
   of `origin/main` and make one fast-forward commit:

Before mirroring, the service-worker guard must pass:

```sh
node --test 2026-08-20/final-blow/tests/service-worker-guard.test.mjs
```

Do not publish Final Blow if that guard fails.

```sh
FINAL_BLOW_MIRROR_DIR=$(mktemp -d)
git clone --depth 1 git@github.com:jz237/jez237-site.git "$FINAL_BLOW_MIRROR_DIR"
cd "$FINAL_BLOW_MIRROR_DIR"
SRC=/home/jez237/.openclaw/agents/gamemaster/workspace/final-blow-goal/2026-08-20/final-blow
rsync -a --delete \
  --exclude 'assets/references/' --exclude 'BACKLOG.md' --exclude '.git' \
  --exclude '.wrangler/' --exclude 'node_modules/' \
  "$SRC/" games/2026-08-20/final-blow/
git add games/2026-08-20/final-blow
git commit -m "Publish Final Blow <label>"
git push origin HEAD:main
```

3. **All rsync excludes are mandatory.** `assets/references/` holds a private
   photo of a real person that Jez supplied as art reference, and `BACKLOG.md` is
   an internal spec. Neither may ever reach a public repo. `.wrangler/` contains
   local Durable Object state and `node_modules/` is local tooling; neither belongs
   in the static site. The private files currently return 404 on all live URLs —
   keep it that way.

### Deployment traps

- **`jez237-site` is 4.8 GB of git history / 13 GB working tree.** Its Pages
  workflow uses `actions/checkout@v7` at full depth, so the Checkout step takes
  4–30 minutes and has hung outright once. If a deploy sits on Checkout for
  30+ minutes, cancel and re-run it (`gh run cancel <id>` then `gh run rerun <id>`)
  — that fixed it last time.
- That workflow has `concurrency: cancel-in-progress: true`. **Pushing again
  while a deploy is in flight cancels it.** Wait for the current one to finish.
- Cloudflare (`jez237.com`) lags GitHub Pages by a few minutes and injects a
  Google Analytics snippet into `index.html` at the edge via
  `functions/_middleware.js`. So `index.html` will always hash-differ on
  jez237.com — that is expected, not a stale build. Compare `game.js` instead.

---

## 3. Architecture

Plain ES modules, no build step, no dependencies. `index.html` loads `game.js`
as a module; `game.js` imports from `engine/`.

```
2026-08-20/final-blow/
  index.html          UI, screens, controls dialog, HUD
  game.js             ~8k lines: simulation loop, rendering, input, QA hooks
  styles.css
  sw.js               Small PWA shell cache (never add images, audio, or index.html
                      to SHELL) plus the capped, build-keyed runtime media cache (5.1)
  engine/
    foundation.mjs    frame clock, RNG, move instancing, ARCADE_TUNING
    defense.mjs       movement/defense rules, hitboxes, FIGHTER_SCALE, STUN_RULES
    combos.mjs        combo scaling, cancel routes, advanced move profiles
    fighter-kits.mjs  all 8 fighters' authored move data (~85 KB)
    controls.mjs      four-button input resolution
    throwables.mjs    personal throwable objects
    stage-weapons.mjs per-stage pickup weapons
    crowd.mjs         deterministic background crowds
    ai.mjs arcade.mjs training.mjs polish.mjs
    rollback.mjs rooms.mjs webrtc.mjs demo.mjs fatalities.mjs fighter-audio.mjs
  tools/              Pillow-only asset pipeline (see §6)
  tests/
  assets/
    atlases/          4x4 combat sprite sheets, 1280x1280
    moves/            4x4 specials sheets, 1280x1280
    fighters/         select portraits, 588x720
    references/       PRIVATE — never publish
```

### Determinism is load-bearing

Online play uses rollback netcode with state checksums. Anything that affects
the simulation **must** be frame-based and seeded, never wall-clock or
`Math.random()`. Two separate RNGs exist on purpose:

- `state.rng` — gameplay. Affects checksums.
- `state.visualRng` — particles and cosmetics. Does not.

Background crowds animate from `state.simulationTick`, not `time`, so replays
reproduce them exactly. Keep it that way.

---

## 4. What 1.1 actually changed (12 backlog items)

1. **Four-button controls.** LP/HP/LK/HK only. Directional guarding — hold away
   to block, down-away for lows, crouching alone never blocks. Up jumps. There is
   no guard, special, super, throw or Final Blow button anywhere. XInput is
   X=LP, Y=HP, A=LK, B=HK with PlayStation/Nintendo labels auto-detected.
2. **Kick normals are derived, not authored.** Each fighter's four kicks are
   generated from that fighter's own punches via `KICK_VARIANTS` in
   `defense.mjs`. Crouching HK is a knockdown sweep. Retune the table, not 48
   move entries.
3. **Motions:** `↓→+punch` command special, `↓←+punch` back special,
   `↓→+kick` base special, `→↓→+punch` launcher, `←→+kick` running heavy,
   `↓←+kick` personal throwable. EX = motion + LP&HP or LK&HK chord.
   Super = `↓→↓→+punch` or HP&HK chord.
4. **Grabs are visible.** Close + toward/away + LP or LK. A landed grab opens a
   clinch (11–18 frames, per fighter), then releases with damage. `THROW_STYLES`
   in `game.js` gives each fighter its own hold, lift, spin and release arc.
   Back throws swap corners.
5. **Combat retuned to SF2HF/MK3.** `ARCADE_TUNING` in `foundation.mjs` is the
   single choke point every move passes through — damage up, recovery up further
   (so whiffs are punishable), special chip up. Steeper combo scaling, juggle
   limit 2, cancel routes cut to light→one heavy→special.
6. **Dizzy system.** `STUN_RULES` in `defense.mjs`. Clean hits build stun, it
   bleeds off, 100 drops the fighter for 128 frames with stars and a drain bar.
   Mashing shortens it but never removes the punish window. 320 frames of
   immunity after recovery makes loops impossible.
7. **Passive CPU.** Below Rookie. Inert *by structure*, not tuning:
   `AI_DIFFICULTIES.passive.inert === true` and `stepAiBrain` short-circuits to
   an empty input before it can even read an observation. It never moves,
   attacks, blocks, techs or takes a Final Blow. Difficulty picker is on the
   fighter-select screen for CPU modes.
8. **Fighter scale.** `FIGHTER_SCALE = 1.14` in `defense.mjs` multiplies every
   spatial quantity belonging to a fighter — body, boxes, reach, speeds, gravity,
   projectile origins, sprite. **Stage bounds are deliberately NOT scaled**;
   that is what produces MK/SF2 framing. Roster now sits at 68.4–74.0% of the
   playable fight area.
9. **Personal throwables.** One per fighter, `↓←+kick`, limited per round, shown
   as HUD pips. Pizza, tethered mouse (reels you in), loogies, wire ball, X-Acto,
   golf ball, bed bugs, vinyl record — genuinely different physics, not reskins.
10. **Stage weapons.** One per stage, seeded arrival time and floor slot, `down+HP`
    to pick up, HP to throw, single use. Needle / beer bottle / dead pigeon /
    serving tongs / souvenir cup. Persistent ON/OFF option. Passive CPU never
    takes one.
11. **Cyraxx rebuilt** as the blue-shirted Chance Wilkins likeness — see §6.
12. **Six stages with distinct background life.** Somerset SEPTA Station
    (photoreal street plate with nine deeply slumped background adults), Vet
    tailgate (fan crowd + 5 looping scuffles), Wildwood boardwalk, Chinese
    buffet, cruise pool deck (44 people, 6 incident loops), and the cat-filled
    Janney Street vacant lot.

---

## 5. Landmines — things that will bite you

- **Kit movement is expressed as RATIOS, not absolutes.** All eight fighters
  override every field of `MOVEMENT_RULES`. Those literals were authored against
  an old baseline, so a tempo change silently failed to reach any fighter — a real
  bug found in 1.1. `getFighterMovement` now interprets them as ratios of
  `AUTHORED_MOVEMENT_BASELINE`. If you add a movement field, add its baseline too.
- **`fighter.height` is the collision box (223 px), not the drawn sprite (~385 px).**
  Anchoring UI to `fighter.height` puts it across the chest. Use
  `fighterRenderSize(id) * 0.956` for anything that should sit above the head.
- **The HUD's height controls the fighter framing.** Browser tests assert the
  roster stays inside 68–74% of the playable area. Adding a HUD row shrinks that
  area and fails the test — the throwable readout was deliberately packed into the
  existing Grit row for this reason. `.grit-row` is a 5-column grid; keep it one line.
- **Keep `sw.js` small and redirect-safe.** The old 19 MB / 162-request media
  precache made browsers load Final Blow once and then fail with `ERR_FAILED`.
  Install only the root URL and core code shell; never cache `./index.html`.
  Since 5.1 media that has been FETCHED is kept in a second cache
  (`final-blow-media-<build>`, cache-first under `assets/` and
  `renderer/hd|vendor`, whole 200s only, 120 MB cap evicting oldest-first) —
  that is a different thing from installing it, and `SHELL` must stay
  media-free. Navigations must fall back to cached `./`, because Cloudflare
  redirects `/index.html` and browsers reject that redirected cached response
  on later navigations. Keep the cache name (the media name derives from it),
  `sw.js?v=` registration, and `game.js?v=` entry version aligned, then run
  the service-worker guard and `tests/service-worker-media.test.mjs`.
- **Rollback protocol is at version 2.** If you add an input field that affects
  the simulation, add a bit in `NET_INPUT`, handle it in `inputToBits`/`bitsToInput`,
  and bump `ROLLBACK_PROTOCOL_VERSION`.
- **Browser tests share one page across the whole run.** State leaks between
  sections — a previous test may have left the stage on `vet`, a fighter in
  hitstun, or left-handed touch mode on. Always call
  `window.__finalBlowQa.fight(...)` and `.stage(...)` at the start of a block.
- **The headless CDP profile caches aggressively.** If a change seems to have no
  effect, delete the browser profile directory before re-testing. This wasted
  real time during 1.1.

---

## 6. The Cyraxx rebuild — read before touching his art

Cyraxx is a likeness of **Chance Wilkins**, built from a photo Jez supplied at
`assets/references/cyraxx-chance-blue-shirt.jpg`. That photo is the authority and
is **private — never publish it, never commit it to a public repo.** It is
currently untracked on purpose.

Required identity cues, all currently correct: high receding hairline, bare
forehead, sparse longer brown hair only at the sides and back, long narrow pointed
brown beard, pale complexion, lean face, prominent nose, slim frame, narrow
rounded shoulders, forward-leaning hunched stance, and a **plain muted dusty blue
short-sleeve T-shirt with no logo**. No leather, armour, tattoos, dyed hair,
weapons or fantasy costume. His purple/acid-green powers stay as restrained
translucent overlays that never tint his face, beard, shirt or silhouette.

Three assets must always be regenerated **together** or he will drift between
frames: `assets/fighters/cyraxx.webp` (588x720 portrait),
`assets/atlases/cyraxx.webp` (4x4 combat), `assets/moves/cyraxx-specials.webp`
(4x4 specials, **frame 15 is the victory pose**).

Pipeline (`tools/`; the `build_*.py` below are Pillow-only — the `tools/swing/`
sheet pipeline needs numpy too, see `tools/README.md` and `tools/requirements.txt`):

1. Generate each 4x4 sheet as a **single image** on a flat pure magenta
   (`#FF00FF`) background — one generation per sheet, never 16 separate ones, or
   consistency collapses.
2. `python3 tools/build_atlas.py sheet.png out.png` — soft magenta key with
   despill, real row-band detection, one global scale from the tallest standing
   frame, stray-fragment removal.
3. `python3 tools/build_portrait.py figure.png portrait.png`
4. Save as WebP quality 92.

Frame roles are documented in `tools/README.md`.

---

## 7. How to verify anything you change

```sh
cd /home/jez237/.openclaw/agents/gamemaster/workspace/final-blow-goal/2026-08-20/final-blow

node --test tests/*.test.mjs        # 434 unit/module/guard tests, ~0.9s
node tests/browser-smoke.mjs        # full browser suite (75 probes), needs Chrome, ~75s
node tests/orientation-gate.mjs     # portrait-gate capability scenarios, needs Chrome
node tests/mobile-parity.mjs        # 1.9E atlas-facing / scanline / profile parity, needs Chrome

# 5.3: the smoke is a probe registry. It keeps going after a failure and
# lists every failed probe at the end (exit code non-zero if any failed).
node tests/browser-smoke.mjs --list                 # probe names, no server, no Chrome
node tests/browser-smoke.mjs --only=cinema-3d       # one probe, seconds instead of minutes
node tests/browser-smoke.mjs --only=crowd,tempo     # name equals OR contains
node tests/browser-smoke.mjs --skip=demo-mode
node tests/browser-smoke.mjs --report=/tmp/fb.json --artifacts=/tmp/fb

# online rollback (two browsers against a local signaling worker)
cd signaling && npx wrangler dev --port 8787 --local &
FINAL_BLOW_SIGNALING_API=http://127.0.0.1:8787 node tests/online-browser-smoke.mjs
```

`browser-smoke.mjs` covers all 28 roster matchups, keyboard, an emulated XInput pad, touch, the 844x390
landscape layout, PWA offline boot, Training, Arcade, Watch Demo, the portrait
gate, all eight grabs and throwables, stage weapons, Passive CPU, dizzy, crowd
density, fighter framing, controller disconnect, flow skips and same-fighters
stage selection — and, since 5.3, the CINEMA 3D renderer under `?renderer=3d`
and the 5.1 spectacle tells (the Vet's ambient KO pulse measured off the
canvas, the crowd's KO hold, the tempo tells, the announcer's decision path
and the 5.0 frame chains through `poseTrace`). **A green run here is the bar
for publishing.** `tests/README.md` documents the probe names, the flags and
every measurement they assert.

The game exposes `window.__finalBlowQa` for driving it headlessly —
`fight()`, `stage()`, `positions()`, `input()`, `step()`, `difficulty()`,
`forceStageWeapon()`, `demo()` and more. Read the object at the bottom of
`game.js` before writing new tests.

**Test philosophy used throughout:** assert the *rule*, not a frozen number.
Frame counts and damage totals move whenever `ARCADE_TUNING` changes, so tests
check things like "recovery must exceed the authored base" and "a super must
out-damage a single heavy while leaving most of the bar."

---

## 8. Known blocker

**The ElevenLabs MCP server holds an API key ID rather than an API key** and
returns `api_key_id_used_as_api_key`. Consequences:

- The eight throwable-object impact sounds are synthesized in WebAudio
  (`OBJECT_SOUNDS` in `game.js`) instead of recorded samples.
- ~~Wildwood, the buffet and the cruise deck have no dedicated music~~ —
  **cleared in 5.3**: the key was rotated and the two planned beds
  (`wildwood-boardwalk-night`, `cruise-deck-disco`) were composed, so only the
  buffet still shares a soundtrack. Their ambience is still rendered visually.
  See STAGES.md → *5.3 — Music*.

Rotating that key is the only thing needed to finish both. fal (image generation)
works fine and was used for all the new art.

---

## 9. Current repo state

- Canonical release: `jz237/games` tag `final-blow-v1.8e`.
- Never publish from a long-lived `jez237-site` clone. Other agents may own its
  local commits or it may be far behind `origin/main`; use the fresh-clone mirror
  procedure in section 2.
- Untracked and deliberately preserved in the canonical game folder:
  `BACKLOG.md` and `assets/references/`. They are private and are not part of the
  v1.8E commit or mirror.
- Audio is now gated on Jez's SFX review. `engine/audio-review.mjs` is generated
  from his verdict and is the single source of truth for which takes may ship;
  `tests/audio-review.test.mjs` fails the build if a rejected recording comes
  back, whether as a file or as a reference. Adding a fighter take means adding
  it to his accepted list and regenerating, not dropping an mp3 into
  `assets/audio/fighters/`. The kick cues (`light-kick-swing`,
  `light-kick-impact`, `roundhouse-swing`, `roundhouse-impact`) are pooled per
  fighter and picked by a render-only cursor, so they never touch `state.rng`
  and stay rollback-safe.

---

## 10. Documentation already in the repo

Read these before changing the relevant system — they record the reasoning and
every autonomous decision made during 1.1:

| File | Covers |
| --- | --- |
| `CONTROLS.md` | Four-button layout, motions, chords, grabs, 10 design decisions |
| `MISSING-AUDIO.md` | The outstanding voice work order, which takes the SFX review rejected, and the 5.1 build-time audio manifest (`tools/audio/build_manifest.mjs`) |
| `COMBAT.md` | SF2HF/MK3 tuning tables, dizzy, fighter scale, the movement-ratio bug |
| `THROWABLES.md` | Personal objects and stage weapons |
| `CYRAXX.md` | The rebuild, identity cues, pipeline, the fal edit-mode limitation |
| `STAGES.md` | All five stages and their crowd variants |
| `ROLLBACK.md`, `DEMO.md` | Pre-existing netcode and attract-mode docs |
