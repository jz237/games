#!/usr/bin/env node
/**
 * Turn Jez's reviewed SFX decisions into engine/audio-review.mjs.
 *
 * The review arrives as one JSON document listing every sound id he accepted
 * and every one he rejected. Anything he did not rate appears in neither list
 * and stays untouched by policy. This script is the only place those ids are
 * interpreted: it resolves each one to exactly one canonical file path, proves
 * the three buckets tile the whole sound universe with no overlap and no gaps,
 * and writes the result out as frozen data the game and its tests read.
 *
 * Hand-editing the generated module would decouple the shipped routing from
 * the decisions it claims to implement, so regenerate instead:
 *
 *   node tools/build-audio-review.mjs <review.json>
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// The eight playable fighters own personal takes. The arcade boss
// (commissioner) never had a voice palette and was not part of the review.
const FIGHTER_IDS = [
  "deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali",
];

// The 1.5 single-take cue set: one mp3 per fighter per cue.
const CORE_CUES = [
  "jump", "dash", "light", "heavy", "special", "throw",
  "hit-light", "hit-heavy", "block", "super", "fatal", "ko",
];

// Review ids for the stage-wide sounds do not match their filenames one to
// one, so the mapping is spelled out rather than derived.
const SHARED_SOUNDS = {
  "shared-ui-select": "ui-select",
  "shared-jump": "jump",
  "shared-light-swing": "light-swing",
  "shared-heavy-swing": "heavy-swing",
  "shared-special": "special-swing",
  "shared-body-hit": "body-hit",
  "shared-block": "block",
  "shared-finish-ready": "finish-ready",
  "shared-final-blow": "final-blow",
  "shared-knockout": "knockout",
};

// The kick review generated two takes per role per fighter. Roles map onto the
// game's existing limb split: light kick normals and heavy kick (roundhouse)
// normals, each with a swing and an impact.
const KICK_ROLES = [
  "light-kick-swing", "light-kick-impact",
  "roundhouse-swing", "roundhouse-impact",
];
const KICK_TAKES = ["a", "b"];

function sharedPath(file) {
  return `assets/audio/${file}.mp3`;
}

function fighterPath(fighterId, name) {
  return `assets/audio/fighters/${fighterId}/${name}.mp3`;
}

/**
 * Every sound id the review could legitimately mention, resolved to the file
 * it names. Built from the same tables the game routes with, so an id that
 * does not appear here is an id nobody can play.
 */
function buildUniverse() {
  const universe = new Map();
  for (const [id, file] of Object.entries(SHARED_SOUNDS)) {
    universe.set(id, { id, scope: "shared", path: sharedPath(file) });
  }
  for (const fighterId of FIGHTER_IDS) {
    for (const cue of CORE_CUES) {
      universe.set(`${fighterId}-${cue}`, {
        id: `${fighterId}-${cue}`, scope: "core", fighterId, cue,
        path: fighterPath(fighterId, cue),
      });
    }
    for (const role of KICK_ROLES) {
      for (const take of KICK_TAKES) {
        const id = `${fighterId}-${role}-${take}`;
        universe.set(id, {
          id, scope: "candidate", fighterId, role, take,
          path: fighterPath(fighterId, `${role}-${take}`),
          // Where the generated take currently lives, outside the game.
          source: `${fighterId}/${role}-${take}.mp3`,
        });
      }
    }
  }
  return universe;
}

function fail(message) {
  console.error(`build-audio-review: ${message}`);
  process.exit(1);
}

const reviewPath = process.argv[2];
if (!reviewPath) fail("usage: node tools/build-audio-review.mjs <review.json>");

const review = JSON.parse(await readFile(reviewPath, "utf8"));
if (review.format !== "final-blow-sfx-review-v1") {
  fail(`unexpected review format: ${review.format}`);
}

const universe = buildUniverse();
const accepted = [...review.accepted];
const rejected = [...review.rejected];

// A decision naming a sound that does not exist means the review and the game
// have drifted apart; guessing which one is right is exactly the silent
// reinterpretation this script exists to prevent.
for (const [bucket, ids] of [["accepted", accepted], ["rejected", rejected]]) {
  for (const id of ids) {
    if (!universe.has(id)) fail(`${bucket} id "${id}" matches no known sound`);
  }
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`${bucket} id "${id}" listed twice`);
    seen.add(id);
  }
}
const acceptedSet = new Set(accepted);
const rejectedSet = new Set(rejected);
for (const id of acceptedSet) {
  if (rejectedSet.has(id)) fail(`id "${id}" is both accepted and rejected`);
}

// Whatever he did not rate: neither imported nor deleted, left exactly as-is.
const unrated = [...universe.keys()]
  .filter((id) => !acceptedSet.has(id) && !rejectedSet.has(id))
  .sort();

if (universe.size !== review.totals.sounds) {
  fail(`review counted ${review.totals.sounds} sounds, the game knows ${universe.size}`);
}
if (accepted.length !== review.totals.accepted || rejected.length !== review.totals.rejected) {
  fail("review totals disagree with its own accepted/rejected lists");
}

