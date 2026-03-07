TITLE
- Neon Harbor — a short campaign puzzle-action game (30–90 minutes)

ONE-LINE PITCH
- Navigate a neon-lit harbor city, managing a small delivery boat while solving environmental puzzles and upgrading your vessel to reach the final island stronghold.

THEME & AESTHETIC
- Stylized low-poly + neon glow, soft bloom, particle wakes, rainy reflections. Synthwave soundtrack, punchy SFX for collisions, engine, and upgrades.

TARGET PLATFORM
- Mobile-first HTML5 (touch controls), playable on desktop (keyboard) and mobile browsers.

TARGET PLAYTIME
- Prototype goal: 30–90 minutes of engaged play across ~6–10 short levels (each ~3–12 minutes).
- Final target: ~60–90 minutes campaign.

CORE LOOP
- Accept delivery mission → navigate harbor avoiding hazards → solve one environmental puzzle (lower dam, re-route currents, unlock path) → deliver cargo → earn upgrade points → upgrade boat or buy new gadget → take next mission, increasing difficulty and reach.

KEY MECHANICS
- Boat piloting: simple acceleration/brake + steering; momentum matters.
- Currents/waves: moving map tiles that push the player; learn to use currents to speed or to avoid hazards.
- Environmental puzzles: switches, timed gates, movable buoys, current re-routing via levers.
- Resource: cargo integrity and fuel; deliveries award points but heavy cargo slows you.
- Upgrades: engine boost, hull plating (less damage), grappling hook (move buoys), deployable anchor (stabilize in storms).
- Checkpoints & short levels; shop between missions.

LEVEL PROGRESSION (Prototype MVP)
- Tutorial harbor (controls, steering, simple delivery) — Level 0
- Industrial channel (currents + obstacles) — Level 1
- Stormy inlet (timed gates + damaged bridge puzzle) — Level 2
- Quarry detour (narrow channels + movable buoys) — Level 3
- Harbor blockade (combined puzzles + enemies/AI boats) — Level 4
- Final approach to island (multi-stage puzzle + timed delivery) — Level 5

PROTOTYPE SCOPE (what to implement first)
- Implement core driving controls + physics (basic momentum + collision).
- One puzzle type: lever that changes a current tile direction.
- Two short levels (tutorial + industrial channel).
- Simple upgrade: engine boost (temporary speed).
- Minimal UI: start screen, level select, HUD (fuel, cargo, score), pause/restart.
- Basic VFX: wakes, simple bloom glow, particle splash.
- Sound: simple engine loop + collision SFX.

MILESTONES (with acceptance tests)
1) M1: Controls & movement
   - Player can accelerate, turn, and stop.
   - Collision with environment reduces speed but not crash.
   - Acceptance: 10s manual test of controls; no freeze.

2) M2: Puzzle mechanic + level integration
   - Lever toggles current direction.
   - Acceptance: Player can use lever to change current and reach goal in level 1.

3) M3: Level progression & saving
   - Two levels playable; progress persists in localStorage.
   - Acceptance: Complete level 0 → load level 1 → progress saved.

4) M4: Upgrade + shop (minimal)
   - Earn points and buy engine boost; effect visible.
   - Acceptance: Buy upgrade → engine temporarily faster.

5) M5: QA smoke tests
   - Game loads in mobile viewport, no crash in first 60s, controls responsive.
   - Automated harness runs: load → start → 60s play → report logs.

ASSETS & TECH
- Art: simple sprite/2.5D low-poly tiles or canvas shapes with glow shader.
- Engine: vanilla JS + Canvas (or Phaser minimal) — keep small to simplify deploy.
- Tests: small in-page JS script to simulate input for smoke tests.
- Files: games/YYYY-MM-DD/neon-harbor/{index.html, game.js, assets/, design.md, tests/}

ESTIMATED TIME (for prototype run)
- Concept + design.md: 30–45 minutes
- Core controls + one level + lever puzzle (prototype): 2–4 hours
- Second level + upgrade + basic polish: +2–4 hours
- So expect multiple runs (our 4-hour per-run cap is reasonable).

CRITICAL QA GATES (must pass before posting)
- Game starts from overlay button.
- Player control works on desktop + mobile (touch).
- 60+ seconds active play without freeze on both desktop and mobile emulation.
- Score/progression updates correctly for at least 2 levels.
- No immediate unfair instant deaths on Level 1.

NEXT STEPS (what I’ll do next)
- The worker will create game skeleton files and implement M1 controls in early runs.
- I will continue iterating each scheduled run and post updates to you until QA_APPROVED=true.