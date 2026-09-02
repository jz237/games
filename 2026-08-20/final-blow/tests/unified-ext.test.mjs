// ---------------------------------------------------------------------------
// v4.0 — THE EXT SHEET, THE SIX-KEY WALK, AND cyraxx.
//
// The 4.0 art wave drew four fighters (and archived a fifth) at TWENTY-FOUR
// cells from one generation instead of sixteen: the 3.0 grammar in <id>.webp
// plus eight more in <id>-ext.webp. This suite covers what wiring them means.
//
//   X-A  THE MANIFEST is the spec, and the two blocks agree with each other.
//   X-B  ALL EIGHT OR NONE, and a fighter must be whole on BOTH sheets. Half an
//        ext sheet is a walk cycle that changes drawing-count halfway round.
//   X-C  THE FIVE HOLDOUTS ARE UNTOUCHED. deathblow, post, donald, ali and the
//        devil have no ext block, and EVERY re-framed beat must hand them back
//        the byte-identical 3.5 key array. This is the load-bearing test of the
//        whole wave: five fighters keep their 3.0 sheets and must keep their
//        3.0 motion.
//   X-D  THE SIX-KEY WALK. The cycle order, the CADENCE (six keys at 15/s is
//        the same 0.4s gait period four keys at 10/s ran at, or the fighter
//        skates), and the reversal a retreat depends on.
//   X-E  ROUTING. Six ext cells are spent on the beat they were drawn for; one
//        is retired because the drawing is not the beat.
//   X-F  THE HOLD BUDGET may not get worse for a fighter who gains a sheet.
//   X-G  cyraxx, on the bank for the first time.
//   X-H  REGISTRATION — the height and body-centre tables the ext cells need,
//        and the padding both renderers depend on.
// ---------------------------------------------------------------------------
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  CELL_BODY_CENTRE,
  MOTION_HOLD_BUDGET,
  REACTION_BANDS,
  UNIFIED_BANK,
  UNIFIED_CELLS,
  UNIFIED_CELL_COUNT,
  UNIFIED_CELL_HEIGHT,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT_BEATS,
  UNIFIED_EXT_CELLS,
  UNIFIED_EXT_CELL_COUNT,
  UNIFIED_EXT_CELL_HEIGHT,
  UNIFIED_EXT_RETIRED_CELLS,
  UNIFIED_EXT_ROUTED_CELLS,
  UNIFIED_EXT_WALK_KEYS,
  UNIFIED_EXT_WALK_KEY_COUNT,
  UNIFIED_EXT_WALK_RATE,
  UNIFIED_WALK_KEYS,
  WALK_CELL_COUNT,
  airNormalKeys,
  airborneAnchorOffset,
  attackRecoveryKeys,
  baseCellRoles,
  beatKeyRuns,
  blockstunKeys,
  buildUnifiedAcceptMasks,
  buildUnifiedExtAcceptMasks,
  cellDrawAdjust,
  dashKeys,
  defaultBeatKeyResolve,
  heavyWindupKeys,
  isUnifiedExtCell,
  jumpArcKeys,
  reactionTrackKeys,
  throwClinchKeys,
  unifiedExtCell,
  unifiedExtDrawnHeight,
  unifiedExtFighterIds,
  unifiedExtFrame,
  unifiedFighterIds,
  unifiedReactionLadder,
  unifiedRungPose,
  walkCycleFrame,
  walkCycleFrameExt,
  walkCyclePose,
} from "../engine/fighter-kits.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const assetDir = join(testDir, "..", "assets", "unified");
const manifest = JSON.parse(readFileSync(join(assetDir, "MANIFEST.json"), "utf8"));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");
const kitSource = readFileSync(join(testDir, "..", "engine", "fighter-kits.mjs"), "utf8");

const ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali",
  "commissioner", "devil"];
const masks = buildUnifiedAcceptMasks(manifest);
const extMasks = buildUnifiedExtAcceptMasks(manifest, masks);
const WHOLE = unifiedFighterIds(masks);
const EXT = unifiedExtFighterIds(extMasks);
const NO_EXT = ROSTER.filter((id) => !EXT.includes(id));

const EXTENDED = { extended: true };
/** How a fighter WITH an ext sheet resolves a key. */
const withExt = (key) => defaultBeatKeyResolve(key, { motion3: true, unified: true, ext: true });
/** How a fighter WITHOUT one resolves it — the 3.5 read. */
const noExt = (key) => defaultBeatKeyResolve(key, { motion3: true, unified: true });

