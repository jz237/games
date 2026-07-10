# Joust — Browser Remake SPEC

A faithful browser remake of **Joust** (Williams Electronics, arcade, 1982;
game designer John Newcomer, main programmer Bill Pfutzenreuter). Arcade gameplay/timing and the
original Williams display data are the source of truth; the optional title theme is the only
presentation addition. This is a NEW game — it does **not** replace the existing "Sky Joust" (2026-05-11),
which is a separate, unrelated game.

Deployed path: `games/2026-07-05/joust/`. Leaderboard namespace: `joust`.

## 0. Ground-truth sources (verified 2026-07-05)

- **Original Williams 6809 game source**, rebuilt to byte-match the shipped "green" ROM set
  (rev V4): `github.com/synamaxmusic/joust` (JOUSTRV4.ASM, JOUSTI.ASM, RAMDEF.ASM, EQU.ASM,
  PHRASE.ASM, MESSAGE.ASM, SYSTEM.ASM, VSNDRM4.ASM). Cloned locally to `notes/joust-src/`.
  This is the decisive primary source — every gameplay constant below is read from it.
  The original historical source is `github.com/historicalsource/joust`.
- **MAME** `src/mame/midway/williams.cpp` + `shared/williamssound.cpp` — hardware/video/IRQ/DAC
  timing (MAME emulates the original ROM, so gameplay constants live in the ROM, not MAME).
- **Sean Riddle** hardware notes (`seanriddle.com/willhard.html`) and his ROM-dumped wave/platform
  tables (`jwaves.html`).
- Williams operator manual (GAME ADJUSTMENTS factory settings), KLOV/arcade-museum, StrategyWiki,
  joustmaster wiki — used only for corroboration.
- Research bundle: `notes/research/00-disassembly-extract.md` (physics/collision from the source)
  and `01`–`11-*.md` (11 web-researched topics, each with 13 adversarially-verified constants).

When sources disagreed, the byte-matching disassembly won (logged in §16).

## 1. Fundamental units & tick rate

- **Physics tick = 60.096154 Hz.** The 6809 runs a cooperative process executive paced to the once-per-
  frame video interrupt (line-240 IRQ, 16 ms). `SYSTEM.ASM`: "SERVICED EVERY 1/60 SEC";
  `LDD #60*60 ;NBR OF INTERUPTS UNTIL 1 MINUTE`. All object movement/gravity/timers advance once
  per 1/60 s. (The 4 ms IRQ is only for beam-synced sprite DMA — not a logic rate.)
  Real hardware is 60.096 Hz; the remake uses that measured hardware cadence.
- **Coordinate space (native Joust pixels):** X wraps over `ELEFT=-10 .. ERIGHT=292` (period 302).
  The visible framebuffer crop removes 6 left pixels and 7 top scanlines, so engine/render Y is
  `CEIL=25`, lower-island top/spawn `204`, and floor/lava `216`. Visible raster is **292×240**.
  **The engine runs in these native units**; rendering
  scales native→canvas. This makes physics bit-faithful and resolution-independent.
- **Fixed-point:** position `PPOSx` is 3 bytes `[pixel][frac_hi][frac_lo]`; velocity `PVELY` is
  signed 16-bit **8.8 fixed point** (high byte = whole px/frame, low = 1/256 px). Integration is
  `posY_fixed += velY` each frame. In the JS engine we use plain floats in native px (identical
  behavior); Y grows **downward**, so up = negative.

## 2. Player physics (the crux) — all values ROM-exact unless noted

### 2.1 Gravity (`GRAV=4`, constant across all waves)
Per frame, add to Y-velocity: **+4/256 = +0.015625 px/frame² when wings are DOWN (flapping)**,
**+8/256 = +0.03125 px/frame² when wings are UP (gliding)**. You fall twice as fast gliding.
(`ADDGRA`: `ADDB GRAV`; caller passes B=0 wings-down / B=4 wings-up.) No per-wave change.

### 2.2 Flap — the heart of flight (`ADDFLP`), edge-triggered
Flap is **one impulse per button press** (release→press edge; holding does nothing until
re-pressed). On each flap:
- **Vertical impulse** = `floor(PTIMUP*96/256) − 96` in 1/256 px/frame units, added to `PVELY`.
  `PTIMUP` = frames since the previous flap (0..255, reset to 0 on each flap, +1 each air frame).
  So a flap right after another (PTIMUP≈0) gives ≈ **−96/256 = −0.375 px/frame upward** (max);
  an isolated flap after a long glide (PTIMUP large) gives ≈ 0. **Rapid rhythmic flapping climbs;
  slow flapping hovers/sinks.** No explicit upward cap.
