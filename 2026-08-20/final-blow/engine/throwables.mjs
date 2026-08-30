import { ATTACK_LEVELS } from "./defense.mjs";
import { GRIT_RULES } from "./combos.mjs";

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

/**
 * Release 1.7 wave 11 — the EX tier. Same motion finished with the LK&HK
 * chord instead of a single kick, costing GRIT_RULES.enhancedSpecialCost plus
 * one throwable pip. Every EX behaviour is authored data inside the profile's
 * `variants.ex` block (merged over the base flight exactly like Donald's
 * existing high golf ball), so determinism and rollback are inherited from
 * the ordinary projectile state. `extraSpawns` entries release additional
 * projectiles on the same active frame, each merging its own overrides.
 */
export const ENHANCED_THROWABLE_COMMAND = Object.freeze({
  action: "enhancedThrowObject",
  sequence: Object.freeze(["down", "back", "enhanced"]),
  terminal: "enhanced",
  limb: "kick",
  display: "↓ ← + LK&HK",
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
  hazardArmFrames: 0,
  hazardWidth: 0,
  maxActive: 1,
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
    variants: Object.freeze({
      // EX: the whole pie splits into two slices — a flat drive plus a lofted
      // arc that lands behind it, covering two heights at once.
      ex: Object.freeze({
        name: "PIZZA PARTY",
        width: 62,
        height: 62,
        speed: 380,
        damage: 8,
        chipDamage: 2,
        hitstunFrames: 22,
        push: 260,
        spin: 19,
        extraSpawns: Object.freeze([
          Object.freeze({ launchY: -360, gravity: 1150, speed: 320, spawnY: -150 }),
        ]),
      }),
    }),
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
    variants: Object.freeze({
      // EX: the cable reel becomes a guaranteed launcher — the victim is
      // dragged in and popped airborne beside Jez, juggleable but untechable.
      ex: Object.freeze({
        name: "EX MOUSE REEL",
        speed: 660,
        damage: 9,
        hitstunFrames: 32,
        tether: Object.freeze({
          reelSpeed: 760,
          holdDistance: 118,
          retractOnBlock: true,
          launch: true,
          launchVelocityY: -520,
        }),
      }),
    }),
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
    variants: Object.freeze({
      // EX: the loogie leaves a brief floor splat that slows whoever stands
      // in it — Allan's close pressure gains a sticky patch of ring control.
      ex: Object.freeze({
        name: "FLOOR LOOGIE",
        damage: 7,
        lifeFrames: 130,
        hazardFrames: 90,
        hazardArmFrames: 10,
        hazardWidth: 110,
        slowFrames: 55,
      }),
    }),
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
    hazardArmFrames: 18,
    hazardWidth: 96,
    slowFrames: 48,
    spin: 5,
    impactLabel: "WIRED UP",
    variants: Object.freeze({
      // EX: live wires — a wider tangle that lingers longer, snares harder
      // and stings on the way in.
      ex: Object.freeze({
        name: "LIVE WIRES",
        damage: 9,
        hazardFrames: 160,
        hazardWidth: 150,
        slowFrames: 70,
        staggerFrames: 8,
      }),
    }),
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
    variants: Object.freeze({
      // EX: twin cut — a second blade rides a lower line a beat behind the
      // first, so one guess covers neither height.
      ex: Object.freeze({
        name: "TWIN CUT",
        speed: 760,
        damage: 8,
        extraSpawns: Object.freeze([
          Object.freeze({ spawnY: -70, speed: 640 }),
        ]),
      }),
    }),
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
      // EX: one vicious low drive — a single hard skip off the turf, faster,
      // heavier and a knockdown on the clean hit.
      ex: Object.freeze({
        name: "GOLD DRIVE",
        speed: 640,
        launchY: -160,
        gravity: 1700,
        bounces: 1,
        damage: 10,
        hitstunFrames: 21,
        push: 250,
        knockdown: true,
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
    hazardArmFrames: 24,
    hazardWidth: 104,
    staggerFrames: 7,
    impactLabel: "INFESTED",
    variants: Object.freeze({
      // EX: the swarm truly lingers — wider, longer-lived floor denial with a
      // nastier stagger for anyone who wades through it.
      ex: Object.freeze({
        name: "FULL INFESTATION",
        damage: 7,
        lifeFrames: 240,
        hazardFrames: 200,
        hazardWidth: 150,
        staggerFrames: 10,
      }),
    }),
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
    variants: Object.freeze({
      // EX: dub plates — the steep anti-air lob plus a second, shallower
      // record on a faster line, closing both the jump and the walk-in.
      ex: Object.freeze({
        name: "DUB PLATES",
        damage: 9,
        extraSpawns: Object.freeze([
          Object.freeze({ launchY: -300, gravity: 1400, speed: 480, spawnY: -140 }),
        ]),
      }),
    }),
    sound: "vinyl",
  }),
  // R2.0 FAMILY wave 17 — the Pinelands Devil's bone-and-twine hex charm. A
  // lobbed pine-barrens curse: slow, arcing, and it STAGGERS whoever it marks
  // (the hex jolt buys the Devil his swoop-in). The EX tier follows the
  // wave-11 hazard pattern: the charm settles into a lingering curse zone
  // that slows anyone who wades through the marked ground.
  devil: object("charm", {
    name: "HEX CHARM",
    style: "charm",
    archetype: "curse lob — a slow hexed arc that jolts whoever it marks",
    startupFrames: 12,
    activeFrames: 4,
    recoveryFrames: 26,
    usesPerRound: 2,
    speed: 350,
    gravity: 1200,
    launchY: -380,
    spawnY: -140,
    width: 40,
    height: 40,
    damage: 8,
    chipDamage: 1,
    hitstunFrames: 19,
    blockstunFrames: 11,
    push: 170,
    lifeFrames: 160,
    spin: 7,
    wobble: 6,
    staggerFrames: 8,
    impactLabel: "HEXED",
    variants: Object.freeze({
      // EX: LINGERING CURSE — the charm settles where it lands and hexes the
      // ground itself, a pine-green zone that saps anyone standing in it.
      ex: Object.freeze({
        name: "LINGERING CURSE",
        damage: 8,
        lifeFrames: 210,
        hazardFrames: 140,
        hazardArmFrames: 20,
        hazardWidth: 120,
        slowFrames: 60,
        staggerFrames: 0,
      }),
    }),
    sound: "charm",
  }),
  // R2.0 FAMILY wave 16 — the steel cane the backlog reserved for the
  // Commissioner. A hard, flat, end-over-end steel throw: fast, heavy on the
  // clean hit, and it STAGGERS — the cane buys him the walk-in his feet can't.
  // Punishable recovery keeps it a decision, not a zoning tool.
  commissioner: object("cane", {
    name: "STEEL CANE",
    style: "cane",
    archetype: "authority spacing — one flat steel throw that staggers and opens the walk-in",
    startupFrames: 13,
    activeFrames: 3,
    recoveryFrames: 28,
    usesPerRound: 2,
    speed: 560,
    width: 88,
    height: 20,
    damage: 10,
    chipDamage: 2,
    hitstunFrames: 22,
    blockstunFrames: 12,
    push: 230,
    lifeFrames: 110,
    spin: 9,
    staggerFrames: 8,
    impactLabel: "ORDER RESTORED",
    variants: Object.freeze({
      // EX: the gold-tip serve — faster, harder, and a knockdown on the clean
      // hit, so the contract grab is guaranteed meaty on the wake-up.
      ex: Object.freeze({
        name: "GOLD-TIP CANE",
        speed: 640,
        damage: 11,
        hitstunFrames: 24,
        push: 260,
        spin: 13,
        knockdown: true,
        staggerFrames: 0,
      }),
    }),
    sound: "cane",
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
 * the commitment and the recovery that makes a whiff punishable. The EX tier
 * (enhanced: true) selects the authored `ex` variant and carries the Grit
 * price; the pip cost is shared with the base throw in beginAttack.
 */
export function createThrowObjectMove(fighterId, { strength = "light", enhanced = false } = {}) {
  const profile = getThrowable(fighterId);
  if (!profile) return null;
  if (enhanced && !profile.variants?.ex) return null;
  const throwableVariant = enhanced ? "ex"
    : strength === "heavy" && profile.variants?.high ? "high" : "";
  const variant = throwableVariant ? profile.variants[throwableVariant] : null;
  return {
    id: `${fighterId}-throw-${profile.id}${enhanced ? "-ex" : ""}`,
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
    enhancedThrowable: enhanced,
    gritCost: enhanced ? GRIT_RULES.enhancedSpecialCost : 0,
    animation: Object.freeze({ bank: "specials", frames: profile.releaseFrames }),
    command: enhanced ? ENHANCED_THROWABLE_COMMAND.display : THROWABLE_COMMAND.display,
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
