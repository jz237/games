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

// The sprite walk advances its 4 keys on `Math.floor(walkTime * 10) % 4` — 10
// keys/sec over a 4-key cycle, so 2.5 cycles/sec. The rig runs 5/3, exactly two
// thirds of it (3 rig cycles per 5 sprite cycles), and the reason is a
// measurement worth writing down:
//
//   forward walk is 383 world px/s and one sprite cycle is 0.4s, so the body
//   only travels 153 world px = 122 source-cell px per cycle. Held to that, a
//   NON-SKATING rig puts the feet 71 cell px apart at contact. The shipped walk
//   drawings put them 128-130 apart. The sprite cycle is therefore drawn at
//   roughly 1.8x the stride the simulation actually covers — i.e. the shipped
//   walk skates, and it has to, because a drawing cannot know the speed.
//
// A rig can. At 5/3 the stride is 183 cell px and the feet land 106 apart,
// which is close to what the artist drew and is what a 1.85m man moving at
// 1.76 m/s actually does. Nothing about the phase source changed: it is still a
// pure function of the same `walkTime`.
export const WALK_CYCLES_PER_SECOND = 5 / 3;

// Fraction of the cycle each foot spends planted. > 0.5 means both feet are
// down for 16% of the cycle — real double support, and the reason the walk does
// not read as a glide.
export const STANCE_FRACTION = 0.58;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
const lerp = (a, b, t) => a + (b - a) * t;
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
export function footTarget(t, stride, lift) {
  const phase = wrap01(t);
  const half = (STANCE_FRACTION * stride) / 2;
  if (phase < STANCE_FRACTION) {
    return { x: half - stride * phase, y: 0, planted: true };
  }
  const u = (phase - STANCE_FRACTION) / (1 - STANCE_FRACTION);
  const eased = smoother(u);
  return {
    x: lerp(-half, half, eased),
    // biased early: the toe leaves the ground fast and the heel drifts down
    y: lift * Math.sin(Math.PI * Math.pow(u, 0.82)),
    planted: false,
  };
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
//   moving,     boolean
//   speed,      |vx| in WORLD px/sec — the stride is derived from it, so back
//               walking automatically shortens the step instead of skating
//   pxPerCell,  world px per source-cell px (renderSize / 320)
//   fatigue,    0..1, deepens and quickens the breath
// }
// ---------------------------------------------------------------------------

export function rigPose(rig, sim) {
  const pxPerCell = sim.pxPerCell > 0 ? sim.pxPerCell : 1;
  const ground = rig.ground;
  const ankleRow = ground.soleRow - ground.ankleHeight;
  const joints = rig.joints;

  const walking = Boolean(sim.moving);
  const phase = wrap01((sim.walkTime || 0) * WALK_CYCLES_PER_SECOND);
  // stride in CELL pixels: whatever the body actually travels in one cycle
  const strideCells = walking
    ? clamp(Math.abs(sim.speed || 0) / WALK_CYCLES_PER_SECOND / pxPerCell, 0, 260)
    : 0;
  const lift = 17;

  const breathRate = 5.2 + (sim.fatigue || 0) * 5.6;
  const breath = Math.sin((sim.animTime || 0) * breathRate);
  const breathDepth = 1 + (sim.fatigue || 0) * 1.35;

  const local = new Map();       // bone -> local rotation delta (radians)
  const offset = new Map();      // bone -> [dx, dy] extra translation, parent frame
  const scale = new Map();       // bone -> [sx, sy], piece-only (does not chain)
  const setLocal = (name, value) => local.set(name, value);

  // ---- feet ------------------------------------------------------------
  const legPhase = { near: phase, far: wrap01(phase + 0.5) };
  const feet = {};
  for (const side of ["near", "far"]) {
    const leg = rig.legs[side];
    const hip = joints[leg.hip];
    if (walking) {
      const target = footTarget(legPhase[side], strideCells, lift);
      feet[side] = { x: hip[0] + target.x, y: ankleRow - target.y, planted: target.planted };
    } else {
      // Settled stance: feet pinned, so the weight shift below has to be
      // absorbed by the hips and knees exactly like a real one.
      const stand = side === "near" ? 30 : -27;
      feet[side] = { x: joints.pelvis[0] + stand, y: ankleRow, planted: true };
    }
  }

  // ---- pelvis ----------------------------------------------------------
  // The body's rise and fall is NOT authored: it is whatever height keeps both
  // legs inside their reach. That makes the two dips per cycle fall out of the
  // stride, so a long step automatically drops the hips further, and no walk
  // speed can ever hyper-extend a knee.
  // Standing, the hips ride the breath: the chest fills, the weight settles.
  // Without this the idle is a statue with a moving shirt.
  let hipRow = ground.restHipRow - (walking ? 6.5 : 3.0)
    - (walking ? 0 : breath * 0.9 * breathDepth);
  for (const side of ["near", "far"]) {
    const leg = rig.legs[side];
    const reach = (rig.byName.get(leg.thigh).length + rig.byName.get(leg.shin).length) * 0.985;
    const dx = feet[side].x - joints[rig.legs[side].hip][0];
    const span = Math.sqrt(Math.max(1, reach * reach - dx * dx));
    hipRow = Math.max(hipRow, feet[side].y - span);
  }
  hipRow += walking ? 2.2 : 3.4;   // knee clearance: never solve dead straight

  const sway = walking
    ? Math.sin(phase * TAU) * 1.1
    : Math.sin((sim.animTime || 0) * 1.19 + 0.7) * 1.7;
  offset.set("pelvis", [sway, hipRow - ground.restHipRow]);

  // Hip twist reads in 2D as a tilt of the pelvis, and it is derived from the
  // feet rather than authored so it can never disagree with them.
  const sep = feet.near.x - feet.far.x;
  const twist = walking ? clamp(sep / 90, -1, 1) * 4.2 * DEG : 0;
  setLocal("pelvis", twist);

  // ---- torso / head ----------------------------------------------------
  const torsoPhase = wrap01(phase - LAG.torso);
  const torsoCounter = walking
    ? -Math.sin(torsoPhase * TAU) * 3.1 * DEG
    : 0;
  const torsoBreath = walking ? 0 : breath * 0.9 * DEG * breathDepth;
  const walkLean = walking ? 2.4 * DEG : 0;
  setLocal("torso", torsoCounter - twist * 0.55 + torsoBreath + walkLean);
  // chest rise. Piece-only scale, so the collar swells without dragging the
  // head with it; the head gets a matching lift below instead.
  const chest = walking ? 0 : breath * 0.011 * breathDepth;
  scale.set("torso", [1 - chest * 0.45, 1 + chest]);
  offset.set("torso", [0, walking ? Math.sin(phase * 2 * TAU) * 0.5 : 0]);

  // The head counter-rotates to stay level. Without this the whole figure
  // reads as a rocking doll: the eyeline is what a viewer tracks.
  const headPhase = wrap01(phase - LAG.head);
  const torsoAbsRough = torsoCounter - twist * 0.55 + twist;
  const headLevel = -torsoAbsRough * 0.85;
  const headIdle = walking ? 0 : Math.sin((sim.animTime || 0) * 1.94 + 1.3) * 0.85 * DEG;
  setLocal("head", headLevel + headIdle
    + (walking ? Math.sin(headPhase * TAU) * 0.9 * DEG : 0));
  offset.set("head", [0, walking ? 0 : -chest * 92]);

  // ---- arms ------------------------------------------------------------
  // The counter-swing: the arm on a side reads the LEG cycle half a period
  // away, so the near arm is forward exactly when the near leg is back.
  for (const side of ["near", "far"]) {
    const upper = side === "near" ? "upperArmNear" : "upperArmFar";
    const fore = side === "near" ? "foreArmNear" : "foreArmFar";
    if (walking) {
      const armPhase = wrap01(legPhase[side] + 0.5);
      const swing = sampleChannel(ARM_SWING_KEYS, armPhase);
      const elbow = sampleChannel(ARM_ELBOW_KEYS, armPhase - LAG.foreArm);
      // + swing is forward; screen-space forward rotation of a downward bone is
      // NEGATIVE (canvas rotate is clockwise with y down)
      setLocal(upper, -swing * DEG);
      setLocal(fore, elbowLocal(rig, side, elbow));
    } else {
      // A light guard: forearms up, which is the shipped idle's read. Cheap
      // secondary motion — the forearm lags the shoulder by a fifth of a beat.
      const guardShoulder = side === "near" ? -32 : -25;
      const guardElbow = side === "near" ? 70 : 57;
      const shoulderSway = breath * 1.5 * breathDepth;
      const elbowSway = Math.sin((sim.animTime || 0) * breathRate - 0.9) * 2.4 * breathDepth;
      setLocal(upper, -(guardShoulder + shoulderSway) * DEG);
      setLocal(fore, elbowLocal(rig, side, guardElbow + elbowSway));
      offset.set(upper, [0, -chest * 22]);
    }
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
    const pitch = walking
      ? sampleChannel(ANKLE_KEYS, legPhase[side])
      : (side === "near" ? -4 : -2);
    setLocal(leg.foot, (pitch + FOOT_FLAT_TRIM) * DEG - shinAccum);
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

  const draw = rig.bones
    .map((bone) => {
      const node = nodes.get(bone.name);
      const piece = rig.pieces[bone.piece];
      const s = scale.get(bone.name);
      return {
        name: bone.name,
        piece: bone.piece,
        x: node.x,
        y: node.y,
        angle: node.angle,
        z: zOf.get(bone.name),
        scaleX: s ? s[0] : 1,
        scaleY: s ? s[1] : 1,
        sx: piece.x, sy: piece.y, sw: piece.w, sh: piece.h,
        ox: -bone.piecePivot[0], oy: -bone.piecePivot[1],
      };
    })
    .sort((a, b) => a.z - b.z || a.name.localeCompare(b.name));

  return {
    walking,
    phase,
    strideCells,
    hipRow,
    feet,
    bones: draw,
    nodes,
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
    near.push(footTarget(t, stride, 17));
    far.push(footTarget(wrap01(t + 0.5), stride, 17));
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
