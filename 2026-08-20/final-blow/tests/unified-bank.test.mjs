import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  CELL_BODY_CENTRE,
  MOTION2_CELLS,
  MOTION_CELLS,
  MOTION_HOLD_BUDGET,
  PROP_CELLS,
  REACTION_BANDS,
  UNIFIED_BANK,
  UNIFIED_BEATS,
  UNIFIED_CELLS,
  UNIFIED_CELL_COUNT,
  UNIFIED_WALK_KEYS,
  WAKEUP_RISE_HEIGHT,
  airNormalKeys,
  airborneAnchorOffset,
  attackRecoveryKeys,
  baseCellRoles,
  beatKeyRuns,
  beatPoseAt,
  blockstunKeys,
  buildUnifiedAcceptMasks,
  cellDrawAdjust,
  cellFloorOffset,
  dashKeys,
  defaultBeatKeyResolve,
  guardFlinchAdjust,
  heavyWindupKeys,
  isAuthoredBank,
  isPropActionCell,
  jumpArcKeys,
  longestBeatHold,
  motion2Pose,
  motionPose,
  reactionFallbackCells,
  reactionTrackKeys,
  resolveMotionPose,
  throwClinchKeys,
  throwRecoveryKeys,
  unifiedFighterIds,
  unifiedPose,
  unifiedReactionCells,
  wakeupKeys,
  wakeupRiseStretch,
  wakeupSettleStart,
  walkCyclePose,
  walkCycleFrame,
} from "../engine/fighter-kits.mjs";

// ---------------------------------------------------------------------------
// v3.0 — THE UNIFIED BANK. Five contracts, and the first one is the wave:
//
//   U-A  THE MANIFEST AND THE MASK — the sheet grammar is the 16-cell one the
//        art wave shipped, and the accept masks are built from it.
//   U-B  ALL SIXTEEN OR NOTHING — a fighter is on this bank wholly or not at
//        all. This is the contract the whole integration exists to hold: every
//        unified sheet is a DIFFERENT DRAUGHTSMAN from that fighter's base
//        atlas (donald 22.5 dE from his own base idle), so ONE cell falling
//        through inside these sixteen beats re-creates the 11-14 dE costume
//        strobe that put 40 cells behind `accept: false` in 2.9.
//   U-C  THE UNCHANGED FIGHTERS — `cyraxx` (0/16) and the `deathblow` pilot
//        (12/16) must be byte-identical to 2.9, using none of it.
//   U-D  NO CROSS-BANK BEAT — for a whole fighter, not one of the sixteen may
//        resolve anywhere but `unified`.
//   U-E  EVERYTHING 2.9 FIXED IS STILL FIXED — the hold budget, the prop
//        prohibition, airborne body-centre anchoring, the height
//        reconciliations, the preload path and the SD-only 3D rule.
// ---------------------------------------------------------------------------

const testDir = dirname(fileURLToPath(import.meta.url));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
const rendererSource = readFileSync(join(testDir, "..", "renderer", "three", "fighters.mjs"), "utf8");
const manifest = JSON.parse(readFileSync(join(testDir, "..", "assets", "unified", "MANIFEST.json"), "utf8"));
const masks = buildUnifiedAcceptMasks(manifest);

const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "commissioner", "devil"];
// Measured on the shipped manifest, not assumed: eight whole sheets.
const WHOLE = unifiedFighterIds(masks);
const PARTIAL = ROSTER.filter((id) => !WHOLE.includes(id));

/**
 * The drawable gate exactly as game.js builds it: the unified bank answers
 * only for a whole fighter, every other authored bank is present. This is the
 * shipping configuration for every fighter whose sheets are on disk.
 */
const gate = (fighterId) => (cell, bank) => {
  if (bank === UNIFIED_BANK) return Boolean(masks[fighterId]?.accept[cell]);
  if (bank === "walk") return false;         // accept:false roster-wide since 2.9
  if (bank === "motion3") return false;      // the shipping-today audit configuration
  return true;
};
/** The same gate with the unified bank forced off — i.e. the 2.9 build. */
const gate29 = (fighterId) => (cell, bank) => (bank === UNIFIED_BANK ? false : gate(fighterId)(cell, bank));

