# Marble Madness (Amiga) — clean-room recreation: parity ledger

Loop-maintained ledger. Target: feature parity with the Amiga (EA/Ariolasoft, 1986) version of
Marble Madness as an all-original clean-room browser build (no ripped code/art/sound/ROM data).
**Read this file first each iteration.**

- **Live**: https://jez237.com/games/2026-07-13/marble-madness/ · GitHub mirror: https://jz237.github.io/games/2026-07-13/marble-madness/
- **Source of record**: `games-source/2026-07-13/marble-madness/` (= checkout of the public `jz237/games` repo — COMMIT after every iteration, see Deploy). Deploy copy: `jez237-website/games/2026-07-13/marble-madness/index.html`.
- **Current version: v0.67.0** (single self-contained index.html, `const VERSION` near top).

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
- **v0.43.0 (2026-07-28) — DEATH-LOOP TRAP FIXED SYSTEMICALLY (found via a 2P playthrough).**
  A 2P run had P1 die 14 times around beginner u31-35 and lose the whole clock, while solo the
  same driver finished. **It was not a 2P bug**: 2P offsets P1's start by 1.2 cells (v12.5→v11.3),
  and reproducing that start SOLO failed identically. The real defect: beginner's ledge drops from
  v3-21 to **v14-21 in one row at u32**; a marble on the left fell, respawned at a `lastSafe`
  recorded on the lip, and fell again — forever.
  - **Tapering the geometry made it WORSE** (each taper step is another edge to fall off; the
    playthrough then failed at race 1). Reverted.
  - **The fix is in the checkpoint rule**: `lastSafe` now also requires ground at `u+1.6` and
    `u+3.0`, so a checkpoint is never set on the lip of a drop. Trap case: 14 deaths + timeout →
    **goal, 4 deaths**. Full playthrough still completes all six races to the ending.
  - Also hardened the 2P catch-up warp (unrelated to this symptom but wrong anyway): it now lands
    the trailing player 1.8 cells to the side of the leader's checkpoint rather than on top of
    them, and `collideMarbles` ignores a marble that is still `dropIn`.
  **LESSON: when a bug appears only in one mode, reproduce the mode's side-effects in the simple
  mode before believing it.**
- **v0.44.0 (2026-07-28) — trap sweep across every course: CLEAN.** `traps.mjs` drops the marble
  on a grid of positions in each race (549 spots total), leaves it 8 s with NO input, and flags
  anywhere it dies 3+ times. After the v0.43 checkpoint fix: **no death loops in any race**.
  **Filter carefully**: the first pass flagged 39 spots, all false — a marble parked beside acid or
  a muncher dies repeatedly because the hazard is working. Count only repeated `fall`/`shatter`.
  Also verified the ENDING: `forceEnd()` → `ending` persists until input (it does not auto-advance),
  shows CONGRATULATIONS / YOU BEAT ALL SIX RACES / FINAL SCORE, and `beginEntry()` leads to
  `initials` when the score qualifies. Removed a stale line from it ("music and the final
  look-and-feel polish are still on the way") written before either existed.
- **v0.45.0 (2026-07-28) — robustness audit: clean, plus a tab-visibility pause.**
  - `fuzz.mjs`: random steering/turbo every few frames for 60 s in EACH race, then 60 rapid
    start/start2/loadRace/forceEnd/openOptions cycles. No NaN positions or velocities, no runaway
    coordinates, no negative scores, no odd states, no exceptions.
  - `storage.mjs`: six malformed `mm-hiscores-v1` payloads (garbage text, wrong shape, array of
    junk, nulls, a 5 KB string, empty) — the game boots every time and falls back to the default
    table. Corrupt saves cannot brick it.
  - The main loop already clamps `dt` to 0.25 s, so a stall or GC pause cannot trigger a
    catch-up spiral; a hidden tab freezes rather than draining the clock.
  - Added `visibilitychange` → `paused=true` during a race, so tab-switching behaviour is the same
    in every browser rather than depending on how aggressively rAF is throttled.
- **v0.46.0 (2026-07-28) — MARBLE-TO-COURSE SCALE corrected (biggest visual gap left).**
  Side-by-side with the original: its course FILLS the screen, ours sat back with dead space.
  The marble is ~the same % of screen width in both, so the difference is the GRID:
  - **Measure by zooming, not autocorrelation.** A 3x crop of the original's floor shows one
    checker diamond ≈ **35 px of its 1100 px screen (3.2%)** and the marble ≈ **52 px (4.7%)** —
    so the marble is **1.5 cells across**. The 61 px autocorrelation period everyone reaches for
    first is a light-dark PAIR (two cells); reading it as one cell says 0.9 cells and makes the
    marble half size. I briefly shipped that error inside this iteration before re-measuring.
  - Ours was **2.1 cells** across with the camera pulled back 2.5x to compensate. Now:
    basis `14,7,-7,10 → 20,10,-10,14`, `AZ 16→23`, marble `r 1.05→0.75`. Marble = 4.7% of a 640px
    canvas and a cell = 3.1% — both match the original.
  - This is why course "necks" kept needing widening: the marble was ~40% too fat for its grid.
  - Verified after: all six render; practice/beginner/silly reach goal with **0 deaths**;
    intermediate and aerial reach goal with the terrain follower; **ultimate needs a moderated
    throttle (0.55)** — flat-out down its terraces shatters the marble on the accumulated drop,
    which is the documented "big drops smash the marble" rule doing its job. Trap sweep clean.
  - `drawMarbleG` now sizes the marble from `AXx` rather than a hardcoded 14.
- **2026-07-28 iteration 49 — scale correction INDEPENDENTLY VALIDATED; drive attempt blocked again.**
  - **Validation**: with both games now at the same cell size, feature geometry is directly
    comparable. The span from the leftmost to the rightmost bright-red arch structure on the
    practice opening measures **21.4 cells in the original vs 21.0 in ours** — so v0.46.0's basis
    (20 px/cell) and marble radius (0.75) are right, confirmed against the original's own layout
    rather than against my earlier ambiguous autocorrelation.
  - **A WORKING MARBLE DETECTOR for reference captures** — `game-refs/tools/find_marble.py`.
    Earlier attempts failed because the arch gates and striped walls are also red+yellow. The
    discriminator that works: a compact red blob **carrying olive-yellow patches AND ringed by
    open grey floor** (sample a circle at radius 42 px; require >50% plain grey). Validated on
    four captures; returns the marble's screen position and an isolation fraction.
  - **Driving the original is still blocked.** With the detector working, a clean 4-direction map
    was attempted: the first hold moved the marble a long way down-left, then it wedged and stopped
    responding. A sustained Up+Right drive produced **0% frame change over 9 s — the emulator had
    frozen** (HUD still drawn, clock not ticking). Restart the rig with `tools/start-rig.sh` and
    re-boot before any further attempt. The dead-end verdict stands.
- **v0.47.0 (2026-07-28) — marble size corrected AGAIN; use a BASIS-FREE ratio.**
  v0.46 sized the marble from "cells across", which silently depends on the original's projection
  basis. **I cannot measure that basis reliably** — decomposing screen offsets of the three arch
  structures into (dv,du) gave nonsense (left arch dv=-3.6, right dv=+9.4, i.e. wildly asymmetric
  about a marble that sits between them), because it assumes proportions I do not know.
  **The measure that needs no basis: marble diameter ÷ checker-diamond WIDTH, both in pixels.**
  - original: 52 px marble / 35 px diamond = **1.49**
  - ours at v0.46 (r=0.75): 30/30 = 1.00 → too small; at v0.45 (r=1.05, old zoom): 29.4/21 = 1.40
  - now r=**1.12**: 44.8/30 = 1.49 ✓
  So the pre-v0.46 marble was nearly right all along and v0.46 shrank it by a third. The ZOOM part
  of v0.46 (basis 14→20 px) stands — the side-by-side clearly showed the original's course filling
  the frame while ours sat back.
  **Evidence it is now right: the full six-race playthrough completes again (7 deaths, best yet);
  with r=0.75 it failed at the final race.**
  **RULE: when comparing against the original, prefer ratios between two things visible in the
  SAME screenshot. Anything requiring the original's projection basis is guesswork.**
- **v0.48.0 (2026-07-28) — marble size SETTLED: use SCREEN FRACTION. Three wrong answers first.**
  Measured on the original: the marble is **55 px of its 1100 px screen = 5.0% of screen width**.
  | version | metric used | r | % of screen | verdict |
  |---|---|---|---|---|
  | v0.45 | (inherited) | 1.05 @AXx14 | 4.59% | ~right by luck |
  | v0.46 | "cells across" (1.5) | 0.75 @AXx20 | 4.69% | ~right, wrong reasoning |
  | v0.47 | marble ÷ diamond width (1.49) | 1.12 @AXx20 | **7.00%** | WRONG |
  | v0.48 | **screen fraction (5.0%)** | **0.80** @AXx20 | 5.00% | ✓ |
  **Why the cell-relative metrics fail: the original's grid is FINER than ours** (its course is
  more, smaller cells), so the same marble legitimately spans a different number of cells/diamonds.
  Only a fraction of the screen — what the player actually sees — is comparable between two games
  with different grid resolutions.
  Also derived (for reference, do NOT build on it): if the original's floor diamond really is one
  cell with axis-aligned diagonals 35 x 17.3 px, its basis would be AXx=17.5, AXy=8.65,
  AUx=-17.5, AUy=8.65 — a symmetric 2:1 isometric grid, i.e. a SHALLOWER down-course axis than our
  (-10,14). Unverified; our steeper axis is a deliberate deviation unless a better measurement
  turns up.
  Verified at r=0.80: bots reach every goal with **0 deaths**, full six-race playthrough reaches
  the ending, trap sweep clean.
