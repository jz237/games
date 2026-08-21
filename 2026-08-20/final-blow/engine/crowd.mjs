import { DeterministicRng, hashSeed } from "./foundation.mjs";

/**
 * Background crowds.
 *
 * A stage crowd is generated once per round from the match seed and then animated
 * purely from the simulation tick, so it is byte-identical under replay, rollback,
 * the AI-vs-AI demo and automated tests, while never touching gameplay state.
 *
 * Pedestrians live on depth layers behind the fight. Each layer has its own scale,
 * walking speed, opacity, contrast and parallax factor, and every pedestrian gets
 * its own build, posture, gait phase, route, pause rhythm and palette so nearby
 * figures never move in sync or read as duplicated sprites.
 */

export const CROWD_LAYERS = Object.freeze([
  // Furthest back: small, slow, low contrast, barely parallaxing.
  Object.freeze({ id: "far", count: 14, baseY: 450, scale: 0.58, speed: 0.42, alpha: 0.72, parallax: 0.09, detail: "low" }),
  Object.freeze({ id: "mid", count: 11, baseY: 482, scale: 0.74, speed: 0.68, alpha: 0.82, parallax: 0.17, detail: "mid" }),
  // Nearest crowd layer still sits well behind the fighters' floor line.
  Object.freeze({ id: "near", count: 7, baseY: 516, scale: 0.92, speed: 1, alpha: 0.9, parallax: 0.29, detail: "high" }),
]);

export const CROWD_TOTAL = CROWD_LAYERS.reduce((total, layer) => total + layer.count, 0);

/**
 * Posture archetypes. The K&A brief asks for a crowd dominated by hunched,
 * shuffling and lingering figures, so those weigh heaviest, with a minority of
 * upright walkers and leaners for variety.
 */
export const POSTURES = Object.freeze([
  Object.freeze({ id: "hunch", weight: 26, lean: 0.30, headDrop: 0.22, stride: 0.46, armSwing: 0.30, bob: 0.7 }),
  Object.freeze({ id: "shuffle", weight: 24, lean: 0.20, headDrop: 0.16, stride: 0.30, armSwing: 0.18, bob: 0.4 }),
  Object.freeze({ id: "stoop", weight: 16, lean: 0.42, headDrop: 0.30, stride: 0.24, armSwing: 0.12, bob: 0.3 }),
  Object.freeze({ id: "linger", weight: 14, lean: 0.14, headDrop: 0.10, stride: 0.06, armSwing: 0.08, bob: 0.2 }),
  Object.freeze({ id: "lean", weight: 8, lean: 0.50, headDrop: 0.08, stride: 0, armSwing: 0.05, bob: 0.1 }),
  Object.freeze({ id: "stride", weight: 7, lean: 0.06, headDrop: 0.02, stride: 1, armSwing: 0.7, bob: 1 }),
  Object.freeze({ id: "amble", weight: 5, lean: 0.12, headDrop: 0.06, stride: 0.66, armSwing: 0.45, bob: 0.6 }),
]);

const POSTURE_TOTAL = POSTURES.reduce((total, posture) => total + posture.weight, 0);

// Muted street palette: nothing here may out-contrast the fighters.
const COAT_COLOURS = Object.freeze([
  "#454d5a", "#55483a", "#374b5a", "#5f4f3e", "#484150", "#4a554a",
  "#5f4a4a", "#3c554e", "#46505f", "#554851", "#354553", "#565240",
]);
const TROUSER_COLOURS = Object.freeze([
  "#2e343d", "#3a342c", "#28313d", "#3b342e", "#2f3540", "#333b34",
]);
const ACCENT_COLOURS = Object.freeze([
  "#95a0ad", "#a8917a", "#8496a1", "#a58585", "#909c88", "#828a97",
]);

function pick(rng, list) {
  return list[Math.floor(rng.nextFloat() * list.length) % list.length];
}

function pickPosture(rng) {
  let roll = rng.nextFloat() * POSTURE_TOTAL;
  for (const posture of POSTURES) {
    roll -= posture.weight;
    if (roll <= 0) return posture;
  }
  return POSTURES[0];
}

