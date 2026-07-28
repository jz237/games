# Marble Madness (Amiga) — clean-room recreation: parity ledger

Loop-maintained ledger. Target: feature parity with the Amiga (EA/Ariolasoft, 1986) version of
Marble Madness as an all-original clean-room browser build (no ripped code/art/sound/ROM data).
**Read this file first each iteration.**

- **Live**: https://jez237.com/games/2026-07-13/marble-madness/ · GitHub mirror: https://jz237.github.io/games/2026-07-13/marble-madness/
- **Source of record**: `games-source/2026-07-13/marble-madness/` (= checkout of the public `jz237/games` repo — COMMIT after every iteration, see Deploy). Deploy copy: `jez237-website/games/2026-07-13/marble-madness/index.html`.
- **Current version: v0.40.0** (single self-contained index.html, `const VERSION` near top).

> **⚠ 2026-07-27 DATA LOSS + RECOVERY.** `games-source/2026-07-13/` (source copy, this ledger,
> reference images) was deleted from disk — it had never been committed anywhere (games-source is
> the jz237/games repo; the folder was untracked and something swept it). index.html was restored
> byte-identical from the deployed copy; this ledger was reconstructed from the session transcript
> + loop history. Reference images (VGMaps NES maps, arcade screenshot) were lost — re-fetch on
> demand (Wikimedia API works; vgmaps.com direct). **Rule: commit source+ledger to jz237/games
> every iteration. Never put reference/disk material in any repo — it lives in
> `/home/jez237/game-refs/marble-madness/` (outside all repos, no cleaners).**

