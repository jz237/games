# Stage crowds

## Kensington & Allegheny

The K&A street is now genuinely occupied. `engine/crowd.mjs` builds **32
pedestrians** once per round from the match seed and animates them purely from the
simulation tick, so the crowd is byte-identical under replay, rollback, the
AI-vs-AI demo and automated tests while never touching gameplay state.

**At least 27 are on screen at any moment** — the walking band is only slightly
wider than the 1280px frame, so the street never empties.

### Depth

Three layers, each with its own scale, walking speed, opacity, detail level and
parallax factor:

| Layer | People | Scale | Speed | Opacity | Parallax |
| --- | --- | --- | --- | --- | --- |
| far | 14 | 0.58 | 0.42 | 0.72 | 0.09 |
| mid | 11 | 0.74 | 0.68 | 0.82 | 0.17 |
| near | 7 | 0.92 | 1.00 | 0.90 | 0.29 |

Every layer sits well above the fighters' floor line and none of them are in
collision space — the crowd is drawn before the fighters and has no simulation
presence whatsoever.

### Variety

Each pedestrian is generated with its own posture archetype, build, height, width,
shoulder slope, head tilt, direction, pace, gait phase, pause rhythm, coat,
trousers, accent colour, hood, hat and bag. There are seven posture archetypes,
weighted so **hunched, shuffling, stooping and lingering figures make up around
84%** of the crowd, with a minority of upright walkers and leaners for contrast.

Nothing is synchronised: pace, gait phase, pause period, pause length and pause
offset are all independent, so two neighbours on the same layer drift apart within
seconds and stop at different times for different lengths.

### Contrast

The palette is deliberately mid-tone and desaturated, the crowd is drawn behind
the fighters, and every figure carries a soft contact shadow so it sits on the
pavement. The brightest values, sharpest edges and strongest effects stay with the
playable characters.

### Reactions

A landed special stirs the crowd slightly, a super stirs it hard, and the
finishing prompt stirs it hardest. Reacting pedestrians flinch and hunch for a
moment, then decay back to their routes — they never become interactive.

### Performance

Figures are drawn with plain canvas primitives, culled the moment their
parallaxed position leaves the frame, and drop bag and hat detail on the far
layer. The browser suite asserts the crowd stays at 25 or more visible on the
844x390 landscape target as well as on desktop.