- **Horizontal:** if a direction is held, step the X-velocity index `PVELX` by ±2 (`CURJOY*2`),
  clamped to ±`MAXVX=8`. Air horizontal accel is therefore **per-flap, not per-frame**.
- **Ground takeoff** (`STFLY`): sets `PVELY=−$0080=−0.5 px/frame`, hops up 1 px, and preserves
  existing run momentum; it does not execute the airborne horizontal `ADDFLP` step.

### 2.3 Horizontal air model — `FLYX` table (momentum, no air drag)
`PVELX` index (−8..+8 step 2) → speed px/frame: `0:0, ±2:0.25, ±4:0.5, ±6:1.0, ±8:2.0`.
**Max air horizontal speed = 2.0 px/frame (120 px/s).** Between flaps horizontal velocity is
CONSTANT (no friction) — to slow/reverse you flap the opposite way (each opposite flap steps the
index back one notch). This momentum is the core feel; do **not** add air drag. (Non-linear
table is authentic — reproduce it, not a linear ramp.)

### 2.4 Ground model — animation-state machine (not velocity-integrated)
Standing→running steps through speed tiers `PLYCR→PLYDR→PLYER→PLYFR` by shortening the per-step
WAIT (8→4→2→1 frames); each step advances a fixed pixel delta (table `ORRUN` = 0,3,2,1,2).
`PACCX` = state timer (`#8` frames to shift up a tier = ground accel rate). Reversing enters
**SKID** states (`SKIDR`, plays skid SFX) that decelerate over several frames before reversing.
Landing converts air `|PVELX|` into the matching run tier (`FRCONV` NAP 8/4/2/1). Remake models
this as: ground accel to a top run speed with a short skid-to-turn; tuned to match the arcade feel
(category (d) approximation of the animation machine, since it isn't a physics integrator).

### 2.5 Terminal / boundary behavior
- Visible-space ceiling `y=25`: clamp and fully invert upward velocity. Floor/lava `y=216`: death.
- Design-reference caps `MAXVY=$1000 (16 px/f fall)`, `MINVY=$0400 (4 px/f rise)` are **defined
  but never referenced** in player code — real terminal velocity emerges from gravity vs flap.
  We add gentle clamps at these reference values as a safety net (prevents runaway on a modern
  variable-refresh display); they're essentially never hit in normal play.

## 3. Joust collision resolution (`OSTBO`)

Broad phase = bounding box (`HITEM`): body box is **19 px tall** (`PCOLY1=feet=PPOSY+1`,
`PCOLY2=PPOSY+1−$13`), X-overlap both ways, then a pixel-overlap test.

**Decisive rule — higher lance wins:** compute `key = (PPOSY_A + PLANTZ_A) − (PPOSY_B + PLANTZ_B)`
where `lanceHeight = PPOSY + PLANTZ` (PLANTZ = per-object lance/height offset). Y grows downward,
so **smaller lanceHeight = higher on screen = higher lance = winner**.
- `key == 0` → **exact tie → BOUNCE** (nobody dies; collide "thud" SFX). **No tolerance band** —
  bounce only on numerically identical heights.
- else the higher lance wins; loser is unseated (drops an egg) and the winner is awarded the
  loser's point value.

**Bounce vectors** (`OSTXUP`/`OSTXDN`/`OSTLR`): the upper bird gets `PBUMPY=−2` px, the lower
`+2` px; each bird's `PVELY` is **reflected and halved** if moving into the other; horizontally
they're shoved apart (each `PVELX` negated and slowed by 2 toward 0, faces set away from each
other). Pterodactyl-vs-bird bump is harder: `PBUMPY=±5`.

Player-vs-player (2P) uses the same rule — you can unseat your partner (bounty on gladiator waves,
§11).

## 4. Enemies — Bounder / Hunter / Shadow Lord

Each is a knight (rider) on a **buzzard**. Unseat one → it drops an **egg** and the buzzard flies
off. Point values (attract-mode text `ATX6/7/8`, exact):

