import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APPROVED_CORE_CUES,
  APPROVED_KICK_POOLS,
  KEPT_SHARED_PATHS,
  REJECTED_PATHS,
  REVIEW_ACCEPTED,
  REVIEW_CORE_CUES,
  REVIEW_FIGHTER_IDS,
  REVIEW_KICK_ROLES,
  REVIEW_REJECTED,
  REVIEW_SOUND_PATHS,
  REVIEW_UNRATED,
  WITHHELD_CANDIDATE_PATHS,
  isShippablePath,
} from "../engine/audio-review.mjs";
import {
  FIGHTER_AUDIO_IDS,
  FIGHTER_KICK_CUES,
  fighterAudioRecordedManifest,
  fighterAudioVariantManifest,
} from "../engine/fighter-audio.mjs";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resolve = (path) => join(gameRoot, path);

// The two sounds Jez never rated. Neither may be touched by this change:
// one is a shipped game asset, the other a candidate that is not his yet.
const UNRATED_KEPT = "shared-ui-select";
const UNRATED_WITHHELD = "post-light-kick-impact-b";

test("the review's three buckets tile every sound exactly once", () => {
  const universe = Object.keys(REVIEW_SOUND_PATHS);
  assert.equal(universe.length, 170);
  assert.equal(REVIEW_ACCEPTED.length, 51);
  assert.equal(REVIEW_REJECTED.length, 117);
  assert.equal(REVIEW_UNRATED.length, 2);
  assert.equal(REVIEW_ACCEPTED.length + REVIEW_REJECTED.length + REVIEW_UNRATED.length, universe.length);

  const buckets = [REVIEW_ACCEPTED, REVIEW_REJECTED, REVIEW_UNRATED];
  const seen = new Map();
  for (const bucket of buckets) {
    for (const id of bucket) {
      assert.ok(REVIEW_SOUND_PATHS[id], `${id} must resolve to a real sound path`);
      assert.ok(!seen.has(id), `${id} appears in more than one bucket`);
      seen.set(id, true);
    }
  }
  assert.equal(seen.size, universe.length, "every sound must land in exactly one bucket");
  // Each id names one file and no two ids name the same one.
  const paths = Object.values(REVIEW_SOUND_PATHS);
  assert.equal(new Set(paths).size, paths.length);
});

test("the unrated pair is exactly what Jez left unrated", () => {
  assert.deepEqual([...REVIEW_UNRATED].sort(), [UNRATED_WITHHELD, UNRATED_KEPT].sort());
});

test("every rejected recording is gone from the tree", () => {
  const present = REJECTED_PATHS.filter((path) => existsSync(resolve(path)));
  assert.deepEqual(present, [], "rejected recordings must be deleted, not merely unrouted");
  assert.equal(REJECTED_PATHS.length, 117);
  // 84 of those were real files in the game; the other 33 are rejected
  // candidates that never shipped and must never arrive.
  const shipped = REVIEW_REJECTED.filter((id) => !/-(a|b)$/.test(id) || !REVIEW_KICK_ROLES.some((role) => id.includes(role)));
  assert.equal(shipped.length, 84);
});

test("no source file still points at a rejected or withheld recording", async () => {
  const guarded = [...new Set([...REJECTED_PATHS, ...WITHHELD_CANDIDATE_PATHS])];
  // The generated decision module and this test are where those paths are
  // named on purpose — everywhere else naming one is a live reference.
  const exempt = new Set(["engine/audio-review.mjs", "tests/audio-review.test.mjs"]);
  const extensions = new Set([".js", ".mjs", ".html", ".css", ".json", ".webmanifest", ".md"]);
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!extensions.has(extname(entry.name))) continue;
      const rel = relative(gameRoot, absolute);
      if (exempt.has(rel)) continue;
      const text = readFileSync(absolute, "utf8");
      for (const path of guarded) {
        if (text.includes(path)) offenders.push(`${rel} -> ${path}`);
      }
    }
  };
  walk(gameRoot);
  assert.deepEqual(offenders, [], "a deleted or withheld take is still referenced");
  // Guard the guard: the exemptions must actually exist, or this test quietly
  // stops covering the files it was written for.
  for (const rel of exempt) assert.ok(existsSync(resolve(rel)), `${rel} is missing`);
  await Promise.resolve();
});

