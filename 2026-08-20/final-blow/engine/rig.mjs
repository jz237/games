// ---------------------------------------------------------------------------
// 2D SKELETAL RIG — 3.1 pilot, deathblow only, opt-in, off by default.
//
// WHY THIS EXISTS. Final Blow animates by swapping painted drawings. The best
// active beats hold ONE drawing for 7 ticks (117ms); SF6 shows a new pose every
// 16ms because it interpolates a skeleton. The most visible symptom of the gap
// is that DEATHBLOW'S WALK LEGS NEVER ALTERNATE: 37 of the 40 original walk
// cells lead with the same foot, and four separate art-generation waves failed
// to produce phase inversion (MOTION-ATLAS.md, "U2 walk phase — FAILED").
//
// On a rig that is arithmetic. Both legs read ONE authored single-leg cycle;
// the far leg samples it half a period later. Inversion is `phase + 0.5`. It
// cannot fail, and `walkAlternates()` at the bottom of this file asserts it.
//
// DETERMINISM. `rigPose` is a pure function of (rig, sim) with no Math.random,
// no Date, and no reads of module-level mutable state. Both online peers and
// every rollback resimulation of the same tick produce bit-identical poses —
// the same contract the sprite pose descriptors already keep.
//
// SCOPE. Walk and idle only. Every other beat still resolves to the shipped
// sprite bank; the renderer falls back to it, so nothing else changes.
// ---------------------------------------------------------------------------

export const RIG_FORMAT = "final-blow-rig-1";

// CADENCE, and why it is the ONLY lever on stance width.
//
// A non-skating rig has no free parameter here. While both feet are planted
// their world positions are fixed, so the gap between them IS the distance the
// body covered since the trailing foot landed — half a cycle. Therefore
//
//     ankle separation at contact  =  speed / (2 * cadence * pxPerCell)
//
// exactly, with nothing else to tune. Measured live (`?rig=p1`, held forward
// walk, engine `qa.rigWalk()`): deathblow walks 323 world px/s — his KIT speed,
// not the 383 roster default the 3.1 comment above was written from — and the
// rig draws at 1.116-1.147 world px per source-cell px, which is
// `fighterRenderSize/320` (1.2557) times the UNIFIED_CELL_ADJUST of whichever
// walk cell the sprite path would have drawn (0.889-0.913, cycling with the
// walk). At 5/3 cycles/s that put his feet 86.7 cell px apart at contact. The
// identity predicts 86.7.
//
// The drawings put them 123-127 apart: 123 between the two ankle joints of the
// rig's own source cell (ankleN 224, ankleF 101) and 126.8 between the sole
// centroids of the shipped walk bank's two contact keys. Hitting 123 exactly is
// arithmetic — 323 / (2 * 123 * 1.13) — and it lands on 1.16 cycles/s.
//
// 1.25 is where this actually sits, and the last 6% is bought back for hip
// height. Every cell of stance width is stance EXCURSION a single leg has to
// span, and a 97.16-cell leg spanning it drops the hips: at 1.16 they sit 20.5
// cells below the settled row at the stride extremes, at 1.25 they sit 17.0 —
// inside the 18 cells of figure height deathblow's OWN walk drawings lose
// between their passing keys (304px tall) and their contact keys (286). The
// artwork's own bob is the ceiling, and 1.25 is the widest stance that stays
// under it: 115.6 cell px at contact, 94% of the drawing's own. See STANCE_LEAD
// and HEEL_LIFT_KEYS for where the rest of that budget came from — without them
// the same width costs 24 cells of squat instead of 17.
//
// Nothing about the phase source changed: it is still a pure function of the
// same `walkTime`, and 1.25 cycles/s at 323 px/s is 2.5 steps/s over a 0.63 m
// step — a real cadence for a 1.85 m man at 1.56 m/s, where 5/3 was 3.3 steps/s
// (a jog's cadence walked at a walk's speed, which is what "mincing" means).
export const WALK_CYCLES_PER_SECOND = 1.25;

// Fraction of the cycle each foot spends planted. > 0.5 means both feet are
// down for 12% of the cycle — real double support, and the reason the walk does
// not read as a glide. Every point above 0.5 is also stance excursion a single
// leg has to span at full stride, which is why 3.5 spends four of the sixteen
// on stance width instead.
export const STANCE_FRACTION = 0.56;

// WHERE THE STANCE SITS RELATIVE TO THE HIP — the fraction of the stance
// excursion that is ahead of the hip at heel strike. 0.5 is symmetric, which is
// what 3.1-3.4 assumed and what pins the hips too low: the leading leg reaches
// forward over a foot that is FLAT on the floor, so every cell it gains costs
// the full reach budget, while the trailing leg reaches back over a foot that
// has rolled onto its toe and has 16 cells of ankle lift to spend (HEEL_LIFT
// below). Splitting the excursion in the drawing's own proportion — its leading
// ankle is 46 cells ahead of its hip and its trailing ankle 67 behind, so 0.41
// — overshoots the other way once the lift is modelled; 0.46 is where the two
// legs bind at the same hip row, which is the definition of the cheapest split.
export const STANCE_LEAD = 0.46;

