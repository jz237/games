import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOTION2_CELLS,
  MOTION_CELL_COUNT,
  attackAnimationPose,
  attackMotionBeat,
  buildMotionAcceptMasks,
  createFighterMove,
  motion2Pose,
  motionPose,
  resolveMotionPose,
  wakeupMotionPose,
} from "../engine/fighter-kits.mjs";

// v2.9 FLOW — the motion2 bank contract (MOTION-ATLAS.md "Motion2 bank"):
// pure sim-state descriptors, the same manifest accept-mask gate as bank 1,
// chained fallbacks that land byte-for-byte on the pre-2.9 beat, the ≤4-tick
// windup anticipation window, the air-attack active window, and the
// getup-a → getup-b wake-up ordering.

const testDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(testDir, "..", "assets", "motion2", "MANIFEST.json"), "utf8"));

const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];

function testManifestAcceptMasks() {
  const masks = buildMotionAcceptMasks(manifest);
  assert.deepEqual(Object.keys(masks).sort(), [...ROSTER].sort());
  let accepted = 0;
  for (const id of ROSTER) {
    assert.equal(masks[id].accept.length, MOTION_CELL_COUNT, `${id} mask must cover the 16-cell grammar`);
    assert.ok(masks[id].scale > 1 && masks[id].scale < 2, `${id} build scale should be recorded`);
    accepted += masks[id].accept.filter(Boolean).length;
  }
  // 2.9 wave: all 160 cells shipped accepted — the fallback path is dormant
  // but stays wired (a cell absent from the manifest is still rejected).
  assert.equal(accepted, 160);
  const partial = buildMotionAcceptMasks({
    fighters: { jez: { scale: 1.319, cells: [{ frame: 0, id: "windup-punch", accept: true }] } },
  });
  assert.equal(partial.jez.accept[MOTION2_CELLS.windupPunch], true);
  assert.equal(partial.jez.accept[MOTION2_CELLS.getupB], false);
}

function testFallbackResolution() {
  const pose = motion2Pose(MOTION2_CELLS.dashBrake, "base", 12);
  // Sheet loaded + cell accepted: the motion2 cell holds.
  assert.deepEqual(resolveMotionPose(pose, () => true), pose);
  // Sheet missing / loading / rejected: the exact pre-2.9 cell draws.
  assert.deepEqual(resolveMotionPose(pose, () => false), { bank: "base", frame: 12 });
  // Bank-routed gate: motion2 rejected while motion is fine (and vice versa).
  const routed = resolveMotionPose(pose, (cell, bank) => bank !== "motion2");
  assert.deepEqual(routed, { bank: "base", frame: 12 });
  // Chained fallbacks: a motion2 beat whose pre-2.9 read was a bank-1 cell
  // still degrades all the way to base when both sheets are unavailable.
  const chained = { bank: "motion2", frame: MOTION2_CELLS.thrown, fallback: motionPose(8, "base", 15) };
  assert.deepEqual(resolveMotionPose(chained, () => false), { bank: "base", frame: 15 });
  assert.equal(resolveMotionPose(chained, (cell, bank) => bank === "motion").bank, "motion");
  // Non-motion poses pass through untouched.
  const plain = { bank: "specials", frame: 2 };
  assert.equal(resolveMotionPose(plain, () => false), plain);
}

function testWindupContract() {
  // The anticipation key re-skins 2-4 EXISTING startup ticks on kit-less
  // standing heavies, ends exactly where the smear flash (or the active
  // window) begins, and picks the cell by limb. Never on lights, crouch or
  // air normals, overheads, the drive heavy, or moves with authored windups.
  for (const id of ROSTER) {
    for (const limb of ["punch", "kick"]) {
      const heavy = createFighterMove(id, "heavy", limb === "kick" ? { limb: "kick" } : {});
      if (!heavy || heavy.animation) continue;
      let windups = 0;
      let lastWindupFrame = -1;
      let firstAfter = null;
      for (let frame = 0; frame <= heavy.totalFrames; frame += 1) {
        const beat = attackMotionBeat(heavy, frame);
        if (beat?.beat === "windup") {
          windups += 1;
          lastWindupFrame = frame;
          assert.equal(beat.bank, "motion2", `${id} ${limb} windup must come from the motion2 bank`);
          assert.equal(
            beat.cell,
            limb === "kick" ? MOTION2_CELLS.windupKick : MOTION2_CELLS.windupPunch,
            `${id} ${limb} heavy must chamber the matching limb`,
          );
          assert.ok(frame < heavy.activeStartFrame, `${id} windup must re-skin startup ticks only`);
        } else if (lastWindupFrame >= 0 && firstAfter === null && frame > lastWindupFrame) {
          firstAfter = beat;
        }
      }
      assert.ok(windups >= 2 && windups <= 4,
        `${id} ${limb} heavy windup must hold 2-4 ticks, got ${windups}`);
      // One continuous swing: the windup hands off directly to the smear
      // flash (punch heavies) or the extension (kick heavies — no leg smear
      // exists in the bank-1 grammar).
      assert.ok(firstAfter && (firstAfter.beat === "smear" || firstAfter.beat === "extension"),
        `${id} ${limb} windup must hand off to smear/extension, got ${firstAfter?.beat}`);
    }
  }
  // Never on lights, crouch normals, air normals or the drive heavy.
  for (const move of [
    createFighterMove("deathblow", "light", {}),
    createFighterMove("deathblow", "heavy", { crouching: true }),
    createFighterMove("deathblow", "heavy", { airborne: true }),
    createFighterMove("deathblow", "driveHeavy", {}),
    createFighterMove("deathblow", "heavy", { forwardHeld: true }), // overhead
  ]) {
    for (let frame = 0; frame <= move.totalFrames; frame += 1) {
      assert.notEqual(attackMotionBeat(move, frame)?.beat, "windup",
        `${move.profileId} must never classify a windup beat`);
    }
  }
}

