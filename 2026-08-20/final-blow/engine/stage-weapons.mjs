import { ATTACK_LEVELS } from "./defense.mjs";
import { DeterministicRng, hashSeed } from "./foundation.mjs";

/**
 * Stage weapons.
 *
 * Exactly one themed pickup type per stage, and only ever one physical weapon on
 * the playfield at a time. It arrives once per round at a seeded random moment
 * and one of several fair predefined floor positions, telegraphs its arrival, and
 * can be contested by either fighter.
 *
 * Pickup is **down + HP** while standing over it. Outside pickup range that press
 * is the ordinary crouching HP, so nothing is taken away from the normal game.
 * While carrying, **HP** throws it: forward is the committed attacking throw,
 * neutral or away is a safer short toss. The weapon replaces HP until it leaves
 * your hands, and carrying it slows you down and stops you jumping — these are
 * occasional high-impact moments, not an inventory system.
 *
 * Everything here is frame-based and seeded, so spawn time, position, ownership,
 * flight, collision and removal reproduce exactly under replay and rollback.
 */

const ROUND_FRAMES = 99 * 60;

const weapon = (id, overrides) => Object.freeze({
  id,
  // Contest window: the weapon lands somewhere in the middle of the round so
  // neither fighter can camp the spawn from the opening bell.
  earliestFrame: 16 * 60,
  latestFrame: 62 * 60,
  telegraphFrames: 48,
  groundFrames: 9 * 60,
  pickupRange: 78,
  pickupFrames: 9,
  // Carrying is a real commitment.
  carryWalkScale: 0.72,
  carryBlocksJump: true,
  carryFrames: 6 * 60,
  throwStartupFrames: 12,
  throwActiveFrames: 4,
  throwRecoveryFrames: 26,
  dropRecoveryFrames: 14,
  speed: 520,
  gravity: 900,
  launchY: -140,
  dropSpeed: 180,
  dropLaunchY: -260,
  width: 40,
  height: 40,
  damage: 12,
  chipDamage: 2,
  hitstunFrames: 22,
  blockstunFrames: 13,
  push: 300,
  level: ATTACK_LEVELS.MID,
  knockdown: false,
  lifeFrames: 150,
  bounces: 0,
  spin: 10,
  ...overrides,
});

export const STAGE_WEAPONS = Object.freeze({
  somerset: weapon("needle", {
    name: "DISCARDED NEEDLE",
    style: "needle",
    // Quick pickup, fast straight dart. Very small hitbox, low damage, brief
    // hitstun, bright glint so it stays readable. One use. No status effect.
    pickupFrames: 6,
    speed: 780,
    gravity: 0,
    launchY: 0,
    width: 30,
    height: 10,
    damage: 7,
    chipDamage: 1,
    hitstunFrames: 15,
    blockstunFrames: 9,
    push: 170,
    lifeFrames: 90,
    spin: 0,
    glint: true,
    cue: "A NEEDLE GLINTS ON THE PAVEMENT",
  }),
  vet: weapon("bottle", {
    name: "BEER BOTTLE",
    style: "bottle",
    // Quick one-handed pickup, fast short-to-medium arc, moderate damage and a
    // stagger. Glass shatters on impact and the shards vanish immediately.
    pickupFrames: 7,
    speed: 560,
    gravity: 1150,
    launchY: -260,
    width: 34,
    height: 46,
    damage: 13,
    chipDamage: 2,
    hitstunFrames: 24,
    staggerFrames: 10,
    push: 320,
    lifeFrames: 130,
    shatter: true,
    spin: 14,
    cue: "A BOTTLE ROLLS OUT OF THE LOT",
  }),
  wildwood: weapon("pigeon", {
    name: "DEAD PIGEON",
    style: "pigeon",
    // One-handed pickup, floppy tumbling arc, broad soft hitbox, feather burst,
    // removed cleanly after landing so no carcass obstructs play.
    pickupFrames: 8,
    speed: 400,
    gravity: 1000,
    launchY: -330,
    width: 62,
    height: 46,
    damage: 10,
    chipDamage: 1,
    hitstunFrames: 20,
    staggerFrames: 8,
    push: 250,
    lifeFrames: 140,
    spin: 7,
    feathers: true,
    cue: "SOMETHING FELL OFF THE RAILING",
  }),
  buffet: weapon("tongs", {
    name: "SERVING TONGS",
    style: "tongs",
    // Quick one-handed pickup, medium-speed end-over-end throw, narrow hitbox,
    // sharp metallic clang.
    pickupFrames: 6,
    speed: 600,
    gravity: 780,
    launchY: -120,
    width: 44,
    height: 18,
    damage: 11,
    chipDamage: 2,
    hitstunFrames: 21,
    staggerFrames: 7,
    push: 280,
    lifeFrames: 120,
    spin: 24,
    clang: true,
    cue: "TONGS CLATTER OFF THE STEAM TABLE",
  }),
  cruise: weapon("souvenir-cup", {
    name: "SOUVENIR CUP",
    style: "cup",
    // Backlog left this one TBD. A giant frozen-drink souvenir cup is the most
    // on-theme object on a budget cruise pool deck: slow, wobbly, a big soft
    // hitbox, and a spectacular slushy burst that briefly slows whoever wears it.
    pickupFrames: 8,
    speed: 380,
    gravity: 860,
    launchY: -300,
    width: 56,
    height: 68,
    damage: 10,
    chipDamage: 2,
    hitstunFrames: 19,
    slowFrames: 40,
    push: 230,
    lifeFrames: 150,
    spin: 9,
    splash: true,
    cue: "A SOUVENIR CUP TIPS OFF THE BAR",
  }),
});

