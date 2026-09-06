// v5.3 SPECTACLE (music): the two new stage beds, the round/match stingers
// and the low-health stem. The decisions and the crossfade curve are pure
// functions in engine/music.mjs; the manifest tests prove the files exist and
// measure what the tables claim; the game.js pins keep the wiring honest —
// the stinger has to fire on both round-start edges and on the round end, the
// bed has to lose level when the stem arrives, and the four approved tracks
// have to be exactly the bytes they were.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ROUND_END_CAUSES } from "../engine/announcer.mjs";
import { audioManifestEntry, parseAudioManifest } from "../engine/audio-manifest.mjs";
import { createCrowdVoiceBag, crowdVoiceBagDraw } from "../engine/crowd-voice.mjs";
import {
  DANGER_STEM,
  DANGER_STEM_PATH,
  MUSIC_STINGERS,
  MUSIC_STINGER_IDS,
  MUSIC_STAGE_TRACKS,
  dangerStemBedGain,
  dangerStemGain,
  dangerStemStep,
  dangerStemTarget,
  musicMediaFiles,
  musicStageTrackEntries,
  musicStingerFiles,
  musicStingerForRoundEnd,
  musicStingerPath,
  musicTrackPath,
} from "../engine/music.mjs";

const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../assets/audio/MANIFEST.json", import.meta.url), "utf8"));
const parsed = parseAudioManifest(manifest);
const assetPath = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const slice = (from, to) => {
  const start = gameSource.indexOf(from);
  assert.notEqual(start, -1, `game.js should contain ${from}`);
  const end = gameSource.indexOf(to, start);
  assert.notEqual(end, -1, `game.js should contain ${to} after ${from}`);
  return gameSource.slice(start, end);
};

test("the two planned stage tracks exist, are 80 s beds and slot into the 1.6 stage map", () => {
  assert.equal(MUSIC_STAGE_TRACKS.length, 2);
  assert.deepEqual(MUSIC_STAGE_TRACKS.map((track) => track.stage), ["wildwood", "cruise"]);
  for (const track of MUSIC_STAGE_TRACKS) {
    const path = musicTrackPath(track.slug);
    const entry = audioManifestEntry(parsed, path);
    assert.ok(entry, `${path} is measured in the audio manifest`);
    // The shipped four run 80.065-80.091 s; a stage bed that is not the same
    // length changes how often the auto-jukebox advances between stages.
    assert.ok(Math.abs(entry.ms - 80091) <= 200, `${track.slug} is an 80 s bed (${entry.ms} ms)`);
    assert.equal(entry.bytes, statSync(assetPath(path)).size);
    // Documented loudness sits inside the shipped family's band (-10.7 to
    // -12.2 LUFS) plus the 1 LU the cruise track's crest factor cost.
    assert.ok(track.lufs <= -10.5 && track.lufs >= -13.2, `${track.slug} loudness ${track.lufs} LUFS`);
  }
  // The 1.6 resolver matches on `track.src.includes(todoTrack)` — the slugs
  // are exactly the todoTrack strings STAGE_MUSIC has carried since then.
  const stageMusic = slice("const STAGE_MUSIC = Object.freeze({", "});");
  for (const track of MUSIC_STAGE_TRACKS) {
    assert.match(stageMusic, new RegExp(`todoTrack: "${track.slug}"`));
    assert.ok(musicStageTrackEntries().some((entry) => entry.src.includes(track.slug)));
  }
});

test("the four approved tracks are untouched", () => {
  // The owner's rule: the four shipped soundtracks are never regenerated,
  // re-encoded or renamed. Their measurements are pinned here so any future
  // pass over assets/audio/ that touches them fails loudly.
  const approved = {
    "philly-after-dark.mp3": { ms: 80091, bytes: 1281507 },
    "vet-parking-lot.mp3": { ms: 80091, bytes: 1281507 },
    "neon-sign-war.mp3": { ms: 80065, bytes: 1281089 },
    "subway-after-midnight.mp3": { ms: 80091, bytes: 1281507 },
  };
  for (const [name, expected] of Object.entries(approved)) {
    assert.deepEqual(manifest.shared[name], expected, `${name} is byte-identical`);
    assert.equal(statSync(assetPath(`assets/audio/${name}`)).size, expected.bytes);
  }
  // And they stay in musicTracks ahead of the two new ones, so every saved
  // manual track index (localStorage "final-blow-music-choice") still means
  // the song it meant before.
  const table = slice("const musicTracks = [", "let currentTrackIndex");
  const order = [...table.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ["PHILLY AFTER DARK", "VET PARKING LOT", "NEON SIGN WAR", "SUBWAY AFTER MIDNIGHT"]);
  assert.match(table, /\.\.\.musicStageTrackEntries\(\)/);
});

