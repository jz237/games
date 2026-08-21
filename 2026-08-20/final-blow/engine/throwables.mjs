import { ATTACK_LEVELS } from "./defense.mjs";

/**
 * Personal throwable objects.
 *
 * Every main fighter carries one recognisable physical object thrown with the
 * same command on every control method — **↓ ← + LK or HK** — which is the last
 * unused quarter-circle in the four-button vocabulary, so no fifth button is
 * added. The object is deliberately *not* a reskinned fireball: weight, arc,
 * bounce, hazard and tether behaviour are what make each one reinforce its
 * owner's archetype.
 *
 * Ammunition: **limited per round, no Grit cost.** The backlog asks for limits
 * wherever an unlimited object would erase the fighter's intended archetype, and
 * that is true for most of this set — an unlimited pizza or vinyl record is just
 * a zoning fireball. Counts reset at the start of every round, so an object is
 * an occasional decision rather than a spam button. Allan's loogies are the most
 * plentiful because their reach is deliberately tiny.
 *
 * All physics values are authored in the same unscaled body-local units as move
 * data and are multiplied by FIGHTER_SCALE when a projectile is spawned.
 */
export const THROWABLE_COMMAND = Object.freeze({
  action: "throwObject",
  sequence: Object.freeze(["down", "back", "kick"]),
  terminal: "kick",
  display: "↓ ← + KICK",
});

const object = (id, overrides) => Object.freeze({
  id,
  // Throwing motion defaults. Every object overrides what it needs.
  startupFrames: 13,
  activeFrames: 4,
  recoveryFrames: 24,
  usesPerRound: 2,
  spawnX: 74,
  spawnY: -128,
  speed: 380,
  gravity: 0,
  launchY: 0,
  width: 54,
  height: 54,
  damage: 9,
  chipDamage: 2,
  hitstunFrames: 20,
  blockstunFrames: 13,
  push: 240,
  level: ATTACK_LEVELS.MID,
  knockdown: false,
  lifeFrames: 150,
  bounces: 0,
  bounceDamping: 0.5,
  hazardFrames: 0,
  hazardWidth: 0,
  spin: 0,
  wobble: 0,
  tether: null,
  slowFrames: 0,
  staggerFrames: 0,
  releaseFrames: Object.freeze([4, 5, 6, 7]),
  impactLabel: "OBJECT HIT",
  variants: null,
  ...overrides,
});

export const FIGHTER_THROWABLES = Object.freeze({
  deathblow: object("pizza", {
    name: "WHOLE PIZZA",
    style: "pizza",
    archetype: "slow space control — a broad spinning disc that is hard to walk under",
    startupFrames: 16,
    recoveryFrames: 30,
    usesPerRound: 2,
    speed: 300,
    width: 92,
    height: 92,
    damage: 11,
    chipDamage: 3,
    hitstunFrames: 24,
    push: 300,
    spin: 13,
    wobble: 11,
    lifeFrames: 170,
    impactLabel: "PIZZA SPLAT",
    sound: "pizza",
  }),
  jez: object("mouse", {
    name: "CORDED MOUSE",
    style: "mouse",
    archetype: "tether — reels the opponent in on a clean hit, harmless on block, punishable on whiff",
    startupFrames: 14,
    activeFrames: 3,
    recoveryFrames: 34,
    usesPerRound: 2,
    speed: 620,
    width: 46,
    height: 34,
    damage: 8,
    chipDamage: 0,
    hitstunFrames: 30,
    blockstunFrames: 9,
    push: 0,
    lifeFrames: 78,
    spin: 3,
    // A clean hit drags the victim to just outside DeathBlow-range of Jez.
    tether: Object.freeze({ reelSpeed: 760, holdDistance: 118, retractOnBlock: true }),
    impactLabel: "MOUSE TRAP",
    sound: "mouse",
  }),
  alan: object("loogie", {
    name: "LOOGIES",
    style: "loogie",
    archetype: "close pressure — a short sticky arc that staggers, never zones",
    startupFrames: 9,
    activeFrames: 3,
    recoveryFrames: 18,
    usesPerRound: 4,
    speed: 330,
    gravity: 1500,
    launchY: -300,
    spawnY: -168,
    width: 34,
    height: 30,
    damage: 6,
    chipDamage: 1,
    hitstunFrames: 16,
    blockstunFrames: 8,
    push: 130,
    lifeFrames: 52,
    staggerFrames: 9,
    hazardFrames: 0,
    impactLabel: "STICKY HIT",
    sound: "loogie",
  }),
  post: object("wires", {
    name: "TANGLED WIRES",
    style: "wires",
    archetype: "trap control — a lob that bounces once, uncoils and slows whoever touches it",
    startupFrames: 15,
    recoveryFrames: 26,
    usesPerRound: 2,
    speed: 320,
    gravity: 1250,
    launchY: -420,
    width: 62,
    height: 52,
    damage: 7,
    chipDamage: 1,
    hitstunFrames: 18,
    push: 120,
    lifeFrames: 190,
    bounces: 1,
    bounceDamping: 0.42,
    hazardFrames: 110,
    hazardWidth: 96,
    slowFrames: 48,
    spin: 5,
    impactLabel: "WIRED UP",
    sound: "wires",
  }),
  benny: object("xacto", {
    name: "X-ACTO KNIFE",
    style: "xacto",
    archetype: "quick harassment — fast, precise, narrow, and punishable if it misses",
    startupFrames: 10,
    activeFrames: 3,
    recoveryFrames: 30,
    usesPerRound: 3,
    speed: 720,
    width: 40,
    height: 16,
    damage: 8,
    chipDamage: 2,
    hitstunFrames: 19,
    blockstunFrames: 11,
    push: 190,
    lifeFrames: 96,
    impactLabel: "PRECISION CUT",
    sound: "xacto",
  }),
  donald: object("golfball", {
    name: "GOLF BALL",
    style: "golfball",
    archetype: "low bounce — skips off the floor twice and covers ground awkwardly",
    startupFrames: 11,
    recoveryFrames: 25,
    usesPerRound: 3,
    speed: 540,
    gravity: 1650,
    launchY: -190,
    spawnY: -104,
    width: 26,
    height: 26,
    damage: 7,
    chipDamage: 1,
    hitstunFrames: 17,
    blockstunFrames: 10,
    push: 200,
    lifeFrames: 165,
    bounces: 2,
    bounceDamping: 0.62,
    spin: 18,
    impactLabel: "FORE!",
    variants: Object.freeze({
      high: Object.freeze({
        name: "HIGH GOLF BALL",
        launchY: -420,
        gravity: 1380,
        bounces: 1,
        damage: 9,
        hitstunFrames: 20,
        push: 235,
      }),
    }),
    sound: "golfball",
  }),
  cyraxx: object("bedbugs", {
    name: "BED BUGS",
    style: "bedbugs",
    archetype: "trickster trap — a slow crawling swarm that lingers on the floor",
    startupFrames: 14,
    recoveryFrames: 28,
    usesPerRound: 2,
    speed: 230,
    gravity: 980,
    launchY: -300,
    width: 58,
    height: 40,
    damage: 6,
    chipDamage: 1,
    hitstunFrames: 15,
    blockstunFrames: 9,
    push: 110,
    lifeFrames: 200,
    bounces: 0,
    hazardFrames: 130,
    hazardWidth: 104,
    staggerFrames: 7,
    impactLabel: "INFESTED",
    sound: "bedbugs",
  }),
  ali: object("vinyl", {
    name: "VINYL RECORD",
    style: "vinyl",
    archetype: "anti-air arc — a steep lob that beats jumps and punishes hesitation",
    startupFrames: 12,
    recoveryFrames: 27,
    usesPerRound: 3,
    speed: 400,
    gravity: 1120,
    launchY: -520,
    spawnY: -150,
    width: 56,
    height: 56,
    damage: 9,
    chipDamage: 2,
    hitstunFrames: 21,
    blockstunFrames: 12,
    push: 250,
    lifeFrames: 175,
    knockdown: true,
    spin: 22,
    impactLabel: "BASS DROP",
    sound: "vinyl",
  }),
});

