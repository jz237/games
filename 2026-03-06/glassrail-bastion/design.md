# Glassrail Bastion — Design & Scope

## Phase A: Concept
A stylized top-down **train-heist defense roguelite** where the player guards a crystal-powered rail bastion crossing a shattered skybridge. You fight off raiders, gather shards, and choose upgrades between waves. The game is tuned for a **single complete run of 30–90 minutes** depending on skill and upgrade choices.

## Core Fantasy
- You are the **Warden Engineer** of a glass rail convoy.
- Neon crystal shards power your weapons and shields.
- Every sector escalates into a bigger set-piece battle.

## Session Structure
- **Level 1: Skybridge Approach** (6 combat waves + miniboss)
- **Level 2: Citadel Breach** (6 combat waves + final boss)
- Meta progression in-run via upgrade picks every wave.

## Controls
- Desktop: WASD / Arrow keys movement, Space dash, Mouse click auto-fire toggle
- Mobile: hold-to-move virtual joystick, dash button, tap to aim/fire

## Visual Target
- 3D-ish shaded sprites with rim lighting
- Particle-heavy combat (sparks, smoke, shard trails)
- Shimmering collectibles + layered parallax background
- Screen shake + flash on heavy hits

## Milestones
1. ✅ Create concept + scope doc
2. Build playable loop (movement, shooting, enemy AI, pickups)
3. Build Level 1 and Level 2 progression + bosses
4. Add upgrade system + run timer + UI
5. Smoke test and write test log
6. QA gate file + run summary

## Success Criteria
- Full game loop with victory/defeat states
- At least 2 complete playable levels
- 30+ minute capable run (high wave count + strategic upgrades)
- Test logs saved at `tests/log.txt`
