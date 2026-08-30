import assert from "node:assert/strict";
import test from "node:test";

import {
  FIGHTER_KITS,
  FIGHTER_WIN_QUOTES,
  FORWARD_KICK_STYLES,
  createFighterMove,
  getFighterMovement,
  listFighterFrameData,
  listFighterMoves,
} from "../engine/fighter-kits.mjs";
import { MOVEMENT_RULES } from "../engine/defense.mjs";
import { FIGHTER_THROWABLES, createThrowObjectMove, stepThrowable } from "../engine/throwables.mjs";
import { GRAPHIC_FATALITIES, auditGraphicFatalities } from "../engine/fatalities.mjs";
import {
  ARCADE_BOSS_ID,
  ARCADE_RIVALS,
  auditArcadeDialogue,
  bossDialogueVariants,
  createArcadeRun,
  arcadeRunSnapshot,
  getArcadeEnding,
  endingPanelsFor,
  rivalDialogueVariants,
} from "../engine/arcade.mjs";
import { auditFighterBalance, auditTournamentBalance } from "../engine/polish.mjs";
import { FIGHTER_ALT_PALETTES } from "../engine/palettes.mjs";
import {
  CAPTION_FIRST_AUDIO_IDS,
  FIGHTER_AUDIO_BANK_KINDS,
  FIGHTER_AUDIO_CORE_CUES,
  FIGHTER_TAUNT_LINES,
  fighterAudioBankKind,
  fighterAudioVariants,
} from "../engine/fighter-audio.mjs";
import { BLACK_BOOK_ENTRIES, blackBookObserve, createBlackBookProgress } from "../engine/progression.mjs";

// The full playable cast at wave 17: nine base fighters plus the secret
// Commissioner — ten kits, five rival pairs, forty-five matchups.
const BASE_ROSTER = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali", "devil"];
const ALL_TEN = [...BASE_ROSTER, ARCADE_BOSS_ID];

// --- The Devil's kit ---------------------------------------------------------

test("the Devil's kit honors the wave-17 silhouette: glide, horn charge, tail whip, screech, dive, curse", () => {
  const devil = FIGHTER_KITS.devil;
  assert.ok(devil, "the Devil has a kit");
  // The wing-glide mobility quirk is authored movement data, not new state.
  assert.ok(devil.movement.glideFallCap > 0, "the glide caps fall speed");
  assert.ok(devil.movement.glideFallCap < Math.abs(devil.movement.jumpVelocityY), "the cap is slower than the leap");
  // No other fighter glides.
  for (const id of ALL_TEN.filter((fighterId) => fighterId !== "devil")) {
    assert.equal(FIGHTER_KITS[id].movement.glideFallCap, undefined, `${id} does not glide`);
  }
  // Signature moves by name and role.
  assert.equal(devil.moves.special.moveName, "PINEY SCREECH");
  assert.equal(devil.moves.driveHeavy.id, "devil-horn-charge");
  assert.ok(devil.moves.driveHeavy.advanceSpeed > 200, "the horn charge really charges");
  assert.equal(devil.moves.crouchHeavy.id, "devil-tail-whip");
  assert.equal(devil.moves.crouchHeavy.knockdown, true, "the tail whip sweeps");
  assert.equal(devil.moves.airSpecial.moveName, "LEATHERWING DIVE");
  assert.ok(devil.moves.airSpecial.advanceSpeed > 0, "the dive carries wing momentum");
  assert.ok(
    devil.moves.airSpecial.hitboxes.every(({ box }) => box.y + box.height > -20),
    "the dive reaches lower than the shared air special",
  );
  assert.equal(devil.moves.super.moveName, "BARRENS CURSE");
  assert.equal(devil.moves.super.superMove, true);
  assert.equal(devil.moves.backSpecial.ignorePushbox, true, "Wing Flit crosses through");
  assert.equal(FORWARD_KICK_STYLES.devil, "slide", "forward HK derives the tail slide");
  // Derived kick normals resolve like every other fighter's.
  const sweep = createFighterMove("devil", "heavy", { crouching: true, limb: "kick" });
  assert.ok(sweep && sweep.profileId.includes("sweep"), "the sweep derives from the tail whip");
  assert.equal(listFighterMoves("devil").length, 13);
  assert.ok(listFighterFrameData("devil").length >= 20, "the frame-data table covers the kit");
  // Movement inherits the shared arcade tempo like everyone else.
  const movement = getFighterMovement("devil", MOVEMENT_RULES);
  assert.ok(movement.forwardWalkSpeed > 300, "resolved walk speed is in world units");
  assert.equal(movement.glideFallCap, 350, "the glide cap passes through un-scaled");
});

