import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { REJECTED_PATHS, WITHHELD_CANDIDATE_PATHS } from "../engine/audio-review.mjs";
import { CINEMA_HOST_OPTIONAL, CINEMA_HOST_REQUIRED } from "../renderer/three/host-contract.mjs";
import { pngMeanLuma } from "./helpers/png-luma.mjs";
import {
  createProbeRegistry,
  parseProbeArgs,
  runProbes,
  selectProbes,
  unmatchedPatterns,
} from "./helpers/probe-registry.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const gameRoot = normalize(join(testDir, ".."));
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Every super must land its authored hit count, out-damage a single heavy, and
// still leave the opponent with most of their bar. The exact totals move whenever
// the arcade tuning or combo scaling is retuned, so assert the rule, not a number.
function assertSuperPayoff(snapshot, label) {
  const damage = snapshot.fighters[0].combo.damage;
  assert.ok(damage > 15, `${label} should out-damage a single heavy, got ${damage}`);
  assert.ok(damage < 36, `${label} should not take a third of the bar, got ${damage}`);
  assert.ok(snapshot.fighters[1].health > 60, `${label} should leave most of the bar, got ${snapshot.fighters[1].health}`);
}

// Fighters must read as the dominant subject: an average standing fighter sits at
// 68-74% of the playable fight area (floor line minus the HUD), with the whole
// body on screen and room left for the jump arc.
const FIGHTER_FRAMING_PROBE = `(() => {
  window.__finalBlowQa.fight('deathblow', 'jez');
  window.__finalBlowQa.positions(360, 920);
  window.__finalBlowQa.step(0.2);
  const canvas = document.querySelector('#game');
  const rect = canvas.getBoundingClientRect();
  const hud = document.querySelector('#hud').getBoundingClientRect();
  const hudBottom = (hud.bottom - rect.top) / rect.height * canvas.height;
  const FLOOR = 600;
  const area = FLOOR - hudBottom;
  const CHAR_FRACTION = 0.95625;
  const scale = window.__finalBlowQa.fighterScale();
  const sizes = window.__finalBlowQa.fighterRenderSizes();
  const percent = {};
  for (const [id, size] of Object.entries(sizes)) {
    percent[id] = Math.round(size * CHAR_FRACTION / area * 1000) / 10;
  }
  const snapshot = window.__finalBlowEngine.snapshot();
  const jumped = (() => {
    window.__finalBlowQa.input(0, { jump: true });
    let apex = FLOOR;
    for (let frame = 0; frame < 60; frame += 1) {
      window.__finalBlowQa.step(1 / 60);
      apex = Math.min(apex, window.__finalBlowEngine.snapshot().fighters[0].y);
    }
    return apex;
  })();
  const tallest = Math.max(...Object.values(sizes)) * CHAR_FRACTION;
  return {
    area, hudBottom, scale, percent,
    min: Math.min(...Object.values(percent)),
    max: Math.max(...Object.values(percent)),
    feetOnFloor: snapshot.fighters[0].y === FLOOR,
    headroom: Math.round(FLOOR - tallest - hudBottom),
    jumpApexHead: Math.round(jumped - tallest),
    hurtboxCount: snapshot.fighters[0].hurtboxes.length,
    bodyHalfWidth: snapshot.fighters[0].movement.standingPushboxHalfWidth,
  };
})()`;

function assertFighterFraming(framing, label) {
  assert.ok(framing.min >= 68, `${label}: smallest fighter is ${framing.min}% of the fight area, must be >= 68%`);
  assert.ok(framing.max <= 74, `${label}: largest fighter is ${framing.max}% of the fight area, must be <= 74%`);
  assert.ok(framing.max - framing.min >= 3, `${label}: body types must stay visibly distinct, spread is ${framing.max - framing.min}`);
  assert.equal(framing.feetOnFloor, true, `${label}: feet must sit on the floor line`);
  assert.ok(framing.headroom >= 0, `${label}: the tallest fighter must not overlap the HUD`);
  assert.ok(framing.jumpApexHead > -140, `${label}: a full jump must stay reasonably framed, got ${framing.jumpApexHead}`);
  assert.ok(framing.hurtboxCount >= 3, `${label}: standing hurtboxes must still be built`);
  assert.ok(framing.bodyHalfWidth >= 40, `${label}: pushboxes must scale with the larger bodies`);
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      // Match Cloudflare Pages canonicalization. This redirect exposed the
      // production-only failure when the service worker cached /index.html.
      if (pathname === "/index.html") {
        response.writeHead(308, { "Cache-Control": "no-store", Location: "/" });
        response.end();
        return;
      }
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = normalize(join(gameRoot, relative));
      if (!target.startsWith(gameRoot)) throw new Error("Path outside game root");
      const info = await stat(target);
      const file = info.isDirectory() ? join(target, "index.html") : target;
      const body = await readFile(file);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[extname(file)] || "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => this.listeners.set(method, listeners.filter((item) => item !== listener));
  }

  once(method, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const stop = this.on(method, (params) => {
        clearTimeout(timer);
        stop();
        resolve(params);
      });
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeout);
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForJson(url, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

async function navigate(client, url) {
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await delay(500);
}

async function reload(client) {
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.reload", { ignoreCache: true });
  await loaded;
  await delay(500);
}

async function dispatchKey(client, type, code, key, windowsVirtualKeyCode) {
  await client.send("Input.dispatchKeyEvent", {
    type,
    code,
    key,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

// ---------------------------------------------------------------------------
// 5.3 VERIFICATION HARNESS (sweep #53/#54). See tests/README.md.
// ---------------------------------------------------------------------------
const registry = createProbeRegistry();
const probe = (name, run) => registry.register(name, run);

// Screenshot helper shared by the probes that keep an artifact. The five
// FINAL_BLOW_*_SCREENSHOT env dumps predate this and still work unchanged.
async function captureArtifact(name) {
  const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const png = Buffer.from(capture.data, "base64");
  const path = join(artifactDir, name);
  await writeFile(path, png);
  return { path, bytes: png.length, ...pngMeanLuma(png) };
}

// Mean Rec.709 luminance of canvas rectangles, read straight out of the 2D
// context. The 5.0/5.1 stage-reaction numbers (Vet floodlights +27 at the KO
// tick) were measured by hand on this canvas; this is the same read.
const CANVAS_LUMA_PROBE = `((rects) => {
  const context = document.querySelector('#game').getContext('2d');
  return rects.map(([x, y, width, height]) => {
    const { data } = context.getImageData(x, y, width, height);
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    }
    return Math.round(sum / (data.length / 4) * 100) / 100;
  });
})`;

// The 5.3 tell probes measure MOTION, and the fatality probes above them leave
// reduced motion switched ON deliberately (the offline-boot checks want the
// persisted preference). Each motion probe therefore sets it for its own run
// and puts it back exactly as it found it.
async function withMotion(run) {
  const previous = await evaluate(client, `(() => {
    const toggle = document.querySelector('#reducedMotionToggle');
    const was = toggle.checked;
    if (was) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return was;
  })()`);
  try {
    await run();
  } finally {
    await evaluate(client, `(() => {
      const toggle = document.querySelector('#reducedMotionToggle');
      if (toggle.checked !== ${previous}) {
        toggle.checked = ${previous};
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })()`);
  }
}

// MEDIAN reading of each rectangle over a run of painted frames. One frame is
// a sample, not a measurement: the Vet's sky carries a crawling blimp (which
// only darkens) and a firework every few seconds (which only brightens), and
// either can sit over a sampled box for a few frames at a time. The floodlight
// swell being measured is CONSTANT across the roundover hold — a QA fight
// freezes the sim clock, so the pulse age does not move — so the median is the
// honest statistic here and a peak or a mean is not.
async function lumaMedian(rectsJson, samples = 9, gapMs = 25) {
  const runs = [];
  for (let index = 0; index < samples; index += 1) {
    await delay(gapMs);
    runs.push(await evaluate(client, `(${CANVAS_LUMA_PROBE})(${rectsJson})`));
  }
  return runs[0].map((_, rect) => {
    const column = runs.map((run) => run[rect]).sort((a, b) => a - b);
    return column[Math.floor(column.length / 2)];
  });
}

// Per-frame presentation counters (tempo fringes, ghosts, re-arm flashes) are
// reset on every rendered frame, so they can only be read on the frame that
// drew them. A QA fight freezes the sim clock — qa.step() owns it — so the
// pose the renderer paints stays put while this samples a few real frames and
// keeps the highest reading.
async function peakOverFrames(expression, samples = 8, gapMs = 30) {
  let peak = null;
  for (let index = 0; index < samples; index += 1) {
    await delay(gapMs);
    const value = await evaluate(client, expression);
    if (peak === null) peak = { ...value };
    else for (const key of Object.keys(value)) peak[key] = Math.max(peak[key], value[key]);
  }
  return peak;
}

let client;
let summary = null;
// Every value the 5.2 body declared at the top level of the run. The probe
// bodies are closures in this scope, so the cross-probe reads the summary
// below depends on (title, attack, finisher, demoMarathon, landscape, ...)
// keep working unchanged; a probe that was skipped or failed simply leaves
// its own value undefined, which the report renders as null.
let targetResponse, target, runtimeErrors, failedResponses, voiceProbe404s, isVoiceBankProbe, title, tournamentLab,
  disconnectPause, tournamentMatrix, fighterAudioRoutes, signatureRoutes, routeFor, contextualAudio, cleanHitLabels, attractOption,
  fatalityOption, kitUi, rookieAi, finalAi, arcadeAssets, arcadeOpening, arcadeLoss, bossReady,
  bossFight, arcadeEnding, kitMoves, allanMoveList, southpawCounter, armedPaint, sprungPaint, doublePaint,
  rushKeepAwayLists, voltageCancel, liveWire, goldenFlight, goldenHit, blockedGolfBall, projectileClash, doubleShockwave,
  executiveRetreat, finalKitLists, feedbackTelegraph, echoX, feedbackHit, doubleFeedback, bufferSkip, flowOne,
  flowTwo, massiveFlow, flowCancel, expiredFlow, flowWalkStart, flowWalk, movementStart, walking,
  crouchOnly, crouchGuard, standGuard, neutralJump, forwardJump, backJump, crossover, committedFacing,
  recoveryFacing, dash, backDash, overhead, forwardLight, crouchLight, airHeavy, chipped,
  chipDealt, overheadVsLow, lowVsHigh, counterHit, violence, throwClinch, throwHit, throwTech,
  throwables, objectStyles, tether, ammo, weaponPlans, weaponIds, weaponFlow, farPickup,
  weaponRules, scars, cyraxxArt, crowdProbe, visibleCounts, tailgate, newStages, crowdReaction,
  desktopFraming, passiveRun, passiveTarget, difficultyUi, sceneDressing, facingAndHold, crossup, rollbackFacing,
  exReach, goreAftermath, dizzy, stunDecay, grabRoster, backThrow, farLight, grabDuringStun,
  knockdown, reversal, commandSpecial, aftershockGrab, seismicArmor, launcher, enhanced, enhancedFaultline,
  vinylStep, guardReversal, chained, twoHitCombo, hitConfirm, linked, gritSuper, jezSuper,
  allanSuper, postSuper, bennySuper, donaldSuper, cyraxxSuper, aliSuper, started, gamepadAttack,
  gamepadGuard, gamepadJump, gamepadEnhanced, gamepadMotionSpecial, gamepadUnbound, gamepadTriggerSuper, gamepadHeavyFinisherAttempt, gamepadLightKickFinisher,
  trainingUi, controlsUi, remapped, padRemap, polishUi, attack, finisherDistance, heavyFinisherAttempt,
  finisherStart, finisherMidpoint, finisher, lightKickFinisher, graphicFatalities, assignedFatalityProjectiles, highFidelityReality, goreOff,
  reducedFinisher, deathblowVictory, jezVictory, allanVictory, postVictory, bennyVictory, donaldVictory, cyraxxVictory,
  aliVictory, demoOpening, demoThinking, demoFinishReady, demoFinalBlow, demoResult, automaticDemoCycle, demoMarathon,
  demoExit, offlineCache, controlledReload, offlineLoaded, offlineBoot, landscape, touchLayout, mobileCrowd,
  mobilePoolDeck, mobileFraming, mirroredLayout, mobileDemo, mobilePolish, touchAttack, touchGuard, flickQueued,
  flickDash, flickSettled, governorMemory, touchEnhanced, touchSuper, touchFinisherSetup, touchHeavyFinisherAttempt, touchLightKickFinisher,
  mobileFinisher, mobileFinisherMidpoint, mobileVictory, mobileLadder, mobileEnding, portrait, guardedTakes,
  // 5.3 VERIFICATION HARNESS probes.
  ambientQuiet, ambientKo, ambientDelta, ambientStages, crowdKoHold, tempoWhiff, tempoRearm, tempoDrop,
  timerGuard, announcerDecision, poseChains, cinemaBoot, cinemaHost, cinemaFight, cinemaWeapon, cinemaProjectile,
  cinemaShot;
// ---------------------------------------------------------------------------
// The probe registry. Every body below is the 5.2 sequential script, verbatim,
// wrapped in a named probe so one section can be run on its own (--only), left
// out (--skip), and so a failure reports itself instead of hiding the 60-odd
// probes that follow it. Probes share page state deliberately (a probe leaves a
// fight running for the next one), so they always run in registry order.
// ---------------------------------------------------------------------------

probe('title-menu', async () => {
    title = await evaluate(client, `(() => ({
      title: document.title,
      build: document.querySelector('.build-tag')?.textContent.trim(),
      version: (() => {
        const badge = document.querySelector('#titleVersion');
        const box = badge?.getBoundingClientRect();
        return badge && box ? {
          text: badge.textContent.trim(),
          display: getComputedStyle(badge).display,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
        } : null;
      })(),
      rosterCards: document.querySelectorAll('.fighter-card').length,
      gritLabels: document.querySelectorAll('.grit-row').length,
      comboReadouts: document.querySelectorAll('.combo-readout').length,
      moveListRows: document.querySelectorAll('.move-list-row').length,
      aiDifficulties: [...document.querySelectorAll('#aiDifficultySelect option')].map((option) => option.value),
      aiDifficulty: document.querySelector('#aiDifficultySelect')?.value,
      visualQualities: [...document.querySelectorAll('#visualQualitySelect option')].map((option) => option.value),
      trainingDummyModes: [...document.querySelectorAll('#trainingDummySelect option')].map((option) => option.value),
      trainingTools: ['trainingHitboxToggle', 'trainingRecordButton', 'trainingPlaybackButton', 'trainingTrialSelect', 'trainingTrialResetButton']
        .filter((id) => document.getElementById(id)).length,
      flowSkipHint: Boolean(document.querySelector('#flowSkipHint')),
      newStageButton: Boolean(document.querySelector('#newStageButton')),
      pauseButtons: document.querySelectorAll('#pausePanel button').length,
      soundCaptions: document.querySelector('#soundCaptionsToggle')?.checked,
      onlineButton: document.querySelector('#onlineButton')?.textContent.trim(),
      demoButton: document.querySelector('#demoButton')?.textContent.trim(),
      // 4.0: the retired rig-vs-sprite showcase. Still probed, so its return
      // would fail here rather than quietly reappearing in the menu.
      rigShowcaseButton: Boolean(document.querySelector('#rigShowcaseButton')),
      updateToastHidden: document.querySelector('#updateToast')?.hidden,
      attractEnabled: document.querySelector('#attractModeToggle')?.checked,
      graphicFatalities: document.querySelector('#goreToggle')?.checked,
      onlineSecurityBadges: document.querySelectorAll('.online-security span').length,
      engineVersion: window.__finalBlowEngine?.version,
      engine: window.__finalBlowEngine?.snapshot(),
      simHz: window.__finalBlowEngine?.simulationHz,
    }))()`);
    assert.match(title.title, /Final Blow/);
    assert.match(title.build, /5\.3/);
    assert.equal(title.version.text, 'VERSION 5.3');
    assert.notEqual(title.version.display, 'none');
    assert.ok(title.version.left >= 0 && title.version.top >= 0);
    assert.ok(title.version.right <= 1440 && title.version.bottom <= 900);
    assert.equal(title.rosterCards, 9);
    assert.equal(title.gritLabels, 2);
    assert.equal(title.comboReadouts, 2);
    assert.equal(title.moveListRows, 24);
    assert.deepEqual(title.aiDifficulties, ['passive', 'rookie', 'street', 'pro', 'final']);
    assert.deepEqual(title.visualQualities, ['auto', 'high', 'balanced', 'battery']);
    assert.ok(['guard-after-first', 'reversal', 'wakeup', 'record', 'playback'].every((mode) => title.trainingDummyModes.includes(mode)));
    assert.equal(title.trainingTools, 5);
    assert.equal(title.flowSkipHint, true);
    assert.equal(title.newStageButton, true);
    // 5.1: the pause menu gained MOVE LIST and the control card's controls entry.
    assert.equal(title.pauseButtons, 6);
    assert.equal(title.soundCaptions, false);
    assert.match(title.onlineButton, /PRIVATE ROOM/);
    assert.match(title.demoButton, /WATCH DEMO/);
    // 4.0: the skeletal-rig experiment is retired, so the title menu must NOT
    // carry a RIG SHOWCASE entry any more.
    assert.equal(title.rigShowcaseButton, false,
      "the retired rig showcase must not be in the title menu");
    // The NEW VERSION affordance must stay hidden on an up-to-date load.
    assert.equal(title.updateToastHidden, true);
    assert.equal(title.attractEnabled, true);
    assert.equal(title.graphicFatalities, true);
    assert.deepEqual(title.engine.fatalityAudit, { fighters: 9, fatalities: 18, errors: [] });
    assert.deepEqual(title.engine.audio.audit, {
      fighters: 8, bossFighters: 1, bossVoiceSlots: 12, captionFirstFighters: 2,
      captionFirstVoiceSlots: 24, cuesPerFighter: 23, coreCues: 12, kickCues: 4,
      reactiveCues: 7, variantSlots: 3, approvedCoreTakes: 15, approvedKickTakes: 30,
      recordedTakes: 45, totalVariantPaths: 357, errors: [],
    });
    assert.equal(title.engine.demo.idleScheduled, true);
    assert.equal(title.onlineSecurityBadges, 4);
    assert.equal(title.aiDifficulty, 'street');
    assert.equal(title.engineVersion, '5.3-spectacle');
    assert.deepEqual(title.engine.presentationRules, {
      hitFlashFilter: 'brightness(1.55) saturate(1.12)',
      attackNamePopups: false,
    });
    assert.equal(title.simHz, 60);
    assert.ok(title.engine.tick > 0, "fixed simulation should be ticking");
    assert.equal(title.engine.tournament.version, '1.3');
    assert.equal(title.engine.tournament.matchupCount, 36);
    assert.deepEqual(title.engine.tournament.violations, []);
    assert.deepEqual(title.engine.inputRules.buffer, { minimumFrames: 4, defaultFrames: 6, maximumFrames: 6 });
    assert.deepEqual(title.engine.inputRules.priority.slice(0, 5), [
      'super', 'enhancedLauncher', 'enhancedBackSpecial', 'enhancedCommandSpecial', 'enhanced',
    ]);
    assert.deepEqual(title.engine.camera, {
      x: 640, y: 360, zoom: 1, locked: true, mode: 'arena', shot: 'arena', intensity: 0,
      focus: 'fighters', projectileId: null,
      cuts: 0, impactCloseUps: 0, peakZoom: 1, slowMotionHits: 0,
      presentation: { zoom: 1, x: 0, y: 0, rotation: 0, letterbox: 0 },
    });
});

probe('tournament-lab', async () => {
    tournamentLab = await evaluate(client, `(() => {
      window.__finalBlowQa.training('deathblow', 'jez');
      document.querySelector('#trainingHitboxToggle').click();
      window.__finalBlowQa.trainingRecordStart();
      window.__finalBlowQa.trainingRecordFrame({ right: true, hp: true });
      window.__finalBlowQa.trainingRecordFrame({ down: true });
      const recorded = window.__finalBlowQa.trainingRecordStop(true);
      const trial = window.__finalBlowQa.trainingTrial(1);
      const options = [...document.querySelectorAll('#trainingTrialSelect option')].map((option) => option.textContent);
      const snapshot = window.__finalBlowEngine.snapshot();
      window.__finalBlowQa.fight('deathblow', 'jez');
      const picks = [...window.__finalBlowEngine.snapshot().picks];
      window.__finalBlowQa.flowPhase('intro', 3);
      const introHint = !document.querySelector('#flowSkipHint').hidden;
      window.__finalBlowQa.input(0, { light: true });
      window.__finalBlowQa.step(1 / 60);
      const introSkipped = window.__finalBlowEngine.snapshot();
      window.__finalBlowQa.flowPhase('roundover', 3, 0);
      window.__finalBlowQa.input(0, { heavy: true });
      window.__finalBlowQa.step(1 / 60);
      const result = window.__finalBlowEngine.snapshot();
      const resultUi = {
        rematch: document.querySelector('#rematchButton').textContent,
        newStageHidden: document.querySelector('#newStageButton').hidden,
      };
      document.querySelector('#newStageButton').click();
      const stageSelect = window.__finalBlowEngine.snapshot();
      return { recorded, trial, options, snapshot, picks, introHint, introSkipped, result, resultUi, stageSelect };
    })()`);
    assert.equal(tournamentLab.recorded.recordingFrames, 2);
    assert.equal(tournamentLab.recorded.dummyMode, 'playback');
    assert.equal(tournamentLab.trial.index, 1);
    assert.equal(tournamentLab.trial.count, 8);
    assert.equal(tournamentLab.options.length, 8);
    assert.equal(tournamentLab.snapshot.training.showHitboxes, true);
    assert.equal(tournamentLab.introHint, true);
    assert.equal(tournamentLab.introSkipped.phase, 'fight');
    assert.equal(tournamentLab.introSkipped.fighters[0].attack, null, 'skip input may not become an accidental normal');
    assert.equal(tournamentLab.result.screen, 'result');
    assert.match(tournamentLab.resultUi.rematch, /INSTANT REMATCH/);
    assert.equal(tournamentLab.resultUi.newStageHidden, false);
    assert.equal(tournamentLab.stageSelect.screen, 'stage');
    assert.deepEqual(tournamentLab.stageSelect.picks, tournamentLab.picks, 'new-stage flow must preserve both fighters');

    disconnectPause = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.controllerDisconnect(1);
      const snapshot = window.__finalBlowEngine.snapshot();
      const reason = document.querySelector('#pauseReason').textContent;
      const reasonHidden = document.querySelector('#pauseReason').hidden;
      window.__finalBlowQa.pause(false);
      return { snapshot, reason, reasonHidden };
    })()`);
    assert.equal(disconnectPause.snapshot.paused, true);
    assert.match(disconnectPause.snapshot.pauseReason, /PLAYER 2 CONTROLLER DISCONNECTED/);
    assert.equal(disconnectPause.reasonHidden, false);
    assert.equal(disconnectPause.reason, disconnectPause.snapshot.pauseReason);

    tournamentMatrix = await evaluate(client, `window.__finalBlowQa.tournamentMatrix(4, 'pro')`);
    assert.equal(tournamentMatrix.matchups.length, 36);
    assert.ok(tournamentMatrix.matchups.every(({ nonFinite }) => !nonFinite));
    assert.ok(
      tournamentMatrix.matchups.every(({ maximumGroundOverlap }) => maximumGroundOverlap <= 0.001),
      `ground overlap: ${JSON.stringify(tournamentMatrix.matchups.filter(({ maximumGroundOverlap }) => maximumGroundOverlap > 0.001))}`,
    );
    assert.ok(tournamentMatrix.matchups.every(({ decisions }) => decisions.every((count) => count > 0)));
    assert.ok(tournamentMatrix.matchups.every(({ maximumProjectiles }) => maximumProjectiles <= 4));
    assert.ok(tournamentMatrix.matchups.every(({ maximumTraps }) => maximumTraps <= 2));
});

probe('fighter-audio-routes', async () => {
    // Jez's SFX review deleted most of the 1.5 per-fighter takes and added a
    // reviewed kick pool. A cue whose recording he rejected must report itself
    // as unsignatured and route to a shared take he kept (or to nothing at all,
    // meaning procedural), never to the file that was removed.
    fighterAudioRoutes = await evaluate(client, `(() => {
      const fighterIds = ['deathblow', 'jez', 'alan', 'post', 'benny', 'donald', 'cyraxx', 'ali'];
      const cues = [
        'jump', 'dash', 'light', 'heavy', 'special', 'throw', 'hit-light', 'hit-heavy', 'block', 'super', 'fatal', 'ko',
        'light-kick-swing', 'light-kick-impact', 'roundhouse-swing', 'roundhouse-impact',
      ];
      const soundToggle = document.querySelector('#soundToggle');
      const enabled = soundToggle.checked;
      soundToggle.checked = false;
      const routes = fighterIds.flatMap((fighterId) => cues.map((cue) => ({
        cue, ...window.__finalBlowQa.soundCue(fighterId, cue),
      })));
      soundToggle.checked = enabled;
      return routes;
    })()`);
    assert.equal(fighterAudioRoutes.length, 128);
    // 15 surviving core takes plus 22 fighter/role pairs with an accepted kick.
    signatureRoutes = fighterAudioRoutes.filter(({ signature }) => signature);
    assert.equal(signatureRoutes.length, 37);
    assert.equal(new Set(signatureRoutes.map(({ src }) => src)).size, 37);
    assert.ok(signatureRoutes.every(({ src }) => src.startsWith('assets/audio/fighters/')));
    // Nothing unsignatured may still name a personal take: it either borrows a
    // shared sample or reports no file at all.
    assert.ok(fighterAudioRoutes
      .filter(({ signature }) => !signature)
      .every(({ src }) => src === null || /^assets\/audio\/[\w-]+\.mp3$/.test(src)));
    assert.deepEqual(fighterAudioRoutes[0], {
      cue: 'jump', kind: 'jump', fighterId: 'deathblow', signature: true,
      src: 'assets/audio/fighters/deathblow/jump.mp3',
    });
    // He rejected every one of Jez's own core takes, so that fighter runs on
    // shared and procedural audio apart from two kick cues: the light-kick swing
    // (both takes accepted) and the roundhouse impact (the b take only).
    assert.deepEqual(
      fighterAudioRoutes.filter(({ fighterId, signature }) => fighterId === 'jez' && signature).map(({ cue }) => cue),
      ['light-kick-swing', 'roundhouse-impact'],
    );
    routeFor = (fighterId, cue) => fighterAudioRoutes.find((route) => route.fighterId === fighterId && route.cue === cue);
    assert.deepEqual(routeFor('deathblow', 'roundhouse-swing'), {
      cue: 'roundhouse-swing', kind: 'roundhouse-swing', fighterId: 'deathblow', signature: true,
      src: 'assets/audio/fighters/deathblow/roundhouse-swing-a.mp3',
    });
    // Both of Donald's light-kick swings were rejected, so the role falls back
    // to the shared light swing he kept.
    assert.deepEqual(routeFor('donald', 'light-kick-swing'), {
      cue: 'light-kick-swing', kind: 'light-kick-swing', fighterId: 'donald', signature: false,
      src: 'assets/audio/light-swing.mp3',
    });
    // The guard cue lost both its personal and its shared recording: procedural.
    assert.deepEqual(routeFor('jez', 'block'), {
      cue: 'block', kind: 'block', fighterId: 'jez', signature: false, src: null,
    });
});

probe('contextual-audio', async () => {
    contextualAudio = await evaluate(client, `(() => {
      const soundToggle = document.querySelector('#soundToggle');
      const enabled = soundToggle.checked;
      soundToggle.checked = false;
      const lastEvent = () => window.__finalBlowEngine.snapshot().audio.lastEvent;
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 585);
      window.__finalBlowQa.input(0, { light: true });
      window.__finalBlowQa.step(0.45);
      const hit = lastEvent();
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 585);
      window.__finalBlowQa.input(1, { guard: true }, 40);
      window.__finalBlowQa.input(0, { light: true });
      window.__finalBlowQa.step(0.45);
      const block = lastEvent();
      // A heavy normal thrown with a leg is a roundhouse, and claims the
      // reviewed kick cues on both the swing and the impact.
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 585);
      window.__finalBlowQa.input(0, { heavy: true, limb: 'kick' });
      window.__finalBlowQa.step(1 / 60);
      const kickSwing = lastEvent();
      window.__finalBlowQa.step(0.45);
      const kickImpact = lastEvent();
      soundToggle.checked = enabled;
      document.querySelector('#homeLink').click();
      return { hit, block, kickSwing, kickImpact };
    })()`);
    // Both takes behind these two moments were rejected: the light impact drops
    // to the shared body hit, and the guard cue has no recording left at all.
    assert.deepEqual(contextualAudio.hit, {
      kind: 'hit-light', fighterId: 'deathblow', signature: false,
      src: 'assets/audio/body-hit.mp3',
    });
    assert.deepEqual(contextualAudio.block, {
      kind: 'block', fighterId: 'jez', signature: false, src: null,
    });
    assert.deepEqual(contextualAudio.kickSwing, {
      kind: 'roundhouse-swing', fighterId: 'deathblow', signature: true,
      src: 'assets/audio/fighters/deathblow/roundhouse-swing-a.mp3',
    });
    // He accepted the b take of this impact and not the a, and the import kept
    // his lettering rather than renumbering it into the old variant slots.
    assert.deepEqual(contextualAudio.kickImpact, {
      kind: 'roundhouse-impact', fighterId: 'deathblow', signature: true,
      src: 'assets/audio/fighters/deathblow/roundhouse-impact-b.mp3',
    });
});

probe('clean-hit-labels', async () => {
    cleanHitLabels = await evaluate(client, `(() => {
      const labelsFor = (input) => {
        window.__finalBlowQa.fight('deathblow', 'jez');
        window.__finalBlowQa.input(0, input);
        window.__finalBlowQa.step(1 / 60);
        return window.__finalBlowEngine.snapshot().combatTextLabels;
      };
      const labels = { jab: labelsFor({ light: true }), hook: labelsFor({ heavy: true }) };
      document.querySelector('#homeLink').click();
      return labels;
    })()`);
    assert.equal(cleanHitLabels.jab.includes('JAB'), false);
    assert.equal(cleanHitLabels.hook.includes('HOOK'), false);
});

probe('attract-and-fatality-options', async () => {
    attractOption = await evaluate(client, `(() => {
      const toggle = document.querySelector('#attractModeToggle');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      const disabled = window.__finalBlowEngine.snapshot();
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      return { disabled, enabled: window.__finalBlowEngine.snapshot(), stored: localStorage.getItem('final-blow-attract-mode') };
    })()`);
    assert.equal(attractOption.disabled.attractEnabled, false);
    assert.equal(attractOption.disabled.demo.idleScheduled, false);
    assert.equal(attractOption.enabled.attractEnabled, true);
    assert.equal(attractOption.enabled.demo.idleScheduled, true);
    assert.equal(attractOption.stored, '1');

    fatalityOption = await evaluate(client, `(() => {
      const toggle = document.querySelector('#goreToggle');
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      const disabled = window.__finalBlowEngine.snapshot().graphicFatalities;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        disabled,
        enabled: window.__finalBlowEngine.snapshot().graphicFatalities,
        stored: localStorage.getItem('final-blow-graphic-fatalities'),
      };
    })()`);
    assert.equal(fatalityOption.disabled, false);
    assert.equal(fatalityOption.enabled, true);
    assert.equal(fatalityOption.stored, '1');
});

probe('kit-ui', async () => {
    kitUi = await evaluate(client, `(async () => {
      const paths = [
        'assets/moves/deathblow-specials.webp',
        'assets/moves/jez-specials.webp',
        'assets/moves/alan-specials.webp',
        'assets/moves/post-specials.webp',
        'assets/moves/benny-specials.webp',
        'assets/moves/donald-specials.webp',
        'assets/moves/cyraxx-specials.webp',
        'assets/moves/ali-specials.webp',
      ];
      const loaded = await Promise.all(paths.map((src) => new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ src, width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ src, width: 0, height: 0 });
        image.src = src;
      })));
      const select = document.querySelector('#moveListSelect');
      select.value = 'jez';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        loaded,
        rows: [...document.querySelectorAll('.move-list-row b')].map((node) => node.textContent),
        identity: document.querySelector('#moveListIdentity').textContent,
      };
    })()`);
    assert.deepEqual(kitUi.loaded.map(({ width, height }) => [width, height]), [
      [1280, 1280], [1280, 1280], [1280, 1280], [1280, 1280],
      [1280, 1280], [1280, 1280], [1280, 1280], [1280, 1280],
    ]);
    assert.equal(kitUi.rows.length, 24);
    assert.ok(kitUi.rows.includes('VINYL STEP'));
    assert.match(kitUi.identity, /FOOTSIES/);
});

probe('ai-difficulty-profiles', async () => {
    rookieAi = await evaluate(client, `(() => {
      window.__finalBlowQa.aiFight('deathblow', 'post', 'rookie');
      window.__finalBlowQa.positions(500, 760);
      window.__finalBlowQa.step(1.2);
      return {
        snapshot: window.__finalBlowEngine.snapshot(),
        stored: localStorage.getItem('final-blow-ai-difficulty'),
        selected: document.querySelector('#aiDifficultySelect').value,
      };
    })()`);
    assert.equal(rookieAi.snapshot.mode, 'arcade');
    assert.equal(rookieAi.snapshot.aiDifficulty, 'rookie');
    assert.equal(rookieAi.snapshot.fighters[1].ai.difficulty, 'rookie');
    assert.equal(rookieAi.snapshot.fighters[1].ai.reactionFrames, 20);
    assert.ok(rookieAi.snapshot.fighters[1].ai.decisions > 0);
    assert.ok(rookieAi.snapshot.fighters[1].ai.lastObservedFrame <= rookieAi.snapshot.tick - 20);
    assert.equal(rookieAi.stored, 'rookie');
    assert.equal(rookieAi.selected, 'rookie');

    finalAi = await evaluate(client, `(() => {
      window.__finalBlowQa.aiFight('jez', 'cyraxx', 'final');
      window.__finalBlowQa.positions(460, 680);
      window.__finalBlowQa.step(0.8);
      return window.__finalBlowEngine.snapshot();
    })()`);
    assert.equal(finalAi.fighters[1].ai.reactionFrames, 6);
    assert.ok(finalAi.fighters[1].ai.decisions > rookieAi.snapshot.fighters[1].ai.decisions / 2);
    assert.ok(finalAi.fighters[1].ai.lastObservedFrame <= finalAi.tick - 6);
});

probe('arcade-run', async () => {
    arcadeAssets = await evaluate(client, `(async () => {
      const paths = ['assets/fighters/commissioner.webp', 'assets/atlases/commissioner.webp'];
      return Promise.all(paths.map((src) => new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
        image.onerror = () => resolve([0, 0]);
        image.src = src;
      })));
    })()`);
    assert.deepEqual(arcadeAssets, [[800, 800], [1280, 1280]]);

    arcadeOpening = await evaluate(client, `window.__finalBlowQa.arcade('deathblow', 'pro', 237)`);
    assert.equal(arcadeOpening.arcade.matches.length, 9);
    assert.equal(arcadeOpening.arcade.matches.at(-1).opponentId, 'commissioner');
    assert.equal(arcadeOpening.arcade.matches.at(-2).opponentId, 'alan');
    assert.equal(arcadeOpening.arcade.current, 0);
    assert.equal(arcadeOpening.fighters[1].boss, false);
    arcadeLoss = await evaluate(client, `(() => {
      const snapshot = window.__finalBlowQa.arcadeResult(false);
      return {
        snapshot,
        eyebrow: document.querySelector('#resultEyebrow').textContent,
        continueLabel: document.querySelector('#rematchButton').textContent,
      };
    })()`);
    assert.equal(arcadeLoss.snapshot.arcade.current, 0, 'a continue must retry the current bout');
    assert.equal(arcadeLoss.snapshot.arcade.losses, 1);
    assert.equal(arcadeLoss.snapshot.screen, 'result');
    assert.match(arcadeLoss.eyebrow, /ARCADE RUN/);
    assert.equal(arcadeLoss.continueLabel, 'CONTINUE');

    bossReady = await evaluate(client, `(() => {
      window.__finalBlowQa.arcade('deathblow', 'final', 237);
      for (let bout = 0; bout < 8; bout += 1) window.__finalBlowQa.arcadeResult(true);
      return {
        snapshot: window.__finalBlowEngine.snapshot(),
        nodes: document.querySelectorAll('#arcadeLadderNodes .ladder-node').length,
        cleared: document.querySelectorAll('#arcadeLadderNodes .ladder-node.cleared').length,
        currentBoss: document.querySelectorAll('#arcadeLadderNodes .ladder-node.current.boss').length,
        title: document.querySelector('#arcadeLadderTitle').textContent,
        button: document.querySelector('#arcadeContinueButton').textContent,
      };
    })()`);
    assert.equal(bossReady.snapshot.arcade.current, 8);
    assert.equal(bossReady.snapshot.arcade.currentMatch.opponentId, 'commissioner');
    assert.equal(bossReady.snapshot.fighters[1].id, 'commissioner');
    assert.equal(bossReady.snapshot.fighters[1].kitId, 'commissioner');
    assert.equal(bossReady.snapshot.fighters[1].boss, true);
    assert.equal(bossReady.snapshot.screen, 'ladder');
    assert.equal(bossReady.nodes, 9);
    assert.equal(bossReady.cleared, 8);
    assert.equal(bossReady.currentBoss, 1);
    assert.match(bossReady.title, /FINAL AUTHORITY/);
    assert.match(bossReady.button, /FINAL BOUT/);

    bossFight = await evaluate(client, `(() => {
      document.querySelector('#arcadeContinueButton').click();
      window.__finalBlowQa.step(3.2);
      return window.__finalBlowEngine.snapshot();
    })()`);
    assert.equal(bossFight.screen, 'fight');
    assert.equal(bossFight.fighters[1].id, 'commissioner');
    assert.equal(bossFight.fighters[1].boss, true);
    assert.ok(bossFight.fighters[1].ai.decisions > 0);

    arcadeEnding = await evaluate(client, `(() => {
      const snapshot = window.__finalBlowQa.arcadeResult(true);
      return {
        snapshot,
        title: document.querySelector('#endingTitle').textContent,
        quote: document.querySelector('#endingQuote').textContent,
        story: document.querySelector('#endingStory').textContent,
        art: document.querySelector('#endingArt').style.backgroundImage,
      };
    })()`);
    assert.equal(arcadeEnding.snapshot.arcade.completed, true);
    assert.equal(arcadeEnding.snapshot.arcade.wins, 9);
    assert.equal(arcadeEnding.snapshot.screen, 'ending');
    assert.equal(arcadeEnding.title, 'THE GROUND REMEMBERS');
    assert.ok(arcadeEnding.quote.length > 20);
    assert.ok(arcadeEnding.story.length > 80);
    assert.match(arcadeEnding.art, /deathblow-specials/);
});

probe('kit-move-lists', async () => {
    kitMoves = await evaluate(client, `(() => {
      const specs = [
        ['deathblow', 'special', 'deathblow-tremor-tap', 0],
        ['deathblow', 'commandSpecial', 'deathblow-faultline-fist', 0],
        ['deathblow', 'backSpecial', 'deathblow-aftershock-grab', 0],
        ['deathblow', 'launcher', 'deathblow-quarry-breaker', 0],
        ['deathblow', 'enhanced', 'deathblow-ex-tremor-tap', 50],
        ['deathblow', 'enhancedCommandSpecial', 'deathblow-ex-faultline-fist', 50],
        ['deathblow', 'enhancedBackSpecial', 'deathblow-ex-aftershock-grab', 50],
        ['deathblow', 'enhancedLauncher', 'deathblow-ex-quarry-breaker', 50],
        ['deathblow', 'throw', 'deathblow-concrete-pour', 0],
        ['deathblow', 'super', 'deathblow-epicenter-execution', 100],
        ['jez', 'special', 'jez-neon-edge', 0],
        ['jez', 'commandSpecial', 'jez-signline-lance', 0],
        ['jez', 'backSpecial', 'jez-vinyl-step', 0],
        ['jez', 'launcher', 'jez-signpost-rising', 0],
        ['jez', 'enhanced', 'jez-ex-neon-edge', 50],
        ['jez', 'enhancedCommandSpecial', 'jez-ex-signline-lance', 50],
        ['jez', 'enhancedBackSpecial', 'jez-ex-vinyl-step', 50],
        ['jez', 'enhancedLauncher', 'jez-ex-signpost-rising', 50],
        ['jez', 'throw', 'jez-signpost-trip', 0],
        ['jez', 'super', 'jez-seven-palm-neon-guillotine', 100],
        ['alan', 'special', 'alan-heavy-hand-special', 0],
        ['alan', 'commandSpecial', 'alan-south-street-slam', 0],
        ['alan', 'backSpecial', 'alan-southpaw-counter', 0],
        ['alan', 'launcher', 'alan-broad-street-uppercut', 0],
        ['alan', 'enhanced', 'alan-ex-heavy-hand', 50],
        ['alan', 'enhancedCommandSpecial', 'alan-ex-south-street-slam', 50],
        ['alan', 'enhancedBackSpecial', 'alan-ex-southpaw-counter', 50],
        ['alan', 'enhancedLauncher', 'alan-ex-broad-street-uppercut', 50],
        ['alan', 'throw', 'alan-dockyard-clinch', 0],
        ['alan', 'super', 'alan-south-street-six', 100],
        ['post', 'special', 'post-rattlecan-burst', 0],
        ['post', 'commandSpecial', 'post-paint-the-town', 0],
        ['post', 'backSpecial', 'post-wet-paint', 0],
        ['post', 'launcher', 'post-tag-updraft', 0],
        ['post', 'enhanced', 'post-ex-rattlecan-burst', 50],
        ['post', 'enhancedCommandSpecial', 'post-ex-paint-the-town', 50],
        ['post', 'enhancedBackSpecial', 'post-ex-wet-paint', 50],
        ['post', 'enhancedLauncher', 'post-ex-tag-updraft', 50],
        ['post', 'throw', 'post-fresh-coat-toss', 0],
        ['post', 'super', 'post-full-coverage', 100],
        ['benny', 'special', 'benny-static-snap', 0],
        ['benny', 'commandSpecial', 'benny-blitz', 0],
        ['benny', 'backSpecial', 'benny-live-wire', 0],
        ['benny', 'launcher', 'benny-circuit-riser', 0],
        ['benny', 'enhanced', 'benny-ex-static-snap', 50],
        ['benny', 'enhancedCommandSpecial', 'benny-ex-blitz', 50],
        ['benny', 'enhancedBackSpecial', 'benny-ex-live-wire', 50],
        ['benny', 'enhancedLauncher', 'benny-ex-circuit-riser', 50],
        ['benny', 'throw', 'benny-ground-fault', 0],
        ['benny', 'super', 'benny-circuit-breaker-super', 100],
        ['donald', 'special', 'donald-clubhouse-check', 0],
        ['donald', 'commandSpecial', 'donald-golden-shockwave', 0],
        ['donald', 'backSpecial', 'donald-executive-retreat', 0],
        ['donald', 'launcher', 'donald-eagle-uppercut', 0],
        ['donald', 'enhanced', 'donald-ex-clubhouse-check', 50],
        ['donald', 'enhancedCommandSpecial', 'donald-ex-golden-shockwave', 50],
        ['donald', 'enhancedBackSpecial', 'donald-ex-executive-retreat', 50],
        ['donald', 'enhancedLauncher', 'donald-ex-eagle-uppercut', 50],
        ['donald', 'throw', 'donald-clubhouse-ejection', 0],
        ['donald', 'super', 'donald-golden-back-nine', 100],
        ['cyraxx', 'special', 'cyraxx-mic-check', 0],
        ['cyraxx', 'commandSpecial', 'cyraxx-feedback-loop', 0],
        ['cyraxx', 'backSpecial', 'cyraxx-buffer-skip', 0],
        ['cyraxx', 'launcher', 'cyraxx-gain-spike', 0],
        ['cyraxx', 'enhanced', 'cyraxx-ex-mic-check', 50],
        ['cyraxx', 'enhancedCommandSpecial', 'cyraxx-ex-feedback-loop', 50],
        ['cyraxx', 'enhancedBackSpecial', 'cyraxx-ex-buffer-skip', 50],
        ['cyraxx', 'enhancedLauncher', 'cyraxx-ex-gain-spike', 50],
        ['cyraxx', 'throw', 'cyraxx-mute-button', 0],
        ['cyraxx', 'super', 'cyraxx-feedback-meltdown', 100],
        ['ali', 'special', 'ali-booyakasha-beat', 0],
        ['ali', 'commandSpecial', 'ali-massive-step', 0],
        ['ali', 'backSpecial', 'ali-beat-skip', 0],
        ['ali', 'launcher', 'ali-bassline-riser', 0],
        ['ali', 'enhanced', 'ali-ex-booyakasha-beat', 50],
        ['ali', 'enhancedCommandSpecial', 'ali-ex-massive-step', 50],
        ['ali', 'enhancedBackSpecial', 'ali-ex-beat-skip', 50],
        ['ali', 'enhancedLauncher', 'ali-ex-bassline-riser', 50],
        ['ali', 'throw', 'ali-respect-toss', 0],
        ['ali', 'super', 'ali-west-staines-massive-super', 100],
      ];
      return specs.map(([id, action, expected, meter]) => {
        window.__finalBlowQa.fight(id, id === 'deathblow' ? 'jez' : 'deathblow');
        if (meter) window.__finalBlowQa.fighter(0, { meter });
        window.__finalBlowQa.input(0, { [action]: true });
        window.__finalBlowQa.step(0.034);
        const fighter = window.__finalBlowEngine.snapshot().fighters[0];
        return { id, action, expected, actual: fighter.move, bank: fighter.animationBank, meter: fighter.meter };
      });
    })()`);
    assert.deepEqual(kitMoves.map(({ actual }) => actual), kitMoves.map(({ expected }) => expected));
    assert.ok(kitMoves.every(({ bank }) => bank === 'specials'));
    assert.ok(kitMoves.filter(({ action }) => action.startsWith('enhanced')).every(({ meter }) => meter === 25));
    assert.ok(kitMoves.filter(({ action }) => action === 'super').every(({ meter }) => meter === 0));

    allanMoveList = await evaluate(client, `(() => {
      const select = document.querySelector('#moveListSelect');
      select.value = 'alan';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        identity: document.querySelector('#moveListIdentity').textContent,
        moves: [...document.querySelectorAll('.move-list-row b')].map((node) => node.textContent),
      };
    })()`);
    assert.match(allanMoveList.identity, /COUNTER-PUNCHER/);
    assert.ok(allanMoveList.moves.includes('SOUTHPAW COUNTER'));
});

probe('southpaw-counter', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('jez', 'alan'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(1, { backSpecial: true }); window.__finalBlowQa.step(0.05)`);
    await evaluate(client, `window.__finalBlowQa.input(0, { heavy: true }); window.__finalBlowQa.step(0.24)`);
    southpawCounter = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(southpawCounter.fighters[1].counterTriggered, true, 'Allan stance should fire on an incoming strike');
    assert.equal(southpawCounter.fighters[1].health, 100, 'counter should negate the incoming strike');
    assert.ok(southpawCounter.fighters[0].health <= 77, 'counter should deliver its own heavy damage');
    assert.equal(southpawCounter.fighters[0].lastHitResult, 'southpaw-countered');
    if (process.env.FINAL_BLOW_COUNTER_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_COUNTER_SCREENSHOT, Buffer.from(capture.data, "base64"));
    }
});

