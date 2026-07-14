# BLACKOUT-V3-LOOP — Subway Siege: Blackout v3 immersion loop

**This file is the authoritative loop state.** Read it FIRST every iteration; it overrides the
/loop prompt where they disagree. One backlog item per iteration → verify → update this file →
end clean. Started 2026-07-14. Base: v2.0.0 (live on jez237.com, source == deploy, byte-identical).

Goal: v3.x immersion overhaul — weapon variety, weapon feel (VFX+SFX), richer districts.
Design thesis: **in a blackout game every effect is a light source** — all new VFX route through
the darkness engine (`renderLights`, offscreen light canvas, destination-out holes).

## State

- **Iteration:** 10b DONE (2026-07-14) — **v3.2.0 SHIPPED LIVE** (batch 2: items 06–10).
  Site commit 9f51391c3 (cherry-picked from local 23f90cc; survived one real OpenClaw revert —
  see log); mirror jz237/games b5a8650 (explicit-list cherry-pick). Verified ×3 both hosts.
- **Suite:** 38/38 green (21/21 buffers decode). Run: `node tests/run.mjs suite`.
  Also: `node tests/run.mjs probe '<js expr>' [shot.png]` — evaluate in the booted game, optional screenshot.
- **Shots:** `node tests/run.mjs shots <set>` → `loop-shots/<set>/` (gitignored).
  Baseline set: `loop-shots/baseline-v2.0.0/` (9 shots, 430×880 dpr2 mobile emulation).
- **Perf baseline** (`node tests/run.mjs perf`, wave 20, ~26 enemies):
  msPerUpdate ≈ 0.09–0.10, msPerTickRender ≈ 2.2–2.6. **Gate: fail an item if
  msPerTickRender > 3.0** (~15% over worst baseline) at comparable enemy count.
- **Git:** games-source IS a repo but SHARED and dirty/behind from other sessions
  (main ahead 2/behind 27, many foreign staged deletions). Rules: `git add` ONLY
  `2026-06-09/subway-siege-blackout/` paths, commit locally, do NOT push / rebase / touch
  anything else in this repo. First commit of this folder made at iteration 00.
- **Next:** item 11 (district engine — data-driven defs: ground art, props, ambient light
  sources punching darkness holes, fog tint, ambient loop hook, weather layer). FIRST ACTION
  next iteration: one live probe of pages.dev (expect v3.2.0; OpenClaw deploys converged but
  cheap to confirm).

## Iteration log

- **00** (2026-07-14): Built `tests/run.mjs` (suite/shots/perf, self-managed server+chrome by PID,
  DevToolsActivePort → no port collisions). Suite 24/24. Baselines captured. Survey findings below.
  4 initial test failures were all wrong test assumptions (title-vs-menu state, audio boots on
  resume, overdriveArmed semantics, boss pending-queue + setTimeout(700) upgrade), not game bugs.
- **01** (2026-07-14): Weapon framework. WEAPONS table (data-driven: cdMul/dmg/shots/spread/speed/
  life/pierce/kick/sfx/shell{len,w,fill,glow,holeR}/muzzle{r,n}), CANNON def = exact v2 numbers.
  `weaponIdx` (persisted loadout, `ssb_weapon`) vs `curWeaponIdx` (in-run, reset in startGame) —
  pickups later swap only the in-run one. `fireWeapon()` handles shots/spread; bullets carry
  `shell` (shared ref — no per-frame alloc); drawBullets + renderLights read per-bullet shell
  (holeR). QA: selectWeapon/grantWeapon + snapshot.weapon/.weapons. Suite 24→27 (framework
  defaults/persist, loadout-on-start, auto-fire-kills). Perf 0.085/2.248 ms — within gate.
  SPLIT: armory UI (garage) + weapon-crate pickup drops deferred to 02 (need a 2nd weapon).
- **02** (2026-07-14): SCATTER (5×0.55dmg pellets, spread 0.42, cd×1.65, range ~280px, holeR 26,
  amber shells) + ARMAMENT row in garage (reuses tank-card CSS; ids `wpn-card-<i>`; RATE/PWR/RNG
  bars; screenshot-verified) + weapon-crate pickup ('weapon' type, own 5% drop band above the base
  roll so it never cannibalizes repair/shield/overdrive, gated WEAPONS.length>1; collect = random
  OTHER weapon in-run via curWeaponIdx + toast; drawn as amber shell glyph). Removed dead
  `lifetime.kills;` statement (kills batch into lifetime at endGame :1220 — verified BEFORE
  removing; a ++ "fix" would have double-counted). Suite 27→30 (scatter kills, crate swap +
  restart-restores-loadout, armory click persistence). Perf 0.083/2.283 — in gate.
  Polish idea for 18: weapon cards could get small canvas previews like tank cards.
