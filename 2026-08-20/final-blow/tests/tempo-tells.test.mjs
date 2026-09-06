import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TEMPO_TELL_RULES,
  noteWhiffOnMove,
  trainingFrameDataLabel,
  trainingFramePhase,
  whiffTellState,
} from "../engine/tempo-tells.mjs";
import { ATTACK_REARM_FRAMES, createAttackInstance, whiffRecoveryFrames } from "../engine/foundation.mjs";

// v5.1 TEMPO TELLS — the whiff tax (4.4) and the re-arm gap (4.5) on screen.
// The tell phases are computed from the same sim fields game.js writes at
// the tax site and in beginAttack; these pin that arithmetic, the lab's
// readout, and (by source) that both renderers and the QA surface read it.

const gameSource = readFileSync(new URL("../game.js", import.meta.url), "utf8");
const fightersSource = readFileSync(new URL("../renderer/three/fighters.mjs", import.meta.url), "utf8");

// A jab that whiffed: the sim stamps whiffTaxed/whiffTaxFrames on the
// instance and extends totalFrames, exactly as game.js does at the tax site.
function whiffedSwing(kind = "light") {
  const attack = createAttackInstance(kind);
  const tax = whiffRecoveryFrames(attack);
  attack.whiffTaxed = true;
  attack.whiffTaxFrames = tax;
  attack.totalFrames += tax;
  return { attack, tax };
}

function fighterWith(fields = {}) {
  return {
    attacking: null, attackFrame: 0, attackRearmFrames: 0, whiffTell: null,
    rearmDropTick: -Infinity, dizzyFrames: 0, hitstunFrames: 0, blockstunFrames: 0,
    ...fields,
  };
}

test("a swing that has not whiffed wears no tell", () => {
  const attack = createAttackInstance("light");
  const fighter = fighterWith({ attacking: attack, attackFrame: attack.activeEndFrame + 1 });
  assert.deepEqual(whiffTellState(fighter, 10), whiffTellState(null, 10));
  assert.equal(whiffTellState(fighter, 10).phase, "none");
  assert.equal(trainingFramePhase(fighter), "recovery");
});

test("the whiff phase lights at the tax and burns hotter through the taxed tail", () => {
  const { attack, tax } = whiffedSwing("light");
  assert.ok(tax >= 2);
  const untaxedTail = attack.totalFrames - tax;
  // Authored recovery: the fringe is on (0.7) but the meter still says recovery.
  const early = fighterWith({ attacking: attack, attackFrame: attack.activeEndFrame });
  let tell = whiffTellState(early, 100);
  assert.equal(tell.phase, "whiff");
  assert.equal(tell.taxed, false);
  assert.equal(tell.strength, 0.7);
  assert.equal(tell.taxFrames, tax);
  assert.equal(trainingFramePhase(early), "recovery");
  // The taxed tail: full strength, the meter names it, taxLeft counts down.
  const taxed = fighterWith({ attacking: attack, attackFrame: untaxedTail });
  tell = whiffTellState(taxed, 100);
  assert.equal(tell.taxed, true);
  assert.equal(tell.strength, 1);
  assert.equal(tell.taxLeft, tax);
  assert.equal(trainingFramePhase(taxed), "whiff");
  const lastTick = fighterWith({ attacking: attack, attackFrame: attack.totalFrames - 1 });
  assert.equal(whiffTellState(lastTick, 100).taxLeft, 1);
  assert.equal(trainingFramePhase(lastTick), "whiff");
});

test("an exempt move (tax 0) never shows a taxed tail", () => {
  const attack = createAttackInstance("light");
  attack.projectile = { speed: 600 };
  const tax = whiffRecoveryFrames(attack);
  assert.equal(tax, 0);
  attack.whiffTaxed = true;
  attack.whiffTaxFrames = tax;
  const fighter = fighterWith({ attacking: attack, attackFrame: attack.totalFrames - 1 });
  const tell = whiffTellState(fighter, 5);
  assert.equal(tell.phase, "whiff");
  assert.equal(tell.taxed, false, "no extra frames means nothing to colour as tax");
  assert.equal(trainingFramePhase(fighter), "recovery");
});

