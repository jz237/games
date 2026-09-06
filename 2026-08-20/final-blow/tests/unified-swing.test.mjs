import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  CELL_BODY_CENTRE,
  MOTION_CELLS,
  MOTION2_CELLS,
  SWING_BANKS,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT3_BEATS,
  UNIFIED_EXT3_CELLS,
  UNIFIED_EXT3_CELL_HEIGHT,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT4_BEATS,
  UNIFIED_EXT4_CELLS,
  UNIFIED_EXT4_CELL_HEIGHT,
  attackRecoveryKeys,
  buildSwingAcceptMasks,
  buildUnifiedAcceptMasks,
  heavyWindupKeys,
  isAuthoredBank,
  swingFighterIds,
  swingFrame,
  swingSubstitute,
} from "../engine/fighter-kits.mjs";

// v5.0 FULL SWING — the strike and reaction sheets, consumed by substitution
// at pose resolution rather than by new beats.

const testDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(testDir, "..", "assets", "unified");
const manifest = JSON.parse(readFileSync(join(assetDir, "MANIFEST.json"), "utf8"));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];
const mainMasks = buildUnifiedAcceptMasks(manifest);
const ext3 = buildSwingAcceptMasks(manifest, UNIFIED_EXT3_BANK, mainMasks);
const ext4 = buildSwingAcceptMasks(manifest, UNIFIED_EXT4_BANK, mainMasks);
const SWING = swingFighterIds(ext3).filter((id) => swingFighterIds(ext4).includes(id));

function testManifestShape() {
  assert.deepEqual(manifest.format.ext3PoseIds, UNIFIED_EXT3_BEATS);
  assert.deepEqual(manifest.format.ext4PoseIds, UNIFIED_EXT4_BEATS);
  assert.match(manifest.format.swingStatus, /WIRED AND SHIPPING/);
  for (const id of SWING) {
    for (const [bank, beats] of [[UNIFIED_EXT3_BANK, UNIFIED_EXT3_BEATS], [UNIFIED_EXT4_BANK, UNIFIED_EXT4_BEATS]]) {
      const spec = SWING_BANKS[bank];
      const entry = manifest.fighters[id];
      assert.equal(entry[spec.sheetKey], `${id}-${spec.sheetKey.replace("Sheet", "")}.webp`);
      assert.equal(entry[spec.cellsKey].length, 16);
      entry[spec.cellsKey].forEach((cell, index) => {
        assert.equal(cell.frame, spec.base + index);
        assert.equal(cell.id, beats[index]);
      });
      assert.ok(statSync(join(assetDir, entry[spec.sheetKey])).size > 100000, `${id} ${bank} ships`);
    }
  }
  assert.equal(swingFrame(UNIFIED_EXT3_BANK, 40), 0);
  assert.equal(swingFrame(UNIFIED_EXT4_BANK, 71), 15);
  assert.equal(swingFrame(UNIFIED_EXT3_BANK, 56), -1);
  assert.equal(swingFrame("motion", 0), -1);
}

function testPerCellGate() {
  assert.ok(SWING.length >= 9, `the roster carries the swing sheets (${SWING.length})`);
  // A rejected cell keeps its own motion drawing; the rest of the sheet stays.
  const partial = JSON.parse(JSON.stringify(manifest));
  partial.fighters.jez.ext3Cells[UNIFIED_EXT3_CELLS.smearH].accept = false;
  const masks = buildSwingAcceptMasks(partial, UNIFIED_EXT3_BANK, mainMasks);
  assert.equal(masks.jez.whole, true);
  assert.equal(masks.jez.accept[UNIFIED_EXT3_CELLS.smearH], false);
  assert.equal(masks.jez.accept[UNIFIED_EXT3_CELLS.punchExt], true);
  // The main sheet must be whole.
  const noMain = JSON.parse(JSON.stringify(manifest));
  noMain.fighters.jez.cells[7].accept = false;
  assert.equal(buildSwingAcceptMasks(noMain, UNIFIED_EXT3_BANK, buildUnifiedAcceptMasks(noMain)).jez.whole, false);
  // No sheet: never whole.
  assert.equal(buildSwingAcceptMasks({ fighters: { jez: { cells: manifest.fighters.jez.cells } } }, UNIFIED_EXT4_BANK).jez.whole, false);
}

