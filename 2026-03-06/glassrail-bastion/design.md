# Glassrail Bastion — Design & Scope

## Phase A: Concept
A stylized top-down **train-heist defense roguelite** where the player guards a crystal-powered rail bastion crossing a shattered skybridge. You fight off a hostile strike fleet, gather shards, and choose upgrades between waves. The game is tuned for a **single complete run of 30–90 minutes** depending on skill and upgrade choices.

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

## Enemy Strike Fleet
- **Viper Interceptor:** twin-engine attack craft with lateral vector jets and periodic afterburner charges.
- **Aegis Bulwark:** armored shield ship with a regenerating ablative field and heavy lance cannon.
- **Trident Gunship:** standoff craft that strafes at range and fires synchronized three-cannon volleys.
- **Brood Carrier:** launch-platform ship that releases paired Wasp microfighters from illuminated hangar bays.
- **Specter Wraith:** phase craft that alternates between a damage-resistant cloak and visible seeker-torpedo attacks.
- **Manticore Bomber:** manta-wing bomber that holds range and seeds slow, high-damage void mines.
- **Leviathan Dreadnought:** shielded capital ship with five-gun salvos, homing siege ordnance, and a fighter screen.

Every class uses its own silhouette, hull construction, engines, cockpit/core treatment, weapon mounts, animated ability effects, color language, movement profile, durability, damage, and score value.

## Flight & Opening Balance
- Enemy ships use acceleration, velocity damping, rate-limited turning, eased banking, thrust stretch, and subtle lift instead of direct position and rotation snaps.
- Waves 1 and 2 are onboarding sectors: 4 then 6 contacts, strict 2/3-ship concurrency caps, no random double-spawns, lower hull/shield/speed multipliers, and reduced contact/weapon damage.
- The starter bastion has 120 hull, 70 shield, stronger regeneration, and a faster 12-damage cannon so a new player can learn aiming and rail switching before the fleet escalates.
- Short post-hit protection prevents several overlapping contacts or projectiles from deleting the bastion in one frame.

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