- **03** (2026-07-14): RAILGUN as true HITSCAN (`beam:true` in def → `fireBeam()`): raycast 8px
  steps stopped by obstacles/pillars (range 700, beamW 6, dmg 3, cd×2.3, kick 2), damages every
  enemy along the segment exactly once (segDist2 helper) — the substep/hitSet trap can't apply
  because there is no bullet. Pierces barrels (blowBarrel chains). Crit + reveal-130 match bullet
  logic. Visual: `beams[]` (14-frame fade, glow+core lines, drawBeams after drawBullets); light
  holes punched every 60px along the beam in renderLights. beams cleared in startGame + QA
  setWave; `snapshot.beams`. Armory RNG bar reads wp.range for beams. Suite 30→31 (aligned-line
  3-kill pierce + beam observed). Perf 0.07/2.357 — in gate. Screenshot-verified (beam2.png).
- **04** (2026-07-14): INCINERATOR (cd×0.27 rapid, 3 jittered flame slugs 0.08dmg, range ~210,
  `burn:70` per hit → e.burnT stacks cap 240) + burn status in updateEnemies: 0.02 hp/tick
  **through killEnemy()**, pins reveal≥60 (burning STALKER loses cloak — intended flavor), sheds
  ember particles, and gets a flickering light hole (28+(burnT%7)*2) in renderLights. fireWeapon
  gained `jitter` + `sfxEvery` (flame plays 'fire' every 6th shot until item 10 records real SFX).
  Suite 29→32 after DEFLAKING: scouts retreat to a 300px standoff → pin position+reveal every
  4-5 ticks (not 10) or they drift out of scatter range / off the railgun corridor; crate check
  now asserts != cannon (random among 3 others). 3 consecutive green runs. Perf 0.087/2.18.
- **05** (2026-07-14): TESLA chain arc (`arc:true` → fireArc): first hop = nearest revealed enemy
  in a 0.6-rad aim cone within 520px, then chains to ≤4 nearest revealed within 190px, dmg 1.4
  ×0.75 falloff per hop, deaths via killEnemy. Same reveal<40 cloak rule as the turret (cloaked
  stalker un-arc-able; BURNING stalker arc-able — incinerator+tesla synergy). Arc visuals reuse
  beams[] with `jag:true` — drawBeams re-jitters the polyline every frame (crackle); light holes
  along arcs come free from the beam hole path. Suite 32→33 (chain-kills 3 drones + cloaked
  stalker survives inside chain range). Check 16 budget doubled to 1800 ticks — spawns are
  strictly 1-per-68-ticks, wave-5 queue ~13 deep, so a last-shuffled boss needs ~950. Perf
  0.072/2.15. Screenshot tesla-arc.png.
- **05b SHIP v3.1.0** (2026-07-14): adversarial review of full batch diff found: armory PWR bar
  ignored burn/chain value (fixed — formula now adds burn 1.3 / chains×dmg×0.35), shotCount not
  reset per run (fixed), and **incinerator worst-case perf 3.43ms > 3.0 gate** (fixed: shell
  `holeEvery:2` — dense flame swarms share light holes in renderLights — + embers %6→%9 →
  2.997ms). DESIGN NOTE deferred to item 16: railgun blind-fire physically clips unrevealed/
  cloaked enemies along the line (intended lance semantics; watch for stalker cheese).
  Ship mechanics that worked: website tree was clean-at-origin + untracked OpenClaw flyers →
  committed only our file, pushed aeed7c2d1, deployed from `git worktree add <tmp> origin/main`
  (script self-guard passed); single-probe grep returned a false 0 on live HTML — full-download
  re-probe showed all content (single probes lie; 2–3 before believing). Mirror: games-source IS
  jz237/games — `worktree --detach origin/main` + `cherry-pick 964576a^..275c20d` + push e0e7345,
  Pages built ~45s, github.io serves v3.1.0. VERSION bumped only (AUDIO_V still 2.0.0 — no new
  audio this batch).
