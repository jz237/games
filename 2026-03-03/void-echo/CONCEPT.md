# Void Echo

## Premise
You are adrift in absolute darkness. The only way to see is to emit sonic pulses that ripple outward and briefly illuminate everything they touch. But the sound also attracts the Voids — formless creatures that hunt by vibration. See too little and you crash. See too much and they find you. Navigate, survive, destroy.

## Visual Style
**Pure black void with sonar ripple aesthetics.** When you pulse, concentric rings expand outward in cold white-blue. Where rings touch objects — asteroids, enemies, walls — they glow in that ring's color for a half-second before fading back to black. Enemies glow red-orange when illuminated. Your ship is a small white diamond, faintly visible at all times. The effect looks like underwater sonar crossed with a radar screen crossed with neon noir.

- Background: absolute black #000000
- Pulse rings: rgba(180, 220, 255, 0.6) expanding, fading alpha
- Illuminated objects: afterglow in cyan-white, fades 500ms
- Enemy glow: crimson pulse, slightly irregular (they breathe)
- Your ship: white diamond #FFFFFF, tiny engine trail of fading dots
- Screen edge: subtle vignette, always dark

## Core Mechanics
1. **Echo pulse** — Tap to emit a sonar ring. It travels outward 300px before dying
2. **Object illumination** — Rings reveal asteroids, Void creatures, power nodes
3. **Passive drift** — Your ship drifts in the direction you last tapped (momentum)
4. **Void hunters** — Move toward the source of your last pulse. The louder (bigger pulse) the more they converge
5. **Big pulse / whisper** — Hold longer for bigger range (more visibility, more danger)
6. **Destroy** — Catch a Void in the intersection of two simultaneous pulses from different angles — constructive interference destroys it
7. **Survive 60 seconds** — Score = Voids destroyed + distance traveled

## What Makes It Weird
This is a game of information economics. Every "look" is also a "shout." Perfect information = guaranteed death. It plays with anxiety in a way few games do — the fear of seeing is as real as the fear of not seeing. Two AIs playing look completely different: one pulses constantly and fights aggressively, one barely pulses and drifts silently, surviving by invisibility.
