import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  CELL_BODY_CENTRE,
  MOTION_HOLD_BUDGET,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT2_BEATS,
  UNIFIED_EXT2_CELLS,
  UNIFIED_EXT2_CELL_COUNT,
  UNIFIED_EXT2_CELL_HEIGHT,
  UNIFIED_EXT2_RESERVED_CELLS,
  UNIFIED_EXT2_ROUTED_CELLS,
  attackAnimationPose,
  attackMotionBeat,
  attackRecoveryKeys,
  beatKeyRuns,
  buildUnifiedAcceptMasks,
  buildUnifiedExt2AcceptMasks,
  createFighterMove,
  defaultBeatKeyResolve,
  heavyWindupKeys,
  lightWindupKeys,
  longestBeatHold,
  throwClinchKeys,
  throwRecoveryKeys,
  unifiedExt2Cell,
  unifiedExt2DrawnHeight,
  unifiedExt2FighterIds,
  unifiedExt2Frame,
  isAuthoredBank,
} from "../engine/fighter-kits.mjs";

// v4.9 IN-BETWEENS — the third sheet: attack anticipation and recovery keys.

const testDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(testDir, "..", "assets", "unified");
const manifest = JSON.parse(readFileSync(join(assetDir, "MANIFEST.json"), "utf8"));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];
const mainMasks = buildUnifiedAcceptMasks(manifest);
const masks = buildUnifiedExt2AcceptMasks(manifest, mainMasks);
const EXT2 = unifiedExt2FighterIds(masks);
const INBETWEEN = Object.freeze({ inbetween: true });
const shipping = (key) => defaultBeatKeyResolve(key, { motion3: false });
const withExt2 = (key) => defaultBeatKeyResolve(key, { motion3: false, ext2: true });

function testManifestShape() {
  assert.equal(manifest.format.ext2CellCount, UNIFIED_EXT2_CELL_COUNT);
  assert.deepEqual(manifest.format.ext2PoseIds, UNIFIED_EXT2_BEATS);
  assert.match(manifest.format.ext2Status, /WIRED AND SHIPPING/);
  assert.deepEqual(UNIFIED_EXT2_ROUTED_CELLS.concat(UNIFIED_EXT2_RESERVED_CELLS).sort((a, b) => a - b),
    Array.from({ length: 16 }, (_, i) => i), "routed + reserved cover the sheet");
  for (const id of ROSTER) {
    const entry = manifest.fighters[id];
    assert.equal(entry.ext2Sheet, `${id}-ext2.webp`);
    assert.equal(entry.ext2Cells.length, UNIFIED_EXT2_CELL_COUNT);
    assert.ok(entry.ext2Scale > 1 && entry.ext2Scale < 2);
    entry.ext2Cells.forEach((cell, index) => {
      assert.equal(cell.frame, unifiedExt2Cell(index), "ext2 cells carry grammar numbers 24..39");
      assert.equal(cell.id, UNIFIED_EXT2_BEATS[index]);
      assert.equal(cell.accept, true);
    });
    assert.ok(statSync(join(assetDir, entry.ext2Sheet)).size > 100000, `${id} ext2 sheet ships`);
    assert.equal(entry.cells.length, 16, "the main sheet is untouched");
  }
  assert.equal(unifiedExt2Frame(24), 0);
  assert.equal(unifiedExt2Frame(39), 15);
  assert.equal(unifiedExt2Frame(16), -1, "ext grammar cells are not ext2 frames");
  assert.equal(unifiedExt2Frame(40), -1);
}

