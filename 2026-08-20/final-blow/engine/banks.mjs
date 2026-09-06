// ---------------------------------------------------------------------------
// v5.3 SPECTACLE — BANK PLUMBING (sweep item #52, the half that pays now).
//
// game.js cannot be imported under Node (it touches document on the first
// line of its bank loaders), so nine unit-test files used to pin its bank
// routing by REGEX OVER THE SOURCE — `assert.match(gameSource, /if \(bank ===
// UNIFIED_EXT3_BANK \|\| .../)`. A regex pin passes when the TEXT matches, not
// when the behaviour holds: it survives a wrong bank being routed to the right
// gate as long as the characters line up, and it breaks on a reformat that
// changed nothing. The five decisions below are the ones those pins were
// aiming at, and every one of them is pure — a table lookup or a string —
// so they live here and the tests assert them directly.
//
// WHAT IS HERE AND WHAT IS NOT. Everything in this file is a DECISION: which
// gate a bank routes to, which mask key and file suffix a swing bank owns,
// which atlas table and cache key a palette remap reads, and what order the
// preload asks for sheets in. Everything that TOUCHES the DOM — the Image
// constructor, the manifest fetch, the padded ext canvas, the decode tracker —
// stays in game.js and is handed in. The accept masks themselves
// (buildUnifiedAcceptMasks and friends) were already in fighter-kits.mjs.
//
// Nothing here reads sim state or RNG: callers pass the numbers in, so
// replay/rollback checksums cannot see this file.
// ---------------------------------------------------------------------------

import {
  SPECIALS_BANK,
  SPECIALS_LEGACY_BANK,
  UNIFIED_BANK,
  UNIFIED_EXT_BANK,
  UNIFIED_EXT2_BANK,
  UNIFIED_EXT3_BANK,
  UNIFIED_EXT4_BANK,
  UNIFIED_EXT5_BANK,
} from "./fighter-kits.mjs";

// --- The swing family ------------------------------------------------------
//
// ext3 (strikes, v5.0), ext4 (reactions, v5.0) and ext5 (locomotion +
// presentation, v5.2) ride ONE loader, ONE gate and ONE atlas table. The three
// tables below are the whole of what distinguishes them, and they are listed
// in the order the family shipped in — which is also the order the preload
// asks for them, so a fight that opens on a strike has its strike sheet first.

/** The swing banks, in ship order. */
export const SWING_BANK_LIST = Object.freeze([UNIFIED_EXT3_BANK, UNIFIED_EXT4_BANK, UNIFIED_EXT5_BANK]);

/** Which `unifiedBankState` mask table a swing bank's accept mask lives in. */
export const SWING_MASK_KEY = Object.freeze({
  [UNIFIED_EXT3_BANK]: "ext3Masks",
  [UNIFIED_EXT4_BANK]: "ext4Masks",
  [UNIFIED_EXT5_BANK]: "ext5Masks",
});

/** The file/readiness suffix a swing bank ships under. */
export const SWING_SUFFIX = Object.freeze({
  [UNIFIED_EXT3_BANK]: "ext3",
  [UNIFIED_EXT4_BANK]: "ext4",
  [UNIFIED_EXT5_BANK]: "ext5",
});

/** True for one of the three per-cell-gated swing sheets. */
export function isSwingBank(bank) {
  return Object.prototype.hasOwnProperty.call(SWING_MASK_KEY, bank);
}

/** Where a fighter's swing sheet ships. One place, so the loader cannot drift. */
export function swingSheetPath(fighterId, bank) {
  const suffix = SWING_SUFFIX[bank];
  return suffix ? `assets/unified/${fighterId}-${suffix}.webp` : null;
}

// --- The drawable-gate routing table ---------------------------------------
//
// resolveMotionPose asks one question per authored cell — "is this fighter's
// `bank` cell drawable right now?" — and every bank answers it with its own
// gate (its own manifest mask AND its own decoded sheet). The routing used to
// be an if-ladder inside game.js; it is a table now, so a new bank is a row
// rather than a branch inserted in the right place, and the test can assert
// the whole mapping rather than one line of it.
//
// The DEFAULT is bank 1 ("motion"), which is what the ladder's trailing
// ternary did: an unknown bank name is treated as the oldest authored bank
// and its gate answers honestly (no mask => not drawable), so a typo degrades
// to the fallback chain instead of drawing an unmasked cell.