/**
 * Every beat track that learned an `extended` option, paired with the span it
 * is paced over. One table so a future track cannot be added to the engine and
 * silently skip both the holdout check and the budget check.
 */
const EXT_AWARE_TRACKS = [
  ["jump arc", (o) => jumpArcKeys(0.22, o), 46],
  ["jump arc (donald)", (o) => jumpArcKeys(0.06, o), 46],
  ["windup punch", (o) => heavyWindupKeys("punch", o), 11],
  ["windup kick", (o) => heavyWindupKeys("kick", o), 17],
  ["reaction heavy", (o) => reactionTrackKeys(true, o), 44],
  ["reaction light", (o) => reactionTrackKeys(false, o), 44],
];

/** Tracks the ext sheet deliberately does NOT touch — they must be inert. */
const UNTOUCHED_TRACKS = [
  ["air normal", (o) => airNormalKeys(9 / 31, 18 / 31, o), 31],
  ["dash", (o) => dashKeys(o), 16],
  ["attack recovery", (o) => attackRecoveryKeys(o), 28],
  ["blockstun", (o) => blockstunKeys(o), 17],
  ["throw clinch", (o) => throwClinchKeys(o), 24],
];


/**
 * game.js owns the sheet-level adjust; this mirrors it so the contract test can
 * multiply the two channels the way a renderer does. Asserted against the real
 * source below so the mirror cannot drift.
 */
const UNIFIED_SHEET_ADJUST_MIRROR = { commissioner: 1.033 };
function sheetAdjust(fighterId, bank) {
  if (bank === UNIFIED_BANK) return UNIFIED_SHEET_ADJUST_MIRROR[fighterId] || 1;
  return 1;   // including UNIFIED_EXT_BANK — see the note in bankSheetAdjust
}

// ---------------------------------------------------------------------------
// X-A — the manifest is the spec.
// ---------------------------------------------------------------------------
function testManifestShape() {
  const format = manifest.format;
  assert.equal(format.extCellCount, UNIFIED_EXT_CELL_COUNT);
  assert.deepEqual(format.extPoseIds, [...UNIFIED_EXT_BEATS],
    "the engine's ext grammar and the manifest's must be the same list in the same order");
  assert.equal(format.extPoseIds.length, UNIFIED_EXT_CELL_COUNT);

  for (const [id, entry] of Object.entries(manifest.fighters)) {
    if (!entry.extSheet) {
      assert.equal(entry.extCells, undefined,
        `${id}: ext cells without an ext sheet — the loader would never request the art`);
      continue;
    }
    assert.equal(entry.extSheet, `${id}-ext.webp`);
    assert.equal(entry.extCells.length, UNIFIED_EXT_CELL_COUNT);
    // Frames are GRAMMAR numbers (16-23) in the manifest and SHEET frames (0-7)
    // in a descriptor. Mixing them up addresses row 4 of a two-row sheet, so
    // the manifest's numbering is pinned here.
    entry.extCells.forEach((cell, index) => {
      assert.equal(cell.frame, unifiedExtCell(index),
        `${id}: extCells[${index}] must be grammar frame ${unifiedExtCell(index)}`);
      assert.equal(unifiedExtFrame(cell.frame), index);
      assert.equal(isUnifiedExtCell(cell.frame), true);
      assert.equal(cell.id, UNIFIED_EXT_BEATS[index], `${id}: extCells[${index}] id`);
    });
    // The main block is untouched by this wave: still sixteen, still the
    // runtime contract every 3.0 consumer reads.
    assert.equal(entry.cells.length, UNIFIED_CELL_COUNT);
    // A sheet that is claimed must be on disk, or the preload 404s.
    assert.ok(statSync(join(assetDir, entry.extSheet)).size > 0);
  }
  // A main cell number can never be mistaken for an ext one.
  for (let cell = 0; cell < UNIFIED_CELL_COUNT; cell += 1) {
    assert.equal(isUnifiedExtCell(cell), false);
    assert.equal(unifiedExtFrame(cell), -1);
  }
  assert.match(manifest.format.extStatus, /WIRED AND SHIPPING/,
    "the manifest still claims the ext sheet is unwired");
}

