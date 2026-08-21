import assert from "node:assert/strict";
import {
  ARCADE_TUNING,
  BASE_MOVES,
  DeterministicRng,
  FIGHTER_STATES,
  FixedStepClock,
  FrameInputBuffer,
  SIMULATION_HZ,
  createAttackInstance,
  hashSeed,
  transitionFighterState,
} from "../engine/foundation.mjs";

function testFixedClock() {
  const clock = new FixedStepClock({ maxCatchUpSteps: 12 });
  const ticks = [];
  for (let frame = 0; frame < 120; frame += 1) {
    clock.advance(1 / 120, (_dt, tick) => ticks.push(tick));
  }
  assert.equal(clock.tick, SIMULATION_HZ);
  assert.equal(ticks.length, SIMULATION_HZ);
  assert.deepEqual(ticks, Array.from({ length: SIMULATION_HZ }, (_, index) => index + 1));

  const hitchClock = new FixedStepClock({ maxCatchUpSteps: 4 });
  const result = hitchClock.advance(1, () => {});
  assert.equal(result.steps, 4);
  assert.ok(result.droppedSeconds > 0.9);
}

function testInputBuffer() {
  const buffer = new FrameInputBuffer(6);
  buffer.push("light", 10);
  assert.equal(buffer.has("light", 16), true);
  assert.equal(buffer.consume(["special", "light"], 16)?.action, "light");
  assert.equal(buffer.consume("light", 16), null);

  buffer.push("heavy", 20);
  assert.equal(buffer.has("heavy", 27), false);
  buffer.push("light", 30);
  buffer.push("special", 30);
  assert.equal(buffer.consume(["special", "light"], 31)?.action, "special");
  assert.equal(buffer.consume(["special", "light"], 31)?.action, "light");
}

function testRng() {
  const seed = hashSeed("deathblow", "jez", 1);
  const first = new DeterministicRng(seed);
  const second = new DeterministicRng(seed);
  const sequence = Array.from({ length: 12 }, () => first.nextUint32());
  assert.deepEqual(sequence, Array.from({ length: 12 }, () => second.nextUint32()));

  const saved = first.getState();
  const expected = first.nextUint32();
  first.setState(saved);
  assert.equal(first.nextUint32(), expected);
}

function testMoveGrammar() {
  assert.deepEqual(Object.keys(BASE_MOVES), ["light", "heavy", "special", "throw"]);
  const heavy = createAttackInstance("heavy");
  // Arcade tuning stretches recovery and damage; startup and active are authored.
  assert.equal(heavy.recoveryFrames, Math.round(BASE_MOVES.heavy.recoveryFrames * ARCADE_TUNING.recovery.heavy));
  assert.equal(heavy.totalFrames, BASE_MOVES.heavy.startupFrames + BASE_MOVES.heavy.activeFrames + heavy.recoveryFrames);
  assert.equal(heavy.activeStartFrame, 12);
  assert.equal(heavy.activeEndFrame, 20);
  assert.ok(heavy.damage > BASE_MOVES.heavy.damage, "individual hits land harder than the authored base");
  assert.ok(heavy.recoveryFrames > BASE_MOVES.heavy.recoveryFrames, "a whiffed heavy leaves a punish window");
  assert.ok(heavy.duration > 0.6 && heavy.duration < 0.66);
  assert.throws(() => createAttackInstance("missing"), /Unknown move kind/);
  const grapple = createAttackInstance("throw");
  assert.equal(grapple.recoveryFrames, Math.round(BASE_MOVES.throw.recoveryFrames * ARCADE_TUNING.recovery.throw));
  assert.equal(grapple.totalFrames, BASE_MOVES.throw.startupFrames + BASE_MOVES.throw.activeFrames + grapple.recoveryFrames);
  assert.equal(grapple.activeStartFrame, 5);
  const light = createAttackInstance("light");
  assert.ok(light.recoveryFrames <= heavy.recoveryFrames - 6, "light pokes stay fast so neutral rewards spacing");
}

function testStateMachine() {
  const fighter = { combatState: FIGHTER_STATES.IDLE, stateFrame: 0 };
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.ATTACK, 3), true);
  assert.equal(fighter.previousCombatState, FIGHTER_STATES.IDLE);
  assert.equal(fighter.stateEnteredTick, 3);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.ATTACK, 4), false);
  assert.equal(fighter.stateFrame, 1);
  transitionFighterState(fighter, FIGHTER_STATES.DOWN, 5);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.ATTACK, 6), false);
  assert.equal(fighter.combatState, FIGHTER_STATES.DOWN);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.ATTACK, 6, { force: true }), true);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.THROW_TECH, 7), true);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.IDLE, 8), true);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.DASH, 9), true);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.HITSTUN, 10), true);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.KNOCKDOWN, 11), true);
  assert.equal(transitionFighterState(fighter, FIGHTER_STATES.WAKEUP, 12), true);
}

testFixedClock();
testInputBuffer();
testRng();
testMoveGrammar();
testStateMachine();

console.log("Final Blow foundation tests passed");
