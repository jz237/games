# Marble Madness (Amiga) — clean-room recreation: parity ledger

Loop-maintained ledger. Target: feature parity with the Amiga (EA/Ariolasoft, 1986) version of
Marble Madness as an all-original clean-room browser build (no ripped code/art/sound/ROM data).
**Read this file first each iteration.**

- **Live**: https://jez237.com/games/2026-07-13/marble-madness/ · GitHub mirror: https://jz237.github.io/games/2026-07-13/marble-madness/
- **Source of record**: `games-source/2026-07-13/marble-madness/` (= checkout of the public `jz237/games` repo — COMMIT after every iteration, see Deploy). Deploy copy: `jez237-website/games/2026-07-13/marble-madness/index.html`.
- **Current version: v0.17.0** (single self-contained index.html, `const VERSION` near top).

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
- Emulation: `fs-uae` is in apt (3.1.66, not yet installed); IPF needs the capsimg plugin
  (may need separate fetch; CDN-blocked sources are common — Wikimedia-style API endpoints work).
  Fallback: vengeance has an emulator setup (`OneDrive\Desktop\Emulated\Pinball Dreams.lnk`);
  proven remote workflow: schtasks /IT to launch interactively + screenshot capture (see
  unity-destruction-game-windows memory for the pattern).
- VGMaps NES maps (Rick N. Bruns) = arcade-derived STRUCTURE reference, not palette.
  Hall of Light / Lemon Amiga are anti-bot-blocked from this box; Wikimedia API works.

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
  - Practice `[maxU,tV]`: [20,11.5],[27,10.7],[43,11.5],[50,15.5],[56.6,5.5],[57.8,5.5],[63.4,15.5],[72,10],[88,7.5]
  - Beginner: [9,12.5],[12,7.5],[15,17.5],[31,16.5],[56,17.5],[61,17.5],[65,10],[75,12],[83,12],[99,6],[110,12.5]
  - Silly: [6,11],[8,9.5],[10,11.5],[12,14],[14,16.5],[18,12.5],[33,6.5],[43,12],[51,12],[58,12.5]
  - Aerial `[v,u]`: [11.5,5],[12.5,8.5],[12.5,10],[12.5,14],[10.5,16.2],[7.5,17.3],[7,20],[7,22.5],[9,23.5],[10.2,27],[11,32],[9.5,37.5],[6.5,47.5],[9,49.5],[12.4,53.5],[12.5,62],[7.5,64.5],[7,69],[12.5,76]
  - Ultimate `[v,u]`: [11.5,5.5],[11.5,8],[11.5,11],[9.5,13],[11,15.8],[15.5,18],[15.5,21],[12,23.5],[12,27],[12,30.5],[12,36],[9.5,38],[9.5,41.5],[12.5,44.5],[13,47],[11.2,49],[12.8,51],[12.5,53],[12.5,60],[12.5,63],[12.5,68]
- Gates green at v0.17.0: practice+beginner goal (≤4 deaths), silly goal (≤4), aerial goal (≤2),
  ultimate goal, intermediate goal.

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
1. **Amiga reference capture (rig is LIVE, game at title screen)**: click through to options
   menu; capture menu; cycle Difficulty 0–7 and note clock values per difficulty; click GO!;
   capture all six races (palette, HUD font/layout, hazard placements, Silly launcher, music
   tempo via audio if feasible). Then: palette micro-diffs, HUD chunky-digit font, muncher
   placement audit.
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