// ---------------------------------------------------------------------------
// X-B — all eight or none, and only on top of a whole main sheet.
// ---------------------------------------------------------------------------
function testAllOrNothing() {
  assert.deepEqual(EXT, ["alan", "benny", "commissioner", "cyraxx", "jez"],
    "five fighters carry an ext sheet");
  for (const id of EXT) {
    assert.equal(extMasks[id].accept.length, UNIFIED_EXT_CELL_COUNT);
    // Every ROUTED frame is drawable and the retired one is forced false in the
    // mask, so the routing refusal is enforced at the gate as well as in the
    // tracks — a stray descriptor naming cell 20 draws nothing.
    for (const frame of UNIFIED_EXT_ROUTED_CELLS) {
      assert.equal(extMasks[id].accept[frame], true, `${id}: routed ext frame ${frame}`);
    }
    for (const frame of UNIFIED_EXT_RETIRED_CELLS) {
      assert.equal(extMasks[id].accept[frame], false,
        `${id}: the retired ext frame must be undrawable, not merely unrouted`);
    }
    assert.equal(masks[id].whole, true, `${id}: an ext sheet needs a whole main sheet under it`);
  }
  for (const id of NO_EXT) {
    assert.equal(extMasks[id].whole, false);
    assert.equal(extMasks[id].accept.some(Boolean), false,
      `${id}: not one ext cell may be drawable — a partial mask is the strobe`);
  }

  // ONE rejected ROUTED cell collapses the whole sheet.
  for (const frame of UNIFIED_EXT_ROUTED_CELLS) {
    const broken = JSON.parse(JSON.stringify(manifest));
    broken.fighters.jez.extCells[frame].accept = false;
    const built = buildUnifiedExtAcceptMasks(broken, masks);
    assert.equal(built.jez.whole, false, `rejecting ext frame ${frame} must collapse the sheet`);
    assert.equal(built.jez.accept.some(Boolean), false);
  }
  // ...and the RETIRED cell is not gated on, or alan and benny would lose their
  // whole sheet over a cell no beat can reach. Accepting it changes nothing.
  const revived = JSON.parse(JSON.stringify(manifest));
  for (const frame of UNIFIED_EXT_RETIRED_CELLS) revived.fighters.jez.extCells[frame].accept = true;
  assert.deepEqual(buildUnifiedExtAcceptMasks(revived, masks).jez.accept,
    extMasks.jez.accept,
    "accepting the retired cell must not make it drawable");
  // ...and so does losing the main sheet under it, however good the ext block is.
  const orphan = JSON.parse(JSON.stringify(manifest));
  orphan.fighters.jez.cells[0].accept = false;
  const orphanMasks = buildUnifiedAcceptMasks(orphan);
  assert.equal(buildUnifiedExtAcceptMasks(orphan, orphanMasks).jez.whole, false,
    "an ext sheet riding a rejected main sheet is a cross-generation cycle");
  // ...and an extSheet-less entry is never whole even if extCells appear.
  const sheetless = JSON.parse(JSON.stringify(manifest));
  delete sheetless.fighters.jez.extSheet;
  assert.equal(buildUnifiedExtAcceptMasks(sheetless, masks).jez.whole, false);
  // A fighter going whole must light all eight with no code change.
  const healed = JSON.parse(JSON.stringify(manifest));
  healed.fighters.post.extSheet = "post-ext.webp";
  healed.fighters.post.extCells = manifest.fighters.jez.extCells.map((c) => ({ ...c }));
  assert.equal(buildUnifiedExtAcceptMasks(healed, masks).post.whole, true);
}

// ---------------------------------------------------------------------------
// X-C — THE FIVE HOLDOUTS RENDER EXACTLY WHAT 3.5 RENDERED.
// ---------------------------------------------------------------------------
function testHoldoutsUnchanged() {
  // Every ext-aware track, called the way a fighter with no sheet calls it,
  // must contain no ext link at all — not merely fall back off one.
  for (const [name, track] of EXT_AWARE_TRACKS) {
    for (const key of track(undefined)) {
      for (const link of key.chain || []) {
        assert.notEqual(link.bank, UNIFIED_EXT_BANK,
          `${name}: an ext link reached a fighter with no ext sheet`);
      }
    }
    // The two arrays must also RESOLVE differently, or the option is decorative.
    const plain = beatKeyRuns(track(undefined), 44, noExt).map((r) => r.cell);
    const ext = beatKeyRuns(track(EXTENDED), 44, withExt).map((r) => r.cell);
    assert.notDeepEqual(plain, ext, `${name}: the extended array draws the same cells`);
  }
  // The tracks the wave did not touch must be identical either way, so a stray
  // option cannot quietly re-time a beat nobody meant to change.
  for (const [name, track, span] of UNTOUCHED_TRACKS) {
    assert.deepEqual(beatKeyRuns(track(EXTENDED), span, withExt),
      beatKeyRuns(track(undefined), span, noExt),
      `${name}: this beat is not part of the ext wave and must not have moved`);
  }
  // The walk is the beat with a genuinely separate code path, so it is checked
  // by descriptor identity rather than by resolution.
  for (const id of NO_EXT) {
    const roles = baseCellRoles(id);
    for (const t of [0, 0.07, 0.31, 1.24, 9.81, -0.4]) {
      assert.deepEqual(walkCyclePose(t, roles, { extended: false }), walkCyclePose(t, roles),
        `${id}: a fighter with no ext sheet must walk the 3.5 four-key cycle byte-for-byte`);
    }
  }
}

