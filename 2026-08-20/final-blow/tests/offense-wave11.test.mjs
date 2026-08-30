import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACK_LEVELS,
  COMBAT_MOVE_PROFILES,
  COLLISION_RULES,
  MOVEMENT_RULES,
  TAUNT_RULES,
  WALL_BOUNCE_RULES,
  createCombatMove,
  createOffenseFighterFields,
  deriveKickProfile,
  qualifiesForWallBounce,
  resolveKickVariant,
} from "../engine/defense.mjs";
import { COMBO_RULES, GRIT_RULES } from "../engine/combos.mjs";
import {
  FIGHTER_KITS,
  FORWARD_KICK_STYLES,
  getKitMoveProfile,
  listFighterMoves,
  recognizeFighterCommand,
  selectKitMoveKey,
} from "../engine/fighter-kits.mjs";
import {
  ENHANCED_THROWABLE_COMMAND,
  FIGHTER_THROWABLES,
  THROWABLE_IDS,
  createThrowObjectMove,
} from "../engine/throwables.mjs";
import {
  ENHANCED_GRIT_COST,
  resolveFourButtonInput,
} from "../engine/controls.mjs";
import {
  NET_INPUT,
  bitsToInput,
  checksumState,
  inputToBits,
  parseRollbackState,
  serializeRollbackState,
} from "../engine/rollback.mjs";
import {
  AI_DIFFICULTIES,
  decideAiIntent,
  createAiBrain,
  visibleOpponentObservation,
} from "../engine/ai.mjs";
import { FIGHTER_TAUNT_LINES, FIGHTER_AUDIO_IDS } from "../engine/fighter-audio.mjs";

const FIGHTER_IDS = Object.keys(FIGHTER_KITS);

// ---------------------------------------------------------------------------
// Release 1.7 wave 11 — corner wall-bounce
// ---------------------------------------------------------------------------

test("wall bounce only converts knockdown-class heavies and specials", () => {
  // Qualifying: knockdown heavies/specials and launchers, never lights,
  // throws or supers — the spec's "knockdown-class heavy/special" exactly.
  assert.equal(qualifiesForWallBounce(createCombatMove("heavy", { crouching: true })), true, "the sweep qualifies");
  assert.equal(qualifiesForWallBounce({ kind: "special", level: ATTACK_LEVELS.MID, knockdown: true }), true);
  assert.equal(qualifiesForWallBounce({ kind: "special", level: ATTACK_LEVELS.MID, knockdownOnFinal: true }), true);
  assert.equal(qualifiesForWallBounce({ kind: "heavy", level: ATTACK_LEVELS.MID, launchVelocityY: -560 }), true, "launchers qualify");
  assert.equal(qualifiesForWallBounce(createCombatMove("light")), false, "lights never bounce");
  assert.equal(qualifiesForWallBounce({ kind: "heavy", level: ATTACK_LEVELS.MID }), false, "non-knockdown heavies never bounce");
  assert.equal(qualifiesForWallBounce({ kind: "special", level: ATTACK_LEVELS.THROW, knockdown: true }), false, "command throws never bounce");
  assert.equal(qualifiesForWallBounce({ kind: "special", level: ATTACK_LEVELS.MID, knockdown: true, superMove: true }), false, "supers never bounce");
  assert.equal(qualifiesForWallBounce(null), false);

  // Rule shape: the rebound pops up and away, the splat freeze is a real but
  // brief beat, and the rebound hitstun makes the conversion window real.
  assert.ok(WALL_BOUNCE_RULES.reboundVelocityX > 0);
  assert.ok(WALL_BOUNCE_RULES.reboundVelocityY < 0, "the rebound must lift");
  assert.ok(WALL_BOUNCE_RULES.splatFreezeSeconds > 0 && WALL_BOUNCE_RULES.splatFreezeSeconds <= 0.16);
  assert.ok(WALL_BOUNCE_RULES.hitstunFrames >= 18 && WALL_BOUNCE_RULES.hitstunFrames <= 34);
  assert.ok(WALL_BOUNCE_RULES.proximityBodyWidths <= 1, "arming stays a genuine corner situation");
  // The rebound pop must stay below the cross-up clearance so a bounce can
  // never fake a side switch by itself.
  assert.ok(Math.abs(WALL_BOUNCE_RULES.reboundVelocityY) < 815, "smaller than a jump impulse");
  assert.ok(COLLISION_RULES.crossupClearance > 0);

  // The once-per-combo + juggle-point contract: with juggleLimit 2, a bounce
  // (one point) leaves exactly one juggle conversion before the cap.
  assert.equal(COMBO_RULES.juggleLimit, 2, "the wave-11 bounce is tuned against juggleLimit 2");
});

