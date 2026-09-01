import { createDemoChoreographer } from "../engine/demo-choreo.mjs";
import { COMBO_RULES, GRIT_RULES } from "../engine/combos.mjs";
import { STUN_RULES, WALL_BOUNCE_RULES, qualifiesForWallBounce } from "../engine/defense.mjs";
import { createFighterMove } from "../engine/fighter-kits.mjs";

// Sim-lite world for the demo choreography tests (see demo-coverage.test.mjs
// for the contract description). Not a test file itself.

// v2.9 round 4 — the mock's wall-splat model used to be "a push big enough to
// shove the victim past the clamp", which is only the game's SECONDARY route
// (|vx| > 220 at the clamp) and is why a herd of drive heavies looked like it
// worked here. The primary and deterministic route is the ARMED CORNER BOUNCE:
// a knockdown-class heavy/special connecting while the victim is within one
// body width of the wall it is being pushed toward sets the carry to 680, so
// the flight always reaches the clamp and always splats. Modelling only the
// secondary route made this harness reward exactly the wrong move set.
const BODY_WIDTH = 105; // Math.round(92 * FIGHTER_SCALE)
const WALL_BOUNCE_GAP = BODY_WIDTH * WALL_BOUNCE_RULES.proximityBodyWidths;
// Per-fighter, per-action: does this move arm the corner bounce? Read straight
// off the real attack instance so the harness and the sim agree.
const wallBounceCache = new Map();
function armsWallBounce(fighterId, action, context) {
  const key = `${fighterId}|${action}|${context.crouching ? "c" : ""}${context.forwardHeld ? "f" : ""}${context.airborne ? "a" : ""}${context.limb}`;
  if (!wallBounceCache.has(key)) {
    let move = null;
    try { move = createFighterMove(fighterId, action, context); } catch { move = null; }
    wallBounceCache.set(key, qualifiesForWallBounce(move));
  }
  return wallBounceCache.get(key);
}

// Damage is only modelled so the choreographer's LOPSIDEDNESS signal has
// something to read (see the coverage-gap yield): the mock has no rounds, so
// health floors instead of ending the match.
const DAMAGE = { light: 4, heavy: 8 };

// v2.9 round 4: which moves knock down is READ OFF THE KIT, not guessed from
// the action name. The old shared set said every special/EX/drive floors the
// victim, which is false for most kits — and it mattered, because a knockdown
// is what ends a stun string (the get-up hands the decay ~60 free frames), so
// the harness was punishing a string the sim would have let run.
const knockdownCache = new Map();
function knocksDownMove(fighterId, action, context) {
  const key = `${fighterId}|${action}|${context.crouching ? "c" : ""}${context.forwardHeld ? "f" : ""}${context.airborne ? "a" : ""}${context.limb}`;
  if (!knockdownCache.has(key)) {
    let move = null;
    try { move = createFighterMove(fighterId, action, context); } catch { move = null; }
    knockdownCache.set(key, Boolean(move
      && (move.knockdown || move.knockdownOnFinal || move.launchVelocityY || move.juggleLift)));
  }
  return knockdownCache.get(key);
}
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

function makeMockFighter(x, facing, kitId = "") {
  return {
    kitId,
    x, facing, grounded: true, down: 0, pendingKnockdown: false,
    wakeupFrames: 0, hitstunFrames: 0, blockstunFrames: 0, dizzyFrames: 0,
    tauntFrames: 0, grabbed: false, grabbing: false,
    meter: 100, stunMeter: 0, throwableUses: 2, carriedWeapon: false, carryFrames: 0,
    dashFrames: 0, dashDirection: 0, vx: 0, vy: 0,
    busyFrames: 0, startupLeft: 0, guardHeld: false, crouch: false,
    // v2.9 round 2: the sim only opens a cancel window on a CONFIRMED hit
    // (tryAttackCancel bails on an empty attackConnected), and it is cleared
    // when the next attack starts. The choreographer's chain links are gated
    // on it, so the sim-lite world has to honour the same contract.
    attackConnected: false,
    lastTap: { left: -Infinity, right: -Infinity },
    prevDir: { left: false, right: false },
    airFrames: 0,
    // v2.9 round 4: the three sim fields the choreographer now reads.
    // health drives the lopsidedness signal; juggleCount + wallBounceUsed are
    // what decide whether a victim can still be armed for a corner bounce
    // (once per combo, and it spends a juggle point).
    health: 100,
    juggleCount: 0,
    wallBounceUsed: false,
    // The real stun clock: every connected hit re-arms a 48-frame grace, so
    // a string that keeps landing loses NOTHING. Modelling a flat drain (the
    // old 0.2/frame with no grace) is what made a lights-only stun string look
    // viable here when it is not.
    stunDecayDelay: 0,
    // Cancel links spent on the current swing (see the cancel route below).
    cancelLinks: 0,
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
      crouch: fighter.crouch, guarding: fighter.guardHeld,
      grabbed: fighter.grabbed, grabbing: fighter.grabbing,
      attackConnected: fighter.attackConnected,
      meter: fighter.meter, stunMeter: fighter.stunMeter,
      throwableUses: fighter.throwableUses, carriedWeapon: fighter.carriedWeapon,
      dashFrames: fighter.dashFrames, dashDirection: fighter.dashDirection,
      vx: fighter.vx, vy: fighter.vy,
      health: fighter.health,
      juggleCount: fighter.juggleCount,
      wallBounceUsed: fighter.wallBounceUsed,
    })),
  };
}