probe('paint-can', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('post', 'alan'); window.__finalBlowQa.positions(500, 850); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.18)`);
    armedPaint = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(armedPaint.traps.length, 1, 'Wet Paint should deploy one persistent trap');
    assert.equal(armedPaint.traps[0].ownerSide, 0);
    assert.ok(armedPaint.traps[0].lifeFrames > 300, 'trap should persist after Post recovers');
    await evaluate(client, `window.__finalBlowQa.step(0.28); window.__finalBlowQa.positions(500, 612); window.__finalBlowQa.step(0.05)`);
    sprungPaint = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(sprungPaint.traps.length, 0, 'trap should be consumed when the opponent enters it');
    assert.ok(sprungPaint.fighters[1].health < 100);
    assert.equal(sprungPaint.fighters[1].lastHitResult, 'paint-trap');

    await evaluate(client, `window.__finalBlowQa.fight('post', 'alan'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.fighter(0, { meter: 50 }); window.__finalBlowQa.input(0, { enhancedBackSpecial: true }); window.__finalBlowQa.step(0.14)`);
    doublePaint = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(doublePaint.traps.length, 2, 'Wet Paint EX should deploy a two-trap lane');
    assert.ok(doublePaint.traps.every((trap) => trap.enhanced));
    if (process.env.FINAL_BLOW_FIGHT_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_FIGHT_SCREENSHOT, Buffer.from(capture.data, "base64"));
    }
});

probe('rush-keepaway-lists', async () => {
    rushKeepAwayLists = await evaluate(client, `(() => {
      const select = document.querySelector('#moveListSelect');
      const read = (id) => {
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          identity: document.querySelector('#moveListIdentity').textContent,
          moves: [...document.querySelectorAll('.move-list-row b')].map((node) => node.textContent),
        };
      };
      return { benny: read('benny'), donald: read('donald') };
    })()`);
    assert.match(rushKeepAwayLists.benny.identity, /RUSHDOWN/);
    assert.ok(rushKeepAwayLists.benny.moves.includes('BENNY BLITZ'));
    assert.match(rushKeepAwayLists.donald.identity, /KEEP-AWAY/);
    assert.ok(rushKeepAwayLists.donald.moves.includes('GOLDEN SHOCKWAVE'));
});

probe('voltage-cancel', async () => {
    // Step budgets here and below grew with the 1.9C readability hitstop: each
    // landed hit freezes the sim longer, so scripted sequences need the same
    // wall-time the freeze added before their expected state appears.
    await evaluate(client, `window.__finalBlowQa.fight('benny', 'donald'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(0, { special: true }); window.__finalBlowQa.step(0.74)`);
    await evaluate(client, `window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.05)`);
    voltageCancel = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(voltageCancel.fighters[0].move, 'benny-blitz');
    assert.equal(voltageCancel.fighters[0].cancelledFrom, 'benny-static-snap');
    assert.ok(voltageCancel.fighters[0].combo.hits >= 2, 'Benny should retain the rush combo through his voltage cancel');

    await evaluate(client, `window.__finalBlowQa.fight('benny', 'donald'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.42)`);
    liveWire = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(liveWire.fighters[0].move, 'benny-live-wire');
    assert.ok(liveWire.fighters[0].x > liveWire.fighters[1].x, 'Live Wire should phase through the opponent');
    if (process.env.FINAL_BLOW_RUSH_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_RUSH_SCREENSHOT, Buffer.from(capture.data, "base64"));
    }
});

probe('projectiles', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.25)`);
    goldenFlight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(goldenFlight.projectiles.length, 1, 'Golden Shockwave should create a persistent projectile');
    assert.ok(goldenFlight.projectiles[0].x > 430, 'projectile should travel independently after launch');
    await evaluate(client, `window.__finalBlowQa.positions(350, ${Math.round(goldenFlight.projectiles[0].x + 24)}); window.__finalBlowQa.step(0.06)`);
    goldenHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(goldenHit.projectiles.length, 0, 'projectile should be consumed on hit');
    assert.ok(goldenHit.fighters[1].health < 100);
    assert.match(goldenHit.fighters[1].lastHitResult, /projectile/);

    await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(350, 650); window.__finalBlowQa.input(1, { guard: true }, 70); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.75)`);
    blockedGolfBall = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(blockedGolfBall.fighters[1].health, 97, 'Golden Shockwave should deal three chip damage');
    assert.equal(blockedGolfBall.fighters[1].lastHitResult, 'blocked-mid-projectile');

    await evaluate(client, `window.__finalBlowQa.fight('donald', 'donald'); window.__finalBlowQa.positions(350, 930); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.input(1, { commandSpecial: true }); window.__finalBlowQa.step(0.75)`);
    projectileClash = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(projectileClash.projectiles.length, 0, 'opposing projectiles should cancel each other');
    assert.deepEqual(projectileClash.fighters.map(({ health }) => health), [100, 100], 'a canceled projectile may not hit after the clash');

    await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.fighter(0, { meter: 50 }); window.__finalBlowQa.input(0, { enhancedCommandSpecial: true }); window.__finalBlowQa.step(0.3)`);
    doubleShockwave = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(doubleShockwave.projectiles.length, 2, 'Golden Shockwave EX should launch two balls at different heights');
    assert.ok(doubleShockwave.projectiles.every((projectile) => projectile.enhanced));
    assert.notEqual(doubleShockwave.projectiles[0].y, doubleShockwave.projectiles[1].y);
    if (process.env.FINAL_BLOW_PROJECTILE_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_PROJECTILE_SCREENSHOT, Buffer.from(capture.data, "base64"));
    }

    await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(600, 820); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.2)`);
    executiveRetreat = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.ok(executiveRetreat.fighters[0].x < 530, 'Executive Retreat should create real backward space');
    assert.equal(executiveRetreat.projectiles.length, 1, 'Executive Retreat should leave a low chip shot behind');
});

probe('final-kit-lists', async () => {
    finalKitLists = await evaluate(client, `(() => {
      const select = document.querySelector('#moveListSelect');
      const read = (id) => {
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          identity: document.querySelector('#moveListIdentity').textContent,
          moves: [...document.querySelectorAll('.move-list-row b')].map((node) => node.textContent),
        };
      };
      return { cyraxx: read('cyraxx'), ali: read('ali') };
    })()`);
    assert.match(finalKitLists.cyraxx.identity, /FEEDBACK TRICKSTER/);
    assert.ok(finalKitLists.cyraxx.moves.includes('FEEDBACK LOOP'));
    assert.match(finalKitLists.ali.identity, /RHYTHM \/ MOMENTUM/);
    assert.ok(finalKitLists.ali.moves.includes('MASSIVE STEP'));
});

probe('feedback-echo', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.2)`);
    feedbackTelegraph = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(feedbackTelegraph.projectiles.length, 1, 'Feedback Loop should plant a delayed echo');
    assert.equal(feedbackTelegraph.projectiles[0].style, 'feedback');
    assert.ok(feedbackTelegraph.projectiles[0].armFrames > 0, 'the echo must visibly telegraph before becoming active');
    // Projectile origins scale with the fighters, so assert the relationship.
    echoX = Math.round(feedbackTelegraph.projectiles[0].x);
    assert.ok(echoX > 350 && echoX < 700, `feedback echo should plant ahead of Cyraxx, got ${echoX}`);
    if (process.env.FINAL_BLOW_FEEDBACK_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_FEEDBACK_SCREENSHOT, Buffer.from(capture.data, "base64"));
    }
    await evaluate(client, `window.__finalBlowQa.positions(350, ${echoX}); window.__finalBlowQa.step(0.52)`);
    feedbackHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(feedbackHit.projectiles.length, 0, 'armed feedback should be consumed on contact');
    assert.equal(feedbackHit.fighters[1].lastHitResult, 'feedback-echo');
    assert.ok(feedbackHit.fighters[1].health < 100);

    await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.fighter(0, { meter: 50 }); window.__finalBlowQa.input(0, { enhancedCommandSpecial: true }); window.__finalBlowQa.step(0.27)`);
    doubleFeedback = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(doubleFeedback.projectiles.length, 2, 'Feedback Loop EX should stagger two echoes');
    assert.ok(doubleFeedback.projectiles.every((projectile) => projectile.style === 'feedback' && projectile.enhanced));
    assert.notEqual(doubleFeedback.projectiles[0].armFrames, doubleFeedback.projectiles[1].armFrames);
});

probe('flow-state', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.42)`);
    bufferSkip = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(bufferSkip.fighters[0].move, 'cyraxx-buffer-skip');
    assert.ok(bufferSkip.fighters[0].x > bufferSkip.fighters[1].x, 'Buffer Skip should phase through the opponent');

    await evaluate(client, `window.__finalBlowQa.fight('ali', 'cyraxx'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(0, { light: true }); window.__finalBlowQa.step(0.16)`);
    flowOne = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(flowOne.fighters[0].rhythmStacks, 1, 'one distinct hit should establish Flow');
    await evaluate(client, `window.__finalBlowQa.step(0.24); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(0, { heavy: true }); window.__finalBlowQa.step(0.36)`);
    flowTwo = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(flowTwo.fighters[0].rhythmStacks, 2, 'a second attack on beat should advance Flow');
    await evaluate(client, `window.__finalBlowQa.step(0.36); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(0, { special: true }); window.__finalBlowQa.step(0.4)`);
    massiveFlow = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(massiveFlow.fighters[0].rhythmStacks, 3, 'three distinct attacks should reach Massive Flow');
    if (process.env.FINAL_BLOW_FLOW_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_FLOW_SCREENSHOT, Buffer.from(capture.data, "base64"));
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(true)`);
    }
    // Cancel windows are frame-data driven, so walk to the window rather than
    // hard-coding a wait that a retune would invalidate.
    flowCancel = await evaluate(client, `(() => {
      for (let frame = 0; frame < 40; frame += 1) {
        const snapshot = window.__finalBlowEngine.snapshot();
        const fighter = snapshot.fighters[0];
        if (fighter.move === 'ali-booyakasha-beat' && fighter.attackConnected) {
          window.__finalBlowQa.input(0, { commandSpecial: true });
          window.__finalBlowQa.step(1 / 60);
          const next = window.__finalBlowEngine.snapshot();
          if (next.fighters[0].move === 'ali-massive-step') return next;
          continue;
        }
        window.__finalBlowQa.step(1 / 60);
      }
      return window.__finalBlowEngine.snapshot();
    })()`);
    assert.equal(flowCancel.fighters[0].move, 'ali-massive-step');
    assert.equal(flowCancel.fighters[0].cancelledFrom, 'ali-booyakasha-beat');
    assert.equal(flowCancel.fighters[0].rhythmBoost, 3);
    await evaluate(client, `window.__finalBlowQa.step(2.2)`);
    expiredFlow = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(expiredFlow.fighters[0].rhythmStacks, 0, 'Flow should expire when Ali falls off beat');

    await evaluate(client, `window.__finalBlowQa.fight('ali', 'cyraxx'); (() => { const tick = window.__finalBlowEngine.snapshot().tick; return window.__finalBlowQa.fighter(0, { rhythmStacks: 3, rhythmExpiresFrame: tick + 96 }); })()`);
    flowWalkStart = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `window.__finalBlowQa.input(0, { right: true }, 12); window.__finalBlowQa.step(0.15)`);
    flowWalk = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.ok(flowWalk.fighters[0].x - flowWalkStart.fighters[0].x > 55, 'Massive Flow should provide a real movement-speed bonus');
});

probe('movement', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    movementStart = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await evaluate(client, `window.__finalBlowQa.step(0.1)`);
    walking = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.ok(walking.fighters[0].x > movementStart.fighters[0].x + 20, "forward walk should move deliberately");

    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    crouchOnly = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(crouchOnly.fighters[0].crouching, true);
    assert.equal(crouchOnly.fighters[0].guarding, false, "crouching alone must not block: guarding is directional");

    await dispatchKey(client, "keyDown", "KeyA", "a", 65);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    crouchGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyA", "a", 65);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    assert.equal(crouchGuard.fighters[0].crouching, true);
    assert.equal(crouchGuard.fighters[0].guarding, true, "down-away crouch-blocks");
    assert.equal(crouchGuard.fighters[0].guardHeight, "low");

    await dispatchKey(client, "keyDown", "KeyA", "a", 65);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    standGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyA", "a", 65);
    assert.equal(standGuard.fighters[0].guarding, true, "holding away stand-blocks without a guard button");
    assert.equal(standGuard.fighters[0].guardHeight, "high");

    await dispatchKey(client, "keyDown", "KeyW", "w", 87);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    neutralJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyW", "w", 87);
    assert.equal(neutralJump.fighters[0].grounded, false);
    assert.ok(neutralJump.fighters[0].y < 600);

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyW", "w", 87);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    forwardJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyW", "w", 87);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.ok(forwardJump.fighters[0].vx > 270, "DeathBlow should use his own forward jump arc");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyA", "a", 65);
    await dispatchKey(client, "keyDown", "KeyW", "w", 87);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    backJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyW", "w", 87);
    await dispatchKey(client, "keyUp", "KeyA", "a", 65);
    assert.ok(backJump.fighters[0].vx < -230, "DeathBlow should use his own retreating jump arc");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 650)`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyW", "w", 87);
    await evaluate(client, `window.__finalBlowQa.step(0.55)`);
    crossover = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyW", "w", 87);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.ok(crossover.fighters[0].x > crossover.fighters[1].x, "airborne fighters should be able to cross over");
    assert.equal(crossover.fighters[0].facing, -1, "facing should flip after a cross-up");
});

