// 5.4 FIGHT NIGHT (sweep #19 / #22 / #24): the attract demo's audio contract.
// The arming gate and the bed decisions are pure (engine/demo-audio.mjs), the
// stage -> track resolver is pure (engine/music.mjs stageTrackIndex), and the
// game.js wiring is pinned from source: every path that makes a sound asks the
// ONE gate, the two synth paths that used to bypass it no longer do, the card
// hook sits BEFORE both ROUND announces, the listeners arm on the gesture, and
// everything new is behind the demo so a played match is byte-identical.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DeterministicRng } from "../engine/foundation.mjs";
import { drawFromBag } from "../engine/announcer.mjs";
import { createDemoDirector } from "../engine/demo.mjs";
import { musicStageTrackEntries, stageTrackIndex } from "../engine/music.mjs";
import {
  ATTRACT_AUDIO_STATES,
  ATTRACT_BED_FADE_MS,
  DEMO_BED_RESTART_WINDOW_SECONDS,
  attractSoundChip,
  bedFadeStep,
  createAttractAudioGate,
  demoBedLoops,
  demoBedRestartAtCard,
  demoVoiceDrawsFromBag,
  gestureArmsAudio,
} from "../engine/demo-audio.mjs";

const gameRoot = fileURLToPath(new URL("..", import.meta.url));
const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function slice(start, end) {
  const from = gameSource.indexOf(start);
  assert.ok(from >= 0, `game.js should contain ${start}`);
  const to = gameSource.indexOf(end, from + start.length);
  assert.ok(to > from, `game.js should close ${start} with ${end}`);
  return gameSource.slice(from, to + end.length);
}

function functionBody(name) {
  const from = gameSource.indexOf(`function ${name}(`);
  assert.ok(from >= 0, `game.js should define ${name}`);
  const to = gameSource.indexOf("\n}\n", from);
  return gameSource.slice(from, to + 3);
}

// --- the arming gate -------------------------------------------------------

test("a cold attract show holds until a gesture, then opens at the NEXT round card", () => {
  const gate = createAttractAudioGate();
  assert.equal(gate.beginShow({ unlocked: false }), ATTRACT_AUDIO_STATES.cold);
  // Round 1 card and bell with no gesture: nothing opens.
  assert.equal(gate.roundCard(), false);
  gate.bell();
  assert.equal(gate.live(), false);
  // The viewer taps mid-exchange: armed, still silent (never mid-fight).
  assert.equal(gate.gesture(), false);
  assert.equal(gate.snapshot().state, ATTRACT_AUDIO_STATES.armed);
  assert.equal(gate.live(), false);
  // The round 2 card is the first sound.
  assert.equal(gate.roundCard(), true);
  assert.equal(gate.live(), true);
  assert.deepEqual(gate.snapshot(), { state: "live", cardOpen: true, liveReason: "card", opens: 1 });
  // A second card does not "open" again.
  assert.equal(gate.roundCard(), false);
  assert.equal(gate.snapshot().opens, 1);
});

test("a gesture while the round card is still up joins that same bell", () => {
  const gate = createAttractAudioGate();
  gate.beginShow();
  gate.roundCard();
  assert.equal(gate.gesture(), true, "the bell is still ahead — go live under this card");
  assert.equal(gate.snapshot().liveReason, "gesture-at-card");
  // ...but not once FIGHT! has been called.
  const late = createAttractAudioGate();
  late.beginShow();
  late.roundCard();
  late.bell();
  assert.equal(late.gesture(), false);
  assert.equal(late.live(), false);
  assert.equal(late.roundCard(), true);
});

test("a page with a gesture behind it opens armed: sound from the show's first card", () => {
  const gate = createAttractAudioGate();
  assert.equal(gate.beginShow({ unlocked: true }), ATTRACT_AUDIO_STATES.armed);
  assert.equal(gate.live(), false, "still nothing before the card");
  assert.equal(gate.roundCard(), true);
  assert.equal(gate.snapshot().liveReason, "card");
});