test("twelve stingers ship in four banks, all inside the 2-4 s brief", () => {
  assert.deepEqual(MUSIC_STINGER_IDS, ["roundstart", "ko", "decision", "matchwin"]);
  const files = musicStingerFiles();
  assert.equal(files.length, 12);
  assert.equal(new Set(files).size, 12);
  for (const [cue, spec] of Object.entries(MUSIC_STINGERS)) {
    assert.ok(spec.takes >= 3, `${cue} needs at least three takes to never repeat`);
    for (let take = 1; take <= spec.takes; take += 1) {
      const path = musicStingerPath(cue, take);
      const entry = audioManifestEntry(parsed, path);
      assert.ok(entry, `${path} is measured in the audio manifest`);
      assert.ok(entry.ms >= 2000 && entry.ms <= 4200, `${path} is a 2-4 s stinger (${entry.ms} ms)`);
      // The table's `seconds` is the measured length; duckMs has to outlast
      // the take or the bed comes back underneath it.
      assert.ok(Math.abs(entry.ms - spec.seconds * 1000) <= 60, `${path} matches the table (${entry.ms} ms)`);
      assert.ok(spec.duckMs > entry.ms, `${cue} duck (${spec.duckMs} ms) outlasts the take`);
      assert.equal(entry.bytes, statSync(assetPath(path)).size);
    }
  }
  // The manifest walks the banks the 1-based announcer way and finds no hole.
  assert.deepEqual(manifest.music.stingers.cues, {
    decision: 3, ko: 3, matchwin: 3, roundstart: 3,
  });
  assert.deepEqual(manifest.gaps, []);
});

test("every round end gets the right stinger, and a Final Blow gets none", () => {
  const { knockout, decision, finisher } = ROUND_END_CAUSES;
  assert.equal(musicStingerForRoundEnd({ cause: knockout }), "ko");
  assert.equal(musicStingerForRoundEnd({ cause: decision }), "decision");
  assert.equal(musicStingerForRoundEnd({ cause: knockout, matchWon: true }), "matchwin");
  // A match closed on the clock is still a match win: the bigger of the two
  // moments is the one the music marks (the announcer still says TIME OVER).
  assert.equal(musicStingerForRoundEnd({ cause: decision, matchWon: true }), "matchwin");
  // The fatality cinematic already ducks the bed to 0.1 for the gore mix.
  assert.equal(musicStingerForRoundEnd({ cause: finisher, finisher: true }), null);
  assert.equal(musicStingerForRoundEnd({ cause: knockout, matchWon: true, finisher: true }), null);
  assert.equal(musicStingerForRoundEnd(), "ko");
  // Every cue it can return is a bank that ships.
  for (const cue of [knockout, decision]) {
    for (const matchWon of [false, true]) {
      const pick = musicStingerForRoundEnd({ cause: cue, matchWon });
      assert.ok(MUSIC_STINGERS[pick], `${pick} is a shipped bank`);
    }
  }
});

test("no stinger take ever follows itself", () => {
  // The bag is the crowd-voice bag (shared on purpose — one no-repeat
  // guarantee, proved once). Three takes, 3000 draws, every reshuffle border
  // crossed many times over.
  let seed = 0x5eed;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (const spec of Object.values(MUSIC_STINGERS)) {
    const bag = createCrowdVoiceBag(spec.takes);
    const counts = new Array(spec.takes).fill(0);
    let previous = -1;
    for (let draw = 0; draw < 3000; draw += 1) {
      const take = crowdVoiceBagDraw(bag, rng);
      assert.notEqual(take, previous, "a stinger take never repeats back to back");
      counts[take] += 1;
      previous = take;
    }
    // And the bag is fair: 3000 draws over 3 takes is 1000 each, exactly.
    assert.deepEqual(counts, new Array(spec.takes).fill(3000 / spec.takes));
  }
});

