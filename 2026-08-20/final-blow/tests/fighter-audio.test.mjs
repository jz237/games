import assert from "node:assert/strict";
import test from "node:test";

import {
  FIGHTER_AUDIO,
  FIGHTER_AUDIO_CORE_CUES,
  FIGHTER_AUDIO_CUES,
  FIGHTER_AUDIO_IDS,
  FIGHTER_AUDIO_LABELS,
  FIGHTER_AUDIO_VARIANT_SLOTS,
  FIGHTER_REACTIVE_CUES,
  FIGHTER_REACTIVE_PLACEHOLDERS,
  auditFighterAudio,
  fighterAudioCue,
  fighterAudioManifest,
  fighterAudioVariantManifest,
  fighterAudioVariants,
} from "../engine/fighter-audio.mjs";

test("all eight fighters have nineteen unique sound cues in three variant slots", () => {
  assert.deepEqual(auditFighterAudio(), {
    fighters: 8,
    cuesPerFighter: 19,
    coreCues: 12,
    reactiveCues: 7,
    variantSlots: 3,
    totalCues: 152,
    totalVariantPaths: 456,
    errors: [],
  });
  assert.equal(FIGHTER_AUDIO_IDS.length, 8);
  assert.equal(FIGHTER_AUDIO_CORE_CUES.length, 12);
  assert.equal(FIGHTER_REACTIVE_CUES.length, 7);
  assert.equal(FIGHTER_AUDIO_CUES.length, 19);
  assert.equal(new Set(fighterAudioManifest()).size, 152);
  assert.equal(new Set(fighterAudioVariantManifest()).size, 456);
});

test("fighter cue paths preserve both identity and action", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of FIGHTER_AUDIO_CUES) {
      const path = fighterAudioCue(fighterId, cue);
      // The pre-1.6 single-take contract: variant 1 keeps the original name
      // so every existing on-disk file remains the first rotation slot.
      assert.equal(path, `assets/audio/fighters/${fighterId}/${cue}.mp3`);
      assert.equal(FIGHTER_AUDIO[fighterId][cue][0], path);
    }
  }
  assert.equal(fighterAudioCue("commissioner", "heavy"), null);
  assert.equal(fighterAudioCue("deathblow", "unknown"), null);
});

test("variant banks follow the -2/-3 naming with variant 1 unnumbered", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of FIGHTER_AUDIO_CUES) {
      const variants = fighterAudioVariants(fighterId, cue);
      assert.equal(variants.length, FIGHTER_AUDIO_VARIANT_SLOTS);
      variants.forEach((path, index) => {
        const suffix = index === 0 ? "" : `-${index + 1}`;
        assert.equal(path, `assets/audio/fighters/${fighterId}/${cue}${suffix}.mp3`);
      });
    }
  }
  assert.equal(fighterAudioVariants("commissioner", "heavy"), null);
  assert.equal(fighterAudioVariants("deathblow", "unknown"), null);
});

test("reactive cues carry placeholder mappings and caption labels", () => {
  for (const cue of FIGHTER_REACTIVE_CUES) {
    const placeholder = FIGHTER_REACTIVE_PLACEHOLDERS[cue];
    assert.ok(placeholder, `${cue} has a placeholder`);
    assert.ok(FIGHTER_AUDIO_CORE_CUES.includes(placeholder.cue), `${cue} placeholder maps to a recorded core cue`);
    assert.ok(placeholder.rate > 0 && placeholder.rate !== 1, `${cue} placeholder is pitch-offset`);
    assert.ok(FIGHTER_AUDIO_LABELS[cue], `${cue} has a caption label`);
  }
  assert.deepEqual(
    Object.fromEntries(FIGHTER_REACTIVE_CUES.map((cue) => [cue, FIGHTER_REACTIVE_PLACEHOLDERS[cue].cue])),
    { dizzy: "hit-heavy", counter: "special", tech: "block", desperation: "hit-light", scream: "fatal", crush: "block", taunt: "jump" },
  );
});
