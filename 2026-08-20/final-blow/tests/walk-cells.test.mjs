import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  WALK_CELLS,
  WALK_CELL_COUNT,
  baseCellRoles,
  buildMotionAcceptMasks,
  isAuthoredBank,
  resolveMotionPose,
  walkCycleFrame,
  walkCyclePose,
  walkPose,
} from "../engine/fighter-kits.mjs";

// v2.10 WALK — the self-contained four-key walk bank (MOTION-ATLAS.md "Walk
// bank"). The contract this file pins down:
//   * the manifest describes a FOUR-cell grammar and every accepted fighter
//     actually has a sheet on disk;
//   * a fighter with no accepted sheet keeps the pre-2.10 base-only walk
//     BYTE-IDENTICALLY, through a chained fallback that lands on the exact
//     base cell that stride phase already showed;
//   * the cycle orders 0 -> 1 -> 2 -> 3 -> 0 off the same walkTime phase the
//     base cycle has always used, so locomotion speed still drives cadence;
//   * descriptors are pure functions of snapshotted sim state.

const testDir = dirname(fileURLToPath(import.meta.url));
const walkDir = join(testDir, "..", "assets", "walk");
const manifest = JSON.parse(readFileSync(join(walkDir, "MANIFEST.json"), "utf8"));

const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];
// The fighters whose sheets cleared the gate. Everyone else is base-only.
// 2.10 shipped deathblow and jez; 2.11 added post, cyraxx, ali and benny.
// alan, donald, commissioner and devil were generated and REJECTED — their
// reasons are recorded in MANIFEST.json `rejected`.
const WIRED = ["deathblow", "jez", "post", "cyraxx", "ali", "benny"];

function testManifestShape() {
  assert.equal(manifest.format.cellCount, WALK_CELL_COUNT);
  assert.deepEqual(manifest.format.poseIds,
    ["contact-left", "passing-left", "contact-right", "passing-right"]);
  assert.deepEqual(Object.keys(manifest.fighters).sort(), [...WIRED].sort(),
    "only gate-passing fighters may appear in `fighters` — an entry there is "
    + "what makes the loader request a sheet");

  for (const id of WIRED) {
    const entry = manifest.fighters[id];
    assert.equal(entry.sheet, `${id}.webp`);
    assert.ok(existsSync(join(walkDir, entry.sheet)), `${id} sheet must exist on disk`);
    // The sheet must be a real WebP, not a stray PNG renamed.
    const head = readFileSync(join(walkDir, entry.sheet)).subarray(0, 12);
    assert.equal(head.subarray(0, 4).toString("latin1"), "RIFF", `${id} sheet must be RIFF`);
    assert.equal(head.subarray(8, 12).toString("latin1"), "WEBP", `${id} sheet must be WEBP`);

    assert.equal(entry.cells.length, WALK_CELL_COUNT);
    entry.cells.forEach((cell, index) => {
      assert.equal(cell.frame, index, `${id} cell ${index} must be in grammar order`);
      assert.equal(cell.id, manifest.format.poseIds[index]);
      assert.equal(typeof cell.accept, "boolean");
      assert.ok(cell.note && cell.note.length > 0,
        `${id} cell ${index} must carry the reviewer's measured note`);
    });
    assert.ok(entry.scale > 0 && entry.scale < 2, `${id} build scale should be recorded`);
  }

  // Rejections are RECORDED, not deleted, so a later wave cannot re-run the
  // same experiment blind — and they must stay out of `fighters`.
  assert.ok(manifest.rejected.devil.reason.length > 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest.fighters, "devil"));
}

function testAcceptMasks() {
  const masks = buildMotionAcceptMasks(manifest, WALK_CELL_COUNT);
  assert.deepEqual(Object.keys(masks).sort(), [...WIRED].sort());
  for (const id of WIRED) {
    assert.equal(masks[id].accept.length, WALK_CELL_COUNT,
      `${id} mask must cover exactly the 4-cell grammar, not the 16-cell one`);
    // v2.9 CROSS-BANK CONSISTENCY GATE (final round) — THE WHOLE WALK BANK IS
    // DISABLED, on all six sheeted fighters, all four keys each.
    //
    // Every sheet was read at 1:1 beside the base cells it plays next to and
    // every one of them redraws the character. Named, per fighter, in the
    // manifest notes: deathblow's clear prescription glasses become opaque
    // black sunglasses and his red plaid forearm wraps become segmented
    // gunmetal gauntlets; jez's saturated royal-blue gi goes pale grey-blue
    // and his dark boots go tan; post loses most of his build; ali's blocked
    // black/yellow tracksuit panels become thin side stripes and key 0 wears
    // BROWN trousers; benny's trousers alternate olive and khaki between keys
    // of one cycle; cyraxx grows hair over a bald crown.
    //
    // Six fighters having a "true four-key cycle" that swaps their glasses on
    // every walk entry and exit is worse than none, so the bank is off and the
    // base walk that shipped in 2.8 is what plays. THIS ASSERTION IS THE LOCK:
    // re-enabling any key requires a re-authored sheet and a deliberate edit
    // here, not a manifest flag flipped in passing.
    assert.deepEqual([...masks[id].accept], [false, false, false, false],
      `${id} walk keys must stay DISABLED — see the consistency-gate notes in `
      + `assets/walk/MANIFEST.json and MOTION-ATLAS.md`);
  }
  // A fighter absent from the manifest has NO mask at all, which is what makes
  // walkCellDrawable false for the other eight without ever requesting a sheet.
  for (const id of ROSTER.filter((f) => !WIRED.includes(f))) {
    assert.equal(masks[id], undefined, `${id} must have no walk mask`);
  }
  // A cell missing from a manifest entry defaults to REJECTED, so a truncated
  // manifest can never ship an unreviewed key.
  const partial = buildMotionAcceptMasks(
    { fighters: { deathblow: { cells: [{ frame: 0, accept: true }] } } }, WALK_CELL_COUNT);
  assert.deepEqual([...partial.deathblow.accept], [true, false, false, false]);
  // The 16-cell banks are untouched by the new parameter's default.
  const wide = buildMotionAcceptMasks({ fighters: { deathblow: { cells: [] } } });
  assert.equal(wide.deathblow.accept.length, 16);
}

