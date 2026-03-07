# Chrono Reef Expedition — Design & Scope

## Phase A Concept (completed)
A mid-length HTML5 action-exploration game where the player pilots a diver mech into a time-fractured coral reef. You gather chrono-shards, clear enemy swarms, and survive escalating biome hazards across 4 sectors.

## Core Pillars
1. **Progression-heavy loop**: explore sector → collect shards → unlock permanent upgrades → defeat sector guardian.
2. **Visual richness**: layered parallax seabed, glows, particles, animated enemies, soft lighting, screen shake, pulse effects.
3. **30–90 minute target runtime**:
   - Sector 1: onboarding (8–12 min)
   - Sector 2: pressure + hazards (10–15 min)
   - Sector 3: elite enemies + routing (12–20 min)
   - Sector 4 + boss gauntlet (15–30 min)
   - Retry/upgrade loops add remaining playtime.

## Controls
- Desktop: WASD/Arrow keys movement, Space dash, J pulse blast.
- Mobile: hold-to-move virtual joystick, tap Dash/Pulse buttons.

## Progression Systems
- XP levels grant stat points.
- Currency (chrono-shards) buys upgrades between sectors.
- Sector unlock conditions enforce full progression.
- 2+ playable levels required: implemented as 4 sectors with unique enemy compositions.

## Milestones
- [x] M1: Concept + scope in design.md
- [x] M2: Core movement/combat loop
- [x] M3: Minimum 2 playable levels (implemented 4 sectors)
- [x] M4: Upgrade + unlock progression
- [x] M5: Smoke tests + logs
- [x] M6: QA checklist + packaging

## QA Gate
Publishing is allowed only when `QA_APPROVED=true` exists in this folder root.
