// ===========================================================================
// v2.9 FLOW — coverage-driven demo choreography.
//
// The attract/watch demo used to be two Pro AI brains plus one forced opening
// super: whatever the archetype tables happened to roll was all the cabinet
// ever showed. This module layers a deterministic choreographer over the demo
// CPUs so every exhibition provably works through the featured pair's ENTIRE
// kit — every normal (punch and kick, standing/crouching/air), every command
// normal, every special and EX version, the super, both throws, the taunt,
// the stage weapon where the stage has one — plus the situational beats
// (wall splat, juggle, counter-hit, dizzy, knockdown/wake-up, guarded
// contact, dashes and all three jump arcs).
//
// Contract with game.js (mirrors the demoSession pattern — demo is offline
// and never rolls back, so choreographer state lives beside the sim exactly
// like demoSession.superShown always has):
//   - aiInput still steps the real AI brain every tick; the choreographer's
//     step() either returns a scripted raw input (same vocabulary the brain
//     emits) or null to let the brain play. The blend keeps it a fight.
//   - beginAttack reports every started move through noteMove(); the beat
//     hooks (dizzy, knockdown, wall splat, grab, taunt, pickup, round end)
//     report through noteBeat(); observe() watches per-tick fighter state for
//     movement beats (dash/jump/guard/wake) that have no single call site.
//   - All randomness comes from a private DeterministicRng seeded off the
//     demo cycle, so the same seed replays the same choreography. NO
//     Math.random, and the state.rng stream is left completely untouched.
// ===========================================================================

import { DeterministicRng, hashSeed } from "./foundation.mjs";
import { getKitMoveProfile, selectKitMoveKey } from "./fighter-kits.mjs";
import { getThrowable } from "./throwables.mjs";
import { GRIT_RULES } from "./combos.mjs";

// Coverage share of the pick policy: the rest of the time the choreographer
// deliberately stands down and lets the archetype AI play a natural window.
export const DEMO_COVERAGE_BLEND = 0.6;

// Every beat the demo must stage at least once per exhibition. weaponPickup
// is only targeted when the stage actually plans a weapon; the rest are
// universal. roundEnd/finisher are pure observations of the existing round
// flow (the fatality path respects the gore toggles exactly as before).
export const DEMO_BEATS = Object.freeze([
  "wallsplat", "juggle", "counterhit", "dizzy", "knockdown", "wakeup",
  "throw", "taunt", "guardedContact",
  "dashForward", "dashBack", "jumpForward", "jumpNeutral", "jumpBack",
  "weaponPickup", "roundEnd", "finisher",
  // v2.9 FLOW: the motion2 animation beats the demo must also put on stage.
  // crouchTrans falls out of the staged crouch normals (the hold.down press
  // covers both edges), airAttack falls out of the staged air normals, and
  // turnaround is actively staged as a close-range cross-up jump.
  "crouchTrans", "turnaround", "airAttack",
]);

// The beats the choreographer actively stages (the others fall out of normal
// play and the hooks merely record them).
const STAGED_BEATS = Object.freeze([
  "taunt", "throw", "counterhit", "dizzy", "juggle", "wallsplat",
  "dashForward", "dashBack", "jumpForward", "jumpNeutral", "jumpBack",
  "weaponPickup", "guardedContact", "turnaround",
]);