probe('facing-commit', async () => {
    // Attacks commit their hitbox direction through startup/active frames, but
    // recovery must immediately turn both sprites back toward one another. The
    // previous full-move lock left cross-through fighters visibly facing away.
    await evaluate(client, `
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 650);
      window.__finalBlowQa.input(0, { heavy: true });
      window.__finalBlowQa.step(1 / 60);
      window.__finalBlowQa.positions(700, 500);
    `);
    committedFacing = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.ok(committedFacing.fighters[0].attackFrame <= committedFacing.fighters[0].activeEndFrame);
    assert.equal(committedFacing.fighters[0].facing, 1, "startup/active frames should preserve the committed attack direction");
    recoveryFacing = await evaluate(client, `(() => {
      for (let frame = 0; frame < 90; frame += 1) {
        window.__finalBlowQa.step(1 / 60);
        const snapshot = window.__finalBlowEngine.snapshot();
        const fighter = snapshot.fighters[0];
        if (fighter.move && fighter.attackFrame > fighter.activeEndFrame) return snapshot;
      }
      return window.__finalBlowEngine.snapshot();
    })()`);
    assert.ok(recoveryFacing.fighters[0].move, "the facing probe must sample attack recovery");
    assert.ok(recoveryFacing.fighters[0].attackFrame > recoveryFacing.fighters[0].activeEndFrame);
    assert.equal(recoveryFacing.fighters[0].facing, -1, "recovery should turn fighter one toward the opponent");
    assert.equal(recoveryFacing.fighters[1].facing, 1, "fighter two should face fighter one after the side swap");
});

probe('dashes', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    dash = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.ok(dash.fighters[0].dashFrames > 0, "double tap should create a forward dash");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyA", "a", 65);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyA", "a", 65);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyDown", "KeyA", "a", 65);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    backDash = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyA", "a", 65);
    assert.equal(backDash.fighters[0].dashDirection, -1);
    assert.ok(backDash.fighters[0].invulnerableFrames > 0, "backdash startup should be invulnerable");
});

probe('normals', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.1)`);
    overhead = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.equal(overhead.fighters[0].move, "deathblow-demolition-drop");
    assert.equal(overhead.fighters[0].attackLevel, "overhead");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    forwardLight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.equal(forwardLight.fighters[0].move, "deathblow-body-check");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    crouchLight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    assert.equal(crouchLight.fighters[0].move, "deathblow-quarry-tap");
    assert.equal(crouchLight.fighters[0].attackLevel, "low");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyW", "w", 87);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyW", "w", 87);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.1)`);
    airHeavy = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    assert.equal(airHeavy.fighters[0].move, "air-heavy");
    assert.equal(airHeavy.fighters[0].attackLevel, "air");
});

probe('defense-levels', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "ArrowRight", "ArrowRight", 39);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyN", "n", 78);
    await evaluate(client, `window.__finalBlowQa.step(0.45)`);
    chipped = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyN", "n", 78);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    await dispatchKey(client, "keyUp", "ArrowRight", "ArrowRight", 39);
    assert.equal(chipped.fighters[1].lastHitResult, "blocked-mid");
    // Chip is meaningful now, but blocking still never kills.
    chipDealt = 100 - chipped.fighters[1].health;
    assert.ok(chipDealt >= 3.5 && chipDealt <= 7, `blocked special chip should be meaningful, got ${chipDealt}`);
    assert.ok(chipped.fighters[1].health >= 1, "chip can never take the last point of health");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "ArrowDown", "ArrowDown", 40);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.5)`);
    overheadVsLow = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    await dispatchKey(client, "keyUp", "ArrowDown", "ArrowDown", 40);
    assert.equal(overheadVsLow.fighters[1].lastHitResult, "overhead", "low guard must lose to overheads");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "ArrowRight", "ArrowRight", 39);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.45)`);
    lowVsHigh = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    await dispatchKey(client, "keyUp", "ArrowRight", "ArrowRight", 39);
    assert.equal(lowVsHigh.fighters[1].lastHitResult, "low", "standing guard must lose to lows");

    await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600)`);
    await evaluate(client, `window.__finalBlowQa.input(1, { heavy: true })`);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await evaluate(client, `window.__finalBlowQa.input(0, { light: true })`);
    await evaluate(client, `window.__finalBlowQa.step(0.25)`);
    counterHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(counterHit.fighters[1].lastHitResult, "counter");
});

probe('violence-feedback', async () => {
    // Blood replaces the old generic post-hit ring, and impact strength is visibly
    // tiered without changing block clarity or gameplay timing.
    violence = await evaluate(client, `(() => {
      const strike = (action, meter = 0, guard = false) => {
        window.__finalBlowQa.fight('deathblow', 'jez');
        window.__finalBlowQa.positions(500, 610);
        if (meter) window.__finalBlowQa.fighter(0, { meter });
        if (guard) window.__finalBlowQa.input(1, { guard: true }, 120);
        window.__finalBlowQa.input(0, { [action]: true });
        for (let frame = 0; frame < 90; frame += 1) {
          window.__finalBlowQa.step(1 / 60);
          const snapshot = window.__finalBlowEngine.snapshot();
          if (snapshot.fighters[1].health < 100 || snapshot.fighters[1].lastHitResult.startsWith('blocked-')) return {
            result: snapshot.fighters[1].lastHitResult,
            ...snapshot.violence,
          };
        }
        return null;
      };
      return {
        light: strike('light'),
        heavy: strike('heavy'),
        super: strike('super', 100),
        blocked: strike('heavy', 0, true),
      };
    })()`);
    assert.ok(violence.light?.bloodParticles > 0, "a clean light must spray blood");
    assert.ok(violence.heavy.bloodParticles > violence.light.bloodParticles, "a heavy needs more blood than a light");
    assert.ok(violence.super.bloodParticles > violence.heavy.bloodParticles, "a super needs the largest normal-match spray");
    assert.ok(violence.heavy.shake > violence.light.shake, "heavy camera response must exceed light response");
    assert.equal(violence.blocked.bloodParticles, 0, "blocking must never create blood");
    assert.match(violence.blocked.result, /^blocked-/);
    assert.equal(violence.light.genericHitEffects, 0, "the disliked generic hit effect is removed");
});

probe('throws', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 585)`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.16)`);
    throwClinch = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.ok(throwClinch.fighters[0].grabbing, "toward + LP grabs at point-blank range");
    await evaluate(client, `window.__finalBlowQa.step(0.6)`);
    throwHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.equal(throwHit.fighters[1].lastHitResult, "throw");
    assert.ok(throwHit.fighters[1].pendingKnockdown || throwHit.fighters[1].down);

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 585)`);
    await evaluate(client, `window.__finalBlowQa.input(0, { throw: true }); window.__finalBlowQa.input(1, { throw: true })`);
    await evaluate(client, `window.__finalBlowQa.step(0.14)`);
    throwTech = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(throwTech.fighters[0].lastHitResult, "throw-tech");
    assert.equal(throwTech.fighters[1].lastHitResult, "throw-tech");
    assert.equal(throwTech.fighters[0].grabbing, null, "a tech must leave no live clinch");
    assert.equal(throwTech.fighters[1].grabbed, null);
});

probe('thrown-objects', async () => {
    // Personal throwable objects: one recognisable object per fighter, thrown with
    // the same command everywhere, each with genuinely different physics and a
    // real recovery window, and none of them spammable.
    throwables = await evaluate(client, `(() => {
      const ids = ['deathblow','jez','alan','post','benny','donald','cyraxx','ali'];
      const out = {};
      for (const id of ids) {
        window.__finalBlowQa.fight(id, id === 'jez' ? 'deathblow' : 'jez');
        window.__finalBlowQa.positions(300, 1050);
        const startUses = window.__finalBlowEngine.snapshot().fighters[0].throwableUses;
        window.__finalBlowQa.input(0, { throwObject: true });
        let first = null;
        const path = [];
        let recoveryFrames = 0;
        for (let frame = 0; frame < 150; frame += 1) {
          window.__finalBlowQa.step(1 / 60);
          const snapshot = window.__finalBlowEngine.snapshot();
          if (snapshot.fighters[0].move) recoveryFrames += 1;
          const object = snapshot.projectiles.find((projectile) => projectile.throwable);
          if (!object) continue;
          if (!first) first = { ...object };
          path.push({ x: object.x, y: object.y, hazard: object.hazard, bounces: object.bouncesLeft });
        }
        const after = window.__finalBlowEngine.snapshot();
        out[id] = {
          spawned: Boolean(first),
          style: first?.style || null,
          width: Math.round(first?.width || 0),
          height: Math.round(first?.height || 0),
          travel: Math.round((path.at(-1)?.x ?? 0) - (path[0]?.x ?? 0)),
          apex: Math.round(Math.min(...path.map((point) => point.y))),
          rest: Math.round(Math.max(...path.map((point) => point.y))),
          bounced: (first?.bouncesLeft ?? 0) > (path.at(-1)?.bounces ?? 0),
          hazard: path.some((point) => point.hazard),
          startUses,
          usesAfter: after.fighters[0].throwableUses,
          recoveryFrames,
        };
      }
      return out;
    })()`);
    objectStyles = new Set();
    for (const [id, object] of Object.entries(throwables)) {
      assert.ok(object.spawned, `${id} must be able to throw a personal object`);
      assert.ok(object.style, `${id}'s object must have a style`);
      objectStyles.add(object.style);
      assert.equal(object.usesAfter, object.startUses - 1, `${id}'s object must cost a use`);
      assert.ok(object.startUses >= 2 && object.startUses <= 4, `${id} must have a bounded per-round supply`);
      assert.ok(object.recoveryFrames >= 24, `${id}'s throw must leave a real recovery window, got ${object.recoveryFrames}`);
      assert.ok(object.travel > 120, `${id}'s object must actually travel, got ${object.travel}`);
    }
    assert.equal(objectStyles.size, 8, "every fighter must have a visually distinct object");

    // Archetypes, not eight fireballs.
    assert.ok(throwables.benny.travel > throwables.alan.travel * 1.6, "the X-Acto out-ranges the loogies by a wide margin");
    assert.equal(throwables.benny.apex, throwables.benny.rest, "the X-Acto flies dead straight");
    assert.ok(throwables.deathblow.width >= 90, "the pizza is a broad disc");
    assert.ok(throwables.ali.apex < throwables.donald.apex, "the vinyl record is the steeper anti-air arc");
    assert.ok(throwables.donald.bounced, "the golf ball skips off the floor");
    assert.ok(throwables.post.bounced && throwables.post.hazard, "the wires bounce then uncoil into a hazard");
    assert.ok(throwables.cyraxx.hazard, "the bed bugs linger as a floor hazard");
    assert.ok(throwables.alan.travel < 340, "the loogies stay short-range close pressure");

    // Jez's cable reels a clean hit in, and does not on block.
    tether = await evaluate(client, `(() => {
      const run = (guard) => {
        window.__finalBlowQa.fight('jez', 'deathblow');
        window.__finalBlowQa.positions(240, 1000);
        if (guard) window.__finalBlowQa.input(1, { guard: true }, 200);
        window.__finalBlowQa.input(0, { throwObject: true });
        for (let frame = 0; frame < 150; frame += 1) window.__finalBlowQa.step(1 / 60);
        const snapshot = window.__finalBlowEngine.snapshot();
        return { gap: Math.round(snapshot.fighters[1].x - snapshot.fighters[0].x), result: snapshot.fighters[1].lastHitResult };
      };
      return { clean: run(false), blocked: run(true) };
    })()`);
    assert.ok(tether.clean.gap < 320, `a clean mouse hit must reel the opponent in, gap was ${tether.clean.gap}`);
    assert.ok(tether.blocked.gap > tether.clean.gap + 200, "a blocked mouse must not reel anyone in");

    // The supply is finite: throwing until empty stops producing objects.
    ammo = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      let thrown = 0;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        window.__finalBlowQa.positions(300, 1050);
        const before = window.__finalBlowEngine.snapshot().fighters[0].throwableUses;
        window.__finalBlowQa.input(0, { throwObject: true });
        for (let frame = 0; frame < 80; frame += 1) window.__finalBlowQa.step(1 / 60);
        if (window.__finalBlowEngine.snapshot().fighters[0].throwableUses < before) thrown += 1;
      }
      return { thrown, left: window.__finalBlowEngine.snapshot().fighters[0].throwableUses };
    })()`);
    assert.equal(ammo.left, 0, "the supply must run out");
    assert.equal(ammo.thrown, 2, "DeathBlow gets exactly two pizzas per round");
});

probe('stage-weapons', async () => {
    // Stage weapons: one themed pickup per stage, arriving at a seeded time and a
    // fair floor slot, contested with down + HP, thrown with HP, single use.
    weaponPlans = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      const plan = (stage, round) => window.__finalBlowQa.stageWeaponPlan(stage, round);
      const first = plan('somerset', 1);
      return {
        repeat: JSON.stringify(plan('somerset', 1)) === JSON.stringify(first),
        perRound: JSON.stringify(plan('somerset', 2)) !== JSON.stringify(first),
        stages: ['somerset', 'vet', 'wildwood', 'buffet', 'cruise', 'janney'].map((stage) => plan(stage, 1)),
        // 5.3 SPECTACLE (#18): the arrival choreography per stage — where the
        // object leaves from, and the path it takes to the slot.
        arrivals: ['somerset', 'vet', 'wildwood', 'buffet', 'cruise', 'janney']
          .map((stage) => window.__finalBlowQa.weaponArrival(stage, 640, 8)),
        first,
      };
    })()`);
    assert.equal(weaponPlans.repeat, true, "the same seed and round must always plan the same arrival");
    assert.equal(weaponPlans.perRound, true, "each round gets its own arrival");
    weaponIds = weaponPlans.stages.map((plan) => plan.weaponId);
    // 5.3 SPECTACLE (#18): Janney Street finally gets one — a loose brick.
    assert.deepEqual(weaponIds, ["needle", "bottle", "pigeon", "tongs", "souvenir-cup", "brick"]);
    assert.equal(new Set(weaponIds).size, 6, "every stage has its own weapon type");
    // Every stage's weapon comes off a named piece of that stage, on its own
    // path, and the cue text names the same piece of furniture.
    assert.deepEqual(weaponPlans.arrivals.map((arrival) => arrival.kind),
      ["stairs", "lob", "rail", "counter", "chair", "wall"]);
    for (const arrival of weaponPlans.arrivals) {
      assert.ok(arrival.origin.x >= 76 && arrival.origin.x <= 1204, `${arrival.stageId} source is on the plate`);
      assert.ok(arrival.origin.y < 520, `${arrival.stageId} source is off the floor`);
      const last = arrival.path[arrival.path.length - 1];
      assert.equal(last.x, 640, `${arrival.stageId} arrival ends on the landing slot`);
      assert.equal(last.y, 600, `${arrival.stageId} arrival ends on the floor`);
      assert.ok(arrival.path.some((step) => step.x !== 640), `${arrival.stageId} arrival actually travels`);
      assert.ok(arrival.path.some((step) => step.airborne), `${arrival.stageId} arrival leaves the ground`);
    }
    for (const plan of weaponPlans.stages) {
      assert.ok(plan.spawnFrame > 60 * 10, "a weapon must not arrive off the opening bell");
      assert.ok(plan.spawnFrame < 99 * 60, "a weapon must arrive inside the round");
      assert.ok(plan.x > 200 && plan.x < 1100, "spawn slots must be reachable floor positions");
    }

    weaponFlow = await evaluate(client, `(() => {
      const out = {};
      window.__finalBlowQa.stageWeapons(true);
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.forceStageWeapon(600);
      window.__finalBlowQa.positions(600, 1050);
      out.onFloor = window.__finalBlowEngine.snapshot().stageWeapon;
      window.__finalBlowQa.input(0, { down: true, heavy: true }, 4);
      window.__finalBlowQa.step(12 / 60);
      const held = window.__finalBlowEngine.snapshot();
      out.held = { phase: held.stageWeapon.phase, holder: held.stageWeapon.holder, carried: held.fighters[0].carriedWeapon, move: held.fighters[0].move };
      const startX = held.fighters[0].x;
      window.__finalBlowQa.input(0, { jump: true, right: true }, 24);
      window.__finalBlowQa.step(0.4);
      const carrying = window.__finalBlowEngine.snapshot();
      out.carrying = { grounded: carrying.fighters[0].grounded, walked: Math.round(carrying.fighters[0].x - startX) };
      window.__finalBlowQa.input(0, { right: true, heavy: true }, 6);
      window.__finalBlowQa.step(0.35);
      const thrown = window.__finalBlowEngine.snapshot();
      out.thrown = { phase: thrown.stageWeapon.phase, carried: thrown.fighters[0].carriedWeapon, move: thrown.fighters[0].move };
      window.__finalBlowQa.step(1.6);
      const landed = window.__finalBlowEngine.snapshot();
      out.landed = { health: landed.fighters[1].health, result: landed.fighters[1].lastHitResult, weapons: landed.projectiles.length };
      // Single use: the weapon does not come back this round.
      window.__finalBlowQa.step(3);
      out.afterwards = window.__finalBlowEngine.snapshot().stageWeapon.phase;
      return out;
    })()`);
    assert.equal(weaponFlow.onFloor.phase, "ground");
    assert.equal(weaponFlow.held.phase, "held");
    assert.equal(weaponFlow.held.carried, "needle");
    assert.equal(weaponFlow.held.move, null, "the pickup press must not leak out as a normal");
    assert.equal(weaponFlow.carrying.grounded, true, "carrying a weapon must stop you jumping");
    assert.ok(weaponFlow.carrying.walked > 40 && weaponFlow.carrying.walked < 120, "carrying slows the walk without freezing it");
    assert.equal(weaponFlow.thrown.phase, "thrown");
    assert.equal(weaponFlow.thrown.carried, null);
    assert.match(weaponFlow.thrown.move, /stage-weapon-needle/);
    assert.ok(weaponFlow.landed.health < 100, "a thrown stage weapon must hurt");
    assert.equal(weaponFlow.landed.weapons, 0, "the weapon is single use and removed after it lands");
    assert.notEqual(weaponFlow.afterwards, "ground", "the weapon must not respawn inside the round");

    // Out of pickup range, down + HP is still just a crouching heavy.
    farPickup = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.forceStageWeapon(1100);
      window.__finalBlowQa.positions(300, 950);
      window.__finalBlowQa.input(0, { down: true, heavy: true }, 3);
      window.__finalBlowQa.step(0.12);
      const snapshot = window.__finalBlowEngine.snapshot();
      return { move: snapshot.fighters[0].move, carried: snapshot.fighters[0].carriedWeapon, phase: snapshot.stageWeapon.phase };
    })()`);
    assert.equal(farPickup.carried, null, "you cannot pick up a weapon you are not standing near");
    assert.equal(farPickup.phase, "ground");
    assert.match(farPickup.move, /foundation-sweep/, "out of range, down + HP stays the crouching heavy");

    // Passive CPU never collects a weapon, and the option can turn them off.
    weaponRules = await evaluate(client, `(() => {
      window.__finalBlowQa.difficulty('passive');
      window.__finalBlowQa.aiFight('deathblow', 'jez', 'passive');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.forceStageWeapon(900);
      window.__finalBlowQa.positions(880, 920);
      for (let frame = 0; frame < 240; frame += 1) window.__finalBlowQa.step(1 / 60);
      const passive = window.__finalBlowEngine.snapshot();
      window.__finalBlowQa.difficulty('street');
      const off = window.__finalBlowQa.stageWeapons(false);
      window.__finalBlowQa.fight('deathblow', 'jez');
      const disabled = window.__finalBlowEngine.snapshot().stageWeapon;
      const stored = localStorage.getItem('final-blow-stage-weapons');
      window.__finalBlowQa.stageWeapons(true);
      return { passiveCarried: passive.fighters[1].carriedWeapon, off, disabled, stored, toggle: document.querySelector('#stageWeaponToggle') !== null };
    })()`);
    assert.equal(weaponRules.passiveCarried, null, "a Passive CPU must never collect a stage weapon");
    assert.equal(weaponRules.off, false);
    assert.equal(weaponRules.disabled, null, "turning stage weapons off removes them");
    assert.equal(weaponRules.stored, "0", "the STAGE WEAPONS setting persists");
    assert.equal(weaponRules.toggle, true, "there is a STAGE WEAPONS option");
});

probe('battle-scars', async () => {
    // 5.3 SPECTACLE (#19): battle scars — more than one flavour per floor, from
    // knockdowns AND wall splats AND stage-weapon impacts, on the walls where
    // the stage has them, and mirrored to CINEMA 3D as decal descriptors.
    scars = await evaluate(client, `(() => {
      const out = {};
      const sample = (stage) => {
        window.__finalBlowQa.stage(stage);
        window.__finalBlowQa.scarsClear();
        for (let index = 0; index < 12; index += 1) window.__finalBlowQa.pushScar(300 + index * 40, 'knockdown');
        const floor = window.__finalBlowQa.scars();
        window.__finalBlowQa.pushScar(76, 'wall', { wall: -1, y: 430 });
        window.__finalBlowQa.pushScar(1204, 'wall', { wall: 1, y: 415 });
        const withWalls = window.__finalBlowQa.scars();
        return { surface: floor.surface, kinds: Object.keys(floor.kinds), walls: withWalls.walls, decals: withWalls.decals.length };
      };
      window.__finalBlowQa.fight('deathblow', 'jez');
      out.buffet = sample('buffet');
      out.wildwood = sample('wildwood');
      out.cruise = sample('cruise');
      out.janney = sample('janney');
      // A weapon leaves ITS mess wherever it lands: glass is glass on tile.
      window.__finalBlowQa.scarsClear();
      out.bottle = window.__finalBlowQa.pushScar(600, 'weapon', { weaponStyle: 'bottle' });
      out.cup = window.__finalBlowQa.pushScar(700, 'weapon', { weaponStyle: 'cup' });
      out.brick = window.__finalBlowQa.pushScar(800, 'weapon', { weaponStyle: 'brick' });
      out.decal = window.__finalBlowQa.scars().decals[0];
      out.dedupe = window.__finalBlowQa.pushScar(800, 'weapon', { weaponStyle: 'brick' });
      return out;
    })()`);
    assert.equal(scars.buffet.surface, "tile");
    assert.equal(scars.wildwood.surface, "planks");
    assert.equal(scars.cruise.surface, "poolDeck");
    assert.equal(scars.janney.surface, "rubble");
    for (const stage of ["buffet", "wildwood", "cruise", "janney"]) {
      assert.ok(scars[stage].kinds.length >= 2, `${stage} floor wears more than one flavour of scar`);
      assert.equal(scars[stage].walls, 2, `${stage} keeps a mark on both walls`);
      // (the battery profile caps the list at 10, so this is the low bound)
      assert.ok(scars[stage].decals >= 10, `${stage} hands its scars to CINEMA 3D`);
    }
    assert.ok(!scars.wildwood.kinds.includes("splash"), "the boardwalk never puddles");
    assert.ok(scars.cruise.kinds.includes("splash"), "the wet deck splashes");
    assert.equal(scars.bottle.kind, "shards");
    assert.equal(scars.cup.kind, "splash");
    assert.equal(scars.brick.kind, "dent");
    assert.equal(scars.dedupe, null, "one impact can never double-mark the same spot on the same tick");
    assert.ok(scars.decal.width > 0 && typeof scars.decal.kind === "string", "decals carry a size and a kind");
});

probe('cyraxx-art', async () => {
    // Cyraxx's rebuilt art: every atlas cell must carry a sprite, the alpha must be
    // clean, and the palette must read as a blue-shirted man rather than the old
    // purple-and-green cyber-goth.
    cyraxxArt = await evaluate(client, `(async () => {
      const load = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
      const analyse = async (src, cells) => {
        const image = await load(src);
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const cell = image.width / cells;
        const filled = [];
        let magentaFringe = 0;
        let bluePixels = 0;
        let opaquePixels = 0;
        for (let row = 0; row < cells; row += 1) {
          for (let col = 0; col < cells; col += 1) {
            const data = context.getImageData(col * cell, row * cell, cell, cell).data;
            let solid = 0;
            for (let index = 0; index < data.length; index += 4) {
              const [r, g, b, a] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
              if (a < 140) continue;
              solid += 1;
              opaquePixels += 1;
              if (Math.min(r, b) - g > 90) magentaFringe += 1;
              if (b > r + 18 && b > 70 && b < 210 && g > r - 10) bluePixels += 1;
            }
            filled.push(solid);
          }
        }
        return {
          size: [image.width, image.height],
          cells: filled.length,
          emptyCells: filled.filter((count) => count < 400).length,
          minFill: Math.min(...filled),
          magentaFringeRatio: magentaFringe / Math.max(1, opaquePixels),
          blueRatio: bluePixels / Math.max(1, opaquePixels),
        };
      };
      return {
        atlas: await analyse('assets/atlases/cyraxx.webp', 4),
        specials: await analyse('assets/moves/cyraxx-specials.webp', 4),
        portrait: await analyse('assets/fighters/cyraxx.webp', 1),
      };
    })()`);
    for (const [name, art] of Object.entries(cyraxxArt)) {
      assert.equal(art.emptyCells, 0, `${name}: every cell must contain a sprite`);
      assert.ok(art.minFill > 2000, `${name}: cells must hold a full figure, smallest was ${art.minFill}`);
      assert.ok(art.magentaFringeRatio < 0.005, `${name}: keyed magenta must not survive as a fringe`);
      assert.ok(art.blueRatio > 0.04, `${name}: the blue T-shirt must be a visible part of the palette`);
    }
    assert.deepEqual(cyraxxArt.atlas.size, [1280, 1280]);
    assert.deepEqual(cyraxxArt.specials.size, [1280, 1280]);
    assert.deepEqual(cyraxxArt.portrait.size, [588, 720]);
});

probe('crowd-density', async () => {
    // Somerset's people live in the generated photoreal plate instead of being
    // overpainted with arcade pedestrians. They stay visibly folded forward with
    // heads near their knees while the open foreground remains the fight plane.
    crowdProbe = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      const samples = [];
      for (let step = 0; step < 12; step += 1) {
        window.__finalBlowQa.step(1.5);
        samples.push(window.__finalBlowEngine.snapshot().crowd);
      }
      const first = window.__finalBlowEngine.snapshot().crowd;
      // Same seed and round must rebuild the identical crowd.
      window.__finalBlowQa.stage('somerset');
      const rebuilt = window.__finalBlowEngine.snapshot().crowd;
      const snapshot = window.__finalBlowEngine.snapshot();
      return {
        samples,
        first,
        rebuilt,
        art: snapshot.stageArt,
        ticker: document.querySelector('#stageTicker').textContent,
        preview: getComputedStyle(document.querySelector('.somerset-preview')).backgroundImage,
        reaction: snapshot.crowdReaction,
      };
    })()`);
    visibleCounts = crowdProbe.samples.map((sample) => sample.visible);
    assert.ok(Math.min(...visibleCounts) >= 8, "the Somerset plate must keep its seated background adults visible");
    for (const sample of crowdProbe.samples) {
      assert.equal(sample.variant, "somerset");
      assert.equal(sample.embeddedPeople, 9);
      assert.equal(sample.embeddedPose, "deep-slump-head-near-knees");
      // v5.3 CROWD DEPTH pin change: Somerset is no longer people-free. The ban
      // was on ARCADE pedestrians walking the band across the photoreal plate;
      // the stage now carries eight PAINTED bystanders standing at fixed marks
      // (engine/crowd.mjs `stations`) on the two sidewalks and at the station
      // mouth, none of whom walks anywhere and none of whom is a vector figure.
      // What must still hold is that they are all painted and all stationed.
      assert.equal(sample.stationed, 8, "Somerset's bystanders stand at fixed marks, never walking the band");
      assert.equal(sample.sheetVariant, "tailgate", "and are painted from the borrowed bank, not drawn as arcade figures");
      assert.equal(sample.grade, "night", "re-lit for the street they stand on");
    }
    assert.deepEqual(crowdProbe.rebuilt, crowdProbe.first, "the Somerset presentation metadata must rebuild deterministically");
    assert.equal(crowdProbe.art.asset, "assets/somerset-septa.webp");
    assert.equal(crowdProbe.art.loaded, true);
    assert.equal(crowdProbe.art.style, "photorealistic-street");
    assert.equal(crowdProbe.art.embeddedPeople, 9);
    assert.equal(crowdProbe.art.embeddedPose, "deep-slump-head-near-knees");
    assert.match(crowdProbe.ticker, /SOMERSET SEPTA STATION.*STREET ENTRANCE/);
    assert.match(crowdProbe.preview, /somerset-septa\.webp/);
});