test("the ten-fighter balance and tournament audits stay clean", () => {
  const balance = auditFighterBalance(ALL_TEN.map((id) => FIGHTER_KITS[id]));
  assert.deepEqual(balance.violations, []);
  const tournament = auditTournamentBalance(ALL_TEN);
  assert.deepEqual(tournament.violations, []);
  assert.equal(tournament.fighters, 10);
  assert.equal(tournament.matchupCount, 45, "ten fighters give forty-five matchups");
  assert.equal(tournament.items.personalObjects, 10);
});

// --- Throwable: the hex charm ------------------------------------------------

test("the hex charm staggers on the base lob and lingers as an EX curse zone", () => {
  const profile = FIGHTER_THROWABLES.devil;
  assert.equal(profile.name, "HEX CHARM");
  assert.ok(profile.staggerFrames > 0, "the base charm jolts");
  assert.equal(profile.hazardFrames, 0, "no free zoning on the base throw");
  const base = createThrowObjectMove("devil");
  const ex = createThrowObjectMove("devil", { enhanced: true });
  assert.equal(base.throwableVariant, "");
  assert.equal(ex.throwableVariant, "ex");
  assert.equal(ex.moveName, "LINGERING CURSE");
  assert.equal(ex.gritCost, 25);
  const exProfile = profile.variants.ex;
  assert.ok(exProfile.hazardFrames >= 100, "the EX curse zone lingers");
  assert.ok(exProfile.hazardArmFrames >= 15, "the zone telegraphs before arming");
  assert.ok(exProfile.slowFrames > 0, "the curse saps");
  // The EX flight settles into a floor hazard deterministically.
  const make = () => ({
    x: 300, y: 300, vx: profile.speed, vy: profile.launchY,
    gravity: profile.gravity, width: profile.width, height: profile.height,
    bouncesLeft: profile.bounces, bounceDamping: profile.bounceDamping,
    hazardFrames: exProfile.hazardFrames, hazardWidth: exProfile.hazardWidth,
    spin: profile.spin, spinAngle: 0, hazard: false,
  });
  const routes = [make(), make()].map((projectile) => {
    const route = [];
    for (let frame = 0; frame < 240 && !projectile.hazard; frame += 1) {
      route.push(stepThrowable(projectile, { dt: 1 / 60, floorY: 600, minX: 0, maxX: 1280 }));
    }
    return { route, hazard: projectile.hazard, width: projectile.width };
  });
  assert.deepEqual(routes[0], routes[1]);
  assert.equal(routes[0].hazard, true, "the EX charm becomes the curse zone");
  assert.equal(routes[0].width, exProfile.hazardWidth);
});

// --- Fatalities --------------------------------------------------------------

test("the Devil's two fatalities carry the wing-shear and hoof-stomp themes on the charm", () => {
  const [wing, hoof] = GRAPHIC_FATALITIES.devil;
  assert.equal(wing.id, "wing-shear");
  assert.equal(wing.family, "slice");
  assert.equal(hoof.id, "hoof-stomp");
  assert.equal(hoof.family, "crush");
  assert.notEqual(wing.limb.split("-")[1], hoof.limb.split("-")[1], "one arm, one leg");
  for (const fatality of [wing, hoof]) {
    assert.equal(fatality.special, FIGHTER_THROWABLES.devil.name);
    assert.equal(fatality.projectileId, FIGHTER_THROWABLES.devil.id);
    assert.equal(fatality.rating, "R");
  }
  const audit = auditGraphicFatalities(ALL_TEN.map((id) => ({ id, projectile: FIGHTER_THROWABLES[id] })));
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.fatalities, 20);
});

// --- Rival graph and arcade flow for ten fighters ----------------------------

