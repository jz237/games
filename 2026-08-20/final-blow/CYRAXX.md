# Cyraxx rebuild

The 1.0 Cyraxx was an invented cyber-goth rocker: purple and green dyed hair,
torn leather and tactical straps, tattoos, and a microphone-stand staff weapon.
None of that matched the supplied reference. All three production assets have been
regenerated together so the character is consistent everywhere.

## Identity

Built from `assets/references/cyraxx-chance-blue-shirt.jpg`, which stays the
authority wherever anything else disagrees. The rebuilt character carries every
identity cue the backlog lists:

- high, notably receding hairline with a bare forehead
- sparse longer straight mid-brown hair only at the sides and back
- a long, narrow, pointed mid-brown beard down the chest
- pale complexion, lean narrow face, hollow cheeks, prominent long nose
- slim frame, narrow rounded sloping shoulders, thin arms
- a distinctly forward-leaning, slightly hunched stance
- a **plain muted dusty blue short-sleeve T-shirt** with no logo or print, over
  plain dark grey trousers and worn dark sneakers

No leather, armour, torn tactical clothing, straps, tattoos, piercings, dyed hair,
fantasy costume or weapons anywhere in the set.

His purple and acid-green feedback powers survive only as restrained translucent
overlays around his hands, feet and released attacks. They never cover, tint or
recolour his face, beard, shirt, trousers or silhouette — the specials sheet was
regenerated once specifically because the first attempt tinted his trousers purple
on one frame.

## The three assets

| Asset | Format | Notes |
| --- | --- | --- |
| `assets/fighters/cyraxx.webp` | 588x720 RGBA | Select portrait and victory pose cutout |
| `assets/atlases/cyraxx.webp` | 1280x1280 RGBA | 4x4 combat atlas, 320px cells |
| `assets/moves/cyraxx-specials.webp` | 1280x1280 RGBA | 4x4 specials atlas, frame 15 is the victory pose |

Generated with **GPT Image 2** through fal, each atlas as a single 16-cell sheet so
the character stays consistent across frames rather than drifting between sixteen
separate generations.

## Pipeline

`tools/build_atlas.py` and `tools/build_portrait.py` do the conversion. The builder
keys the flat magenta backdrop with a soft edge and a despill pass so no pink
fringe survives over a dark stage, finds the real row bands (splitting at the
emptiest scanline when figures in adjacent rows touch), derives **one global scale**
from the tallest standing frame so the fighter never pulses between frames, drops
stray generator fragments, and writes the exact cell gutters, transparent alpha,
scale, facing and per-frame animation roles the runtime expects.

## Blocker worked around

The fal MCP `generate_image` tool exposes a prompt only — there is no image input,
so `openai-gpt-image-2-edit` could not be driven with the reference photo directly.
The likeness was instead specified in words from the reference. If image-to-image
becomes available, re-running the same two sheets through the edit model with the
photo attached would tighten the likeness further without changing anything else.

## Verification

The browser suite loads all three assets and asserts every atlas cell contains a
full sprite, no keyed magenta survives as a fringe, the blue shirt is a measurable
part of the palette in each asset, and the dimensions are exactly 1280x1280 and
588x720.
