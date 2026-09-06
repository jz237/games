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
  UNIFIED_CELL_HEIGHT,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT_CELLS,
  UNIFIED_RETIRED_CELLS,
  UNIFIED_ROUTED_CELLS,
  UNIFIED_WALK_KEYS,
  WAKEUP_RISE_HEIGHT,
  WAKEUP_SETTLE_FLOOR,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT4_CELLS,
  UNIFIED_EXT4_CELL_HEIGHT,
  wakeupRungHeight,
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
  isUnifiedCycleCell,
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
  unifiedDrawnHeight,
  unifiedPose,
  unifiedReactionCellAt,
  unifiedReactionLadder,
  wakeupKeys,
  wakeupRiseStretch,
  wakeupRiseTransform,
  wakeupSettleStart,
  walkCyclePose,
  walkCycleFrame,
} from "../engine/fighter-kits.mjs";
import { altAtlasKey, bankGateKind, bankPreloadPlan } from "../engine/banks.mjs";

// ---------------------------------------------------------------------------
// v3.0 — THE UNIFIED BANK. TWO RULES, and they answer different questions.
//
//   RULE 1  ALL-OR-NOTHING, PER FIGHTER. Every unified sheet is a DIFFERENT
//           DRAUGHTSMAN from that fighter's base atlas (donald 22.5 dE from his
//           own base idle), so no beat the bank owns may fall through for a
//           fighter who is on it. A fighter is wholly on the bank or wholly off
//           it: nobody gets a unified idle with a base walk.
//   RULE 2  CONNECTED REGIONS, PER BEAT, uniform across the roster. The bank
//           owns a beat only if it can own that beat's WHOLE CONNECTED
//           NEIGHBOURHOOD. motion and motion2 are ONE generation (deathblow
//           motion:0 vs motion2:6 measures 2.62 dE on the critics' weighted-Lab
//           cluster metric), so dropping a unified cell into the middle of a
//           motion chain CUTS a chain that was already consistent. The first
//           3.0 cut did exactly that and took deathblow's heavy punch from 2
//           generation crossings to 5.
//
// The contracts below:
//
//   U-A  THE MANIFEST AND THE MASK — the sheet grammar is the 16-cell one the
//        art wave shipped, and the accept masks are built from it.
//   U-B  RULE 1 — all sixteen or nothing, per fighter.
//   U-C  THE UNCHANGED FIGHTER — `cyraxx` (0/16) must be byte-identical to
//        2.9, using none of it.
//   U-D  NO CROSS-BANK BEAT — for a whole fighter, no ROUTED beat may resolve
//        anywhere but `unified`.
//   U-E  EVERYTHING 2.9 FIXED IS STILL FIXED — the hold budget, the prop
//        prohibition, airborne body-centre anchoring, the height
//        reconciliations, the preload path and the SD-only 3D rule.
//   U-F  RULE 2 — connected regions. No key track may mix generations, no
//        retired cell may be routed, and the routed assignment must be the
//        CHEAPEST one available at every boundary the measurements cover.
//   U-G  THE IDLE<->WALK HEIGHT (B1) and THE MONOTONIC REACTION LADDER (M1).
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
  // v4.0: TEN whole sheets. cyraxx joins for the first time — his 3.0 rejection
  // was a detector artefact (his hair and beard swing any head-width metric), and
  // read hair-independently his archived winning generation clears every gate
  // with the widest walk inversion on the roster. PARTIAL is now EMPTY, which is
  // asserted explicitly rather than by omission so that a fighter silently
  // falling off the bank fails here.
  assert.deepEqual(WHOLE,
    ["alan", "ali", "benny", "commissioner", "cyraxx", "deathblow", "devil", "donald",
      "jez", "post"],
    "ten whole sheets — the entire roster is on the bank as of 4.0");
  assert.deepEqual(PARTIAL.sort(), [],
    "no fighter is off the unified bank — if one falls off, the all-or-nothing gate "
    + "has collapsed his sheet and he is silently drawing 2.9 art");

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
  // ...and cyraxx going whole must light all sixteen up with no code change.
  const healed = JSON.parse(JSON.stringify(manifest));
  for (const cell of healed.fighters.cyraxx.cells) cell.accept = true;
  assert.equal(buildUnifiedAcceptMasks(healed).cyraxx.whole, true);
}