test("the low-health layer is a real crossfade, not a filter sweep", () => {
  // Target: live fight, either fighter at or under the threshold, and never
  // under a cinematic or a round that is already over.
  const live = { fightLive: true, phase: "fight" };
  assert.equal(dangerStemTarget({ ...live, healths: [100, 100] }), 0);
  assert.equal(dangerStemTarget({ ...live, healths: [100, DANGER_STEM.healthAt] }), 1);
  assert.equal(dangerStemTarget({ ...live, healths: [DANGER_STEM.healthAt - 1, 100] }), 1);
  assert.equal(dangerStemTarget({ ...live, healths: [100, DANGER_STEM.healthAt + 1] }), 0);
  assert.equal(dangerStemTarget({ ...live, phase: "finish", healths: [0, 12] }), 1);
  assert.equal(dangerStemTarget({ ...live, phase: "roundover", healths: [0, 12] }), 0);
  assert.equal(dangerStemTarget({ ...live, phase: "intro", healths: [0, 12] }), 0);
  assert.equal(dangerStemTarget({ ...live, finisher: true, healths: [0, 12] }), 0);
  assert.equal(dangerStemTarget({ fightLive: false, phase: "fight", healths: [0, 0] }), 0);
  assert.equal(dangerStemTarget(), 0);

  // The crossfade: the stem comes up, the bed goes down by the same latch.
  assert.equal(dangerStemBedGain(0), 1);
  assert.equal(dangerStemGain(0), 0);
  assert.ok(Math.abs(dangerStemBedGain(1) - (1 - DANGER_STEM.bedDip)) < 1e-9);
  assert.ok(Math.abs(dangerStemGain(1) - DANGER_STEM.gain) < 1e-9);
  // 34% off the bed is 3.6 dB — audible on a phone speaker, which the old
  // 4.97 -> 12.1 kHz filter open was not.
  const bedDropDb = 20 * Math.log10(dangerStemBedGain(1));
  assert.ok(bedDropDb < -3 && bedDropDb > -4.5, `bed drops ${bedDropDb.toFixed(2)} dB`);
  assert.equal(dangerStemBedGain("nope"), 1);

  // Easing: in inside a second, out slower, both monotonic and clamped.
  let level = 0;
  for (let step = 0; step < 60; step += 1) level = dangerStemStep(level, 1, 1 / 60);
  assert.ok(level > 0.8 && level <= 1, `stem is most of the way in after 1 s (${level.toFixed(3)})`);
  const afterIn = level;
  let out = afterIn;
  for (let step = 0; step < 60; step += 1) out = dangerStemStep(out, 0, 1 / 60);
  assert.ok(out < afterIn && out > 0.2, `stem leaves slower than it arrives (${out.toFixed(3)})`);
  assert.ok(DANGER_STEM.tauOut > DANGER_STEM.tauIn);
  assert.equal(dangerStemStep(0, 0, 1), 0);
  assert.ok(dangerStemStep(1, 1, 1) <= 1);
});

test("the danger stem loops seamlessly at the bar", () => {
  const entry = audioManifestEntry(parsed, DANGER_STEM_PATH);
  assert.ok(entry, "the stem is measured in the audio manifest");
  // Six bars at 100 BPM is 14.400 s; the file carries the encoder's padding
  // on top, which the LAME/Xing header lets the browser trim.
  const barSeconds = (60 / DANGER_STEM.bpm) * 4;
  assert.ok(Math.abs(DANGER_STEM.loopSeconds - barSeconds * DANGER_STEM.bars) < 1e-9);
  assert.ok(entry.ms >= DANGER_STEM.loopSeconds * 1000, "the file is at least the loop");
  assert.ok(entry.ms - DANGER_STEM.loopSeconds * 1000 < 120, "and no more than encoder padding longer");
  assert.equal(entry.bytes, statSync(assetPath(DANGER_STEM_PATH)).size);
});

test("every new music file is on disk and in the manifest", () => {
  const files = musicMediaFiles();
  assert.equal(files.length, 15);
  for (const path of files) {
    assert.ok(path.startsWith("assets/audio/music/"), `${path} lives under the music dir`);
    assert.ok(statSync(assetPath(path)).size > 0, `${path} exists`);
    assert.ok(audioManifestEntry(parsed, path)?.ms > 0, `${path} is measured`);
  }
  // A manifest with no music section still parses (older builds) and simply
  // knows nothing about these paths.
  const legacy = parseAudioManifest({ shared: manifest.shared });
  assert.ok(legacy);
  assert.equal(audioManifestEntry(legacy, DANGER_STEM_PATH), null);
  assert.ok(audioManifestEntry(legacy, "assets/audio/philly-after-dark.mp3"));
});

