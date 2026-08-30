import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_CORE_CUES,
  APPROVED_KICK_POOLS,
  REJECTED_PATHS,
} from "../engine/audio-review.mjs";
import {
  FIGHTER_AUDIO,
  FIGHTER_AUDIO_BANK_KINDS,
  FIGHTER_AUDIO_CORE_CUES,
  FIGHTER_AUDIO_CUES,
  FIGHTER_AUDIO_IDS,
  FIGHTER_AUDIO_LABELS,
  FIGHTER_AUDIO_VARIANT_SLOTS,
  FIGHTER_KICK_CUES,
  FIGHTER_REACTIVE_CUES,
  FIGHTER_REACTIVE_PLACEHOLDERS,
  auditFighterAudio,
  fighterAudioBankKind,
  fighterAudioCue,
  fighterAudioManifest,
  fighterAudioVariantManifest,
  fighterAudioVariants,
} from "../engine/fighter-audio.mjs";

test("the palette carries exactly the takes the review left standing", () => {
  assert.deepEqual(auditFighterAudio(), {
    fighters: 8,
    // Wave 16: the Commissioner's caption-first voice slots — 12 core cues,
    // probe-all, nothing recorded yet.
    bossFighters: 1,
    bossVoiceSlots: 12,
    // Wave 17: the Pinelands Devil rides the same caption-first contract.
    captionFirstFighters: 2,
    captionFirstVoiceSlots: 24,
    cuesPerFighter: 23,
    coreCues: 12,
    kickCues: 4,
    reactiveCues: 7,
    variantSlots: 3,
    // 21 accepted current sounds less the 6 shared ones he kept.
    approvedCoreTakes: 15,
    approvedKickTakes: 30,
    recordedTakes: 45,
    // 243 reviewed-roster paths + (Commissioner + Devil) × (12 + 7) × 3 probes.
    totalVariantPaths: 357,
    errors: [],
  });
  assert.equal(FIGHTER_AUDIO_IDS.length, 8);
  assert.equal(FIGHTER_AUDIO_CORE_CUES.length, 12);
  assert.equal(FIGHTER_KICK_CUES.length, 4);
  assert.equal(FIGHTER_REACTIVE_CUES.length, 7);
  assert.equal(FIGHTER_AUDIO_CUES.length, 23);
  assert.equal(new Set(fighterAudioManifest()).size, 45);
  assert.equal(new Set(fighterAudioVariantManifest()).size, 357);
});

test("a surviving core cue keeps the original single-take path", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of APPROVED_CORE_CUES[fighterId]) {
      const path = fighterAudioCue(fighterId, cue);
      // The pre-1.6 single-take contract: variant 1 keeps the original name
      // so every kept on-disk file remains the first rotation slot.
      assert.equal(path, `assets/audio/fighters/${fighterId}/${cue}.mp3`);
      assert.equal(FIGHTER_AUDIO[fighterId][cue][0], path);
    }
  }
  assert.equal(fighterAudioCue("deathblow", "jump"), "assets/audio/fighters/deathblow/jump.mp3");
  // Wave 16: the Commissioner routes canonical paths now — 12 caption-first
  // core slots that fill the moment takes land (nothing recorded today).
  assert.equal(fighterAudioCue("commissioner", "heavy"), "assets/audio/fighters/commissioner/heavy.mp3");
  assert.equal(fighterAudioCue("deathblow", "unknown"), null);
});

test("a rejected core cue is absent from the palette, not merely empty", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of FIGHTER_AUDIO_CORE_CUES) {
      if (APPROVED_CORE_CUES[fighterId].includes(cue)) continue;
      // Both lookups must answer null so callers fall through to the shared
      // or procedural sound instead of requesting a file that is gone.
      assert.equal(fighterAudioCue(fighterId, cue), null, `${fighterId}/${cue} must not route`);
      assert.equal(fighterAudioVariants(fighterId, cue), null, `${fighterId}/${cue} must not route`);
    }
  }
  // He rejected every one of Jez's own core takes, so that fighter has none.
  assert.deepEqual(APPROVED_CORE_CUES.jez, []);
  assert.equal(fighterAudioCue("jez", "block"), null);
  assert.equal(fighterAudioCue("deathblow", "hit-light"), null);
});

test("core and reactive banks still follow the -2/-3 naming", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of [...APPROVED_CORE_CUES[fighterId], ...FIGHTER_REACTIVE_CUES]) {
      const variants = fighterAudioVariants(fighterId, cue);
      assert.equal(variants.length, FIGHTER_AUDIO_VARIANT_SLOTS);
      variants.forEach((path, index) => {
        const suffix = index === 0 ? "" : `-${index + 1}`;
        assert.equal(path, `assets/audio/fighters/${fighterId}/${cue}${suffix}.mp3`);
      });
    }
  }
  // Wave 16: the Commissioner's banks follow the exact same naming contract.
  assert.deepEqual(fighterAudioVariants("commissioner", "heavy"), [
    "assets/audio/fighters/commissioner/heavy.mp3",
    "assets/audio/fighters/commissioner/heavy-2.mp3",
    "assets/audio/fighters/commissioner/heavy-3.mp3",
  ]);
  assert.equal(fighterAudioVariants("deathblow", "unknown"), null);
});