test("the exit gesture arms the NEXT idle cycle; a show's end keeps the arming", () => {
  const gate = createAttractAudioGate();
  gate.beginShow();
  gate.roundCard();
  gate.bell();
  gate.gesture(); // the exit key: armed
  assert.equal(gate.endShow(), ATTRACT_AUDIO_STATES.armed);
  // 45 s later the next attract cycle begins on a page that is armed.
  assert.equal(gate.beginShow({ unlocked: true }), ATTRACT_AUDIO_STATES.armed);
  assert.equal(gate.roundCard(), true, "the next cycle's first card sounds");
  // A live show that ends drops back to armed, never to cold.
  assert.equal(gate.endShow(), ATTRACT_AUDIO_STATES.armed);
  assert.equal(gate.beginShow(), ATTRACT_AUDIO_STATES.armed);
  assert.equal(gate.snapshot().cardOpen, false, "beginShow closes any stale card window");
});

test("the chip copy follows the gate and only the attract show wears it", () => {
  assert.equal(attractSoundChip({ attract: true, state: "cold" }), "TAP FOR SOUND");
  assert.equal(attractSoundChip({ attract: true, state: "armed" }), "SOUND AT THE BELL");
  assert.equal(attractSoundChip({ attract: true, state: "live" }), "");
  assert.equal(attractSoundChip({ attract: false, state: "cold" }), "", "a WATCH DEMO from the button has its gesture");
  assert.equal(attractSoundChip(), "");
});

test("only gestures Chrome counts as activation arm the gate", () => {
  // The sticky flag is the truth wherever it exists.
  assert.equal(gestureArmsAudio({ trusted: true, type: "pointerdown", pointerType: "touch", hasBeenActive: true }), true);
  assert.equal(gestureArmsAudio({ trusted: true, type: "keydown", code: "KeyQ", hasBeenActive: false }), false);
  // Without it, Chrome's table.
  assert.equal(gestureArmsAudio({ trusted: true, type: "keydown", code: "KeyQ" }), true);
  assert.equal(gestureArmsAudio({ trusted: true, type: "keydown", code: "Escape" }), false);
  assert.equal(gestureArmsAudio({ trusted: true, type: "pointerdown", pointerType: "mouse" }), true);
  assert.equal(gestureArmsAudio({ trusted: true, type: "pointerdown", pointerType: "touch" }), false, "a touch press is not activation");
  assert.equal(gestureArmsAudio({ trusted: true, type: "pointerup", pointerType: "touch" }), true, "its release is");
  assert.equal(gestureArmsAudio({ trusted: true, type: "click" }), true);
  assert.equal(gestureArmsAudio({ trusted: true, type: "pointermove" }), false);
  // Synthetic events never do — even with a flag claiming activation.
  assert.equal(gestureArmsAudio({ trusted: false, type: "pointerdown", hasBeenActive: true }), false);
  assert.equal(gestureArmsAudio(), false);
});

test("the bed fade-in is linear over ATTRACT_BED_FADE_MS and idle at 1", () => {
  let level = 0;
  let steps = 0;
  while (level < 1) {
    level = bedFadeStep(level, 1 / 60);
    steps += 1;
  }
  assert.ok(Math.abs(steps / 60 - ATTRACT_BED_FADE_MS / 1000) < 0.05, `fade took ${steps} frames`);
  assert.equal(bedFadeStep(1, 1 / 60), 1);
  assert.equal(bedFadeStep(0.5, -1), 0.5, "a negative dt never rewinds");
  assert.equal(bedFadeStep(0, 10), 1, "clamped");
});

// --- the bed ---------------------------------------------------------------

test("only the demo loops its bed and draws voice from the bag", () => {
  for (const mode of ["arcade", "versus", "survival", "team", "training", "online", "daily", "tournament", "", undefined]) {
    assert.equal(demoBedLoops(mode), false, `${mode} must keep the AUTO jukebox`);
    assert.equal(demoVoiceDrawsFromBag(mode), false, `${mode} must keep the round-robin cursor`);
  }
  assert.equal(demoBedLoops("demo"), true);
  assert.equal(demoVoiceDrawsFromBag("demo"), true);
});

