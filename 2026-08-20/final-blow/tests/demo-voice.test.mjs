import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEMO_COMMENTARY_VOICE,
  DEMO_SIGN_OFF_VOICE,
  DEMO_STAGE_VOICE,
  DEMO_WEAPON_VOICE,
  DEMO_CLOCK_VOICE,
  DEMO_VOICE_KIND_POLICY,
  DEMO_VOICE_MIN_GAP_MS,
  demoCommentarySpeech,
  demoSignOffSpeech,
  demoStageCue,
  demoStreakVoice,
  demoVoiceCaptions,
  demoVoiceFiles,
  demoVoiceGate,
} from "../engine/demo-voice.mjs";
import { DEMO_COMMENTARY_KINDS, DEMO_COMMENTARY_LINES } from "../engine/demo-commentary.mjs";
import { DEMO_SIGN_OFF_LINES } from "../engine/demo-session.mjs";
import { STAGE_WEAPONS } from "../engine/stage-weapons.mjs";

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(gameRoot, path), "utf8");
const TAKE_SUFFIX = /^(.+?)-(\d+|[ab])\.mp3$/; // tools/audio/build_manifest.mjs

test("every painted line has a spoken plan: one per text variant, per kind and per sign-off family", () => {
  for (const kind of DEMO_COMMENTARY_KINDS) {
    assert.equal(DEMO_COMMENTARY_VOICE[kind]?.length, DEMO_COMMENTARY_LINES[kind].length, `${kind}: one plan per line`);
    for (const parts of DEMO_COMMENTARY_VOICE[kind]) assert.ok(parts.length >= 1 && parts.some((part) => part.cue), `${kind}: a plan speaks at least one fragment`);
  }
  for (const [family, lines] of Object.entries(DEMO_SIGN_OFF_LINES)) {
    assert.equal(DEMO_SIGN_OFF_VOICE[family]?.length, lines.length, `${family}: one plan per line`);
  }
  // A line that names a seat in its text names it in speech too — through the
  // reviewed name bank, never a generated take of a fighter's name.
  for (const kind of DEMO_COMMENTARY_KINDS) {
    if (DEMO_VOICE_KIND_POLICY[kind]?.fragmentOnly) continue;
    DEMO_COMMENTARY_LINES[kind].forEach((line, index) => {
      const spoken = DEMO_COMMENTARY_VOICE[kind][index];
      if (/\{(NAME|OTHER|FAV)\}/.test(line)) assert.ok(spoken.some((part) => part.name), `${kind}[${index}] speaks the seat's name bank`);
      for (const part of spoken) if (part.cue) assert.doesNotMatch(part.text, /\{[A-Z]+\}/, "no token survives into a spoken fragment");
    });
  }
});

test("the file list is the manifest's contract: unique, take-suffixed, no a/b kick names, one caption per fragment", () => {
  const files = demoVoiceFiles();
  assert.equal(files.length, 107, "104 fragments + the three clock takes");
  assert.equal(new Set(files.map((entry) => entry.file)).size, files.length);
  for (const entry of files) {
    const match = entry.file.match(TAKE_SUFFIX);
    assert.ok(match, `${entry.file} parses as <cue>-<take>.mp3`);
    assert.equal(match[1], entry.cue, `${entry.file} keeps its cue under the manifest's parser`);
    assert.doesNotMatch(entry.cue, /-[ab]$/, "an a/b tail would read as a kick pair");
    assert.ok(entry.text.length >= 3 && entry.text === entry.text.toUpperCase(), `${entry.cue}: an all-caps line to speak`);
  }
  const captions = demoVoiceCaptions();
  assert.equal(Object.keys(captions).length, 104);
  for (const entry of files.filter((item) => item.cue !== DEMO_CLOCK_VOICE.cue)) assert.deepEqual(captions[entry.cue], [entry.text]);
  assert.deepEqual(DEMO_CLOCK_VOICE.texts, ["TEN SECONDS!", "CLOCK'S RUNNING!", "TIME'S ALMOST UP!"], "MISSING-AUDIO.md Priority 6, verbatim");
  assert.deepEqual(Object.keys(DEMO_STAGE_VOICE).sort(), Object.keys(STAGE_WEAPONS).sort(), "one venue call per stage");
  for (const [stageId, weapon] of Object.entries(STAGE_WEAPONS)) assert.ok(DEMO_WEAPON_VOICE[weapon.id], `${stageId}'s weapon ${weapon.id} has a take`);
});

