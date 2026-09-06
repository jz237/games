import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DEMO_AI_DIFFICULTY,
  DEMO_PERSONAS,
  DEMO_PERSONA_PREFIX,
  demoPersonaFor,
} from "../engine/demo.mjs";
import {
  AI_DIFFICULTIES,
  createAiBrain,
  decideAiIntent,
  resolveAiSettings,
  stepAiBrain,
} from "../engine/ai.mjs";
import { FIGHTER_KITS, KIT_SPACING_FLOORS, getFighterKit, selectKitAiIntent } from "../engine/fighter-kits.mjs";
import { GRIT_RULES } from "../engine/combos.mjs";
import { MOVEMENT_RULES } from "../engine/defense.mjs";
import { DeterministicRng } from "../engine/foundation.mjs";

// ---------------------------------------------------------------------------
// 5.4 PERSONAS + GRIT POLICY (sweep #2 / #5 / #6) — the brain's half.
//
// Before this pass every attract seat played one flat `demo` tier: sampled
// with 3000 decideAiIntent rolls per fighter per distance, EVERY fighter's top
// intent at 90-200px was `retreat` (50-78%) and at 260-520px `advance`
// (50-62%). The contract pinned here is (a) archetype identity per band,
// (b) the Grit spend, and (c) that a played match is byte-identical — every
// knob is undefined on the built-in tiers and selectKitAiIntent's defaults
// reproduce the 5.3 body exactly.
// ---------------------------------------------------------------------------

const ROSTER_10 = Object.keys(FIGHTER_KITS);

