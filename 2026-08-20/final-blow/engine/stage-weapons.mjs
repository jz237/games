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
    cue: "A NEEDLE CLATTERS DOWN THE STATION STAIRS",
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
    cue: "SOMEBODY LOBS A BOTTLE OUT OF THE STANDS",
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
    cue: "A PIGEON TOPPLES OFF THE BOARDWALK RAIL",
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
    cue: "TONGS SLIDE OFF THE STEAM COUNTER",
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
    cue: "A SOUVENIR CUP SLIDES OFF A DECK CHAIR",
  }),
  janney: weapon("brick", {
    name: "LOOSE BRICK",
    style: "brick",
    // 5.3: the lot finally reaches into the fight. A half brick knocked off
    // the boundary wall — the heaviest object in the set and the shortest
    // throw: quick pickup, a flat low arc that drops fast, the biggest single
    // hit and a stagger, but it is gone in a metre and a half if you whiff.
    pickupFrames: 7,
    speed: 470,
    gravity: 1420,
    launchY: -120,
    width: 48,
    height: 26,
    // The audited stage-weapon envelope (engine/polish.mjs
    // auditTournamentItems) is damage <= 14, chip <= 2, hitstun <= 24: the
    // brick sits at the ceiling of all three, which is the point — it is the
    // biggest single hit in the set, paid for with the shortest throw.
    damage: 14,
    chipDamage: 2,
    hitstunFrames: 24,
    staggerFrames: 12,
    push: 350,
    lifeFrames: 110,
    spin: 12,
    grit: true,
    cue: "A BRICK KNOCKS LOOSE OFF THE LOT WALL",
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

// ---------------------------------------------------------------------------
// 5.3 SPECTACLE — arrival choreography
// ---------------------------------------------------------------------------
/**
 * Where the weapon comes FROM, and how it gets to its landing slot.
 *
 * Through 5.2 every arrival was the same warm scorch mark with the object
 * dropped 150 px straight down onto it, on every stage, while the cue text
 * promised something physical ("TONGS CLATTER OFF THE STEAM TABLE"). The one
 * scripted moment where the stage reaches into the fight read as a UI decal.
 *
 * Each stage now has a source anchored to its plate (the station stairs, the
 * Vet's stands, the boardwalk rail, the steam counter, a deck chair, the
 * lot's brick wall) and its own path from there to the slot. This is
 * PRESENTATION ONLY: the landing x, the spawn frame and telegraphFrames are
 * untouched, so planStageWeapon / canWeaponArrive stay byte-identical and a
 * replay lands the object on the same pixel on the same tick as before.
 *
 * The pose is a pure function of the telegraph progress, so both renderers
 * (and any probe) can ask where the object is at 40% of its arrival.
 */
export const STAGE_WEAPON_ARRIVALS = Object.freeze({
  somerset: Object.freeze({
    kind: "stairs",
    from: "the station stairs",
    // The Somerset entrance steps sit centre-left in the plate; 240 px above
    // the floor line is the top tread, measured off the plate.
    originX: 516, height: 240, steps: 3,
    debris: "grit", tint: "#c9c2b2",
  }),
  vet: Object.freeze({
    kind: "lob",
    from: "the stands",
    // Lobbed from the far side of the lot, over the fight: the source is
    // whichever side of the frame the slot is NOT on.
    originX: null, side: "far", height: 430, arc: 120,
    debris: "grit", tint: "#e6d3a2",
  }),
  wildwood: Object.freeze({
    kind: "rail",
    from: "the boardwalk rail",
    // The rail runs across the back of the boards: the pigeon topples off it
    // just behind the slot.
    originX: null, back: 78, height: 196,
    debris: "feathers", tint: "#cfd6e2",
  }),
  buffet: Object.freeze({
    kind: "counter",
    from: "the steam counter",
    // The steam table line runs left to right behind the fight plane; 240 px
    // above the floor line is the tray lip, measured off the plate.
    originX: 300, height: 240,
    debris: "steam", tint: "#e3ecf6",
  }),
  cruise: Object.freeze({
    kind: "chair",
    from: "a deck chair",
    // The loungers are ranked along both ends of the deck, not beside the
    // pool: the cup slides off the NEAREST one and skids across the boards.
    originX: null, side: "near", inset: 164, height: 190,
    debris: "spray", tint: "#9fe4ff",
  }),
  janney: Object.freeze({
    kind: "wall",
    from: "the lot wall",
    // The rowhouse party wall at the far end of the lot, above the parked
    // cars: 300 px above the floor line in the plate.
    originX: null, side: "far", height: 300,
    debris: "brickdust", tint: "#c98a5a",
  }),
});

const DEFAULT_FLOOR = 600;

export function getWeaponArrival(stageId) {
  return STAGE_WEAPON_ARRIVALS[stageId] || null;
}

/** Absolute sim-space point the object leaves from. */
export function weaponArrivalOrigin(stageId, landingX, { floor = DEFAULT_FLOOR, minX = 76, maxX = 1204 } = {}) {
  const arrival = getWeaponArrival(stageId);
  if (!arrival) return null;
  const middle = (minX + maxX) * 0.5;
  let x = arrival.originX;
  if (x == null) {
    if (arrival.side === "far") {
      // Comes in over the fight from the far side of the frame.
      x = landingX < middle ? maxX - 56 : minX + 56;
    } else if (arrival.side === "near") {
      // Comes off the furniture ranked along the nearest end of the stage.
      const inset = arrival.inset || 164;
      x = landingX < middle ? minX + inset : maxX - inset;
    } else {
      // Comes off a piece of furniture just behind the slot; the back offset
      // flips near the frame edges so the source is never off-screen.
      const back = arrival.back || 80;
      x = landingX - back < minX + 30 ? landingX + back : landingX - back;
    }
  }
  return { x, y: floor - arrival.height };
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * The object's pose at `progress` (0 = leaving the furniture, 1 = at rest on
 * the landing slot). Returns absolute sim coordinates plus the draw angle and
 * the leg of the choreography, so a probe can assert "at 40% the brick is
 * still in the air off the wall".
 *
 * pose(1) is exactly (landingX, floor) for every kind — the grounded draw is
 * unchanged from 5.2.
 */
export function weaponArrivalPose(stageId, landingX, progress, options = {}) {
  const pose = arrivalPose(stageId, landingX, progress, options);
  // The last frame of the arrival IS the grounded draw: snap the float dust
  // off the end of the path so the hand-off is exact on every kind.
  if (progress >= 1) {
    pose.x = landingX;
    pose.y = options.floor ?? DEFAULT_FLOOR;
    pose.leg = "rest";
    pose.airborne = false;
  }
  return pose;
}

function arrivalPose(stageId, landingX, progress, options = {}) {
  const floor = options.floor ?? DEFAULT_FLOOR;
  const arrival = getWeaponArrival(stageId);
  const origin = weaponArrivalOrigin(stageId, landingX, { floor, ...options });
  const p = clamp01(progress);
  if (!arrival || !origin) {
    // No choreography: the 5.2 vertical drop, kept as the fallback.
    return { x: landingX, y: floor - 150 * (1 - p), angle: p * 6.2, leg: "drop", airborne: p < 1 };
  }
  const dx = landingX - origin.x;
  const dy = floor - origin.y;
  switch (arrival.kind) {
    // Tread, drop, tread: the needle clatters down three steps and skitters
    // out across the pavement.
    case "stairs": {
      const steps = arrival.steps || 3;
      const index = Math.min(steps - 1, Math.floor(p * steps));
      const f = clamp01(p * steps - index);
      // Flat along the tread, then the fall to the next one.
      const fallen = (index + Math.max(0, (f - 0.5) * 2)) / steps;
      return {
        x: origin.x + dx * ((index + f) / steps),
        y: origin.y + dy * fallen - 14 * Math.sin(Math.PI * f),
        angle: p * Math.PI * 2.4,
        leg: `step${index + 1}`,
        airborne: f > 0.5 && p < 1,
      };
    }
    // Lobbed out of the stands: a high spinning arc over the whole lot.
    case "lob": {
      return {
        x: origin.x + dx * p,
        y: origin.y + dy * p - (arrival.arc || 120) * Math.sin(Math.PI * p),
        angle: p * Math.PI * 4,
        leg: "arc",
        airborne: p < 1,
      };
    }
    // Topples over the rail, then falls off the back of the boards.
    case "rail": {
      if (p < 0.34) {
        const q = p / 0.34;
        return {
          x: origin.x + 14 * q,
          y: origin.y - 7 * Math.sin(Math.PI * q),
          angle: q * 1.5,
          leg: "tip",
          airborne: false,
        };
      }
      const q = (p - 0.34) / 0.66;
      return {
        x: origin.x + 14 + (landingX - origin.x - 14) * q,
        y: origin.y + dy * q * q,
        angle: 1.5 + q * 3.4,
        leg: "fall",
        airborne: p < 1,
      };
    }
    // Slides the length of the steam counter, tips off the end, falls.
    case "counter": {
      const tipX = landingX + Math.sign(dx || 1) * 18;
      if (p < 0.55) {
        const q = p / 0.55;
        return {
          x: origin.x + (tipX - origin.x) * easeOut(q),
          y: origin.y + Math.sin(q * 22) * 1.6,
          angle: Math.sin(q * 14) * 0.12,
          leg: "slide",
          airborne: false,
        };
      }
      const q = (p - 0.55) / 0.45;
      return {
        x: tipX + (landingX - tipX) * q,
        y: origin.y + dy * q * q,
        angle: q * q * 3.2,
        leg: "tip",
        airborne: p < 1,
      };
    }
    // Down the tilted back of a lounger, then a flop onto the wet deck.
    case "chair": {
      const footX = origin.x + dx * 0.55;
      const footY = floor - 40;
      if (p < 0.45) {
        const q = p / 0.45;
        const e = q * q;
        return {
          x: origin.x + (footX - origin.x) * e,
          y: origin.y + (footY - origin.y) * e,
          angle: -0.5 + q * 0.9,
          leg: "slide",
          airborne: false,
        };
      }
      const q = (p - 0.45) / 0.55;
      return {
        x: footX + (landingX - footX) * q,
        y: footY + (floor - footY) * q * q - 12 * Math.sin(Math.PI * q),
        angle: 0.4 + q * 1.8,
        leg: "flop",
        airborne: q < 0.9,
      };
    }
    // Knocked off the wall, one hard bounce off the rubble, then a skitter.
    case "wall": {
      if (p < 0.3) {
        const q = p / 0.3;
        return {
          x: origin.x + dx * 0.22 * q,
          y: origin.y + dy * q * q,
          angle: q * 1.2,
          leg: "fall",
          airborne: true,
        };
      }
      if (p < 0.62) {
        const q = (p - 0.3) / 0.32;
        return {
          x: origin.x + dx * (0.22 + 0.38 * q),
          y: floor - 46 * Math.sin(Math.PI * q),
          angle: 1.2 + q * 2.4,
          leg: "bounce",
          airborne: q > 0.05 && q < 0.95,
        };
      }
      const q = (p - 0.62) / 0.38;
      return {
        x: origin.x + dx * (0.6 + 0.4 * easeOut(q)),
        y: floor - 9 * Math.sin(Math.PI * q),
        angle: 3.6 + easeOut(q) * 1.9,
        leg: "skitter",
        airborne: false,
      };
    }
    default:
      return { x: landingX, y: floor - 150 * (1 - p), angle: p * 6.2, leg: "drop", airborne: p < 1 };
  }
}
