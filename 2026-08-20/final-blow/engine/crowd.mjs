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

/**
 * Tailgate postures. The Vet parking lot is a rowdy bird-football tailgate, so
 * its crowd is dominated by people drinking, toasting, chugging and arguing
 * rather than shuffling past.
 */
export const TAILGATE_POSTURES = Object.freeze([
  Object.freeze({ id: "drink", weight: 24, lean: 0.10, headDrop: -0.18, stride: 0.10, armSwing: 0.10, bob: 0.3, prop: "cup" }),
  Object.freeze({ id: "chug", weight: 14, lean: -0.16, headDrop: -0.46, stride: 0, armSwing: 0.06, bob: 0.2, prop: "can" }),
  Object.freeze({ id: "toast", weight: 16, lean: 0.04, headDrop: -0.10, stride: 0.06, armSwing: 0.42, bob: 0.5, prop: "cup" }),
  Object.freeze({ id: "pour", weight: 10, lean: 0.24, headDrop: 0.18, stride: 0, armSwing: 0.12, bob: 0.2, prop: "can" }),
  Object.freeze({ id: "cheer", weight: 14, lean: -0.08, headDrop: -0.24, stride: 0.12, armSwing: 0.9, bob: 0.9, prop: "flag" }),
  Object.freeze({ id: "stumble", weight: 10, lean: 0.34, headDrop: 0.20, stride: 0.68, armSwing: 0.55, bob: 1.2, prop: "cup" }),
  Object.freeze({ id: "sign", weight: 6, lean: 0.02, headDrop: -0.12, stride: 0, armSwing: 0.3, bob: 0.3, prop: "sign" }),
  Object.freeze({ id: "mill", weight: 6, lean: 0.10, headDrop: 0.04, stride: 0.6, armSwing: 0.4, bob: 0.6, prop: "" }),
]);

/**
 * Fictional bird-team colours. Deliberately no official Philadelphia Eagles, NFL
 * or sponsor marks anywhere - the identity comes from the colours, wing motifs,
 * handmade numbers and face paint.
 */
const FAN_COLOURS = Object.freeze([
  "#1c4f42", "#143d33", "#255f4e", "#0f2f28", "#2d6b57",
  "#d8dde2", "#eef1f3", "#b9c2c8",
  "#181c1f", "#23282c",
  "#8d949b", "#a6adb4",
]);
const FAN_TROUSERS = Object.freeze([
  "#20262b", "#2b3138", "#1a2b26", "#33383d", "#12211d", "#3a4046",
]);
const FAN_ACCENTS = Object.freeze([
  "#f2f5f7", "#0f2f28", "#c7ced4", "#2d6b57", "#141719", "#9aa3ab",
]);

export const CROWD_VARIANTS = Object.freeze({
  street: Object.freeze({ postures: POSTURES, coats: null, trousers: null, accents: null }),
  tailgate: Object.freeze({ postures: TAILGATE_POSTURES, coats: FAN_COLOURS, trousers: FAN_TROUSERS, accents: FAN_ACCENTS }),
});

export const STAGE_CROWD_VARIANT = Object.freeze({
  kensington: "street",
  vet: "tailgate",
});

/**
 * Looping background scuffles for the tailgate. Each is a small group running one
 * of several fight loops at its own speed and phase, so the lot never looks like
 * one animation played in unison.
 */