// ---------------------------------------------------------------------------
// U-A — the manifest and the accept masks.
// ---------------------------------------------------------------------------
function testManifestShape() {
  assert.equal(manifest.format.cellCount, UNIFIED_CELL_COUNT);
  assert.deepEqual(manifest.format.poseIds, [...UNIFIED_BEATS],
    "the manifest's pose ids ARE the grammar the code routes — they cannot drift");
  assert.equal(UNIFIED_BEATS.length, UNIFIED_CELL_COUNT);
  // The grammar's own indices must match the named cells the routing uses.
  UNIFIED_BEATS.forEach((id, index) => {
    const named = Object.entries(UNIFIED_CELLS).find(([, cell]) => cell === index);
    assert.ok(named, `cell ${index} (${id}) has no name in UNIFIED_CELLS`);
  });
  assert.deepEqual([...UNIFIED_WALK_KEYS], [1, 2, 3, 4],
    "the four walk keys are cells 1-4 and are cycled among THEMSELVES");
  for (const id of ROSTER) {
    const entry = manifest.fighters[id];
    assert.ok(entry, `${id} has no unified manifest entry`);
    assert.equal(entry.cells.length, UNIFIED_CELL_COUNT);
    assert.equal(entry.targetH, 306, `${id}: the sheets share motion2's 306px standing rule`);
    assert.equal(entry.floorRow, 315);
    assert.ok(entry.scale > 1 && entry.scale < 2, `${id}: implausible build scale ${entry.scale}`);
    entry.cells.forEach((cell, index) => {
      assert.equal(cell.frame, index, `${id}: manifest cells must be in frame order`);
      assert.equal(cell.id, UNIFIED_BEATS[index], `${id}: cell ${index} is not ${UNIFIED_BEATS[index]}`);
    });
  }
  // A cell missing from the manifest is REJECTED, never silently accepted.
  const holed = buildUnifiedAcceptMasks({
    fighters: { ghost: { scale: 1.3, cells: [{ frame: 0, accept: true }] } },
  });
  assert.equal(holed.ghost.whole, false);
  assert.equal(holed.ghost.accept.filter(Boolean).length, 0);
}

// ---------------------------------------------------------------------------
// U-B — ALL SIXTEEN OR NOTHING. The contract of the wave.
// ---------------------------------------------------------------------------
function testAllOrNothing() {
  assert.deepEqual(WHOLE,
    ["alan", "ali", "benny", "commissioner", "devil", "donald", "jez", "post"],
    "eight whole sheets — cyraxx (0/16) and the deathblow pilot (12/16) are not on the bank");
  assert.deepEqual(PARTIAL.sort(), ["cyraxx", "deathblow"]);

  for (const id of WHOLE) {
    assert.equal(masks[id].whole, true);
    assert.equal(masks[id].accept.length, UNIFIED_CELL_COUNT);
    assert.equal(masks[id].accept.every(Boolean), true, `${id} must accept all sixteen`);
  }
  for (const id of PARTIAL) {
    assert.equal(masks[id].whole, false, `${id} must not be on the bank`);
    assert.equal(masks[id].accept.some(Boolean), false,
      `${id}: a partial sheet must draw NOTHING — a 12/16 sheet with four base walk cells `
      + "under it is exactly the cross-generation strobe this bank removes");
  }

  // The collapse is a property of the builder, not of this manifest: take a
  // whole fighter, reject ONE cell, and the whole sheet must go dark.
  const cloned = JSON.parse(JSON.stringify(manifest));
  cloned.fighters.jez.cells[7].accept = false;         // just the guard
  const holed = buildUnifiedAcceptMasks(cloned);
  assert.equal(holed.jez.whole, false);
  assert.equal(holed.jez.accept.some(Boolean), false,
    "one rejected cell must take the other fifteen with it");
  // ...and the pilot going whole must light all sixteen up with no code change.
  const healed = JSON.parse(JSON.stringify(manifest));
  for (const cell of healed.fighters.deathblow.cells) cell.accept = true;
  assert.equal(buildUnifiedAcceptMasks(healed).deathblow.whole, true);
}