probe('stage-tailgate', async () => {
    // The Vet is an unmistakable Eagles keg tailgate: a dense fan crowd with
    // drinking postures, six keg stations and several deterministic scuffles.
    tailgate = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'donald');
      window.__finalBlowQa.stage('vet');
      const samples = [];
      for (let step = 0; step < 8; step += 1) {
        window.__finalBlowQa.step(1.5);
        samples.push(window.__finalBlowEngine.snapshot().crowd);
      }
      window.__finalBlowQa.stage('somerset');
      const street = window.__finalBlowEngine.snapshot().crowd;
      window.__finalBlowQa.stage('vet');
      const rebuilt = window.__finalBlowEngine.snapshot().crowd;
      const snapshot = window.__finalBlowEngine.snapshot();
      return {
        samples,
        street,
        rebuilt,
        art: snapshot.stageArt,
        ticker: document.querySelector('#stageTicker').textContent,
        preview: getComputedStyle(document.querySelector('.vet-preview')).backgroundImage,
      };
    })()`);
    for (const sample of tailgate.samples) {
      assert.equal(sample.variant, "tailgate");
      assert.equal(sample.kegs, 6, "the animated layer must keep six tapped keg stations");
      assert.ok(sample.visible >= 25, `the tailgate must stay dense, saw ${sample.visible}`);
      assert.ok(sample.scuffles >= 3, `several scuffles must be running, saw ${sample.scuffles}`);
      assert.ok(sample.scuffleKinds.length >= 3, "scuffles must use different fight loops");
      const drinking = ["drink", "chug", "toast", "pour", "stumble"]
        .reduce((total, id) => total + (sample.postures[id] || 0), 0);
      assert.ok(
        drinking / sample.visible > 0.4,
        `the lot must be dominated by drinking, got ${Math.round(drinking / sample.visible * 100)}%`,
      );
    }
    assert.equal(tailgate.street.variant, "somerset", "Somerset keeps its photographic background actors");
    assert.equal(tailgate.street.embeddedPeople, 9);
    // PIN MOVED (5.3 CROWD DEPTH): Somerset used to have no loop groups at all
    // — the assertion below read 0. `engine/crowd.mjs` now gives the street ONE
    // argument by the left-hand awnings (variant.scuffles = 1, kinds argue /
    // shove / separate at a fixed spot), deliberately without the tailgate's
    // celebration and table-flip kinds. The rule the pin defends is unchanged:
    // Somerset is not a tailgate, so it must stay far below the lot's five.
    assert.equal(tailgate.street.scuffles, 1, "Somerset keeps its one street argument, not the tailgate's loops");
    assert.ok(tailgate.samples[0].scuffles > tailgate.street.scuffles, "the lot must stay rowdier than the street");
    assert.equal(tailgate.art.asset, "assets/veterans-stadium.webp");
    assert.equal(tailgate.art.loaded, true);
    assert.equal(tailgate.art.style, "photorealistic-eagles-tailgate");
    assert.match(tailgate.ticker, /VETERANS STADIUM.*SOUTH PHILADELPHIA/);
    assert.match(tailgate.preview, /veterans-stadium\.webp/);
    assert.deepEqual(
      tailgate.rebuilt.scuffleKinds,
      tailgate.samples[0].scuffleKinds,
      "the tailgate must rebuild deterministically",
    );
});

probe('stage-new-cards', async () => {
    // Wildwood and the Chinese Buffet: selectable, identifiable from gameplay
    // alone, correctly framed for the enlarged fighters, and wired into every mode.
    newStages = await evaluate(client, `(() => {
      const cards = [...document.querySelectorAll('.stage-card')].map((card) => card.dataset.stage);
      const out = { cards, stages: {} };
      for (const stage of ['somerset', 'wildwood', 'buffet', 'cruise', 'janney']) {
        window.__finalBlowQa.fight('benny', 'ali');
        window.__finalBlowQa.stage(stage);
        window.__finalBlowQa.positions(300, 1000);
        window.__finalBlowQa.step(2.5);
        const snapshot = window.__finalBlowEngine.snapshot();
        const weapon = window.__finalBlowQa.stageWeaponPlan(stage, 1);
        out.stages[stage] = {
          ticker: document.querySelector('#stageTicker').textContent,
          crowd: snapshot.crowd,
          weapon: weapon?.weaponId || null,
          floor: snapshot.fighters[0].y,
          bounds: [snapshot.fighters[0].movement.stageMinX, snapshot.fighters[0].movement.stageMaxX],
        };
      }
      // Every stage must be reachable by the Watch Demo shuffle bag.
      out.demoStages = window.__finalBlowQa.demoStages();
      return out;
    })()`);
    assert.deepEqual(
      newStages.cards,
      ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"],
      "every stage is selectable",
    );
    assert.match(newStages.stages.wildwood.ticker, /WILDWOOD BOARDWALK/);
    assert.match(newStages.stages.somerset.ticker, /SOMERSET SEPTA STATION/);
    assert.equal(newStages.stages.somerset.crowd.variant, "somerset");
    assert.equal(newStages.stages.somerset.crowd.embeddedPose, "deep-slump-head-near-knees");
    assert.match(newStages.stages.buffet.ticker, /CRAB-LEG SECTION/);
    assert.equal(newStages.stages.wildwood.crowd.variant, "boardwalk");
    assert.equal(newStages.stages.buffet.crowd.variant, "buffet");
    assert.equal(newStages.stages.wildwood.weapon, "pigeon", "Wildwood carries the dead pigeon");
    assert.equal(newStages.stages.buffet.weapon, "tongs", "the buffet carries the serving tongs");
    assert.equal(newStages.stages.cruise.weapon, "souvenir-cup", "the pool deck carries the souvenir cup");
    assert.match(newStages.stages.cruise.ticker, /MAIN POOL DECK/);
    assert.equal(newStages.stages.cruise.crowd.variant, "poolside");
    assert.match(newStages.stages.janney.ticker, /JANNEY STREET.*VACANT LOT/);
    assert.equal(newStages.stages.janney.crowd.variant, "vacantLot");
    assert.ok(newStages.stages.janney.crowd.visibleCats >= 12, "the lot must keep numerous animated cats on camera");
    // PIN MOVED (5.3 STAGE REACH, sweep #18): the Janney lot was the one stage
    // with no pickup and this read null. It now carries the LOOSE BRICK off the
    // boundary wall (engine/stage-weapons.mjs; tests/stage-reach.test.mjs pins
    // its envelope), so "every stage has a weapon" is the rule now.
    assert.equal(newStages.stages.janney.weapon, "brick", "the Janney lot carries the loose brick");
    assert.deepEqual(
      Object.values(newStages.stages).filter((stage) => stage.weapon === null),
      [],
      "every stage must carry a pickup",
    );
    // The pool deck is the densest crowd in the game: 35+ passengers at once.
    assert.ok(
      newStages.stages.cruise.crowd.visible >= 35,
      `the pool deck must hold 35+ passengers, saw ${newStages.stages.cruise.crowd.visible}`,
    );
    assert.ok(
      newStages.stages.cruise.crowd.scuffles >= 5,
      "the pool deck must run several concurrent incidents",
    );
    assert.ok(
      newStages.stages.cruise.crowd.scuffleKinds.length >= 3,
      "pool-deck incidents must use different loops",
    );
    for (const [id, stage] of Object.entries(newStages.stages)) {
      const minimumLife = id === "somerset" ? 8 : id === "janney" ? 12 : 20;
      assert.ok(stage.crowd.visible >= minimumLife, `${id} must feel alive, saw ${stage.crowd.visible}`);
      assert.equal(stage.floor, 600, `${id} must share the same floor line`);
      assert.deepEqual(stage.bounds, [76, 1204], `${id} must share the same stage bounds`);
    }
    assert.deepEqual(
      [...newStages.demoStages].sort(),
      ["buffet", "cruise", "janney", "somerset", "vet", "wildwood"],
      "Watch Demo must shuffle through every stage",
    );
});

probe('crowd-reaction', async () => {
    // The crowd reacts to a super and then settles back to its routes.
    crowdReaction = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.positions(500, 600);
      window.__finalBlowQa.fighter(0, { meter: 100 });
      window.__finalBlowQa.input(0, { super: true });
      window.__finalBlowQa.step(0.6);
      const stirred = window.__finalBlowEngine.snapshot().crowdReaction;
      window.__finalBlowQa.step(3);
      return { stirred, settled: window.__finalBlowEngine.snapshot().crowdReaction };
    })()`);
    assert.ok(crowdReaction.stirred > 0.2, "a super must stir the crowd");
    assert.equal(crowdReaction.settled, 0, "the crowd must return to its routes");
});

probe('fighter-framing-desktop', async () => {
    desktopFraming = await evaluate(client, FIGHTER_FRAMING_PROBE);
    assertFighterFraming(desktopFraming, "desktop");
});

probe('passive-cpu', async () => {
    // Passive CPU: the acceptance check is that a Passive opponent left running for
    // multiple full rounds at several distances performs zero offensive OR
    // defensive actions, while the human stays free to hit it.
    passiveRun = await evaluate(client, `(() => {
      window.__finalBlowQa.difficulty('passive');
      window.__finalBlowQa.aiFight('deathblow', 'jez', 'passive');
      const distances = [40, 90, 180, 320, 520, 780];
      const seen = new Set();
      let moved = 0;
      let attacked = 0;
      let guarded = 0;
      let jumped = 0;
      let grabbed = 0;
      let meterSpent = 0;
      let frames = 0;
      for (const distance of distances) {
        window.__finalBlowQa.positions(400, 400 + distance);
        window.__finalBlowQa.fighter(1, { meter: 100, health: 100 });
        const startX = window.__finalBlowEngine.snapshot().fighters[1].x;
        for (let frame = 0; frame < 320; frame += 1) {
          window.__finalBlowQa.step(1 / 60);
          frames += 1;
          const cpu = window.__finalBlowEngine.snapshot().fighters[1];
          seen.add(cpu.state);
          if (cpu.move) attacked += 1;
          if (cpu.guarding) guarded += 1;
          if (!cpu.grounded) jumped += 1;
          if (cpu.grabbing) grabbed += 1;
          if (cpu.meter < 100) meterSpent += 1;
          if (Math.abs(cpu.x - startX) > 2) moved += 1;
        }
      }
      return { seen: [...seen], moved, attacked, guarded, jumped, grabbed, meterSpent, frames };
    })()`);
    assert.ok(passiveRun.frames >= 1900, "passive run must cover multiple full rounds of frames");
    assert.equal(passiveRun.attacked, 0, "a Passive CPU must never attack");
    assert.equal(passiveRun.guarded, 0, "a Passive CPU must never automatically block");
    assert.equal(passiveRun.jumped, 0, "a Passive CPU must never jump");
    assert.equal(passiveRun.grabbed, 0, "a Passive CPU must never grab");
    assert.equal(passiveRun.meterSpent, 0, "a Passive CPU must never spend Grit");
    assert.equal(passiveRun.moved, 0, "a Passive CPU must never advance or chase");
    assert.deepEqual(passiveRun.seen, ["idle"], `a Passive CPU must stay idle, saw ${passiveRun.seen}`);

    // The human is still free to hit it, and it still takes damage and reacts.
    passiveTarget = await evaluate(client, `(() => {
      window.__finalBlowQa.aiFight('deathblow', 'jez', 'passive');
      window.__finalBlowQa.positions(500, 600);
      window.__finalBlowQa.input(0, { heavy: true });
      window.__finalBlowQa.step(0.5);
      const hit = window.__finalBlowEngine.snapshot();
      // Fresh round: a grab needs an opponent who is not still in hitstun.
      window.__finalBlowQa.aiFight('deathblow', 'jez', 'passive');
      window.__finalBlowQa.positions(500, 560);
      window.__finalBlowQa.input(0, { right: true, light: true });
      window.__finalBlowQa.step(0.8);
      return { hit, thrown: window.__finalBlowEngine.snapshot() };
    })()`);
    assert.ok(passiveTarget.hit.fighters[1].health < 100, "a Passive CPU must still take damage");
    assert.equal(passiveTarget.hit.fighters[1].lastHitResult, "mid");
    assert.equal(passiveTarget.thrown.fighters[1].lastHitResult, "throw", "a Passive CPU can still be thrown");

    // Restore a fighting difficulty for the rest of the run.
    await evaluate(client, `window.__finalBlowQa.difficulty('street')`);
});

probe('difficulty-ui', async () => {
    // The difficulty picker is visible before an Arcade match and remembers itself.
    difficultyUi = await evaluate(client, `(() => {
      document.querySelector('[data-mode="arcade"]').click();
      const bar = document.querySelector('#difficultyBar');
      const buttons = [...document.querySelectorAll('#difficultyOptions button')];
      buttons.find((button) => button.dataset.difficulty === 'passive').click();
      const afterClick = {
        stored: localStorage.getItem('final-blow-ai-difficulty'),
        checked: [...document.querySelectorAll('#difficultyOptions button')]
          .filter((button) => button.getAttribute('aria-checked') === 'true')
          .map((button) => button.dataset.difficulty),
        hint: document.querySelector('#difficultyHint').textContent,
        optionsSelect: document.querySelector('#aiDifficultySelect').value,
      };
      document.querySelector('[data-mode="versus"]').click();
      const versusHidden = document.querySelector('#difficultyBar').hidden;
      document.querySelector('[data-mode="arcade"]').click();
      return {
        visibleInArcade: !bar.hidden,
        labels: buttons.map((button) => button.textContent),
        afterClick,
        versusHidden,
      };
    })()`);
    assert.equal(difficultyUi.visibleInArcade, true, "difficulty must be visible before an Arcade match");
    assert.deepEqual(difficultyUi.labels, ["PASSIVE", "ROOKIE", "STREET", "PRO", "FINAL"]);
    assert.deepEqual(difficultyUi.afterClick.checked, ["passive"]);
    assert.equal(difficultyUi.afterClick.stored, "passive", "the choice must persist between sessions");
    assert.equal(difficultyUi.afterClick.optionsSelect, "passive", "the options screen must stay in sync");
    assert.match(difficultyUi.afterClick.hint, /Never attacks/);
    assert.equal(difficultyUi.versusHidden, true, "no CPU picker in local versus");
    await evaluate(client, `window.__finalBlowQa.difficulty('street'); document.querySelector('#homeLink').click();`);
});

probe('scene-dressing', async () => {
    // Scene dressing: reflections, afterimages, dust, layered sparks, and the
    // super spotlight all have to be alive on the default profile.
    sceneDressing = await evaluate(client, `(() => {
      const out = {};
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.positions(430, 900);
      window.__finalBlowQa.input(0, { right: true }, 2); window.__finalBlowQa.step(3 / 60);
      window.__finalBlowQa.input(0, {}, 2); window.__finalBlowQa.step(3 / 60);
      window.__finalBlowQa.input(0, { right: true }, 2); window.__finalBlowQa.step(4 / 60);
      let snapshot = window.__finalBlowEngine.snapshot();
      out.dash = {
        afterimages: snapshot.violence.afterimages,
        dust: snapshot.violence.dustParticles,
        reflections: snapshot.violence.reflections,
      };
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.positions(500, 610);
      window.__finalBlowQa.input(0, { heavy: true });
      out.peakSparks = 0;
      out.peakRings = 0;
      for (let frame = 0; frame < 40; frame += 1) {
        window.__finalBlowQa.step(1 / 60);
        const violence = window.__finalBlowEngine.snapshot().violence;
        out.peakSparks = Math.max(out.peakSparks, violence.sparkLines);
        out.peakRings = Math.max(out.peakRings, violence.shockRings);
      }
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(480, 640);
      window.__finalBlowQa.fighter(0, { meter: 100 });
      window.__finalBlowQa.input(0, { super: true });
      window.__finalBlowQa.step(0.25);
      out.superDim = window.__finalBlowEngine.snapshot().violence.superDim;
      window.__finalBlowQa.step(3);
      out.superDimSettled = window.__finalBlowEngine.snapshot().violence.superDim;
      return out;
    })()`);
    assert.ok(sceneDressing.dash.afterimages > 0, "a dash must leave a ghost trail");
    assert.ok(sceneDressing.dash.dust > 0, "a dash must kick up dust");
    assert.equal(sceneDressing.dash.reflections, true, "Somerset's wet street must reflect the fighters");
    assert.ok(sceneDressing.peakSparks > 0, "a landed heavy must throw speed-line sparks");
    assert.ok(sceneDressing.peakRings > 0, "a landed heavy must ring a shockwave");
    assert.ok(sceneDressing.superDim > 0.3, `the super spotlight must darken the stage, got ${sceneDressing.superDim}`);
    assert.ok(sceneDressing.superDimSettled < 0.1, "the spotlight must lift after the super ends");
});

probe('facing-streak', async () => {
    // Facing regression: outside grabs and finishers, no fighter may sustain a
    // wrong facing for a third of a second in any state, and the KO scene must
    // hold long enough to be seen before the next round begins.
    facingAndHold = await evaluate(client, `(() => {
      const out = { wrongFacingStreaks: 0, unopposedFrames: 0 };
      window.__finalBlowQa.aiFight('jez', 'cyraxx', 'final');
      let streaks = [0, 0];
      // A fighter still inside its attack's active window is allowed to point
      // away — that committed direction is what makes a cross-up punishable.
      const committed = (f) => Boolean(f.attack) && f.attackFrame <= (f.activeEndFrame ?? Infinity);
      for (let frame = 0; frame < 1800; frame += 1) {
        window.__finalBlowQa.step(1 / 60);
        const snapshot = window.__finalBlowEngine.snapshot();
        if (snapshot.phase !== 'fight') { streaks = [0, 0]; continue; }
        // Pair invariant: whenever nobody is grabbing or mid-attack, the two
        // fighters must face *each other*. Unlike the streak check below this
        // holds inside the overlap deadband as well — the exact window where
        // per-fighter resolution used to strand both sprites facing the same way.
        const [a, b] = snapshot.fighters;
        const posed = a.grabbing || a.grabbed || b.grabbing || b.grabbed;
        if (!posed && !committed(a) && !committed(b) && a.facing !== -b.facing) out.unopposedFrames += 1;
        for (const side of [0, 1]) {
          const me = snapshot.fighters[side];
          const op = snapshot.fighters[1 - side];
          if (Math.abs(op.x - me.x) < 20 || me.grabbing || me.grabbed) { streaks[side] = 0; continue; }
          const want = op.x > me.x ? 1 : -1;
          streaks[side] = me.facing !== want ? streaks[side] + 1 : 0;
          if (streaks[side] === 21) out.wrongFacingStreaks += 1;
        }
      }
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 600);
      window.__finalBlowQa.fighter(1, { health: 1 });
      window.__finalBlowQa.input(0, { heavy: true });
      window.__finalBlowQa.step(0.6);
      out.afterKO = window.__finalBlowEngine.snapshot().phase;
      window.__finalBlowQa.step(6.2);
      out.afterFinishWindow = window.__finalBlowEngine.snapshot().phase;
      window.__finalBlowQa.step(3.6);
      out.midHold = window.__finalBlowEngine.snapshot().phase;
      window.__finalBlowQa.step(3.5);
      out.afterHold = window.__finalBlowEngine.snapshot().phase;
      return out;
    })()`);
    assert.equal(facingAndHold.wrongFacingStreaks, 0, "no sustained wrong facing in any state");
    assert.equal(facingAndHold.unopposedFrames, 0, "idle fighters must always face each other");
});

probe('crossup', async () => {
    // A jump-in cross-up is the case the streak probe above cannot reach: an
    // airborne pair skips pushbox separation, so the two fighters sit right on
    // top of each other for several frames. Resolving facing per-fighter used to
    // strand both sprites pointing the same way in exactly that window, and it
    // persisted after the jump because neither was far enough apart to re-face.
    crossup = await evaluate(client, `(() => {
      const out = {
        minGap: Infinity, unopposedFrames: 0, airborneFrames: 0,
        releasedInsideDeadband: 0, settledWrong: 0, cases: 0,
      };
      const committed = (f) => Boolean(f.attack) && f.attackFrame <= (f.activeEndFrame ?? Infinity);
      // Sweep the button timing: the stranded window opens only when a committed
      // attack *ends* while the pair is still overlapped, so a single fixed
      // timing can miss it entirely. Every press frame is deterministic.
      for (let pressFrame = 0; pressFrame <= 26; pressFrame += 2) {
        window.__finalBlowQa.fight('deathblow', 'jez');
        window.__finalBlowQa.positions(560, 640);
        window.__finalBlowQa.input(0, { jump: true, right: true }, 6);
        out.cases += 1;
        let wasCommitted = false;
        for (let frame = 0; frame < 110; frame += 1) {
          if (frame === pressFrame) window.__finalBlowQa.input(0, { heavy: true, right: true }, 4);
          window.__finalBlowQa.step(1 / 60);
          const [a, b] = window.__finalBlowEngine.snapshot().fighters;
          const posed = a.grabbing || a.grabbed || b.grabbing || b.grabbed;
          const gap = Math.abs(b.x - a.x);
          if (!a.grounded || !b.grounded) out.airborneFrames += 1;
          const nowCommitted = committed(a) || committed(b);
          // The exact frame an attack releases while still inside the overlap.
          if (wasCommitted && !nowCommitted && gap <= 14) out.releasedInsideDeadband += 1;
          wasCommitted = nowCommitted;
          if (posed || nowCommitted) continue;
          out.minGap = Math.min(out.minGap, gap);
          if (a.facing !== -b.facing) out.unopposedFrames += 1;
        }
        const [a, b] = window.__finalBlowEngine.snapshot().fighters;
        if (a.facing !== (b.x > a.x ? 1 : -1) || b.facing !== (a.x > b.x ? 1 : -1)) out.settledWrong += 1;
      }
      return out;
    })()`);
    assert.ok(crossup.airborneFrames > 0, "the cross-up probe must actually leave the ground");
    assert.ok(
      crossup.minGap <= 14,
      `the cross-up probe must close inside the facing deadband, got ${crossup.minGap}`,
    );
    assert.ok(
      crossup.releasedInsideDeadband > 0,
      "the sweep must land at least one attack release inside the overlap, or it never tests the stranded window",
    );
    assert.equal(crossup.unopposedFrames, 0, "a jump-in cross-up must never leave both fighters facing the same way");
    assert.equal(crossup.settledWrong, 0, `once the jump settles, both fighters must look at each other (${crossup.cases} timings swept)`);
});

probe('rollback-and-ex-reach', async () => {
    // Online play rolls back and resimulates, so every field the facing decision
    // reads has to survive a snapshot round-trip. The pair axis is the one piece
    // of facing state that lives on the match rather than on a fighter, which is
    // exactly the kind of field a snapshot is easy to forget.
    rollbackFacing = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(560, 640);
      // Get airborne and overlapping first, so the deadband is actively holding
      // the axis instead of it being trivially recomputable from positions.
      window.__finalBlowQa.input(0, { jump: true, right: true }, 6);
      window.__finalBlowQa.step(0.3);
      const before = window.__finalBlowEngine.snapshot().fighters.map((f) => f.facing);
      const probe = window.__finalBlowQa.rollbackProbe(0.5);
      const after = window.__finalBlowEngine.snapshot().fighters.map((f) => f.facing);
      return { ...probe, before, after };
    })()`);
    // 1.9 regression, captured live: cyraxx committed to BUFFER SKIP EX faced the
    // wrong way for 21+ frames with the opponent 248px BEHIND it. The move's
    // hitboxes span local x 19..274, so they cannot reach backwards at all — the
    // lock was protecting a cross-up that could not exist. Drive the real move,
    // sample it inside the release window, and check both sides of the rule.
    exReach = await evaluate(client, `(() => {
      const out = { triggered: false };
      window.__finalBlowQa.fight('cyraxx', 'jez');
      window.__finalBlowQa.fighter(0, { meter: 100 });
      window.__finalBlowQa.positions(700, 820);
      window.__finalBlowQa.input(0, { enhancedBackSpecial: true }, 3);
      for (let frame = 0; frame < 60; frame += 1) {
        window.__finalBlowQa.step(1 / 60);
        const me = window.__finalBlowEngine.snapshot().fighters[0];
        if (me.move !== 'cyraxx-ex-buffer-skip') continue;
        out.seen = true;
        // Past the visibility window but still able to hit: the exact overlap
        // that stranded the sprite facing backwards.
        if (me.attackFrame <= 21) continue;
        out.triggered = true;
        out.attackFrame = me.attackFrame;
        // Place the opponent BEHIND whichever way this fighter currently faces,
        // so the assertion is about the rule and not about a hardcoded sign.
        const anchor = 700;
        const facing = me.facing;
        out.facing = facing;
        // 40px behind is a genuine cross-up: still reachable, lock must hold.
        const close = window.__finalBlowQa.positions(anchor, anchor - 40 * facing).fighters[0];
        out.closeMove = close.move;
        out.closeHeld = close.facing === facing;
        // 248px behind is the captured distance: unreachable, must turn.
        const far = window.__finalBlowQa.positions(anchor, anchor - 248 * facing).fighters[0];
        out.farMove = far.move;
        out.farTurned = far.facing === -facing;
        break;
      }
      return out;
    })()`);
    assert.equal(exReach.seen, true, "the probe must actually land BUFFER SKIP EX, or it asserts nothing");
    assert.equal(exReach.triggered, true, "the probe must sample the move past the visibility window");
    assert.equal(exReach.closeMove, 'cyraxx-ex-buffer-skip', "the close-range check must still be mid-move");
    assert.equal(exReach.closeHeld, true, "a committed attacker keeps facing a cross-up opponent 40px behind it");
    assert.equal(exReach.farMove, 'cyraxx-ex-buffer-skip', "the long-range check must still be mid-move");
    assert.equal(exReach.farTurned, true, "an opponent 248px behind is unreachable, so the fighter must turn to face them");

    assert.equal(rollbackFacing.mutated, true, "the rollback probe must actually advance the sim before restoring");
    assert.equal(
      rollbackFacing.match,
      true,
      "a rollback must restore every simulation field the facing decision reads, pair axis included",
    );
    assert.deepEqual(rollbackFacing.after, rollbackFacing.before, "facings must come back unchanged after a rollback");
    assert.equal(facingAndHold.afterKO, "finish");
    assert.equal(facingAndHold.afterFinishWindow, "roundover", "an unclaimed finish window falls to the KO hold");
    assert.equal(facingAndHold.midHold, "roundover", "the KO scene must hold ~4.9s so the aftermath is visible");
    assert.notEqual(facingAndHold.afterHold, "roundover", "the hold must still end and move on");
});

probe('gore-aftermath', async () => {
    // Fatality realism: the killing blow dilates time, the wound pumps arterial
    // spray, and landed droplets leave a persistent stain layer on the floor.
    goreAftermath = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.graphicFatality('deathblow', 0, 0.1);
      const peak = { arterial: 0, stains: 0, severedLimbs: 0, slowMo: false };
      for (let frame = 0; frame < 460; frame += 1) {
        window.__finalBlowQa.step(1 / 60);
        const violence = window.__finalBlowEngine.snapshot().violence;
        peak.arterial = Math.max(peak.arterial, violence.arterialSprays);
        peak.stains = Math.max(peak.stains, violence.bloodStains);
        peak.severedLimbs = Math.max(peak.severedLimbs, violence.severedLimbs);
        if (violence.fatalitySlowMo) peak.slowMo = true;
      }
      return peak;
    })()`);
    assert.ok(goreAftermath.slowMo, "the killing blow must dilate time");
    assert.ok(goreAftermath.arterial > 10, `the wound must pump a sustained spray, peaked at ${goreAftermath.arterial}`);
    assert.equal(goreAftermath.severedLimbs, 1, "every graphic execution must throw one complete severed limb");
    assert.ok(goreAftermath.stains > 8, `landed droplets must stain the floor, peaked at ${goreAftermath.stains}`);
    assert.ok(goreAftermath.stains <= 56, "the stain layer must respect its cap");
});