test("the wall-bounce combo grace holds a combo open only while granted", async () => {
  const { ComboTracker } = await import("../engine/combos.mjs");
  // Without a grace, a rebound-arc gap (45 > resetGapFrames) starts a new combo.
  const plain = new ComboTracker();
  plain.registerHit(10);
  assert.equal(plain.registerHit(55).hitNumber, 1, "no grace: the gap resets as before");
  // With the wall-bounce grace granted by the sim, the same gap continues the
  // combo — and scales it as hit two, which is strictly less damage than the
  // fresh-combo hit the reset used to give.
  const graced = new ComboTracker();
  graced.registerHit(10);
  graced.graceUntilFrame = 10 + WALL_BOUNCE_RULES.comboGraceFrames;
  for (let frame = 11; frame < 55; frame += 1) graced.tick(frame, true);
  const followup = graced.registerHit(55);
  assert.equal(followup.hitNumber, 2, "the bounce conversion counts as the same combo");
  assert.ok(followup.damageScale < 1, "and scales down instead of resetting to full");
  // The grace expires: a hit past it resets normally.
  assert.equal(graced.registerHit(200).hitNumber, 1);
  assert.ok(WALL_BOUNCE_RULES.comboGraceFrames > COMBO_RULES.resetGapFrames, "the grace must actually cover the arc");
  assert.ok(WALL_BOUNCE_RULES.comboGraceFrames <= 90, "but stays a bounded set-piece window");
  // The reset clears it, so no ordinary combo ever inherits a stale grace.
  graced.reset();
  assert.equal(graced.graceUntilFrame, -Infinity);
});

// ---------------------------------------------------------------------------
// Release 1.7 wave 11 — punishable taunt
// ---------------------------------------------------------------------------

test("taunt rules: ~45 vulnerable frames, +8 Grit, deliberate double-tap windows", () => {
  assert.ok(TAUNT_RULES.durationFrames >= 40 && TAUNT_RULES.durationFrames <= 50, "~45 frames per the spec");
  assert.equal(TAUNT_RULES.gritBonus, 8);
  assert.ok(TAUNT_RULES.gritBonus < GRIT_RULES.enhancedSpecialCost, "a taunt can never fund an EX by itself");
  assert.ok(TAUNT_RULES.doubleTapWindowFrames >= 6 && TAUNT_RULES.doubleTapWindowFrames <= MOVEMENT_RULES.dashTapWindowFrames,
    "the double tap is as deliberate as a dash");
  assert.ok(TAUNT_RULES.armFrames > 0 && TAUNT_RULES.armFrames <= 20, "the chord must follow promptly");
  assert.ok(TAUNT_RULES.voiceLines >= 3, "rotating lines need a real rotation");
});