// ---------------------------------------------------------------------------
// The sixteen beats, as the descriptors game.js actually builds for them.
// Each entry is [unified cell, the exact 2.9 descriptor underneath it].
// ---------------------------------------------------------------------------
function coveredBeats(fighterId) {
  const roles = baseCellRoles(fighterId);
  const base = (frame) => ({ bank: "base", frame });
  const tail = reactionFallbackCells(roles);
  const react = unifiedReactionCells();
  const beats = [
    ["idle", unifiedPose(UNIFIED_CELLS.idle, base(roles.idle[0]))],
    ["crouch", unifiedPose(UNIFIED_CELLS.crouch, base(roles.crouch))],
    ["crouch-trans (enter)", unifiedPose(UNIFIED_CELLS.crouchTrans,
      motion2Pose(MOTION2_CELLS.crouchTrans, "base", roles.crouch))],
    ["crouch-trans (landing)", unifiedPose(UNIFIED_CELLS.crouchTrans,
      motion2Pose(MOTION2_CELLS.crouchTrans, "base", 12))],
    ["guard", unifiedPose(UNIFIED_CELLS.guard, base(roles.guard))],
    ["guard (blockstun stance)", beatPoseAt(blockstunKeys(), 0.99,
      unifiedPose(UNIFIED_CELLS.guard, base(roles.guard)))],
    ["jump-rise", unifiedPose(UNIFIED_CELLS.jumpRise,
      motion2Pose(MOTION2_CELLS.jumpRise, "base", 13))],
    ["jump-rise (arc band)", beatPoseAt(jumpArcKeys(0.22), 0, null)],
    ["jump-tuck (arc band)", beatPoseAt(jumpArcKeys(0.22), 0.30, null)],
    ["jump-tuck (air-tech flip)", unifiedPose(UNIFIED_CELLS.jumpTuck,
      motionPose(MOTION_CELLS.tuck, "base", 13))],
    ["punch-extension", unifiedPose(UNIFIED_CELLS.punchExt,
      motionPose(MOTION_CELLS.punchExt, "base", 10))],
    ["kick-extension", unifiedPose(UNIFIED_CELLS.kickExt,
      motionPose(MOTION_CELLS.kickExt, "base", 13))],
    ["light-hit (flat recoil)", unifiedPose(UNIFIED_CELLS.lightHit, base(roles.hit))],
    ["light-hit (clinch flinch)", unifiedPose(UNIFIED_CELLS.lightHit,
      motion2Pose(MOTION2_CELLS.lightHit, "base", roles.hit))],
    ["light-hit (reaction open)", beatPoseAt(reactionTrackKeys(false), 0, base(tail.snap))],
    ["big-hit (reaction open)", beatPoseAt(reactionTrackKeys(true), 0, base(tail.snap))],
    ["big-hit (launched)", unifiedPose(UNIFIED_CELLS.bigHit,
      motionPose(MOTION_CELLS.bighit, "base", roles.down))],
    ["stagger (reaction fold)", beatPoseAt(reactionTrackKeys(false), REACTION_BANDS[3],
      unifiedPose(react.fold, base(tail.fold)))],
    ["knockdown", unifiedPose(UNIFIED_CELLS.knockdown, base(roles.down))],
    // The wake-up RUNGS are motion/motion2 keys and are not part of the
    // grammar; what the bank owns is what those rungs degrade to — the prone
    // read (its knockdown) and the gather (its crouch).
    ["knockdown (wake-up prone)", wakeupKeys(16, roles)[0].fallback],
    ["crouch (wake-up gather)", wakeupKeys(16, roles)[3].fallback],
  ];
  for (let step = 0; step < 4; step += 1) {
    beats.push([`walk key ${step}`, walkCyclePose(step * 0.1, roles)]);
  }
  return beats;
}