test("the bed restarts under a round card only when a round would outrun it", () => {
  const duration = 80.091;
  assert.equal(demoBedRestartAtCard({ currentTime: 0, duration }), false, "a fresh bed never restarts");
  assert.equal(demoBedRestartAtCard({ currentTime: 20, duration }), false);
  assert.equal(demoBedRestartAtCard({ currentTime: duration - DEMO_BED_RESTART_WINDOW_SECONDS + 0.5, duration }), true);
  assert.equal(demoBedRestartAtCard({ currentTime: 79, duration }), true);
  assert.equal(demoBedRestartAtCard({ currentTime: 79, duration: NaN }), false, "no metadata yet: leave it");
  assert.equal(demoBedRestartAtCard({ currentTime: 79, duration: Infinity }), false, "a stream: leave it");
  assert.equal(demoBedRestartAtCard(), false);
});

function stageMusicTable() {
  // The exact table game.js ships, evaluated (the music tests slice it the same way).
  const body = slice("const STAGE_MUSIC = Object.freeze({", "\n});").replace("const STAGE_MUSIC = ", "return ");
  return new Function(body)();
}

const approvedTracks = [
  { title: "PHILLY AFTER DARK", src: "assets/audio/philly-after-dark.mp3" },
  { title: "VET PARKING LOT", src: "assets/audio/vet-parking-lot.mp3" },
  { title: "NEON SIGN WAR", src: "assets/audio/neon-sign-war.mp3" },
  { title: "SUBWAY AFTER MIDNIGHT", src: "assets/audio/subway-after-midnight.mp3" },
];
const ownTheme = {
  somerset: "PHILLY AFTER DARK",
  vet: "VET PARKING LOT",
  wildwood: "BOARDWALK NEON",
  buffet: "NEON SIGN WAR",
  cruise: "DECK PARTY DISASTER",
  janney: "SUBWAY AFTER MIDNIGHT",
};

test("stageTrackIndex is the 1.6 resolver: todoTrack file first, mapped title next, fallback last", () => {
  const stageMusic = stageMusicTable();
  const tracks = [...approvedTracks, ...musicStageTrackEntries()];
  for (const [stage, title] of Object.entries(ownTheme)) {
    assert.equal(tracks[stageTrackIndex(stage, { stageMusic, tracks, fallback: 0 })].title, title, stage);
  }
  // Without the 5.3 files the two planned stages borrow their mapped title.
  assert.equal(approvedTracks[stageTrackIndex("wildwood", { stageMusic, tracks: approvedTracks })].title, "NEON SIGN WAR");
  assert.equal(approvedTracks[stageTrackIndex("cruise", { stageMusic, tracks: approvedTracks })].title, "SUBWAY AFTER MIDNIGHT");
  assert.equal(stageTrackIndex("nowhere", { stageMusic, tracks, fallback: 3 }), 3);
  assert.equal(stageTrackIndex("somerset", { stageMusic, tracks: [], fallback: 2 }), 2);
});

test("the demo bed is the stage's own theme in 600 of 600 director cycles (was 103)", () => {
  // Sweep #22's measurement, reproduced: the same five seeds, 120 cycles each.
  const stageMusic = stageMusicTable();
  const tracks = [...approvedTracks, ...musicStageTrackEntries()];
  const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil", "sonny"];
  const stages = Object.keys(ownTheme);
  let cycles = 0;
  let directorMatched = 0;
  let stageMatched = 0;
  for (const seed of [1, 237, 1234, 9001, 42]) {
    const director = createDemoDirector({ fighterIds: fighters, stageIds: stages, trackCount: tracks.length, seed });
    for (let index = 0; index < 120; index += 1) {
      const cycle = director.next();
      cycles += 1;
      // What 5.3 played: the director's own track bag.
      if (tracks[cycle.track].title === ownTheme[cycle.stage]) directorMatched += 1;
      // What 5.4 plays: the stage resolver.
      if (tracks[stageTrackIndex(cycle.stage, { stageMusic, tracks, fallback: 0 })].title === ownTheme[cycle.stage]) stageMatched += 1;
    }
  }
  assert.equal(cycles, 600);
  assert.equal(stageMatched, 600);
  assert.ok(directorMatched < 130, `the director's bag agreed with the stage ${directorMatched}/600 times — that was the bug`);
});

// --- fighter voice: the bag in the demo ------------------------------------