probe('dizzy', async () => {
    // Dizzy: repeated clean hits stun, the meter bleeds off when they stop, the
    // dizzy is a real punish window, and recovery grants a long immunity so it can
    // never loop.
    dizzy = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      let dizzied = null;
      for (let attempt = 0; attempt < 14 && !dizzied; attempt += 1) {
        window.__finalBlowQa.positions(500, 600);
        window.__finalBlowQa.fighter(1, { health: 100 });
        // Held for a stretch of frames: with the 1.9C hitstop the previous
        // swing's recovery can outlast a one-frame press's buffer window, and a
        // player mashing heavies would keep the button coming anyway.
        window.__finalBlowQa.input(0, { heavy: true }, 10);
        window.__finalBlowQa.step(0.45);
        const snapshot = window.__finalBlowEngine.snapshot();
        if (snapshot.fighters[1].dizzy) dizzied = snapshot;
      }
      if (!dizzied) return { dizzied: null };
      const immediately = window.__finalBlowEngine.snapshot();
      window.__finalBlowQa.step(4);
      const recovered = window.__finalBlowEngine.snapshot();
      return { dizzied, immediately, recovered };
    })()`);
    assert.ok(dizzy.dizzied, "repeated clean heavies must eventually dizzy a fighter");
    assert.ok(dizzy.dizzied.fighters[1].dizzyFrames > 40, "a dizzy must be a real punish window");
    assert.equal(dizzy.dizzied.fighters[1].stunMeter, 0, "the stun meter resets when the dizzy starts");
    assert.equal(dizzy.recovered.fighters[1].dizzy, false, "the dizzy must end on its own");
    assert.ok(
      dizzy.recovered.fighters[1].stunImmuneFrames > 0,
      "recovery must grant stun immunity so dizzies cannot loop",
    );

    // The stun meter bleeds off when the pressure stops.
    stunDecay = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 600);
      window.__finalBlowQa.input(0, { heavy: true });
      window.__finalBlowQa.step(0.4);
      const charged = window.__finalBlowEngine.snapshot().fighters[1].stunMeter;
      window.__finalBlowQa.step(3);
      return { charged, drained: window.__finalBlowEngine.snapshot().fighters[1].stunMeter };
    })()`);
    assert.ok(stunDecay.charged > 0, "a clean heavy must add stun");
    assert.equal(stunDecay.drained, 0, "stun must bleed back to zero when the pressure stops");
});

probe('grabs', async () => {
    // Every fighter has a visible grab: a clinch that holds the victim, then a
    // release that knocks down. Forward and backward throws send opposite ways.
    grabRoster = ['deathblow', 'jez', 'alan', 'post', 'benny', 'donald', 'cyraxx', 'ali'];
    for (const fighterId of grabRoster) {
      const opponentId = fighterId === 'jez' ? 'deathblow' : 'jez';
      const clinch = await evaluate(client, `(() => {
        window.__finalBlowQa.fight('${fighterId}', '${opponentId}');
        window.__finalBlowQa.positions(500, 560);
        window.__finalBlowQa.input(0, { right: true, light: true });
        let held = null;
        let holdFrames = 0;
        let lowestY = Infinity;
        for (let frame = 0; frame < 40; frame += 1) {
          window.__finalBlowQa.step(1 / 60);
          const snapshot = window.__finalBlowEngine.snapshot();
          if (!snapshot.fighters[0].grabbing) continue;
          holdFrames += 1;
          lowestY = Math.min(lowestY, snapshot.fighters[1].y);
          if (!held) held = snapshot;
        }
        window.__finalBlowQa.input(0, {});
        window.__finalBlowQa.step(0.7);
        const released = window.__finalBlowEngine.snapshot();
        return { held, released, holdFrames, lowestY };
      })()`);
      assert.ok(clinch.held?.fighters[0].grabbing, `${fighterId} must hold the opponent during the grab`);
      assert.equal(clinch.held.fighters[1].grabbed?.attacker, 0, `${fighterId}'s victim must be held`);
      assert.equal(clinch.held.fighters[1].state, "throw");
      assert.ok(clinch.holdFrames >= 8, `${fighterId}'s clinch must be visible for several frames`);
      assert.ok(clinch.lowestY < 598, `${fighterId} must lift the victim off the floor`);
      assert.equal(clinch.released.fighters[0].grabbing, null);
      assert.equal(clinch.released.fighters[1].lastHitResult, "throw", `${fighterId}'s throw must resolve as a throw`);
      assert.ok(clinch.released.fighters[1].health < 100, `${fighterId}'s throw must deal damage on release`);
      assert.ok(
        clinch.released.fighters[1].x > clinch.released.fighters[0].x,
        `${fighterId} must send a forward throw away from itself`,
      );
    }

    // Back throw swaps sides so corners can be escaped.
    backThrow = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 560);
      window.__finalBlowQa.input(0, { left: true, light: true, throwBack: true });
      let held = null;
      for (let frame = 0; frame < 40 && !held; frame += 1) {
        window.__finalBlowQa.step(1 / 60);
        if (window.__finalBlowEngine.snapshot().fighters[0].grabbing) held = window.__finalBlowEngine.snapshot();
      }
      window.__finalBlowQa.input(0, {});
      window.__finalBlowQa.step(0.7);
      return { held, released: window.__finalBlowEngine.snapshot() };
    })()`);
    assert.equal(backThrow.held.fighters[0].grabbing?.back, true);
    assert.ok(
      backThrow.released.fighters[1].x < backThrow.released.fighters[0].x,
      "a back throw must send the victim behind the thrower",
    );

    // Outside grab range the same press is an ordinary normal, not a grab whiff.
    farLight = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(400, 900);
      window.__finalBlowQa.input(0, { right: true, light: true });
      window.__finalBlowQa.step(0.05);
      return window.__finalBlowEngine.snapshot();
    })()`);
    assert.equal(farLight.fighters[0].move, "deathblow-body-check", "out of range LP stays a normal");
    assert.equal(farLight.fighters[0].grabbing, null);

    // Grabs cannot start against a fighter already in hitstun or blockstun.
    grabDuringStun = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 560);
      window.__finalBlowQa.fighter(1, { hitstunFrames: 20 });
      window.__finalBlowQa.input(0, { right: true, light: true });
      window.__finalBlowQa.step(0.08);
      return window.__finalBlowEngine.snapshot();
    })()`);
    assert.equal(grabDuringStun.fighters[0].grabbing, null, "no grabs during hitstun");
    assert.notEqual(grabDuringStun.fighters[0].attackLevel, "throw");
});

probe('knockdown-reversal', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.7)`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    knockdown = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.ok(knockdown.fighters[1].down || knockdown.fighters[1].pendingKnockdown || knockdown.fighters[1].knockdownFrames > 0);
    await evaluate(client, `(() => {
      for (let frame = 0; frame < 180; frame += 1) {
        const fighter = window.__finalBlowEngine.snapshot().fighters[1];
        if (!fighter.down && fighter.wakeupFrames > 0 && fighter.wakeupFrames <= 3) return fighter.wakeupFrames;
        window.__finalBlowQa.step(1 / 60);
      }
      throw new Error('wakeup window not reached');
    })()`);
    await evaluate(client, `window.__finalBlowQa.input(1, { special: true })`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    reversal = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(reversal.fighters[1].move, "jez-neon-edge");
    assert.equal(reversal.fighters[1].lastHitResult, "reversal");
});

probe('command-specials', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.0167)`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    commandSpecial = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.equal(commandSpecial.fighters[0].move, "deathblow-faultline-fist");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 585)`);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyA", "a", 65);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    aftershockGrab = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyUp", "KeyA", "a", 65);
    assert.equal(aftershockGrab.fighters[0].move, "deathblow-aftershock-grab");
    assert.equal(aftershockGrab.fighters[0].moveName, "AFTERSHOCK GRAB");
    assert.equal(aftershockGrab.fighters[0].attackLevel, "throw");
    assert.equal(aftershockGrab.fighters[0].animationBank, "specials");
    if (process.env.FINAL_BLOW_DEATHBLOW_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowQa.positions(370, 920); window.__finalBlowQa.step(0.05); window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_DEATHBLOW_SCREENSHOT, Buffer.from(capture.data, "base64"));
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(true)`);
    }

    await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(1, { special: true })`);
    await evaluate(client, `window.__finalBlowQa.step(0.034); window.__finalBlowQa.input(0, { light: true }); window.__finalBlowQa.step(0.16)`);
    seismicArmor = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(seismicArmor.fighters[1].lastHitResult, "armor");
    assert.equal(seismicArmor.fighters[1].move, "deathblow-tremor-tap");
});

probe('meter-and-combos', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    launcher = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.equal(launcher.fighters[0].move, "deathblow-quarry-breaker");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 })`);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    enhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    assert.equal(enhanced.fighters[0].move, "deathblow-ex-tremor-tap");
    assert.equal(enhanced.fighters[0].meter, 25);

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 })`);
    await dispatchKey(client, "keyDown", "KeyS", "s", 83);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await dispatchKey(client, "keyUp", "KeyS", "s", 83);
    await dispatchKey(client, "keyDown", "KeyD", "d", 68);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    enhancedFaultline = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyD", "d", 68);
    assert.equal(enhancedFaultline.fighters[0].move, "deathblow-ex-faultline-fist");
    assert.equal(enhancedFaultline.fighters[0].meter, 25);

    await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 670); window.__finalBlowQa.input(0, { backSpecial: true })`);
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    vinylStep = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(vinylStep.fighters[0].move, "jez-vinyl-step");
    assert.equal(vinylStep.fighters[0].moveName, "VINYL STEP");
    assert.equal(vinylStep.fighters[0].animationBank, "specials");
    assert.ok(vinylStep.fighters[0].movement.forwardWalkSpeed > aftershockGrab.fighters[0].movement.forwardWalkSpeed);
    if (process.env.FINAL_BLOW_KIT_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowQa.positions(370, 920)`);
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_KIT_SCREENSHOT, Buffer.from(capture.data, "base64"));
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(true)`);
    }

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50, blockstunFrames: 20 })`);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    guardReversal = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    assert.equal(guardReversal.fighters[0].move, "guard-reversal");
    assert.equal(guardReversal.fighters[0].meter, 20);
    assert.equal(guardReversal.fighters[0].lastHitResult, "guard-reversal");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.2)`);
    chained = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    assert.equal(chained.fighters[0].move, "deathblow-wrecking-hook");
    assert.equal(chained.fighters[0].cancelledFrom, "deathblow-hammer-jab");
    await evaluate(client, `window.__finalBlowQa.step(0.3)`);
    twoHitCombo = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(twoHitCombo.fighters[0].combo.hits, 2);
    assert.ok(twoHitCombo.fighters[0].combo.damage < 22, "second hit should be damage-scaled below raw kit damage");
    assert.equal(await evaluate(client, `document.querySelector('#p1Combo').classList.contains('active')`), true);
    if (process.env.FINAL_BLOW_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_SCREENSHOT, Buffer.from(capture.data, "base64"));
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(true)`);
    }

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await dispatchKey(client, "keyDown", "KeyM", "m", 77);
    await evaluate(client, `window.__finalBlowQa.step(0.2)`);
    hitConfirm = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyM", "m", 77);
    assert.equal(hitConfirm.fighters[0].move, "deathblow-wrecking-hook-hk", "LP chains into the heavy kick");
    assert.equal(hitConfirm.fighters[0].cancelledFrom, "deathblow-hammer-jab");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.1)`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    // The wait to the link window grew by the ~3 ticks of extra light-hit
    // freeze the 1.9C readability hitstop added.
    await evaluate(client, `window.__finalBlowQa.step(0.3334)`);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.18)`);
    linked = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    assert.equal(linked.fighters[0].linkedFrom, "deathblow-hammer-jab");
    assert.equal(linked.fighters[0].combo.hits, 2);
});

probe('supers', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 })`);
    assert.equal(await evaluate(client, `document.querySelector('.touch-action').classList.contains('super-ready')`), true);
    assert.equal(await evaluate(client, `document.querySelector('#touchPrompt').classList.contains('super-ready')`), true);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await dispatchKey(client, "keyDown", "KeyM", "m", 77);
    await evaluate(client, `window.__finalBlowQa.step(1.25)`);
    gritSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    await dispatchKey(client, "keyUp", "KeyM", "m", 77);
    assert.equal(gritSuper.fighters[0].meter, 0);
    assert.equal(gritSuper.fighters[0].combo.hits, 4);
    assertSuperPayoff(gritSuper, "DeathBlow super");
    assert.ok(gritSuper.fighters[1].juggleCount >= 2, "the super should exercise juggle scaling");

    await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.9)`);
    jezSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(jezSuper.fighters[0].move, null);
    assert.equal(jezSuper.fighters[0].combo.hits, 7);
    assertSuperPayoff(jezSuper, "jezSuper");

    await evaluate(client, `window.__finalBlowQa.fight('alan', 'post'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.9)`);
    allanSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(allanSuper.fighters[0].combo.hits, 6);
    assertSuperPayoff(allanSuper, "allanSuper");

    await evaluate(client, `window.__finalBlowQa.fight('post', 'alan'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.9)`);
    postSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(postSuper.fighters[0].combo.hits, 7);
    assertSuperPayoff(postSuper, "postSuper");

    await evaluate(client, `window.__finalBlowQa.fight('benny', 'donald'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.9)`);
    bennySuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(bennySuper.fighters[0].combo.hits, 8);
    assertSuperPayoff(bennySuper, "bennySuper");

    await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.5)`);
    donaldSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(donaldSuper.fighters[0].combo.hits, 9);
    assertSuperPayoff(donaldSuper, "donaldSuper");

    await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.9)`);
    cyraxxSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(cyraxxSuper.fighters[0].combo.hits, 7);
    assertSuperPayoff(cyraxxSuper, "cyraxxSuper");

    await evaluate(client, `window.__finalBlowQa.fight('ali', 'cyraxx'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.9)`);
    aliSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(aliSuper.fighters[0].combo.hits, 8);
    assertSuperPayoff(aliSuper, "aliSuper");
});

probe('keyboard-fight-start', async () => {
    await evaluate(client, `(() => {
      document.querySelector('[data-mode="arcade"]').click();
      document.querySelectorAll('.fighter-card')[0].click();
      document.querySelector('#fighterContinue').click();
      document.querySelector('[data-stage="vet"]').click();
      document.querySelector('#fightButton').click();
      return true;
    })()`);
    await delay(250);
    await evaluate(client, `window.__finalBlowQa.step(2.5)`);
    started = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(started.screen, "fight");
    assert.equal(started.phase, "fight");
    assert.equal(started.fighters.length, 2);
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
});

probe('gamepad', async () => {
    await evaluate(client, `(() => {
      window.__qaPad = {
        id: 'QA XInput Controller',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
      };
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => [window.__qaPad],
      });
      window.__qaPad.buttons[2] = { pressed: true, value: 1 };
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    gamepadAttack = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      window.__qaPad.buttons[2] = { pressed: false, value: 0 };
      return true;
    })()`);
    assert.equal(gamepadAttack.fighters[0].attack, "light");
    assert.equal(gamepadAttack.fighters[0].state, "attack");
    assert.equal(gamepadAttack.fighters[0].move, "deathblow-hammer-jab", "X is light punch");
    await evaluate(client, `window.__finalBlowQa.step(0.5)`);

    // A = light kick, B = heavy kick, Y = heavy punch.
    for (const [button, expected, label] of [[0, "deathblow-hammer-jab-lk", "A is light kick"],
      [1, "deathblow-wrecking-hook-hk", "B is heavy kick"],
      [3, "deathblow-wrecking-hook", "Y is heavy punch"]]) {
      await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); (() => { window.__qaPad.buttons[${button}] = { pressed: true, value: 1 }; return true; })()`);
      await evaluate(client, `window.__finalBlowQa.step(0.08)`);
      const faceButton = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
      await evaluate(client, `(() => { window.__qaPad.buttons[${button}] = { pressed: false, value: 0 }; return true; })()`);
      assert.equal(faceButton.fighters[0].move, expected, label);
    }

    // Blocking is the D-pad only: hold away from the opponent.
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); (() => { window.__qaPad.buttons[14] = { pressed: true, value: 1 }; return true; })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    gamepadGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => { window.__qaPad.buttons[14] = { pressed: false, value: 0 }; return true; })()`);
    assert.equal(gamepadGuard.fighters[0].guarding, true);
    assert.equal(gamepadGuard.fighters[0].guardHeight, "high");

    // D-pad up jumps; there is no jump button.
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); (() => { window.__qaPad.buttons[12] = { pressed: true, value: 1 }; return true; })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    gamepadJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => { window.__qaPad.buttons[12] = { pressed: false, value: 0 }; return true; })()`);
    assert.equal(gamepadJump.fighters[0].grounded, false, "D-pad up jumps");
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 }); (() => {
      window.__qaPad.buttons[2] = { pressed: true, value: 1 };
      window.__qaPad.buttons[3] = { pressed: true, value: 1 };
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    gamepadEnhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      window.__qaPad.buttons[2] = { pressed: false, value: 0 };
      window.__qaPad.buttons[3] = { pressed: false, value: 0 };
      return true;
    })()`);
    assert.equal(gamepadEnhanced.fighters[0].move, "deathblow-ex-tremor-tap");
    assert.equal(gamepadEnhanced.fighters[0].meter, 25);

    // Down-forward plus a kick button is the base special on the pad.
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); (() => { window.__qaPad.buttons[13] = { pressed: true, value: 1 }; return true; })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await evaluate(client, `(() => { window.__qaPad.buttons[13] = { pressed: false, value: 0 }; window.__qaPad.buttons[15] = { pressed: true, value: 1 }; return true; })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
    await evaluate(client, `(() => { window.__qaPad.buttons[0] = { pressed: true, value: 1 }; return true; })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    gamepadMotionSpecial = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      window.__qaPad.buttons[0] = { pressed: false, value: 0 };
      window.__qaPad.buttons[15] = { pressed: false, value: 0 };
      return true;
    })()`);
    assert.equal(gamepadMotionSpecial.fighters[0].move, "deathblow-tremor-tap");

    // Unbound shoulder buttons must do nothing at all.
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); (() => { window.__qaPad.buttons[5] = { pressed: true, value: 1 }; return true; })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    gamepadUnbound = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => { window.__qaPad.buttons[5] = { pressed: false, value: 0 }; return true; })()`);
    assert.equal(gamepadUnbound.fighters[0].move, null, "no legacy special shoulder button");

    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 100 }); (() => {
      window.__qaPad.buttons[3] = { pressed: true, value: 1 };
      window.__qaPad.buttons[1] = { pressed: true, value: 1 };
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    gamepadTriggerSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      window.__qaPad.buttons[3] = { pressed: false, value: 0 };
      window.__qaPad.buttons[1] = { pressed: false, value: 0 };
      return true;
    })()`);
    assert.equal(gamepadTriggerSuper.fighters[0].move, "deathblow-epicenter-execution");
    assert.equal(gamepadTriggerSuper.fighters[0].meter, 0);

    // XInput B (HK) cannot finish; A (LK) selects Finisher B at any distance.
    await evaluate(client, `(() => {
      window.__finalBlowQa.ready('deathblow', 1);
      window.__finalBlowQa.positions(80, 1200);
      window.__finalBlowQa.step(0.05);
      window.__qaPad.buttons[1] = { pressed: true, value: 1 };
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    gamepadHeavyFinisherAttempt = await evaluate(client, `window.__finalBlowQa.status()`);
    await evaluate(client, `(() => {
      window.__qaPad.buttons[1] = { pressed: false, value: 0 };
      window.__finalBlowQa.step(0.05);
      window.__qaPad.buttons[0] = { pressed: true, value: 1 };
      return true;
    })()`);
    assert.equal(gamepadHeavyFinisherAttempt.elapsed, 0, "XInput B/HK must not execute a finisher");
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    gamepadLightKickFinisher = await evaluate(client, `window.__finalBlowQa.status()`);
    await evaluate(client, `window.__qaPad.buttons[0] = { pressed: false, value: 0 }`);
    assert.ok(gamepadLightKickFinisher.elapsed > 0, "XInput A/LK must execute a finisher");
    assert.equal(gamepadLightKickFinisher.fatalityFamily, "crush");
});

probe('training-ui', async () => {
    trainingUi = await evaluate(client, `(() => {
      document.querySelector('[data-mode="training"]').click();
      document.querySelectorAll('.fighter-card')[0].click();
      document.querySelectorAll('.fighter-card')[1].click();
      document.querySelector('#fighterContinue').click();
      document.querySelector('#fightButton').click();
      window.__finalBlowQa.step(2.5);
      const dummy = document.querySelector('#trainingDummySelect');
      dummy.value = 'guard';
      dummy.dispatchEvent(new Event('change', { bubbles: true }));
      window.__finalBlowQa.input(0, { light: true });
      window.__finalBlowQa.step(0.14);
      window.__finalBlowQa.input(0, {});
      const activeSnapshot = window.__finalBlowEngine.snapshot();
      const activeFrames = document.querySelector('#trainingFrames').textContent;
      const activeInputs = document.querySelector('#trainingInputs').textContent;
      const grit = document.querySelector('#trainingGritToggle');
      grit.checked = false;
      grit.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#trainingResetButton').click();
      const snapshot = window.__finalBlowEngine.snapshot();
      return {
        screen: snapshot.screen,
        phase: snapshot.phase,
        panelVisible: !document.querySelector('#trainingPanel').hidden,
        dummy: dummy.value,
        dummyGuard: activeSnapshot.fighters[1].guarding,
        frames: activeFrames,
        inputs: activeInputs,
        resetHealth: snapshot.fighters.map((fighter) => fighter.health),
        resetGrit: snapshot.fighters.map((fighter) => fighter.meter),
      };
    })()`);
    assert.equal(trainingUi.screen, 'fight');
    assert.equal(trainingUi.phase, 'fight');
    assert.equal(trainingUi.panelVisible, true);
    assert.equal(trainingUi.dummy, 'guard');
    assert.equal(trainingUi.dummyGuard, true);
    assert.match(trainingUi.frames, /S\d+ A\d+ R\d+/);
    assert.match(trainingUi.inputs, /DUMMY: GUARD/);
    assert.deepEqual(trainingUi.resetHealth, [100, 100]);
    assert.deepEqual(trainingUi.resetGrit, [0, 0]);
});

probe('controls-ui', async () => {
    controlsUi = await evaluate(client, `(() => {
      const controlStyle = document.querySelector('#controlStyleSelect');
      controlStyle.value = 'modern';
      controlStyle.dispatchEvent(new Event('change', { bubbles: true }));
      const reduced = document.querySelector('#reducedMotionToggle');
      reduced.checked = true;
      reduced.dispatchEvent(new Event('change', { bubbles: true }));
      const color = document.querySelector('#colorAssistSelect');
      color.value = 'tritanopia';
      color.dispatchEvent(new Event('change', { bubbles: true }));
      const handedness = document.querySelector('#touchHandednessSelect');
      handedness.value = 'left';
      handedness.dispatchEvent(new Event('change', { bubbles: true }));
      const opacity = document.querySelector('#touchOpacity');
      opacity.value = '60';
      opacity.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#p1KeyBindings [data-bind-action="lp"]').click();
      return {
        style: localStorage.getItem('final-blow-control-style'),
        reduced: document.body.classList.contains('reduced-motion'),
        color: document.body.dataset.colorAssist,
        left: document.body.classList.contains('touch-left'),
        opacity: document.documentElement.style.getPropertyValue('--touch-opacity'),
        listening: document.querySelector('#p1KeyBindings [data-bind-action="lp"]').textContent,
      };
    })()`);
    assert.equal(controlsUi.style, 'modern');
    assert.equal(controlsUi.reduced, true);
    assert.equal(controlsUi.color, 'tritanopia');
    assert.equal(controlsUi.left, true);
    assert.equal(controlsUi.opacity, '0.6');
    assert.match(controlsUi.listening, /PRESS KEY/);
    await dispatchKey(client, 'keyDown', 'KeyQ', 'q', 81);
    remapped = await evaluate(client, `(() => ({
      keyMap: JSON.parse(localStorage.getItem('final-blow-keymaps'))[0].lp,
      label: document.querySelector('#p1KeyBindings [data-bind-action="lp"]').textContent,
    }))()`);
    assert.equal(remapped.keyMap, 'KeyQ');
    assert.match(remapped.label, /Q$/);
    padRemap = await evaluate(client, `(() => {
      const select = document.querySelector('[data-pad-action="lp"]');
      select.value = '3';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#resetBindingsButton').click();
      return JSON.parse(localStorage.getItem('final-blow-pad-map'));
    })()`);
    assert.equal(padRemap.lp, 2, "reset restores X = LP");
    assert.equal(padRemap.hp, 3);
    assert.equal(padRemap.lk, 0);
    assert.equal(padRemap.hk, 1);
});

