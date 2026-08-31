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
//
// v2.9 FLOW second pass — the three things that kept an exhibition at ~11 of
// 30 moves per fighter:
//
//   1. THROUGHPUT. Directives used to be a single global slot handed back and
//      forth, with 8-21 dead ticks between them, 30-53 tick natural windows
//      and a flat 420-tick timeout. A whole three-round match issued 6-16
//      directives. Now each side owns its OWN lane (both fighters can be
//      showcasing at once), the gap between directives is 0-3 ticks, timeouts
//      are per-kind, a directive ends the instant its move has come out, and
//      the item picker is DISTANCE-AWARE so the pair stops marching back and
//      forth between showcases. A match now issues 80-150 directives.
//   2. THE FEED WAS A MANNEQUIN. The non-showcasing side used to receive
//      emptyInput() for the whole directive. Now a directive only claims the
//      partner when the beat genuinely needs a feed, the feed role is an
//      ACTIVE script (block, duck, walk, whiff, swing on cue), and a
//      liveliness watchdog hands the fighter back to the brain if the
//      choreographer ever leaves it inert for more than ~20 actionable ticks.
//   3. WHIFFS. approach:165 for every standing normal and a 160-215 band for
//      the command normals were both outside real reach. Staging distances
//      are now DERIVED per move from the profile's own hitboxes, advance
//      speed and the defender's hurtbox, with the SF2 proximity-grab range
//      carved out of the forward-light bands.
//
// Plus: per-beat attempt budgets with backoff (a spectacle that cannot happen
// right now can no longer starve the move checklist), per-item backoff for
// the same reason, and an optional cumulative ledger so a fighter returning
// later in the attract cycle leads with what the cabinet has NOT shown yet.
// ===========================================================================

import { DeterministicRng, hashSeed } from "./foundation.mjs";
import { FIGHTER_SCALE, MOVEMENT_RULES } from "./defense.mjs";
import { getKitMoveProfile, selectKitMoveKey } from "./fighter-kits.mjs";
import { getThrowable } from "./throwables.mjs";
import { GRIT_RULES } from "./combos.mjs";

// Coverage share of the pick policy: the rest of the time the choreographer
// deliberately stands down and lets the archetype AI play a natural window.
// Higher than the first pass because a lane that is NOT showcasing now runs
// the brain anyway — the pair is never both scripted unless a beat needs it,
// so the exhibition keeps its natural texture at a smaller explicit share.
export const DEMO_COVERAGE_BLEND = 0.8;

// How often a coverage pick chases an unstaged spectacle instead of the next
// checklist move. Beats are cheap to interleave and expensive to chase, so
// the move checklist keeps the majority of the pipeline.
const BEAT_SHARE = 0.3;

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

// A spectacle that keeps failing must not re-chase forever: each staged beat
// gets a small attempt budget and an escalating cooldown, so a wall splat the
// geometry will not allow right now yields the pipeline back to the checklist
// instead of starving it for the whole match.
const BEAT_ATTEMPT_BUDGET = 5;
// The expensive spectacles (herding a victim to the wall, building a whole
// stun bar) get fewer tries than the cheap ones — five failed wall splats is
// most of a round spent on one beat the checklist never sees.
const BEAT_BUDGETS = Object.freeze({
  wallsplat: 4, dizzy: 5, weaponPickup: 4, turnaround: 3,
});
const BEAT_BACKOFF_FRAMES = 110;
// The same rule for individual checklist items (an EX the meter keeps eating,
// a normal the opponent keeps interrupting).
const ITEM_FAIL_BUDGET = 3;
const ITEM_BACKOFF_FRAMES = 170;

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

// Coverage id -> the action/context row that produces it. The mapping is
// global (the rows resolve identically for every fighter), so the staging
// tables below can read a move's real frame data straight from its id.
const ROW_FOR_ID = new Map(MOVE_ROWS.map((row) => [demoCoverageMoveId(row.action, row.context), row]));

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

// --- staging geometry ------------------------------------------------------
// Hitboxes and hurtboxes are authored in body-local units and scaled by
// FIGHTER_SCALE at collision time (defense.mjs localBoxToWorld), so a move's
// real maximum hit distance between the two origins is
//   (front-most hitbox edge + the defender's rearmost stand hurtbox edge)
// scaled, plus whatever ground an advancing move covers during its startup.
// Staging from a constant instead of this is exactly why the showcase normals
// used to swing at empty air.
const DEFENDER_HURT_HALF = Math.round(43 * FIGHTER_SCALE);
// Two standing pushboxes: fighters can never be closer than this.
const MIN_SEPARATION = 2 * MOVEMENT_RULES.standingPushboxHalfWidth + 4;
// SF2 proximity grab converts a forward-held LIGHT into a throw inside this
// range, so the forward light command normals must be staged outside it.
const PROXIMITY_GRAB_GUARD = Math.round(104 * FIGHTER_SCALE) + 22;
const FORWARD_LIGHT_IDS = new Set(["forwardLight", "forwardLightKick"]);

function moveProfileFor(fighterId, id) {
  const row = ROW_FOR_ID.get(id);
  if (!row) return null;
  return getKitMoveProfile(fighterId, row.action, row.context) || null;
}

// How close a move can still connect: its NEAREST hitbox edge, minus the
// defender's hurtbox. Almost every authored swing starts within ~30 units of
// the body, so the honest floor is the pushbox — deriving it (rather than
// guessing a percentage of reach) is what lets the picker find an in-band
// showcase at whatever spacing the fight happens to be at, which is where the
// approach-walk ticks went.
function moveNearEdge(fighterId, id) {
  const profile = moveProfileFor(fighterId, id);
  if (!profile?.hitboxes?.length) return 0;
  let near = Infinity;
  for (const entry of profile.hitboxes) near = Math.min(near, entry.box.x);
  if (!Number.isFinite(near)) return 0;
  return Math.round(near * FIGHTER_SCALE) - DEFENDER_HURT_HALF;
}

function moveReach(fighterId, id) {
  const profile = moveProfileFor(fighterId, id);
  if (!profile) return 0;
  let front = 0;
  for (const entry of profile.hitboxes || []) {
    front = Math.max(front, entry.box.x + entry.box.width);
  }
  if (!front) front = profile.range || 0;
  if (!front) return 0;
  // Advancing moves (drive heavies, rushing command specials) close ground
  // during startup; count 70% of it so the band stays inside the hitbox.
  const advance = ((profile.advanceSpeed || 0) * (profile.startupFrames || 0)) / 60 * 0.7;
  return Math.round((front + advance) * FIGHTER_SCALE) + DEFENDER_HURT_HALF;
}

/**
 * The distance band a move should be thrown from: deep enough inside its own
 * reach to connect, never inside the pushbox floor, and — for the forward
 * lights — never inside the proximity-grab range that would silently convert
 * the showcase into a throw.
 */
