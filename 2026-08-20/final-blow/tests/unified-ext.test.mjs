// ---------------------------------------------------------------------------
// v4.0 — THE EXT SHEET, THE SIX-KEY WALK, AND cyraxx.
// v4.1 — ali joins on both sheets, and brings the roster's first usable descent.
//
// The 4.0 art wave drew four fighters (and archived a fifth) at TWENTY-FOUR
// cells from one generation instead of sixteen: the 3.0 grammar in <id>.webp
// plus eight more in <id>-ext.webp. This suite covers what wiring them means.
//
//   X-A  THE MANIFEST is the spec, and the two blocks agree with each other.
//   X-B  ALL SEVEN ROUTED CELLS OR NONE, and a fighter must be whole on BOTH
//        sheets. Half an ext sheet is a walk cycle that changes drawing-count
//        halfway round. The eighth cell is per-fighter; see X-E.
//   X-C  THE UN-EXTENDED ARRAYS ARE THE 3.5 READ. Through 5.1 this was the
//        holdout contract — deathblow, post, donald and the devil had no ext
//        block and every re-framed beat handed them the byte-identical 3.5 key
//        array. As of 5.2 the whole roster carries an ext sheet, so the
//        statement is about the OPTION rather than about four fighters: a
//        track called without `extended` must still be the 3.5 array, because
//        that is what a sheet that fails to decode degrades to, and the
//        extended array must genuinely draw differently or the option is
//        decorative.
//   X-D  THE SIX-KEY WALK. The cycle order, the CADENCE (six keys at 15/s is
//        the same 0.4s gait period four keys at 10/s ran at, or the fighter
//        skates), and the reversal a retreat depends on.
//   X-E  ROUTING. Seven ext cells are spent on the beat they were drawn for on
//        every sheet. The eighth, the jump-descend, is routed PER FIGHTER off
//        his own accept flag, because on that cell alone the routing depends on
//        whether the DRAWING is the beat: it came back as a hit reaction on all
//        five 4.0 sheets and as a real descent on ali's 4.1 one.
//   X-F  THE HOLD BUDGET may not get worse for a fighter who gains a sheet.
//   X-G  cyraxx, on the bank for the first time.
//   X-H  REGISTRATION — the height and body-centre tables the ext cells need,
//        and the padding both renderers depend on.
//   X-I  ali, the sixth fighter on the bank, and the per-fighter tables his
//        REPLACED sheet made stale.
//   X-J  v5.2 — deathblow, post, donald and the devil, on ext sheets composed
//        from a two-take second generation (tools/swing/install_ext8.py):
//        the roster is whole on the ext bank, the four sheets are measured
//        into every table, and the descent is a real descent on all four.
// ---------------------------------------------------------------------------
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_BANKS,
  CELL_BODY_CENTRE,
  MOTION2_CELLS,
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
  UNIFIED_EXT_OPTIONAL_CELLS,
  UNIFIED_EXT_ROUTED_CELLS,
  UNIFIED_EXT_WALK_KEYS,
  UNIFIED_EXT_WALK_KEY_COUNT,
  UNIFIED_EXT_WALK_RATE,
  UNIFIED_WALK_KEYS,
  WAKEUP_RISE_HEIGHT,
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
  guardFlinchAdjust,
  heavyWindupKeys,
  isPropActionCell,
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
/** v4.1 — a fighter whose cell 20 is a real descent, so the arc completes. */
const DESCENDING = { extended: true, descend: true };
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
  // The completed arc. Flagged, because it is the ONE track that may key an
  // optional cell — X-E's reachability sweep is over what a fighter WITHOUT
  // that capability can reach, and must not count this one.
  ["jump arc (descending)", (o) => jumpArcKeys(0.22, o && { ...o, descend: true }), 46, true],
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
  assert.deepEqual(EXT, ["alan", "ali", "benny", "commissioner", "cyraxx", "deathblow", "devil", "donald", "jez", "post"],
    "all ten fighters carry an ext sheet as of 5.2");
  assert.deepEqual(NO_EXT, [], "no fighter is off the ext bank — one falling off is a silent 3.5 walk");
  for (const id of EXT) {
    assert.equal(extMasks[id].accept.length, UNIFIED_EXT_CELL_COUNT);
    // Every ROUTED frame is drawable on every sheet.
    for (const frame of UNIFIED_EXT_ROUTED_CELLS) {
      assert.equal(extMasks[id].accept[frame], true, `${id}: routed ext frame ${frame}`);
    }
    // An OPTIONAL frame is drawable EXACTLY when that fighter's own manifest
    // block accepts it — a biconditional, which is strictly stronger than the
    // 4.0 "must be false": it still forbids a rejected descent from drawing
    // (the flinch-in-mid-air the refusal exists to stop), and it now also
    // forbids an accepted one from being silently dropped. The routing refusal
    // stays enforced at the gate as well as in the tracks.
    for (const frame of UNIFIED_EXT_OPTIONAL_CELLS) {
      assert.equal(extMasks[id].accept[frame], manifest.fighters[id].extCells[frame].accept === true,
        `${id}: optional ext frame ${frame} must draw exactly when his own block accepts it`);
    }
    assert.equal(masks[id].whole, true, `${id}: an ext sheet needs a whole main sheet under it`);
  }
  // ...and the split is pinned BY NAME, so a sheet silently losing or gaining a
  // usable descent is a test failure rather than a change in how jumps look.
  const descends = EXT.filter((id) => extMasks[id].accept[UNIFIED_EXT_CELLS.jumpDescend]);
  assert.deepEqual(descends, ["ali", "deathblow", "devil", "donald", "post"],
    "ali (4.1) and the four 5.2 sheets are the fighters whose cell 20 is a real descent — on "
    + "the five 4.0 sheets it drew as a hit reaction and routing it would flinch every jump on the way down");
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
  // ...and the OPTIONAL cell is not gated on, in EITHER direction, or alan and
  // benny would lose their whole sheet over a cell no beat of theirs can reach.
  // This is the load-bearing half and it is unchanged: wholeness must not move.
  for (const accept of [true, false]) {
    const flipped = JSON.parse(JSON.stringify(manifest));
    for (const frame of UNIFIED_EXT_OPTIONAL_CELLS) {
      flipped.fighters.jez.extCells[frame].accept = accept;
      flipped.fighters.ali.extCells[frame].accept = accept;
    }
    const built = buildUnifiedExtAcceptMasks(flipped, masks);
    assert.equal(built.jez.whole, true, "an optional cell may not decide a sheet");
    assert.equal(built.ali.whole, true, "an optional cell may not decide a sheet");
    // What it DOES decide is that one cell's drawability, and only that.
    for (const id of ["jez", "ali"]) {
      assert.equal(built[id].accept[UNIFIED_EXT_CELLS.jumpDescend], accept);
      assert.deepEqual(built[id].accept.filter((_, f) => f !== UNIFIED_EXT_CELLS.jumpDescend),
        extMasks[id].accept.filter((_, f) => f !== UNIFIED_EXT_CELLS.jumpDescend),
        `${id}: the optional cell must not disturb any other frame`);
    }
  }
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
  // A fighter going whole must light all eight with no code change — and one
  // whose block is removed must go dark the same way (what the four 5.2
  // fighters were until this wave, and what a missing manifest block means).
  const healed = JSON.parse(JSON.stringify(manifest));
  delete healed.fighters.post.extSheet;
  delete healed.fighters.post.extCells;
  assert.equal(buildUnifiedExtAcceptMasks(healed, masks).post.whole, false);
  healed.fighters.post.extSheet = "post-ext.webp";
  healed.fighters.post.extCells = manifest.fighters.jez.extCells.map((c) => ({ ...c }));
  assert.equal(buildUnifiedExtAcceptMasks(healed, masks).post.whole, true);
}