// ---------------------------------------------------------------------------
// U-D — no unified fighter may resolve any of the sixteen off the bank.
// ---------------------------------------------------------------------------
function testNoCrossBankBeat() {
  const covered = new Set();
  for (const id of WHOLE) {
    const drawable = gate(id);
    for (const [name, pose] of coveredBeats(id)) {
      // Both the ordinary path and the BARE-HANDED path (the prop gate is the
      // one thing that can divert a resolved cell) must stay on the bank.
      for (const bareHanded of [false, true]) {
        const resolved = resolveMotionPose(pose, drawable, id, { bareHanded });
        assert.equal(resolved.bank, UNIFIED_BANK,
          `${id} / ${name}${bareHanded ? " (bare-handed)" : ""} resolved to `
          + `${resolved.bank}:${resolved.frame} — a unified fighter touching a non-unified `
          + "cell inside these sixteen beats IS the strobe this bank removes");
        assert.ok(resolved.frame >= 0 && resolved.frame < UNIFIED_CELL_COUNT);
      }
      covered.add(resolveMotionPose(pose, drawable, id).frame);
    }
  }
  // ...and the beats above between them must exercise the WHOLE grammar, or
  // the assertion above is only covering the cells somebody remembered.
  for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
    assert.ok(covered.has(cell),
      `cell ${cell} (${UNIFIED_BEATS[cell]}) is never reached by any routed beat`);
  }
}

// ---------------------------------------------------------------------------
// U-C — the two fighters not on the bank are byte-identical to 2.9.
// ---------------------------------------------------------------------------
function testUnchangedFighters() {
  for (const id of PARTIAL) {
    const withBank = gate(id);
    const without = gate29(id);
    for (const [name, pose] of coveredBeats(id)) {
      for (const bareHanded of [false, true]) {
        const now = resolveMotionPose(pose, withBank, id, { bareHanded });
        const before = resolveMotionPose(pose, without, id, { bareHanded });
        assert.notEqual(now.bank, UNIFIED_BANK, `${id} / ${name} must not reach the bank`);
        assert.deepEqual(now, before,
          `${id} / ${name}: a fighter off the bank must render EXACTLY what 2.9 rendered`);
      }
    }
  }
  // The pilot's four rejected walk keys are the reason he is off it. Even
  // with the sheet on disk his locomotion is the 2.9 base walk cell.
  const roles = baseCellRoles("deathblow");
  for (let step = 0; step < 8; step += 1) {
    const walkTime = step * 0.1;
    const resolved = resolveMotionPose(walkCyclePose(walkTime, roles), gate("deathblow"), "deathblow");
    assert.deepEqual(resolved,
      { bank: "base", frame: roles.walk[walkCycleFrame(walkTime)] },
      "deathblow's walk must stay on the base bank exactly as 2.9 ships it");
  }
}

// ---------------------------------------------------------------------------
// Descriptor determinism — pure function of snapshotted sim state, so a
// rollback resimulation and both online peers agree.
// ---------------------------------------------------------------------------
function testDescriptorDeterminism() {
  for (const id of ROSTER) {
    const roles = baseCellRoles(id);
    for (const walkTime of [0, 0.37, 1.24, 9.81]) {
      assert.deepEqual(walkCyclePose(walkTime, roles), walkCyclePose(walkTime, roles));
    }
    for (const [, pose] of coveredBeats(id)) {
      assert.deepEqual(JSON.parse(JSON.stringify(pose)), JSON.parse(JSON.stringify(pose)));
    }
    // The gate itself is a pure read of the mask, so two resolutions of one
    // descriptor in the same tick cannot disagree.
    const drawable = gate(id);
    for (const [name, pose] of coveredBeats(id)) {
      assert.deepEqual(resolveMotionPose(pose, drawable, id),
        resolveMotionPose(pose, drawable, id), `${id} / ${name}`);
    }
  }
  // The walk cadence is untouched: the same walkTime * 10 phase the base cycle
  // has always used, so locomotion speed still drives it.
  const seen = new Set();
  for (let t = 0; t < 40; t += 0.1) seen.add(walkCycleFrame(t));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
}

