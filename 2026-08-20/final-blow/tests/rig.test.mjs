import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RIG_FORMAT,
  STANCE_FRACTION,
  WALK_CYCLES_PER_SECOND,
  createRig,
  drawRig,
  footTarget,
  prepareRig,
  rigPose,
  solveTwoBone,
  walkAlternates,
} from "../engine/rig.mjs";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const definition = JSON.parse(
  readFileSync(join(gameRoot, "assets", "rig", "deathblow-rig.json"), "utf8"),
);
const rig = prepareRig(definition);

// A representative sim state: forward walk at the shipped speed, at the render
// scale deathblow actually draws at (330 * 1.14 * 1.068 = 401.8px per 320 cell).
//
// v3.5: the SPEED here was 383 from the 3.1 pilot onward and it was never
// deathblow's. 383 is the roster default (MOVEMENT_RULES forwardWalkSpeed,
// 336 * FIGHTER_SCALE); his kit overrides it with 246 * 1.14 = 323, which is
// what `qa.rigWalk()` reads off a held forward walk in the running game. The
// gap mattered once the stride got long: a 19% overspeed asks the legs to span
// a stance they cannot reach, so a squat that never happens on screen was
// failing the no-squat bound, and one that did could have passed it.
const PX_PER_CELL = 401.8 / 320;
const WALK_SPEED = 323;
const walkSim = (walkTime) => ({
  walkTime, animTime: 1.4, moving: true, speed: WALK_SPEED, pxPerCell: PX_PER_CELL, fatigue: 0,
});
const idleSim = (animTime) => ({
  walkTime: 0, animTime, moving: false, speed: 0, pxPerCell: PX_PER_CELL, fatigue: 0,
});

// v3.5 — THE SCALE THE RIG IS ACTUALLY DRAWN AT, which is not PX_PER_CELL.
//
// `renderSize = fighterRenderSize(id) * bankSheetAdjust * cellDrawAdjust`, and
// once the unified atlas is loaded the sprite pose a walking deathblow WOULD
// have drawn is a unified walk cell, whose UNIFIED_CELL_ADJUST (engine/
// fighter-kits.mjs) is 0.913 / 0.889 / 0.907 / 0.892 across the four keys. The
// rig inherits that renderSize because it has to occupy the sprite's footprint,
// so it draws at 1.2557 * those = 1.116..1.147 px per cell, cycling with the
// walk — confirmed live, `qa.rigWalk()` reporting strideCells 256.15 / 262.18 /
// 257.85 / 263.07 on four consecutive walk cells at one held 323 px/s.
//
// It matters because the stride is `speed / cadence / pxPerCell`: the SMALLEST
// scale asks the legs to span the LONGEST stance in cell space, so it is the
// squat's worst case, and the largest is the stance width's. The tests below
// run every one of the four rather than an average of them.
const LIVE_CELL_ADJUSTS = [0.913, 0.889, 0.907, 0.892];
const LIVE_SCALES = LIVE_CELL_ADJUSTS.map((adjust) => PX_PER_CELL * adjust);
const LIVE_PX_PER_CELL = PX_PER_CELL * 0.889;   // the deepest correction
const LIVE_WALK_SPEED = WALK_SPEED;
const liveSim = (walkTime, pxPerCell = LIVE_PX_PER_CELL) => ({
  walkTime, animTime: 1.4, speedX: LIVE_WALK_SPEED, speedLift: LIVE_WALK_SPEED,
  pxPerCell, fatigue: 0,
});
const liveIdle = (pxPerCell = LIVE_PX_PER_CELL) => ({
  walkTime: 0, animTime: 0, speedX: 0, speedLift: 0, pxPerCell, fatigue: 0,
});

// ---------------------------------------------------------------------------
// The skeleton
// ---------------------------------------------------------------------------

test("rig definition loads and every bone resolves through the hierarchy", () => {
  assert.equal(definition.format, RIG_FORMAT);
  assert.equal(definition.fighter, "deathblow");
  assert.ok(rig.bones.length >= 13, `expected a full limb set, got ${rig.bones.length}`);

  // topological order: a bone can never appear before its parent
  const seen = new Set();
  for (const name of rig.order) {
    const bone = rig.byName.get(name);
    assert.ok(bone, `order names an unknown bone: ${name}`);
    if (bone.parent) assert.ok(seen.has(bone.parent), `${name} resolves before ${bone.parent}`);
    seen.add(name);
  }
  assert.equal(seen.size, rig.bones.length, "every bone must appear in the resolve order");

  // exactly one root, and it is the pelvis — the walk drives everything from it
  const roots = rig.bones.filter((bone) => !bone.parent);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].name, "pelvis");

  for (const bone of rig.bones) {
    assert.ok(definition.pieces[bone.piece], `${bone.name} points at a missing piece`);
    assert.ok(Number.isFinite(bone.restAngle), `${bone.name} has no rest angle`);
    assert.ok(bone.length > 0, `${bone.name} has no length`);
    assert.equal(bone.pivot.length, 2);
    assert.equal(bone.piecePivot.length, 2);
  }
});

test("a broken hierarchy is rejected rather than silently drawn", () => {
  const cycle = structuredClone(definition);
  cycle.bones.find((bone) => bone.name === "pelvis").parent = "head";
  assert.throws(() => createRig(cycle), /bone cycle/);

  const orphan = structuredClone(definition);
  orphan.bones.find((bone) => bone.name === "torso").parent = "spine";
  assert.throws(() => createRig(orphan), /unknown parent/);

  const duplicate = structuredClone(definition);
  duplicate.bones.push({ ...duplicate.bones[0] });
  assert.throws(() => createRig(duplicate), /duplicate bone/);

  assert.throws(() => createRig({ format: "something-else", bones: [] }), /unsupported rig format/);
});