// ---------------------------------------------------------------------------
// X-C — THE UN-EXTENDED ARRAYS ARE THE 3.5 READ. (Through 5.1: "the five
// holdouts render exactly what 3.5 rendered". The roster is whole on the ext
// bank now, so this is the contract of the OPTION — the arrays a fighter
// takes while his sheet is not yet decoded, or after it fails to.)
// ---------------------------------------------------------------------------
function testUnextendedArraysAre35() {
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
  // THE DESCEND FLAG IS INERT WITHOUT A SHEET. `descend` rides the same options
  // object as `extended`, so a leaked flag on a fighter with no ext sheet must
  // change NOTHING — otherwise a holdout could take the completed arc, whose
  // cells he cannot draw, and fall through to a differently-shaped chain.
  for (const bandStart of [0.22, 0.06]) {
    assert.deepEqual(jumpArcKeys(bandStart, { descend: true }), jumpArcKeys(bandStart),
      "descend without extended must be the byte-identical 3.5 arc");
    assert.deepEqual(jumpArcKeys(bandStart, { extended: false, descend: true }),
      jumpArcKeys(bandStart), "descend may never engage without an ext sheet under it");
  }
  // The walk is the beat with a genuinely separate code path, so it is checked
  // by descriptor identity rather than by resolution — for every fighter,
  // since every one of them takes this branch until his sheet has decoded.
  for (const id of ROSTER) {
    const roles = baseCellRoles(id);
    const times = [0, 0.07, 0.31, 1.24, 9.81, -0.4];
    for (const t of times) {
      assert.deepEqual(walkCyclePose(t, roles, { extended: false }), walkCyclePose(t, roles),
        `${id}: without the ext capability the walk must be the 3.5 four-key cycle byte-for-byte`);
    }
    // ...and the extended cycle is a genuinely different cycle (the contact
    // keys coincide at t = 0; the in-betweens and the cadence do not).
    assert.ok(times.some((t) => JSON.stringify(walkCyclePose(t, roles, EXTENDED)) !== JSON.stringify(walkCyclePose(t, roles))),
      `${id}: the extended walk must be a different cycle`);
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
  assert.deepEqual([...UNIFIED_EXT_ROUTED_CELLS, ...UNIFIED_EXT_OPTIONAL_CELLS].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
    "every ext cell is either routed for everyone or explicitly per-fighter — no cell "
    + "may be forgotten");
  assert.deepEqual([...UNIFIED_EXT_OPTIONAL_CELLS], [UNIFIED_EXT_CELLS.jumpDescend],
    "cell 20 is the only per-fighter ext cell: it is the one whose routing depends on "
    + "whether the DRAWING is the beat rather than on where it sits in a chain");
  // The two lists may not overlap, or a cell would be both unconditional and
  // conditional and the mask's union would hide the contradiction.
  for (const frame of UNIFIED_EXT_OPTIONAL_CELLS) {
    assert.ok(!UNIFIED_EXT_ROUTED_CELLS.includes(frame),
      `ext frame ${frame} is in both routing lists`);
  }

  // Every ROUTED cell is genuinely reachable from the engine or the renderer,
  // by a fighter who has ONLY the plain ext capability.
  const reachable = new Set();
  for (const [, track, , descending] of EXT_AWARE_TRACKS) {
    if (descending) continue;
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
  // ...and the OPTIONAL one is reachable from nothing a fighter without the
  // capability can call. This keeps the 4.0 refusal at full strength — the five
  // holdouts must be unable to reach cell 20 by ANY path — while letting the one
  // fighter whose drawing is a real descent have it. The `extended` arrays are
  // stripped before the source check for exactly the reason unified-bank.test
  // strips them around the retired jump-rise: "retired" has always meant "not in
  // the arrays that ship for a fighter who cannot draw it".
  for (const cell of UNIFIED_EXT_OPTIONAL_CELLS) {
    assert.ok(!reachable.has(cell),
      `ext cell ${unifiedExtCell(cell)} is optional but the plain extended track keys it`);
  }
  const shippingKitSource = kitSource.replace(/if \((?:extended|air)[^)]*\) \{[\s\S]*?\n  \}\n/g, "");
  assert.ok(!shippingKitSource.includes("xkey(UNIFIED_EXT_CELLS.jumpDescend)"),
    "engine/fighter-kits.mjs keys the descent OUTSIDE an extended branch — a fighter "
    + "whose cell 20 is a hit reaction would flinch on the way down");
  // game.js may only reach it through the ONE capability gate, never directly.
  const descendMentions = gameSource.match(/UNIFIED_EXT_CELLS\.jumpDescend/g) || [];
  assert.equal(descendMentions.length, 1,
    "game.js must name the descent exactly once — inside unifiedFighterExtDescendReady");
  assert.match(gameSource,
    /function unifiedFighterExtDescendReady\(fighterId\) \{\s*\n\s*return unifiedExtCellDrawable\(fighterId, UNIFIED_EXT_CELLS\.jumpDescend\);/,
    "the descent capability must be the same mask read every other ext cell takes");
  assert.match(gameSource, /unifiedFighterExtDescendReady\(fighter\.def\.id\)\s*\n\s*\? \(air \? EXTENDED_DESCEND_AIR : EXTENDED_DESCEND\)\s*\n\s*: \(air \? EXTENDED_AIR : EXTENDED\)\)/,
    "the jump arc must select the descend arc from that one capability answer (v5.2: with the `air` answer riding the same object)");

  // Every fighter's cell 20 carries its verdict beside the art, so a future wave
  // knows the cell was DRAWN AND JUDGED rather than overlooked — refused on the
  // five, and routed on the one whose drawing is the beat.
  for (const id of EXT) {
    const note = manifest.fighters[id].extCells[UNIFIED_EXT_CELLS.jumpDescend].note;
    const routed = extMasks[id].accept[UNIFIED_EXT_CELLS.jumpDescend];
    assert.match(note, routed ? /ROUTED/ : /RETIRED FROM ROUTING/,
      `${id}: the descent must carry its routing verdict in the manifest`);
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

  // WITHOUT a usable descent the jump owns the ASCENT and stops: cell 19 in,
  // cell 20 and the tuck out. Unchanged from 4.0 and it must stay that way —
  // this is the arc five of the six fighters still play.
  const arc = jumpArcKeys(0.22, EXTENDED).flatMap((k) => k.chain);
  assert.ok(arc.some((l) => l.bank === UNIFIED_EXT_BANK && l.cell === UNIFIED_EXT_CELLS.jumpAscent));
  assert.ok(arc.some((l) => l.bank === UNIFIED_BANK && l.cell === UNIFIED_CELLS.jumpRise),
    "the ascent is only a connected region if the rise comes with it");
  assert.ok(!arc.some((l) => l.bank === UNIFIED_BANK && l.cell === UNIFIED_CELLS.jumpTuck),
    "the tuck stays retired — with no usable descent after it it hands to motion in mid-air");
  assert.ok(!arc.some((l) => l.bank === UNIFIED_EXT_BANK && l.cell === UNIFIED_EXT_CELLS.jumpDescend),
    "the plain extended arc must never key a descent that drew as a hit reaction");

  // WITH one, the arc owns the WHOLE airborne chain 8 -> 19 -> 9 -> 20: four
  // consecutive drawings from one generation, which is the "whole airborne
  // chain" routingNote kept cells 8 and 9 on the sheet waiting for. The tuck
  // comes in ONLY here — its retirement was always conditional on there being
  // nothing usable after it.
  const full = jumpArcKeys(0.22, DESCENDING);
  const own = full.flatMap((k) => k.chain)
    .filter((l) => l.bank === UNIFIED_BANK || l.bank === UNIFIED_EXT_BANK)
    .map((l) => (l.bank === UNIFIED_EXT_BANK ? unifiedExtCell(l.cell) : l.cell));
  assert.deepEqual(own, [8, 19, 9, 20],
    "the descend arc must be the integration order's chain, in order and with no gaps");
  // ...and it may not reorder or drop anything BELOW the fall: from the descent
  // down it is the 3.0 arc, which is what keeps the crossing count at one.
  const tail = (keys) => keys.flatMap((k) => k.chain)
    .filter((l) => l.bank !== UNIFIED_BANK && l.bank !== UNIFIED_EXT_BANK)
    .map((l) => `${l.bank}:${l.cell ?? l.key}`);
  assert.deepEqual(tail(full), tail(jumpArcKeys(0.22, EXTENDED)),
    "the descend arc must hand back to the SAME motion-family cells the 4.0 arc uses, "
    + "or the fall degrades to a different shape of arc when a sheet is missing");
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
  // v4.1: the COMPLETED arc must buy the same split and spend it on more of the
  // fighter's own drawings, not on a longer hold somewhere else. It replaces two
  // motion-family airborne cells with two of his own, so the drawing count is
  // unchanged against the 4.0 arc and every band stays inside the budget.
  const done = beatKeyRuns(jumpArcKeys(0.22, DESCENDING), 46, withExt);
  assert.equal(done.length, after.length,
    "the completed arc must draw as many times as the 4.0 one — it substitutes, not pads");
  assert.ok(done[0].ticks <= Math.ceil(before[0].ticks / 2) + 1,
    `the ascent hold must still halve: ${before[0].ticks} -> ${done[0].ticks}`);
  for (const run of done) {
    assert.ok(run.ticks <= Math.max(...before.map((r) => r.ticks)),
      `completing the arc lengthened a hold: ${run.cell}x${run.ticks}`);
  }
  // The four airborne drawings it owns must be HIS, consecutive, and in order —
  // this is the "connected region" RULE 2 asks for, asserted on what actually
  // draws rather than on the descriptor list.
  const ownRuns = done.map((r) => r.cell)
    .filter((c) => c.startsWith("unified:") || c.startsWith("unified-ext:"));
  assert.deepEqual(ownRuns, ["unified:8", "unified-ext:3", "unified:9", "unified-ext:4"],
    "the completed arc must play 8 -> 19 -> 9 -> 20 with nothing cutting into it");
  assert.deepEqual(done.slice(0, 4).map((r) => r.cell), ownRuns,
    "his four drawings must be the FIRST four runs — a motion cell inside them is a "
    + "generation crossing in mid-air, which is what the 3.0 critic round removed");
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
// X-I — ali, the sixth fighter on the ext bank, and the tables his redraw made
// stale. His 3.0 sheet was REPLACED, not supplemented, so every per-fighter
// number fitted to the old art is a live defect until it is re-measured — the
// trap MOTION-ATLAS records the 3.1 wave falling into with four fighters at
// once. These are the measured values, and they are asserted here so a future
// wave that swaps his sheet again cannot quietly leave them behind.
// ---------------------------------------------------------------------------
function testAli() {
  assert.ok(WHOLE.includes("ali"), "ali is on the unified bank");
  assert.ok(EXT.includes("ali"), "ali carries a 24-cell sheet as of 4.1");
  const entry = manifest.fighters.ali;
  assert.equal(entry.cells.every((c) => c.accept), true);
  for (const frame of UNIFIED_EXT_ROUTED_CELLS) {
    assert.equal(entry.extCells[frame].accept, true, `ali: ext frame ${frame}`);
  }
  // The pending-key hold is discharged. Naming them anything else parks the
  // sheet at the loader again, silently — the mask simply reports not-whole.
  assert.equal(entry.extSheet, "ali-ext.webp");
  assert.equal(entry.extCellsPending, undefined, "the 4.0 hold key is still in the manifest");
  assert.equal(entry.extSheetPending, undefined, "the 4.0 hold key is still in the manifest");
  for (const sheet of [entry.sheet, entry.extSheet]) {
    assert.ok(statSync(join(assetDir, sheet)).size > 100000, `${sheet} is missing or truncated`);
  }

  // THE RE-MEASURED TABLES. Every value below was measured on the sheet in the
  // repo with the method validated by reproducing the UNTOUCHED fighters'
  // recorded rows exactly, so these are facts about the art rather than
  // preferences — if the art changes they must change with it.
  assert.deepEqual([...UNIFIED_CELL_HEIGHT.ali],
    [299, 306, 306, 300, 305, 207, 266, 292, 296, 178, 282, 276, 290, 274, 225, 70]);
  assert.deepEqual([...UNIFIED_EXT_CELL_HEIGHT.ali], [297, 300, 296, 264, 302, 292, 302, 269]);
  assert.deepEqual([...CELL_BODY_CENTRE.ali[UNIFIED_BANK]],
    [165, 162, 162, 164, 162, 211, 182, 168, 166, 226, 174, 176, 170, 178, 202, 280]);
  assert.deepEqual([...CELL_BODY_CENTRE.ali[UNIFIED_EXT_BANK]],
    [166, 164, 166, 182, 164, 168, 164, 180]);
  // The 3.0 row is GONE, and cell 8 is the one that mattered: it is the
  // jump-rise the airborne anchor reads, it drifted 35 rows, and 4.1 routes it.
  assert.notEqual(CELL_BODY_CENTRE.ali[UNIFIED_BANK][UNIFIED_CELLS.jumpRise], 192,
    "ali still carries the 3.0 body-centre for his jump-rise — 35 rows stale");
  assert.notEqual(CELL_BODY_CENTRE.ali[UNIFIED_BANK][UNIFIED_CELLS.jumpTuck], 234,
    "ali still carries the 3.0 body-centre for his jump-tuck — 16 rows stale");
  // The height tables and the draw adjust must agree about his own idle, or the
  // B1 pop is back on the fighter whose sheet just changed under it.
  const idle = UNIFIED_CELL_HEIGHT.ali[UNIFIED_CELLS.idle];
  assert.equal(WAKEUP_RISE_HEIGHT.ali.standUnified, idle);
  assert.equal(WAKEUP_RISE_HEIGHT.ali.cells["unified:5"], UNIFIED_CELL_HEIGHT.ali[UNIFIED_CELLS.crouch]);
  // v5.0: his guard measures 292 on the redrawn sheet against a 259px block-hit.
  assert.equal(guardFlinchAdjust("ali", "motion2", MOTION2_CELLS.blockHit, { unified: true }), 1.127);

  // THE MICROPHONE. His prop is in his near fist in all 24 cells and it is the
  // anchor the whole 4.1 walk technique hangs on — the model swaps the mic
  // between hands where it refuses to swap a leg, so a cell that loses it loses
  // the phase reversal too. The bank-wide prohibition still applies: no cell of
  // this sheet may be treated as a prop-ACTION cell.
  for (let frame = 0; frame < UNIFIED_EXT_CELL_COUNT; frame += 1) {
    assert.equal(isPropActionCell("ali", UNIFIED_EXT_BANK, frame), false,
      `ali: ext cell ${unifiedExtCell(frame)} must not be a prop-action cell`);
  }
}

// ---------------------------------------------------------------------------
// X-J — v5.2: THE FOUR HOLDOUTS, ON EXT SHEETS OF THEIR OWN. The art is a
// two-take second generation (grammar-ext8: rows 0-1 take A of the eight ext
// poses, rows 2-3 take B, image-to-image from the fighter's unified sheet);
// tools/swing/install_ext8.py picked one take per cell by height and set each
// sheet's scale so its breathing idle lands ON the unified idle — the premise
// X-H's "two sheets draw at one size" contract rests on, which a second
// generation does not carry by itself (post's drew him 8.6% taller, the
// devil's 4.6% shorter). The rows below were measured on the composed sheets
// in the repo (alpha >= 24; bbox midpoints), so they are facts about the art,
// and a future sheet swap must re-measure them or fail here.
// ---------------------------------------------------------------------------
const EXT8 = Object.freeze({
  deathblow: { heights: [273, 290, 290, 283, 285, 274, 277, 281], centres: [178, 170, 170, 173, 172, 178, 176, 174], adjust: { 1: 0.938, 2: 0.938 }, extScale: 1.2839 },
  post: { heights: [280, 274, 273, 288, 274, 265, 282, 269], centres: [176, 178, 179, 172, 178, 183, 174, 181], adjust: {}, extScale: 1.2523 },
  donald: { heights: [261, 261, 256, 243, 261, 254, 257, 256], centres: [184, 184, 186, 193, 184, 188, 186, 186], adjust: {}, extScale: 1.2202 },
  devil: { heights: [283, 277, 278, 302, 270, 279, 285, 281], centres: [173, 176, 176, 164, 180, 175, 172, 174], adjust: { 1: 1.0056 }, extScale: 1.4383 },
});

function testExt8Fighters() {
  for (const [id, pinned] of Object.entries(EXT8)) {
    assert.ok(EXT.includes(id), `${id} carries an ext sheet as of 5.2`);
    const entry = manifest.fighters[id];
    assert.equal(entry.extSheet, `${id}-ext.webp`);
    assert.ok(statSync(join(assetDir, entry.extSheet)).size > 100000, `${entry.extSheet} is missing or truncated`);
    // The sheet's scale is its own (sidecar scale x the breathe factor) and
    // recorded, or the sheet cannot be rebuilt; it stays within the family.
    assert.equal(entry.extScale, pinned.extScale);
    assert.ok(entry.extScale > 1 && entry.extScale < 2);
    assert.match(entry.ext8, /install_ext8\.py/, `${id}: the manifest must say how the sheet was composed`);
    assert.match(entry.ext8, /ext8-/, `${id}: the manifest must name the archived two-take generation`);
    for (const frame of UNIFIED_EXT_ROUTED_CELLS) {
      assert.equal(entry.extCells[frame].accept, true, `${id}: ext frame ${frame}`);
      assert.match(entry.extCells[frame].note, /take [AB]/, `${id}: each cell records which take it is`);
    }
    // THE DESCENT IS A REAL DESCENT on all four (read at 1:1: torso upright,
    // head level, legs reaching down), so the arc owns 8 -> 19 -> 9 -> 20.
    assert.equal(entry.extCells[UNIFIED_EXT_CELLS.jumpDescend].accept, true, `${id}: cell 20`);
    assert.equal(extMasks[id].accept[UNIFIED_EXT_CELLS.jumpDescend], true);
    assert.match(entry.extCells[UNIFIED_EXT_CELLS.jumpDescend].note, /ROUTED/);
    // The measured rows.
    assert.deepEqual([...UNIFIED_EXT_CELL_HEIGHT[id]], pinned.heights, `${id}: ext heights`);
    assert.deepEqual([...CELL_BODY_CENTRE[id][UNIFIED_EXT_BANK]], pinned.centres, `${id}: ext body centres`);
    for (let frame = 0; frame < UNIFIED_EXT_CELL_COUNT; frame += 1) {
      assert.equal(cellDrawAdjust(id, UNIFIED_EXT_BANK, frame), pinned.adjust[frame] ?? 1, `${id}: ext adjust ${frame}`);
    }
    // THE BREATHE LANDS ON THE IDLE by construction (the sheet factor), within
    // the resample's rounding: no per-cell term is spent on it.
    const idle = UNIFIED_CELL_HEIGHT[id][UNIFIED_CELLS.idle];
    assert.ok(Math.abs(pinned.heights[UNIFIED_EXT_CELLS.idleBreathe] / idle - 1) <= 0.005,
      `${id}: the composed breathe must sit on the idle (${pinned.heights[0]} vs ${idle})`);
    assert.equal(cellDrawAdjust(id, UNIFIED_EXT_BANK, UNIFIED_EXT_CELLS.idleBreathe), 1);
    // The four are prop-clean on this bank like everyone else.
    for (let frame = 0; frame < UNIFIED_EXT_CELL_COUNT; frame += 1) {
      assert.equal(isPropActionCell(id, UNIFIED_EXT_BANK, frame), false);
    }
  }
  // The manifest's own status line must not still say six.
  assert.match(manifest.format.extStatus, /ALL TEN fighters carry an ext sheet/);
  assert.match(manifest.format.ext8, /install_ext8\.py/);
  // THE DEVIL'S HEAVY WIND-UP COMPRESS BAND. His motion2:4 is rejected, so
  // the 3.5 chain fell through to base 13 — his airborne claw lunge. The
  // extended chain keys his own crouch transition under the bridge.
  const compress = (o) => heavyWindupKeys("punch", o).at(-1).chain.map((l) => `${l.bank}:${l.cell}`);
  assert.deepEqual(compress(undefined), ["motion2:4"], "the 3.5 compress band is untouched");
  assert.deepEqual(compress(EXTENDED), ["motion2:4", `${UNIFIED_BANK}:${UNIFIED_CELLS.crouchTrans}`]);
  assert.deepEqual(heavyWindupKeys("kick", EXTENDED).at(-1).chain.map((l) => `${l.bank}:${l.cell}`),
    ["motion2:4", `${UNIFIED_BANK}:${UNIFIED_CELLS.crouchTrans}`]);
  // game.js degrades the kick arc's continuation the same way, through the one gate.
  assert.match(gameSource, /return ext \? \{ \.\.\.arc, fallback: uni\(UNIFIED_CELLS\.crouchTrans, arc\.fallback\) \} : arc;/);
}

// ---------------------------------------------------------------------------
// X-H — registration, and the padding both renderers depend on.
// ---------------------------------------------------------------------------
function testRegistration() {
  assert.deepEqual(AUTHORED_BANKS.slice(-5), [UNIFIED_EXT_BANK, "unified-ext2", "unified-ext3", "unified-ext4", "unified-ext5"]);
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

    // v4.1 — the DESCENT, on the fighter who routes it. It is the last airborne
    // drawing before the anchor ramps out, so an unmeasured or badly-ordered row
    // is a body-drop on the tick the fall reads fastest.
    if (extMasks[id].accept[UNIFIED_EXT_CELLS.jumpDescend]) {
      const fall = airborneAnchorOffset(id, UNIFIED_EXT_BANK, UNIFIED_EXT_CELLS.jumpDescend);
      assert.ok(Number.isFinite(fall) && Math.abs(fall) < 120,
        `${id}: implausible airborne anchor ${fall} on the ext descent`);
      // Legs REACHING DOWN is a taller, more upright body plan than the balled
      // tuck it follows, so it must sit closer to the standing reference — the
      // figure unfolding toward the street rather than staying curled.
      assert.ok(fall > airborneAnchorOffset(id, UNIFIED_BANK, UNIFIED_CELLS.jumpTuck),
        `${id}: the descent must unfold out of the tuck, not stay balled up`);
      // ...and it must be REGISTERED, not defaulted: a missing row silently
      // returns 0 from airborneAnchorOffset, which is the B2 defect restored.
      assert.notEqual(CELL_BODY_CENTRE[id][UNIFIED_EXT_BANK][UNIFIED_EXT_CELLS.jumpDescend],
        undefined, `${id}: the routed descent has no body-centre row`);
    }
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
test("X-B an ext sheet is ALL SEVEN routed cells or none, needs a whole main sheet, and all ten carry one", testAllOrNothing);
test("X-C the un-extended arrays are the 3.5 read, and the extended ones genuinely differ", testUnextendedArraysAre35);
test("X-D the walk is a six-key alternating cycle at the 3.5 gait period, reversible", testSixKeyWalk);
test("X-E seven ext cells are routed for everyone and the descent is routed per fighter", testRouting);
test("X-F gaining an ext sheet lengthens no hold and collapses no band", testHoldBudget);
test("X-I ali is the sixth fighter on the ext bank, on re-measured tables", testAli);
test("X-G cyraxx is on the bank for the first time, on both sheets", testCyraxx);
test("X-J deathblow, post, donald and the devil are on the ext bank, on measured sheets of their own", testExt8Fighters);
test("X-H the ext cells are registered, anchored and padded for both renderers", testRegistration);