- **2026-07-28 iteration 52 — reference-measurement tooling hardened; physics measurements
  RE-EXAMINED and found sound.**
  - **`read_clock.py`** (new): OCRs the HUD clock from a reference capture by matching the measured
    `HUD_FONT` glyphs. Validated on three captures. **This gives a GAME-time base**, so speed can be
    measured in px per game-second with no dependence on the emulator's ~0.76x wall-clock rate.
  - **`find_marble.py` had a false positive that took three discriminators to kill.** The corner
    where a red arch gate meets a striped wall is red + yellow + marble-sized + circular + ringed by
    grey floor — it passes every obvious test. What separates them: **on the marble the yellow
    patches are ENCLOSED by red in all four directions; on the arch corner the yellow lies beside
    the tube.** The detector now requires isolation > 0.45, a 30-80 px roughly-square red extent,
    AND four-way red enclosure.
  - **Did that false positive corrupt the v0.29-v0.31 physics constants? No.** Those measurements
    used frame-DIFFERENCING against a parked reference frame, not this detector — and on the fixed
    opening screen the ONLY thing that moves is the marble, so the changed-pixel cluster is the
    marble by construction. The acceleration / top-speed / reversal numbers stand.
  - Driving the original remains impossible: the marble was undetectable in 6 of 8 frames because
    it wedges against the course edge off-view, while the clock ticked normally (57→48).
- **2026-07-28 iteration 53 — BREAKTHROUGH: the original CAN be driven. `Down` is down-course.**
  Every earlier attempt (iterations 25, 26, 49) concluded "the camera never scrolls" and wrote the
  course-mapping off as a dead end. **That conclusion was wrong.** Those runs used `Up`, `Left`,
  `Right` and diagonals; they also trusted a marble detector that was locking onto an arch-gate
  corner, so a stationary false positive made it look like nothing moved.
  With `hold Down` in 2.5 s bursts from the practice start: the marble travels from (672,288) to
  (168,576) and onward, and **the frame changes 32%, 36%, 42% between bursts — the view scrolls.**
  A longer 6 s hold moved it 606 px and revealed terrain not visible at the start (new yellow
  striped walls along the bottom, the centre structure risen up the screen).
  **This reopens course mapping** — the biggest remaining parity gap. Recipe: boot, GO!, then
  repeated `mm_ctl.py hold Down 2.5` + `shot`, and stitch the captures.
  - `find_marble.py` now needs all three discriminators (isolation, marble-sized roughly-square red
    extent, four-way red enclosure of the yellow) or the arch corner wins.
  - **`read_clock.py` is NOT trustworthy yet**: this font's `0` and `8` differ by one or two pixels
    at the glyph edges, and it reads `06` as `86`, `60` as `68`. Sub-sampling did not fix it. If
    game-time is needed, enforce monotonic countdown across a sequence rather than trusting a
    single frame. The earlier "24 game-seconds in a 6 s hold" reading is therefore UNRELIABLE — do
    not conclude anything about the original's clock rate from it.