test("the re-arm phase fades across the gap and the meter names it", () => {
  const whiffTell = { tick: 90, taxFrames: 6, rearmFrames: ATTACK_REARM_FRAMES, kind: "light" };
  const first = fighterWith({ attackRearmFrames: ATTACK_REARM_FRAMES, whiffTell });
  let tell = whiffTellState(first, 100);
  assert.equal(tell.phase, "rearm");
  assert.equal(tell.rearmLeft, ATTACK_REARM_FRAMES);
  assert.equal(tell.rearmFrames, ATTACK_REARM_FRAMES);
  assert.equal(tell.strength, 1);
  assert.equal(tell.taxFrames, 6, "the gap still knows what the swing paid");
  assert.equal(trainingFramePhase(first), "rearm");
  const last = fighterWith({ attackRearmFrames: 1, whiffTell });
  tell = whiffTellState(last, 103);
  assert.equal(tell.phase, "rearm");
  assert.ok(tell.strength > 0.25 && tell.strength < 1, "the last frame is still a visible read");
  // A re-arm with no recorded whiff (a projectile swing that never connected)
  // still shows: the gap is a real rule whatever caused it.
  const bare = fighterWith({ attackRearmFrames: 2 });
  assert.equal(whiffTellState(bare, 1).phase, "rearm");
  assert.equal(whiffTellState(bare, 1).rearmFrames, 2);
  // Gap over: idle.
  const free = fighterWith({ whiffTell });
  assert.equal(whiffTellState(free, 200).phase, "none");
  assert.equal(trainingFramePhase(free), "idle");
});

test("an eaten press flashes for dropFlashTicks, outliving the gap", () => {
  const ticks = TEMPO_TELL_RULES.dropFlashTicks;
  assert.ok(ticks > ATTACK_REARM_FRAMES, "the pop must still be visible once the fighter is free again");
  const fighter = fighterWith({ attackRearmFrames: 2, rearmDropTick: 50 });
  assert.equal(whiffTellState(fighter, 50).dropFlash, 1);
  assert.equal(whiffTellState(fighter, 50).phase, "rearm");
  const free = fighterWith({ rearmDropTick: 50 });
  const late = whiffTellState(free, 50 + ticks - 1);
  assert.equal(late.phase, "none");
  assert.ok(late.dropFlash > 0 && late.dropFlash < 1);
  assert.equal(whiffTellState(free, 50 + ticks).dropFlash, 0);
  assert.equal(whiffTellState(free, 40).dropFlash, 0, "a stamp in the future (rolled back) never flashes");
});

test("stun outranks every tell on the meter", () => {
  const { attack } = whiffedSwing("heavy");
  const stunned = fighterWith({ attacking: attack, attackFrame: attack.totalFrames - 1, hitstunFrames: 3 });
  assert.equal(trainingFramePhase(stunned), "hitstun");
  const blocking = fighterWith({ attackRearmFrames: 3, blockstunFrames: 2 });
  assert.equal(trainingFramePhase(blocking), "blockstun");
  assert.equal(trainingFramePhase(null), "idle");
});