test("the rival graph is symmetric, total and rebalanced for ten fighters", () => {
  assert.deepEqual(Object.keys(ARCADE_RIVALS).sort(), ALL_TEN.slice().sort());
  for (const [fighterId, rivalId] of Object.entries(ARCADE_RIVALS)) {
    assert.equal(ARCADE_RIVALS[rivalId], fighterId, `${fighterId}<->${rivalId} is symmetric`);
    assert.notEqual(fighterId, rivalId, "nobody rivals themselves");
  }
  assert.equal(ARCADE_RIVALS.devil, "cyraxx", "trickster vs cryptid");
  assert.equal(ARCADE_RIVALS.ali, ARCADE_BOSS_ID, "Ali's grudge match is the FINAL BOUT");
  assert.deepEqual(auditArcadeDialogue(ALL_TEN).errors, []);
  assert.ok(rivalDialogueVariants("devil", "cyraxx")?.length >= 2);
  assert.ok(bossDialogueVariants("devil")?.length >= 2);
});

test("nine-fighter arcade ladders stay deterministic, complete and boss-capped", () => {
  for (const playerId of BASE_ROSTER) {
    const run = createArcadeRun(playerId, BASE_ROSTER, 512);
    const rerun = createArcadeRun(playerId, BASE_ROSTER, 512);
    assert.deepEqual(arcadeRunSnapshot(run), arcadeRunSnapshot(rerun));
    assert.equal(run.matches.length, 9, `${playerId} fights eight challengers plus the boss`);
    assert.equal(run.matches.at(-1).opponentId, ARCADE_BOSS_ID);
    assert.equal(run.matches.at(-1).kind, "boss");
    assert.equal(new Set(run.matches.map(({ opponentId }) => opponentId)).size, 9);
    assert.ok(!run.matches.some(({ opponentId }) => opponentId === playerId));
  }
  // The Devil's rival beat is Cyraxx, right before the boss.
  const devilRun = createArcadeRun("devil", BASE_ROSTER, 99);
  assert.equal(devilRun.matches.at(-2).opponentId, "cyraxx");
  assert.equal(devilRun.matches.at(-2).kind, "rival");
  // Ali's rival is the boss himself, so no mid-ladder rival beat exists and
  // the FINAL BOUT is the grudge match.
  const aliRun = createArcadeRun("ali", BASE_ROSTER, 99);
  assert.ok(aliRun.matches.slice(0, -1).every(({ kind }) => kind === "challenger"));
  assert.equal(aliRun.matches.length, 9);
});

test("the Devil ships a full ending: card, three panels, win quotes, palette, voice", () => {
  const ending = getArcadeEnding("devil");
  assert.ok(ending.quote.length > 12 && ending.story.length > 60);
  assert.equal(endingPanelsFor("devil").length, 3);
  for (const pool of ["default", "rival", "fatality", "flawless", "comeback", "boss"]) {
    assert.ok(FIGHTER_WIN_QUOTES.devil[pool]?.length >= 3, `devil.${pool} pool`);
  }
  assert.equal(FIGHTER_ALT_PALETTES.devil.name, "CRANBERRY BOG");
  // Caption-first audio contract: probe-all banks, no kick takes, taunts.
  assert.ok(CAPTION_FIRST_AUDIO_IDS.includes("devil"));
  for (const cue of FIGHTER_AUDIO_CORE_CUES) {
    assert.equal(fighterAudioBankKind(cue, "devil"), FIGHTER_AUDIO_BANK_KINDS.placeholder, `devil/${cue} probes all slots`);
    assert.deepEqual(fighterAudioVariants("devil", cue), [
      `assets/audio/fighters/devil/${cue}.mp3`,
      `assets/audio/fighters/devil/${cue}-2.mp3`,
      `assets/audio/fighters/devil/${cue}-3.mp3`,
    ]);
  }
  assert.equal(fighterAudioVariants("devil", "roundhouse-swing"), null, "no fabricated kick takes");
  assert.equal(FIGHTER_TAUNT_LINES.devil.length, 3);
});

// --- Black Book --------------------------------------------------------------

test("NATIVE SON inks when the Devil clears the ladder", () => {
  const entry = BLACK_BOOK_ENTRIES.find(({ id }) => id === "native-son");
  assert.ok(entry, "the ledger carries the Devil's page");
  const progress = createBlackBookProgress();
  blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: "jez" });
  assert.equal(entry.test(progress), false, "someone else's clear does not count");
  blackBookObserve(progress, { type: "runEnd", kind: "arcade", fighterId: "devil" });
  assert.equal(entry.test(progress), true);
});