// ---------------------------------------------------------------------------
// v3.4 WALK DYNAMICS. Live-showcase QA showed the choreographer's real
// locomotion is DUTY-CYCLED: the median forward burst is ~7 ticks with ~2-tick
// stops between (footsies tapping), and held approaches run at 323 px/s, not
// the 383 the amplitudes were tuned at. Three consequences, all measured:
//
//   1. `moving` was a binary |vx| gate, so every 2-tick stop SNAPPED the whole
//      body to the settled idle stance and back — feet teleporting to the
//      stance marks at ~8Hz is the "marionette" read.
//   2. Swing lift, ankle pitch and the secondary motion were CONSTANTS. A
//      7-tick burst advances the phase ~0.19 cycles and the ground ~28 cells,
//      but the swing leg posed as if mid-way through a full 144-cell stride —
//      knees hoisted to the 17-cell lift with the toe pointed, for a step
//      covering a fifth of that. High-stepping prancing, exactly as reported.
//   3. The stance constraint used |vx|, so a BACK walk moved the planted foot
//      backward relative to a body already moving backward — a 2x-speed
//      moonwalk skate on every retreat.
//
// The fix: the pose reads a SIGNED gait velocity (`sim.speedX`, + = advancing
// along facing) for the stride — sign fixes the back-walk constraint — and an
// amplitude speed (`sim.speedLift`, a slower-moving average the caller keeps)
// for lift/ankle/secondary motion, so tap-tap approaches keep the feet low
// while a genuinely held walk swings full. Posture (walk stance vs settled
// idle) blends continuously on the same signals instead of a boolean, so a
// stopping fighter SETTLES — foot lowering, arms coming back to guard — and a
// reversal passes through a brief weight-shift rather than a pop. Everything
// stays a pure function of the sim argument; the caller owns any smoothing.
// ---------------------------------------------------------------------------

// The stride the artwork was authored for (world px/s): the full-amplitude
// reference. |speedLift| at or above this swings the legs exactly like 3.3.
export const FULL_STRIDE_SPEED = 383;
// Below this |speedX| the posture starts blending toward the settled idle
// stance; at 0 it IS the settled stance, bit-for-bit.
export const SETTLE_SPEED = 140;
// Swing-leg lift at the full reference stride, in cell px (the 3.3 constant).
export const FULL_STRIDE_LIFT = 17;
// Runaway guard on the stride, in cell px. See the note where it is applied:
// this is a ceiling above every walk speed the game can hand the rig, NOT a
// tuning knob — a stride capped below the body's actual travel skates.
export const MAX_STRIDE_CELLS = 420;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const lerp = (a, b, t) => a + (b - a) * t;
// Endpoint-exact mix: at t=0 and t=1 it returns the input UNCHANGED (IEEE
// `a + (b - a)` is not always `b`), so a fighter that is genuinely stopped and
// one that is genuinely at full stride each land on ONE authored pose rather
// than on an interpolation that happens to round there.
const mix = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : a + (b - a) * t);
// Quintic smootherstep: zero first AND second derivative at both ends, so a
// limb entering or leaving a key has no velocity step. Linear interpolation is
// what makes cheap rigs look like clockwork.
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap01 = (t) => t - Math.floor(t);

// ---------------------------------------------------------------------------
// Keyframe channels. Each is [phase, value] sorted on phase over one cycle of
// ONE limb, interpolated with an eased curve and wrapping at the seam.
// ---------------------------------------------------------------------------

function sampleChannel(keys, phase) {
  const t = wrap01(phase);
  let index = keys.length - 1;
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i][0] > t) { index = i - 1; break; }
  }
  const [t0, v0] = index < 0 ? keys[keys.length - 1] : keys[index];
  const next = keys[(index + 1 + keys.length) % keys.length];
  const t1 = next[0];
  const v1 = next[1];
  let span = t1 - t0;
  if (span <= 0) span += 1;
  let local = t - t0;
  if (local < 0) local += 1;
  return lerp(v0, v1, smoother(clamp(span === 0 ? 0 : local / span, 0, 1)));
}

// Ankle pitch across one leg cycle, degrees, + = toe down. Heel strike at 0.00,
// foot flat by 0.12, heel off at 0.52, hard toe-off at the end of stance, then
// the toe lifts clear through the swing and drops for the next strike.
const ANKLE_KEYS = [
  [0.00, -11], [0.12, 2], [0.42, 4], [0.52, 13], [0.58, 25],
  [0.68, 9], [0.80, -2], [0.92, -13],
];

// ---------------------------------------------------------------------------
// v3.5 HEEL LIFT — the ankle rises over a foot that has rolled onto its toe.
//
// THE MEASUREMENT THIS COMES FROM. In the rig's own source drawing the two
// ankle joints are not on the same row: ankleN sits at cell row 286 and ankleF
// at 270, sixteen pixels higher, while BOTH sneakers bottom out on the floor
// (rows 318 and 316). That is not perspective — the shipped walk bank registers
// both feet to one floor row (315) and its two contact keys measure 2 px apart
// — it is PLANTARFLEXION: the trailing leg is pushing off, its heel is up, and
// an ankle over a foot standing on its toe is higher than one over a foot lying
// flat. Every 3/4 walk drawing in the bank does it, and it is exactly the pose
// that lets the artwork open a 123-cell stance with its hips still at row 200.
//
// The rig could not reproduce it because `footFar` is a CLONE of the near
// sneaker (tools/cut_rig.py, `clone_pivot: ankleN`) — the drawn push-off shoe
// was never cut as its own piece — and the near sneaker is drawn nearly flat
// with its toe only 3 px below the ankle. Rotating that piece toe-down does not
// raise its ankle; measured against the piece's own alpha the drop from ankle to
// lowest pixel goes 32.8 -> 29.3 across the whole authored pitch range, i.e.
// the foot roll is worth three cells, not sixteen.
//
// So the lift is modelled instead of rotated: the ANKLE rides up by this curve
// while the SHOE is offset back down by the same amount in world space. The
// sole therefore lands exactly where the foot curve puts it at every phase
// (`soleRow - swingLift`, which is the ground during the whole of stance), the
// shin — which is cut 21 px past its own ankle — covers the seam, and the read
// is a lengthening achilles over a heel coming off the floor. It is a cut-out
// cheat, and it is the one this rig cannot buy any other way.
//
// Peak 16 at toe-off is the drawing's own figure. Degrees of freedom it buys:
// at hip row 205 the trailing leg's horizontal reach goes 53.7 -> 70.4 cells.
// Heel-off starts at ~40% of a real gait cycle, and it has to here too: the
// double-support window IS the trailing leg's last tenth of stance, so a curve
// that only peaks at toe-off delivers its lift after the frame that needed it.
const HEEL_LIFT_KEYS = [
  [0.00, 0], [0.28, 0], [0.42, 5], [0.50, 11], [0.56, 16],
  [0.68, 9], [0.82, 0], [0.92, 0],
];

