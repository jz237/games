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
//
// v2.9 FLOW third pass — the throughput was there but it still read as a
// statue trading a checklist. Five measured causes, five fixes:
//
//   A. STANDING STILL IS NOT "ALIVE". The old watchdog counted `crouch` and
//      `guarding` as motion, but the sim zeroes vx for a crouch and a
//      directionless guard, so both are literally a frozen sprite. Worse, the
//      idle script SPENT more than half its roll on exactly those two modes.
//      Guarding in this game is SF2 directional (back = block), so a guard
//      with a direction held both blocks AND walks: every idle/feed mode now
//      carries a direction, crouches are capped at a few ticks, and the
//      watchdog fires on the real "did the sprite move" test at 9 ticks.
//   B. WAITING PHASES WERE DEAD AIR. runCounter waited up to 40 ticks for the
//      feed to swing, runJuggle up to 50 for the launch, the pressure/wall
//      scripts stood still while the victim got up, and the guard feed froze
//      for a 70-tick lease — all returning emptyInput() on a fighter that was
//      free to move. Every one of those now shuffles on the spot.
//   C. A HIT ABANDONED THE WHOLE DIRECTIVE. Any non-resilient showcase that
//      took a counter-poke mid-approach was finished as `timedOut` on the
//      spot. That single rule was the majority of the 51-71% abandonment AND
//      the "approach, pause, reset" cadence: the pipeline visibly restarted
//      every time the fight touched it. A directive now RIDES OUT the
//      interruption (its budget is paused, not spent) and resumes its
//      approach, giving up only after a grace of real punishment.
//   D. THE SPECTACLES COMPETED WITH THE CHECKLIST. Wall splat and dizzy each
//      needed a whole exclusive directive to herd a victim 300px or build a
//      100-point stun bar, so they cost a showcase every attempt and still
//      only landed in half the matches. They now have a FREE lane: while
//      either beat is unshown the ordinary move picker simply prefers, among
//      the equally-least-shown candidates, the ones that push toward the
//      victim's wall or build stun. The dedicated directive is left as the
//      short finisher once the situation is already there.
//   E. ONE DASH AND ONE CROSS-UP PER MATCH. The movement beats were one-shot,
//      so the authored dash-brake cell (last two ticks of a dash) drew twice
//      in a whole exhibition and the turnaround key (2-3 ticks per facing
//      flip) three times. Both are now repeatable on a cooldown, and the idle
//      script can dash on its own.
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
const BEAT_SHARE = 0.22;

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
// v2.9 round 2: the two expensive spectacles used to get FEWER tries than the
// cheap ones, because every attempt cost a whole showcase. They no longer do
// (see the free lane in eligibleMoveItem — the herd and the stun string are
// built out of checklist moves the exhibition owed anyway), so the dedicated
// directive is a short finisher and can afford to be tried more often.
const BEAT_BUDGETS = Object.freeze({
  wallsplat: 7, dizzy: 7, weaponPickup: 4, turnaround: 6,
});
const BEAT_BACKOFF_FRAMES = 110;
// The two OPPORTUNISTIC beats back off faster than the rest: their window is
// a corner or a nearly-full stun bar, both of which come and go inside a
// round, and a 110-frame-per-attempt cooldown routinely had them still shut
// when the situation finally arrived.
const BEAT_BACKOFF_OVERRIDE = Object.freeze({ wallsplat: 70, dizzy: 80 });
// Beats whose whole point is repetition on screen. A one-shot ledger made the
// authored dash-brake cell (drawn on the last two ticks of a dash) visible for
// 2 ticks of a ~1730-tick exhibition and the turnaround key (2-3 ticks per
// grounded facing flip) for 3. Once these have been banked they may be staged
// again after their cooldown, so the cells actually get screen time.
const BEAT_REPEAT_FRAMES = Object.freeze({
  turnaround: 300, dashForward: 190, dashBack: 190,
});
// ...and a repeat is only OFFERED this often. The checklist owns the pipeline;
// a repeat is a garnish, and letting every cooled-down repeat into the lottery
// pushed beat picks from 21% of the pipeline to 42% and cost the exhibition
// four moves per fighter.
// Per-beat: a dash is two ticks of authored brake cell and ~20 ticks of lane,
// so it is cheap enough to come back often. A cross-up costs a whole jump arc
// plus the walk-in, so it does not.
const BEAT_REPEAT_SHARE = Object.freeze({
  dashForward: 0.6, dashBack: 0.6, turnaround: 0.3,
});
const BEAT_REPEAT_DEFAULT = 0.25;
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