export function demoStagingBand(fighterId, id) {
  if (id.startsWith("air")) return { min: 0, max: 265, air: true };
  if (id === "throwObject" || id === "enhancedThrowObject") return { min: 190, max: 620 };
  const reach = moveReach(fighterId, id);
  if (!reach) {
    // Boxless moves are the zoners' projectiles, the trap layers and the
    // counter stances: none of them have a swing to line up, but a fireball
    // staged from grab range is still a bad showcase.
    const profile = moveProfileFor(fighterId, id);
    return profile?.projectile ? { min: 260, max: 560 } : { min: 130, max: 240 };
  }
  if (id === "throw") {
    const max = Math.max(MIN_SEPARATION + 12, reach - 16);
    return { min: MIN_SEPARATION, max };
  }
  // Deliberately WIDE: anywhere from the move's own near edge out to 90% of
  // real reach connects, so the pair stops marching to a 50px window between
  // every showcase. Approach walking was the single biggest cost left in the
  // pipeline once the recovery hold was removed.
  let min = Math.max(MIN_SEPARATION, moveNearEdge(fighterId, id));
  let max = Math.max(min + 20, Math.round(reach * 0.9));
  if (FORWARD_LIGHT_IDS.has(id)) {
    min = Math.max(min, PROXIMITY_GRAB_GUARD);
    if (max < min + 20) max = min + 30;
  }
  return { min, max };
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

// Per-kind budgets. The old flat 420 meant one stuck spectacle ate seven
// seconds of a three-round exhibition.
const KIND_TIMEOUT = Object.freeze({
  ground: 130,
  air: 110,
  dash: 60,
  weapon: 240,
  pressure: 280,
  counter: 110,
  juggle: 140,
  wallsplat: 260,
});

// A duet directive borrows the partner's lane, and every tick it holds is a
// tick that fighter cannot showcase anything of its own. Long beats used to
// lock one side out for half a match (measured: 873 feed ticks against 95
// lead ticks, 6 of 30 moves shown). The lease releases the partner back to
// its own pipeline whether or not the beat has landed.
const FEED_LEASE_FRAMES = 60;

// MOTION HYGIENE. The forward and crouching command normals share their
// terminal button with the motion specials (↓→+PUNCH, →↓→+PUNCH, ↓←+PUNCH,
// ↓→+KICK, ←→+KICK), and recognizeFighterCommand bridges an 18-frame gap
// between direction tokens. A `down` or `back` token left over from the
// PREVIOUS showcase therefore converts the next forward+punch press into a
// command special — measured: forwardLight resolved as commandSpecial every
// single time and never once reached the ledger, while commandSpecial fired
// 38 times off 3 picks. Holding one steady direction (or a plain crouch) for
// longer than that bridge before the press ages every earlier token out of
// the window, and reads on screen as the step-back-step-in these normals
// want anyway.
const SPACE_SETTLE_FRAMES = 22;

// CANCEL CHAINS. combos.mjs CANCEL_ROUTES lets a confirmed light chain into a
// heavy or a special and a confirmed heavy into a special/EX/super. These are
// the checklist entries that can be pressed BLIND into the current move (no
// held direction, no re-spacing), so a single approach can put two or three
// items on screen instead of one.
const CHAIN_ITEMS = new Set([
  "standHeavy", "standHeavyKick", "special", "commandSpecial",
  "enhanced", "enhancedCommandSpecial", "super",
]);
const MAX_CHAIN_LINKS = 2;
const CHAIN_WAIT_FRAMES = 26;

// Kinds that survive being hit mid-stage (see runDirective).
const RESILIENT_KINDS = new Set(["pressure", "wallsplat", "weapon"]);

// Stun the fight has already built, and a victim already near the edge: the
// thresholds at which the dizzy and wall-splat stagings become MOMENTS.
const DIZZY_STAGE_STUN = 34;
const WALLSPLAT_STAGE_GAP = 190;
// A guard feed is a one-off block window, held on its own clock (see below).
const GUARD_FEED_FRAMES = 70;

/**
 * @param {object} options
 * @param {string[]} options.pair    fighter ids, [side0, side1]
 * @param {string}   options.stageId
 * @param {boolean}  options.hasStageWeapon  whether this match planned one
 * @param {number}   options.seed    demo-cycle seed (deterministic)
 * @param {number}   [options.blend] coverage share of the pick policy
 * @param {object}   [options.priorShown] cumulative attract ledger,
 *   fighterId -> { moveId: count }, so a fighter that has already featured
 *   earlier in this attract session leads with what it has NOT shown yet.
 */
export function createDemoChoreographer({
  pair, stageId = "", hasStageWeapon = false, seed = 237,
  blend = DEMO_COVERAGE_BLEND, priorShown = null,
} = {}) {
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error("Demo choreography needs a fighter pair.");
  const rng = new DeterministicRng(hashSeed("FINAL-BLOW-DEMO-CHOREO", seed, pair[0], pair[1], stageId));
  const checklists = pair.map((fighterId) => demoCoverageChecklist(fighterId));
  const bands = pair.map((fighterId, side) => Object.fromEntries(
    checklists[side].map((id) => [id, demoStagingBand(fighterId, id)]),
  ));
  const prior = pair.map((fighterId, side) => Object.fromEntries(
    checklists[side].map((id) => [id, Number(priorShown?.[fighterId]?.[id]) || 0]),
  ));
  const coverage = pair.map((fighterId, side) => ({
    fighterId,
    side,
    moves: Object.fromEntries(checklists[side].map((id) => [id, 0])),
    beats: Object.fromEntries(DEMO_BEATS.map((beat) => [beat, 0])),
  }));
  const stats = {
    coveragePicks: 0, naturalWindows: 0, completed: 0, timedOut: 0,
    beatPicks: 0, movePicks: 0, chainLinks: 0, feedTicks: 0, livelinessRescues: 0,
  };
  const previous = [null, null];

  // Two independent lanes: each side either LEADS a directive of its own,
  // FEEDS the partner's directive, or is handed back to the archetype brain.
  const lanes = [null, null];
  const nextDecision = [0, 0];
  const inertTicks = [0, 0];
  const sidePicks = [0, 0];
  const itemPicks = {};
  const idleScript = [
    { mode: "stand", until: 0 },
    { mode: "stand", until: 0 },
  ];
  const beatAttempts = Object.fromEntries(DEMO_BEATS.map((beat) => [beat, 0]));
  const beatBlockedUntil = Object.fromEntries(DEMO_BEATS.map((beat) => [beat, 0]));
  const itemFails = pair.map((fighterId, side) => Object.fromEntries(checklists[side].map((id) => [id, 0])));
  const itemBlockedUntil = pair.map((fighterId, side) => Object.fromEntries(checklists[side].map((id) => [id, 0])));

  function beatsFor(side) {
    return coverage[side].beats;
  }

  // Shared beats are staged against the PAIR ledger: a dizzy or wall splat
  // lands on the victim while the attacker stages it, so checking only the
  // stager's own column would restage the same spectacle forever.
  function beatTotal(beat) {
    return coverage[0].beats[beat] + coverage[1].beats[beat];
  }

  function leadOf(side) {
    return lanes[side]?.role === "lead" ? lanes[side] : null;
  }

  function noteMove(side, action, context = {}) {
    if (side !== 0 && side !== 1) return;
    const id = demoCoverageMoveId(action, context);
    const moves = coverage[side].moves;
    if (id in moves) moves[id] += 1;
    const lead = leadOf(side);
    if (lead && lead.item === id) lead.executed = true;
  }

  function noteBeat(side, beat) {
    if (side !== 0 && side !== 1) return;
    const beats = coverage[side].beats;
    if (beat in beats) beats[beat] += 1;
    // Beats are matched side-agnostically: wall splats and dizzies land on
    // the victim while the staging directive belongs to the attacker.
    for (const lane of lanes) {
      if (lane?.role === "lead" && lane.beat === beat) lane.executed = true;
    }
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

  function pick(list) {
    return list[Math.floor(rng.nextFloat() * list.length) % list.length];
  }

  // The wall a hit from `self` would drive `opponent` into, and how far away
  // it is. A wall splat only ever happens on the far side of the victim, so
  // measuring the NEAREST wall (the old rule) staged the beat from the wrong
  // side half the time and it could never land.
  function pushWallGap(self, opponent, view) {
    return opponent.x >= self.x
      ? view.stageMaxX - opponent.x
      : opponent.x - view.stageMinX;
  }

  function beatOpen(beat, view) {
    if (beatTotal(beat) !== 0) return false;
    if (beatAttempts[beat] >= (BEAT_BUDGETS[beat] ?? BEAT_ATTEMPT_BUDGET)) return false;
    return view.tick >= beatBlockedUntil[beat];
  }

  // Moment beats: their staging window is NOW (a knockdown to disrespect, a
  // weapon lying on the ground) — they bypass the blend roll AND the decision
  // gap entirely, which is exactly the "stage the situational beats
  // opportunistically" rule.
  function momentBeatDirective(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    if (beatOpen("taunt", view) && opponent.down && distance > 60) {
      // Back off to disrespect range first (the band's away-walk), then pose.
      return {
        beat: "taunt",
        spec: {
          kind: "ground", press: { taunt: true }, hold: {},
          band: { min: 150, max: Infinity },
        },
      };
    }
    if (beatOpen("weaponPickup", view) && hasStageWeapon && view.weapon?.phase === "ground"
      && !self.carriedWeapon) {
      return { beat: "weaponPickup", spec: { kind: "weapon", feed: "brace" } };
    }
    // A stun bar the fight has already filled, and an opponent who is already
    // backed against the arena edge, are WINDOWS — not projects. Measured
    // through the ordinary beat lottery they almost never coincided with a
    // beat consult (5 of 6 matches never started a single stun string), so
    // both are taken the moment they open. Attempt budgets and backoff still
    // bound them, and the 45-stun / 210px thresholds mean the fight has
    // already done most of the work.
    if (beatOpen("dizzy", view) && !opponent.down
      && opponent.stunMeter >= DIZZY_STAGE_STUN && distance < 340) {
      return { beat: "dizzy", spec: { kind: "pressure", feed: "brace" } };
    }
    if (beatOpen("wallsplat", view) && !opponent.down
      && pushWallGap(self, opponent, view) < WALLSPLAT_STAGE_GAP) {
      return { beat: "wallsplat", spec: { kind: "wallsplat", feed: "brace" } };
    }
    return null;
  }

  function eligibleBeatDirective(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const beats = beatsFor(side); // movement beats stay per-fighter
    const partnerBusy = Boolean(leadOf(1 - side));
    const candidates = [];
    // Duet spectacles need the partner's lane; if the partner is mid-showcase
    // we simply do not offer them this tick rather than fighting over it.
    if (!partnerBusy) {
      // Only the side that would drive the victim TOWARD the near wall can
      // splat them: measuring the nearest wall (the first pass) staged this
      // from the wrong side half the time, and even from the right side a
      // 430px herd is more drive heavies than the budget allows. The tight
      // corner case is a moment beat (see momentBeatDirective); this is the
      // longer deliberate herd.
      if (beatOpen("wallsplat", view) && pushWallGap(self, opponent, view) < 300 && !opponent.down) {
        candidates.push({ beat: "wallsplat", make: () => ({ kind: "wallsplat", feed: "brace" }) });
      }
      if (beatOpen("counterhit", view) && !opponent.down) {
        candidates.push({ beat: "counterhit", make: () => ({ kind: "counter", feed: "swing" }) });
      }
      if (beatOpen("throw", view) && !opponent.down) {
        candidates.push({
          beat: "throw",
          make: () => ({
            kind: "ground", press: { throw: true }, hold: {},
            band: bands[side].throw || { min: MIN_SEPARATION, max: 120 },
            feed: "close",
          }),
        });
      }
      // v2.9 FLOW: the turnaround key is staged as a close-range cross-up —
      // walk in tight, jump forward OVER the opponent; the GROUNDED
      // defender's facing flips as the jumper crosses, which is the edge
      // observe() records. That means the defender must actually still be on
      // the ground when the jumper arrives, so the cross-up claims the feed
      // and plants it (aliveInput never jumps). Pair ledger (beatTotal): the
      // beat lands on the defender while the jumper stages it.
      if (beatOpen("turnaround", view) && !opponent.down) {
        candidates.push({
          beat: "turnaround",
          make: () => ({ kind: "air", press: null, jumpDir: 1, approach: 100, crossup: true, feed: "brace" }),
        });
      }
      if (beatOpen("juggle", view) && !opponent.down) {
        candidates.push({ beat: "juggle", make: () => ({ kind: "juggle", feed: "brace" }) });
      }
    }
    for (const [beat, dir] of [["dashForward", 1], ["dashBack", -1], ["jumpForward", 1], ["jumpNeutral", 0], ["jumpBack", -1]]) {
      if (beats[beat] !== 0) continue;
      if (beatAttempts[beat] >= BEAT_ATTEMPT_BUDGET || view.tick < beatBlockedUntil[beat]) continue;
      candidates.push(beat.startsWith("dash")
        ? { beat, make: () => ({ kind: "dash", forward: dir > 0 }) }
        : { beat, make: () => ({ kind: "air", press: null, jumpDir: dir, approach: Infinity }) });
    }
    if (!candidates.length) return null;
    const chosen = pick(candidates);
    return { spec: chosen.make(), beat: chosen.beat };
  }

  function eligibleMoveItem(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    const moves = coverage[side].moves;
    const affordable = [];
    for (const id of checklists[side]) {
      if (EX_ACTIONS.has(id) && self.meter < GRIT_RULES.enhancedSpecialCost) continue;
      if (id === "super" && self.meter < GRIT_RULES.superCost) continue;
      if (id === "throwObject" && self.throwableUses <= 0) continue;
      if (id === "enhancedThrowObject"
        && (self.throwableUses <= 0 || self.meter < GRIT_RULES.enhancedSpecialCost)) continue;
      affordable.push(id);
    }
    if (!affordable.length) return null;
    // Backoff filter — but never let it empty the pool.
    let ids = affordable.filter((id) => view.tick >= itemBlockedUntil[side][id]);
    if (!ids.length) ids = affordable;
    // Strong least-shown bias inside this exhibition...
    const minimum = Math.min(...ids.map((id) => moves[id]));
    ids = ids.filter((id) => moves[id] === minimum);
    // ...then the cumulative attract ledger breaks the tie, so a fighter the
    // cabinet has featured before opens with what it has never shown.
    const minPrior = Math.min(...ids.map((id) => prior[side][id]));
    ids = ids.filter((id) => prior[side][id] === minPrior);
    // ...and finally spacing. An item whose band already CONTAINS the current
    // gap costs zero approach ticks, and approach walking is what is left of
    // the pipeline's dead time. A sixth of picks ignore spacing so the pair
    // still moves around the stage instead of trading in one spot.
    if (ids.length > 1 && rng.nextFloat() < 0.85) {
      const gapFor = (id) => {
        const band = bands[side][id];
        if (band.air) return Math.max(0, distance - band.max);
        if (distance >= band.min && distance <= band.max) return 0;
        return distance < band.min ? band.min - distance : distance - band.max;
      };
      const best = Math.min(...ids.map(gapFor));
      const inRange = ids.filter((id) => gapFor(id) <= Math.max(best, 25));
      if (inRange.length) ids = inRange;
    }
    const id = pick(ids);
    return { id, count: moves[id] };
  }

  function directiveForMove(side, id) {
    const band = bands[side][id];
    if (id.startsWith("air")) {
      // Press payloads are SPARSE (only the true flags) so composing them over
      // the direction/crouch holds never clears a held input.
      const press = {};
      if (id === "airSpecial") press.special = true;
      else if (id.startsWith("airLight")) press.light = true;
      else press.heavy = true;
      if (id.endsWith("Kick")) press.limb = "kick";
      return { kind: "air", press, approach: band.max, jumpDir: null };
    }
    const press = {};
    const spec = { kind: "ground", press, band, hold: {} };
    switch (id) {
      case "standLight": press.light = true; break;
      case "standLightKick": press.light = true; press.limb = "kick"; break;
      case "crouchLight": press.light = true; spec.hold.down = true; break;
      case "crouchLightKick": press.light = true; press.limb = "kick"; spec.hold.down = true; break;
      case "forwardLight": press.light = true; spec.hold.forward = true; break;
      case "forwardLightKick": press.light = true; press.limb = "kick"; spec.hold.forward = true; break;
      case "standHeavy": press.heavy = true; break;
      case "standHeavyKick": press.heavy = true; press.limb = "kick"; break;
      case "crouchHeavy": press.heavy = true; spec.hold.down = true; break;
      case "crouchHeavyKick": press.heavy = true; press.limb = "kick"; spec.hold.down = true; break;
      case "overhead": press.heavy = true; spec.hold.forward = true; break;
      case "forwardHeavyKick": press.heavy = true; press.limb = "kick"; spec.hold.forward = true; break;
      case "throw": press.throw = true; break;
      case "throwObject": press.throwObject = true; break;
      case "enhancedThrowObject": press.enhancedThrowObject = true; break;
      case "super": press.super = true; break;
      case "driveHeavy": press.driveHeavy = true; break;
      default: press[id] = true; break;
    }
    return spec;
  }

  // Chain links must not need their own spacing or a held direction — they
  // are pressed blind into the current move's cancel window.
  function chainItem(side, view) {
    const self = view.fighters[side];
    const moves = coverage[side].moves;
    const ids = checklists[side].filter((id) => {
      if (!CHAIN_ITEMS.has(id)) return false;
      if (EX_ACTIONS.has(id) && self.meter < GRIT_RULES.enhancedSpecialCost) return false;
      if (id === "super" && self.meter < GRIT_RULES.superCost) return false;
      return view.tick >= itemBlockedUntil[side][id];
    });
    if (!ids.length) return null;
    const minimum = Math.min(...ids.map((id) => moves[id]));
    // Only ever chain into something the exhibition has NOT shown yet: the
    // point of the link is new coverage, not a longer combo.
    if (minimum > 0) return null;
    const pool = ids.filter((id) => moves[id] === minimum);
    return pick(pool);
  }

  function startChainLink(directive, id) {
    const side = directive.side;
    // The staged beat that opened this directive has already landed (that is
    // what `executed` meant), so the link is a plain move showcase from here:
    // clearing the beat keeps a failed link off that beat's attempt budget.
    directive.beat = null;
    directive.item = id;
    directive.spec = directiveForMove(side, id);
    directive.executed = false;
    directive.chaining = true;
    directive.links += 1;
    stats.coveragePicks += 1;
    stats.movePicks += 1;
    stats.chainLinks += 1;
    sidePicks[side] += 1;
    itemPicks[id] = (itemPicks[id] || 0) + 1;
    enterPhase(directive, "press");
  }

  function claimFeed(side, mode, lead, view) {
    if (!mode) return;
    const partner = 1 - side;
    if (lanes[partner]?.role === "lead") return;
    // Fairness: never press the fighter that is BEHIND on its own checklist
    // into a supporting role. One side feeding half the exhibition is exactly
    // how a 6-of-30 column happens.
    if (sidePicks[partner] + 3 < sidePicks[side]) return;
    // A guard feed outlives its lead on purpose: showcases now finish the tick
    // their move comes out, so a block window tied to the lead's lifetime
    // would expire before the hit ever arrived and guarded contact would
    // never be staged at all. Every other feed role is released with its lead.
    const sticky = mode === "guard";
    // A defender that is mid-attack cannot raise a guard at all, so a block
    // window claimed on top of its recovery is spent before it starts. Stage
    // guarded contact only against a fighter that can actually block now.
    if (sticky && !actionable(view.fighters[partner])) return;
    lanes[partner] = {
      role: "feed", mode, lead, sticky,
      until: view.tick + (sticky ? GUARD_FEED_FRAMES : FEED_LEASE_FRAMES),
    };
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
      // The natural side of the blend: a genuine archetype-AI window, so the
      // exhibition still reads as a fight rather than a moves checklist.
      // Short, because the OTHER lane is usually mid-showcase anyway.
      stats.naturalWindows += 1;
      nextDecision[side] = view.tick + 14 + Math.floor(rng.nextFloat() * 18);
      return null;
    }
    if (!spec && rng.nextFloat() < BEAT_SHARE) {
      const candidate = eligibleBeatDirective(side, view);
      if (candidate) ({ spec, beat } = candidate);
    }
    if (!spec) {
      const move = eligibleMoveItem(side, view);
      if (!move) return null;
      item = move.id;
      spec = directiveForMove(side, move.id);
      // While guarded contact is unshown, plain normals land on a guarding
      // feed; afterwards a minority of showcases still claim the partner so
      // hits, blocks and clean whiffs all read on screen. The rest run SOLO,
      // which is what lets both fighters showcase at once.
      const groundNormal = !item.startsWith("air") && item !== "throw"
        && item !== "throwObject" && item !== "enhancedThrowObject";
      // Only claim the partner while guarded contact is still unshown: every
      // feed tick is a tick that fighter cannot showcase anything of its own.
      if (groundNormal && beats.guardedContact === 0) spec.feed = "guard";
    }
    if (spec.kind === "air" && spec.jumpDir === null) {
      const jumps = [["jumpForward", 1], ["jumpNeutral", 0], ["jumpBack", -1]]
        .map(([name, dir]) => ({ dir, count: beats[name] }));
      spec.jumpDir = leastShown(jumps).dir;
    }
    stats.coveragePicks += 1;
    sidePicks[side] += 1;
    if (item) itemPicks[item] = (itemPicks[item] || 0) + 1;
    if (beat) stats.beatPicks += 1; else stats.movePicks += 1;
    const directive = {
      role: "lead",
      side, item, beat, spec,
      phase: "approach",
      frames: 0,
      totalFrames: 0,
      executed: false,
      swingSignal: false,
      chaining: false,
      links: 0,
    };
    if (spec.kind === "ground" && (spec.hold?.down || spec.hold?.forward)) directive.phase = "space";
    if (spec.kind === "dash" || spec.kind === "air") directive.phase = "act";
    if (spec.kind === "weapon") directive.phase = "fetch";
    lanes[side] = directive;
    claimFeed(side, spec.feed, directive, view);
    return runDirective(side, view);
  }

  function finishDirective(directive, view, completed) {
    const side = directive.side;
    stats[completed ? "completed" : "timedOut"] += 1;
    if (directive.beat && !completed) {
      beatAttempts[directive.beat] += 1;
      beatBlockedUntil[directive.beat] = view.tick
        + BEAT_BACKOFF_FRAMES * beatAttempts[directive.beat];
    }
    if (directive.item) {
      if (completed && directive.executed) {
        itemFails[side][directive.item] = 0;
      } else {
        itemFails[side][directive.item] += 1;
        if (itemFails[side][directive.item] >= ITEM_FAIL_BUDGET) {
          itemFails[side][directive.item] = 0;
          itemBlockedUntil[side][directive.item] = view.tick + ITEM_BACKOFF_FRAMES;
        }
      }
    }
    lanes[side] = null;
    // A sticky (guard) feed runs on its own lease — see claimFeed: showcases
    // now end the tick their move comes out, so releasing the block window
    // with the lead would close it before the hit ever arrived.
    const partner = lanes[1 - side];
    if (partner?.role === "feed" && partner.lead === directive && !partner.sticky) {
      lanes[1 - side] = null;
    }
    // Back-to-back by default: the next showcase may start on the very next
    // tick. The old 8-21 tick gap was pure dead air.
    nextDecision[side] = view.tick + Math.floor(rng.nextFloat() * 4);
  }

  // --- directive execution -------------------------------------------------
  function runDirective(side, view) {
    const directive = lanes[side];
    const { spec } = directive;
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    directive.totalFrames += 1;
    directive.frames += 1;
    if (directive.totalFrames > (KIND_TIMEOUT[spec.kind] || 170)) {
      finishDirective(directive, view, Boolean(directive.executed));
      return null;
    }
    // A showcase that got interrupted (hit, thrown, knocked down) yields to
    // the fight; the item stays least-shown and is simply retried later. The
    // long spectacles are the exception: a stun string or a corner herd that
    // abandoned itself the first time the victim hit back could never finish
    // at all, so they ride the interruption out inside their own timeout.
    const interrupted = self.down || self.hitstunFrames > 0 || self.dizzyFrames > 0 || self.grabbed;
    if (interrupted && directive.phase !== "recover") {
      if (!RESILIENT_KINDS.has(spec.kind)) {
        finishDirective(directive, view, Boolean(directive.executed));
        return null;
      }
      return emptyInput();
    }

    switch (spec.kind) {
      case "ground": return runGround(directive, view, self, opponent, distance);
      case "air": return runAir(directive, view, self, opponent, distance);
      case "dash": return runDash(directive, view, self, opponent);
      case "weapon": return runWeapon(directive, view, self, opponent);
      case "pressure": return runPressure(directive, view, self, opponent, distance);
      case "counter": return runCounter(directive, view, self, opponent, distance);
      case "juggle": return runJuggle(directive, view, self, opponent, distance);
      case "wallsplat": return runWallsplat(directive, view, self, opponent, distance);
      default:
        finishDirective(directive, view, false);
        return null;
    }
  }

  function enterPhase(directive, name) {
    directive.phase = name;
    directive.frames = 0;
  }

  function holdInput(spec, self, opponent) {
    const input = emptyInput();
    if (spec.hold?.down) input.down = true;
    if (spec.hold?.forward) Object.assign(input, towardInput(self, opponent));
    return input;
  }

  // The showcase is over the MOMENT its move has come out. Owning the lane
  // for the whole recovery animation on top of that was the single biggest
  // throughput leak in the first pass — a light poke held the pipeline for
  // ~45 ticks to show 1 frame of new content. The fighter is still visibly
  // finishing the move; the lane simply stops blocking the next pick, which
  // then waits for `actionable` anyway.
  function recoverStep(directive, view, self) {
    if (directive.executed || (!self.attacking && actionable(self))) {
      finishDirective(directive, view, Boolean(directive.executed));
      return emptyInput();
    }
    if (directive.frames >= 60) {
      finishDirective(directive, view, Boolean(directive.executed));
      return emptyInput();
    }
    return emptyInput();
  }

  // How long a single steady direction (or a plain crouch) must be held before
  // a command normal's press. See SPACE_SETTLE_FRAMES.
  function runSpace(directive, view, self, opponent, distance) {
    const spec = directive.spec;
    if (spec.hold?.down) {
      // Sit in the crouch: a held direction records no new token, so ↓→+KICK
      // has nothing fresh to bridge to when the button finally lands.
      if (directive.frames < SPACE_SETTLE_FRAMES || !actionable(self)) {
        return { ...emptyInput(), down: true };
      }
      enterPhase(directive, "press");
      return null;
    }
    if (directive.spaceAway === undefined) directive.spaceAway = distance <= spec.band.max;
    const steady = directive.spaceAway ? awayInput(self, opponent) : towardInput(self, opponent);
    if (directive.frames < SPACE_SETTLE_FRAMES || !actionable(self)) return steady;
    if (distance > spec.band.max) return towardInput(self, opponent);
    if (distance < spec.band.min) return awayInput(self, opponent);
    enterPhase(directive, "press");
    return null;
  }

  function runGround(directive, view, self, opponent, distance) {
    const spec = directive.spec;
    if (directive.phase === "space") {
      const held = runSpace(directive, view, self, opponent, distance);
      if (held) return held;
    }
    if (directive.phase === "approach") {
      const wantMax = spec.band ? spec.band.max : 180;
      const wantMin = spec.band ? spec.band.min : 0;
      // A march that has not closed in a second is a march that is losing the
      // race with the opponent's own movement — take the shot from here.
      if (distance > wantMax && directive.frames < 62) return towardInput(self, opponent);
      // Backing up into the corner is not a spacing option — take the shot
      // from where we are rather than grinding the wall until the timeout.
      const cornered = Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 70;
      if (distance < wantMin && !cornered && directive.frames < 60) return awayInput(self, opponent);
      if (!actionable(self)) return emptyInput();
      enterPhase(directive, "press");
    }
    if (directive.phase === "press") {
      // A chain link presses INTO the current move: the sim's input buffer
      // carries it into tryAttackCancel, so `actionable` deliberately does
      // not gate it.
      if (!actionable(self) && !directive.chaining) {
        // Whatever froze us (blockstun, our own recovery) may have moved the
        // spacing — go back and re-space instead of drifting into grab range.
        if (directive.frames > 8) enterPhase(directive, "approach");
        return emptyInput();
      }
      const input = Object.assign(holdInput(spec, self, opponent), spec.press);
      // Throws are a direction + light inside grab range: hold toward.
      if (input.throw) Object.assign(input, towardInput(self, opponent), { throw: true });
      enterPhase(directive, "hold");
      return input;
    }
    if (directive.phase === "hold") {
      // KEEP THE HOLD LIVE. beginAttack reads forwardHeld/crouching from the
      // input on the tick the buffered action actually resolves, which is not
      // always the tick it was pressed — releasing immediately is why the
      // crouching and forward command normals used to resolve as their
      // standing/neutral cousins and never appeared in the ledger at all.
      const stillHolding = spec.hold?.down || spec.hold?.forward;
      if (directive.executed) {
        // CANCEL CHAIN. A light confirms into a heavy or a special, a heavy
        // into a special (combos.mjs CANCEL_ROUTES). Feeding the next
        // least-shown item into that window shows two or three checklist
        // entries in the animation time of one and a half — and a demo that
        // combos reads as a fight rather than a list. If the cancel is not
        // legal the press simply waits in the buffer and comes out at the end
        // of recovery, which is exactly what a fresh directive would have
        // done, so the link can never cost throughput.
        const link = directive.links < MAX_CHAIN_LINKS
          ? chainItem(directive.side, view)
          : null;
        if (link) {
          startChainLink(directive, link);
          return emptyInput();
        }
        enterPhase(directive, "recover");
        return emptyInput();
      }
      if (directive.frames >= (directive.chaining ? CHAIN_WAIT_FRAMES : 5)) {
        enterPhase(directive, "recover");
        return emptyInput();
      }
      return stillHolding ? holdInput(spec, self, opponent) : emptyInput();
    }
    return recoverStep(directive, view, self);
  }

  function runAir(directive, view, self, opponent, distance) {
    const { press, jumpDir } = directive.spec;
    if (directive.phase === "act") {
      // Cross-ups and air normals approach first: the jump must start close
      // enough for the arc to reach.
      if ((press || directive.spec.crossup) && jumpDir > 0
        && distance > directive.spec.approach) return towardInput(self, opponent);
      if (!actionable(self)) {
        if (directive.frames > 60) finishDirective(directive, view, false);
        return emptyInput();
      }
      const input = emptyInput();
      input.jump = true;
      if (jumpDir !== 0) {
        const toward = jumpDir > 0 ? towardInput(self, opponent) : awayInput(self, opponent);
        Object.assign(input, toward, { jump: true });
      }
      enterPhase(directive, "rise");
      return input;
    }
    if (directive.phase === "rise") {
      if (self.grounded && directive.frames > 12) {
        // The jump never came out (buffer swallowed) — bail and retry later.
        finishDirective(directive, view, false);
        return null;
      }
      if (!self.grounded && directive.frames >= 6) {
        enterPhase(directive, "recover");
        return press ? { ...emptyInput(), ...press } : emptyInput();
      }
      return emptyInput();
    }
    if (!self.grounded) {
      // Same rule as the ground showcases: once the air normal (or the jump
      // arc the beat wanted) is on screen the lane is free again — riding the
      // whole descent used to burn 500-700 ticks of an exhibition.
      if (directive.executed) {
        finishDirective(directive, view, true);
        return emptyInput();
      }
      directive.frames = Math.min(directive.frames, 8);
      return emptyInput();
    }
    return recoverStep(directive, view, self);
  }

  function runDash(directive, view, self, opponent) {
    const forward = directive.spec.forward;
    const dirInput = forward ? towardInput(self, opponent) : awayInput(self, opponent);
    if (directive.phase === "act") {
      if (!actionable(self)) {
        if (directive.frames > 50) finishDirective(directive, view, false);
        return emptyInput();
      }
      // TWO genuine neutral frames first: the double-tap needs real edges and
      // the brain (or an approach) may already have been holding this
      // direction. runDirective pre-increments frames, so the first tick of a
      // phase reads frames === 1 — the old `< 2` test only ever produced one.
      if (directive.frames < 3) return emptyInput();
      enterPhase(directive, "tap1");
    }
    if (directive.phase === "tap1") {
      enterPhase(directive, "gap");
      return dirInput;
    }
    if (directive.phase === "gap") {
      if (directive.frames >= 2) enterPhase(directive, "tap2");
      return emptyInput();
    }
    if (directive.phase === "tap2") {
      if (directive.frames >= 4) enterPhase(directive, "recover");
      return dirInput;
    }
    // Sampled every tick of the recovery instead of once on the phase flip:
    // the dash starts on the tick AFTER the second tap is consumed, so the
    // old single sample read dashFrames before it could possibly be set.
    if (self.dashFrames > 0) directive.executed = true;
    if (directive.frames >= 22) {
      finishDirective(directive, view, Boolean(directive.executed));
      return emptyInput();
    }
    return emptyInput();
  }

  // Walk to the weapon, take it, then actually USE it: a pickup the cabinet
  // never sees thrown is not a showcase.
  function runWeapon(directive, view, self, opponent) {
    const weapon = view.weapon;
    if (directive.phase === "fetch") {
      if (!weapon || weapon.phase !== "ground") {
        finishDirective(directive, view, Boolean(directive.executed));
        return null;
      }
      if (self.carriedWeapon) {
        enterPhase(directive, "carry");
        return emptyInput();
      }
      const delta = weapon.x - self.x;
      if (Math.abs(delta) > 40) {
        const input = emptyInput();
        input.right = delta > 0;
        input.left = delta < 0;
        return input;
      }
      if (!actionable(self)) return emptyInput();
      enterPhase(directive, "grab");
      return { ...emptyInput(), down: true, heavy: true };
    }
    if (directive.phase === "grab") {
      if (self.carriedWeapon) {
        enterPhase(directive, "carry");
        return emptyInput();
      }
      if (!weapon || weapon.phase !== "ground") {
        finishDirective(directive, view, Boolean(directive.executed));
        return null;
      }
      // The press only lands on a tick the fighter is free and standing over
      // it; anything else re-approaches rather than mashing out a crouch HP.
      if (directive.frames > 10) {
        enterPhase(directive, "fetch");
        return emptyInput();
      }
      if (!actionable(self) || Math.abs(weapon.x - self.x) > 40) return emptyInput();
      return { ...emptyInput(), down: true, heavy: true };
    }
    if (directive.phase === "carry") {
      if (!self.carriedWeapon) {
        // It has left our hands — that is the showcase completing.
        finishDirective(directive, view, true);
        return null;
      }
      // The pickup press must not double as the throw (the sim enforces a
      // short bring-up and swallows the button until it is done), so face the
      // opponent for a beat and then KEEP pressing until the weapon is
      // actually airborne. Ending on the first press left the fighter
      // wandering the stage still holding it.
      // The steady forward hold has to outlast the motion recogniser's
      // 18-frame bridge as well (SPACE_SETTLE_FRAMES): the pickup press is a
      // `down` token, and a forward+HP inside that window resolves as
      // ↓→+PUNCH — measured, the fighter walked off swinging a command
      // special with the cup still in its hand.
      if (directive.frames < SPACE_SETTLE_FRAMES + 2 || !actionable(self)) {
        return towardInput(self, opponent);
      }
      return { ...towardInput(self, opponent), heavy: true };
    }
    return recoverStep(directive, view, self);
  }

  // Dizzy: stun is 100 at 17 per heavy / 9 per light with a 48-frame decay
  // grace, so the beat needs a genuine sustained string rather than a poke.
  function runPressure(directive, view, self, opponent, distance) {
    if (opponent.dizzyFrames > 0) {
      directive.executed = true;
      finishDirective(directive, view, true);
      return null;
    }
    if (opponent.down || opponent.wakeupFrames > 0) {
      return distance > 170 ? towardInput(self, opponent) : emptyInput();
    }
    if (distance > 155) return towardInput(self, opponent);
    if (!actionable(self)) return emptyInput();
    // Standing normals WITHOUT a held direction — inside grab range a
    // forward-held light would proximity-convert into a throw and reset the
    // stun meter instead of building it, and the crouching heavies are the
    // sweeps, which knock the victim down and hand the decay 60 free frames.
    // Heavies carry nearly twice the stun, so the string leans on them.
    // Lights, mostly: 9 stun every 22 frames beats 17 every 40, they never
    // sweep the victim down (a knockdown hands the 0.62/frame decay ~40 free
    // frames and undoes a quarter of the bar), and their hitstun outlasts
    // their own recovery so the string stays a real combo.
    const input = emptyInput();
    if (rng.nextFloat() < 0.78) input.light = true;
    else input.heavy = true;
    if (rng.nextFloat() < 0.5) input.limb = "kick";
    return input;
  }

  function runCounter(directive, view, self, opponent, distance) {
    if (directive.phase === "approach") {
      if (distance > 130) return towardInput(self, opponent);
      if (!actionable(self)) return emptyInput();
      // Signal the feed to swing; its heavy startup eats our quick light.
      directive.swingSignal = true;
      enterPhase(directive, "waitSwing");
      return emptyInput();
    }
    if (directive.phase === "waitSwing") {
      if (opponent.attacking) enterPhase(directive, "counterPress");
      else if (directive.frames > 40) finishDirective(directive, view, false);
      return emptyInput();
    }
    if (directive.phase === "counterPress") {
      if (directive.frames >= 2) {
        directive.swingSignal = false;
        enterPhase(directive, "recover");
        return { ...emptyInput(), light: true };
      }
      return emptyInput();
    }
    directive.swingSignal = false;
    return recoverStep(directive, view, self);
  }

  // Repeated advancing drive heavies walk the victim to the arena edge; the
  // splat itself is reported by the spawnWallImpact hook (side-agnostic beat
  // match) the moment the clamp arrests the flight. Knockdowns are WAITED OUT
  // rather than aborting: the herd is most of the work.
  function runWallsplat(directive, view, self, opponent, distance) {
    if (directive.executed) {
      finishDirective(directive, view, true);
      return null;
    }
    if (opponent.down || opponent.dizzyFrames > 0 || opponent.wakeupFrames > 0) {
      // Close the gap while they are getting up so the next drive connects.
      return distance > 200 ? towardInput(self, opponent) : emptyInput();
    }
    if (distance > 215) return towardInput(self, opponent);
    if (!actionable(self)) return emptyInput();
    return { ...emptyInput(), driveHeavy: true };
  }

  function runJuggle(directive, view, self, opponent, distance) {
    if (directive.phase === "approach") {
      const reach = bands[directive.side].launcher?.max || 150;
      if (distance > reach) return towardInput(self, opponent);
      if (!actionable(self)) return emptyInput();
      enterPhase(directive, "launch");
      return { ...emptyInput(), launcher: true };
    }
    if (directive.phase === "launch") {
      // Any airborne victim is juggleable — waiting for the armed knockdown
      // flag as well threw away the launches that arced them without it.
      if (!opponent.grounded) {
        enterPhase(directive, "followup");
        return emptyInput();
      }
      if (directive.frames > 50) finishDirective(directive, view, false);
      return emptyInput();
    }
    if (directive.phase === "followup") {
      if (!actionable(self)) return emptyInput();
      if (opponent.grounded) {
        finishDirective(directive, view, Boolean(directive.executed));
        return null;
      }
      enterPhase(directive, "recover");
      return { ...emptyInput(), special: true };
    }
    return recoverStep(directive, view, self);
  }

  // --- liveliness ----------------------------------------------------------
  // Nothing the choreographer drives may ever look switched off. This is the
  // shared "keep breathing" script: short walks, guards, ducks, the odd whiff
  // or backdash — always deterministic, always harmless to the showcase.
  function aliveInput(side, view, { attackShare = 0.18, guardShare = 0.34, keepNear = 0 } = {}) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    if (!actionable(self)) return emptyInput();
    const distance = Math.abs(opponent.x - self.x);
    const script = idleScript[side];
    if (view.tick >= script.until) {
      const roll = rng.nextFloat();
      script.mode = roll < attackShare ? "whiff"
        : roll < attackShare + guardShare ? (rng.nextFloat() < 0.4 ? "crouchGuard" : "guard")
          : roll < attackShare + guardShare + 0.24 ? "advance"
            : roll < attackShare + guardShare + 0.4 ? "retreat"
              : "duck";
      script.until = view.tick + 9 + Math.floor(rng.nextFloat() * 15);
    }
    if (keepNear && distance > keepNear) return towardInput(self, opponent);
    switch (script.mode) {
      case "whiff": {
        const input = emptyInput();
        input.light = true;
        if (rng.nextFloat() < 0.5) input.limb = "kick";
        script.until = view.tick + 12;
        return input;
      }
      case "guard": return { ...emptyInput(), guard: true };
      case "crouchGuard": return { ...emptyInput(), down: true, guard: true };
      case "duck": return { ...emptyInput(), down: true };
      case "retreat":
        // Never retreat into the wall — turn it into a forward step instead.
        return Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 140
          ? towardInput(self, opponent)
          : awayInput(self, opponent);
      default: return towardInput(self, opponent);
    }
  }

  // --- feed behaviour (the non-showcasing side during a duet directive) ----
  function feedInput(side, view) {
    const lane = lanes[side];
    const lead = lane.lead;
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    stats.feedTicks += 1;
    if (!actionable(self)) return emptyInput();
    const distance = Math.abs(opponent.x - self.x);
    switch (lane.mode) {
      case "swing":
        // Counter-hit setup: walk into range, then throw a slow heavy exactly
        // when the showcasing side is ready to punish its startup.
        if (lead.swingSignal) return { ...emptyInput(), heavy: true };
        if (distance > 150) return towardInput(self, opponent);
        return { ...emptyInput(), guard: true };
      case "close":
        // Throw setup: walk into grab range and stop swinging.
        if (distance > 92) return towardInput(self, opponent);
        return { ...emptyInput(), guard: true };
      case "guard": {
        // Guarded contact: hold the block and close the gap if the showcase
        // cannot reach. Deliberately plain — this is a short, once-per-match
        // window and every non-guard tick inside it is a chance for the hit
        // to land clean instead of on the block, which is the whole point.
        const band = lead.spec.band;
        if (band && distance > band.max + 60) return towardInput(self, opponent);
        return { ...emptyInput(), guard: true };
      }
      case "brace":
        // Wall splat / dizzy / weapon fetch victim: alive and defensive, but
        // it must NOT guard through a stun string (blocked hits build no
        // stun) and it must never trade the showcase away — a counter-swing
        // here interrupts the staging fighter and aborts the whole beat.
        return aliveInput(side, view, {
          attackShare: 0,
          guardShare: lead.spec.kind === "pressure" ? 0.06 : 0.45,
        });
      default:
        return aliveInput(side, view, { attackShare: 0.12 });
    }
  }

  // --- public step ---------------------------------------------------------
  // NOBODY STANDS STILL. Measured off the live fighter rather than off our
  // own input, so it also catches the archetype brain's dead spots during the
  // natural windows — the exhibition previously had stretches of 200+ ticks
  // where a fighter did not move a pixel. Runs only while the fighter is
  // genuinely free, so it can never step on a showcase.
  const STILL_LIMIT = 22;

  function liveliness(side, view, input) {
    const self = view.fighters[side];
    // Judged on what the fighter is DOING on screen, not on what we asked
    // for: a press that keeps failing (no meter, wrong spacing) is a
    // non-inert input that still reads as a statue.
    const moving = !actionable(self)
      || Math.abs(self.vx) > 1
      || self.crouch
      || self.guarding
      || self.dashFrames > 0;
    if (moving) {
      inertTicks[side] = 0;
      return input;
    }
    inertTicks[side] += 1;
    if (inertTicks[side] <= STILL_LIMIT) return input;
    inertTicks[side] = 0;
    stats.livelinessRescues += 1;
    return aliveInput(side, view, { attackShare: 0.16 });
  }

  function step(side, view) {
    if (!view || view.phase !== "fight") {
      if (lanes[0] || lanes[1]) {
        lanes[0] = null;
        lanes[1] = null;
        nextDecision[0] = (view?.tick || 0) + 20;
        nextDecision[1] = (view?.tick || 0) + 20;
      }
      return null;
    }
    const lane = lanes[side];
    if (lane?.role === "lead") return liveliness(side, view, runDirective(side, view));
    if (lane?.role === "feed") {
      // A feed whose lead has ended (or was replaced) is released at once,
      // and so is one whose lease has run out — no beat is worth locking a
      // fighter out of its own checklist for a whole round.
      if (view.tick >= lane.until || (!lane.sticky && lanes[1 - side] !== lane.lead)) {
        lanes[side] = null;
      } else {
        return liveliness(side, view, feedInput(side, view));
      }
    }
    // Moment beats (a downed opponent to disrespect, a weapon lying on the
    // floor) claim the stage regardless of the decision gap — their window is
    // NOW and the old gate is what made the pickup 0-for-10.
    const moment = maybeStart(side, view, true);
    if (moment) return liveliness(side, view, moment);
    if (view.tick < nextDecision[side]) return liveliness(side, view, null);
    const started = maybeStart(side, view);
    return liveliness(side, view, started);
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
    stats: () => ({ ...stats, itemPicks: { ...itemPicks } }),
    directive: () => {
      const active = lanes.filter((lane) => lane?.role === "lead").map((lane) => ({
        side: lane.side, item: lane.item, beat: lane.beat,
        kind: lane.spec.kind, phase: lane.phase,
      }));
      return active[0] || null;
    },
    directives: () => lanes.map((lane) => (lane
      ? lane.role === "lead"
        ? { role: "lead", side: lane.side, item: lane.item, beat: lane.beat, kind: lane.spec.kind, phase: lane.phase }
        : { role: "feed", mode: lane.mode }
      : null)),
    // The cumulative attract ledger this exhibition ends with, so the next
    // exhibition featuring the same fighter can lead with what it never got
    // to show. Purely additive; nothing here feeds the sim.
    carryover: () => Object.fromEntries(coverage.map((entry) => [
      entry.fighterId,
      Object.fromEntries(Object.entries(entry.moves).map(([id, count]) => [
        id, count + (prior[entry.side][id] || 0),
      ])),
    ])),
    hasStageWeapon: () => hasStageWeapon,
    pair: () => [...pair],
  });
}
