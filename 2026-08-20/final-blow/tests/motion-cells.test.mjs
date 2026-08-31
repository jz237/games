import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOTION_CELLS,
  MOTION_CELL_COUNT,
  attackAnimationPose,
  attackMotionBeat,
  buildMotionAcceptMasks,
  createFighterMove,
  motionPose,
  resolveMotionPose,
} from "../engine/fighter-kits.mjs";

// v2.7 FRAMES — the motion-cell bank contract (MOTION-ATLAS.md): pure
// sim-state descriptors, manifest-gated per-cell acceptance, and a fallback
// that is byte-for-byte the pre-2.7 beat.

const testDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(testDir, "..", "assets", "motion", "MANIFEST.json"), "utf8"));

const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];

function testManifestAcceptMasks() {
  const masks = buildMotionAcceptMasks(manifest);
  assert.deepEqual(Object.keys(masks).sort(), [...ROSTER].sort());
  for (const id of ROSTER) {
    assert.equal(masks[id].accept.length, MOTION_CELL_COUNT, `${id} mask must cover the 16-cell grammar`);
    assert.ok(masks[id].scale > 1 && masks[id].scale < 2, `${id} build scale should be recorded`);
  }
  // The 2.7 cyraxx smear-v rejection was regenerated and accepted in 2.8.
  assert.equal(masks.cyraxx.accept[MOTION_CELLS.smearV], true);
  assert.equal(masks.cyraxx.accept[MOTION_CELLS.smearH], true);
  assert.ok(masks.deathblow.accept.every(Boolean));
  // A cell absent from a manifest is rejected, never assumed shipped.
  const partial = buildMotionAcceptMasks({
    fighters: { jez: { scale: 1.3, cells: [{ frame: 0, id: "punch-ext", accept: true }] } },
  });
  assert.equal(partial.jez.accept[MOTION_CELLS.punchExt], true);
  assert.equal(partial.jez.accept[MOTION_CELLS.tuck], false);
}

function testFallbackResolution() {
  const pose = motionPose(MOTION_CELLS.tuck, "base", 13);
  // Sheet loaded + cell accepted: the motion cell holds.
  assert.deepEqual(resolveMotionPose(pose, () => true), pose);
  // Sheet missing / still loading / rejected: the exact pre-2.7 cell draws.
  assert.deepEqual(resolveMotionPose(pose, () => false), { bank: "base", frame: 13 });
  // Non-motion poses pass through untouched.
  const plain = { bank: "specials", frame: 2 };
  assert.equal(resolveMotionPose(plain, () => false), plain);
}

function testCyraxxSmearVFallsBack() {
  const masks = buildMotionAcceptMasks(manifest);
  const riser = createFighterMove("cyraxx", "launcher");
  const pose = attackAnimationPose(riser, riser.activeStartFrame - 1);
  assert.equal(pose.bank, "motion");
  assert.equal(pose.frame, MOTION_CELLS.smearV, "a rising launcher must ask for the vertical smear");
  const resolved = resolveMotionPose(pose, (cell) => masks.cyraxx.accept[cell]);
  assert.equal(resolved.bank, "motion", "the regenerated cyraxx smear-v is accepted and must hold");
  // Mask-driven rejection still falls back to the exact base-bank beat.
  const rejected = resolveMotionPose(pose, (cell) => cell !== MOTION_CELLS.smearV);
  assert.deepEqual(rejected, pose.fallback, "a rejected smear-v must fall back to the base-bank beat");
  // The same beat on an accepted sheet keeps the motion cell.
  const jezRiser = createFighterMove("jez", "launcher");
  const jezPose = attackAnimationPose(jezRiser, jezRiser.activeStartFrame - 1);
  assert.equal(resolveMotionPose(jezPose, (cell) => masks.jez.accept[cell]).bank, "motion");
}

function testStrikeBeatContracts() {
  // Smears are FLASH frames: never classified for more than 2 sim frames of
  // any move, on any fighter.
  for (const id of ROSTER) {
    for (const action of ["light", "heavy", "special", "commandSpecial", "launcher", "super"]) {
      const move = createFighterMove(id, action, {});
      if (!move) continue;
      let smears = 0;
      for (let frame = 0; frame <= move.totalFrames; frame += 1) {
        if (attackMotionBeat(move, frame)?.beat === "smear") smears += 1;
      }
      assert.ok(smears <= 2, `${id} ${action} smear must stay a 1-2 frame flash, got ${smears}`);
    }
  }
  // Super startups hold the charge stance until the smear window opens.
  const superMove = createFighterMove("deathblow", "super");
  assert.equal(attackMotionBeat(superMove, 0)?.beat, "charge");
  assert.equal(attackMotionBeat(superMove, superMove.activeStartFrame - 3)?.beat, "charge");
  assert.equal(attackMotionBeat(superMove, superMove.activeStartFrame - 1)?.beat, "smear");
  // Kit-less normals: the matching limb's full-extension cell at the active
  // peak; crouch and air normals keep their authored cells.
  const heavyPunch = createFighterMove("deathblow", "heavy", {});
  assert.deepEqual(attackMotionBeat(heavyPunch, heavyPunch.activeStartFrame),
    { beat: "extension", cell: MOTION_CELLS.punchExt });
  const heavyKick = createFighterMove("deathblow", "heavy", { limb: "kick" });
  assert.deepEqual(attackMotionBeat(heavyKick, heavyKick.activeStartFrame),
    { beat: "extension", cell: MOTION_CELLS.kickExt });
  assert.equal(attackMotionBeat(heavyPunch, heavyPunch.activeEndFrame - 1)?.beat, "follow");
  const sweep = createFighterMove("deathblow", "heavy", { limb: "kick", crouching: true });
  assert.notEqual(attackMotionBeat(sweep, sweep.activeStartFrame)?.beat, "extension");
  const airHeavy = createFighterMove("deathblow", "heavy", { airborne: true });
  assert.equal(attackMotionBeat(airHeavy, airHeavy.activeStartFrame), null);
  // Horizontal heavies smear flat; rising launchers streak upward.
  assert.equal(attackMotionBeat(heavyPunch, heavyPunch.activeStartFrame - 1)?.cell, MOTION_CELLS.smearH);
  const riser = createFighterMove("deathblow", "launcher");
  assert.equal(attackMotionBeat(riser, riser.activeStartFrame - 1)?.cell, MOTION_CELLS.smearV);
}

function testDescriptorDeterminism() {
  // Rollback contract: the same snapshotted attack state must produce the
  // same descriptor on every resimulated walk of the timeline.
  for (const id of ROSTER) {
    for (const action of ["light", "heavy", "special", "super", "launcher"]) {
      const move = createFighterMove(id, action, {});
      if (!move) continue;
      const walk = () => {
        const frames = [];
        for (let frame = 0; frame <= move.totalFrames; frame += 1) {
          frames.push(attackAnimationPose(move, frame));
          frames.push(attackMotionBeat(move, frame));
        }
        return frames;
      };
      assert.deepEqual(walk(), walk(), `${id} ${action} pose walk must resimulate identically`);
    }
  }
}

testManifestAcceptMasks();
testFallbackResolution();
testCyraxxSmearVFallsBack();
testStrikeBeatContracts();
testDescriptorDeterminism();

console.log("Final Blow motion-cell bank tests passed");