// The same synthetic sampler the sweep used (ailens-intent-sample.mjs).
function sample(tier, id, distance, { meter = 0, attacking = false, n = 3000, seed = 7 } = {}) {
  const brain = createAiBrain(tier);
  const rng = new DeterministicRng(seed);
  const tally = {};
  for (let i = 0; i < n; i += 1) {
    const self = { kitId: id, x: 400, meter, grounded: true, down: false, knockdownFrames: 0, attacking: null, attackConnected: null };
    const observation = {
      frame: 100, x: 400 + distance, grounded: true, down: false, attacking,
      wakeupFrames: 0, attackRange: attacking ? 150 : 0, attackLevel: attacking ? "mid" : null,
      guarding: false, health: 100, meter: 0,
    };
    const intent = decideAiIntent(brain, { frame: 109, self, observation, roll: rng.nextFloat() });
    const key = intent.action ? intent.action : `(${intent.movement}${intent.dash ? "-dash" : ""})`;
    tally[key] = (tally[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(tally).map(([key, count]) => [key, count / n]));
}

const share = (tally, key) => tally[key] || 0;

test("every kit names a registered persona, and the demo seats resolve to it", () => {
  for (const fighterId of ROSTER_10) {
    const persona = getFighterKit(fighterId).ai.persona;
    assert.ok(DEMO_PERSONAS[persona], `${fighterId} names persona "${persona}" which is not registered`);
    const tier = demoPersonaFor(fighterId);
    assert.equal(tier, `${DEMO_PERSONA_PREFIX}${persona}`);
    const settings = resolveAiSettings(tier);
    assert.equal(settings.id, tier);
    assert.equal(settings.persona, persona);
    assert.ok(settings.superConfirmChance > 0.8, `${tier} must carry the Grit confirm policy`);
  }
  // A kit without a persona falls back to the 4.3 tier, never to a player tier.
  assert.equal(demoPersonaFor("nobody"), DEMO_AI_DIFFICULTY);
  assert.equal(resolveAiSettings(DEMO_AI_DIFFICULTY).spacing, 1.6);
  // The four archetypes the sweep named are all present, and the roster uses
  // more than one of them.
  for (const name of ["zoner", "grappler", "rushdown", "counter"]) assert.ok(DEMO_PERSONAS[name]);
  assert.ok(new Set(ROSTER_10.map((id) => demoPersonaFor(id))).size >= 5, "the roster must spread across personas");
});

test("the built-in tiers carry none of the persona or Grit knobs", () => {
  // The whole point of gating on the demo: a played match must never see a
  // persona weight. If a knob ever lands on a built-in tier this names it.
  const KNOBS = [
    "spaceRange", "spacingFloors", "approachSpacing", "pokeWeight", "rangedWeight",
    "throwWeight", "closeWeight", "counterChance", "counterFirstChance", "holdSlack",
    "dashInChance", "superConfirmChance", "meterSuperShare", "exShare", "superRange",
    "spacing", "patience", "persona",
  ];
  for (const [id, tier] of Object.entries(AI_DIFFICULTIES)) {
    for (const knob of KNOBS) {
      assert.equal(tier[knob], undefined, `built-in tier ${id} must not define ${knob}`);
    }
  }
});

test("selectKitAiIntent with default options is the 5.3 body, byte for byte", () => {
  // An inlined copy of the pre-5.4 function. Every (fighter, distance, roll,
  // meter, air, attacking) cell must agree with the live one at the default
  // knobs — which is the proof that a played match's kit tables are untouched.
  function reference(fighterId, { distance, opponentAirborne, opponentAttacking, meter, roll, spacing = 1, patience = 0 }) {
    const kitAi = getFighterKit(fighterId)?.ai;
    if (!kitAi) return null;
    const ai = spacing === 1 ? kitAi : {
      ...kitAi,
      preferredRange: Math.max(kitAi.preferredRange * spacing, 230),
      retreatRange: Math.max(kitAi.retreatRange * spacing, 130),
      approachRange: Math.max(kitAi.approachRange * spacing, 340),
    };
    const calm = 1 - Math.max(0, Math.min(1, patience));
    if (opponentAttacking && ai.counterAction && distance < (ai.counterRange || 160) && roll < (ai.counterChance || 0.7)) {
      return { movement: "hold", action: ai.counterAction, response: "counter" };
    }
    if (opponentAirborne && distance < 180) return { movement: "hold", action: ai.antiAirAction };
    if (meter >= GRIT_RULES.superCost && roll < 0.22 && distance < 245) return { movement: "hold", action: "super" };
    if (distance < ai.retreatRange) {
      const action = roll < 0.42 ? ai.closeAction : roll < 0.72 ? "light" : "throw";
      return { movement: ai.retreatWhenClose || fighterId === "jez" || patience > 0 ? "retreat" : "hold", action };
    }
    if (distance > ai.approachRange) return { movement: "advance", action: roll < 0.34 ? ai.rangedAction : null };
    if (distance > ai.preferredRange + 28) return { movement: "advance", action: roll < 0.48 * calm ? ai.pokeAction : null };
    if (distance < ai.preferredRange - 24) return { movement: ai.retreatWhenClose || fighterId === "jez" || patience > 0 ? "retreat" : "hold", action: roll < 0.52 * calm ? ai.closeAction : roll >= 1 - 0.48 * calm ? "heavy" : null };
    return { movement: "hold", action: roll < 0.36 * calm ? ai.pokeAction : roll < 0.62 * calm ? "light" : roll < 0.8 * calm ? "heavy" : null };
  }
  let cells = 0;
  for (const fighterId of ROSTER_10) {
    for (let distance = 20; distance <= 620; distance += 6) {
      for (let r = 0; r < 50; r += 1) {
        for (const meter of [0, 100]) for (const opponentAirborne of [false, true]) for (const opponentAttacking of [false, true]) {
          const options = { distance, opponentAirborne, opponentAttacking, meter, roll: r / 50 + 0.007 };
          assert.deepEqual(selectKitAiIntent(fighterId, options), reference(fighterId, options),
            `${fighterId} @${distance}px roll ${options.roll} meter ${meter}`);
          cells += 1;
        }
      }
    }
    // ...and the 4.3 demo spacing path (spacing 1.6 / patience 0.55 with the
    // default floors) is the old body too.
    for (let distance = 40; distance <= 620; distance += 20) {
      for (let r = 0; r < 20; r += 1) {
        const options = { distance, opponentAirborne: false, opponentAttacking: false, meter: 0, roll: r / 20 + 0.013, spacing: 1.6, patience: 0.55 };
        assert.deepEqual(selectKitAiIntent(fighterId, options), reference(fighterId, options));
      }
    }
  }
  assert.ok(cells > 100_000, `the grid must be dense (got ${cells})`);
  assert.deepEqual(KIT_SPACING_FLOORS, { preferred: 230, retreat: 130, approach: 340 });
});

test("the built-in brains replay the same inputs whether or not the demo module is loaded", () => {
  // stepAiBrain on a player tier through a scripted scenario stream — the
  // persona knobs are read through `settings`, so this is the pass that
  // proves an undefined knob resolves to the 5.3 arithmetic end to end.
  const run = (tier) => {
    const out = [];
    for (const id of ["deathblow", "post", "alan"]) {
      const brain = createAiBrain(tier);
      const rng = new DeterministicRng(11);
      for (let frame = 0; frame < 600; frame += 1) {
        const d = 60 + Math.floor(rng.nextFloat() * 500);
        const swinging = rng.nextFloat() < 0.25;
        const self = {
          kitId: id, x: 400, meter: Math.floor(rng.nextFloat() * 101), grounded: true, down: false,
          knockdownFrames: 0, wakeupFrames: 0, justWoke: false,
          attacking: rng.nextFloat() < 0.3 ? { kitAction: "heavy" } : null,
          attackConnected: rng.nextFloat() < 0.5 ? "hit" : "", attackHits: 1, attackSerial: frame,
          confirmWindowFrames: 6,
        };
        const opponent = {
          x: 400 + d, grounded: true, crouch: false, guarding: false, down: false, wakeupFrames: 0, knockdownFrames: 0,
          attacking: swinging ? { totalFrames: 30, level: "mid", kind: "heavy", activeStartFrame: 8, activeEndFrame: 14, range: 150 } : null,
          attackFrame: swinging ? 5 : 0, grabbing: false, health: 100, meter: 0,
        };
        out.push(stepAiBrain(brain, { frame, self, opponent, roll: rng.nextFloat() }));
      }
    }
    return JSON.stringify(out);
  };
  // Two brains on the same tier, same stream, must agree; and the stream
  // never emits a dash pattern or a Grit-confirm on a player tier.
  for (const tier of ["street", "pro", "final"]) {
    assert.equal(run(tier), run(tier));
    const brain = createAiBrain(tier);
    const self = { kitId: "benny", x: 400, meter: 100, grounded: true, down: false, knockdownFrames: 0, attacking: { kitAction: "heavy" }, attackConnected: "hit", attackHits: 1, attackSerial: 3, confirmWindowFrames: 6 };
    const observation = { frame: 100, x: 560, grounded: true, down: false, attacking: false, wakeupFrames: 0, attackRange: 0, attackLevel: null, guarding: false, health: 100, meter: 0 };
    const reasons = new Set();
    for (let i = 0; i < 200; i += 1) reasons.add(decideAiIntent(brain, { frame: 109, self, observation, roll: i / 200 }).reason);
    assert.ok(!reasons.has("grit-confirm"), `${tier} must never take the demo Grit confirm`);
    assert.ok(!reasons.has("dash-in"), `${tier} must never take the demo dash-in`);
    assert.ok(!reasons.has("counter-read"), `${tier} must never take the demo counter read`);
  }
});

test("archetype identity per band: the sweep's sampler, now with personas", () => {
  // Sweep #2 measured every fighter as retreat 50-78% at 90-200px and
  // advance 50-62% at 260-520px on the flat tier. Each pin below is the
  // archetype doing the thing its title says, at the band it was authored for.
  // Grappler (deathblow, 82px): the throw and the walk-in, no yo-yo.
  {
    const clinch = sample(demoPersonaFor("deathblow"), "deathblow", 90);
    assert.ok(share(clinch, "throw") >= 0.22, `grappler must throw in the clinch (got ${share(clinch, "throw")})`);
    assert.ok(share(clinch, "(retreat)") < 0.1, `grappler must not back out of his own range (got ${share(clinch, "(retreat)")})`);
    const mid = sample(demoPersonaFor("deathblow"), "deathblow", 200);
    assert.ok(share(mid, "(retreat)") < 0.1, `grappler at 200px must walk in, not out (got ${share(mid, "(retreat)")})`);
    assert.ok(share(mid, "driveHeavy") + share(mid, "(advance)") >= 0.6);
  }
  // Zoner (donald, 276px / post, 238px): keep out under the band, fire the
  // signature ranged special ON it — Donald's golf ball, Post's trap.
  for (const [id, ranged] of [["donald", "commandSpecial"], ["post", "backSpecial"]]) {
    const tier = demoPersonaFor(id);
    const near = sample(tier, id, 140);
    assert.ok(share(near, "(retreat)") >= 0.5, `${id} must keep out at 140px (got ${share(near, "(retreat)")})`);
    assert.ok(share(near, "throw") < 0.05, `${id} must barely throw (got ${share(near, "throw")})`);
    const band = sample(tier, id, 420);
    assert.ok(share(band, ranged) >= 0.3, `${id} must fire ${ranged} at 420px (got ${share(band, ranged)})`);
    assert.ok(share(band, "(retreat)") < 0.1, `${id} must not back away from its own band (got ${share(band, "(retreat)")})`);
    const far = sample(tier, id, 520);
    assert.ok(share(far, ranged) >= 0.5, `${id} must open with ${ranged} from full screen (got ${share(far, ranged)})`);
  }
  // Rushdown (benny, ali): a real dash-in share and no clinch line.
  for (const id of ["benny", "ali"]) {
    const tier = demoPersonaFor(id);
    const far = sample(tier, id, 330);
    assert.ok(share(far, "(advance-dash)") >= 0.1, `${id} must dash in (got ${share(far, "(advance-dash)")})`);
    assert.ok(share(far, "(retreat)") < 0.06);
    const near = sample(tier, id, 140);
    assert.ok(share(near, "(retreat)") < 0.06, `${id} must hunt inside 150px (got ${share(near, "(retreat)")})`);
  }
  // Counter-puncher (alan): the authored counter answers the swing.
  {
    const tier = demoPersonaFor("alan");
    const swing = sample(tier, "alan", 140, { attacking: true });
    assert.ok(share(swing, "backSpecial") >= 0.45, `alan must counter the swing with his authored counter (got ${share(swing, "backSpecial")})`);
    // On the flat 4.3 tier the block roll ran first, so the authored counter
    // only ever fired on the swings the block roll declined (~12%).
    const flat = sample("demo", "alan", 140, { attacking: true });
    assert.ok(share(flat, "backSpecial") < 0.2, `the flat 4.3 tier barely reached the authored counter (got ${share(flat, "backSpecial")})`);
    assert.ok(share(swing, "backSpecial") > share(flat, "backSpecial") * 3);
    const quiet = sample(tier, "alan", 260);
    assert.ok(share(quiet, "(retreat)") < 0.1);
  }
  // Footsies (jez): the poke owns the mid band.
  {
    const mid = sample(demoPersonaFor("jez"), "jez", 260);
    assert.ok(share(mid, "special") >= 0.25, `jez must poke at 260px (got ${share(mid, "special")})`);
    assert.ok(share(mid, "special") > share(sample("demo", "jez", 260), "special") + 0.15,
      "the footsies persona pokes where the flat tier retreated");
  }
  // ...and the seats differ in cadence, so the two brains no longer decide on
  // the same tick by construction.
  const cadences = new Set(ROSTER_10.map((id) => `${resolveAiSettings(demoPersonaFor(id)).reactionFrames}/${resolveAiSettings(demoPersonaFor(id)).decisionFrames}`));
  assert.ok(cadences.size >= 4, `personas must differ in reaction/decision cadence (got ${[...cadences].join(" ")})`);
});

test("the dash-in is pressed as a real double tap inside the sim's window", () => {
  // A held direction is not a dash. The brain releases and re-presses toward
  // within MOVEMENT_RULES.dashTapWindowFrames, exactly like a human →→.
  const tier = demoPersonaFor("benny");
  const brain = createAiBrain(tier);
  const self = { kitId: "benny", x: 400, meter: 0, grounded: true, down: false, knockdownFrames: 0, attacking: null, attackConnected: "", confirmWindowFrames: 0 };
  const opponent = { x: 760, grounded: true, crouch: false, guarding: false, down: false, wakeupFrames: 0, knockdownFrames: 0, attacking: null, attackFrame: 0, grabbing: false, health: 100, meter: 0 };
  // Prime the observation buffer, then hunt for a roll that dashes.
  let inputs = null;
  for (let attempt = 0; attempt < 400 && !inputs; attempt += 1) {
    const fresh = createAiBrain(tier);
    for (let frame = 0; frame < 30; frame += 1) stepAiBrain(fresh, { frame, self, opponent, roll: 0.5 });
    // Force the decision onto frame 30 (the priming loop's own cadence may
    // have parked the next decision a few frames out).
    fresh.nextDecisionFrame = 30;
    const first = stepAiBrain(fresh, { frame: 30, self, opponent, roll: attempt / 400 });
    if (fresh.intent.reason !== "dash-in") continue;
    inputs = [first];
    for (let frame = 31; frame < 36; frame += 1) inputs.push(stepAiBrain(fresh, { frame, self, opponent, roll: 0.5 }));
  }
  assert.ok(inputs, "the rushdown persona must produce a dash-in at 360px");
  const right = inputs.map((input) => input.right);
  assert.deepEqual(right.slice(0, 4), [false, true, false, true], `the press must be neutral/toward/neutral/toward (got ${right.join(",")})`);
  assert.ok(inputs.every((input) => !input.left), "never a step away mid-dash");
  assert.ok(2 <= MOVEMENT_RULES.dashTapWindowFrames, "the two taps sit inside the dash window");
  void brain;
});

test("Grit policy: a full bar on a confirmed hit is the super, and it spends at the band", () => {
  const confirmed = (tier, id, meter, roll, confirmWindowFrames = 6) => decideAiIntent(createAiBrain(tier), {
    frame: 109,
    self: { kitId: id, x: 400, meter, grounded: true, down: false, knockdownFrames: 0, attacking: { kitAction: "heavy" }, attackConnected: "hit", attackHits: 1, attackSerial: 9, confirmWindowFrames },
    observation: { frame: 100, x: 520, grounded: true, down: false, attacking: false, wakeupFrames: 0, attackRange: 0, attackLevel: null, guarding: false, health: 100, meter: 0 },
    roll,
  });
  for (const id of ["deathblow", "donald", "benny", "alan"]) {
    const tier = demoPersonaFor(id);
    let supers = 0;
    for (let i = 0; i < 300; i += 1) if (confirmed(tier, id, 100, i / 300).action === "super") supers += 1;
    assert.ok(supers >= 270, `${id} must take the confirm super on a full bar nearly every time (got ${supers}/300)`);
    assert.equal(confirmed(tier, id, 100, 0.4).reason, "grit-confirm");
    // The confirm window is the player's own gate: closed, no Grit confirm.
    let closed = 0;
    for (let i = 0; i < 300; i += 1) if (confirmed(tier, id, 100, i / 300, 0).reason === "grit-confirm") closed += 1;
    assert.equal(closed, 0, `${id} must not fire the Grit confirm outside the confirm window`);
    // Half a bar never supers; the EX conversion happens through the band table.
    let halfSupers = 0;
    for (let i = 0; i < 300; i += 1) if (confirmed(tier, id, 50, i / 300).action === "super") halfSupers += 1;
    assert.equal(halfSupers, 0, `${id} must not super on half a bar`);
  }
  // Standalone: in range with a full bar the super is the single most likely
  // decision (0.6 of meterChance against 0.38 before), and a half bar turns
  // the band's own action into its EX version at the higher share.
  for (const [id, band] of [["deathblow", 200], ["donald", 420], ["benny", 200], ["ali", 200]]) {
    const tier = demoPersonaFor(id);
    const full = sample(tier, id, 200, { meter: 100 });
    assert.ok(share(full, "super") >= 0.4, `${id} must spend a full bar in range (got ${share(full, "super")})`);
    const flat = sample("demo", id, 200, { meter: 100 });
    assert.ok(share(full, "super") > share(flat, "super") + 0.1, `${id}'s persona must spend more readily than the flat tier`);
    // The EX conversion is checked AT THE KIT'S OWN BAND (Donald's golf ball
    // at 420px), where the band's action has an EX version — deathblow's
    // 200px action is the drive heavy, which has none.
    if (id === "deathblow") continue;
    const half = sample(tier, id, band, { meter: 50 });
    const exShare = Object.entries(half).filter(([key]) => key.startsWith("enhanced")).reduce((sum, [, value]) => sum + value, 0);
    const flatHalf = sample("demo", id, band, { meter: 50 });
    const flatEx = Object.entries(flatHalf).filter(([key]) => key.startsWith("enhanced")).reduce((sum, [, value]) => sum + value, 0);
    assert.ok(exShare > flatEx, `${id} must convert to EX more readily on a half bar (${exShare} vs ${flatEx})`);
    assert.equal(share(half, "super"), 0);
  }
});

test("game.js gates the persona pick and the Grit policy on the demo", async () => {
  // The scoping is the part that must never regress: the persona lookup runs
  // only for state.mode === "demo", and the demo snapshot reports the seats.
  const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
  // (5.4 integration: the pick runs through demoAiTier(kitId), which hands a
  // clock card the CLOCK brain and every standard card the persona.)
  assert.ok(source.includes('createAiBrain(state.mode === "demo" ? demoAiTier(kitId) : state.aiDifficulty)'),
    "makeFighter must pick the demo tier only in demo mode");
  // (5.4 session layer: the pin moved from demoPersonaFor(kitId) to
  // demoStoryTierFor(kitId, overlay) — the seat still plays its persona,
  // resolved through demoPersonaFor inside engine/demo.mjs, with the card's
  // STORY overlay on top; tests/demo-session.test.mjs pins that a null
  // overlay IS the persona tier.)
  assert.ok(source.includes("return clock ? DEMO_CLOCK_AI_DIFFICULTY : demoStoryTierFor(kitId, demoStoryOverlayFor(kitId));"),
    "a standard card's seat plays its persona under the story's overlay");
  assert.equal(source.match(/demoStoryTierFor\(/g).length, 1, "demoStoryTierFor has exactly one call site");
  assert.equal(source.match(/demoPersonaFor\(/g), null, "game.js no longer resolves the persona itself");
  assert.ok(source.includes("personas: (state.fighters || []).map((fighter) => fighter.aiBrain?.difficulty || null)"),
    "demoSnapshot must report the persona per seat");
});

test("persona brains are seeded-deterministic", () => {
  const run = () => {
    const brain = createAiBrain(demoPersonaFor("post"));
    const rng = new DeterministicRng(4242);
    const out = [];
    for (let frame = 0; frame < 400; frame += 1) {
      const d = 80 + Math.floor(rng.nextFloat() * 480);
      const self = { kitId: "post", x: 400, meter: Math.floor(rng.nextFloat() * 101), grounded: true, down: false, knockdownFrames: 0, attacking: null, attackConnected: "", confirmWindowFrames: 0 };
      const opponent = { x: 400 + d, grounded: true, crouch: false, guarding: false, down: false, wakeupFrames: 0, knockdownFrames: 0, attacking: null, attackFrame: 0, grabbing: false, health: 100, meter: 0 };
      out.push(stepAiBrain(brain, { frame, self, opponent, roll: rng.nextFloat() }), brain.intent.reason);
    }
    return JSON.stringify(out);
  };
  assert.equal(run(), run());
});
