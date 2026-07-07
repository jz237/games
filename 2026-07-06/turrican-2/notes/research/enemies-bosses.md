# Enemies & Bosses — Research Notes

> Original homage. Rosters below are reconstructed to match the ORIGINAL's
> themes for a fresh implementation. Only "The Machine" (final boss) is a
> firmly attested name; other boss names are undocumented ("mega-monsters").
> No ROM data / no ripped assets.

## What research firmly confirms

- Every EXPLORE world ends with a "mega-monster" boss.
- The final boss is **"The Machine"** (World 5, stage 5-2). Defeating it ends
  the game (Bren McGuire avenges the Avalon 1 crew).
- World 2 has a boss with a **grab attack** that drags Bren into a death
  barrier (fan lore — plausible, unverified).
- World 5 features an **Alien-queen-style creature** (Giger/Aliens homage).
- Specific names ("big mech," "steel dragon") are fan color, NOT authoritative.

## Reconstructed enemy roster (per world — original designs, homage theme)

### World 1 — Desert / Landorin Surface
- **Enemies**: crawling scarab-bots, hopping rock-mites, turret pods embedded in
  cliffs, flying wasp-drones, wind-borne floating mines.
- **Boss**: large rock-armored mech / guardian. Pattern: stomps and lobs arcing
  projectiles; opens a chest core (weakpoint) between attacks.

### World 2 — Submerged Dungeon
- **Enemies**: underwater eels, homing bubble-mines, cave crabs, spitting wall
  polyps, elevator-guard sentries.
- **Boss**: cavern leviathan with a **grab attack** — a claw/tentacle sweeps
  the arena; if it grabs Bren it drags him toward a spike/death barrier. Free
  yourself by rapid fire. Weakpoint: exposed maw when it lunges.

### World 3 — Corridor (shmup)
- **Enemies**: fixed wall turrets, fast interceptor fighters, mine-layers,
  destructible barrier segments, homing seeker missiles.
- **Mid/end bosses**: large gun-platform ships blocking the tunnel; fire spread
  and beam volleys; destroy weakpoint cores. 3-3 finale = a fast gauntlet.

### World 4 — Walker Factory
- **Enemies**: fire-breathing Walker statues, spinning nuts on bolts (crush
  hazard), conveyor-belt drones, sparking arc-hazards, assembly-arm turrets.
- **Boss**: assembled factory machine / walker mecha. Pattern: fires from
  multiple ports, marches; destroy leg joints then core.

### World 5 — Alien Ship
- **Enemies**: face-hugger crawlers, xenomorph-style leapers, egg-pods that
  hatch, acid-spitters, bone-train segments (rooftop set piece).
- **Area boss**: Alien-queen-style creature (biomechanical). Spawns huggers,
  lunges, spits acid arcs.
- **FINAL BOSS: "The Machine"** (5-2). Multi-phase mechanical/biomech
  antagonist. Suggested phases: (1) armored exterior, expose core; (2) core
  fires beam sweeps + spawns; (3) desperation rapid barrage. Weakpoint: pulsing
  core; use Laser L3 / freeze bombs. Defeat = ending.

## Attack-pattern template (for implementation)

Each boss: HP pool, telegraph (0.5-1.0 s), 2-4 cyclic attack states, an
open/vulnerable window, and a phase transition at HP thresholds (e.g. 66% /
33%). Contact damage on body; only weakpoint takes weapon damage during open
window.

## Sources

- https://en.wikipedia.org/wiki/Turrican_II:_The_Final_Fight
- Research bundle enemies/bosses facts (minimal/placeholder).
- World-structure research notes (grab-boss, Alien-queen, The Machine).
- Reconstructed designs — no ROM data used.