// ---------------------------------------------------------------------------
// THE POINT OF THE PILOT: the walk legs alternate.
//
// 37 of the 40 original walk cells lead with the same foot and four separate
// art-generation waves failed to invert the phase (MOTION-ATLAS.md, "U2 walk
// phase — FAILED"). On a rig it is `phase + 0.5`, and it is testable.
// ---------------------------------------------------------------------------

test("the walk legs genuinely alternate", () => {
  const audit = walkAlternates(rig, 48, 180);
  assert.equal(audit.alternates, true, "near/far lead must swap");
  assert.equal(audit.leadFlips, 2, `exactly two lead swaps per cycle, got ${audit.leadFlips}`);

  // and prove it from the poses themselves, not just the foot curve
  const leads = [];
  for (let i = 0; i < 48; i += 1) {
    const pose = rigPose(rig, walkSim(i / 48 / WALK_CYCLES_PER_SECOND));
    leads.push(Math.sign(pose.feet.near.x - pose.feet.far.x));
  }
  assert.ok(leads.some((sign) => sign > 0), "the near foot must lead somewhere in the cycle");
  assert.ok(leads.some((sign) => sign < 0), "the far foot must lead somewhere in the cycle");
});

test("it is a walk, not a run: double support exists and neither foot floats alone", () => {
  const audit = walkAlternates(rig, 96, 180);
  assert.equal(audit.airborneFrames, 0, "a walk never has both feet off the ground");
  assert.ok(audit.doubleSupportFraction > 0.1,
    `both feet should be down for part of the cycle, got ${audit.doubleSupportFraction}`);
  assert.ok(STANCE_FRACTION > 0.5 && STANCE_FRACTION < 0.7);
});

test("the planted foot stays planted — no skating at any walk speed", () => {
  // While a foot is in stance its WORLD position must not move: the body slides
  // over it. Body travel per tick is speed/60; the foot's body-relative travel
  // has to cancel it exactly.
  for (const speed of [383, 299, 210, 120]) {
    const samples = 240;
    let worstDrift = 0;
    let previous = null;
    for (let i = 0; i < samples; i += 1) {
      const seconds = i / 60;
      const pose = rigPose(rig, { ...walkSim(seconds), speed });
      const bodyX = speed * seconds;                     // world px travelled
      const worldFoot = bodyX + pose.feet.near.x * PX_PER_CELL;
      if (pose.feet.near.planted && previous !== null) {
        worstDrift = Math.max(worstDrift, Math.abs(worldFoot - previous));
      }
      previous = pose.feet.near.planted ? worldFoot : null;
    }
    // sub-pixel per tick at 60Hz; the residual is float noise, not slide
    assert.ok(worstDrift < 0.05,
      `planted foot drifted ${worstDrift.toFixed(4)} world px/tick at speed ${speed}`);
  }
});

test("stride follows the actual speed, so the rig cannot be tuned to one velocity", () => {
  const fast = rigPose(rig, { ...walkSim(0.2), speed: 383 });
  const slow = rigPose(rig, { ...walkSim(0.2), speed: 210 });
  assert.ok(fast.strideCells > slow.strideCells * 1.6,
    "a slower walk must take shorter steps");
  assert.equal(fast.phase, slow.phase, "cadence is the same; only the stride changes");
});

// ---------------------------------------------------------------------------
// Determinism — the same contract the sprite pose descriptors keep, so rollback
// resimulation and both online peers agree.
// ---------------------------------------------------------------------------

test("the pose is a pure deterministic function of sim state", () => {
  const sim = walkSim(3.217);
  const first = rigPose(rig, sim);
  const second = rigPose(rig, { ...sim });
  assert.deepEqual(second.bones, first.bones);
  assert.deepEqual(second.feet, first.feet);

  // a second, independently prepared rig — stands in for the other peer
  const peer = prepareRig(JSON.parse(
    readFileSync(join(gameRoot, "assets", "rig", "deathblow-rig.json"), "utf8"),
  ));
  assert.deepEqual(rigPose(peer, sim).bones, first.bones);

  // replaying the same tick after an intervening different tick — rollback
  rigPose(rig, walkSim(9.5));
  assert.deepEqual(rigPose(rig, sim).bones, first.bones);

  // and it must actually depend on the state it claims to
  assert.notDeepEqual(rigPose(rig, walkSim(3.3)).bones, first.bones);
  assert.notDeepEqual(rigPose(rig, idleSim(1.1)).bones, rigPose(rig, idleSim(1.6)).bones);
});