export const THROWABLE_IDS = Object.freeze(Object.keys(FIGHTER_THROWABLES));

export function getThrowable(fighterId) {
  return FIGHTER_THROWABLES[fighterId] || null;
}

export function throwableUses(fighterId) {
  return getThrowable(fighterId)?.usesPerRound ?? 0;
}

/**
 * Build the attack instance for the throwing motion itself. The object is spawned
 * by the projectile system on the active frame, so this only owns the wind-up,
 * the commitment and the recovery that makes a whiff punishable.
 */
export function createThrowObjectMove(fighterId, { strength = "light" } = {}) {
  const profile = getThrowable(fighterId);
  if (!profile) return null;
  const throwableVariant = strength === "heavy" && profile.variants?.high ? "high" : "";
  const variant = throwableVariant ? profile.variants[throwableVariant] : null;
  return {
    id: `${fighterId}-throw-${profile.id}`,
    baseKind: "special",
    kind: "special",
    cancelProfileId: `throw-object`,
    level: ATTACK_LEVELS.MID,
    moveName: variant?.name || profile.name,
    startupFrames: profile.startupFrames,
    activeFrames: profile.activeFrames,
    recoveryFrames: profile.recoveryFrames,
    range: 0,
    damage: 0,
    chipDamage: 0,
    push: 0,
    meter: 8,
    hitstunFrames: 0,
    blockstunFrames: 0,
    // The throwing animation itself has no hitbox: only the object can hit.
    hitboxes: [],
    throwableId: profile.id,
    throwableFighterId: fighterId,
    throwableVariant,
    animation: Object.freeze({ bank: "specials", frames: profile.releaseFrames }),
    command: THROWABLE_COMMAND.display,
  };
}

/**
 * Advance one thrown object for a single frame. Pure and integer-friendly so
 * replay and rollback reproduce flight, bounces and hazards exactly.
 */
export function stepThrowable(projectile, { dt, floorY, minX, maxX }) {
  if (projectile.hazard) {
    projectile.hazardFrames = Math.max(0, projectile.hazardFrames - 1);
    return projectile.hazardFrames > 0 ? "hazard" : "expired";
  }
  if (projectile.gravity) projectile.vy += projectile.gravity * dt;
  projectile.x += projectile.vx * dt;
  projectile.y += projectile.vy * dt;
  projectile.spinAngle = (projectile.spinAngle || 0) + (projectile.spin || 0) * dt;

  const resting = floorY - projectile.height * 0.5;
  if (projectile.gravity && projectile.y >= resting) {
    projectile.y = resting;
    if (projectile.bouncesLeft > 0) {
      projectile.bouncesLeft -= 1;
      projectile.vy = -Math.abs(projectile.vy) * projectile.bounceDamping;
      projectile.vx *= 0.86;
      return "bounce";
    }
    if (projectile.hazardFrames > 0) {
      projectile.hazard = true;
      projectile.vx = 0;
      projectile.vy = 0;
      if (projectile.hazardWidth) projectile.width = projectile.hazardWidth;
      return "settle";
    }
    return "expired";
  }
  if (projectile.x < minX || projectile.x > maxX) return "expired";
  return "flying";
}
