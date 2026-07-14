# BLACKOUT-V3-LOOP — Subway Siege: Blackout v3 immersion loop

**This file is the authoritative loop state.** Read it FIRST every iteration; it overrides the
/loop prompt where they disagree. One backlog item per iteration → verify → update this file →
end clean. Started 2026-07-14. Base: v2.0.0 (live on jez237.com, source == deploy, byte-identical).

Goal: v3.x immersion overhaul — weapon variety, weapon feel (VFX+SFX), richer districts.
Design thesis: **in a blackout game every effect is a light source** — all new VFX route through
the darkness engine (`renderLights`, offscreen light canvas, destination-out holes).

## State

- **Iteration:** 00 DONE (2026-07-14) — survey + baselines + this ledger + test rig.
- **Suite:** 24/24 green (2 consecutive runs). Run: `node tests/run.mjs suite` (exit 0 = green).
- **Shots:** `node tests/run.mjs shots <set>` → `loop-shots/<set>/` (gitignored).
  Baseline set: `loop-shots/baseline-v2.0.0/` (9 shots, 430×880 dpr2 mobile emulation).
- **Perf baseline** (`node tests/run.mjs perf`, wave 20, ~26 enemies):
  msPerUpdate ≈ 0.09–0.10, msPerTickRender ≈ 2.2–2.6. **Gate: fail an item if
  msPerTickRender > 3.0** (~15% over worst baseline) at comparable enemy count.
- **Git:** games-source IS a repo but SHARED and dirty/behind from other sessions
  (main ahead 2/behind 27, many foreign staged deletions). Rules: `git add` ONLY
  `2026-06-09/subway-siege-blackout/` paths, commit locally, do NOT push / rebase / touch
  anything else in this repo. First commit of this folder made at iteration 00.
- **Next:** item 01 (weapon framework).

## Iteration log

- **00** (2026-07-14): Built `tests/run.mjs` (suite/shots/perf, self-managed server+chrome by PID,
  DevToolsActivePort → no port collisions). Suite 24/24. Baselines captured. Survey findings below.
  4 initial test failures were all wrong test assumptions (title-vs-menu state, audio boots on
  resume, overdriveArmed semantics, boss pending-queue + setTimeout(700) upgrade), not game bugs.

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
- [ ] 01 **weapon framework**: data-driven weapon defs; CANNON refactored in as default; loadout
      persisted `ssb_weapon` (additive — never break ssb_tank/ach/life); pickup + post-boss-upgrade
      integration; QA hooks `selectWeapon/grantWeapon`; suite items for framework. No new weapons.
      Regression 24/24 proves the refactor.
- [ ] 02 SCATTER (spread shot)
- [ ] 03 RAILGUN (instant piercing beam — MUST dedupe across the 2 substeps, hitSet pattern :1057)
- [ ] 04 INCINERATOR (short cone + burn DoT — DoT deaths still via killEnemy())
- [ ] 05 TESLA (chain-arc between REVEALED enemies — define stalker interaction)
      (each of 02–05: distinct rate/dmg/range vs 3 tanks, own suite items, overdrive-pierce note)
- [ ] 06 **ordnance framework + FLARE**: manual slot, limited ammo via pickups, lobbed sustained
      light well; define stalker-cloak interaction; touch button placeholder ok until 17.
- [ ] 07 EMP: screen-wide reveal + brief stun; stalker interaction; per-run state reset.
- [ ] 08 weapon VFX pass 1: muzzle-flash light punches, tracers/beam glow, impact sparks, casings
      — pooled, zero per-frame allocation in hot loop; perf gate applies.
- [ ] 09 weapon VFX pass 2: explosion light blooms, scorch/debris decals (capped pool, reset per
      run), micro hit-stop tuning; **flash-intensity setting** + prefers-reduced-motion default
      (shake setting already exists).
- [ ] 10 weapon/ordnance SFX (ElevenLabs MCP, all-original): per-weapon fire + impact variants,
      flare sizzle, EMP thump, overdrive riser, boss stinger. Flat in `audio/`, ogg SFX; bump
      AUDIO_V; listen/spectrogram-eyeball every render; synth fallback for every new sound.
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
