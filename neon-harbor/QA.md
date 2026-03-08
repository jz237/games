# QA Notes — Neon Harbor (Run 2 — 2026-03-08)

## What was built (this run)
- **Scene01 additions**: 2nd audio shard ("Fog Horn Echo"), 2nd light signature ("Docklight Rose"), exit zone at right edge
- **Scene02 (Fish Market)**: 3 parallax layers (smokestacks, market stalls with hanging lanterns, fish crates/nets), rain effect, Mara NPC with deep 7-node branching dialogue, Fish Vendor NPC, 2 audio shards, 2 light signatures, exit zone back to docks
- **Scene transition system**: Exit zones in scenes trigger automatic scene loading via engine registry; walk to edge to transition
- **Resize handler**: Window resize now updates interaction Y positions for current scene
- **Save/Load shortcuts**: F5 saves, F9 loads (with system dialogue confirmation)
- **Tests**: Expanded from 8 to 20 tests covering Scene02, exit zones, collectible counts, cross-scene ID uniqueness

## Controls
- Arrow keys / WASD: move + jump
- E / Enter: interact
- F5: save game
- F9: load game
- Walk to right edge of Docks → transitions to Fish Market
- Walk to left edge of Fish Market → transitions back to Docks

## Milestone Status
- **Milestone A** (player movement + dock scene + parallax + water shader): ✅ COMPLETE
- **Milestone B** (collection system + scene transitions): ✅ COMPLETE
  - Scene01: 2 shards, 2 signatures, 2 NPCs, exit zone
  - Scene02: 2 shards, 2 signatures, 2 NPCs, exit zone
  - Scene transitions working via exit zones
  - Save/load on F5/F9
- **Milestone C** (Loom UI + memory vignette): Not started

## Known Issues
- No audio (visual-only prototype)
- Save/load preserves state but doesn't restore scene position (loads at scene default start)
- No transition animation (instant cut)
- Rain in Fish Market is simple pseudo-random, not physically accurate

## QA_APPROVED
false — needs Milestone C and transition polish before approval
