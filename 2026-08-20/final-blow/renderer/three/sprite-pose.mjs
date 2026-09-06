// Pose-parity maths shared by the CINEMA 3D fighter layer and its tests.
// No "three" import: this is the part of poseRig that must agree with
// drawFighter in game.js to the pixel, so it lives where Node can pin it.
//
// 5.1 (#44) closed three gaps between the two renderers:
//   - the MIRROR: the 2D path multiplies the fighter's numeric facing by
//     atlasFrameFacing (Post's base bank is left-authored on 13/16 cells, his
//     specials on 12/16); 3D used the facing alone, so Post looked away from
//     his opponent on every special in 3D — the exact bug Jez reported once
//     already on the 2D path (1.9E);
//   - the PRONE SETTLE: a knocked-down billboard pivoted about the feet and
//     was left where the pivot put it, which for a tilted cell buries the
//     back half of the body in the boards and for an authored-flat cell
//     floats it by its bottom padding;
//   - the HITSTOP TREMBLE and the EXHAUSTION HUNCH, which 3D simply did not
//     have (MOTION FIX 4: "victims never freeze solid").
import { atlasFrameFacing } from "../../engine/atlas-facing.mjs";

// The 2D presentation hash, verbatim (game.js presentationHash01): the
// tremble is hashed from the sim tick so both renderers shiver the same
// victim by the same pixel on the same tick, and a rollback has nothing to
// rewind. tests/cinema-fighters.test.mjs pins it against the game.js source.
export function presentationHash01(...nums) {
  let h = 2166136261;
  for (const n of nums) {
    h ^= Math.imul((n | 0) + 0x9e3779b9, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The 2D renderMirror: numeric facing x the direction the authored cell points. */
export function spriteMirror(fighterId, bank, frame, facing) {
  return (facing >= 0 ? 1 : -1) * atlasFrameFacing(fighterId, bank, frame);
}

// A rotation the 2D path applies AFTER ctx.scale(mirror, 1), expressed as a
// three.js z-rotation on the (already mirrored) mesh. Canvas rotates y-down
// (clockwise positive) and three rotates y-up (counter-clockwise positive),
// and a rotation under an x-mirror flips sign, so theta_three = -mirror*theta.
export function postMirrorRotation(thetaCanvas, mirror) {
  return -mirror * thetaCanvas;
}

/**
 * MOTION FIX 4 parity: the 1-2 px pose shiver a stunned victim carries
 * through every hold window (hitstop and the multi-hit super storms),
 * re-hashed per sim tick. Returns sim px in the 2D convention (x right,
 * y DOWN) or null when the 2D path would not tremble either.
 */
export function hitstopTremble({
  reducedMotion = false, hitstunFrames = 0, cinematicFrame = null,
  hitstop = 0, opponentSuper = false, tick = 0, side = 0,
}) {
  if (reducedMotion || !(hitstunFrames > 0) || cinematicFrame !== null) return null;
  if (!(hitstop > 0) && !opponentSuper) return null;
  const trembleTick = tick * 2 + side * 17;
  return {
    x: (presentationHash01(trembleTick, 3) - 0.5) * 3.2,
    y: (presentationHash01(trembleTick, 7) - 0.5) * 1.8,
  };
}

/**
 * The hunched-forward exhaustion lean (drawFighter): canvas radians applied
 * post-mirror once idle health dips under 25%. 0 unless breathing and still.
 */
export function exhaustionLean({ breathing, moving, health, reducedMotion = false }) {
  const exhausted = breathing && !moving && health < 25 ? 1 - health / 25 : 0;
  return exhausted > 0 ? 0.085 * exhausted * (reducedMotion ? 0.5 : 1) : 0;
}

/**
 * The 2D prone transform in world terms. drawFighter does
 *   ctx.rotate(-facing * downTilt); ctx.translate(-facing * 45 * share, 17 * share)
 * — the translate is in the ROTATED frame, so at full tilt it moves the body
 * ~6.7 px toward the facing and ~47.6 px DOWN THE SCREEN (not 17 px down and
 * 45 px back, which is how the 3D layer had been reading it). Returns the
 * three.js z-rotation plus that offset split into its world axes, sim px:
 * dx (+right) and dyScreen (+down the 2D screen).
 */
export function proneTransform({ facing, downTilt, downTiltRadians = 1.35 }) {
  const dir = facing >= 0 ? 1 : -1;
  if (!(downTilt > 0)) return { rotation: 0, dx: 0, dyScreen: 0, share: 0 };
  const share = downTilt / downTiltRadians;
  const thetaCanvas = -dir * downTilt;
  const localX = -dir * 45 * share;
  const localY = 17 * share;
  const cos = Math.cos(thetaCanvas);
  const sin = Math.sin(thetaCanvas);
  return {
    rotation: dir * downTilt,                // canvas y-down -> three y-up flips the sign
    dx: localX * cos - localY * sin,
    dyScreen: localX * sin + localY * cos,
    share,
  };
}

/**
 * How far to lift (positive) or drop a feet-anchored, rotated sprite quad so
 * the lowest corner of its measured silhouette box rests `restBelow` world
 * units under the ground plane (a whisker below zero buries the antialiased
 * skirt in the boards instead of leaving a bright hairline gap).
 *   rotation — the root's three.js z-rotation;
 *   scaleX / scaleY — the mesh scale (scaleX signed by the mirror);
 *   extent — footMetricsFromPixels' per-cell { left, right, top, bottom }.
 * With rotation 0 this is just the bottom-padding drop the upright path
 * applies; with the 1.35 rad down tilt it is the ~half-body-width lift that
 * keeps the lying back out of the floor.
 */
export function proneSettleLift({ rotation, scaleX, scaleY, extent, restBelow = 0.01 }) {
  const box = extent || { left: -0.5, right: 0.5, top: 1, bottom: 0 };
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let minY = Infinity;
  for (const u of [box.left, box.right]) {
    for (const v of [box.bottom, box.top]) {
      const x = u * scaleX;
      const y = v * Math.abs(scaleY);
      const worldY = x * sin + y * cos;
      if (worldY < minY) minY = worldY;
    }
  }
  return -restBelow - minY;
}
