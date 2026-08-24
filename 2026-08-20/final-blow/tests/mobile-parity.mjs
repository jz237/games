// 1.9E mobile-parity regressions, driven in a real headless Chrome:
//
//   1. Atlas-facing guard — the ATLAS_FACING metadata must match this test's
//      recorded expectations, the SHIPPED ART must match recorded perceptual
//      hashes (silently re-exported sheets force a human re-verification of
//      the mapping), and the renderer's effective per-side mirror — numeric
//      facing × authored facing, read from the QA probe — must flip post's
//      left-authored idle toward his opponent. Numeric-facing-only checks
//      cannot catch this class of bug, which is exactly how it shipped.
//   2. Scanline containment — the .game-frame::before scanline overlay must
//      sit above the canvas but below every DOM lettering layer.
//   3. Performance parity — a capable phone earns the same high profile and
//      native-DPI backing store as a desktop; low-end, data-saver and
//      reduced-motion devices keep their safe degraded profiles.
//
//   node tests/mobile-parity.mjs
//
// GAME_ROOT points the served tree at any checkout — run against a pre-1.9E
// build as the negative control: the facing probe reports no correction, the
// scanline overlay sits above the text layers, and the capable phone is
// forced to balanced/1x (the three reported bugs).
//
// GENERATE_BASELINES=1 prints the atlas hash table (for pasting into
// ATLAS_HASH_BASELINES) instead of asserting — rerun it whenever fighter
// sheets are legitimately re-authored, then re-verify facings by eye.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const gameRoot = normalize(process.env.GAME_ROOT || join(testDir, ".."));
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
const generateBaselines = process.env.GENERATE_BASELINES === "1";
const evidenceDir = process.env.EVIDENCE_DIR || "";
// SKIP=1a,1b,2 lets a negative-control run reach the later sections on a
// build where an earlier one is guaranteed to fail (e.g. pre-1.9E has no
// atlas-facing module at all, which would otherwise stop the run at 1b).
const skipSections = new Set((process.env.SKIP || "").split(",").map((token) => token.trim()).filter(Boolean));

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

// The facing table this build must ship (mirrors engine/atlas-facing.mjs —
// duplicated here on purpose: the test is the second, independent record).
const EXPECTED_POST_BASE = [-1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, -1, -1, -1, 1, -1];
const EXPECTED_POST_SPECIALS = [1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 1, 1, -1];

// 8x8 luminance aHashes of the shipped sheets, recorded when the facing
// table was authored. Hamming distance ≤ HASH_TOLERANCE counts as unchanged.
const HASH_TOLERANCE = 6;
const ATLAS_HASH_BASELINES = {
  "post:base": [
    "0000100000011100001111100001111000011100001111000010010000000000",
    "0000100000011100001111000001110000011100001111000010010000000000",
    "0000100000011100001111100001110000111100001111000010010000000100",
    "0001100000011100001111000001110000111100001111000010010000000000",
    "0001000000011100000111000011110000011100001111000010010000100000",
    "0001000000011100001111000011110000011100001111000010011000000000",
    "0001000000111100001111000011110000011100001111000010010000100000",
    "0011000000111000001111000011110000111100001111000010010000100000",
    "0001000000011110001111100001111000111100001001100100001000000000",
    "0010000001111110011110000011100001111000011011000100011000000000",
    "0001000000111110001111000001100000111100011011100100011000000000",
    "0001000000111100001111100001111000111110001011000010011000000010",
    "0000000001111000011111000111110001111100010011100100001000000000",
    "0000000001110000011111000001111000111110011111000110111000000000",
    "0000000000000000001111101111111001111100011110000100110000000000",
    "0000000000111000001111000111111001111100001011100010001000000000",
  ],
  "post:specials": [
    "0000000000111000011110000011110000111000011110000010110000000100",
    "0000000000111100011111000110000001110000110100001001000100000001",
    "0000000001100111011111110110000011100000111100001001000000000000",
    "0000000010011000110111000011111000011100001111000010011000000000",
    "0000000000000000001110000111110001111000011111010110110100000000",
    "0000000000000000011100000111000011111000011111010000110100010000",
    "0000000001100000111000001110000011100000101111100111111100111100",
    "0000000000111000001111000011110000111100001111001010010000000000",
    "0000000000000000000110000011100000111100011110000111100000000000",
    "0011000000100000011000000111000001110000011100001111000000000000",
    "0011100000011100100111101001111010010110111001100111110000000000",
    "0000000000000000000111000011110000111100001111000001010000000000",
    "0000000000010000011111110011110101111000011011000100010000000000",
    "0000000000000010111111101111100001110000011110000100110000000000",
    "0001000000001110000001100011111100100111000001110001111100011100",
    "0011000000111000001111000001110000111000001110000010100000000000",
  ],
  "deathblow:idle": "0000100000111100001111000011100000111100001111000010010001100110",
  "jez:idle": "0001100000111100001111000011110000111000001011000010010000000000",
  "alan:idle": "0000100000111100011111000011110000111100001001000000000000000000",
  "benny:idle": "0000100000011000000111000001100000111100001111000110011000000100",
  "donald:idle": "0000000000011000000111000001110000011100001101000010010000000100",
  "cyraxx:idle": "0000110000011100001111000011111000111000001111000010010000100100",
  "ali:idle": "0000100000111100001111000001110000111100001111000010011000100000",
};

