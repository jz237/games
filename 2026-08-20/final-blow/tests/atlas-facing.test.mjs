import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_FACING, atlasFrameFacing, auditAtlasFacing } from "../engine/atlas-facing.mjs";

// The independent record of post's authored orientation, frame by frame —
// verified by eye against the shipped sheets during the 1.9E fix. If either
// copy changes without the other, someone edited the mapping without
// re-verifying the art (tests/mobile-parity.mjs holds the art itself to
// perceptual hashes for the same reason).
const POST_BASE = [-1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, -1, -1, -1, 1, -1];
const POST_SPECIALS = [1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, -1];

test("the audit finds complete ±1 banks", () => {
  assert.deepEqual(auditAtlasFacing(), { fighters: 1, errors: [] });
});

test("post is the only mixed-orientation fighter, mapped exactly as verified", () => {
  assert.deepEqual(Object.keys(ATLAS_FACING), ["post"]);
  assert.deepEqual([...ATLAS_FACING.post.base], POST_BASE);
  assert.deepEqual([...ATLAS_FACING.post.specials], POST_SPECIALS);
});

test("his punch and spray actives keep the right-facing convention", () => {
  // Frames 9 and 10 are the punch extension, 14 is the spray active: their
  // painted effects travel toward the opponent, so they must NOT gain the
  // extra flip his left-authored neutral frames need.
  for (const frame of [9, 10, 14]) {
    assert.equal(atlasFrameFacing("post", "base", frame), 1, `base frame ${frame}`);
  }
  for (const frame of [0, 4, 12, 15]) {
    assert.equal(atlasFrameFacing("post", "base", frame), -1, `base frame ${frame}`);
  }
});

test("every other fighter and unknown lookup defaults to right-authored", () => {
  // Wave 17: the Devil's sheets were generated right-authored end to end.
  for (const fighterId of ["deathblow", "jez", "alan", "benny", "donald", "cyraxx", "ali", "devil", "commissioner"]) {
    assert.equal(atlasFrameFacing(fighterId, "base", 0), 1, fighterId);
    assert.equal(atlasFrameFacing(fighterId, "specials", 7), 1, fighterId);
  }
  assert.equal(atlasFrameFacing("post", "unknown-bank", 0), 1);
  assert.equal(atlasFrameFacing(undefined, "base", 0), 1);
});