/** Gate kind per bank name. Anything absent falls to `motion` (see above). */
export const BANK_GATE_KIND = Object.freeze({
  motion3: "motion3",
  [UNIFIED_EXT2_BANK]: "ext2",
  [UNIFIED_EXT3_BANK]: "swing",
  [UNIFIED_EXT4_BANK]: "swing",
  [UNIFIED_EXT5_BANK]: "swing",
  [UNIFIED_EXT_BANK]: "ext",
  [UNIFIED_BANK]: "unified",
  walk: "walk",
  motion2: "motion2",
  motion: "motion",
});

/** Which gate answers for this bank. */
export function bankGateKind(bank) {
  return BANK_GATE_KIND[bank] || "motion";
}

/**
 * Route one drawable question to its gate. `gates` supplies one callback per
 * kind — `(fighterId, cell)`, except `swing`, which is `(fighterId, cell,
 * bank)` because the three sheets share a gate and it must know which. A
 * missing callback answers false, which is the same "no sheet" answer the
 * loaders give before their manifest lands.
 *
 * THE ANSWER IS PASSED THROUGH VERBATIM, not coerced. motion3 is addressed by
 * POSE NAME and answers with the RESOLVED FRAME INDEX (or false) — see
 * resolveMotionPose — and frame 0 is a real cell, so a `Boolean()` here would
 * quietly retire the first cell of the motion3 sheet on every fighter.
 */
export function bankCellDrawable(fighterId, cell, bank, gates = {}) {
  const kind = bankGateKind(bank);
  const gate = gates[kind];
  if (typeof gate !== "function") return false;
  return kind === "swing" ? gate(fighterId, cell, bank) : gate(fighterId, cell);
}

// --- Alt-palette atlas resolution ------------------------------------------
//
// R2.0 wave 16 gives each fighter an authored alt palette, built once per
// ATLAS per session and cached by key. Which image a bank remaps, and what
// that cache key is, is pure bookkeeping — and it is the one place where a
// wrong answer is invisible until somebody picks palette 2 (the cache would
// serve the wrong sheet under the right key). The two rules that are NOT a
// plain table:
//
//   * the boss shares ONE sheet across his banks, so his `specials` collapses
//     onto the `base` key rather than caching the same pixels twice; and
//   * `specials` only earns its own key when a distinct specials image exists.
//
// `tables` is the caller's atlas bookkeeping, one field per gate kind. Pure:
// it reads the tables, never builds anything.

/** Which atlas table a bank remaps from. */
export const ALT_ATLAS_TABLE = Object.freeze({
  motion: "motion",
  motion2: "motion2",
  motion3: "motion3",
  walk: "walk",
  [UNIFIED_BANK]: "unified",
  [UNIFIED_EXT_BANK]: "ext",
  [UNIFIED_EXT2_BANK]: "ext2",
  [UNIFIED_EXT3_BANK]: "swing",
  [UNIFIED_EXT4_BANK]: "swing",
  [UNIFIED_EXT5_BANK]: "swing",
  [SPECIALS_LEGACY_BANK]: "specialsLegacy",
});

/** The alt-palette cache key for a bank that owns its own sheet, else null. */
export function altAtlasKey(fighterId, bank) {
  switch (ALT_ATLAS_TABLE[bank]) {
    case "motion": return `${fighterId}:motion`;
    case "motion2": return `${fighterId}:motion2`;
    case "motion3": return `${fighterId}:motion3`;
    case "walk": return `${fighterId}:walk`;
    case "unified": return `${fighterId}:unified`;
    case "ext": return `${fighterId}:unified-ext`;
    case "ext2": return `${fighterId}:unified-ext2`;
    // The swing sheets key on the BANK NAME, so ext3/ext4/ext5 cannot collide
    // in a cache the three of them share a table with.
    case "swing": return `${fighterId}:${bank}`;
    case "specialsLegacy": return `${fighterId}:${SPECIALS_LEGACY_BANK}`;
    default: return null;
  }
}

