import assert from "node:assert/strict";
import test from "node:test";
import {
  FIGHTER_THROWABLES,
  createThrowObjectMove,
  stepThrowable,
} from "../engine/throwables.mjs";

const expected = Object.freeze({
  deathblow: ["pizza", "PIZZA SPLAT"],
  jez: ["mouse", "MOUSE TRAP"],
  alan: ["loogie", "STICKY HIT"],
  post: ["wires", "WIRED UP"],
  benny: ["xacto", "PRECISION CUT"],
  donald: ["golfball", "FORE!"],
  cyraxx: ["bedbugs", "INFESTED"],
  ali: ["vinyl", "BASS DROP"],
  // Wave 17: the Devil's bone-and-twine curse lob.
  devil: ["charm", "HEXED"],
  // Wave 16: the steel cane the backlog reserved for the Commissioner.
  commissioner: ["cane", "ORDER RESTORED"],
});

test("all ten approved personal objects have authored identity and release animation", () => {
  assert.deepEqual(Object.keys(FIGHTER_THROWABLES), Object.keys(expected));
  const signatures = new Set();
  for (const [fighterId, [style, label]] of Object.entries(expected)) {
    const profile = FIGHTER_THROWABLES[fighterId];
    const move = createThrowObjectMove(fighterId);
    assert.equal(profile.style, style);
    assert.equal(profile.impactLabel, label);
    assert.equal(move.throwableId, profile.id);
    assert.equal(move.animation.bank, "specials");
    assert.equal(move.animation.frames.length, 4);
    assert.ok(profile.recoveryFrames >= 18, `${fighterId} must be punishable on a miss`);
    signatures.add([
      profile.speed, profile.gravity, profile.launchY, profile.width,
      profile.height, profile.bounces, profile.hazardFrames, Boolean(profile.tether),
    ].join(":"));
  }
  assert.equal(signatures.size, 10, "none of the ten objects may be a generic reskin");
});

// Wave 16: the cane's wave-11-pattern EX tier — gold tip, knockdown, no
// lingering hazard (his ring control is the stagger on the base throw).
test("the Commissioner's cane carries a distinct EX variant", () => {
  const base = createThrowObjectMove("commissioner");
  const ex = createThrowObjectMove("commissioner", { enhanced: true });
  assert.equal(base.throwableVariant, "");
  assert.equal(ex.throwableVariant, "ex");
  assert.equal(ex.moveName, "GOLD-TIP CANE");
  assert.equal(ex.gritCost, 25);
  assert.equal(FIGHTER_THROWABLES.commissioner.variants.ex.knockdown, true);
  assert.ok(FIGHTER_THROWABLES.commissioner.staggerFrames > 0, "the base throw staggers");
  assert.equal(FIGHTER_THROWABLES.commissioner.variants.ex.staggerFrames, 0);
});

test("approved secondary behavior is encoded in the data", () => {
  assert.ok(FIGHTER_THROWABLES.deathblow.width >= 90);
  assert.equal(FIGHTER_THROWABLES.jez.tether.retractOnBlock, true);
  assert.ok(FIGHTER_THROWABLES.alan.lifeFrames < 60);
  assert.equal(FIGHTER_THROWABLES.post.bounces, 1);
  assert.ok(FIGHTER_THROWABLES.post.hazardFrames > 0);
  assert.ok(FIGHTER_THROWABLES.benny.width <= 40);
  assert.ok(FIGHTER_THROWABLES.benny.speed >= 700);
  assert.equal(FIGHTER_THROWABLES.donald.bounces, 2);
  assert.ok(FIGHTER_THROWABLES.donald.variants.high.launchY < FIGHTER_THROWABLES.donald.launchY);
  assert.ok(FIGHTER_THROWABLES.cyraxx.hazardFrames > FIGHTER_THROWABLES.post.hazardFrames);
  assert.equal(FIGHTER_THROWABLES.ali.knockdown, true);
  assert.ok(FIGHTER_THROWABLES.ali.launchY < FIGHTER_THROWABLES.donald.launchY);
});

test("Donald light and heavy kick commands select low and high golf-ball flights", () => {
  const low = createThrowObjectMove("donald", { strength: "light" });
  const high = createThrowObjectMove("donald", { strength: "heavy" });
  assert.equal(low.throwableVariant, "");
  assert.equal(high.throwableVariant, "high");
  assert.equal(high.moveName, "HIGH GOLF BALL");
});

test("wire and bed-bug floor hazards settle deterministically", () => {
  for (const fighterId of ["post", "cyraxx"]) {
    const profile = FIGHTER_THROWABLES[fighterId];
    const make = () => ({
      x: 300, y: 300, vx: profile.speed, vy: profile.launchY,
      gravity: profile.gravity, width: profile.width, height: profile.height,
      bouncesLeft: profile.bounces, bounceDamping: profile.bounceDamping,
      hazardFrames: profile.hazardFrames, hazardWidth: profile.hazardWidth,
      spin: profile.spin, spinAngle: 0, hazard: false,
    });
    const first = make();
    const second = make();
    const phases = [first, second].map((projectile) => {
      const route = [];
      for (let frame = 0; frame < 240 && !projectile.hazard; frame += 1) {
        route.push(stepThrowable(projectile, { dt: 1 / 60, floorY: 600, minX: 0, maxX: 1280 }));
      }
      return { route, projectile };
    });
    assert.deepEqual(phases[0], phases[1]);
    assert.equal(phases[0].projectile.hazard, true, `${fighterId} must become a floor hazard`);
    assert.equal(phases[0].projectile.width, profile.hazardWidth);
  }
});