// Accepted candidate takes, grouped per fighter and role, in a/b order. An
// empty pool is meaningful: he rejected both takes for that role, so it must
// fall back rather than borrow a rejected recording.
const kickPools = {};
for (const fighterId of FIGHTER_IDS) {
  kickPools[fighterId] = {};
  for (const role of KICK_ROLES) {
    kickPools[fighterId][role] = KICK_TAKES
      .map((take) => `${fighterId}-${role}-${take}`)
      .filter((id) => acceptedSet.has(id))
      .map((id) => universe.get(id).path);
  }
}

// Core cues whose recording survived review, per fighter. Everything else is
// deleted, so the routing must treat it as having no recorded take at all.
const approvedCore = {};
for (const fighterId of FIGHTER_IDS) {
  approvedCore[fighterId] = CORE_CUES.filter((cue) => acceptedSet.has(`${fighterId}-${cue}`));
}

const keptShared = Object.keys(SHARED_SOUNDS)
  .filter((id) => !rejectedSet.has(id))
  .map((id) => universe.get(id).path)
  .sort();
const rejectedPaths = rejected.map((id) => universe.get(id).path).sort();
// Candidate takes that must never reach the game: rejected outright, or still
// unrated and therefore not his to ship yet.
const withheldCandidates = [...universe.values()]
  .filter(({ scope, id }) => scope === "candidate" && !acceptedSet.has(id))
  .map(({ path }) => path)
  .sort();

const json = (value) => JSON.stringify(value, null, 2).replace(/\n/g, "\n");

const module = `// GENERATED FILE — regenerate with tools/build-audio-review.mjs, never edit.
//
// Jez's reviewed verdict on every Final Blow sound, ${review.format},
// reviewed ${review.reviewedAt}. ${accepted.length} accepted,
// ${rejected.length} rejected, ${unrated.length} left unrated.
//
// Rejected recordings are deleted from the tree and unreachable from any
// routing table. Unrated sounds are frozen in place: ${unrated.join(", ")}
// stay exactly as the review found them until he rates them.

export const AUDIO_REVIEW_FORMAT = ${JSON.stringify(review.format)};
export const AUDIO_REVIEW_AT = ${JSON.stringify(review.reviewedAt)};

export const REVIEW_FIGHTER_IDS = Object.freeze(${json(FIGHTER_IDS)});
export const REVIEW_CORE_CUES = Object.freeze(${json(CORE_CUES)});
export const REVIEW_KICK_ROLES = Object.freeze(${json(KICK_ROLES)});

export const REVIEW_ACCEPTED = Object.freeze(${json(accepted)});
export const REVIEW_REJECTED = Object.freeze(${json(rejected)});
export const REVIEW_UNRATED = Object.freeze(${json(unrated)});

/** Every reviewed sound id, resolved to the one file it names. */
export const REVIEW_SOUND_PATHS = Object.freeze(${json(Object.fromEntries(
  [...universe.values()].map(({ id, path }) => [id, path]),
))});

/** Files deleted from the tree because he rejected the take. */
export const REJECTED_PATHS = Object.freeze(${json(rejectedPaths)});

/**
 * Candidate takes that must stay out of the game: rejected, or unrated and
 * therefore not yet his to ship.
 */
export const WITHHELD_CANDIDATE_PATHS = Object.freeze(${json(withheldCandidates)});

/** Stage-wide sounds that survived review (including anything unrated). */
export const KEPT_SHARED_PATHS = Object.freeze(${json(keptShared)});

/** Per fighter, the 1.5 core cues whose recording he kept. */
export const APPROVED_CORE_CUES = Object.freeze(${json(approvedCore)});

/**
 * Per fighter and kick role, the accepted takes in a/b order. Both accepted
 * means both ship and rotate; an empty pool means the role falls back.
 */
export const APPROVED_KICK_POOLS = Object.freeze(${json(kickPools)});

export function isAcceptedSound(id) {
  return REVIEW_ACCEPTED.includes(id);
}

export function isRejectedSound(id) {
  return REVIEW_REJECTED.includes(id);
}

/** True when a path may ship: it is accepted, or unrated and already present. */
export function isShippablePath(path) {
  return !REJECTED_PATHS.includes(path) && !WITHHELD_CANDIDATE_PATHS.includes(path);
}
`;

await writeFile(join(gameRoot, "engine", "audio-review.mjs"), module);

const importPlan = [...universe.values()]
  .filter(({ scope, id }) => scope === "candidate" && acceptedSet.has(id))
  .map(({ source, path }) => ({ source, path }));

console.log(JSON.stringify({
  totals: {
    sounds: universe.size,
    accepted: accepted.length,
    rejected: rejected.length,
    unrated: unrated.length,
  },
  current: {
    accepted: accepted.filter((id) => universe.get(id).scope !== "candidate").length,
    rejected: rejected.filter((id) => universe.get(id).scope !== "candidate").length,
    unrated: unrated.filter((id) => universe.get(id).scope !== "candidate").length,
  },
  candidates: {
    accepted: importPlan.length,
    rejected: rejected.filter((id) => universe.get(id).scope === "candidate").length,
    unrated: unrated.filter((id) => universe.get(id).scope === "candidate").length,
  },
  // Rejected recordings that exist in the tree and must be deleted. The
  // remaining guarded paths are rejected candidates that never shipped.
  deletions: rejected.filter((id) => universe.get(id).scope !== "candidate").length,
  guardedPaths: rejectedPaths.length,
  importPlan,
}, null, 2));