probe('polish-ui', async () => {
    polishUi = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.input(0, { heavy: true });
      window.__finalBlowQa.step(0.08);
      const beforePause = window.__finalBlowEngine.snapshot();
      window.__finalBlowQa.pause(true);
      window.__finalBlowQa.step(0.8);
      const duringPause = window.__finalBlowEngine.snapshot();
      const pausePanel = document.querySelector('#pausePanel');
      const pauseVisible = !pausePanel.hidden;
      const performanceLabel = document.querySelector('#pausePerformance').textContent;
      window.__finalBlowQa.pause(false);
      window.__finalBlowQa.step(0.08);
      const resumed = window.__finalBlowEngine.snapshot();
      const battery = window.__finalBlowQa.quality('battery');
      window.__finalBlowQa.fighter(0, { health: 37 });
      window.__finalBlowQa.pause(true);
      document.querySelector('#restartButton').click();
      const restarted = window.__finalBlowEngine.snapshot();
      // Captions are opt-in as of 1.9C; the caption pipeline is still covered by
      // turning the toggle on for this probe and back off afterwards.
      const captionsToggle = document.querySelector('#soundCaptionsToggle');
      captionsToggle.checked = true;
      captionsToggle.dispatchEvent(new Event('change'));
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.input(0, { light: true });
      window.__finalBlowQa.step(0.04);
      const caption = document.querySelector('#soundCaption').textContent;
      const captionVisible = !document.querySelector('#soundCaption').hidden;
      captionsToggle.checked = false;
      captionsToggle.dispatchEvent(new Event('change'));
      return {
        beforeFrame: beforePause.fighters[0].attackFrame,
        pausedFrame: duringPause.fighters[0].attackFrame,
        resumedFrame: resumed.fighters[0].attackFrame,
        pauseVisible,
        performanceLabel,
        battery,
        restartedHealth: restarted.fighters[0].health,
        restartedPaused: restarted.paused,
        caption,
        captionVisible,
        balance: restarted.balance,
      };
    })()`);
    assert.equal(polishUi.pausedFrame, polishUi.beforeFrame, 'pause must freeze combat state');
    assert.ok(polishUi.resumedFrame > polishUi.pausedFrame, 'resume must continue combat state');
    assert.equal(polishUi.pauseVisible, true);
    assert.match(polishUi.performanceLabel, /PROFILE/);
    assert.equal(polishUi.battery.id, 'battery');
    assert.equal(polishUi.battery.trailScale, 0);
    assert.equal(polishUi.restartedHealth, 100);
    assert.equal(polishUi.restartedPaused, false);
    assert.match(polishUi.caption, /DEATHBLOW · LIGHT ATTACK/);
    assert.equal(polishUi.captionVisible, true);
    assert.equal(polishUi.balance.fighters.length, 9);
    assert.deepEqual(polishUi.balance.violations, []);
});

probe('keyboard-attack', async () => {
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    attack = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    assert.equal(attack.fighters[0].attack, "light");
    assert.equal(attack.fighters[0].state, "attack");
    assert.ok(attack.fighters[0].attackFrame > 0);
});

probe('finisher', async () => {
    // Finishers are light-button only and distance-free. Arm the window, place
    // the fighters at opposite stage limits, and prove HP cannot trigger it.
    finisherDistance = await evaluate(client, `(() => {
      window.__finalBlowQa.ready('deathblow', 0);
      window.__finalBlowQa.positions(80, 1200);
      window.__finalBlowQa.step(0.05);
      const fighters = window.__finalBlowEngine.snapshot().fighters;
      return Math.abs(fighters[1].x - fighters[0].x);
    })()`);
    assert.ok(finisherDistance > 1000, `finisher test must span the stage, got ${finisherDistance}px`);
    await dispatchKey(client, "keyDown", "KeyK", "k", 75);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    heavyFinisherAttempt = await evaluate(client, `window.__finalBlowQa.status()`);
    await dispatchKey(client, "keyUp", "KeyK", "k", 75);
    assert.equal(heavyFinisherAttempt.phase, "finish");
    assert.equal(heavyFinisherAttempt.elapsed, 0, "HP must not execute a finisher");
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);

    // LP executes Finisher A from the opposite end of the stage.
    await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
    await delay(100);
    await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    finisherStart = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    finisherMidpoint = (finisherStart.fighters[0].x + finisherStart.fighters[1].x) * 0.5;
    // Jez rejected the recorded Death Blow announcer call, so the moment still
    // fires its own cue but synthesises it rather than naming a deleted file.
    assert.deepEqual(finisherStart.audio.lastEvent, {
      kind: 'final', fighterId: null, signature: false, src: null,
    }, 'execution must fire the Death Blow cue without a rejected recording');
    assert.equal(finisherStart.camera.mode, 'finisher');
    assert.equal(finisherStart.camera.shot, 'establishing');
    assert.ok(finisherStart.camera.zoom >= 1.24, `finisher camera must open cinematically, got ${finisherStart.camera.zoom}`);
    assert.ok(Math.abs(finisherStart.camera.x - finisherMidpoint) < 0.001, 'camera must center both characters');
    await evaluate(client, `window.__finalBlowQa.step(1.13)`);
    finisher = await evaluate(client, `window.__finalBlowQa.status()`);
    assert.equal(finisher.fighter, "deathblow");
    assert.equal(finisher.fatalityFamily, "rupture", "LP selects Finisher A");
    assert.ok(finisher.elapsed > 1);
    assert.ok(finisher.impacts >= 2);
    assert.equal(finisher.simulationHz, 60);

    // LK executes Finisher B from the opposite end of the stage.
    await evaluate(client, `(() => {
      window.__finalBlowQa.ready('deathblow', 1);
      window.__finalBlowQa.positions(80, 1200);
      window.__finalBlowQa.step(0.05);
    })()`);
    await dispatchKey(client, "keyDown", "KeyN", "n", 78);
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    lightKickFinisher = await evaluate(client, `window.__finalBlowQa.status()`);
    await dispatchKey(client, "keyUp", "KeyN", "n", 78);
    assert.ok(lightKickFinisher.elapsed > 0, "LK must execute a finisher");
    assert.equal(lightKickFinisher.fatalityFamily, "crush", "LK selects Finisher B");
});

probe('graphic-fatalities', async () => {
    graphicFatalities = await evaluate(client, `(async () => {
      const reduced = document.querySelector('#reducedMotionToggle');
      reduced.checked = false;
      reduced.dispatchEvent(new Event('change', { bubbles: true }));
      const fighters = ['deathblow', 'jez', 'alan', 'post', 'benny', 'donald', 'cyraxx', 'ali', 'devil'];
      const results = [];
      for (const fighter of fighters) {
        for (const variant of [0, 1]) {
          const status = window.__finalBlowQa.graphicFatality(fighter, variant, 4.7);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const snapshot = window.__finalBlowEngine.snapshot();
          const midpoint = (snapshot.fighters[0].x + snapshot.fighters[1].x) * 0.5;
          results.push({
            ...status,
            camera: snapshot.camera,
            art: snapshot.finalBlowArt,
            cameraOffset: Math.abs(snapshot.camera.x - midpoint),
          });
        }
      }
      return results;
    })()`);
    assert.equal(graphicFatalities.length, 18);
    assert.equal(new Set(graphicFatalities.map((fatality) => fatality.fatalityId)).size, 18);
    assert.deepEqual([...new Set(graphicFatalities.map((fatality) => fatality.fatalityFamily))].sort(),
      ['crush', 'dissolve', 'electrocute', 'glitch', 'implode', 'launch', 'rupture', 'slice']);
    assignedFatalityProjectiles = {
      deathblow: { id: 'pizza', name: 'WHOLE PIZZA', token: 'PIZZA' },
      jez: { id: 'mouse', name: 'CORDED MOUSE', token: 'MOUSE' },
      alan: { id: 'loogie', name: 'LOOGIES', token: 'LOOGIE' },
      post: { id: 'wires', name: 'TANGLED WIRES', token: 'WIRE' },
      benny: { id: 'xacto', name: 'X-ACTO KNIFE', token: 'X-ACTO' },
      donald: { id: 'golfball', name: 'GOLF BALL', token: 'GOLF' },
      cyraxx: { id: 'bedbugs', name: 'BED BUGS', token: 'BED-BUG' },
      ali: { id: 'vinyl', name: 'VINYL RECORD', token: 'VINYL' },
      devil: { id: 'charm', name: 'HEX CHARM', token: 'CHARM' },
    };
    for (const fatality of graphicFatalities) {
      assert.equal(fatality.graphicFatalities, true);
      assert.equal(fatality.fatalityTriggered, true);
      const assignedProjectile = assignedFatalityProjectiles[fatality.fighter];
      assert.equal(fatality.fatalitySpecial, assignedProjectile.name, `${fatality.fatalityId} must name its fighter's assigned projectile`);
      assert.equal(fatality.fatalityProjectileId, assignedProjectile.id, `${fatality.fatalityId} must use its fighter's assigned projectile`);
      assert.equal(fatality.signatureProjectileTriggered, true, `${fatality.fatalityId} must launch its fighter's projectile on camera`);
      assert.equal(fatality.signatureProjectiles, 1, `${fatality.fatalityId} must keep its fighter's projectile visible through the aftermath`);
      assert.equal(fatality.projectileFocusBeats, 3, `${fatality.fatalityId} must give all three beats to the assigned projectile`);
      assert.equal(fatality.projectileFocusBursts, 3, `${fatality.fatalityId} must visually accent all three projectile beats`);
      assert.equal(fatality.projectilePhase, 'kill', `${fatality.fatalityId} must end on the projectile killing phase`);
      assert.deepEqual(fatality.projectileBeatLabels, [
        fatality.fatalityProjectileSetup,
        fatality.fatalityProjectileAction,
        fatality.fatalityProjectileFinale,
      ], `${fatality.fatalityId} must execute its own three object-specific captions in order`);
      assert.equal(fatality.beat, fatality.fatalityProjectileFinale, `${fatality.fatalityId} must name the projectile as the final cause`);
      for (const copy of [fatality.fatalityProjectileSetup, fatality.fatalityProjectileAction, fatality.fatalityProjectileFinale]) {
        assert.match(copy, new RegExp(assignedProjectile.token), `${fatality.fatalityId} must foreground ${assignedProjectile.name} in every beat`);
      }
      assert.match(fatality.fatalityLimb, /^(left|right)-(arm|leg)$/);
      assert.ok(fatality.fatalityDevice, `${fatality.fatalityId} must use a deliberate execution restraint`);
      assert.equal(fatality.severedLimbs, 1, `${fatality.fatalityId} must leave one complete severed limb on screen`);
      assert.ok(fatality.fatalityPools >= 1);
      assert.ok(fatality.goreFragments >= 12, `${fatality.fatalityId} must throw detailed gore fragments`);
      assert.ok(fatality.goreShockwaves >= 1, `${fatality.fatalityId} must render a gore shockwave`);
      assert.ok(fatality.lensBlood >= 1, `${fatality.fatalityId} must splatter the camera lens`);
      assert.ok(fatality.cinematicCuts >= 4, `${fatality.fatalityId} must use multiple cinematic cuts`);
      assert.equal(fatality.impactCloseUps, 3, `${fatality.fatalityId} must stay focused on exactly three execution beats`);
      assert.ok(fatality.peakZoom >= 1.6, `${fatality.fatalityId} must reach an extreme final-impact close-up`);
      assert.equal(fatality.slowMotionHits, 1, `${fatality.fatalityId} must hold exactly one final hit in slow motion`);
      assert.equal(fatality.camera.mode, 'finisher');
      assert.ok(['final-impact', 'aftermath'].includes(fatality.camera.shot));
      assert.ok(fatality.camera.zoom >= 1.48, `${fatality.fatalityId} aftermath zoom ${fatality.camera.zoom} (${fatality.camera.shot})`);
      assert.equal(fatality.camera.focus, 'projectile', `${fatality.fatalityId} camera must prioritize the assigned projectile`);
      assert.equal(fatality.camera.projectileId, assignedProjectile.id);
      assert.ok(fatality.cameraOffset < 90, `${fatality.fatalityId} projectile framing drifted ${fatality.cameraOffset}px from the fight`);
      assert.equal(fatality.cinematicArtStyle, 'photorealistic');
      assert.equal(fatality.realityBreakActive, true);
      assert.equal(fatality.realityBreakAmount, 1, `${fatality.fatalityId} must complete the realistic-art transition`);
      assert.equal(fatality.realisticBackdropLoaded, true, 'the photoreal environment plate must be decoded');
      assert.equal(fatality.art.style, 'photorealistic');
      assert.equal(fatality.art.transition, 1);
      assert.equal(fatality.art.backdropAsset, 'assets/final-blow-reality.webp');
      assert.equal(fatality.art.backdropLoaded, true);
      assert.ok(fatality.art.backdropPasses >= 1, `${fatality.fatalityId} must render the photoreal backdrop`);
      assert.ok(fatality.art.lightingPasses >= 2, `${fatality.fatalityId} must render practical and filmic realism lighting`);
      assert.ok(fatality.art.portraitPasses >= 1, `${fatality.fatalityId} must layer high-resolution fighter detail`);
      assert.equal(fatality.art.filmGrainPasses, 0, 'the battery profile keeps the photoreal plate but skips film grain');
    }
});

probe('high-fidelity-reality', async () => {
    highFidelityReality = await evaluate(client, `(async () => {
      window.__finalBlowQa.quality('high');
      window.__finalBlowQa.graphicFatality('deathblow', 0, 4.7);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return window.__finalBlowEngine.snapshot().finalBlowArt;
    })()`);
    assert.equal(highFidelityReality.style, 'photorealistic');
    assert.equal(highFidelityReality.transition, 1);
    assert.ok(highFidelityReality.backdropPasses >= 1);
    assert.ok(highFidelityReality.portraitPasses >= 1);
    assert.ok(highFidelityReality.filmGrainPasses >= 1, 'high quality adds the restrained cinematic grain pass');
});

probe('gore-off', async () => {
    // The same multi-cut sequence survives the Graphic Fatalities and reduced-
    // motion accessibility paths without leaking gore or violent camera shake.
    await evaluate(client, `(async () => {
      const gore = document.querySelector('#goreToggle');
      gore.checked = false;
      gore.dispatchEvent(new Event('change', { bubbles: true }));
      window.__finalBlowQa.graphicFatality('deathblow', 0, 4.7, false);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    goreOff = await evaluate(client, `({ status: window.__finalBlowQa.status(), snapshot: window.__finalBlowEngine.snapshot() })`);
    assert.equal(goreOff.status.graphicFatalities, false);
    assert.equal(goreOff.status.goreFragments, 0);
    assert.equal(goreOff.status.goreShockwaves, 0);
    assert.equal(goreOff.status.lensBlood, 0);
    assert.equal(goreOff.status.fatalityPools, 0);
    assert.equal(goreOff.status.severedLimbs, 0);
    assert.equal(goreOff.status.signatureProjectiles, 1, 'the assigned projectile remains visible when only gore is disabled');
    assert.equal(goreOff.status.projectileFocusBeats, 3, 'gore-off still preserves all three projectile beats');
    assert.equal(goreOff.status.projectilePhase, 'kill');
    assert.equal(goreOff.snapshot.camera.focus, 'projectile');
    assert.equal(goreOff.snapshot.camera.projectileId, 'pizza');
    assert.equal(goreOff.snapshot.finalBlowArt.style, 'photorealistic');
    assert.equal(goreOff.snapshot.finalBlowArt.transition, 1);
    assert.ok(goreOff.snapshot.finalBlowArt.portraitPasses >= 2, 'gore-off preserves realistic detail on both complete fighters');
    assert.ok(goreOff.status.cinematicCuts >= 4, `gore-off cinematic cuts ${goreOff.status.cinematicCuts} at ${goreOff.status.cinematicShot}`);
    assert.ok(goreOff.status.peakZoom >= 1.6);
    assert.equal(goreOff.status.slowMotionHits, 1);

    await evaluate(client, `(() => {
      const gore = document.querySelector('#goreToggle');
      gore.checked = true;
      gore.dispatchEvent(new Event('change', { bubbles: true }));
      const reduced = document.querySelector('#reducedMotionToggle');
      reduced.checked = true;
      reduced.dispatchEvent(new Event('change', { bubbles: true }));
      window.__finalBlowQa.graphicFatality('deathblow', 0, 4.7, true);
    })()`);
    reducedFinisher = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(reducedFinisher.accessibility.reducedMotion, true);
    assert.ok(reducedFinisher.camera.peakZoom >= 1.6, 'reduced motion keeps the authored cinematic coverage');
    assert.ok(reducedFinisher.camera.zoom <= 1.4, 'reduced motion must cap the rendered camera snap');
    assert.equal(reducedFinisher.finalBlowArt.style, 'photorealistic');
    assert.equal(reducedFinisher.finalBlowArt.transition, 1, 'reduced motion preserves the finished realistic-art treatment');
    // Leave the setting in its prior enabled state for the remaining persisted-
    // preference and offline-boot checks.
});

probe('victory-quotes', async () => {
    deathblowVictory = await evaluate(client, `window.__finalBlowQa.result('deathblow')`);
    assert.equal(deathblowVictory.title, "DEATHBLOW WINS");
    assert.ok(typeof deathblowVictory.quote === "string" && deathblowVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(deathblowVictory.background, /deathblow-specials\.webp/);
    jezVictory = await evaluate(client, `window.__finalBlowQa.result('jez')`);
    assert.equal(jezVictory.title, "JEZ WINS");
    assert.ok(typeof jezVictory.quote === "string" && jezVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(jezVictory.background, /jez-specials\.webp/);
    allanVictory = await evaluate(client, `window.__finalBlowQa.result('alan')`);
    assert.equal(allanVictory.title, "ALLAN WINS");
    assert.ok(typeof allanVictory.quote === "string" && allanVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(allanVictory.background, /alan-specials\.webp/);
    postVictory = await evaluate(client, `window.__finalBlowQa.result('post')`);
    assert.equal(postVictory.title, "POST WINS");
    assert.ok(typeof postVictory.quote === "string" && postVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(postVictory.background, /post-specials\.webp/);
    bennyVictory = await evaluate(client, `window.__finalBlowQa.result('benny')`);
    assert.equal(bennyVictory.title, "BENNY WINS");
    assert.ok(typeof bennyVictory.quote === "string" && bennyVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(bennyVictory.background, /benny-specials\.webp/);
    donaldVictory = await evaluate(client, `window.__finalBlowQa.result('donald')`);
    assert.equal(donaldVictory.title, "DONALD TRUMP WINS");
    assert.ok(typeof donaldVictory.quote === "string" && donaldVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(donaldVictory.background, /donald-specials\.webp/);
    cyraxxVictory = await evaluate(client, `window.__finalBlowQa.result('cyraxx')`);
    assert.equal(cyraxxVictory.title, "CYRAXX WINS");
    assert.ok(typeof cyraxxVictory.quote === "string" && cyraxxVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(cyraxxVictory.background, /cyraxx-specials\.webp/);
    aliVictory = await evaluate(client, `window.__finalBlowQa.result('ali')`);
    assert.equal(aliVictory.title, "ALI G WINS");
    assert.ok(typeof aliVictory.quote === "string" && aliVictory.quote.length > 5, "victory quote must render from the rotating pool");
    assert.match(aliVictory.background, /ali-specials\.webp/);
    if (process.env.FINAL_BLOW_VICTORY_SCREENSHOT) {
      await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
      await delay(80);
      const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(process.env.FINAL_BLOW_VICTORY_SCREENSHOT, Buffer.from(capture.data, "base64"));
    }
});

// ---------------------------------------------------------------------------
// 5.3 VERIFICATION HARNESS (sweep #53). The 5.1 SPECTACLE tells were all
// accepted by hand — a person watched the Vet's floodlights swell, counted the
// crowd's arms going up, saw the whiff fringe and heard the decision call.
// Everything below turns one of those readings into an assertion, using the QA
// hooks 5.1 added for exactly this (ambient / crowd / tempo / poseTrace) plus
// one new one (setTimer). They live here, after the KO-adjacent probes and
// before the demo, because several of them hold a roundover open.
// ---------------------------------------------------------------------------

probe('ambient-ko-pulse', async () => {
  await withMotion(async () => {
    // MOTION-ATLAS.md v5.0: "Measured on the Vet canvas: both floodlight regions
    // +27 mean brightness at the KO tick, decayed by KO+170, the plain sky flat
    // at 74.5 throughout" — and STAGES.md said the browser probe for it was still
    // to write. This is it.
    //
    // The two boxes are the authored floodlight centres in drawStageAmbient —
    // [125, 88] and [1230, 232], whose glow radius grows 90 -> 210 with the pulse
    // — sampled as 120 px and 110 px squares. The third is a patch of plain sky
    // outside every glow radius AND outside the firework lane (x 300..980): it is
    // the control, because a global brightening is not a stage reaction.
    //
    // Thresholds sit well under the measurement so a lighting retune does not
    // false-fail — the point is the swell, not its exact size. Measured here at
    // HEAD over six runs: floodlight A +16.5..+18.4, floodlight B
    // +45.1..+47.5 (mean +31..+33, against the doc's +27), sky +1.5..+1.8.
    // Both readings are MEDIANS over nine painted frames: the Vet's sky carries
    // a crawling blimp and an ambient firework, and either can sit over a box
    // for a few frames. See lumaMedian.
    const AMBIENT_RECTS = JSON.stringify([[65, 28, 120, 120], [1170, 172, 110, 110], [1000, 15, 120, 50]]);
    await evaluate(client, `(() => {
      window.__finalBlowQa.stage('vet');
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 800);
      // A full second (60 ticks) clears the 48-tick decay of whatever KO the
      // probe before this one landed; qa.fight() does not, because the pulse
      // and the crowd's hold are presentation state, not sim state.
      window.__finalBlowQa.step(1);
      return true;
    })()`);
    // Painted frames: the hold RELEASES in updateCrowdKoHoldLatch, which only
    // runs from the draw path, so the baseline has to be read after real frames.
    await delay(140);
    ambientQuiet = await evaluate(client, `window.__finalBlowQa.ambient()`);
    assert.equal(ambientQuiet.stage, 'vet');
    assert.equal(ambientQuiet.pulse, 0, 'a quiet fight must have no ambient pulse latched');
    assert.equal(ambientQuiet.beat.hold, false, 'a quiet fight must have no KO hold');
    assert.equal(ambientQuiet.surge.level, 0);
    const quietLuma = await lumaMedian(AMBIENT_RECTS);

    await evaluate(client, `window.__finalBlowQa.winBout(60, true)`);
    await delay(180);
    ambientKo = await evaluate(client, `window.__finalBlowQa.ambient()`);
    const koLuma = await lumaMedian(AMBIENT_RECTS);
    assert.equal(ambientKo.ko, true, 'the KO phase change must latch the pulse as a KO');
    assert.equal(ambientKo.pulseKind, 'ko');
    assert.equal(ambientKo.pulse, 1, 'the KO latch is clamped to a full pulse');
    assert.equal(ambientKo.beat.hold, true, "the crowd's KO hold must be feeding the stage");
    assert.ok(ambientKo.surge.level >= 1, `the stage surge must be full at the KO, saw ${ambientKo.surge.level}`);

    ambientDelta = koLuma.map((value, index) => Math.round((value - quietLuma[index]) * 100) / 100);
    const floodDelta = Math.round((ambientDelta[0] + ambientDelta[1]) / 2 * 100) / 100;
    assert.ok(floodDelta >= 15, `the Vet floodlights must swell at least +15 mean brightness, saw ${floodDelta} (${ambientDelta[0]} / ${ambientDelta[1]})`);
    assert.ok(ambientDelta[0] >= 10, `the left Vet floodlight must swell, saw ${ambientDelta[0]}`);
    assert.ok(ambientDelta[1] >= 10, `the right Vet floodlight must swell, saw ${ambientDelta[1]}`);
    assert.ok(ambientDelta[2] < 8, `the plain sky must stay flat through the KO, saw ${ambientDelta[2]}`);
    assert.ok(
      Math.min(ambientDelta[0], ambientDelta[1]) > ambientDelta[2] * 3,
      `the swell must be the floodlights, not the whole frame (flood ${ambientDelta[0]}/${ambientDelta[1]} vs sky ${ambientDelta[2]})`,
    );

    // 5.1 STAGE KO BEATS: the other five stages answer the KO too. Only the
    // surge is asserted per stage — each one's furniture is its own business.
    // This is driven from Node rather than in one page call because the KO kind
    // and the crowd's hold both latch on a PAINTED frame (readAmbientPulse /
    // updateCrowdKoHoldLatch run from the draw path), so each stage gets real
    // frames on either side of its KO.
    ambientStages = {};
    for (const stageId of ['somerset', 'vet', 'wildwood', 'buffet', 'cruise', 'janney']) {
      await evaluate(client, `(() => {
        window.__finalBlowQa.stage('${stageId}');
        window.__finalBlowQa.fight('deathblow', 'jez');
        // A full second: the pulse decays linearly over 48 ticks and qa.fight()
        // does not clear it (presentation state, not sim state), so the previous
        // stage's KO has to run out before this one's "calm" reading means
        // anything.
        window.__finalBlowQa.step(1);
        return true;
      })()`);
      await delay(90);
      const quiet = await evaluate(client, `window.__finalBlowQa.ambient()`);
      await evaluate(client, `window.__finalBlowQa.winBout(60, true)`);
      await delay(120);
      const ko = await evaluate(client, `window.__finalBlowQa.ambient()`);
      ambientStages[stageId] = { quiet: quiet.surge.level, ko: ko.surge.level, koKind: ko.pulseKind, hold: ko.beat.hold };
    }
    for (const [stageId, reading] of Object.entries(ambientStages)) {
      assert.equal(reading.quiet, 0, `${stageId} must be calm before the KO`);
      assert.ok(reading.ko > 0, `${stageId} must react to the KO, surge was ${reading.ko}`);
      assert.equal(reading.koKind, 'ko', `${stageId} must latch the KO kind`);
      assert.equal(reading.hold, true, `${stageId} must inherit the crowd's KO hold`);
    }
  });
});

probe('crowd-ko-hold', async () => {
  await withMotion(async () => {
    // 5.1 THE KO MOMENT: the roundover hold belongs to the crowd. The latch is
    // render-side (it arms on the first painted frame after the phase edge), so
    // this reads it the way a player sees it — after real frames, not after a
    // qa.step. crowdKoHoldAge then advances with the sim, which a QA fight owns.
    await evaluate(client, `(() => {
      window.__finalBlowQa.stage('vet');
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.positions(500, 800);
      window.__finalBlowQa.step(0.6);
      return true;
    })()`);
    await delay(120);
    const before = await evaluate(client, `(() => {
      const violence = window.__finalBlowEngine.snapshot().violence;
      const crowd = window.__finalBlowQa.crowd();
      return {
        hold: violence.crowdKoHold,
        age: violence.crowdKoHoldAge,
        voicePlays: violence.crowdVoicePlays,
        swells: violence.crowdSwells,
        cheering: crowd.moods.cheer || 0,
        painted: crowd.painted,
        members: crowd.members.length,
      };
    })()`);
    assert.equal(before.hold, 0, 'no KO hold may be latched during a live round');
    assert.equal(before.age, -1);
    assert.equal(before.painted, true, 'the Vet must be running the painted crowd');
    assert.ok(before.members >= 25, `the tailgate must be dense, saw ${before.members}`);

    // The KO roar is rate-limited in wall-clock time (engine/crowd-voice.mjs:
    // roar minGapMs 2000), and the probes before this one land KOs of their own.
    // Wait the cue out so "the KO plays a take" is a real assertion rather than a
    // race against whatever ran first.
    await delay(2100);
    await evaluate(client, `window.__finalBlowQa.winBout(60, true)`);
    await delay(180);
    crowdKoHold = await evaluate(client, `(() => {
      const violence = window.__finalBlowEngine.snapshot().violence;
      const crowd = window.__finalBlowQa.crowd();
      return {
        hold: violence.crowdKoHold,
        age: violence.crowdKoHoldAge,
        reaction: violence.crowdDrawReaction,
        voicePlays: violence.crowdVoicePlays,
        voiceRecent: violence.crowdVoiceRecent,
        swells: violence.crowdSwells,
        moods: crowd.moods,
        flashes: crowd.flashes.length,
      };
    })()`);
    assert.equal(crowdKoHold.hold, 1, 'the KO must latch the crowd hold');
    assert.ok(crowdKoHold.age >= 0, 'the hold must be counting');
    assert.ok(crowdKoHold.reaction >= 1, `the held reaction must ramp past every painted threshold, saw ${crowdKoHold.reaction}`);
    assert.ok(crowdKoHold.voicePlays > before.voicePlays, 'the KO must play a voiced crowd take');
    assert.ok(crowdKoHold.swells > before.swells, 'the KO must swell the synth crowd bus');
    assert.ok((crowdKoHold.moods.cheer || 0) > 0, 'the winner\'s fans must be cheering');
    assert.ok((crowdKoHold.moods.wince || 0) > 0, 'the loser\'s fans must not be cheering with them');
    // The take that played may never be the one before it — the owner's rule for
    // every reactive cue. crowdVoiceRecent is the last dozen as "cue-take".
    assert.deepEqual(
      crowdKoHold.voiceRecent.filter((take, index) => index > 0 && take === crowdKoHold.voiceRecent[index - 1]),
      [],
      'a crowd take must never repeat back to back',
    );
    // The hold advances with the sim, then lets go.
    const aged = await evaluate(client, `(() => {
      for (let frame = 0; frame < 40; frame += 1) window.__finalBlowQa.step(1 / 60);
      const violence = window.__finalBlowEngine.snapshot().violence;
      return { age: violence.crowdKoHoldAge, reaction: violence.crowdDrawReaction };
    })()`);
    assert.ok(aged.age >= crowdKoHold.age + 30, `the hold must age with the sim, ${crowdKoHold.age} -> ${aged.age}`);
    assert.ok(aged.reaction > 0.5, 'the crowd must still be celebrating 40 ticks in');
  });
});

