// CINEMA 3D host contract — the explicit list of everything renderer/three
// reads off the `host` object that game.js assembles in ensureCinema3d().
//
// The 3D renderer draws the same fighters through a second copy of the pose /
// adjust pipeline, and the ONE place the two renderers are guaranteed to
// agree is this bridge. Until 5.0 it was an unchecked object literal: a
// rename in game.js only failed when a player toggled 3D (a black screen the
// owner would find on his phone before any test did). Now:
//   - createRenderer(host) calls assertHostContract(host) FIRST and throws
//     naming every missing REQUIRED member, which the loader in game.js
//     catches and reports ("CINEMA 3D failed to load; staying on the 2D
//     renderer") — a loud console line instead of a silent black world;
//   - missing OPTIONAL members are warned about once, because every reader
//     of one already carries a fallback (the ?.-guarded calls in fighters.mjs
//     and crowd-layer.mjs);
//   - tests/cinema-host.test.mjs pins this list against BOTH ends: every
//     `host.<member>` read anywhere in renderer/three/*.mjs must be listed
//     here, and every listed member must be a key of the literal game.js
//     passes to createRenderer. Add a member here when you add a read.
//
// This module deliberately imports nothing from "three" so Node can load it.

// Read on every frame or at rig build with no fallback in the reader.
export const CINEMA_HOST_REQUIRED = Object.freeze([
  "state",                 // live sim state (read-only: fighters, projectiles, traps, stageWeapon, effects, phase)
  "cinematicCamera",       // 2D presentation camera (zoom / focus / truck / roll) mapped onto the framing camera
  "stageImages",           // backdrop plates per stage id
  "fighterAtlases",        // base sheets per fighter id (fallback when fighterAtlasFor is absent)
  "fighterMoveAtlases",    // specials sheets per fighter id (same fallback)
  "fighterRenderSize",     // (fighterId) -> world-size base of the drawn sprite in sim px
  "fighterAnimationPose",  // (fighter) -> { bank, frame, fallback } — the 2D pose resolver
  "moveSheetAdjust",       // per-fighter specials-sheet world-size correction table
  "gameCanvas",            // the 2D canvas the 3D canvas is inserted under
  "isRollbackResimulating",// () -> bool: hit/dust latches are dropped during resim
  "getPerformanceProfile", // () -> state.performance (quality tier)
  "isWorldActive",         // () -> bool: the QA `active` getter
  // 5.1 CINEMA 3D gameplay reads (world-objects.mjs).
  "paintProjectile",       // (ctx2d, projectile, timeMs, options) -> paints a projectile / thrown object about (0,0)
  "paintTrap",             // (ctx2d, trap, timeMs) -> paints one of Post's wire traps about its floor point
  "stageWeaponProfile",    // () -> the current stage weapon's profile (style, width, height, name, glint, frames) or null
  "fighterScale",          // FIGHTER_SCALE — the sim's fighter world scale the weapon descriptors multiply by
]);