/**
 * Fair floor positions expressed as a fraction of the walkable stage so neither
 * fighter starts noticeably closer to any of them. The centre slot is included so
 * a contest at neutral is always possible.
 */
export const WEAPON_SPAWN_FRACTIONS = Object.freeze([0.28, 0.4, 0.5, 0.6, 0.72]);

export function getStageWeapon(stageId) {
  return STAGE_WEAPONS[stageId] || null;
}

export function stageWeaponIds() {
  return Object.keys(STAGE_WEAPONS);
}

/**
 * Decide when and where this round's weapon arrives. Pure: the same seed, stage
 * and round always produce the same plan, on both peers and on every replay.
 */
export function planStageWeapon(stageId, { matchSeed = 1, round = 1, minX = 76, maxX = 1204 } = {}) {
  const profile = getStageWeapon(stageId);
  if (!profile) return null;
  const rng = new DeterministicRng(hashSeed(matchSeed, "stage-weapon", stageId, round));
  const span = Math.max(1, profile.latestFrame - profile.earliestFrame);
  const frame = profile.earliestFrame + Math.floor(rng.nextFloat() * span);
  const slot = Math.floor(rng.nextFloat() * WEAPON_SPAWN_FRACTIONS.length) % WEAPON_SPAWN_FRACTIONS.length;
  const fraction = WEAPON_SPAWN_FRACTIONS[slot];
  return {
    weaponId: profile.id,
    stageId,
    slot,
    x: Math.round(minX + (maxX - minX) * fraction),
    spawnFrame: Math.min(frame, ROUND_FRAMES - profile.telegraphFrames - 60),
    telegraphFrames: profile.telegraphFrames,
    groundFrames: profile.groundFrames,
  };
}

/**
 * A weapon must never arrive during a moment where it would be unfair or
 * unreadable. When blocked the arrival simply waits, it is not cancelled.
 */
export function canWeaponArrive({
  phase = "fight",
  hitstop = 0,
  finisherActive = false,
  superActive = false,
  anyKnockdown = false,
  paused = false,
} = {}) {
  if (phase !== "fight") return false;
  if (paused || finisherActive || superActive) return false;
  if (hitstop > 0) return false;
  // A knockdown would let the standing fighter walk onto a free pickup.
  if (anyKnockdown) return false;
  return true;
}

export function canPickUpWeapon(fighter, weapon, { range = 78, scale = 1 } = {}) {
  if (!fighter || !weapon || weapon.phase !== "ground") return false;
  if (!fighter.grounded || fighter.down || fighter.attacking) return false;
  if (fighter.hitstunFrames > 0 || fighter.blockstunFrames > 0 || fighter.dizzyFrames > 0) return false;
  if (fighter.wakeupFrames > 0) return false;
  return Math.abs(fighter.x - weapon.x) <= range * scale;
}

export function weaponSnapshot(weapon) {
  if (!weapon) return null;
  return {
    weaponId: weapon.weaponId,
    phase: weapon.phase,
    x: Math.round(weapon.x),
    y: Math.round(weapon.y ?? 0),
    holder: weapon.holder ?? -1,
    frames: weapon.frames ?? 0,
    slot: weapon.slot ?? -1,
    spawnFrame: weapon.spawnFrame ?? -1,
    // Release 1.8 GRIND: Weapons Rain wave counter (0 = the round's original
    // drop; each deterministic respawn increments it).
    wave: weapon.wave ?? 0,
    rainFrames: weapon.rainFrames ?? 0,
  };
}