- **v0.49.0 (2026-07-28) — FIRST CAPTURE OF THE PRACTICE COURSE BEYOND ITS OPENING.**
  Using the new recipe (boot → GO! → repeated `hold Down 2.0` + `shot`) a run yields **3-4 distinct
  screens** before the marble dies; archived in `ref-shots/map-01,03,04.png`.
  What screen 2 (`map-04`) shows, and how our build compares:
  - the centre twin-peak structure with its stepped platforms, now mid-screen — **matches** our
    opening island;
  - a wide plain below it with **white-tipped pyramids at the bottom-left and bottom-right** —
    **matches** our `pyramid(5,21)` / `pyramid(17,21)`;
  - side walls that are YELLOW-striped on the left and RED-striped on the right (we use one ramp
    for both — a known, unfixed difference);
  - **painted arrows FLANKING the centre structure and angled OUTWARD** (down-left / down-right) to
    steer you around it. Ours pointed straight down-course → fixed: `floorArrow()` takes a `turn`
    angle and a pair now sits at (6.5,13) −0.62 rad and (16.5,13) +0.62 rad.
  **Encouraging for the biggest caveat in this project**: the NES-map-derived layout for this
  section is broadly RIGHT — the structure and the flanking pyramids are where the original has
  them. Mapping runs are cheap now; each yields a few screens, so several runs per course.
- **2026-07-28 iteration 55 — mapping run FAILED; the rig needs a real state check.**
  Two attempts to capture more of the practice course produced nothing usable:
  - Run 1: the **GO! click silently did not register**, so the game sat on the options menu for the
    whole run. Every frame differed by ~70% — that is just the menu title's letters COLOUR-CYCLING,
    which is easy to mistake for the course scrolling.
  - Run 2: I added a "did the race start?" check, it passed, and the run still produced nothing —
    because **the game had quit back to the Amiga Workbench** and my check only asked "is this the
    grey menu?", so a blue Workbench screen counted as RACE.
  - New `tools/screen_state.py` classifies **WORKBENCH | MENU | RACE | TITLE | BLACK** from colour
    fractions (blue-dominant → Workbench; >55% dark + some red → title; >50% mid-grey → menu).
    Validated on captures of each. **Use it before and during every mapping run**; a run that
    silently drives a dead session wastes ~8 minutes.
  - Unexplained: what made the game exit to Workbench mid-session. Watch for it; re-boot when the
    state check reports WORKBENCH.
  Lesson worth keeping: **a uniform ~70% frame-change every frame is a flashing/cycling screen, not
  motion.** Real scrolling gives irregular changes (32%, 36%, 42%, 0%...).
- **2026-07-28 iteration 56 — mapping rig hardened; capture is no longer the bottleneck, CONTROL is.**
  - **`tools/map_run.py`** — one command drives a whole mapping run with every stage guarded by
    `screen_state`. It resumes from ANY starting state (Workbench / title / menu / mid-race), and
    it **detects the GO! click failing** (it silently fails often — roughly one attempt in two) and
    retries up to 3 times. Optional lead-in inputs: `python3 map_run.py <prefix> Right,Right`.
  - **`tools/record_run.sh`** — records the Xvfb display with ffmpeg (10 fps, x264). Screenshots
    cost ~1.5 s each, which is far too slow to see a marble that crosses the screen in a second;
    video gives every frame. A 30 s recording of a fresh race yielded 6 frames of genuine
    scrolling transition where screenshot bursts had given 2. **Wait for ffmpeg to finish before
    extracting** — my first extraction ran against a half-written file and found nothing.
  - **The real blocker is now steering, not capture.** Driving straight Down from the practice
    start shatters the marble on the centre structure EVERY time; the course's own painted arrows
    say the route goes around it. Open-loop bursts cannot steer that. Closed-loop control from the
    marble detector is not viable either — a screenshot round-trip is ~1.5 s and the marble moves
    most of a screen in that time. A future attempt needs to drive from the VIDEO stream (decode
    frames live) or accept that only the first two screens are reachable this way.
- **v0.50.0 (2026-07-28) — cliff stripes now shade across the course.** Observed in the reference
  captures of practice section 2: the walls read YELLOW-first on the left of the course and
  RED-first on the right. Ours used one stripe order everywhere. `stripeWall()` takes the cell's
  `v` and rotates `PAL.stripes` by `round(v/CV*(n-1))` when the palette sets `stripeShift`
  (practice only; the blue races have no evidence for it).
- **MAPPING THE ORIGINAL'S COURSES IS PAUSED (after iterations 53-56).** State of play:
  capture is solved (`map_run.py` guards every stage, `record_run.sh` records at 10 fps);
  **steering is not**. Straight-down driving shatters the marble on the practice course's centre
  structure every time, and the route around it needs real control. A screenshot round-trip is
  ~1.5 s, during which the marble crosses most of the screen, so closed-loop steering from stills
  cannot work. **Unlock condition: drive from the decoded VIDEO stream** (live frame decode +
  marble detect + input at ~10 Hz). Until then only the first two screens of a course are
  reachable, and both are already captured in `ref-shots/`.
  Game-side work has a much better return per iteration — prefer it unless that unlock is built.
- **v0.51.0 (2026-07-28) — the options screen now uses the ORIGINAL'S LETTERFORMS.**
  Extracted **36 glyphs** from `captures/m2-06.png` by walking each menu row against its known
  text and assigning column-groups to characters (the instruction block's four lines all matched
  exactly: 20/19/12/22 glyphs). Saved as `menu_font.json` / `menu_font.js`; embedded in the game as
  `MENU_FONT` (~4 KB) with `menuText()`. Proportional — each glyph carries its own width.
  - `N`, `b`, `F`, `K` never appear on that screen, so unknown characters fall back to Courier
    **per character**; at this size the weights match and the line still reads as one font.
  - Extraction gotcha: a row whose value sits far right (e.g. `Number of Players:  1`) yields one
    extra column-group, and some glyphs split into two runs — check `len(groups)==len(text)` before
    trusting an assignment.
  - Verification gotcha: **at low zoom this font is easily mistaken for Courier.** I twice judged
    the render "still Courier" from a full screenshot; a 4x crop shows the blocky pixel
    construction plainly. Crop before concluding.
- Viewport sweep (320x480 up to 2560x1080, six shapes): no overflow, canvas never collapses,
  8:5 aspect held in every case, no exceptions.