## Reference resources
- **User's own Amiga disks (2026-07-27)**: `/home/jez237/game-refs/marble-madness/` —
  `MarbleMadness.ipf` (SPS release #13, PAL OCS retail, CRC 9898C3F4), `KICK13.ROM` +
  `kickstart12.rom`, official manual scan `Manual.png`, box scans (`Box_back.jpg` has 4 real
  Amiga screenshots — palette reference!). Fetched from vengeance
  `C:\Users\jrb04\OneDrive\Desktop\Amiga\Marble Madness\` (sftp paths need leading `/C:/`).
  **Clean-room rule: run/measure/observe only — palette, HUD, timings, layouts, feel. Never ship
  or commit EA data/assets; recreate everything original.**
- **THE REFERENCE RIG (WORKING, 2026-07-27 iter 21): FS-UAE + real IPF, headless, scriptable.**
  Everything under `/home/jez237/game-refs/` (outside all repos):
  - `tools/opt/` = fs-uae 3.1.66 + Xvfb + xdotool + libxdo3, installed WITHOUT root via
    `apt-get download` + `dpkg-deb -x` (all deps already satisfied on this box).
  - `fsuae/` = FS-UAE base dir: `Kickstarts/kick13.rom` (first 256 KB of the doubled KICK13.ROM),
    `Plugins/CAPSImg/` (FrodeSolheim capsimg release — gives FS-UAE **native IPF support, so the
    longtrack copy protection passes**), `Floppies/MarbleMadness.ipf`, `Configurations/mm.fs-uae`
    (A500, 1440x1080 window, `automatic_input_grab = 1`).
  - Display: `Xvfb :77 -screen 0 1440x1080x24`; capture with `ffmpeg -f x11grab`.
  - Control: `tools/mm_ctl.py` — `grab | goto X Y | click [n] | shot NAME | key K | pin`.
    Closed-loop pointer targeting: pin to origin, dead-reckon (scale 0.577 px/x, 0.947 px/y),
    then correct bydifference-detecting the red pointer against a parked reference frame.
  - Launch: `DISPLAY=:77 SDL_AUDIODRIVER=dummy fs-uae --base-dir=/home/jez237/game-refs/fsuae
    /home/jez237/game-refs/fsuae/Configurations/mm.fs-uae`.
  - Boot path: `grab` → `goto 723 700` + `click 2` (disk icon) → `goto 706 330` + `click 2`
    (program icon) → ~25 s → title → ~20 s → options menu → click GO! → race.
  - **Gotchas**: F12 opens the FS-UAE menu and RELEASES the mouse grab (re-grab by clicking in the
    window). `pkill -f "fs-uae --base-dir"` matches this shell's own command line and kills the
    session — use a bracket pattern. Amiga screen area within the 1440x1080 capture =
    x 144–1244, y 68–852.
- **vAmigaWeb (WASM) rig also built but IS A DEAD END for this title**: it boots the game from a
  converted ADF/eADF but always hangs right after the title (head parked at track 46) — the
  longtrack protection fails. Both plain ADF and `-f "Marble Madness!"` eADF (which DOES preserve
  `T0.1: AmigaDOS Long Track (111000 Bits)`), and both KS 1.2 and 1.3, hang identically. Keep the
  IPF+FS-UAE path. (vAmigaWeb clone + drivers still in scratchpad `mm-emu/` if ever needed.)
- IPF→ADF conversion (for reference only): disk-utilities built `caps=y` with capsimg; glue header
  at `tools/capsinc/caps/capsimage.h`, `tools/lib/libcapsimage.so.5` symlink; run from the
  disk-analyse dir with `LD_LIBRARY_PATH=../libdisk:../../lib`. Use `-f "Marble Madness!"`
  (the formats file knows this title: `amigados_unknown_length`).
- VGMaps NES maps (Rick N. Bruns) = arcade-derived STRUCTURE reference, not palette.
  Hall of Light / Lemon Amiga are anti-bot-blocked from this box; Wikimedia API works.

## MEASURED FROM THE REAL AMIGA GAME (2026-07-27, iteration 21)
Screenshots archived at `/home/jez237/game-refs/marble-madness/ref-shots/`:
`amiga-title.png`, `amiga-options-menu.png`, `amiga-practice-race.png`, `amiga-game-over.png`.

- **Title**: black bg; "MARBLE" in blue chevron-arc lettering, "MADNESS" in orange/yellow gradient
  with a red drop shadow; "Amiga Version by:" (red) / "Larry Reed" (orange); blue EA striped logo;
  "Copyright(c) 1984, 1986 / Atari Games Corp. & Electronic Arts" in blue. Title holds until the
  game finishes loading, then the options menu appears on its own (~20 s).
- **Options menu** (exactly as the manual describes, mouse-only, marble = cursor):
  - Grey screen `#999999`; title bar `#888888` reading `Marble Madness!!` with letters alternating
    pink `#ffaaaa` / blue `#aaaaff`; all body text dark red `#882222`; the CURSOR IS A YELLOW
    MARBLE `#cccc00` with `#666600` shading.
  - Lines: "Press Left Mouse Button / near Item to change the / Item's value. / Select GO! when
    finished." then `Number of Players:  1`, `Difficulty:  0`, `Red Player:  Rear Port`,
    `Input Device:  Joy Stick`, and `GO!` near the bottom centre.
  - Text is letter-spaced (roughly one blank between glyphs) in a chunky 8x8-ish font.
- **In-race HUD**: a grey `#888888` bar across the very top (~4% of screen height); **score at
  ~22% across, time centred**, both in RED `#882222` chunky digits (time is 2 digits, e.g. `39`).
  **The digit font is measured**: all ten glyphs are 8x8, sampled at Amiga pixel scale
  (`x=144+ax*(1100/320)`, `y=68+ay*(784/256)`) from HUD numbers across several captures —
  the shapes are in `HUD_FONT` in index.html. Distinctive: heavy 2–3 px strokes, a slashed-looking
  `0`, and a rounded `.######.` bottom row on most glyphs.
- **Practice race palette — MY BUILD IS WRONG (was pastel blue/grey)**. Reality:
  - Floor = grey diamond checkerboard: `#bbbbbb` (14.9%), `#999999` (12.2%), `#dddddd` (8.0%),
    with `#666666` (10%) grid/shadow lines. NO blue anywhere in this race.
  - Vertical striped cliff faces = dark red `#882222` / red `#aa2222` / orange `#cc6600` /
    yellow `#cccc00` stripes (the blue striped walls I built came from a DIFFERENT race's arcade
    shot — blue is not the practice palette).
  - Rails/arch gates = bright red `#dd3333` tube geometry arching over the course edges.
  - Ground arrows painted on the floor in `#a72222`, pointing down-course.
  - Drop shadows are hard-edged `#333333`/`#444444`, offset down-right.
  - The player marble is RED (`Red Player`), not silver.
  - Only ~10 distinct colours dominate the frame (OCS 32-colour palette, mostly greys + the
    red/orange/yellow ramp).
- **Game over**: grey `#999999` panel centred low with YELLOW `#cccc00` text
  `OUT OF TIME` / `GAME OVER`.
- **The marble sprite** (zoomed from the real capture, `captures/marble-zoom.png`): a FLAT-shaded
  bright red disc (no gloss), a hard dark-red `#8b1a1a` crescent on the lower-right, and chunky
  olive-yellow `#cccc00` BLOCKS on the surface that visibly rotate as it rolls. Its drop shadow is
  hard-edged dark grey, offset down-right — not a soft blur.
- Box-back screenshots histogrammed: `box-main` and `box-left` are dominated by light blue
  `#a8c0d8`/`#c0d8f0` + white with dark navy-purple `#303060`/`#484878` walls (confirms PAL_BLUE);
  `box-bottom` adds a brown-orange `#783018` accent.
- **Pre-race banner (iteration 23)**: on starting a race the original shows a grey panel in dark
  red reading `TIME TO FINISH` / `<RACE NAME> RACE:   <seconds>`.
- **MEASURED CLOCK (corrected, iteration 24): at Difficulty 0 the practice race starts at 60 s.**
  Direct observation on a fresh race — marble at the start gate, score `0`, clock `58` two seconds
  in. So d0 DOES match the arcade allowance. The `45` I read from the pre-race banner in iteration
  23 was NOT difficulty 0 (the difficulty had been cycled in an earlier session and the banner
  number is the only thing I read); treat banner numbers as suspect unless the menu difficulty is
  verified in the SAME boot. Still to measure: d1–d7 and races 2–6.
- The options-menu title letters **colour-cycle** (captured once as pink/blue `#ffaaaa/#aaaaff`,
  once as pure red/blue `#cc2222/#2222cc`).
- Keyboard→joystick works in the rig (`joystick_port_1 = keyboard` in mm.fs-uae): arrow keys drive
  the marble (verified: score rose, marble moved). `mm_ctl.py hold <Key> <secs>` / `probe`.
  NOTE: FS-UAE under Xvfb runs BELOW realtime, so wall-clock seconds != game seconds.

## Reference facts
- Six races: **Practice, Beginner, Intermediate, Aerial, Silly, Ultimate**. Arcade time limits
  (Normal DIP): **60/60/35/30/20/20 s**; remaining time carries into the next race; finishing
  grants the next race's base time. Arcade runs 30 Hz; courses are a heightmap array ray-traced
  offline (our per-cell corner heightfield matches the approach). Music Brad Fuller & Hal Canon.
- **From the official Amiga manual (2026-07-27) — Amiga-exclusive features still TODO:**
  - **Options menu** (mouse-only): Number of Players toggle, Input Device per player,
    **Red Player** (P1, default joystick rear port) / **Blue Player** (P2, default mouse front
    port), **Difficulty 0–7** (0 easiest, click cycles 0→7→0), **GO!** button starts the game.
  - **Turbocharge**: pressing the joystick button / left mouse button while steering gives the
    marble an extra burst of speed. (Real Amiga addition — implement.)
  - PAL OCS (50 Hz). Publisher Ariolasoft UK under EA license.
- Hazards: Steelie (black marble, rams you off), Marble Munchers (green, docile in Beginner),
  moving acid pools + moving green hills (Intermediate), hammers/vacuums/catapults/pistons
  (Aerial), drop tube (Beginner), wave floor (Beginner), Silly = reversed orientation
  (uphill=downhill), polka-dot surfaces, speeding-up music, squashable critters (+points/+time).
- 2P: separate clocks, race winner gets +1000 pts and +5 s; timeout eliminates a player.
- Scoring: 10 pts/s of forward progress, 100×s time-bonus drain at goal, +1000 Steelie knock-off,
  practice bonus pads (3/4/5/6 ×1000). Hi-scores: localStorage `mm-hiscores-v1`, initials entry.
- **Secret Water Maze is NOT in the Amiga version** (C64/AppleII/PC only) — not a parity item.

## Current build (v0.17.0) — engine summary
- Canvas 2D axonometric, mutable basis: `AXx=14,AXy=7` across (2:1), `AUx=-7,AUy=10` down-course;
  `BASIS_FLIP={axx:14,axy:7,aux:7,auy:-10}` for Silly (+u renders up-screen). `FLIP=AUy<0` gates
  painter order, wall faces, occlusion, camera lookahead, goal-text (`fu=-1`).
- Per-cell corner heightfield `cells[u][v]={h00,h10,h01,h11,type,tint,tex,dots}`; builder ops
  `slab/rampU/rampV/waves/pyramid/carve/dynWaves`; `groundH()` = bilinear + dynWave band +
  gaussian moving hills; course prerendered offscreen; `redrawFront` for occlusion (bounds-clamped).
- Physics 120 Hz fixed step: `GRAV=22 ACC=20 FRICT=3.2 MAXSP=11 ABYSS=-2.5`; wall probes at
  `r*0.6` (grounded: block step>0.55; airborne: block if probe ground `> m.z+0.3`); landing iff
  `m.z<=h2 && (zPrev>=h2-0.3 || h2-m.z<1.4)`; shatter at impact vz>14 unless dropIn; roll-off
  fall seed capped −3; fall-out below ABYSS−3.5.
- Races in `RACES[]` (time/start/build/steelie/basis/stars). **Clocks now 60/60/45/45/30/40 —
  deliberate headroom vs arcade DIP pending human playtest** (difficulty option may resolve this:
  default difficulty = current headroom, higher = DIP times).
- Look: `edgeContours()` dark outlines on drop-offs/voids, height-graded brightness
  (`k*=clamp(0.66+avgH*0.028,0.70,1.08)`), blue striped walls under grey-ish surfaces
  (`#2e56c8/#16295e`), slope shading.
- 2P local: P1 arrows+pointer-lock mouse (+WASD solo), P2 WASD/gamepad (press `2` on title);
  winner +1000/+5s; catch-up warp at screen-dist >560px (−1 s); P1–P2 collisions; Steelie
  targets nearest. Music: in-file WebAudio FM sequencer, 8 original loops; Silly tempo
  `1+min(0.6,raceT*0.025)`; `updateMusic()` called from `render()` (headless-safe); M mutes.
- QA (`?qa=1`, auto-mute): `__qa.version/state/race/pos/vel/steelie/timeLeft/score/deaths/carry/
  lastDeath/p2/finishOrder/music/hiscores/hazards/hidden`; methods `start/start2/loadRace/warp/
  warp2/warpSteelie/input/input2/lift/hold/setTime/step/auto/forceEnd/enterInitials/beginEntry`.

## Changelog (compressed)
- v0.2–0.3 (2026-07-14): rebuilt from scratch after total loss (game had never been committed);
  practice course to reference layout. v0.5–0.9: all six races, hazard roster, Steelie AI, 2P,
  FM music, ending. v0.10: scoring + hi-score table. v0.11: arcade-measured projection + palette
  (blue striped cliffs). v0.12: full six-race + reference-layout pass.
- v0.13 (post-playtest): clock budgets retimed after user retraction (see Playtest). v0.14:
  **courses compressed to arcade proportions** (Aerial 112→76 rows, Ultimate 102→72; 45/40 s).
  v0.15–0.16: hazard/geometry polish, Beginner tunnel+catapult, Ultimate island bridges
  4-wide+flush. v0.17.0: curved Beginner slide + Aerial chutes, round wave pit, Silly X-crossing
  walkways + flared start deck, full-length split-level bridge (u18–24).
- **v0.18.0 (2026-07-27)**: per-race palette table (`PAL_AMIGA` / `PAL_BLUE`; active `PAL` chosen
  in `loadRace`). Practice race repainted to the measured Amiga colours — per-cell grey diamond
  checker floor, 8-band red/orange/yellow striped cliff faces. RED player marble (P2 now blue,
  matching the Amiga's Red/Blue Player). HUD rebuilt as the original's grey top bar with flat red
  digits, score left / time centre (`textFlat()` helper, no drop shadow). OUT OF TIME / GAME OVER
  grey panel with yellow text. Verified: all 6 races render clean; practice/beginner/silly bots
  all reach the goal with 0 deaths.
- **v0.19.0 (2026-07-27)**: the Amiga **options screen** (state `options` between title and play):
  grey screen, colour-cycling red/blue letter-spaced title, dark-red letter-spaced body text
  (`spaced()` helper), yellow marble cursor following the mouse, rows Number of Players /
  Difficulty 0–7 / Red Player port / Input Device, and GO!. Clicking near a row cycles it.
  **Difficulty 0–7 now scales every clock** (`raceTime(i)` = base × (1 − 0.043·d)); the practice
  base is the measured 45 s, so d0 = 45/60/45/45/30/40 and d7 = 31/42/31/31/21/28.
  **Turbocharge** (manual feature): hold fire / left mouse / Space — `TURBO_ACC 1.55`,
  `TURBO_SP 1.32`, measured +37% distance over 3 s. Pre-race banner now uses the original's
  `TIME TO FINISH / <RACE> RACE:  <n>` wording on a grey panel.
  New QA hooks: `options`, `openOptions()`, `menuAt(x,y)`, `menuClick()`, `setDifficulty(d)`,
  `turbo(on)`.
- **v0.20.0 (2026-07-27)**: practice clock corrected to 60 s at d0 (difficulty curve now
  `1 − 0.0357·d`, so d7 ≈ 0.75× → 45 s, matching the other banner reading). Added the original's
  **red tube arch gates** (`archGate()` — built in WORLD space from projX/projY so it foreshortens
  correctly; screen-space drawing looked like a croquet hoop. It shrinks its span until both feet
  find ground, otherwise `groundH` returns NaN at the course edge and the arch silently vanishes)
  and the **painted twin-chevron floor arrows** (`floorArrow()`, drawn through the axonometric
  setTransform so they lie flat on the surface).
- **v0.21.0 (2026-07-27)**: practice OPENING rebuilt from the real Amiga screen — the invented
  wave field is gone, replaced by a broad FLAT checkerboard plain with a three-peak **sawtooth far
  edge** (`carve` per column), a stepped **centre island with twin white-tipped peaks**
  (`pyramid(...,{tint:'#e2e2e2'})`), and a raised platform under each arch gate. Platforms are
  left UNTINTED on purpose so they pick up the palette's red/orange/yellow striped cliff faces.
  The bot line had to be re-routed around the island (see waypoints).
- **v0.22.0 (2026-07-27)**: the other five races now use the authentic diamond checkerboard too.
  Sampled from the box-back Amiga screenshots (quantised histogram over the non-dark pixels):
  floors are near-white `#e8f0f8` / light blue `#c0d8ec`; cliff faces are a dark blue-purple
  striped ramp `#3c5aa8 / #22356e / #4a3078 / #8fa4dc`. `PAL_BLUE.checker` is now `true`, so every
  race has the checker floor rather than the old flat grid.
- **v0.23.0 (2026-07-27)**: the marble now ROLLS. Physics accumulates `m.spin` (rolling without
  slipping: `spin += speed*dt/r*0.55`) plus the screen-space travel direction `m.spinX/spinY`;
  `drawSpinPattern()` places patches on a unit sphere and rotates them (Rodrigues) about the axis
  perpendicular to travel, hiding any with `z<=0.06` and foreshortening the rest by `sqrt(z)`.
  The marble is now flat-shaded with a hard crescent and blocky patches to match the real sprite,
  and the drop shadow is hard-edged. Steelie and P2 get their own patch colours.
- **v0.24.0 (2026-07-27)**: the HUD now uses the ORIGINAL'S NUMBER FONT — all ten digits measured
  glyph-by-glyph off the real screen and drawn as run-length filled rects (`HUD_FONT` + `hudNum()`,
  scale 2 on the 640x400 canvas = the original's proportions). Bar height 26→20 px and the score
  moved to 22% across to match the Amiga layout; the pre-race banner's number uses it too.
- **v0.25.0 (2026-07-27)**: **regression fix found by the new state sweep** — since v0.19.0 the
  game-over screen drew `GAME OVER` directly on top of the `FINAL SCORE` line (both at y=206), so
  the two overlapped illegibly. The grey panel now covers the whole block and the final score is
  drawn in the measured Amiga digit font. LESSON: the smoke and bot suites only cover the `race`
  state; sweep the other screens too.
- **v0.26.0 (2026-07-27)**: title screen restyled to the original's treatment — **"MARBLE" in
  blue** (`#bcd8ff→#4f8ae8→#1f3fa8`) with the chevron arcs either side, **"MADNESS" orange over
  red** (`#ffe27a→#ff9a2e→#d4241c`); both had been the same orange. Dropped the stale "PRACTICE
  BUILD" label. Hi-score flow verified end-to-end with a qualifying score (`hiscore.mjs`):
  timeup → `beginEntry()` → `initials` → `enterInitials()` → title, table updated, no errors —
  the earlier sweep's "state=title" was correct behaviour for a zero score, not a bug.
- **v0.27.0 (2026-07-27)**: the diamond checker now covers TINTED floors as well (in their own
  hue, ±% brightness by parity) — previously only untinted cells got it, so the Silly race's gold
  decks were flat while everything else was checkered. Every surface in the original is checkered.
- **Audio: no capture, none needed for now.** Tried SDL's disk driver
  (`SDL_AUDIODRIVER=disk SDL_DISKAUDIOFILE=...`) to record the real game — no file appeared, and in
  any case the emulator was sitting at the Workbench with nothing playing. Not worth another
  attempt: the melodies can't be copied anyway (clean-room), and our own `Snd` layer already has a
  speed-linked filtered-noise ROLL, impact clacks, goal/ready/count cues and the FM music bus.
- **Course-vs-clock calibration (reasoned, 2026-07-27)**: the bot finishes the practice race in
  ~11 s of its 60 s budget on a perfect line; a human will take perhaps twice that. So difficulty 0
  is GENEROUS rather than tight — which is the right side to err on given the original playtest
  complaint ("clock counts down super fast"), and difficulty 7 (×0.75) exists for the tight version.
  No change made; revisit only if a human playtest says the pacing feels slack.
- **v0.28.0 (2026-07-27)**: housekeeping the reviews turned up. The page header badge and the
  games-index entry both still said **"PRACTICE BUILD" / "Unfinished ... palette measured from
  arcade reference shots"** — stale since the emulator work; both now describe what ships (measured
  from the real disk, options screen, difficulty, turbocharge, and an honest note that course
  layouts past each opening still come from arcade maps). Mobile check at 390x844 (`mobile.mjs`):
  no horizontal overflow, touch enabled, no errors — but the canvas hugged the top of a portrait
  screen with a large void below, so the stage is now vertically centred (`#stagewrap`).
- **Reference review (iteration 32)**: `box-main` is a genuine Amiga shot of a blue race — it
  confirms light-blue/white checker floors, BLUE striped cliffs, dark-navy pyramids with white
  tips, and the **Marble Munchers as rounded green blobs** (mine already match). One of the four
  box shots is an orange/tan course, which supports keeping the Intermediate race's tan scheme
  rather than forcing every race blue.
- **v0.29.0 (2026-07-27) — FIRST MEASURED *FEEL* CORRECTION.** Timed the real Amiga marble:
  from rest on the opening plain, one second of full input moved it ~145 screen px in x; the
  checker cell period there is ~61 screen px (autocorrelation on a flat scanline), so **~2.4
  cells/s**, and correcting for the emulator running ~0.76x realtime gives **~3.2 cells in a true
  second**. It also clearly sheds speed when input stops (~2.6 cells over the next 2.2 s).
  OURS covered **7.24 cells** in that first second, hit MAXSP within it, and coasted 13.2 cells
  while barely slowing — i.e. roughly 2-3x too fast and far too slippery, which is also why the
  courses felt short against their clocks. Retuned `ACC 20→11, MAXSP 11→6.2, FRICT 3.2→3.6`
  (`MOUSE_GAIN 0.012→0.020` to keep the trackball feel). Now ~3.95 cells/s with a decaying coast.
  Bots still reach every goal with margin: practice 17.5 s of 60 (was 11 s), beginner 16.6 s,
  silly 8 s. **Method (repeatable):** `feel.mjs` for ours; for the original, capture at rest, hold
  a direction 1.0 s, capture, coast 2.2 s, capture, then locate the marble by differencing the
  red-ish pixels against the rest frame (camera is static on the opening screen) and scale by the
  checker period.
- **v0.30.0 (2026-07-27) — the other half of the feel measurement.** Held a direction on the real
  game for 3 s, capturing each second: once rolling it covers **6.9 cells/s** (emulator time) —
  **~9 cells/s corrected for the ~0.76x rate**. So the original is SLOW OFF THE LINE BUT FAST ONCE
  ROLLING; v0.29 had correctly slowed the launch but wrongly capped the top end at 6.2. Retuned
  `ACC 9.2, FRICT 3.13, MAXSP 9.6` — terminal = ACC/(FRICT*0.32) = 9.18 cells/s by construction,
  first second ~3.5 cells. Bots: practice 15.5 s of 60, beginner 13 s, silly 3.8 s, all 0 deaths.
  **Caveat for future measuring**: only the FIRST second-to-second segment of a hold is
  trustworthy — by ~2 s the marble reaches a wall or the plain's edge and bounces (the third
  sample reversed direction), and driving +v for 3 s in our own `feel.mjs` runs off the 24-cell
  course, so the empirical "top speed after 3 s" reads low (7.8) versus the analytic 9.18.
- **v0.31.0 (2026-07-27) — momentum beats control.** Third feel measurement: from rest, 1 s
  forward then 1 s of FULL REVERSE. The original **still travels +2.1 cells forward** during that
  reverse second — it cannot be turned around in a second. Ours turned and ran backwards. Fix is
  less control authority at the same top speed: `ACC 9.2→4.6` with `FRICT 3.13→1.55`
  (terminal = ACC/(FRICT*0.32) ≈ 9.3 unchanged), `MOUSE_GAIN→0.034`. Ours now carries ~+0.4 cells
  into the reverse second before turning.
  - **Test-site trap**: the first two attempts measured a WALL BOUNCE, not physics — the marble
    hit the raised platform at v4-7/u6-8 and rebounded (velocity flipped +3.57 → -1.54). Use the
    clear lane at **v=8, u=4..10** (between the left platform and the centre island, past the
    sawtooth carve). `trace.mjs` prints velocity every 0.25 s and makes bounces obvious.
  - **The naive bot is retired.** `bot.mjs` (pure proportional, gain 0.6/clamp 0.75) cannot drive
    the heavier marble — it failed the Silly race with 5-7 deaths at every ACC below 9. That was a
    HARNESS limit, not an impassable course: `bot2.mjs` (PD with 0.35 s lookahead, lateral-velocity
    damping, and easing off down-course when far off line — what a human does) clears every race at
    ACC 4.6: practice 0 deaths, beginner 1, silly 1, all with 24-41 s to spare. **Use bot2.mjs.**
- **v0.32.0 (2026-07-27) — did the heavier marble break the courses? No.** New QA hook
  `__qa.ground(v,u)` (returns groundH or null) lets a driver follow the course with no hand-tuned
  waypoints; `botT.mjs` scores lateral options 1.5/3/4.5 rows ahead for solid, climbable ground.
  Findings at ACC 4.6:
  - **Idle test** (`idle.mjs`, 5 s of no input): practice/beginner/intermediate/ultimate starts are
    stable; aerial rolls forward down its slope (fine); **Silly rolls off its start deck and dies**
    — friction is lower now, so standing still on that deck is fatal. Authentic-ish, but noted.
  - **Intermediate reaches the GOAL** with the terrain follower (3 deaths) — the earlier failure was
    my invented waypoint list, not the course.
  - **Aerial and Ultimate fail with every simple driver — but they fail WORSE at the OLD physics.**
    Control run at ACC 9.2: aerial u=11, ultimate u=18.3; at ACC 4.6: aerial u=28.3, ultimate 12.7.
    So the new marble did NOT break them; the ledger's gate lists were tuned for the retired
    `__steerG` PD gate-seek (with velocity targets), not for a plain proportional gate follower.
    **Still unproven: that Aerial/Ultimate are completable at all under the new physics.** To prove
    it, port the gate lists to a driver with velocity targets, or extend `botT.mjs` to plan across
    gaps (it currently cannot handle the practice slalom either, stalling at u≈50).
- **v0.33.0 (2026-07-27) — two courses started you off their own racing line.** `terrain.mjs`
  (new) dumps ground heights as a grid via `__qa.ground`, which made the problem obvious:
  - **Aerial** started at v6.5 while the course funnels v6-19 → v9-16 → **v11-15** by u11, so the
    start was ~5 cells left of where the path goes. Now starts at v13.
  - **Ultimate** started at v14 — the EXACT right edge of the v8-14 corridor from u6. Now v11.5.
  - **Ultimate's islands** are a zigzag whose consecutive platforms overlapped by only 2 cells
    (u11 v10-13 → u12 v4-11; u16 v9-14 → u17 v13-20). Necks widened to ~4-cell overlaps
    (`slab(8,11,13,11)`, `slab(4,12,13,15)`, `slab(9,16,16,16)`, `slab(11,17,20,20)`,
    `slab(12,21,17,21)`). Driver progress on Ultimate went u5.8 → 9.2 (start) → 16.4 (necks).
  These were survivable with the old twitchy marble and punishing with the faithful heavy one —
  the physics work exposed them rather than caused them.
  **STILL UNPROVEN: Aerial and Ultimate completed end-to-end.** Best so far: aerial u31/76,
  ultimate u16/72. `botC.mjs` (corridor driver: widest safe band ahead + throttle easing) was
  WORSE than `botT.mjs` on most races — don't assume more sophistication helps.
- **v0.34.0 (2026-07-27) — death-logging finds four more Aerial defects.** `deaths.mjs` drives a
  race and prints `__qa.lastDeath` each time it dies; the clusters point straight at the geometry:
  - row 20: `rampU(5,18,10,20)` was narrower than the `slab(5,15,15,17)` platform feeding it, so
    anyone on the right half ran out of ground → ramp widened to v13 (and the u21 slab with it).
  - row 40: the twin ramps (v5-10 / v14-19) missed the v6-11 channel above them by a cell →
    left ramp extended to v11.
  - row 58: the **catapult only captured v11-14 of a v9-16 platform**, so an off-centre marble
    rolled straight past it into the 5-row void it exists to launch you over → rect widened to
    v9-16, u52-55.
  - row 68: the twin chutes (v5-9 / v16-20) were fed by a v10-15 platform — 2-cell overlap →
    added chute mouths `slab(6,63,9,63)` and `slab(16,63,19,63)`.
  Aerial driver progress: **u31 → u68 of 76**. Ultimate unchanged at u16/72.
  **Repeated IDENTICAL death coordinates are deterministic replay, not a respawn-loop bug** — the
  driver fails the same way each run; don't go hunting in `respawnPlayer`.
- **v0.35.0 (2026-07-27) — ALL SIX RACES VERIFIED COMPLETABLE at the measured physics.**
  `deaths.mjs` (terrain follower, no stuck-detection) reaches the goal on beginner, intermediate,
  **aerial**, silly and ultimate; practice is completed by `bot2.mjs` (the follower cannot handle
  its slalom). This closes the question left open in v0.32-v0.34.
  - **Aerial's last blocker was the catapult's aim.** It launched straight (`vv:0`), landing you
    dead centre on the u60-63 platform — but the course splits into twin chutes at u64 with the
    middle void, leaving ~4 rows (<0.5 s) to move sideways, which the heavy marble cannot do.
    Now launches `vv:-4.5` so you land on the LEFT chute's line: aerial finishes with 0 deaths.
  - **Ultimate and Intermediate were already fine** — the earlier "failures" were `botT.mjs`
    aborting on its `stuck>2400` counter, not the courses. When in doubt, re-run without it.
- **v0.36.0 (2026-07-27) — clock balance audit.** `balance.mjs` runs each race to the goal and
  reports how much of the clock a competent driver needs. At v0.35 budgets:
  practice 18 s/60 (30%), beginner 19.5 s/60 (33% with `bot2`; 42 s if the driver dies 5x),
  **intermediate 27.8 s/45 (62%)**, aerial 11.8 s/45 (26%), silly 4.5 s/30 (15%),
  **ultimate 19.8 s/40 (50%)**. A human is far slower than a bot that never hesitates, so the two
  outliers left almost no room: **intermediate 45→56 s, ultimate 40→50 s** (now 50% and 40%).
  Rule of thumb going forward: aim for a competent run to use **~1/3 of the clock**. Difficulty 7
  still scales everything ×0.75. Silly at 15% is very generous but generous is the safe error —
  the original playtest complaint was that the clock felt too fast.
- **v0.37.0 (2026-07-27) — scoring & hazard audit: NO DEFECTS.** Every documented rule checked
  against the running game (`score.mjs`, `goalbonus.mjs`, `pads.mjs`, `steelie.mjs`):
  - movement **10 pts/s** while speed >1.2 (a first reading of "20 per 10 s" was the marble
    stalled against the centre island, not a bug — always log speed alongside score);
  - **goal bonus ~100 per remaining second** (4099 awarded for 42.0 s left) and the drain also
    rolls the clock into the next race — **carryover confirmed** (next race began at 99.5 = base
    60 + ~39.5 carried);
  - **practice bonus pads award 3000/4000/5000/6000**, pickup radius 0.95 cells vs a drawn pad of
    0.81, so the grace favours the player; pads sit 3 cells apart at u76.3;
  - **Steelie** activates at its `triggerU`, spawns at its configured cell and chases (ultimate:
    u35→u56 in 5 s); it can also fall off the course itself.
  **GOTCHA: `__qa.hazards` reports the type as `t`, not `type`** — filtering on `type` silently
  returns [] and looks like the hazards are missing. The getter now also reports `val`/`taken`.
- **v0.38.0 (2026-07-27) — FULL HAZARD AUDIT: every mechanic verified, no defects.**
  `hazards.mjs` stands the marble on each hazard in each race for 3.5 s and records the outcome:
  muncher → `eaten`; acid → `dissolved`; hammer → `smashed`; piston → shoves (~9 cells, no death);
  moving hill → carries the marble (20-35 cells); critter → **+500**; drop tube (beginner) →
  transports v5,u50 → u61.5; catapult (beginner) → launches u67 → u88.
  **The vacuum's nozzle deliberately hangs over the void** beside the u25-28 ramp (v15.8, zone
  v9-15.5): parked at v12 with NO input the marble is dragged to v18.9 and falls — working as
  designed, so "NO GROUND under hazard" for it is expected, not a bug.
  Combined with v0.37 this means **every hazard, the Steelie, the bonus pads and the whole scoring
  economy are verified working**.
  QA `hazards` getter now reports rect-based hazards (tube, catapult) by their rect centre plus a
  `rect:true` flag — they previously read `0,0` and looked misplaced.
  Harness note: `__qa.lastDeath` is NOT cleared between probes, so a hazard that does not kill
  still shows the previous kill's `kind`; compare the deaths COUNT, not the kind.