function testCycleOrdering() {
  // 0 -> 1 -> 2 -> 3 -> 0, on the same walkTime * 10 phase the base cycle uses.
  assert.deepEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5].map(walkCycleFrame), [0, 1, 2, 3, 0, 1]);
  // Contact keys are the even ones, passing keys the odd ones.
  assert.equal(WALK_CELLS.contactLeft, 0);
  assert.equal(WALK_CELLS.passingLeft, 1);
  assert.equal(WALK_CELLS.contactRight, 2);
  assert.equal(WALK_CELLS.passingRight, 3);
  // Every key is reachable and the cycle never leaves the grammar, including
  // on a long-running or (defensively) negative/NaN walkTime.
  const seen = new Set();
  for (let t = 0; t < 40; t += 0.1) seen.add(walkCycleFrame(t));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  for (const bad of [-0.1, -5, NaN, undefined, Infinity]) {
    const frame = walkCycleFrame(bad);
    assert.ok(Number.isInteger(frame) && frame >= 0 && frame < WALK_CELL_COUNT,
      `walkCycleFrame(${bad}) must stay inside the grammar, got ${frame}`);
  }
  // The two contact keys are a half-cycle apart, as are the two passing keys.
  assert.equal((walkCycleFrame(0) + 2) % 4, walkCycleFrame(0.2));
  assert.equal((walkCycleFrame(0.1) + 2) % 4, walkCycleFrame(0.3));
}

function testBaseOnlyWalkIsByteIdentical() {
  // THE REGRESSION GUARD. For every fighter, the descriptor's fallback must be
  // exactly the base cell the pre-2.10 read (`base(4 + floor(walkTime*10)%4)`)
  // would have drawn at that instant. Eight of ten fighters render only this.
  for (const id of ROSTER) {
    const roles = baseCellRoles(id);
    for (let step = 0; step < 12; step += 1) {
      const walkTime = step * 0.1;
      const legacy = 4 + Math.floor(walkTime * 10) % 4;
      const pose = walkCyclePose(walkTime, roles);
      assert.equal(pose.bank, "walk");
      assert.equal(pose.frame, walkCycleFrame(walkTime));
      assert.equal(pose.fallback.bank, "base");
      assert.equal(pose.fallback.frame, legacy,
        `${id} @${walkTime.toFixed(1)}: fallback must be the pre-2.10 base cell`);
    }
  }
}

function testChainedFallbackToBase() {
  const roles = baseCellRoles("alan");
  const pose = walkCyclePose(0.2, roles);       // key 2, fallback base 6
  // No sheet / rejected cell -> the base walk cell draws instead.
  assert.deepEqual(resolveMotionPose(pose, () => false, "alan"), { bank: "base", frame: 6 });
  // Sheet present and cell accepted -> the authored key holds.
  assert.equal(resolveMotionPose(pose, () => true, "alan").bank, "walk");
  assert.equal(resolveMotionPose(pose, () => true, "alan").frame, 2);
  // The gate is per BANK: a loaded motion bank must not license a walk cell.
  const bankAware = (cell, bank) => bank !== "walk";
  assert.deepEqual(resolveMotionPose(pose, bankAware, "alan"), { bank: "base", frame: 6 });
  // Chaining still works when a walk descriptor falls back through bank 1.
  const chained = walkPose(0, "motion", 7);
  chained.fallback.fallback = { bank: "base", frame: 5 };
  assert.deepEqual(resolveMotionPose(chained, () => false, "alan"), { bank: "base", frame: 5 });
  // deathblow's `unusable` base-cell swap still runs on whatever base cell wins.
  const toDefect = walkPose(0, "base", 13);
  assert.equal(resolveMotionPose(toDefect, () => false, "deathblow").frame, 9);
}

function testDescriptorDeterminism() {
  // Pure function of snapshotted sim state: same walkTime in, same descriptor
  // out, every time — so rollback resimulation and both online peers agree.
  const roles = baseCellRoles("jez");
  for (const walkTime of [0, 0.37, 1.24, 9.81]) {
    const a = walkCyclePose(walkTime, roles);
    const b = walkCyclePose(walkTime, roles);
    assert.deepEqual(a, b);
  }
  // And it defaults sanely when no role map is supplied.
  assert.equal(walkCyclePose(0.1).fallback.frame, 5);
}

function testAuthoredBankRegistry() {
  // Both renderers and resolveMotionPose route off this one list, so the walk
  // bank cannot be gated in 2D and ungated in 3D.
  assert.deepEqual(AUTHORED_BANKS, ["motion", "motion2", "walk"]);
  for (const bank of AUTHORED_BANKS) assert.equal(isAuthoredBank(bank), true);
  for (const bank of ["base", "specials", undefined]) {
    assert.equal(isAuthoredBank(bank), false);
  }
}

testManifestShape();
testAcceptMasks();
testCycleOrdering();
testBaseOnlyWalkIsByteIdentical();
testChainedFallbackToBase();
testDescriptorDeterminism();
testAuthoredBankRegistry();

console.log("Final Blow walk bank tests passed");