- **v0.52.0 (2026-07-28) — the measured letterforms now cover the IN-GAME text too.**
  Nine more glyphs (`T E F N H A C 4 5`) extracted from the pre-race banner capture
  (`captures/d0-start3.png`, banner rows at Amiga y101-109 and y111-119 — both matched their
  character counts exactly). Font is now **45 glyphs**; `TIME TO FINISH / <RACE> RACE: <n>` and the
  `OUT OF TIME / GAME OVER` panel render with it.
  - Still missing `U V Y K Q W X Z` (they never appear on a captured screen). Those fall back per
    character — but the fallback is now **sized by CAP HEIGHT** (`fontsize = 8*scale/0.63`,
    baseline at `y+8*scale`) instead of an eyeballed factor, so the substituted letters no longer
    stand out as smaller. Before the fix the `U` in "OUT" and `V` in "OVER" were visibly undersized.
  - Row-detection gotcha: scanning a capture for "text rows" also finds the HUD, which shifts the
    pairing of rows to expected strings. Target the known y-ranges instead of zipping blindly.
- **v0.53.0 (2026-07-28) — ONE FONT THROUGHOUT.** The prominent in-play messages (death notices,
  `RACE COMPLETE!`, `PAUSED`, `GREAT SCORE!`, the ending) now use the measured letterforms as well,
  so the game no longer mixes two typefaces. The original uses one face for everything; mixing was
  itself a fidelity gap even for strings the original never shows.
  - **`menuFit()`**: the measured font is PROPORTIONAL and much wider than Courier at the same
    nominal size, so fixed scales overflowed the 640px canvas ("CONGRATULATIONS!" at scale 4 needs
    ~640 px). `menuFit` steps the scale down until the string fits a given width. Use it for
    anything longer than a few characters.
  - The ending screen also gains a backing panel — it draws over live course terrain and the white
    subtitle was unreadable against the checkerboard.
  - Small text (hi-score table, control hints) deliberately stays in Courier: at scale 1 the pixel
    font is illegible.
- **v0.67.0 (2026-07-28) — both palettes snapped onto the Amiga grid; a v0.62.0 reading undone.**
  With the 4-bit finding in hand, every palette constant was checked against it.
  - **PAL_AMIGA's greys and rail were already exact** (`#dddddd` `#cccccc` `#bbbbbb` `#dd3333`) —
    they came from careful measurement. **The three stripe hues were not.** v0.62.0 recorded
    them off a capture as `#872021` / `#cb6500` / `#cacb00`; those snap to `#882222` / `#cc6600`
    / `#cccc00`, which is exactly what the palette held BEFORE that "correction". The emulator's
    scaling had shifted each channel by 1-2 and I wrote the noise down as the value.
    **Snap a sampled colour to the hardware's grid before believing its last digit.**
    (`arrow` likewise `#a72222` -> `#aa2222`.)
  - **PAL_BLUE was entirely off-grid** — no surprise, it came from photos of a printed box back.
    Rather than snap values that had already drifted, it is rebuilt from the box-back samples
    this ledger records — floors `#a8c0d8` / `#c0d8f0`, walls `#303060` / `#484878` — each taken
    to the nearest legal colour: floors `#ccddee` / `#bbccdd` / `#aabbdd`, walls `#333366` /
    `#444477`. Note the blue races' two wall hues are **both dark**: low contrast, unlike
    practice's yellow-against-dark-red. Different race, different scheme.
  - `stripeWall`'s orientation rule is now length-agnostic (`st[len-1]` for the lit orientation,
    `st[len-2]` as accent), so a palette can carry two hues or three.
  - Verified: six races, bots to every goal with 0 deaths, playthrough to the ending, traps clean.
- **v0.66.0 (2026-07-28) — AMIGA 4-BIT COLOUR: every drawn colour quantised to a multiple of 17.**
  Comparing floor histograms exposed something bigger than the floor. The reference's flat floor
  is dominated by FOUR hard values (187 21%, 153 16%, 102 12%, 221 9%); ours spread across a
  continuum with no value above 8%. Checking the top colours across two lossless frames:
  **`#999999` 13.3%, `#bbbbbb` 12.4%, `#666666` 7.7%, `#dddddd` 5.9%** — 39% of all pixels in
  four greys, and the **median channel error against the nearest multiple of 17 over the top 40
  colours is 1** (capture scaling noise). The Amiga is 4 bits per channel; every colour it can
  draw is a multiple of 17.
  Our BASE palette was already right — the shading was the problem: multiplying a correct colour
  by a continuous factor lands between palette entries, so hard steps became smooth gradients.
  - New `q17()` / `rgb17()`, applied in `shadeHex`, `topColor`, `wallColor` and both tinted-floor
    paths. Result: our floor histogram now peaks at 187 (25%), 221 (24%), 102 (10%), 119 (8%) —
    the same palette values, 67% of pixels in the top four against 35% before.
  - **The three-tone floor was a non-finding.** v0.65.0 noted 221/187/153 and wondered about a
    third checker tone. Sampling diamond centres along flat rows shows the tones are REGIONAL,
    not a 3-phase pattern: a 2-tone checker modulated by brightness, which is what we already
    do. No change needed — and the histogram, not the tone list, was the real signal.