probe('tempo-tells', async () => {
  await withMotion(async () => {
    // 5.1 TEMPO TELLS. A whiffed jab costs recovery frames and then a re-arm gap,
    // and both are supposed to be VISIBLE: a fringe and ghosts on the whiff, a
    // flash when the button comes back, a drop flash if you mash inside the gap.
    // Sim counters (tempoFxDebug) are deterministic under qa.step; the drawn
    // counters are per-frame, so they are sampled over real frames while the QA
    // fight holds the sim clock still.
    const setup = `(() => {
      window.__finalBlowQa.fight('jez', 'deathblow');
      window.__finalBlowQa.positions(300, 1000);
      window.__finalBlowQa.step(0.5);
      return true;
    })()`;
    const READ = `(() => {
      const tempo = window.__finalBlowQa.tempo();
      return { fringes: tempo.drawn.fringes, ghosts: tempo.drawn.ghosts, rearmFlashes: tempo.drawn.rearmFlashes, dropFlashes: tempo.drawn.dropFlashes };
    })()`;
    await evaluate(client, setup);
    // tempoFxDebug totals are monotonic for the whole session (every probe
    // before this one has thrown punches), so everything below is a DELTA.
    const quiet = await evaluate(client, `(() => { const tempo = window.__finalBlowQa.tempo(); return { whiffTells: tempo.whiffTells, rearmDrops: tempo.rearmDrops, rearmClicks: tempo.rearmClicks, phase: tempo.sides[0].phase }; })()`);
    assert.equal(quiet.phase, 'none', 'a fresh fight has no tell running');

    tempoWhiff = await evaluate(client, `(() => {
      window.__finalBlowQa.input(0, { light: true });
      for (let frame = 0; frame < 12; frame += 1) window.__finalBlowQa.step(1 / 60);
      const tempo = window.__finalBlowQa.tempo();
      return { whiffTells: tempo.whiffTells, phase: tempo.sides[0].phase, strength: tempo.sides[0].strength, taxed: tempo.sides[0].taxed, tell: tempo.sides[0].whiffTell };
    })()`);
    assert.equal(tempoWhiff.whiffTells - quiet.whiffTells, 1, 'a jab that hits nothing must be noticed exactly once');
    assert.equal(tempoWhiff.phase, 'whiff', 'the tell must be in its whiff phase 12 ticks in');
    assert.ok(tempoWhiff.strength > 0, 'the whiff tell must have strength to draw with');
    assert.equal(tempoWhiff.tell.kind, 'light');
    assert.equal(tempoWhiff.tell.profileId, 'jez-neon-jab');
    const whiffDrawn = await peakOverFrames(READ);
    assert.ok(whiffDrawn.fringes >= 1, `the whiff must draw its fringe, saw ${whiffDrawn.fringes}`);
    assert.ok(whiffDrawn.ghosts >= 1, `the whiff must draw its ghosts, saw ${whiffDrawn.ghosts}`);

    tempoRearm = await evaluate(client, `(() => {
      for (let frame = 0; frame < 10; frame += 1) window.__finalBlowQa.step(1 / 60);
      const tempo = window.__finalBlowQa.tempo();
      return { phase: tempo.sides[0].phase, rearmLeft: tempo.sides[0].rearmLeft };
    })()`);
    assert.equal(tempoRearm.phase, 'rearm', 'the whiff must hand over to the re-arm gap');
    assert.ok(tempoRearm.rearmLeft > 0);
    const rearmDrawn = await peakOverFrames(READ);
    assert.ok(rearmDrawn.rearmFlashes >= 1, `the re-arm must flash, saw ${rearmDrawn.rearmFlashes}`);

    // Mashing inside the gap: the press is eaten, and the drop is shown and heard.
    tempoDrop = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('jez', 'deathblow');
      window.__finalBlowQa.positions(300, 1000);
      window.__finalBlowQa.step(0.5);
      window.__finalBlowQa.input(0, { light: true });
      for (let frame = 0; frame < 21; frame += 1) window.__finalBlowQa.step(1 / 60);
      const gap = window.__finalBlowQa.tempo();
      window.__finalBlowQa.input(0, { light: true });
      for (let frame = 0; frame < 4; frame += 1) window.__finalBlowQa.step(1 / 60);
      const tempo = window.__finalBlowQa.tempo();
      return {
        gapPhase: gap.sides[0].phase,
        gapLeft: gap.sides[0].rearmLeft,
        rearmDrops: tempo.rearmDrops - gap.rearmDrops,
        rearmClicks: tempo.rearmClicks - gap.rearmClicks,
        dropFlash: tempo.sides[0].dropFlash,
      };
    })()`);
    assert.equal(tempoDrop.gapPhase, 'rearm', 'the second press must land inside the re-arm gap');
    assert.ok(tempoDrop.gapLeft > 0);
    assert.equal(tempoDrop.rearmDrops, 1, 'a press inside the gap must be counted as a dropped input');
    assert.equal(tempoDrop.rearmClicks, 1, 'the dropped press must click');
    assert.ok(tempoDrop.dropFlash > 0, 'the drop must arm its flash');
    const dropDrawn = await peakOverFrames(READ);
    assert.ok(dropDrawn.dropFlashes >= 1, `the dropped press must draw its flash, saw ${dropDrawn.dropFlashes}`);
  });
});

probe('announcer-decision', async () => {
  // w51 gave the clock a voice — a synthesised tick per displayed second under
  // :10, a once-per-round "TEN SECONDS" call at the :10 edge, and a time-over
  // decision at :00 — and nothing could reach it: the round clock starts at 99
  // and no probe waits 89 real seconds. qa.setTimer() (new, QA-fights only)
  // puts the clock on the edge and the sim walks the rest of the ladder.
  //
  // First, the guard. A match started from the menu is NOT a QA fight
  // (state.qaManualMode is false), and its clock must be untouchable.
  await evaluate(client, `(() => {
    document.querySelector('[data-mode="arcade"]').click();
    document.querySelectorAll('.fighter-card')[0].click();
    document.querySelector('#fighterContinue').click();
    document.querySelector('[data-stage="vet"]').click();
    document.querySelector('#fightButton').click();
    return true;
  })()`);
  await delay(250);
  await evaluate(client, `window.__finalBlowQa.step(2.5)`);
  timerGuard = await evaluate(client, `(() => {
    const snapshot = window.__finalBlowEngine.snapshot();
    try {
      window.__finalBlowQa.setTimer(11);
      return { screen: snapshot.screen, refused: false, message: '' };
    } catch (error) {
      return { screen: snapshot.screen, refused: true, message: error.message };
    }
  })()`);
  assert.equal(timerGuard.screen, 'fight', 'the menu route must have started a real match');
  assert.equal(timerGuard.refused, true, 'setTimer must refuse a match the player started');
  assert.match(timerGuard.message, /QA-fight only/);

  announcerDecision = await evaluate(client, `(() => {
    const counters = () => {
      const violence = window.__finalBlowEngine.snapshot().violence;
      return {
        clockCallouts: violence.clockCallouts,
        decisionCalls: violence.decisionCalls,
        timerTicks: violence.timerTicks,
        clockTicksVoiced: violence.clockTicksVoiced,
        announcerCalls: violence.announcerCalls,
      };
    };
    const hud = () => document.querySelector('#timer').textContent;
    window.__finalBlowQa.fight('deathblow', 'jez');
    window.__finalBlowQa.positions(400, 900);
    window.__finalBlowQa.step(0.5);
    const before = counters();
    const set = window.__finalBlowQa.setTimer(11);
    const armed = { hud: hud(), ...counters() };
    window.__finalBlowQa.step(1.05);
    const ten = { hud: hud(), phase: window.__finalBlowEngine.snapshot().phase, ...counters() };
    for (let second = 0; second < 11; second += 1) window.__finalBlowQa.step(1);
    const over = { hud: hud(), phase: window.__finalBlowEngine.snapshot().phase, ...counters() };
    return { set, before, armed, ten, over };
  })()`);
  assert.deepEqual(announcerDecision.set, { timer: 11, timerCarry: 0, mode: 'versus' });
  assert.equal(announcerDecision.armed.hud, '11', 'the HUD must show the forced clock');
  assert.equal(announcerDecision.armed.clockCallouts, announcerDecision.before.clockCallouts, 'arming the clock above :10 must not call anything');
  assert.equal(announcerDecision.ten.hud, '10');
  assert.equal(announcerDecision.ten.phase, 'fight');
  assert.equal(announcerDecision.ten.clockCallouts, announcerDecision.before.clockCallouts + 1, 'the :10 edge must call TEN SECONDS exactly once');
  assert.equal(announcerDecision.ten.timerTicks, announcerDecision.before.timerTicks + 1, 'one timer edge booked at :10');
  assert.ok(announcerDecision.ten.announcerCalls > announcerDecision.before.announcerCalls, 'the TEN SECONDS call must reach the announcer');
  assert.equal(announcerDecision.over.hud, '00');
  assert.equal(announcerDecision.over.phase, 'roundover', 'the clock running out must end the round');
  assert.equal(announcerDecision.over.clockCallouts, announcerDecision.before.clockCallouts + 1, 'TEN SECONDS is once per round, not once per tick');
  assert.equal(announcerDecision.over.decisionCalls, announcerDecision.before.decisionCalls + 1, 'a time-over round end must voice the decision');
  assert.equal(announcerDecision.over.timerTicks, announcerDecision.before.timerTicks + 11, 'one booked edge per displayed second from :10 to :00');
  assert.equal(
    announcerDecision.over.clockTicksVoiced,
    announcerDecision.over.timerTicks,
    'w51 clock truth: every booked timer edge must be the one that ticked',
  );
});

probe('pose-trace-chains', async () => {
  // 5.0 FULL SWING recorded its acceptance as frame chains read off the screen
  // by eye ("Verified by frame attribution in real play (jez)" in
  // MOTION-ATLAS.md). poseTrace() is the ring those transitions land in, and
  // qa.pose() resolves the pose through the same fighterAnimationPose the
  // renderers call — so a scripted strike records its chain deterministically,
  // with no reliance on a rendered frame or a tick count.
  //
  // The chains are asserted as an ORDERED PREFIX of transitions, never tick
  // counts, so tempo tuning cannot false-fail them.
  const CHAIN_PROBE = `((script, frames) => {
    window.__finalBlowQa.fight('jez', 'deathblow');
    window.__finalBlowQa.positions(500, 900);
    window.__finalBlowQa.step(0.4);
    window.__finalBlowQa.poseTraceReset();
    script();
    for (let frame = 0; frame < frames; frame += 1) {
      window.__finalBlowQa.step(1 / 60);
      window.__finalBlowQa.pose();
    }
    return window.__finalBlowQa.poseTrace(64, 0).map((entry) => entry.bank + ':' + entry.frame);
  })`;
  poseChains = await evaluate(client, `(() => {
    const run = ${CHAIN_PROBE};
    const qa = window.__finalBlowQa;
    return {
      jab: run(() => qa.input(0, { light: true }), 40),
      heavyKick: run(() => qa.input(0, { heavy: true, limb: 'kick' }), 70),
      crouchJab: run(() => qa.input(0, { light: true, down: true }, 30), 40),
      sweep: run(() => qa.input(0, { heavy: true, limb: 'kick', down: true }, 30), 60),
      airKick: run(() => {
        qa.input(0, { jump: true }, 3);
        for (let frame = 0; frame < 16; frame += 1) qa.step(1 / 60);
        qa.input(0, { heavy: true, limb: 'kick' }, 20);
      }, 60),
    };
  })()`);
  // MOTION-ATLAS.md v5.0, verbatim, with one 5.2 correction: the second
  // ext3:8 on the air arc is unified-ext5:6 now (5.2 LOCOMOTION gave the jump
  // its own ext5 cells). motion3:4 is still the one cross-generation cell on
  // the whole set, which is why it is written out rather than tolerated.
  const EXPECTED = {
    jab: ['unified-ext2:0', 'unified-ext3:0', 'unified-ext3:2', 'unified-ext2:1', 'unified:7'],
    heavyKick: ['unified-ext:6', 'unified-ext2:6', 'unified:6', 'unified-ext3:14', 'unified-ext3:11', 'unified-ext2:7', 'unified:7'],
    crouchJab: ['unified-ext2:8', 'unified-ext3:4', 'unified-ext2:9', 'unified:7'],
    sweep: ['unified-ext2:10', 'unified-ext3:5', 'unified-ext3:15', 'unified-ext2:11'],
    airKick: ['unified-ext3:8', 'unified-ext3:7', 'motion3:4', 'unified-ext5:6', 'unified-ext3:10', 'unified:6'],
  };
  for (const [move, chain] of Object.entries(EXPECTED)) {
    assert.deepEqual(
      poseChains[move].slice(0, chain.length),
      chain,
      `${move} must draw the MOTION-ATLAS chain, got ${poseChains[move].join(' -> ')}`,
    );
  }
  // The one-generation law: every ground chain is unified-family end to end,
  // and the air arc's single motion3 descent cell is the only exception left.
  for (const move of ['jab', 'heavyKick', 'crouchJab', 'sweep']) {
    assert.deepEqual(
      EXPECTED[move].filter((cell) => !cell.startsWith('unified')),
      [],
      `${move} must never leave the unified generation`,
    );
  }
  assert.deepEqual(
    EXPECTED.airKick.filter((cell) => !cell.startsWith('unified')),
    ['motion3:4'],
    'the jump descent is the one cross-generation cell left on the air arc',
  );
});

probe('demo-mode', async () => {
    demoOpening = await evaluate(client, `window.__finalBlowQa.demo(237)`);
    assert.equal(demoOpening.mode, 'demo');
    assert.equal(demoOpening.screen, 'fight');
    assert.equal(demoOpening.demo.active, true);
    assert.equal(demoOpening.demo.difficulty, 'demo');
    assert.notEqual(demoOpening.fighters[0].id, demoOpening.fighters[1].id);
    assert.equal(demoOpening.fighters[0].ai.difficulty, 'demo');
    assert.equal(demoOpening.fighters[1].ai.difficulty, 'demo');
    demoThinking = await evaluate(client, `window.__finalBlowQa.step(4.5); window.__finalBlowEngine.snapshot()`);
    assert.ok(demoThinking.fighters[0].ai.decisions > 0, 'CPU 1 should make delayed visual decisions');
    assert.ok(demoThinking.fighters[1].ai.decisions > 0, 'CPU 2 should make delayed visual decisions');
    assert.equal(demoThinking.demo.superShown, true, 'every exhibition should deliberately showcase a super');
    assert.equal(await evaluate(client, `document.querySelector('#demoHud').hidden`), false);

    demoFinishReady = await evaluate(client, `window.__finalBlowQa.demoKnockout(0)`);
    assert.equal(demoFinishReady.phase, 'finish');
    assert.equal(demoFinishReady.fighters[1].health, 0);
    demoFinalBlow = await evaluate(client, `window.__finalBlowQa.step(0.05); ({ snapshot: window.__finalBlowEngine.snapshot(), status: window.__finalBlowQa.status() })`);
    assert.equal(demoFinalBlow.snapshot.phase, 'roundover');
    assert.ok(demoFinalBlow.status.elapsed > 0, 'the winning CPU should trigger its character Final Blow');

    demoResult = await evaluate(client, `window.__finalBlowQa.demoResult(0)`);
    assert.equal(demoResult.screen, 'result');
    assert.equal(demoResult.demo.resultScheduled, true);
    assert.equal(await evaluate(client, `document.querySelector('#demoResultStatus').hidden`), false);
    await delay(5_150);
    automaticDemoCycle = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(automaticDemoCycle.screen, 'fight');
    assert.equal(automaticDemoCycle.demo.cycle.cycle, 2);
    assert.equal(automaticDemoCycle.demo.matches, 2);
    assert.equal(automaticDemoCycle.demo.resultScheduled, false);
    await evaluate(client, `window.__finalBlowQa.demo(333)`);
    demoMarathon = await evaluate(client, `window.__finalBlowQa.demoCycles(64)`);
    assert.equal(demoMarathon.cycles.length, 64);
    assert.equal(demoMarathon.demo.matches, 64);
    assert.equal(new Set(demoMarathon.cycles.slice(0, 28).map(({ picks }) => [...picks].sort().join('::'))).size, 28);
    assert.ok(demoMarathon.cycles.every(({ picks }) => picks[0] !== picks[1]));
    assert.deepEqual(demoMarathon.resources, {
      fighters: 2,
      particles: 0,
      effects: 0,
      traps: 0,
      projectiles: 0,
      resultTimers: 0,
      introTimers: 1,
    });
    await dispatchKey(client, "keyDown", "KeyQ", "q", 81);
    await dispatchKey(client, "keyUp", "KeyQ", "q", 81);
    demoExit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    assert.equal(demoExit.screen, 'title');
    assert.equal(demoExit.mode, 'arcade');
    assert.equal(demoExit.demo.active, false);
    assert.equal(await evaluate(client, `document.body.classList.contains('demo-active')`), false);
});

probe('offline-cache', async () => {
    offlineCache = await evaluate(client, `(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await Promise.race([
          new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      }
      const names = await caches.keys();
      const name = names.find((item) => item.startsWith('final-blow-shell-'));
      const cache = name ? await caches.open(name) : null;
      const requests = cache ? await cache.keys() : [];
      const root = cache ? await cache.match('./') : null;
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        name,
        entries: requests.length,
        hasIndex: Boolean(cache && await cache.match('./index.html')),
        rootRedirected: root?.redirected ?? null,
        hasGame: Boolean(cache && await cache.match('./game.js')),
        hasRollback: Boolean(cache && await cache.match('./engine/rollback.mjs')),
        hasDemo: Boolean(cache && await cache.match('./engine/demo.mjs')),
        hasFatalities: Boolean(cache && await cache.match('./engine/fatalities.mjs')),
        hasFighterAudioEngine: Boolean(cache && await cache.match('./engine/fighter-audio.mjs')),
        hasAtlasFacing: Boolean(cache && await cache.match('./engine/atlas-facing.mjs')),
        hasRuntimeAudio: Boolean(cache && await cache.match('./assets/audio/light-swing.mp3')),
        hasJanney: Boolean(cache && await cache.match('./assets/janney-street-vacant-lot.webp')),
        hasSomerset: Boolean(cache && await cache.match('./assets/somerset-septa.webp')),
        ready: window.__finalBlowEngine.snapshot().offlineReady,
      };
    })()`);
    assert.equal(offlineCache.controlled, true);
    assert.match(offlineCache.name, /final-blow-shell-5\.3/);
    // 1.9E added engine/atlas-facing.mjs to the shell: game.js imports it, so
    // offline boot needs it cached.
    // 5.1 added engine/{audio-manifest, ambient, announcer, crowd-voice, shared-sfx,
    // swing-resolve}.mjs to the shell: game.js imports them at boot.
    assert.equal(offlineCache.entries, 28);
    assert.equal(offlineCache.hasAtlasFacing, true);
    assert.equal(offlineCache.hasIndex, false);
    assert.equal(offlineCache.rootRedirected, false);
    assert.equal(offlineCache.hasGame, true);
    assert.equal(offlineCache.hasRollback, true);
    assert.equal(offlineCache.hasDemo, true);
    assert.equal(offlineCache.hasFatalities, true);
    assert.equal(offlineCache.hasFighterAudioEngine, true);
    assert.equal(offlineCache.hasRuntimeAudio, false);
    assert.equal(offlineCache.hasJanney, false);
    assert.equal(offlineCache.hasSomerset, false);
    assert.equal(offlineCache.ready, true);

    await reload(client);
    controlledReload = await evaluate(client, `(() => ({
      title: document.title,
      build: document.querySelector('.build-tag')?.textContent,
      version: window.__finalBlowEngine?.version,
    }))()`);
    assert.match(controlledReload.title, /Final Blow/);
    assert.match(controlledReload.build, /5\.3/);
    assert.equal(controlledReload.version, '5.3-spectacle');

    await client.send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
      connectionType: 'none',
    });
    offlineLoaded = client.once('Page.loadEventFired');
    await client.send('Page.reload', { ignoreCache: false });
    await offlineLoaded;
    await delay(500);
    offlineBoot = await evaluate(client, `(() => ({
      title: document.title,
      build: document.querySelector('.build-tag').textContent,
      version: window.__finalBlowEngine?.version,
      badge: document.querySelector('#offlineBadge').textContent,
    }))()`);
    assert.match(offlineBoot.title, /Final Blow/);
    assert.match(offlineBoot.build, /5\.3/);
    assert.equal(offlineBoot.version, '5.3-spectacle');
    assert.match(offlineBoot.badge, /OFFLINE (READY|PLAY)/);
    await client.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      connectionType: 'wifi',
    });
});

probe('mobile-landscape', async () => {
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 844,
      height: 390,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await reload(client);
    landscape = await evaluate(client, `(() => {
      const frame = document.querySelector('#gameFrame').getBoundingClientRect();
      const version = document.querySelector('#titleVersion');
      const versionBox = version.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        touchPoints: navigator.maxTouchPoints,
        coarse: matchMedia('(pointer: coarse)').matches,
        mobileLandscape: document.body.classList.contains('mobile-landscape'),
        orientationBlocked: document.body.classList.contains('orientation-blocked'),
        frameWidth: frame.width,
        frameHeight: frame.height,
        version: {
          text: version.textContent.trim(),
          display: getComputedStyle(version).display,
          left: versionBox.left,
          top: versionBox.top,
          right: versionBox.right,
          bottom: versionBox.bottom,
        },
      };
    })()`);
    assert.equal(landscape.width, 844);
    assert.equal(landscape.height, 390);
    assert.ok(landscape.touchPoints > 0);
    assert.equal(landscape.mobileLandscape, true);
    assert.equal(landscape.orientationBlocked, false);
    assert.ok(landscape.frameWidth >= 840 && landscape.frameHeight >= 385);
    assert.equal(landscape.version.text, 'VERSION 5.3');
    assert.notEqual(landscape.version.display, 'none');
    assert.ok(landscape.version.left >= 0 && landscape.version.top >= 0);
    assert.ok(landscape.version.right <= 844 && landscape.version.bottom <= 390);

    // The rebuilt four-button HUD has to fit the 844x390 landscape target with the
    // movement pad on the left and the LP/HP/LK/HK cluster on the right.
    touchLayout = await evaluate(client, `(() => {
      const handedness = document.querySelector('#touchHandednessSelect');
      handedness.value = 'standard';
      handedness.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('[data-mode="versus"]').click();
      document.querySelectorAll('.fighter-card')[0].click();
      document.querySelectorAll('.fighter-card')[1].click();
      document.querySelector('#fighterContinue').click();
      document.querySelector('#fightButton').click();
      window.__finalBlowQa.step(2.5);
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      };
      const buttons = [...document.querySelectorAll('.touch-action button')];
      const pad = [...document.querySelectorAll('.touch-move button')];
      return {
        display: getComputedStyle(document.querySelector('#touchControls')).display,
        controls: rect('#touchControls'),
        action: rect('.touch-action'),
        move: rect('.touch-move'),
        labels: buttons.map((button) => button.textContent),
        padTokens: pad.map((button) => button.dataset.touch),
        minButton: Math.min(...buttons.map((button) => button.getBoundingClientRect().width)),
        viewport: { width: innerWidth, height: innerHeight },
      };
    })()`);
    assert.notEqual(touchLayout.display, "none", "touch controls must be visible in landscape");
    assert.deepEqual(touchLayout.labels, ["LP", "HP", "LK", "HK"]);
    assert.deepEqual(touchLayout.padTokens, [
      "up left", "up", "up right", "left", "right", "down left", "down", "down right",
    ], "the movement pad covers all eight directions");
    assert.ok(touchLayout.move.right < touchLayout.action.left, "movement pad on the left, attacks on the right");
    for (const [name, box] of [["controls", touchLayout.controls], ["action", touchLayout.action], ["move", touchLayout.move]]) {
      assert.ok(box.top >= -1, `${name} must not run off the top of the 844x390 frame`);
      assert.ok(box.bottom <= touchLayout.viewport.height + 1, `${name} must not run off the bottom of the 844x390 frame`);
      assert.ok(box.left >= -1 && box.right <= touchLayout.viewport.width + 1, `${name} must stay inside the frame width`);
    }
    assert.ok(touchLayout.minButton >= 34, "attack buttons must stay comfortably tappable");

    mobileCrowd = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('somerset');
      window.__finalBlowQa.step(2.5);
      return window.__finalBlowEngine.snapshot().crowd;
    })()`);
    assert.ok(mobileCrowd.visible >= 8, `Somerset's photographic background adults must remain visible on 844x390, saw ${mobileCrowd.visible}`);
    assert.equal(mobileCrowd.variant, "somerset");
    assert.equal(mobileCrowd.embeddedPose, "deep-slump-head-near-knees");

    mobilePoolDeck = await evaluate(client, `(() => {
      window.__finalBlowQa.fight('deathblow', 'jez');
      window.__finalBlowQa.stage('cruise');
      window.__finalBlowQa.step(2.5);
      return window.__finalBlowEngine.snapshot().crowd;
    })()`);
    assert.ok(
      mobilePoolDeck.visible >= 35,
      `the pool deck must hold 35+ passengers on 844x390, saw ${mobilePoolDeck.visible}`,
    );
    await evaluate(client, `window.__finalBlowQa.stage('somerset')`);

    mobileFraming = await evaluate(client, FIGHTER_FRAMING_PROBE);
    assertFighterFraming(mobileFraming, "844x390 landscape");
    // Sub-pixel HUD rounding differs slightly between the two frames; the rule is
    // that the fighter-to-stage ratio is effectively identical.
    for (const [id, mobilePercent] of Object.entries(mobileFraming.percent)) {
      const drift = Math.abs(mobilePercent - desktopFraming.percent[id]);
      assert.ok(drift <= 1, `${id} framing drifts ${drift}pp between desktop and mobile`);
    }

    // Left-handed players get the mirrored layout without losing the frame fit.
    mirroredLayout = await evaluate(client, `(() => {
      const handedness = document.querySelector('#touchHandednessSelect');
      handedness.value = 'left';
      handedness.dispatchEvent(new Event('change', { bubbles: true }));
      const move = document.querySelector('.touch-move').getBoundingClientRect();
      const action = document.querySelector('.touch-action').getBoundingClientRect();
      handedness.value = 'standard';
      handedness.dispatchEvent(new Event('change', { bubbles: true }));
      return { moveLeft: move.left, actionLeft: action.left, moveBottom: move.bottom, actionBottom: action.bottom, height: innerHeight };
    })()`);
    assert.ok(mirroredLayout.actionLeft < mirroredLayout.moveLeft, "left-handed layout mirrors the clusters");
    assert.ok(mirroredLayout.moveBottom <= mirroredLayout.height + 1);
    assert.ok(mirroredLayout.actionBottom <= mirroredLayout.height + 1);

    mobileDemo = await evaluate(client, `(() => {
      const snapshot = window.__finalBlowQa.demo(845);
      const hud = document.querySelector('#demoHud').getBoundingClientRect();
      const touch = document.querySelector('#touchControls');
      const pause = document.querySelector('#touchPauseButton');
      const result = {
        snapshot,
        hud: { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom },
        touchDisplay: getComputedStyle(touch).display,
        pauseDisplay: getComputedStyle(pause).display,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
      ((el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })(document.querySelector('#game'));
      result.exit = window.__finalBlowEngine.snapshot();
      const demoButton = document.querySelector('#demoButton').getBoundingClientRect();
      const controlsButton = document.querySelector('#controlsButton').getBoundingClientRect();
      result.titleButtons = {
        demo: { left: demoButton.left, right: demoButton.right, bottom: demoButton.bottom },
        controls: { left: controlsButton.left, right: controlsButton.right, bottom: controlsButton.bottom },
      };
      return result;
    })()`);
    assert.equal(mobileDemo.snapshot.demo.active, true);
    assert.equal(mobileDemo.snapshot.mode, 'demo');
    assert.notEqual(mobileDemo.snapshot.fighters[0].id, mobileDemo.snapshot.fighters[1].id);
    assert.equal(mobileDemo.touchDisplay, 'none');
    assert.equal(mobileDemo.pauseDisplay, 'none');
    assert.equal(mobileDemo.overflow, false);
    assert.equal(mobileDemo.exit.screen, 'title');
    assert.equal(mobileDemo.exit.demo.active, false);
    // 2.4A made the grown title menu scroll on short viewports: buttons below
    // the fold are reachable by scrolling, so only horizontal fit is asserted.
    assert.ok(mobileDemo.titleButtons.demo.left >= 0 && mobileDemo.titleButtons.demo.right <= 844);
    assert.ok(mobileDemo.titleButtons.controls.left >= 0 && mobileDemo.titleButtons.controls.right <= 844);
    assert.ok(mobileDemo.hud.left >= 0 && mobileDemo.hud.right <= 844 && mobileDemo.hud.bottom <= 390);
});

probe('mobile-polish', async () => {
    mobilePolish = await evaluate(client, `(() => {
      const snapshot = window.__finalBlowQa.training('deathblow', 'jez', 'guard');
      const training = document.querySelector('#trainingPanel').getBoundingClientRect();
      const pauseButton = document.querySelector('#touchPauseButton');
      const pauseBounds = pauseButton.getBoundingClientRect();
      pauseButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
      const paused = window.__finalBlowEngine.snapshot();
      const pausePanel = document.querySelector('#pausePanel').getBoundingClientRect();
      window.__finalBlowQa.pause(false);
      return {
        timer: document.querySelector('#timer').textContent,
        profile: snapshot.performance.id,
        training: { left: training.left, top: training.top, right: training.right, bottom: training.bottom },
        pauseButton: { display: getComputedStyle(pauseButton).display, left: pauseBounds.left, right: pauseBounds.right, bottom: pauseBounds.bottom },
        paused: paused.paused,
        pausePanel: { left: pausePanel.left, top: pausePanel.top, right: pausePanel.right, bottom: pausePanel.bottom },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    })()`);
    assert.equal(mobilePolish.timer, '∞');
    assert.equal(mobilePolish.profile, 'battery');
    assert.equal(mobilePolish.pauseButton.display, 'block');
    assert.equal(mobilePolish.paused, true);
    assert.equal(mobilePolish.overflow, false);
    assert.ok(mobilePolish.training.left >= 0 && mobilePolish.training.right <= 844 && mobilePolish.training.bottom <= 390);
    assert.ok(mobilePolish.pauseButton.left >= 0 && mobilePolish.pauseButton.right <= 844 && mobilePolish.pauseButton.bottom <= 390);
    assert.ok(mobilePolish.pausePanel.left >= 0 && mobilePolish.pausePanel.right <= 844 && mobilePolish.pausePanel.bottom <= 390);
});