// ---------------------------------------------------------------------------
// U-E — everything 2.9 fixed is still fixed.
// ---------------------------------------------------------------------------
function testHoldBudgetUnderUnified() {
  const shipping = (key) => defaultBeatKeyResolve(key, { motion3: false });
  const unified = (key) => defaultBeatKeyResolve(key, { motion3: false, unified: true });
  const unifiedM3 = (key) => defaultBeatKeyResolve(key, { motion3: true, unified: true });
  // Routing a track through ONE bank must not lengthen any hold: the unified
  // sheet has no extra in-between drawings, so every band it takes over has to
  // land on a DIFFERENT cell than its neighbours, exactly as the 2.9 cells did.
  const tracks = [
    ["jump arc", jumpArcKeys(0.22), 46],
    ["jump arc (donald)", jumpArcKeys(0.06), 46],
    ["air normal", airNormalKeys(9 / 31, 18 / 31), 31],
    ["heavy punch windup", heavyWindupKeys("punch"), 17],
    ["heavy kick windup", heavyWindupKeys("kick"), 17],
    ["throw clinch", throwClinchKeys(), 24],
    ["throw recovery", throwRecoveryKeys(), 34],
    ["attack recovery", attackRecoveryKeys(), 28],
    ["blockstun", blockstunKeys(), 17],
    ["dash", dashKeys(), 16],
    ["reaction (heavy)", reactionTrackKeys(true), 44],
    ["reaction (light)", reactionTrackKeys(false), 44],
    ["wake-up", wakeupKeys(16), 16],
  ];
  for (const [name, keys, span] of tracks) {
    const before = longestBeatHold(keys, span, shipping);
    for (const [label, resolve] of [["unified", unified], ["unified+motion3", unifiedM3]]) {
      const after = longestBeatHold(keys, span, resolve);
      assert.ok(after <= before,
        `${name}: the worst hold grew from ${before} to ${after} ticks under ${label} — `
        + "routing a track through one bank must never merge two bands");
    }
    // The band COUNT must not collapse either: two neighbouring bands that
    // resolve to one unified cell would read as a freeze the run-merge hides.
    assert.equal(beatKeyRuns(keys, span, unified).length,
      beatKeyRuns(keys, span, shipping).length,
      `${name}: the unified route must keep every distinct drawing the 2.9 route had`);
  }
  // The reaction LADDER is where a single-bank route is most likely to
  // collapse — 2.9's snap/fold/settle are the same base frame on eight of ten
  // sheets. The unified grammar carries three distinct drawings on every
  // sheet, so consecutive bands can never repeat.
  const react = unifiedReactionCells();
  const ladder = REACTION_BANDS.map((at) => {
    if (at < REACTION_BANDS[2]) return react.snap;
    if (at < REACTION_BANDS[4]) return react.fold;
    if (at < REACTION_BANDS[5]) return react.settle;
    return react.idle;
  });
  for (const heavy of [true, false]) {
    const drawn = reactionTrackKeys(heavy).map((key, index) => {
      const link = (key.chain || []).find((entry) => entry.bank === UNIFIED_BANK);
      const other = (key.chain || []).find((entry) => entry.bank !== UNIFIED_BANK);
      return link ? `unified:${link.cell}` : other ? `${other.bank}:${other.cell}` : `unified:${ladder[index]}`;
    });
    for (let index = 1; index < drawn.length; index += 1) {
      assert.notEqual(drawn[index], drawn[index - 1],
        `reaction (${heavy ? "heavy" : "light"}) bands ${index - 1}/${index} are the same `
        + `drawing (${drawn[index]}) — that is R4's tail collapse in a new bank`);
    }
    assert.ok(new Set(drawn).size >= 4,
      `reaction (${heavy ? "heavy" : "light"}) must keep at least four drawings: ${drawn.join(" -> ")}`);
  }
  assert.ok(MOTION_HOLD_BUDGET === 8, "the budget itself is unchanged");
}