| Enemy | Color | Points | First wave | Behavior |
|---|---|---|---|---|
| **Bounder** | red | **500** | 1 (3 of them) | weakest; wanders, mild pursuit; flaps least (easy to out-climb) |
| **Hunter** | grey | **750** | 4 | actively pursues the player; flaps more, climbs better |
| **Shadow Lord** | blue | **1500** | 16 | toughest; flaps constantly, hard to out-climb; aggressive homing |

AI per enemy is tuned by per-type velocity fields (`BODNVY` bounder max down-vel; `HUDNVY/HUUPVY`
hunter down/up; `SHUPVY` shadow-lord up; "level-flight time until next decision" `BOLETM/HULETM/
SHLETM`; shadow-lord "avoid cliff" flap `SHCLTM`). Model: each enemy periodically re-decides a
target (the nearest player, or wander), then flaps toward it; higher tiers decide more often, flap
harder, and climb faster. Enemies mount a fresh buzzard from a hatched egg if left alone (§5).
`PEGG=4` per enemy (bookkeeping; the escalation cap is on the *collector*, §5).

Enemy counts per wave escalate on a fixed table (`WAVTBL`); the exact ramp (Bounders decline,
Hunters rise, Shadow Lords from W16, etc.) is extracted from the source at build time (§13) and
matches Sean Riddle's `jwaves.html`.

## 5. Eggs

- **Physics:** an unseated rider drops an egg that falls under gravity and **bounces/settles** on
  platforms.
- **Collection escalation ladder** (`EGGVAL`, per-player counter `EGGS1/EGGS2`, cap index 4):
  **250 → 500 → 750 → 1000**, then 1000 for every egg thereafter. Counter increments on each egg
  collected (settled or mid-air alike). **Resets to 0 on exactly two events: that player's death,
  and the start of a new wave** (also game start). No time decay. Ladders are independent per
  player.
- **Mid-air catch bonus:** catching an egg **before it has ever touched a platform** awards a flat
  **+500 on top of** the ladder value (gated on `PFEET==0`, shown in a distinct "caught in air"
  color). E.g. swooping your 3rd egg from the air = 750 + 500 = 1250.
- **Hatch → remount:** an uncollected egg eventually hatches into a dismounted rider; if still
  left, a buzzard swoops in and the rider **remounts** to become an active enemy again. Hatch
  timing shortens in later waves (more urgency). (Exact hatch frame counts pulled from source at
  build; tuned to arcade cadence otherwise.)
- **Egg waves:** begin with exactly 12 settled eggs. Concurrent hatches are capped by that wave's
  rider count (`WENEMY`: 6 on wave 5, 8 on wave 10); a newly freed slot admits the next egg.

## 6. Pterodactyl (1000 pts) — two systems

- **Point value: 1000** (exact, `MSGTH1 '1000'`).
- **Dawdling "baiters"** (anti-camping): on every normal wave, a wave-indexed timer spawns
  pterodactyls that home on the player if you take too long. First one at ≈ **60 s (wave 1) / 45 s
  (wave 2) / 30 s (wave 3+)**; successive ones arrive on shrinking delays (…30→15→15→7→5→3→ down
  to 1 s apart) the longer you stall. **Cap 3 pterodactyls on screen.** They fly off when the wave
  ends.
- **Scheduled pterodactyl waves:** dedicated ptero waves at **wave 8 and every 5th wave after
  (13, 18, 23, …)**, count data-driven (1 early → up to 3 later), preceded by the "BEWARE OF THE
  PTERODACTYL" banner.
- **Vulnerability (open-beak lance hit only):** a ptero carries a very high lance (`PLANTZ=$80`)
  so it normally wins any joust. It is killable **only** when, on the collision frame, ALL hold:
  (1) player and ptero face **opposite** directions and the player is on the beak side; (2) the
  player's lance line is within **~2 px** of the beak center in the wings-down glide frame, or
  **~3 px** in the open-beak attack frame (ROM: `−10/within2`, `−8/within3`). Otherwise the
  player dies. On a valid hit: death dance + 1000 pts. We keep the window deliberately tight
  (optionally widen 1 px on easier difficulty) and add a slight slow-mo tell on approach.

## 7. Lava troll & lava

- **Onset:** the thin **outer floor bridges burn out on wave 3** (`TBRIDGE=3`), leaving the central
  CLIF5 island permanent; the **Lava Troll hand appears on wave 4** (`TTROLL=1` wave after).
  Grabs players AND enemies.
