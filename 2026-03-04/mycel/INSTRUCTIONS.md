# MYCEL — Build Instructions

## Stack
- Pure HTML5 Canvas, no dependencies
- Single `index.html` file

## Architecture

### Hex Grid
- Axial coordinate system (q, r)
- Pointy-top hexagons, ~38px radius
- Offset rendering for centering on canvas
- 6 neighbors per cell via axial direction vectors

### Cell State
```js
cell = { owner: 'none'|'player'|'ai', nutrient: bool, stunned: bool, pulseAnim: 0 }
```

### Game Loop
1. Player taps hex → validate (adjacent to owned cell, empty, have spores)
2. Expand to that hex, consume spore, check for nutrient
3. AI takes turn: BFS from AI cells, score candidates by (distance to nutrients, distance to player border), pick best, expand
4. Check win: no empty cells → count and show result

### AI Difficulty
- Level 1: Pure BFS to nearest nutrient
- Level 2: Weights toward cutting off player paths + nutrient seeking
- Level 3: Lookahead 2 steps, prioritizes blocking player more aggressively

### Visual Effects
- Tendril grow animation: draw line from parent to child cell over 300ms
- Bioluminescence pulse: `sin(time)` brightness oscillation per owned cell
- Nutrient node: bouncing glow, disappear with particle burst when absorbed
- Stun pulse: expanding ring from sacrificed cell, grays out AI neighbors briefly

### Controls
- Tap/click valid neighbor hex to expand
- Long-press own cell (500ms) to sacrifice it (stun pulse)

### HUD
- Spores counter (player in blue, AI in red) top of screen
- Cell count tally
- Turn indicator