function testGateAllOrNothing() {
  assert.deepEqual(EXT2, [...ROSTER].sort(), "all ten fighters carry an in-between sheet");
  for (const id of ROSTER) {
    for (const frame of UNIFIED_EXT2_ROUTED_CELLS) assert.equal(masks[id].accept[frame], true);
    for (const frame of UNIFIED_EXT2_RESERVED_CELLS) assert.equal(masks[id].accept[frame], false, "reserved cells never draw");
    assert.equal(UNIFIED_EXT2_RESERVED_CELLS.length, 0, "v5.0 routes the special gather/settle too");
  }
  // Rejecting any routed cell collapses the whole sheet.
  const broken = JSON.parse(JSON.stringify(manifest));
  broken.fighters.jez.ext2Cells[UNIFIED_EXT2_CELLS.kickRecover].accept = false;
  const brokenMasks = buildUnifiedExt2AcceptMasks(broken, mainMasks);
  assert.equal(brokenMasks.jez.whole, false);
  assert.ok(brokenMasks.jez.accept.every((ok) => ok === false));
  // v5.0: the special cells are routed, so rejecting one collapses the sheet too.
  const special = JSON.parse(JSON.stringify(manifest));
  special.fighters.jez.ext2Cells[UNIFIED_EXT2_CELLS.specialWindup].accept = false;
  assert.equal(buildUnifiedExt2AcceptMasks(special, mainMasks).jez.whole, false);
  // A fighter whose main sheet is not whole cannot be whole here.
  const noMain = JSON.parse(JSON.stringify(manifest));
  noMain.fighters.jez.cells[7].accept = false;
  assert.equal(buildUnifiedExt2AcceptMasks(noMain, buildUnifiedAcceptMasks(noMain)).jez.whole, false);
  // No sheet, no cells: never whole, never requested.
  const bare = { fighters: { jez: { cells: manifest.fighters.jez.cells } } };
  assert.equal(buildUnifiedExt2AcceptMasks(bare, buildUnifiedAcceptMasks(bare)).jez.whole, false);
}

function testTracksUnchangedWithoutTheSheet() {
  // Every track a fighter without the sheet draws is byte-identical to 4.8.
  const noExt2 = (keys) => keys.every((key) => key.chain.every((link) => link.bank !== UNIFIED_EXT2_BANK));
  assert.ok(noExt2(attackRecoveryKeys()));
  assert.ok(noExt2(attackRecoveryKeys(undefined, { limb: "kick", heavy: true })));
  assert.ok(noExt2(heavyWindupKeys("punch")));
  assert.ok(noExt2(heavyWindupKeys("kick", { extended: true })));
  assert.ok(noExt2(throwClinchKeys()));
  assert.ok(noExt2(throwRecoveryKeys()));
  assert.deepEqual(lightWindupKeys("punch"), [{ at: 0, chain: [] }], "no cock drawing without the sheet");
  // The cock beat does not exist for a caller who never passes `inbetween`.
  const jab = createFighterMove("jez", "light", {});
  for (let frame = 0; frame < jab.activeStartFrame; frame += 1) {
    assert.notEqual(attackMotionBeat(jab, frame)?.beat, "cock");
    assert.notEqual(attackMotionBeat(jab, frame, { extended: true })?.beat, "cock");
  }
}

