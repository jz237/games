# Skyforge Caravan — Design & Scope

## Phase A Concept (completed)
A mid-length HTML5 action-escort game where the player pilots an arcane caravan through floating sky provinces. You gather ember crates, fend off raiders, and survive escalating encounter density across 4 provinces.

## Core Pillars
1. **Progression-heavy loop**: survive province skirmishes → collect crates → level up combat kit → unlock next province.
2. **Visual richness**: ember glow palettes, atmospheric particles, animated enemies, pulse bursts, impact effects.
3. **30–90 minute target runtime**:
   - Province 1: onboarding (8–12 min)
   - Province 2: pressure increase (10–15 min)
   - Province 3: dense raider waves (12–20 min)
   - Province 4: final gauntlet (15–30 min)

## Controls
- Desktop: WASD/Arrow keys movement, Space blink dash, J arc pulse.
- Mobile: hold-to-move joystick, tap Dash/Pulse buttons.

## Progression Systems
- XP levels increase damage and survivability.
- Ember crates act as score/currency proxy for route success.
- Province unlock conditions enforce full progression.
- 4 playable provinces (exceeds 2-level minimum).

## Milestones
- [x] M1: Concept + scope in design.md
- [x] M2: Core movement/combat loop
- [x] M3: Minimum 2 playable levels (implemented 4 provinces)
- [x] M4: Upgrade + unlock progression
- [x] M5: Smoke tests + logs
- [x] M6: QA checklist + packaging

## QA Gate
Publishing is allowed only when `QA_APPROVED=true` exists in this folder root.