// The full kit-move grid, in the same action/context vocabulary beginAttack
// resolves through selectKitMoveKey — so the checklist ids and the recorded
// ids agree by construction. Rows missing from a fighter's kit are dropped at
// build time (that is what "command normals if any" means).
const MOVE_ROWS = Object.freeze([
  { action: "light", context: {} },
  { action: "light", context: { forwardHeld: true } },
  { action: "light", context: { crouching: true } },
  { action: "light", context: { limb: "kick" } },
  { action: "light", context: { limb: "kick", forwardHeld: true } },
  { action: "light", context: { limb: "kick", crouching: true } },
  { action: "heavy", context: {} },
  { action: "heavy", context: { forwardHeld: true } },
  { action: "heavy", context: { crouching: true } },
  { action: "heavy", context: { limb: "kick" } },
  { action: "heavy", context: { limb: "kick", forwardHeld: true } },
  { action: "heavy", context: { limb: "kick", crouching: true } },
  { action: "light", context: { airborne: true } },
  { action: "light", context: { airborne: true, limb: "kick" } },
  { action: "heavy", context: { airborne: true } },
  { action: "heavy", context: { airborne: true, limb: "kick" } },
  { action: "special", context: { airborne: true } },
  { action: "special", context: {} },
  { action: "commandSpecial", context: {} },
  { action: "backSpecial", context: {} },
  { action: "launcher", context: {} },
  { action: "driveHeavy", context: {} },
  { action: "enhanced", context: {} },
  { action: "enhancedCommandSpecial", context: {} },
  { action: "enhancedBackSpecial", context: {} },
  { action: "enhancedLauncher", context: {} },
  { action: "super", context: {} },
  { action: "throw", context: {} },
]);

const EX_ACTIONS = new Set([
  "enhanced", "enhancedCommandSpecial", "enhancedBackSpecial", "enhancedLauncher",
]);

/**
 * The stable coverage id for a started move — selectKitMoveKey for the
 * limb/height/air-resolved normals and specials, the raw action for
 * everything else (throw, super, EX flags, throwables).
 */
export function demoCoverageMoveId(action, context = {}) {
  if (["light", "heavy", "special"].includes(action)) return selectKitMoveKey(action, context);
  return action;
}

/** Every kit-move coverage id the demo must show for this fighter. */
export function demoCoverageChecklist(fighterId) {
  const ids = [];
  for (const { action, context } of MOVE_ROWS) {
    if (!getKitMoveProfile(fighterId, action, context)) continue;
    const id = demoCoverageMoveId(action, context);
    if (!ids.includes(id)) ids.push(id);
  }
  const throwable = getThrowable(fighterId);
  if (throwable) ids.push("throwObject");
  if (throwable?.variants?.ex) ids.push("enhancedThrowObject");
  return ids;
}

function emptyInput() {
  return {
    left: false, right: false, down: false, guard: false, jump: false,
    light: false, heavy: false, special: false, enhanced: false, throw: false,
    super: false, final: false,
  };
}

function towardInput(self, opponent) {
  const input = emptyInput();
  const towardRight = opponent.x > self.x;
  input.right = towardRight;
  input.left = !towardRight;
  return input;
}

function awayInput(self, opponent) {
  const input = towardInput(self, opponent);
  [input.left, input.right] = [input.right, input.left];
  return input;
}

function actionable(fighter) {
  return fighter.grounded && !fighter.attacking && !fighter.down
    && fighter.wakeupFrames <= 0 && fighter.hitstunFrames <= 0
    && fighter.blockstunFrames <= 0 && fighter.dizzyFrames <= 0
    && fighter.tauntFrames <= 0 && !fighter.grabbed && !fighter.grabbing;
}

// SF2 proximity-grab conversion turns forward-held lights into throws inside
// ~140px, so forward command normals are staged from a spaced band instead.
const FORWARD_NORMAL_BAND = Object.freeze({ min: 160, max: 215 });