test("taunt chord encodes as light+heavy+kick using only existing input bits", () => {
  const raw = { fourButton: true, lk: true, hkHeld: true };
  // Armed: the chord becomes the taunt at ANY meter, even zero.
  const taunt = resolveFourButtonInput(raw, { meter: 0, tauntArmed: true });
  assert.equal(taunt.taunt, true);
  assert.equal(taunt.light && taunt.heavy, true, "the wire encoding is light+heavy");
  assert.equal(taunt.limb, "kick");
  const rich = resolveFourButtonInput(raw, { meter: 100, tauntArmed: true });
  assert.equal(rich.taunt, true, "the armed chord outranks the EX read");
  assert.equal(rich.enhanced, false);

  // Unarmed: exactly the pre-wave-11 behaviour.
  const ex = resolveFourButtonInput(raw, { meter: ENHANCED_GRIT_COST, tauntArmed: false });
  assert.equal(ex.enhanced, true);
  assert.equal(Boolean(ex.taunt), false);
  const poor = resolveFourButtonInput(raw, { meter: 0, tauntArmed: false });
  assert.equal(poor.light || poor.heavy, true, "a meterless chord still degrades to a normal");
  assert.equal(Boolean(poor.taunt), false);
  assert.ok(!(poor.light && poor.heavy), "no other resolution ever raises light and heavy together");

  // The punch chord never taunts — the command is strictly LK&HK.
  const punchChord = resolveFourButtonInput({ fourButton: true, lp: true, hpHeld: true }, { meter: 0, tauntArmed: true });
  assert.equal(Boolean(punchChord.taunt), false);

  // Round-trip through the UNCHANGED 16-bit protocol: the taunt encoding uses
  // only LIGHT|HEAVY|KICK, and no field of NET_INPUT was added for it.
  const bits = inputToBits(taunt);
  assert.equal(bits, NET_INPUT.LIGHT | NET_INPUT.HEAVY | NET_INPUT.KICK);
  const decoded = bitsToInput(bits);
  assert.equal(decoded.light && decoded.heavy, true);
  assert.equal(decoded.limb, "kick");
  assert.equal(Object.keys(NET_INPUT).length, 14, "no new input bits");
});

test("every fighter has three authored taunt lines for the rng rotation", () => {
  // Wave 16: the Commissioner's taunt bank rides the same positional contract.
  // Wave 17: so does the Devil's.
  assert.deepEqual(Object.keys(FIGHTER_TAUNT_LINES).sort(), [...FIGHTER_AUDIO_IDS, "commissioner", "devil"].sort());
  for (const [fighterId, lines] of Object.entries(FIGHTER_TAUNT_LINES)) {
    assert.equal(lines.length, TAUNT_RULES.voiceLines, `${fighterId} authors a full rotation`);
    assert.equal(new Set(lines).size, lines.length, `${fighterId} lines are distinct`);
    for (const line of lines) assert.ok(line.length >= 6, `${fighterId} lines are real lines`);
  }
});

// ---------------------------------------------------------------------------
// Release 1.7 wave 11 — EX personal throwables
// ---------------------------------------------------------------------------

test("all eight throwables author an EX tier with visibly different flight data", () => {
  for (const fighterId of THROWABLE_IDS) {
    const profile = FIGHTER_THROWABLES[fighterId];
    const ex = profile.variants?.ex;
    assert.ok(ex, `${fighterId} authors an EX variant`);
    assert.ok(ex.name && ex.name !== profile.name, `${fighterId} EX has its own name`);
    // Visibly different projectile data: at least one core flight field moves.
    const changed = ["speed", "damage", "launchY", "gravity", "bounces", "hazardFrames",
      "hazardWidth", "slowFrames", "staggerFrames", "hitstunFrames", "width", "knockdown", "lifeFrames"]
      .some((field) => field in ex && ex[field] !== profile[field]);
    assert.ok(changed || ex.extraSpawns || ex.tether, `${fighterId} EX must change the flight`);
    // Balance conservatism: EX damage never doubles the base object.
    const damage = ex.damage ?? profile.damage;
    assert.ok(damage <= profile.damage * 2, `${fighterId} EX damage stays conservative`);
  }
  // The spec's marquee behaviours are data, exactly as authored.
  assert.equal(FIGHTER_THROWABLES.deathblow.variants.ex.extraSpawns.length, 1, "pizza splits into two slices");
  assert.equal(FIGHTER_THROWABLES.jez.variants.ex.tether.launch, true, "the EX mouse reels into a launcher");
  assert.ok(FIGHTER_THROWABLES.alan.variants.ex.hazardFrames > 0, "the EX loogie leaves a floor splat");
  assert.ok(FIGHTER_THROWABLES.alan.variants.ex.slowFrames > 0, "the floor splat slows");
  assert.equal(FIGHTER_THROWABLES.donald.variants.ex.bounces, 1, "the EX golf ball bounces once");
  assert.ok(FIGHTER_THROWABLES.cyraxx.variants.ex.hazardFrames > FIGHTER_THROWABLES.cyraxx.hazardFrames,
    "the EX bed-bug swarm lingers longer");
});