- **v0.65.0 (2026-07-28) — CAST SHADOWS, a feature noted in iteration 21 and never built.**
  Mapping mean floor brightness in 60x50 blocks across a lossless capture shows blocks
  averaging **~51 grey right beside raised structures against ~155 for open floor** — the
  "hard #333 shadows" in the original palette notes are real cast shadows on the floor, and we
  drew none at all (only the marble's own ellipse).
  - `castShadow(v,u,c)` steps back along -v/-u and darkens the cell if anything up-light is
    tall enough to block it (`SH_LEN` 6 world units, `SH_TAN` 0.55, factor 0.55). It runs
    inside `prerender`, so it costs nothing per frame: all six races still sit at a 16.7 ms
    median with the same p95.
  - **A non-finding worth recording so it is not chased again**: what looked like a pale ramp
    upper-centre-right in the downscaled view is **plain floor**. Scanning for near-white pixels
    across the whole upper half returned nothing above 228 grey. Features spotted in a
    downscaled screenshot must be re-checked at magnification before being built.
  - The floor checker reads as **three tones plus a seam** — 221 / 187 / 153 with 102 seams —
    not two. Ours alternates two; worth revisiting.
  - The flanking "arch gates" are confirmed to be **railings that follow the platform corner**
    (a bend with a post at the low end), consistent with v0.60.0.
- **v0.64.0 (2026-07-28) — two more measured glyphs (U, V); the font's Courier fallback shrinks.**
  `MENU_FONT` was missing **K Q U V W X Y Z** — none appear on any captured screen, so they fell
  back to Courier per character. But **"OUT OF TIME" carries a U and "GAME OVER" a V**, so the
  GAME OVER panel yields two of the eight.
  - **It had to be a LOSSLESS grab.** Extracting from the h264 recording gave visibly fatter
    strokes — re-extracting letters we already had and diffing against the stored ones is the
    check that caught it. New `tools/grab_gameover.py` boots, starts a race, touches nothing and
    screen-grabs the panel; `tools/extract_glyphs.py` walks a row of known text and refuses to
    emit anything if the glyph count does not match the string.
  - **Two capture traps, both hit:**
    1. A "lots of yellow pixels" detector for the panel fired on a MID-RACE frame — the course's
       own striped walls are yellow. The panel is better found as a wide uniform grey run.
    2. A full-frame scan per poll was slower than the panel is on screen, so the first fixed
       detector walked straight past it. Probe a handful of pixels at the panel's measured
       location and poll tight instead.
  - Sampling: point-sampling cell centres landed on the edges of the display-scaled Amiga pixels
    and thickened strokes; a 3x3 majority vote per cell is stable. Validation: **86% pixel
    agreement** with the stored glyphs across every letter present in both.
  - The false-start capture is itself the **best lossless reference of the practice opening so
    far** (`captures/gameover-lossless.png` run, saved as the race view): flanking arch gates with
    striped wedges, the centre ziggurat, handrails, the scalloped far edge against black, and a
    pale ramp upper-centre-right that we do not have yet.
  - Still missing: **K Q W X Y Z** — no captured screen contains them.
- **v0.63.0 (2026-07-28) — stripe hue is set by wall ORIENTATION, correcting v0.62.0.**
  `captures/struct-full.png` (the whole centre structure at 2x) settles it: the structure shows
  BOTH hues on adjacent risers, which position-based colouring cannot produce. Faces pointing
  down-LEFT (the +u edge, parallel to +v) are **yellow**; faces pointing down-RIGHT (the +v
  edge) are **dark red**. Orange is an accent among the yellow at roughly 1 in 4, matching the
  measured 17% yellow to 6% orange.
  - **Why v0.62.0's position rule looked right**: the two big course-edge walls have opposite
    orientations AND sit at opposite sides of the course, so position and orientation predict
    the same colours there. Only a surface showing both orientations at once — the centre
    structure — distinguishes them. **A rule that fits the easy case is not confirmed by it.**
  - Also removed a brightness factor that was double-counting: `k=base<0.4?0.82:1` darkened the
    down-left faces, which turned the measured `#cacb00` yellow olive now that the hue itself
    encodes the orientation.
  - **Centre structure is a ziggurat**: added the missing middle step (`slab(10,8,13,11,13.05)`)
    between the base at 12.7 and the tier at 13.4, inside the existing footprint so the route is
    unchanged. The reference shows several descending steps where we had one.
  - Verified after the geometry change: six races, bots to every goal with 0 deaths, playthrough
    to the ending, traps clean on all six.
- **v0.62.0 (2026-07-28) — cliff stripes rebuilt from measurement; two wrong assumptions.**
  Reading colour RUNS along scanlines across the reference's walls (rather than histogramming
  the whole frame) shows what the stripes actually are:
  - bottom-left wall: `YELx18 greyx6 YELx21 greyx6 YELx22 ...`
  - bottom-right wall: `redx21 darkx6 redx22 darkx8 redx22 ...`
  - structure risers: `ORGx22 ... YELx22 ... redx18 ... ORGx2 YELx21`
  **So a wall face is ONE colour, not a cycle through the ramp** — long single-hue runs, with
  the hue set by position across the course (yellow left, orange middle, dark red right).
  v0.50.0's `stripeShift` rotated a 4-colour cycle, which still produced a 4-colour wall.
  **And the stripe period is ~26 px against a 30 px floor diamond — one stripe per diamond.**
  We drew `nStripes:8` per CELL, which after the GS=3 grid change worked out at about **1.3 px
  per stripe**: not stripes at all, just noise. Now one fill per cell face.
  - Measured hues replace the guessed ramp: **dark red `#872021`, orange `#cb6500`, yellow
    `#cacb00`**. The old `#aa2222` medium red is dropped — `#a82121` does appear in the frames
    but at 0.5% of saturated pixels, which is rail shading, not a stripe colour.
  - **Method note: histograms answered the wrong question.** Counting colours over two whole
    frames gave proportions (dark red 32%, yellow 17%, orange 6%) that suggested a weighted
    ramp. The run-length scan showed the truth — the proportions come from how much WALL of
    each colour is on screen, not from any per-wall sequence. Read runs, not histograms, when
    the question is "what is the pattern".
  - Verified: six races, bots to every goal with 0 deaths, playthrough to the ending, traps clean.
- **v0.61.0 (2026-07-28) — steep faces now shade HARD, as the original's do.**
  `captures/struct-ref.png` (the centre structure at 2x) shows the cone flanks going
  near-black on the shaded side while the lit side keeps the floor checker. Ours were flat
  white spikes: the slope shading was +/-10-15%, nowhere near enough for a face that steep.
  - New `hardShade(c)` multiplies the cell's brightness by a term driven by the +v slope.
    **The knee is the important part**: `steep = max(0, -sv - 0.45)` means gentle down-slopes
    are left completely alone, so the wide plain and the ramps do not band — only genuinely
    steep faces darken. Darkening is much stronger than brightening (0.80 vs 0.10), matching
    the reference, where the lit side is barely brighter than flat floor but the shaded side
    is dramatically darker.
  - Still lighter than the original's near-black; the character is right and the floor is
    untouched, which was the constraint. Worth another pass once a cleaner cone capture exists.
