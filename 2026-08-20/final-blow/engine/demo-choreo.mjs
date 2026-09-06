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
//
// v2.9 FLOW fourth pass — four measured defects, and this time the two
// spectacles are solved against the SIM'S OWN RULES rather than traded away:
//
//   F1. THE AIR ROW WAS INVISIBLE (airLightKick fired in 6 of 16 fighter
//       slots, the rest of the row 4-7 of 16). Three causes, all in the
//       pipeline rather than the sim:
//       (a) the free-lane and closer tie-breaks filter the least-shown pool
//           down to PUSH_LANE_IDS / STUN_LANE_IDS, and NO air normal is in
//           either set. Because wall splat and dizzy stayed unshown for
//           essentially the whole exhibition, that filter was live for most
//           of it and stripped the air row out of a majority of picks;
//       (b) `!actionable -> return null` threw an air pick away completely
//           whenever the fighter was in its own recovery tail — which is
//           exactly when the pipeline deliberately starts showcases (see
//           stageable). The sim buffers `jump` for six frames, so there was
//           never a reason to discard it;
//       (c) an air NORMAL took its jump direction from the least-shown jump
//           ARC beat, so it was regularly thrown out of a back or neutral
//           jump — and the approach guard only ran for jumpDir > 0, so those
//           arcs also never closed the gap. The swing happened, metres from
//           anybody. Air attacks now always jump toward, approach first, and
//           the arc beats keep the least-shown choice to themselves.
//       Plus the press is now a WINDOW (re-pressed each airborne tick until
//       the move is out) instead of one tick at rise+6.
//   F2. WALL SPLAT / DIZZY WERE FIGHTING THE WRONG PHYSICS.
//       Wall splat: the herd's slam pressed driveHeavy, and driveHeavy does
//       not qualify for a wall bounce on ANY of the nine kits. The only
//       reliable splat is the ARMED bounce (applyFighterPhysics): a
//       heavy/special-kind move carrying knockdown / knockdownOnFinal /
//       launchVelocityY, landed while the victim is within ONE BODY WIDTH of
//       the wall it is being pushed toward, sets carryVelocityX 680 and the
//       clamp then always fires spawnWallImpact. The raw >220 route needs the
//       victim inside ~40px because hitstun bleeds vx 10% a tick. So the
//       slam set is now DERIVED per fighter from qualifiesForWallBounce and
//       the herd commits at the arming distance, not at a guess.
//       Dizzy: the round-3 note ("100 stun at 9 per light against a
//       0.62/frame decay") ignored STUN_RULES.decayGraceFrames — the bar does
//       not decay AT ALL while hits keep landing inside 48 frames. The real
//       constraint is therefore HIT COUNT, and the lights-only string needed
//       11-12 connected hits where a heavy/special string needs 5-6. The
//       string is now heavy-led and derived (stun gain, no knockdown — a
//       sweep hands the decay the whole knockdown), with the lights kept as
//       the TOP-UP once the bar is within one hit of the threshold.
//   F3. A DOMINATED FIGHTER FINISHED AT 6 OF 30. The attract loop is a
//       showcase, not a competition. The choreographer now watches the
//       coverage gap (and the health gap as the early warning) and YIELDS the
//       leading side — it keeps moving and defending but stops spending the
//       stage — while the trailing side loses its natural-window roll and its
//       decision gap entirely. Duty-cycled so the leader never goes passive
//       for a whole round.
//   F4. THE TURNAROUND COUNTER WAS LYING. observe() counted every grounded
//       facing flip, but fighterPoseDescriptor only reaches the authored
//       pivot when the flipper is grounded, NOT attacking and not in
//       hitstun / blockstun / knockdown / wake-up / a grab / dizzy. Most
//       recorded flips were in exactly those states, so the beat read as
//       FIRING while motion2:5 drew for zero frames. The beat is now noted
//       only on a POSE-ELIGIBLE flip (deterministic, sim-state only — the
//       render-verified per-cell tally lives in game.js and never feeds a
//       decision), and the rejected flips are counted by reason.
// ===========================================================================

import { DeterministicRng, hashSeed } from "./foundation.mjs";
import {
  DEFENSE_RULES, FIGHTER_SCALE, MOVEMENT_RULES, STUN_RULES, THROW_RULES, WAKEUP_RULES,
  WALL_BOUNCE_RULES, qualifiesForWallBounce, stunGainForAttack, wakeupVulnerableFrames,
} from "./defense.mjs";
import { createFighterMove, getFighterKit, getKitMoveProfile, selectKitMoveKey } from "./fighter-kits.mjs";
import { getThrowable } from "./throwables.mjs";
import { CANCEL_ROUTES, COMBO_RULES, GRIT_RULES } from "./combos.mjs";
import { resolveAiSettings } from "./ai.mjs";
import { demoPersonaFor } from "./demo.mjs";

// Coverage share of the pick policy: the rest of the time the choreographer
// deliberately stands down and lets the archetype AI play a natural window.
// Higher than the first pass because a lane that is NOT showcasing now runs
// the brain anyway — the pair is never both scripted unless a beat needs it,
// so the exhibition keeps its natural texture at a smaller explicit share.
//
// 5.4 PERSONAS (sweep #2): 0.8 → 0.55. Measured at 0.8, 87.5% of the moves a
// viewer saw were checklist picks fired once each and the archetype brain
// executed 39 of 311 — the exhibition was a moves reel. The cumulative attract
// ledger (priorShown / carryover) already finishes the checklist ACROSS
// cycles, so one exhibition no longer has to; it hands nearly half its
// windows to the persona brain and reads as the two archetypes fighting.
export const DEMO_COVERAGE_BLEND = 0.55;

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
  // 5.4 FIGHT NIGHT (sweep #4): the OKIZEME / TECH family. All four are
  // OBSERVED off the view (observe()), never reported by a sim call site: a
  // hit that lands on a rising fighter, a grab that lands on the wake, a
  // throw broken by a tech flash, a throw that closed on nothing. meaty and
  // meatyThrow are staged by the knockdown plan (okizeme), throwTech and
  // throwWhiff as duet beats.
  "meaty", "meatyThrow", "throwTech", "throwWhiff",
]);

// The beats the choreographer actively stages (the others fall out of normal
// play and the hooks merely record them).
const STAGED_BEATS = Object.freeze([
  "taunt", "throw", "counterhit", "dizzy", "juggle", "wallsplat",
  "dashForward", "dashBack", "jumpForward", "jumpNeutral", "jumpBack",
  "weaponPickup", "guardedContact", "turnaround",
  "throwTech", "throwWhiff",
]);

// ---------------------------------------------------------------------------
// 5.4 FIGHT NIGHT — THE NEUTRAL BUDGET and the OKIZEME / TECH beat family
// (sweep #5's neutral half and #4).
//
// Measured at the 5.4 personas head over 6 exhibitions (15,467 fight ticks,
// seeds 237 / 1234 / 9001 × 2): both fighters free on the same tick 15.9% of
// the fight, first contact a median 42 ticks (0.7 s) after the bell on the
// three contact openers, 34 knockdowns → 18 presses over a rise, 4 hits on a
// rising fighter, 1 meaty throw, 1 clinch tech, 11 throws pressed across the
// twelve fighter-slots (six of them never threw). The pipeline is deliberately
// back-to-back (finishDirective's 0-3 tick gap) and the approach phase walks
// straight into each move's band, so there was never a moment for two
// fighters to WALK THE EDGE OF RANGE — the part of a 2D fighter that reads as
// decisions. And every knockdown was handed either to the taunt moment beat
// or to a lead directive that started the instant the attacker was stageable,
// so the brain's okizeme path (ai.mjs meaty / meaty-throw) almost never owned
// the rise.
//
// THE NEUTRAL BUDGET. A per-round footsies window — both lanes refused, both
// sides scripted — 60..120 ticks (seeded), armed:
//   - at the bell (the first fight tick the choreographer sees: round 2/3
//     immediately, round 1 the moment the opener's exchange has resolved);
//   - after every knockdown the plan below decides is a RESET (the attacker
//     walks off the body instead of standing over it), starting on the rise;
//   - by the BUDGET: when the round's both-free share falls under
//     NEUTRAL_TARGET_SHARE and the last window ended NEUTRAL_REARM_FRAMES ago.
// The script: each side walks to ITS OWN band (the kit's preferredRange
// scaled by the persona — the grappler walks in, the zoner walks out — see
// neutralBandFor), rocks in and out of it on two different periods so the
// pair never mirrors, one side throws a deliberate WHIFF just outside its
// derived reach (the bait), and the other reads the tempo tells: a fresh
// whiff tell / re-arm gap on the opponent is a WALK-FORWARD read (step in and
// punish with a heavy inside its band), an opponent walking in on the band is
// a WALK-BACK read (step out, or a poke at the edge). The window closes with
// the aggressor's commit (a dash-in where the persona dashes) and hands both
// lanes back.
//
// THE KNOCKDOWN PLAN (demoKnockdownPlan, drawn the tick the sim reports a
// knockdown). Persona-driven — the attacker's meatyChance /
// grabPressureChance and the victim's clinchTechChance /
// wakeupReversalChance come straight off the registered demo-<persona>
// tier (demoOkiProfile), so the grappler pressures the rise and grabs on it
// where the zoner mostly resets:
//   kind    OKIZEME (attacker walks in during the knockdown, holds the meaty
//           range rocking, presses on the rise) or RESET (walks off to the
//           neutral band; a footsies window starts on the rise). The two
//           existing moment beats keep their windows: an unshown taunt or a
//           weapon on the floor still take the knockdown.
//   option  meaty STRIKE (the kit's fastest normal) or meaty THROW (refused
//           after a throw knockdown — the 40-frame immunity makes it a whiff
//           by construction).
//   rise    the victim's option, scripted through the same inputs a human
//           uses (Up pulse = quick rise, Down held = delay): DEMO_RISE_MIX.
//   guess   the attacker's READ of that option. The press is timed for the
//           guessed rise (quick −14 / delay +12 frames), so a wrong guess is
//           a swing into a body that is still down (whiff, tax, the victim
//           rises into a free punish) or into a fighter who is already up
//           (block or reversal). DEMO_OKI_READ_ACCURACY is the director's
//           choice of how often the read pays off.
//   answer  the victim's: reversal (EX launcher on the last wake frames, meter
//           permitting) or block against a strike; tech (a grab of its own
//           inside the two tech windows) or eat against a throw; and a PUNISH
//           whenever the attacker is caught in its whiff tail on the rise.
// Fairness: the first knockdown of an exhibition is always okizeme and the
// first after that a reset, so both reads are on screen before the dice run.
//
// THROWS. `throw` was a PAIR beat (one throw per exhibition, whichever side
// got there first) and a single least-shown checklist item. It is now a
// per-side beat on a cooldown whose repeat share is the persona's throwChance
// (deathblow comes back for another at 0.66, Donald at 0.11), and the family
// gains two duet beats: THROW TECH (lead grabs in reach, feed breaks it) and
// THROW WHIFF (lead grabs just outside reach, feed punishes the tail).
//
// Every draw comes from the private rng in the order the sim reports events,
// so a seed replays the same show; the choreographer only exists in a demo.
// ---------------------------------------------------------------------------
export const NEUTRAL_WINDOW_FRAMES = Object.freeze({ min: 90, max: 150 });
// Besides the bait, a window allows ONE read-attack in total (the punish of
// the bait's whiff, or an edge poke): measured with a poke AND a punish per
// side, half the window's ticks had someone swinging and it read as another
// exchange rather than two fighters walking the edge of range.
const NEUTRAL_READ_ATTACKS = 1;
// The both-free share of a round the budget defends. Measured 15.9% before;
// the 4.3 spacing pass's own target for readable range was a third.
export const NEUTRAL_TARGET_SHARE = 0.3;
const NEUTRAL_REARM_FRAMES = 240;
// A round has to be this old before the budget arm can fire (the bell window
// and the openers own the first seconds).
const NEUTRAL_BUDGET_MIN_ROUND_FRAMES = 240;
// ...and fires at most this often in one round: the checklist owns the rest.
// (Measured uncapped on the sim-lite harness — one endless round — the budget
// re-armed every 300 ticks and took a quarter of the pipeline, which is
// exactly the coverage the exhibition exists to show.)
const NEUTRAL_BUDGET_MAX_PER_ROUND = 3;
// Each side's own footsies band is its kit's preferredRange × persona spacing,
// clamped to a couch-readable range.
const NEUTRAL_BAND = Object.freeze({ min: 170, max: 340, slack: 38 });
// The bait's whiff distance beyond the derived reach of the poke it throws.
const NEUTRAL_WHIFF_MARGIN = 22;
// Who rises how: quick / delay / plain. The persona tiers inherit pro's
// 0.55 / 0.16, which the sweep measured as quick-rise in 29 of 36 rises — a
// read needs all three on screen.
export const DEMO_RISE_MIX = Object.freeze({ quick: 0.4, delay: 0.3 });
// How often the attacker's guess of the rise option is right.
export const DEMO_OKI_READ_ACCURACY = 0.6;
// The share of strike okizeme the victim answers with a wake-up button (plus
// up to 0.15 for an impatient persona): the read the meaty exists to punish.
export const DEMO_WAKE_PRESS_SHARE = 0.25;
// Where the attacker holds while the victim is down: the meaty strike's range
// (the brain's own 118) and, for the meaty throw, inside the grab reach.
const OKI_STRIKE_HOLD = 118;
const OKI_THROW_HOLD = THROW_RULES.grabRange - 16;
// How long the victim's scripted answer owns the rise after the wake tick.
const OKI_ANSWER_FRAMES = 22;
// The oki attacker keeps the stage this long past the wake at most.
const OKI_TIMEOUT_FRAMES = DEFENSE_RULES.knockdownFrames + WAKEUP_RULES.delayFrames
  + DEFENSE_RULES.wakeupFrames + 60;
