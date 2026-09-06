import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createCrowd, CROWD_SPRITE_BANKS, STAGE_CROWD_VARIANT } from "../engine/crowd.mjs";
import {
  CROWD_KO_HOLD,
  CROWD_VOICE_CUES,
  CROWD_VOICE_CUE_IDS,
  CROWD_VOICE_TIERS,
  createCrowdVoiceBag,
  crowdKoHoldColumn,
  crowdKoHoldReaction,
  crowdVoiceBagDraw,
  crowdVoiceCueFor,
  crowdVoiceFiles,
  crowdVoiceLevel,
  crowdVoicePath,
} from "../engine/crowd-voice.mjs";
import { crowdDrawReaction, crowdKoHoldLive } from "../engine/crowd-reaction.mjs";

// v5.1 KO MOMENT — the crowd celebrates the KO and sounds like people.
// Sweep items #14 (the roundover hold played to a crowd already back on its
// routes) and #24 (every crowd sound was filtered noise).

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const gameSource = readFileSync(join(gameRoot, "game.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(gameRoot, "assets", "audio", "crowd", "MANIFEST.json"), "utf8"));

// Seeded LCG so the bag proof is reproducible.
function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

// The painted-cell rule crowdSpriteFrame applies outside the hold: cheer (2)
// strictly past the person's own threshold. Mirrors game.js so the
// measurement below is the one the renderer makes.
function cheerShare(crowd, reaction) {
  const people = crowd.people.filter((person) => person.sprite);
  const up = people.filter((person) => reaction > person.sprite.reactThreshold).length;
  return up / Math.max(1, people.length);
}

test("the voice bank ships three takes per cue, all under four seconds, all registered", () => {
  assert.deepEqual(CROWD_VOICE_CUE_IDS, ["gasp", "ooh", "roar", "cheer"]);
  assert.deepEqual(manifest.takes, { gasp: 3, ooh: 3, roar: 3, cheer: 3 });
  const files = crowdVoiceFiles();
  assert.equal(files.length, 12);
  for (const [cue, spec] of Object.entries(CROWD_VOICE_CUES)) {
    assert.equal(spec.takes, manifest.takes[cue]);
    let longest = 0;
    for (let take = 1; take <= spec.takes; take += 1) {
      const path = crowdVoicePath(cue, take);
      assert.ok(files.includes(path));
      assert.ok(existsSync(join(gameRoot, path)), `${path} must ship`);
      const bytes = statSync(join(gameRoot, path)).size;
      assert.ok(bytes > 10_000 && bytes < 80_000, `${path} is ${bytes} bytes; a mono 96k take is 18-49 KB`);
      const measured = manifest.measured[`${cue}-${take}`];
      assert.ok(measured, `${cue}-${take} must be measured in the manifest`);
      assert.ok(measured.seconds <= 4.05, `${cue}-${take} runs ${measured.seconds}s; the cap is ~4 s`);
      // Normalised: -14 LUFS target, every take within 3 LU of it and never
      // over 0 dBTP by more than the encoder's rounding.
      assert.ok(Math.abs(measured.lufs + 14) <= 3, `${cue}-${take} sits at ${measured.lufs} LUFS`);
      assert.ok(measured.truePeak <= 0.1, `${cue}-${take} peaks at ${measured.truePeak} dBTP`);
      longest = Math.max(longest, measured.seconds);
    }
    assert.equal(spec.seconds, longest, `${cue}.seconds must be the longest measured take`);
    assert.ok(spec.volume > 0 && spec.volume <= 1);
    assert.ok(spec.minGapMs >= spec.busyMs, `${cue} must not re-fire inside its own busy window`);
  }
  // The reviewed takes are untouched: the bank lives in its own directory
  // and is registered through the game's own table, not sw.js's shell.
  assert.match(gameSource, /const crowdVoiceAssets = Object\.freeze\(crowdVoiceFiles\(\)\)/);
  const worker = readFileSync(join(gameRoot, "sw.js"), "utf8");
  assert.doesNotMatch(worker, /audio\/crowd/, "runtime media stays out of the install shell");
});

test("stir amounts map to gasp / ooh / roar tiers with the level tied to the amount", () => {
  assert.deepEqual(CROWD_VOICE_TIERS, { roar: 1.2, ooh: 0.7, gasp: 0.5 });
  // Under the swell latch: silent.
  assert.equal(crowdVoiceCueFor(0.12), null); // light hit
  assert.equal(crowdVoiceCueFor(0.34), null); // heavy hit
  assert.equal(crowdVoiceCueFor(0.25), null); // taunt (voiced by its own hook)
  assert.equal(crowdVoiceCueFor(0.56), "gasp"); // special
  assert.equal(crowdVoiceCueFor(0.62), "gasp"); // throw
  assert.equal(crowdVoiceCueFor(0.68), "gasp"); // weapon
  assert.equal(crowdVoiceCueFor(0.75), "ooh"); // wall bounce
  assert.equal(crowdVoiceCueFor(1.05), "ooh"); // super
  assert.equal(crowdVoiceCueFor(1.4), "roar"); // FINISH / KO
  assert.equal(crowdVoiceCueFor(1.5), "roar"); // fatal blow
  assert.equal(crowdVoiceCueFor(NaN), null);
  // Level: monotonic, floored at 0.4, capped at 1.
  let previous = -1;
  for (const amount of [0, 0.25, 0.56, 0.75, 1.05, 1.4, 1.5, 1.6, 3]) {
    const level = crowdVoiceLevel(amount);
    assert.ok(level >= 0.4 && level <= 1, `${amount} -> ${level}`);
    assert.ok(level >= previous, "level never falls as the amount rises");
    previous = level;
  }
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.002, `${actual} !~ ${expected}`);
  near(crowdVoiceLevel(0.56), 0.61); // special's gasp
  near(crowdVoiceLevel(1.05), 0.794); // super's ooh
  near(crowdVoiceLevel(1.4), 0.925); // the KO roar
  assert.equal(crowdVoiceLevel(1.6), 1);
});

test("the take bag never repeats back to back and plays every take once per bag", () => {
  for (const seed of [1, 7, 99, 2024, 65535]) {
    const rng = lcg(seed);
    const bag = createCrowdVoiceBag(3);
    const draws = [];
    for (let index = 0; index < 300; index += 1) draws.push(crowdVoiceBagDraw(bag, rng));
    for (let index = 1; index < draws.length; index += 1) {
      assert.notEqual(draws[index], draws[index - 1], `seed ${seed}: take ${draws[index]} repeated at draw ${index}`);
    }
    for (let start = 0; start + 3 <= draws.length; start += 3) {
      assert.deepEqual([...draws.slice(start, start + 3)].sort(), [0, 1, 2], `seed ${seed}: bag at ${start} must hold every take`);
    }
  }
  // A one-take bank is the only bank allowed to repeat.
  const single = createCrowdVoiceBag(1);
  assert.equal(crowdVoiceBagDraw(single, lcg(3)), 0);
  assert.equal(crowdVoiceBagDraw(single, lcg(3)), 0);
});

test("the KO hold ramps past every painted threshold in 20 ticks and holds for the roundover", () => {
  assert.equal(CROWD_KO_HOLD.holdTicks, 294, "4.9 s at 60 Hz — finishRound's plain-KO hold");
  assert.equal(crowdKoHoldReaction(-1), 0, "not latched");
  assert.equal(crowdKoHoldReaction(NaN), 0);
  // Opens AT the lowest threshold (strictly-greater rule: nobody up on tick 0)
  // and climbs past the highest (0.8) by the end of the ramp.
  assert.equal(crowdKoHoldReaction(0), 0.3);
  assert.ok(crowdKoHoldReaction(10) > 0.3 && crowdKoHoldReaction(10) < 0.95);
  assert.equal(crowdKoHoldReaction(CROWD_KO_HOLD.rampTicks), 0.95);
  for (const age of [20, 60, 150, 293, 294, 400]) assert.equal(crowdKoHoldReaction(age), 0.95);
  // Person by person: threshold t goes up at tick (t - 0.3) / 0.65 * 20.
  const early = { reactThreshold: 0.35, shiftPeriod: 300, shiftLength: 60, shiftOffset: 100 };
  const late = { reactThreshold: 0.79, shiftPeriod: 300, shiftLength: 60, shiftOffset: 100 };
  assert.equal(crowdKoHoldColumn(early, 0, crowdKoHoldReaction(0)), -1, "nobody on tick 0");
  assert.equal(crowdKoHoldColumn(early, 3, crowdKoHoldReaction(3)), 2, "the keenest are up inside 3 ticks");
  assert.equal(crowdKoHoldColumn(late, 3, crowdKoHoldReaction(3)), -1, "the slowest are still down");
  assert.equal(crowdKoHoldColumn(late, 20, crowdKoHoldReaction(20)), 2, "everyone by the end of the ramp");
  assert.equal(crowdKoHoldColumn(null, 20, 0.95), -1);
});

test("through the hold ~85% of a real crowd rides the cheer cell every tick, the rest pump", () => {
  const stages = Object.entries(STAGE_CROWD_VARIANT).filter(([, variant]) => CROWD_SPRITE_BANKS[variant]);
  assert.ok(stages.length >= 4, "every painted stage takes part");
  for (const [stageId] of stages) {
    let before = 0;
    let holdMin = 1;
    let holdMax = 0;
    let holdSum = 0;
    let holdSamples = 0;
    let stagger = 0;
    let seeds = 0;
    let smallestCrowd = Infinity;
    for (let seed = 1; seed <= 20; seed += 1) {
      const crowd = createCrowd(stageId, { seed });
      const people = crowd.people.filter((person) => person.sprite);
      if (!people.length) continue;
      seeds += 1;
      smallestCrowd = Math.min(smallestCrowd, people.length);
      // The pre-5.1 KO: a heavy hit's 0.34 stir, decaying 0.016/tick.
      before += cheerShare(crowd, 0.34);
      // Halfway through the ramp a real share is up and a real share is not.
      const midShare = cheerShare(crowd, crowdKoHoldReaction(10));
      if (midShare > 0.15 && midShare < 0.85) stagger += 1;
      for (const age of [20, 21, 37, 60, 101, 150, 222, 293]) {
        const reaction = crowdKoHoldReaction(age);
        const columns = people.map((person) => crowdKoHoldColumn(person.sprite, 5000 + age, reaction));
        assert.ok(columns.every((column) => column === 1 || column === 2), `${stageId} seed ${seed}: everyone past threshold at tick ${age}`);
        const share = columns.filter((column) => column === 2).length / columns.length;
        holdMin = Math.min(holdMin, share);
        holdMax = Math.max(holdMax, share);
        holdSum += share;
        holdSamples += 1;
      }
    }
    assert.ok(seeds >= 15, `${stageId} must have a painted crowd`);
    const beforeShare = before / seeds;
    // v5.3 CROWD DEPTH pin change: the bound is a SHARE, so on a small crowd
    // it has to allow the granularity of a single person. Somerset's living
    // crowd is 8 bystanders, and one of them past his own threshold IS 12.5%
    // — the flat 0.12 was measuring crowd size, not the reaction. The 32- and
    // 44-person stages still measure 6-10% against the original bound.
    const beforeBound = Math.max(0.12, 1.05 / smallestCrowd);
    assert.ok(beforeShare < beforeBound, `${stageId}: the old heavy-KO put ${(beforeShare * 100).toFixed(1)}% up (the sweep measured 6-10%)`);
    // The pump window is half a person's shift window (22-57 ticks) out of
    // their shift period (200-540), so ~11% are pumping on an average tick;
    // a 16-person crowd fluctuates around that, hence the mean plus a floor.
    const holdMean = holdSum / holdSamples;
    assert.ok(holdMean >= 0.8, `${stageId}: mean arms-up share ${(holdMean * 100).toFixed(1)}% during the hold`);
    // v5.3 CROWD DEPTH pin change: same reason as the beforeShare bound. The
    // pump rate is unchanged (mean 88.4% on Somerset against 88.3-88.6% on the
    // 32/44-person stages), but on 8 bystanders four people happening to sit
    // in their own pump window at one sampled tick IS a 50% share. The floor
    // therefore steps with the sample: 0.6 where there are enough people for
    // it to mean anything, 0.45 on a small crowd.
    const holdFloor = smallestCrowd >= 16 ? 0.6 : 0.45;
    assert.ok(holdMin >= holdFloor, `${stageId}: arms-up share dipped to ${(holdMin * 100).toFixed(1)}% during the hold`);
    // Measured 2026-09-05 over 20 seeds: mean 88.3-88.6%, min 65.6-72.7%,
    // and single ticks at 100% (nobody in their pump window) on every stage.
    assert.ok(holdMax >= 0.95, `${stageId}: the ramp must put nearly everyone up at some tick (${(holdMax * 100).toFixed(1)}%)`);
    assert.ok(holdMean <= 0.95, `${stageId}: ${(holdMean * 100).toFixed(1)}% frozen arms-up — the pump never fired`);
    assert.ok(stagger >= seeds * 0.8, `${stageId}: the ramp must stagger the arms (${stagger}/${seeds} seeds)`);
  }
});

test("game.js latches the hold render-side, stirs the KO in the sim and voices the crowd", () => {
  // finishRound: the round-winning hit is a 1.4 "ko" stir, sim path, before
  // the finisher / plain-KO fork.
  const finish = gameSource.slice(gameSource.indexOf("function finishRound("), gameSource.indexOf("function performFinisher("));
  // v5.3 CROWD DEPTH pin change: the KO stir now names its author (the round
  // winner) and the splat point (the fighter who went down), so the crowd can
  // split into his half and the loser's half. Amount and tag are unchanged.
  assert.match(finish, /state\.phase = "roundover";[\s\S]*?stirCrowd\(1\.4, "ko", \{ side: winner, splatX: state\.fighters\[1 - winner\]\?\.x \?\? null \}\);[\s\S]*?if \(type >= 0\)/);
  // The hold latch is a render-side observer of the phase edge, like the
  // round-win beat, and every crowd consumer reads crowdDrawReaction().
  // v5.3 (sweep #52): the latch, the age and the hold-vs-stir read are
  // engine/crowd-reaction.mjs; game.js supplies the phase and the tick. The
  // curve itself is asserted directly rather than through the shape of the
  // expression that reads it.
  assert.match(gameSource, /function updateCrowdKoHoldLatch\(\) \{\s*\n\s*latchCrowdKoHold\(crowdKoHold, crowdKoHoldLive\(state\), state\.simulationTick\);/);
  assert.equal(crowdKoHoldLive({ screen: "fight", phase: "roundover" }), true);
  assert.equal(crowdKoHoldLive({ screen: "fight", phase: "roundover", finisher: { slowMotionHits: 0 } }), false,
    "hushed through the pre-kill cinematic");
  assert.match(gameSource, /function crowdDrawReaction\(\) \{\s*\n\s*return crowdHoldReaction\(state\.crowdReaction, crowdKoHoldAge\(\)\);/);
  assert.equal(crowdDrawReaction(0, 40), CROWD_KO_HOLD.peak, "the hold owns the room once the stir has decayed");
  assert.equal(crowdDrawReaction(1.4, 0), 1.4, "and never dips below the stir that latched it");
  const drawCrowd = gameSource.slice(gameSource.indexOf("function drawCrowd("), gameSource.indexOf("function drawCrowd(") + 1600);
  assert.match(drawCrowd, /updateCrowdKoHoldLatch\(\);\s*const reaction = crowdDrawReaction\(\);/);
  const billboards = gameSource.slice(gameSource.indexOf("function crowdBillboards("), gameSource.indexOf("function drawTailgateProps("));
  assert.match(billboards, /updateCrowdKoHoldLatch\(\);\s*const reaction = crowdDrawReaction\(\);/, "CINEMA 3D reads the held reaction");
  assert.match(billboards, /scuffleMembers\(group, frame, reaction, celebrate\)/);
  const audio = gameSource.slice(gameSource.indexOf("function updateCrowdAudio("), gameSource.indexOf("function updateCrowdAudio(") + 3200);
  assert.match(audio, /clamp\(crowdDrawReaction\(\) \/ 1\.4, 0, 1\)/, "the bed rides the held reaction");
  assert.match(audio, /playCrowdSwell\(state\.crowd\?\.variant \|\| "street", amount, kind\);/);
  assert.match(audio, /playCrowdVoice\(kind === "ko" \? "roar" : crowdVoiceCueFor\(amount\), amount/);
  assert.match(audio, /crowdKoHoldAge\(\) >= CROWD_KO_HOLD\.cheerDelayTicks[\s\S]*?playCrowdVoice\("cheer", 1\.4/);
  // The voice player: resim guard, sound toggle, per-cue gap, busy window,
  // bag draw on visualRandom, level from the amount, counter and recent log.
  const voice = gameSource.slice(gameSource.indexOf("function playCrowdVoice("), gameSource.indexOf("function updateCrowdAudio("));
  assert.match(voice, /if \(rollbackResimulating \|\| !cue\) return -1;/);
  assert.match(voice, /spec\.minGapMs/);
  assert.match(voice, /!spec\.layers && now < crowdVoiceBusyUntil/);
  assert.match(voice, /crowdVoiceBagDraw\(bag, visualRandom\)/);
  assert.match(voice, /spec\.volume \* crowdVoiceLevel\(amount\) \* state\.sfxVolume/);
  assert.match(voice, /audioFxDebug\.crowdVoicePlays \+= 1;/);
  // The taunt gets its own voiced answer under the swell latch.
  const taunt = gameSource.slice(gameSource.indexOf("function performTaunt("), gameSource.indexOf("function interruptTaunt("));
  // v5.3 CROWD DEPTH pin change: a showboat is a stir BY somebody too, so the
  // taunting side's half of the room is the half that answers it.
  assert.match(taunt, /stirCrowd\(0\.25, "", \{ side: fighter\.side \}\);[\s\S]*?playCrowdVoice\("ooh", 0\.25/);
  // Snapshot exposure for the smoke.
  assert.match(gameSource, /crowdVoicePlays: audioFxDebug\.crowdVoicePlays,/);
  assert.match(gameSource, /crowdVoiceRecent: crowdVoiceRecent\.slice\(\),/);
  assert.match(gameSource, /crowdKoHold: crowdKoHoldAge\(\) >= 0 \? 1 : 0,/);
  // Flashbulbs: three per 8-tick window through the hold, the old single
  // 20-tick pick otherwise.
  assert.match(gameSource, /const hold = !reduced && crowdKoHoldAge\(\) >= 0;/);
  assert.equal(CROWD_KO_HOLD.flashWindowTicks, 8);
  assert.equal(CROWD_KO_HOLD.flashPicks, 3);
});