- **v0.39.0 (2026-07-28) — REAL 2-PLAYER BUG: the catch-up rule drained the trailing clock.**
  The rule warps a trailing player to the leader's checkpoint and charges them 1 s — but it ran
  **every physics step with no cooldown**. If the pair stayed >560 px apart (e.g. the leader's
  `lastSafe` is itself far behind, or the leader keeps pulling away) it re-fired at 120 Hz and
  **drained a full 60 s clock in about 7 s**. Added `catchupCD` (3 s, reset in `loadRace`).
  Verified: P1 warped 56 rows ahead now costs P2 exactly 1 s, once, then the clock ticks normally.
  Rest of the 2P audit is clean: separate clocks tick 1:1 for both players, winner finishes with
  `finishOrder=[0]` and collects the bonus (P1 +7170 incl. +1000), timeout eliminates a player
  (`out:true`).
  **How it was found**: an audit probe warped P1 near the goal and P2's clock hit 0 in 7 s — the
  probe looked broken, but the anomaly was real. Worth remembering when a test result looks absurd.
- **v0.40.0 (2026-07-28) — first END-TO-END PLAYTHROUGH, and it found a balance flaw.**
  `playthrough.mjs` plays all six races in ONE game (no `loadRace` between them), so progression,
  carry-over and the ending are exercised together for the first time. It completes:
  `state=ending`, 6/6 races, 10 deaths. But the clock compounded —
  race1 60 s → race2 102 → race3 116 → race4 133 → race5 151 → **race6 195 s for a 50 s course**.
  Uncapped carry-over plus our deliberately roomy budgets removes the clock as a threat after
  race 2. Added `CARRY_CAP=20`: now 60/80/76/65/50/70, still completing, final score 28.6k
  (was 63k — most of that was time bonus on hoarded seconds).
  NOTE this is a deliberate deviation: the arcade does not cap carry-over, but its budgets are
  much tighter (60/60/35/30/20/20) so the surplus never compounds like this.