test("the EX throw move costs enhancedSpecialCost and the base throw stays free", () => {
  for (const fighterId of THROWABLE_IDS) {
    const base = createThrowObjectMove(fighterId);
    const ex = createThrowObjectMove(fighterId, { enhanced: true });
    assert.ok(base && ex, `${fighterId} builds both tiers`);
    assert.equal(base.gritCost, 0);
    assert.equal(base.enhancedThrowable, false);
    assert.equal(ex.gritCost, GRIT_RULES.enhancedSpecialCost);
    assert.equal(ex.enhancedThrowable, true);
    assert.equal(ex.throwableVariant, "ex");
    assert.equal(ex.command, ENHANCED_THROWABLE_COMMAND.display);
    assert.notEqual(ex.moveName, base.moveName, `${fighterId} EX shows its own name`);
    // Same wind-up commitment: the EX buys flight data, not startup.
    assert.equal(ex.startupFrames, base.startupFrames);
    assert.equal(ex.recoveryFrames, base.recoveryFrames);
  }
});

test("the down-back chord splits by limb: kick = EX throwable, punch = EX back special", () => {
  const history = [
    { token: "down", frame: 100 },
    { token: "back", frame: 104 },
    { token: "enhanced", frame: 108 },
  ];
  const kick = recognizeFighterCommand("jez", history, 109, { limb: "kick" });
  assert.equal(kick?.action, "enhancedThrowObject");
  const punch = recognizeFighterCommand("jez", history, 109, { limb: "punch" });
  assert.equal(punch?.action, "enhancedBackSpecial");
  // Legacy callers that pass no limb keep the pre-wave-11 result.
  const legacy = recognizeFighterCommand("jez", history, 109);
  assert.equal(legacy?.action, "enhancedBackSpecial");
  // The other EX motions are limb-agnostic, exactly as before.
  const qcf = [
    { token: "down", frame: 100 },
    { token: "forward", frame: 104 },
    { token: "enhanced", frame: 108 },
  ];
  assert.equal(recognizeFighterCommand("jez", qcf, 109, { limb: "kick" })?.action, "enhancedCommandSpecial");
});

// ---------------------------------------------------------------------------
// Release 1.7 wave 11 — forward command kicks via the derive table
// ---------------------------------------------------------------------------

test("forward+kick routes to the derived command kicks in every stance that allows it", () => {
  assert.equal(selectKitMoveKey("light", { limb: "kick", forwardHeld: true }), "forwardLightKick");
  assert.equal(selectKitMoveKey("heavy", { limb: "kick", forwardHeld: true }), "forwardHeavyKick");
  // Crouching and airborne routing is untouched — down-forward stays the
  // crouch kick, exactly like the punches.
  assert.equal(selectKitMoveKey("light", { limb: "kick", forwardHeld: true, crouching: true }), "crouchLightKick");
  assert.equal(selectKitMoveKey("heavy", { limb: "kick", forwardHeld: true, crouching: true }), "crouchHeavyKick");
  assert.equal(selectKitMoveKey("heavy", { limb: "kick", forwardHeld: true, airborne: true }), "airHeavyKick");
  // Without forward the standing kicks are unchanged.
  assert.equal(selectKitMoveKey("light", { limb: "kick" }), "standLightKick");
  assert.equal(selectKitMoveKey("heavy", { limb: "kick" }), "standHeavyKick");
  // Punch routing is untouched.
  assert.equal(selectKitMoveKey("light", { forwardHeld: true }), "forwardLight");
  assert.equal(selectKitMoveKey("heavy", { forwardHeld: true }), "overhead");
});