function directiveForMove(id) {
  // Press payloads are SPARSE (only the true flags) so composing them over
  // the direction/crouch holds never clears a held input.
  if (id.startsWith("air")) {
    const press = {};
    if (id === "airSpecial") press.special = true;
    else if (id.startsWith("airLight")) press.light = true;
    else press.heavy = true;
    if (id.endsWith("Kick")) press.limb = "kick";
    return { kind: "air", press, approach: 250 };
  }
  const press = {};
  const spec = { kind: "ground", press, approach: 165, hold: {} };
  switch (id) {
    case "standLight": press.light = true; break;
    case "standLightKick": press.light = true; press.limb = "kick"; break;
    case "crouchLight": press.light = true; spec.hold.down = true; break;
    case "crouchLightKick": press.light = true; press.limb = "kick"; spec.hold.down = true; break;
    case "forwardLight": press.light = true; spec.hold.forward = true; spec.band = FORWARD_NORMAL_BAND; break;
    case "forwardLightKick": press.light = true; press.limb = "kick"; spec.hold.forward = true; spec.band = FORWARD_NORMAL_BAND; break;
    case "standHeavy": press.heavy = true; break;
    case "standHeavyKick": press.heavy = true; press.limb = "kick"; break;
    case "crouchHeavy": press.heavy = true; spec.hold.down = true; break;
    case "crouchHeavyKick": press.heavy = true; press.limb = "kick"; spec.hold.down = true; break;
    case "overhead": press.heavy = true; spec.hold.forward = true; spec.band = FORWARD_NORMAL_BAND; break;
    case "forwardHeavyKick": press.heavy = true; press.limb = "kick"; spec.hold.forward = true; spec.band = FORWARD_NORMAL_BAND; break;
    case "throw": press.throw = true; spec.approach = 70; break;
    case "throwObject": press.throwObject = true; spec.approach = 340; break;
    case "enhancedThrowObject": press.enhancedThrowObject = true; spec.approach = 340; break;
    case "super": press.super = true; spec.approach = 200; break;
    case "driveHeavy": press.driveHeavy = true; spec.approach = 230; break;
    default: press[id] = true; spec.approach = 185; break;
  }
  return spec;
}

/**
 * @param {object} options
 * @param {string[]} options.pair    fighter ids, [side0, side1]
 * @param {string}   options.stageId
 * @param {boolean}  options.hasStageWeapon  whether this match planned one
 * @param {number}   options.seed    demo-cycle seed (deterministic)
 * @param {number}   [options.blend] coverage share of the pick policy
 */