/**
 * Build one stage's crowd. Pure: the same seed and stage always produce the same
 * people, in the same places, walking the same routes.
 */
// The walking band is only a little wider than the 1280px screen, so almost the
// whole crowd is on camera at once and the "25 visible" floor holds every frame.
export function createCrowd(stageId, { seed = 1, minX = -90, maxX = 1370 } = {}) {
  const rng = new DeterministicRng(hashSeed(seed, "crowd", stageId));
  const span = maxX - minX;
  const people = [];
  for (const layer of CROWD_LAYERS) {
    for (let index = 0; index < layer.count; index += 1) {
      const posture = pickPosture(rng);
      // Spread along the band with jitter so the spacing never looks regular.
      const slot = (index + rng.nextFloat() * 0.85) / layer.count;
      people.push({
        layer: layer.id,
        posture: posture.id,
        originX: minX + slot * span,
        y: layer.baseY + Math.round((rng.nextFloat() - 0.5) * 16),
        direction: rng.nextFloat() < 0.5 ? -1 : 1,
        // Individual pace, so two neighbours on the same layer still drift apart.
        pace: 0.55 + rng.nextFloat() * 0.95,
        gaitPhase: rng.nextFloat() * Math.PI * 2,
        // Everyone pauses on their own rhythm and for their own length.
        pausePeriod: 260 + Math.floor(rng.nextFloat() * 520),
        pauseLength: 40 + Math.floor(rng.nextFloat() * 150),
        pauseOffset: Math.floor(rng.nextFloat() * 600),
        height: 0.84 + rng.nextFloat() * 0.34,
        width: 0.82 + rng.nextFloat() * 0.42,
        shoulderSlope: (rng.nextFloat() - 0.35) * 0.4,
        headTilt: (rng.nextFloat() - 0.5) * 0.34,
        coat: pick(rng, COAT_COLOURS),
        trousers: pick(rng, TROUSER_COLOURS),
        accent: pick(rng, ACCENT_COLOURS),
        hasBag: rng.nextFloat() < 0.34,
        hasHood: rng.nextFloat() < 0.42,
        hasHat: rng.nextFloat() < 0.22,
        bagSide: rng.nextFloat() < 0.5 ? -1 : 1,
      });
    }
  }
  return { stageId, seed, minX, maxX, span, people };
}

/**
 * Where a pedestrian is on a given frame, including their pause rhythm.
 * Frame-driven rather than wall-clock, so replays reproduce it exactly.
 */
export function crowdPosition(person, layer, frame, span, minX) {
  const cycle = (frame + person.pauseOffset) % person.pausePeriod;
  const paused = cycle < person.pauseLength;
  // Distance walked so far, with paused stretches removed.
  const cycles = Math.floor((frame + person.pauseOffset) / person.pausePeriod);
  const movingFrames = frame - cycles * person.pauseLength - (paused ? cycle : person.pauseLength);
  const distance = Math.max(0, movingFrames) * layer.speed * person.pace * 0.42;
  let x = person.originX + person.direction * distance;
  // Wrap through the band so the street never empties.
  x = ((x - minX) % span + span) % span + minX;
  return { x, paused, gait: paused ? 0 : (frame * layer.speed * person.pace * 0.09 + person.gaitPhase) };
}

/** Snapshot for tests and the debug overlay. */
export function crowdSnapshot(crowd, frame, { viewLeft = 0, viewRight = 1280 } = {}) {
  if (!crowd) return { total: 0, visible: 0, layers: {}, postures: {} };
  const layers = {};
  const postures = {};
  let visible = 0;
  for (const person of crowd.people) {
    const layer = CROWD_LAYERS.find((entry) => entry.id === person.layer);
    const { x } = crowdPosition(person, layer, frame, crowd.span, crowd.minX);
    const onScreen = x > viewLeft - 60 && x < viewRight + 60;
    if (onScreen) {
      visible += 1;
      layers[person.layer] = (layers[person.layer] || 0) + 1;
      postures[person.posture] = (postures[person.posture] || 0) + 1;
    }
  }
  return { total: crowd.people.length, visible, layers, postures };
}