// ---------------------------------------------------------------------------
// The ROUTED beats, as the descriptors game.js actually builds for them.
// Each entry is [unified cell, the exact 2.9 descriptor underneath it].
// The four RETIRED cells are deliberately absent — see retiredRoutes().
// ---------------------------------------------------------------------------
function coveredBeats(fighterId) {
  const roles = baseCellRoles(fighterId);
  const base = (frame) => ({ bank: "base", frame });
  const tail = reactionFallbackCells(roles);
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
    ["light-hit (flat recoil)", unifiedPose(UNIFIED_CELLS.lightHit, base(roles.hit))],
    ["light-hit (clinch flinch)", unifiedPose(UNIFIED_CELLS.lightHit,
      motion2Pose(MOTION2_CELLS.lightHit, "base", roles.hit))],
    ["light-hit (reaction open)", beatPoseAt(reactionTrackKeys(false), 0, base(tail.snap))],
    ["big-hit (reaction open)", beatPoseAt(reactionTrackKeys(true), 0, base(tail.snap))],
    ["big-hit (launched)", unifiedPose(UNIFIED_CELLS.bigHit,
      motionPose(MOTION_CELLS.bighit, "base", roles.down))],
    ["stagger (reaction fold)", beatPoseAt(reactionTrackKeys(false), REACTION_BANDS[1],
      unifiedPose(unifiedReactionCellAt(REACTION_BANDS[1], false), base(tail.snap)))],
    ["crouch-trans (reaction recover)", beatPoseAt(reactionTrackKeys(false), REACTION_BANDS[2],
      unifiedPose(unifiedReactionCellAt(REACTION_BANDS[2], false), base(tail.fold)))],
    ["guard (reaction settle)", beatPoseAt(reactionTrackKeys(true), REACTION_BANDS[3],
      unifiedPose(unifiedReactionCellAt(REACTION_BANDS[3], true), base(tail.fold)))],
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

/**
 * The beats the first 3.0 cut routed through the bank and this round RETIRED.
 * Each is the descriptor the shipping code now builds, and every one of them
 * must resolve OFF the bank — for a whole fighter as much as for cyraxx.
 */
function retiredRoutes(fighterId) {
  return [
    ["jump-rise (ascent)", motion2Pose(MOTION2_CELLS.jumpRise, "base", 13)],
    ["jump-rise (arc band)", beatPoseAt(jumpArcKeys(0.22), 0, null)],
    ["jump-tuck (arc band)", beatPoseAt(jumpArcKeys(0.22), 0.30, null)],
    ["jump-tuck (air-tech flip)", motionPose(MOTION_CELLS.tuck, "base", 13)],
    ["jump-tuck (air-normal chamber)", beatPoseAt(airNormalKeys(9 / 31, 18 / 31), 0, null)],
    ["punch-extension", motionPose(MOTION_CELLS.punchExt, "base", 10)],
    ["kick-extension", motionPose(MOTION_CELLS.kickExt, "base", 13)],
    ["heavy-windup compress", beatPoseAt(heavyWindupKeys("punch"), 0.99, null)],
    ["throw-clinch load", beatPoseAt(throwClinchKeys(), 0.40, null)],
  ].map(([name, pose]) => [`${fighterId} / ${name}`, pose]);
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
  // ...and the beats above between them must exercise every ROUTED cell, or
  // the assertion above is only covering the cells somebody remembered.
  for (const cell of UNIFIED_ROUTED_CELLS) {
    assert.ok(covered.has(cell),
      `cell ${cell} (${UNIFIED_BEATS[cell]}) is routed but never reached by any beat`);
  }
  // ...and it must reach NONE of the retired ones.
  for (const cell of UNIFIED_RETIRED_CELLS) {
    assert.ok(!covered.has(cell),
      `cell ${cell} (${UNIFIED_BEATS[cell]}) is RETIRED from routing but a beat reached it`);
  }
  assert.equal(UNIFIED_ROUTED_CELLS.length + UNIFIED_RETIRED_CELLS.length, UNIFIED_CELL_COUNT,
    "every cell of the grammar is either routed or explicitly retired — no third state");
}

// ---------------------------------------------------------------------------
// U-C — the one fighter not on the bank is byte-identical to 2.9.
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
  // The pilot's walk keys are single-phase, which is parity with the shipped
  // base walk (37 of its 40 cells share one lead foot) — not a rejection
  // reason. Phase inversion was retired as a gate for the roster, so he is on
  // the bank and his locomotion must come from it like everyone else's.
  const roles = baseCellRoles("deathblow");
  for (let step = 0; step < 8; step += 1) {
    const walkTime = step * 0.1;
    const resolved = resolveMotionPose(walkCyclePose(walkTime, roles), gate("deathblow"), "deathblow");
    assert.equal(resolved.bank, UNIFIED_BANK,
      "deathblow's walk must come from the unified bank, not the base atlas he no longer matches");
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
  // sheets. The unified grammar carries four distinct drawings before the tail
  // on every sheet, so consecutive bands can never repeat.
  for (const heavy of [true, false]) {
    const ladder = unifiedReactionLadder(heavy);
    const drawn = reactionTrackKeys(heavy).map((key, index) => {
      const link = (key.chain || []).find((entry) => entry.bank === UNIFIED_BANK);
      const other = (key.chain || []).find((entry) => entry.bank !== UNIFIED_BANK);
      return link ? `unified:${link.cell}` : other ? `${other.bank}:${other.cell}` : `unified:${ladder[index]}`;
    });
    // The last two bands are the BREATHING IDLE, which advances on its own and
    // is not a hold — the same exemption motion-holds.test.mjs already makes
    // for the reaction tail. Every band before it must be a new drawing.
    const idleRung = `unified:${UNIFIED_CELLS.idle}`;
    for (let index = 1; index < drawn.length; index += 1) {
      if (drawn[index] === idleRung && drawn[index - 1] === idleRung) continue;
      assert.notEqual(drawn[index], drawn[index - 1],
        `reaction (${heavy ? "heavy" : "light"}) bands ${index - 1}/${index} are the same `
        + `drawing (${drawn[index]}) — that is R4's tail collapse in a new bank`);
    }
    assert.ok(new Set(drawn).size >= 4,
      `reaction (${heavy ? "heavy" : "light"}) must keep at least four drawings: ${drawn.join(" -> ")}`);
  }
  assert.ok(MOTION_HOLD_BUDGET === 8, "the budget itself is unchanged");
}

// ---------------------------------------------------------------------------
// U-F — RULE 2, CONNECTED REGIONS.
//
// The measurements are the critics' weighted-Lab CLUSTER metric: adaptive
// k-means (k=6, fixed seed) over the Lab colours of a cell's opaque pixels,
// scored as the mean of the two weighted nearest-cluster distances. deathblow's
// calibration, which is what the numbers below are quoted on: a same-generation
// floor of 3.15 dE (his base idle against his base walk) and a known-bad strobe
// of 7.29-7.45 dE (his base idle against the 2.9 cross-generation walk cells
// that were rejected).
//
// Each row is [route, 2.9, first 3.0 cut, shipping] as
// { crossings, worst } — generation crossings over the whole move, and the
// largest dE of any of them. "generation" is base / motion-family / unified.
// ---------------------------------------------------------------------------
const MEASURED = Object.freeze({
  "heavy punch": [{ crossings: 2, worst: 7.01 }, { crossings: 5, worst: 9.51 }, { crossings: 2, worst: 7.01 }],
  "heavy kick": [{ crossings: 2, worst: 7.01 }, { crossings: 5, worst: 6.14 }, { crossings: 2, worst: 7.01 }],
  "jump arc": [{ crossings: 2, worst: 6.35 }, { crossings: 2, worst: 7.56 }, { crossings: 2, worst: 5.55 }],
  "crouch in/out": [{ crossings: 4, worst: 8.61 }, { crossings: 0, worst: 0 }, { crossings: 0, worst: 0 }],
  "idle->walk->idle": [{ crossings: 0, worst: 0 }, { crossings: 0, worst: 0 }, { crossings: 0, worst: 0 }],
  "light reaction": [{ crossings: 4, worst: 6.60 }, { crossings: 2, worst: 7.98 }, { crossings: 0, worst: 0 }],
  "heavy reaction": [{ crossings: 2, worst: 5.98 }, { crossings: 2, worst: 6.34 }, { crossings: 0, worst: 0 }],
  "air normal": [{ crossings: 0, worst: 0 }, { crossings: 1, worst: 6.17 }, { crossings: 0, worst: 0 }],
  "air-tech flip": [{ crossings: 0, worst: 0 }, { crossings: 1, worst: 7.56 }, { crossings: 0, worst: 0 }],
  "throw clinch": [{ crossings: 1, worst: 8.65 }, { crossings: 3, worst: 5.25 }, { crossings: 1, worst: 4.80 }],
  "blockstun": [{ crossings: 2, worst: 7.34 }, { crossings: 2, worst: 5.72 }, { crossings: 2, worst: 5.72 }],
});
/** deathblow's calibration, and the reason a boundary is or is not acceptable. */
const SAME_GENERATION_FLOOR = 3.15;
const KNOWN_BAD_STROBE = 7.29;

function testConnectedRegions() {
  // 1. NO KEY TRACK MAY MIX GENERATIONS. This is RULE 2 as a structural
  //    invariant rather than a table of numbers: a track that resolves to a
  //    unified cell in one band and a motion cell in another IS a mid-move
  //    generation crossing, by construction. The reaction tracks are wholly
  //    unified (their tail hands to the caller's unified idle); every other
  //    track is wholly motion-family.
  const ladderFallback = (heavy) => (key) => `unified:${unifiedReactionCellAt(key?.at ?? 0, heavy)}`;
  const tracks = [
    ["jump arc", jumpArcKeys(0.22), 46, null],
    ["jump arc (donald)", jumpArcKeys(0.06), 46, null],
    ["air normal", airNormalKeys(9 / 31, 18 / 31), 31, null],
    ["heavy punch windup", heavyWindupKeys("punch"), 17, null],
    ["heavy kick windup", heavyWindupKeys("kick"), 17, null],
    ["throw clinch", throwClinchKeys(), 24, null],
    ["throw recovery", throwRecoveryKeys(), 34, null],
    ["attack recovery", attackRecoveryKeys(), 28, null],
    ["blockstun", blockstunKeys(), 17, null],
    ["dash", dashKeys(), 16, null],
    ["wake-up", wakeupKeys(16), 16, null],
    ["reaction (heavy)", reactionTrackKeys(true), 44, ladderFallback(true)],
    ["reaction (light)", reactionTrackKeys(false), 44, ladderFallback(false)],
  ];
  for (const [name, keys, span, fallback] of tracks) {
    for (const motion3 of [false, true]) {
      const cells = beatKeyRuns(keys, span,
        (key) => defaultBeatKeyResolve(key, { motion3, unified: true, fallback }))
        .map((run) => run.cell);
      const banks = new Set(cells.map((cell) => (cell.startsWith(`${UNIFIED_BANK}:`) ? "unified" : "other")));
      assert.equal(banks.size, 1,
        `${name} (motion3 ${motion3 ? "on" : "off"}) mixes generations mid-track: ${cells.join(" -> ")} — `
        + "RULE 2: a beat the bank owns must own its whole connected neighbourhood");
    }
  }

  // 2. NO RETIRED CELL MAY BE ROUTED, for anyone. The four retired drawings
  //    stay on the sheet and inside the 16/16 gate; they are simply never
  //    asked for.
  for (const id of WHOLE) {
    const drawable = gate(id);
    for (const [name, pose] of retiredRoutes(id)) {
      for (const bareHanded of [false, true]) {
        const resolved = resolveMotionPose(pose, drawable, id, { bareHanded });
        assert.notEqual(resolved.bank, UNIFIED_BANK,
          `${name} resolved to ${resolved.bank}:${resolved.frame} — that beat sits inside a `
          + "motion chain and routing the bank into it CUTS a chain that was already consistent");
      }
    }
  }
  // ...and no ukey link anywhere in the engine may name a retired cell.
  const kitSource = readFileSync(join(testDir, "..", "engine", "fighter-kits.mjs"), "utf8");
  // v4.0: `jumpRise` is keyed into ONE track and only inside its `extended`
  // branch, where cells 8 and 19 cover the whole ascent from the same
  // generation. A fighter with no ext sheet still takes the 3.0 array, retired
  // cells and all, so the source check is scoped to the arrays that ship for
  // him — which is what "retired" has always meant.
  // v4.1: `jumpTuck` joins it, inside the `extended && descend` branch only,
  // where 8 -> 19 -> 9 -> 20 is a whole airborne chain from one generation. The
  // strip therefore covers every extended-GUARDED branch rather than only the
  // bare one; the SCOPE is unchanged — the arrays that ship for a fighter who
  // cannot draw the cell — and only the spelling of the guard has moved.
  // v5.2 (ext5-air): `air` joins the guard — the rise and the tuck are keyed
  // into the arc only where the fighter's ext5 apex, descent and air recover
  // follow them (one family to touchdown), so the strip covers that branch too.
  const shippingKitSource = kitSource.replace(/if \((?:extended|air)[^)]*\) \{[\s\S]*?\n  \}\n/g, "");
  // The strip must not be able to swallow the whole file and pass vacuously.
  assert.ok(shippingKitSource.length > kitSource.length * 0.9,
    "the extended-branch strip removed too much to be checking anything");
  assert.ok(shippingKitSource.includes("UNIFIED_CELLS.walkContactA"),
    "the strip removed the plain arrays it is supposed to be checking");
  for (const cell of UNIFIED_RETIRED_CELLS) {
    const name = Object.entries(UNIFIED_CELLS).find(([, value]) => value === cell)[0];
    assert.ok(!shippingKitSource.includes(`ukey(UNIFIED_CELLS.${name})`),
      `engine/fighter-kits.mjs still keys UNIFIED_CELLS.${name} into a track — it is retired`);
    assert.ok(!gameSource.includes(`UNIFIED_CELLS.${name}`),
      `game.js still routes UNIFIED_CELLS.${name} — it is retired`);
  }

  // 3. THE CHEAPEST ASSIGNMENT. For every route the critics measured, the
  //    shipping assignment must be no worse than BOTH alternatives on
  //    crossing count, and strictly better than the first 3.0 cut wherever
  //    that cut opened a crossing above the same-generation floor. This is the
  //    assertion the brief asks for: no routed beat may create a boundary the
  //    floor cannot justify when a cheaper assignment exists.
  for (const [route, [v29, first30, now]] of Object.entries(MEASURED)) {
    assert.ok(now.crossings <= first30.crossings,
      `${route}: the shipping assignment has MORE crossings (${now.crossings}) than the first `
      + `3.0 cut (${first30.crossings}) — a cheaper assignment exists`);
    assert.ok(now.crossings <= v29.crossings,
      `${route}: the shipping assignment has MORE crossings (${now.crossings}) than 2.9 `
      + `(${v29.crossings}) — the bank must not cost the build seams it did not have`);
    if (now.crossings > 0) {
      assert.ok(now.worst <= Math.min(v29.worst, first30.worst) + 1e-9 || now.worst < KNOWN_BAD_STROBE,
        `${route}: worst surviving crossing ${now.worst} dE is above the known-bad strobe band `
        + `(${KNOWN_BAD_STROBE}) and above both alternatives (${v29.worst} / ${first30.worst})`);
    } else {
      assert.equal(now.worst, 0, `${route}: a crossing-free route cannot have a crossing dE`);
    }
  }
  // The two routes the bank OWNS end to end are crossing-free, and they are the
  // wave's headline: locomotion and crouch.
  for (const route of ["idle->walk->idle", "crouch in/out", "light reaction", "heavy reaction"]) {
    assert.equal(MEASURED[route][2].crossings, 0,
      `${route} must be 100% unified — it is a connected region the bank owns whole`);
  }
  assert.ok(SAME_GENERATION_FLOOR < KNOWN_BAD_STROBE, "the calibration must bracket the decision");
}