// ---------------------------------------------------------------------------
// X-D — the six-key alternating walk.
// ---------------------------------------------------------------------------
function testSixKeyWalk() {
  assert.equal(UNIFIED_EXT_WALK_KEYS.length, UNIFIED_EXT_WALK_KEY_COUNT);
  // The cycle the manifest's integration order names: 1 -> 17 -> 2 -> 3 -> 18 -> 4.
  const grammar = UNIFIED_EXT_WALK_KEYS.map((k) => (k.ext ? unifiedExtCell(k.cell) : k.cell));
  assert.deepEqual(grammar, [1, 17, 2, 3, 18, 4],
    "the six-key cycle must be the order the sheet was drawn in");
  assert.match(manifest.format.extIntegrationOrder, /1 -> 17 -> 2 -> 3 -> 18 -> 4/);
  // The two in-betweens are the only new drawings; the other four are the 3.0
  // walk keys in their original order, so the stride is extended, not replaced.
  assert.deepEqual(grammar.filter((c) => c < UNIFIED_CELL_COUNT), [...UNIFIED_WALK_KEYS]);

  // THE CADENCE. Six keys at 15/s and four at 10/s are both a 0.4s gait cycle.
  // If this drifts the legs and the ground disagree and the fighter skates —
  // the exact fault the 3.5 stride clock exists to prevent.
  const period = WALK_CELL_COUNT / 10;
  assert.equal(UNIFIED_EXT_WALK_KEY_COUNT / UNIFIED_EXT_WALK_RATE, period,
    "the six-key cycle must take the same time per stride as the four-key one");
  for (const t of [0, 0.13, 1.7, 12.4]) {
    assert.equal(walkCycleFrameExt(t), walkCycleFrameExt(t + period),
      "one gait period must return the cycle to the same key");
    assert.equal(walkCycleFrame(t), walkCycleFrame(t + period));
  }
  // Every key is visited, and in order.
  const seen = [];
  for (let i = 0; i < UNIFIED_EXT_WALK_KEY_COUNT; i += 1) {
    seen.push(walkCycleFrameExt(i / UNIFIED_EXT_WALK_RATE + 1e-6));
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5]);

  // THE REVERSAL. strideClockAdvance signs the clock by vx * facing, so a
  // retreat winds it back and must play the identical six keys in reverse.
  const forward = [];
  const backward = [];
  for (let i = 0; i < 12; i += 1) {
    forward.push(walkCycleFrameExt(i / UNIFIED_EXT_WALK_RATE + 1e-6));
    backward.push(walkCycleFrameExt(-i / UNIFIED_EXT_WALK_RATE - 1e-6));
  }
  assert.deepEqual(backward.slice(0, 6), [5, 4, 3, 2, 1, 0],
    "a retreat must un-step through the new in-betweens, not skip them");
  assert.deepEqual(new Set(forward), new Set(backward));

  // Descriptors: the two new keys ride the ext bank, the other four the main
  // sheet, and every one of them degrades through the 3.5 read to a base cell.
  for (const id of EXT) {
    const roles = baseCellRoles(id);
    const banks = new Set();
    for (let i = 0; i < UNIFIED_EXT_WALK_KEY_COUNT; i += 1) {
      const pose = walkCyclePose(i / UNIFIED_EXT_WALK_RATE + 1e-6, roles, EXTENDED);
      banks.add(pose.bank);
      let link = pose;
      const chain = [];
      while (link) { chain.push(link.bank); link = link.fallback; }
      assert.equal(chain[chain.length - 1], "base",
        `${id}: walk key ${i} must degrade all the way to a base cell`);
      assert.ok(chain.includes(UNIFIED_BANK),
        `${id}: walk key ${i} must keep the unified read under it`);
    }
    assert.deepEqual([...banks].sort(), [UNIFIED_BANK, UNIFIED_EXT_BANK],
      `${id}: the cycle must draw from both halves of the one generation`);
  }
  // Pure function of snapshotted sim state — no latch, no Math.random.
  const roles = baseCellRoles("jez");
  for (const t of [0, 0.37, 1.24, 9.81, -2.5]) {
    assert.deepEqual(walkCyclePose(t, roles, EXTENDED), walkCyclePose(t, roles, EXTENDED));
  }
  // game.js must select the cycle from the ONE capability gate.
  assert.match(gameSource, /const ext = unifiedFighterExtReady\(fighter\.def\.id\);/);
  assert.match(gameSource, /walkCyclePose\(fighter\.strideTime, roles, \{ extended: ext \}\)/);
}