function testAirAttackBeat() {
  // Kit-less air normals wear the authored jumping-strike key through their
  // whole active window — never the grounded extension or follow reads.
  for (const id of ROSTER) {
    for (const [action, context] of [
      ["light", { airborne: true }],
      ["heavy", { airborne: true }],
      ["heavy", { airborne: true, limb: "kick" }],
    ]) {
      const move = createFighterMove(id, action, context);
      if (!move || move.animation) continue;
      for (let frame = move.activeStartFrame; frame < move.activeEndFrame; frame += 1) {
        const beat = attackMotionBeat(move, frame);
        assert.equal(beat?.beat, "airAttack", `${id} ${move.profileId} active frame ${frame}`);
        assert.equal(beat.bank, "motion2");
        assert.equal(beat.cell, MOTION2_CELLS.airAttack);
      }
      // Startup and recovery stay un-reskinned (no windup in the air).
      assert.equal(attackMotionBeat(move, 0)?.beat, undefined);
      assert.equal(attackMotionBeat(move, move.activeEndFrame), null);
    }
  }
  // Grounded normals never classify the air beat.
  const grounded = createFighterMove("jez", "heavy", {});
  for (let frame = 0; frame <= grounded.totalFrames; frame += 1) {
    assert.notEqual(attackMotionBeat(grounded, frame)?.beat, "airAttack");
  }
}

function testGetupSequenceOrdering() {
  // getup-a (knee up) must precede getup-b (half-risen) as the wake-up
  // counter runs down, each carrying the exact pre-2.9 cell as fallback.
  const seen = [];
  for (let frames = 16; frames >= 1; frames -= 1) {
    const pose = wakeupMotionPose(frames);
    assert.equal(pose.bank, "motion2");
    if (!seen.length || seen.at(-1) !== pose.frame) seen.push(pose.frame);
    assert.deepEqual(
      pose.fallback,
      pose.frame === MOTION2_CELLS.getupA ? { bank: "base", frame: 15 } : { bank: "base", frame: 12 },
    );
  }
  assert.deepEqual(seen, [MOTION2_CELLS.getupA, MOTION2_CELLS.getupB],
    "wake-up must rise getup-a then getup-b with no interleave");
  assert.equal(wakeupMotionPose(0), null);
}

function testDescriptorDeterminism() {
  // Rollback contract: the same snapshotted attack state must produce the
  // same descriptor walk every time, windup/air beats included.
  for (const id of ROSTER) {
    for (const [action, context] of [
      ["heavy", {}], ["heavy", { limb: "kick" }],
      ["light", { airborne: true }], ["heavy", { airborne: true }],
    ]) {
      const move = createFighterMove(id, action, context);
      if (!move) continue;
      const walk = () => {
        const frames = [];
        for (let frame = 0; frame <= move.totalFrames; frame += 1) {
          frames.push(attackAnimationPose(move, frame));
          frames.push(attackMotionBeat(move, frame));
        }
        return frames;
      };
      assert.deepEqual(walk(), walk(), `${id} ${action} motion2 walk must resimulate identically`);
    }
  }
}

testManifestAcceptMasks();
testFallbackResolution();
testWindupContract();
testAirAttackBeat();
testGetupSequenceOrdering();
testDescriptorDeterminism();

console.log("Final Blow motion2 bank tests passed");
