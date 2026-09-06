import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ANNOUNCER_GAP_MS,
  AUDIO_MANIFEST_PATH,
  announcerBankFromManifest,
  announcerEstimateMs,
  announcerWindow,
  audioManifestEntry,
  audioManifestMs,
  fighterBankFromManifest,
  parseAudioManifest,
} from "../engine/audio-manifest.mjs";
import {
  ALL_FIGHTER_AUDIO_IDS,
  FIGHTER_AUDIO_CUES,
  FIGHTER_AUDIO_IDS,
  FIGHTER_KICK_CUES,
  fighterAudioVariantManifest,
  fighterAudioVariants,
} from "../engine/fighter-audio.mjs";
import { APPROVED_CORE_CUES, APPROVED_KICK_POOLS } from "../engine/audio-review.mjs";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resolve = (path) => join(gameRoot, path);
const raw = JSON.parse(readFileSync(resolve(AUDIO_MANIFEST_PATH), "utf8"));
const manifest = parseAudioManifest(raw);
const gameSource = readFileSync(resolve("game.js"), "utf8");

// Every mp3 the tree ships under assets/audio, keyed the way the manifest
// sections are: announcer/<file>, fighters/<id>/<file>, <file> (shared).
function shippedAudio() {
  const files = [];
  for (const name of readdirSync(resolve("assets/audio"))) {
    if (name.endsWith(".mp3")) files.push(`assets/audio/${name}`);
  }
  for (const name of readdirSync(resolve("assets/audio/announcer"))) {
    if (name.endsWith(".mp3")) files.push(`assets/audio/announcer/${name}`);
  }
  for (const fighterId of readdirSync(resolve("assets/audio/fighters"))) {
    const dir = resolve(`assets/audio/fighters/${fighterId}`);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".mp3")) files.push(`assets/audio/fighters/${fighterId}/${name}`);
    }
  }
  return files.sort();
}

test("the audio manifest is the tool's output and parses", () => {
  assert.equal(raw.tool, "tools/audio/build_manifest.mjs");
  assert.ok(manifest, "assets/audio/MANIFEST.json must parse as an audio manifest");
  assert.ok(manifest.announcer && manifest.shared);
  assert.deepEqual(Object.keys(manifest.fighters).sort(), [...ALL_FIGHTER_AUDIO_IDS].sort());
  // Nothing on disk is unreachable: a take past a hole in its bank would be
  // silently dropped by every picker, so the generator must have found none.
  assert.deepEqual(raw.gaps, []);
  assert.equal(raw.announcer.takes, 121);
  assert.equal(Object.values(raw.fighters).reduce((sum, entry) => sum + entry.takes, 0), 357);
});

test("the manifest lists every shipped take, with its real size, and nothing else", () => {
  const shipped = shippedAudio();
  for (const path of shipped) {
    const entry = audioManifestEntry(manifest, path);
    assert.ok(entry, `${path} is on disk but not in the manifest — regenerate it`);
    // Byte size doubles as the staleness check: a re-encoded or swapped file
    // changes size, and the duration recorded here would no longer be true.
    assert.equal(entry.bytes, statSync(resolve(path)).size, `${path} changed since the manifest was built`);
    // Every voice take was verified 0.4-6.0 s by the LOUD batch
    // (MISSING-AUDIO.md); the shared root holds the music tracks too.
    if (!path.startsWith("assets/audio/announcer/") && !path.startsWith("assets/audio/fighters/")) continue;
    assert.ok(entry.ms >= 400 && entry.ms <= 6000, `${path} duration ${entry.ms} ms is out of the verified range`);
  }
  const listed = [
    ...Object.keys(manifest.announcer).map((name) => `assets/audio/announcer/${name}`),
    ...Object.entries(manifest.fighters).flatMap(([id, files]) => Object.keys(files).map((name) => `assets/audio/fighters/${id}/${name}`)),
    ...Object.keys(manifest.shared).map((name) => `assets/audio/${name}`),
  ].sort();
  assert.deepEqual(listed, shipped, "the manifest names a file that is not on disk");
  // The four music tracks and the accepted shared samples are measured too
  // (never touched — measured), so the same lookup serves every audio path.
  assert.ok(audioManifestMs(manifest, "assets/audio/philly-after-dark.mp3") > 60000);
  assert.ok(audioManifestMs(manifest, "assets/audio/body-hit.mp3") > 0);
  assert.equal(audioManifestMs(manifest, "assets/audio/announcer/nope-1.mp3"), 0);
  assert.equal(audioManifestEntry(manifest, "assets/motion/MANIFEST.json"), null);
});