// The knockdown plan is staged at most this many times per round; later
// knockdowns go to the ordinary pipeline. A real attract round has 1-2
// knockdowns that are not the KO (measured 44 knockdowns over 16 rounds, 16
// of them round-ending), so the cap never binds on the cabinet; it bounds
// the family's cost on the sim-lite harness, which knocks down every ~150
// ticks in one endless round.
const OKI_PLANS_MAX_PER_ROUND = 4;
// The tech duet's grab spacing and the whiff duet's (just outside the reach
// the sim checks at contact).
const THROW_TECH_RANGE = THROW_RULES.grabRange - 14;
// The throw family is staged at most once per side per this many ticks, and
// at most `throwFamilyCap` times per side per exhibition (2 + the persona's
// throwChance × 8: the grappler 4, the zoner 2). Measured without the cap, the
// opportunity fired on every clinch and a counter-puncher teched ten throws
// in one card.
const THROW_FAMILY_REARM_FRAMES = 300;
function throwFamilyCap(profile) {
  return 2 + Math.round(profile.throwChance * 8);
}
const THROW_WHIFF_RANGE = Object.freeze({ min: THROW_RULES.grabRange + 8, max: THROW_RULES.attemptRange - 4 });

/**
 * The okizeme / throw knobs a fighter plays the demo with: read off the
 * registered demo-<persona> tier its kit names (engine/demo.mjs), so the
 * choreographer and the brain agree by construction. Pure lookup.
 */
export function demoOkiProfile(fighterId) {
  const settings = resolveAiSettings(demoPersonaFor(fighterId));
  const kitAi = getFighterKit(fighterId)?.ai || {};
  return Object.freeze({
    persona: settings.persona || "demo",
    meatyChance: settings.meatyChance || 0,
    grabPressureChance: settings.grabPressureChance || 0,
    throwChance: settings.throwChance || 0,
    clinchTechChance: settings.clinchTechChance ?? settings.throwTechChance ?? 0,
    throwWhiffPunishChance: settings.throwWhiffPunishChance || 0,
    wakeupReversalChance: settings.wakeupReversalChance || 0,
    dashInChance: settings.dashInChance || 0,
    patience: settings.patience || 0,
    spacing: settings.spacing || 1,
    preferredRange: kitAi.preferredRange || 180,
  });
}

/** A side's own footsies band for the neutral window: [near, far]. */
export function neutralBandFor(profile) {
  const centre = Math.max(NEUTRAL_BAND.min, Math.min(NEUTRAL_BAND.max,
    Math.round(profile.preferredRange * profile.spacing)));
  return Object.freeze({ near: centre - NEUTRAL_BAND.slack, far: centre + NEUTRAL_BAND.slack, centre });
}

/**
 * The knockdown plan. Pure on the two profiles, the knockdown's cause, the
 * victim's meter, the two moment-beat windows, the exhibition's ledger and
 * five rolls in [0, 1), so a test can enumerate it and a seed replays it.
 */
export function demoKnockdownPlan({
  attacker, victim, throwKnockdown = false, victimMeter = 0,
  taunt = false, weapon = false, shown = { oki: 0, reset: 0 }, rolls = [],
} = {}) {
  const roll = (index) => (Number.isFinite(rolls[index]) ? rolls[index] : 0.5);
  if (weapon) return Object.freeze({ kind: "weapon" });
  if (taunt) return Object.freeze({ kind: "taunt" });
  const okiShown = Number(shown?.oki) || 0;
  const resetShown = Number(shown?.reset) || 0;
  const oki = okiShown === 0 ? true
    : resetShown === 0 ? false
      : roll(0) < attacker.meatyChance;
  if (!oki) return Object.freeze({ kind: "reset" });
  const option = !throwKnockdown && roll(1) < attacker.grabPressureChance ? "meatyThrow" : "meaty";
  const riseRoll = roll(2);
  const rise = riseRoll < DEMO_RISE_MIX.quick ? "quick"
    : riseRoll < DEMO_RISE_MIX.quick + DEMO_RISE_MIX.delay ? "delay" : "plain";
  const guessRoll = roll(3);
  let guess = rise;
  if (guessRoll >= DEMO_OKI_READ_ACCURACY) {
    const others = ["quick", "delay", "plain"].filter((name) => name !== rise);
    const t = (guessRoll - DEMO_OKI_READ_ACCURACY) / (1 - DEMO_OKI_READ_ACCURACY);
    guess = others[Math.min(1, Math.floor(t * 2))];
  }
  // Against a strike: the reversal (meter permitting), a wake-up BUTTON (the
  // jab a meaty is built to counter-hit — the impatient personas press more),
  // or the block. Against a throw: the tech or the hold.
  let answer;
  if (option === "meatyThrow") {
    answer = roll(4) < victim.clinchTechChance ? "tech" : "eat";
  } else {
    const reversalCut = victimMeter >= GRIT_RULES.enhancedSpecialCost ? victim.wakeupReversalChance * 0.6 : 0;
    const pressCut = reversalCut + DEMO_WAKE_PRESS_SHARE + (1 - victim.patience) * 0.15;
    answer = roll(4) < reversalCut ? "reversal" : roll(4) < pressCut ? "press" : "block";
  }
  return Object.freeze({ kind: "oki", option, rise, guess, answer });
}

// The knockdown-relative frame a rise option gets the victim up on (the sim:
// 48 frames down −14 quick / +12 delay, then 16 rising).
export function riseFrameFor(option) {
  const delta = option === "quick" ? -WAKEUP_RULES.quickRiseFrames
    : option === "delay" ? WAKEUP_RULES.delayFrames : 0;
  return DEFENSE_RULES.knockdownFrames + delta + DEFENSE_RULES.wakeupFrames;
}

/** The knockdown-relative press frame for a meaty timed for `guess`. */
export function meatyPressFrameFor(guess, { option = "meaty", startup = 5 } = {}) {
  const up = riseFrameFor(guess);
  if (option === "meatyThrow") {
    // A throw cannot touch a downed or rising fighter, and a strike knockdown
    // hands the riser strikeKnockdownThrowImmuneFrames on top — so the grab
    // is timed to be active on the first throwable tick.
    return up + DEFENSE_RULES.strikeKnockdownThrowImmuneFrames + 1 - startup;
  }
  // Active on the first vulnerable rising frame.
  return up - wakeupVulnerableFrames(guess) - startup + 1;
}

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
// v2.9 round 4: the turnaround cooldown halves. The beat is now only banked
// when the flip could genuinely draw the pivot (turnaroundBlocker), so the
// ledger no longer credits itself for flips taken in hitstun or mid-swing —
// which means the OLD cooldown was being started by attempts that put nothing
// on screen. A cross-up that actually draws its three latch ticks has earned
// the right to come back sooner.
const BEAT_REPEAT_FRAMES = Object.freeze({
  turnaround: 165, dashForward: 190, dashBack: 190,
  // 5.4 FIGHT NIGHT (sweep #4): the throw family repeats per side — measured,
  // a throw happened once per fighter per match even for the grappler, because
  // `throw` was a one-shot PAIR beat and a single checklist item. The repeat
  // SHARE is the persona's own throwChance (see throwRepeatShare), so the
  // grappler comes back for another and the zoner mostly does not.
  throw: 150, throwTech: 260, throwWhiff: 260,
});
// ...and a repeat is only OFFERED this often. The checklist owns the pipeline;
// a repeat is a garnish, and letting every cooled-down repeat into the lottery
// pushed beat picks from 21% of the pipeline to 42% and cost the exhibition
// four moves per fighter.
// Per-beat: a dash is two ticks of authored brake cell and ~20 ticks of lane,
// so it is cheap enough to come back often. A cross-up costs a whole jump arc
// plus the walk-in, so it does not.
const BEAT_REPEAT_SHARE = Object.freeze({
  dashForward: 0.6, dashBack: 0.6, turnaround: 0.5,
});
const BEAT_REPEAT_DEFAULT = 0.25;
// The same rule for individual checklist items (an EX the meter keeps eating,
// a normal the opponent keeps interrupting).
const ITEM_FAIL_BUDGET = 3;
const ITEM_BACKOFF_FRAMES = 170;
// 5.4 GRIT POLICY: how long a full bar waits between attempts to steer the
// picker onto a confirm opener (see gritSteerReady).
const GRIT_STEER_FRAMES = 240;

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

// --- v2.9 round 4: spectacle move tables, derived from the real move data ---
// The two spectacles were being chased with hand-written id lists that did not
// match what the sim actually rewards. Both tables below are built once per
// exhibition out of the kit's own attack instances, so they are correct for
// every fighter (and stay correct if a kit is retuned).

/** The concrete attack instance a checklist id resolves to, or null. */
function moveInstanceFor(fighterId, id) {
  const row = ROW_FOR_ID.get(id);
  if (!row) return null;
  try {
    return createFighterMove(fighterId, row.action, row.context) || null;
  } catch {
    return null;
  }
}

// A move that will knock the victim off their feet. These are the ONLY moves
// that can arm a wall bounce — and the last thing a stun string wants, because
// a knockdown hands the decay the whole 48+16 frame get-up.
function knocksDown(move) {
  return Boolean(move
    && (move.knockdown || move.knockdownOnFinal || move.launchVelocityY || move.juggleLift));
}

/**
 * The grounded checklist ids whose move ARMS a corner wall bounce — the only
 * deterministic route to a wall splat (see WALLSPLAT_ARM_GAP). Measured across
 * the nine shipped kits this is 7-11 ids each, and `driveHeavy` — the id the
 * previous herd hammered — is in NONE of them.
 */
export function demoWallSlamIds(fighterId) {
  return demoCoverageChecklist(fighterId).filter((id) => {
    if (id.startsWith("air")) return false;
    // Same rule as the stun string: a forward-held command normal needs
    // SPACE_SETTLE_FRAMES of one steady direction first or the motion
    // recogniser converts the press, and a corner window does not last that
    // long. (The command specials the recogniser would produce are in the set
    // on their own merits anyway, pressed as resolved actions.)
    if (ROW_FOR_ID.get(id)?.context?.forwardHeld) return false;
    return qualifiesForWallBounce(moveInstanceFor(fighterId, id));
  });
}

/**
 * The stun string, per fighter.
 *   topUp — the fastest stun-carrying normals: the string's OPENER (it exists
 *           to confirm) and the whole string once the bar is one hit short.
 *   build — the biggest stun-per-hit the kit can throw with no held direction.
 *   link  — build entries the sim will accept as a CANCEL off a confirmed hit
 *           (combos.mjs CANCEL_ROUTES keys on the action group, so the heavies
 *           and the specials are the legal targets). This is where a real
 *           string gets its points: a link lands inside the previous hit's
 *           hitstun, ~10-14 ticks later, so the 48-frame decay grace never
 *           expires — where a re-approached poke leaves a 55-70 tick gap and
 *           hands most of the gain straight back.
 * A knockdown is excluded from all three — it is worth the whole get-up in
 * decay — and so is anything that needs a held direction, which the motion
 * recogniser would convert mid-string.
 */
export function demoStunStringIds(fighterId) {
  const build = [];
  const topUp = [];
  const link = [];
  for (const id of demoCoverageChecklist(fighterId)) {
    if (id.startsWith("air")) continue;
    // Forward-held command normals need SPACE_SETTLE_FRAMES of one steady
    // direction or the motion recogniser eats them; a string has no time.
    if (ROW_FOR_ID.get(id)?.context?.forwardHeld) continue;
    const move = moveInstanceFor(fighterId, id);
    if (!move || knocksDown(move)) continue;
    if (stunGainForAttack(move) < 12) {
      if (STUN_TOPUP_IDS.has(id)) topUp.push(id);
      continue;
    }
    build.push(id);
    if (CHAIN_ITEMS.has(id)) link.push(id);
    if (STUN_TOPUP_IDS.has(id)) topUp.push(id);
  }
  // Every kit keeps a usable set for each role: if its lights all sweep, or it
  // owns no cancel-legal non-knockdown target, fall back rather than handing
  // the string an empty allow-list.
  return {
    build: build.length ? build : topUp,
    topUp: topUp.length ? topUp : build,
    link: link.length ? link : build.length ? build : topUp,
  };
}

/**
 * 5.4 GRIT POLICY (sweep #6) — the grounded checklist ids whose move can be
 * CANCELLED INTO THE SUPER off a confirmed hit (combos.mjs CANCEL_ROUTES,
 * read off the kit's own attack instances). These are the confirm openers: a
 * full bar is spent by showcasing one of them and chaining `super` into the
 * cancel window the sim opens on contact — the same hit-confirm route a human
 * plays, never a raw super pressed at nothing. Air normals and the forward
 * command normals are excluded for the same reasons the stun string excludes
 * them (no ground cancel; the settle hold).
 */