function testSubstitutionTable() {
  const E3 = UNIFIED_EXT3_CELLS, E4 = UNIFIED_EXT4_CELLS;
  const sub = (bank, frame, ctx) => swingSubstitute(bank, frame, ctx);
  // Strikes by limb, weight and stance.
  assert.deepEqual(sub("motion", MOTION_CELLS.punchExt, { limb: "punch" }), { bank: UNIFIED_EXT3_BANK, frame: E3.punchExt });
  assert.deepEqual(sub("motion", MOTION_CELLS.punchExt, { limb: "punch", heavy: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.heavyPunchExt });
  assert.deepEqual(sub("motion", MOTION_CELLS.punchExt, { limb: "punch", crouching: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.crouchPunchExt });
  assert.deepEqual(sub("motion", MOTION_CELLS.kickExt, { limb: "kick", heavy: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.heavyKickExt });
  assert.deepEqual(sub("motion", MOTION_CELLS.kickExt, { limb: "kick", crouching: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.sweep });
  assert.deepEqual(sub("motion", MOTION_CELLS.follow, { limb: "kick", attacking: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.kickFollow });
  assert.deepEqual(sub("motion", MOTION_CELLS.follow, { limb: "punch", attacking: true, crouching: true }), { bank: "unified-ext2", frame: 9 }, "a crouching punch holds its crouched recover instead of a standing follow");
  assert.deepEqual(sub("motion2", MOTION2_CELLS.crouchTrans, { attacking: true }), { bank: "unified", frame: 6 }, "the heavy compress band is the unified crouch transition");
  assert.equal(sub("motion2", MOTION2_CELLS.crouchTrans, { attacking: false }), null);
  assert.equal(sub("motion", MOTION_CELLS.follow, { limb: "kick", attacking: false }), null, "the follow-through only stands in for an attack");
  assert.deepEqual(sub("motion", MOTION_CELLS.smearH, {}), { bank: UNIFIED_EXT3_BANK, frame: E3.smearH });
  assert.deepEqual(sub("motion", MOTION_CELLS.smearV, {}), { bank: UNIFIED_EXT3_BANK, frame: E3.smearV });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.airAttack, { limb: "kick" }), { bank: UNIFIED_EXT3_BANK, frame: E3.airKick });
  assert.deepEqual(sub("motion", MOTION_CELLS.tuck, { attacking: true, airborne: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber });
  assert.equal(sub("motion", MOTION_CELLS.tuck, { attacking: false, airborne: true }), null, "a plain jump keeps its tuck");
  // Reactions.
  assert.deepEqual(sub("motion2", MOTION2_CELLS.blockHit, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.guardFlinch });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.lightHit, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.headSnap });
  assert.deepEqual(sub("motion", MOTION_CELLS.bighit, { victimAirborne: false }), { bank: UNIFIED_EXT4_BANK, frame: E4.bigHit });
  assert.deepEqual(sub("motion", MOTION_CELLS.bighit, { victimAirborne: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.launched });
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: true, falling: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.falling });
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: true, falling: false }), { bank: UNIFIED_EXT4_BANK, frame: E4.launched },
    "a carried victim wears the launched arch — the air-hit cell is inverted on every sheet and stays unrouted");
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: false, airborne: true, attacking: true }),
    { bank: "unified-ext", frame: 4, alt: { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber } },
    "an attacker's trail after an air strike is the ext descent, or the chambered air cell where the descent was never accepted");
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: false, airborne: false }), { bank: UNIFIED_EXT3_BANK, frame: E3.land },
    "the landing footing holds the land cell");
  const everyCtx = [{}, { victimAirborne: true }, { victimAirborne: true, falling: true }, { airborne: true, attacking: true }, { attacking: true }];
  for (const cell of Object.values(MOTION_CELLS)) for (const ctx of everyCtx) {
    const out = sub("motion", cell, ctx);
    assert.ok(!(out && out.bank === UNIFIED_EXT4_BANK && out.frame === E4.airHit), "the inverted air-hit cell is never routed");
  }
  assert.deepEqual(sub("motion", MOTION_CELLS.wallsplat, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.wallSplat });
  assert.deepEqual(sub("motion", MOTION_CELLS.crumple, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.crumple });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.getupA, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.getupA });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.thrown, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.thrown });
  // Never touches the unified family or the base bank.
  assert.equal(sub("unified", 0, {}), null);
  assert.equal(sub("base", 11, {}), null);
  assert.equal(sub("motion3", 0, {}), null);
  // Every ext3/ext4 cell except the crouch guard, KO, stagger, body blow and
  // floor bounce is reachable through the table (those five are reserved for
  // a later routing pass), and except the air hit, which every sheet drew
  // inverted and which therefore never routes.
  const reached = new Set();
  const ctxs = [];
  for (const limb of ["punch", "kick"]) for (const heavy of [false, true]) for (const crouching of [false, true])
    for (const attacking of [false, true]) for (const victimAirborne of [false, true]) for (const falling of [false, true])
      ctxs.push({ limb, heavy, crouching, attacking, airborne: true, victimAirborne, falling });
  for (const bank of ["motion", "motion2"]) for (let frame = 0; frame < 16; frame += 1) for (const ctx of ctxs) {
    const s = sub(bank, frame, ctx);
    if (s && (s.bank === UNIFIED_EXT3_BANK || s.bank === UNIFIED_EXT4_BANK)) reached.add(`${s.bank}:${s.frame}`);
  }
  const expectedUnreached = new Set([
    `${UNIFIED_EXT3_BANK}:${E3.crouchGuard}`, `${UNIFIED_EXT4_BANK}:${E4.ko}`, `${UNIFIED_EXT4_BANK}:${E4.stagger}`,
    `${UNIFIED_EXT4_BANK}:${E4.bodyBlow}`, `${UNIFIED_EXT4_BANK}:${E4.floorBounce}`, `${UNIFIED_EXT4_BANK}:${E4.airHit}`,
  ]);
  for (const bank of [UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK]) for (let frame = 0; frame < 16; frame += 1) {
    const key = `${bank}:${frame}`;
    if (expectedUnreached.has(key)) assert.ok(!reached.has(key), `${key} is reserved`);
    else assert.ok(reached.has(key), `${key} must be reachable`);
  }
}

