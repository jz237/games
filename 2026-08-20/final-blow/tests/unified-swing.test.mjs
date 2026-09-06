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
  UNIFIED_EXT5_BANK,
  UNIFIED_EXT5_BEATS,
  UNIFIED_EXT5_CELLS,
  UNIFIED_EXT5_CELL_HEIGHT,
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
  airNormalKeys,
  auditBodyCentres,
  baseCellDrawAdjust,
  dashKeys,
  jumpArcKeys,
  lightWindupKeys,
  reactionTrackKeys,
  throwClinchKeys,
  throwRecoveryKeys,
  wakeupKeys,
  x5key,
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
const ext5 = buildSwingAcceptMasks(manifest, UNIFIED_EXT5_BANK, mainMasks);

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
  // v5.2 (ext5-air): a NEUTRAL airborne tuck — the air-tech ball — is the
  // ext5 apex tuck (the plain jump's tuck band leads with unified:9 under
  // the `air` answer and never resolves the motion tuck); on the floor, nothing.
  assert.deepEqual(sub("motion", MOTION_CELLS.tuck, { attacking: false, airborne: true }), { bank: UNIFIED_EXT5_BANK, frame: UNIFIED_EXT5_CELLS.apexTuck });
  assert.equal(sub("motion", MOTION_CELLS.tuck, { attacking: false, airborne: false }), null, "a tuck on the floor is nobody's");
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
  // v5.2 (ext5-air): a carried victim wears the ext5 upright air hit (a fold,
  // head above the hips on every sheet) with the launched arch as its alt;
  // the ext4 air-hit cell is inverted on every sheet and stays unrouted.
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: true, falling: false }),
    { bank: UNIFIED_EXT5_BANK, frame: UNIFIED_EXT5_CELLS.airHitUpright, alt: { bank: UNIFIED_EXT4_BANK, frame: E4.launched } });
  // v5.2 (ext5-air): the attacker's trail after an air strike (and every other
  // neutral airborne body) is the air recover; behind it the 5.0 chain in its
  // order — the ext descent where accepted, then the chambered air cell.
  const trail = { bank: UNIFIED_EXT5_BANK, frame: UNIFIED_EXT5_CELLS.airRecover, alt: { bank: "unified-ext", frame: 4, alt: { bank: UNIFIED_EXT3_BANK, frame: E3.airChamber } } };
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: false, airborne: true, attacking: true }), trail);
  assert.deepEqual(sub("motion", MOTION_CELLS.airrec, { victimAirborne: false, airborne: true, attacking: false }), trail, "the air-tech tail and the plain jump's last airborne band read the same key");
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
  assert.deepEqual(AUTHORED_BANKS.slice(-3), [UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK]);
  assert.ok(isAuthoredBank(UNIFIED_EXT3_BANK) && isAuthoredBank(UNIFIED_EXT4_BANK) && isAuthoredBank(UNIFIED_EXT5_BANK));
  // Engineering pass: the resolver moved to engine/swing-resolve.mjs (tested
  // in tests/swing-resolve.test.mjs); game.js applies it at the single
  // resolution choke point with the bank-routed gate. The pin follows.
  assert.match(gameSource, /const pose = swingResolve\(resolvedPose, swingContext\(fighter, \{ roundDecided: [^}]+\}\), \(cell, bank\) => motionBankCellDrawable\(fighter\.def\.id, cell, bank\)\);/);
  assert.match(gameSource, /import \{ swingContext, swingResolve \} from "\.\/engine\/swing-resolve\.mjs";/);
  assert.ok(!/^function swingResolve\(/m.test(gameSource), "no second resolver in game.js");
  assert.match(gameSource, /if \(bank === UNIFIED_EXT3_BANK \|\| bank === UNIFIED_EXT4_BANK \|\| bank === UNIFIED_EXT5_BANK\) return swingCellDrawable\(fighterId, cell, bank\);/);
  assert.match(gameSource, /\$\{fighterId\}:\$\{bank\}/);
  const adjustBody = gameSource.slice(gameSource.indexOf("function bankSheetAdjust("), gameSource.indexOf("function bankSheetAdjust(") + 1600);
  assert.ok(!adjustBody.includes("UNIFIED_EXT3_BANK") && !adjustBody.includes("UNIFIED_EXT4_BANK") && !adjustBody.includes("UNIFIED_EXT5_BANK"));
  assert.ok(!/hdSheetPath\([^)]*ext[345]/.test(gameSource));
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
  assert.match(gameSource, /if \(fighter\.blockstunFrames > 0 && fighter\.crouch && fighter\.grounded\) \{[\s\S]{0,700}beatPoseAt\(crouchBlockstunKeys\(\{ flinch \}\), blockPhase, uni\(UNIFIED_CELLS\.crouch, base\(roles\.crouch\)\)\)/);
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
  // v5.2: with the ext5 crouch guard flinch drawable (`flinch`, the caller's
  // capability answer) the impact band opens on it and the crouch guard
  // takes the settle band — an impact and a settle, like the standing track.
  // Same grid; the last band still hands to the crouch.
  const flinch = crouchBlockstunKeys({ flinch: true });
  assert.deepEqual(flinch.map((k) => k.at), keys.map((k) => k.at), "the flinch track keeps the 5.1 grid");
  assert.deepEqual(flinch[0].chain, [{ bank: UNIFIED_EXT5_BANK, cell: UNIFIED_EXT5_CELLS.crouchGuardFlinch }, { bank: UNIFIED_EXT3_BANK, cell: UNIFIED_EXT3_CELLS.crouchGuard }]);
  assert.deepEqual(flinch[1].chain, [{ bank: UNIFIED_EXT3_BANK, cell: UNIFIED_EXT3_CELLS.crouchGuard }]);
  assert.deepEqual(flinch[2].chain, []);
  assert.deepEqual(crouchBlockstunKeys({ flinch: false }), keys, "without the answer the track is the 5.1 one");
  assert.deepEqual(crouchBlockstunKeys(), keys);
  // game.js answers per fighter from the per-cell gate, so ali (flinch held)
  // keeps the 5.1 track while the other nine open on the flinch.
  assert.match(gameSource, /const flinch = swingCellDrawable\(fighter\.def\.id, UNIFIED_EXT5_CELLS\.crouchGuardFlinch, UNIFIED_EXT5_BANK\);\s*\n\s*return beatPoseAt\(crouchBlockstunKeys\(\{ flinch \}\), blockPhase, uni\(UNIFIED_CELLS\.crouch, base\(roles\.crouch\)\)\)/);
  assert.equal(ext5.ali.accept[UNIFIED_EXT5_CELLS.crouchGuardFlinch], false);
  assert.ok(ROSTER.filter((id) => id !== "ali").every((id) => ext5[id].accept[UNIFIED_EXT5_CELLS.crouchGuardFlinch]));
}


// ---------------------------------------------------------------------------
// v5.2 LOCOMOTION — THE SIXTH SHEET. Item one registered it (gate, measured
// tables, both loaders) with nothing routed and all sixteen cells pinned
// unreachable. Item two (ext5-ground) routes the GROUND and BOOKEND cells:
// the dash in three drawings, the turnaround, the power charge, the two
// entrances, the victory, the taunt, the crouch guard flinch, the throw grab
// and the dizzy sway. The AIR cells — apex tuck, descent, air recover, the
// upright air hit — are the next item's, and stay pinned below.
// ---------------------------------------------------------------------------
const E5 = UNIFIED_EXT5_CELLS;
/** Item three (ext5-air) routed the four air cells: nothing on the sheet is unreached. */
const EXT5_UNROUTED_FOR_NOW = Object.freeze([]);

function testExt5Manifest() {
  const spec = SWING_BANKS[UNIFIED_EXT5_BANK];
  assert.deepEqual(spec, { base: 72, count: 16, sheetKey: "ext5Sheet", cellsKey: "ext5Cells" });
  assert.deepEqual(manifest.format.ext5PoseIds, UNIFIED_EXT5_BEATS);
  assert.match(manifest.format.ext5Status, /^WIRED 5\.2 \(all sixteen cells\)/);
  assert.match(manifest.fighters.jez.ext5Cells[E5.airHitUpright].note, /ROUTED 5\.2/);
  assert.match(manifest.format.ext5Status, /since item three \(ext5-air\) the four AIR cells/);
  assert.match(manifest.format.ext5Sheet, /grammar cells 72-87/);
  assert.deepEqual(Object.keys(E5), [
    "dashLaunch", "dashStretch", "dashBrake", "turnaround", "apexTuck", "descent", "airRecover", "airHitUpright",
    "powerCharge", "entranceA", "entranceB", "victory", "taunt", "crouchGuardFlinch", "throwGrab", "dizzySway",
  ]);
  assert.equal(swingFrame(UNIFIED_EXT5_BANK, 72), 0);
  assert.equal(swingFrame(UNIFIED_EXT5_BANK, 87), 15);
  assert.equal(swingFrame(UNIFIED_EXT5_BANK, 88), -1);
  assert.equal(swingFrame(UNIFIED_EXT4_BANK, 72), -1, "72 is an ext5 frame, never an ext4 one");
  for (const id of ROSTER) {
    const entry = manifest.fighters[id];
    assert.equal(entry.ext5Sheet, `${id}-ext5.webp`);
    // Size floor only: the 5.1 encode gate (tools/swing/encode_sheets.py,
    // weighted dE < 0.7 against the lossless master) decides per sheet whether
    // it ships VP8L or VP8, and records it in format.encoding.
    assert.ok(statSync(join(assetDir, entry.ext5Sheet)).size > 200000, `${id} ext5 ships`);
    const encoding = manifest.format.encoding?.sheets?.[entry.ext5Sheet];
    assert.ok(encoding && ["VP8", "VP8L"].includes(encoding.codec), `${id} ext5 has an encoding record`);
    assert.equal(entry.ext5Cells.length, 16);
    entry.ext5Cells.forEach((cell, index) => {
      assert.equal(cell.frame, 72 + index);
      assert.equal(cell.id, UNIFIED_EXT5_BEATS[index]);
      assert.equal(typeof cell.note, "string");
    });
    // Built at the fighter's unified scale — except ali, whose 6x4 main sheet
    // draws its figure smaller, so his ext5 carries its own scale (1.3661).
    if (entry.generationGrid === "6x4") assert.equal(entry.ext5Scale, 1.3661, `${id} own scale`);
    else assert.equal(entry.ext5Scale, entry.scale, `${id} ext5 is built at the unified scale`);
    // The gate: every fighter whole; every cell accepted but ali's held
    // crouch guard flinch (a yellow impact burst painted into the cell).
    assert.equal(ext5[id].whole, true, `${id} on the ext5 bank`);
    const held = id === "ali" ? [E5.crouchGuardFlinch] : [];
    for (let frame = 0; frame < 16; frame += 1) {
      assert.equal(ext5[id].accept[frame], !held.includes(frame), `${id} ext5:${frame} accept`);
    }
  }
  assert.equal(manifest.fighters.ali.ext5Cells[E5.crouchGuardFlinch].accept, false);
  assert.match(manifest.fighters.ali.ext5Cells[E5.crouchGuardFlinch].note, /HELD/);
  assert.deepEqual(swingFighterIds(ext5), [...ROSTER].sort());
}

function testExt5MeasuredTables() {
  assert.deepEqual(auditBodyCentres().errors, []);
  for (const id of ROSTER) {
    const heights = UNIFIED_EXT5_CELL_HEIGHT[id];
    assert.equal(heights.length, 16, `${id} heights`);
    assert.equal(CELL_BODY_CENTRE[id][UNIFIED_EXT5_BANK].length, 16, `${id} body centres`);
    assert.ok(heights.every((h) => h >= 134 && h <= 313), `${id} heights in range`);
    // The dash stretch is a horizontal lunge on every sheet: the shortest
    // dash cell, and the tuck sits well under the descent.
    assert.ok(heights[E5.dashStretch] < heights[E5.dashLaunch], `${id} the stretch is lower than the launch`);
    assert.ok(heights[E5.apexTuck] < heights[E5.descent], `${id} the tuck is lower than the descent`);
    // Fit-restore adjusts: drawAdjust > 1 only, the commissioner's 1.033
    // sheet factor folded into every one of his cells (bankSheetAdjust has
    // no ext branch, on purpose — see game.js).
    for (let frame = 0; frame < 16; frame += 1) {
      const adjust = baseCellDrawAdjust(id, UNIFIED_EXT5_BANK, frame);
      assert.ok(adjust >= 1 && adjust <= 1.3, `${id} ext5:${frame} adjust ${adjust}`);
      if (id === "commissioner") assert.ok(adjust >= 1.033, `commissioner ext5:${frame} carries the sheet fold`);
      // The routing item made seven cells stand-ins (turnaround, charge, the
      // entrances, victory, taunt, crouch guard flinch — see
      // testExt5StandInHeights); every other cell's reconciliation is 1 and
      // cellDrawAdjust is the fit-restore alone.
      const standIn = swingStandInAdjust(id, UNIFIED_EXT5_BANK, frame);
      if (!SWING_STAND_IN_TARGET[UNIFIED_EXT5_BANK][frame]) assert.equal(standIn, 1, `${id} ext5:${frame} is not a stand-in`);
      assert.equal(cellDrawAdjust(id, UNIFIED_EXT5_BANK, frame, { unified: true }), adjust * standIn);
      assert.equal(swingDrawnHeight(id, UNIFIED_EXT5_BANK, frame), heights[frame] * adjust);
    }
  }
  // Spot pins off the slicer sidecars (ext5-<id>.json in the swing-v50 archive).
  assert.equal(baseCellDrawAdjust("jez", UNIFIED_EXT5_BANK, E5.dashBrake), 1.26);
  assert.equal(baseCellDrawAdjust("post", UNIFIED_EXT5_BANK, E5.dashStretch), 1.2842);
  assert.equal(baseCellDrawAdjust("commissioner", UNIFIED_EXT5_BANK, E5.dashStretch), 1.0968, "1.0618 x 1.033");
  assert.equal(baseCellDrawAdjust("commissioner", UNIFIED_EXT5_BANK, E5.victory), 1.033);
  assert.equal(baseCellDrawAdjust("donald", UNIFIED_EXT5_BANK, E5.dashBrake), 1);
  assert.deepEqual([...UNIFIED_EXT5_CELL_HEIGHT.jez], [251, 184, 186, 291, 202, 285, 292, 236, 279, 292, 289, 292, 298, 233, 288, 292]);
  assert.deepEqual([...CELL_BODY_CENTRE.jez[UNIFIED_EXT5_BANK]], [189, 222, 222, 169, 214, 172, 168, 196, 175, 168, 170, 168, 166, 198, 170, 168]);
}

function testExt5GroundRouted() {
  const E4 = UNIFIED_EXT4_CELLS;
  const x5 = (cell) => ({ bank: UNIFIED_EXT5_BANK, frame: cell });
  // 1. THE TABLE. The motion cells the tracks and descriptors resolve map
  //    onto the sheet, context-free; the dizzy loop alternates on swayBeat.
  const sub = (bank, frame, ctx = {}) => swingSubstitute(bank, frame, ctx);
  assert.deepEqual(sub("motion", MOTION_CELLS.dash), x5(E5.dashStretch));
  assert.deepEqual(sub("motion", MOTION_CELLS.charge), x5(E5.powerCharge));
  assert.deepEqual(sub("motion", MOTION_CELLS.victory2), x5(E5.victory));
  assert.deepEqual(sub("motion", MOTION_CELLS.sig1), x5(E5.entranceA));
  assert.deepEqual(sub("motion", MOTION_CELLS.sig2), x5(E5.entranceB));
  assert.deepEqual(sub("motion2", MOTION2_CELLS.turnaround), x5(E5.turnaround));
  assert.deepEqual(sub("motion2", MOTION2_CELLS.dashBrake), x5(E5.dashBrake));
  assert.deepEqual(sub("motion2", MOTION2_CELLS.throwGrab), x5(E5.throwGrab));
  assert.deepEqual(sub("motion2", MOTION2_CELLS.dizzy, { swayBeat: false }), { bank: UNIFIED_EXT4_BANK, frame: E4.dizzy });
  assert.deepEqual(sub("motion2", MOTION2_CELLS.dizzy, { swayBeat: true }), { ...x5(E5.dizzySway), alt: { bank: UNIFIED_EXT4_BANK, frame: E4.dizzy } },
    "the odd beats wear the sway, with the slump as the alt so a held sheet never leaves the family");
  assert.deepEqual(sub("motion2", MOTION2_CELLS.dizzy, { swayBeat: true, reeling: true }), { bank: UNIFIED_EXT4_BANK, frame: E4.stagger }, "the onset reel wins");
  // Context-free: every context gives the same answer for the ground cells.
  const ctxs = [];
  for (const limb of ["punch", "kick"]) for (const heavy of [false, true]) for (const crouching of [false, true])
    for (const attacking of [false, true]) for (const airborne of [false, true]) for (const victimAirborne of [false, true])
      for (const falling of [false, true]) for (const bodyBlow of [false, true]) for (const reeling of [false, true]) for (const ko of [false, true])
        for (const blocking of [false, true]) for (const swayBeat of [false, true])
          ctxs.push({ limb, heavy, crouching, attacking, airborne, victimAirborne, falling, bodyBlow, reeling, ko, blocking, swayBeat });
  for (const ctx of ctxs) {
    assert.equal(sub("motion", MOTION_CELLS.dash, ctx).frame, E5.dashStretch);
    assert.equal(sub("motion2", MOTION2_CELLS.turnaround, ctx).frame, E5.turnaround);
    assert.equal(sub("motion", MOTION_CELLS.charge, ctx).frame, E5.powerCharge);
  }
  // 2. REACHABILITY: every ground and bookend cell is reached — through the
  //    table, a key track with the `swing` answer, or a descriptor site in
  //    game.js — and the four AIR cells are not, by anything.
  const reached = new Set();
  for (const bank of ["base", "motion", "motion2", "motion3", "walk", UNIFIED_BANK, "unified-ext", "unified-ext2", UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK]) {
    for (let frame = 0; frame < 24; frame += 1) for (const ctx of ctxs) {
      const out = swingSubstitute(bank, frame, ctx);
      if (out?.bank === UNIFIED_EXT5_BANK) reached.add(`${out.bank}:${out.frame}`);
      if (out?.alt?.bank === UNIFIED_EXT5_BANK) reached.add(`${out.alt.bank}:${out.alt.frame}`);
    }
  }
  const tableReached = [...reached].sort();
  // v5.2 (ext5-air): the table reaches the apex tuck (the air-tech ball), the
  // air recover and the upright air hit; the DESCENT is reached only by the
  // jump track (it replaces a track link, never a table cell).
  assert.deepEqual(tableReached, [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 14, 15].map((c) => `${UNIFIED_EXT5_BANK}:${c}`).sort(), "the table's ext5 cells");
  const tracks = {
    dash: dashKeys(),
    crouchBlock: crouchBlockstunKeys({ flinch: true }),
    clinch: throwClinchKeys({ inbetween: true }),
    // v5.2 (ext5-air): the jump arc under the `air` answer, in its three
    // shapes; without the answer no ext5 link (jumpNoAir).
    jump: jumpArcKeys(0.22, { extended: true, descend: true, air: true }),
    jumpExtended: jumpArcKeys(0.22, { extended: true, air: true }),
    jumpPlain: jumpArcKeys(0.22, { air: true }),
    jumpNoAir: jumpArcKeys(0.22, { extended: true, descend: true }),
    lightPunch: lightWindupKeys("punch", { inbetween: true }),
    heavyKick: heavyWindupKeys("kick", { extended: true, inbetween: true }),
    recovery: attackRecoveryKeys({ inbetween: true }, { limb: "kick", heavy: true }),
    air: airNormalKeys(0.3, 0.7),
    block: blockstunKeys(),
    reactionLight: reactionTrackKeys(false),
    reactionHeavy: reactionTrackKeys(true),
    throwRecover: throwRecoveryKeys({ inbetween: true }),
    wakeup: wakeupKeys(),
  };
  const trackReached = {};
  for (const [name, keys] of Object.entries(tracks)) {
    trackReached[name] = [];
    for (const key of keys) for (const link of key.chain) {
      if (link.bank !== UNIFIED_EXT5_BANK) continue;
      trackReached[name].push(link.cell);
      reached.add(`${UNIFIED_EXT5_BANK}:${link.cell}`);
    }
  }
  assert.deepEqual(trackReached.dash, [E5.dashLaunch, E5.dashStretch, E5.dashStretch, E5.dashBrake], "launch -> stretch -> stretch -> brake, one link per band");
  assert.deepEqual(trackReached.crouchBlock, [E5.crouchGuardFlinch]);
  assert.deepEqual(trackReached.clinch, [E5.throwGrab]);
  for (const name of ["jump", "jumpExtended", "jumpPlain"]) assert.deepEqual(trackReached[name], [E5.apexTuck, E5.descent, E5.airRecover], `${name}: apex -> descent -> recover, one link per band`);
  for (const name of Object.keys(tracks)) if (!["dash", "crouchBlock", "clinch", "jump", "jumpExtended", "jumpPlain"].includes(name)) assert.deepEqual(trackReached[name], [], `${name} track names no ext5 cell`);
  // Every ext5 link sits AHEAD of its band's motion links, so the band grid
  // (and every hold budget) is the one the motion links set. The one link
  // that sits second is the descend arc's fall band, where it is the
  // same-family fallback behind the fighter's OWN ext descent (ali).
  for (const keys of [tracks.dash, tracks.crouchBlock, tracks.clinch, tracks.jump, tracks.jumpExtended, tracks.jumpPlain]) {
    for (const key of keys) {
      const first = key.chain.findIndex((l) => l.bank === UNIFIED_EXT5_BANK);
      if (first < 0) continue;
      if (first === 1 && key.chain[0].bank === "unified-ext" && key.chain[0].cell === 4) continue;
      assert.equal(first, 0, `an ext5 link leads its chain (${key.at})`);
      assert.ok(key.chain.slice(first + 1).every((l) => l.bank !== UNIFIED_EXT5_BANK), `one ext5 link per band (${key.at})`);
    }
  }
  // The air arc keeps the band grid of the arc it replaces, shape for shape.
  for (const [withAir, without] of [[tracks.jump, tracks.jumpNoAir], [tracks.jumpExtended, jumpArcKeys(0.22, { extended: true })], [tracks.jumpPlain, jumpArcKeys(0.22)]]) {
    assert.deepEqual(withAir.map((k) => k.at), without.map((k) => k.at), "the `air` answer moves no band");
  }
  // The air-tech site draws its pair through the table: the sites in game.js
  // still emit the motion tuck and airrec (accepted on all ten sheets).
  assert.match(gameSource, /return flip < 0\.6\s*\n\s*\? motionPose\(MOTION_CELLS\.tuck, "base", 13\)\s*\n\s*: motionPose\(MOTION_CELLS\.airrec, "base", 13\);/);
  // The descriptor sites game.js emits directly: the exit brake, the pivot,
  // the entrance, the win and the taunt.
  assert.match(gameSource, /return unifiedExt5Pose\(UNIFIED_EXT5_CELLS\.dashBrake, motion2Pose\(MOTION2_CELLS\.dashBrake, "base", 12\)\);/);
  assert.match(gameSource, /return unifiedExt5Pose\(UNIFIED_EXT5_CELLS\.turnaround, motion2Pose\(MOTION2_CELLS\.turnaround, "base",/);
  // v5.2 (bookends): the entrance is two beats from engine/bookends
  // (introEntranceCell: A, then B, then released) over the seed-and-side
  // signature; the win pose asks roundWinShowcaseCell (victory, then the
  // taunt on the rotation's two motion picks); the taunt key is the taunt.
  assert.match(gameSource, /const entrance = state\.phase === "intro" \? introEntranceCell\(state\.phaseTime\) : null;\s*\n\s*if \(entrance !== null && fighter\.grounded && !fighter\.attacking && fighter\.kit\?\.victory\) \{[\s\S]{0,900}return unifiedExt5Pose\(entrance, motionPose\(cell, "base", Math\.floor\(fighter\.animTime \* 5\) % 4\)\);/);
  assert.match(gameSource, /function showcasePoseDescriptor\(fighter, ext5Cell = UNIFIED_EXT5_CELLS\.victory\) \{[\s\S]{0,700}return unifiedExt5Pose\(ext5Cell, rotation\);/);
  assert.match(gameSource, /return showcasePoseDescriptor\(fighter, UNIFIED_EXT5_CELLS\.taunt\);/);
  assert.match(gameSource, /return showcasePoseDescriptor\(fighter, roundWinShowcaseCell\(showcasePick\(\), hold - state\.phaseTime, hold\)\);/);
  // The Final Blow draws through the engine's scripts (tests/fatalities-poses pins the cells).
  assert.match(gameSource, /if \(fighter\.cinematicFrame !== null\) return cinematicPoseDescriptor\(fighter, base\(fighter\.cinematicFrame\)\);/);
  assert.match(gameSource, /const finisherChoreography = FINISHER_CHOREOGRAPHY;/);
  for (const cell of [E5.dashBrake, E5.turnaround, E5.entranceA, E5.entranceB, E5.victory, E5.taunt]) reached.add(`${UNIFIED_EXT5_BANK}:${cell}`);
  for (const key of EXT5_UNROUTED_FOR_NOW) assert.ok(!reached.has(key), `${key} is the air item's`);
  assert.equal(EXT5_UNROUTED_FOR_NOW.length, 0, "v5.2 item three: every ext5 cell is routed");
  for (let frame = 0; frame < 16; frame += 1) {
    const key = `${UNIFIED_EXT5_BANK}:${frame}`;
    if (!EXT5_UNROUTED_FOR_NOW.includes(key)) assert.ok(reached.has(key), `${key} must be reachable`);
  }
  // The draw-site pivot audit counts the ext5 turnaround as the pivot drawn.
  assert.match(gameSource, /\|\| \(pose\.bank === UNIFIED_EXT5_BANK && frame === UNIFIED_EXT5_CELLS\.turnaround\)\) \{\s*\n\s*presentationDebug\.turnaroundDraws \+= 1;/);
  // 3. The resolver's beat: the dizzy / guard-crush clock in 12-tick beats.
  const resolverSource = readFileSync(join(testDir, "..", "engine", "swing-resolve.mjs"), "utf8");
  assert.match(resolverSource, /export const DIZZY_SWAY_TICKS = REEL_ONSET_TICKS;/);
  assert.match(resolverSource, /swayBeat: dizzySwayBeat\(fighter\),/);
  // 4. The chain resolver answers ext5 links with the same `swing` answer.
  const key = { at: 0, chain: [x5key(E5.dashLaunch)] };
  assert.equal(defaultBeatKeyResolve(key, { swing: true }), `${UNIFIED_EXT5_BANK}:${E5.dashLaunch}`);
  assert.equal(defaultBeatKeyResolve(key, { fallback: "base:5" }), "base:5", "skipped like any swing link without the sheet");
  // 5. THE HOLD BUDGETS STAND. A same-generation cell replaces a drawing and
  //    never changes timing: with the `swing` answer the dash's worst hold at
  //    the 16-tick audit span is the budget (the one stretch drawing owns two
  //    bands), the crouched block 7 / 4 / 6, and no track's worst hold grew.
  const swing = (key) => defaultBeatKeyResolve(key, { swing: true, ext2: true, unified: true, fallback: "fallback" });
  const shipping = (key) => defaultBeatKeyResolve(key, { ext2: true, unified: true, fallback: "fallback" });
  const runsOf = (keys, span, resolve) => {
    const cells = [];
    for (let tick = 0; tick < span; tick += 1) {
      let chosen = keys[0];
      for (const k of keys) if (tick / span >= k.at) chosen = k;
      cells.push(resolve(chosen));
    }
    const runs = [];
    for (const cell of cells) { if (runs.length && runs.at(-1).cell === cell) runs.at(-1).ticks += 1; else runs.push({ cell, ticks: 1 }); }
    return runs;
  };
  const dash16 = runsOf(dashKeys(), 16, swing);
  assert.deepEqual(dash16.map((r) => `${r.cell}x${r.ticks}`), [`${UNIFIED_EXT5_BANK}:0x3`, `${UNIFIED_EXT5_BANK}:1x8`, `${UNIFIED_EXT5_BANK}:2x5`]);
  assert.deepEqual(runsOf(dashKeys(), 13, swing).map((r) => r.ticks), [3, 6, 4], "a 13-tick dash: launch 3, stretch 6, brake 4");
  const block17 = runsOf(crouchBlockstunKeys({ flinch: true }), 17, swing);
  assert.deepEqual(block17.map((r) => `${r.cell}x${r.ticks}`), [`${UNIFIED_EXT5_BANK}:13x8`, `${UNIFIED_EXT3_BANK}:12x3`, "fallbackx6"]);
  // Off the swing sheets a crouched block is the crouch read on every tick
  // (the 5.1 statement); the 5.1 track's own read is flinch x8 -> crouch x9.
  assert.deepEqual(runsOf(crouchBlockstunKeys({ flinch: true }), 17, shipping).map((r) => r.ticks), [17]);
  assert.deepEqual(runsOf(crouchBlockstunKeys(), 17, swing).map((r) => `${r.cell}x${r.ticks}`), [`${UNIFIED_EXT3_BANK}:12x8`, "fallbackx9"]);
  for (const [name, keys, span] of [["dash", dashKeys(), 16], ["clinch", throwClinchKeys({ inbetween: true }), 24]]) {
    const before = Math.max(...runsOf(keys, span, shipping).map((r) => r.ticks));
    const after = Math.max(...runsOf(keys, span, swing).map((r) => r.ticks));
    assert.ok(after <= before, `${name}: worst hold ${before} -> ${after}`);
    assert.equal(runsOf(keys, span, swing).length, runsOf(keys, span, shipping).length, `${name}: the same number of drawings`);
  }
  // v5.2 (ext5-air): the jump arc with the `air` answer draws the SAME runs
  // as the motion3 read of the arc it replaces — the same number, the same
  // lengths — at the 46-tick uniform span, in all three shapes; only the
  // bank changes. (The ballistic tick counts are pinned in swing-resolve.)
  const airResolve = (key) => defaultBeatKeyResolve(key, { swing: true, ext: true, unified: true, fallback: "fallback" });
  const motion3Resolve = (key) => defaultBeatKeyResolve(key, { motion3: true, ext: true, unified: true, fallback: "fallback" });
  for (const [label, opts] of [["descend", { extended: true, descend: true }], ["extended", { extended: true }], ["plain", {}]]) {
    const air = runsOf(jumpArcKeys(0.22, { ...opts, air: true }), 46, airResolve);
    const was = runsOf(jumpArcKeys(0.22, opts), 46, motion3Resolve);
    assert.deepEqual(air.map((r) => r.ticks), was.map((r) => r.ticks), `${label}: ${air.map((r) => `${r.cell}x${r.ticks}`).join(" ")} against ${was.map((r) => `${r.cell}x${r.ticks}`).join(" ")}`);
    assert.ok(air.every((r) => !r.cell.startsWith("motion")), `${label}: no motion cell on the air arc`);
  }
  assert.deepEqual(runsOf(jumpArcKeys(0.22, { extended: true, air: true }), 46, airResolve).map((r) => `${r.cell}x${r.ticks}`),
    ["unified:8x5", "unified-ext:3x5", "unified:9x7", `${UNIFIED_EXT5_BANK}:4x5`, `${UNIFIED_EXT5_BANK}:5x3`, `${UNIFIED_EXT5_BANK}:6x9`, `${UNIFIED_EXT3_BANK}:10x12`]);
  assert.deepEqual(runsOf(throwClinchKeys({ inbetween: true }), 24, swing).map((r) => `${r.cell}x${r.ticks}`),
    ["unified-ext2:12x9", `${UNIFIED_EXT5_BANK}:14x7`, "fallbackx8"], "reach -> seize -> hurl");
}

/**
 * v5.2 — the ext5 stand-ins land on their rungs by the 5.1 rule: match for
 * the standing pivot, the entrances and the crouched flinch; ceiling for the
 * charge, the victory and the taunt. Nothing else on the sheet moves.
 */
function testExt5StandInHeights() {
  const screen = (id, frame) => swingDrawnHeight(id, UNIFIED_EXT5_BANK, frame) * swingStandInAdjust(id, UNIFIED_EXT5_BANK, frame);
  const targets = SWING_STAND_IN_TARGET[UNIFIED_EXT5_BANK];
  // The rule's deadband is on goal/drawn; on screen (drawn/goal) that is 1/0.97.
  const TOL = 1 / (1 - SWING_STAND_IN_DEADBAND) - 1 + 1e-9;
  assert.deepEqual(Object.keys(targets).map(Number), [E5.turnaround, E5.powerCharge, E5.entranceA, E5.entranceB, E5.victory, E5.taunt, E5.crouchGuardFlinch]);
  for (const id of ROSTER) {
    for (const frame of [E5.turnaround, E5.entranceA, E5.entranceB]) {
      const ratio = screen(id, frame) / unifiedScreenHeight(id, UNIFIED_CELLS.idle);
      assert.ok(Math.abs(ratio - 1) <= TOL, `${id} ext5:${frame} lands on the idle (${ratio.toFixed(3)})`);
    }
    for (const frame of [E5.powerCharge, E5.victory, E5.taunt]) {
      const ratio = screen(id, frame) / unifiedScreenHeight(id, UNIFIED_CELLS.idle);
      assert.ok(ratio <= 1 + TOL, `${id} ext5:${frame} never taller than the idle (${ratio.toFixed(3)})`);
      assert.ok(swingStandInAdjust(id, UNIFIED_EXT5_BANK, frame) <= 1, "a ceiling never enlarges");
    }
    // The crouched flinch onto the crouch, like the ext3 crouch guard it
    // hands to; cyraxx's +31% is the one the 0.80 clamp floor leaves 5% over.
    const flinch = screen(id, E5.crouchGuardFlinch) / unifiedScreenHeight(id, UNIFIED_CELLS.crouch);
    const limit = swingStandInAdjust(id, UNIFIED_EXT5_BANK, E5.crouchGuardFlinch) === SWING_STAND_IN_CLAMP.min ? 0.06 : TOL;
    assert.ok(Math.abs(flinch - 1) <= limit, `${id} ext5:13 lands on the crouch (${flinch.toFixed(3)})`);
    for (const frame of [E5.dashLaunch, E5.dashStretch, E5.dashBrake, E5.throwGrab, E5.dizzySway, E5.apexTuck, E5.descent, E5.airRecover, E5.airHitUpright]) {
      assert.equal(swingStandInAdjust(id, UNIFIED_EXT5_BANK, frame), 1, `${id} ext5:${frame} untouched`);
    }
  }
  // The measured pops this closes: cyraxx's crouched flinch +31% over his
  // crouch, the commissioner's +23%, his pivot +8%; donald's victory +9.6%.
  assert.ok(swingDrawnHeight("cyraxx", UNIFIED_EXT5_BANK, E5.crouchGuardFlinch) / unifiedScreenHeight("cyraxx", UNIFIED_CELLS.crouch) > 1.3);
  assert.equal(swingStandInAdjust("cyraxx", UNIFIED_EXT5_BANK, E5.crouchGuardFlinch), SWING_STAND_IN_CLAMP.min);
  assert.ok(swingDrawnHeight("commissioner", UNIFIED_EXT5_BANK, E5.turnaround) / unifiedScreenHeight("commissioner", UNIFIED_CELLS.idle) > 1.07);
  assert.ok(swingStandInAdjust("commissioner", UNIFIED_EXT5_BANK, E5.turnaround) < 0.94);
  assert.ok(swingStandInAdjust("donald", UNIFIED_EXT5_BANK, E5.victory) < 0.93);
  assert.ok(swingStandInAdjust("deathblow", UNIFIED_EXT5_BANK, E5.entranceB) > 1.09, "a match enlarges an under-drawn entrance");
  assert.equal(swingStandInAdjust("deathblow", UNIFIED_EXT5_BANK, E5.powerCharge), 1, "a ceiling leaves a short charge alone");
}

function testExt5Wiring() {
  // game.js: the mask, the loader suffix, the gate, the readiness gate, the
  // drawable-now switch, the palette source and the snapshot all know the bank.
  assert.match(gameSource, /ext4Masks: null, ext5Masks: null,/);
  assert.match(gameSource, /unifiedBankState\.ext5Masks = manifest \? buildSwingAcceptMasks\(manifest, UNIFIED_EXT5_BANK, unifiedBankState\.masks\) : \{\};/);
  assert.match(gameSource, /const swingBankList = Object\.freeze\(\[UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK\]\);/);
  assert.match(gameSource, /\[UNIFIED_EXT5_BANK\]: "ext5Masks"/);
  assert.match(gameSource, /\[UNIFIED_EXT5_BANK\]: "ext5"/);
  assert.match(gameSource, /ext5: swingFighterWhole\(fighterId, UNIFIED_EXT5_BANK\),/);
  assert.match(gameSource, /case "ext5": return live\(fighterSwingAtlases\[UNIFIED_EXT5_BANK\]\[fighterId\]\);/);
  assert.match(gameSource, /for \(const swingBank of swingBankList\) \{/);
  assert.match(gameSource, /swing: state\.fighters\.map\(\(fighter\) => swingBankList\.map\(/);
  assert.match(gameSource, /bank === UNIFIED_EXT3_BANK \|\| bank === UNIFIED_EXT4_BANK \|\| bank === UNIFIED_EXT5_BANK\n\s*\? fighterSwingAtlases\[bank\]\[fighterId\]/);
  // The preload plan carries the sheet with the family (art-readiness), and
  // the 3D layer enumerates AUTHORED_BANKS, so it needs no bank-specific code.
  const plan = readFileSync(join(testDir, "..", "engine", "art-readiness.mjs"), "utf8");
  assert.match(plan, /bank: "ext5", gate: "ext5", priority: "auto"/);
  const three = readFileSync(join(testDir, "..", "renderer", "three", "fighters.mjs"), "utf8");
  assert.ok(three.includes("AUTHORED_BANKS.forEach(") && !three.includes("ext5"), "CINEMA 3D walks the shared list");
}

testManifestShape();
testPerCellGate();
testSubstitutionTable();
testTracksUntouched();
testMeasuredTables();
testRegistryAndWiring();
testStandInHeights();
testCrouchBlockstunTrack();
testExt5Manifest();
testExt5MeasuredTables();
testExt5GroundRouted();
testExt5StandInHeights();
testExt5Wiring();

console.log("Final Blow swing bank tests passed");