function testPropProhibitionSurvives() {
  // The unified sheets carry every prop in all sixteen cells by construction
  // (the art wave's round-2 regenerations of post and the Commissioner exist
  // for exactly that), and cells 10/11 are committed punches and kicks with no
  // baked prop VFX. So no unified cell is a prop-ACTION cell — and it must
  // stay that way, because a bare-handed diversion inside the sixteen would
  // send that beat to another generation.
  for (const [fighterId, entry] of Object.entries(PROP_CELLS)) {
    assert.equal(entry.propAction[UNIFIED_BANK], undefined,
      `${fighterId}: the unified bank must have no prop-action cells`);
    for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
      assert.equal(isPropActionCell(fighterId, UNIFIED_BANK, cell), false);
    }
    // ...and the base-bank prohibition the 2.9 round added is untouched.
    assert.ok(entry.propAction.base.length > 0,
      `${fighterId}: the base prop prohibition still guards every beat OUTSIDE the sixteen`);
  }
}

function testAirborneAnchoringExtends() {
  for (const id of ROSTER) {
    const table = CELL_BODY_CENTRE[id];
    assert.ok(Array.isArray(table[UNIFIED_BANK]), `${id}: no unified body-centre row`);
    assert.equal(table[UNIFIED_BANK].length, UNIFIED_CELL_COUNT);
    // The two AIRBORNE cells are the ones that must be registered or a bank
    // switch mid-jump moves the body — B2's defect in a new bank.
    for (const cell of [UNIFIED_CELLS.jumpRise, UNIFIED_CELLS.jumpTuck]) {
      const centre = table[UNIFIED_BANK][cell];
      assert.ok(Number.isFinite(centre) && centre > 100 && centre < 300,
        `${id}: unified cell ${cell} is unregistered (${centre})`);
      const offset = airborneAnchorOffset(id, UNIFIED_BANK, cell);
      assert.ok(Number.isFinite(offset) && Math.abs(offset) < 120,
        `${id}: implausible airborne anchor ${offset} on unified:${cell}`);
    }
    // The tuck brings the FEET UP, so it lifts further than the rise does.
    assert.ok(airborneAnchorOffset(id, UNIFIED_BANK, UNIFIED_CELLS.jumpTuck)
      < airborneAnchorOffset(id, UNIFIED_BANK, UNIFIED_CELLS.jumpRise),
      `${id}: the unified tuck must sit lower in its cell than the rise`);
    // The launched-victim big-hit and the knockdown also draw airborne.
    for (const cell of [UNIFIED_CELLS.bigHit, UNIFIED_CELLS.knockdown]) {
      assert.ok(Number.isFinite(airborneAnchorOffset(id, UNIFIED_BANK, cell)));
    }
    // The sheets register their own feet on floor row 315, inside the base
    // bank's 316, so no unified cell needs a floor-offset row.
    for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
      assert.equal(cellFloorOffset(id, UNIFIED_BANK, cell), 0);
    }
  }
}