- **Per-frame audit (v0.40.0)**: checked every score/time mutation for the catch-up class of bug.
  Steelie +1000 fires inside `die()` (once), the 2P winner bonus is guarded by `!pl.finished`,
  bonus pads by `h.taken`, movement by `moveAcc`, the goal drain by `pl.finished` + a bounded
  `take`. Sound is self-limiting too: pressing into a wall for 3 s produced ONE `clack` (the
  -0.38 bounce plus the heavy marble's slow re-acceleration keeps it under the threshold).
- **Performance is not a feel problem**: `perf.mjs` measures real rAF frame times per race —
  all six sit at a median 16.6-16.7 ms (60 fps), p95 ~17 ms, worst 19.6 ms, even in software
  rendering. NOTE the probe must carry a generation guard or each race adds another rAF loop and
  the numbers go to nonsense.
  **GOTCHA: the `PAL_*` consts must stay ABOVE `const RACES`** — RACES references `pal:PAL_AMIGA`,
  so if they sit below it the whole script dies on a temporal-dead-zone ReferenceError before
  `window.__qa` is ever defined (symptom: VERSION readable but `__qa` undefined).
- 2026-07-27: data-loss recovery; game+ledger committed to jz237/games mirror (user request
  "push to github"); Amiga disks secured; manual mined (difficulty/turbo/options-menu findings).
- 2026-07-27 iter 20: built local headless Amiga rig (vAmigaWeb + IPF→ADF via capsimg); real
  game boots — Workbench → icons → title verified; captures in game-refs/.../captures/.

## Playtest findings (STANDING)
- **2026-07-14 user retraction**: "clock counts down super fast and cant even see the ledges" —
  clock was 1:1 correct but budgets were arcade DIP times on oversized courses; ledges unreadable
  after palette pass. Fixed via retiming→course compression + edgeContours/brightness/blue walls.
- **A human playtest gates any parity claim. Never declare parity from bot runs alone.**
  Headless bots prove mechanics, not experience.

## Verify protocol (harness)
- Scratchpad was wiped 2026-07-27 — **recreate scripts from the waypoint tables below** on next
  code change. Serve: `python3 -m http.server 8379` in a scratchpad dir containing
  `marble-madness/`. Chrome: `--headless=new --remote-debugging-port=9379
  --user-data-dir=$PWD/chromeprofile3`; drive via Node CDP.
- **`__qa.step(ms)` TAKES MILLISECONDS** (`n=Math.round(ms/1000/STEP)`): pass `1000/120` for one
  physics step. Passing `1/120` rounds to ZERO steps — the run looks alive but nothing moves.
- **`__qa.start()` enters `race` directly; `__qa.loadRace(i)` enters `ready`** (needs ~1.5 s of
  stepping). Do `start()` + `loadRace()` + drive inside ONE `Runtime.evaluate`: between separate
  calls the rAF render loop advances a finished race past `timeup`, the drive loop then never
  runs, and the QA getters return the PREVIOUS race's values — identical results across races is
  THIS bug, not a terrain problem.
- **Always `Page.navigate` to `?qa=1&cb=Date.now()` AND assert a fresh-build marker** (a constant
  from the newest edit) — Chrome has served stale HTML across `Page.reload({ignoreCache:true})`.
  Never `--virtual-time-budget`. pkill chrome with a bracket pattern from a separate call.
- **Two bot formats — DO NOT MIX (two past fiascos):**
  - Threshold-steer `__steer(wp)`: waypoints `[maxU, targetV]` (practice/beginner/intermediate/
    silly). Known-good gentle bot: gain 0.6, clamp 0.75, no dodge.
  - PD gate-seek `__steerG`: gate points `[v, u]` (aerial/ultimate).
  - Symptom of transposition: deaths far off-course at |v| ≫ width, byte-identical runs across
    terrain edits, atGate index near list end at low u. Byte-identical across an edit ⇒ edit not
    in page OR bot never reaches the cells — verify which before touching geometry.
- Waypoints (current, verified v0.17.0):
  - Practice `[maxU,tV]` (**re-routed v0.21.0** for the new centre island — pass it on the RIGHT;
    the left route loses too much time and dies in the slalom):
    [7,12],[12,16.5],[18,15],[24,11.5],[30,10.7],[43,11.5],[50,15.5],[52.5,15.5],[55,9],[57.5,5.5],
    [61,15.5],[66,15],[72,10],[88,7.5] → goal, 0 deaths, ~11 s, score 5110.
    (superseded v0.18.0 note follows)
  - Practice `[maxU,tV]` (**corrected v0.18.0** — the practice course is a SLALOM: 1-unit steps
    at u=51, u=57 and u=63 are passable only on alternating sides, so the line must zig
    right→left→right; the old list drove into the u=51 wall and fell off the west edge):
    [20,11.5],[27,10.7],[43,11.5],[50,15.5],[52.5,15.5],[55,9],[57.5,5.5],[61,15.5],[66,15],
    [72,10],[88,7.5] → goal, 0 deaths, ~10 s, score 5100 with the bonus pads
  - Beginner: [9,12.5],[12,7.5],[15,17.5],[31,16.5],[56,17.5],[61,17.5],[65,10],[75,12],[83,12],[99,6],[110,12.5]
  - Silly: [6,11],[8,9.5],[10,11.5],[12,14],[14,16.5],[18,12.5],[33,6.5],[43,12],[51,12],[58,12.5]
  - Aerial `[v,u]`: [11.5,5],[12.5,8.5],[12.5,10],[12.5,14],[10.5,16.2],[7.5,17.3],[7,20],[7,22.5],[9,23.5],[10.2,27],[11,32],[9.5,37.5],[6.5,47.5],[9,49.5],[12.4,53.5],[12.5,62],[7.5,64.5],[7,69],[12.5,76]
  - Ultimate `[v,u]`: [11.5,5.5],[11.5,8],[11.5,11],[9.5,13],[11,15.8],[15.5,18],[15.5,21],[12,23.5],[12,27],[12,30.5],[12,36],[9.5,38],[9.5,41.5],[12.5,44.5],[13,47],[11.2,49],[12.8,51],[12.5,53],[12.5,60],[12.5,63],[12.5,68]
- Gates green at v0.17.0: practice+beginner goal (≤4 deaths), silly goal (≤4), aerial goal (≤2),
  ultimate goal, intermediate goal.
- **`states.mjs` (scratchpad) walks EVERY UI state** — title, options, options+2P, 2P race, timeup,
  hi-score entry, initials, ending — capturing each and reporting exceptions. Run it after any
  change to rendering or the state machine: the smoke/bot suites only ever exercise `race`, and
  that blind spot let a text overlap ship in v0.19–v0.24 (see below).

## Deploy protocol
1. Edit working copy → sync to BOTH `games-source/.../index.html` and
   `jez237-website/games/.../index.html`.
2. Site: in the workspace repo commit OWN PATHS ONLY (OpenClaw pushes concurrently — never
   `git add -A`) → `git fetch && git -c rebase.autoStash=true rebase origin/main` → push →
   `bash /home/jez237/.openclaw/workspace/scripts/deploy_cloudflare_pages_site.sh <clean temp
   worktree of origin/main>` → verify `https://jez237-site.pages.dev/...?cb=$RANDOM` (first probe
   may be stale edge; retry) → `git worktree remove`. Script self-blocks stale deploys.
3. **GitHub mirror (every iteration)**: in `games-source/` commit `2026-07-13/marble-madness`
   (index.html + PARITY.md) → rebase on origin/main → push. Pages deploys via Actions
   (`gh run list --workflow=pages.yml`, build_type=workflow since 2026-07-24). Verify
   `https://jz237.github.io/games/2026-07-13/marble-madness/?cb=...`. Account is **jz237** (no
   "e") — jez237.github.io does not exist and 404s everything.
4. Update games-index desc (jez237-website/games/index.html ~line 1301) when features land.

## Amiga emulator rig (LIVE since 2026-07-27, iteration 20)
- **vAmigaWeb (WASM A500) in headless Chrome — WORKING; real game boots to title.**
  Server: `python3 server.py` in scratchpad `mm-emu/` (port 8380, COOP/COEP headers, serves
  `/home/jez237/game-refs/tools/site/` = clone of vAmigaWeb.github.io; game files in `site/mm/`).
  Chrome: port 9381, SwiftShader flags, profile `mm-emu/chromeprofile`. Drivers in scratchpad
  `mm-emu/`: `boot.mjs` (navigate, inject kick13-256.rom + mm.adf via `wasm_loadfile`, run,
  timed shots), `mouse.mjs` (action list: `M,dx,dy,n` stepped moves / `d` dblclick / `W,0|1`
  warp / `w,ms` / `s,name` shot → `game-refs/marble-madness/captures/`).
- IPF→ADF: disk-utilities built with `caps=y` + FrodeSolheim capsimg (glue header
  `tools/capsinc/caps/capsimage.h`; `lib/libcapsimage.so.5` symlink; run disk-analyse from its
  own dir with `LD_LIBRARY_PATH=../libdisk:../../lib`). Result: T0.0–79.1 all AmigaDOS; only
  T0.1 is a longtrack (110496 bits) — **plain mm.adf boots and passed protection so far**
  (title reached; watch for late checks at race start). mm.eadf (extended) also made.
- KICK13.ROM/kickstart12.rom on disk are DOUBLED 256KB images — use first half
  (`site/mm/kick13-256.rom`, verified "Kickstart 1.3 Rev 34.005").
- Mouse calibration: `wasm_mouse(port,dx,dy)` steps of ~10; **1.6 counts ≈ 1 page px** (uniform
  x/y at window-size 1100x800). `wasm_mouse_button(port,1,down)`. **Warp OFF before clicking**
  (warp breaks double-click timing). vAmigaWeb ROM dialog blocks emu until a rom is loaded —
  loadfile then close modals. Boot path: WB blue screen → dblclick disk icon (~page 527,470) →
  window opens → dblclick marble program icon → game loads (df0 badge shows track#).
- Facts so far: title = blue arc "MARBLE" + orange gradient "MADNESS" on black; "Amiga Version
  by: Larry Reed"; (c) 1984, 1986 Atari Games Corp. & Electronic Arts. Title persists ≥30 s —
  options menu likely needs a mouse click (manual: menu follows title).

## Queue (parity checklist)
1. **PALETTE/LOOK OVERHAUL — biggest open parity gap.** Repaint the practice (and then every)
   race to the measured Amiga palette above: grey diamond checkerboard floors, red/orange/yellow
   striped cliff faces, red arch rails, red floor arrows, hard `#333` shadows, RED player marble,
   grey HUD bar with red digits at top (score left / time centre), grey+yellow OUT OF
   TIME/GAME OVER panel. Capture the other five races from the rig for their own palettes before
   repainting them (each race has its own colour scheme).
2. ~~Options menu + difficulty + turbo~~ **DONE in v0.19.0.**
3. **Measure the remaining clocks on the rig**: the pre-race banner states the allowance in plain
   text — set each difficulty on the menu, click GO!, screenshot the banner. Do the same for
   races 2–6 (needs driving the marble to each goal, or accepting practice-only data).
4. **DEAD END (2 iterations spent, 26 & 25): driving the original's courses.** The keyboard
   joystick moves the marble (score rises) but no single direction or diagonal makes real
   down-course progress — the marble just drifts around the opening screen and eventually leaves
   it, and **the camera never scrolls**, so the opening is a fixed-camera screen and everything
   past it stays unseen. Switching Input Device to Mouse in the options menu did not take either
   (the click cycles nothing visible / starts a race). Marble-tracking by red-blob or
   frame-differencing is defeated by the red arches, striped walls and camera behaviour.
   **Do not re-attempt without a new idea** — e.g. work out the real joystick↔course-axis mapping
   from the manual/observation of a human play video, or accept the NES-map layouts.
   The BOX BACK SCAN is the productive alternative: it carries four genuine Amiga screenshots of
   other courses (`captures/box-main|topright|bottom|left.png`, cropped from `Box_back.jpg`).
5. **Course geometry — partially done.** The practice OPENING is rebuilt from the real screen
   (v0.21.0). The rest of each course is still my own layout from the NES maps.
   **Driving the original is harder than expected**: the camera does NOT scroll until the marble
   makes real down-course progress, and holding a single direction just drifts it around the
   opening screen (all four directions tried; the red arches/walls defeat a naive red-blob marble
   detector, and frame-differencing is polluted whenever the camera does move). To map more
   course, work out the true joystick→course-axis mapping first (the view is rotated 45°, so
   down-course is probably a DIAGONAL, e.g. Down+Right held together).
5. Capture races 2–6 palettes (each race has its own scheme) and repaint as in v0.18.0.
2. **Amiga-exclusive features from manual**: options menu (players/input/Red-Blue/difficulty
   0–7/GO!), turbocharge button (fire/LMB speed burst). Difficulty should scale clocks toward
   arcade DIP at higher levels.
3. **Human-gated**: user playtest sign-off on look AND feel + music listen; then finalize
   default-difficulty clocks (current 60/60/45/45/30/40 vs DIP 60/60/35/30/20/20).
4. Cosmetics: Silly launcher contraption + T-platform decor; occlusion polish; richer SFX.

## Lessons (STANDING)
- Commit source+ledger every iteration (two total-loss events: pre-v0.2, 2026-07-27).
- Python edit scripts: `assert old in s` for EVERY replacement (silent no-ops bit twice).
- QA input: use `qaInp`/`qaInp2` overrides (pollInput overwrites otherwise).
- Hot bot variants (clamp 0.85+dodge) fail courses the gentle bot passes — bot tuning is harness
  state, not game truth.
- Landing/shallow-embed, airborne wall probes, fall-seed cap: see engine summary — regression-test
  beginner (waves+steelie) and silly (goal end-wall) whenever touching physics.
- Rebase conflicts with OpenClaw's games-index edits: keep both lines.