test("game.js wiring: stingers on both round-start edges and on the round end", () => {
  // Round start: the phase edge in the fixed-step update, and the skip path.
  const tick = slice('  if (state.phase === "intro") {\n    input0 = {};', "  input0 = prepareFighterInput");
  assert.match(tick, /playMusicStinger\("roundstart", \{ source: `round\$\{state\.round\}` \}\)/);
  const skip = slice("function trySkipFightFlow(", "function finishRound(");
  assert.match(skip, /playMusicStinger\("roundstart", \{ source: `round\$\{state\.round\}-skip` \}\)/);

  // Round end: the cue comes from the pure decision, not from a local branch.
  const finish = slice("function finishRound(winner, type = -1) {", "function performFinisher(");
  assert.match(finish, /playMusicStinger\(musicStingerForRoundEnd\(\{ cause, matchWon, finisher: type >= 0 \}\)/);
  // ...and it fires under the KO duck, so the bed is already down for it.
  assert.ok(
    finish.indexOf("duckMusic(0.28, 2600)") < finish.indexOf("playMusicStinger(musicStingerForRoundEnd"),
    "the round-end duck lands before the stinger",
  );
  // The fatality branch stays silent — no stinger call above the else.
  const fatalBranch = finish.slice(finish.indexOf("if (type >= 0) {"), finish.indexOf("} else {"));
  assert.doesNotMatch(fatalBranch, /playMusicStinger/);
});

test("game.js wiring: the stinger channel is its own element and never repeats", () => {
  const play = slice("function playMusicStinger(cue, { source = \"\" } = {}) {", "function stopDangerStem(");
  // Music, not SFX: it obeys the music toggle and slider.
  assert.match(play, /\$\("#musicToggle"\)\?\.checked/);
  assert.match(play, /state\.musicVolume > 0/);
  assert.doesNotMatch(play, /soundToggle|sfxVolume/, "a stinger is music, not an SFX cue");
  // Rollback resimulation must never re-fire presentation.
  assert.match(play, /if \(rollbackResimulating \|\| !cue\) return -1;/);
  // The shuffle bag, not a cursor.
  assert.match(play, /crowdVoiceBagDraw\(bag, visualRandom\)/);
  // The bed steps aside without ever lifting a deeper duck already in flight.
  assert.match(play, /duckMusic\(Math\.min\(spec\.duck, state\.musicDuck\), spec\.duckMs\)/);
  assert.match(play, /audioFxDebug\.stingerPlays \+= 1;/);
  // The stinger elements are their own bank — never in sfxPools, whose
  // round-robin cursor can land the same take twice across pool borders.
  const pools = slice("const sfxPools = Object.fromEntries(", "const fighterSfxPools");
  assert.doesNotMatch(pools, /musicStinger/);
});

test("game.js wiring: the bed loses level exactly when the stem arrives", () => {
  const sync = slice("function syncMusic() {", "function resetMusicDuck(");
  assert.match(sync, /dangerStemBedGain\(dangerStemLevel\)/, "the bed carries its half of the crossfade");
  assert.match(sync, /stopDangerStem\(\);/, "music off / hidden / paused stops the stem too");
  assert.match(sync, /syncDangerStem\(\);/);
  // The stem is a second looping element, not a swap of fightMusic.src.
  const decl = slice("const dangerStem = new Audio(DANGER_STEM_PATH);", "let dangerStemLevel");
  assert.match(decl, /dangerStem\.loop = true;/);
  assert.match(decl, /dangerStem\.volume = 0;/);
  // The pause path stops it as well (setPaused pauses the bed directly).
  const paused = slice("  if (state.paused) {\n    fightMusic.pause();", "  // Wave 15: the wake lock releases");
  assert.match(paused, /stopDangerStem\(\);/);
  // And the old filter ride is still there — the stem is added ON TOP of it,
  // it is the low-health STEP that stopped being filter-only.
  const intensity = slice("function updateMusicIntensity(dt) {", "// --- v5.3 SPECTACLE: music stingers");
  assert.match(intensity, /routing\.filter\.frequency\.setTargetAtTime/);
  assert.match(intensity, /fighter\.health <= 30/);
  // The stem's threshold is the same edge as the filter's, not a second one.
  assert.equal(DANGER_STEM.healthAt, 30);
});

test("game.js wiring: QA can read the stingers and the crossfade", () => {
  const qa = slice("    music() {", "    // v5.3 CROWD DEPTH: drive a stir straight into the crowd");
  assert.match(qa, /lastEvent: lastMusicSting/);
  assert.match(qa, /stingerPlays: audioFxDebug\.stingerPlays/);
  assert.match(qa, /stingerRecent: musicStingerRecent\.slice\(\)/);
  assert.match(qa, /mix: Number\(dangerStemLevel\.toFixed\(3\)\)/);
  assert.match(qa, /enters: audioFxDebug\.dangerStemEnters/);
  // The violence snapshot carries the same totals for the smoke run.
  const snapshot = slice("        musicIntensity: Number(musicIntensityLevel.toFixed(3)),", "        ambienceActive:");
  assert.match(snapshot, /stingerPlays: audioFxDebug\.stingerPlays/);
  assert.match(snapshot, /dangerStemMix: Number\(dangerStemLevel\.toFixed\(3\)\)/);
});
