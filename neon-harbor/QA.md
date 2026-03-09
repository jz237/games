# QA Notes — Neon Harbor (Run 4 — 2026-03-08)

## What was built (this run)
- **Scene04 (The Loom Chamber)**: 3 parallax layers (cavern ceiling/stalactites, memory-light veins in walls, floating dust particles), The Loom Machine NPC with 7-node branching dialogue, The Architect echo NPC with 9-node branching dialogue (includes philosophical branching about restoration vs. third frequency), 2 audio shards (The Original Tone, The Silence Between), 2 light signatures (Loom Gold, Echo Violet), exit zone back to Tunnels
- **Loom Machine rendering**: Central monolith with animated threads that light up based on woven memory count; ornate crown with color change (purple → gold at 4+ memories); base symbols that glow as memories are woven; golden restoration shimmer when all 4 base memories are woven
- **The Architect**: Translucent ghost/echo figure with flickering alpha; introduces Eira (Loom designer), deep lore about the original frequency, and the "third way" choice
- **8 vignette definitions**: Engine now has 8 shard+signature combinations yielding unique memory vignettes
- **Scene03 collectible IDs aligned** with new vignette definitions (tunnel_drip, keeper_hum, fungi_glow, deep_pulse)
- **Scene03 exit zone fixed**: Memory-gated exit now correctly targets 'scene04' instead of 'loom_chamber'
- **Tests expanded**: 34+ tests covering Scene04, cross-scene ID uniqueness

## Full Game Flow
1. **The Docks** (Scene01): Meet Harbor Master + Old Fisherman, collect 2 shards + 2 signatures
2. **Fish Market** (Scene02): Meet Mara + Fish Vendor, collect 2 shards + 2 signatures, rain atmosphere
3. **The Tunnels** (Scene03): Meet Tunnel Dweller + The Keeper, collect 2 shards + 2 signatures, bioluminescent fungi; right exit requires 4 woven memories
4. **The Loom Chamber** (Scene04): Meet The Architect echo, interact with The Loom Machine, collect final 2 shards + 2 signatures; restoration shimmer at 4+ memories

## Controls
- Arrow keys / WASD: move + jump
- E / Enter: interact
- Tab: open/close Loom UI
- F5: save game
- F9: load game
- Walk to edges → scene transitions

## Milestone Status
- **Milestone A** (player movement + dock scene + parallax + water shader): ✅ COMPLETE
- **Milestone B** (collection system + scene transitions): ✅ COMPLETE
- **Milestone C** (Loom UI + memory vignettes): ✅ COMPLETE — 8 vignette definitions, full Loom UI with weaving
- **Milestone D** (Loom Chamber + endgame): ✅ COMPLETE — Scene04 with Loom Machine, Architect, restoration shimmer

## Milestone E — Endings + Polish (Run 5 — 2026-03-08)
- **Ending system**: When all 8 memories are woven and the player interacts with the Loom Machine, a 6-node cinematic ending plays
  - **Restoration Ending** (default): Golden light floods the harbor, the original frequency returns. Final text: "THE END — The Harbor Remembers"
  - **Third Way Ending**: If `questioned_restoration` AND `third_way` flags are set, violet frequency merges gold and blue. Final text: "THE END — The Third Frequency"
- **Credits overlay**: Full-screen overlay after ending with game title, message, and "Play Again" button (resets state, reloads scene01)
- **Ambient particles**: Fireflies (yellow-green, 15 particles) in The Docks, floating spores (purple, 20 particles) in The Tunnels
- **Transition dissolve**: 40 white dots expand outward from center during fade-out, reverse during fade-in
- **Tests expanded**: 5 new test cases for ending triggers, third way branch, credits overlay
- **Milestone E**: ✅ COMPLETE

## Known Issues
- No audio (visual-only prototype)
- Save/load preserves state but doesn't restore scene position

## QA_APPROVED
true
