import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

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

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
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

let client;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(gameUrl)}`, { method: "PUT" });
  assert.equal(targetResponse.ok, true, "Chrome target should open");
  const target = await targetResponse.json();
  client = await CdpClient.connect(target.webSocketDebuggerUrl);

  const runtimeErrors = [];
  const failedResponses = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails.exception?.description || exceptionDetails.text);
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error") runtimeErrors.push(entry.text);
  });
  client.on("Network.responseReceived", ({ response }) => {
    if (response.status >= 400) failedResponses.push(`${response.status} ${response.url}`);
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

  const title = await evaluate(client, `(() => ({
    title: document.title,
    build: document.querySelector('.build-tag')?.textContent.trim(),
    rosterCards: document.querySelectorAll('.fighter-card').length,
    gritLabels: document.querySelectorAll('.grit-row').length,
    comboReadouts: document.querySelectorAll('.combo-readout').length,
    moveListRows: document.querySelectorAll('.move-list-row').length,
    aiDifficulties: [...document.querySelectorAll('#aiDifficultySelect option')].map((option) => option.value),
    aiDifficulty: document.querySelector('#aiDifficultySelect')?.value,
    engineVersion: window.__finalBlowEngine?.version,
    engine: window.__finalBlowEngine?.snapshot(),
    simHz: window.__finalBlowEngine?.simulationHz,
  }))()`);
  assert.match(title.title, /Final Blow/);
  assert.match(title.build, /0\.9A/);
  assert.equal(title.rosterCards, 8);
  assert.equal(title.gritLabels, 2);
  assert.equal(title.comboReadouts, 2);
  assert.equal(title.moveListRows, 9);
  assert.deepEqual(title.aiDifficulties, ['rookie', 'street', 'pro', 'final']);
  assert.equal(title.aiDifficulty, 'street');
  assert.equal(title.engineVersion, '0.9a-fair-ai');
  assert.equal(title.simHz, 60);
  assert.ok(title.engine.tick > 0, "fixed simulation should be ticking");

  const kitUi = await evaluate(client, `(async () => {
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
  assert.equal(kitUi.rows.length, 9);
  assert.ok(kitUi.rows.includes('Vinyl Step'));
  assert.match(kitUi.identity, /FOOTSIES/);

  const rookieAi = await evaluate(client, `(() => {
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

  const finalAi = await evaluate(client, `(() => {
    window.__finalBlowQa.aiFight('jez', 'cyraxx', 'final');
    window.__finalBlowQa.positions(460, 680);
    window.__finalBlowQa.step(0.8);
    return window.__finalBlowEngine.snapshot();
  })()`);
  assert.equal(finalAi.fighters[1].ai.reactionFrames, 6);
  assert.ok(finalAi.fighters[1].ai.decisions > rookieAi.snapshot.fighters[1].ai.decisions / 2);
  assert.ok(finalAi.fighters[1].ai.lastObservedFrame <= finalAi.tick - 6);

  const kitMoves = await evaluate(client, `(() => {
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

  const allanMoveList = await evaluate(client, `(() => {
    const select = document.querySelector('#moveListSelect');
    select.value = 'alan';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      identity: document.querySelector('#moveListIdentity').textContent,
      moves: [...document.querySelectorAll('.move-list-row b')].map((node) => node.textContent),
    };
  })()`);
  assert.match(allanMoveList.identity, /COUNTER-PUNCHER/);
  assert.ok(allanMoveList.moves.includes('Southpaw Counter'));

  await evaluate(client, `window.__finalBlowQa.fight('jez', 'alan'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(1, { backSpecial: true }); window.__finalBlowQa.step(0.05)`);
  await evaluate(client, `window.__finalBlowQa.input(0, { heavy: true }); window.__finalBlowQa.step(0.24)`);
  const southpawCounter = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
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

  await evaluate(client, `window.__finalBlowQa.fight('post', 'alan'); window.__finalBlowQa.positions(500, 850); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.18)`);
  const armedPaint = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(armedPaint.traps.length, 1, 'Wet Paint should deploy one persistent trap');
  assert.equal(armedPaint.traps[0].ownerSide, 0);
  assert.ok(armedPaint.traps[0].lifeFrames > 300, 'trap should persist after Post recovers');
  await evaluate(client, `window.__finalBlowQa.step(0.28); window.__finalBlowQa.positions(500, 612); window.__finalBlowQa.step(0.05)`);
  const sprungPaint = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(sprungPaint.traps.length, 0, 'trap should be consumed when the opponent enters it');
  assert.ok(sprungPaint.fighters[1].health < 100);
  assert.equal(sprungPaint.fighters[1].lastHitResult, 'paint-trap');

  await evaluate(client, `window.__finalBlowQa.fight('post', 'alan'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.fighter(0, { meter: 50 }); window.__finalBlowQa.input(0, { enhancedBackSpecial: true }); window.__finalBlowQa.step(0.14)`);
  const doublePaint = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(doublePaint.traps.length, 2, 'Wet Paint EX should deploy a two-trap lane');
  assert.ok(doublePaint.traps.every((trap) => trap.enhanced));
  if (process.env.FINAL_BLOW_FIGHT_SCREENSHOT) {
    await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
    await delay(80);
    const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.FINAL_BLOW_FIGHT_SCREENSHOT, Buffer.from(capture.data, "base64"));
  }

  const rushKeepAwayLists = await evaluate(client, `(() => {
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
  assert.ok(rushKeepAwayLists.benny.moves.includes('Benny Blitz'));
  assert.match(rushKeepAwayLists.donald.identity, /KEEP-AWAY/);
  assert.ok(rushKeepAwayLists.donald.moves.includes('Golden Shockwave'));

  await evaluate(client, `window.__finalBlowQa.fight('benny', 'donald'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(0, { special: true }); window.__finalBlowQa.step(0.52)`);
  await evaluate(client, `window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.05)`);
  const voltageCancel = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(voltageCancel.fighters[0].move, 'benny-blitz');
  assert.equal(voltageCancel.fighters[0].cancelledFrom, 'benny-static-snap');
  assert.ok(voltageCancel.fighters[0].combo.hits >= 2, 'Benny should retain the rush combo through his voltage cancel');

  await evaluate(client, `window.__finalBlowQa.fight('benny', 'donald'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.3)`);
  const liveWire = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(liveWire.fighters[0].move, 'benny-live-wire');
  assert.ok(liveWire.fighters[0].x > liveWire.fighters[1].x, 'Live Wire should phase through the opponent');
  if (process.env.FINAL_BLOW_RUSH_SCREENSHOT) {
    await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
    await delay(80);
    const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.FINAL_BLOW_RUSH_SCREENSHOT, Buffer.from(capture.data, "base64"));
  }

  await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.25)`);
  const goldenFlight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(goldenFlight.projectiles.length, 1, 'Golden Shockwave should create a persistent projectile');
  assert.ok(goldenFlight.projectiles[0].x > 430, 'projectile should travel independently after launch');
  await evaluate(client, `window.__finalBlowQa.positions(350, ${Math.round(goldenFlight.projectiles[0].x + 24)}); window.__finalBlowQa.step(0.06)`);
  const goldenHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(goldenHit.projectiles.length, 0, 'projectile should be consumed on hit');
  assert.ok(goldenHit.fighters[1].health < 100);
  assert.match(goldenHit.fighters[1].lastHitResult, /projectile/);

  await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(350, 650); window.__finalBlowQa.input(1, { guard: true }, 70); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.75)`);
  const blockedGolfBall = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(blockedGolfBall.fighters[1].health, 97, 'Golden Shockwave should deal three chip damage');
  assert.equal(blockedGolfBall.fighters[1].lastHitResult, 'blocked-mid-projectile');

  await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.fighter(0, { meter: 50 }); window.__finalBlowQa.input(0, { enhancedCommandSpecial: true }); window.__finalBlowQa.step(0.3)`);
  const doubleShockwave = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
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
  const executiveRetreat = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.ok(executiveRetreat.fighters[0].x < 530, 'Executive Retreat should create real backward space');
  assert.equal(executiveRetreat.projectiles.length, 1, 'Executive Retreat should leave a low chip shot behind');

  const finalKitLists = await evaluate(client, `(() => {
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
  assert.ok(finalKitLists.cyraxx.moves.includes('Feedback Loop'));
  assert.match(finalKitLists.ali.identity, /RHYTHM \/ MOMENTUM/);
  assert.ok(finalKitLists.ali.moves.includes('Massive Step'));

  await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.2)`);
  const feedbackTelegraph = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(feedbackTelegraph.projectiles.length, 1, 'Feedback Loop should plant a delayed echo');
  assert.equal(feedbackTelegraph.projectiles[0].style, 'feedback');
  assert.ok(feedbackTelegraph.projectiles[0].armFrames > 0, 'the echo must visibly telegraph before becoming active');
  assert.equal(Math.round(feedbackTelegraph.projectiles[0].x), 542);
  if (process.env.FINAL_BLOW_FEEDBACK_SCREENSHOT) {
    await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
    await delay(80);
    const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.FINAL_BLOW_FEEDBACK_SCREENSHOT, Buffer.from(capture.data, "base64"));
  }
  await evaluate(client, `window.__finalBlowQa.positions(350, 542); window.__finalBlowQa.step(0.52)`);
  const feedbackHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(feedbackHit.projectiles.length, 0, 'armed feedback should be consumed on contact');
  assert.equal(feedbackHit.fighters[1].lastHitResult, 'feedback-echo');
  assert.ok(feedbackHit.fighters[1].health < 100);

  await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(350, 920); window.__finalBlowQa.fighter(0, { meter: 50 }); window.__finalBlowQa.input(0, { enhancedCommandSpecial: true }); window.__finalBlowQa.step(0.27)`);
  const doubleFeedback = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(doubleFeedback.projectiles.length, 2, 'Feedback Loop EX should stagger two echoes');
  assert.ok(doubleFeedback.projectiles.every((projectile) => projectile.style === 'feedback' && projectile.enhanced));
  assert.notEqual(doubleFeedback.projectiles[0].armFrames, doubleFeedback.projectiles[1].armFrames);

  await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(500, 610); window.__finalBlowQa.input(0, { backSpecial: true }); window.__finalBlowQa.step(0.3)`);
  const bufferSkip = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(bufferSkip.fighters[0].move, 'cyraxx-buffer-skip');
  assert.ok(bufferSkip.fighters[0].x > bufferSkip.fighters[1].x, 'Buffer Skip should phase through the opponent');

  await evaluate(client, `window.__finalBlowQa.fight('ali', 'cyraxx'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(0, { light: true }); window.__finalBlowQa.step(0.16)`);
  const flowOne = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(flowOne.fighters[0].rhythmStacks, 1, 'one distinct hit should establish Flow');
  await evaluate(client, `window.__finalBlowQa.step(0.18); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(0, { heavy: true }); window.__finalBlowQa.step(0.3)`);
  const flowTwo = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(flowTwo.fighters[0].rhythmStacks, 2, 'a second attack on beat should advance Flow');
  await evaluate(client, `window.__finalBlowQa.step(0.28); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.input(0, { special: true }); window.__finalBlowQa.step(0.5)`);
  const massiveFlow = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(massiveFlow.fighters[0].rhythmStacks, 3, 'three distinct attacks should reach Massive Flow');
  if (process.env.FINAL_BLOW_FLOW_SCREENSHOT) {
    await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
    await delay(80);
    const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.FINAL_BLOW_FLOW_SCREENSHOT, Buffer.from(capture.data, "base64"));
    await evaluate(client, `window.__finalBlowEngine.toggleDebug(true)`);
  }
  await evaluate(client, `window.__finalBlowQa.input(0, { commandSpecial: true }); window.__finalBlowQa.step(0.084)`);
  const flowCancel = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(flowCancel.fighters[0].move, 'ali-massive-step');
  assert.equal(flowCancel.fighters[0].cancelledFrom, 'ali-booyakasha-beat');
  assert.equal(flowCancel.fighters[0].rhythmBoost, 3);
  await evaluate(client, `window.__finalBlowQa.step(2.2)`);
  const expiredFlow = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(expiredFlow.fighters[0].rhythmStacks, 0, 'Flow should expire when Ali falls off beat');

  await evaluate(client, `window.__finalBlowQa.fight('ali', 'cyraxx'); (() => { const tick = window.__finalBlowEngine.snapshot().tick; return window.__finalBlowQa.fighter(0, { rhythmStacks: 3, rhythmExpiresFrame: tick + 96 }); })()`);
  const flowWalkStart = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `window.__finalBlowQa.input(0, { right: true }, 12); window.__finalBlowQa.step(0.15)`);
  const flowWalk = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.ok(flowWalk.fighters[0].x - flowWalkStart.fighters[0].x > 55, 'Massive Flow should provide a real movement-speed bonus');

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  const movementStart = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await evaluate(client, `window.__finalBlowQa.step(0.1)`);
  const walking = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.ok(walking.fighters[0].x > movementStart.fighters[0].x + 20, "forward walk should move deliberately");

  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const crouchGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  assert.equal(crouchGuard.fighters[0].crouching, true);
  assert.equal(crouchGuard.fighters[0].guarding, true);
  assert.equal(crouchGuard.fighters[0].guardHeight, "low");

  await dispatchKey(client, "keyDown", "KeyW", "w", 87);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const neutralJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyW", "w", 87);
  assert.equal(neutralJump.fighters[0].grounded, false);
  assert.ok(neutralJump.fighters[0].y < 600);

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyW", "w", 87);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const forwardJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyW", "w", 87);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.ok(forwardJump.fighters[0].vx > 270, "DeathBlow should use his own forward jump arc");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyA", "a", 65);
  await dispatchKey(client, "keyDown", "KeyW", "w", 87);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const backJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyW", "w", 87);
  await dispatchKey(client, "keyUp", "KeyA", "a", 65);
  assert.ok(backJump.fighters[0].vx < -230, "DeathBlow should use his own retreating jump arc");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 650)`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyW", "w", 87);
  await evaluate(client, `window.__finalBlowQa.step(0.55)`);
  const crossover = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyW", "w", 87);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.ok(crossover.fighters[0].x > crossover.fighters[1].x, "airborne fighters should be able to cross over");
  assert.equal(crossover.fighters[0].facing, -1, "facing should flip after a cross-up");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const dash = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.ok(dash.fighters[0].dashFrames > 0, "double tap should create a forward dash");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyA", "a", 65);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyUp", "KeyA", "a", 65);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyDown", "KeyA", "a", 65);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  const backDash = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyA", "a", 65);
  assert.equal(backDash.fighters[0].dashDirection, -1);
  assert.ok(backDash.fighters[0].invulnerableFrames > 0, "backdash startup should be invulnerable");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.1)`);
  const overhead = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.equal(overhead.fighters[0].move, "deathblow-demolition-drop");
  assert.equal(overhead.fighters[0].attackLevel, "overhead");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.08)`);
  const forwardLight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.equal(forwardLight.fighters[0].move, "deathblow-body-check");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.08)`);
  const crouchLight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
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
  const airHeavy = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  assert.equal(airHeavy.fighters[0].move, "air-heavy");
  assert.equal(airHeavy.fighters[0].attackLevel, "air");

  await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "Numpad5", "5", 101);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.45)`);
  const chipped = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  await dispatchKey(client, "keyUp", "Numpad5", "5", 101);
  assert.equal(chipped.fighters[1].lastHitResult, "blocked-mid");
  assert.equal(chipped.fighters[1].health, 97, "blocked special should deal configured chip damage");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "ArrowDown", "ArrowDown", 40);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.5)`);
  const overheadVsLow = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  await dispatchKey(client, "keyUp", "ArrowDown", "ArrowDown", 40);
  assert.equal(overheadVsLow.fighters[1].lastHitResult, "overhead", "low guard must lose to overheads");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "Numpad5", "5", 101);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.45)`);
  const lowVsHigh = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  await dispatchKey(client, "keyUp", "Numpad5", "5", 101);
  assert.equal(lowVsHigh.fighters[1].lastHitResult, "low", "standing guard must lose to lows");

  await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600)`);
  await evaluate(client, `window.__finalBlowQa.input(1, { heavy: true })`);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await evaluate(client, `window.__finalBlowQa.input(0, { light: true })`);
  await evaluate(client, `window.__finalBlowQa.step(0.25)`);
  const counterHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(counterHit.fighters[1].lastHitResult, "counter");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 585)`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.16)`);
  const throwHit = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  assert.equal(throwHit.fighters[1].lastHitResult, "throw");
  assert.ok(throwHit.fighters[1].pendingKnockdown || throwHit.fighters[1].down);

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 585)`);
  await evaluate(client, `window.__finalBlowQa.input(0, { throw: true }); window.__finalBlowQa.input(1, { throw: true })`);
  await evaluate(client, `window.__finalBlowQa.step(0.14)`);
  const throwTech = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(throwTech.fighters[0].lastHitResult, "throw-tech");
  assert.equal(throwTech.fighters[1].lastHitResult, "throw-tech");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.7)`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  const knockdown = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.ok(knockdown.fighters[1].down || knockdown.fighters[1].pendingKnockdown || knockdown.fighters[1].knockdownFrames > 0);
  await evaluate(client, `(() => {
    for (let frame = 0; frame < 180; frame += 1) {
      const fighter = window.__finalBlowEngine.snapshot().fighters[1];
      if (!fighter.down && fighter.wakeupFrames > 0 && fighter.wakeupFrames <= 3) return fighter.wakeupFrames;
      window.__finalBlowQa.step(1 / 60);
    }
    throw new Error('wakeup window not reached');
  })()`);
  await dispatchKey(client, "keyDown", "Numpad3", "3", 99);
  await evaluate(client, `window.__finalBlowQa.step(0.08)`);
  const reversal = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "Numpad3", "3", 99);
  assert.equal(reversal.fighters[1].move, "jez-neon-edge");
  assert.equal(reversal.fighters[1].lastHitResult, "reversal");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  await evaluate(client, `window.__finalBlowQa.step(0.0167)`);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const commandSpecial = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.equal(commandSpecial.fighters[0].move, "deathblow-faultline-fist");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 585)`);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  await dispatchKey(client, "keyDown", "KeyA", "a", 65);
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.08)`);
  const aftershockGrab = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
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
  const seismicArmor = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(seismicArmor.fighters[1].lastHitResult, "armor");
  assert.equal(seismicArmor.fighters[1].move, "deathblow-tremor-tap");

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
  const launcher = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.equal(launcher.fighters[0].move, "deathblow-quarry-breaker");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 })`);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const enhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  assert.equal(enhanced.fighters[0].move, "deathblow-ex-tremor-tap");
  assert.equal(enhanced.fighters[0].meter, 25);

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 })`);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  await dispatchKey(client, "keyDown", "KeyD", "d", 68);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const enhancedFaultline = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyD", "d", 68);
  assert.equal(enhancedFaultline.fighters[0].move, "deathblow-ex-faultline-fist");
  assert.equal(enhancedFaultline.fighters[0].meter, 25);

  await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 670); window.__finalBlowQa.input(0, { backSpecial: true })`);
  await evaluate(client, `window.__finalBlowQa.step(0.12)`);
  const vinylStep = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
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
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const guardReversal = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  assert.equal(guardReversal.fighters[0].move, "guard-reversal");
  assert.equal(guardReversal.fighters[0].meter, 20);
  assert.equal(guardReversal.fighters[0].lastHitResult, "guard-reversal");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.12)`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.2)`);
  const chained = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  assert.equal(chained.fighters[0].move, "deathblow-wrecking-hook");
  assert.equal(chained.fighters[0].cancelledFrom, "deathblow-hammer-jab");
  await evaluate(client, `window.__finalBlowQa.step(0.3)`);
  const twoHitCombo = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
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
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.2)`);
  const hitConfirm = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  assert.equal(hitConfirm.fighters[0].move, "deathblow-tremor-tap");
  assert.equal(hitConfirm.fighters[0].cancelledFrom, "deathblow-hammer-jab");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.1)`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.2834)`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.18)`);
  const linked = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  assert.equal(linked.fighters[0].linkedFrom, "deathblow-hammer-jab");
  assert.equal(linked.fighters[0].combo.hits, 2);

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 })`);
  assert.equal(await evaluate(client, `document.querySelector('.touch-final').classList.contains('super-ready')`), true);
  await dispatchKey(client, "keyDown", "KeyU", "u", 85);
  await evaluate(client, `window.__finalBlowQa.step(1.25)`);
  const gritSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyU", "u", 85);
  assert.equal(gritSuper.fighters[0].meter, 0);
  assert.equal(gritSuper.fighters[0].combo.hits, 4);
  assert.ok(gritSuper.fighters[0].combo.damage > 28 && gritSuper.fighters[0].combo.damage < 36);
  assert.ok(gritSuper.fighters[1].juggleCount >= 2, "the super should exercise juggle scaling");

  await evaluate(client, `window.__finalBlowQa.fight('jez', 'deathblow'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.4)`);
  const jezSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(jezSuper.fighters[0].move, null);
  assert.equal(jezSuper.fighters[0].combo.hits, 7);
  assert.ok(jezSuper.fighters[0].combo.damage > 20 && jezSuper.fighters[0].combo.damage < 30);

  await evaluate(client, `window.__finalBlowQa.fight('alan', 'post'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.4)`);
  const allanSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(allanSuper.fighters[0].combo.hits, 6);
  assert.ok(allanSuper.fighters[0].combo.damage > 27 && allanSuper.fighters[0].combo.damage < 33);

  await evaluate(client, `window.__finalBlowQa.fight('post', 'alan'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.4)`);
  const postSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(postSuper.fighters[0].combo.hits, 7);
  assert.ok(postSuper.fighters[0].combo.damage > 24 && postSuper.fighters[0].combo.damage < 31);

  await evaluate(client, `window.__finalBlowQa.fight('benny', 'donald'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.4)`);
  const bennySuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(bennySuper.fighters[0].combo.hits, 8);
  assert.ok(bennySuper.fighters[0].combo.damage > 21 && bennySuper.fighters[0].combo.damage < 26);

  await evaluate(client, `window.__finalBlowQa.fight('donald', 'benny'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.5)`);
  const donaldSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(donaldSuper.fighters[0].combo.hits, 9);
  assert.ok(donaldSuper.fighters[0].combo.damage > 20 && donaldSuper.fighters[0].combo.damage < 25);

  await evaluate(client, `window.__finalBlowQa.fight('cyraxx', 'ali'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.4)`);
  const cyraxxSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(cyraxxSuper.fighters[0].combo.hits, 7);
  assert.ok(cyraxxSuper.fighters[0].combo.damage > 18 && cyraxxSuper.fighters[0].combo.damage < 28);

  await evaluate(client, `window.__finalBlowQa.fight('ali', 'cyraxx'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 }); window.__finalBlowQa.input(0, { super: true }); window.__finalBlowQa.step(2.4)`);
  const aliSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(aliSuper.fighters[0].combo.hits, 8);
  assert.ok(aliSuper.fighters[0].combo.damage > 18 && aliSuper.fighters[0].combo.damage < 28);

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
  const started = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(started.screen, "fight");
  assert.equal(started.phase, "fight");
  assert.equal(started.fighters.length, 2);
  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);

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
  const gamepadAttack = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    window.__qaPad.buttons[2] = { pressed: false, value: 0 };
    return true;
  })()`);
  assert.equal(gamepadAttack.fighters[0].attack, "light");
  assert.equal(gamepadAttack.fighters[0].state, "attack");
  await evaluate(client, `window.__finalBlowQa.step(0.5)`);
  await evaluate(client, `(() => {
    window.__qaPad.buttons[1] = { pressed: true, value: 1 };
    return true;
  })()`);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const gamepadGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    window.__qaPad.buttons[1] = { pressed: false, value: 0 };
    return true;
  })()`);
  assert.equal(gamepadGuard.fighters[0].guarding, true);
  assert.equal(gamepadGuard.fighters[0].guardHeight, "high");
  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 }); (() => {
    window.__qaPad.buttons[3] = { pressed: true, value: 1 };
    window.__qaPad.buttons[4] = { pressed: true, value: 1 };
    return true;
  })()`);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const gamepadEnhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    window.__qaPad.buttons[3] = { pressed: false, value: 0 };
    window.__qaPad.buttons[4] = { pressed: false, value: 0 };
    return true;
  })()`);
  assert.equal(gamepadEnhanced.fighters[0].move, "deathblow-ex-tremor-tap");
  assert.equal(gamepadEnhanced.fighters[0].meter, 25);

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.12)`);
  const attack = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  assert.equal(attack.fighters[0].attack, "light");
  assert.equal(attack.fighters[0].state, "attack");
  assert.ok(attack.fighters[0].attackFrame > 0);

  await evaluate(client, `window.__finalBlowQa.ready('deathblow', 0)`);
  await dispatchKey(client, "keyDown", "KeyU", "u", 85);
  await delay(100);
  await dispatchKey(client, "keyUp", "KeyU", "u", 85);
  await evaluate(client, `window.__finalBlowQa.step(1.25)`);
  const finisher = await evaluate(client, `window.__finalBlowQa.status()`);
  assert.equal(finisher.fighter, "deathblow");
  assert.ok(finisher.elapsed > 1);
  assert.ok(finisher.impacts >= 2);
  assert.equal(finisher.simulationHz, 60);

  const deathblowVictory = await evaluate(client, `window.__finalBlowQa.result('deathblow')`);
  assert.equal(deathblowVictory.title, "DEATHBLOW WINS");
  assert.equal(deathblowVictory.quote, "THE STREET MOVED FIRST.");
  assert.match(deathblowVictory.background, /deathblow-specials\.webp/);
  const jezVictory = await evaluate(client, `window.__finalBlowQa.result('jez')`);
  assert.equal(jezVictory.title, "JEZ WINS");
  assert.equal(jezVictory.quote, "READ THE SIGN.");
  assert.match(jezVictory.background, /jez-specials\.webp/);
  const allanVictory = await evaluate(client, `window.__finalBlowQa.result('alan')`);
  assert.equal(allanVictory.title, "ALLAN WINS");
  assert.equal(allanVictory.quote, "SIX SHOTS. ONE ANSWER.");
  assert.match(allanVictory.background, /alan-specials\.webp/);
  const postVictory = await evaluate(client, `window.__finalBlowQa.result('post')`);
  assert.equal(postVictory.title, "POST WINS");
  assert.equal(postVictory.quote, "THE WHOLE CITY IS MY WALL.");
  assert.match(postVictory.background, /post-specials\.webp/);
  const bennyVictory = await evaluate(client, `window.__finalBlowQa.result('benny')`);
  assert.equal(bennyVictory.title, "BENNY WINS");
  assert.equal(bennyVictory.quote, "CURRENT STAYS WITH ME.");
  assert.match(bennyVictory.background, /benny-specials\.webp/);
  const donaldVictory = await evaluate(client, `window.__finalBlowQa.result('donald')`);
  assert.equal(donaldVictory.title, "DONALD TRUMP WINS");
  assert.equal(donaldVictory.quote, "NINE HOLES. NO MERCY.");
  assert.match(donaldVictory.background, /donald-specials\.webp/);
  const cyraxxVictory = await evaluate(client, `window.__finalBlowQa.result('cyraxx')`);
  assert.equal(cyraxxVictory.title, "CYRAXX WINS");
  assert.equal(cyraxxVictory.quote, "THE ECHO GETS THE LAST WORD.");
  assert.match(cyraxxVictory.background, /cyraxx-specials\.webp/);
  const aliVictory = await evaluate(client, `window.__finalBlowQa.result('ali')`);
  assert.equal(aliVictory.title, "ALI G WINS");
  assert.equal(aliVictory.quote, "KEEP IT MASSIVE.");
  assert.match(aliVictory.background, /ali-specials\.webp/);
  if (process.env.FINAL_BLOW_VICTORY_SCREENSHOT) {
    await evaluate(client, `window.__finalBlowEngine.toggleDebug(false)`);
    await delay(80);
    const capture = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(process.env.FINAL_BLOW_VICTORY_SCREENSHOT, Buffer.from(capture.data, "base64"));
  }

  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await reload(client);
  const landscape = await evaluate(client, `(() => {
    const frame = document.querySelector('#gameFrame').getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      touchPoints: navigator.maxTouchPoints,
      coarse: matchMedia('(pointer: coarse)').matches,
      mobileLandscape: document.body.classList.contains('mobile-landscape'),
      orientationBlocked: document.body.classList.contains('orientation-blocked'),
      frameWidth: frame.width,
      frameHeight: frame.height,
    };
  })()`);
  assert.equal(landscape.width, 844);
  assert.equal(landscape.height, 390);
  assert.ok(landscape.touchPoints > 0);
  assert.equal(landscape.mobileLandscape, true);
  assert.equal(landscape.orientationBlocked, false);
  assert.ok(landscape.frameWidth >= 840 && landscape.frameHeight >= 385);

  await evaluate(client, `(() => {
    document.querySelector('[data-mode="arcade"]').click();
    document.querySelectorAll('.fighter-card')[0].click();
    document.querySelector('#fighterContinue').click();
    document.querySelector('#fightButton').click();
    return true;
  })()`);
  await evaluate(client, `window.__finalBlowQa.step(2.5)`);
  await evaluate(client, `(() => {
    const button = document.querySelector('[data-touch="light"]');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    return true;
  })()`);
  await delay(120);
  const touchAttack = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    const button = document.querySelector('[data-touch="light"]');
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    return true;
  })()`);
  assert.equal(touchAttack.fighters[0].attack, "light");
  assert.equal(touchAttack.fighters[0].state, "attack");
  await evaluate(client, `window.__finalBlowQa.step(0.5)`);
  await evaluate(client, `(() => {
    const button = document.querySelector('[data-touch="down"]');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    return true;
  })()`);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const touchGuard = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    const button = document.querySelector('[data-touch="down"]');
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    return true;
  })()`);
  assert.equal(touchGuard.fighters[0].guarding, true);
  assert.equal(touchGuard.fighters[0].guardHeight, "low");
  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 }); (() => {
    for (const action of ['heavy', 'special']) {
      document.querySelector('[data-touch="' + action + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    }
    return true;
  })()`);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const touchEnhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    for (const action of ['heavy', 'special']) {
      document.querySelector('[data-touch="' + action + '"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    }
    return true;
  })()`);
  assert.equal(touchEnhanced.fighters[0].move, "deathblow-ex-tremor-tap");
  assert.equal(touchEnhanced.fighters[0].meter, 25);
  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 100 }); (() => {
    document.querySelector('[data-touch="final"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    return true;
  })()`);
  await evaluate(client, `window.__finalBlowQa.step(0.1)`);
  const touchSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await evaluate(client, `(() => {
    document.querySelector('[data-touch="final"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    return true;
  })()`);
  assert.equal(touchSuper.fighters[0].move, "deathblow-epicenter-execution");
  assert.equal(touchSuper.fighters[0].meter, 0);

  const mobileVictory = await evaluate(client, `(() => {
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

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await reload(client);
  const portrait = await evaluate(client, `(() => ({
    blocked: document.body.classList.contains('orientation-blocked'),
    gateVisible: getComputedStyle(document.querySelector('#rotateGate')).display !== 'none',
  }))()`);
  assert.equal(portrait.blocked, true);
  assert.equal(portrait.gateVisible, true);

  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(failedResponses, []);
  console.log(JSON.stringify({
    status: "passed",
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
    finisher: { elapsed: finisher.elapsed, impacts: finisher.impacts },
    mobile: {
      ...landscape,
      touchAttackFrame: touchAttack.fighters[0].attackFrame,
      touchGuard: touchGuard.fighters[0].guardHeight,
      touchEnhanced: touchEnhanced.fighters[0].move,
      touchSuper: touchSuper.fighters[0].move,
    },
    portrait,
  }, null, 2));
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