const HASH_SNIPPET = `
  async function atlasHash(url, frame) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cell = 320;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.clearRect(0, 0, 8, 8);
    g.drawImage(img, (frame % 4) * cell, Math.floor(frame / 4) * cell, cell, cell, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    const lum = [];
    let mean = 0;
    for (let i = 0; i < 64; i += 1) {
      const alpha = d[i * 4 + 3] / 255;
      const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) * alpha;
      lum.push(v);
      mean += v;
    }
    mean /= 64;
    return lum.map((v) => (v > mean ? '1' : '0')).join('');
  }
`;

function hamming(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return 64;
  let bits = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) bits += 1;
  return bits;
}

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

  once(method, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      this.on(method, (params) => {
        clearTimeout(timer);
        resolve(params);
      });
    });
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
  await delay(500);
}

async function captureEvidence(page, name) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await evaluate(page, "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  const shot = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(evidenceDir, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`  evidence: ${name}.png`);
}

const server = await startStaticServer();
const baseUrl = `http://127.0.0.1:${server.address().port}/`;
const gameUrl = `${baseUrl}?debug=1`;
const userDataDir = await mkdtemp(join(tmpdir(), "final-blow-parity-"));
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
  // 1a. Asset lock: the shipped sheets still match the hashes the facing
  //     table was authored against (or GENERATE_BASELINES mode prints them).
  // ------------------------------------------------------------------
  if (!skipSections.has("1a")) {
    const { page, targetId } = await newPage();
    await navigate(page, `${baseUrl}index.html`);
    const hashes = await evaluate(page, `(async () => {
      ${HASH_SNIPPET}
      const out = {};
      out['post:base'] = [];
      out['post:specials'] = [];
      for (let frame = 0; frame < 16; frame += 1) {
        out['post:base'].push(await atlasHash('assets/atlases/post.webp', frame));
        out['post:specials'].push(await atlasHash('assets/moves/post-specials.webp', frame));
      }
      for (const id of ['deathblow', 'jez', 'alan', 'benny', 'donald', 'cyraxx', 'ali']) {
        out[id + ':idle'] = await atlasHash('assets/atlases/' + id + '.webp', 0);
      }
      return out;
    })()`);
    if (generateBaselines) {
      console.log(JSON.stringify(hashes, null, 2));
      console.log("baseline generation done — paste into ATLAS_HASH_BASELINES and re-verify facings by eye");
      process.exit(0);
    }
    for (const key of ["post:base", "post:specials"]) {
      for (let frame = 0; frame < 16; frame += 1) {
        const distance = hamming(hashes[key][frame], ATLAS_HASH_BASELINES[key][frame]);
        assert.ok(
          distance <= HASH_TOLERANCE,
          `${key} frame ${frame} drifted ${distance} bits from the recorded art — re-verify its authored facing`,
        );
      }
    }
    for (const id of ["deathblow", "jez", "alan", "benny", "donald", "cyraxx", "ali"]) {
      const distance = hamming(hashes[`${id}:idle`], ATLAS_HASH_BASELINES[`${id}:idle`]);
      assert.ok(distance <= HASH_TOLERANCE, `${id} idle drifted ${distance} bits — re-verify authored facing`);
    }
    await closePage(targetId);
    console.log("1a. shipped sheets match the facing table's recorded art: ok");
  }

  // ------------------------------------------------------------------
  // 1b. Metadata lock + live render probe.
  // ------------------------------------------------------------------
  if (!skipSections.has("1b")) {
    const { page, targetId } = await newPage();
    await navigate(page, gameUrl);
    const table = await evaluate(page, `(async () => {
      const module = await import('./engine/atlas-facing.mjs');
      return {
        base: [...module.ATLAS_FACING.post.base],
        specials: [...module.ATLAS_FACING.post.specials],
        fallback: module.atlasFrameFacing('deathblow', 'base', 0),
        audit: module.auditAtlasFacing(),
      };
    })()`);
    assert.deepEqual(table.base, EXPECTED_POST_BASE, "post base facing table changed — update both records deliberately");
    assert.deepEqual(table.specials, EXPECTED_POST_SPECIALS, "post specials facing table changed");
    assert.equal(table.fallback, 1, "fighters outside the table stay right-authored");
    assert.deepEqual(table.audit.errors, []);

    const probe = await evaluate(page, `(() => {
      window.__finalBlowQa.fight('post', 'jez');
      window.__finalBlowQa.positions(400, 900);
      window.__finalBlowQa.step(0.1);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(window.__finalBlowEngine.snapshot().violence.fighterMirrors);
      })));
    })()`);
    assert.equal(probe[0].fighterId, "post");
    assert.equal(probe[0].facing, 1, "post on the left faces +1 numerically");
    assert.equal(
      probe[0].mirror, -1,
      "post's left-authored idle must render flipped so he faces his opponent — numeric facing alone cannot see this",
    );
    assert.equal(probe[1].fighterId, "jez");
    assert.equal(probe[1].facing, -1);
    assert.equal(probe[1].mirror, -1, "right-authored sheets keep mirror === facing");
    await captureEvidence(page, "post-facing-fixed");
    await closePage(targetId);
    console.log("1b. facing metadata + live mirror probe: ok");
  }

  // ------------------------------------------------------------------
  // 2. Scanline overlay sits above the canvas, below the lettering.
  // ------------------------------------------------------------------
  if (!skipSections.has("2")) {
    const { page, targetId } = await newPage();
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 844, height: 390, deviceScaleFactor: 2.75, mobile: true,
    });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await navigate(page, gameUrl);
    const layers = await evaluate(page, `(() => {
      const frame = document.querySelector('.game-frame');
      return {
        scanlines: Number(getComputedStyle(frame, '::before').zIndex),
        vignette: Number(getComputedStyle(frame, '::after').zIndex),
        canvas: Number(getComputedStyle(document.querySelector('#game')).zIndex),
        announcer: Number(getComputedStyle(document.querySelector('#announcer')).zIndex),
        screen: Number(getComputedStyle(document.querySelector('#titleScreen')).zIndex),
      };
    })()`);
    assert.ok(layers.scanlines > layers.canvas, "scanlines must stay above the canvas (arcade look preserved)");
    assert.ok(
      layers.scanlines < layers.announcer,
      `scanlines (z ${layers.scanlines}) must render under the announcer lettering (z ${layers.announcer})`,
    );
    assert.ok(
      layers.scanlines < layers.screen,
      `scanlines (z ${layers.scanlines}) must render under the title/select screens (z ${layers.screen})`,
    );
    await captureEvidence(page, "title-clean-lettering");
    await closePage(targetId);
    console.log("2. scanline overlay contained below lettering: ok");
  }

  // ------------------------------------------------------------------
  // 3. Performance parity scenarios.
  // ------------------------------------------------------------------
  const perfScenario = async ({ label, metrics, touch, bootstrap = "", expectedProfile, expectedWidth }) => {
    const { page, targetId } = await newPage();
    if (touch) await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    // Pages share one Chrome profile, so persisted toggles (reduced motion,
    // quality) from an earlier scenario must never leak into the next one.
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.clear(); ${bootstrap}` });
    await page.send("Emulation.setDeviceMetricsOverride", metrics);
    await navigate(page, gameUrl);
    const result = await evaluate(page, `(() => ({
      profile: window.__finalBlowEngine.snapshot().performance.id,
      width: document.querySelector('#game').width,
      dpr: window.devicePixelRatio,
    }))()`);
    assert.equal(result.profile, expectedProfile, `${label}: profile`);
    assert.equal(result.width, expectedWidth, `${label}: backing store width`);
    await closePage(targetId);
    console.log(`3. ${label}: ok (profile ${result.profile}, canvas ${result.width}px)`);
  };

  const CAPABLE = "Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });"
    + "Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });";
  await perfScenario({
    label: "capable phone gets desktop presentation",
    metrics: { width: 844, height: 390, deviceScaleFactor: 2.75, mobile: true },
    touch: true,
    bootstrap: CAPABLE,
    expectedProfile: "high",
    // Sharp rendering is capped at the desktop-proven 2x backing store: a
    // 2.75-DPR phone gets 2560x1440, not a ~7 MP canvas nothing has driven.
    expectedWidth: 1280 * 2,
  });
  await perfScenario({
    label: "low-end phone keeps balanced at 1x",
    metrics: { width: 844, height: 390, deviceScaleFactor: 2.75, mobile: true },
    touch: true,
    bootstrap: "Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });"
      + "Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });",
    expectedProfile: "balanced",
    expectedWidth: 1280,
  });
  await perfScenario({
    label: "data-saver phone keeps battery",
    metrics: { width: 844, height: 390, deviceScaleFactor: 2.75, mobile: true },
    touch: true,
    bootstrap: CAPABLE
      + "Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true }) });",
    expectedProfile: "battery",
    expectedWidth: 1280,
  });
  await perfScenario({
    label: "reduced-motion phone keeps battery",
    metrics: { width: 844, height: 390, deviceScaleFactor: 2.75, mobile: true },
    touch: true,
    bootstrap: CAPABLE + "localStorage.setItem('final-blow-reduced-motion', '1');",
    expectedProfile: "battery",
    expectedWidth: 1280,
  });
  await perfScenario({
    label: "desktop unchanged",
    metrics: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false },
    touch: false,
    bootstrap: CAPABLE,
    expectedProfile: "high",
    expectedWidth: 1280,
  });

  console.log(JSON.stringify({ status: "passed", gameRoot }));
} finally {
  browser?.socket.close();
  chrome.kill("SIGKILL");
  server.close();
}
