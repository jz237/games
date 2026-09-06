import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTACT_FLASH_HITSTUN,
  POSE_BRANCHES,
  POSE_BRANCH_ORDER,
  blockstunPhase,
  contactPoseBranch,
} from "../engine/pose-precedence.mjs";

// v5.3 SPECTACLE (sweep item #52) — the contact pose ladder. Four branches
// whose ORDER is the whole behaviour, pinned until now by a regex over the
// shape of the if-chain in game.js (`/if \(fighter\.blockstunFrames > 0 &&
// fighter\.crouch && fighter\.grounded\) \{[\s\S]{0,700}beatPoseAt\(.../`),
// which asserted the text and not one of the reads it exists to protect.

const testDir = dirname(fileURLToPath(import.meta.url));
const gameSource = readFileSync(join(testDir, "..", "game.js"), "utf8");

const snapshot = (overrides = {}) => ({
  blockstunFrames: 0, crouch: false, grounded: true,
  hitFlash: 0, hitstunFrames: 0, guarding: false, block: false,
  ...overrides,
});

function testNeutralIsNobody() {
  // A fighter who is neither in blockstun nor inside a contact flash belongs
  // to none of these branches — the reaction ladder, the wake-up track, the
  // turnaround latch and the stance below all still get their turn.
  assert.equal(contactPoseBranch(snapshot()), null);
  assert.equal(contactPoseBranch(snapshot({ crouch: true })), null);
  assert.equal(contactPoseBranch(snapshot({ guarding: true, block: true })), null);
  assert.equal(contactPoseBranch(snapshot({ hitstunFrames: CONTACT_FLASH_HITSTUN })), null,
    "the hitstun read is strictly greater, exactly as it shipped");
  assert.equal(contactPoseBranch({}), null, "an empty snapshot is not a contact");
  assert.equal(contactPoseBranch(), null);
}

function testBlockstunOutranksTheFlash() {
  // THE ORDER: blockstun is the fact, the flash is the decoration. Both are
  // set on the same tick a hit is blocked, and the flinch must win — a
  // hit-cell read here made a blocked heavy look like a landed one.
  assert.equal(contactPoseBranch(snapshot({ blockstunFrames: 12, hitFlash: 1 })), POSE_BRANCHES.blockstunStanding);
  assert.equal(contactPoseBranch(snapshot({ blockstunFrames: 12, hitFlash: 1, crouch: true })), POSE_BRANCHES.blockstunCrouch);
  // ...and it outranks a long hitstun reading too.
  assert.equal(contactPoseBranch(snapshot({ blockstunFrames: 1, hitstunFrames: 40 })), POSE_BRANCHES.blockstunStanding);
  // The crouch branch needs the floor: the authored flinch is a crouching
  // cover, so an AIRBORNE fighter in blockstun (no air block in this game —
  // a corrupt state) matches neither and is drawn honestly by the ladder
  // below rather than posed.
  assert.equal(contactPoseBranch(snapshot({ blockstunFrames: 12, crouch: true, grounded: false })), null);
  assert.equal(contactPoseBranch(snapshot({ blockstunFrames: 12, crouch: false, grounded: false })), POSE_BRANCHES.blockstunStanding);
}

function testFlashOnAGuardKeepsTheStance() {
  // v5.1: the flash OUTLIVES a jab's 4-tick blockstun. No hitstun and a guard
  // up is a BLOCK, not a hit — measured before the fix as unified:12 / ext4:1
  // at ticks 63-66 after a blocked jab with blockstun 0 and the guard still up.
  assert.equal(contactPoseBranch(snapshot({ hitFlash: 0.4, guarding: true })), POSE_BRANCHES.flashGuardStand);
  assert.equal(contactPoseBranch(snapshot({ hitFlash: 0.4, block: true })), POSE_BRANCHES.flashGuardStand);
  assert.equal(contactPoseBranch(snapshot({ hitFlash: 0.4, block: true, crouch: true })), POSE_BRANCHES.flashGuardCrouch);
  // One tick of hitstun and it is a HIT again, guard up or not: the guard did
  // not hold, so the stance would be a lie.
  assert.equal(contactPoseBranch(snapshot({ hitFlash: 0.4, guarding: true, hitstunFrames: 1 })), POSE_BRANCHES.flashHit);
  assert.equal(contactPoseBranch(snapshot({ hitFlash: 0.4 })), POSE_BRANCHES.flashHit);
  // The long-hitstun opening of a heavy has no flash left and still reads as
  // a hit, which is why the branch is an OR.
  assert.equal(contactPoseBranch(snapshot({ hitstunFrames: CONTACT_FLASH_HITSTUN + 1 })), POSE_BRANCHES.flashHit);
  assert.equal(CONTACT_FLASH_HITSTUN, 21);
}