function testHeightReconciliationsMoved() {
  // THE ONE 2.9 WORKAROUND THE UNIFIED SHEET INVALIDATES. M4's guard-flinch
  // correction matches motion2:8 to the fighter's STANDING GUARD, and for a
  // unified fighter that drawing moved from base(roles.guard) to unified:7.
  for (const id of WHOLE) {
    const before = guardFlinchAdjust(id, "motion2", MOTION2_CELLS.blockHit);
    const after = guardFlinchAdjust(id, "motion2", MOTION2_CELLS.blockHit, { unified: true });
    assert.ok(after >= 1 && after <= 1.22, `${id}: ${after} is outside the 2.9 cap philosophy`);
    assert.ok(after <= before + 0.05,
      `${id}: the unified guard is SHORTER than the base guard on every sheet, so the `
      + `flinch correction cannot grow (${before} -> ${after})`);
    // The wake-up settle aims at the standing cell, which is also unified now.
    assert.ok(Number.isFinite(WAKEUP_RISE_HEIGHT[id].standUnified),
      `${id}: the wake-up settle has no unified standing height to aim at`);
    assert.ok(WAKEUP_RISE_HEIGHT[id].standUnified < WAKEUP_RISE_HEIGHT[id].stand);
    // The last rung is motion2:15 on every fighter with a sheet. Aiming at the
    // shorter unified idle means the rung has LESS distance to stretch and the
    // standing cell arrives LESS compressed — the settle floor of 0.86 was
    // being hit on five of the eight against the base target, and against the
    // unified one nobody hits it. (Epsilon: post and devil land on the same
    // ratio through two different divisions.)
    const rung = ["motion2", 15];
    assert.ok(wakeupSettleStart(id, rung[0], rung[1], 16, { unified: true })
      >= wakeupSettleStart(id, rung[0], rung[1], 16) - 1e-9,
      `${id}: aiming at the shorter unified idle must not compress the standing cell FURTHER`);
    assert.ok(wakeupRiseStretch(id, rung[0], rung[1], { unified: true })
      <= wakeupRiseStretch(id, rung[0], rung[1]) + 1e-9);
    assert.ok(wakeupSettleStart(id, rung[0], rung[1], 16, { unified: true }) > 0.94,
      `${id}: the unified wake-up must not land on the 0.86 settle floor`);
  }
  // The two fighters off the bank keep their 2.9 numbers through every path.
  for (const id of PARTIAL) {
    assert.equal(guardFlinchAdjust(id, "motion2", MOTION2_CELLS.blockHit, { unified: true }),
      guardFlinchAdjust(id, "motion2", MOTION2_CELLS.blockHit));
    assert.equal(WAKEUP_RISE_HEIGHT[id].standUnified, undefined);
    assert.equal(wakeupSettleStart(id, "motion2", 15, 16, { unified: true }),
      wakeupSettleStart(id, "motion2", 15, 16));
  }
  // No unified CELL takes a per-cell draw adjust — the sheets are one global
  // scale each and mutually registered, which is the whole point of them.
  for (const id of ROSTER) {
    for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
      assert.equal(cellDrawAdjust(id, UNIFIED_BANK, cell), 1);
      assert.equal(cellDrawAdjust(id, UNIFIED_BANK, cell, { unified: true }), 1);
    }
    // ...and the base bank's oversized-crouch correction is untouched, because
    // base cells stay reachable for every beat OUTSIDE the sixteen.
    const roles = baseCellRoles(id);
    assert.equal(cellDrawAdjust(id, "base", roles.crouch, { unified: true }),
      cellDrawAdjust(id, "base", roles.crouch));
  }
}

