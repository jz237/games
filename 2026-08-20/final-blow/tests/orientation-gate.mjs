// Portrait-gate capability regressions. The gate must never present a dead
// ENTER FULLSCREEN button: iOS has no element fullscreen, and in-app browsers
// (Discord's WKWebView is the reported trap) also pin the webview to portrait,
// so the gate has to detect the environment and show usable guidance instead.
//
//   node tests/orientation-gate.mjs
//
// GAME_ROOT can point the served tree at any checkout. Running this file
// against a pre-1.9D build fails scenario 2 (dead button shown to a
// Discord-like iPhone) and scenario 3 (a rejected fullscreen request changes
// nothing) — that is the negative control proving these tests catch the old
// silent-failure behaviour.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const gameRoot = normalize(process.env.GAME_ROOT || join(testDir, ".."));
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  constructor(socket, sessionId = null) {
    this.socket = socket;
    this.sessionId = sessionId;
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
    if (message.sessionId && message.sessionId !== this.sessionId) return;
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
      const payload = { id, method, params };
      if (this.sessionId) payload.sessionId = this.sessionId;
      this.socket.send(JSON.stringify(payload));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      this.on(method, (params) => {
        clearTimeout(timer);
        resolve(params);
      });
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

async function evaluate(page, expression) {
  const response = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

async function navigate(page, url) {
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url });
  await loaded;
  await delay(400);
}

const PHONE_PORTRAIT = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };
const PHONE_LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 1, mobile: true };
const DESKTOP = { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false };

const DISCORD_IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15"
  + " (KHTML, like Gecko) Mobile/15E148 Discord/247.0";

const GATE_PROBE = `(() => {
  const gate = document.querySelector('#rotateGate');
  const hint = document.querySelector('#rotateGateHint') || gate.querySelector('span');
  const fullscreenButton = document.querySelector('#fullscreenButton');
  const copyButton = document.querySelector('#copyGameLinkButton');
  return {
    blocked: document.body.classList.contains('orientation-blocked'),
    gateVisible: getComputedStyle(gate).display !== 'none',
    hint: hint ? hint.textContent : '',
    fullscreenButtonVisible: Boolean(fullscreenButton) && !fullscreenButton.hidden
      && getComputedStyle(fullscreenButton).display !== 'none',
    copyButtonVisible: Boolean(copyButton) && !copyButton.hidden,
  };
})()`;

async function openScenario(page, { metrics, userAgent = null, bootstrap = null }) {
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  if (userAgent) await page.send("Emulation.setUserAgentOverride", { userAgent });
  if (bootstrap) await page.send("Page.addScriptToEvaluateOnNewDocument", { source: bootstrap });
  await page.send("Emulation.setDeviceMetricsOverride", metrics);
  await navigate(page, gameUrl);
}