function testExhaustivePrecedence() {
  // The whole snapshot space the ladder can see, against the ladder written
  // the other way round (first match wins, in the documented order). Any
  // reordering of the branches shows up here rather than in a play session.
  const expected = (f) => {
    if (f.blockstunFrames > 0 && !f.crouch) return POSE_BRANCHES.blockstunStanding;
    if (f.blockstunFrames > 0 && f.crouch && f.grounded) return POSE_BRANCHES.blockstunCrouch;
    if (!(f.hitFlash > 0 || f.hitstunFrames > 21)) return null;
    if (f.hitstunFrames === 0 && (f.guarding || f.block)) {
      return f.crouch ? POSE_BRANCHES.flashGuardCrouch : POSE_BRANCHES.flashGuardStand;
    }
    return POSE_BRANCHES.flashHit;
  };
  const seen = new Set();
  let cases = 0;
  for (const blockstunFrames of [0, 1, 17]) {
    for (const crouch of [false, true]) {
      for (const grounded of [false, true]) {
        for (const hitFlash of [0, 0.4]) {
          for (const hitstunFrames of [0, 1, 21, 22, 40]) {
            for (const guarding of [false, true]) {
              for (const block of [false, true]) {
                const f = snapshot({ blockstunFrames, crouch, grounded, hitFlash, hitstunFrames, guarding, block });
                const branch = contactPoseBranch(f);
                assert.equal(branch, expected(f), JSON.stringify(f));
                seen.add(branch);
                cases += 1;
              }
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 3 * 2 * 2 * 2 * 5 * 2 * 2);
  // Every branch is reachable — a branch nothing can reach is a drawing that
  // never gets on screen, which is the fault half of the ext4 sheet had.
  for (const branch of POSE_BRANCH_ORDER) assert.ok(seen.has(branch), `${branch} is unreachable`);
  assert.ok(seen.has(null));
  assert.equal(new Set(POSE_BRANCH_ORDER).size, POSE_BRANCH_ORDER.length);
}

function testBlockstunPhase() {
  // The observed TOTAL is the denominator: without it a 4-tick blockstun and
  // a 17-tick one would both read as one band.
  assert.equal(blockstunPhase(17, 17), 0);
  assert.ok(Math.abs(blockstunPhase(9, 17) - (1 - 9 / 17)) < 1e-12);
  assert.equal(blockstunPhase(1, 17), 1 - 1 / 17);
  // Never 1: the last band must still resolve to a key, not past the track.
  assert.equal(blockstunPhase(0, 17), 0.999);
  // Before the observer has recorded a total, the live countdown IS the total,
  // so the first tick is phase 0 rather than a divide by nothing.
  assert.equal(blockstunPhase(17, 0), 0);
  assert.equal(blockstunPhase(17), 0);
  assert.equal(blockstunPhase(17, undefined), 0);
  // A stale, SHORTER observed total cannot push the phase past the end.
  assert.equal(blockstunPhase(20, 4), 0);
  assert.equal(blockstunPhase(0, 0), 0.999);
}

function testGameJsWiring() {
  // game.js asks once and keeps only the drawings — one branch, one return.
  assert.match(gameSource, /const contact = contactPoseBranch\(fighter\);/);
  for (const branch of ["blockstunStanding", "blockstunCrouch", "flashGuardCrouch", "flashGuardStand", "flashHit"]) {
    assert.match(gameSource, new RegExp(`contact === POSE_BRANCHES\\.${branch}`), `game.js must draw ${branch}`);
  }
  // The phase is computed by the extracted helper in both blockstun branches,
  // off the same observer clock, so the standing and crouch tracks cannot
  // drift apart.
  const uses = gameSource.match(/blockstunPhase\(fighter\.blockstunFrames, motionObs\[fighter\.side\]\?\.blockstunTotal\)/g);
  assert.equal(uses?.length, 2);
  // The guard-flinch EXIT BRIDGE (fighterMotionTransform) reads the same
  // clock, so the transform and the drawing under it cannot fall out of step.
  assert.match(gameSource, /blockRecoverTransform\(blockstunPhase\(fighter\.blockstunFrames, obs\.blockstunTotal\)\)/);
  // No copy of the clamp arithmetic left behind anywhere.
  assert.ok(!/clamp\(1 - fighter\.blockstunFrames \/ Math\.max\(1, blockTotal\), 0, 0\.999\)/.test(gameSource));
}

test("PP-A a fighter who is not in blockstun and not flashing belongs to no contact branch", testNeutralIsNobody);
test("PP-B blockstun outranks the contact flash, and an airborne block belongs to neither", testBlockstunOutranksTheFlash);
test("PP-C the flash on a held guard keeps the stance, crouched or standing", testFlashOnAGuardKeepsTheStance);
test("PP-D the precedence is exhaustively the documented order, and every branch is reachable", testExhaustivePrecedence);
test("PP-E the blockstun phase reads off the observed total and never reaches 1", testBlockstunPhase);
test("PP-F game.js keeps the drawings and nothing else", testGameJsWiring);