test("every recorded take the game routes is present and shippable", () => {
  const recorded = fighterAudioRecordedManifest();
  assert.equal(recorded.length, 45);
  for (const path of recorded) {
    assert.ok(existsSync(resolve(path)), `${path} is routed but not on disk`);
    assert.ok(isShippablePath(path), `${path} is routed but not accepted`);
  }
  for (const path of KEPT_SHARED_PATHS) {
    assert.ok(existsSync(resolve(path)), `${path} survived review but is missing`);
  }
});

test("every path the runtime may fetch belongs to accepted-or-unrated policy", () => {
  // Speculative -2/-3 variant slots and the unrecorded reactive cues are
  // allowed to 404; what they may never be is a take he turned down.
  for (const path of fighterAudioVariantManifest()) {
    assert.ok(isShippablePath(path), `${path} may be fetched but is not shippable`);
  }
});

test("every accepted sound survived, and every accepted candidate was imported", () => {
  for (const id of REVIEW_ACCEPTED) {
    const path = REVIEW_SOUND_PATHS[id];
    assert.ok(existsSync(resolve(path)), `accepted ${id} is missing from ${path}`);
  }
  const importedCandidates = REVIEW_ACCEPTED.filter((id) => REVIEW_KICK_ROLES.some((role) => id.includes(`-${role}-`)));
  assert.equal(importedCandidates.length, 30);
  const keptCurrent = REVIEW_ACCEPTED.length - importedCandidates.length;
  assert.equal(keptCurrent, 21);
});

test("the unrated game asset is untouched and still routed", () => {
  const path = REVIEW_SOUND_PATHS[UNRATED_KEPT];
  assert.equal(path, "assets/audio/ui-select.mp3");
  assert.ok(existsSync(resolve(path)), "an unrated game asset must not be deleted");
  assert.ok(KEPT_SHARED_PATHS.includes(path));
  const game = readFileSync(resolve("game.js"), "utf8");
  assert.ok(game.includes(`select: "${path}"`), "the unrated menu click must stay wired up");
});

test("the unrated candidate stays outside the game until Jez rates it", () => {
  const path = REVIEW_SOUND_PATHS[UNRATED_WITHHELD];
  assert.equal(path, "assets/audio/fighters/post/light-kick-impact-b.mp3");
  assert.ok(!existsSync(resolve(path)), "an unrated candidate must not be imported");
  assert.ok(WITHHELD_CANDIDATE_PATHS.includes(path));
  assert.ok(!isShippablePath(path));
  // Its accepted sibling did ship, so the role still has a voice.
  assert.deepEqual(APPROVED_KICK_POOLS.post["light-kick-impact"], [
    "assets/audio/fighters/post/light-kick-impact-a.mp3",
  ]);
});

test("the fighter audio tree holds nothing but accepted takes", () => {
  const shipped = [];
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    const dir = resolve(`assets/audio/fighters/${fighterId}`);
    for (const name of readdirSync(dir)) {
      shipped.push(`assets/audio/fighters/${fighterId}/${name}`);
    }
  }
  assert.equal(shipped.length, 45, "the tree must hold exactly the accepted fighter takes");
  const accepted = new Set(REVIEW_ACCEPTED.map((id) => REVIEW_SOUND_PATHS[id]));
  for (const path of shipped) {
    assert.ok(accepted.has(path), `${path} is on disk but was never accepted`);
  }
});

