Title: Ink & Press
Slug: ink-and-press
Date: 2026-03-07
Author: GameMaster (solo prototype)

High-level concept
------------------
Ink & Press is a short-to-midform HTML5 game that simulates a small artisan sign/print shop where the player designs, sets up, and runs a hand-operated letterpress to fulfill customer orders. Gameplay mixes tactile mini-games (aligning type, ink rolling, press timing), resource and time management (ink, paper, machine heat), and a light progression system (new typefaces, templates, press upgrades). The game is inspired by tactile printmaking and is designed to be visually rich with simple mouse/touch interactions and satisfying mechanical feedback.

Playtime & Scope
----------------
Target playtime: 30–90 minutes
- Tutorial & setup: 5–10 minutes
- 6-10 short orders (levels), each 3–10 minutes depending on difficulty
- Midgame challenge (rush hour) ~10–15 minutes
- Endgame final order / exhibition piece ~10–15 minutes

Core pillars
------------
1) Tactile mechanics: precise, satisfying mouse/touch interactions that feel mechanical (drag type pieces, rotate, nudge, press).
2) Progression: unlock typefaces, inks, templates, and tools.
3) Visual identity: warm paper textures, hand-drawn vector type, subtle physics for ink spread.
4) Accessibility: single-button/touch variants for core mechanics, adjustable difficulty.

Key mechanics
-------------
- Layout mini-game: drag-and-drop type blocks into a layout grid, snap-to guides, rotation.
- Typesetting precision: micro-adjust kerning with mouse wheel or arrow keys.
- Inking: control roller speed and pressure to get even coverage; over- or under-inking affects print quality.
- Press timing: press down when alignment cue hits to avoid blur or ghosting; timing window varies by press upgrade.
- Order grading: final score based on alignment, ink consistency, trim, and timeliness.
- Shop management: choose which orders to accept, manage inventory of inks/paper, upgrade press between levels.

Progression & Levels
--------------------
- Tutorial: basic one-letter print and press demo.
- Early levels: simple one- or two-word orders, forgiving timing.
- Mid levels: multi-color prints (require registering layers), limited ink, tighter timing.
- Rush hour mode: multiple concurrent orders with a time limit.
- Final commission: complex multi-layer poster with special inks and constraints.

Deliverables for Phase A
------------------------
- design.md (this document)
- milestone list (below)
- initial project folder structure committed to git

Milestones (initial)
--------------------
A0: Phase A complete — design.md saved (this)
A1: Create project scaffold (index.html, styles.css, main.js, assets placeholder)
B0: Prototype core mechanics (layout + press timing) — playable demo with 2 levels
B1: Add ink mechanic + scoring
B2: Implement inventory/shop and 2nd level (multi-layer)
C0: Smoke tests harness + simple automated playthrough
D0: Polish visuals, audio SFX, tweak balancing
E0: QA & Packaging — final run_summary and QA_APPROVED flag

Technical notes
---------------
- Tech: vanilla HTML5 + Canvas (2D) for portability. Single-file fallback playable in-browser.
- Build: no build step required; use simple static files in the SLUG directory.
- Tests: in-page JS harness that simulates presses and records logs to tests/log.txt.

Files to create now
-------------------
- games/2026-03-07-ink-and-press/index.html
- games/2026-03-07-ink-and-press/styles.css
- games/2026-03-07-ink-and-press/main.js
- games/2026-03-07-ink-and-press/README.md
- games/2026-03-07-ink-and-press/tests/log.txt (placeholder)
- games/2026-03-07-ink-and-press/CONTINUE.json (next steps)

Notes on playtesting
--------------------
- Focus on tactile feel: iterate on input smoothing and feedback.
- Keep levels short and varied to demonstrate progression in the prototype.

