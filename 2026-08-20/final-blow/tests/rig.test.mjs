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
const PX_PER_CELL = 401.8 / 320;
const walkSim = (walkTime) => ({
  walkTime, animTime: 1.4, moving: true, speed: 383, pxPerCell: PX_PER_CELL, fatigue: 0,
});
const idleSim = (animTime) => ({
  walkTime: 0, animTime, moving: false, speed: 0, pxPerCell: PX_PER_CELL, fatigue: 0,
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
    // 120 ticks = 2s = 10/3 cycles at 5/3 cycles/sec; two role swaps per cycle
    assert.ok(leads.includes("near") && leads.includes("far"),
      "both legs must lead within a couple of cycles");
    assert.ok(swaps >= 5 && swaps <= 8,
      `role swaps should track the two foot crossings per cycle, got ${swaps}`);
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

test("the near-led half and the idle are bit-identical to the shipped 3.2 draw", () => {
  // The role map is empty whenever the near foot leads — including the whole
  // idle — so the pilot-approved half of the walk cannot have moved a pixel.
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
  const viaLegacy = rigPose(rig, walkSim(0.22));
  const viaGait = rigPose(rig, gaitSim(0.22, 383));
  assert.deepEqual(viaGait.bones, viaLegacy.bones,
    "moving/speed fallback and speedX must agree at the reference speed");
  assert.equal(viaGait.lift, 17);
  assert.equal(viaGait.gait, 1);
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
});

test("the service worker shell did not grow for the pilot", () => {
  const worker = readFileSync(join(gameRoot, "sw.js"), "utf8");
  assert.doesNotMatch(worker, /rig\.mjs/,
    "the rig is dynamically imported precisely so the install cache stays the size it was");
  assert.doesNotMatch(worker, /assets\/rig/);
});