- **v0.60.0 (2026-07-28) — handrails beside the centre structure; a harness trap that nearly
  caused a wrong "fix".**
  - **HARNESS TRAP — our screenshots have a TRANSPARENT background.** Comparing our section 2
    against the reference, everything outside the course was WHITE in ours and BLACK in the
    original, which reads as an obvious palette bug. It is not: `render()` starts with
    `clearRect`, so the canvas is transparent there and the near-black CSS background
    (`#04050c` on the canvas element) shows through in a browser. `toDataURL('image/png')`
    keeps the transparency and the image viewer paints it white. **Never judge background or
    void colour from a canvas screenshot** — check the CSS, or composite before comparing.
  - **The elements flanking the centre structure are HANDRAILS, not arch gates.** Magnified,
    they are a straight shaded red tube running parallel to the platform edge with a short
    vertical post at its low end — no span, no arch. New `railing(g,ox,oy,v0,u0,v1,u1,hgt)`
    draws that (same tube shading as `archGate`: dark outline, red body, pale highlight), and
    the practice course now carries one along each side of the centre structure. Arch gates
    still exist elsewhere on the course; the two are different pieces of furniture.
  - Still UNIDENTIFIED: a small red object at the bottom centre of `rec/r1-last.png`, cut off by
    the frame edge. Three stacked red blocks. Do not guess at it — it needs a capture where the
    camera has scrolled far enough to show it whole.
  - Verified: six races render, bots reach every goal with 0 deaths, playthrough reaches the
    ending, trap sweep clean.
- **v0.59.0 (2026-07-28) — floor arrows corrected from the best capture yet of section 2.**
  Scored drive routes (score = 10 pts per unit of forward progress, so it ranks routes):
  | route | score |
  |---|---|
  | `Down` throughout | 220 |
  | `Down` 2s, `Down+Right` 2s, then `Down` | **250** |
  | `Down+Right` throughout | 120 |
  **A hypothesis worth recording as WRONG**: the isometric finding suggested the joystick is
  rotated 45 degrees to the screen, so down-course should be `Down+Right` held together. It is
  not — that route scores barely half of plain `Down`. `Down` is the down-course direction; a
  brief `Right` correction early helps, sustained `Right` hurts.
  Also: **route A ended with 32 s STILL ON THE CLOCK** — it ran out of SCRIPT, not time. Scripts
  must cover ~55 s of holds, not ~27 s. Extending it did not beat 250 though; the marble dies at
  the centre structure either way, so ~250 is the open-loop ceiling.
  - **`rec/r1-last.png` is now the best reference for practice section 2** (score 250, clock 32,
    marble alive): the twin-peak centre structure with its red arch and striped stepped tiers,
    flanking arch rails, the descending channel with a YELLOW-striped wall left and RED right,
    both white-tipped pyramids, and a small red post at the bottom centre (unidentified).
  - **The painted arrows were wrong in two ways**, both fixed:
    1. **Shape** — they are a SINGLE LONG arrow with one head laid along a grid axis, not the
       twin chevrons we drew. Length ~21.6% of screen width (~6.2 cells), so `floorArrow` takes
       a `len` and defaults to that instead of 4.2.
    2. **Direction** — the pair beside the centre structure **CONVERGES** (left points down-right,
       right points down-left), funnelling you back to the middle once past the structure.
       v0.49.0 read them as angled OUTWARD and implemented the opposite sign.
  - Verified: bots reach every goal with 0 deaths, playthrough reaches the ending, traps clean.
- **v0.58.0 (2026-07-28) — GAME OVER panel measured from a real one; driving the original revisited.**
  - **Driving is not a dead end, but straight down is.** With the pointer fix from iteration 61 a
    race now starts reliably, so scripted drives are cheap. The HUD SCORE is the fitness function
    — the original pays 10 points per unit of forward progress, so a higher final score means the
    marble got further, and it is readable straight off the recorded HUD strip.
    - 12 s of `Down` -> **100 points**; 30 s of `Down` -> **220 points**, then the score plateaus
      and the clock runs out. A full frame at the plateau shows the marble SHATTERED just left of
      the twin-peak centre structure, with the debris still on screen.
    - So the ~220 ceiling is the centre structure, exactly as the course's own outward-pointing
      arrows warn. `drive_try.py <tag> "Down:3,Down+Left:2,..."` runs any sequence and leaves HUD
      strips at intervals, so a route can be scored and compared. Next step is a route that
      goes AROUND the structure rather than into it.
    - Worth knowing: 220 points scrolled the camera about half a screen past the start, so even a
      failed run maps new ground. Mapping does not need a completed race, just a better route.
  - **The GAME OVER panel, measured off `rec/t2-full01.png`** (a real out-of-time): panel
    x358-907, y586-828 in `#989898` — the same grey as the pre-race banner; two lines of dull
    yellow `#c1c114` with tops at y694 and y762, centred on x~287, i.e. **noticeably LEFT of the
    screen centre and low down**. Ours was a centred box in the upper-middle at `#999999` with
    `#cccc00` text at scale 3. Now `fillRect(123,264,317,124)` with both lines at scale 2.
    The original's panel carries ONLY those two lines — no score — because the score stays in the
    HUD, which is still drawn. Our `FINAL SCORE` line is gone for that reason; the 2P score line
    (our own addition) moved inside the panel.
  - Line pitch here is 34.7 canvas px against a 14.3 px glyph — a wide gap, unlike the pre-race
    banner's tight 18/16. The two panels do not share a layout; measure each one.