test("sixteen personality command kicks derive from each fighter's authored punches", () => {
  const context = { limb: "kick", forwardHeld: true };
  const knees = [];
  const heavies = [];
  for (const fighterId of FIGHTER_IDS) {
    const kit = FIGHTER_KITS[fighterId];
    const knee = getKitMoveProfile(fighterId, "light", context);
    const heavy = getKitMoveProfile(fighterId, "heavy", context);
    assert.ok(knee && heavy, `${fighterId} has both forward kicks`);
    knees.push(knee);
    heavies.push(heavy);

    // The step knee advances with the fighter's own forwardLight personality.
    assert.equal(knee.moveName, "STEP KNEE");
    assert.equal(knee.limb, "kick");
    assert.ok(knee.advanceSpeed > 0, `${fighterId} knee advances`);
    assert.ok(knee.id.endsWith("-step-knee"));
    assert.ok(knee.id.startsWith(kit.moves.forwardLight.id), "derived from the authored forwardLight");
    assert.ok(knee.startupFrames > kit.moves.forwardLight.startupFrames, "kicks start slower than the source punch");

    // Forward+HK follows the authored archetype flavour.
    const style = FORWARD_KICK_STYLES[fighterId];
    assert.ok(style === "axe" || style === "slide", `${fighterId} has a flavour`);
    if (style === "axe") {
      assert.equal(heavy.moveName, "AXE KICK");
      assert.equal(heavy.level, ATTACK_LEVELS.OVERHEAD);
      assert.ok(heavy.id.startsWith(kit.moves.overhead.id), "axe derives from the authored overhead");
      assert.ok(heavy.range > kit.moves.overhead.range, "the axe outreaches the punch overhead");
      assert.ok(heavy.startupFrames > kit.moves.overhead.startupFrames, "and starts slower");
    } else {
      assert.equal(heavy.moveName, "SLIDE KICK");
      assert.equal(heavy.level, ATTACK_LEVELS.LOW);
      assert.equal(heavy.knockdown, true, "the slide is a knockdown low");
      assert.ok(heavy.advanceSpeed > 0, "the slide travels");
      assert.ok(heavy.id.startsWith(kit.moves.crouchHeavy.id), "slide derives from the authored sweep");
      assert.ok(heavy.recoveryFrames > kit.moves.crouchHeavy.recoveryFrames, "clearly punishable on block");
      assert.ok(heavy.range < kit.moves.crouchHeavy.range, "shorter than the anchored sweep");
    }
  }
  // Personality survives the derivation: the sixteen normals are not clones.
  assert.equal(new Set(knees.map((move) => move.id)).size, FIGHTER_IDS.length);
  assert.equal(new Set(heavies.map((move) => move.id)).size, FIGHTER_IDS.length);
  assert.ok(new Set(knees.map((move) => `${move.startupFrames}:${move.range}:${move.damage}`)).size >= 4,
    "step-knee frame data varies across the roster");
  assert.ok(new Set(heavies.map((move) => `${move.startupFrames}:${move.range}:${move.damage}`)).size >= 4,
    "forward heavy kick frame data varies across the roster");
  // Both flavours actually ship.
  const styles = new Set(Object.values(FORWARD_KICK_STYLES));
  assert.deepEqual([...styles].sort(), ["axe", "slide"]);

  // The derive machinery itself honours the flavour switch.
  const axe = resolveKickVariant("forwardHeavyKick");
  const slide = resolveKickVariant("forwardHeavyKick", "slide");
  assert.equal(axe.level, ATTACK_LEVELS.OVERHEAD);
  assert.equal(slide.level, ATTACK_LEVELS.LOW);
  assert.notEqual(axe.source, slide.source);
  assert.equal(deriveKickProfile(null, "forwardHeavyKick"), null);

  // And the moves surface in the move list for every fighter.
  for (const fighterId of FIGHTER_IDS) {
    const list = listFighterMoves(fighterId);
    assert.ok(list.some((move) => move.command === "→ + LK"), `${fighterId} lists the step knee`);
    assert.ok(list.some((move) => move.command.startsWith("→ + HK")), `${fighterId} lists the forward heavy kick`);
    assert.ok(list.some((move) => move.command.includes("↓ ← + LK&HK")), `${fighterId} lists the EX throwable`);
  }
});