// Upper-arm swing, degrees, + = forward. Sampled half a cycle out of phase with
// the leg on the same side, which IS the counter-swing. The back half of the
// curve is faster than the front half (the arm is thrown back and drifts
// forward), which is what stops it reading as a metronome.
const ARM_SWING_KEYS = [
  [0.00, 15], [0.18, 9], [0.42, -4], [0.58, -13], [0.74, -5],
];

// Elbow flexion, degrees, always positive (an elbow only bends one way). Peaks
// with the forward swing. Deliberately shallow: deathblow's forearms are the
// bulkiest thing on him and a 35 degree elbow throws the gauntlet a long way
// off the body, which reads as a march rather than a walk.
const ARM_ELBOW_KEYS = [
  [0.00, 26], [0.18, 22], [0.42, 15], [0.58, 11], [0.74, 15],
];

// PER-BONE PHASE OFFSETS. Nothing in a body arrives at once: the forearm trails
// the upper arm, the torso trails the hips, the head trails the torso. These
// are small and they are most of what separates "organic" from "puppet".
const LAG = {
  foreArm: 0.055,
  torso: 0.035,
  head: 0.075,
};

// ---------------------------------------------------------------------------
// Rig loading — validate, index, topologically order.
// ---------------------------------------------------------------------------

export function createRig(json) {
  if (!json || json.format !== RIG_FORMAT) {
    throw new Error(`unsupported rig format: ${json && json.format}`);
  }
  const byName = new Map();
  for (const bone of json.bones) {
    if (byName.has(bone.name)) throw new Error(`duplicate bone: ${bone.name}`);
    byName.set(bone.name, bone);
  }
  const order = [];
  const state = new Map();
  const visit = (bone, trail) => {
    const mark = state.get(bone.name);
    if (mark === 2) return;
    if (mark === 1) throw new Error(`bone cycle: ${[...trail, bone.name].join(" -> ")}`);
    state.set(bone.name, 1);
    if (bone.parent) {
      const parent = byName.get(bone.parent);
      if (!parent) throw new Error(`bone ${bone.name} has unknown parent ${bone.parent}`);
      visit(parent, [...trail, bone.name]);
    }
    state.set(bone.name, 2);
    order.push(bone.name);
  };
  for (const bone of json.bones) visit(bone, []);
  for (const bone of json.bones) {
    if (!json.pieces[bone.piece]) throw new Error(`bone ${bone.name} has no piece ${bone.piece}`);
  }
  return {
    ...json,
    byName,
    order,
    drawOrderKeys: json.bones.map((bone) => bone.name),
    legs: {
      near: { thigh: "thighNear", shin: "shinNear", foot: "footNear", hip: "hipN" },
      far: { thigh: "thighFar", shin: "shinFar", foot: "footFar", hip: "hipF" },
    },
  };
}

// ---------------------------------------------------------------------------
// The walk.
// ---------------------------------------------------------------------------

// Where one foot wants to be, in cell pixels relative to its hip, at leg phase
// `t`. `stride` is the FULL distance the body covers in one cycle.
//
// The stance half is NOT keyframed and deliberately so: while a foot is planted
// its world position is fixed, so its body-relative position must move backward
// at exactly the body's speed. That is a constraint, not a taste, and writing it
// as a straight line is what makes the planted foot stay planted at every walk
// speed instead of at one tuned speed. The swing half is the authored part.
//
// v3.5: `lead` slides that whole line forward or back relative to the hip. It
// changes WHERE the foot is planted, never HOW FAST it travels while planted —
// the stance slope is still exactly -stride per cycle — so the no-skate
// guarantee is untouched by it and so is near-minus-far, which is what the
// crossings and the leading-artwork handoff are cut on.
export function footTarget(t, stride, lift, lead = 0.5) {
  const phase = wrap01(t);
  const span = STANCE_FRACTION * stride;
  const front = span * lead;
  if (phase < STANCE_FRACTION) {
    return { x: front - stride * phase, y: 0, planted: true };
  }
  const u = (phase - STANCE_FRACTION) / (1 - STANCE_FRACTION);
  const eased = smoother(u);
  return {
    x: lerp(front - span, front, eased),
    // biased early: the toe leaves the ground fast and the heel drifts down
    y: lift * Math.sin(Math.PI * Math.pow(u, 0.82)),
    planted: false,
  };
}

