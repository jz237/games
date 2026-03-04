# Chromal Drift

## Premise
Liquid paint flows down a tilted canvas. You place redirectors — curved barriers, funnels, and splitters — to guide streams into drain targets. Colors mix in real time: red + blue = purple, yellow + blue = green. Miss a target, and the canvas drowns in muddy brown.

## Visual Style
**Wet watercolor on white canvas.** Flows bleed at the edges, colors blush and feather where they collide. The UI is a wooden artist's frame. Gradient bloom where streams split. A soft, organic aesthetic — this feels alive, not digital.

- Palette: Deep crimson, cadmium yellow, ultramarine, emerald
- Canvas texture: visible paper grain under the paint
- Animation: fluid sim with slight turbulence, color diffusion rings on impact
- Each level starts pristine white. By end it's a beautiful or hideous painting

## Core Mechanics
1. **Flow physics** — paint streams fall at constant rate, split at splitters, merge at junctions
2. **Color mixing** — additive pigment mixing (not light mixing). Three primaries combine to secondaries
3. **Redirectors** — curved walls deflect streams; you place/rotate them pre-round
4. **Drain targets** — each accepts one specific color. Wrong color = overflow
5. **Combo chains** — routing same color through multiple targets multiplies score
6. **Canvas pressure** — too much overflow raises "mud meter"; hit 100% = game over

## What Makes It Weird
The game generates a literal painting. You can export your final canvas as art. Two players making the same level produce completely different paintings. It's a puzzle game that's also an accidental art generator. The AI vs AI matches look like watching a drunk Monet argue with a drunk Picasso.