test("the takes are on disk and in the manifest, at the announcer's length and loudness contract", async () => {
  const manifest = JSON.parse(await read("assets/audio/MANIFEST.json")).announcer;
  for (const entry of demoVoiceFiles()) {
    assert.ok(manifest.files[entry.file], `${entry.file} is in the manifest`);
    const ms = manifest.files[entry.file].ms;
    assert.ok(ms >= 300 && ms <= 6000, `${entry.file} runs ${ms} ms`);
  }
  assert.equal(manifest.cues.tenseconds, 3, "the clock call has its three takes");
  for (const stageId of Object.keys(STAGE_WEAPONS)) assert.equal(manifest.cues[demoStageCue(stageId)], 1);
});

test("a commentary event resolves to cues in order: fragment, the seat's name bank, the weapon's take", () => {
  const ids = ["post", "ali"];
  assert.deepEqual(demoCommentarySpeech({ kind: "first-hit", variant: 0, side: 1 }, { ids }), ["dc-first-hit-1", "ali-name"]);
  assert.deepEqual(demoCommentarySpeech({ kind: "first-hit", variant: 1, side: 0 }, { ids }), ["post-name", "dc-first-hit-2"]);
  assert.deepEqual(demoCommentarySpeech({ kind: "counter", variant: 2, side: 0 }, { ids }), ["ali-name", "dc-counter-3"], "OTHER is the other seat");
  assert.deepEqual(demoCommentarySpeech({ kind: "throw", variant: 2, side: 0 }, { ids }), ["post-name", "dc-throw-3", "ali-name"]);
  assert.deepEqual(demoCommentarySpeech({ kind: "weapon-pickup", variant: 0, side: 0 }, { ids, weaponId: "brick" }), ["post-name", "dc-weapon-pickup-1", "weapon-brick"]);
  assert.equal(demoCommentarySpeech({ kind: "weapon-throw", variant: 0, side: 0 }, { ids, weaponId: "" }), null, "no weapon take, no line");
  assert.deepEqual(demoCommentarySpeech({ kind: "clutch", variant: 0, side: 1 }, { ids }), ["dc-clutch-1", "ali-name", "dc-clutch-1-tail"]);
  assert.deepEqual(demoCommentarySpeech({ kind: "round-start", variant: 3, side: 1 }, { ids }), ["dc-round-start-4", "ali-name"], "FAV is the favourite seat");
  // The round's own calls said the name: the finisher and round-end lines add only their fragment.
  assert.deepEqual(demoCommentarySpeech({ kind: "finisher", variant: 3, side: 0 }, { ids }), ["dc-finisher-4"]);
  assert.deepEqual(demoCommentarySpeech({ kind: "round-end", variant: 0, side: 0 }, { ids }), ["dc-round-end-1"]);
  assert.equal(demoCommentarySpeech({ kind: "round-end", variant: 0, side: 0 }, { ids, matchWon: true }), null, "the -wins bank closed the match");
  assert.equal(demoCommentarySpeech({ kind: "first-hit", variant: 0, side: 0 }, { ids: ["", ""] }), null, "no seat id, no line");
  assert.equal(demoCommentarySpeech({ kind: "not-a-kind", variant: 0 }, { ids }), null);
});

test("the gate: exchange lines wait for a free MC and a gap; the bell's read and the round's fragments ride the queue", () => {
  assert.equal(demoVoiceGate({ kind: "super", now: 10_000, busyUntil: 9_000, lastAt: 0 }), true);
  assert.equal(demoVoiceGate({ kind: "super", now: 10_000, busyUntil: 10_100, lastAt: 0 }), true, "inside the idle slack");
  assert.equal(demoVoiceGate({ kind: "super", now: 10_000, busyUntil: 12_000, lastAt: 0 }), false, "the MC is talking");
  assert.equal(demoVoiceGate({ kind: "super", now: 10_000, busyUntil: 0, lastAt: 10_000 - DEMO_VOICE_MIN_GAP_MS + 1 }), false, "too soon after the last line");
  assert.equal(demoVoiceGate({ kind: "super", now: 10_000, busyUntil: 0, lastAt: 10_000 - DEMO_VOICE_MIN_GAP_MS }), true);
  for (const kind of ["round-start", "round-end", "finisher"]) {
    assert.equal(demoVoiceGate({ kind, now: 10_000, busyUntil: 20_000, lastAt: 9_999 }), true, `${kind} queues behind the round's calls`);
  }
  assert.equal(DEMO_VOICE_KIND_POLICY["round-start"].delayMs, 700, "the room read waits for FIGHT! to land");
});

