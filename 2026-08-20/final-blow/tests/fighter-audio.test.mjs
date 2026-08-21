import assert from "node:assert/strict";
import test from "node:test";

import {
  FIGHTER_AUDIO,
  FIGHTER_AUDIO_CUES,
  FIGHTER_AUDIO_IDS,
  auditFighterAudio,
  fighterAudioCue,
  fighterAudioManifest,
} from "../engine/fighter-audio.mjs";

test("all eight fighters have twelve unique sound cues", () => {
  assert.deepEqual(auditFighterAudio(), {
    fighters: 8,
    cuesPerFighter: 12,
    totalCues: 96,
    errors: [],
  });
  assert.equal(FIGHTER_AUDIO_IDS.length, 8);
  assert.equal(FIGHTER_AUDIO_CUES.length, 12);
  assert.equal(new Set(fighterAudioManifest()).size, 96);
});

test("fighter cue paths preserve both identity and action", () => {
  for (const fighterId of FIGHTER_AUDIO_IDS) {
    for (const cue of FIGHTER_AUDIO_CUES) {
      const path = fighterAudioCue(fighterId, cue);
      assert.equal(path, `assets/audio/fighters/${fighterId}/${cue}.mp3`);
      assert.equal(FIGHTER_AUDIO[fighterId][cue], path);
    }
  }
  assert.equal(fighterAudioCue("commissioner", "heavy"), null);
  assert.equal(fighterAudioCue("deathblow", "unknown"), null);
});
