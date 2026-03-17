# Hard Hat Mac — Mobile Remake Design Doc

## Overview
A faithful mobile remake of the 1983 Apple II classic "Hard Hat Mack" by Electronic Arts. All original gameplay elements preserved — 3 distinct levels that loop with increasing difficulty. Graphics upgraded from Apple II lo-res to modern pixel-art style with lighting, particles, and smooth animation. Controls redesigned for touch.

## Original Game Elements (ALL preserved)

### Core Mechanics
- **3 Lives** — lose one when hit by hazard, falling off edge, or timer runs out
- **Bonus Timer** — counts down each level; reaching zero = lose a life
- **Movement** — walk left/right, climb up/down ladders/chains, jump
- **Springboards** — bounce Mack upward to higher platforms
- **Conveyor Belts** — push Mack in a direction, requiring timing
- **Elevators** — ride between platform levels
- **Score** — points for collecting items, completing levels, time bonus

### Enemies & Hazards (ALL preserved)
- **The Vandal** — circulates through the building, tags Mack on contact
- **OSHA Inspector** — patrols construction sites, acts as moving obstacle
- **Thrown Bolts** — rain down from above in Level 1
- **Pincers** — snap hazard to jump over (Level 2)
- **Dynamite** — explosive obstacle (Level 2)
- **Poison Boxes** — avoid on contact (Level 2)
- **Ceiling Squasher** — must duck under (Level 2)
- **Concrete Spigot** — dripping blobs to dodge
- **Falling** — death from falling off edges or through gaps

### Level 1: Building Framework
- **Layout:** 5 horizontal girders connected by chain ladders
- **Springboard** on the right edge, **elevator** on the left
- **Objective:** Pick up 4 loose girder pieces and place them in floor holes
- **Drill:** Moves in a pattern; once a girder is placed in a hole, ride the drill over it to secure it
- **Hazards:** Thrown bolts from above, Vandal circulating, OSHA Inspector patrolling
- **Completion:** All 4 girders placed and drilled

### Level 2: Construction Site
- **Layout:** 4-level construction site with central girder-elevator
- **Objective:** Collect 5 lunchboxes scattered across the levels
- **Mechanics:** Jump over pincers, dynamite, poison boxes; duck under ceiling squasher
- **Completion:** After all lunchboxes collected, ride a conveyor belt to be grabbed by an overhead electromagnet
- **Hazards:** Vandal, OSHA Inspector, pincers, dynamite, poison box, squasher, fall hazards

### Level 3: Factory / Rivet Machine
- **Layout:** Central circular conveyor with steps, surrounding platforms
- **Objective:** Collect 5 boxes/iron bars and drop each into a processor/rivet machine
- **Mechanics:** Jump on/off the circular conveyor, grab boxes, drop into corner processor
- **Springboards** from girders to reach tricky spots
- **Hazards:** OSHA Inspector near boxes, fall into pool/drowning hazard at bottom-left of conveyor
- **Completion:** All 5 boxes processed

### Looping & Difficulty
- After completing all 3 levels = 1 round
- Game loops with increased speed and difficulty each round
- Enemy patterns become faster and more aggressive
- Timer becomes tighter
- Endless play until all lives lost

## Mobile Controls

### Option A: Virtual D-Pad + Buttons (Recommended)
```
┌──────────────────────────┐
│                          │
│     [GAME AREA]          │
│                          │
│                          │
├──────────────────────────┤
│  [←] [→]   [↑][↓]  [JUMP] │
│   D-pad    Ladder   Action │
└──────────────────────────┘
```
- **Left/Right arrows** — walk
- **Up/Down arrows** — climb ladders/chains, duck (for squasher)
- **Jump button** — jump (also activates springboards)
- Buttons are semi-transparent, overlaid on game area bottom
- Haptic feedback on button press (if available)

### Touch Zones
- Left third: D-pad (left/right/up/down)
- Right third: Jump button
- Tap up near a ladder = auto-climb