test("generic fallback profiles carry the same forward kicks", () => {
  assert.ok(COMBAT_MOVE_PROFILES.forwardLight, "the generic derive source exists");
  assert.equal(COMBAT_MOVE_PROFILES.forwardLightKick.moveName, "STEP KNEE");
  assert.equal(COMBAT_MOVE_PROFILES.forwardHeavyKick.moveName, "AXE KICK");
  assert.equal(COMBAT_MOVE_PROFILES.forwardHeavyKick.level, ATTACK_LEVELS.OVERHEAD);
  assert.ok(COMBAT_MOVE_PROFILES.forwardLightKick.advanceSpeed > 0);
});

// ---------------------------------------------------------------------------
// Release 1.7 wave 11 — CPU parity
// ---------------------------------------------------------------------------

test("cpu taunts only at safe knockdowns, shaped by difficulty, never Passive", () => {
  const chances = ["passive", "rookie", "street", "pro", "final"].map((id) => AI_DIFFICULTIES[id].tauntChance);
  assert.equal(chances[0], 0, "Passive never taunts");
  assert.ok(chances[1] > chances[2] && chances[2] > chances[3] && chances[3] > chances[4],
    "lower difficulties taunt more");
  assert.ok(chances[4] > 0, "even FINAL disrespects occasionally");
  assert.ok(chances[1] <= 0.5, "no difficulty taunts most decisions");

  const self = {
    id: "jez", kitId: "jez", x: 400, y: 600, grounded: true, meter: 0, health: 100,
    down: false, knockdownFrames: 0, wakeupFrames: 0, justWoke: false,
    pendingKnockdown: false, airTechArmed: false, attacking: null,
    attackConnected: "", attackHits: 0, attackSerial: 0,
  };
  const downedFar = visibleOpponentObservation({
    x: 700, y: 600, grounded: true, down: true, wakeupFrames: 0,
    attacking: null, health: 60, meter: 0,
  }, 0);
  const rookie = createAiBrain("rookie");
  let tauntRoll = -1;
  for (let index = 1; index < 1000; index += 1) {
    const roll = index / 1000;
    if (decideAiIntent(rookie, { frame: 10, self, observation: downedFar, roll }).reason === "taunt") {
      tauntRoll = roll;
      break;
    }
  }
  assert.ok(tauntRoll > 0, "a rookie brain finds a taunt roll after a knockdown");
  const intent = decideAiIntent(rookie, { frame: 10, self, observation: downedFar, roll: tauntRoll });
  assert.equal(intent.action, "taunt");

  // The same roll against a Passive brain produces the inert intent.
  const passive = createAiBrain("passive");
  assert.equal(decideAiIntent(passive, { frame: 10, self, observation: downedFar, roll: tauntRoll }).action, null);

  // Point blank over the body, the CPU never taunts — the spacing gate holds.
  const downedClose = visibleOpponentObservation({
    x: 480, y: 600, grounded: true, down: true, wakeupFrames: 0,
    attacking: null, health: 60, meter: 0,
  }, 0);
  assert.notEqual(decideAiIntent(rookie, { frame: 12, self, observation: downedClose, roll: tauntRoll }).reason, "taunt");
});

// ---------------------------------------------------------------------------
// Release 1.7 wave 11 — rollback round-trip for every new gameplay field
// ---------------------------------------------------------------------------

