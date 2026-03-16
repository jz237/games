# Crystal Cavern — Design Document

## Concept Selection

### Idea 1: Crystal Cavern (SELECTED)
A vertical descent roguelike where you control a glowing crystal orb falling through procedurally-generated cave systems. Tilt/swipe to steer through narrow passages, collect gem fragments that orbit your orb, and avoid jagged crystal formations. The deeper you go, the cave walls shift from cool blues to deep purples to molten reds. Your orb illuminates the cave with dynamic lighting — you can only see what your light reveals.

### Idea 2: Tide Pool
A zen puzzle game where you connect bioluminescent sea creatures by drawing paths through tide pools. Creatures pulse and glow, water physics ripple across the screen. Beautiful but potentially too slow/passive for the "addictive" quality bar.

### Idea 3: Spark Conductor
A rhythm-adjacent game where electrical sparks travel along circuit paths and you tap junctions to route them. Neon aesthetic. Fun but similar territory to existing neon-themed games in the catalog.

---

## SELECTED: Crystal Cavern

### Core Mechanic
You're a luminous crystal orb descending through an infinite cave. Touch and drag left/right to steer. The cave scrolls downward automatically (speed increases over time). Collect gem fragments that orbit your orb — each one extends your light radius and adds to your score multiplier. Hit a wall and you shatter.

**What makes it unique:** The dynamic lighting system. The cave is DARK — you only see what your orb illuminates. Gems glow faintly in the distance as hints. As you collect more gems orbiting you, your light expands, revealing more of the cave but also making the visual spectacle more elaborate. It's a risk/reward loop: more gems = more visibility = higher score, but the orbiting gems also make your effective hitbox larger.

### Visual Style
- **Color palette:** Deep cave blues (#0a1628) → amethyst purples (#2d1b69) → ruby reds (#8b1a1a) → molten gold (#c4950a) as depth increases
- **Lighting:** Radial gradient emanating from orb, with falloff. Gems cast small secondary lights
- **Orb:** Translucent crystal sphere with internal refraction effect (rotating highlight), surrounded by orbiting gem particles
- **Cave walls:** Jagged crystalline formations rendered with angular polygon shapes, catching light with specular highlights
- **Particles:** Constant sparkle trail behind orb, gem collection bursts, wall-hit shatter explosion
- **Background:** Subtle parallax stalactites/stalagmites in the darkness

### Control Scheme
- **Primary:** Touch and drag horizontally to move orb left/right
- **Feel:** Smooth, slightly floaty physics with momentum. Orb drifts toward finger position with easing
- **Secondary:** Double-tap for a brief "pulse" ability that pushes nearby obstacles away (limited charges, earned from gem chains)

### Difficulty Curve
- **Depth 0-500:** Wide passages, few obstacles, gentle introduction. Cave is blue.
- **Depth 500-1500:** Narrower passages, crystal stalactites appear, speed increases. Cave shifts to purple.
- **Depth 1500-3000:** Moving crystal formations, narrow squeezes, faster scroll. Cave turns red.
- **Depth 3000+:** Molten zone — walls pulse and shift, lava streams cross the path, extreme speed. Gold/orange palette.

### What Makes It Visually Impressive
- Dynamic real-time lighting on a dark background — the orb IS the light source
- Orbiting gem particles create a mesmerizing orbital pattern
- Color palette shift through depth creates a journey feeling
- Crystal wall reflections catch the light with specular highlights
- Shatter death effect: orb explodes into hundreds of crystal fragments with physics
- The darkness itself is dramatic — you feel the danger of what you can't see