probe('mobile-touch-input', async () => {
    await evaluate(client, `(() => {
      document.querySelector('[data-mode="arcade"]').click();
      document.querySelectorAll('.fighter-card')[0].click();
      document.querySelector('#fighterContinue').click();
      document.querySelector('#fightButton').click();
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(2.5)`);
    // Arcade runs live on RAF here, so the AI is free to act while this probe
    // samples. Without a neutral, uninterruptible window the press lands during
    // whatever the opponent happened to be doing — 1.9's offensive pass shifted
    // that timing enough to leave the fighter in hitstun, and a stunned fighter
    // correctly refuses to attack. Clear the stun and hold invulnerability so
    // this tests touch input rather than arcade AI timing.
    await evaluate(client, `window.__finalBlowQa.fighter(0, {
      hitstunFrames: 0, blockstunFrames: 0, knockdownFrames: 0,
      wakeupFrames: 0, dizzyFrames: 0, guardCrushFrames: 0, invulnerableFrames: 90,
    })`);
    await evaluate(client, `(() => {
      const button = document.querySelector('[data-touch="lp"]');
      const r = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      return true;
    })()`);
    await delay(120);
    touchAttack = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      const button = document.querySelector('[data-touch="lp"]');
      const r2 = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: r2.left + r2.width / 2, clientY: r2.top + r2.height / 2 }));
      return true;
    })()`);
    assert.equal(touchAttack.fighters[0].attack, "light");
    assert.equal(touchAttack.fighters[0].state, "attack");
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
    await evaluate(client, `(() => {
      const button = document.querySelector('[data-touch="down left"]');
      const r = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    touchGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      const button = document.querySelector('[data-touch="down left"]');
      const r2 = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: r2.left + r2.width / 2, clientY: r2.top + r2.height / 2 }));
      return true;
    })()`);
    assert.equal(touchGuard.fighters[0].guarding, true);
    assert.equal(touchGuard.fighters[0].guardHeight, "low");
});

probe('touch-flick', async () => {
    // 5.x sweep #41: a fast horizontal sweep on the movement pad must start a
    // dash through the existing double-tap detector — no new input bits. The
    // pulse plays lift/tap/lift/tap/settle over five sim ticks, so 0.1 s (6
    // ticks) is enough for the second press to land and startDash to run.
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.step(0.1)`);
    flickQueued = await evaluate(client, `window.__finalBlowQa.touchFlick(1)`);
    assert.equal(flickQueued.flickPulses, 1, "a centre-to-edge sweep must queue exactly one flick pulse");
    assert.ok(flickQueued.flicks >= 1, "touchDebug().flicks must count the landed flick");
    assert.ok(flickQueued.tokens.includes("right"), "the thumb lands in the right sector");
    await evaluate(client, `window.__finalBlowQa.step(0.1)`);
    flickDash = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    flickSettled = await evaluate(client, `window.__finalBlowQa.touchFlick(1, false)`);
    assert.ok(flickDash.fighters[0].dashFrames > 0, `a flick must start a dash, saw dashFrames ${flickDash.fighters[0].dashFrames}`);
    assert.equal(flickDash.fighters[0].dashDirection, 1, "flick right dashes toward screen right");
    assert.equal(flickSettled.flickPulses, 0, "the pulse must have settled");
    assert.ok(!flickSettled.tokens.includes("right"), "lifting the thumb must leave no direction token behind");
});

probe('governor-and-touch-meter', async () => {
    // 5.x sweep #37: the governor remembers the tier it lands on, keyed by
    // build, and forgets on request so the rest of this run stays at the
    // static resolution.
    governorMemory = await evaluate(client, `(() => {
      window.__finalBlowQa.governorForget();
      const before = window.__finalBlowQa.governorMemory();
      const stepped = window.__finalBlowQa.governorInject(25, 130);
      const stored = JSON.parse(localStorage.getItem(stepped.key) || 'null');
      const after = window.__finalBlowQa.governorForget();
      return { before, stepped, stored, after };
    })()`);
    assert.equal(governorMemory.before.remembered, null, "governorForget must leave nothing remembered");
    assert.match(governorMemory.stepped.key, /^final-blow-governor-tier:/);
    if (governorMemory.stepped.baseline !== "battery") {
      assert.match(governorMemory.stepped.lastChange, /^down:/, "130 frames at 25 ms must step the governor down");
      assert.equal(governorMemory.stored?.profileId, governorMemory.stepped.machineProfile, "the landed tier must be written to localStorage");
      assert.equal(governorMemory.stepped.remembered, governorMemory.stepped.machineProfile);
    }
    assert.equal(governorMemory.after.remembered, null);
    assert.equal(governorMemory.after.active, false, "governorForget must drop the live machine");
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 }); (() => {
      for (const action of ['hp', 'lp']) {
        const el = document.querySelector('[data-touch="' + action + '"]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 20 + action.length + action.charCodeAt(0), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      }
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.05)`);
    touchEnhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      for (const action of ['hp', 'lp']) {
        const el = document.querySelector('[data-touch="' + action + '"]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 20 + action.length + action.charCodeAt(0), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      }
      return true;
    })()`);
    assert.equal(touchEnhanced.fighters[0].move, "deathblow-ex-tremor-tap");
    assert.equal(touchEnhanced.fighters[0].meter, 25);
    await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 100 }); (() => {
      for (const action of ['hp', 'hk']) {
        const el = document.querySelector('[data-touch="' + action + '"]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 20 + action.length + action.charCodeAt(0), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      }
      return true;
    })()`);
    await evaluate(client, `window.__finalBlowQa.step(0.1)`);
    touchSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    await evaluate(client, `(() => {
      for (const action of ['hp', 'hk']) {
        const el = document.querySelector('[data-touch="' + action + '"]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 20 + action.length + action.charCodeAt(0), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      }
      return true;
    })()`);
    assert.equal(touchSuper.fighters[0].move, "deathblow-epicenter-execution");
    assert.equal(touchSuper.fighters[0].meter, 0);
});

probe('touch-finisher', async () => {
    touchFinisherSetup = await evaluate(client, `(() => {
      window.__finalBlowQa.ready('deathblow', 1);
      window.__finalBlowQa.positions(80, 1200);
      window.__finalBlowQa.step(0.05);
      const fighters = window.__finalBlowEngine.snapshot().fighters;
      ((el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })(document.querySelector('[data-touch="hp"]'));
      return {
        distance: Math.abs(fighters[1].x - fighters[0].x),
        prompt: document.querySelector('#touchPrompt').textContent,
      };
    })()`);
    assert.ok(touchFinisherSetup.distance > 1000);
    assert.match(touchFinisherSetup.prompt, /LP = A · LK = B · ANY DISTANCE/);
    await evaluate(client, `window.__finalBlowQa.step(0.08)`);
    touchHeavyFinisherAttempt = await evaluate(client, `window.__finalBlowQa.status()`);
    await evaluate(client, `(() => {
      ((el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })(document.querySelector('[data-touch="hp"]'));
      window.__finalBlowQa.step(0.05);
      ((el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })(document.querySelector('[data-touch="lk"]'));
      return true;
    })()`);
    assert.equal(touchHeavyFinisherAttempt.elapsed, 0, "touch HP must not execute a finisher");
    await evaluate(client, `window.__finalBlowQa.step(0.12)`);
    touchLightKickFinisher = await evaluate(client, `window.__finalBlowQa.status()`);
    await evaluate(client, `((el) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })(document.querySelector('[data-touch="lk"]'))`);
    assert.ok(touchLightKickFinisher.elapsed > 0, "touch LK must execute a finisher");
    assert.equal(touchLightKickFinisher.fatalityFamily, "crush");
    await evaluate(client, `window.__finalBlowQa.step(4.58)`);
    mobileFinisher = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
    mobileFinisherMidpoint = (mobileFinisher.fighters[0].x + mobileFinisher.fighters[1].x) * .5;
    assert.equal(mobileFinisher.camera.mode, 'finisher');
    assert.ok(['final-impact', 'aftermath'].includes(mobileFinisher.camera.shot));
    assert.ok(mobileFinisher.camera.peakZoom >= 1.6);
    assert.ok(mobileFinisher.camera.zoom <= 1.4, 'mobile reduced-motion zoom must remain capped');
    assert.ok(Math.abs(mobileFinisher.camera.x - mobileFinisherMidpoint) < .001);
    assert.ok(mobileFinisher.violence.goreFragments >= 12);
    assert.ok(mobileFinisher.violence.lensBlood >= 1);
});

probe('mobile-victory', async () => {
    mobileVictory = await evaluate(client, `(() => {
      window.__finalBlowQa.result('deathblow');
      const screen = document.querySelector('#resultScreen').getBoundingClientRect();
      const pose = document.querySelector('#victoryPose').getBoundingClientRect();
      return {
        active: document.querySelector('#resultScreen').classList.contains('active'),
        background: document.querySelector('#victoryPose').style.backgroundImage,
        screen: { width: screen.width, height: screen.height },
        pose: { width: pose.width, height: pose.height },
      };
    })()`);
    assert.equal(mobileVictory.active, true);
    assert.match(mobileVictory.background, /deathblow-specials\.webp/);
    assert.ok(mobileVictory.screen.width >= 840 && mobileVictory.screen.height >= 385);
    assert.ok(mobileVictory.pose.width > 250 && mobileVictory.pose.height > 250);

    mobileLadder = await evaluate(client, `(() => {
      window.__finalBlowQa.arcade('ali', 'street', 88);
      for (let bout = 0; bout < 8; bout += 1) window.__finalBlowQa.arcadeResult(true);
      const screen = document.querySelector('#ladderScreen').getBoundingClientRect();
      const route = document.querySelector('#arcadeLadderNodes').getBoundingClientRect();
      const button = document.querySelector('#arcadeContinueButton').getBoundingClientRect();
      return {
        active: document.querySelector('#ladderScreen').classList.contains('active'),
        nodes: document.querySelectorAll('#arcadeLadderNodes .ladder-node').length,
        screen: { left: screen.left, top: screen.top, right: screen.right, bottom: screen.bottom },
        route: { left: route.left, right: route.right, bottom: route.bottom },
        button: { left: button.left, right: button.right, bottom: button.bottom },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    })()`);
    assert.equal(mobileLadder.active, true);
    assert.equal(mobileLadder.nodes, 9);
    assert.equal(mobileLadder.overflow, false);
    assert.ok(mobileLadder.route.left >= 0 && mobileLadder.route.right <= 844);
    assert.ok(mobileLadder.button.left >= 0 && mobileLadder.button.right <= 844 && mobileLadder.button.bottom <= 390);

    mobileEnding = await evaluate(client, `(() => {
      window.__finalBlowQa.arcadeResult(true);
      const screen = document.querySelector('#endingScreen').getBoundingClientRect();
      const copy = document.querySelector('.ending-copy').getBoundingClientRect();
      const menu = document.querySelector('#endingReplayButton').getBoundingClientRect();
      return {
        active: document.querySelector('#endingScreen').classList.contains('active'),
        title: document.querySelector('#endingTitle').textContent,
        screen: { width: screen.width, height: screen.height },
        copy: { left: copy.left, right: copy.right, top: copy.top, bottom: copy.bottom },
        menu: { left: menu.left, right: menu.right, bottom: menu.bottom },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    })()`);
    assert.equal(mobileEnding.active, true);
    assert.equal(mobileEnding.title, 'WEST STAINES MASSIVE');
    assert.equal(mobileEnding.overflow, false);
    assert.ok(mobileEnding.copy.left >= 0 && mobileEnding.copy.right <= 844);
    assert.ok(mobileEnding.menu.left >= 0 && mobileEnding.menu.right <= 844 && mobileEnding.menu.bottom <= 390);
});

probe('portrait-gate', async () => {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await reload(client);
    portrait = await evaluate(client, `(() => ({
      blocked: document.body.classList.contains('orientation-blocked'),
      gateVisible: getComputedStyle(document.querySelector('#rotateGate')).display !== 'none',
    }))()`);
    assert.equal(portrait.blocked, true);
    assert.equal(portrait.gateVisible, true);
});

probe('cinema-3d', async () => {
  // 5.3 VERIFICATION HARNESS (sweep #54). renderer/three is ~9,000 lines that
  // no test ever booted: 4.3 Mesh Fighters and 4.8 Front Row shipped with no
  // automated check, and a broken 3D toggle is a black screen the owner would
  // find on his phone before any test did. This runs LAST because it reloads
  // the page under ?renderer=3d, which forces CINEMA 3D on for the session
  // without persisting the toggle.
  //
  // Headless Chrome draws this through SwiftShader on the smoke's existing
  // flags (no --use-angle needed): measured ~242 draw calls / ~4,300 triangles
  // on the Somerset fight frame.
  //
  // CINEMA 3D refuses to activate on the battery profile (cinema3dAllowed), and
  // by this point in the run the mobile section has driven the quality governor
  // down to it and the fatality section has left reduced motion on. Both are
  // persisted preferences, so they survive the reload below — put the session
  // back on a profile that can actually draw a 3D frame first.
  await evaluate(client, `(() => {
    const reduced = document.querySelector('#reducedMotionToggle');
    reduced.checked = false;
    reduced.dispatchEvent(new Event('change', { bubbles: true }));
    window.__finalBlowQa.governorForget();
    return window.__finalBlowQa.quality('high');
  })()`);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, `${gameUrl}&renderer=3d`);
  await delay(1200);
  cinemaBoot = await evaluate(client, `(() => ({
    present: typeof window.__finalBlowThree,
    cinema3d: window.__finalBlowEngine.snapshot().cinema3d ?? null,
    performance: window.__finalBlowEngine.snapshot().performance,
    reduced: window.__finalBlowEngine.snapshot().accessibility.reducedMotion,
    controller: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
    active: window.__finalBlowThree ? window.__finalBlowThree.active : null,
    statsKeys: window.__finalBlowThree ? Object.keys(window.__finalBlowThree.stats()).sort() : null,
  }))()`);
  assert.equal(cinemaBoot.present, 'object', `?renderer=3d must boot CINEMA 3D and publish its QA surface (${JSON.stringify(cinemaBoot)})`);
  assert.equal(cinemaBoot.active, false, 'the world is idle on the title screen (isWorldActive)');
  // The stats() shape every later assertion (and the 5.1 #40 bank report) reads.
  for (const key of ['banks', 'crowd', 'drawcalls', 'fps', 'objectKinds', 'objects', 'programs', 'quality', 'scars', 'stage', 'tris']) {
    assert.ok(cinemaBoot.statsKeys.includes(key), `stats() must report ${key}, got ${cinemaBoot.statsKeys.join(', ')}`);
  }

  // (a) The host contract, checked against the LIVE bridge object rather than
  // the literal in game.js's source, which is all the unit test can see.
  cinemaHost = await evaluate(client, `window.__finalBlowThree.hostContract()`);
  assert.deepEqual(cinemaHost.required, [], 'the live CINEMA 3D host must carry every required member');
  assert.deepEqual(cinemaHost.optional, [], 'the live CINEMA 3D host must carry every optional member');
  assert.deepEqual(
    cinemaHost.members,
    [...CINEMA_HOST_REQUIRED, ...CINEMA_HOST_OPTIONAL],
    'renderer/three/host-contract.mjs and the running renderer must agree on the member list',
  );

  // (b) A fight renders: draw calls and triangles after real painted frames.
  await evaluate(client, `(() => {
    window.__finalBlowQa.stage('somerset');
    window.__finalBlowQa.fight('deathblow', 'jez');
    window.__finalBlowQa.positions(480, 800);
    window.__finalBlowQa.step(1);
    return true;
  })()`);
  await delay(700);
  cinemaFight = await evaluate(client, `(() => {
    const stats = window.__finalBlowThree.stats();
    return { active: window.__finalBlowThree.active, drawcalls: stats.drawcalls, tris: stats.tris, crowd: stats.crowd, programs: stats.programs, stage: stats.stage, quality: stats.quality, banksBuilt: stats.banks ? stats.banks.built : -1 };
  })()`);
  assert.equal(cinemaFight.active, true, 'the 3D world must be active on the fight screen');
  assert.ok(cinemaFight.drawcalls > 0, `a rendered fight must issue draw calls, saw ${cinemaFight.drawcalls}`);
  assert.ok(cinemaFight.tris > 0, `a rendered fight must draw triangles, saw ${cinemaFight.tris}`);
  assert.ok(cinemaFight.programs > 0, 'the renderer must have compiled its shader programs');
  assert.ok(cinemaFight.crowd > 0, '4.8 FRONT ROW: the painted crowd must reach the 3D frame');
  assert.ok(cinemaFight.banksBuilt > 0, 'the fighter layer must have built at least one sheet bank');
  assert.equal(cinemaFight.stage, 'somerset');

  // (c) world-objects: the 5.1 gameplay layer (#42). A forced stage weapon on
  // the floor and a live projectile both have to reach the 3D frame — they
  // were invisible in 3D until 5.1, which is the regression this pins.
  await evaluate(client, `(() => { window.__finalBlowQa.forceStageWeapon(640); window.__finalBlowQa.step(0.2); return true; })()`);
  cinemaWeapon = await peakOverFrames(
    `(() => { const stats = window.__finalBlowThree.stats(); return { objects: stats.objects, weapon: stats.objectKinds.weapon === 'ground' ? 1 : 0 }; })()`,
    10,
    40,
  );
  assert.ok(cinemaWeapon.objects >= 1, `the grounded stage weapon must be drawn in 3D, saw ${cinemaWeapon.objects}`);
  assert.equal(cinemaWeapon.weapon, 1, 'the weapon impostor must report the grounded phase');

  await evaluate(client, `(() => {
    window.__finalBlowQa.fight('donald', 'benny');
    window.__finalBlowQa.positions(200, 1180);
    window.__finalBlowQa.input(0, { commandSpecial: true });
    window.__finalBlowQa.step(0.25);
    return window.__finalBlowEngine.snapshot().projectiles.length;
  })()`);
  cinemaProjectile = await peakOverFrames(
    `(() => { const stats = window.__finalBlowThree.stats(); return { projectiles: stats.objectKinds.projectiles, objects: stats.objects }; })()`,
    12,
    40,
  );
  assert.ok(cinemaProjectile.projectiles >= 1, `a live projectile must be drawn in 3D, saw ${cinemaProjectile.projectiles}`);

  // (d) The artifact: a real screenshot of the 3D world, kept for the eye, and
  // measured so a black frame fails here instead of at the next release.
  await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
  await delay(120);
  cinemaShot = await captureArtifact('cinema-3d.png');
  assert.equal(cinemaShot.width, 1440);
  assert.equal(cinemaShot.height, 900);
  assert.ok(cinemaShot.mean > 8, `the 3D frame must not be black, mean luma ${cinemaShot.mean}`);
  assert.ok(cinemaShot.litFraction > 0.2, `most of the 3D frame must carry image, lit ${cinemaShot.litFraction}`);
});

probe('console-clean', async () => {
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(failedResponses, []);
    // Wave 9: missing voice banks must be probed at most once per file in each
    // loaded document. Reloads create fresh module state and therefore a fresh
    // cache, so the loader id is part of the identity checked here.
    assert.deepEqual(
      voiceProbe404s.filter((url, index) => voiceProbe404s.indexOf(url) !== index),
      [],
      "voice bank probes must never re-fetch a missing file",
    );
    // A 404 above is only acceptable for a take nobody has recorded yet — a
    // speculative -2/-3 slot or a reactive cue. A take Jez rejected is gone from
    // disk, so requesting one is a live reference to a deleted file, and the
    // permissive probe filter must not be what hides it.
    guardedTakes = [...REJECTED_PATHS, ...WITHHELD_CANDIDATE_PATHS];
    assert.deepEqual(
      [...new Set(voiceProbe404s.filter((entry) => guardedTakes.some((path) => entry.endsWith(path))))],
      [],
      "a rejected or withheld take was requested at runtime",
    );
});
// ---------------------------------------------------------------------------
// CLI. Parsed and the registry answered BEFORE anything is launched, so
// `node tests/browser-smoke.mjs --list` costs nothing.
//
//   --only=<name,...>   run only probes whose name equals or contains one
//   --skip=<name,...>   leave those probes out (applied after --only)
//   --report=<path>     write the JSON run report (probe timings + the
//                       measurements the summary below prints)
//   --artifacts=<dir>   where probes drop screenshots (default: os tmpdir)
//   --list              print the probe names in run order and exit
//
// Names are stable; add a probe at the end of the section it belongs to.
// ---------------------------------------------------------------------------
const cli = parseProbeArgs(process.argv.slice(2));
if (cli.unknown.length) {
  console.error(`Unknown argument(s): ${cli.unknown.join(" ")}`);
  console.error("Usage: node tests/browser-smoke.mjs [--only=a,b] [--skip=a,b] [--report=path] [--artifacts=dir] [--list]");
  process.exit(2);
}
if (cli.list) {
  for (const name of registry.names) console.log(name);
  process.exit(0);
}
const badPatterns = [
  ...unmatchedPatterns(registry.names, cli.only),
  ...unmatchedPatterns(registry.names, cli.skip),
];
if (badPatterns.length) {
  console.error(`No probe matches: ${badPatterns.join(", ")}`);
  console.error("Run --list to see the probe names.");
  process.exit(2);
}
const selected = selectProbes(registry.names, cli);
if (!selected.length) {
  console.error("The --only/--skip combination selected no probes.");
  process.exit(2);
}
const artifactDir = cli.artifacts || tmpdir();
// A filtered run does not carry the whole-suite guarantees: the summary
// measurements and the zero-console-error checks assume every probe ran.
const filtered = selected.length !== registry.names.length;


const server = await startStaticServer();
const serverAddress = server.address();
const gameUrl = `http://127.0.0.1:${serverAddress.port}/?debug=1`;
const userDataDir = await mkdtemp(join(tmpdir(), "final-blow-chrome-"));
const debugPortServer = createServer();
await new Promise((resolve) => debugPortServer.listen(0, "127.0.0.1", resolve));
const debugPort = debugPortServer.address().port;
await new Promise((resolve) => debugPortServer.close(resolve));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(gameUrl)}`, { method: "PUT" });
  assert.equal(targetResponse.ok, true, "Chrome target should open");
  target = await targetResponse.json();
  client = await CdpClient.connect(target.webSocketDebuggerUrl);

  runtimeErrors = [];
  failedResponses = [];
  voiceProbe404s = [];
  // Wave 9 voice plumbing: the game HEAD-probes announcer/fighter voice bank
  // files exactly once per bank per loaded document and skips missing takes silently.
  // A 404 on those canonical paths is the expected "bank not recorded yet"
  // answer, not a failure — but each URL may be probed AT MOST once, which is
  // asserted at the end of the run alongside the zero-error checks.
  isVoiceBankProbe = (url = "") => /\/assets\/audio\/(?:announcer|fighters)\/.+\.mp3$/.test(url);
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text);
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry.level !== "error") return;
    if (entry.source === "network" && isVoiceBankProbe(entry.url)) return;
    runtimeErrors.push(entry.text);
  });
  client.on("Network.responseReceived", ({ loaderId, response }) => {
    if (response.status < 400) return;
    if (response.status === 404 && isVoiceBankProbe(response.url)) {
      voiceProbe404s.push(`${loaderId}:${response.url}`);
      return;
    }
    failedResponses.push(`${response.status} ${response.url}`);
  });

  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Network.enable"),
  ]);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, gameUrl);
  // -------------------------------------------------------------------------
  // Run. Continue-on-failure: every selected probe runs, each failure is
  // recorded against its own name, and the exit code is set from the tally.
  // -------------------------------------------------------------------------
  const startedAt = Date.now();
  summary = await runProbes(registry.probes(), {
    selected,
    onResult: (result) => {
      if (result.status === "failed") {
        console.error(`FAIL ${result.name} (${result.durationMs} ms)`);
        console.error(String(result.error.stack || result.error.message).split("\n").map((line) => `      ${line}`).join("\n"));
      } else if (process.env.FINAL_BLOW_SMOKE_VERBOSE) {
        console.error(`ok   ${result.name} (${result.durationMs} ms)`);
      }
    },
  });
  summary.durationMs = Date.now() - startedAt;
  summary.filtered = filtered;
  summary.selected = selected;

  // -------------------------------------------------------------------------
  // Report. The measurement block is the 5.2 summary, unchanged; it now sits
  // behind a try so a filtered run (or a failed probe that never assigned its
  // value) still prints the probe tally instead of dying on an undefined read.
  // -------------------------------------------------------------------------
  const measurements = (() => {
    try {
      return {
      desktop: {
        simHz: title.simHz,
        rosterCards: title.rosterCards,
        keyboardAttackFrame: attack.fighters[0].attackFrame,
        gamepadAttackFrame: gamepadAttack.fighters[0].attackFrame,
        gamepadGuard: gamepadGuard.fighters[0].guardHeight,
        gamepadEnhanced: gamepadEnhanced.fighters[0].move,
        movement: {
          walked: Math.round(walking.fighters[0].x - movementStart.fighters[0].x),
          dashFrames: dash.fighters[0].dashFrames,
          backDashInvulnerability: backDash.fighters[0].invulnerableFrames,
          jumpY: Math.round(neutralJump.fighters[0].y),
          forwardJumpVx: Math.round(forwardJump.fighters[0].vx),
          backJumpVx: Math.round(backJump.fighters[0].vx),
          crossoverFacing: crossover.fighters[0].facing,
        },
        defense: {
          chipHealth: chipped.fighters[1].health,
          overheadVsLow: overheadVsLow.fighters[1].lastHitResult,
          lowVsHigh: lowVsHigh.fighters[1].lastHitResult,
          counter: counterHit.fighters[1].lastHitResult,
          throw: throwHit.fighters[1].lastHitResult,
          throwTech: throwTech.fighters[0].lastHitResult,
          reversal: reversal.fighters[1].lastHitResult,
        },
        combos: {
          commandSpecial: commandSpecial.fighters[0].move,
          launcher: launcher.fighters[0].move,
          enhancedCost: 50 - enhanced.fighters[0].meter,
          guardReversalCost: 50 - guardReversal.fighters[0].meter,
          chain: chained.fighters[0].cancelledFrom,
          hitConfirm: hitConfirm.fighters[0].move,
          link: linked.fighters[0].linkedFrom,
          hits: twoHitCombo.fighters[0].combo.hits,
          scaledDamage: twoHitCombo.fighters[0].combo.damage,
          superHits: gritSuper.fighters[0].combo.hits,
          superDamage: gritSuper.fighters[0].combo.damage,
        },
      },
      finisher: {
        elapsed: finisher.elapsed,
        impacts: finisher.impacts,
        zoom: finisherStart.camera.zoom,
        announcer: finisherStart.audio.lastEvent.src,
      },
      demo: {
        firstMatchup: demoOpening.demo.cycle.picks,
        cycles: demoMarathon.cycles.length,
        bothBrainsActive: [demoThinking.fighters[0].ai.decisions, demoThinking.fighters[1].ai.decisions],
        finalBlowElapsed: demoFinalBlow.status.elapsed,
        mobileHud: mobileDemo.hud,
      },
      mobile: {
        ...landscape,
        touchAttackFrame: touchAttack.fighters[0].attackFrame,
        touchGuard: touchGuard.fighters[0].guardHeight,
        touchEnhanced: touchEnhanced.fighters[0].move,
        touchSuper: touchSuper.fighters[0].move,
      },
      portrait,
      };
    } catch (error) {
      return { unavailable: `${error.message} (a probe was skipped or failed)` };
    }
  })();
  // 5.3 VERIFICATION HARNESS: the measurements that used to live only in a
  // markdown log. Built outside the block above so a filtered run still reports
  // whatever the probes it DID run measured.
  const spectacle = {
    ambientKoDelta: ambientDelta ?? null,
    ambientStageSurge: ambientStages ?? null,
    crowdKoHold: crowdKoHold
      ? { age: crowdKoHold.age, reaction: crowdKoHold.reaction, moods: crowdKoHold.moods, voice: crowdKoHold.voiceRecent.at(-1) ?? null }
      : null,
    tempo: tempoWhiff
      ? { whiffTells: tempoWhiff.whiffTells, strength: tempoWhiff.strength, rearmDrops: tempoDrop?.rearmDrops ?? null }
      : null,
    decision: announcerDecision?.over ?? null,
    poseChains: poseChains ?? null,
    cinema: cinemaFight ? { ...cinemaFight, hostContract: cinemaHost?.members.length ?? null, screenshot: cinemaShot ?? null } : null,
  };
  const report = {
    status: summary.status,
    probes: {
      ...summary.counts,
      failedNames: summary.failed,
      filtered,
      durationMs: summary.durationMs,
      results: summary.results.map(({ name, status, durationMs, error }) => ({
        name,
        status,
        durationMs,
        ...(error ? { error: error.message } : {}),
      })),
    },
    spectacle,
    ...measurements,
  };
  console.log(JSON.stringify(report, null, 2));
  if (cli.report) await writeFile(cli.report, `${JSON.stringify(report, null, 2)}\n`);
  if (summary.status === "failed") {
    console.error("");
    console.error(`${summary.counts.failed} of ${summary.counts.passed + summary.counts.failed} probes FAILED:`);
    for (const name of summary.failed) console.error(`  - ${name}`);
    console.error("Re-run one with: node tests/browser-smoke.mjs --only=<name>");
    process.exitCode = 1;
  }
} finally {
  client?.close();
  const chromeExit = chrome.exitCode === null ? once(chrome, "exit") : Promise.resolve();
  chrome.kill("SIGTERM");
  await Promise.race([chromeExit, delay(3000)]);
  await new Promise((resolve) => server.close(resolve));
  if (userDataDir.startsWith(join(tmpdir(), "final-blow-chrome-"))) {
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