// v2.9 round 2 — STAGE THROUGH YOUR OWN RECOVERY. `actionable` is "can act
// right now"; this is "nothing is being done TO me", i.e. the fighter is only
// busy with the tail of its own swing. The sim buffers a press for six frames
// and fires it the instant the recovery ends, so a showcase that opens during
// that tail comes out with no approach at all — which is where the pipeline's
// last dead time was. The gate is deliberately NOT `actionable`: waiting for
// the recovery to end and only then starting to walk was costing every
// showcase its whole predecessor's animation.
function stageable(fighter) {
  return fighter.grounded && !fighter.down
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
const FEED_LEASE_FRAMES = 44;

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
// combos.mjs cancelRoutes: a light confirms into heavy/special/commandSpecial/
// enhanced/super and a heavy into special/commandSpecial/enhanced/super. The
// route table keys on the ACTION GROUP, so the crouching heavies are legal
// cancel targets too — they just need their own `down` in the press, which
// directiveForMove already carries.
const CHAIN_ITEMS = new Set([
  "standHeavy", "standHeavyKick", "crouchHeavy", "crouchHeavyKick",
  "special", "commandSpecial", "enhanced", "enhancedCommandSpecial", "super",
]);
const MAX_CHAIN_LINKS = 2;
// Short: the sim's input buffer is only 6 frames, so a link that is going to
// cancel confirms within a few ticks of the swing and one that is not is pure
// dead lane. (The old 26 was sized for links pressed blind off a whiff, which
// can never come out at all — see chainItem.) Every tick spent here is a tick
// the NEXT showcase is not spending on its approach, so it is deliberately
// tight and only entered when a chainable item actually exists.
const CHAIN_WAIT_FRAMES = 9;

// Kinds that survive being hit mid-stage (see runDirective).
const RESILIENT_KINDS = new Set(["pressure", "wallsplat", "weapon"]);

// v2.9 round 2 — INTERRUPTION IS NOT FAILURE. Every other kind used to be
// abandoned the instant the fight touched it, which is where the majority of
// the abandoned directives came from and why the demo kept visibly resetting
// its approach. A directive now sits out the punishment (its budget paused,
// so a long combo cannot silently spend the timeout) and picks its approach
// back up; only sustained punishment gives up.
const INTERRUPT_GRACE_FRAMES = 48;

// Stun the fight has already built, and a victim already near the edge: the
// thresholds at which the dizzy and wall-splat stagings become MOMENTS.
// Both are lower/wider than the first pass because the dedicated directive is
// now only the finisher — the situation itself is built for free by the move
// checklist (see PRIME thresholds below).
// Round 2 measurement: a hit's carry decays 10% per tick (applyFighterPhysics
// hitstun branch) and the splat presentation needs the clamp to arrest the
// flight at >220 vx, so a 300-400 push only travels ~25-35px above that
// threshold. A wall splat is therefore a CORNER beat, not a herd: committing
// a directive at a 185-300px gap simply spent the attempt budget on geometry
// the sim cannot honour, and the beat was closed by backoff before a real
// corner ever arrived. The free lane keeps pushing toward the near wall; this
// directive only fires once the victim is genuinely there.
const WALLSPLAT_STAGE_GAP = 190;
// Same logic for the stun string: 100 points at 9 per light against a
// 0.62/frame decay is not a thing a 280-tick directive can build from nothing.
// The free lane carries the bar from 12 upward out of ordinary showcases, and
// this directive is the short finish once it is nearly full.
const DIZZY_STAGE_STUN = 34;
// The FREE lane. While either spectacle is unshown, the ordinary move picker
// breaks its own ties toward the checklist entries that build it: heavies and
// drives that carry the victim toward the wall they are already nearest, and
// stun-carrying normals once the bar has started climbing. Nothing here costs
// a directive, so a spectacle can never starve the kit again.
const DIZZY_PRIME_STUN = 12;
const WALLSPLAT_PRIME_GAP = 440;
// ...and the CLOSER tier. Once the bar is nearly full or the victim is
// genuinely in the corner, the situation is one clean hit from the beat, and
// that hit is worth more to the exhibition than the next unshown id. This is
// still not a directive — it just decides WHICH checklist move the showcase
// that was going to happen anyway throws.
const DIZZY_CLOSE_STUN = 38;
const WALLSPLAT_CLOSE_GAP = 115;
// Checklist ids that genuinely build a stun bar (throws and projectiles award
// none; the crouching heavies sweep, and a knockdown hands the 0.62/frame
// decay ~40 free frames).
const STUN_LANE_IDS = new Set([
  "standLight", "standLightKick", "crouchLight", "crouchLightKick",
  "standHeavy", "standHeavyKick", "overhead", "forwardHeavyKick",
  "forwardLight", "forwardLightKick",
]);
// ...and the ids whose push is big enough to carry a victim into the clamp at
// the >220 vx the wall-splat presentation needs.
// The subsets a beat script may actually PRESS. Deliberately free of the
// forward-held command normals: those need SPACE_SETTLE_FRAMES of one steady
// direction first or the motion recogniser turns them into command specials,
// and a herd/stun string has no time for that.
// Lights only: 9 stun every ~22 frames beats 17 every ~40, they never sweep
// the victim down (a knockdown hands the 0.62/frame decay ~40 free frames and
// undoes a quarter of the bar), and their hitstun outlasts their own recovery
// so the string stays a real combo.
const STUN_PRESS_IDS = new Set([
  "standLight", "standLightKick", "crouchLight", "crouchLightKick",
]);
const PUSH_PRESS_IDS = new Set([
  "standHeavy", "standHeavyKick", "crouchHeavy", "crouchHeavyKick",
  "driveHeavy", "special", "commandSpecial", "backSpecial", "launcher",
  "enhanced", "enhancedCommandSpecial", "enhancedBackSpecial",
]);
const PUSH_LANE_IDS = new Set([
  "standHeavy", "standHeavyKick", "overhead", "forwardHeavyKick",
  "crouchHeavy", "crouchHeavyKick", "driveHeavy", "special", "commandSpecial",
  "backSpecial", "launcher", "enhanced", "enhancedCommandSpecial",
  "enhancedBackSpecial", "super",
]);
// A guard feed is a one-off block window, held on its own clock (see below).
const GUARD_FEED_FRAMES = 60;

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
    // v2.9 round 2 diagnostics. `abandoned` is broken down by CAUSE so a
    // regression names itself instead of showing up as one opaque counter,
    // and `interrupted`/`resumed` measure the ride-out that replaced the old
    // abort-on-contact rule.
    interrupted: 0, resumed: 0, stunLanePicks: 0, pushLanePicks: 0,
    abandonedBy: {}, abandonedKind: {}, abandonedItem: {}, substituted: {},
    leadTicks: 0, idleTicks: 0, gapTicks: 0, movesNoted: 0, preempted: 0, preempted: 0,
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
  // The tick a beat last landed, per pair and per side, so the repeatable
  // movement/turnaround beats can come back around on their cooldown.
  const beatLastTick = Object.fromEntries(DEMO_BEATS.map((beat) => [beat, -Infinity]));
  const sideBeatTick = [
    Object.fromEntries(DEMO_BEATS.map((beat) => [beat, -Infinity])),
    Object.fromEntries(DEMO_BEATS.map((beat) => [beat, -Infinity])),
  ];
  // noteBeat/noteMove are called from sim event sites that have no view, so
  // the choreographer keeps the last tick it was stepped with.
  let clock = 0;
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
    if (id in moves) { moves[id] += 1; stats.movesNoted += 1; }
    const lead = leadOf(side);
    if (!lead) return;
    if (lead.item === id) { lead.executed = true; return; }
    // Diagnostic: the showcase pressed one thing and the sim started another
    // (a proximity-grab conversion, a stale motion token, a context the press
    // could not carry). Recorded so the mismatch names itself.
    if (lead.item && ["press", "hold", "recover"].includes(lead.phase)) {
      const key = `${lead.item}>${id}`;
      stats.substituted[key] = (stats.substituted[key] || 0) + 1;
    }
  }

  function noteBeat(side, beat) {
    if (side !== 0 && side !== 1) return;
    const beats = coverage[side].beats;
    if (beat in beats) {
      beats[beat] += 1;
      beatLastTick[beat] = clock;
      sideBeatTick[side][beat] = clock;
    }
    // Beats are matched side-agnostically: wall splats and dizzies land on
    // the victim while the staging directive belongs to the attacker.
    for (const lane of lanes) {
      if (lane?.role === "lead" && lane.beat === beat) lane.executed = true;
    }
  }

  // --- per-tick movement/state observation (edge detection) ----------------
  function observe(view) {
    if (!view || !Array.isArray(view.fighters)) return;
    clock = view.tick || clock;
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
    if (beatTotal(beat) !== 0) {
      // A beat that has landed is normally done for the exhibition. The
      // repeatable ones (see BEAT_REPEAT_FRAMES) come back on a cooldown
      // instead, because their whole problem was screen time, not coverage.
      const repeat = BEAT_REPEAT_FRAMES[beat];
      if (!repeat || view.tick < beatLastTick[beat] + repeat) return false;
      if (rng.nextFloat() >= (BEAT_REPEAT_SHARE[beat] ?? BEAT_REPEAT_DEFAULT)) return false;
    }
    if (beatAttempts[beat] >= (BEAT_BUDGETS[beat] ?? BEAT_ATTEMPT_BUDGET)) return false;
    return view.tick >= beatBlockedUntil[beat];
  }

  // The movement beats stay judged per fighter (both sides owe the cabinet
  // their own dashes and jump arcs) but follow the same repeat rule.
  function sideBeatOpen(side, beat, view) {
    if (beatsFor(side)[beat] !== 0) {
      const repeat = BEAT_REPEAT_FRAMES[beat];
      if (!repeat || view.tick < sideBeatTick[side][beat] + repeat) return false;
      if (rng.nextFloat() >= (BEAT_REPEAT_SHARE[beat] ?? BEAT_REPEAT_DEFAULT)) return false;
    }
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
    const partnerBusy = Boolean(leadOf(1 - side));
    // v2.9 round 2: a duet beat used to be withheld entirely whenever the
    // partner happened to be mid-showcase. Now that both lanes are busy ~65%
    // of an exhibition that withheld the throw and the counter-hit most of
    // the time (throw fell from 16 of 20 matches to 11). The beats are offered
    // regardless and simply run WITHOUT a scripted feed when the partner is
    // busy — a throw still lands on a grounded opponent, and a counter-hit is
    // if anything easier against a partner who is actually swinging.
    const feedIf = (mode) => (partnerBusy ? null : mode);
    const candidates = [];
    {
      // v2.9 round 2: the long deliberate herd is gone from the lottery. It
      // cost a showcase every attempt (measured: two moves per fighter across
      // thirty-six exhibitions) to buy one extra splat in six. The corner
      // case in momentBeatDirective is the beat now, the free lane herds out
      // of ordinary showcases, and the herd itself is coverage (runWallsplat).
      // The deliberate herd, back on a TIGHTER leash than the first pass: only
      // the side that would drive the victim toward the near wall may take it,
      // only once the free lane has already brought the gap under 240, and the
      // herd itself throws the least-shown checklist entry that pushes (see
      // runWallsplat) rather than hammering one drive heavy. Without it the
      // splat fell from 17 of 36 exhibitions to 8-12; with it the beat is paid
      // for out of moves the exhibition owed anyway.
      if (beatOpen("wallsplat", view) && !opponent.down
        && pushWallGap(self, opponent, view) < 240) {
        candidates.push({ beat: "wallsplat", make: () => ({ kind: "wallsplat", feed: feedIf("brace") }) });
      }
      if (beatOpen("counterhit", view) && !opponent.down) {
        candidates.push({ beat: "counterhit", make: () => ({ kind: "counter", feed: feedIf("swing") }) });
      }
      if (beatOpen("throw", view) && !opponent.down) {
        candidates.push({
          beat: "throw",
          make: () => ({
            kind: "ground", press: { throw: true }, hold: {},
            band: bands[side].throw || { min: MIN_SEPARATION, max: 120 },
            feed: feedIf("close"),
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
          make: () => ({ kind: "air", press: null, jumpDir: 1, approach: 100, crossup: true, feed: feedIf("plant") }),
        });
      }
      if (beatOpen("juggle", view) && !opponent.down) {
        candidates.push({ beat: "juggle", make: () => ({ kind: "juggle", feed: feedIf("brace") }) });
      }
    }
    for (const [beat, dir] of [["dashForward", 1], ["dashBack", -1], ["jumpForward", 1], ["jumpNeutral", 0], ["jumpBack", -1]]) {
      if (!sideBeatOpen(side, beat, view)) continue;
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
    // THE CLOSER. A stun bar at 50 and a victim already against the clamp are
    // both one clean hit from a staged beat that otherwise reaches barely half
    // the exhibitions. When that is true the showcase that was going to happen
    // anyway throws the move that finishes it — no directive is spent, no beat
    // budget is burned, and the checklist only loses its ORDER, not its
    // contents (the closers are all ordinary kit normals).
    if (!opponent.down) {
      // The corner is checked first: it is the rarer and far more perishable
      // of the two windows (a victim walks out of a corner in a few dozen
      // ticks; a stun bar bleeds down slowly).
      const closerSet = beatTotal("wallsplat") === 0
        && pushWallGap(self, opponent, view) < WALLSPLAT_CLOSE_GAP ? PUSH_LANE_IDS
        : beatTotal("dizzy") === 0 && opponent.stunMeter >= DIZZY_CLOSE_STUN
          && distance < 280 ? STUN_LANE_IDS
          : null;
      if (closerSet && rng.nextFloat() < 0.8) {
        const closers = ids.filter((id) => closerSet.has(id));
        if (closers.length) {
          const low = Math.min(...closers.map((id) => moves[id]));
          const pool = closers.filter((id) => moves[id] === low);
          const chosen = pick(pool);
          if (closerSet === STUN_LANE_IDS) stats.stunLanePicks += 1;
          else stats.pushLanePicks += 1;
          return { id: chosen, count: moves[chosen] };
        }
      }
    }
    // Strong least-shown bias inside this exhibition...
    const minimum = Math.min(...ids.map((id) => moves[id]));
    ids = ids.filter((id) => moves[id] === minimum);
    // ...then the cumulative attract ledger breaks the tie, so a fighter the
    // cabinet has featured before opens with what it has never shown.
    const minPrior = Math.min(...ids.map((id) => prior[side][id]));
    ids = ids.filter((id) => prior[side][id] === minPrior);
    // THE FREE LANE (v2.9 round 2). Wall splat and dizzy used to need a whole
    // exclusive directive each — a 300px herd or a 100-point stun bar built
    // out of nothing — so every attempt cost the checklist a showcase and the
    // pair still only reached the beat in half the exhibitions. Both are now
    // built out of moves the exhibition ALREADY owed: among the candidates
    // that are equally least-shown, prefer the ones that push the victim
    // toward the wall they are already nearest, or that carry stun once the
    // bar has started climbing. Applied strictly as a tie-break, so it can
    // never change WHICH moves get shown — only their order. The dice roll is
    // load-bearing: a spectacle whose situation stays live for a whole round
    // would otherwise exclude the same handful of ids (the throwables, the air
    // normals) from every pick and starve them exactly the way the dedicated
    // directives used to.
    const wallGap = pushWallGap(self, opponent, view);
    const laneOpen = ids.length > 2 && !opponent.down && rng.nextFloat() < 0.55;
    const dizzyLaneOpen = laneOpen && beatTotal("dizzy") === 0;
    if (laneOpen && beatTotal("wallsplat") === 0 && wallGap < WALLSPLAT_PRIME_GAP) {
      const push = ids.filter((id) => PUSH_LANE_IDS.has(id));
      if (push.length) { ids = push; stats.pushLanePicks += 1; }
    } else if (dizzyLaneOpen && opponent.stunMeter >= DIZZY_PRIME_STUN && distance < 300) {
      const stun = ids.filter((id) => STUN_LANE_IDS.has(id));
      if (stun.length) { ids = stun; stats.stunLanePicks += 1; }
    }
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

  // v2.9 round 2 — A BEAT SWING IS ALSO A SHOWCASE. The stun string used to
  // roll a random light/heavy and the wall herd hammered driveHeavy (measured:
  // 134 of 877 moves shown across twenty exhibitions were the same key, none
  // of it new coverage). Both now throw the LEAST-SHOWN checklist entry that
  // still serves the beat, so building a spectacle costs the kit nothing.
  function beatPress(side, view, allowed) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const moves = coverage[side].moves;
    const ids = checklists[side].filter((id) => {
      if (!allowed.has(id)) return false;
      if (EX_ACTIONS.has(id) && self.meter < GRIT_RULES.enhancedSpecialCost) return false;
      return true;
    });
    if (!ids.length) return null;
    const low = Math.min(...ids.map((id) => moves[id]));
    const id = pick(ids.filter((entry) => moves[entry] === low));
    const spec = directiveForMove(side, id);
    return Object.assign(holdInput(spec, self, opponent), spec.press);
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
  // Is there anything worth chaining into at all? Confirm-independent, so
  // recoverStep can skip the whole wait when the answer is no.
  function chainCandidate(side, view) {
    const self = view.fighters[side];
    const moves = coverage[side].moves;
    return checklists[side].some((id) => {
      if (!CHAIN_ITEMS.has(id)) return false;
      if (moves[id] !== 0) return false;
      if (EX_ACTIONS.has(id) && self.meter < GRIT_RULES.enhancedSpecialCost) return false;
      if (id === "super" && self.meter < GRIT_RULES.superCost) return false;
      return view.tick >= itemBlockedUntil[side][id];
    });
  }

  function chainItem(side, view) {
    const self = view.fighters[side];
    // v2.9 round 2 — ONLY OFF A CONFIRMED HIT. combos.mjs CANCEL_ROUTES is
    // gated on fighter.attackConnected, so a link queued behind a WHIFF can
    // never come out: it sat in the buffer, the directive waited its 26-frame
    // chain window and was then abandoned having shown nothing. Measured over
    // twenty exhibitions that was 199 of 316 abandoned directives, all of them
    // on the four chainable ids. The sim's own confirm flag is the gate.
    if (!self.attackConnected) return null;
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
    if (!stageable(self)) return null;
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
    // A jump or a dash cannot come out of the tail of a swing, so those kinds
    // still wait for a genuinely free fighter — starting them during recovery
    // only burned their own timeout (measured: 31 abandoned air/dash
    // directives once the buffered opener let showcases start early).
    if ((spec.kind === "air" || spec.kind === "dash") && !actionable(self)) return null;
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
      phase: openingPhase(spec),
      frames: 0,
      totalFrames: 0,
      executed: false,
      swingSignal: false,
      chaining: false,
      links: 0,
      stalled: 0,
      resume: false,
    };
    lanes[side] = directive;
    claimFeed(side, spec.feed, directive, view);
    return runDirective(side, view);
  }

  function finishDirective(directive, view, completed, cause = "") {
    const side = directive.side;
    stats[completed ? "completed" : "timedOut"] += 1;
    if (!completed) {
      const key = cause || "unknown";
      stats.abandonedBy[key] = (stats.abandonedBy[key] || 0) + 1;
      const kind = directive.spec?.kind || "?";
      stats.abandonedKind[kind] = (stats.abandonedKind[kind] || 0) + 1;
      const label = directive.item
        ? (directive.chaining ? `chain:${directive.item}` : directive.item)
        : `beat:${directive.beat}`;
      stats.abandonedItem[label] = (stats.abandonedItem[label] || 0) + 1;
    }
    if (directive.beat && !completed) {
      beatAttempts[directive.beat] += 1;
      beatBlockedUntil[directive.beat] = view.tick
        + (BEAT_BACKOFF_OVERRIDE[directive.beat] ?? BEAT_BACKOFF_FRAMES)
        * beatAttempts[directive.beat];
    }
    // A beat that DID land clears its own failure budget, so a repeatable
    // movement beat is not permanently closed by three early misses.
    if (directive.beat && completed) beatAttempts[directive.beat] = 0;
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
      finishDirective(directive, view, Boolean(directive.executed), `timeout:${directive.phase}`);
      return null;
    }
    // v2.9 round 2 — RIDE OUT THE PUNISHMENT. Every non-resilient showcase
    // used to be abandoned the instant the fight touched it, which was both
    // the largest single source of abandoned directives AND the visible
    // "approach, pause, reset" cadence: the pipeline restarted its march every
    // time it got poked. A directive now sits the interruption out with its
    // budget PAUSED (so a long combo cannot silently spend the whole timeout)
    // and picks its approach back up, giving up only once the punishment has
    // run past the grace.
    const interrupted = self.down || self.hitstunFrames > 0 || self.dizzyFrames > 0 || self.grabbed;
    if (interrupted && directive.phase !== "recover") {
      if (RESILIENT_KINDS.has(spec.kind)) return emptyInput();
      if (!directive.stalled) stats.interrupted += 1;
      directive.stalled = (directive.stalled || 0) + 1;
      directive.totalFrames -= 1;
      directive.frames -= 1;
      if (directive.stalled > INTERRUPT_GRACE_FRAMES) {
        finishDirective(directive, view, Boolean(directive.executed), "punished");
        return null;
      }
      directive.resume = true;
      return emptyInput();
    }
    if (directive.resume) {
      // Back on our feet: the spacing has certainly moved, so restart the
      // directive at its own opening phase rather than pressing into air.
      directive.resume = false;
      stats.resumed += 1;
      directive.spaceAway = undefined;
      enterPhase(directive, openingPhase(spec));
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
        finishDirective(directive, view, false, "unknownKind");
        return null;
    }
  }

  function enterPhase(directive, name) {
    directive.phase = name;
    directive.frames = 0;
  }

  // The phase a spec opens on — shared by maybeStart and the interruption
  // resume so a directive that got hit restarts exactly the way it began.
  function openingPhase(spec) {
    if (spec.kind === "dash" || spec.kind === "air") return "act";
    if (spec.kind === "weapon") return "fetch";
    if (spec.kind === "ground" && (spec.hold?.down || spec.hold?.forward)) return "space";
    if (spec.kind === "ground") return "approach";
    return "approach";
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
    if (directive.executed) {
      // v2.9 round 2 — THE CONFIRM WINDOW. The move is out and the lane is
      // conceptually free, but the sim only opens a cancel route once the
      // swing has CONNECTED (fighter.attackConnected), which is startup
      // frames after the press. So while the move is still animating we take
      // one cheap look per tick: a confirm chains the next unshown checklist
      // entry into the cancel window and the exhibition shows two entries in
      // the animation time of one. A whiff simply never confirms and the
      // lane is released on the next tick — which is what the old
      // press-blind-and-hope chain could never tell the difference between.
      if (self.attacking && directive.links < MAX_CHAIN_LINKS
        && directive.frames < CHAIN_WAIT_FRAMES
        && chainCandidate(directive.side, view)) {
        const link = chainItem(directive.side, view);
        if (link) {
          startChainLink(directive, link);
          return emptyInput();
        }
        return emptyInput();
      }
      finishDirective(directive, view, true, "");
      return emptyInput();
    }
    if (!self.attacking && actionable(self)) {
      finishDirective(directive, view, false, "noMove");
      return emptyInput();
    }
    if (directive.frames >= 60) {
      finishDirective(directive, view, Boolean(directive.executed), "recoverStall");
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
      // Round 2: the spacing is right, so arm the press NOW even if we are
      // still finishing the last swing — see stageable().
      if (!stageable(self)) return emptyInput();
      enterPhase(directive, "press");
    }
    if (directive.phase === "press") {
      // A chain link presses INTO the current move: the sim's input buffer
      // carries it into tryAttackCancel, so `actionable` deliberately does
      // not gate it.
      if (!stageable(self) && !directive.chaining) {
        // Whatever froze us (blockstun, a throw) may have moved the spacing —
        // go back and re-space instead of drifting into grab range.
        if (directive.frames > 8) enterPhase(directive, "approach");
        return emptyInput();
      }
      const input = Object.assign(holdInput(spec, self, opponent), spec.press);
      // Throws are a direction + light inside grab range: hold toward.
      if (input.throw) Object.assign(input, towardInput(self, opponent), { throw: true });
      // BUFFERED OPENER. If we are still in our own recovery the press cannot
      // start a move this tick, but the sim's six-frame buffer will fire it
      // the instant the recovery ends — so the press is simply held live
      // (re-buffered every tick) instead of the whole showcase waiting.
      if (!actionable(self) && !directive.chaining) {
        if (directive.frames > 30) enterPhase(directive, "approach");
        return input;
      }
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
        // The cancel chain moved to recoverStep in round 2: the sim's confirm
        // flag is not set yet on the tick the move starts, so chaining here
        // could only ever press blind.
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
        if (directive.frames > 60) finishDirective(directive, view, false, "airNotActionable");
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
        finishDirective(directive, view, false, "jumpSwallowed");
        return null;
      }
      // Round 2: keep asking while we are still on the floor. A single-tick
      // press landing on a frame the sim could not consume simply vanished,
      // which is where the abandoned jump arcs came from.
      if (self.grounded && actionable(self)) {
        const retry = jumpDir === 0 ? emptyInput()
          : jumpDir > 0 ? towardInput(self, opponent) : awayInput(self, opponent);
        retry.jump = true;
        return retry;
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
        if (directive.frames > 50) finishDirective(directive, view, false, "dashNotActionable");
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
      finishDirective(directive, view, Boolean(directive.executed), "dashNotTaken");
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
        finishDirective(directive, view, Boolean(directive.executed), "weaponGone");
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
        finishDirective(directive, view, Boolean(directive.executed), "weaponGone");
        return null;
      }
      // The press only lands on a tick the fighter is free and standing over
      // it; anything else re-approaches rather than mashing out a crouch HP.
      if (directive.frames > 10) {
        enterPhase(directive, "fetch");
        return emptyInput();
      }
      if (!actionable(self)) return emptyInput();
      const drift = weapon.x - self.x;
      if (Math.abs(drift) > 40) {
        // Round 2: standing still next to a weapon we cannot reach is dead
        // air AND a wasted budget — walk the last few pixels onto it.
        return { ...emptyInput(), right: drift > 0, left: drift < 0 };
      }
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
      // Round 2: standing over a downed victim waiting for the wake-up was
      // pure dead air — pace the range instead so the string looks intended.
      return distance > 170 ? towardInput(self, opponent) : rockInput(directive.side, view, 96, 168);
    }
    if (distance > 155) return towardInput(self, opponent);
    // Round 2: hold the next poke live through our own recovery so it fires
    // the instant the sim frees us (six-frame buffer). The bar decays at
    // 0.62/frame — every idle tick between pokes is stun given back.
    if (!stageable(self)) return emptyInput();
    // Standing normals WITHOUT a held direction — inside grab range a
    // forward-held light would proximity-convert into a throw and reset the
    // stun meter instead of building it, and the crouching heavies are the
    // sweeps, which knock the victim down and hand the decay 60 free frames.
    // Heavies carry nearly twice the stun, so the string leans on them.
    // Lights, mostly: 9 stun every 22 frames beats 17 every 40, they never
    // sweep the victim down (a knockdown hands the 0.62/frame decay ~40 free
    // frames and undoes a quarter of the bar), and their hitstun outlasts
    // their own recovery so the string stays a real combo.
    return beatPress(directive.side, view, STUN_PRESS_IDS) || { ...emptyInput(), light: true };
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
      else if (directive.frames > 40) finishDirective(directive, view, false, "noSwing");
      // Round 2: this was the single longest scripted statue in the module —
      // up to 40 ticks of a fighter standing in front of the opponent waiting
      // to be swung at. Bait the swing by walking the range instead.
      return rockInput(directive.side, view, 92, 132);
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
      // Close the gap while they are getting up so the next drive connects —
      // and keep pacing the corner rather than freezing over the body.
      return distance > 200 ? towardInput(self, opponent) : rockInput(directive.side, view, 120, 198);
    }
    if (distance > 215) return towardInput(self, opponent);
    if (!actionable(self)) return emptyInput();
    // Round 2: the herd used to be one move pressed over and over — measured,
    // driveHeavy accounted for 134 of 877 moves shown across twenty
    // exhibitions and none of them was new coverage. Any big-push swing
    // carries the victim into the clamp at the >220 vx the splat needs, so
    // the string alternates instead of hammering the same key.
    directive.swings = (directive.swings || 0) + 1;
    if (directive.swings > 7) {
      finishDirective(directive, view, Boolean(directive.executed), "herdSpent");
      return null;
    }
    // The HERD rotates through the least-shown pushing checklist entries, so
    // walking the victim to the corner is coverage. The SLAM does not: a hit
    // only splats if the clamp arrests it above 220 vx and the carry bleeds
    // 10% a tick, so once the victim is actually against the wall the biggest
    // push in the kit is the only one that converts.
    if (pushWallGap(self, opponent, view) < 70) {
      return { ...emptyInput(), driveHeavy: true };
    }
    return beatPress(directive.side, view, PUSH_PRESS_IDS) || { ...emptyInput(), driveHeavy: true };
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
      if (directive.frames > 50) finishDirective(directive, view, false, "noLaunch");
      return rockInput(directive.side, view, 100, 170);
    }
    if (directive.phase === "followup") {
      if (!actionable(self)) return emptyInput();
      if (opponent.grounded) {
        finishDirective(directive, view, Boolean(directive.executed), "juggleLanded");
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
  //
  // v2.9 round 2 — A GUARD IS NOT MOTION. The sim zeroes vx for a crouch
  // (`if (fighter.crouch) fighter.vx = 0`) and for a directionless guard, so
  // the old script's crouchGuard/guard/duck modes — over half its roll — put
  // the fighter on screen as a literal frozen sprite. Guarding here is SF2
  // directional (back = block, and an explicit guard flag blocks too), so
  // every mode now carries a direction: the fighter blocks WHILE stepping.
  // The crouch modes survive because the crouch-transition cells need them,
  // but they are capped at a few ticks instead of up to 24.
  const CROUCH_BEAT_FRAMES = 7;

  // A real double-tap dash, spread over the ticks the recogniser needs. The
  // authored dash-brake cell only draws on a dash's last two ticks, so the
  // idle script owning a dash is what gives that cell screen time.
  function dashTap(script, view, self, opponent) {
    const step = view.tick - script.start;
    const dir = script.dashForward ? towardInput(self, opponent) : awayInput(self, opponent);
    if (step === 2 || (step >= 5 && step <= 8)) return dir;
    return emptyInput();
  }

  function aliveInput(side, view, {
    attackShare = 0.18, guardShare = 0.34, keepNear = 0, allowDash = false,
  } = {}) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    if (!actionable(self)) return emptyInput();
    const distance = Math.abs(opponent.x - self.x);
    const script = idleScript[side];
    if (view.tick >= script.until) {
      const roll = rng.nextFloat();
      const dashShare = allowDash ? 0.12 : 0;
      // A crouch is the one idle mode the sim freezes outright, so it never
      // runs twice in a row: back-to-back ducks were how a short, legitimate
      // crouch turned into a thirty-tick statue.
      const crouched = script.mode === "duck" || script.mode === "crouchGuard";
      script.mode = roll < attackShare ? "whiff"
        : roll < attackShare + dashShare ? "dash"
          : roll < attackShare + dashShare + guardShare
            ? (!crouched && rng.nextFloat() < 0.3 ? "crouchGuard" : "guard")
            : roll < attackShare + dashShare + guardShare + 0.26 ? "advance"
              : roll < attackShare + dashShare + guardShare + 0.44 ? "retreat"
                : crouched ? "advance" : "duck";
      script.start = view.tick;
      script.dashForward = rng.nextFloat() < 0.55;
      script.stepAway = rng.nextFloat() < 0.5;
      script.until = view.tick + (script.mode === "dash" ? 10
        : script.mode === "duck" || script.mode === "crouchGuard" ? CROUCH_BEAT_FRAMES
          : 9 + Math.floor(rng.nextFloat() * 15));
    }
    if (keepNear && distance > keepNear) return towardInput(self, opponent);
    // Never walk into the wall: within a body of the edge every "away" step
    // turns into a step back toward the fight.
    const cornered = Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 140;
    const stepAway = script.stepAway && !cornered && distance < 420;
    const drift = stepAway ? awayInput(self, opponent) : towardInput(self, opponent);
    switch (script.mode) {
      case "whiff": {
        const input = emptyInput();
        input.light = true;
        if (rng.nextFloat() < 0.5) input.limb = "kick";
        script.until = view.tick + 12;
        return input;
      }
      case "dash": return dashTap(script, view, self, opponent);
      // A guard with a direction held both blocks and walks — the fighter is
      // visibly defending instead of standing at attention.
      case "guard": return { ...drift, guard: true };
      case "crouchGuard": return { ...emptyInput(), down: true, guard: true };
      case "duck": return { ...emptyInput(), down: true };
      case "retreat":
        return cornered ? towardInput(self, opponent) : awayInput(self, opponent);
      default: return towardInput(self, opponent);
    }
  }

  // A fighter that has to hold a position (a feed waiting for the showcase, a
  // script waiting for a cue) still has to look alive. Rocking on the spot —
  // in and out of the window it must hold — keeps vx non-zero every tick
  // without ever leaving the range the beat needs.
  function rockInput(side, view, near, far, { guard = false } = {}) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    const cornered = Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 90;
    const away = !cornered && (distance < near || (distance <= far && Math.floor(view.tick / 11) % 2 === 0));
    const base = away ? awayInput(self, opponent) : towardInput(self, opponent);
    return guard ? { ...base, guard: true } : base;
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
      // v2.9 round 2: every one of these used to answer `{ guard: true }` —
      // no direction, so the sim left vx at zero and the partner stood at
      // attention for the whole lease (up to 70 ticks, and the feed roles ran
      // for ~8% of an exhibition). Guarding is directional in this sim, so a
      // guard with a step held blocks exactly as well and still moves.
      case "swing":
        // Counter-hit setup: walk into range, then throw a slow heavy exactly
        // when the showcasing side is ready to punish its startup.
        if (lead.swingSignal) return { ...emptyInput(), heavy: true };
        if (distance > 150) return towardInput(self, opponent);
        return rockInput(side, view, 96, 150, { guard: true });
      case "close":
        // Throw setup: walk into grab range and stop swinging.
        if (distance > 92) return towardInput(self, opponent);
        return rockInput(side, view, MIN_SEPARATION + 8, 92, { guard: true });
      case "guard": {
        // Guarded contact: hold the block and close the gap if the showcase
        // cannot reach. The rock keeps the fighter inside the showcase's band
        // the whole time — it never steps out of the hit it is there to eat.
        const band = lead.spec.band;
        if (band && distance > band.max + 60) return towardInput(self, opponent);
        return band
          ? rockInput(side, view, band.min, band.max, { guard: true })
          : rockInput(side, view, 90, 190, { guard: true });
      }
      case "plant":
        // v2.9 round 2 — the cross-up defender must be able to WEAR the
        // turnaround key. The authored pivot only draws while the flipping
        // fighter is grounded, free and neither guarding nor crouching (a
        // block or a crouch pose outranks it in fighterPoseDescriptor), so a
        // braced feed that spent 45% of its ticks blocking was throwing the
        // cell away on half the cross-ups it set up. Guarding here is
        // directional too — holding BACK blocks — so the plant only ever
        // walks forward, and the wall is the one thing that turns it around.
        return Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 90
          ? awayInput(self, opponent)
          : towardInput(self, opponent);
      case "brace":
        // Wall splat / dizzy / weapon fetch victim: alive and defensive, but
        // it must NOT guard through a stun string (blocked hits build no
        // stun) and it must never trade the showcase away — a counter-swing
        // here interrupts the staging fighter and aborts the whole beat.
        // A guarded hit builds no stun AND carries no wall push (blockstun
        // is not hitstun, so the clamp never arrests a flight), so the two
        // spectacles that need contact get a victim that mostly does not
        // block. Everything else keeps a normal defensive brace.
        return aliveInput(side, view, {
          attackShare: 0,
          guardShare: lead.spec.kind === "pressure" || lead.spec.kind === "wallsplat"
            ? 0.06 : 0.45,
        });
      default:
        return aliveInput(side, view, { attackShare: 0.12 });
    }
  }

  // --- public step ---------------------------------------------------------
  // NOBODY STANDS STILL. Measured off the live fighter rather than off our own
  // input, so it also catches the archetype brain's dead spots during the
  // natural windows.
  //
  // v2.9 round 2 — the old test counted `crouch` and `guarding` as motion,
  // which is exactly backwards: the sim pins vx to 0 for a crouch and a
  // directionless guard, so those were the two states the watchdog was
  // guarding AGAINST and it rescued 10 times in twenty exhibitions. It now
  // uses the honest "did the sprite move" test at a much shorter fuse, and
  // it only ever replaces a NEUTRAL input, so a press, a held direction or a
  // crouch a showcase deliberately asked for is never disturbed.
  const STILL_LIMIT = 9;

  function isNeutral(input) {
    if (!input) return true;
    for (const value of Object.values(input)) if (value === true) return false;
    return true;
  }

  function liveliness(side, view, input) {
    const self = view.fighters[side];
    const still = actionable(self)
      && Math.abs(self.vx) < 3
      && self.dashFrames <= 0;
    if (!still) {
      inertTicks[side] = 0;
      return input;
    }
    inertTicks[side] += 1;
    if (inertTicks[side] <= STILL_LIMIT || !isNeutral(input)) return input;
    inertTicks[side] = 0;
    stats.livelinessRescues += 1;
    // Never a crouch or a bare guard here — this is the rescue, and both of
    // those are the thing being rescued from.
    return aliveInput(side, view, {
      attackShare: 0.18, guardShare: 0.22, allowDash: !lanes[side],
    });
  }

  function step(side, view) {
    clock = view?.tick || clock;
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
    if (lane?.role === "lead") {
      // v2.9 round 2 — A NEARLY-FULL STUN BAR OUTRANKS AN UNSTARTED POKE.
      // Both lanes are busy about two thirds of an exhibition now, so gating
      // the moment check on an empty lane meant most stun windows were never
      // looked at, and the bar decays at 0.62/frame while nobody is looking.
      // Deliberately the NARROWEST possible preemption: only for the stun
      // string, only once the bar is nearly full, and only over a plain move
      // showcase that has not started its move and has spent under twenty
      // ticks. The item stays least-shown and is picked again immediately, so
      // this is a reorder rather than an abandonment — stats.preempted keeps
      // it out of the completed/timedOut ledger and visible on its own.
      const rival = view.fighters[1 - side];
      if (!lane.beat && !lane.executed && lane.totalFrames < 20
        && beatTotal("dizzy") === 0 && !rival.down
        && rival.stunMeter >= DIZZY_CLOSE_STUN + 14
        && stageable(view.fighters[side])) {
        const saved = lanes[side];
        lanes[side] = null;
        const grabbed = maybeStart(side, view, true);
        if (grabbed) {
          stats.preempted += 1;
          return liveliness(side, view, grabbed);
        }
        lanes[side] = saved;
      }
      stats.leadTicks += 1;
      return liveliness(side, view, runDirective(side, view));
    }
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
    if (view.tick < nextDecision[side]) {
      stats.gapTicks += 1;
      return liveliness(side, view, null);
    }
    stats.idleTicks += 1;
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