function actionableMock(fighter) {
  return fighter.grounded && fighter.busyFrames <= 0 && fighter.down <= 0
    && fighter.wakeupFrames <= 0 && fighter.hitstunFrames <= 0
    && fighter.blockstunFrames <= 0 && fighter.dizzyFrames <= 0
    && fighter.tauntFrames <= 0 && !fighter.grabbed;
}

export function createMockWorld({
  pair, stageId, hasStageWeapon, seed, priorShown = null,
  // v2.9 round 2: with confirms switched off the sim never opens a cancel
  // window, which is what a whiffing exhibition looks like. The choreographer
  // must then issue ZERO chain links (see the gate in chainItem).
  confirmHits = true,
  // v3.2 SHOWCASE: the locomotion bias, passed straight through. 0 is the
  // attract default and every pre-3.2 caller leaves it there.
  locomotion = 0,
} = {}) {
  const choreo = createDemoChoreographer({
    pair, stageId, hasStageWeapon, seed, priorShown, locomotion,
  });
  const world = {
    tick: 0,
    fighters: [makeMockFighter(420, 1, pair[0]), makeMockFighter(860, -1, pair[1])],
    weapon: null,
    pendingHits: [],
    census: { ticks: 0, inert: [0, 0], run: [0, 0], longest: [0, 0] },
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
    if (confirmHits) attacker.attackConnected = true;
    if (hit.action === "throw") {
      if (!victim.grounded) return;
      world.choreo.noteBeat(hit.side, "throw");
      victim.x += attacker.facing * 60;
      // A throw clears the combo, so the corner conversion re-arms with it.
      victim.wallBounceUsed = false;
      victim.juggleCount = 0;
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
    victim.health = Math.max(5, victim.health - (DAMAGE[hit.action] || 10));
    victim.stunMeter += hit.stun;
    // The real clock: a connected hit re-arms the 48-frame decay grace.
    victim.stunDecayDelay = STUN_RULES.decayGraceFrames;
    if (victim.stunMeter >= STUN_RULES.threshold) {
      victim.stunMeter = 0;
      victim.dizzyFrames = 120;
      victim.hitstunFrames = 0;
      world.choreo.noteBeat(1 - hit.side, "dizzy");
    }
    // v2.9 round 4 — THE ARMED CORNER BOUNCE, the sim's primary splat route.
    // A qualifying knockdown heavy/special landing with the victim already
    // inside one body width of the wall it is being driven toward commits the
    // flight to that wall (carryVelocityX 680) and the clamp then always fires
    // spawnWallImpact. Once per combo, and it spends a juggle point.
    const pushDirection = attacker.facing;
    const wallX = pushDirection > 0 ? 1204 : 76;
    if (hit.wallBounce && !victim.wallBounceUsed
      && victim.juggleCount < COMBO_RULES.juggleLimit
      && Math.abs(wallX - victim.x) <= WALL_BOUNCE_GAP) {
      victim.wallBounceUsed = true;
      victim.juggleCount += 1;
      victim.x = wallX;
      world.choreo.noteBeat(1 - hit.side, "wallsplat");
      victim.hitstunFrames = WALL_BOUNCE_RULES.hitstunFrames;
      return;
    }
    attacker.meter = Math.min(100, attacker.meter + 9);
    victim.meter = Math.min(100, victim.meter + 4); // damage-taken Grit gain
    if (hit.action === "launcher" || hit.action === "enhancedLauncher") {
      victim.grounded = false;
      victim.pendingKnockdown = true;
      victim.airFrames = 26;
      victim.vy = -400;
    } else if (hit.knockdown) {
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
    if (fighter.grounded) fighter.vx = 0;
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
        fighter.attackConnected = false;
        fighter.busyFrames = Math.max(2, fighter.airFrames);
        fighter.startupLeft = airAction === "light" ? 5 : 9;
        world.pendingHits.push({
          side, action: airAction, tag: `air-${airAction}`,
          resolveTick: world.tick + fighter.startupLeft,
          reach: 210, push: 25, stun: airAction === "light" ? 9 : 17,
          wallBounce: armsWallBounce(fighter.kitId, airAction, {
            airborne: true, crouching: false, forwardHeld: false,
            limb: input.limb === "kick" ? "kick" : "punch",
          }),
          knockdown: knocksDownMove(fighter.kitId, airAction, {
            airborne: true, crouching: false, forwardHeld: false,
            limb: input.limb === "kick" ? "kick" : "punch",
          }),
        });
      }
      return;
    }
    // v2.9 round 4 — CANCELS. combos.mjs opens a cancel route the tick the sim
    // confirms a hit, and the choreographer's stun string now depends on it
    // (a link lands inside the victim's hitstun, so the 48-frame decay grace
    // never expires — see runPressure). A harness that could only ever poke
    // would have made that string look impossible. Route table simplified to
    // the contract the choreographer uses: a CONFIRMED swing cancels into a
    // heavy or a special, at most twice per attack.
    if (fighter.grounded && fighter.busyFrames > 0 && fighter.attackConnected
      && fighter.down <= 0 && fighter.hitstunFrames <= 0 && fighter.cancelLinks < 2) {
      const cancelInto = ACTION_ORDER.find((name) => input[name] && name !== "light" && name !== "throw");
      if (cancelInto && !(GROUND_ONLY.has(cancelInto) && !fighter.grounded)) {
        const cost = cancelInto === "super" ? GRIT_RULES.superCost
          : cancelInto.startsWith("enhanced") ? GRIT_RULES.enhancedSpecialCost : 0;
        if (fighter.meter >= cost) {
          const context = {
            airborne: false, crouching: Boolean(input.down), forwardHeld: false,
            limb: input.limb === "kick" ? "kick" : "punch",
          };
          world.choreo.noteMove(side, cancelInto, context);
          fighter.meter -= cost;
          fighter.cancelLinks += 1;
          fighter.attackConnected = false;
          fighter.busyFrames = 24;
          fighter.startupLeft = 4; // cancels skip most of the startup
          const tag = ["heavy"].includes(cancelInto) && context.crouching ? `${cancelInto}-crouch` : cancelInto;
          world.pendingHits.push({
            side, action: cancelInto, tag,
            resolveTick: world.tick + fighter.startupLeft,
            reach: cancelInto === "driveHeavy" ? 240 : 210,
            push: cancelInto === "driveHeavy" ? 70 : cancelInto === "heavy" ? 40 : 55,
            stun: cancelInto === "heavy" ? 17 : 20,
            wallBounce: armsWallBounce(fighter.kitId, cancelInto, context),
            knockdown: knocksDownMove(fighter.kitId, cancelInto, context),
          });
          return;
        }
      }
    }
    if (!actionableMock(fighter)) return;
    fighter.cancelLinks = 0;
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
      fighter.carryFrames = 0;
      world.choreo.noteBeat(side, "weaponPickup");
      return;
    }
    // While carrying, HP throws the weapon instead of leaking out as a normal
    // — and the pickup press itself must not double as the throw.
    if (fighter.carriedWeapon) {
      if (input.heavy && fighter.carryFrames >= 9) {
        fighter.carriedWeapon = false;
        fighter.carryFrames = 0;
        world.weapon.phase = "gone";
        fighter.busyFrames = 22;
        fighter.startupLeft = 12;
      }
      if (!input.heavy) {
        // The carry walk reports vx exactly like the ordinary walk: the
        // choreographer's liveliness watchdog reads it to decide whether the
        // fighter has stopped moving on screen.
        fighter.vx = 0;
        if (input.left) { fighter.x -= 4; fighter.vx = -240; }
        if (input.right) { fighter.x += 4; fighter.vx = 240; }
      }
      return;
    }
    let action = ACTION_ORDER.find((name) => input[name]);
    if (!action) {
      // vx is what the choreographer's liveliness watchdog reads to decide a
      // fighter has stopped moving, so the walk has to report it here too.
      fighter.vx = 0;
      if (input.left) { fighter.x -= 5; fighter.vx = -300; }
      if (input.right) { fighter.x += 5; fighter.vx = 300; }
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
    fighter.attackConnected = false;
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
      // Grab reach tracks the real hitbox geometry (the authored throw boxes
      // resolve to ~140 world units between origins once FIGHTER_SCALE and
      // the defender's hurtbox are counted), not the old flat 90 — otherwise
      // the harness rejects the very spacing the choreographer derives.
      reach: action === "throw" ? 140 : action === "driveHeavy" ? 240 : 210,
      push: light ? 12 : action === "driveHeavy" ? 70 : ["heavy"].includes(action) ? 40 : 55,
      stun: light ? 9 : action === "heavy" ? 17 : 20,
      // Read off the real attack instance, so the harness rewards exactly the
      // moves the sim's corner conversion rewards — and no others.
      wallBounce: armsWallBounce(fighter.kitId, action, context),
      knockdown: knocksDownMove(fighter.kitId, action, context),
    });
  }

  function physics() {
    for (const fighter of world.fighters) {
      if (fighter.busyFrames > 0) {
        fighter.busyFrames -= 1;
        if (fighter.busyFrames === 0) fighter.attackConnected = false;
      }
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
        // The combo ends with the get-up: the once-per-combo corner bounce and
        // the juggle budget both re-arm, exactly as they do in game.js.
        if (fighter.wakeupFrames === 0) {
          fighter.wallBounceUsed = false;
          fighter.juggleCount = 0;
        }
      }
      // The real stun clock (STUN_RULES): a 48-frame grace after the last hit,
      // then 0.62/frame. The old flat 0.2/frame with no grace both punished a
      // slow string that was actually fine and forgave one that had stopped.
      if (fighter.dizzyFrames > 0) {
        // frozen while dizzy
      } else if (fighter.stunDecayDelay > 0) {
        fighter.stunDecayDelay -= 1;
      } else if (fighter.stunMeter > 0) {
        fighter.stunMeter = Math.max(0, fighter.stunMeter - STUN_RULES.decayPerFrame);
      }
      if (fighter.carriedWeapon) fighter.carryFrames += 1;
      fighter.meter = Math.min(100, fighter.meter + 0.15);
      fighter.x = Math.min(1204, Math.max(76, fighter.x));
    }
    const [first, second] = world.fighters;
    first.facing = second.x >= first.x ? 1 : -1;
    second.facing = -first.facing;
  }

  // v2.9 round 2 — the liveliness census, measured with the critic's own
  // definition: a fighter is INERT on a tick when it is not attacking, not in
  // hitstun/blockstun/dizzy/wakeup/knockdown, grounded, not dashing and
  // barely moving. Accumulated here so the coverage tests can pin a ceiling
  // on both the fraction and the longest continuous run.
  function inertMock(fighter) {
    return fighter.grounded && fighter.busyFrames <= 0 && fighter.down <= 0
      && fighter.wakeupFrames <= 0 && fighter.hitstunFrames <= 0
      && fighter.blockstunFrames <= 0 && fighter.dizzyFrames <= 0
      // A taunt is a 45-frame ANIMATION with vx pinned at zero. The critic's
      // written definition does not list it, so the browser census keeps
      // counting it for comparability; the choreographer contract pinned here
      // does not, because staging a taunt is the opposite of standing still.
      && fighter.tauntFrames <= 0
      && fighter.dashFrames <= 0 && Math.abs(fighter.vx) < 3;
  }

  function censusTick() {
    world.census.ticks += 1;
    for (let side = 0; side < 2; side += 1) {
      if (inertMock(world.fighters[side])) {
        world.census.inert[side] += 1;
        world.census.run[side] += 1;
        if (world.census.run[side] > world.census.longest[side]) {
          world.census.longest[side] = world.census.run[side];
        }
      } else world.census.run[side] = 0;
    }
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
    censusTick();
  }

  return { world, choreo, tick, census: () => ({
    ticks: world.census.ticks,
    inert: [...world.census.inert],
    longest: [...world.census.longest],
    fraction: world.census.inert.map((n) => n / Math.max(1, world.census.ticks)),
  }) };
}

