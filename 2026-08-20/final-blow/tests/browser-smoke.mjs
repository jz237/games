import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
    engine: window.__finalBlowEngine?.snapshot(),
    simHz: window.__finalBlowEngine?.simulationHz,
  }))()`);
  assert.match(title.title, /Final Blow/);
  assert.match(title.build, /0\.6A/);
  assert.equal(title.rosterCards, 8);
  assert.equal(title.simHz, 60);
  assert.ok(title.engine.tick > 0, "fixed simulation should be ticking");

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

  await dispatchKey(client, "keyDown", "KeyJ", "j", 74);
  await delay(120);
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
    },
    finisher: { elapsed: finisher.elapsed, impacts: finisher.impacts },
    mobile: { ...landscape, touchAttackFrame: touchAttack.fighters[0].attackFrame },
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
