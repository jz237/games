# Weapons & Power-ups — Research Notes

> Original homage. Weapon set below reconstructs the FEEL and structure of the
> Turrican II arsenal for a fresh implementation. No ROM data / no ripped assets.

## Primary weapons (switchable, upgradeable)

The Turrican series uses a small set of primary weapons that the player swaps
between via a pickup and that each level up (typically 3 tiers) as you collect
matching power-up icons.

1. **Multiple / Spread Shot** (default starting weapon)
   - L1: single forward bullet.
   - L2: 3-way spread.
   - L3: 5-way wide spread. Rapid fire.
   - Role: crowd control, the reliable all-rounder.

2. **Laser / Beam**
   - L1: thin piercing beam, medium damage.
   - L2: thicker beam, higher damage, pierces multiple enemies.
   - L3: full-width lightning beam, high DPS, pierces everything in line.
   - Role: heavy single-target / boss damage.

3. **Bouncing / Rebound Shot** (optional 3rd type in some entries)
   - Projectiles ricochet off walls — useful in the maze corridors and secret
     rooms. Suggest as a collectible variant in platform worlds.

## Signature secondary systems (always available)

- **Power line (rotating beam / whip)**: hold-fire directional energy tether,
  swept 180-270 degrees by rotating the stick. Continuous damage, reveals
  hidden blocks. Movement locks while charging/aiming.
- **Morph wheel + mines**: while morphed, drop bombs/mines. Limited mine stock,
  refillable via pickup.
- **Freeze / Smart-bomb**: countable stock (start 3). Freezes or clears all
  on-screen enemies; big damage to bosses. Icon pickup refills.

## Power-up pickups

| Pickup | Effect |
|--------|--------|
| Weapon-swap icon (Spread / Laser / Bounce) | Switch primary weapon to that type |
| Weapon-upgrade orb | +1 level to current primary (cap L3) |
| Extra grenade/mine | +N to morph-mine stock |
| Extra smart-bomb/freeze | +1 to freeze stock |
| Green diamond / gems | Score; every N diamonds = extra life |
| Extra life (1-UP) | +1 life (also from secret set pieces) |
| Shield / temporary invulnerability | Brief damage immunity |
| Health / energy | Restore energy bar |

## Upgrade model (suggested implementation)

- Each primary weapon tracks its own level 1-3 independently, OR a shared level
  that resets to L1 on weapon-type switch. **Decision needed** — logged in SPEC
  DECISIONS. Recommend: level is PER-weapon and persists, so switching back
  keeps your upgrade (more forgiving than original, better for a tribute).
- On death: original dropped you a weapon tier or reset. Recommend keep current
  weapon but drop one level on death.

## Sources

- Research bundle weapons facts (placeholder/minimal).
- General Turrican-series arsenal knowledge (reconstructed).
- http://example.com (placeholder from bundle — not authoritative)