- **Grab:** when a bird flies **low over the side lava** (within ~25 px of the floor and at
  approximately `x<48` or `x>234`), the single `LAVNBR`-gated hand rises and grabs at the legs, plays
  the troll SFX, and switches the victim's gravity to `ADDLAV` (drags down; X velocity zeroed).
- **Escape (velocity-based, not mash-count):** each frame `velY += trollPull (CLVGRA)`; the
  player's flaps still add upward. If net `velY < −$0180 (−1.5 px/frame)` ("break-free velocity")
  the victim stops sinking and can climb out; once above the grab window it releases. **The troll
  strengthens over time:** `CLVGRA` starts at base and ramps **+1/frame after a 30 s warm-up,
  capped at $500 (5.0 px/frame)** — a fresh grab is escapable by rapid flapping; a long-held grab
  becomes unbeatable.
- **Lava death:** if the bird's Y reaches `FLOOR+7 (230)` it dies in the lava (one life). Direct
  contact with the lava floor also kills.

## 8. Platforms, waves, erosion, wrap

- **Layout (visible coordinates):** top wrap cliffs `y=62`, upper middle `y=74`, right ledge
  `y=122`, middle wrap cliffs `y=131`, lower middle `y=156`, and permanent **CLIF5** island
  `x=48..234, y=204`; lava/floor begins at `y=216`.
  Platform numbering (Sean Riddle): 1=top-left, 2=top-right, 3=top-middle, 4=center-floating,
  5=base(permanent). Exact X-extents extracted from the background-build code at build time.
- **Erosion (per-wave enable/disable via wave-status bits `WBCL1L/1R/2/4`; CLIF5 never
  disabled):** the outer floor bridges are gone from wave 3; individual cliffs disappear on a
  ROM-tabulated schedule (e.g. W6: plat 3 gone; W7–8: 1,2,3 gone; W9: 1,2,3,4 gone (only base);
  **egg waves (every 5th) always restore the full board**). Erosion is **not monotonic** — it
  cycles with wave type. Full per-wave table taken from the ROM/`jwaves.html` at build.
- **Wave-type cycle (fixed 5-cycle):** by `wave mod 5`:
  `1→Normal, 2→Survival(1P)/Team(2P), 3→Pterodactyl (only from wave 8; wave 3 itself Normal),
  4→Gladiator, 0→Egg`. So: W1 Normal, W2 Survival, W3 Normal, W4 Gladiator, W5 Egg, W6 Normal,
  W7 Survival, **W8 Pterodactyl**, W9 Gladiator, W10 Egg, … The next special wave is telegraphed
  on its intro card. Table loops at wave 81 while wave numbering keeps climbing.
- **Wave banners** (exact strings from PHRASE/MESSAGE): "PREPARE TO JOUST", "SURVIVAL WAVE",
  "COLLECT 3000 SURVIVAL POINTS", "NO SURVIVAL POINTS AWARDED", "GLADIATOR WAVE", "3000 POINT
  BOUNTY", "NO BOUNTY AWARDED", "PLAYER CO-OPERATION - EACH PLAYER 3000 POINTS", "EGG WAVE",
  "BEWARE OF THE PTERODACTYL", "BUZZARD BAIT". (Verbatim set finalized from the source at build.)
- **Wrap = cylinder (horizontal torus), not a full torus:** X wraps over 302 px (`ELEFT..ERIGHT`);
  top (ceiling) and bottom (floor/lava) are hard. No vertical wrap.

## 9. Scoring & lives

- Bounder 500, Hunter 750, Shadow Lord 1500, Pterodactyl 1000; egg 250/500/750/1000 (+500 mid-
  air); survival/team/gladiator bonus 3000 each (§10/§11).
