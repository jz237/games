# Art Direction — Research Notes

> Original homage. Palettes and layer notes below are ORIGINAL designs evoking
> the mood of each world. No ripped tiles/sprites. The "enhanced graphics"
> brief means a crisp, richer pixel-art homage — not the exact Amiga pixels.

## Global style

- Pixel-art, 16 px base tiles, 2x-3x display scale.
- Amiga-era vibe: bold saturated palettes, chunky readable sprites, layered
  parallax backgrounds. Hero (Bren) is a blue/teal armored figure — a strong
  readable silhouette against every world.
- 2-3 parallax layers per world (far / mid / near) plus the interactive tile
  layer and a foreground occluder layer where appropriate.

## Per-world palettes (concrete hex)

### World 1 — Desert / Landorin Surface
- Sky gradient: `#2A4C8A` -> `#6FA8DC` (deep to light blue)
- Rock/terrain: `#8A5A2B`, `#B5793C`, `#D9A566` (ochre/sand tiers)
- Shadow rock: `#4A2F14`
- Accent (plants/metal): `#3FAE5A`, `#C0C0C0`
- Parallax: far distant dunes/mountains (desaturated blue-grey), mid mesas,
  near foreground rock outcrops. Slow far scroll (0.2x), mid (0.5x).

### World 2 — Submerged Dungeon
- Water body: `#0E2E3E` -> `#1B5E7A` (deep teal gradient)
- Cavern rock: `#2C3A45`, `#455A64`
- Bioluminescent accent: `#39D0C8`, `#7CF9E6`
- Hazard glow: `#B23A48`
- Parallax: far murky water column with light shafts, mid stalactite silhouettes,
  near dripping cave rock. Add subtle caustic light overlay + bubble particles.

### World 3 — Corridor (shmup)
- Space void: `#05060F`
- Tunnel metal: `#3A3F5C`, `#5C6486`, `#8892C4`
- Energy/thruster: `#FF6B35`, `#FFD23F`
- Neon hazard: `#E040FB`
- Parallax: starfield far (twinkle), mid tunnel wall panels streaking past,
  near foreground girders. Fast scroll to sell velocity (esp. 3-3).

### World 4 — Walker Factory
- Base metal: `#3E3E46`, `#57575F`, `#7A7A85`
- Warning stripes: `#F2C037` / `#1A1A1D` (hazard yellow-black)
- Hot machinery: `#FF4D2E`, `#FFB347`
- Cool accent (screens/lights): `#2EC4E0`
- Parallax: far dim machine hall, mid rotating gears/pistons (animated), near
  pipes and conveyor beams. Steam/spark particles.

### World 5 — Alien Ship
- Biomech base: `#1B1420`, `#2E2233`, `#463349` (dark purples/greys)
- Organic flesh accents: `#7A2E3B`, `#B23A5A`
- Sickly bio-glow: `#8FD14F`, `#C6FF6B`
- Egg/ichor highlight: `#D9C7B0`
- Parallax: far cathedral-like biomech ribcage silhouettes, mid dripping organic
  walls, near bone/tendon foreground. Pulsing glow (heartbeat sync), fog overlay.

## Sprite direction

- **Bren McGuire (hero)**: blue/teal armored suit, `#2E5FD9` armor with
  `#7CB0FF` highlights and `#F2C037` visor accent. Clear run/jump/morph/shoot
  animation set. Morph wheel = spinning metallic sphere with motion trail.
- Enemies keyed per world palette above; keep silhouettes distinct from
  hero and hazards. Hazards use warm/red glow to read as "danger" universally.

## Sources

- https://en.wikipedia.org/wiki/Turrican_II:_The_Final_Fight
- World-structure notes (per-world themes: desert, underwater, corridor,
  factory, Giger biomech).
- Palettes are original selections evoking each documented theme — no ripped data.