export function demoSuperConfirmIds(fighterId) {
  const ids = [];
  for (const id of demoCoverageChecklist(fighterId)) {
    if (id.startsWith("air") || id === "super" || EX_ACTIONS.has(id)) continue;
    if (id === "throw" || id === "throwObject" || id === "enhancedThrowObject") continue;
    if (ROW_FOR_ID.get(id)?.context?.forwardHeld) continue;
    const move = moveInstanceFor(fighterId, id);
    if (!move) continue;
    const routes = move.cancelRoutes || CANCEL_ROUTES[move.cancelProfileId || move.profileId];
    if (routes?.includes("super")) ids.push(id);
  }
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

/**
 * Why a grounded facing flip could NOT have put the authored turnaround key on
 * screen, or "" when it could. Mirrors the branches that outrank the pivot
 * latch in fighterPoseDescriptor (hitstun / blockstun / knockdown / wake-up /
 * throw-tech / grab / dizzy, plus its own `grounded && !attacking` test), so
 * the demo's beat ledger and the renderer agree on what "fired" means.
 * Exported for the coverage tests.
 */
export function turnaroundBlocker(fighter) {
  if (!fighter) return "missing";
  if (!fighter.grounded) return "airborne";
  if (fighter.down || fighter.pendingKnockdown) return "knockdown";
  if (fighter.wakeupFrames > 0) return "wakeup";
  if (fighter.hitstunFrames > 0) return "hitstun";
  if (fighter.blockstunFrames > 0) return "blockstun";
  if (fighter.dizzyFrames > 0) return "dizzy";
  if (fighter.grabbed || fighter.grabbing) return "grab";
  if (fighter.attacking) return "attacking";
  return "";
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
  // v2.9 round 4: a 100-point stun bar is 5-6 CONNECTED heavies, and a heavy's
  // approach-press-recover cycle against a victim its own push keeps knocking
  // out of range is ~55 ticks. 280 could not fit the string it was asked to
  // build; measured, the bar plateaued at 20-46 and the beat reached 0-3 of 8
  // exhibitions. Same for the herd: carrying a victim to a 105px arming window
  // from mid-stage is several exchanges of real work.
  pressure: 460,
  counter: 110,
  juggle: 140,
  wallsplat: 420,
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
// ...and round 4 measurement, which is what finally made the beat land. The
// >220 route is not the route: there is a SECOND, deterministic one. A
// knockdown-class heavy/special (qualifiesForWallBounce) that connects while
// the victim is within WALL_BOUNCE_RULES.proximityBodyWidths of the wall it is
// being pushed toward sets victim.vx to carryVelocityX (680) and the clamp
// then ALWAYS fires spawnWallImpact — no velocity race, no decay to beat. The
// arming distance is therefore the only geometry that matters, and it is one
// body width (92 * FIGHTER_SCALE = 105px), not the 40px the raw route needs.
const WALLSPLAT_ARM_GAP = Math.round(92 * FIGHTER_SCALE * WALL_BOUNCE_RULES.proximityBodyWidths);
// The directive commits from a little outside the arming window so the last
// approach step lands inside it, and the herd carries the victim the rest.
const WALLSPLAT_STAGE_GAP = WALLSPLAT_ARM_GAP + 95;
// Same logic for the stun string, and the same correction: the round-3 note
// ("100 points at 9 per light against a 0.62/frame decay") left out
// STUN_RULES.decayGraceFrames. The bar does not decay at ALL for 48 frames
// after a hit, so a string that keeps connecting never loses a point and the
// binding constraint is the HIT COUNT: 5-6 heavies/specials (17-22 each), or
// 11-12 lights (9-11 each). The threshold the directive opens at is therefore
// deliberately low — the string itself is now capable of covering the rest.
const DIZZY_STAGE_STUN = 30;
// One clean heavy from the threshold: below this the string builds with
// heavies, at or above it the string TOPS UP with lights, whose shorter cycle
// is the safest way to land one more hit inside the 48-frame grace.
const DIZZY_TOPUP_STUN = STUN_RULES.threshold - 24;
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
// The closer opens exactly at the arming window: inside it any wall-bounce
// move the fighter owns converts, so the showcase that was going to happen
// anyway throws one of those instead of the next unshown id.
const WALLSPLAT_CLOSE_GAP = WALLSPLAT_ARM_GAP;
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
// Round 4: the lights-only string is gone — see DIZZY_TOPUP_STUN. The build
// and top-up sets are DERIVED per fighter from the real move data (see
// stunStringIds), because "which of my normals carries stun without sweeping
// the victim down" is a per-kit fact, not a shared id list. This stays as the
// top-up floor: the four fastest no-direction normals every kit owns.
const STUN_TOPUP_IDS = new Set([
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
// A cross-up feed has to survive the whole arc — a forward jump is ~45 frames
// of hang time before the jumper is even overhead, and the ordinary 44-frame
// lease expired before the defender ever had anything to turn around FOR.
const CROSSUP_FEED_FRAMES = 96;
// The stun string and the wall herd are the only two beats that take several
// exchanges to BUILD rather than one moment to take, so their brace outlives
// the ordinary lease. Still released with its lead.
const SPECTACLE_FEED_FRAMES = 150;

// --- v2.9 round 4: the air row ---------------------------------------------
// The five air normals are the only rows in the checklist that no beat lane
// and no closer can ever select (they push nothing toward a wall and the
// victim is airborne for the stun), so every tie-break in the picker quietly
// competed with them. They now get a reserved share of the picks taken BEFORE
// those filters, for as long as the side still owes the cabinet an air move.
const AIR_ROW_IDS = new Set(["airLight", "airLightKick", "airHeavy", "airHeavyKick", "airSpecial"]);
const AIR_ROW_SHARE = 0.42;
// The air normal's press is re-armed every airborne tick until the move is
// out. A single press at rise+6 vanished whenever that exact frame could not
// consume it — the six-frame buffer is a window, not a guarantee.
const AIR_PRESS_FRAMES = 34;
// An air ATTACK always jumps toward and closes first: an air normal thrown
// out of a back jump is a swing at nothing. Sized off the forward jump's real
// travel (forwardJumpVelocityX over the arc), so the attack lands on the
// descent rather than the take-off.
const AIR_ATTACK_APPROACH = 250;

// --- v2.9 round 4: the losing side ------------------------------------------
// The attract loop is a showcase, not a competition. Once one side is this far
// ahead on its own checklist the choreographer stops treating the pair as
// symmetric: the leader yields the stage and the trailer stops rolling for
// natural windows.
const COVERAGE_GAP_TOLERANCE = 4;
// The early warning, before the coverage gap has already opened: a fighter
// this far ahead on health is dominating the exchanges, which is how a
// checklist column gets stranded in the first place.
const HEALTH_GAP_TOLERANCE = 26;
// Duty cycle. A leader that yielded indefinitely would just stand around if
// the trailing side genuinely cannot convert, so the yield runs in bursts.
const YIELD_FRAMES = 54;
const YIELD_RELEASE_FRAMES = 40;
// 5.4 SESSION LAYER: the showboat's one-taunt-per-knockdown cooldown.
const SHOWBOAT_TAUNT_FRAMES = 150;

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
  blend = DEMO_COVERAGE_BLEND, priorShown = null, story = null,
} = {}) {
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error("Demo choreography needs a fighter pair.");
  // 5.4 SESSION LAYER (sweep #3): the card's STORY (engine/demo demoStoryFor)
  // replaces two of this file's constants per seat. `yield` is the per-seat
  // tolerance before the leader stands down ({ coverage, health } — the
  // round-4 constants below by default) or null for a seat that NEVER yields
  // (both seats of a GRUDGE, the rookie of ROOKIE VS VETERAN); `showboatSide`
  // is the seat that disrespects every knockdown. No story = the 2.9 rules.
  const yieldTolerance = [0, 1].map((side) => {
    if (!story || !Array.isArray(story.yield)) return { coverage: COVERAGE_GAP_TOLERANCE, health: HEALTH_GAP_TOLERANCE };
    const tolerance = story.yield[side];
    return tolerance ? { coverage: Number(tolerance.coverage) || COVERAGE_GAP_TOLERANCE, health: Number(tolerance.health) || HEALTH_GAP_TOLERANCE } : null;
  });
  const showboatSide = story && (story.showboatSide === 0 || story.showboatSide === 1) ? story.showboatSide : -1;
  // The showboat's taunt cooldown: one disrespect per knockdown, not one per
  // tick of the knockdown.
  let showboatBlockedUntil = 0;
  const rng = new DeterministicRng(hashSeed("FINAL-BLOW-DEMO-CHOREO", seed, pair[0], pair[1], stageId));
  const checklists = pair.map((fighterId) => demoCoverageChecklist(fighterId));
  const bands = pair.map((fighterId, side) => Object.fromEntries(
    checklists[side].map((id) => [id, demoStagingBand(fighterId, id)]),
  ));
  const prior = pair.map((fighterId, side) => Object.fromEntries(
    checklists[side].map((id) => [id, Number(priorShown?.[fighterId]?.[id]) || 0]),
  ));
  // v2.9 round 4 — the two spectacle tables, derived once per exhibition from
  // this pair's real move data rather than a shared id list (see
  // demoWallSlamIds / demoStunStringIds).
  const slamIds = pair.map((fighterId) => new Set(demoWallSlamIds(fighterId)));
  const stunIds = pair.map((fighterId) => {
    const { build, topUp, link } = demoStunStringIds(fighterId);
    return { build: new Set(build), topUp: new Set(topUp), link: new Set(link) };
  });
  const airIds = pair.map((fighterId, side) => checklists[side].filter((id) => AIR_ROW_IDS.has(id)));
  // 5.4 GRIT POLICY: the confirm openers per side (see demoSuperConfirmIds).
  const confirmIds = pair.map((fighterId) => new Set(demoSuperConfirmIds(fighterId)));
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
    leadTicks: 0, idleTicks: 0, gapTicks: 0, movesNoted: 0, preempted: 0,
    // v2.9 round 4 diagnostics.
    //   airRowPicks   — picks taken by the reserved air-row share
    //   slamPresses   — wall-bounce-qualifying slams thrown inside the arm gap
    //   yieldTicks    — ticks the LEADING side stood down for the trailing one
    //   trailerBoosts — natural-window rolls the trailing side skipped
    //   turnaroundBlind — grounded facing flips REJECTED as beats because the
    //     authored pivot could not have reached the screen in that state. This
    //     is the honesty counter: it used to be silently added to `turnaround`.
    airRowPicks: 0, slamPresses: 0, yieldTicks: 0, trailerBoosts: 0,
    topUpCloserPicks: 0,
    turnaroundSeen: 0, turnaroundBlind: {},
    // 5.4 GRIT POLICY diagnostics.
    //   gritOpeners  — picks steered onto a confirm opener because the bar
    //                  was full
    //   gritLinks    — `super` chained into a confirmed opener on a full bar
    //   gritPreempts — plain unstarted showcases restarted for the opener
    gritOpeners: 0, gritLinks: 0, gritPreempts: 0,
    // 5.4 SESSION LAYER diagnostics: the showboat's staged taunts, and the
    // ticks a seat with no yield tolerance would have yielded on the 2.9 rule.
    showboatTaunts: 0, yieldRefused: 0,
    // 5.4 FIGHT NIGHT (sweep #5 / #4) — the neutral budget and the okizeme
    // family. Every counter here is a DECISION the director took or an
    // outcome it observed, so a trace can say which reads reached the screen.
    //   neutralWindows / neutralTicks — footsies windows armed, ticks scripted
    //   neutralBy       — why each window was armed (bell / reset / budget)
    //   neutralBaits    — deliberate whiffs thrown at the edge of range
    //   neutralReads    — walk-forward (punish) and walk-back reads taken
    //   neutralPreempts — approach-phase leads set aside for a window
    //   okiPlans        — knockdown plans by kind (oki / reset / taunt / weapon)
    //   okiOptions      — meaty strike vs meaty throw
    //   okiRises        — the victim's scripted rise option
    //   okiGuesses      — the attacker's read: right / wrong
    //   okiAnswers      — the victim's scripted answer on the rise
    //   okiPresses      — meaty presses actually made on the rise
    //   okiPunishes     — rises that punished a whiffed meaty
    neutralWindows: 0, neutralTicks: 0, neutralBy: {}, neutralBaits: 0,
    neutralReads: { forward: 0, back: 0 }, neutralPreempts: 0,
    okiPlans: {}, okiOptions: {}, okiRises: {}, okiGuesses: { right: 0, wrong: 0 },
    okiAnswers: {}, okiPresses: 0, okiPunishes: 0,
    //   throwOpportunities — throw-family beats staged on an in-reach opponent
    throwOpportunities: 0,
  };
  const previous = [null, null];
  // 5.4 FIGHT NIGHT: the two persona profiles this pair plays the okizeme
  // family with, and each side's own footsies band (see the header).
  const profiles = pair.map((fighterId) => demoOkiProfile(fighterId));
  const neutralBands = profiles.map((profile) => neutralBandFor(profile));
  // The neutral budget's round bookkeeping and the live window.
  const neutral = {
    roundStart: -1, roundTicks: 0, freeTicks: 0, budgetWindows: 0, okiPlans: 0,
    pending: null, until: 0, plan: null, lastEnd: -Infinity, since: 0,
  };
  // The live knockdown plan (one per knockdown; cleared when the rise is
  // answered, on timeout, and whenever the round leaves the fight phase).
  const oki = { active: false, plan: null, attacker: 0, victim: 1, since: 0, pressed: false, punished: false, answered: 0, tick: 0 };
  const okiShown = { oki: 0, reset: 0 };
  // The tick each side last finished rising (the meaty-throw observation).
  const lastWake = [-Infinity, -Infinity];
  // Reporting only: the last few hundred inputs the knockdown plan issued
  // (qa.demoCoverage().stats.okiTrace), so a probe can see which script owned
  // a fighter on a given tick. Never read back.
  const okiTrace = [];
  function traceOki(side, view, source, input) {
    if (okiTrace.length >= 400) okiTrace.shift();
    okiTrace.push({ tick: view.tick, side, source, keys: input ? Object.keys(input).filter((key) => input[key] === true).join("+") : "null" });
  }

  // Two independent lanes: each side either LEADS a directive of its own,
  // FEEDS the partner's directive, or is handed back to the archetype brain.
  const lanes = [null, null];
  const nextDecision = [0, 0];
  const inertTicks = [0, 0];
  const sidePicks = [0, 0];
  const itemPicks = {};
  // v2.9 round 4 — the yield duty cycle (see COVERAGE_GAP_TOLERANCE). Per side:
  // the tick this side's current yield burst ends, and the tick it may yield
  // again. Both are plain tick counters off the sim clock, so they replay.
  const yieldUntil = [0, 0];
  const yieldReleaseUntil = [0, 0];
  // 5.4 GRIT POLICY: per side, the tick the picker may next be steered onto
  // a confirm opener (see gritSteerReady).
  const gritSteerBlockedUntil = [0, 0];
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
    // 5.4 FIGHT NIGHT (sweep #4): every knockdown is a DECISION — the plan is
    // drawn the tick the sim reports it (the victim's side), before either
    // lane can start a new showcase over the body.
    if (beat === "knockdown") planKnockdown(side);
  }

  // --- 5.4 FIGHT NIGHT: the knockdown plan ---------------------------------
  // The last view observe() saw: noteBeat has none of its own, and the plan
  // needs the knockdown's cause, the victim's meter and the two moment-beat
  // windows. One tick stale at most, which is exactly what a human sees.
  let lastView = null;

  function bothFree(view) {
    return Boolean(view?.fighters?.[0] && view.fighters[1])
      && actionable(view.fighters[0]) && actionable(view.fighters[1]);
  }

  // Set a lane aside for a window the director is opening. A lead that has
  // not started its move is a REORDER (its item stays least-shown and is
  // picked again the moment the pipeline resumes — exactly the stun/Grit
  // pre-emption rule); a lead whose move is out is booked completed; a feed
  // is simply released. Returns false when a lead is mid-press and the window
  // has to wait a few ticks.
  function releaseLanes(view, counter, force = false) {
    const idleLead = (lane) => ["approach", "space"].includes(lane.phase)
      || (lane.phase === "act" && lane.frames < 3);
    // Dry run first: a window that has to wait must leave every lane exactly
    // as it found it (measured without this, a budget window that kept
    // retrying behind a mid-press lead finished every executed showcase in
    // its confirm window and the exhibition chained nothing at all).
    if (!force) {
      for (const lane of lanes) {
        if (lane?.role === "lead" && !lane.executed && !idleLead(lane)) return false;
      }
    }
    for (let side = 0; side < 2; side += 1) {
      const lane = lanes[side];
      if (!lane) continue;
      if (lane.role === "feed") { lanes[side] = null; continue; }
      if (lane.executed) { finishDirective(lane, view, true, ""); continue; }
      lanes[side] = null;
      stats[counter] += 1;
    }
    return true;
  }

  function planKnockdown(victim) {
    if (victim !== 0 && victim !== 1 || !lastView || lastView.phase !== "fight") return;
    const attacker = 1 - victim;
    const view = lastView;
    const self = view.fighters[attacker];
    const fallen = view.fighters[victim];
    // The rolls are ALWAYS drawn, whatever the plan — the rng stream must not
    // depend on which branch a knockdown takes.
    const rolls = [rng.nextFloat(), rng.nextFloat(), rng.nextFloat(), rng.nextFloat(), rng.nextFloat()];
    const plan = demoKnockdownPlan({
      attacker: profiles[attacker],
      victim: profiles[victim],
      throwKnockdown: Boolean(fallen.throwKnockdown),
      victimMeter: fallen.meter,
      taunt: blend > 0 && beatOpen("taunt", view),
      // The weapon on the floor only takes the knockdown while the pickup
      // moment beat could actually stage it (its budget and backoff) — a cup
      // nobody is going to fetch must not shut the okizeme off for a round.
      weapon: hasStageWeapon && view.weapon?.phase === "ground" && !self.carriedWeapon
        && beatOpen("weaponPickup", view),
      shown: okiShown,
      rolls,
    });
    stats.okiPlans[plan.kind] = (stats.okiPlans[plan.kind] || 0) + 1;
    // A CLOCK card (blend 0) belongs to the patient brains: the plan is
    // recorded, never staged, so the measured clock rounds stay brain-only.
    if (blend <= 0 || plan.kind === "taunt" || plan.kind === "weapon") return;
    if (neutral.okiPlans >= OKI_PLANS_MAX_PER_ROUND) {
      stats.okiPlans.capped = (stats.okiPlans.capped || 0) + 1;
      return;
    }
    neutral.okiPlans += 1;
    if (neutral.until > view.tick) endNeutral(view);
    // The plan owns both fighters: the victim is down and the attacker's
    // press is the move that put it there, so nothing is mid-showcase that
    // the pipeline could still finish.
    releaseLanes(view, "neutralPreempts", true);
    if (plan.kind === "oki") {
      okiShown.oki += 1;
      stats.okiOptions[plan.option] = (stats.okiOptions[plan.option] || 0) + 1;
      stats.okiRises[plan.rise] = (stats.okiRises[plan.rise] || 0) + 1;
      stats.okiGuesses[plan.guess === plan.rise ? "right" : "wrong"] += 1;
      stats.okiAnswers[plan.answer] = (stats.okiAnswers[plan.answer] || 0) + 1;
    } else {
      okiShown.reset += 1;
    }
    Object.assign(oki, {
      active: true, plan, attacker, victim, tick: view.tick, pressed: false,
      punished: false, attackerDone: false, victimDone: false, wakeTick: -1,
      pressAt: -1, elapsed: 0, victimClock: -1, risenSeen: false, victimPressed: false,
    });
  }

  function endOki() {
    oki.active = false;
    oki.plan = null;
  }

  // The fast normals a meaty strike is thrown from: the kit's lights, standing
  // or crouching (a meaty low is a legitimate read).
  // MOTION HYGIENE (the same rule the command normals follow, see
  // SPACE_SETTLE_FRAMES): every one of these presses follows a rock — a
  // back / forward alternation — and the recogniser bridges an 18-frame gap,
  // so a KICK pressed there resolves as ←→+KICK (the drive heavy: measured,
  // a "crouch light" meaty came out as a drive heavy every time). The punch
  // normals are safe after a rock (their motions all need a fresh ↓ token),
  // the drive heavy is pressed as itself, and the meaty crouches for the
  // settle so both crouch lights stay legal.
  const MEATY_IDS = new Set(["crouchLight", "crouchLightKick"]);
  const PUNISH_IDS = new Set(["standHeavy", "crouchHeavy", "driveHeavy"]);
  // The window's pokes are coverage too: the bait and the edge poke throw the
  // least-shown of the plain punch normals (no forward command normal — those
  // need a settled direction and convert to a throw inside grab range).
  const POKE_IDS = new Set(["standLight", "crouchLight"]);
  // (Lights only: a whiffed heavy is 40+ ticks of tail, and the window is
  // for walking.)
  const BAIT_IDS = new Set(["standLight", "crouchLight"]);

  function throwPress(self, opponent) {
    return Object.assign(towardInput(self, opponent), { throw: true });
  }

  function okiInput(side, view) {
    if (!oki.active) return null;
    const plan = oki.plan;
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    const age = view.tick - oki.tick;
    if (age > OKI_TIMEOUT_FRAMES || (oki.attackerDone && oki.victimDone)) {
      endOki();
      return null;
    }
    const risen = !opponent.down && opponent.wakeupFrames <= 0;
    if (side === oki.attacker) {
      if (oki.attackerDone) return null;
      if (plan.kind === "reset") {
        // Walk off the body to the neutral band; the footsies window opens on
        // the rise (observe() sees both free with `pending` set).
        if (risen) {
          oki.attackerDone = true;
          oki.victimDone = true;
          neutral.pending = "reset";
          return null;
        }
        if (!actionable(self)) return emptyInput();
        const band = neutralBands[side];
        const cornered = Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 90;
        if (distance < band.near && !cornered) return awayInput(self, opponent);
        return rockInput(side, view, band.near, band.far, { guard: true });
      }
      // OKIZEME. Walk in during the knockdown, hold the meaty range rocking,
      // press for the GUESSED rise.
      const hold = plan.option === "meatyThrow" ? OKI_THROW_HOLD : OKI_STRIKE_HOLD;
      // THE VICTIM'S CLOCK, as a human counts it: ticks since the fall on
      // which the visible knockdown / wake countdown actually advanced. The
      // sim freezes both fighters for the hit's hitstop (measured: a sweep's
      // knockdown reached its rise 61 ticks after the fall, not 48), so a
      // schedule on the sim tick would always be late. The guess is already
      // committed, so the option's visible jump on the clock is deliberately
      // counted as one advance like any other tick.
      const victimClock = (opponent.knockdownFrames || 0) + (opponent.wakeupFrames || 0);
      if (oki.pressAt < 0) {
        const startup = plan.option === "meatyThrow"
          ? (moveProfileFor(pair[side], "throw")?.startupFrames ?? 5)
          : (moveProfileFor(pair[side], "standLight")?.startupFrames ?? 5);
        oki.pressAt = meatyPressFrameFor(plan.guess, { option: plan.option, startup });
        oki.elapsed = opponent.down ? Math.max(0, DEFENSE_RULES.knockdownFrames - (opponent.knockdownFrames || 0)) : 0;
        oki.victimClock = victimClock;
      } else if (victimClock !== oki.victimClock || (risen && !oki.risenSeen)) {
        oki.elapsed += 1;
        oki.victimClock = victimClock;
        if (risen) oki.risenSeen = true;
      } else if (risen) {
        oki.elapsed += 1;
      }
      if (!oki.pressed) {
        if (oki.elapsed < oki.pressAt) {
          if (!actionable(self)) return emptyInput();
          if (distance > hold + 12) return towardInput(self, opponent);
          // The strike crouches over the body for the settle before its
          // press (motion hygiene, above): the low meaty is the read.
          if (plan.option === "meaty" && oki.elapsed >= oki.pressAt - SPACE_SETTLE_FRAMES) {
            return { ...emptyInput(), down: true };
          }
          return rockInput(side, view, hold - 14, hold + 12);
        }
        // A guess that was wrong the OTHER way (the victim is already up and
        // swinging) or a fighter still stuck in its own recovery past the
        // window: the meaty is off — hand back rather than press into a punish.
        if (oki.elapsed > oki.pressAt + 12 || (risen && opponent.attacking)) {
          oki.attackerDone = true;
          return null;
        }
        if (distance > hold + 40) return towardInput(self, opponent);
        oki.pressed = true;
        stats.okiPresses += 1;
        if (plan.option === "meatyThrow") return throwPress(self, opponent);
        return beatPress(side, view, MEATY_IDS) || { ...emptyInput(), light: true };
      }
      // The press is out: ride the swing, then hand the lane back.
      if (self.attacking || !actionable(self)) return emptyInput();
      if (oki.elapsed >= oki.pressAt + 6) oki.attackerDone = true;
      return oki.attackerDone ? null : emptyInput();
    }
    // THE VICTIM.
    if (oki.victimDone) return null;
    if (plan.kind === "reset") {
      // Rise plainly and walk to the band once up (the window takes over).
      if (self.down) return emptyInput();
      return null;
    }
    if (self.down) {
      // The rise option, through the same inputs a human uses.
      if (plan.rise === "quick") return { ...emptyInput(), jump: true };
      if (plan.rise === "delay") return { ...emptyInput(), down: true };
      return emptyInput();
    }
    if (self.wakeupFrames > 0) {
      if (oki.wakeTick < 0) oki.wakeTick = view.tick + self.wakeupFrames;
      // The reversal is buffered on the last rising frames (the brain's own
      // rule: justWoke || wakeupFrames <= 4).
      if (plan.answer === "reversal" && self.wakeupFrames <= 4
        && self.meter >= GRIT_RULES.enhancedSpecialCost) {
        return { ...emptyInput(), enhancedLauncher: true };
      }
      // The pre-contact tech: a grab of your own buffered as the throw comes.
      if (plan.answer === "tech" && opponent.attackLevel === "throw") return throwPress(self, opponent);
      return { ...emptyInput(), guard: true };
    }
    if (oki.wakeTick < 0) oki.wakeTick = view.tick;
    const up = view.tick - oki.wakeTick;
    if (up > OKI_ANSWER_FRAMES) {
      oki.victimDone = true;
      return null;
    }
    if (!actionable(self)) {
      // The clinch tech: a fresh grab inside the first frames of the hold.
      if (self.grabbed && plan.answer === "tech"
        && (self.grabbedFrame ?? 0) <= DEFENSE_RULES.clinchTechWindowFrames) {
        return throwPress(self, opponent);
      }
      return emptyInput();
    }
    // The attacker is caught in its whiff tail (the guess was wrong): PUNISH.
    const tail = (opponent.whiffTick >= 0 && view.tick - opponent.whiffTick <= 26)
      || opponent.attackRearmFrames > 0;
    if (tail && !oki.punished && !opponent.attacking) {
      oki.punished = true;
      stats.okiPunishes += 1;
      if (distance <= THROW_RULES.grabRange - 10) return throwPress(self, opponent);
      return beatPress(side, view, PUNISH_IDS) || { ...emptyInput(), heavy: true };
    }
    if (oki.punished) return self.attacking ? emptyInput() : null;
    if (plan.answer === "reversal" && up <= 2 && self.meter >= GRIT_RULES.enhancedSpecialCost) {
      return { ...emptyInput(), enhancedLauncher: true };
    }
    // The wake-up button: pressed on the first free tick, once.
    if (plan.answer === "press") {
      if (up <= 1 && !oki.victimPressed) {
        oki.victimPressed = true;
        return beatPress(side, view, POKE_IDS) || { ...emptyInput(), light: true };
      }
      if (self.attacking || oki.victimPressed) { oki.victimDone = oki.victimDone || !self.attacking; return self.attacking ? emptyInput() : null; }
    }
    if (plan.answer === "tech" && opponent.attackLevel === "throw") return throwPress(self, opponent);
    if (plan.answer === "reversal" && up > 2) {
      // The reversal is out (or was refused): the answer is over.
      oki.victimDone = true;
      return null;
    }
    // Against the grab the victim stands its ground behind the guard — a
    // guard with a direction held both blocks and walks, so it steps INTO
    // the attacker rather than freezing (measured stepping back, the grab
    // reached nothing: 0 of 4 meaty throws landed). The throw beating the
    // block is the read. Against the strike, block and step back.
    if (plan.option === "meatyThrow") return { ...towardInput(self, opponent), guard: true };
    return rockInput(side, view, 60, 140, { guard: true });
  }

  // --- 5.4 FIGHT NIGHT: the neutral budget ---------------------------------
  function observeNeutral(view) {
    if (view.phase !== "fight") {
      neutral.roundStart = -1;
      neutral.pending = null;
      if (neutral.until > 0) endNeutral(view);
      if (oki.active) endOki();
      return;
    }
    if (neutral.roundStart < 0) {
      neutral.roundStart = view.tick;
      neutral.roundTicks = 0;
      neutral.freeTicks = 0;
      neutral.budgetWindows = 0;
      neutral.okiPlans = 0;
      neutral.lastEnd = -Infinity;
      neutral.pending = blend > 0 ? "bell" : null;
    }
    neutral.roundTicks += 1;
    const free = bothFree(view);
    if (free) neutral.freeTicks += 1;
    if (neutral.until > 0) {
      if (view.tick >= neutral.until) endNeutral(view);
      return;
    }
    if (blend <= 0 || oki.active || !free) return;
    let reason = neutral.pending;
    if (!reason && neutral.roundTicks >= NEUTRAL_BUDGET_MIN_ROUND_FRAMES
      && neutral.budgetWindows < NEUTRAL_BUDGET_MAX_PER_ROUND
      && neutral.freeTicks / neutral.roundTicks < NEUTRAL_TARGET_SHARE
      && view.tick >= neutral.lastEnd + NEUTRAL_REARM_FRAMES) reason = "budget";
    if (!reason) return;
    if (!releaseLanes(view, "neutralPreempts")) return;
    startNeutral(reason, view);
  }

  function startNeutral(reason, view) {
    const ticks = NEUTRAL_WINDOW_FRAMES.min
      + Math.floor(rng.nextFloat() * (NEUTRAL_WINDOW_FRAMES.max - NEUTRAL_WINDOW_FRAMES.min + 1));
    const bait = rng.nextFloat() < 0.5 ? 0 : 1;
    const baitAt = view.tick + 14 + Math.floor(rng.nextFloat() * ticks * 0.45);
    // The aggressor closes the window: the less patient persona, a coin when
    // they tie; it dashes in at its persona's dash share (boosted — this is
    // the one commit the window shows).
    const [p0, p1] = profiles;
    const aggressor = p0.patience === p1.patience ? (rng.nextFloat() < 0.5 ? 0 : 1)
      : (rng.nextFloat(), p0.patience < p1.patience ? 0 : 1);
    const dash = rng.nextFloat() < Math.min(0.8, profiles[aggressor].dashInChance * 1.6 + 0.2);
    const backRead = [rng.nextFloat() < 0.5 ? "poke" : "step", rng.nextFloat() < 0.5 ? "poke" : "step"];
    neutral.plan = {
      reason, bait, baitAt, baitDone: false, aggressor, dash, dashStart: -1, backRead,
      read: [null, null], spent: [false, false], backDone: [false, false], attacksLeft: NEUTRAL_READ_ATTACKS, baitId: null,
      closingTicks: [0, 0], backSteps: [0, 0], offset: [0, 5],
    };
    neutral.until = view.tick + ticks;
    neutral.since = view.tick;
    neutral.pending = null;
    if (reason === "budget") neutral.budgetWindows += 1;
    stats.neutralWindows += 1;
    stats.neutralBy[reason] = (stats.neutralBy[reason] || 0) + 1;
  }

  function endNeutral(view) {
    neutral.until = 0;
    neutral.plan = null;
    neutral.lastEnd = view?.tick ?? clock;
    nextDecision[0] = neutral.lastEnd + 1;
    nextDecision[1] = neutral.lastEnd + 2;
  }

  function footsiesInput(side, view) {
    const plan = neutral.plan;
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    if (!plan || !actionable(self)) return emptyInput();
    const distance = Math.abs(opponent.x - self.x);
    const band = neutralBands[side];
    const cornered = Math.min(self.x - view.stageMinX, view.stageMaxX - self.x) < 90;
    // WALK-FORWARD READ: the opponent has just closed a swing on nothing (a
    // whiff tell / re-arm gap is showing) — step in and punish inside a heavy's
    // band. Once per side per window.
    const tail = (opponent.whiffTick >= 0 && view.tick - opponent.whiffTick <= 26)
      || opponent.attackRearmFrames > 0;
    // (One read-attack per side per window: a window is for walking, and
    // measured with a poke AND a punish allowed per side half its ticks had
    // someone swinging.)
    if (tail && !opponent.attacking && !plan.spent[side] && plan.attacksLeft > 0) {
      if (plan.read[side] !== "forward") { plan.read[side] = "forward"; stats.neutralReads.forward += 1; }
      const heavy = bands[side].standHeavy || { min: MIN_SEPARATION, max: 150 };
      if (distance > heavy.max) return towardInput(self, opponent);
      plan.spent[side] = true;
      plan.attacksLeft -= 1;
      return beatPress(side, view, PUNISH_IDS) || { ...emptyInput(), heavy: true };
    }
    // THE BAIT: one deliberate whiff just outside the real reach of the
    // least-shown plain normal (the swing is chosen first so the spacing is
    // that swing's own).
    if (side === plan.bait && !plan.baitDone && view.tick >= plan.baitAt) {
      if (!plan.baitId) plan.baitId = beatChoice(side, view, BAIT_IDS) || "standLight";
      const poke = bands[side][plan.baitId] || { min: MIN_SEPARATION, max: 120 };
      const whiffMin = poke.max + NEUTRAL_WHIFF_MARGIN;
      const whiffMax = whiffMin + 44;
      if (distance < whiffMin && !cornered) return awayInput(self, opponent);
      if (distance > whiffMax) return towardInput(self, opponent);
      plan.baitDone = true;
      stats.neutralBaits += 1;
      const spec = directiveForMove(side, plan.baitId);
      return Object.assign(holdInput(spec, self, opponent), spec.press);
    }
    // THE COMMIT: the aggressor closes the window walking (or dashing) in.
    if (side === plan.aggressor && view.tick >= neutral.until - 24) {
      if (plan.dash) {
        if (plan.dashStart < 0) plan.dashStart = view.tick;
        const step = view.tick - plan.dashStart;
        if (step === 2 || (step >= 5 && step <= 8)) return towardInput(self, opponent);
        if (step <= 8) return emptyInput();
      }
      return towardInput(self, opponent);
    }
    // WALK-BACK READ: the opponent is walking in on the band — step out
    // behind the guard, or meet it with one poke at the edge.
    // A rock step is not a walk-in: the read needs the opponent to have been
    // closing for six straight ticks, and it is taken once per side per
    // window (the poke variant only inside the poke's real reach).
    const closing = (opponent.vx * (self.x > opponent.x ? 1 : -1)) > 40;
    plan.closingTicks[side] = closing ? plan.closingTicks[side] + 1 : 0;
    if (plan.closingTicks[side] >= 6 && distance < band.near + 20 && !plan.backDone[side]) {
      if (plan.read[side] === null) { plan.read[side] = "back"; stats.neutralReads.back += 1; }
      const poke = bands[side].standLight || { min: MIN_SEPARATION, max: 120 };
      if (plan.backRead[side] === "poke" && !plan.spent[side] && plan.attacksLeft > 0 && distance <= poke.max) {
        plan.backDone[side] = true;
        plan.spent[side] = true;
        plan.attacksLeft -= 1;
        return beatPress(side, view, POKE_IDS) || { ...emptyInput(), light: true };
      }
      if (!cornered) {
        plan.backSteps[side] += 1;
        if (plan.backSteps[side] >= 14) plan.backDone[side] = true;
        return { ...awayInput(self, opponent), guard: true };
      }
    }
    // SPACING: hold the kit's own band, rocking in and out of it on this
    // side's own period so the pair never mirrors.
    if (distance > band.far) return towardInput(self, opponent);
    if (distance < band.near) return cornered ? towardInput(self, opponent) : awayInput(self, opponent);
    const out = Math.floor((view.tick + plan.offset[side]) / 11) % 2 === 0;
    return out && !cornered ? awayInput(self, opponent) : towardInput(self, opponent);
  }

  // --- per-tick movement/state observation (edge detection) ----------------
  function observe(view) {
    if (!view || !Array.isArray(view.fighters)) return;
    clock = view.tick || clock;
    lastView = view;
    // 5.4 FIGHT NIGHT: the neutral budget's per-tick bookkeeping (and the
    // round edge that arms the bell window). Before the beat edges so a
    // window armed on this tick sees the lanes as they are now.
    observeNeutral(view);
    for (let side = 0; side < 2; side += 1) {
      const fighter = view.fighters[side];
      if (!fighter) continue;
      const before = previous[side];
      if (before && view.phase === "fight") {
        // 5.4 FIGHT NIGHT (sweep #4): the okizeme / tech family, observed off
        // the view. A hit taken on a rising frame is the partner's MEATY; a
        // hold that begins within the rise's own throw immunity is a MEATY
        // THROW; a tech flash on the fighter who was being grabbed is a
        // THROW TECH; a throw closing on nothing is a THROW WHIFF.
        const rival = view.fighters[1 - side];
        const gotHit = (fighter.hitstunFrames > 0 && before.hitstunFrames <= 0)
          || (fighter.pendingKnockdown && !before.pendingKnockdown)
          || (fighter.down && !before.down);
        if (gotHit && before.wakeupFrames > 0) noteBeat(1 - side, "meaty");
        if (fighter.grabbed && !before.grabbed
          && view.tick - (lastWake[side] ?? -Infinity) <= DEFENSE_RULES.strikeKnockdownThrowImmuneFrames + 6) {
          noteBeat(1 - side, "meatyThrow");
        }
        if ((fighter.throwTechFlashFrames || 0) > 0 && !(before.throwTechFlashFrames > 0)
          && (before.grabbed || rival.attackLevel === "throw" || previous[1 - side]?.attackLevel === "throw")) {
          noteBeat(side, "throwTech");
        }
        if ((fighter.whiffTick ?? -1) >= 0 && fighter.whiffTick !== before.whiffTick
          && fighter.whiffKind === "throw") noteBeat(side, "throwWhiff");
        if (before.wakeupFrames > 0 && fighter.wakeupFrames <= 0) lastWake[side] = view.tick;
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
        //
        // v2.9 round 4 — HONEST TURNAROUND COUNTING. This used to count every
        // grounded facing flip, which is why qa.demoCoverage() reported the
        // beat FIRING while motion2:5 drew for zero frames. The authored pivot
        // sits below hitstun, blockstun, the block flinch, knockdown, wake-up,
        // throw-tech, grabs and dizzy in fighterPoseDescriptor, and it needs
        // `grounded && !attacking` on top of that — so a flip taken while
        // being hit, while swinging or while getting up can never reach the
        // screen. A flip is only a BEAT when the pivot could actually draw.
        // The rejects are counted by reason instead of silently inflating the
        // ledger. (Purely a state test on the same view the picks read, so
        // determinism is untouched — the render-verified per-cell tally lives
        // in game.js and never feeds a decision here.)
        if (fighter.grounded && before.facing !== undefined
          && fighter.facing !== before.facing) {
          stats.turnaroundSeen += 1;
          const blocker = turnaroundBlocker(fighter);
          if (blocker) {
            stats.turnaroundBlind[blocker] = (stats.turnaroundBlind[blocker] || 0) + 1;
          } else {
            noteBeat(side, "turnaround");
          }
        }
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
        // 5.4 FIGHT NIGHT: the okizeme / tech family's edges.
        hitstunFrames: fighter.hitstunFrames,
        pendingKnockdown: Boolean(fighter.pendingKnockdown),
        down: Boolean(fighter.down),
        grabbed: Boolean(fighter.grabbed),
        throwTechFlashFrames: fighter.throwTechFlashFrames || 0,
        whiffTick: fighter.whiffTick ?? -1,
        attackLevel: fighter.attackLevel || null,
      };
    }
  }

  // v2.9 round 4 — can this victim still be ARMED for a corner wall bounce?
  // The conversion is once per combo (wallBounceUsed clears on wake-up and on
  // a throw) and it spends a juggle point, so a victim already at the juggle
  // limit cannot take one. Chasing the beat while either is true is exactly
  // how the attempt budget used to be spent on geometry the sim would refuse.
  function canArmWallBounce(victim) {
    return !victim.wallBounceUsed
      && (victim.juggleCount ?? 0) < COMBO_RULES.juggleLimit;
  }

  // --- v2.9 round 4: coverage fairness -------------------------------------
  // How much of its own checklist a side has put on screen, and how far ahead
  // of the partner it is. A lopsided exhibition is not a better exhibition:
  // the cabinet is showing off two kits, not settling an argument.
  function shownCount(side) {
    const moves = coverage[side].moves;
    let shown = 0;
    for (const id of checklists[side]) if (moves[id] > 0) shown += 1;
    return shown;
  }

  function coverageGap(side) {
    return shownCount(side) - shownCount(1 - side);
  }

  // The side is running away with the exhibition: either it has already shown
  // materially more of its kit, or it is far enough ahead on health that it is
  // about to (a fighter that spends the round in hitstun cannot stage
  // anything, which is exactly how a 6-of-30 column happens).
  function dominating(side, view, tolerance = yieldTolerance[side]) {
    if (!tolerance) {
      // A seat the story never lets yield: measured for the honest half of
      // the ledger (how often the 2.9 rule WOULD have stood it down).
      if (dominating(side, view, { coverage: COVERAGE_GAP_TOLERANCE, health: HEALTH_GAP_TOLERANCE })) stats.yieldRefused += 1;
      return false;
    }
    if (coverageGap(side) >= tolerance.coverage) return true;
    const self = view.fighters[side];
    const rival = view.fighters[1 - side];
    if (!Number.isFinite(self?.health) || !Number.isFinite(rival?.health)) return false;
    return self.health - rival.health >= tolerance.health && coverageGap(side) > 0;
  }

  // 5.4 GRIT POLICY: the bar is full and there is a super to spend it on.
  function gritReady(side, view) {
    const self = view.fighters[side];
    return self.meter >= GRIT_RULES.superCost
      && view.tick >= itemBlockedUntil[side].super;
  }

  // ...and the checklist may be STEERED onto a confirm opener for it. One
  // steer per bar: a full bar whose opener whiffed (or whose link the sim
  // refused) waits GRIT_STEER_FRAMES before the picker is bent again, so a
  // bar that stays full — the sim-lite harness starts every fighter on 100 —
  // can never starve the free lane and the air row the way the old
  // least-shown `super` item starved nothing. The LINK (chainItem) has no
  // such cooldown: that is the spend itself.
  function gritSteerReady(side, view) {
    return gritReady(side, view) && view.tick >= gritSteerBlockedUntil[side];
  }

  function trailing(side, view) {
    return dominating(1 - side, view);
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

  // `urgent` skips the attempt budget and the backoff — never the "already
  // shown" ledger. Reserved for a situation the fight has ALREADY built that
  // is about to expire (a stun bar one hit from the threshold), where refusing
  // to look at it because three earlier attempts failed is exactly how a beat
  // that the exhibition had genuinely earned went unshown.
  function beatOpen(beat, view, urgent = false) {
    if (urgent) return beatTotal(beat) === 0;
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
      if (rng.nextFloat() >= repeatShareFor(side, beat)) return false;
    }
    if (beatAttempts[beat] >= (BEAT_BUDGETS[beat] ?? BEAT_ATTEMPT_BUDGET)) return false;
    return view.tick >= beatBlockedUntil[beat];
  }

  // 5.4 FIGHT NIGHT (sweep #4): the throw family's repeat share is the
  // PERSONA's — its throwChance scaled onto the beat lottery, so the grappler
  // (0.3 → 0.66) keeps coming back for the grab and the zoner (0.05 → 0.11)
  // mostly does not; the two duet beats repeat at half that.
  function repeatShareFor(side, beat) {
    if (beat === "throw") return Math.min(0.7, Math.max(0.1, profiles[side].throwChance * 2.2));
    if (beat === "throwTech" || beat === "throwWhiff") return Math.min(0.4, Math.max(0.08, profiles[side].throwChance * 1.1));
    return BEAT_REPEAT_SHARE[beat] ?? BEAT_REPEAT_DEFAULT;
  }

  // Moment beats: their staging window is NOW (a knockdown to disrespect, a
  // weapon lying on the ground) — they bypass the blend roll AND the decision
  // gap entirely, which is exactly the "stage the situational beats
  // opportunistically" rule.
  function momentBeatDirective(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const distance = Math.abs(opponent.x - self.x);
    // 5.4 SESSION LAYER: the SHOWBOAT disrespects EVERY knockdown — the beat
    // ledger's one-per-exhibition rule does not apply to it, only a short
    // cooldown so one knockdown is one taunt.
    if (side === showboatSide && opponent.down && distance > 60 && view.tick >= showboatBlockedUntil) {
      showboatBlockedUntil = view.tick + SHOWBOAT_TAUNT_FRAMES;
      stats.showboatTaunts += 1;
      return {
        beat: "taunt",
        spec: {
          kind: "ground", press: { taunt: true }, hold: {},
          band: { min: 150, max: Infinity },
        },
      };
    }
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
    // Round 4: a bar within one hit of the threshold is URGENT — the fight has
    // already done every bit of the work and the only thing between it and the
    // beat is one more contact before the 48-frame grace runs out.
    const nearlyStunned = opponent.stunMeter >= DIZZY_TOPUP_STUN;
    if (beatOpen("dizzy", view, nearlyStunned) && !opponent.down
      && opponent.stunMeter >= DIZZY_STAGE_STUN && distance < 340) {
      return { beat: "dizzy", spec: { kind: "pressure", feed: "brace" } };
    }
    // Round 4: only when the victim can still TAKE a bounce. Committing the
    // directive against a victim whose conversion is already spent (or who is
    // at the juggle limit) burned an attempt on a beat the sim would refuse.
    if (beatOpen("wallsplat", view) && !opponent.down && canArmWallBounce(opponent)
      && pushWallGap(self, opponent, view) < WALLSPLAT_STAGE_GAP) {
      return { beat: "wallsplat", spec: { kind: "wallsplat", feed: "brace" } };
    }
    return null;
  }

  // The throw family's opportunistic staging (see maybeStart). Least-shown
  // among the side's open throw beats; the two duets only with a free
  // partner. The rng draw happens only when the geometry is right, so the
  // stream is untouched everywhere else.
  const throwStagedAt = [-Infinity, -Infinity];
  const throwStaged = [0, 0];
  function throwOpportunity(side, view) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    if (opponent.down || !stageable(self)) return null;
    if (view.tick < throwStagedAt[side] + THROW_FAMILY_REARM_FRAMES) return null;
    if (throwStaged[side] >= throwFamilyCap(profiles[side])) return null;
    const distance = Math.abs(opponent.x - self.x);
    if (distance > THROW_RULES.attemptRange + 20) return null;
    const partnerFree = !leadOf(1 - side) && actionable(opponent);
    const open = [];
    if (sideBeatOpen(side, "throw", view)) open.push("throw");
    if (partnerFree && sideBeatOpen(side, "throwTech", view)) open.push("throwTech");
    if (partnerFree && sideBeatOpen(side, "throwWhiff", view)) open.push("throwWhiff");
    if (!open.length) return null;
    if (rng.nextFloat() >= Math.min(0.9, profiles[side].throwChance * 2.5 + 0.1)) return null;
    const beats = beatsFor(side);
    const low = Math.min(...open.map((beat) => beats[beat]));
    const beat = pick(open.filter((name) => beats[name] === low));
    throwStagedAt[side] = view.tick;
    throwStaged[side] += 1;
    stats.throwOpportunities += 1;
    if (beat === "throwTech") {
      return { beat, spec: { kind: "ground", press: { throw: true }, hold: {}, band: { min: MIN_SEPARATION, max: THROW_TECH_RANGE }, feed: "tech" } };
    }
    if (beat === "throwWhiff") {
      return { beat, spec: { kind: "ground", press: { throw: true }, hold: {}, band: { min: THROW_WHIFF_RANGE.min, max: THROW_WHIFF_RANGE.max }, feed: "punish" } };
    }
    return {
      beat,
      spec: {
        kind: "ground", press: { throw: true }, hold: {},
        band: bands[side].throw || { min: MIN_SEPARATION, max: 120 },
        feed: leadOf(1 - side) ? null : "close",
      },
    };
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
      // Round 4: the herd is the beat's real work — carrying the victim across
      // the stage over several exchanges — so it may now be taken from further
      // out (the arming window is only 105px wide; the free lane alone almost
      // never delivered a victim into it). It still only runs for the side
      // pushing toward the near wall, and only against a victim whose bounce
      // conversion is still available.
      if (beatOpen("wallsplat", view) && !opponent.down && canArmWallBounce(opponent)
        && pushWallGap(self, opponent, view) < 420) {
        candidates.push({ beat: "wallsplat", make: () => ({ kind: "wallsplat", feed: feedIf("brace") }) });
      }
      if (beatOpen("counterhit", view) && !opponent.down) {
        candidates.push({ beat: "counterhit", make: () => ({ kind: "counter", feed: feedIf("swing") }) });
      }
      // 5.4 FIGHT NIGHT (sweep #4): the throw is a PER-SIDE beat now (it was
      // a pair beat — one throw per exhibition, whichever side got there
      // first), repeatable at the persona's share (see repeatShareFor)...
      if (sideBeatOpen(side, "throw", view) && !opponent.down) {
        candidates.push({
          beat: "throw",
          make: () => ({
            kind: "ground", press: { throw: true }, hold: {},
            band: bands[side].throw || { min: MIN_SEPARATION, max: 120 },
            feed: feedIf("close"),
          }),
        });
      }
      // ...and the family gains the two duet reads the 5.3 close-range pass
      // authored: the THROW TECH (the lead grabs inside reach, the feed breaks
      // it with a grab of its own inside the tech windows) and the THROW WHIFF
      // (the lead grabs from the commit band just outside reach, the feed
      // punishes the 42-51 frame tail). Both need the partner's hands, so
      // they are only offered while the partner is free to feed.
      if (!partnerBusy && sideBeatOpen(side, "throwTech", view) && !opponent.down && actionable(opponent)) {
        candidates.push({
          beat: "throwTech",
          make: () => ({
            kind: "ground", press: { throw: true }, hold: {},
            band: { min: MIN_SEPARATION, max: THROW_TECH_RANGE },
            feed: "tech",
          }),
        });
      }
      if (!partnerBusy && sideBeatOpen(side, "throwWhiff", view) && !opponent.down && actionable(opponent)) {
        candidates.push({
          beat: "throwWhiff",
          make: () => ({
            kind: "ground", press: { throw: true }, hold: {},
            band: { min: THROW_WHIFF_RANGE.min, max: THROW_WHIFF_RANGE.max },
            feed: "punish",
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
      //
      // v2.9 round 4 — STAGE A FLIP THAT CAN ACTUALLY DRAW. The beat is only
      // counted now when the flipping fighter is in a state the authored pivot
      // can reach (see turnaroundBlocker), so the cross-up has to deliver the
      // defender to the crossing GROUNDED, free, and not mid-swing. Three
      // things changed: the defender must be actionable when the jump starts
      // (an opponent already in blockstun or recovery is still in it when the
      // jumper lands, and blockstun outranks the pivot); the jumper does not
      // attack (a cross-up air normal puts the defender straight into
      // blockstun or hitstun ON the flip, which is the state that made the old
      // counter dishonest); and the feed lease is long enough to cover the
      // whole arc rather than expiring mid-flight.
      if (beatOpen("turnaround", view) && !opponent.down && actionable(opponent)) {
        candidates.push({
          beat: "turnaround",
          make: () => ({
            kind: "air", press: null, jumpDir: 1, approach: 110,
            crossup: true, feed: feedIf("plant"),
          }),
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
      //
      // v2.9 round 4: the corner closer narrows to this fighter's WALL-BOUNCE
      // set, not to "anything with a big push". Inside the arming window a
      // qualifying knockdown heavy/special converts every time (carryVelocityX
      // 680 into the clamp); a non-qualifying push — driveHeavy above all,
      // which qualifies on none of the nine kits — cannot convert at all, and
      // its raw carry has bled under the 220 threshold long before it arrives.
      const armed = canArmWallBounce(opponent);
      // v2.9 round 4 — A BAR ONE HIT FROM THE THRESHOLD OUTRANKS EVERYTHING.
      // Measured after the cancel string landed, the stun bar was peaking at
      // 85-96 of 100 and then bleeding back down: the last hit is worth more
      // to the exhibition than any ordering rule, so at DIZZY_TOPUP_STUN the
      // closer stops rolling dice and throws the kit's fastest stun normal.
      const topUpCloser = beatTotal("dizzy") === 0 && !opponent.down
        && opponent.stunMeter >= DIZZY_TOPUP_STUN && distance < 300;
      const cornerCloser = !topUpCloser && beatTotal("wallsplat") === 0 && armed
        && pushWallGap(self, opponent, view) <= WALLSPLAT_CLOSE_GAP;
      const stunCloser = !topUpCloser && !cornerCloser && beatTotal("dizzy") === 0
        && opponent.stunMeter >= DIZZY_CLOSE_STUN && distance < 280;
      const closerSet = topUpCloser ? stunIds[side].topUp
        : cornerCloser ? slamIds[side]
          : stunCloser ? stunIds[side].build : null;
      if (closerSet && (topUpCloser || rng.nextFloat() < 0.8)) {
        const closers = ids.filter((id) => closerSet.has(id));
        if (closers.length) {
          const low = Math.min(...closers.map((id) => moves[id]));
          const pool = closers.filter((id) => moves[id] === low);
          const chosen = pick(pool);
          if (cornerCloser) stats.pushLanePicks += 1;
          else stats.stunLanePicks += 1;
          if (topUpCloser) stats.topUpCloserPicks += 1;
          return { id: chosen, count: moves[chosen] };
        }
      }
    }
    // 5.4 GRIT POLICY (sweep #6) — A FULL BAR OUTRANKS THE CHECKLIST ORDER.
    // Measured before this, `super` waited its turn behind 29 other ids as an
    // ordinary least-shown item, so a fighter sat on 100 Grit for 30-39% of
    // the fight and 20 of 32 rounds ended with the bar still full. With the
    // bar full the next showcase is a CONFIRM OPENER — the least-shown normal
    // that cancels into the super — and recoverStep chains the super into the
    // sim's own confirm window (see chainItem). Like the stun closer this only
    // reorders the checklist: the opener is a move the exhibition owed anyway.
    if (gritSteerReady(side, view) && !opponent.down && distance < 320) {
      gritSteerBlockedUntil[side] = view.tick + GRIT_STEER_FRAMES;
      const openers = ids.filter((id) => confirmIds[side].has(id));
      if (openers.length) {
        const low = Math.min(...openers.map((id) => moves[id]));
        const chosen = pick(openers.filter((id) => moves[id] === low));
        stats.gritOpeners += 1;
        return { id: chosen, count: moves[chosen] };
      }
    }
    // THE AIR ROW (v2.9 round 4). Reserved ahead of the FREE LANE below (but
    // deliberately behind the closer, whose windows are measured in tens of
    // ticks), because the free lane is a filter no air normal can ever win:
    // it narrows the pool to PUSH_LANE_IDS / STUN_LANE_IDS and no air normal
    // is in either set. While wall splat and dizzy stayed unshown — measured,
    // most of the exhibition — that narrowing was live for a majority of
    // picks, which is how airLightKick reached 6 of 16 fighter slots. The
    // reservation only runs while the side still OWES the cabinet an air move,
    // so it costs the rest of the checklist nothing once the row is on screen.
    const airOwed = airIds[side].filter((id) => ids.includes(id) && moves[id] === 0);
    if (airOwed.length && rng.nextFloat() < AIR_ROW_SHARE) {
      const chosen = pick(airOwed);
      stats.airRowPicks += 1;
      return { id: chosen, count: moves[chosen] };
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
    // v2.9 round 4 — THE WALL LANE WAS EATING THE STUN LANE. WALLSPLAT_PRIME_GAP
    // is 440 of a 1128px stage, so "the victim is somewhere in the outer third"
    // was true most of the time, and because the wall arm is checked first with
    // an `else if` the stun lane essentially never ran: measured over six
    // exhibitions, stunLanePicks was 0-2 while the bar plateaued at 20-46 of
    // the 100 it needs. Stun builds ANYWHERE, so the corner — which does not —
    // only gets priority when the victim is genuinely near enough to convert.
    // ...and the ORDER of the two arms is load-bearing. WALLSPLAT_PRIME_GAP is
    // 440 of a 1128px stage, so "the victim is somewhere in the outer third"
    // was true most of the time — and because the wall arm was tested first
    // with an `else if`, the stun lane essentially never ran. Measured over
    // six exhibitions: stunLanePicks 0-2, and the stun bar plateaued at 20-46
    // of the 100 it needs. The corner takes priority only when it is CLOSE
    // (the one situation the ordinary pipeline cannot reproduce on demand);
    // a bar that is already climbing outranks a far-off wall, because stun
    // builds anywhere and the corner does not.
    const cornerClose = wallGap < WALLSPLAT_ARM_GAP + 170 && canArmWallBounce(opponent);
    const wallLane = laneOpen && beatTotal("wallsplat") === 0 && wallGap < WALLSPLAT_PRIME_GAP;
    const stunLane = dizzyLaneOpen && opponent.stunMeter >= DIZZY_PRIME_STUN && distance < 300;
    if (wallLane && (cornerClose || !stunLane)) {
      // Inside the arming window the free lane wants the moves that CONVERT,
      // not the ones that merely push — outside it, the push set is still what
      // carries the victim there.
      const wantSlam = wallGap <= WALLSPLAT_ARM_GAP && canArmWallBounce(opponent);
      const push = ids.filter((id) => (wantSlam ? slamIds[side] : PUSH_LANE_IDS).has(id));
      if (push.length) { ids = push; stats.pushLanePicks += 1; }
    } else if (stunLane) {
      // ...and the stun lane leans on its heavies: with a 48-frame decay grace
      // the bar only loses points when the string STOPS, so stun per hit is
      // what matters, not stun per frame (see DIZZY_TOPUP_STUN).
      const wantTopUp = opponent.stunMeter >= DIZZY_TOPUP_STUN;
      const stunSet = wantTopUp ? stunIds[side].topUp : stunIds[side].build;
      const stun = ids.filter((id) => stunSet.has(id));
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
  function beatChoice(side, view, allowed) {
    const self = view.fighters[side];
    const moves = coverage[side].moves;
    const ids = checklists[side].filter((id) => {
      if (!allowed.has(id)) return false;
      if (EX_ACTIONS.has(id) && self.meter < GRIT_RULES.enhancedSpecialCost) return false;
      if (id === "super" && self.meter < GRIT_RULES.superCost) return false;
      return true;
    });
    if (!ids.length) return null;
    const low = Math.min(...ids.map((id) => moves[id]));
    return pick(ids.filter((entry) => moves[entry] === low));
  }

  function beatPress(side, view, allowed) {
    const self = view.fighters[side];
    const opponent = view.fighters[1 - side];
    const id = beatChoice(side, view, allowed);
    if (!id) return null;
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
      // v2.9 round 4 — an air ATTACK always jumps TOWARD. jumpDir used to be
      // left null and then resolved to whichever jump ARC beat was least
      // shown, so the row was regularly thrown out of a back or neutral jump:
      // the swing came out metres from the opponent and — because the approach
      // guard only ran for jumpDir > 0 — nothing ever closed that gap. The arc
      // beats keep the least-shown choice; the attacks do not want it.
      return { kind: "air", press, approach: Math.min(band.max, AIR_ATTACK_APPROACH), jumpDir: 1 };
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
    if (gritReady(side, view)) return true;
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
    // 5.4 GRIT POLICY: a full bar on a confirmed hit is the super, shown or
    // not — the point of the link here is spending the bar the way a human
    // spends it, and the bar refills. The ordinary "new coverage only" rule
    // below keeps governing every other link.
    if (gritReady(side, view) && self.attackConnected !== "block"
      && (moves.super !== undefined)) {
      stats.gritLinks += 1;
      return "super";
    }
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
    // guarded contact only against a fighter that can actually block now — and
    // the cross-up plant for the same reason: a defender who is still in
    // blockstun or recovery when the jumper crosses is in a state the
    // authored pivot cannot draw from (see turnaroundBlocker).
    if ((sticky || mode === "plant") && !actionable(view.fighters[partner])) return;
    // v2.9 round 4: the plant is NOT sticky (it is released with its lead, so
    // the defender goes straight back to its own checklist the moment the
    // cross-up resolves) but its LEASE has to outlast the whole arc. The
    // 44-frame default expired while the jumper was still climbing, which
    // handed the defender back to the brain — usually into a guard or a swing
    // — before it ever had anything to turn around for.
    // v2.9 round 4: a brace behind a STUN STRING or a WALL HERD is not a
    // 44-tick favour — those two beats are the only ones in the module that
    // take several exchanges to build, and handing the victim back to the
    // brain a third of the way through is why the stun bar plateaued at 20-46
    // of 100. The lease still ends with the lead (so it stops the instant the
    // beat lands or gives up) and the fairness guard above still refuses to
    // press a fighter that is BEHIND on its own checklist into the role.
    const longBrace = mode === "brace"
      && (lead?.spec?.kind === "pressure" || lead?.spec?.kind === "wallsplat");
    // 5.4 FIGHT NIGHT: the two throw duets need the partner's hands until the
    // grab actually comes, which is a walk-in plus the lead's own spacing.
    const throwDuet = mode === "tech" || mode === "punish";
    const lease = mode === "guard" ? GUARD_FEED_FRAMES
      : mode === "plant" ? CROSSUP_FEED_FRAMES
        : longBrace ? SPECTACLE_FEED_FRAMES
          : throwDuet ? CROSSUP_FEED_FRAMES
            : FEED_LEASE_FRAMES;
    lanes[partner] = { role: "feed", mode, lead, sticky, until: view.tick + lease };
  }

  function maybeStart(side, view, momentOnly = false, gritOnly = false) {
    const self = view.fighters[side];
    if (!stageable(self)) return null;
    const beats = beatsFor(side);
    let spec = null;
    let item = null;
    let beat = null;
    let moment = gritOnly ? null : momentBeatDirective(side, view);
    if (momentOnly && !moment) return null;
    // 5.4 FIGHT NIGHT (sweep #4): a THROW OPPORTUNITY — the opponent inside
    // grab reach and free — is taken at the persona's throwChance ahead of
    // the blend, the way the brain takes its own throw roll in the clinch.
    // Measured through the beat lottery alone (one candidate in ten or so,
    // 22% of picks) the per-side throw beat made no difference at all: 11
    // throws pressed in 6 exhibitions before and after.
    // (Not on a CLOCK card — blend 0 — where the choreographer stands down
    // and the measured clock rounds are brain-only.)
    if (!moment && !gritOnly && !momentOnly && blend > 0) moment = throwOpportunity(side, view);
    // v2.9 round 4 — THE TRAILING SIDE DOES NOT STAND DOWN. A fighter that is
    // losing the exhibition is exactly the fighter that needs every window it
    // can get; rolling it into an archetype-AI natural window on top of that
    // is how a column finishes at 6 of 30. It keeps its natural windows only
    // while the pair is level.
    const behind = trailing(side, view);
    if (behind) stats.trailerBoosts += 1;
    if (moment) {
      ({ spec, beat } = moment);
    } else if (!gritOnly && !behind && rng.nextFloat() >= blend) {
      // The natural side of the blend: a genuine archetype-AI window, so the
      // exhibition still reads as a fight rather than a moves checklist.
      // Short, because the OTHER lane is usually mid-showcase anyway.
      stats.naturalWindows += 1;
      nextDecision[side] = view.tick + 14 + Math.floor(rng.nextFloat() * 18);
      return null;
    }
    if (!spec && !gritOnly && rng.nextFloat() < BEAT_SHARE) {
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
    // A dash cannot come out of the tail of a swing (the double-tap needs real
    // neutral edges), so it still waits for a genuinely free fighter.
    //
    // v2.9 round 4 — but a JUMP can. `jump` is a buffered action, so an air
    // directive started during our own recovery tail simply leaps the instant
    // the tail ends (runAir holds the take-off live). The old `!actionable ->
    // return null` DISCARDED the pick — it never even reached the pick
    // counters — and since the pipeline deliberately starts showcases in that
    // tail, that was the single largest tax on the air row.
    if (spec.kind === "dash" && !actionable(self)) return null;
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
    // v2.9 round 4 — RE-OFFER THE DUET ROLE. claimFeed refuses while the
    // partner is mid-showcase of its own, and for the two beats that take
    // several exchanges to BUILD that refusal was permanent: the feed was
    // asked for once, at the one moment it could not be given. Traced at tick
    // 593 of seed 1234 match 2, the stun bar sat at 94 of 100 for sixty ticks
    // while the victim — never braced — ran its own launcher and drive heavy
    // showcases and simply walked out of range, the string's distance drifting
    // 166 -> 235. Only the multi-exchange kinds retry, and only while they do
    // not already hold the partner, so the ordinary duet beats are unchanged.
    if (spec.feed && RESILIENT_KINDS.has(spec.kind)
      && lanes[1 - side]?.lead !== directive) {
      claimFeed(side, spec.feed, directive, view);
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

  // The jump input for this directive's arc. An air ATTACK is always forward
  // (see directiveForMove); only the pure arc beats spend a direction on
  // coverage.
  function airJumpInput(jumpDir, self, opponent) {
    const input = jumpDir === 0 ? emptyInput()
      : jumpDir > 0 ? towardInput(self, opponent) : awayInput(self, opponent);
    input.jump = true;
    return input;
  }

  function runAir(directive, view, self, opponent, distance) {
    const { press, jumpDir } = directive.spec;
    if (directive.phase === "act") {
      // Cross-ups and air normals approach first: the jump must start close
      // enough for the arc to reach. v2.9 round 4 — the `jumpDir > 0` guard is
      // gone: an attack directive is forward by construction, and the guard
      // was silently skipping the approach for every arc the old least-shown
      // resolver happened to point backwards.
      if ((press || directive.spec.crossup)
        && distance > directive.spec.approach) return towardInput(self, opponent);
      // v2.9 round 4 — BUFFER THE TAKE-OFF. This used to sit on emptyInput()
      // through the fighter's own recovery tail, which is exactly the state
      // most showcases start in (see stageable). `jump` is a buffered action
      // in the sim, so holding it live fires the leap the instant the recovery
      // ends, the same way the ground showcases buffer their opener.
      if (!actionable(self)) {
        if (directive.frames > 60) {
          finishDirective(directive, view, false, "airNotActionable");
          return null;
        }
        return stageable(self) ? airJumpInput(jumpDir, self, opponent) : emptyInput();
      }
      enterPhase(directive, "rise");
      return airJumpInput(jumpDir, self, opponent);
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
      if (self.grounded && stageable(self)) return airJumpInput(jumpDir, self, opponent);
      if (!self.grounded && directive.frames >= 6) {
        enterPhase(directive, press ? "airPress" : "recover");
        return press ? { ...emptyInput(), ...press } : emptyInput();
      }
      return emptyInput();
    }
    // v2.9 round 4 — THE PRESS IS A WINDOW. The attack used to be pressed on
    // exactly one tick (rise + 6) and never again, so an air normal whose
    // press landed on a frame the airborne branch could not consume — a tick
    // still inside the take-off, a tick where the buffer had just been drained
    // — simply never came out, and the directive rode the descent showing
    // nothing. The press is now re-armed every airborne tick until the move
    // starts. It stops the moment the sim reports the swing (executed), so it
    // can never spill a second buffered attack into the landing.
    if (directive.phase === "airPress") {
      if (directive.executed) {
        finishDirective(directive, view, true);
        return emptyInput();
      }
      if (self.grounded) {
        // Landed without the move — let recoverStep book it honestly.
        enterPhase(directive, "recover");
        return emptyInput();
      }
      if (directive.frames > AIR_PRESS_FRAMES) {
        finishDirective(directive, view, false, "airPressSpent");
        return null;
      }
      // Never press into an air-hitstun window: that is the juggle tech, not
      // a showcase (runDirective's interrupt guard covers the rest).
      if (self.hitstunFrames > 0 || self.pendingKnockdown) return emptyInput();
      return self.attacking ? emptyInput() : { ...emptyInput(), ...press };
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

  // v2.9 round 4 — THE STUN STRING IS A COMBO, NOT A SERIES OF POKES.
  //
  // Measured across six exhibitions of the real sim, the poke string plateaued
  // at 17-65 of the 100 the threshold needs, and the arithmetic says why. Each
  // poke costs a full cycle: press, our own recovery, then a re-approach —
  // because the hit's own push moves the victim out of range. That cycle is
  // 55-70 ticks against STUN_RULES.decayGraceFrames of 48, so the bar spends
  // 7-22 ticks DECAYING between every hit and gives back 4-14 of the 17-20 it
  // just gained. Whether the string leans on lights or heavies barely matters:
  // both lose the race to the gap between them.
  //
  // A CANCEL does not have that gap. combos.mjs opens a cancel route the tick
  // the sim confirms a hit (fighter.attackConnected), and the link lands
  // inside the victim's hitstun — no recovery, no re-approach, ~10-14 ticks
  // after the previous hit instead of 55-70. Two hits per approach at a
  // combined 26-30 stun, with the grace never once expiring, is a bar that
  // actually fills. So the string opens with a fast light and cancels into the
  // biggest non-knockdown hit the kit owns.
  //
  // Both sets stay derived per fighter (demoStunStringIds): no held direction
  // — a forward light inside grab range proximity-converts into a throw, which
  // awards zero stun — and no knockdown, because a sweep hands the decay the
  // whole 48+16 frame get-up.
  const STUN_LINK_LIMIT = 2;

  function runPressure(directive, view, self, opponent, distance) {
    if (opponent.dizzyFrames > 0) {
      directive.executed = true;
      finishDirective(directive, view, true);
      return null;
    }
    if (opponent.down || opponent.wakeupFrames > 0) {
      // Round 2: standing over a downed victim waiting for the wake-up was
      // pure dead air — pace the range instead so the string looks intended.
      directive.stunLinks = 0;
      return distance > 170 ? towardInput(self, opponent) : rockInput(directive.side, view, 96, 168);
    }
    const table = stunIds[directive.side];
    // THE CANCEL. While our own swing is still on screen and the sim has
    // confirmed it, the next hit goes in as a link rather than a new approach.
    if (self.attacking) {
      const links = directive.stunLinks || 0;
      if (self.attackConnected && links < STUN_LINK_LIMIT) {
        directive.stunLinks = links + 1;
        // Cancel routes key on the action GROUP, so the legal targets are the
        // heavies and the specials — a light cannot cancel into another light.
        const link = beatPress(directive.side, view, table.link);
        if (link) return link;
        directive.stunLinks = STUN_LINK_LIMIT;
      }
      return emptyInput();
    }
    directive.stunLinks = 0;
    // Round 4: a bar one hit from the threshold chases further. The traced
    // failure was a victim drifting from 166 to 235 while the string held its
    // 155px working range and waited for spacing that was never coming back.
    const reach = opponent.stunMeter >= DIZZY_TOPUP_STUN ? 128 : 155;
    if (distance > reach) return towardInput(self, opponent);
    // Round 2: hold the next opener live through our own recovery so it fires
    // the instant the sim frees us (six-frame buffer).
    if (!stageable(self)) return emptyInput();
    // The OPENER is the fastest thing that carries stun: it exists to confirm,
    // and the link behind it is where the points are. Once the bar is within
    // one hit of the threshold the opener is all that is needed, so the string
    // stops reaching for the link and just lands the fastest normal it owns.
    const nearly = opponent.stunMeter >= DIZZY_TOPUP_STUN;
    if (nearly) directive.stunLinks = STUN_LINK_LIMIT;
    return beatPress(directive.side, view, table.topUp)
      || beatPress(directive.side, view, table.build)
      || { ...emptyInput(), light: true };
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
    if (!stageable(self)) return emptyInput();
    // Round 2: the herd used to be one move pressed over and over — measured,
    // driveHeavy accounted for 134 of 877 moves shown across twenty
    // exhibitions and none of them was new coverage. Any big-push swing
    // carries the victim toward the corner, so the string alternates instead
    // of hammering the same key.
    directive.swings = (directive.swings || 0) + 1;
    // Round 4: the herd is the whole job (carry the victim there over several
    // exchanges), so it gets the exchanges. Seven swings was not enough ground
    // to cross a stage from the middle.
    if (directive.swings > 12) {
      finishDirective(directive, view, Boolean(directive.executed), "herdSpent");
      return null;
    }
    // v2.9 round 4 — THE SLAM IS A DIFFERENT MOVE FROM THE HERD, and the old
    // one could never have worked. The herd rotates the least-shown PUSHING
    // entries (so walking the victim to the corner is coverage); the slam has
    // to ARM A WALL BOUNCE, which needs a heavy/special-kind move carrying
    // knockdown / knockdownOnFinal / launchVelocityY. `driveHeavy` — what the
    // old slam pressed, every time — satisfies that on NONE of the nine kits,
    // and its raw carry has bled well under the 220 threshold by the time the
    // clamp sees it. Inside the arming window the derived slam set converts
    // deterministically: the sim sets the victim's carry to 680 and the clamp
    // then always fires spawnWallImpact.
    const gap = pushWallGap(self, opponent, view);
    if (gap <= WALLSPLAT_ARM_GAP && canArmWallBounce(opponent)) {
      const id = beatChoice(directive.side, view, slamIds[directive.side]);
      if (id) {
        // ...and it has to CONNECT. Measured: the slam was pressed from
        // anywhere inside the herd's 215px working distance, which is well
        // outside a sweep's or a launcher's real reach — eleven slam presses
        // in one exhibition produced zero splats. Line the shot up on the
        // chosen move's own derived band first; the corner is not going
        // anywhere while we take the extra step.
        const band = bands[directive.side][id];
        if (band && distance > band.max) return towardInput(self, opponent);
        if (band && distance < band.min) return awayInput(self, opponent);
        const spec = directiveForMove(directive.side, id);
        stats.slamPresses += 1;
        return Object.assign(holdInput(spec, self, opponent), spec.press);
      }
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
    // 5.4 FIGHT NIGHT (sweep #4): the CLINCH tech is pressed while grabbed —
    // the one feed input a fighter that is not actionable can still give.
    if (lane.mode === "tech" && self.grabbed
      && (self.grabbedFrame ?? 0) <= DEFENSE_RULES.clinchTechWindowFrames) {
      return throwPress(self, opponent);
    }
    if (!actionable(self)) return emptyInput();
    const distance = Math.abs(opponent.x - self.x);
    switch (lane.mode) {
      // 5.4 FIGHT NIGHT (sweep #4): the THROW TECH feed walks into reach and
      // answers the grab with a grab of its own — buffered as the throw comes
      // (the 6-frame pre-contact window) and again inside the hold (the
      // 8-frame clinch window, above).
      case "tech":
        if (opponent.attackLevel === "throw") return throwPress(self, opponent);
        if (distance > 92) return towardInput(self, opponent);
        return rockInput(side, view, MIN_SEPARATION + 8, 92, { guard: true });
      // ...and the THROW WHIFF feed holds the commit band, just outside the
      // reach the sim checks at contact, then punishes the tail.
      case "punish": {
        const tail = (opponent.whiffTick >= 0 && view.tick - opponent.whiffTick <= 30)
          || opponent.attackRearmFrames > 0;
        if (tail && !opponent.attacking) {
          const heavy = bands[side].standHeavy || { min: MIN_SEPARATION, max: 150 };
          if (distance > heavy.max) return towardInput(self, opponent);
          return beatPress(side, view, PUNISH_IDS) || { ...emptyInput(), heavy: true };
        }
        if (opponent.attacking) return rockInput(side, view, THROW_WHIFF_RANGE.min + 4, THROW_WHIFF_RANGE.max, { guard: true });
        if (distance > THROW_WHIFF_RANGE.max + 40) return towardInput(self, opponent);
        return rockInput(side, view, THROW_WHIFF_RANGE.min + 8, THROW_WHIFF_RANGE.max + 8);
      }
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
      // 5.4 FIGHT NIGHT: a round end (or a KO mid-plan) drops the live
      // knockdown plan and the footsies window with the lanes.
      if (oki.active) endOki();
      if (neutral.until > 0) endNeutral(view);
      neutral.roundStart = -1;
      neutral.pending = null;
      return null;
    }
    // 5.4 FIGHT NIGHT (sweep #4): a live knockdown plan owns both fighters —
    // the attacker's okizeme (or its walk-off) and the victim's rise — ahead
    // of every lane. It hands each side back the moment its part is over.
    if (oki.active) {
      const scripted = okiInput(side, view);
      traceOki(side, view, scripted ? "oki" : "pipeline", scripted);
      if (scripted) return liveliness(side, view, scripted);
    }
    // 5.4 FIGHT NIGHT (sweep #5): a footsies window refuses both lanes.
    if (neutral.until > view.tick && neutral.plan) {
      if (side === 0) stats.neutralTicks += 1;
      return liveliness(side, view, footsiesInput(side, view));
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
      // 5.4 GRIT POLICY — A FULL BAR PRE-EMPTS THE CHECKLIST the same narrow
      // way the stun bar does: only a plain, unstarted move showcase under
      // twenty ticks old, and only when the item it holds is not already a
      // confirm opener (or the super itself). The restart goes straight to
      // the opener pick — no natural-window roll — so the super lands within
      // a few seconds of the bar filling instead of after the checklist.
      if (!lane.beat && !lane.executed && lane.totalFrames < 20
        && lane.item && lane.item !== "super" && !confirmIds[side].has(lane.item)
        && gritSteerReady(side, view) && !rival.down
        && stageable(view.fighters[side])) {
        const saved = lanes[side];
        lanes[side] = null;
        const opener = maybeStart(side, view, false, true);
        if (opener) {
          stats.gritPreempts += 1;
          return liveliness(side, view, opener);
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
    // floor, a nearly-full stun bar, a cornered victim) claim the stage
    // regardless of the decision gap — and regardless of the yield below,
    // because their window is NOW and it is measured in tens of ticks.
    const momentFirst = maybeStart(side, view, true);
    if (momentFirst) return liveliness(side, view, momentFirst);
    // v2.9 round 4 — YIELD THE STAGE. Measured, seed 1234 match 5 finished
    // with jez on 6 of 30 against ali on 19: he spent the exhibition in
    // hitstun, so `stageable` was false whenever the pipeline looked at him
    // and every directive he did start was abandoned as `punished`. No amount
    // of pick-side tuning reaches that, because the problem is that the OTHER
    // fighter will not stop hitting him. The attract loop is a showcase, not a
    // competition: once one side is running away with it, that side keeps
    // moving and defending but stops spending the stage, which hands the
    // trailing fighter clean actionable ticks to showcase into.
    //
    // Duty-cycled (YIELD_FRAMES on, YIELD_RELEASE_FRAMES off) so a leader can
    // never go passive for a whole round if the trailer genuinely cannot
    // convert, and never entered while a directive is live — this is a
    // decision about what to start next, not an abandonment.
    if (view.tick < yieldUntil[side]) {
      stats.yieldTicks += 1;
      return liveliness(side, view, aliveInput(side, view, {
        attackShare: 0, guardShare: 0.34, allowDash: true,
      }));
    }
    if (view.tick >= yieldReleaseUntil[side] && dominating(side, view)) {
      yieldUntil[side] = view.tick + YIELD_FRAMES;
      yieldReleaseUntil[side] = view.tick + YIELD_FRAMES + YIELD_RELEASE_FRAMES;
      stats.yieldTicks += 1;
      return liveliness(side, view, aliveInput(side, view, {
        attackShare: 0, guardShare: 0.34, allowDash: true,
      }));
    }
    // The trailing side has no decision gap at all: every tick it is free is a
    // tick it needs.
    if (view.tick < nextDecision[side] && !trailing(side, view)) {
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
        // v2.9 round 4: the air row and the two spectacle tables this fighter
        // is actually working from, so a probe can tell "never picked" from
        // "picked and refused" without re-deriving the kit data.
        airRow: airIds[entry.side].filter((id) => entry.moves[id] === 0),
        slamIds: [...slamIds[entry.side]],
        stunBuildIds: [...stunIds[entry.side].build],
        // 5.4 GRIT POLICY: the confirm openers this fighter spends a full bar
        // through (see demoSuperConfirmIds).
        superConfirmIds: [...confirmIds[entry.side]],
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
    stats: () => ({
      ...stats,
      itemPicks: { ...itemPicks },
      neutralBy: { ...stats.neutralBy },
      neutralReads: { ...stats.neutralReads },
      okiPlans: { ...stats.okiPlans },
      okiOptions: { ...stats.okiOptions },
      okiRises: { ...stats.okiRises },
      okiGuesses: { ...stats.okiGuesses },
      okiAnswers: { ...stats.okiAnswers },
      // 5.4 FIGHT NIGHT: the round's own neutral share so far, and the live
      // window / knockdown plan (reporting only).
      neutralShare: neutral.roundTicks ? neutral.freeTicks / neutral.roundTicks : 0,
      neutralLive: neutral.until > clock,
      okiLive: oki.active ? {
        kind: oki.plan.kind, option: oki.plan.option || null, rise: oki.plan.rise || null,
        guess: oki.plan.guess || null, answer: oki.plan.answer || null,
        attacker: oki.attacker, elapsed: oki.elapsed, pressAt: oki.pressAt, pressed: oki.pressed,
        attackerDone: oki.attackerDone, victimDone: oki.victimDone, punished: oki.punished,
      } : null,
      personas: profiles.map((profile) => profile.persona),
      okiTrace: okiTrace.slice(-400),
    }),
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
    // 5.4 SESSION LAYER: the story this exhibition was built on (read-only).
    story: () => (story ? { id: story.id, showboatSide, yield: yieldTolerance.map((t) => (t ? { ...t } : null)) } : null),
  });
}