- **Lives:** arcade factory default **5** (CMOS `NSHIP`, operator-adjustable 1–99; MAME has no
  lives/bonus DIP — they're CMOS). The remake defaults to the authentic **5**, with a 1–9
  starting-mount option. **Extra man every 20,000 points, repeating** (`REPLAY`/`LEVPAS`).
- **Survival-wave no-death bonus = 3000**, awarded only if the player took **zero** deaths during
  the wave and still has a life; else "NO SURVIVAL POINTS AWARDED". Per-wave death counter resets
  at wave start.
- Score display is decimal; no rollover issues at our range.

## 10. Wave-type bonuses (all 3000)

- **Survival (1P):** 3000 for finishing the wave without dying.
- **Team (2P, the Survival slot in co-op):** 3000 to **each** surviving player **iff neither
  unseated the other**; else "NO BONUS AWARDED".
- **Gladiator (2P):** a one-time **3000 bounty to the first player who unseats the other**
  (latched flag `PLYG1/PLYG2`); "NO BOUNTY AWARDED" if neither does. In 1P a gladiator wave plays
  as a tough hunter wave (no PvP bounty).

## 11. Two players (simultaneous, one keyboard)

- **P1 = knight on an OSTRICH (yellow); P2 = knight on a STORK (green/blue).** Spawn: P1 left
  (~x=100, facing right), P2 right (~x=200, facing left). **Mechanically identical** — same
  gravity/flap/max-speed (the stork is a pure reskin; RAMDEF even labels P2 "SITTING ON OSTRICH").
  Do **not** nerf the stork.
- Players collide with each other by the same lance rule (cooperate normally; compete on gladiator
  waves; team-bonus on survival waves). Both share the screen; camera is fixed (single-screen
  arcade — no scrolling), so no follow logic needed.

## 12. Audio — SFX-only (faithful), optional original title theme

**Joust arcade has NO music and no start "fanfare"** — John Newcomer deliberately made it
SFX-only, prioritizing the wing-flap sound. The only multi-note cue is the high-score name-entry
jingle (`SNHIGH`) and a single short "game start" sting (`SNGS`, 1 frame). We honor this: gameplay
is **SFX-only**.

- **SFX** are reproduced by emulating `VSNDRM4` and pre-rendering the authentic 8-bit DAC output
  to compact local Ogg samples; the WebAudio synthesis paths remain fallback-only. The exact
  **command→event map with priority-based preemption** from the ROM SOUND TABLE remains intact:
  flap wing-up/down (noise burst, pitched), walk clip/clop (two alt noise ticks), thud (low
  click), skid start/end (swept tonal noise), egg hit/hatch (descending square blips),
  enemy/player die (short "$16" percussive hit, shared), pterodactyl scream (harsh Walsh-style
  swept buzz ~2 s), lava-troll grab, in-lava, transporter spawn (rising→fading tone), mount,
  bounty, cliff-destroyer, extra-life chime, game-start sting, high-score jingle. Priority bytes
  (scream 65, egg 45, thud 10–20, extra-man 100, start/credit 200) govern which sound wins. SFX
  lengths are in 1/60 s frames.
- **Title/menu music:** the arcade had none; per site convention and the owner's standing
  pre-authorization to ship original audio (same decision as Emerald Mine II), we add an
  **original** chiptune-style title theme (clearly an addition, **title/menu only** — gameplay
  stays SFX-only/authentic). Separate SFX and Music volume sliders (music slider governs only the
  title theme).

## 13. Graphics (source-extracted, arcade-faithful)

- Engine in native Joust units; render at the original **292×240** visible raster with a `320/292`
  CRT pixel-aspect stretch, nearest-neighbor scaling, and a black sky. `extract-sprites.mjs`
  decodes the original 4bpp ostrich/stork/buzzard, riders/lances, eggs, troll, flames,
  pterodactyls, cliff bitmaps, and the compressed 186×33 CLIF5 island from `JOUSTI.ASM`.
  It also extracts `MESSAGE.ASM`'s Williams 5x7 font and rasterizes the original 875-byte
  `ATT.ASM` vector/fill command stream into the exact JOUST title logo. Rider/mount composition
  keeps the ROM display-list X/Y offsets, and collision uses the same pixel masks.
- **CRT filter** option (scanlines + vignette), off by default on mobile.
- Optional browser juice: feathers on unseat, egg-collect sparkle, screen-edge wrap continuity, lava
  glow flicker, death "ashes", pterodactyl approach slow-mo tell.
- Exact platform X-geometry + wave enemy table are extracted from `notes/joust-src` at build and
  recorded in `assets/data.js` with source citations.

## 14. Remake meta-game shell (over the authentic engine)

- **Attract mode** (title with AI demo joust), HOW TO PLAY screen, wave announcements
  ("PREPARE TO JOUST", etc.).
- **Lives:** 5 to start (option 1–9) + extra man every 20,000. **Hold-ESC ~0.8 s restarts the
  current wave at the cost of a life** (softlock escape hatch; always available).
- **Physics held until first input** each wave/life ("FLAP TO START") — no instant deaths.
- **Options:** separate Music/SFX volume, CRT toggle, key remap (P1+P2), starting men,
  difficulty, **wave-select with saved progress** (localStorage highest wave reached), and an
  **all-waves unlock password `1234`** shown in the label as `(PASS:1234)` (non-secret, same
  convention as EM2). Reset progress.
- **High scores:** local top-10 + global leaderboard
  `https://game-scores.jez237.workers.dev/scores/joust` (GET/POST `{initials,score,level}`,
  CORS `*`), 3-initial entry.
- **Modes:** 1 PLAYER / 2 PLAYERS (simultaneous, one keyboard: P1 ◀▶+Flap, P2 A D + remappable
  flap). Pause (P / auto-pause on blur).
- **Touch controls (mobile):** left / right buttons + a big FLAP button (tap = one flap, matching
  edge-triggered arcade flap). Landscape-friendly.
- **Cache-busting from day one:** a `VERSION` constant; every asset fetch and `<script>` tag
  carries `?v=VERSION`; bump on every deploy that replaces same-named assets.
- **CSP:** vendor everything locally, no external requests (strict site CSP).

## 15. Verification plan (Phase 3)

- **Headless Node engine tests** (`tools/test-engine.mjs`, engine is a pure module): gravity
  values (wings up/down), flap impulse decay curve, `FLYX` horizontal table + max speed, joust
  lance-height resolution (win/lose/exact-tie bounce), bounce vectors, egg ladder
  250/500/750/1000 + reset rules + mid-air +500, pterodactyl beak vulnerability window & 1000 pts,
  lava-troll grab/escape/escalation/death, wave-type cycle (mod-5) + banner selection, platform
  erosion schedule, extra-life thresholds, 3000 bonuses, X wrap, ceiling/floor bounds.
- **Headless Chrome + puppeteer** play-through: reach and complete each wave type
  (Normal/Survival/Egg/Gladiator/Pterodactyl), verify no softlock (and hold-ESC restart always
  works), 2P, touch. Screenshot the title / gameplay / options / help / CRT.
- Loop find→fix→re-verify until a full pass is clean.

## 16. Decisions log

| # | Decision | Why |
|---|---|---|
| 1 | Native-unit deterministic engine at fixed 60 Hz; render scales native→canvas | Bit-faithful physics from ROM constants; resolution-independent; headless-testable |
| 2 | Flap is **edge-triggered** (one impulse per press), impulse decays with `PTIMUP` per ROM `ADDFLP` | Authentic "rapid-flap to climb" skill; matches source exactly |
| 3 | Wings-up gravity (2×) vs wings-down; `FLYX` non-linear H-table; no air drag | Exact ROM behavior; central to Joust feel |
| 4 | Joust resolution = higher `PPOSY+PLANTZ` wins, exact tie = bounce (no tolerance); bounce = ±2 px + reflect/halve `PVELY` | Exact `OSTBO` logic |
| 5 | Shadow Lord = **1500** (attract text `ATX8`), not 1000 | Two sources conflicted; disassembly/attract text wins |
| 6 | Egg ladder 250/500/750/1000, reset on death & wave start only, mid-air +500 | Exact `EGGVAL`/`EGGS1/2`/`PFEET` |
| 7 | Pterodactyl killable only in tight open-beak window (~2–3 px), 1000 pts; dawdling baiters + scheduled ptero waves (W8, +5) | Exact `OSTHIT`/`BAITBL`/`WPTERO` |
| 8 | Lava troll: velocity-based escape (break-free −1.5 px/f), +1/f strengthening capped 5.0, onset wave 4 | Exact `ADDLAV`/`CLVGRA`/`PATCH1/2`/`TTROLL` |
| 9 | Wave-type cycle mod-5 (Ptero only from W8); erosion non-monotonic, egg waves restore full board; cylinder wrap | Exact `WAVTBL`/`WBCLx`/wrap code |
| 10 | 3000 for survival/team/gladiator; stork = ostrich mechanically | Exact `WSUSCR`/`WCOSCR`/`SPDGLA`; global movement equates |
| 11 | **Audio SFX-only**, reproduced by **emulating the Williams sound ROM `VSNDRM4`** (`tools/sndemu.mjs`) and pre-rendering each effect to a compact CSP-clean `.ogg` (a WebAudio synth set is kept as a runtime fallback); exact command→sample + priority-preemption map; **original** title theme added (title/menu only, separate Music slider) | Arcade had no music by design; owner pre-authorized original audio (EM2 precedent); ROM-emulation renders the *true* DAC-synth output — more faithful than hand-tuned live synthesis |
| 12 | Historical v1.x shell: 3 lives (option 3–5), hold-ESC restart, first-input safety, wave-select + scores; default lives superseded by #22 | Original site-shell brief |
| 13 | Keep existing "Sky Joust" untouched; new game at `2026-07-05/joust/` | Brief: replace nothing |
| 14 | Historical 3-mount default, superseded by the arcade 5-mount default in #22 | Original site-shell brief |
| 15 | Enemy AI = heuristic (per-type cruise/chase/altitude-hold) matching the documented aggression gradient (Bounder beatable → Shadow Lord flies above you) | The original's exact per-frame enemy decision tables weren't fully ported; the heuristic reproduces the observable behavior & difficulty, tuned via headless playthroughs |
| 16 | Platform geometry comes directly from the cliff DMA records/landing tables in visible-raster coordinates | The source records are authoritative and now drive both rendering and pixel-mask collision |
| 17 | Adversarial code review (multi-agent) fixed 5 verified bugs before ship: team-bonus voided on any partner-unseat (not just gladiator flag); egg mid-air +500 gated on a `touched` flag (no bonus after a bounce); Space is a real edge-triggered P1 flap; Escape cancels key-rebind (can't bind ESC); `escDownAt` cleared on ESC keyup/blur (a tap no longer restarts the wave) | Correctness pass; each finding traced to a concrete failure and regression-tested |
| 18 | Historical v1.5.0 restoration attempt; later tuned/reverted in #21 and fully superseded by #22 | Kept for release-history context |
| 19 | Historical v1.5.0 mount recolor, superseded by #22's unmodified source palette and separate rider colors | The raw ROM art is now the visual source of truth |
| 21 | **v1.5.1 — reverted decision #18.** The owner OWNS a real Williams Joust cabinet and reports the v1.5.0 "ROM-exact px/frame" flight moved & accelerated **too fast** vs the machine. The paper-exact fixed-point constants (even cross-checked) did NOT reproduce the felt hardware — likely a fixed-point unit/scaling mismatch in how per-frame velocity maps to perceived motion. **The cabinet's feel is the ground truth, above the disassembly.** Restored the previously-accepted hand-tuned flight model (punchy `FLAP_DV=-0.95`, gravity 0.042/0.075, continuous air-accel 0.085 + settle drag 0.93, `MAX_H` 1.7). All non-physics v1.5.0 fixes (§#19/#20) retained. Next: calibrate remaining feel against the cabinet | Empirical hardware feedback from the owner beats theoretical ROM fidelity; §2's "ROM-exact" now applies to collision/scoring/waves, NOT the tuned flight feel |
| 20 | **v1.5.0 — audit polish.** Working **pause** (P; auto-pause + mute on tab-hide via `visibilitychange`); 2P hold-ESC restart charges each in-player exactly one life (was a misleading double-charge); leaderboard POST carries `?v=`; `preventDefault` covers both players' mapped keys; removed the bare **M**-to-title footgun (quit now via the pause overlay's Q); single-source version (`window.__V`); ptero open-beak window tightened to ~3 px (ROM within-3); **hatch→remount returns one tier tougher** (origin-based, not wave-based); troll owns the `FLOOR+7` lava-death line; enemy tier recolor brightened for vivid red/grey/blue | Multi-agent audit (6 dimensions, findings adversarially verified) — each fix traced to a confirmed defect and re-tested (76 engine tests + browser + playthrough) |
| 22 | **v2.0.0 — arcade-emulation restoration.** Restored Rev.4 edge-triggered flight, released-vs-held gravity, FLYX momentum/no drag, full ceiling rebound, exact tie separation, pixel-mask bird/cliff collisions, four transporters, full rider counts, 12-egg waves with `WENEMY` hatch caps, non-gating scheduled pterodactyls, ±2/±3 beak window, one lava-troll hand, side-pit geometry, indefinite first-input safety, 5 mounts, and 60.096154 Hz. Presentation now uses raw ROM mounts plus separately composed colored riders, exact cliffs/compressed CLIF5, 5x7 ROM font, vector title logo, black sky, and 4:3 pixel aspect. Existing sound-ROM Ogg output is unchanged. | Direct Rev.4 source audit plus browser/playthrough feedback; supersedes #14/#18/#19/#21 where they conflict |