test("kick banks hold the accepted takes in a/b order and nothing else", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of FIGHTER_KICK_CUES) {
      const pool = APPROVED_KICK_POOLS[fighterId][cue];
      const variants = fighterAudioVariants(fighterId, cue);
      if (!pool.length) {
        assert.equal(variants, null, `${fighterId}/${cue} has no accepted take and must not route`);
        continue;
      }
      assert.deepEqual(variants, pool);
      assert.ok(pool.length <= 2, `${fighterId}/${cue} pool is a/b only`);
      // Take order is the review's own a-before-b, so the rotation a player
      // hears is reproducible from the decisions rather than from load order.
      const takes = pool.map((path) => path.slice(-5, -4));
      assert.deepEqual(takes, takes.length === 2 ? ["a", "b"] : takes);
    }
  }
  // Both takes accepted: both ship and rotate.
  assert.deepEqual(APPROVED_KICK_POOLS.deathblow["roundhouse-swing"], [
    "assets/audio/fighters/deathblow/roundhouse-swing-a.mp3",
    "assets/audio/fighters/deathblow/roundhouse-swing-b.mp3",
  ]);
  // Neither accepted: the role falls back rather than borrowing a reject.
  assert.deepEqual(APPROVED_KICK_POOLS.donald["light-kick-swing"], []);
  assert.equal(fighterAudioVariants("donald", "light-kick-swing"), null);
});

test("bank kinds decide what may be probed", () => {
  for (const cue of FIGHTER_AUDIO_CORE_CUES) {
    assert.equal(fighterAudioBankKind(cue), FIGHTER_AUDIO_BANK_KINDS.probed);
  }
  // Kick pools are exactly what he accepted, so there is nothing to discover
  // and the runtime must never issue a probe for one.
  for (const cue of FIGHTER_KICK_CUES) {
    assert.equal(fighterAudioBankKind(cue), FIGHTER_AUDIO_BANK_KINDS.recorded);
  }
  for (const cue of FIGHTER_REACTIVE_CUES) {
    assert.equal(fighterAudioBankKind(cue), FIGHTER_AUDIO_BANK_KINDS.placeholder);
  }
  // Wave 16: the Commissioner's core cues have no shipped variant 1, so his
  // banks probe every slot instead of trusting slot 1 blindly.
  for (const cue of FIGHTER_AUDIO_CORE_CUES) {
    assert.equal(fighterAudioBankKind(cue, "commissioner"), FIGHTER_AUDIO_BANK_KINDS.placeholder);
    assert.equal(fighterAudioBankKind(cue, "deathblow"), FIGHTER_AUDIO_BANK_KINDS.probed);
  }
  assert.equal(fighterAudioBankKind("unknown"), null);
});

test("no rejected recording is reachable from any bank", () => {
  const rejected = new Set(REJECTED_PATHS);
  for (const path of fighterAudioVariantManifest()) {
    assert.ok(!rejected.has(path), `${path} was rejected and must not be routed or probed`);
  }
});

test("reactive cues carry placeholder mappings and caption labels", () => {
  for (const cue of FIGHTER_REACTIVE_CUES) {
    const placeholder = FIGHTER_REACTIVE_PLACEHOLDERS[cue];
    assert.ok(placeholder, `${cue} has a placeholder`);
    assert.ok(FIGHTER_AUDIO_CORE_CUES.includes(placeholder.cue), `${cue} placeholder maps to a core cue`);
    assert.ok(placeholder.rate > 0 && placeholder.rate !== 1, `${cue} placeholder is pitch-offset`);
    assert.ok(FIGHTER_AUDIO_LABELS[cue], `${cue} has a caption label`);
  }
  assert.deepEqual(
    Object.fromEntries(FIGHTER_REACTIVE_CUES.map((cue) => [cue, FIGHTER_REACTIVE_PLACEHOLDERS[cue].cue])),
    { dizzy: "hit-heavy", counter: "special", tech: "block", desperation: "hit-light", scream: "fatal", crush: "block", taunt: "jump" },
  );
  // A placeholder borrows a core take, and most of those were rejected. The
  // borrow must then find nothing rather than reach for the deleted file.
  assert.equal(fighterAudioCue("cyraxx", FIGHTER_REACTIVE_PLACEHOLDERS.scream.cue), null);
});

test("every kick cue is captioned", () => {
  for (const cue of FIGHTER_KICK_CUES) {
    assert.ok(FIGHTER_AUDIO_LABELS[cue], `${cue} has a caption label`);
  }
  assert.equal(FIGHTER_AUDIO_LABELS["roundhouse-swing"], "ROUNDHOUSE");
  assert.equal(FIGHTER_AUDIO_LABELS["light-kick-swing"], "LIGHT KICK");
});