/**
 * The image a palette remap reads for `bank`, and the key it caches under.
 * `tables` fields: motion, motion2, motion3, walk, unified, ext, ext2,
 * swing (bank -> fighterId -> image), specialsLegacy, specials, base.
 */
export function altAtlasSource(fighterId, bank, tables = {}) {
  const slot = ALT_ATLAS_TABLE[bank];
  const key = altAtlasKey(fighterId, bank);
  if (slot === "swing") return { image: tables.swing?.[bank]?.[fighterId], key };
  if (slot) return { image: tables[slot]?.[fighterId], key };
  const base = tables.base?.[fighterId];
  const specials = bank === SPECIALS_BANK ? tables.specials?.[fighterId] : null;
  // The boss shares one sheet across banks — collapse to one cache entry.
  if (specials && specials !== base) return { image: specials, key: `${fighterId}:${SPECIALS_BANK}` };
  return { image: base, key: `${fighterId}:base` };
}

// --- The preload plan ------------------------------------------------------
//
// v5.1 #35 — REQUEST ORDER IS THE POINT. Measured on a throttled phone
// profile, the motion banks used to go out first while the unified family
// waited a manifest round trip, and the browser then scheduled the stage plate
// and the crowd ahead of it. The order below is the fix, and it is the part
// worth a test: the unified family FIRST and in family order (main, ext, ext2,
// then the swing sheets in ship order), the per-beat motion banks after, the
// bonus banks last and only for a fighter whose manifest says he has one.
//
// A fighter who is not 16/16 on the main sheet contributes NOTHING to the
// unified phase — not even his ext sheets, which can never draw without it —
// and no request is made, which is what keeps a fighter with no sheet in the
// repo (cyraxx before 5.1) from 404ing.

/**
 * The ordered sheet requests for a matchup. `gates` supplies the manifest
 * answers: unifiedWhole(id), extWhole(id), ext2Whole(id), swingWhole(id,
 * bank), motion3Any(id), walkHas(id). Every entry is
 * `{ id, bank, kind, key }`, where `key` is the decode-tracking key.
 */
export function bankPreloadPlan(ids, gates = {}) {
  const list = (ids || []).filter((id) => typeof id === "string" && id);
  const ask = (name, id, ...rest) => (typeof gates[name] === "function" ? Boolean(gates[name](id, ...rest)) : false);
  const unified = [];
  for (const id of list) {
    if (!ask("unifiedWhole", id)) continue;
    unified.push({ id, bank: UNIFIED_BANK, kind: "unified", key: `${id}:unified` });
    if (ask("extWhole", id)) unified.push({ id, bank: UNIFIED_EXT_BANK, kind: "ext", key: `${id}:ext` });
    if (ask("ext2Whole", id)) unified.push({ id, bank: UNIFIED_EXT2_BANK, kind: "ext2", key: `${id}:ext2` });
    for (const bank of SWING_BANK_LIST) {
      if (!ask("swingWhole", id, bank)) continue;
      unified.push({ id, bank, kind: "swing", key: `${id}:${SWING_SUFFIX[bank]}` });
    }
  }
  const motion = [];
  for (const id of list) {
    motion.push({ id, bank: "motion", kind: "motion", key: `${id}:motion` });
    motion.push({ id, bank: "motion2", kind: "motion2", key: `${id}:motion2` });
  }
  const motion3 = list.filter((id) => ask("motion3Any", id))
    .map((id) => ({ id, bank: "motion3", kind: "motion3", key: `${id}:motion3` }));
  const walk = list.filter((id) => ask("walkHas", id))
    .map((id) => ({ id, bank: "walk", kind: "walk", key: `${id}:walk` }));
  return { unified, motion, bonus: { motion3, walk } };
}