// ---------------------------------------------------------------------------
// X-E — routing: six cells spent, one retired.
// ---------------------------------------------------------------------------
function testRouting() {
  assert.deepEqual([...UNIFIED_EXT_ROUTED_CELLS, ...UNIFIED_EXT_RETIRED_CELLS].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
    "every ext cell is either routed or explicitly retired — no cell may be forgotten");
  assert.deepEqual([...UNIFIED_EXT_RETIRED_CELLS], [UNIFIED_EXT_CELLS.jumpDescend],
    "cell 20 is the only retired ext cell: the drawing came back as a hit reaction");

  // Every ROUTED cell is genuinely reachable from the engine or the renderer.
  const reachable = new Set();
  for (const [, track] of EXT_AWARE_TRACKS) {
    for (const key of track(EXTENDED)) {
      for (const link of key.chain || []) {
        if (link.bank === UNIFIED_EXT_BANK) reachable.add(link.cell);
      }
    }
  }
  for (const key of walkKeysOf()) reachable.add(key);
  // The breathing idle is routed in game.js rather than through a key track.
  assert.match(gameSource, /unifiedExtPose\(UNIFIED_EXT_CELLS\.idleBreathe,/,
    "the breathing idle must route the ext idle cell");
  reachable.add(UNIFIED_EXT_CELLS.idleBreathe);
  for (const cell of UNIFIED_EXT_ROUTED_CELLS) {
    assert.ok(reachable.has(cell),
      `ext cell ${unifiedExtCell(cell)} is listed as routed but no beat can reach it`);
  }
  // ...and the retired one is reachable from NOTHING.
  for (const cell of UNIFIED_EXT_RETIRED_CELLS) {
    assert.ok(!reachable.has(cell),
      `ext cell ${unifiedExtCell(cell)} is retired but a track still keys it`);
    assert.ok(!kitSource.includes(`xkey(UNIFIED_EXT_CELLS.jumpDescend)`),
      "engine/fighter-kits.mjs still keys the retired descent into a track");
    assert.ok(!gameSource.includes("UNIFIED_EXT_CELLS.jumpDescend"),
      "game.js still routes the retired descent");
  }
  // The reason is recorded beside the art, so a future wave knows the cell was
  // DRAWN AND REFUSED rather than overlooked.
  for (const id of EXT) {
    assert.match(manifest.fighters[id].extCells[UNIFIED_EXT_CELLS.jumpDescend].note,
      /RETIRED FROM ROUTING/,
      `${id}: the retired descent must carry its reason in the manifest`);
  }

  // The reaction ladders keep the M5 distinctness contract with the new rung.
  for (const heavy of [true, false]) {
    const ladder = unifiedReactionLadder(heavy, EXTENDED);
    assert.equal(ladder.length, REACTION_BANDS.length);
    assert.ok(ladder.includes(unifiedExtCell(UNIFIED_EXT_CELLS.midReaction)),
      "the mid-reaction rung must be on both ladders");
    // Band 3 stays the guard and band 4 still hands to the breathing idle —
    // both are 3.0 decisions the ext rung may not displace.
    assert.equal(ladder[3], UNIFIED_CELLS.guard);
    assert.equal(ladder[4], UNIFIED_CELLS.idle);
    // No cell is ever returned to after the beat leaves it (the M1 rewind).
    const rungs = ladder.slice(0, 4);
    assert.equal(new Set(rungs).size, rungs.length, "a reaction ladder may not repeat a rung");
  }
  // The rung dispatches to the right bank, or a grammar number would address
  // row 5 of a four-row sheet.
  const mid = unifiedExtCell(UNIFIED_EXT_CELLS.midReaction);
  assert.equal(unifiedRungPose(mid, null).bank, UNIFIED_EXT_BANK);
  assert.equal(unifiedRungPose(mid, null).frame, UNIFIED_EXT_CELLS.midReaction);
  assert.equal(unifiedRungPose(UNIFIED_CELLS.guard, null).bank, UNIFIED_BANK);
  assert.equal(unifiedRungPose(UNIFIED_CELLS.guard, null).frame, UNIFIED_CELLS.guard);

  // The jump owns the ASCENT and stops: cell 19 in, cell 20 and the tuck out.
  const arc = jumpArcKeys(0.22, EXTENDED).flatMap((k) => k.chain);
  assert.ok(arc.some((l) => l.bank === UNIFIED_EXT_BANK && l.cell === UNIFIED_EXT_CELLS.jumpAscent));
  assert.ok(arc.some((l) => l.bank === UNIFIED_BANK && l.cell === UNIFIED_CELLS.jumpRise),
    "the ascent is only a connected region if the rise comes with it");
  assert.ok(!arc.some((l) => l.bank === UNIFIED_BANK && l.cell === UNIFIED_CELLS.jumpTuck),
    "the tuck stays retired — with no usable descent after it it hands to motion in mid-air");
}

function walkKeysOf() {
  return UNIFIED_EXT_WALK_KEYS.filter((k) => k.ext).map((k) => k.cell);
}

// ---------------------------------------------------------------------------
// X-F — the hold budget.
// ---------------------------------------------------------------------------
function testHoldBudget() {
  for (const [name, track, span] of EXT_AWARE_TRACKS) {
    const before = beatKeyRuns(track(undefined), span, noExt);
    const after = beatKeyRuns(track(EXTENDED), span, withExt);
    const worstBefore = before.reduce((m, r) => Math.max(m, r.ticks), 0);
    const worstAfter = after.reduce((m, r) => Math.max(m, r.ticks), 0);
    assert.ok(worstAfter <= worstBefore,
      `${name}: gaining an ext sheet LENGTHENED the worst hold ${worstBefore} -> ${worstAfter} `
      + `(${after.map((r) => `${r.cell}x${r.ticks}`).join(" ")})`);
    assert.ok(after.length >= before.length,
      `${name}: gaining an ext sheet collapsed a band ${before.length} -> ${after.length} runs`);
    // Every band must draw something, and the beat must genuinely change.
    assert.ok(new Set(after.map((r) => r.cell)).size >= 2, `${name}: the beat draws one cell`);
  }
  // The jump is the beat the budget has always documented as the gap. The ext
  // sheet splits its longest hold — the ascent — in half.
  const before = beatKeyRuns(jumpArcKeys(0.22), 46, noExt);
  const after = beatKeyRuns(jumpArcKeys(0.22, EXTENDED), 46, withExt);
  assert.ok(after.length === before.length + 1,
    "the ext jump must add exactly one drawing to the arc");
  assert.ok(after[0].ticks <= Math.ceil(before[0].ticks / 2) + 1,
    `the ascent hold must halve: ${before[0].ticks} -> ${after[0].ticks}`);
  // The two chambers are inside budget on the longest windup on the roster.
  for (const limb of ["punch", "kick"]) {
    const runs = beatKeyRuns(heavyWindupKeys(limb, EXTENDED), 17, withExt);
    assert.equal(runs[0].cell, `unified-ext:${limb === "kick"
      ? UNIFIED_EXT_CELLS.kickWindup : UNIFIED_EXT_CELLS.punchWindup}`,
      `${limb}: the windup must OPEN on the fighter's own chamber`);
    assert.ok(runs[0].ticks <= MOTION_HOLD_BUDGET,
      `${limb} chamber holds ${runs[0].ticks} ticks`);
  }
}

// ---------------------------------------------------------------------------
// X-G — cyraxx.
// ---------------------------------------------------------------------------
function testCyraxx() {
  assert.ok(WHOLE.includes("cyraxx"), "cyraxx is on the unified bank as of 4.0");
  assert.ok(EXT.includes("cyraxx"), "cyraxx carries a 24-cell sheet");
  const entry = manifest.fighters.cyraxx;
  assert.equal(entry.cells.every((c) => c.accept), true);
  for (const frame of UNIFIED_EXT_ROUTED_CELLS) {
    assert.equal(entry.extCells[frame].accept, true, `cyraxx: ext frame ${frame}`);
  }
  // Sliced from the ARCHIVED winning generation, not regenerated: the scale is
  // the archived measured value and the manifest must say so, or a future wave
  // cannot reproduce the sheet.
  assert.equal(entry.scale, 1.4712);
  assert.equal(entry.targetH, 306);
  assert.match(entry.note, /1\.4712/);
  assert.match(entry.note, /raw-cyraxx-g3\.png/);
  for (const sheet of [entry.sheet, entry.extSheet]) {
    assert.ok(statSync(join(assetDir, sheet)).size > 100000, `${sheet} is missing or truncated`);
  }
  // He is measured into every table a whole fighter needs.
  assert.equal(UNIFIED_CELL_HEIGHT.cyraxx.length, UNIFIED_CELL_COUNT);
  assert.equal(UNIFIED_EXT_CELL_HEIGHT.cyraxx.length, UNIFIED_EXT_CELL_COUNT);
  assert.equal(CELL_BODY_CENTRE.cyraxx[UNIFIED_EXT_BANK].length, UNIFIED_EXT_CELL_COUNT);
  // The manifest's own history must not still claim he has no art.
  assert.ok(!/NO SHEET IN THE REPO, on purpose/.test(manifest.format.cyraxxNote),
    "the manifest still claims cyraxx has no sheet");
}

// ---------------------------------------------------------------------------
// X-H — registration, and the padding both renderers depend on.
// ---------------------------------------------------------------------------
function testRegistration() {
  assert.deepEqual(AUTHORED_BANKS.slice(-1), [UNIFIED_EXT_BANK]);
  for (const id of EXT) {
    // ON-SCREEN height: content x per-cell adjust x sheet adjust, both sides,
    // or the Commissioner's folded sheet correction reads as a pop that isn't
    // one. This is the number a player actually sees.
    const screenH = (bank, frame, raw) => raw * cellDrawAdjust(id, bank, frame) * sheetAdjust(id, bank);
    const idle = screenH(UNIFIED_BANK, UNIFIED_CELLS.idle,
      UNIFIED_CELL_HEIGHT[id][UNIFIED_CELLS.idle]);
    // The two walk in-betweens are the other half of the same upright cycle, so
    // they take the same idle-anchored correction cells 1-4 do.
    for (const frame of [UNIFIED_EXT_CELLS.walkDownA, UNIFIED_EXT_CELLS.walkDownB]) {
      const drawn = screenH(UNIFIED_EXT_BANK, frame, UNIFIED_EXT_CELL_HEIGHT[id][frame]);
      assert.ok(Math.abs(drawn / idle - 1) <= 0.035,
        `${id}: ext walk key ${unifiedExtCell(frame)} draws ${drawn.toFixed(1)}px against an `
        + `idle of ${idle.toFixed(1)}px — that is the B1 pop, on the new drawings`);
    }
    // The breathing idle IS the idle: same drawing one breath later, so it must
    // come out the same size or the stance pulses every 8 ticks.
    const breathe = screenH(UNIFIED_EXT_BANK, UNIFIED_EXT_CELLS.idleBreathe,
      UNIFIED_EXT_CELL_HEIGHT[id][UNIFIED_EXT_CELLS.idleBreathe]);
    assert.ok(Math.abs(breathe / idle - 1) <= 0.02,
      `${id}: the breathing idle draws ${breathe.toFixed(1)}px against an idle of `
      + `${idle.toFixed(1)}px — the stance would change size on every breath`);

    // THE TWO SHEETS MUST DRAW AT ONE SIZE. The ext sheet is the same
    // generation at the same global scale, so a cell that depicts the same
    // content height must come out the same size on screen — otherwise the
    // idle PULSES every 8 ticks as it alternates 0 <-> 16 and the walk pulses
    // twice per stride. The Commissioner is the only fighter with a
    // UNIFIED_SHEET_ADJUST, and CINEMA 3D's sheet-adjust chain has no ext
    // branch, so his correction is folded into the per-cell table that BOTH
    // renderers read. This asserts the RESULT, not where it is stored.
    const mainScale = sheetAdjust(id, UNIFIED_BANK)
      * cellDrawAdjust(id, UNIFIED_BANK, UNIFIED_CELLS.idle);
    const extScale = sheetAdjust(id, UNIFIED_EXT_BANK)
      * cellDrawAdjust(id, UNIFIED_EXT_BANK, UNIFIED_EXT_CELLS.idleBreathe);
    assert.ok(Math.abs(extScale / mainScale - 1) <= 0.001,
      `${id}: the idle draws at ${mainScale.toFixed(4)} and the breathing idle at `
      + `${extScale.toFixed(4)} — the stance would change SIZE on every breath`);

    // AIRBORNE ANCHORING. The ascent is routed and draws in the air, so an
    // unmeasured row would put the B2 body-drop back into the jump.
    const centres = CELL_BODY_CENTRE[id][UNIFIED_EXT_BANK];
    assert.equal(centres.length, UNIFIED_EXT_CELL_COUNT);
    for (const value of centres) assert.ok(Number.isFinite(value) && value > 100 && value < 300);
    const offset = airborneAnchorOffset(id, UNIFIED_EXT_BANK, UNIFIED_EXT_CELLS.jumpAscent);
    assert.ok(Number.isFinite(offset) && Math.abs(offset) < 120,
      `${id}: implausible airborne anchor ${offset} on the ext ascent`);
    // The ascent is a RISING figure, so it must not sit lower in its cell than
    // the rise it follows — that would drop the body mid-climb.
    assert.ok(offset >= airborneAnchorOffset(id, UNIFIED_BANK, UNIFIED_CELLS.jumpTuck),
      `${id}: the ext ascent must sit higher than the apex tuck`);
  }
  for (const id of NO_EXT) {
    assert.equal(CELL_BODY_CENTRE[id][UNIFIED_EXT_BANK], undefined,
      `${id}: has no ext sheet and must have no ext registration row`);
    for (let frame = 0; frame < UNIFIED_EXT_CELL_COUNT; frame += 1) {
      assert.equal(cellDrawAdjust(id, UNIFIED_EXT_BANK, frame), 1);
    }
  }

  // THE PADDING. The ext sheets ship 1280x640, and CINEMA 3D's applyAtlasFrame
  // builds its UVs from a hardcoded four-row grid — so an unpadded sheet would
  // make the two renderers disagree about what a frame IS. game.js pads once,
  // lazily, into the 1280 square every other bank already ships.
  // The mirror above must match the real table, and the ext bank must still
  // have NO sheet-level branch — one there would multiply with the fold.
  assert.match(gameSource, /const UNIFIED_SHEET_ADJUST = Object\.freeze\(\{ commissioner: 1\.033 \}\);/,
    "the sheet-adjust mirror in this test has drifted from game.js");
  const bankAdjustFn = gameSource.slice(gameSource.indexOf("function bankSheetAdjust"));
  assert.ok(!/bank === UNIFIED_EXT_BANK/.test(bankAdjustFn.slice(0, 1400)),
    "bankSheetAdjust must not gain an ext branch — it would multiply with the "
    + "correction folded into UNIFIED_EXT_CELL_ADJUST for the 3D renderer's sake");

  assert.match(gameSource, /const UNIFIED_SHEET_PX = 1280;/);
  assert.match(gameSource, /padded\.width = UNIFIED_SHEET_PX;\s*\n\s*padded\.height = UNIFIED_SHEET_PX;/,
    "the ext sheet must be padded square before any consumer sees it");
  // Image-interface shim, or every downstream readiness guard rejects it.
  for (const field of ["padded.src", "padded.complete", "padded.naturalWidth", "padded.naturalHeight"]) {
    assert.ok(gameSource.includes(field), `the padded ext atlas must shim ${field}`);
  }
  // Warmed through the ONE preload choke point, behind the manifest gate, so a
  // fighter with no ext block never requests a sheet that is not there.
  const preloadStart = gameSource.indexOf("function preloadAuthoredBanks");
  const preload = gameSource.slice(preloadStart, gameSource.indexOf("\nfunction ", preloadStart + 1));
  assert.ok(preload.includes("unifiedFighterExtWhole(id)"),
    "the ext sheet must be warmed behind the manifest gate inside preloadAuthoredBanks");
  // Registered in both palette paths, or an alt-palette side draws the primary.
  assert.ok(gameSource.includes(`${"`"}\${fighterId}:unified-ext${"`"}`),
    "the ext atlas needs its own alt-palette cache key");
}

test("X-A the ext manifest is the 8-cell grammar the routing addresses", testManifestShape);
test("X-B an ext sheet is ALL EIGHT cells or none, and needs a whole main sheet", testAllOrNothing);
test("X-C the five fighters without an ext sheet render exactly what 3.5 rendered", testHoldoutsUnchanged);
test("X-D the walk is a six-key alternating cycle at the 3.5 gait period, reversible", testSixKeyWalk);
test("X-E six ext cells are routed on the beat they were drawn for, one is retired", testRouting);
test("X-F gaining an ext sheet lengthens no hold and collapses no band", testHoldBudget);
test("X-G cyraxx is on the bank for the first time, on both sheets", testCyraxx);
test("X-H the ext cells are registered, anchored and padded for both renderers", testRegistration);