function testBankRegistryAndWiring() {
  assert.deepEqual(AUTHORED_BANKS, ["motion", "motion2", "walk", UNIFIED_BANK],
    "both renderers and resolveMotionPose route off this one list");
  assert.equal(isAuthoredBank(UNIFIED_BANK), true);

  // The loader consults the MANIFEST before it requests a sheet — two fighters
  // can never draw one, and requesting theirs would 404-free-but-waste 600KB.
  assert.match(gameSource, /function unifiedCellDrawable\(fighterId, cell\) \{\s*\n\s*ensureUnifiedManifest\(\);\s*\n\s*const mask = unifiedBankState\.masks\?\.\[fighterId\];\s*\n\s*if \(!mask\?\.whole\) return false;/,
    "unifiedCellDrawable must gate on the whole-sheet mask BEFORE touching an Image");
  // The all-or-nothing gate is asked once per resolution and answers for the
  // whole sheet, so a fighter cannot be half on the bank at any instant.
  assert.match(gameSource, /if \(bank === UNIFIED_BANK\) return unifiedCellDrawable\(fighterId, cell\);/);
  // Warmed through the existing preload choke point, decode included.
  assert.match(gameSource, /ensureUnifiedManifest\(\)\?\.then\(\(\) => \{[\s\S]{0,400}?unifiedFighterWhole\(id\)[\s\S]{0,300}?atlas\.decode\(\)/,
    "the unified sheet must be warmed and DECODED from preloadAuthoredBanks");
  // Palette remap, world-size correction and the crossfade all know the bank.
  assert.match(gameSource, /if \(bank === UNIFIED_BANK\) return \{ image: fighterUnifiedAtlases\[fighterId\]/);
  assert.match(gameSource, /if \(bank === UNIFIED_BANK\) return UNIFIED_SHEET_ADJUST\[fighterId\] \|\| 1;/);
  assert.match(gameSource, /const UNIFIED_SHEET_ADJUST = Object\.freeze\(\{ commissioner: 1\.033 \}\);/,
    "the Commissioner's older base atlas normalises to the full cell on this bank too");
  // 3D resolves the SD sheet and must never request renderer/hd for it.
  assert.match(rendererSource, /bankName === UNIFIED_BANK \? \(host\.unifiedSheetAdjust\?\.\[fighter\.def\.id\] \|\| 1\)/);
  assert.match(rendererSource, /host\.cellDrawAdjust\(fighter\.def\.id, bankName, pose\.frame, \{ unified: unifiedActive \}\)/);
  assert.ok(!/hdFor\(["']unified["']\)|hdSheetPath\([^)]*unified/.test(rendererSource),
    "there are no HD unified sheets — 3D must resolve this bank from assets/unified only");
  assert.match(gameSource, /isUnifiedFighter: unifiedFighterReady,/,
    "both renderers must answer the unified question from ONE gate");
  // B5's crossfade exemption is "adjacent keys of ONE CYCLE". Cells 0-4 of
  // this bank are one cycle by construction, so they keep the crisp
  // cross-dissolve instead of taking the softened big-delta ghost.
  assert.match(gameSource,
    /const unifiedCycle = pose\.bank === UNIFIED_BANK && fadeObs\.fadeBank === UNIFIED_BANK[\s\S]{0,200}?fadeObs\.fadeFrame <= UNIFIED_CELLS\.walkPassingB;/,
    "the unified idle/walk cycle must keep the crisp crossfade");

  // Every named cell of the grammar is actually routed somewhere in game.js.
  for (const [name, cell] of Object.entries(UNIFIED_CELLS)) {
    if (UNIFIED_WALK_KEYS.includes(cell)) continue;   // routed via walkCyclePose
    assert.ok(gameSource.includes(`UNIFIED_CELLS.${name}`),
      `game.js never routes UNIFIED_CELLS.${name} — that beat would fall through to another bank`);
  }
}

test("U-A the unified manifest is the 16-cell grammar the routing addresses", testManifestShape);
test("U-B a unified sheet is ALL SIXTEEN cells or none of them", testAllOrNothing);
test("U-D no unified fighter resolves any of the sixteen beats off the bank", testNoCrossBankBeat);
test("U-C cyraxx and the deathblow pilot render exactly what 2.9 rendered", testUnchangedFighters);
test("unified pose descriptors are pure functions of snapshotted sim state", testDescriptorDeterminism);
test("U-E routing through one bank lengthens no hold and collapses no band", testHoldBudgetUnderUnified);
test("U-E the prop prohibition survives, and no unified cell is a prop-action cell", testPropProhibitionSurvives);
test("U-E airborne body-centre anchoring covers the unified airborne cells", testAirborneAnchoringExtends);
test("U-E the guard-flinch and wake-up height targets moved with the guard and idle", testHeightReconciliationsMoved);
test("U-E the bank is registered in every loader, adjust table and both renderers", testBankRegistryAndWiring);
