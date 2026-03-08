# QA Notes — Neon Harbor (Run 2026-03-08)

## What was built
- **engine.js**: Full HTML5 Canvas engine with parallax, water shader, player movement, gravity/jump, dialogue system with branching choices, shard/signature collection, save/load (localStorage), interaction hints, vignette overlay
- **scenes/scene01.js**: "The Docks" scene with 3 parallax layers (city skyline, cranes, dock objects), 5 neon signs, 2 NPCs with branching dialogue (dock worker + old fisherman), 1 audio shard, 1 light signature collectible
- **index.html**: Game shell with HUD, dialogue UI, neon-themed styling
- **tests.html**: 8 unit tests covering scene structure, dialogue integrity, layer validation

## Controls
- Arrow keys / WASD: move + jump
- E / Enter: interact
- Scene width: 2400px (scrolling)

## Milestone Status
- **Milestone A** (player movement + dock scene + parallax + water shader): ✅ COMPLETE
- **Milestone B** (collection system + 2 shards): Partially done (1 shard + 1 signature in scene)
- **Milestone C** (Loom UI + memory vignette): Not started

## Known Issues
- Interaction Y positions are set at page load using window.innerHeight; resizing may misalign
- No scene transitions yet (single scene)
- No audio (visual-only prototype)
- Save/load not connected to UI buttons yet

## QA_APPROVED
false — needs Milestone B completion and scene transition before approval