function testInbetweenRouting() {
  // The light's whole startup is the cocked limb; the kick limb gets the kick cell.
  const jab = createFighterMove("jez", "light", {});
  for (let frame = 0; frame < jab.activeStartFrame; frame += 1) {
    const beat = attackMotionBeat(jab, frame, INBETWEEN);
    assert.equal(beat.beat, "cock");
    assert.equal(beat.keys[0].chain[0].bank, UNIFIED_EXT2_BANK);
    assert.equal(beat.keys[0].chain[0].cell, UNIFIED_EXT2_CELLS.punchWindup);
  }
  const lightKick = createFighterMove("jez", "light", { limb: "kick" });
  assert.equal(attackMotionBeat(lightKick, 0, INBETWEEN).keys[0].chain[0].cell, UNIFIED_EXT2_CELLS.kickWindup);
  // The cock hands straight to the extension — the smear/windup contract for lights holds.
  assert.equal(attackMotionBeat(jab, jab.activeStartFrame, INBETWEEN)?.beat, "extension");
  // A crouching heavy cocks on the crouch cell; a standing heavy keeps its windup beat,
  // whose LOAD band now opens on the deep wind-up drawing.
  const sweep = createFighterMove("deathblow", "heavy", { limb: "kick", crouching: true });
  assert.equal(attackMotionBeat(sweep, 0, INBETWEEN).keys[0].chain[0].cell, UNIFIED_EXT2_CELLS.crouchKickWindup);
  const heavy = createFighterMove("deathblow", "heavy", {});
  const windup = attackMotionBeat(heavy, 0, INBETWEEN);
  assert.equal(windup.beat, "windup");
  assert.equal(windup.keys[1].chain[0].bank, UNIFIED_EXT2_BANK);
  assert.equal(windup.keys[1].chain[0].cell, UNIFIED_EXT2_CELLS.heavyPunchWindup);
  assert.equal(heavyWindupKeys("kick", INBETWEEN)[1].chain[0].cell, UNIFIED_EXT2_CELLS.heavyKickWindup);
  // Recovery: the band after the follow-through is the limb's own recover cell.
  const recover = attackMotionBeat(jab, jab.activeEndFrame, INBETWEEN);
  assert.equal(recover.beat, "recover");
  assert.equal(recover.keys[1].at, 0.24);
  assert.equal(recover.keys[1].chain[0].cell, UNIFIED_EXT2_CELLS.punchRecover);
  assert.equal(attackMotionBeat(heavy, heavy.activeEndFrame, INBETWEEN).keys[1].chain[0].cell, UNIFIED_EXT2_CELLS.heavyPunchRecover);
  assert.equal(attackMotionBeat(sweep, sweep.activeEndFrame, INBETWEEN).keys[1].chain[0].cell, UNIFIED_EXT2_CELLS.crouchKickRecover);
  // Throws: reach opens the clinch, release opens the recovery's second band.
  assert.equal(throwClinchKeys(INBETWEEN)[0].chain[0].cell, UNIFIED_EXT2_CELLS.throwWindup);
  assert.equal(throwRecoveryKeys(INBETWEEN)[1].chain[0].cell, UNIFIED_EXT2_CELLS.throwRecover);
  // Air normals and kit moves never cock.
  const air = createFighterMove("jez", "light", { airborne: true });
  assert.equal(attackMotionBeat(air, 0, INBETWEEN)?.beat, "airAttack");
  const special = createFighterMove("jez", "special");
  assert.notEqual(attackMotionBeat(special, 0, INBETWEEN)?.beat, "cock");
  // v5.0: a plain special gathers on its own wind-up over the kit cell, and
  // settles on the recover cell at the tail of its recovery; without the
  // sheet the kit art is untouched.
  const gather = attackAnimationPose(special, 0, INBETWEEN);
  assert.equal(gather.bank, UNIFIED_EXT2_BANK);
  assert.equal(gather.frame, UNIFIED_EXT2_CELLS.specialWindup);
  assert.equal(gather.fallback.bank, special.animation.bank);
  assert.deepEqual(attackAnimationPose(special, 0), { bank: special.animation.bank, frame: special.animation.frames[0] });
  const settle = attackAnimationPose(special, special.totalFrames - 1, INBETWEEN);
  assert.equal(settle.bank, UNIFIED_EXT2_BANK);
  assert.equal(settle.frame, UNIFIED_EXT2_CELLS.specialRecover);
  const superMove = createFighterMove("deathblow", "super");
  assert.notEqual(attackAnimationPose(superMove, 0, INBETWEEN)?.bank, UNIFIED_EXT2_BANK, "supers keep their charge");
  // Every routed cell is reachable through some track; reserved cells through none.
  const reached = new Set();
  const collect = (keys) => keys.forEach((key) => key.chain.forEach((link) => { if (link.bank === UNIFIED_EXT2_BANK) reached.add(link.cell); }));
  for (const limb of ["punch", "kick"]) {
    for (const crouching of [false, true]) {
      for (const heavy of [false, true]) {
        collect(lightWindupKeys(limb, { inbetween: true, heavy, crouching }));
        collect(attackRecoveryKeys(INBETWEEN, { limb, heavy, crouching }));
      }
    }
    collect(heavyWindupKeys(limb, INBETWEEN));
  }
  collect(throwClinchKeys(INBETWEEN));
  collect(throwRecoveryKeys(INBETWEEN));
  reached.add(UNIFIED_EXT2_CELLS.specialWindup); reached.add(UNIFIED_EXT2_CELLS.specialRecover); // reached through attackAnimationPose
  assert.deepEqual([...reached].sort((a, b) => a - b), [...UNIFIED_EXT2_ROUTED_CELLS]);
}