// Read behind a `host.x ? ... : fallback` / `host.x?.()` guard.
export const CINEMA_HOST_OPTIONAL = Object.freeze([
  "fighterAtlasFor",       // (fighter, bank) -> palette-resolved atlas image / canvas
  "fighterPaletteKey",     // (fighter) -> "" | "alt": invalidates a side's rig on a colour pick
  "hdSheetPath",           // (fighterId, bank) -> renderer/hd path or null (availability-gated)
  "fighterMotionTransform",// (fighter) -> shared movement-animation transform (flips, leans, squash)
  "motionSheetAdjust",     // motion/motion2/motion3 bank world-size table
  "walkSheetAdjust",       // walk bank world-size table
  "unifiedSheetAdjust",    // unified bank world-size table
  "isUnifiedFighter",      // (fighterId) -> whether the standing guard comes from the unified bank
  "downTiltFor",           // (fighterId, bank, frame) -> remaining lie-down tilt for a downed cell
  "baseCellDrawAdjust",    // (fighterId, bank, frame) -> legacy per-cell scale (superseded by cellDrawAdjust)
  "cellDrawAdjust",        // (fighterId, bank, frame, { unified }) -> per-cell scale rule
  "cellFloorOffset",       // (fighterId, bank, frame) -> per-cell floor registration (legacy)
  "cellVerticalOffset",    // (fighterId, bank, frame, airHeight) -> floor registration + airborne anchor
  "gritSuperCost",         // GRIT_RULES.superCost — the super-ready threshold (defaults to 100)
  "crowdBillboards",       // () -> resolved painted-crowd specs for this frame
  "crowdSheetImage",       // (sheetName) -> decoded crowd sheet image or null
  "crowdMediaRequest",     // () -> kick the crowd sheet loader
  "meshFightersEnabled",   // () -> bool: the 4.3 rigged-mesh switch, read per frame
  // 5.1 CINEMA 3D fighter layer (#40, #44).
  "downTiltRadians",       // DOWN_TILT_RADIANS (1.35) — the prone settle's full-tilt reference (fallback 1.35)
  "fighterBankSheet",      // (fighterId, bank) -> the bank's OWN sheet (Image/canvas) or null: the warm-up gate
  // 5.2 LOCOMOTION (bookends).
  "cinematicDrawRotation", // (bank, frame, cinematicRotation) -> the rotation a prone cinematic cell draws under
  // 5.3 SPECIALS (the kit bank in the unified generation).
  "moveSheetLegacyAdjust", // specials-legacy world-size table: the SHIPPED specials adjust, for a rejected cell
  // 5.3 SPECTACLE (#19): the battle-scar list as decal descriptors
  // (engine/stage-scars.mjs `scarDecals`) so CINEMA 3D wears the fight too.
  "stageScars",            // () -> [{ x, y, kind, surface, wall, width, rot, alpha, heavy }]
  // 5.3 SPECTACLE (#16/#43): the stage reacts. `ambientPulse` is also where
  // the KO pulse is LATCHED — before 5.3 that latch lived inside
  // drawStageAmbient, which never runs in 3D, so a 3D KO flared nothing.
  "ambientPulse",          // () -> { level, age, ko, hold, pulseAge, kind, latchTick, frame, reduced }
  "crowdReaction",         // () -> 0..1.4: the crowd's DRAWN reaction (held through the KO)
  // 5.3 SPECTACLE (#47): effect parity — the elemental flipbooks, their
  // sheets and the charging limb.
  "elementSprites",        // () -> the live element flipbook pool (read-only)
  "elementSheet",          // (name) -> { meta, image } for assets/vfx/<name>, or null until it loads
  "elementCharge",         // (side) -> { level, x, y, tier, glow, core } | null
  // 5.3 SPECTACLE (#48): battle damage on the 3D sprites.
  "battleDamage",          // (side) -> { marks, revision, gore } | null
  "paintBattleDamage",     // (ctx2d, side) -> paints the side's marks in 320px cell space
]);

export const CINEMA_HOST_MEMBERS = Object.freeze([...CINEMA_HOST_REQUIRED, ...CINEMA_HOST_OPTIONAL]);

// Pure: which listed members the given host is missing (undefined or absent).
export function missingHostMembers(host) {
  const missing = (names) => names.filter((name) => host == null || host[name] === undefined);
  return { required: missing(CINEMA_HOST_REQUIRED), optional: missing(CINEMA_HOST_OPTIONAL) };
}

// Throws on a missing required member (the game.js loader catches it and
// stays on 2D); warns once per createRenderer on missing optional ones.
export function assertHostContract(host, { warn = (message) => console.warn(message) } = {}) {
  const { required, optional } = missingHostMembers(host);
  if (required.length) {
    throw new Error(`CINEMA 3D host contract: missing required member(s) ${required.join(", ")}`);
  }
  if (optional.length) {
    warn(`CINEMA 3D host contract: optional member(s) absent, falling back: ${optional.join(", ")}`);
  }
  return true;
}