const server = await startStaticServer();
const gameUrl = `http://127.0.0.1:${server.address().port}/`;
const userDataDir = await mkdtemp(join(tmpdir(), "final-blow-gate-"));
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const debugPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--mute-audio",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let browser;
try {
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  browser = await CdpClient.connect(version.webSocketDebuggerUrl);

  const newPage = async () => {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new CdpClient(browser.socket, sessionId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    return { page, targetId };
  };
  const closePage = (targetId) => browser.send("Target.closeTarget", { targetId });

  // ------------------------------------------------------------------
  // 1. Supported phone portrait: the immersive action is retained.
  // ------------------------------------------------------------------
  {
    const { page, targetId } = await newPage();
    await openScenario(page, { metrics: PHONE_PORTRAIT });
    const gate = await evaluate(page, GATE_PROBE);
    assert.equal(gate.blocked, true, "supported portrait phone must be gated");
    assert.equal(gate.gateVisible, true);
    assert.equal(gate.fullscreenButtonVisible, true, "a capable browser keeps ENTER FULLSCREEN");
    assert.equal(gate.copyButtonVisible, false);
    await closePage(targetId);
    console.log("1. supported portrait keeps the immersive action: ok");
  }

  // ------------------------------------------------------------------
  // 2. Discord-on-iPhone-like environment: no fullscreen API, no
  //    orientation lock, Discord UA. The gate must choose the fallback by
  //    itself — no dead button, actionable copy instead.
  // ------------------------------------------------------------------
  {
    const { page, targetId } = await newPage();
    await openScenario(page, {
      metrics: PHONE_PORTRAIT,
      userAgent: DISCORD_IOS_UA,
      bootstrap: `
        delete Element.prototype.requestFullscreen;
        delete Element.prototype.webkitRequestFullscreen;
        Object.defineProperty(document, 'fullscreenEnabled', { get: () => false });
        if (screen.orientation) delete screen.orientation.lock;
      `,
    });
    const gate = await evaluate(page, GATE_PROBE);
    assert.equal(gate.blocked, true);
    assert.equal(gate.gateVisible, true);
    assert.equal(
      gate.fullscreenButtonVisible, false,
      "an environment with no fullscreen capability must never show ENTER FULLSCREEN",
    );
    assert.match(gate.hint, /Discord/i, "the copy should name the detected container");
    assert.match(gate.hint, /Open in Safari/i, "the copy must route the user to a real browser");
    assert.equal(gate.copyButtonVisible, true, "the fallback must offer a usable control");
    await closePage(targetId);
    console.log("2. Discord-like iPhone auto-selects the fallback: ok");
  }

  // ------------------------------------------------------------------
  // 3. Capable-looking browser whose fullscreen request rejects at runtime:
  //    the click must flip the gate to the fallback and say why.
  // ------------------------------------------------------------------
  {
    const { page, targetId } = await newPage();
    await openScenario(page, {
      metrics: PHONE_PORTRAIT,
      bootstrap: `
        Element.prototype.requestFullscreen = function requestFullscreen() {
          return Promise.reject(new DOMException('Fullscreen request denied', 'NotAllowedError'));
        };
      `,
    });
    const before = await evaluate(page, GATE_PROBE);
    assert.equal(before.fullscreenButtonVisible, true, "the API looks available, so the button shows first");
    await evaluate(page, "document.querySelector('#fullscreenButton').click()");
    await delay(150);
    const after = await evaluate(page, GATE_PROBE);
    assert.equal(after.blocked, true, "the gate itself stays until landscape");
    assert.equal(
      after.fullscreenButtonVisible, false,
      "a rejected fullscreen request must retire the button instead of failing silently",
    );
    assert.match(after.hint, /NotAllowedError|blocked/i, "the reason must reach user-facing copy");
    // Landscape still clears the gate from the failed state.
    await page.send("Emulation.setDeviceMetricsOverride", PHONE_LANDSCAPE);
    await delay(200);
    const rotated = await evaluate(page, GATE_PROBE);
    assert.equal(rotated.blocked, false, "rotating to landscape must clear a failed gate");
    await closePage(targetId);
    console.log("3. runtime rejection flips the gate and landscape clears it: ok");
  }

  // ------------------------------------------------------------------
  // 4. Rotating the Discord-like fallback to landscape also clears it.
  // ------------------------------------------------------------------
  {
    const { page, targetId } = await newPage();
    await openScenario(page, {
      metrics: PHONE_PORTRAIT,
      userAgent: DISCORD_IOS_UA,
      bootstrap: "delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;",
    });
    assert.equal((await evaluate(page, GATE_PROBE)).blocked, true);
    await page.send("Emulation.setDeviceMetricsOverride", PHONE_LANDSCAPE);
    await delay(200);
    const rotated = await evaluate(page, GATE_PROBE);
    assert.equal(rotated.blocked, false, "landscape must clear the in-app fallback gate");
    assert.equal(
      await evaluate(page, "document.body.classList.contains('mobile-landscape')"),
      true,
      "landscape phone chrome must engage as usual",
    );
    await closePage(targetId);
    console.log("4. landscape clears the in-app fallback: ok");
  }

  // ------------------------------------------------------------------
  // 5. Desktop: no gate, regardless of orientation or capability.
  // ------------------------------------------------------------------
  {
    const { page, targetId } = await newPage();
    await page.send("Emulation.setDeviceMetricsOverride", DESKTOP);
    await navigate(page, gameUrl);
    const gate = await evaluate(page, GATE_PROBE);
    assert.equal(gate.blocked, false, "desktop must never be gated");
    assert.equal(gate.gateVisible, false);
    await closePage(targetId);
    console.log("5. desktop unchanged: ok");
  }

  console.log(JSON.stringify({ status: "passed", gameRoot }));
} finally {
  browser?.close();
  chrome.kill("SIGKILL");
  server.close();
}