- **v0.57.0 (2026-07-28) — the floor lattice MEASURED numerically; v0.56.0's target was 16% wide.**
  Two independent methods now agree on the original's floor diamond, replacing every hand count:
  - **2-D autocorrelation of the seam mask** over a clean floor patch returns lattice offsets
    `(30,-15)` and `(31,+15)`. Those are the HALF-diagonal translations doubled — the true
    fundamental translation `(15,7.5)` has a non-integer dy, so the strongest integer peak sits at
    twice it. Diamond = **30 px wide x 15 px tall** in the 1110 px screen.
  - **A rendered mask overlay** (`captures/mask.png`, red = matched pixels) confirms the mask
    traces the seam lattice itself and not the dark tiles, and counting it gives ~10 diamonds per
    300 source px = 30 px. Same answer, different method.
  So the original's diamond is **2.70% x 1.35% of screen width, symmetric 2:1**. v0.56.0 aimed at
  3.15% from a hand count of "~35 px" and landed at 3.13% — **16% too wide**. Ours is currently
  3.13% x 2.50%, so it is somewhat too wide and badly too TALL (1.25:1 against the original's 2:1).
  - **The width cannot be fixed on its own.** Narrowing the basis to hit 2.70% while leaving the
    vertical alone would take the tile to 17.3 x 16 — very nearly square, which reads WORSE than
    today's 1.25:1. Width and aspect have to move together.
  - **And the aspect cannot be fixed without re-authoring the courses.** A symmetric diamond
    requires mirror-symmetric axes (`AX=(a,b)`, `AU=(-a,b)`), which forces +u to point down-LEFT
    at 26.6 degrees. Our courses are long strips along +u, so they would run off the side of the
    screen instead of descending. In the original, down-course is plainly straight down the
    screen, which under symmetric axes is the grid DIAGONAL — i.e. its courses are authored on
    the diagonal and ours are not. Rotating at build time does not dodge this: the checker and
    the heightfield have to share a lattice or cliffs stop landing on tile edges, so the
    heightfield would have to be resampled, which is re-authoring by another name.
  **Conclusion: basis scale + axes + course authoring are ONE job, not three.** Do not touch the
  basis piecemeal. The correct end state is `AX=(13.0,6.49)`, `AU=(-13.0,6.49)` with the marble's
  `r` raised to keep it at the measured 5.0% of screen width, and all six courses laid out along
  the grid diagonal.
  - Shipped this iteration: **polka-dot density restored.** `dots` hashed per CELL, so v0.56.0's
    finer grid made them GS*GS = 9x denser on the Silly surfaces. Now one dot per WORLD unit,
    drawn on that unit's anchor cell. Bots, playthrough and trap sweep all still clean.
- **v0.56.0 (2026-07-28) — THE GRID IS NOW AS FINE AS THE ORIGINAL'S, with zero gameplay change.**
  The heightfield is 3x denser (`GS=3`) and the checker diamond is drawn per 2-cell TILE
  (`TSZ=GS/1.5`), which lands it at 2/3 of a world unit = 20 px = 3.13% of screen width.
  **The 3.15% target was itself wrong — see v0.57.0; the measured figure is 2.70%.** Verified by cropping the same 18%-of-screen-width band from ours
  and from the reference at matching magnification and counting: ~6 tiles vs ~5.75.
  - **The whole change is confined to the cell grid.** World units are untouched, so physics,
    the marble, hazards, course coordinates, the QA hooks and every bot waypoint keep working
    exactly as before. The world->cell conversion lives in precisely two places: `groundH()` and
    the renderer (`pX`/`pY`). Builder ops map world ranges to cell indices via `gi`/`ge`.
  - **WHY GS MUST BE AN INTEGER — the failed first attempt.** The obvious reading of "1.5x finer"
    is `GS=1.5`, scaling the world itself. That was built and it broke two of six races. Two
    separate reasons, both worth remembering:
    1. **Scaling the world leaks everywhere.** Bot waypoints, QA warps and every authored
       coordinate are in world units; multiplying the world by 1.5 invalidates all of them. The
       grid density is a RENDERING property and must not escape the renderer.
    2. **1.5 cannot preserve course edges.** `round(v*1.5)/1.5` returns v only for even v, so
       every feature edge at an odd coordinate shifts by up to 1/3 of a unit. A terrain diff
       against the previous build showed 16-37 solid/void flips per race and height differences
       up to 4.48. With `GS=3` the same diff shows **0 solid/void mismatches** in all six races
       and a worst height difference of 0.70 (from the pyramid rewrite alone).
    Tile size and terrain resolution are INDEPENDENT — that is what makes an integer GS work:
    take the exact-mapping density you need, then draw the diamond at whatever multiple of it
    matches the measurement.
  - `pyramid()` was a fixed 2x2-cell footprint; it is now a cone over the scaled block so the
    peak keeps its physical size instead of shrinking as the grid gets finer.
  - The occlusion window in `redrawFront` was expressed in CELLS (`mu+4`); at GS=3 that reached
    only 1.33 world units instead of 4, so it is now `4*GS`.
  - `tex:'check'` floors subdivided each cell 2x2 for a finer texture; with the denser grid that
    became 6 tiles per world unit, so they now use the same measured diamond as every other floor.
  - **Performance is unaffected** despite 9x the cells: all six races still sit at a 16.6-16.7 ms
    median. The per-cell cost is in `prerender`, which is once per race load; the per-frame cost
    is the prerendered blit.
  - Verified: bots reach every goal with 0 deaths, full six-race playthrough reaches the ending,
    trap sweep clean on all six, fuzz clean, states clean.
- **STILL OPEN on the grid: the AXES.** The original is a symmetric 2:1 isometric (both floor
  axes +/-17.5, +8.65) so its diamonds are 35 x 17.3; ours is `AX=(20,10)`, `AU=(-10,14)`, which
  renders tiles closer to squares than diamonds. The SIZE now matches; the SHAPE does not. That
  is a basis change affecting camera lookahead, wall faces, occlusion order and `BASIS_FLIP`,
  and it should be its own iteration.
- **v0.55.0 (2026-07-28) — the floor grid MEASURED properly, and a canvas-height bug from v0.54.0.**
  - **THE CANVAS IS 640x400, NOT 640x480.** Every y in v0.54.0's banner geometry was converted
    against 480, so the whole panel sat ~20% too low. Fixed: panel `(33,139,577,68)`, line tops
    158/176, number left edge 515. Correct fractions are **x/1110*640 and y/784*400**. The only
    other `480` in the file is an unrelated random range — nothing else was affected.
  - **The original's floor diamond is 35 x 17.3 px in its 1110x784 screen** (3.15% x 2.2% of the
    screen) — measured by cropping exactly 200 source px of clean floor at 4x and counting, which
    matches the figure derived independently back in v0.48. Ours is 30 px wide on a 640 canvas
    (4.69%). **The original's grid is ~1.5x finer than ours** — not the 2.3x claimed last
    iteration, which was an eyeball error (see the retraction above).
  - **It is also a different SHAPE.** 35 x 17.3 with symmetric diagonals means the original is a
    standard 2:1 isometric grid: both floor axes are (+/-17.5, +8.65), so down-course is the
    on-screen DIAGONAL. Ours is `AX=(20,10)`, `AU=(-10,14)` — a much steeper, narrower
    down-course axis. v0.48 flagged this as "a deliberate deviation unless a better measurement
    turns up"; this is that measurement.
  - **Measurement method that finally worked, after autocorrelation, edge-spacing and peak-finding
    all gave contradictory answers (2.7%-5.5% on the same image):** crop a known number of source
    pixels of clean floor at 4x and count tiles by eye. Statistical estimators are defeated here
    because the tiles carry internal dither, the lattice has half-pitch minima where diagonal
    neighbours touch, and sloped surfaces foreshorten the pitch. **Do not trust a pitch number
    that was not read off a magnified crop with a known ruler in it.**
  - Also re-confirmed **the marble is correct**: ours draws at `r*AXx` = 0.80*20 = 16 px radius,
    32 px across a 640 canvas = 5.0%; the reference's is 54 px of 1110 = 4.9%. An earlier reading
    of "ours is 52 px / 8.1%" was a red-pixel scan catching the striped wall behind the marble.