function testHoldBudgetsNeverWorsen() {
  const tracks = [
    ["attack recovery", attackRecoveryKeys(INBETWEEN, { limb: "punch" }), attackRecoveryKeys(), 28],
    ["heavy punch windup", heavyWindupKeys("punch", INBETWEEN), heavyWindupKeys("punch"), 17],
    ["heavy kick windup", heavyWindupKeys("kick", INBETWEEN), heavyWindupKeys("kick"), 17],
    ["throw recovery", throwRecoveryKeys(INBETWEEN), throwRecoveryKeys(), 34],
    ["throw clinch", throwClinchKeys(INBETWEEN), throwClinchKeys(), 24],
  ];
  for (const [name, withSheet, without, span] of tracks) {
    const before = longestBeatHold(without, span, shipping);
    const after = longestBeatHold(withSheet, span, withExt2);
    assert.ok(after <= before, `${name}: the in-between sheet must not lengthen any hold (${after} > ${before})`);
    const runs = beatKeyRuns(withSheet, span, withExt2);
    assert.ok(runs.some((run) => run.cell.startsWith("unified-ext2:")), `${name} draws an in-between`);
  }
  // A light's whole startup on one cocked drawing stays inside the hold budget
  // on the slowest jab in the roster (commissioner, 7 ticks).
  assert.ok(createFighterMove("commissioner", "light", {}).activeStartFrame <= MOTION_HOLD_BUDGET);
}

function testMeasuredTables() {
  for (const id of ROSTER) {
    assert.equal(UNIFIED_EXT2_CELL_HEIGHT[id].length, 16, `${id} heights measured`);
    assert.equal(CELL_BODY_CENTRE[id][UNIFIED_EXT2_BANK].length, 16, `${id} body centres measured`);
    const idle = 306;
    for (const frame of [UNIFIED_EXT2_CELLS.punchWindup, UNIFIED_EXT2_CELLS.punchRecover, UNIFIED_EXT2_CELLS.throwWindup]) {
      const drawn = unifiedExt2DrawnHeight(id, frame);
      assert.ok(Math.abs(drawn - idle) / idle < 0.12, `${id} standing in-between ${frame} draws near the idle height (${drawn})`);
    }
    for (const frame of [UNIFIED_EXT2_CELLS.crouchPunchWindup, UNIFIED_EXT2_CELLS.crouchKickWindup]) {
      assert.ok(unifiedExt2DrawnHeight(id, frame) < idle * 0.85, `${id} crouch in-between ${frame} is a crouch`);
    }
  }
}

function testRegistryAndWiring() {
  assert.deepEqual(AUTHORED_BANKS.slice(-5), [UNIFIED_EXT_BANK, UNIFIED_EXT2_BANK, "unified-ext3", "unified-ext4", "unified-ext5"], "the sheets are registered in the order they were added");
  assert.ok(isAuthoredBank(UNIFIED_EXT2_BANK));
  assert.match(gameSource, /if \(bank === UNIFIED_EXT2_BANK\) return unifiedExt2CellDrawable\(fighterId, cell\);/);
  assert.match(gameSource, /const ext2 = unifiedFighterExt2Ready\(fighter\.def\.id\);/);
  assert.match(gameSource, /attackMotionBeat\(attack, fighter\.attackFrame, beatOpt\)/);
  assert.match(gameSource, /throwClinchKeys\(beatOpt\)/);
  assert.match(gameSource, /throwRecoveryKeys\(beatOpt\)/);
  assert.match(gameSource, /if \(beat\?\.beat === "cock"\)/);
  assert.match(gameSource, /\$\{fighterId\}:unified-ext2/);
  // bankSheetAdjust must not branch on the new bank: its sheet correction is
  // folded per cell, exactly like the ext sheet's.
  const adjustBody = gameSource.slice(gameSource.indexOf("function bankSheetAdjust("), gameSource.indexOf("function bankSheetAdjust(") + 1400);
  assert.ok(!adjustBody.includes("UNIFIED_EXT2_BANK"));
  // The sheet is never given an HD path.
  assert.ok(!/hdSheetPath\([^)]*ext2/.test(gameSource));
}

testManifestShape();
testGateAllOrNothing();
testTracksUnchangedWithoutTheSheet();
testInbetweenRouting();
testHoldBudgetsNeverWorsen();
testMeasuredTables();
testRegistryAndWiring();

console.log("Final Blow in-between bank tests passed");