function testTracksUntouched() {
  // Substitution never changes a key track: the hold budgets of 4.9 stand.
  const ids = (keys) => keys.map((k) => k.chain.map((l) => `${l.bank}:${l.cell ?? l.key}`).join("|"));
  assert.ok(ids(attackRecoveryKeys({ inbetween: true }, { limb: "punch" })).every((s) => !s.includes("ext3") && !s.includes("ext4")));
  assert.ok(ids(heavyWindupKeys("kick", { inbetween: true })).every((s) => !s.includes("ext3") && !s.includes("ext4")));
}

function testMeasuredTables() {
  for (const id of SWING) {
    assert.equal(UNIFIED_EXT3_CELL_HEIGHT[id].length, 16);
    assert.equal(UNIFIED_EXT4_CELL_HEIGHT[id].length, 16);
    assert.equal(CELL_BODY_CENTRE[id][UNIFIED_EXT3_BANK].length, 16);
    assert.equal(CELL_BODY_CENTRE[id][UNIFIED_EXT4_BANK].length, 16);
    assert.ok(UNIFIED_EXT3_CELL_HEIGHT[id][UNIFIED_EXT3_CELLS.sweep] < UNIFIED_EXT3_CELL_HEIGHT[id][UNIFIED_EXT3_CELLS.punchExt], `${id} the sweep is low`);
    assert.ok(UNIFIED_EXT4_CELL_HEIGHT[id][UNIFIED_EXT4_CELLS.ko] < UNIFIED_EXT4_CELL_HEIGHT[id][UNIFIED_EXT4_CELLS.guardFlinch] * 0.6, `${id} the KO lies flat`);
    const entry = manifest.fighters[id];
    if (entry.generationGrid === "6x4") {
      // A 24-panel main sheet draws its figure smaller than a 4x4 generation
      // does, so its swing sheets carry their own scale (ali, v5.0).
      assert.ok(entry.ext3Scale > 1 && entry.ext3Scale < 2 && entry.ext4Scale > 1 && entry.ext4Scale < 2, `${id} swing scales are sane`);
    } else {
      assert.equal(entry.ext3Scale, entry.scale, `${id} ext3 is built at the unified scale`);
      assert.equal(entry.ext4Scale, entry.scale, `${id} ext4 is built at the unified scale`);
    }
  }
}

function testRegistryAndWiring() {
  assert.deepEqual(AUTHORED_BANKS.slice(-2), [UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK]);
  assert.ok(isAuthoredBank(UNIFIED_EXT3_BANK) && isAuthoredBank(UNIFIED_EXT4_BANK));
  assert.match(gameSource, /return swingResolve\(fighter, resolvedPose\);/);
  assert.match(gameSource, /if \(bank === UNIFIED_EXT3_BANK \|\| bank === UNIFIED_EXT4_BANK\) return swingCellDrawable\(fighterId, cell, bank\);/);
  assert.match(gameSource, /\$\{fighterId\}:\$\{bank\}/);
  const adjustBody = gameSource.slice(gameSource.indexOf("function bankSheetAdjust("), gameSource.indexOf("function bankSheetAdjust(") + 1600);
  assert.ok(!adjustBody.includes("UNIFIED_EXT3_BANK") && !adjustBody.includes("UNIFIED_EXT4_BANK"));
  assert.ok(!/hdSheetPath\([^)]*ext[34]/.test(gameSource));
}

testManifestShape();
testPerCellGate();
testSubstitutionTable();
testTracksUntouched();
testMeasuredTables();
testRegistryAndWiring();

console.log("Final Blow swing bank tests passed");