export function createDemoChoreographer({ pair, stageId = "", hasStageWeapon = false, seed = 237, blend = DEMO_COVERAGE_BLEND } = {}) {
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error("Demo choreography needs a fighter pair.");
  const rng = new DeterministicRng(hashSeed("FINAL-BLOW-DEMO-CHOREO", seed, pair[0], pair[1], stageId));
  const checklists = pair.map((fighterId) => demoCoverageChecklist(fighterId));
  const coverage = pair.map((fighterId, side) => ({
    fighterId,
    side,
    moves: Object.fromEntries(checklists[side].map((id) => [id, 0])),
    beats: Object.fromEntries(DEMO_BEATS.map((beat) => [beat, 0])),
  }));
  const stats = { coveragePicks: 0, naturalWindows: 0, completed: 0, timedOut: 0 };
  const previous = [null, null];

  let directive = null;
  let showSide = 0;
  let nextDecisionTick = 0;

  function beatsFor(side) {
    return coverage[side].beats;
  }

  // Shared beats are staged against the PAIR ledger: a dizzy or wall splat
  // lands on the victim while the attacker stages it, so checking only the
  // stager's own column would restage the same spectacle forever.
  function beatTotal(beat) {
    return coverage[0].beats[beat] + coverage[1].beats[beat];
  }

  function noteMove(side, action, context = {}) {
    if (side !== 0 && side !== 1) return;
    const id = demoCoverageMoveId(action, context);
    const moves = coverage[side].moves;
    if (id in moves) moves[id] += 1;
    if (directive && directive.side === side && directive.item === id) directive.executed = true;
  }

  function noteBeat(side, beat) {
    if (side !== 0 && side !== 1) return;
    const beats = coverage[side].beats;
    if (beat in beats) beats[beat] += 1;
    // Beats are matched side-agnostically: wall splats and dizzies land on
    // the victim while the staging directive belongs to the attacker.
    if (directive && directive.beat === beat) directive.executed = true;
  }

  // --- per-tick movement/state observation (edge detection) ----------------
  function observe(view) {
    if (!view || !Array.isArray(view.fighters)) return;
    for (let side = 0; side < 2; side += 1) {
      const fighter = view.fighters[side];
      if (!fighter) continue;
      const before = previous[side];
      if (before && view.phase === "fight") {
        if (fighter.dashFrames > 0 && before.dashFrames <= 0) {
          noteBeat(side, fighter.dashDirection === fighter.facing ? "dashForward" : "dashBack");
        }
        if (before.grounded && !fighter.grounded && fighter.vy < -200 && !fighter.down && !fighter.pendingKnockdown) {
          const forwardSpeed = fighter.vx * fighter.facing;
          noteBeat(side, forwardSpeed > 40 ? "jumpForward" : forwardSpeed < -40 ? "jumpBack" : "jumpNeutral");
        }
        if (fighter.blockstunFrames > 0 && before.blockstunFrames <= 0) noteBeat(side, "guardedContact");
        if (before.wakeupFrames > 0 && fighter.wakeupFrames <= 0) noteBeat(side, "wakeup");
        // v2.9 FLOW animation beats: grounded facing flips (the turnaround
        // key), crouch enter/leave edges (the crouch-trans key) and an air
        // normal starting while airborne (the air-attack key).
        if (fighter.grounded && before.facing !== undefined
          && fighter.facing !== before.facing) noteBeat(side, "turnaround");
        if (fighter.grounded && before.crouch !== undefined
          && Boolean(fighter.crouch) !== Boolean(before.crouch)) noteBeat(side, "crouchTrans");
        if (!fighter.grounded && fighter.attacking && !before.attacking) noteBeat(side, "airAttack");
      }
      previous[side] = {
        grounded: fighter.grounded,
        dashFrames: fighter.dashFrames,
        blockstunFrames: fighter.blockstunFrames,
        wakeupFrames: fighter.wakeupFrames,
        vy: fighter.vy,
        facing: fighter.facing,
        crouch: Boolean(fighter.crouch),
        attacking: Boolean(fighter.attacking),
      };
    }
  }

  // --- the pick policy -----------------------------------------------------
  function leastShown(entries) {
    let best = null;
    for (const entry of entries) {
      if (!best || entry.count < best.count) best = entry;
    }
    return best;
  }

  function wallDistance(fighter, view) {
    return Math.min(fighter.x - view.stageMinX, view.stageMaxX - fighter.x);
  }

  // Moment beats: their staging window is NOW (a knockdown to disrespect, a
  // weapon lying on the ground) — they bypass the blend roll entirely, which
  // is exactly the "stage the situational beats opportunistically" rule.
  function momentBeatDirective(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const beats = beatsFor(side);
    const distance = Math.abs(opponent.x - self.x);
    if (beats.taunt === 0 && opponent.down && distance > 60) {
      // Back off to disrespect range first (the band's away-walk), then pose.
      return { beat: "taunt", spec: { kind: "ground", press: { taunt: true }, approach: Infinity, band: { min: 150, max: Infinity }, hold: {}, feed: "stand" } };
    }
    if (beatTotal("weaponPickup") === 0 && hasStageWeapon && view.weapon?.phase === "ground"
      && !self.carriedWeapon && !opponent.down) {
      return { beat: "weaponPickup", spec: { kind: "weapon" } };
    }
    return null;
  }

  function eligibleBeatDirective(side, view) {
    const opponent = view.fighters[1 - side];
    const beats = beatsFor(side); // movement beats stay per-fighter
    const candidates = [];
    if (beatTotal("wallsplat") === 0 && wallDistance(opponent, view) < 340 && !opponent.down) {
      candidates.push({ beat: "wallsplat", count: 0, make: () => ({ kind: "wallsplat", feed: "stand" }) });
    }
    if (beatTotal("dizzy") === 0 && !opponent.down) {
      candidates.push({ beat: "dizzy", count: 0, make: () => ({ kind: "pressure" }) });
    }
    if (beatTotal("counterhit") === 0 && !opponent.down) {
      candidates.push({ beat: "counterhit", count: 0, make: () => ({ kind: "counter" }) });
    }
    if (beatTotal("juggle") === 0 && !opponent.down) {
      candidates.push({ beat: "juggle", count: 0, make: () => ({ kind: "juggle" }) });
    }
    if (beatTotal("throw") === 0 && !opponent.down) {
      candidates.push({ beat: "throw", count: 0, make: () => ({ kind: "ground", press: { throw: true }, approach: 70, hold: {}, feed: "close" }) });
    }
    for (const [beat, dir] of [["dashForward", 1], ["dashBack", -1], ["jumpForward", 1], ["jumpNeutral", 0], ["jumpBack", -1]]) {
      if (beats[beat] !== 0) continue;
      candidates.push(beat.startsWith("dash")
        ? { beat, count: beats[beat], make: () => ({ kind: "dash", forward: dir > 0 }) }
        : { beat, count: beats[beat], make: () => ({ kind: "air", press: null, jumpDir: dir, approach: Infinity }) });
    }
    // v2.9 FLOW: the turnaround key is staged as a close-range cross-up —
    // walk in tight, jump forward OVER the opponent; the GROUNDED defender's
    // facing flips as the jumper crosses, which is the edge observe()
    // records. Pair ledger (beatTotal): the beat lands on the defender while
    // the jumper stages it.
    if (beatTotal("turnaround") === 0 && !opponent.down) {
      candidates.push({
        beat: "turnaround", count: 0,
        make: () => ({ kind: "air", press: null, jumpDir: 1, approach: 100, crossup: true }),
      });
    }
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(rng.nextFloat() * candidates.length) % candidates.length];
    const spec = pick.make();
    return { spec, beat: pick.beat };
  }

  function eligibleMoveItem(side, view) {
    const self = view.fighters[side];
    const moves = coverage[side].moves;
    const entries = [];
    for (const id of checklists[side]) {
      if (EX_ACTIONS.has(id) && self.meter < GRIT_RULES.enhancedSpecialCost) continue;
      if (id === "super" && self.meter < GRIT_RULES.superCost) continue;
      if (id === "throwObject" && self.throwableUses <= 0) continue;
      if (id === "enhancedThrowObject"
        && (self.throwableUses <= 0 || self.meter < GRIT_RULES.enhancedSpecialCost)) continue;
      entries.push({ id, count: moves[id] });
    }
    if (!entries.length) return null;
    // Strong least-shown bias, but ties rotate deterministically so one
    // hard-to-land item can never starve the rest of the checklist.
    const minimum = Math.min(...entries.map((entry) => entry.count));
    const pool = entries.filter((entry) => entry.count === minimum);
    return pool[Math.floor(rng.nextFloat() * pool.length) % pool.length];
  }

  function maybeStart(side, view, momentOnly = false) {
    const self = view.fighters[side];
    if (!actionable(self)) return null;
    const beats = beatsFor(side);
    let spec = null;
    let item = null;
    let beat = null;
    const moment = momentBeatDirective(side, view);
    if (momentOnly && !moment) return null;
    if (moment) {
      ({ spec, beat } = moment);
    } else if (rng.nextFloat() >= blend) {
      // The 40% side of the blend: a genuine archetype-AI window, so the
      // exhibition still reads as a fight rather than a moves checklist.
      stats.naturalWindows += 1;
      nextDecisionTick = view.tick + 30 + Math.floor(rng.nextFloat() * 24);
      return null;
    }
    const staged = STAGED_BEATS.some((name) => beats[name] === 0);
    if (!spec && staged && rng.nextFloat() < 0.65) {
      const candidate = eligibleBeatDirective(side, view);
      if (candidate) ({ spec, beat } = candidate);
    }
    if (!spec) {
      const move = eligibleMoveItem(side, view);
      if (!move) return null;
      item = move.id;
      spec = directiveForMove(move.id);
      // While guarded contact is unshown, plain normals land on a guarding
      // feed; afterwards the feed mostly stands so hits and reactions vary.
      if (!spec.feed) {
        spec.feed = beats.guardedContact === 0 && !item.startsWith("air") && item !== "throw"
          ? "guard"
          : rng.nextFloat() < 0.4 ? "guard" : "stand";
      }
    }
    if (spec.kind === "air" && !spec.jumpDir && spec.jumpDir !== 0) {
      const jumps = [["jumpForward", 1], ["jumpNeutral", 0], ["jumpBack", -1]]
        .map(([name, dir]) => ({ dir, count: beats[name] }));
      spec.jumpDir = leastShown(jumps).dir;
    }
    stats.coveragePicks += 1;
    directive = {
      side, item, beat, spec,
      phase: "approach",
      frames: 0,
      totalFrames: 0,
      executed: false,
      swingSignal: false,
    };
    if (spec.kind === "dash" || spec.kind === "air") directive.phase = "act";
    if (spec.kind === "weapon") directive.phase = "fetch";
    return runDirective(view);
  }

  function finishDirective(view, completed) {
    stats[completed ? "completed" : "timedOut"] += 1;
    directive = null;
    showSide = 1 - showSide;
    nextDecisionTick = view.tick + 8 + Math.floor(rng.nextFloat() * 14);
  }

  const DIRECTIVE_TIMEOUT = 420;

  // --- directive execution -------------------------------------------------
  function runDirective(view) {
    const { side, spec } = directive;
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    directive.totalFrames += 1;
    directive.frames += 1;
    if (directive.totalFrames > DIRECTIVE_TIMEOUT) {
      finishDirective(view, false);
      return null;
    }
    // A showcase that got interrupted (hit, thrown, knocked down) yields to
    // the fight; the item stays least-shown and is simply retried later.
    const interrupted = self.down || self.hitstunFrames > 0 || self.dizzyFrames > 0 || self.grabbed;
    if (interrupted && directive.phase !== "recover") {
      finishDirective(view, false);
      return null;
    }

    switch (spec.kind) {
      case "ground": return runGround(view, self, opponent, distance);
      case "air": return runAir(view, self, opponent, distance);
      case "dash": return runDash(view, self, opponent);
      case "weapon": return runWeapon(view, self);
      case "pressure": return runPressure(view, self, opponent, distance);
      case "counter": return runCounter(view, self, opponent, distance);
      case "juggle": return runJuggle(view, self, opponent, distance);
      case "wallsplat": return runWallsplat(view, self, opponent, distance);
      default:
        finishDirective(view, false);
        return null;
    }
  }

  function enterPhase(name) {
    directive.phase = name;
    directive.frames = 0;
  }

  function holdInput(spec, self, opponent) {
    const input = emptyInput();
    if (spec.hold?.down) input.down = true;
    if (spec.hold?.forward) Object.assign(input, towardInput(self, opponent));
    return input;
  }

  function recoverStep(view, self) {
    if (directive.frames >= 6 && !self.attacking && actionable(self)) {
      finishDirective(view, Boolean(directive.executed));
      return emptyInput();
    }
    if (directive.frames >= 90) {
      finishDirective(view, Boolean(directive.executed));
      return emptyInput();
    }
    return emptyInput();
  }

  function runGround(view, self, opponent, distance) {
    if (directive.phase === "approach") {
      const band = directive.spec.band;
      const wantMax = band ? band.max : directive.spec.approach;
      const wantMin = band ? band.min : 0;
      if (distance > wantMax) return towardInput(self, opponent);
      if (distance < wantMin) return awayInput(self, opponent);
      enterPhase("press");
    }
    if (directive.phase === "press") {
      if (!actionable(self)) {
        // Whatever froze us (blockstun, our own recovery) may have moved the
        // spacing — go back and re-space instead of drifting into grab range.
        if (directive.frames > 6) enterPhase("approach");
        return emptyInput();
      }
      const input = Object.assign(holdInput(directive.spec, self, opponent), directive.spec.press);
      // Throws are a direction + light inside grab range: hold toward.
      if (input.throw) Object.assign(input, towardInput(self, opponent), { throw: true });
      enterPhase("recover");
      return input;
    }
    return recoverStep(view, self);
  }

  function runAir(view, self, opponent, distance) {
    const { press, jumpDir } = directive.spec;
    if (directive.phase === "act") {
      // Cross-ups approach even with no press: the jump must start close
      // enough to carry the fighter over the opponent.
      if ((press || directive.spec.crossup) && jumpDir > 0
        && distance > directive.spec.approach) return towardInput(self, opponent);
      if (!actionable(self)) {
        if (directive.frames > 60) finishDirective(view, false);
        return emptyInput();
      }
      const input = emptyInput();
      input.jump = true;
      if (jumpDir !== 0) {
        const toward = jumpDir > 0 ? towardInput(self, opponent) : awayInput(self, opponent);
        Object.assign(input, toward, { jump: true });
      }
      enterPhase("rise");
      return input;
    }
    if (directive.phase === "rise") {
      if (self.grounded && directive.frames > 12) {
        // The jump never came out (buffer swallowed) — bail and retry later.
        finishDirective(view, false);
        return null;
      }
      if (!self.grounded && directive.frames >= 7) {
        if (!press) {
          enterPhase("recover");
          return emptyInput();
        }
        enterPhase("recover");
        return { ...emptyInput(), ...press };
      }
      return emptyInput();
    }
    if (!self.grounded) {
      directive.frames = Math.min(directive.frames, 8);
      return emptyInput();
    }
    return recoverStep(view, self);
  }

  function runDash(view, self, opponent) {
    const forward = directive.spec.forward;
    const dirInput = forward ? towardInput(self, opponent) : awayInput(self, opponent);
    if (directive.phase === "act") {
      if (!actionable(self)) {
        if (directive.frames > 60) finishDirective(view, false);
        return emptyInput();
      }
      // Two neutral frames first: the double-tap needs genuine edges, and the
      // brain (or an approach) may have been holding this direction already.
      if (directive.frames < 2) return emptyInput();
      enterPhase("tap1");
    }
    if (directive.phase === "tap1") {
      enterPhase("gap");
      return dirInput;
    }
    if (directive.phase === "gap") {
      if (directive.frames >= 2) enterPhase("tap2");
      return emptyInput();
    }
    if (directive.phase === "tap2") {
      if (directive.frames >= 4) enterPhase("recover");
      return dirInput;
    }
    if (self.dashFrames > 0) directive.executed = true;
    return recoverStep(view, self);
  }

  function runWeapon(view, self) {
    const weapon = view.weapon;
    if (!weapon || weapon.phase !== "ground" || self.carriedWeapon) {
      finishDirective(view, Boolean(directive.executed));
      return null;
    }
    if (directive.phase === "fetch") {
      const delta = weapon.x - self.x;
      if (Math.abs(delta) > 42) {
        const input = emptyInput();
        input.right = delta > 0;
        input.left = delta < 0;
        return input;
      }
      if (!actionable(self)) return emptyInput();
      enterPhase("recover");
      return { ...emptyInput(), down: true, heavy: true };
    }
    return recoverStep(view, self);
  }

  function runPressure(view, self, opponent, distance) {
    if (opponent.dizzyFrames > 0) {
      directive.executed = true;
      finishDirective(view, true);
      return null;
    }
    if (opponent.down || opponent.blockstunFrames > 0) return emptyInput();
    if (distance > 118) return towardInput(self, opponent);
    if (!actionable(self)) return emptyInput();
    // Alternating stand/crouch lights WITHOUT a held direction — inside grab
    // range a forward-held light would proximity-convert into a throw and
    // reset the stun meter instead of building it. Hard combo scaling keeps
    // the damage from racing the dizzy bar.
    const input = emptyInput();
    if (rng.nextFloat() < 0.35) input.down = true;
    input.light = true;
    if (rng.nextFloat() < 0.5) input.limb = "kick";
    return input;
  }

  function runCounter(view, self, opponent, distance) {
    if (directive.phase === "approach") {
      if (distance > 115) return towardInput(self, opponent);
      if (!actionable(self)) return emptyInput();
      // Signal the feed to swing; its heavy startup eats our quick light.
      directive.swingSignal = true;
      enterPhase("waitSwing");
      return emptyInput();
    }
    if (directive.phase === "waitSwing") {
      if (opponent.attacking) enterPhase("counterPress");
      else if (directive.frames > 30) finishDirective(view, false);
      return emptyInput();
    }
    if (directive.phase === "counterPress") {
      if (directive.frames >= 2) {
        directive.swingSignal = false;
        enterPhase("recover");
        return { ...emptyInput(), light: true };
      }
      return emptyInput();
    }
    directive.swingSignal = false;
    return recoverStep(view, self);
  }

  function runWallsplat(view, self, opponent, distance) {
    // Repeated advancing drive heavies walk the victim to the arena edge;
    // the splat itself is reported by the spawnWallImpact hook (side-agnostic
    // beat match) the moment the clamp arrests the flight.
    if (directive.executed) {
      finishDirective(view, true);
      return null;
    }
    if (opponent.down || opponent.dizzyFrames > 0 || opponent.blockstunFrames > 0) return emptyInput();
    if (distance > 225) return towardInput(self, opponent);
    if (!actionable(self)) return emptyInput();
    return { ...emptyInput(), driveHeavy: true };
  }

  function runJuggle(view, self, opponent, distance) {
    if (directive.phase === "approach") {
      if (distance > 135) return towardInput(self, opponent);
      if (!actionable(self)) return emptyInput();
      enterPhase("launch");
      return { ...emptyInput(), launcher: true };
    }
    if (directive.phase === "launch") {
      if (!opponent.grounded && opponent.pendingKnockdown) {
        enterPhase("followup");
        return emptyInput();
      }
      if (directive.frames > 40) finishDirective(view, false);
      return emptyInput();
    }
    if (directive.phase === "followup") {
      if (!actionable(self)) return emptyInput();
      if (opponent.grounded || !opponent.pendingKnockdown) {
        finishDirective(view, Boolean(directive.executed));
        return null;
      }
      enterPhase("recover");
      return { ...emptyInput(), special: true };
    }
    return recoverStep(view, self);
  }

  // --- feed behaviour (the non-showcasing side during a directive) ---------
  function feedInput(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const mode = directive.spec.feed || "stand";
    if (directive.spec.kind === "counter") {
      if (directive.swingSignal && actionable(self)) return { ...emptyInput(), heavy: true };
      return emptyInput();
    }
    if (mode === "guard") return { ...emptyInput(), guard: true };
    if (mode === "close") {
      const distance = Math.abs(opponent.x - self.x);
      return distance > 80 ? towardInput(self, opponent) : emptyInput();
    }
    return emptyInput();
  }

  // --- public step ---------------------------------------------------------
  function step(side, view) {
    if (!view || view.phase !== "fight") {
      if (directive) {
        directive = null;
        nextDecisionTick = (view?.tick || 0) + 30;
      }
      return null;
    }
    if (directive) {
      if (directive.side === side) return runDirective(view);
      return feedInput(side, view);
    }
    if (view.tick < nextDecisionTick) return null;
    // Off-turn, only a moment beat (downed opponent to taunt, weapon on the
    // ground) may claim the stage — the knockdown usually belongs to the
    // fighter whose showcase just ended, so its turn has already passed.
    if (side !== showSide) return maybeStart(side, view, true);
    return maybeStart(side, view);
  }

  function coverageSnapshot() {
    const perFighter = {};
    for (const entry of coverage) {
      const total = checklists[entry.side].length;
      const shown = checklists[entry.side].filter((id) => entry.moves[id] > 0).length;
      perFighter[entry.fighterId] = {
        side: entry.side,
        moves: { ...entry.moves },
        beats: { ...entry.beats },
        movesTotal: total,
        movesShown: shown,
        missingMoves: checklists[entry.side].filter((id) => entry.moves[id] === 0),
      };
    }
    return perFighter;
  }

  return Object.freeze({
    step,
    observe,
    noteMove,
    noteBeat,
    coverage: coverageSnapshot,
    stats: () => ({ ...stats }),
    directive: () => (directive
      ? { side: directive.side, item: directive.item, beat: directive.beat, kind: directive.spec.kind, phase: directive.phase }
      : null),
    hasStageWeapon: () => hasStageWeapon,
    pair: () => [...pair],
  });
}