test("every fighter cue path the game references resolves through the manifest", () => {
  // The runtime asks fighterBankFromManifest for each canonical variant list;
  // its answer must be exactly the takes on disk (contiguous from slot 1) —
  // this is the zero-probe contract, and the probe path is what it replaces.
  for (const fighterId of ALL_FIGHTER_AUDIO_IDS) {
    for (const cue of FIGHTER_AUDIO_CUES) {
      const variants = fighterAudioVariants(fighterId, cue);
      if (!variants) continue;
      const bank = fighterBankFromManifest(manifest, fighterId, variants);
      assert.ok(bank, `${fighterId}/${cue} has no manifest entry`);
      const onDisk = variants.filter((path) => existsSync(resolve(path)));
      assert.deepEqual([...bank.srcs], onDisk, `${fighterId}/${cue} bank differs from the files on disk`);
      assert.equal(bank.durationsMs.length, bank.srcs.length);
      bank.srcs.forEach((path, index) => assert.equal(bank.durationsMs[index], audioManifestMs(manifest, path)));
    }
  }
  for (const path of fighterAudioVariantManifest()) {
    assert.equal(Boolean(audioManifestEntry(manifest, path)), existsSync(resolve(path)), path);
  }
  // Since the LOUD batch every routed bank is full: the reviewed mains'
  // approved core cues and every reactive cue carry all three takes, the
  // caption-first pair carry all 19 x 3, and the kick pools are the review's.
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of APPROVED_CORE_CUES[fighterId]) {
      assert.equal(fighterBankFromManifest(manifest, fighterId, fighterAudioVariants(fighterId, cue)).srcs.length, 3, `${fighterId}/${cue}`);
    }
    for (const cue of FIGHTER_KICK_CUES) {
      const pool = APPROVED_KICK_POOLS[fighterId][cue];
      if (!pool.length) continue;
      assert.deepEqual([...fighterBankFromManifest(manifest, fighterId, pool).srcs], pool);
    }
  }
  assert.equal(raw.fighters.commissioner.takes, 57);
  assert.equal(raw.fighters.devil.takes, 57);
  assert.equal(raw.fighters.jez.takes, 24, "Jez's core takes were all rejected: reactive + kick pools only");
  // A fighter the manifest does not know sends the runtime to the probe path.
  assert.equal(fighterBankFromManifest(manifest, "nobody", ["assets/audio/fighters/nobody/jump.mp3"]), null);
  assert.equal(fighterBankFromManifest(null, "alan", fighterAudioVariants("alan", "jump")), null);
});