test("a sign-off resolves to cues: the winner's name bank, the streak lead-in, the loser for the line that names him", () => {
  assert.deepEqual(demoSignOffSpeech({ family: "card", variant: 0, winnerId: "jez", loserId: "alan" }), ["so-card-1", "jez-name", "so-card-1-tail"]);
  assert.deepEqual(demoSignOffSpeech({ family: "plain", variant: 0, winnerId: "jez", loserId: "alan" }), ["jez-name", "so-plain-1", "alan-name"]);
  assert.deepEqual(demoSignOffSpeech({ family: "plain", variant: 3, winnerId: "jez", loserId: "alan" }), ["alan-name", "so-plain-4"]);
  assert.deepEqual(demoSignOffSpeech({ family: "streak", variant: 0, winnerId: "post", loserId: "ali", streak: 3 }), ["so-streak-k3", "post-name", "so-streak-1-tail"]);
  assert.equal(demoStreakVoice(5).cue, "so-streak-k5");
  assert.equal(demoStreakVoice(9).cue, "so-streak-kx", "past five the lead-in is generic");
  assert.deepEqual(demoSignOffSpeech({ family: "main", variant: 3, winnerId: "post", loserId: "ali" }), ["so-main-4"], "a line with no name speaks its fragment alone");
  assert.equal(demoSignOffSpeech({ family: "main", variant: 0, winnerId: "", loserId: "ali" }), null);
  assert.equal(demoStageCue("somerset"), "stage-somerset");
  assert.equal(demoStageCue("nowhere"), "");
});

test("game.js: the pack is demo-gated — one subscription at the bus's creation, the sign-off in the result hold, the venue on the card, the speech floor under the card", async () => {
  const game = await read("game.js");
  const versus = await read("engine/demo-versus.mjs");
  assert.equal(game.split("demoSession.commentary.subscribe(demoVoiceOnCommentary);").length - 1, 1, "one subscription, right after createDemoCommentaryBus");
  assert.match(game, /createDemoCommentaryBus\(\{[\s\S]{0,200}?\}\);\s*\/\/ 5\.4\.1 RINGSIDE[^\n]*\n\s*demoSession\.commentary\.subscribe\(demoVoiceOnCommentary\);/);
  assert.match(game, /function demoVoiceOnCommentary\(event\) \{\s*if \(!demoCommentaryLive\(\) \|\| !event\) return;/, "the listener answers only inside a live demo bus");
  assert.match(game, /demoVoiceGate\(\{ kind: event\.kind, now, busyUntil: announcerBusyUntil, lastAt: demoVoice\.lastAt \}\)/);
  assert.match(game, /if \(!demoSession\.qa\) \{\s*const cues = demoSignOffSpeech\(\{/, "the sign-off is spoken where its text is set, not on a QA demo");
  assert.doesNotMatch(game, /announcerSay\(`\$\{id\}-name`, \{ delay: 1500 \}\)/, "the 5.4 next-pair name reads are gone (the card's corner calls introduce the pair)");
  assert.match(game, /stageCue: demoStageCue\(state\.stage\),/);
  assert.match(game, /announce\(beat\.banner\.main, beat\.banner\.sub, 0\.85, \{ speak: beat\.cue \? \[\{ cue: beat\.cue, delay: 0 \}\] : \[\] \}\);/);
  assert.match(game, /floorMs: demoVersus\.active\s*\? demoVersusSpeechFloor\(\{ floorMs: introArtHold\.floorMs, startedAt: introArtHold\.startedAt, busyUntil: announcerBusyUntil \}\)\s*: introArtHold\.floorMs,/);
  assert.match(game, /Object\.assign\(banks, demoVoiceCaptions\(\)\);\s*return Object\.freeze\(banks\);/, "the captions join ANNOUNCER_LINES");
  assert.doesNotMatch(game, /TODO\(tenseconds-takes\)/, "the clock call's work order is closed");
  assert.match(versus, /cue: stageCue \|\| "",/);
  const sw = await read("sw.js");
  assert.ok(sw.includes('"./engine/demo-voice.mjs"'), "the pack's module ships with the shell");
});