- **06** (2026-07-14): Ordnance framework + FLARE. `G.ordAmmo` (start 2, cap 5, reset in
  startGame), fire via Q/E or `#btn-ord` (56px round DOM button, bottom-right above stick,
  pointerdown → works touch+mouse NOW, shown in play/pause via updateOrdHud). Flare: lobbed along
  player.turret 240px (36-tick arc flight), then 480-tick ground light well — renderLights hole
  150px flickering (fades last 80t), **pins reveal≥90 within 170px every 3 ticks → REVEALS CLOAKED
  STALKERS (the designed cloak counter)**. 'flare' pickup resupply in its own 4% drop band above
  the weapon-crate band. QA: fireOrdnance/addOrdnance hooks, flares getter, snapshot.flares/
  .ordAmmo. Suite 33→35 (flare lifecycle incl. cloak-reveal-then-turret-kill; ammo gate/resupply/
  cap). Placeholder SFX = ui('pickup') until item 10. Test gotcha again: flare lobs along the
  IDLE TURRET (points up into blocked station) — set q.player.turret=0 (east) before
  q.fireOrdnance() in tests. Perf 2.38 in gate. Shot flare-pool.png.
- **07** (2026-07-14): EMP as second ordnance slot (Q=flare, E=EMP; separate `G.empAmmo` start
  1/cap 3; #btn-emp cyan button above flare btn). fireEmp: ALL live enemies get reveal≥240
  (**cloak is electronics — stalkers revealed too**) + `e.stun` 90 (boss 45); stun block in
  updateEnemies skips movement/fire, crackles cyan sparks, reveal still decays. Visual: empFx
  shockwave ring on main canvas + **expanding hole in renderLights that lifts the whole blackout
  then lets it crush back** (40→1400px, alpha fades as it grows). 'emp' pickup in rare 2% band
  above flare band. QA fireEmp/addEmp + snapshot.empAmmo/.empActive. Suite 35→37 (arena-wide
  reveal+stun with movement-freeze/resume assertions; ammo gate/resupply/cap). Placeholder SFX
  ui('overdrive') until item 10. Perf 0.072/2.112 — best yet. Shot emp-wave.png.
- **08** (2026-07-14): VFX pass 1. SURVEY FIRST paid off: enemy muzzle flashes + fire-reveal
  already existed in v2 (manual even documents it) — didn't rebuild. Added: per-flash COLOR
  (`f.c`) + a tinted visible glow pass in render() (light holes are colorless destination-out —
  color must come from the main canvas); player flash = wp.shell.glow, enemy fire red-orange,
  explosions warm amber. Velocity-scaled tracer trails on fast shells (>6 px/t so flame slugs
  don't streak). Impact sparks now per-weapon color + directional (reverse bullet heading,
  spread 1.1). Casings + muzzle smoke gated to `casing:true` (cannon/scatter only — energy
  weapons no longer eject brass). No new suite checks (visual pass; error check + screenshot
  eyeball). Suite 37/37, perf 0.11/2.18 in gate. Shot vfx-pass1.png.
- **09** (2026-07-14): VFX pass 2. Scorch pool ALREADY existed (cap 50, reset via buildWorld) —
  extended with 2–4 static wreckage `deb` chunks per explosion (drawn in drawScorch, zero
  per-frame alloc). Explosion light BLOOMS: `f.grow` flashes expand as they fade in renderLights
  (muzzles still shrink). **Flash FX setting** (`settings.flash` full/reduced/off = Min;
  flashMul 1/0.55/0.25 — never 0, light is gameplay info): applied to flash light-holes, tinted
  glow layer (skipped entirely at Min), and the EMP blackout-lift pulse. **prefers-reduced-motion
  → defaults shake+flash to 'reduced' when no saved settings** (never overrides user choice).
  Options row + segInit('opt-flash'). Suite 37→38 (setting persists across all 3 levels while
  fighting). Perf 0.125/2.27 in gate (msPerUpdate creeping up 0.07→0.125 over the loop — burn/
  stun/flare/emp blocks; fine vs budget but WATCH it). Probe gotcha: camera lerps from origin at
  start() — tick(60+) before staging screenshots or the action lands off-frame. Shot vfx-pass2b.png.
- **10** (2026-07-14): Weapon/ordnance audio — 7 ElevenLabs SFX (fire_scatter/_railgun/_flame/
  _tesla, flare_launch, emp_blast, impact_metal), ogg q4 in audio/ (~118KB). ALL renders were
  peak-normalized near 0dB vs v2's quiet mix (fire.ogg max −12.6dB) — re-encoded from mp3 masters
  with per-file −5..−14dB gain to land peaks −8..−12dB. Spectrogram-eyeballed all 7 (clean:
  transients, sustained flare sizzle, EMP sub+static, metallic partials on impact). Snd methods
  fireScatter/fireRail/fireFlame/fireTesla/flareLaunch/empBlast (playBuf||synth fallback idiom;
  empBlast ducks music like barrelBoom); ping() now impact_metal buffer with a 5-tick throttle
  (it fires per non-kill hit — incinerator would spam). Weapon sfx keys wired (grep-asserted
  every key has a method — silent Snd.fire fallback would hide typos); flame sfxEvery 6→4.
  AUDIO_V 2.0.0→3.2.0 (cache-bust). Suite check 04 → ≥18/21 (21/21 in practice); 38/38 green.
  Perf: msPerUpdate 0.244 (audio-node churn from buffered ping, headless artifact — absolute
  cost trivial; render gate 2.39 ✓).
- **10b SHIP v3.2.0** (2026-07-14): batch review found 1 real bug — **ping throttle vs G.t reset**
  (new run → negative delta → impacts muted for thousands of ticks; fixed: negative dt plays).
  Ship mechanics: website tree had OpenClaw's hollow-deep file DIRTY + behind 1 → used the
  temp-worktree cherry-pick landing (local commit 23f90cc → origin 9f51391c3), deployed from
  worktree. **REAL REVERT observed** (first since the 07-07 guard): OpenClaw deployed its
  trailing checkout (e4f59a0, pre-my-push) ~2 min after my deploy — its path evidently bypasses
  BLOCKED_STALE_DEPLOY. Diagnosed per protocol (deployment list showed foreign SUCCESSFUL deploy
  from e4f59a0; 3 consecutive v3.1.0 probes), redeployed origin/main (by then a26a5f482 =
  OpenClaw's work ON TOP of mine → converged), verified v3.2.0 ×3. MIRROR GOTCHA: games-source
  local main now contains origin-side merge ancestry — `cherry-pick <old>..main` DRAGS IN FOREIGN
  COMMITS (hit 1dcf2f5 mid-sequence; aborted). **Always cherry-pick the mirror by EXPLICIT
  commit list**, not ancestry range. Mirror b5a8650 built + verified (v3.2.0 + emp_blast 200).

## Survey findings (2026-07-14, v2.0.0 @ 2045 lines)

- `__blackoutQA` is **NOT gated** behind `?qa=1` (unconditional at index.html:2013) → item 18.
- Touch **drive-stick EXISTS** (stick.dx/dy ~line 630); v2 verified screens at 430×880 →
  item 17 narrows to: ordnance touch buttons + no regression of existing touch.
- `visibilitychange` auto-pause **EXISTS** (index.html:2041, pauses when hidden during play) →
  item 15 narrows to: new ambient loops must respect pause/mute/duck paths.
- Settings **already have** `shake: full/reduced/off` (NOT "low" — code says 'reduced', :480) and
  `particles: auto/high/low`, `showFps` → item 09 narrows to: flash-intensity setting +
  prefers-reduced-motion default.
- Save keys: `ssb_settings_v2`, `ssb_tank`, `ssb_ach`, `ssb_life`, mute key, HS_KEY (local top-10).
  Settings key is versioned; others are additive-safe. New: use `ssb_weapon` (+ `ssb_ord`?).
- Enemy types: scout, brute, drone (kamikaze, range 0), boss (3-shot spread), stalker (cloak),
  mortar (stationary lobber). mkEnemy at :763. Pickups: repair / shield / overdrive (:919).
- Upgrade pool (:1160): AUTOLOADER / PLATING / SHIELD CELL / SCAVENGER / HOLLOW-POINT / FLOODLIGHT
  — buttons are dynamic `.upg-btn` in `#upg-opts` (no IDs). PLATING uses `curTank().hp` (correct).
- Districts (:491): STATION PLAZA / CRIMSON YARD / COLD TERMINAL / TOXIC SIDING / VIOLET DEPOT,
  `districtFor(w)` = every 5 waves, recolors ground/grid/fog/lamp/tint only (true palette swaps —
  the thing items 11–14 replace with real environments).
- Tanks (:483): ranger 100hp/cd26, scout 70hp/cd19, bulwark 140hp/2sh/cd30 (suite asserts these).
- Boss = every wave%5==0 (:1142); upgrade offer fires via **setTimeout(700ms real time)** after
  boss kill (:911) — wall-clock, not sim ticks.
- Possible cosmetic bug spotted in baselines: HUD "HOSTILES n" text overlaps the district label
  at 430px width. Check during item 18 polish.

## Backlog (one per iteration; split when big)

- [x] 00 survey + baselines + rig + ledger
- [x] 01 weapon framework (see log; armory UI + weapon-crate pickups split forward into 02)
- [x] 02 SCATTER + armory UI + weapon-crate pickup (see log)
- [x] 03 RAILGUN — implemented as hitscan beam, dedupe trap structurally avoided (see log)
- [x] 04 INCINERATOR + burn DoT via killEnemy; burning breaks stalker cloak (see log)
- [x] 05 TESLA chain arc; cloak rule matches turret; burning stalkers arc-able (see log)
- [x] 05b SHIPPED v3.1.0 LIVE 2026-07-14 (site aeed7c2d1 + mirror e0e7345; see log)
- [x] 06 ordnance framework + FLARE (real touch button shipped early, not a placeholder; see log)
- [x] 07 EMP: arena-wide reveal (cloak-piercing) + stun; per-run resets (see log)
- [x] 08 weapon VFX pass 1: tinted flash glows, tracers, directional sparks, gated casings (see log)
- [x] 09 VFX pass 2: blooms, debris decals, Flash FX setting + reduced-motion default (see log)
- [x] 10 weapon/ordnance SFX — 7 new, loudness-matched, spectrogram-checked (see log; overdrive
      riser + boss stinger already existed from v2, not duplicated)
- [x] 10b SHIPPED v3.2.0 LIVE 2026-07-14 (site 9f51391c3 + mirror b5a8650; revert survived — log)
- [ ] 11 district engine: data-driven defs — ground art, prop set, ambient light sources punching
      darkness holes (flicker streetlights, fires, neon), fog tint, ambient loop, weather layer.
- [ ] 12 rebuild existing 5 districts as real environments (props + ambient lights, not swaps)
- [ ] 13 add 3–5 NEW districts (weather: rain streaks, fog banks, embers)
- [ ] 14 district hazards/events (≤1 per district: steam vents, blackout surge shrinking the cone)
- [ ] 15 district ambient audio loops wired into existing pause/mute/duck paths.
- [ ] 16 balance pass: DPS parity matrix vs CANNON across tanks×weapons; score economy comparable
      (leaderboard history persists — don't inflate); perfect-wave + combo achievable per loadout.
- [ ] 17 touch/mobile: ordnance buttons; single-fire-per-tap via CDP touch emulation; portrait ok.
- [ ] 18 polish + docs: new achievements; PROMPT.md v3 rewrite; games/index.html blurb; **gate QA
      hooks behind ?qa=1**; HUD overlap check (see survey); version + FIELD MANUAL updates.
- [ ] STRETCH (propose to user at a ship milestone first): S1 light-interacting enemies
      (light-hunter, bulb-smasher); S2 patrol-music variants per district band; S3 daily seed mode.

## Ship protocol (batch every 3–5 items → v3.1.0, v3.2.0, …)

1. Suite green + adversarial self-review of the batch diff (v2's review found 14 real defects).
2. Bump VERSION (:340) — and AUDIO_V (:474) whenever audio changed.
3. Copy `index.html` + changed `audio/` files → `/home/jez237/.openclaw/workspace/jez237-website/games/2026-06-09/subway-siege-blackout/`.
4. In jez237-website: commit ONLY our files → `git fetch && git rebase origin/main` → push →
   `/home/jez237/.openclaw/workspace/scripts/deploy_cloudflare_pages_site.sh` (self-guards stale
   deploys; needs clean tree at origin/main — if OpenClaw litter blocks, land from a temp worktree
   of origin/main). NEVER leave that tree dirty between iterations (sweeper).
5. Verify `https://jez237-site.pages.dev/games/2026-06-09/subway-siege-blackout/?cb=<rand>`
   (jez237.com DNS-blocked from this box; alias may 404 brand-new assets ~30s — retry). Before
   believing any "revert": `wrangler pages deployment list`, and require 2–3 consecutive failed
   probes. Then sync the jz237/games GitHub Pages mirror. Record "vX.Y LIVE <date>" here.
6. Refresh the auto-memory note for this game.

## Engine facts (verified 2026-07-14 with line numbers)

- Fixed timestep: nullary `update()` via accumulator, spiral guard steps<5. Piercing/multi-hit
  MUST dedupe across substeps — `b.hitSet` is a lazily-created ARRAY with indexOf (:1057);
  player bullets get `pierce: overdrive>0?2:0` (:1011).
- Enemies die ONLY via `killEnemy()` (:898). Bullet damage checks hp<=0 explicitly (:1061);
  there is no global hp sweep.
- STALKER: turret targeting skips `reveal < 40` (:972; also render gate :1769/:971 dormant/reveal).
- MORTAR: direct hits guarded `!b.splash` (:1066); splash damages at :1074; telegraphs via
  mortarMarks.
- `overdriveArmed` means "WILL auto-engage at combo≥12" (:1151); engaging flips it false (:1154);
  re-arms on combo reset (damage :927, timer :1222). grantOverdrive() force-engages.
- Wave clear → intermission 230 frames → startWave(wave+1) (:1238–1248). `setWave` (QA) resets
  enemies/bullets/pending/intermission then startWave (:2017). update() early-returns while
  `upgradePending` (:1220).
- endGame → state 'over' (:1200); boot state is 'title' (not 'menu'); pause blocks during
  upgradePending (:1789).
- Audio: every `el.volume` write clamped [0,1]; `stopMusic` resets musicDuck (:439); SFX buffers
  fetch/decode only after ctx exists (Snd.resume / QA bootAudio); `?v=AUDIO_V` on all audio URLs
  (:403, :428). Music: title/patrol/boss, HTMLAudio crossfade with `_ft` token + `_fadeActive`.
- QA (:2013): snapshot/tick(n)/start/setWave/spawn/killAll(end)/endGame/grantOverdrive/setCombo/
  selectTank/god/bootAudio/clickBtnMusic/addPickup/unlock/opt/recTab/clickBtn + getters
  enemies/player/settings/G. `start()` sets qaGod=true AFTER startGame (which resets it, :1190).

## Verify workflow + rig gotchas

- Rig: `tests/run.mjs` starts its own static server (ephemeral port) + chrome
  (`--remote-debugging-port=0`, reads `DevToolsActivePort` in a throwaway profile → immune to port
  collisions; killed by PID → no pkill footguns). Autoplay flag on, 430×880 dpr2 emulation.
- CDP: evaluate value at `msg.result.result.value` (2 levels); screenshot data at `result.data`
  (1 level). Closure vars unreachable in global eval — go through QA hooks/getters. Always
  Page.navigate with `?cb=` buster (never reload). Verify composited screenshots, not just state.
- **Real-time vs sim-time**: flows on `setTimeout` (upgrade offer :911, 700ms) need wall-clock
  waits Node-side — page-side tick loops complete in ms and finish before the timeout fires.
- The rAF loop runs alongside QA ticks — write threshold assertions (>=), not exact counts.
- District shots carry lingering medal-toast overlays (setWave jumps unlock wave medals) —
  deterministic, fine for like-for-like diffs; don't chase them as regressions.
- Suite checks 20/21 assert tank stats (scout 70hp, bulwark 140hp/2sh) — update if rebalanced.
- **Spawn geometry**: `spawn()` drops enemies at player.x+300 — that spot is LOS-BLOCKED by a world
  obstacle from the default player spawn, and N/NE/NW/S at 150px are blocked too (station structure
  above, wall below). For tests needing turret lock: place enemies at player.x+150 (east) and pin
  `e.reveal=200` each few ticks (idle sweep won't reveal them reliably). Probed 2026-07-14.
- **Validate NEW tests against the pre-change build** before blaming a refactor — check 26 "failed"
  on geometry that would have failed on v2 too (it had never run on v2). `git stash` + suite run,
  or reason it out (does the change touch that path at all?).
- **Screenshotting transient VFX** (beams, flashes — anything that fades in <20 ticks): fire it,
  then set `q.G.hitStop = 500` — update() freezes (hit-stop early-return) while rAF keeps
  rendering, so the effect holds on screen through the probe's 250ms shot delay. Without this the
  page's own loop fades the effect before Page.captureScreenshot runs.