// How far below its ankle pivot the foot ARTWORK actually reaches once the
// piece is rotated by `theta` (screen radians, + = toe down). `hull` is the
// lower convex hull of the sneaker's own alpha in ankle-relative cell pixels,
// cut by tools/cut_rig.py and carried in the rig JSON — so "where does this
// drawing touch the floor" is measured off the pixels rather than assumed to be
// the one constant the flat rest pose happens to have.
//
// Through 3.4 the engine used that single constant (`ground.ankleHeight` = 32)
// at every pitch, so a heel-struck sole sank 0.8 cells THROUGH the floor and a
// toed-off one floated 2.7 above it. Small, but it is the same class of error
// as the one that lost the shin: a number read off one drawn pose and then
// applied to every pose the rig can reach.
export function soleDrop(hull, theta) {
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  let deepest = -Infinity;
  for (let i = 0; i < hull.length; i += 1) {
    const drop = hull[i][0] * sin + hull[i][1] * cos;
    if (drop > deepest) deepest = drop;
  }
  return deepest;
}

// ---------------------------------------------------------------------------
// 2-bone IK. Returns absolute limb directions in cell space (screen radians,
// +y down). `bend` picks the elbow/knee solution: +1 puts the joint forward.
// ---------------------------------------------------------------------------

export function solveTwoBone(hipX, hipY, targetX, targetY, upper, lower, bend) {
  const dx = targetX - hipX;
  const dy = targetY - hipY;
  const reach = upper + lower;
  const raw = Math.hypot(dx, dy);
  // never solve at full extension: acos(1) has infinite angular gain, so a
  // pinned foot would snap the knee straight and jitter a pixel either side
  const dist = clamp(raw, Math.abs(upper - lower) + 0.001, reach * 0.995);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((upper * upper + dist * dist - lower * lower) / (2 * upper * dist), -1, 1);
  const a = Math.acos(cosA);
  const upperDir = base - bend * a;
  const jointX = hipX + Math.cos(upperDir) * upper;
  const jointY = hipY + Math.sin(upperDir) * upper;
  const lowerDir = Math.atan2(targetY - jointY, targetX - jointX);
  return { upperDir, lowerDir, jointX, jointY, overReached: raw > reach * 0.995 };
}

// ---------------------------------------------------------------------------
// POSE. Pure function of sim state.
//
// sim = {
//   walkTime,   seconds, the fighter's own walk clock (already in the rollback
//               serialisation, so peers agree)
//   animTime,   seconds, drives breathing
//   speedX,     SIGNED gait velocity in WORLD px/sec, + = advancing along the
//               fighter's facing. Drives the stride: the sign is what keeps the
//               planted foot planted on a BACK walk too. The caller may ease
//               this across ticks; the pose is pure in whatever it is handed.
//   speedLift,  optional, unsigned amplitude speed (defaults to |speedX|) —
//               a slower-moving average of the same signal, so lift/ankle/
//               secondary amplitudes track the walk actually being taken
//               rather than one tick's bang-bang vx.
//   moving,     legacy boolean  } fallback when speedX is absent:
//   speed,      legacy |vx|     } speedX = moving ? speed : 0
//   pxPerCell,  world px per source-cell px (renderSize / 320)
//   fatigue,    0..1, deepens and quickens the breath
// }
// ---------------------------------------------------------------------------