test("shared audio routing names only files that survived review", async () => {
  const game = await readFile(resolve("game.js"), "utf8");
  const block = game.match(/const audioAssets = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(block, "game.js must declare audioAssets");
  const entries = [...block.matchAll(/^\s*"?([\w-]+)"?:\s*"([^"]+)"/gm)].map(([, kind, path]) => [kind, path]);
  assert.equal(entries.length, 7, "three rejected shared takes must be gone from the table");

  for (const [kind, path] of entries) {
    assert.ok(existsSync(resolve(path)), `audioAssets.${kind} points at a missing file`);
    assert.ok(isShippablePath(path), `audioAssets.${kind} points at a rejected take`);
  }
  const kinds = entries.map(([kind]) => kind);
  assert.deepEqual(kinds.sort(), ["finish", "heavy", "hit", "jump", "ko", "light", "select"]);
  // The rejected three must not reappear as shared samples under any name.
  for (const rejected of ["special-swing", "block", "final-blow"]) {
    assert.ok(!entries.some(([, path]) => path.endsWith(`/${rejected}.mp3`)), `${rejected} is back in audioAssets`);
  }
});

test("kick cues fall back to shared takes he accepted", async () => {
  const game = await readFile(resolve("game.js"), "utf8");
  const block = game.match(/const fallbackSoundKinds = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(block, "game.js must declare fallbackSoundKinds");
  const fallbacks = Object.fromEntries(
    [...block.matchAll(/^\s*"?([\w-]+)"?:\s*"([\w-]+)"/gm)].map(([, cue, target]) => [cue, target]),
  );
  const assets = Object.fromEntries(
    [...game.match(/const audioAssets = \{([\s\S]*?)\n\};/)[1]
      .matchAll(/^\s*"?([\w-]+)"?:\s*"([^"]+)"/gm)].map(([, kind, path]) => [kind, path]),
  );

  // An empty kick pool must land on a real accepted sample, not on silence.
  assert.deepEqual(
    Object.fromEntries(FIGHTER_KICK_CUES.map((cue) => [cue, fallbacks[cue]])),
    {
      "light-kick-swing": "light",
      "roundhouse-swing": "heavy",
      "light-kick-impact": "hit",
      "roundhouse-impact": "hit",
    },
  );
  for (const cue of FIGHTER_KICK_CUES) {
    const path = assets[fallbacks[cue]];
    assert.ok(path, `${cue} must fall back to a shared sample that still exists`);
    assert.ok(existsSync(resolve(path)), `${cue} falls back to a missing file`);
    assert.ok(isShippablePath(path), `${cue} falls back to a rejected take`);
  }
  // Every other fallback either names a surviving sample or, for the three
  // deleted shared takes, deliberately names no file so playback synthesises.
  for (const [cue, target] of Object.entries(fallbacks)) {
    const path = assets[target];
    if (path) assert.ok(isShippablePath(path), `${cue} falls back to a rejected take`);
    else assert.ok(["special", "block", "final"].includes(target), `${cue} falls back to unknown kind ${target}`);
  }
});

test("kick routing covers every fighter, with fallbacks where he accepted nothing", () => {
  let routed = 0;
  let fallback = 0;
  for (const fighterId of REVIEW_FIGHTER_IDS) {
    for (const role of REVIEW_KICK_ROLES) {
      const pool = APPROVED_KICK_POOLS[fighterId][role];
      assert.ok(pool.length <= 2);
      for (const path of pool) {
        assert.ok(existsSync(resolve(path)), `${path} is pooled but missing`);
      }
      if (pool.length) routed += 1;
      else fallback += 1;
    }
  }
  // 32 fighter/role pairs in all: 22 have at least one accepted take, 10 have
  // none and rely on the shared fallback.
  assert.equal(routed + fallback, 32);
  assert.equal(routed, 22);
  assert.equal(fallback, 10);
});

test("core cue coverage matches the accepted list fighter by fighter", () => {
  const counts = Object.fromEntries(
    REVIEW_FIGHTER_IDS.map((fighterId) => [fighterId, APPROVED_CORE_CUES[fighterId].length]),
  );
  assert.deepEqual(counts, {
    deathblow: 6, jez: 0, alan: 4, post: 0, benny: 1, donald: 2, cyraxx: 0, ali: 2,
  });
  for (const fighterId of REVIEW_FIGHTER_IDS) {
    for (const cue of APPROVED_CORE_CUES[fighterId]) {
      assert.ok(REVIEW_CORE_CUES.includes(cue));
      assert.ok(REVIEW_ACCEPTED.includes(`${fighterId}-${cue}`), `${fighterId}-${cue} must be accepted`);
    }
  }
});