export const SCUFFLE_KINDS = Object.freeze([
  Object.freeze({ id: "argue", period: 190, members: 2, reach: 30 }),
  Object.freeze({ id: "shove", period: 150, members: 2, reach: 42 }),
  Object.freeze({ id: "shirtgrab", period: 220, members: 2, reach: 26 }),
  Object.freeze({ id: "swing", period: 130, members: 2, reach: 46 }),
  Object.freeze({ id: "wrestle", period: 250, members: 2, reach: 22 }),
  Object.freeze({ id: "separate", period: 210, members: 3, reach: 38 }),
  Object.freeze({ id: "tableflip", period: 300, members: 2, reach: 50 }),
  Object.freeze({ id: "celebrate", period: 170, members: 3, reach: 34 }),
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

function pickPosture(rng, postures = POSTURES) {
  const total = postures === POSTURES
    ? POSTURE_TOTAL
    : postures.reduce((sum, posture) => sum + posture.weight, 0);
  let roll = rng.nextFloat() * total;
  for (const posture of postures) {
    roll -= posture.weight;
    if (roll <= 0) return posture;
  }
  return postures[0];
}

/**
 * Build one stage's crowd. Pure: the same seed and stage always produce the same
 * people, in the same places, walking the same routes.
 */
// The walking band is only a little wider than the 1280px screen, so almost the
// whole crowd is on camera at once and the "25 visible" floor holds every frame.
export function createCrowd(stageId, { seed = 1, minX = -90, maxX = 1370 } = {}) {
  const rng = new DeterministicRng(hashSeed(seed, "crowd", stageId));
  const variantId = STAGE_CROWD_VARIANT[stageId] || "street";
  const variant = CROWD_VARIANTS[variantId];
  const span = maxX - minX;
  const people = [];
  for (const layer of CROWD_LAYERS) {
    for (let index = 0; index < layer.count; index += 1) {
      const posture = pickPosture(rng, variant.postures);
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
        prop: posture.prop || "",
        coat: pick(rng, variant.coats || COAT_COLOURS),
        trousers: pick(rng, variant.trousers || TROUSER_COLOURS),
        accent: pick(rng, variant.accents || ACCENT_COLOURS),
        facePaint: variantId === "tailgate" && rng.nextFloat() < 0.34,
        jerseyNumber: 1 + Math.floor(rng.nextFloat() * 98),
        hasBag: rng.nextFloat() < 0.34,
        hasHood: rng.nextFloat() < 0.42,
        hasHat: rng.nextFloat() < 0.22,
        bagSide: rng.nextFloat() < 0.5 ? -1 : 1,
      });
    }
  }
  const scuffles = variantId === "tailgate" ? createScuffles(rng, minX, span) : [];
  return { stageId, variant: variantId, seed, minX, maxX, span, people, scuffles };
}

/** Several simultaneous fight loops, each with its own kind, place and phase. */
function createScuffles(rng, minX, span) {
  const groups = [];
  const count = 5;
  for (let index = 0; index < count; index += 1) {
    const kind = SCUFFLE_KINDS[Math.floor(rng.nextFloat() * SCUFFLE_KINDS.length) % SCUFFLE_KINDS.length];
    const slot = (index + 0.15 + rng.nextFloat() * 0.7) / count;
    groups.push({
      kind: kind.id,
      period: kind.period,
      members: kind.members,
      reach: kind.reach,
      x: Math.round(minX + slot * span),
      y: 470 + Math.floor(rng.nextFloat() * 56),
      scale: 0.78 + rng.nextFloat() * 0.46,
      // Independent offsets and speeds so no two loops beat together.
      offset: Math.floor(rng.nextFloat() * kind.period),
      speed: 0.72 + rng.nextFloat() * 0.7,
      flip: rng.nextFloat() < 0.5 ? -1 : 1,
      shirts: [pick(rng, FAN_COLOURS), pick(rng, FAN_COLOURS), pick(rng, FAN_COLOURS)],
    });
  }
  return groups;
}

/** Phase of one scuffle loop on a given frame, in 0..1. */
export function scufflePhase(group, frame) {
  return (((frame * group.speed + group.offset) % group.period) + group.period) % group.period / group.period;
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
  return {
    total: crowd.people.length,
    visible,
    layers,
    postures,
    variant: crowd.variant,
    scuffles: (crowd.scuffles || []).length,
    scuffleKinds: [...new Set((crowd.scuffles || []).map((group) => group.kind))],
  };
}