export function rigPose(rig, sim) {
  const pxPerCell = sim.pxPerCell > 0 ? sim.pxPerCell : 1;
  const ground = rig.ground;
  const soleHull = ground.soleHull || [[0, ground.ankleHeight]];
  const joints = rig.joints;

  const speedX = Number.isFinite(sim.speedX)
    ? sim.speedX
    : (sim.moving ? Math.abs(sim.speed || 0) : 0);
  const speedLift = Number.isFinite(sim.speedLift) ? Math.abs(sim.speedLift) : Math.abs(speedX);
  // w — posture: 0 = the settled idle stance, 1 = the full walk posture.
  // Continuous, so stops SETTLE and starts pick up.
  const w = smoother(clamp(Math.abs(speedX) / SETTLE_SPEED, 0, 1));
  // g — amplitude: how much of the full authored swing this walk earns. From
  // the slow average, so a tapped approach keeps the knees low.
  const g = clamp(speedLift / FULL_STRIDE_SPEED, 0, 1);
  // Secondary motion (sway, torso counter, arm swing, head bob) fades less
  // than the legs — a small walk is still a walk, not a glide.
  const sec = 0.35 + 0.65 * g;
  // Lift and ankle articulation fade harder: a near-zero step keeps the feet
  // barely off the ground.
  const legAmp = Math.pow(g, 0.8);

  const walking = w > 0;
  const phase = wrap01((sim.walkTime || 0) * WALK_CYCLES_PER_SECOND);
  // stride in CELL pixels: whatever the body actually travels in one cycle,
  // SIGNED — negative on a retreat, which reverses the step so the stance
  // constraint cancels a backward body instead of doubling it.
  // The clamp is a runaway guard for a speed no walk can produce, and it has to
  // stay clear of every one that can: ENGAGING IT BREAKS THE PLANTED FOOT.
  // Inside the clamp the stance line's slope is exactly the body's speed and
  // the foot cannot slide; the moment the stride is capped below what the body
  // is actually covering, the planted foot skates by the difference. 260 was
  // sized against the 5/3 cadence; at 1.1 the same speeds ask for 50% more
  // stride, and 383 px/s — the roster's fastest forward walk — wanted 277.
  // MAX_STRIDE_CELLS covers every walk in the game with room over, and dashes
  // (622 px/s) never reach here: rigDrawSide bails on them.
  const strideCells = clamp(speedX / WALK_CYCLES_PER_SECOND / pxPerCell,
    -MAX_STRIDE_CELLS, MAX_STRIDE_CELLS);
  const lift = FULL_STRIDE_LIFT * legAmp;

  const breathRate = 5.2 + (sim.fatigue || 0) * 5.6;
  const breath = Math.sin((sim.animTime || 0) * breathRate);
  const breathDepth = 1 + (sim.fatigue || 0) * 1.35;

  const local = new Map();       // bone -> local rotation delta (radians)
  const offset = new Map();      // bone -> [dx, dy] extra translation, parent frame
  const scale = new Map();       // bone -> [sx, sy], piece-only (does not chain)
  const setLocal = (name, value) => local.set(name, value);

  // ---- feet ------------------------------------------------------------
  // Walk targets and the settled stance are BOTH computed and blended on w,
  // so a stopping fighter's swing foot comes DOWN and slides to its stance
  // mark over the settle instead of teleporting there the tick vx dies.
  const legPhase = { near: phase, far: wrap01(phase + 0.5) };
  const feet = {};
  // v3.5 PER-LEG GROUND ROWS. The ankle row is no longer one number shared by
  // both legs: each leg gets the row that puts ITS OWN foot artwork, at ITS OWN
  // phase, on the floor — the rotated sneaker's real depth below the ankle
  // (`soleDrop`) plus the heel lift modelled over a foot rolled onto its toe.
  // Inside the double-support window the leading leg is flat at row ~285 and
  // the trailing leg is on its toe up to 11.6 cells above it (the source
  // drawing's own ankleN/ankleF split is 16, reached at toe-off — by which
  // point that foot has already left stance). That split is where the stance
  // width below comes from: the trailing leg reaches back across a shorter
  // vertical span, so it can reach FURTHER back at the same hip height.
  const pitchOf = {};
  const heelOf = {};
  for (const side of ["near", "far"]) {
    pitchOf[side] = mix(
      side === "near" ? -4 : -2,
      sampleChannel(ANKLE_KEYS, legPhase[side]) * legAmp,
      w,
    );
    heelOf[side] = mix(0, sampleChannel(HEEL_LIFT_KEYS, legPhase[side]) * legAmp, w);
  }
  for (const side of ["near", "far"]) {
    const leg = rig.legs[side];
    const hip = joints[leg.hip];
    // Settled stance: feet pinned, so the weight shift below has to be
    // absorbed by the hips and knees exactly like a real one.
    const stand = side === "near" ? 30 : -27;
    const standX = joints.pelvis[0] + stand;
    // this leg's own contact row, this frame
    const contactRow = ground.soleRow
      - soleDrop(soleHull, (pitchOf[side] + FOOT_FLAT_TRIM) * DEG)
      - heelOf[side];
    if (w > 0) {
      const target = footTarget(legPhase[side], strideCells, lift, STANCE_LEAD);
      feet[side] = {
        x: mix(standX, hip[0] + target.x, w),
        // The swing lift blends on `w` exactly as it did through 3.4 — a
        // stopping fighter's foot comes DOWN over the settle instead of hanging
        // in the air on a frame the pose already calls planted. (`contactRow`
        // is the settled row at w=0 by construction: the heel lift is mixed on
        // w and the pitch has already resolved to the standing pitch.)
        y: mix(contactRow, contactRow - target.y, w),
        planted: w < 0.5 ? true : target.planted,
      };
    } else {
      feet[side] = { x: standX, y: contactRow, planted: true };
    }
  }

  // ---- pelvis ----------------------------------------------------------
  // The body's rise and fall is NOT authored: it is whatever height keeps both
  // legs inside their reach. That makes the two dips per cycle fall out of the
  // stride, so a long step automatically drops the hips further, and no walk
  // speed can ever hyper-extend a knee.
  //
  // v3.5 — THE HIPS HANG FROM THE LEGS. Through 3.4 the line above read
  // `restHipRow - crouch` and the reach loop below could only push the hips
  // DOWN from that constant. So the constant won on every frame where the feet
  // were near the body centre — most of the cycle, and the whole settled idle —
  // and a 97.65-cell leg was asked to span the ~90 cells between a pinned hip
  // and the ankle row. The leftover length has to go somewhere and it went into
  // the knee: 45-75 degrees of fold on frames the artwork was drawn at 7. A
  // painted 3/4 leg folded that far swings its calf sideways under a thigh
  // piece that is still covering it, and the rendered figure loses its shin.
  //
  // A walking body does the opposite: it hangs off whichever leg is carrying
  // it. So the hip row IS the reach constraint — a max over the legs, not a
  // floor under a constant — and it rides up at mid-stance and drops at the
  // stride extremes, which is the real two-dips-per-cycle the comment above
  // always described. Measured effect: mid-stance knee fold 45 deg -> 20 deg,
  // support-leg extension 0.92 -> 0.99 of bone reach.
  //
  // The clamp stays just inside full extension because acos has infinite
  // angular gain there; 0.995 plus a cell of clearance is close enough to read
  // as a straight leg and far enough to keep the knee solve stable.
  // The lateral weight shift is resolved FIRST because the reach budget below
  // is measured from the hip the IK will actually solve against. Through 3.4
  // the reach loop used the REST hip x and the slack in the old constant floor
  // absorbed the difference; with the hips carried tight against the reach
  // limit, a 1.7-cell sway is enough to put a planted foot out of range and
  // break the no-skate guarantee.
  const sway = mix(
    Math.sin((sim.animTime || 0) * 1.19 + 0.7) * 1.7,
    Math.sin(phase * TAU) * 1.1 * sec,
    w,
  );

  let hipRow = -Infinity;
  for (const side of ["near", "far"]) {
    const leg = rig.legs[side];
    const reach = (rig.byName.get(leg.thigh).length + rig.byName.get(leg.shin).length) * 0.995;
    const dx = feet[side].x - (joints[leg.hip][0] + sway);
    const span = Math.sqrt(Math.max(1, reach * reach - dx * dx));
    hipRow = Math.max(hipRow, feet[side].y - span);
  }
  // Standing, the hips ride the breath: the chest fills, the weight settles.
  // Without this the idle is a statue with a moving shirt.
  hipRow -= mix(breath * 0.9 * breathDepth, 0, w);
  hipRow += mix(1.6, 1.0, w);   // knee clearance: never solve dead straight

  offset.set("pelvis", [sway, hipRow - ground.restHipRow]);

  // Hip twist reads in 2D as a tilt of the pelvis, and it is derived from the
  // feet rather than authored so it can never disagree with them. The feet
  // themselves carry the stride scaling, so no extra amplitude factor here.
  const sep = feet.near.x - feet.far.x;
  const twist = w * clamp(sep / 90, -1, 1) * 4.2 * DEG;
  setLocal("pelvis", twist);

  // ---- torso / head ----------------------------------------------------
  const torsoPhase = wrap01(phase - LAG.torso);
  const torsoCounter = -Math.sin(torsoPhase * TAU) * 3.1 * DEG * sec * w;
  const torsoBreath = mix(breath * 0.9 * DEG * breathDepth, 0, w);
  const walkLean = 2.4 * DEG * w;
  setLocal("torso", torsoCounter - twist * 0.55 + torsoBreath + walkLean);
  // chest rise. Piece-only scale, so the collar swells without dragging the
  // head with it; the head gets a matching lift below instead.
  const chest = mix(breath * 0.011 * breathDepth, 0, w);
  scale.set("torso", [1 - chest * 0.45, 1 + chest]);
  offset.set("torso", [0, Math.sin(phase * 2 * TAU) * 0.5 * sec * w]);

  // The head counter-rotates to stay level. Without this the whole figure
  // reads as a rocking doll: the eyeline is what a viewer tracks.
  const headPhase = wrap01(phase - LAG.head);
  const torsoAbsRough = torsoCounter - twist * 0.55 + twist;
  const headLevel = -torsoAbsRough * 0.85;
  const headIdle = mix(Math.sin((sim.animTime || 0) * 1.94 + 1.3) * 0.85 * DEG, 0, w);
  setLocal("head", headLevel + headIdle
    + Math.sin(headPhase * TAU) * 0.9 * DEG * sec * w);
  offset.set("head", [0, -chest * 92]);

  // ---- arms ------------------------------------------------------------
  // The counter-swing: the arm on a side reads the LEG cycle half a period
  // away, so the near arm is forward exactly when the near leg is back.
  for (const side of ["near", "far"]) {
    const upper = side === "near" ? "upperArmNear" : "upperArmFar";
    const fore = side === "near" ? "foreArmNear" : "foreArmFar";
    // The walk swing and the light guard are both computed and blended on w,
    // so the arms come back UP into guard over the settle — the old boolean
    // snapped them, which read as a puppet losing its strings. The swing
    // amplitude rides `sec`: a small approach barely pumps the arms.
    const armPhase = wrap01(legPhase[side] + 0.5);
    const swing = sampleChannel(ARM_SWING_KEYS, armPhase) * sec;
    const elbowWalk = sampleChannel(ARM_ELBOW_KEYS, armPhase - LAG.foreArm);
    // A light guard: forearms up, which is the shipped idle's read. Cheap
    // secondary motion — the forearm lags the shoulder by a fifth of a beat.
    const guardShoulder = side === "near" ? -32 : -25;
    const guardElbow = side === "near" ? 70 : 57;
    const shoulderSway = breath * 1.5 * breathDepth;
    const elbowSway = Math.sin((sim.animTime || 0) * breathRate - 0.9) * 2.4 * breathDepth;
    // + swing is forward; screen-space forward rotation of a downward bone is
    // NEGATIVE (canvas rotate is clockwise with y down)
    setLocal(upper, mix(-(guardShoulder + shoulderSway) * DEG, -swing * DEG, w));
    setLocal(fore, elbowLocal(rig, side, mix(guardElbow + elbowSway, elbowWalk, w)));
    offset.set(upper, [0, -chest * 22]);
  }

  // ---- legs: IK --------------------------------------------------------
  // Resolve the pelvis alone first so the hips sit where the twist and the bob
  // have put them, then drive both legs from the feet.
  //
  // The conversion from IK's absolute directions to the local rotations FK
  // wants is one rule, applied three times: a bone's piece points along
  // `restAngle + accumulatedRotation`, so
  //     local = wantedDirection - restAngle - (parent's accumulated rotation).
  const pelvisNode = resolveChain(rig, local, offset, new Set(["pelvis"])).get("pelvis");
  for (const side of ["near", "far"]) {
    const leg = rig.legs[side];
    const thigh = rig.byName.get(leg.thigh);
    const shin = rig.byName.get(leg.shin);
    const cos = Math.cos(pelvisNode.angle);
    const sin = Math.sin(pelvisNode.angle);
    const hipX = pelvisNode.x + thigh.pivot[0] * cos - thigh.pivot[1] * sin;
    const hipY = pelvisNode.y + thigh.pivot[0] * sin + thigh.pivot[1] * cos;
    const ik = solveTwoBone(hipX, hipY, feet[side].x, feet[side].y,
      thigh.length, shin.length, 1);
    const thighAccum = ik.upperDir - thigh.restAngle;
    const shinAccum = ik.lowerDir - shin.restAngle;
    setLocal(leg.thigh, thighAccum - pelvisNode.angle);
    setLocal(leg.shin, shinAccum - thighAccum);
    // Ankle articulation scales with the step actually being taken: the full
    // heel-strike/toe-off curve at a full stride, a near-flat sole when the
    // steps are tiny — the pointed, dangling toe was half the prance read.
    // Resolved BEFORE the feet now (the contact row depends on it), so this is
    // the same number the ground row was solved against, not a second copy.
    setLocal(leg.foot, (pitchOf[side] + FOOT_FLAT_TRIM) * DEG - shinAccum);
  }

  const nodes = resolveChain(rig, local, offset, null);

  // ---- pose-dependent depth --------------------------------------------
  // The far forearm is the one limb whose layer genuinely changes: the drawing
  // hangs its fist OVER the shorts, so once it swings forward past the hip it
  // has to draw in front of the pelvis, and behind it once it swings back. The
  // near arm carries the mirror rule for poses that reach behind the body. The
  // legs run through the same resolver and deliberately never flip: in a 3/4
  // view the near leg is nearer at every phase, and pretending otherwise is
  // how a rig starts strobing.
  // Derived from the bone's own rotation, which is the only signal that
  // actually moves: the DRAWN far arm hangs well behind the pelvis, so any
  // world-space "is the wrist forward of the hip" threshold never fires.
  const farSwing = -(local.get("upperArmFar") || 0);      // + = swung forward
  const nearSwing = -(local.get("upperArmNear") || 0);
  const zOf = new Map();
  for (const bone of rig.bones) {
    let z = bone.z;
    if (bone.name === "foreArmFar" || bone.name === "upperArmFar") {
      // the drawing hangs the far fist OVER the shorts; once the arm swings
      // forward it has to draw there again, and behind them once it swings back
      if (farSwing > 3 * DEG) z += 9;
    } else if (bone.name === "foreArmNear" || bone.name === "upperArmNear") {
      // the mirror rule, for a pose that reaches behind the body plane
      if (nearSwing < -26 * DEG) z -= 26;
    }
    zOf.set(bone.name, z);
  }

  // ---- leg ART follows the stride role (v3.3) --------------------------
  //
  // THE 3.2 WALK BUG. The leg pieces were cut from ONE mid-stride drawing:
  // the near leg extended FORWARD (thigh rest 64°, screen-down-forward), the
  // far leg extended BACK (thigh rest 139°, down-back, foreshortened). The
  // skeleton alternates a true symmetric stride, so for half of every cycle
  // the FAR leg has to lead — and leading demands its thigh piece rotate ~93°
  // from rest. A painted, perspective-baked thigh a quarter-turn from its
  // authored orientation is a horizontal smear, and with the far leg's static
  // z slots (4-6) it draws BEHIND the near leg and the shorts, so the leading
  // leg vanished into the body leaving a floating shoe. Result: one half-step
  // read as a stride, the next as a crouched shuffle — "the legs are broken
  // when walking". (The 3.1 pilot's verification strips covered phases
  // 0.09-0.42 only — the near-led half — which is why it shipped unseen.)
  //
  // THE FIX: the ARTWORK follows the ROLE, not the bone. Whichever leg is
  // forward wears the near-leg pieces (authored leading: small rotations,
  // z 7-9, visible over the shorts hem); whichever trails wears the far-leg
  // pieces (authored trailing, z 4-6, tucked behind). The skeleton, the IK,
  // the planted-foot constraint and the stride are untouched — only which
  // drawing rides which bone chain. At the readable extremes of the stride
  // every piece now sits within ~20° of its authored orientation (the
  // near-90° rotations that remain happen only at the crossings, where the
  // legs overlap and hide each other), the leading leg draws in front, and
  // the swing foot passes BEHIND the planted one exactly the way the approved
  // near-led half already did. The handoff happens at the two foot crossings
  // per cycle, where the leg pieces overlap almost completely, and it is a
  // pure function of the same foot targets — deterministic, rollback-safe.
  //
  // When the near foot leads (the whole idle stance, and the already-approved
  // half of the walk) the map is empty and every bone wears its own artwork.
  const legArt = new Map();
  if (feet.near.x < feet.far.x) {
    for (const part of ["thigh", "shin", "foot"]) {
      legArt.set(rig.legs.near[part], rig.byName.get(rig.legs.far[part]));
      legArt.set(rig.legs.far[part], rig.byName.get(rig.legs.near[part]));
    }
  }

  // The heel lift moves the ANKLE, not the shoe: the sneaker is pushed back
  // down by the same amount so its sole lands exactly where the foot curve put
  // it (on the floor for the whole of stance). The offset has to be applied in
  // WORLD space — straight down the screen — so it is expressed in the piece's
  // own rotated frame here, where drawImage will undo the rotation.
  const footShift = new Map([
    [rig.legs.near.foot, heelOf.near],
    [rig.legs.far.foot, heelOf.far],
  ]);

  const draw = rig.bones
    .map((bone) => {
      const node = nodes.get(bone.name);
      const art = legArt.get(bone.name) || bone;
      const piece = rig.pieces[art.piece];
      const s = scale.get(bone.name);
      const shift = footShift.get(bone.name) || 0;
      const drawAngle = node.angle + (art === bone ? 0 : bone.restAngle - art.restAngle);
      return {
        name: bone.name,
        piece: art.piece,
        x: node.x,
        y: node.y,
        // the piece's pixels are pre-rotated for the ART bone's rest, so a
        // swapped piece needs the rest delta to land at the same absolute
        // limb direction: restArt + drawn = restBone + node.angle.
        angle: drawAngle,
        z: art === bone ? zOf.get(bone.name) : art.z,
        scaleX: s ? s[0] : 1,
        scaleY: s ? s[1] : 1,
        sx: piece.x, sy: piece.y, sw: piece.w, sh: piece.h,
        ox: -art.piecePivot[0] + shift * Math.sin(drawAngle),
        oy: -art.piecePivot[1] + shift * Math.cos(drawAngle),
      };
    })
    .sort((a, b) => a.z - b.z || a.name.localeCompare(b.name));

  return {
    walking,
    phase,
    strideCells,
    hipRow,
    feet,
    frontSide: feet.near.x >= feet.far.x ? "near" : "far",
    bones: draw,
    nodes,
    // v3.4 gait-dynamics telemetry: the signed velocity the stride was posed
    // from, the 0..1 amplitude the swing earned, and the swing lift in cells.
    speedX,
    gait: g,
    lift,
    // v3.5 stance telemetry. `soleRows` is where each foot's ARTWORK bottoms
    // out this frame — the number the no-float/no-sink contract is written on,
    // since the ankle rows now differ per leg by design. `heelLift` is how much
    // of that difference is the modelled push-off.
    heelLift: { near: heelOf.near, far: heelOf.far },
    soleRows: {
      near: feet.near.y + soleDrop(soleHull, (pitchOf.near + FOOT_FLAT_TRIM) * DEG) + heelOf.near,
      far: feet.far.y + soleDrop(soleHull, (pitchOf.far + FOOT_FLAT_TRIM) * DEG) + heelOf.far,
    },
    ankleSeparation: Math.abs(feet.near.x - feet.far.x),
  };
}

