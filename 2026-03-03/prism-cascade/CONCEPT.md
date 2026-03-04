# Prism Cascade

## Premise
A beam of pure white light enters a crystal chamber. You have a collection of prisms, mirrors, and filters to place on a grid. Each prism splits white light into its spectrum. Mirrors redirect beams. Color filters absorb everything except their frequency. Your goal: route the correct colored beams to matching targets — but every extra beam you leave unguided costs points, and beams that collide create new combined colors with their own properties.

## Visual Style
**Dark obsidian crystal chamber, neon laser aesthetic.** The grid is deep dark slate. Beams are razor-sharp colored lines with a tight glow bloom — hot pink, electric cyan, acid yellow, pure crimson. Prisms are geometric glass shapes with slight refraction rendering. When beams intersect, a starburst flares. The whole thing looks like a physics textbook illustration designed by a synthwave artist.

- Background: near-black #0d0d1a with subtle hex grid lines
- Beams: 2px solid core + 8px bloom glow, fully saturated RGB colors
- Prisms: semi-transparent triangles, slight caustic rainbow edge
- Mirrors: metallic silver rectangles with reflection sheen
- Targets: glowing rings in target color, pulse when receiving correct beam
- Hit effects: beam terminus flares on impact

## Core Mechanics
1. **White beam source** — Enters from one edge. Pure white (#FFFFFF)
2. **Prism** — Splits white → Red + Green + Blue rays at angles. Splits colored → narrower split
3. **Mirror** — Reflects at 45° or 90°. Preserves beam color
4. **Color filter** — Absorbs all but one frequency. Reduces brightness
5. **Beam mixing** — Red + Green = Yellow. Green + Blue = Cyan. Red + Blue = Magenta. All three = White (re-combined)
6. **Targets** — Accept only their specific color. Wrong color = -10 pts/s
7. **Cascade** — Beams that chain through 3+ elements score multipliers
8. **Limited inventory** — You get 3 prisms, 4 mirrors, 2 filters per puzzle. Use them wisely

## What Makes It Weird
The puzzle space is enormous — even with a small grid and limited pieces, the number of possible beam paths is astronomical. Unlike most puzzle games, there are multiple valid solutions, and the game rewards elegant ones (fewest pieces, most targets hit, cleanest beam paths). An AI finding a wild multi-bounce 5-color solution feels like watching a proof. It's light physics as art.
