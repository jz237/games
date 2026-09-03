import { DeterministicRng, hashSeed } from "./foundation.mjs";

export const DEMO_IDLE_DELAY_MS = 45_000;
export const DEMO_RESULT_HOLD_MS = 5_000;
import { registerAiDifficulty, resolveAiSettings } from "./ai.mjs";

// 4.3 DEMO SPACING: the attract-mode CPUs fight on a PRO brain with every kit
// range widened 1.6x and the mid-band pokes thinned, so the two never sit in
// a permanent clinch and each move can be read from the couch.
export const DEMO_AI_DIFFICULTY = "demo";
registerAiDifficulty(DEMO_AI_DIFFICULTY, {
  ...resolveAiSettings("pro"),
  label: "DEMO",
  spacing: 1.6,
  patience: 0.55,
  decisionFrames: 12,
  comboChance: 0.3,
  throwChance: 0.08,
  grabPressureChance: 0.1,
});

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

function shuffled(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng.nextFloat() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

// Exported for the survival "Gauntlet" ladder (engine/modes.mjs), which reuses
// the exact demo shuffle-bag discipline: never repeat the previous draw first.
export function refillBag(values, rng, previous, key = (value) => value) {
  const bag = shuffled(values, rng);
  if (bag.length > 1 && previous !== null && key(bag[0]) === key(previous)) {
    const different = bag.findIndex((value) => key(value) !== key(previous));
    if (different > 0) [bag[0], bag[different]] = [bag[different], bag[0]];
  }
  return bag;
}

export function demoMatchupKey(first, second) {
  return [String(first), String(second)].sort().join("::");
}

export function createDemoDirector({ fighterIds, stageIds, trackCount = 0, seed = 237 } = {}) {
  const fighters = uniqueStrings(fighterIds);
  const stages = uniqueStrings(stageIds);
  const tracks = Array.from({ length: Math.max(0, Math.floor(Number(trackCount) || 0)) }, (_, index) => index);
  if (fighters.length < 2) throw new Error("Demo mode requires at least two different fighters.");
  if (!stages.length) throw new Error("Demo mode requires at least one stage.");
  if (!tracks.length) throw new Error("Demo mode requires at least one soundtrack.");

  const matchups = [];
  for (let first = 0; first < fighters.length - 1; first += 1) {
    for (let second = first + 1; second < fighters.length; second += 1) {
      matchups.push([fighters[first], fighters[second]]);
    }
  }

  const normalizedSeed = hashSeed("FINAL-BLOW-DEMO", seed, fighters.join("|"), stages.join("|"), tracks.length);
  const rng = new DeterministicRng(normalizedSeed);
  let matchupBag = [];
  let stageBag = [];
  let trackBag = [];
  let previousMatchup = null;
  let previousStage = null;
  let previousTrack = null;
  let cycle = 0;

  function next() {
    if (!matchupBag.length) matchupBag = refillBag(matchups, rng, previousMatchup, ([a, b]) => demoMatchupKey(a, b));
    if (!stageBag.length) stageBag = refillBag(stages, rng, previousStage);
    if (!trackBag.length) trackBag = refillBag(tracks, rng, previousTrack);
    const matchup = matchupBag.shift();
    const stage = stageBag.shift();
    const track = trackBag.shift();
    const picks = rng.nextFloat() < 0.5 ? [...matchup] : [matchup[1], matchup[0]];
    previousMatchup = matchup;
    previousStage = stage;
    previousTrack = track;
    cycle += 1;
    return Object.freeze({ cycle, picks: Object.freeze(picks), stage, track });
  }

  function snapshot() {
    return {
      cycle,
      seed: normalizedSeed,
      matchupCount: matchups.length,
      remainingMatchups: matchupBag.length,
      remainingStages: stageBag.length,
      remainingTracks: trackBag.length,
      lastMatchup: previousMatchup ? [...previousMatchup] : null,
      lastStage: previousStage,
      lastTrack: previousTrack,
      rng: rng.getState(),
    };
  }

  return Object.freeze({ next, snapshot });
}