test("no RNG, no clock, no hidden state in the rig module", () => {
  // strip comments first — the file header explains that it uses no Math.random
  const code = readFileSync(join(gameRoot, "engine", "rig.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /Math\.random/);
  assert.doesNotMatch(code, /Date\.now|performance\.now|new Date/);
  // no module-level mutable state: a pose must not depend on what was posed
  // before it, or rollback resimulation and the live peer disagree
  assert.doesNotMatch(code, /^(let|var) /m);
});

// ---------------------------------------------------------------------------
// Kinematics
// ---------------------------------------------------------------------------

test("every bone resolves to a finite pose and the feet hit their IK targets", () => {
  for (let i = 0; i < 60; i += 1) {
    const pose = rigPose(rig, walkSim(i / 60));
    assert.equal(pose.bones.length, rig.bones.length);
    for (const bone of pose.bones) {
      assert.ok(Number.isFinite(bone.x) && Number.isFinite(bone.y), `${bone.name} position`);
      assert.ok(Number.isFinite(bone.angle), `${bone.name} angle`);
    }
    for (const side of ["near", "far"]) {
      const ankle = pose.nodes.get(side === "near" ? "footNear" : "footFar");
      assert.ok(Math.hypot(ankle.x - pose.feet[side].x, ankle.y - pose.feet[side].y) < 0.5,
        `${side} ankle missed its IK target by more than half a pixel`);
    }
  }
});

test("two-bone IK never solves at full extension", () => {
  // acos(1) has unbounded angular gain: solving a pinned foot dead straight is
  // what makes a rigged knee snap and jitter.
  const far = solveTwoBone(0, 0, 400, 0, 56, 42, 1);
  assert.equal(far.overReached, true);
  assert.ok(Number.isFinite(far.upperDir) && Number.isFinite(far.lowerDir));
  const knee = { x: Math.cos(far.upperDir) * 56, y: Math.sin(far.upperDir) * 56 };
  assert.ok(Math.hypot(knee.x, knee.y) > 0);

  const normal = solveTwoBone(0, 0, 20, 80, 56, 42, 1);
  assert.equal(normal.overReached, false);
  const reached = Math.hypot(
    normal.jointX + Math.cos(normal.lowerDir) * 42 - 20,
    normal.jointY + Math.sin(normal.lowerDir) * 42 - 80,
  );
  assert.ok(reached < 0.001, `IK should close on the target, missed by ${reached}`);
});

test("the foot curve is continuous around the cycle seam", () => {
  const before = footTarget(0.999, 180, 17);
  const after = footTarget(0.001, 180, 17);
  assert.ok(Math.abs(before.x - after.x) < 2, "no jump in foot X at the wrap");
  assert.ok(Math.abs(before.y - after.y) < 2, "no jump in foot lift at the wrap");
  assert.equal(after.planted, true, "the cycle starts on a plant");
});

test("depth order is pose-dependent for the arms AND follows the stride for the legs", () => {
  const zAt = (pose, name) => pose.bones.find((bone) => bone.name === name).z;
  const seen = { foreArmFar: new Set(), thighFar: new Set(), thighNear: new Set() };
  for (let i = 0; i < 60; i += 1) {
    const pose = rigPose(rig, walkSim(i / 60));
    for (const key of Object.keys(seen)) seen[key].add(zAt(pose, key));
    // v3.3: the LEADING leg draws on top — its bones wear the leading art's z
    // slots (7-9); the trailing leg tucks behind on 4-6. "The near leg is
    // nearer at every phase" (the 3.1 rule) hid the leading leg behind the
    // body for the whole far-led half of the cycle.
    const front = pose.frontSide === "near" ? "thighNear" : "thighFar";
    const back = pose.frontSide === "near" ? "thighFar" : "thighNear";
    assert.ok(zAt(pose, front) > zAt(pose, back),
      `leading thigh must draw over the trailing one at phase ${pose.phase.toFixed(3)}`);
    assert.ok(zAt(pose, "pelvis") > zAt(pose, front), "shorts hide both hips");
  }
  assert.ok(seen.foreArmFar.size > 1, "the far forearm must change layer as it swings");
  assert.equal(seen.thighFar.size, 2, "each leg takes both depth roles across a cycle");
  assert.equal(seen.thighNear.size, 2);
});

// ---------------------------------------------------------------------------
// v3.3 — THE WALK-STRIDE COLLAPSE FIX.
//
// The leg pieces were cut from ONE mid-stride drawing: near leg extended
// forward, far leg extended back and foreshortened. The skeleton alternates a
// true symmetric stride, so for half of every cycle the far leg led — pieces
// rotated up to 93 degrees from their authored orientation and drawn BEHIND
// the near leg and the shorts. The leading leg vanished into the body and the
// walk read as a crouched shuffle every other half-step. The fix makes the
// ARTWORK follow the ROLE: the forward leg always wears the leading pieces on
// the leading depth slots. These tests pin that, phase by phase.
// ---------------------------------------------------------------------------

const FIGHT_PX_PER_CELL = 429 / 320; // deathblow's fight-mode draw scale

const legDraw = (pose, bone) => pose.bones.find((entry) => entry.name === bone);

test("held-direction fight-mode walk: the stride alternates and the leading leg is always dressed to lead", () => {
  // Forward walk and back walk (the two facings of a held direction in fight
  // mode differ only in mirror and speed — the rig sees |vx|).
  for (const speed of [383, 299]) {
    const leads = [];
    let swaps = 0;
    let previous = null;
    for (let tick = 0; tick < 120; tick += 1) {
      const pose = rigPose(rig, {
        walkTime: tick / 60, animTime: tick / 60, moving: true,
        speed, pxPerCell: FIGHT_PX_PER_CELL, fatigue: 0.2,
      });
      leads.push(pose.frontSide);
      if (previous && pose.frontSide !== previous) swaps += 1;
      previous = pose.frontSide;

      const frontLeg = pose.frontSide === "near" ? rig.legs.near : rig.legs.far;
      const backLeg = pose.frontSide === "near" ? rig.legs.far : rig.legs.near;
      // the forward leg wears the leading art on every bone, the trailing leg
      // the trailing art — at every single tick of a held walk
      assert.equal(legDraw(pose, frontLeg.thigh).piece, "thighNear");
      assert.equal(legDraw(pose, frontLeg.shin).piece, "shinNear");
      assert.equal(legDraw(pose, frontLeg.foot).piece, "footNear");
      assert.equal(legDraw(pose, backLeg.thigh).piece, "thighFar");
      assert.equal(legDraw(pose, backLeg.shin).piece, "shinFar");
      assert.equal(legDraw(pose, backLeg.foot).piece, "footFar");
      // and the leading leg draws over the trailing one, under the shorts
      assert.ok(legDraw(pose, frontLeg.shin).z > legDraw(pose, backLeg.shin).z);
      assert.ok(legDraw(pose, frontLeg.foot).z > legDraw(pose, backLeg.foot).z);
    }
    // Two role swaps per cycle, and 120 ticks is 2 seconds of them — derived
    // from the cadence rather than hard-coded, because the swap count is a
    // property of the crossings and the cadence is what sets how many happen.
    const expected = 2 * (2 * WALK_CYCLES_PER_SECOND);
    assert.ok(leads.includes("near") && leads.includes("far"),
      "both legs must lead within a couple of cycles");
    assert.ok(swaps >= Math.floor(expected) - 1 && swaps <= Math.ceil(expected) + 1,
      `role swaps should track the two foot crossings per cycle, got ${swaps} (expected ~${expected})`);
  }
});

test("no leg piece is ever drawn a quarter-turn from its authored orientation", () => {
  // The observable symptom of the 3.2 bug: the far thigh at 93 degrees from
  // rest, i.e. a painted vertical limb smeared horizontal. With art following
  // role the worst leg-piece rotation in a full-speed cycle stays under ~87
  // degrees, and it only peaks at the foot crossings where the legs overlap.
  const QUARTER_TURN = Math.PI / 2;
  for (let tick = 0; tick < 72; tick += 1) {
    const pose = rigPose(rig, walkSim(tick / 120));
    for (const entry of pose.bones) {
      if (!/^(thigh|shin|foot)/.test(entry.name)) continue;
      assert.ok(Math.abs(entry.angle) < QUARTER_TURN,
        `${entry.name} wearing ${entry.piece} at ${(entry.angle * 180 / Math.PI).toFixed(1)}deg, phase ${pose.phase.toFixed(3)}`);
    }
  }
});

test("the near-led half and the idle keep every bone in its own artwork", () => {
  // The role map is empty whenever the near foot leads — including the whole
  // idle — so no bone on the pilot-approved half wears a swapped piece.
  // (v3.5 moved the hip row and the leg layering, so this is an ART-ASSIGNMENT
  // check, not the pixel-parity claim the name used to make.)
  for (const sim of [idleSim(0.7), idleSim(2.9)]) {
    const pose = rigPose(rig, sim);
    assert.equal(pose.frontSide, "near", "the idle stance leads with the near foot");
    for (const entry of pose.bones) {
      const bone = rig.byName.get(entry.name);
      assert.equal(entry.piece, bone.piece, `${entry.name} must wear its own piece at idle`);
      assert.equal(entry.ox, -bone.piecePivot[0]);
    }
  }
  // and a near-led walk tick keeps every bone in its own art too
  const nearLed = rigPose(rig, walkSim(0.06)); // phase 0.1 — near leads
  assert.equal(nearLed.frontSide, "near");
  for (const entry of nearLed.bones) {
    assert.equal(entry.piece, rig.byName.get(entry.name).piece);
  }
});

// ---------------------------------------------------------------------------
// v3.4 — WALK DYNAMICS. Live-showcase QA measured the choreographer's real
// locomotion as ~7-tick bursts with 2-tick stops at 323 px/s, and the rig
// posed every burst with a constant 17-cell lift, full ankle articulation and
// a binary walk/idle snap: high-stepping marionette prancing. These tests pin
// the fixed dynamics — amplitudes that scale with the gait, a signed stride
// that keeps the back walk planted, and continuous settle/reversal blends.
// ---------------------------------------------------------------------------

const gaitSim = (walkTime, speedX, speedLift = Math.abs(speedX)) => ({
  walkTime, animTime: 1.4, speedX, speedLift, pxPerCell: PX_PER_CELL, fatigue: 0,
});

const swingPeak = (speedX, speedLift = Math.abs(speedX)) => {
  let peak = 0;
  for (let i = 0; i < 96; i += 1) {
    const pose = rigPose(rig, gaitSim(i / 96 / WALK_CYCLES_PER_SECOND, speedX, speedLift));
    const ankleRow = rig.ground.soleRow - rig.ground.ankleHeight;
    peak = Math.max(peak, ankleRow - pose.feet.near.y, ankleRow - pose.feet.far.y);
  }
  return peak;
};

test("swing lift scales with the stride: small step, small lift", () => {
  const full = swingPeak(383);
  const held = swingPeak(323);
  const tap = swingPeak(323, 120);   // tap-tap approach: slow average well below vx
  const creep = swingPeak(40);
  assert.ok(full > 15, `full stride should keep the authored lift, got ${full}`);
  assert.ok(held < full, "the showcase's 323 px/s walk must lift less than the reference");
  assert.ok(tap < held * 0.75, `a tapped approach must stay low, got ${tap} vs held ${held}`);
  assert.ok(creep < 4, `a creep should barely leave the ground, got ${creep}`);
  // and the ankle articulation follows: the toe stops pointing on tiny steps.
  // Measured on the NODE angle (the resolved ankle direction) — the drawn
  // bone angle also carries the role-swap art delta, which is not articulation.
  const anklePitchSpan = (speedX) => {
    const angles = [];
    for (let i = 0; i < 48; i += 1) {
      const pose = rigPose(rig, gaitSim(i / 48 / WALK_CYCLES_PER_SECOND, speedX));
      angles.push(pose.nodes.get("footNear").angle);
    }
    return Math.max(...angles) - Math.min(...angles);
  };
  assert.ok(anklePitchSpan(40) < anklePitchSpan(383) * 0.2,
    "tiny steps must flatten the ankle curve, not point the toe");
});

test("a stopping fighter settles instead of snapping to the stance", () => {
  // vx in this game is bang-bang; the renderer eases speedX across ticks and
  // the POSE must be continuous in that eased signal: sweep it to zero at a
  // frozen walkTime (the sim clock stops with vx) and watch every foot move
  // smoothly onto its stance mark.
  const walkTime = 0.31; // mid-swing — the worst place to stop
  let previous = null;
  let worstStep = 0;
  for (let v = 323; v >= 0; v -= 323 / 20) {
    const pose = rigPose(rig, gaitSim(walkTime, Math.max(0, v)));
    if (previous) {
      for (const side of ["near", "far"]) {
        worstStep = Math.max(worstStep,
          Math.hypot(pose.feet[side].x - previous.feet[side].x,
            pose.feet[side].y - previous.feet[side].y));
      }
    }
    previous = pose;
  }
  assert.ok(worstStep < 12,
    `feet must ease onto the stance, worst sweep step was ${worstStep.toFixed(1)} cells`);
  // ...and the fully settled pose IS the idle pose, bit for bit.
  const settled = rigPose(rig, gaitSim(0.31, 0));
  const idle = rigPose(rig, idleSim(1.4));
  assert.deepEqual(settled.bones, idle.bones,
    "speedX 0 must reproduce the shipped idle exactly, whatever walkTime froze at");
  assert.equal(settled.walking, false);
});

test("a reversal sweeps through a weight shift, not a pop", () => {
  // Forward-to-back: the eased speedX crosses zero while walkTime keeps
  // running (|vx| stays above the sim's walk-clock gate through a reversal).
  let previous = null;
  let worstStep = 0;
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const v = 246 - (i / steps) * (246 + 182); // +246 .. -182
    const pose = rigPose(rig, gaitSim(0.8 + i / 60, v));
    if (previous) {
      for (const side of ["near", "far"]) {
        worstStep = Math.max(worstStep,
          Math.hypot(pose.feet[side].x - previous.feet[side].x,
            pose.feet[side].y - previous.feet[side].y));
      }
    }
    previous = pose;
  }
  assert.ok(worstStep < 14,
    `feet must stay continuous through the reversal, worst step ${worstStep.toFixed(1)} cells`);
});

test("the planted foot stays planted walking BACKWARD too", () => {
  // The 3.3 rig fed |vx| to the stride, so a retreating body dragged its
  // planted foot backward at double speed — a moonwalk skate on every back
  // walk. Signed speedX must cancel the body's motion in both directions.
  for (const speed of [-182, -299]) {
    const samples = 240;
    let worstDrift = 0;
    let previous = null;
    for (let i = 0; i < samples; i += 1) {
      const seconds = i / 60;
      const pose = rigPose(rig, gaitSim(seconds, speed));
      const bodyX = speed * seconds; // world px travelled (negative = retreat)
      const worldFoot = bodyX + pose.feet.near.x * PX_PER_CELL;
      if (pose.feet.near.planted && previous !== null) {
        worstDrift = Math.max(worstDrift, Math.abs(worldFoot - previous));
      }
      previous = pose.feet.near.planted ? worldFoot : null;
    }
    assert.ok(worstDrift < 0.05,
      `planted foot drifted ${worstDrift.toFixed(4)} world px/tick at speed ${speed}`);
  }
});

test("full-speed walk keeps the authored 3.3 read and the legacy sim shape still poses", () => {
  // At the full reference stride the amplitudes all resolve to exactly the
  // 3.3 constants (g=1, w=1), so the verified fast-walk strips still hold.
  // The legacy `moving`/`speed` shape and the 3.4 signed `speedX` shape are the
  // same pose at the same speed — checked at deathblow's own walk, which is
  // what walkSim carries since 3.5.
  const viaLegacy = rigPose(rig, walkSim(0.22));
  const viaGait = rigPose(rig, gaitSim(0.22, WALK_SPEED));
  assert.deepEqual(viaGait.bones, viaLegacy.bones,
    "moving/speed fallback and speedX must agree at the reference speed");
  // ...and the amplitudes still saturate at exactly the 3.3 constants once the
  // walk reaches FULL_STRIDE_SPEED, which is the roster's fastest and above
  // deathblow's own — that saturation is what the verified fast strips hold.
  const saturated = rigPose(rig, gaitSim(0.22, 383));
  assert.equal(saturated.lift, 17);
  assert.equal(saturated.gait, 1);
});

test("idle breathes without drifting", () => {
  const hips = [];
  const feet = [];
  for (let i = 0; i < 200; i += 1) {
    const pose = rigPose(rig, idleSim(i / 20));
    assert.equal(pose.walking, false);
    hips.push(pose.hipRow);
    feet.push(pose.feet.near.x);
  }
  const move = Math.max(...hips) - Math.min(...hips);
  assert.ok(move > 0.01, "the idle must not be a statue");
  assert.ok(move < 12, `idle hip travel should be a breath, not a squat (${move})`);
  assert.equal(Math.max(...feet) - Math.min(...feet), 0, "idle feet are pinned");
  // no accumulating drift: the pose at t and t + one breath period agree
  assert.deepEqual(rigPose(rig, idleSim(400)).bones, rigPose(rig, idleSim(400)).bones);
});

test("drawRig lands in drawAtlasFrame's exact footprint", () => {
  // drawAtlasFrame blits the 320px cell into (-size/2, -size)..(size/2, 0), so
  // the rig has to translate by (-size/2, -size) and scale by size/320 or the
  // rigged fighter will not occupy the same world space as the sprite one.
  const calls = [];
  const ctx = {
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (x, y) => calls.push(["translate", x, y]),
    rotate: (a) => calls.push(["rotate", a]),
    scale: (x, y) => calls.push(["scale", x, y]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
  };
  const size = 401.8;
  drawRig(ctx, rig, {}, rigPose(rig, walkSim(0.1)), size);
  assert.deepEqual(calls[0], ["save"]);
  assert.deepEqual(calls[1], ["translate", -size * 0.5, -size]);
  assert.deepEqual(calls[2], ["scale", size / 320, size / 320]);
  const blits = calls.filter((call) => call[0] === "drawImage");
  assert.equal(blits.length, rig.bones.length, "every bone draws exactly once");
  // balanced transform stack — a leak would corrupt every later draw pass
  assert.equal(calls.filter((c) => c[0] === "save").length,
    calls.filter((c) => c[0] === "restore").length);
});

// ---------------------------------------------------------------------------
// The opt-in gate. The shipped path must be untouched with the rig off, and the
// only way to reach the rig is a URL param or the QA hook.
// ---------------------------------------------------------------------------

test("the rig is off by default and every draw-path change is gated on it", () => {
  const game = readFileSync(join(gameRoot, "game.js"), "utf8");

  // default off, and the only two ways in
  assert.match(game, /const requested = new URLSearchParams\(location\.search\)\.get\("rig"\)/);
  assert.match(game, /return "off";/);
  assert.match(game, /if \(rigState\.mode === "off"\) return null;/);
  assert.match(game, /rig\(mode = null\)/, "the QA hook must exist");

  // the body blit branch
  assert.match(game, /else if \(rigDraw\) drawRigFighter\(fighter, rigDraw, renderSize\);/);

  // v3.3: the rim light, projectile glow and cast shadow run on the RIG'S OWN
  // silhouette — never a sprite silhouette behind a rigged body.
  assert.match(game,
    /if \(rigDraw\) drawRigSilhouetteFrame\(fighter, rigDraw, renderSize, stageRimColor\(\)\);/,
    "the stage rim light must run on the rig's own pixels");
  assert.match(game,
    /if \(rigDraw\) drawRigSilhouetteFrame\(fighter, rigDraw, renderSize, "#04060a"\);/,
    "the cast shadow must run on the rig's own pixels");
  // every remaining sprite-silhouette pass (hit smear, dizzy ghosts, pose
  // crossfade, battle damage) stays gated — those beats fall back to sprite
  // cells in rigDrawSide anyway, so a rig copy would be a second body.
  const gates = game.match(/!rigDraw/g) || [];
  assert.ok(gates.length >= 4,
    `expected the remaining silhouette passes to be gated, found ${gates.length}`);
  assert.match(game, /reflectionPassActive \|\| rigDraw/, "attack trails must skip too");

  // rig assets are only ever reached through the gated dynamic import
  assert.match(game, /import\("\.\/engine\/rig\.mjs"\)/);
  assert.equal((game.match(/assets\/rig\//g) || []).length, 2,
    "the rig JSON and atlas are requested from exactly one place");

  // and the pilot only ever covers walk and idle
  assert.match(game, /fighter\.attacking \|\| fighter\.stun \|\| fighter\.down \|\| fighter\.block/);

  // v3.5: ...which means the GAIT EASE has to cover walk and idle too. It runs
  // across the bail — a dash's 622 px/s is still in the average on the first
  // rig-eligible tick after the dash ends — so the target is capped at this
  // fighter's own fastest walk before it is eased. Without it a `?rigdemo=1`
  // soak poses a 420-cell stride (the runaway clamp, which skates) with the
  // hips at row 280 against a settled 192.
  assert.match(game,
    /Math\.max\(fighter\.movement\.forwardWalkSpeed, fighter\.movement\.backWalkSpeed\)/,
    "the rig gait ease must be capped at a walk");
  assert.match(game, /clamp\(fighter\.vx \* fighter\.facing, -walkCap, walkCap\)/);
});

test("the service worker shell did not grow for the pilot", () => {
  const worker = readFileSync(join(gameRoot, "sw.js"), "utf8");
  assert.doesNotMatch(worker, /rig\.mjs/,
    "the rig is dynamically imported precisely so the install cache stays the size it was");
  assert.doesNotMatch(worker, /assets\/rig/);
});

// ---------------------------------------------------------------------------
// v3.5 — THE LEG STRUCTURE.
//
// Three rounds of walk work verified BONE ANGLES, STRIDE MATH and FOOT-TARGET
// POSITIONS. All three measured correct, and all three missed that the RENDERED
// figure had no lower leg: shorts hem, a stub of thigh, then the shoe. What was
// never measured was whether the shin's pixels reach the canvas.
//
// Two independent things put them there, and both are pinned below because both
// are invisible to an angle check:
//
//   1. DRAW ORDER. The thigh capsule runs 10px past the knee with a 16px end
//      radius, so the thigh art covers ~26px of a 42px shin and the shoe collar
//      takes 12 more. Layered thigh-over-shin (the pre-3.5 order) that is
//      harmless only while the leg is straight, because the covering pixels ARE
//      the drawn knee. Bend the knee and the thigh's rounded end sweeps ACROSS
//      the calf: measured 4-25% of the shin survived to the canvas.
//   2. LEG EXTENSION. The hip row used to be a constant that the reach
//      constraint could only push DOWN, so a 97.65-cell leg spanned the ~90
//      cells to the ankle row and put the difference in the knee — 45-75deg of
//      fold where the artwork was drawn at 7.
//
// Pixel compositing is not available in node, so these pin the geometry that
// PRODUCES the pixels: the layering, the extension, and the ground contact.
// ---------------------------------------------------------------------------

test("v3.5 leg pieces layer proximal -> distal so a bent knee cannot eat the shin", () => {
  const zOf = (pose, name) => pose.bones.find((bone) => bone.name === name).z;
  const poses = [idleSim(0), idleSim(1.7), ...Array.from({ length: 40 }, (_, i) => walkSim(i / 40))];
  for (const sim of poses) {
    const pose = rigPose(rig, sim);
    for (const side of ["near", "far"]) {
      const leg = rig.legs[side];
      const thigh = zOf(pose, leg.thigh);
      const shin = zOf(pose, leg.shin);
      const foot = zOf(pose, leg.foot);
      assert.ok(thigh < shin,
        `${side} shin must draw OVER its own thigh (${shin} vs ${thigh})`);
      assert.ok(shin < foot,
        `${side} foot must draw over its own shin (${foot} vs ${shin})`);
      // and the shorts still hide both hips, which is what the leg z slots
      // were kept below the pelvis for
      assert.ok(zOf(pose, "pelvis") > thigh, "shorts draw over the thighs");
    }
  }
});

test("v3.5 the support leg stays extended — the hips hang from it", () => {
  const reach = rig.byName.get("thighNear").length + rig.byName.get("shinNear").length;
  const worst = { ext: 1, bend: 0, phase: null };
  for (let i = 0; i < 60; i += 1) {
    const pose = rigPose(rig, walkSim(i / 60));
    // the SUPPORT leg is the most extended one — whichever is carrying
    let best = 0;
    for (const side of ["near", "far"]) {
      const leg = rig.legs[side];
      const hip = pose.nodes.get(leg.thigh);
      const ankle = pose.nodes.get(leg.foot);
      best = Math.max(best, Math.hypot(ankle.x - hip.x, ankle.y - hip.y) / reach);
    }
    if (best < worst.ext) { worst.ext = best; worst.phase = pose.phase; }
  }
  // pre-3.5 this bottomed out at 0.925 (a 45deg knee) at every foot crossing
  assert.ok(worst.ext > 0.97,
    `the carrying leg must stay near full extension, worst ${worst.ext.toFixed(3)} at phase ${worst.phase}`);

  // the hips must actually MOVE with it — a constant hip row is the bug
  const hips = [];
  for (let i = 0; i < 60; i += 1) hips.push(rigPose(rig, walkSim(i / 60)).hipRow);
  const travel = Math.max(...hips) - Math.min(...hips);
  assert.ok(travel > 4, `the hips must rise and fall over the stride (${travel.toFixed(2)})`);
  assert.ok(travel < 24, `...as a walk bob, not a squat (${travel.toFixed(2)})`);
});

test("v3.5 the rest pose reproduces the drawing, and the sole sits on the ground row", () => {
  const zero = rigPose(rig, { walkTime: 0, animTime: 0, speedX: 0, pxPerCell: PX_PER_CELL, fatigue: 0 });
  // The pivot chain: every leg piece's pivot must sit on the joint it was cut
  // from, or the art and the skeleton disagree before a pose is even applied.
  for (const [piece, joint] of [["thighNear", "hipN"], ["shinNear", "kneeN"], ["footNear", "ankleN"],
                                ["thighFar", "hipF"], ["shinFar", "kneeF"]]) {
    const spec = definition.pieces[piece];
    const bone = rig.byName.get(piece);
    assert.deepEqual(
      [spec.cellX + bone.piecePivot[0], spec.cellY + bone.piecePivot[1]],
      definition.joints[joint],
      `${piece}'s pivot must land on ${joint}`);
  }
  // segment lengths ARE the authored joint distances — a shin whose bone is
  // shorter than its drawing is the other way this defect can come back
  const dist = (a, b) => Math.hypot(definition.joints[a][0] - definition.joints[b][0],
                                    definition.joints[a][1] - definition.joints[b][1]);
  for (const [bone, a, b] of [["thighNear", "hipN", "kneeN"], ["shinNear", "kneeN", "ankleN"],
                              ["thighFar", "hipF", "kneeF"], ["shinFar", "kneeF", "ankleF"]]) {
    assert.ok(Math.abs(rig.byName.get(bone).length - dist(a, b)) < 0.05,
      `${bone} bone length must equal the ${a}->${b} joint distance`);
  }
  // the two legs are the SAME length: a rig with mismatched legs limps
  const nearLeg = rig.byName.get("thighNear").length + rig.byName.get("shinNear").length;
  const farLeg = rig.byName.get("thighFar").length + rig.byName.get("shinFar").length;
  assert.ok(Math.abs(nearLeg - farLeg) / nearLeg < 0.02, "both legs must measure the same");

  // GROUND CONTACT. v3.5 moved this contract from the ANKLE to the SOLE, and it
  // got stricter in the move. Through 3.4 a planted ankle was pinned to one
  // constant row for both legs at every phase, which put the SNEAKER — the only
  // thing a viewer can see — 0.8px through the floor at heel strike and 2.7
  // above it at toe-off, because the drawing's depth below its own pivot
  // changes as the piece rotates. Now the ankle row is solved per leg, per
  // frame, from where that rotated drawing actually bottoms out, so what is
  // pinned is the thing that should be: the sole, exactly on the floor.
  for (const side of ["near", "far"]) {
    assert.ok(zero.feet[side].planted, `${side} foot is planted in the settled stance`);
    assert.ok(Math.abs(zero.soleRows[side] - definition.ground.soleRow) < 0.001,
      `${side} settled sole sits on the ground row (got ${zero.soleRows[side]})`);
  }
  for (let i = 0; i < 60; i += 1) {
    const pose = rigPose(rig, walkSim(i / 60));
    for (const side of ["near", "far"]) {
      if (!pose.feet[side].planted) continue;
      assert.ok(Math.abs(pose.soleRows[side] - definition.ground.soleRow) < 0.001,
        `a planted ${side} sole never leaves the floor (got ${pose.soleRows[side]})`);
      const ankle = pose.nodes.get(rig.legs[side].foot);
      assert.ok(Math.hypot(ankle.x - pose.feet[side].x, ankle.y - pose.feet[side].y) < 0.5,
        "and the solved ankle actually reaches it — no float, no skate");
    }
  }
  // and the ankle rows genuinely DIFFER between the legs at the contact frame:
  // that split is the whole mechanism the 3.5 stance width is bought with.
  const contact = Array.from({ length: 240 }, (_, i) => rigPose(rig, liveSim(i / 240 / WALK_CYCLES_PER_SECOND)))
    .filter((pose) => pose.feet.near.planted && pose.feet.far.planted);
  assert.ok(contact.length > 0, "there are double-support frames to inspect");
  const split = Math.max(...contact.map((pose) => Math.abs(pose.feet.near.y - pose.feet.far.y)));
  // the drawing's own ankleN/ankleF split is 16; the rig reaches ~11.6 of it
  // inside the double-support window (the last of the lift arrives at toe-off,
  // by which point the trailing foot has already left stance)
  assert.ok(split > 10,
    `the two planted ankles must sit on different rows at contact (got ${split.toFixed(2)})`);
});

// ---------------------------------------------------------------------------
// v3.5 STANCE WIDTH. The 3.1-3.4 rig put deathblow's ankles 87 cell px apart at
// contact where his own drawings put them 123-127, and the walk read as a
// mince. These two tests pin the fix and the price of it, because the price is
// the thing that can silently come back: every cell of stance width is paid for
// out of hip height, and a rig that buys width by squatting has traded one
// wrong read for another.
// ---------------------------------------------------------------------------

test("v3.5 the stance opens to the drawing's proportions", () => {
  // TRUTH, measured off the art (see tools/cut_rig.py JOINTS and
  // assets/walk/deathblow.webp): the rig's source cell puts ankleN at x 224 and
  // ankleF at 101, so 123 cell px; the shipped walk bank's two contact keys put
  // the sole centroids 126.0 and 127.5 apart. Anything past ~85% of that reads
  // as the same stance.
  const SPRITE_CONTACT_SEPARATION = 123;

  for (const pxPerCell of LIVE_SCALES) {
    const poses = Array.from({ length: 240 },
      (_, i) => rigPose(rig, liveSim(i / 240 / WALK_CYCLES_PER_SECOND, pxPerCell)));
    const contact = poses.filter((pose) => pose.feet.near.planted && pose.feet.far.planted);
    assert.ok(contact.length >= 12, `double support must be a real window (${contact.length}/240)`);
    const mean = contact.reduce((sum, pose) => sum + pose.ankleSeparation, 0) / contact.length;
    assert.ok(mean > SPRITE_CONTACT_SEPARATION * 0.85,
      `feet land ${mean.toFixed(1)} cell px apart at scale ${pxPerCell.toFixed(3)}, `
      + `the drawings land ${SPRITE_CONTACT_SEPARATION}`);
    // ...and not by overshooting into the splits either
    assert.ok(mean < SPRITE_CONTACT_SEPARATION * 1.15,
      `a stride wider than the artwork is its own defect (${mean.toFixed(1)})`);

    // The separation is HALF THE STRIDE and nothing else — that identity is the
    // no-skate contract restated, so if it ever stops holding the planted foot
    // has started sliding.
    const stride = contact[0].strideCells;
    assert.ok(Math.abs(mean - stride / 2) < 2,
      `contact separation must be half the stride (${mean.toFixed(1)} vs ${(stride / 2).toFixed(1)})`);

    // A slow creep must still take small steps: the width is earned from speed,
    // never authored into the pose.
    const creep = rigPose(rig, { ...liveSim(0.2, pxPerCell), speedX: 90, speedLift: 90 });
    assert.ok(creep.strideCells < contact[0].strideCells * 0.4,
      "a creeping approach must not inherit the full-speed stance");
  }
});

test("v3.5 the wider stance is not bought by squatting", () => {
  // The BAR. deathblow's own walk drawings lose 18 cell px of figure height
  // between their passing keys (304px tall) and their contact keys (286) — the
  // artwork bobs, and a rig that did not would read as a hovercraft. So the
  // ceiling is the artwork's own bob, not zero. Checked at every render scale
  // the rig ships at: the smallest is the worst case, because a smaller
  // pxPerCell is a LONGER stride in cell space for the same walk.
  const SPRITE_BOB = 18;

  for (const pxPerCell of LIVE_SCALES) {
    const idle = rigPose(rig, liveIdle(pxPerCell));
    const poses = Array.from({ length: 240 },
      (_, i) => rigPose(rig, liveSim(i / 240 / WALK_CYCLES_PER_SECOND, pxPerCell)));
    const hips = poses.map((pose) => pose.hipRow);
    const lowest = Math.max(...hips);
    const highest = Math.min(...hips);

    assert.ok(lowest - idle.hipRow < SPRITE_BOB,
      `hips drop ${(lowest - idle.hipRow).toFixed(1)} below the settled row at scale `
      + `${pxPerCell.toFixed(3)}; the drawings bob ${SPRITE_BOB}`);
    assert.ok(lowest - highest < SPRITE_BOB * 1.25,
      `the walk bob is ${(lowest - highest).toFixed(1)} cell px, the drawings' is ${SPRITE_BOB}`);

    // and the hips must come back UP: a constant sag is a squat, a swing is a walk
    assert.ok(highest <= idle.hipRow + 0.5,
      `mid-stance must recover the settled hip row (${highest.toFixed(1)} vs ${idle.hipRow.toFixed(1)})`);

    // the support leg is still carrying, so the width did not come from a bent knee
    const reach = rig.byName.get("thighNear").length + rig.byName.get("shinNear").length;
    const worst = Math.min(...poses.map((pose) => Math.max(...["near", "far"].map((side) => {
      const hip = pose.nodes.get(rig.legs[side].thigh);
      const ankle = pose.nodes.get(rig.legs[side].foot);
      return Math.hypot(ankle.x - hip.x, ankle.y - hip.y) / reach;
    }))));
    assert.ok(worst > 0.97, `the carrying leg must stay extended, worst ${worst.toFixed(3)}`);
  }
});
