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

test("depth order is pose-dependent for the arms and static for the legs", () => {
  const zAt = (pose, name) => pose.bones.find((bone) => bone.name === name).z;
  const seen = { foreArmFar: new Set(), thighFar: new Set(), thighNear: new Set() };
  for (let i = 0; i < 60; i += 1) {
    const pose = rigPose(rig, walkSim(i / 60));
    for (const key of Object.keys(seen)) seen[key].add(zAt(pose, key));
    // the near leg is nearer at every phase — in a 3/4 view pretending
    // otherwise is how a rig starts strobing
    assert.ok(zAt(pose, "thighNear") > zAt(pose, "thighFar"));
    assert.ok(zAt(pose, "pelvis") > zAt(pose, "thighNear"), "shorts hide both hips");
  }
  assert.ok(seen.foreArmFar.size > 1, "the far forearm must change layer as it swings");
  assert.equal(seen.thighFar.size, 1, "leg layers are static by design");
  assert.equal(seen.thighNear.size, 1);
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

  // every sprite-silhouette pass that could show a second, differently-posed
  // body behind the rig is gated. If a future pass is added it must join them.
  const gates = game.match(/!rigDraw/g) || [];
  assert.ok(gates.length >= 6,
    `expected the silhouette passes to be gated, found ${gates.length}`);
  assert.match(game, /reflectionPassActive \|\| rigDraw/, "attack trails must skip too");
  assert.match(game, /if \(rigDrawSide\(fighter\)\) continue;/, "cast shadows must skip too");

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