test("every wave-11 offense fighter field round-trips the rollback snapshot machinery", () => {
  const fields = createOffenseFighterFields();
  const names = Object.keys(fields);
  assert.deepEqual(names.sort(), [
    "downTapHeld",
    "downTapLastTick",
    "tauntArmedUntilTick",
    "tauntFrames",
    "tauntGritGranted",
    "tauntLine",
    "tauntTotalFrames",
    "wallBounceArmed",
    "wallBounceUsed",
  ]);
  // Plain data only, so the fighter snapshot (structuredClone of every
  // enumerable non-reference field) captures and restores each one.
  for (const [name, value] of Object.entries(fields)) {
    assert.ok(["number", "boolean"].includes(typeof value), `${name} must be plain data`);
  }

  // Mid-fight values, including the -Infinity sentinels the tap tracker uses.
  const live = {
    wallBounceArmed: -1,
    wallBounceUsed: true,
    tauntFrames: 31,
    tauntTotalFrames: TAUNT_RULES.durationFrames,
    tauntGritGranted: true,
    tauntLine: 2,
    downTapHeld: true,
    downTapLastTick: 4211,
    tauntArmedUntilTick: 4223,
  };
  assert.deepEqual(Object.keys(live).sort(), names.sort(), "the live sample covers every field");

  for (const [name, mutated] of Object.entries(live)) {
    const fighter = createOffenseFighterFields();
    const snapshot = structuredClone(fighter);
    fighter[name] = mutated;
    assert.notDeepEqual(fighter[name], snapshot[name], `${name}: the mutation must be observable`);
    Object.assign(fighter, structuredClone(snapshot));
    assert.deepEqual(fighter, createOffenseFighterFields(), `${name}: restore must return the pre-mutation value`);
  }

  // The rollback transport preserves every field — including the -Infinity
  // sentinels — bit for bit.
  const defaults = createOffenseFighterFields();
  const overWire = parseRollbackState(serializeRollbackState(defaults));
  assert.deepEqual(overWire, defaults, "defaults survive serialize/parse");
  assert.equal(overWire.downTapLastTick, -Infinity);
  assert.equal(overWire.tauntArmedUntilTick, -Infinity);
  const liveOverWire = parseRollbackState(serializeRollbackState(live));
  assert.deepEqual(liveOverWire, live, "live values survive serialize/parse");

  // Checksum visibility: any single-field desync must change the checksum.
  const baseline = checksumState(defaults);
  for (const [name, mutated] of Object.entries(live)) {
    const changed = { ...createOffenseFighterFields(), [name]: mutated };
    assert.notEqual(checksumState(changed), baseline, `${name} must be checksum-visible`);
  }
});

test("online encoding: resolved four-button input carries attack bits; raw does not", () => {
  // The online tick must resolve raw four-button reads before inputToBits —
  // the raw object encodes zero attack buttons (the 1.9 regression fix).
  const rawBits = inputToBits({ fourButton: true, lk: true });
  assert.equal(rawBits & NET_INPUT.LIGHT, 0, "raw lk must NOT set LIGHT (documents why resolution is mandatory)");
  const resolved = resolveFourButtonInput({ lk: true });
  const bits = inputToBits(resolved);
  assert.ok(bits & NET_INPUT.LIGHT, "resolved light kick sets LIGHT");
  assert.ok(bits & NET_INPUT.KICK, "resolved light kick sets KICK limb");
  const heavy = inputToBits(resolveFourButtonInput({ hp: true }));
  assert.ok(heavy & NET_INPUT.HEAVY, "resolved heavy punch sets HEAVY");
  assert.equal(heavy & NET_INPUT.KICK, 0, "punch limb leaves KICK clear");
  const taunt = inputToBits(resolveFourButtonInput({ lk: true, hkHeld: true }, { tauntArmed: true }));
  assert.ok((taunt & NET_INPUT.LIGHT) && (taunt & NET_INPUT.HEAVY) && (taunt & NET_INPUT.KICK),
    "taunt resolves to the light+heavy+kick wire encoding");
});
