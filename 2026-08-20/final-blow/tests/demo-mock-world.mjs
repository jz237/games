import { createDemoChoreographer } from "../engine/demo-choreo.mjs";
import { GRIT_RULES } from "../engine/combos.mjs";

// Sim-lite world for the demo choreography tests (see demo-coverage.test.mjs
// for the contract description). Not a test file itself.

const KNOCKDOWN_ACTIONS = new Set([
  "heavy-crouch", "special", "commandSpecial", "backSpecial", "driveHeavy",
  "super", "enhanced", "enhancedCommandSpecial", "enhancedBackSpecial",
]);
const GROUND_ONLY = new Set([
  "throw", "throwObject", "enhancedThrowObject", "commandSpecial", "backSpecial",
  "launcher", "driveHeavy", "enhanced", "enhancedCommandSpecial",
  "enhancedBackSpecial", "enhancedLauncher", "super",
]);
const ACTION_ORDER = [
  "super", "enhancedLauncher", "enhancedBackSpecial", "enhancedCommandSpecial",
  "enhanced", "enhancedThrowObject", "launcher", "backSpecial", "driveHeavy",
  "commandSpecial", "throwObject", "special", "throw", "heavy", "light",
];

function makeMockFighter(x, facing) {
  return {
    x, facing, grounded: true, down: 0, pendingKnockdown: false,
    wakeupFrames: 0, hitstunFrames: 0, blockstunFrames: 0, dizzyFrames: 0,
    tauntFrames: 0, grabbed: false, grabbing: false,
    meter: 100, stunMeter: 0, throwableUses: 2, carriedWeapon: false,
    dashFrames: 0, dashDirection: 0, vx: 0, vy: 0,
    busyFrames: 0, startupLeft: 0, guardHeld: false, crouch: false,
    lastTap: { left: -Infinity, right: -Infinity },
    prevDir: { left: false, right: false },
    airFrames: 0,
  };
}

function mockView(world) {
  return {
    tick: world.tick,
    phase: "fight",
    stageMinX: 76,
    stageMaxX: 1204,
    weapon: world.weapon ? { phase: world.weapon.phase, x: world.weapon.x } : null,
    fighters: world.fighters.map((fighter) => ({
      x: fighter.x, facing: fighter.facing, grounded: fighter.grounded,
      down: fighter.down > 0, pendingKnockdown: fighter.pendingKnockdown,
      wakeupFrames: fighter.wakeupFrames, hitstunFrames: fighter.hitstunFrames,
      blockstunFrames: fighter.blockstunFrames, dizzyFrames: fighter.dizzyFrames,
      tauntFrames: fighter.tauntFrames, attacking: fighter.busyFrames > 0,
      crouch: fighter.crouch,
      grabbed: fighter.grabbed, grabbing: fighter.grabbing,
      meter: fighter.meter, stunMeter: fighter.stunMeter,
      throwableUses: fighter.throwableUses, carriedWeapon: fighter.carriedWeapon,
      dashFrames: fighter.dashFrames, dashDirection: fighter.dashDirection,
      vx: fighter.vx, vy: fighter.vy,
    })),
  };
}

function actionableMock(fighter) {
  return fighter.grounded && fighter.busyFrames <= 0 && fighter.down <= 0
    && fighter.wakeupFrames <= 0 && fighter.hitstunFrames <= 0
    && fighter.blockstunFrames <= 0 && fighter.dizzyFrames <= 0
    && fighter.tauntFrames <= 0 && !fighter.grabbed;
}

