export const TRAINING_DUMMY_MODES = Object.freeze(["stand", "guard", "crouch", "jump", "cpu"]);

export function createTrainingState(overrides = {}) {
  return {
    dummyMode: TRAINING_DUMMY_MODES.includes(overrides.dummyMode) ? overrides.dummyMode : "stand",
    autoRecover: overrides.autoRecover !== false,
    infiniteGrit: overrides.infiniteGrit !== false,
    resets: Number.isInteger(overrides.resets) ? Math.max(0, overrides.resets) : 0,
    lastDamage: Number.isFinite(overrides.lastDamage) ? Math.max(0, overrides.lastDamage) : 0,
    lastResult: typeof overrides.lastResult === "string" ? overrides.lastResult : "",
    lastMove: overrides.lastMove && typeof overrides.lastMove === "object" ? { ...overrides.lastMove } : null,
    lastAdvantage: Number.isFinite(overrides.lastAdvantage) ? overrides.lastAdvantage : null,
    inputHistory: Array.isArray(overrides.inputHistory) ? overrides.inputHistory.slice(-8) : [],
    lastInputLabel: typeof overrides.lastInputLabel === "string" ? overrides.lastInputLabel : "",
    lastInputFrame: Number.isInteger(overrides.lastInputFrame) ? overrides.lastInputFrame : -Infinity,
  };
}

export function trainingDummyInput(training, frame, observation = {}) {
  const empty = {
    left: false, right: false, down: false, guard: false, jump: false,
    light: false, heavy: false, special: false, enhanced: false, throw: false,
    super: false, final: false,
  };
  if (training.dummyMode === "cpu") return null;
  if (training.dummyMode === "crouch") empty.down = true;
  if (training.dummyMode === "guard") {
    empty.guard = true;
    empty.down = observation.attackLevel === "low";
  }
  if (training.dummyMode === "jump" && frame % 90 === 0) empty.jump = true;
  return empty;
}

export function trainingSnapshot(training) {
  return {
    dummyMode: training.dummyMode,
    autoRecover: training.autoRecover,
    infiniteGrit: training.infiniteGrit,
    resets: training.resets,
    lastDamage: training.lastDamage,
    lastResult: training.lastResult,
    lastMove: training.lastMove ? { ...training.lastMove } : null,
    lastAdvantage: training.lastAdvantage,
    inputHistory: [...training.inputHistory],
  };
}