// ---------------------------------------------------------------------------
// U-G — B1 (the idle<->walk height pop) and M1 (the reaction rewind).
// ---------------------------------------------------------------------------
function testIdleWalkHeightAndLadder() {
  // B1. Inside ONE self-consistent sheet the idle is a settled wide fighting
  // stance and the walk keys are an upright figure mid-stride, so the two beats
  // differ in CONTENT HEIGHT by 3.9-12.9%. That is a size change in one tick on
  // the most common transition in the game — measured on deathblow with a
  // 1-tick burst, the cap top jumped 41px between t7 (idle) and t8 (a walk
  // key). The four walk keys are corrected onto the fighter's own idle.
  for (const id of WHOLE) {
    const idle = UNIFIED_CELL_HEIGHT[id][UNIFIED_CELLS.idle];
    assert.ok(idle > 200, `${id}: implausible unified idle height ${idle}`);
    for (const key of UNIFIED_WALK_KEYS) {
      const raw = UNIFIED_CELL_HEIGHT[id][key];
      const drawn = unifiedDrawnHeight(id, key);
      assert.ok(Math.abs(drawn / idle - 1) <= 0.01,
        `${id}: unified walk key ${key} draws ${drawn.toFixed(1)}px against an idle of ${idle}px `
        + `(${(100 * (drawn / idle - 1)).toFixed(2)}%) — that is the B1 pop, uncorrected`);
      const adjust = cellDrawAdjust(id, UNIFIED_BANK, key);
      assert.ok(adjust > 0.8 && adjust < 1.25,
        `${id}: walk-key adjust ${adjust} is outside the 2.9 cap philosophy`);
      // No entry may be a no-op. This is the "carry a table entry that does
      // nothing" guard, and it is asserted where it belongs — on the CORRECTION.
      assert.ok(Math.abs(adjust - 1) > 1e-9,
        `${id}: walk key ${key} carries an adjust of exactly 1 — drop it from `
        + "UNIFIED_CELL_ADJUST rather than carry a table entry that does nothing");
    }
    // ...and the TABLE as a whole must be earning its place: at least one key of
    // the cycle outside the 5% deadband's 3% reporting line is what justifies
    // correcting all four.
    //
    // v4.1: this was asserted PER KEY until ali's 24-cell sheet, whose cycle is
    // the tightest on the roster (+1.4% to +4.1% against his own idle). Per key
    // it directly contradicts the rule this table is built on and states three
    // lines above it — "the correction is applied to ALL FOUR keys whenever ANY
    // of them is outside the deadband, because correcting only the out-of-band
    // keys would flatten the idle->walk step and leave a smaller pop INSIDE the
    // cycle". It only ever passed because no sheet before ali had one key under
    // the line while another was over it. Per fighter it says what was meant,
    // and the drawn-height assertion above is what actually holds the quality.
    //
    // v5.0: the line is the 1% DRAWN line the assertion above holds, not the 3%
    // reporting line. ali's redrawn 24-panel sheet is tighter than any before
    // it (+0.3% to +2.3% against his idle): under 3% on every key, over 1% on
    // three of them. Against the 3% line that sheet could neither carry a table
    // (nothing "leaves the deadband") nor go without one (three keys pop) — the
    // justification for correcting all four is exactly that one of them draws
    // outside the line the quality is held to.
    assert.ok(UNIFIED_WALK_KEYS.some(
      (key) => Math.abs(UNIFIED_CELL_HEIGHT[id][key] / idle - 1) > 0.01),
      `${id}: no walk key leaves the drawn line — drop the whole UNIFIED_CELL_ADJUST `
      + "row rather than carry a table that does nothing");
    // The idle is the ANCHOR — it is the sheet's U1 reference cell and what
    // WAKEUP_RISE_HEIGHT.standUnified was measured on, so it must never be
    // rescaled or that whole table drifts.
    assert.equal(cellDrawAdjust(id, UNIFIED_BANK, UNIFIED_CELLS.idle), 1,
      `${id}: the unified idle is the anchor and takes no correction`);
    assert.equal(WAKEUP_RISE_HEIGHT[id].standUnified, idle,
      `${id}: standUnified must be the measured unified idle height`);
    // Cells that are legitimately shorter drawings keep their pose.
    for (const cell of [UNIFIED_CELLS.crouch, UNIFIED_CELLS.crouchTrans, UNIFIED_CELLS.jumpTuck,
      UNIFIED_CELLS.stagger, UNIFIED_CELLS.bigHit, UNIFIED_CELLS.knockdown]) {
      assert.equal(cellDrawAdjust(id, UNIFIED_BANK, cell), 1,
        `${id}: cell ${cell} is a legitimately shorter drawing — normalising it flattens the pose`);
    }
    // And the guard, which BOTH reaction ladders end on, is already within the
    // deadband of the idle, so the last transition of every reaction is
    // height-flat without a correction.
    // v4.0: on the DRAWN height, not the raw one. Two of the redrawn sheets put
    // the guard 5-6% below their own idle where 3.0 had every guard inside the
    // band uncorrected, so the guard now takes the same idle-anchored correction
    // the walk keys do. Asserting the drawn value is strictly stronger: for the
    // eight that need no correction drawn === raw, and it now also catches a
    // correction that is wrong as well as one that is missing.
    assert.ok(Math.abs(unifiedDrawnHeight(id, UNIFIED_CELLS.guard) / idle - 1) <= 0.05,
      `${id}: the unified guard must draw within 5% of the idle — that is what makes `
      + "the last transition of every reaction height-flat");
  }
  for (const id of PARTIAL) {
    for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
      assert.equal(cellDrawAdjust(id, UNIFIED_BANK, cell), 1,
        `${id} is off the bank and must take no unified correction`);
    }
  }

  // M1. The ladder is MONOTONIC — no rung may be a drawing the beat has
  // already left. The first 3.0 cut played 12 -> 14 -> motion2:10 -> 14 on
  // every unified fighter: a return to the stagger for 6-8 ticks, which is the
  // rewind hitch the 2.9 throw-recovery fix (R7) exists to forbid.
  for (const heavy of [true, false]) {
    const label = heavy ? "heavy" : "light";
    const ladder = unifiedReactionLadder(heavy);
    assert.equal(ladder.length, REACTION_BANDS.length);
    const seen = [];
    for (const rung of ladder) {
      if (seen.length && seen[seen.length - 1] === rung) continue;   // a merged band
      assert.ok(!seen.includes(rung),
        `reaction (${label}) RETURNS to unified:${rung} after leaving it: ${ladder.join(" -> ")}`);
      seen.push(rung);
    }
    // It ends on the breathing idle from band 4 on EVERY fighter, which is the
    // tick 2.9 handed the eight settle:null sheets (the Commissioner among
    // them) to it — m1. Band 4 is only 2-3 ticks of a real ~30-tick reaction.
    assert.equal(ladder[4], UNIFIED_CELLS.idle,
      `reaction (${label}) must hand to the breathing idle at band 4, not flash a 2-tick rung`);
    assert.equal(ladder[5], UNIFIED_CELLS.idle);
    assert.ok(ladder.slice(0, 4).every((cell) => cell !== UNIFIED_CELLS.idle),
      `reaction (${label}) must not idle before band 4`);
    // Both tracks end on the guard, whose height matches the idle.
    assert.equal(ladder[3], UNIFIED_CELLS.guard);
    // No rung may be a retired cell, and none may read as an attack.
    for (const rung of ladder) {
      assert.ok(!UNIFIED_RETIRED_CELLS.includes(rung),
        `reaction (${label}) rung unified:${rung} is retired from routing`);
      assert.ok(rung !== UNIFIED_CELLS.punchExt && rung !== UNIFIED_CELLS.kickExt,
        `reaction (${label}) rung unified:${rung} is a STRIKE — a reaction cell may never read as an attack`);
    }
  }
  // M5's contract survives: the two tracks open and turn on different drawings.
  assert.notEqual(unifiedReactionLadder(true)[0], unifiedReactionLadder(false)[0],
    "the reaction openings must differ");
  assert.notEqual(unifiedReactionLadder(true)[1], unifiedReactionLadder(false)[1],
    "the reaction MIDDLES must differ");
  // game.js reads the rung from the same table the track keys it from, or the
  // two drift apart again — which is exactly the M1 defect.
  assert.match(gameSource, /const rung = unifiedReactionCellAt\(at, heavyTrack, extOpt\);/,
    "the reaction fallback must read the rung from unifiedReactionCellAt");
  // v4.0: and it must POSE that rung through the bank-dispatching helper, or a
  // ladder naming an ext cell would address row 5 of a four-row sheet.
  assert.match(gameSource, /return unifiedRungPose\(rung, /,
    "the reaction fallback must pose the rung through unifiedRungPose");
  // The ext ladders keep the M5 contract: openings AND middles differ.
  const extOpts = { extended: true };
  assert.notEqual(unifiedReactionLadder(true, extOpts)[0], unifiedReactionLadder(false, extOpts)[0],
    "the ext reaction openings must differ");
  assert.notEqual(unifiedReactionLadder(true, extOpts)[1], unifiedReactionLadder(false, extOpts)[1],
    "the ext reaction MIDDLES must differ");
  assert.notEqual(unifiedReactionLadder(true, extOpts)[2], unifiedReactionLadder(false, extOpts)[2],
    "the ext reaction middles must differ in the third band too");
  assert.ok(!/uniReact\./.test(gameSource),
    "the old snap/fold/settle ladder is gone — one table only");
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

/** The last wake-up rung as it DRAWS: the ext4 get-up on the swing bank, motion2:15 off it. */
function wakeupRungOf(id) {
  return UNIFIED_EXT4_CELL_HEIGHT[id] ? [UNIFIED_EXT4_BANK, UNIFIED_EXT4_CELLS.getupB] : ["motion2", 15];
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
    // v5.0: on the swing bank the last rung DRAWS from the ext4 get-up cell —
    // the stretch and the settle key off the drawn cell — so it is measured
    // there; off the bank it is still motion2:15.
    const rung = wakeupRungOf(id);
    assert.ok(wakeupSettleStart(id, rung[0], rung[1], 16, { unified: true })
      >= wakeupSettleStart(id, rung[0], rung[1], 16) - 1e-9,
      `${id}: aiming at the shorter unified idle must not compress the standing cell FURTHER`);
    assert.ok(wakeupRiseStretch(id, rung[0], rung[1], { unified: true })
      <= wakeupRiseStretch(id, rung[0], rung[1]) + 1e-9);
    // v4.0: stated as "clear of the floor with margin" rather than as the 0.94
    // constant it was calibrated to in 3.0. jez's redrawn idle is 6px taller and
    // his getup rung is unchanged, so his required stretch now exceeds
    // WAKEUP_STRETCH_CAP and he settles at 0.932 instead of 0.953.
    //
    // v4.1: stated as the PROPERTY instead of as a margin, because ali's redraw
    // moved him the same way and further — his 4.1 idle is 23px taller than his
    // 3.0 one against the same unchanged getup rung, so he settles at 0.898.
    // The margin was a proxy and this is the thing it was proxying for: the
    // settle must not be CLAMPED. wakeupSettleStart returns `last / stand`
    // clamped into [FLOOR, 1], so an unclamped value means the standing cell
    // arrives at EXACTLY the stretched rung's height and the wake-up seam is
    // 0px. A clamp means the two drawings no longer meet and the seam reopens,
    // which is the whole defect R5 exists to close. Strictly stated, and
    // strictly stronger than "> floor + 0.05" is at describing what matters.
    const settle = wakeupSettleStart(id, rung[0], rung[1], 16, { unified: true });
    assert.ok(settle > WAKEUP_SETTLE_FLOOR,
      `${id}: the unified wake-up settle is CLAMPED at the ${WAKEUP_SETTLE_FLOOR} floor — `
      + "the two drawings no longer meet and the seam is open");
    // ...and where the settle actually ENGAGES, the seam it produces is
    // genuinely zero, checked against the rise transform rather than inferred
    // from the clamp. Above 0.999 wakeupSettleTransform returns null and the
    // standing cell simply draws at full height — the rung already reaches it,
    // which is the case on six of the nine and on the devil is the upper clamp
    // (his getup rung is TALLER than his unified idle).
    if (settle < 0.999) {
      const stretched = wakeupRungHeight(id, rung[0], rung[1])
        * wakeupRiseTransform(1, 16, wakeupRiseStretch(id, rung[0], rung[1], { unified: true })).scaleY;
      assert.ok(Math.abs(settle * WAKEUP_RISE_HEIGHT[id].standUnified - stretched) < 0.5,
        `${id}: the wake-up hands off with a ${(settle * WAKEUP_RISE_HEIGHT[id].standUnified
          - stretched).toFixed(1)}px height seam`);
    }
  }
  // The deepest compression on the roster is PINNED, so a future sheet that
  // pushes a fighter further toward the floor than the worst one today is a
  // failure rather than a silent drift. Through 4.9 ali was the deepest at
  // 0.898 (a 23px taller idle against an unchanged getup rung), jez next at
  // 0.932. v5.0 measures the rung on the ext4 sheet it now draws from:
  // deathblow is the deepest at 0.893 (a 206px get-up under a 272px idle),
  // post next at 0.926; ali's redrawn get-up reaches 0.986 and jez's his idle.
  {
    const settles = WHOLE.map((id) => [id, wakeupSettleStart(id, ...wakeupRungOf(id), 16, { unified: true })])
      .sort((a, b) => a[1] - b[1]);
    assert.deepEqual(settles.slice(0, 2).map(([id]) => id), ["deathblow", "post"],
      "the two deepest wake-up settles on the roster are deathblow's and post's");
    assert.ok(settles[0][1] > 0.89,
      `${settles[0][0]} settles at ${settles[0][1].toFixed(4)} — deeper than any sheet `
      + "shipped so far, which means the getup rung can no longer reach its own idle");
  }
  // The two fighters off the bank keep their 2.9 numbers through every path.
  for (const id of PARTIAL) {
    assert.equal(guardFlinchAdjust(id, "motion2", MOTION2_CELLS.blockHit, { unified: true }),
      guardFlinchAdjust(id, "motion2", MOTION2_CELLS.blockHit));
    assert.equal(WAKEUP_RISE_HEIGHT[id].standUnified, undefined);
    assert.equal(wakeupSettleStart(id, "motion2", 15, 16, { unified: true }),
      wakeupSettleStart(id, "motion2", 15, 16));
  }
  // The only unified cells that take a per-cell draw adjust are the UPRIGHT
  // STANDING ones that miss their own idle (B1) — the walk keys on every sheet,
  // and since 4.0 the GUARD on the two redrawn sheets that put it 5-6% low.
  // Everything else is one global scale, which is the whole point of the bank.
  const ADJUSTABLE = [...UNIFIED_WALK_KEYS, UNIFIED_CELLS.guard];
  for (const id of ROSTER) {
    for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
      if (WHOLE.includes(id) && ADJUSTABLE.includes(cell)) continue;
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
  assert.deepEqual(AUTHORED_BANKS, ["motion", "motion2", "walk", UNIFIED_BANK, UNIFIED_EXT_BANK, UNIFIED_EXT2_BANK, "unified-ext3", "unified-ext4", "unified-ext5"],
    "both renderers and resolveMotionPose route off this one list");
  assert.equal(isAuthoredBank(UNIFIED_BANK), true);

  // The loader consults the MANIFEST before it requests a sheet — two fighters
  // can never draw one, and requesting theirs would 404-free-but-waste 600KB.
  assert.match(gameSource, /function unifiedCellDrawable\(fighterId, cell\) \{\s*\n\s*ensureUnifiedManifest\(\);\s*\n\s*const mask = unifiedBankState\.masks\?\.\[fighterId\];\s*\n\s*if \(!mask\?\.whole\) return false;/,
    "unifiedCellDrawable must gate on the whole-sheet mask BEFORE touching an Image");
  // The all-or-nothing gate is asked once per resolution and answers for the
  // whole sheet, so a fighter cannot be half on the bank at any instant.
  // v5.3 (sweep #52): the ROUTING is engine/banks.mjs's table, so "the bank
  // asks its own gate and nobody else's" is a direct assertion.
  assert.equal(bankGateKind(UNIFIED_BANK), "unified");
  assert.match(gameSource, /\n\s*unified: unifiedCellDrawable,/, "game.js supplies the unified gate");
  // Warmed through the existing preload choke point, decode included. (v5.1
  // #35 changed this pin: the whole preload now runs behind the manifest with
  // the unified sheet FIRST, and the decode is bookkept by trackSheetDecode.)
  assert.match(gameSource, /ensureUnifiedManifest\(\)\?\.then\(\(\) => \{[\s\S]{0,2400}?if \(step\.kind === "unified"\) \{\s*\n\s*decodeTracked\(step\.key, ensureUnifiedAtlas\(step\.id\)\);/,
    "the unified sheet must be warmed and DECODED from preloadAuthoredBanks");
  // ...and it is asked FIRST, and only for a fighter the manifest calls whole
  // (the manifest-BEFORE-sheet order: a fighter with no sheet must not 404).
  const warmed = bankPreloadPlan(["jez", "cyraxx"], { unifiedWhole: (id) => id === "jez" }).unified;
  assert.deepEqual(warmed.map((step) => step.key), ["jez:unified"]);
  // Palette remap, world-size correction and the crossfade all know the bank.
  assert.equal(altAtlasKey("jez", UNIFIED_BANK), "jez:unified");
  assert.match(gameSource, /\n\s*unified: fighterUnifiedAtlases,/, "the palette remap reads the unified atlas table");
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
  // v4.0: the cycle now SPANS TWO BANKS (idle 0 <-> 16, walk 1 -> 17 -> 2 -> 3
  // -> 18 -> 4), so the membership test moved into the engine where both
  // renderers read it. Asserted on BEHAVIOUR rather than on the source text,
  // which is stronger: a bank-equality test would silently have sent four of
  // every six stride handoffs back to the softened ghost.
  assert.match(gameSource, /const unifiedCycle = isUnifiedCycleCell\(pose\.bank, frame\)/,
    "the unified idle/walk cycle must keep the crisp crossfade");
  for (const cell of [UNIFIED_CELLS.idle, ...UNIFIED_WALK_KEYS]) {
    assert.equal(isUnifiedCycleCell(UNIFIED_BANK, cell), true,
      `unified:${cell} is part of the idle/walk cycle and must cross-dissolve crisply`);
  }
  for (const frame of [UNIFIED_EXT_CELLS.idleBreathe, UNIFIED_EXT_CELLS.walkDownA,
    UNIFIED_EXT_CELLS.walkDownB]) {
    assert.equal(isUnifiedCycleCell(UNIFIED_EXT_BANK, frame), true,
      `unified-ext:${frame} is part of the same cycle and must cross-dissolve crisply`);
  }
  // ...and nothing else does. A guard, a crouch or a reaction still softens.
  for (const cell of [UNIFIED_CELLS.crouch, UNIFIED_CELLS.guard, UNIFIED_CELLS.bigHit,
    UNIFIED_CELLS.knockdown]) {
    assert.equal(isUnifiedCycleCell(UNIFIED_BANK, cell), false,
      `unified:${cell} is not a cycle key and must take the softened ghost`);
  }
  for (const frame of [UNIFIED_EXT_CELLS.jumpAscent, UNIFIED_EXT_CELLS.punchWindup,
    UNIFIED_EXT_CELLS.midReaction]) {
    assert.equal(isUnifiedCycleCell(UNIFIED_EXT_BANK, frame), false,
      `unified-ext:${frame} is not a cycle key and must take the softened ghost`);
  }
  assert.equal(isUnifiedCycleCell("motion", 0), false);
  assert.equal(isUnifiedCycleCell("base", 0), false);

  // Every ROUTED cell of the grammar is actually routed somewhere in game.js.
  for (const [name, cell] of Object.entries(UNIFIED_CELLS)) {
    if (UNIFIED_WALK_KEYS.includes(cell)) continue;   // routed via walkCyclePose
    if (UNIFIED_RETIRED_CELLS.includes(cell)) continue;   // deliberately unrouted
    assert.ok(gameSource.includes(`UNIFIED_CELLS.${name}`),
      `game.js never routes UNIFIED_CELLS.${name} — that beat would fall through to another bank`);
  }
  // The manifest documents the routing decision beside the grammar, so the art
  // pipeline knows the retired cells are KEPT and not abandoned.
  assert.match(manifest.format.routingNote, /RETIRED FROM ROUTING/);
  assert.match(manifest.format.cyraxxNote, /cyraxx IS NOW ON THE BANK/,
    "the manifest must record that cyraxx was switched on, not that he is missing");
  assert.ok(!/NOT WIRED/.test(manifest.format.status),
    "the manifest still claims the bank is not wired");
  assert.ok(!/12\/16|12 of 16/.test(manifest.format.status + manifest.format.acceptNote),
    "the manifest still claims the deathblow pilot is 12/16");
  assert.ok(!/deathblow.*pilot.*12\/16|cyraxx` 0\/16, the `deathblow` pilot/.test(gameSource),
    "game.js still claims the deathblow pilot is 12/16");
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
test("U-F the bank owns CONNECTED REGIONS — no track mixes generations, no retired cell is routed", testConnectedRegions);
test("U-G the idle<->walk height agrees and the reaction ladder is monotonic", testIdleWalkHeightAndLadder);