export function createMockWorld({ pair, stageId, hasStageWeapon, seed }) {
  const choreo = createDemoChoreographer({ pair, stageId, hasStageWeapon, seed });
  const world = {
    tick: 0,
    fighters: [makeMockFighter(420, 1), makeMockFighter(860, -1)],
    weapon: null,
    pendingHits: [],
    choreo,
  };

  function noteKnockdown(side) {
    world.choreo.noteBeat(side, "knockdown");
    world.fighters[side].down = 45;
    world.fighters[side].pendingKnockdown = false;
    world.fighters[side].grounded = true;
    world.fighters[side].airFrames = 0;
    world.fighters[side].hitstunFrames = 0;
  }

  function resolveHit(hit) {
    const attacker = world.fighters[hit.side];
    const victim = world.fighters[1 - hit.side];
    const distance = Math.abs(attacker.x - victim.x);
    if (distance > hit.reach || victim.down > 0) return;
    if (hit.action === "throw") {
      if (!victim.grounded) return;
      world.choreo.noteBeat(hit.side, "throw");
      victim.x += attacker.facing * 60;
      noteKnockdown(1 - hit.side);
      return;
    }
    if (victim.guardHeld && victim.grounded) {
      victim.blockstunFrames = 12;
      return; // guardedContact lands via observe()'s blockstun edge
    }
    if (victim.startupLeft > 0) world.choreo.noteBeat(hit.side, "counterhit");
    if (!victim.grounded && victim.pendingKnockdown) world.choreo.noteBeat(hit.side, "juggle");
    victim.hitstunFrames = 18;
    victim.stunMeter += hit.stun;
    if (victim.stunMeter >= 100) {
      victim.stunMeter = 0;
      victim.dizzyFrames = 120;
      victim.hitstunFrames = 0;
      world.choreo.noteBeat(1 - hit.side, "dizzy");
    }
    attacker.meter = Math.min(100, attacker.meter + 9);
    victim.meter = Math.min(100, victim.meter + 4); // damage-taken Grit gain
    if (hit.action === "launcher" || hit.action === "enhancedLauncher") {
      victim.grounded = false;
      victim.pendingKnockdown = true;
      victim.airFrames = 26;
      victim.vy = -400;
    } else if (KNOCKDOWN_ACTIONS.has(hit.tag)) {
      noteKnockdown(1 - hit.side);
    }
    const before = victim.x;
    victim.x += attacker.facing * hit.push;
    const clamped = Math.min(1204, Math.max(76, victim.x));
    if (clamped !== victim.x && hit.push >= 40 && before !== clamped) {
      world.choreo.noteBeat(1 - hit.side, "wallsplat");
    }
    victim.x = clamped;
  }

  function applyInput(side, input) {
    const fighter = world.fighters[side];
    const opponent = world.fighters[1 - side];
    fighter.guardHeld = false;
    if (!input) input = {};
    // dash double-tap edges (12-tick window, genuine release required)
    for (const dir of ["left", "right"]) {
      if (input[dir] && !fighter.prevDir[dir]) {
        if (world.tick - fighter.lastTap[dir] <= 12 && actionableMock(fighter) && !input.down) {
          fighter.dashFrames = 10;
          fighter.dashDirection = dir === "right" ? 1 : -1;
        }
        fighter.lastTap[dir] = world.tick;
      }
      fighter.prevDir[dir] = Boolean(input[dir]);
    }
    // Airborne attacks: the real sim buffers light/heavy/special presses in
    // the air branch and starts the air normal immediately.
    if (!fighter.grounded && fighter.busyFrames <= 0 && fighter.hitstunFrames <= 0
      && !fighter.pendingKnockdown && fighter.down <= 0) {
      const airAction = ["special", "heavy", "light"].find((name) => input[name]);
      if (airAction) {
        world.choreo.noteMove(side, airAction, {
          airborne: true,
          crouching: false,
          forwardHeld: false,
          limb: input.limb === "kick" ? "kick" : "punch",
        });
        fighter.busyFrames = Math.max(2, fighter.airFrames);
        fighter.startupLeft = airAction === "light" ? 5 : 9;
        world.pendingHits.push({
          side, action: airAction, tag: `air-${airAction}`,
          resolveTick: world.tick + fighter.startupLeft,
          reach: 210, push: 25, stun: airAction === "light" ? 9 : 17,
        });
      }
      return;
    }
    if (!actionableMock(fighter)) return;
    fighter.crouch = Boolean(input.down);
    if (input.guard) fighter.guardHeld = true;
    if (input.taunt) {
      fighter.tauntFrames = 45;
      world.choreo.noteBeat(side, "taunt");
      return;
    }
    if (input.jump) {
      fighter.grounded = false;
      fighter.airFrames = 30;
      fighter.vy = -500;
      const towardRight = opponent.x > fighter.x;
      const forwardHeld = towardRight ? input.right : input.left;
      const backHeld = towardRight ? input.left : input.right;
      fighter.vx = forwardHeld ? fighter.facing * 300 : backHeld ? -fighter.facing * 260 : 0;
      return;
    }
    // stage weapon pickup outranks the crouching heavy exactly like game.js
    if (input.down && input.heavy && world.weapon?.phase === "ground"
      && Math.abs(fighter.x - world.weapon.x) <= 80) {
      world.weapon.phase = "held";
      fighter.carriedWeapon = true;
      world.choreo.noteBeat(side, "weaponPickup");
      return;
    }
    let action = ACTION_ORDER.find((name) => input[name]);
    if (!action) {
      if (input.left) fighter.x -= 5;
      if (input.right) fighter.x += 5;
      return;
    }
    const towardRight = opponent.x > fighter.x;
    const forwardHeld = towardRight ? Boolean(input.right) : Boolean(input.left);
    const backHeld = towardRight ? Boolean(input.left) : Boolean(input.right);
    // SF2 proximity-grab conversion (the trap forward normals must dodge)
    if (action === "light" && (forwardHeld || backHeld)
      && Math.abs(opponent.x - fighter.x) <= 119 && opponent.grounded && opponent.down <= 0) {
      action = "throw";
    }
    if (GROUND_ONLY.has(action) && !fighter.grounded) return;
    const cost = action === "super" ? GRIT_RULES.superCost
      : action.startsWith("enhanced") ? GRIT_RULES.enhancedSpecialCost : 0;
    if (fighter.meter < cost) return;
    if ((action === "throwObject" || action === "enhancedThrowObject") && fighter.throwableUses <= 0) return;
    const context = {
      airborne: !fighter.grounded,
      crouching: Boolean(input.down),
      forwardHeld,
      limb: input.limb === "kick" ? "kick" : "punch",
    };
    world.choreo.noteMove(side, action, context);
    fighter.meter -= cost;
    if (action === "throwObject" || action === "enhancedThrowObject") fighter.throwableUses -= 1;
    const light = action === "light";
    fighter.busyFrames = light ? 14 : 24;
    fighter.startupLeft = light ? 5 : 13;
    const tag = ["light", "heavy"].includes(action) && context.crouching ? `${action}-crouch` : action;
    world.pendingHits.push({
      side,
      action,
      tag,
      resolveTick: world.tick + fighter.startupLeft,
      reach: action === "throw" ? 90 : action === "driveHeavy" ? 240 : 210,
      push: light ? 12 : action === "driveHeavy" ? 70 : ["heavy"].includes(action) ? 40 : 55,
      stun: light ? 9 : action === "heavy" ? 17 : 20,
    });
  }

  function physics() {
    for (const fighter of world.fighters) {
      if (fighter.busyFrames > 0) fighter.busyFrames -= 1;
      if (fighter.startupLeft > 0) fighter.startupLeft -= 1;
      if (fighter.hitstunFrames > 0) fighter.hitstunFrames -= 1;
      if (fighter.blockstunFrames > 0) fighter.blockstunFrames -= 1;
      if (fighter.dizzyFrames > 0) fighter.dizzyFrames -= 1;
      if (fighter.tauntFrames > 0) fighter.tauntFrames -= 1;
      if (fighter.dashFrames > 0) {
        fighter.x += fighter.dashDirection * 9;
        fighter.dashFrames -= 1;
      }
      if (!fighter.grounded) {
        fighter.airFrames -= 1;
        fighter.vy += 34;
        fighter.x += fighter.vx / 60;
        if (fighter.airFrames <= 0) {
          fighter.grounded = true;
          fighter.vy = 0;
          fighter.vx = 0;
          if (fighter.pendingKnockdown) noteKnockdown(world.fighters.indexOf(fighter));
        }
      }
      if (fighter.down > 0) {
        fighter.down -= 1;
        if (fighter.down === 0) fighter.wakeupFrames = 12;
      } else if (fighter.wakeupFrames > 0) {
        fighter.wakeupFrames -= 1;
      }
      if (fighter.stunMeter > 0 && fighter.hitstunFrames <= 0) {
        fighter.stunMeter = Math.max(0, fighter.stunMeter - 0.2);
      }
      fighter.meter = Math.min(100, fighter.meter + 0.15);
      fighter.x = Math.min(1204, Math.max(76, fighter.x));
    }
    const [first, second] = world.fighters;
    first.facing = second.x >= first.x ? 1 : -1;
    second.facing = -first.facing;
  }

  function tick() {
    world.tick += 1;
    if (world.hasWeaponPlanned === undefined) world.hasWeaponPlanned = hasStageWeapon;
    if (hasStageWeapon && !world.weapon && world.tick >= 300) {
      world.weapon = { phase: "ground", x: 640 };
    }
    const view = mockView(world);
    world.choreo.observe(view);
    const inputs = [world.choreo.step(0, view), world.choreo.step(1, view)];
    for (const side of [0, 1]) {
      let input = inputs[side];
      if (!input) {
        // stand-in for the archetype brain during natural windows
        const self = world.fighters[side];
        const opponent = world.fighters[1 - side];
        const distance = Math.abs(opponent.x - self.x);
        input = {};
        if (distance > 240) input[opponent.x > self.x ? "right" : "left"] = true;
        else if (world.tick % 90 === side * 17) input.light = true;
      }
      applyInput(side, input);
    }
    const due = world.pendingHits.filter((hit) => hit.resolveTick <= world.tick);
    world.pendingHits = world.pendingHits.filter((hit) => hit.resolveTick > world.tick);
    for (const hit of due) resolveHit(hit);
    physics();
  }

  return { world, choreo, tick };
}