test("a three-take bank drawn through the bag never repeats a take back to back", () => {
  const rng = new DeterministicRng(4242);
  const bags = new Map();
  const draws = Array.from({ length: 300 }, () => drawFromBag(bags, "jez:hit-heavy", 3, () => rng.nextFloat()));
  for (let index = 1; index < draws.length; index += 1) {
    assert.notEqual(draws[index], draws[index - 1], `draw ${index} repeated take ${draws[index]}`);
  }
  // Every take once per bag of three, so no take starves.
  for (let index = 0; index + 3 <= draws.length; index += 3) assert.equal(new Set(draws.slice(index, index + 3)).size, 3);
  // ...and it is NOT the 1,2,3,1,2,3 cursor.
  assert.notDeepEqual(draws.slice(0, 12), [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
  // Seeded: the same seed replays the same takes.
  const again = new DeterministicRng(4242);
  const bagsReplay = new Map();
  const replay = Array.from({ length: 300 }, () => drawFromBag(bagsReplay, "jez:hit-heavy", 3, () => again.nextFloat()));
  assert.deepEqual(replay, draws);
});

// --- the game.js wiring, pinned from source --------------------------------

test("every audio path asks the ONE attract gate and the two synth bypasses are closed", () => {
  assert.doesNotMatch(gameSource, /demoSession\.attract && !state\.audioUnlocked/, "the old per-site flag check is gone");
  const gated = ["sound", "impactAudioAllowed", "playCrowdVoice", "playMusicStinger", "announcerSay", "fighterTauntCue",
    "perfectGuardTink", "objectSound", "audioContextRunning", "syncMusic"];
  for (const name of gated) assert.match(functionBody(name), /attractAudioHeld\(\)/, `${name} must ask attractAudioHeld()`);
  assert.match(functionBody("attractAudioHeld"), /return demoSession\.attract && !attractAudio\.live\(\);/);
  // The beds and the ko horn hold with it.
  assert.match(functionBody("updateAmbienceAudio"), /ambienceEngaged = wantScreens && soundOn && !attractAudioHeld\(\);/);
  assert.match(functionBody("updateCrowdAudio"), /fightLive && soundOn && !attractAudioHeld\(\) && state\.stage === "cruise"/);
});

test("the card hook runs BEFORE both ROUND announces and the bell closes the window on both FIGHT edges", () => {
  const startMatch = functionBody("startMatch");
  assert.ok(startMatch.indexOf("demoRoundCard();") < startMatch.indexOf("announce(introMain, introLabel, 1.2);"));
  const resetRound = functionBody("resetRound");
  assert.ok(resetRound.indexOf("demoRoundCard();") < resetRound.indexOf("announce(`ROUND ${state.round}`"));
  assert.match(gameSource, /demoBell\(\);\n\s+playMusicStinger\("roundstart", \{ source: `round\$\{state\.round\}` \}\);/);
  assert.match(gameSource, /demoBell\(\);\n\s+playMusicStinger\("roundstart", \{ source: `round\$\{state\.round\}-skip` \}\);/);
  // The gate opens in the card hook, and opening drops the bed to 0 for the fade.
  assert.match(functionBody("demoRoundCard"), /if \(attractAudio\.roundCard\(\)\) attractAudioOpened\("card"\);/);
  assert.match(functionBody("attractAudioOpened"), /bedFadeLevel = 0;/);
});

test("the listeners arm on the gesture: exit key, any press, the chip, and a touch release", () => {
  const keydown = slice('window.addEventListener("keydown", (event) => {', "\n});");
  assert.ok(keydown.indexOf("armAttractAudio(event);") < keydown.indexOf("handleDemoSpeedKey(event)"), "arm before the transport claims keys");
  assert.match(gameSource, /document\.addEventListener\("pointerdown", \(event\) => \{\n\s+if \(attractSoundChipPress\(event\)\) return;\n\s+armAttractAudio\(event\);\n\s+if \(isDemoShareTarget\(event\)\) return;\n\s+noteUserActivity\(\);\n\}, true\);/);
  assert.match(gameSource, /document\.addEventListener\("pointerup", \(event\) => \{ armAttractAudio\(event\); \}, true\);/);
  assert.match(functionBody("attractSoundChipPress"), /closest\?\.\("#demoHudSound"\)/);
  // The chip lives on the demo HUD, is the one thing on it that takes a pointer, and survives the phone layout.
  assert.match(indexSource, /<button type="button" id="demoHudSound" class="demo-hud-sound" hidden>TAP FOR SOUND<\/button>/);
  assert.match(stylesSource, /\.demo-hud-sound \{[^}]*pointer-events: auto;/);
  assert.match(stylesSource, /\.demo-hud \{ left: 2\.2%;[^\n]*\n(?:[^\n]*\n){1,4}\s+\.demo-hud-sound \{ font-size/);
  // gestureArmsAudio reads the sticky flag; play() is never attempted on a synthetic event.
  assert.match(functionBody("armAttractAudio"), /navigator\.userActivation\?\.hasBeenActive/);
  assert.match(functionBody("armAttractAudio"), /trusted: Boolean\(event\?\.isTrusted\)/);
});

test("the demo's bed is the stage track, loops, and never advances the jukebox", () => {
  assert.doesNotMatch(gameSource, /setTrack\(cycle\.track/, "the director's track bag no longer picks the bed");
  const startMatch = functionBody("startMatch");
  assert.match(startMatch, /\n  applyAutoStageMusic\(\);/);
  assert.doesNotMatch(startMatch, /if \(state\.mode !== "demo"\) applyAutoStageMusic\(\);/);
  assert.match(functionBody("syncMusic"), /fightMusic\.loop = state\.musicChoice !== "auto" \|\| demoBedLoops\(state\.mode\);/);
  assert.match(gameSource, /if \(state\.musicChoice === "auto" && !demoBedLoops\(state\.mode\)\) advanceTrack\(\);/);
  assert.match(functionBody("demoRoundCard"), /demoBedRestartAtCard\(\{ currentTime: fightMusic\.currentTime, duration: fightMusic\.duration \}\)/);
  assert.match(functionBody("stageMusicTrackIndex"), /stageTrackIndex\(stageId, \{ stageMusic: STAGE_MUSIC, tracks: musicTracks, fallback: currentTrackIndex \}\)/);
});

test("everything new is behind the demo, so a played match is byte-identical", () => {
  // The card hook and the bell return before touching anything outside the demo.
  assert.match(functionBody("demoRoundCard"), /if \(rollbackResimulating \|\| state\.mode !== "demo"\) return;/);
  assert.match(functionBody("demoBell"), /if \(rollbackResimulating \|\| !demoSession\.attract\) return;/);
  // The gate is only consulted behind demoSession.attract (attractAudioHeld) and beginShow only runs for attract.
  assert.match(functionBody("startDemo"), /if \(demoSession\.attract\) attractAudio\.beginShow\(\{ unlocked: state\.audioUnlocked \}\);/);
  assert.match(functionBody("armAttractAudio"), /if \(!\(demoSession\.attract \|\| state\.screen === "title"\)\) return false;/);
  // bedFadeLevel only ever leaves 1 inside the gate's opening.
  const drops = gameSource.match(/bedFadeLevel = 0;/g) || [];
  assert.equal(drops.length, 1);
  assert.match(functionBody("attractAudioOpened"), /bedFadeLevel = 0;/);
  // The voice bag is the demo's; the cursor stays for everyone else.
  const take = functionBody("fighterVoiceTake");
  assert.match(take, /if \(demoVoiceDrawsFromBag\(state\.mode\)\) \{\n\s+\/\/[^\n]*\n(?:\s+\/\/[^\n]*\n)*\s+variantIndex = drawFromBag\(fighterVoiceBags, cursorKey, bank\.srcs\.length, visualRandom\);/);
  assert.match(take, /\} else \{\n\s+const cursor = fighterSfxCursors\.get\(cursorKey\) \|\| 0;\n\s+fighterSfxCursors\.set\(cursorKey, cursor \+ 1\);\n\s+variantIndex = cursor % bank\.srcs\.length;/);
  // The engine module is cached with the shell.
  assert.match(workerSource, /"\.\/engine\/demo-audio\.mjs",/);
  assert.ok(gameRoot.length > 0);
});
