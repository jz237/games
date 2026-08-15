# Arkanoid Heritage Loop — Shatter Storm Amiga Edition

Goal: fold everything documented about Taito's Arkanoid (1986 arcade) — features AND all 33
screen layouts — into the Amiga edition, then deploy to jez237.com + GitHub Pages mirror.

Worktree: /tmp/claude-1000/shatter-arkanoid-wt (detached from jez237-site origin/main)
Game: games/2026-03-11/shatter-storm/amiga/ · target version v4.0.0

## Research (done — sources)
- StrategyWiki Arkanoid/Gameplay + /Walkthrough (via MediaWiki API; page 403s direct fetch)
- Stage screenshots: 33 PNGs 224×256 from strategywiki CDN, parsed to grids (see below)
- oldgames.sk / arcade-history / gamerjournalist (capsule + enemy rules)
- Enemy names via Codex Gamicus / NES manual: Konerd (cone), Pyradok (pyramid), Tri-Sphere, Opopo

## Authentic spec captured
- Bricks: white 50 · orange 60 · cyan 70 · green 80 · red 90 · blue 100 · pink 110 · yellow 120
- Silver: 50×stage pts, 2 hits, +1 hit every 8 stages. Gold: indestructible.
- Capsules (colors): L red · E blue · C green · S orange · B violet (Break, +10,000, exit right wall)
  · D cyan (Disruption, 3 balls) · P gray (extra Vaus)
- Capsule rules: drop after a random number of non-silver bricks; one falling at a time; NONE while
  multiball; collecting a capsule cancels the previous power; duplicate roll → substitute D;
  one P per life. Catch auto-releases after a delay. Slow stacks, speed creeps back.
- Paddle zones: centre = steep bounce, red bands = 45°, edges = shallow.
- Enemies: spawn from two top doors (animated hatches), drift down, harmless to Vaus, deflect ball,
  die to ball/laser/Vaus, 100 pts. Max 3.
- 1UP at 20,000 / 60,000 / every 60,000. Continue allowed except stage 33; continue resets score.
- Stage 33 = DOH (Moai head): 16 ball hits, 1000/hit, spits deadly projectiles, no bricks.
- Ball speed ramps gradually during play, resets on death.
- Story intro + ending text (arcade attract/ending).

## Screen layouts — DONE (33/33 verified)
Parsed from arcade screenshots at 8px row / 16px col grid, 13 columns, symbols
W O C N R B P Y S G, stored in layouts-final.json {lead, rows}. Verified stage-by-stage against
originals via side-by-side render sheets; sprite artifacts (ball, cone, Tri-Sphere enemies caught
mid-flight) removed; two circuit-background glitches fixed (19, 23); stage 2's odd trailing red
brick on the silver row is GENUINE; stage 26 oval genuinely offset-left; stage 33 = no bricks (DOH).
Tools + evidence: /tmp/claude-1000/arkanoid-stages/ (parse2.py=band-median parser, sheets.py,
suspects*.png, layouts-final.json).

## Build checklist (game.js v4.0.0)
- [x] ARKANOID 33 campaign: 13-col grid, 33 authentic layouts, DOH boss stage
- [x] STORM 10 campaign: keep existing 14-col blueprints (legacy content)
- [x] Authentic brick scoring + silver hit/point formulas
- [x] Full 7-capsule set with authentic colors + drop/replace/multiball-suppression rules
- [x] Break gate on right wall (+10,000, warp out, advance)
- [x] Disruption 3-ball split (D); B remains Break (was multiball — remapped)
- [x] Paddle 3-zone bounce physics
- [x] 4 named enemies with distinct looks, top spawn doors with hatch animation
- [x] DOH boss: 16 hits, invuln flicker, aimed mouth projectiles, Vaus death on hit
- [x] 1UP thresholds; continue countdown (not on DOH stage; resets score)
- [x] Ball speed creep + slow-capsule stacking/recovery
- [x] Story intro panel + DOH ending; ROUND N / READY serve flow
- [x] Vaus explosion death animation; enemy contact harmless
- [x] Title menu: two campaign starts; index.html copy + v4.0.0 + cache-bust ?v=400
- [x] QA hook __ssQA extensions (setRound, campaign, doh state) + headless QA pass — 25/25
      (qa-arkanoid.mjs in session scratchpad; screenshots eyeballed via qa-contact.png)
- [ ] Games index card copy update (mention 33 arcade rounds) if needed
- [ ] Deploy: commit → push main → deploy_cloudflare_pages_site.sh → verify pages.dev
- [ ] Sync GitHub mirror jz237/games (worktree cherry-pick pattern) → verify Pages workflow

## Iteration log
- 2026-08-15 #1: researched spec, downloaded+parsed+verified all 33 layouts, wrote ledger.
- 2026-08-15 #2: game.js v4.0.0 written (all features), index.html updated, headless QA 25/25
  green, screenshots verified. NEXT: README/index copy polish, optional DOH face polish,
  commit, deploy site + GitHub mirror, live verify, stop loop.
