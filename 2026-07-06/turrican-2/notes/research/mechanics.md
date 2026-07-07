# Mechanics — Research Notes

> Original homage. Values below are reconstructions of the FEEL of the Amiga
> original, expressed as tunable constants for a fresh implementation — not
> extracted ROM data.

## Confirmed from research bundle

- **Jump**: single jump, no double jump. Triggered by joystick up (original
  used up-to-jump). In a modern build, map to a dedicated Jump button AND
  optionally up.

## Signature Turrican mechanics (well-known from the series; reconstructed)

- **Morph wheel (Gyroscope / rolling ball)**: Bren transforms into a spinning
  wheel that fits through tight gaps, moves fast along the ground, and drops
  mines/bombs. Cannot shoot the main weapon while morphed; is invulnerable-ish
  to some contact but still dies to hazards. Used to reach secret areas.
- **Power line (rotating beam / "whip")**: A tethered energy beam Bren aims by
  holding fire and rotating the stick through 180-270 degrees. Sweeps enemies
  and reveals hidden blocks. Holding the button stops movement while aiming.
- **Freeze / Smart-bomb secondary**: A limited-use screen-clearing / freeze
  attack. Freezes or damages all on-screen enemies. Stocked as a countable
  pickup.
- **No shooting while morphed; power line locks movement while charging.**

## Physics feel (tuned starting values — tune in playtest)

All values assume a **fixed timestep of 60 Hz** and a tile size of **16 px**
(scale up 2x-3x for display). Positions in pixels, velocities in px/frame
unless noted.

| Constant | Suggested start | Notes |
|----------|-----------------|-------|
| `GRAVITY` | 0.55 px/frame^2 | Downward accel each frame while airborne |
| `MAX_FALL_SPEED` | 9.0 px/frame | Terminal velocity clamp |
| `JUMP_VELOCITY` | -9.5 px/frame | Initial upward impulse (single jump) |
| `JUMP_CUT_MULT` | 0.45 | Multiply upward vel when jump released early (variable height) |
| `RUN_ACCEL` | 0.7 px/frame^2 | Ground horizontal acceleration |
| `AIR_ACCEL` | 0.45 px/frame^2 | Reduced air control |
| `MAX_RUN_SPEED` | 3.2 px/frame | Ground top speed (brisk, Turrican is fast) |
| `GROUND_FRICTION` | 0.80 | Multiplier per frame when no input on ground |
| `AIR_FRICTION` | 0.92 | Multiplier per frame when no input airborne |
| `COYOTE_FRAMES` | 5 | Frames after leaving ledge you can still jump |
| `JUMP_BUFFER_FRAMES` | 5 | Frames a jump press is remembered before landing |
| `MORPH_SPEED` | 4.5 px/frame | Wheel moves faster than running |
| `MORPH_GRAVITY_MULT` | 1.0 | Same gravity while morphed |
| `WIND_FORCE` | 0.25 px/frame^2 | Lateral/vertical push in windy sections (W1, W2 climb) |
| `WATER_GRAVITY_MULT` | 0.35 | Reduced gravity underwater (W2) |
| `WATER_MOVE_SPEED` | 2.4 px/frame | Free 8-directional swim speed underwater |
| `INVULN_FRAMES_ON_HIT` | 90 | I-frames after taking damage |
| `KNOCKBACK_ON_HIT` | 3.0 px | Horizontal shove on damage |

### Feel guidance
- Turrican II is **fast and floaty-but-heavy**: high top speed, snappy accel,
  a meaningful terminal velocity. Jump should feel controllable (variable
  height via `JUMP_CUT_MULT`).
- Add **coyote time** and **jump buffering** even though the original lacked
  them — they make the maze platforming forgiving without changing character.
- Underwater (W2): reduce gravity, allow 8-directional swim, cap speed.
- Windy sections: apply constant lateral/vertical `WIND_FORCE` the player must
  fight against, especially in the W2 vertical climb.

## Camera / world

- Multi-directional scrolling camera that follows the player with a small
  dead-zone (~48 px box), clamped to level bounds.
- Shmup (World 3): auto-scrolling camera. Horizontal for 3-1; horizontal +
  vertical for 3-2; fast horizontal for 3-3. Player ship has free movement
  within the visible frame; touching the frame edge = no scroll override.
- **Per-stage countdown timer**; on expiry, lose a life and respawn at last
  checkpoint (suggested start: 300 s for large platform stages; 120 s for shmup
  stages — original exact value unknown, tune).

## Lives / continues (reconstructed defaults — tune)

- `START_LIVES = 3`, extra life at score thresholds and via green diamonds.
- Checkpoints at stage midpoints for platform worlds.
- Continues: password-style or limited retries. Suggest 3 continues.

## Sources

- Research bundle mechanics facts (jump = single, no double).
- General Turrican-series knowledge for morph wheel / power line / freeze
  (reconstructed feel; no ROM data used).
- http://example.com (placeholder from bundle — not authoritative)