// ANNOUNCER_LINES as game.js authors it: the literal banks, the roster loop
// (three name + three wins lines per fighter) and the 2.8 retake table.
function announcerLineCounts() {
  const block = gameSource.match(/const ANNOUNCER_LINES = \(\(\) => \{\n  const banks = \{\n([\s\S]*?)\n  \};/)?.[1];
  assert.ok(block, "game.js must declare ANNOUNCER_LINES");
  const counts = {};
  for (const [, key, list] of block.matchAll(/^\s*"?([\w-]+)"?: \[(.*)\],?$/gm)) {
    counts[key] = [...list.matchAll(/"[^"]*"/g)].length;
  }
  for (const fighterId of ALL_FIGHTER_AUDIO_IDS) {
    counts[`${fighterId}-name`] = 3;
    counts[`${fighterId}-wins`] = 3;
  }
  const retakes = gameSource.match(/const ANNOUNCER_RETAKES = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(retakes, "game.js must declare ANNOUNCER_RETAKES");
  for (const [, cue] of retakes.matchAll(/^\s*"?([\w-]+)"?: \d+,?$/gm)) counts[cue] += 1;
  return counts;
}

test("every announcer cue the game captions has exactly that many takes, and vice versa", () => {
  const lines = announcerLineCounts();
  // w51 announcer/clock truth added "tenseconds" as a CAPTION-ONLY cue (no
  // takes generated yet — MISSING-AUDIO.md Priority 6, an owner call), so it
  // is captioned but absent from the manifest by design.
  const CAPTION_ONLY = new Set(["tenseconds"]);
  assert.equal(Object.keys(lines).length, 39);
  for (const cue of CAPTION_ONLY) assert.ok(lines[cue] >= 1 && !raw.announcer.cues[cue], `${cue} is caption-only`);
  assert.deepEqual(
    Object.fromEntries(Object.keys(lines).filter((cue) => !CAPTION_ONLY.has(cue)).sort().map((cue) => [cue, lines[cue]])),
    Object.fromEntries(Object.keys(raw.announcer.cues).sort().map((cue) => [cue, raw.announcer.cues[cue]])),
    "caption list and recorded takes disagree — a caption would show the wrong words",
  );
  // The six 2.8 retakes re-read line 1 of their bank; the caption index
  // (pick % lines.length) lands on the appended copy for take N.
  for (const [cue, takes] of Object.entries({ ko: 5, perfect: 4, finishthem: 4, wallbounce: 4, "cyraxx-wins": 4, flawless: 3 })) {
    assert.equal(lines[cue], takes, cue);
    const bank = announcerBankFromManifest(manifest, cue);
    assert.equal(bank.srcs.length, takes);
    assert.equal(bank.srcs[takes - 1], `assets/audio/announcer/${cue}-${takes}.mp3`);
  }
  // The legacy announcer-only manifest (2.7) stays in step with the shared one.
  const legacy = JSON.parse(readFileSync(resolve("assets/audio/announcer/MANIFEST.json"), "utf8"));
  assert.deepEqual(legacy.takes, raw.announcer.cues);
});

test("announcer banks resolve contiguous takes with measured lengths", () => {
  const ko = announcerBankFromManifest(manifest, "ko");
  assert.deepEqual([...ko.srcs], [1, 2, 3, 4, 5].map((take) => `assets/audio/announcer/ko-${take}.mp3`));
  // ffprobe on the shipped files: ko-2 2.429 s, benny-wins-2 4.676 s (the
  // longest take in the bank), fight-3 3.318 s.
  assert.equal(ko.durationsMs[1], 2429);
  assert.equal(announcerBankFromManifest(manifest, "benny-wins").durationsMs[1], 4676);
  assert.equal(announcerBankFromManifest(manifest, "fight").durationsMs[2], 3318);
  const longest = Math.max(...Object.values(manifest.announcer).map((entry) => entry.ms));
  assert.equal(longest, 4676);
  // The clamp still applies and an unknown cue costs nothing.
  assert.equal(announcerBankFromManifest(manifest, "ko", 2).srcs.length, 2);
  assert.deepEqual([...announcerBankFromManifest(manifest, "nothing").srcs], []);
  // No announcer section at all -> null -> the runtime probes (pre-5.1 path).
  assert.equal(announcerBankFromManifest(parseAudioManifest({ shared: raw.shared }), "ko"), null);
  assert.equal(parseAudioManifest(null), null);
  assert.equal(parseAudioManifest({ takes: { ko: 5 } }), null, "the 2.7 announcer-only shape is not this manifest");
  assert.equal(parseAudioManifest("<html>"), null);
});

test("layered announcer calls never overlap once the clock uses real take lengths", () => {
  // The worked case from the sweep: a Benny comeback KO. announce("BENNY
  // WINS") queues ko (delay 0) then benny-wins (delay 950); the story hook
  // adds comeback (delay 1400). Draw the long takes: ko-2, benny-wins-2,
  // comeback-1.
  const takes = [
    { cue: "ko", take: 2, delay: 0, line: "KNOCKOUT!" },
    { cue: "benny-wins", take: 2, delay: 950, line: "THE WINNER — BENNY!" },
    { cue: "comeback", take: 1, delay: 1400, line: "WHAT A COMEBACK!" },
  ];
  const now = 10000;
  let busyUntil = 0;
  const schedule = [];
  for (const { cue, take, delay, line } of takes) {
    const bank = announcerBankFromManifest(manifest, cue);
    const slot = announcerWindow({ now, delay, busyUntil, speechMs: bank.durationsMs[take - 1], line });
    busyUntil = slot.busyUntil;
    schedule.push({ cue, startAt: slot.startAt, endAt: slot.busyUntil, speechMs: slot.speechMs });
  }
  for (let index = 1; index < schedule.length; index += 1) {
    assert.ok(
      schedule[index].startAt >= schedule[index - 1].endAt + ANNOUNCER_GAP_MS,
      `${schedule[index].cue} starts at ${schedule[index].startAt} while ${schedule[index - 1].cue} runs to ${schedule[index - 1].endAt}`,
    );
  }
  assert.deepEqual(schedule.map(({ speechMs }) => speechMs), [2429, 4676, audioManifestMs(manifest, "assets/audio/announcer/comeback-1.mp3")]);
  assert.equal(schedule[1].startAt, now + 2429 + ANNOUNCER_GAP_MS, "the wins call waits for the KO take, not the 950 ms delay");

  // The same walk on the word-count estimate (the only tier before 5.1)
  // stacks all three: it is kept as the fallback, and this pins WHY it was
  // not enough — ko estimated at 680 ms against 2429 real.
  busyUntil = 0;
  const estimated = takes.map(({ delay, line }) => {
    const slot = announcerWindow({ now, delay, busyUntil, line });
    busyUntil = slot.busyUntil;
    return slot;
  });
  assert.equal(announcerEstimateMs("KNOCKOUT!"), 680);
  assert.equal(announcerEstimateMs("FINAL BOUT — THE BLACK BOOK CLOSES TONIGHT."), 1700, "the estimate cap is unchanged");
  assert.ok(estimated[1].startAt < now + 2429, "on estimates alone the wins call would start inside ko-2");
  assert.ok(estimated[2].startAt < estimated[1].startAt + 4676, "and comeback inside benny-wins-2");

  // A call with no known length falls back to the estimate, never to zero.
  assert.equal(announcerWindow({ now, line: "FIGHT!" }).speechMs, 680);
  assert.equal(announcerWindow({ now, speechMs: Number.NaN, line: "FIGHT!" }).speechMs, 680);
  assert.equal(announcerWindow({ now, delay: -50, busyUntil: 0, speechMs: 1000 }).startAt, now);
});

test("game.js reads the manifest first and keeps the probe path only as the fallback", () => {
  assert.match(gameSource, /import \{[^}]*parseAudioManifest[^}]*\} from "\.\/engine\/audio-manifest\.mjs"/);
  assert.match(gameSource, /fetch\(AUDIO_MANIFEST_PATH\)/);
  // Fighter voice pools start at one element per confirmed take and grow
  // only on overlap; the eager 3-5 element createSfxPool is for shared cues.
  const poolFn = gameSource.match(/function fighterVoicePool\([\s\S]*?\n\}/)?.[0];
  assert.ok(poolFn && !poolFn.includes("createSfxPool"), "fighter voice pools must not be created eagerly");
  assert.match(gameSource, /pool\.length < fighterVoicePoolCap\(pool\.cue\)/);
  // The probe still exists (manifest-less fallback) and is the only HEAD.
  assert.equal([...gameSource.matchAll(/method: "HEAD"/g)].length, 1);
  assert.match(gameSource, /if \(!settleFromManifest\(manifest\)\) probeFighterVoiceBank\(bank, variants, seeded\);/);
  // The busy window and the duck both ride the measured length.
  assert.match(gameSource, /const speechMs = announcerTakeMs\(bank, takeIndex, line\);/);
  assert.match(gameSource, /duckMusic\(0\.45, Math\.max\(750, speechMs\)\);/);
  // Offline shell caches the new module alongside fighter-audio.mjs.
  assert.match(readFileSync(resolve("sw.js"), "utf8"), /"\.\/engine\/audio-manifest\.mjs"/);
});