// The forearm pieces are cut mid-bend, so authored flexion has to be measured
// against the bend the DRAWING already has, not against zero. Solving
//   (forearm direction) - (upper-arm direction) = -flexion
// for the forearm's local rotation gives the line below; the negation is
// because canvas rotation is clockwise with y down, so an elbow closing forward
// is a negative angle.
function elbowLocal(rig, side, flexionDeg) {
  const upper = rig.byName.get(side === "near" ? "upperArmNear" : "upperArmFar");
  const fore = rig.byName.get(side === "near" ? "foreArmNear" : "foreArmFar");
  return -flexionDeg * DEG - (fore.restAngle - upper.restAngle);
}

// The near sneaker is drawn toe-down by this much; subtracting it makes ankle
// pitch 0 read as a flat sole.
const FOOT_FLAT_TRIM = -12;

// Forward kinematics over the topological order. `only` restricts the walk to a
// subset (used to place the pelvis before the legs are solved); null = all.
function resolveChain(rig, local, offset, only) {
  const nodes = new Map();
  for (const name of rig.order) {
    if (only && !only.has(name)) continue;
    const bone = rig.byName.get(name);
    const parent = bone.parent ? nodes.get(bone.parent) : null;
    if (bone.parent && !parent) continue;
    const parentAngle = parent ? parent.angle : 0;
    const px = parent ? parent.x : 0;
    const py = parent ? parent.y : 0;
    const off = offset.get(name) || [0, 0];
    const dx = bone.pivot[0] + off[0];
    const dy = bone.pivot[1] + off[1];
    const cos = Math.cos(parentAngle);
    const sin = Math.sin(parentAngle);
    const x = px + dx * cos - dy * sin;
    const y = py + dx * sin + dy * cos;
    const angle = parentAngle + (local.get(name) || 0);
    const dir = bone.restAngle + angle;
    nodes.set(name, {
      x, y, angle,
      tipX: x + Math.cos(dir) * bone.length,
      tipY: y + Math.sin(dir) * bone.length,
    });
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Render. Takes ctx as a parameter — nothing here reads a global — and lands
// the rig in EXACTLY drawAtlasFrame's footprint: the source cell is mapped onto
// the box (-size/2, -size) .. (size/2, 0), so a rigged fighter occupies the
// same world space, at the same scale, under the same mirror as the sprite.
// ---------------------------------------------------------------------------

export function drawRig(ctx, rig, image, pose, size) {
  const unit = size / rig.source.cellSize;
  ctx.save();
  ctx.translate(-size * 0.5, -size);
  ctx.scale(unit, unit);
  for (const bone of pose.bones) {
    ctx.save();
    ctx.translate(bone.x, bone.y);
    ctx.rotate(bone.angle);
    if (bone.scaleX !== 1 || bone.scaleY !== 1) ctx.scale(bone.scaleX, bone.scaleY);
    ctx.drawImage(image, bone.sx, bone.sy, bone.sw, bone.sh,
      bone.ox, bone.oy, bone.sw, bone.sh);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The audit the whole pilot is for. Returns the near/far foot X across one
// cycle plus the alternation verdict, so a unit test can assert what four art
// generations could not produce.
// ---------------------------------------------------------------------------

export function walkAlternates(rig, samples = 24, stride = 120) {
  const near = [];
  const far = [];
  for (let i = 0; i < samples; i += 1) {
    const t = i / samples;
    near.push(footTarget(t, stride, 17, STANCE_LEAD));
    far.push(footTarget(wrap01(t + 0.5), stride, 17, STANCE_LEAD));
  }
  let leadFlips = 0;
  let previous = Math.sign(near[0].x - far[0].x);
  for (let i = 1; i < samples; i += 1) {
    const sign = Math.sign(near[i].x - far[i].x);
    if (sign !== 0 && sign !== previous) { leadFlips += 1; previous = sign; }
  }
  const bothPlanted = near.filter((foot, i) => foot.planted && far[i].planted).length / samples;
  const airborne = near.filter((foot, i) => !foot.planted && !far[i].planted).length;
  return {
    leadFlips,
    alternates: leadFlips === 2,
    doubleSupportFraction: bothPlanted,
    airborneFrames: airborne,
    nearLeadRange: [Math.min(...near.map((f) => f.x)), Math.max(...near.map((f) => f.x))],
  };
}

export const prepareRig = createRig;