test("the lab's FRAME DATA line reports the recovery the fighter actually ran", () => {
  const move = { name: "JAB", startup: 4, active: 3, recovery: 12, onHit: 2, onBlock: -1 };
  assert.equal(trainingFrameDataLabel(null), "—");
  assert.equal(trainingFrameDataLabel(move), "JAB · S4 A3 R12");
  const whiffed = noteWhiffOnMove(move, 6, ATTACK_REARM_FRAMES);
  assert.equal(whiffed.whiffTax, 6);
  assert.equal(whiffed.rearm, ATTACK_REARM_FRAMES);
  assert.equal(whiffed.onHit, 2, "the authored numbers survive the merge");
  assert.equal(trainingFrameDataLabel(whiffed), `JAB · S4 A3 R12+6 WHIFF · RE-ARM ${ATTACK_REARM_FRAMES}F`);
  // The smoke probe's shape (S\d+ A\d+ R\d+) still matches.
  assert.match(trainingFrameDataLabel(whiffed), /S\d+ A\d+ R\d+/);
  // An exempt whiff (tax 0) still records the gap.
  assert.equal(trainingFrameDataLabel(noteWhiffOnMove(move, 0, 4)), "JAB · S4 A3 R12 · RE-ARM 4F");
  assert.equal(noteWhiffOnMove(null, 6, 4), null);
});

