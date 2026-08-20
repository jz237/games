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
    engine: window.__finalBlowEngine?.snapshot(),
    simHz: window.__finalBlowEngine?.simulationHz,
  }))()`);
  assert.match(title.title, /Final Blow/);
  assert.match(title.build, /0\.7A/);
  assert.equal(title.rosterCards, 8);
  assert.equal(title.gritLabels, 2);
  assert.equal(title.comboReadouts, 2);
  assert.equal(title.simHz, 60);
  assert.ok(title.engine.tick > 0, "fixed simulation should be ticking");

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
  assert.ok(forwardJump.fighters[0].vx > 300, "forward jump should have its own fast arc");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyA", "a", 65);
  await dispatchKey(client, "keyDown", "KeyW", "w", 87);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const backJump = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyW", "w", 87);
  await dispatchKey(client, "keyUp", "KeyA", "a", 65);
  assert.ok(backJump.fighters[0].vx < -260, "back jump should have its own retreating arc");

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
  assert.equal(overhead.fighters[0].move, "overhead");
  assert.equal(overhead.fighters[0].attackLevel, "overhead");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez')`);
  await dispatchKey(client, "keyDown", "KeyS", "s", 83);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.08)`);
  const crouchLight = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  await dispatchKey(client, "keyUp", "KeyS", "s", 83);
  assert.equal(crouchLight.fighters[0].move, "crouch-light");
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

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
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

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
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
  assert.equal(reversal.fighters[1].move, "ground-special");
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
  assert.equal(commandSpecial.fighters[0].move, "command-special");

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
  assert.equal(launcher.fighters[0].move, "rising-launcher");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.fighter(0, { meter: 50 })`);
  await dispatchKey(client, "keyDown", "KeyK", "k", 75);
  await evaluate(client, `window.__finalBlowQa.step(0.0334)`);
  await dispatchKey(client, "keyDown", "KeyL", "l", 76);
  await evaluate(client, `window.__finalBlowQa.step(0.05)`);
  const enhanced = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyK", "k", 75);
  await dispatchKey(client, "keyUp", "KeyL", "l", 76);
  assert.equal(enhanced.fighters[0].move, "enhanced-special");
  assert.equal(enhanced.fighters[0].meter, 25);

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
  assert.equal(chained.fighters[0].move, "stand-heavy");
  assert.equal(chained.fighters[0].cancelledFrom, "stand-light");
  await evaluate(client, `window.__finalBlowQa.step(0.3)`);
  const twoHitCombo = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  assert.equal(twoHitCombo.fighters[0].combo.hits, 2);
  assert.ok(twoHitCombo.fighters[0].combo.damage < 18, "second hit should be damage-scaled");
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
  assert.equal(hitConfirm.fighters[0].move, "ground-special");
  assert.equal(hitConfirm.fighters[0].cancelledFrom, "stand-light");

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600)`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.1)`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.2834)`);
  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await evaluate(client, `window.__finalBlowQa.step(0.18)`);
  const linked = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyJ", "j", 74);
  assert.equal(linked.fighters[0].linkedFrom, "stand-light");
  assert.equal(linked.fighters[0].combo.hits, 2);

  await evaluate(client, `window.__finalBlowQa.fight('deathblow', 'jez'); window.__finalBlowQa.positions(500, 600); window.__finalBlowQa.fighter(0, { meter: 100 })`);
  assert.equal(await evaluate(client, `document.querySelector('.touch-final').classList.contains('super-ready')`), true);
  await dispatchKey(client, "keyDown", "KeyU", "u", 85);
  await evaluate(client, `window.__finalBlowQa.step(1.25)`);
  const gritSuper = await evaluate(client, `window.__finalBlowEngine.snapshot()`);
  await dispatchKey(client, "keyUp", "KeyU", "u", 85);
  assert.equal(gritSuper.fighters[0].meter, 0);
  assert.equal(gritSuper.fighters[0].combo.hits, 4);
  assert.ok(gritSuper.fighters[0].combo.damage > 20 && gritSuper.fighters[0].combo.damage < 32);
  assert.ok(gritSuper.fighters[1].juggleCount >= 2, "the super should exercise juggle scaling");

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
  await delay(120);
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
  assert.equal(gamepadEnhanced.fighters[0].move, "enhanced-special");
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
  assert.equal(touchEnhanced.fighters[0].move, "enhanced-special");
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
  assert.equal(touchSuper.fighters[0].move, "grit-super");
  assert.equal(touchSuper.fighters[0].meter, 0);

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