## Visual Upgrade Plan

### From Apple II → Modern Pixel Art
- **Resolution:** Full device resolution with pixel-art sprites scaled up (32x32 base tiles)
- **Mack:** Animated walk cycle, climb animation, jump animation, hard hat with subtle shine
- **Girders:** Metallic with rivets, slight 3D bevel, rust accents
- **Ladders/Chains:** Detailed metallic with shadow
- **Background:** Construction site skyline, clouds, parallax layers
- **Enemies:**
  - Vandal: Distinct color, menacing walk cycle, slight glow
  - OSHA Inspector: Clipboard-carrying figure, different color scheme
- **Hazards:** Animated bolts with spin, sparking pincers, fizzing dynamite, glowing poison
- **Particles:** Sparks on girder placement, dust on landing, bolt impact flashes
- **Lighting:** Warm construction-site amber tones, subtle shadow under platforms
- **Screen shake** on death, girder placement
- **Smooth scrolling** camera if level is larger than viewport

### HUD
- Top-left: Score
- Top-center: Bonus timer (with color change yellow→red as it runs low)
- Top-right: Lives (hard hat icons)
- Current round indicator
- Level name subtitle on entry ("BUILDING FRAMEWORK", "CONSTRUCTION SITE", "FACTORY")

### Audio (Web Audio synthesized)
- **Jump** — short bounce boing
- **Walk** — subtle footstep tick
- **Climb** — metallic ladder clink
- **Collect item** — cheerful pickup ding
- **Place girder** — heavy metallic clank
- **Drill** — buzzing drill sound
- **Enemy contact/death** — crash/zap
- **Bolt impact** — metallic ping
- **Springboard** — sproing bounce
- **Conveyor** — mechanical hum
- **Electromagnet** — electric buzz
- **Timer warning** — beeping when low
- **Level complete** — victory jingle
- **Game over** — descending tones
- **Mute toggle** 🔊/🔇

### High Score System
- localStorage key: `hard_hat_mac_highscores`
- Top 10: 3-letter initials + score + round reached
- Show on game over + title screen button
- Touch-friendly ▲/▼ initials entry

## UI Flow
1. **Title Screen** — "HARD HAT MAC" with construction site art, START + HIGH SCORES buttons
2. **Level Intro** — Brief "LEVEL 1: BUILDING FRAMEWORK" splash (1.5s)
3. **Gameplay** — with HUD overlay
4. **Level Complete** — Score tally + time bonus animation
5. **Round Complete** — "ROUND X COMPLETE!" after all 3 levels
6. **Game Over** → High score entry if qualifying → Leaderboard
7. **Loop** — back to Level 1 with harder difficulty

## Technical Notes
- Single HTML file, canvas-based
- Tile-based collision (each level is a predefined tile map)
- 60fps with proper dt calculation
- All mobile fix checklist applied (touch handling, viewport, etc.)
- Level data stored as arrays of tile types
- Entity system for enemies, hazards, pickups
- State machine: title → playing → levelComplete → gameOver

## Level Data Structure
```
Tile types:
0 = empty/air
1 = solid platform/girder
2 = ladder
3 = chain
4 = conveyor left
5 = conveyor right
6 = springboard
7 = elevator rail
8 = hole (to fill, Level 1)
9 = hazard zone
```

Each level: 2D array + entity spawn list (enemies, pickups, hazards with positions and behavior patterns)

## Difficulty Scaling Per Round
| Round | Enemy Speed | Timer | Bolt Freq | Extra |
|-------|-----------|-------|-----------|-------|
| 1     | 1.0x      | 100%  | Normal    | Base  |
| 2     | 1.2x      | 90%   | +20%      | —     |
| 3     | 1.4x      | 80%   | +40%      | Extra vandal |
| 4     | 1.6x      | 70%   | +60%      | Faster conveyors |
| 5+    | 1.8x      | 60%   | +80%      | Max difficulty |