test("game.js stamps the tell at the tax site and the eaten press in beginAttack", () => {
  // The tax site keeps the 4.4 arithmetic and records the tax on the instance.
  assert.match(gameSource, /attack\.whiffTaxed = true;\s*const whiffTax = whiffRecoveryFrames\(attack\);\s*attack\.whiffTaxFrames = whiffTax;\s*attack\.totalFrames \+= whiffTax;\s*[\s\S]{0,200}noteWhiff\(fighter, attack, whiffTax\);/);
  // noteWhiff: fighter stamp, guarded total, WHIFF text only for a real tax, lab merge.
  const noteWhiff = gameSource.slice(gameSource.indexOf("function noteWhiff("), gameSource.indexOf("function noteRearmDrop("));
  assert.match(noteWhiff, /fighter\.whiffTell = \{\s*tick: state\.simulationTick,\s*taxFrames,\s*rearmFrames: ATTACK_REARM_FRAMES,/);
  assert.match(noteWhiff, /if \(!rollbackResimulating\) tempoFxDebug\.whiffTells \+= 1;/);
  assert.match(noteWhiff, /if \(taxFrames > 0\) \{\s*spawnCombatText\(/);
  assert.match(noteWhiff, /TEMPO_TELL_RULES\.textLabel,\s*TEMPO_TELL_RULES\.textColor,/);
  assert.match(noteWhiff, /state\.training\.lastMove = noteWhiffOnMove\(state\.training\.lastMove, taxFrames, ATTACK_REARM_FRAMES\);/);
  // beginAttack: the refusal with only the gap in the way is stamped, resim-guarded, human-only click.
  assert.match(gameSource, /if \(!fighter\.attacking && fighter\.attackRearmFrames > 0 && fighter\.stun <= 0 && !fighter\.down && fighter\.wakeupFrames <= 0\) \{\s*noteRearmDrop\(fighter\);/);
  const noteDrop = gameSource.slice(gameSource.indexOf("function noteRearmDrop("), gameSource.indexOf("\n}\n", gameSource.indexOf("function noteRearmDrop(")));
  assert.match(noteDrop, /fighter\.rearmDropTick = state\.simulationTick;/);
  assert.match(noteDrop, /if \(rollbackResimulating\) return;/);
  assert.match(noteDrop, /if \(!sideIsCpuControlled\(fighter\.side\)\) sound\("rearm-drop", fighter\);/);
  // The fields are born on the fighter (rollback-cloned as plain sim fields).
  assert.match(gameSource, /attackRearmFrames: 0,\s*[\s\S]{0,400}whiffTell: null,\s*rearmDropTick: -Infinity,/);
  // The click is a synth voice, never a borrowed take.
  assert.match(gameSource, /"rearm-drop": \(\) => rearmClick\(\),/);
  const click = gameSource.slice(gameSource.indexOf("function rearmClick("), gameSource.indexOf("\n}\n", gameSource.indexOf("function rearmClick(")));
  assert.match(click, /if \(!impactAudioAllowed\(\)\) return;/);
  assert.match(click, /synthVoiceDraw\("rearm-drop", audioFxDebug\.rearmClicks\)/);
});

test("both renderers draw from whiffTellState and the lab meter has the two phases", () => {
  // 2D: computed once per drawFighter, under + over the sprite, counted.
  assert.match(gameSource, /const tempoTell = whiffTellState\(fighter, state\.simulationTick\);/);
  assert.match(gameSource, /if \(tempoTellLive\) drawTempoTellUnder\(fighter, tempoTell, atlas, frame, renderSize\);/);
  assert.match(gameSource, /if \(tempoTellLive\) drawTempoTellOver\(fighter, tempoTell, atlas, frame, renderSize\);/);
  assert.match(gameSource, /whiffFringes: 0, whiffGhosts: 0, rearmFlashes: 0, rearmDropFlashes: 0,/);
  const under = gameSource.slice(gameSource.indexOf("function drawTempoTellUnder("), gameSource.indexOf("function drawTempoTellOver("));
  assert.match(under, /drawSilhouetteFrame\(atlas, frame, renderSize, red\);/);
  assert.match(under, /presentationDebug\.whiffFringes \+= 1;/);
  assert.match(under, /whiffGhostCells\[fighter\.side\] = \{ atlas, frame, renderSize, tick: state\.simulationTick \};/);
  // Reduced motion / battery keep the fringe and drop the ghosts.
  assert.match(under, /if \(!reducedMotion && trailScale > 0\) \{/);
  // Lab: meter phases + the readout line come from the engine.
  assert.match(gameSource, /whiff: \["frameWhiff", "#ff4fd8"\],\s*rearm: \["frameRearm", "#8f98a8"\],/);
  assert.match(gameSource, /return tempoTrainingFramePhase\(fighter\);/);
  assert.match(gameSource, /\$\("#trainingFrames"\)\.textContent = trainingFrameDataLabel\(move\);/);
  for (const palette of ["deuteranopia", "protanopia", "tritanopia"]) {
    const block = gameSource.slice(gameSource.indexOf(`${palette}: Object.freeze({`), gameSource.indexOf("})", gameSource.indexOf(`${palette}: Object.freeze({`)));
    assert.match(block, /frameWhiff: "#f4f4f4", frameRearm: "#5f6878",/, `${palette} names the two phases`);
  }
  // QA: totals and per-frame draws in the snapshot, and the tempo() hook.
  assert.match(gameSource, /whiffTells: tempoFxDebug\.whiffTells,\s*rearmDrops: tempoFxDebug\.rearmDrops,\s*whiffFringes: presentationDebug\.whiffFringes,/);
  assert.match(gameSource, /rearmClicks: audioFxDebug\.rearmClicks,/);
  assert.match(gameSource, /tempo\(\) \{\s*return \{\s*tick: state\.simulationTick,/);
  assert.match(gameSource, /attackRearmFrames: fighter\.attackRearmFrames,\s*whiffTaxed: Boolean\(fighter\.attacking\?\.whiffTaxed\),/);
  // 3D: the same engine function drives the two new uniforms.
  assert.match(fightersSource, /import \{ whiffTellState \} from "\.\.\/\.\.\/engine\/tempo-tells\.mjs";/);
  assert.match(fightersSource, /uniform float uFbWhiffRim;\s*uniform float uFbRearmDim;/);
  assert.match(fightersSource, /totalEmissiveRadiance \+= vec3\(1\.0, 0\.25, 0\.33\) \* \(uFbWhiffRim \* \(fbEdgeAny \* 1\.7 \+ 0\.08\)\);/);
  assert.match(fightersSource, /uFbRearmDim\);/);
  assert.match(fightersSource, /diffuseColor\.rgb \* vec3\(1\.35, 0\.5, 0\.55\), uFbWhiffRim \* 0\.4\);/);
  assert.match(fightersSource, /const tempoTell = whiffTellState\(fighter, state\.simulationTick \|\| 0\);/);
  assert.match(fightersSource, /bank\.fb\.whiffRim\.value = tempoTell\.phase === "whiff"/);
  assert.match(fightersSource, /bank\.fb\.rearmDim\.value = Math\.max\(/);
});
