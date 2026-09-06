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
  BLOCK_EXIT_AT,
  SWING_STAND_IN_CLAMP,
  SWING_STAND_IN_DEADBAND,
  SWING_STAND_IN_TARGET,
  UNIFIED_BANK,
  UNIFIED_CELLS,
  UNIFIED_SHEET_FOLD,
  attackRecoveryKeys,
  blockstunKeys,
  buildSwingAcceptMasks,
  buildUnifiedAcceptMasks,
  cellDrawAdjust,
  crouchBlockstunKeys,
  defaultBeatKeyResolve,
  heavyWindupKeys,
  isAuthoredBank,
  swingDrawnHeight,
  swingFighterIds,
  swingFrame,
  swingStandInAdjust,
  swingSubstitute,
  unifiedScreenHeight,
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
  assert.deepEqual(sub("motion2", MOTION2_CELLS.blockHit, { crouching: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.crouchGuard },
    "a crouched block flinch is the crouch guard, never the standing cover");
  assert.deepEqual(sub("motion2", MOTION2_CELLS.lightHit, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.headSnap });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.lightHit, { blocking: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.guardFlinch }, "a blocked hit's settle fallback keeps the flinch");
  assert.deepEqual(sub("motion2", MOTION2_CELLS.lightHit, { blocking: true, crouching: true }), { bank: UNIFIED_EXT3_BANK, frame: E3.crouchGuard });
  assert.deepEqual(sub("unified", 12, { blocking: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.guardFlinch }, "the unified light hit keeps the flinch on a block too");
  assert.deepEqual(sub("motion2", MOTION2_CELLS.lightHit, { bodyBlow: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.bodyBlow });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.dizzy, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.dizzy });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.dizzy, { reeling: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.stagger },
    "the onset of a dizzy / guard crush reels before the sway");
  // v5.1: THE UNIFIED REACTION CELLS. Every reaction chain leads with a
  // unified rung and all ten fighters are whole on that bank, so the motion
  // links the 5.0 table keyed on were never the resolved pose — the head snap
  // and big hit were dead. The table keys on the resolved unified cell now.
  const U = UNIFIED_CELLS;
  assert.deepEqual(sub(UNIFIED_BANK, U.lightHit, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.headSnap });
  assert.deepEqual(sub(UNIFIED_BANK, U.lightHit, { bodyBlow: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.bodyBlow },
    "a MID/LOW hit or a crouched victim opens on the body blow");
  assert.deepEqual(sub(UNIFIED_BANK, U.bigHit, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.bigHit });
  assert.deepEqual(sub(UNIFIED_BANK, U.bigHit, { victimAirborne: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.launched });
  assert.deepEqual(sub(UNIFIED_BANK, U.stagger, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.stagger });
  assert.deepEqual(sub(UNIFIED_BANK, U.knockdown, { ko: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.ko });
  assert.equal(sub(UNIFIED_BANK, U.knockdown, {}), null, "a plain knockdown keeps the unified cell (the wake-up chain reads it)");
  for (const cell of [U.idle, U.guard, U.crouch, U.crouchTrans, U.walkContactA, U.jumpRise, U.punchExt]) {
    assert.equal(sub(UNIFIED_BANK, cell, { bodyBlow: true, ko: true, victimAirborne: true }), null, `unified:${cell} is never substituted`);
  }
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
  const everyCtx = [{}, { victimAirborne: true }, { victimAirborne: true, falling: true }, { airborne: true, attacking: true }, { attacking: true },
    { bodyBlow: true }, { ko: true }, { reeling: true }];
  for (const bank of ["motion", "motion2", UNIFIED_BANK]) for (let cell = 0; cell < 24; cell += 1) for (const ctx of everyCtx) {
    const out = sub(bank, cell, ctx);
    assert.ok(!(out && out.bank === UNIFIED_EXT4_BANK && out.frame === E4.airHit), "the inverted air-hit cell is never routed");
    assert.ok(!(out && out.bank === UNIFIED_EXT4_BANK && out.frame === E4.floorBounce), "the feet-up floor-bounce cell is never routed");
  }
  assert.deepEqual(sub("motion", MOTION_CELLS.wallsplat, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.wallSplat });
  assert.deepEqual(sub("motion", MOTION_CELLS.crumple, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.crumple });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.getupA, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.getupA });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.thrown, {}), { bank: UNIFIED_EXT4_BANK, frame: E4.thrown });
  // Never touches the unified family or the base bank.
  assert.equal(sub("unified", 0, {}), null);
  assert.equal(sub("base", 11, {}), null);
  assert.equal(sub("motion3", 0, {}), null);
  // v5.1: every ext3/ext4 cell is reachable through the table except the two
  // that stay unrouted BY DECISION: the air hit (inverted on every sheet) and
  // the floor bounce (a body on its shoulders, feet in the air, on every
  // sheet, with no ground-bounce sim state to key it on). 5.0 reserved the
  // crouch guard, KO, stagger and body blow "for a later pass"; this is it.
  const reached = new Set();
  const ctxs = [];
  for (const limb of ["punch", "kick"]) for (const heavy of [false, true]) for (const crouching of [false, true])
    for (const attacking of [false, true]) for (const victimAirborne of [false, true]) for (const falling of [false, true])
      for (const bodyBlow of [false, true]) for (const reeling of [false, true]) for (const ko of [false, true])
        ctxs.push({ limb, heavy, crouching, attacking, airborne: true, victimAirborne, falling, bodyBlow, reeling, ko });
  for (const bank of ["motion", "motion2", UNIFIED_BANK]) for (let frame = 0; frame < 16; frame += 1) for (const ctx of ctxs) {
    const s = sub(bank, frame, ctx);
    if (s && (s.bank === UNIFIED_EXT3_BANK || s.bank === UNIFIED_EXT4_BANK)) reached.add(`${s.bank}:${s.frame}`);
  }
  const expectedUnreached = new Set([
    `${UNIFIED_EXT4_BANK}:${E4.floorBounce}`, `${UNIFIED_EXT4_BANK}:${E4.airHit}`,
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
  // Engineering pass: the resolver moved to engine/swing-resolve.mjs (tested
  // in tests/swing-resolve.test.mjs); game.js applies it at the single
  // resolution choke point with the bank-routed gate. The pin follows.
  assert.match(gameSource, /const pose = swingResolve\(resolvedPose, swingContext\(fighter, \{ roundDecided: [^}]+\}\), \(cell, bank\) => motionBankCellDrawable\(fighter\.def\.id, cell, bank\)\);/);
  assert.match(gameSource, /import \{ swingContext, swingResolve \} from "\.\/engine\/swing-resolve\.mjs";/);
  assert.ok(!/^function swingResolve\(/m.test(gameSource), "no second resolver in game.js");
  assert.match(gameSource, /if \(bank === UNIFIED_EXT3_BANK \|\| bank === UNIFIED_EXT4_BANK\) return swingCellDrawable\(fighterId, cell, bank\);/);
  assert.match(gameSource, /\$\{fighterId\}:\$\{bank\}/);
  const adjustBody = gameSource.slice(gameSource.indexOf("function bankSheetAdjust("), gameSource.indexOf("function bankSheetAdjust(") + 1600);
  assert.ok(!adjustBody.includes("UNIFIED_EXT3_BANK") && !adjustBody.includes("UNIFIED_EXT4_BANK"));
  assert.ok(!/hdSheetPath\([^)]*ext[34]/.test(gameSource));
  // v5.1: the three reaction reads swingResolve hands the table, and the
  // sim field the body blow keys on — snapshotted as presentation data.
  // (5.1 integration: the resolver lives in engine/swing-resolve.mjs — the
  // reads are pinned there; game.js only hands it the phase read.)
  const resolverSource = readFileSync(join(testDir, "..", "engine", "swing-resolve.mjs"), "utf8");
  const resolveBody = resolverSource.slice(resolverSource.indexOf("export function swingContext("), resolverSource.indexOf("export function swingContext(") + 3600);
  assert.match(resolveBody, /bodyBlow: fighter\.hitstunFrames > 0/);
  assert.match(resolveBody, /Boolean\(fighter\.crouch\) \|\| fighter\.lastHitLevel === ATTACK_LEVELS\.LOW\)/);
  assert.ok(!/lastHitLevel === ATTACK_LEVELS\.MID/.test(resolveBody), "a MID jab is a face hit, not a body blow");
  assert.match(resolveBody, /reeling: \(fighter\.dizzyFrames > 0/);
  assert.match(resolveBody, /ko: Boolean\(roundDecided\) && fighter\.health <= 0/);
  assert.match(gameSource, /"lastHitResult",\s*(\/\/[^\n]*\n\s*)?"lastHitLevel",/, "lastHitLevel is a snapshotted presentation field");
  assert.match(gameSource, /victim\.lastHitLevel = attack\.level;/);
  assert.match(gameSource, /victim\.lastHitLevel = projectile\.level;/);
  // The crouch blockstun branch draws the ext3 crouch guard over the crouch
  // read, and the flinch-exit bridge rides a crouched block too.
  assert.match(gameSource, /if \(fighter\.blockstunFrames > 0 && fighter\.crouch && fighter\.grounded\) \{[\s\S]{0,600}beatPoseAt\(crouchBlockstunKeys\(\), blockPhase, uni\(UNIFIED_CELLS\.crouch, base\(roles\.crouch\)\)\)/);
  assert.match(gameSource, /if \(fighter\.blockstunFrames > 0 && fighter\.grounded && !reducedMotion\) \{\s*\n\s*const blockTotal/);
  // The engine's sheet fold mirrors the correction game.js applies to the
  // unified bank, so an on-screen comparison puts it on the right side.
  assert.match(gameSource, /const UNIFIED_SHEET_ADJUST = Object\.freeze\(\{ commissioner: 1\.033 \}\);/);
  assert.deepEqual(UNIFIED_SHEET_FOLD, { commissioner: 1.033 });
}

/**
 * v5.1 — THE STAND-IN HEIGHT CONTRACT. The ext4 guard flinch drew through a
 * reconciliation computed for motion2:8 and grew benny 13%, cyraxx 11% and
 * alan 9% on every blocked hit. Every routed stand-in now lands within the
 * deadband of the unified rung it replaces (match) or no taller than the idle
 * (ceiling), on screen, through the one number both renderers read.
 */
function testStandInHeights() {
  const E3 = UNIFIED_EXT3_CELLS, E4 = UNIFIED_EXT4_CELLS;
  const screen = (id, bank, frame) => swingDrawnHeight(id, bank, frame) * swingStandInAdjust(id, bank, frame);
  for (const id of SWING) {
    for (const [bank, frame, cell] of [[UNIFIED_EXT4_BANK, E4.guardFlinch, UNIFIED_CELLS.guard], [UNIFIED_EXT4_BANK, E4.headSnap, UNIFIED_CELLS.lightHit], [UNIFIED_EXT3_BANK, E3.crouchGuard, UNIFIED_CELLS.crouch]]) {
      const ratio = screen(id, bank, frame) / unifiedScreenHeight(id, cell);
      assert.ok(Math.abs(ratio - 1) <= SWING_STAND_IN_DEADBAND + 1e-9, `${id} ${bank}:${frame} lands on unified:${cell} (${ratio.toFixed(3)})`);
    }
    for (const frame of [E4.bodyBlow, E4.bigHit, E4.stagger]) {
      const ratio = screen(id, UNIFIED_EXT4_BANK, frame) / unifiedScreenHeight(id, UNIFIED_CELLS.idle);
      assert.ok(ratio <= 1 + SWING_STAND_IN_DEADBAND + 1e-9, `${id} ext4:${frame} never draws taller than the idle (${ratio.toFixed(3)})`);
    }
    for (const [bank, targets] of Object.entries(SWING_STAND_IN_TARGET)) for (const frame of Object.keys(targets)) {
      const adjust = swingStandInAdjust(id, bank, Number(frame));
      assert.ok(adjust >= SWING_STAND_IN_CLAMP.min && adjust <= SWING_STAND_IN_CLAMP.max, `${id} ${bank}:${frame} inside the clamp`);
      assert.equal(cellDrawAdjust(id, bank, Number(frame), { unified: true }) / adjust > 0, true);
    }
    // Nothing outside the routed set moves: the get-up rung the wake-up seam
    // is measured on, the crumple, the thrown cell.
    for (const frame of [E4.crumple, E4.getupA, E4.getupB, E4.thrown, E4.launched, E4.falling, E4.wallSplat, E4.dizzy, E4.ko]) {
      assert.equal(swingStandInAdjust(id, UNIFIED_EXT4_BANK, frame), 1, `${id} ext4:${frame} untouched`);
    }
    for (let frame = 0; frame < 16; frame += 1) if (frame !== E3.crouchGuard) assert.equal(swingStandInAdjust(id, UNIFIED_EXT3_BANK, frame), 1);
  }
  // The measured pop this closes, on the sheets in the repo: without the
  // reconciliation benny's flinch is 13% over his guard, cyraxx's 11%.
  assert.ok(swingDrawnHeight("benny", UNIFIED_EXT4_BANK, E4.guardFlinch) / unifiedScreenHeight("benny", UNIFIED_CELLS.guard) > 1.12);
  assert.ok(swingStandInAdjust("benny", UNIFIED_EXT4_BANK, E4.guardFlinch) < 0.9);
  assert.equal(swingStandInAdjust("jez", "motion2", MOTION2_CELLS.blockHit), 1, "the motion2 flinch keeps its own M4 path");
}

/** v5.1 — the crouch blockstun track: flinch to BLOCK_EXIT_AT, then the crouch. */
function testCrouchBlockstunTrack() {
  const keys = crouchBlockstunKeys();
  assert.equal(keys[0].at, 0);
  assert.deepEqual(keys[0].chain, [{ bank: UNIFIED_EXT3_BANK, cell: UNIFIED_EXT3_CELLS.crouchGuard }]);
  assert.equal(keys[1].at, BLOCK_EXIT_AT, "hands back on the same tick the standing flinch does");
  assert.ok(keys.slice(1).every((key) => key.chain.length === 0), "the recovery is the caller's crouch read");
  assert.deepEqual(keys.map((k) => k.at), blockstunKeys().map((k) => k.at), "same band grid as the standing track");
  assert.equal(defaultBeatKeyResolve(keys[0], { swing: true }), `${UNIFIED_EXT3_BANK}:${UNIFIED_EXT3_CELLS.crouchGuard}`);
  assert.equal(defaultBeatKeyResolve(keys[0], { fallback: "crouch" }), "crouch", "a fighter without the sheet reads the crouch on every tick");
}

testManifestShape();
testPerCellGate();
testSubstitutionTable();
testTracksUntouched();
testMeasuredTables();
testRegistryAndWiring();
testStandInHeights();
testCrouchBlockstunTrack();

console.log("Final Blow swing bank tests passed");