- **NEXT BIG ITEM — rebase the projection on the measured isometric grid.** Two coupled changes:
  shrink the cell so it lands at ~3.15% of screen width, and move to the symmetric 2:1 axes. Both
  require multiplying every course builder's cell coordinates to preserve the physical layout, and
  the basis shape change also affects camera lookahead, wall faces, occlusion order and `BASIS_FLIP`
  for Silly. Real regression risk across all six courses — give it its own iteration, and do the
  SCALE first (cheap to verify: one number, courses scale uniformly) before the AXES.
- **v0.54.0 (2026-07-28) — THE DIFFICULTY CURVE AND THE RACE-START PRESENTATION, BOTH MEASURED.**
  Four races run on the real Amiga with the menu digit verified in the same boot, each recorded at
  10 fps across the GO! press so the clock could be read from the first frame of the race.
  - **Difficulty -> practice-race clock: d0 60, d4 60, d5 60, d6 50, d7 45.** The option does
    NOTHING to the clock until the top two levels, where it bites hard. Our invented smooth ramp
    (`base*(1-0.0357*d)`) is replaced by `DIFF_SCALE=[1,1,1,1,1,1,50/60,45/60]` applied to every
    race's base time. d1-d3 are unmeasured but bracketed by measured 60s on both sides.
    Applying the practice RATIO to the other five races is an assumption, not a measurement.
  - **The clock FILLS IN at the start of a race** — it does not simply appear. White digits step
    up by **+5 every 0.2 s** from 00 to the allowance, hold ~0.35 s, then turn red and start
    draining. Implemented as `countUp()`/`countUpTime()`; the `ready` state now lasts exactly as
    long as the fill instead of a flat 1.5 s.
  - **The marble is NOT drawn during the fill.** Held off until the clock goes live.
  - **Banner geometry measured** off the same capture (screen area x144-1254 / y68-852 of a
    1440x1080 grab): panel x201-1202 y340-474 in `#989898`; `TIME TO FINISH` top y378 centred
    x360-887; `<RACE> RACE:` top y408 spanning x399-914; the number's left edge x1038 in the HUD
    digit font (its `0` carries the same notch as the HUD's). Neither line is centred on the
    panel — line 2 sits ~19 px right of line 1. Ours was too high, too narrow and centred.
  - New QA hook **`__qa.ready(i)`** — `start()`/`loadRace()` force `state='race'` so bots don't
    burn steps on the presentation, which also made it untestable. `ready(i)` keeps it.
  - `menu.mjs`'s turbo check reported **+0% for years** because it measured DISTANCE from the
    practice start, where the centre structure blocks the marble either way. Rewritten to measure
    PEAK SPEED on open ground: 6.99 -> 9.10, +30%, matching `TURBO_SP=1.32`. Turbo was never broken.
- **2026-07-28 iteration 61 — THE RIG'S POINTER WAS AIMING AT THE WRONG THING (root cause of the
  flaky GO! click).** `mm_ctl.find_ptr()` looks for RED pixels that differ from a reference frame.
  That is right on the Workbench (red arrow pointer) and wrong on the game's own screens:
  - the options-menu cursor is a **YELLOW marble** `#cccc00`, which `find_ptr` can never see;
  - the menu title's letters **colour-cycle**, and on their red phase `find_ptr` locked onto the
    TITLE BAR instead, so every "aim" computed a wild correction and drove the cursor into a
    screen corner — from which a click often landed on GO!. That is the "GO! silently fails about
    half the time" behaviour logged since iteration 55, and it also silently ignored every attempt
    to change a menu setting.
  - **`find_marble_cursor()`** finds the yellow marble ABSOLUTELY (nothing else on that screen is
    yellow; skip rows above y=112 for the cycling title bar) — no reference frame, no dead
    reckoning. New **`mm_ctl.py gotoy X Y`** uses it.
  - **The game's screen scales mouse motion ~6x more than the Workbench does**: 3.71 px/unit
    across and 3.59 down vs the Workbench's 0.577/0.947. `gotoy` starts from those and
    **recalibrates from its own observed move each iteration**, ignoring an axis that clamped at a
    screen edge, so a wrong constant costs one iteration rather than the whole run.
  - New tools in `game-refs/tools/`: `diff_probe.py` (boot -> set difficulty -> GO! -> capture),
    `clock_probe.py` (record across GO!, extract HUD strips — screenshots at ~1.5 s each are far
    too slow to catch a 2 s count-up), `set_diff.sh` (cycle the row N times and crop the digit),
    `countup_test.py`, and `crop.py` (crop the same rect from many captures into one stacked PNG —
    the fastest way to read a sequence of digits in a single look).
  - `ffmpeg` is at `/usr/bin/ffmpeg`, NOT in `tools/opt/usr/bin` (that holds only fs-uae, xdotool,
    Xvfb). `record_run.sh` gets away with it via PATH; a hardcoded `{BIN}/ffmpeg` does not.
- **~~BIGGEST REMAINING LOOK GAP: OUR GRID IS ~2.3x TOO COARSE.~~ RETRACTED — the factor is ~1.5x,
  see the v0.55.0 entry.** The 2.3x came from eyeballing screen-width percentages off two images
  displayed at different scales, which is exactly what this ledger tells you not to do. Kept here
  because it was stated to the user.
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
> **⚠ CLOUDFLARE DOES NOT DEPLOY ON PUSH.** Step 2's deploy script is not optional. Iterations
> 58-60 skipped it; 0.58 and 0.59 went live anyway because another process happened to deploy
> them, so the omission was invisible until 0.60 sat at the old version for half an hour with
> the commit correctly on `origin/main`. **A green push and a live site are different facts —
> verify the live version every iteration.**
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
