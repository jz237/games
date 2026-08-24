#!/usr/bin/env node
/**
 * Capture the readability-pass evidence shots from a running game build.
 *
 * Serves GAME_ROOT (default: this repo's game folder) exactly like
 * tests/browser-smoke.mjs does, drives the same __finalBlowQa hooks in
 * headless Chrome, and writes labelled PNGs plus a metrics JSON to
 * OUT_DIR/LABEL/. Point GAME_ROOT at two different checkouts and diff the
 * output folders for a before/after:
 *
 *   GAME_ROOT=/tmp/fb-before/2026-08-20/final-blow OUT_DIR=/tmp/shots LABEL=before \
 *     node tools/visual-compare.mjs
 *   OUT_DIR=/tmp/shots LABEL=after node tools/visual-compare.mjs
 *
 * Scenes:
 *   idle-1/idle-2      — the same idle pose half a bob cycle apart. Before the
 *                        anchor fix the fighter AND its contact shadow sit at
 *                        visibly different heights between the two frames.
 *   impact             — the first frame after a heavy lands: flash intensity
 *                        and overlay stacking.
 *   overlap-mid        — deepest point of a pass-through lunge (identical in
 *                        both builds by design).
 *   overlap-after      — three ticks after the lunge ends. Before: the pair
 *                        has already teleported to full separation in one
 *                        tick. After: they are still easing apart.
 *   metrics.json       — per-tick x positions around the lunge end; the
 *                        largest single-tick correction is the snap evidence.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const gameRoot = normalize(process.env.GAME_ROOT || join(toolDir, ".."));
const outDir = process.env.OUT_DIR || join(tmpdir(), "final-blow-visual-compare");
const label = process.env.LABEL || "run";
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
const shotDir = join(outDir, label);

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
  }

  once(method, timeout = 10000) {
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

async function capture(client, name) {
  // Two rAF frames so the freshly stepped simulation state is on the canvas.
  await evaluate(client, "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  const shot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(join(shotDir, `${name}.png`), Buffer.from(shot.data, "base64"));
  console.log(`  ${label}/${name}.png`);
}

await mkdir(shotDir, { recursive: true });
const server = await startStaticServer();
const gameUrl = `http://127.0.0.1:${server.address().port}/?debug=1`;
const userDataDir = await mkdtemp(join(tmpdir(), "final-blow-compare-"));
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const debugPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--mute-audio",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let client;
try {
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  client = await CdpClient.connect(version.webSocketDebuggerUrl);
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  const page = new CdpClient(client.socket);
  page.sessionId = sessionId;
  const rawSend = page.send.bind(page);
  page.send = (method, params = {}) => {
    const id = page.nextId;
    page.nextId += 1;
    return new Promise((resolve, reject) => {
      page.pending.set(id, { method, resolve, reject });
      page.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  };
  void rawSend;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  const loaded = page.once("Page.loadEventFired", 20000);
  await page.send("Page.navigate", { url: gameUrl });
  await loaded;
  await delay(700);

  const buildVersion = await evaluate(page, "window.__finalBlowEngine.snapshot().version || 'unknown'");
  console.log(`${label}: build ${buildVersion} from ${gameRoot}`);
  await evaluate(page, "window.__finalBlowEngine.toggleDebug(false)");

  // --- Scene 1: idle anchoring, two frames half a bob cycle apart ----------
  await evaluate(page, `(() => {
    window.__finalBlowQa.fight('deathblow', 'jez');
    window.__finalBlowQa.positions(430, 750);
    window.__finalBlowQa.step(0.5);
  })()`);
  await capture(page, "idle-1");
  await evaluate(page, "window.__finalBlowQa.step(0.3)");
  await capture(page, "idle-2");

  // --- Scene 2: the first frame after a heavy lands ------------------------
  const impact = await evaluate(page, `(() => {
    window.__finalBlowQa.fight('deathblow', 'jez');
    window.__finalBlowQa.positions(500, 600);
    window.__finalBlowQa.input(0, { heavy: true }, 10);
    for (let frame = 0; frame < 90; frame += 1) {
      window.__finalBlowQa.step(1 / 60);
      const victim = window.__finalBlowEngine.snapshot().fighters[1];
      if (victim.health < 100) return { landedAfterFrames: frame + 1 };
    }
    return { landedAfterFrames: -1 };
  })()`);
  await capture(page, "impact");

  // --- Scene 3: pass-through lunge, mid-move and just after it ends --------
  // The defender stands in the corner so the lunge cannot fully cross, and is
  // made invulnerable so its own hit cannot knock the pair apart — the move
  // must end with the attacker still inside the defender's body, the case
  // that used to snap apart in a single tick.
  const overlap = await evaluate(page, `(() => {
    window.__finalBlowQa.fight('cyraxx', 'ali');
    window.__finalBlowQa.positions(980, 1180);
    window.__finalBlowQa.fighter(1, { invulnerableFrames: 240 });
    window.__finalBlowQa.input(0, { backSpecial: true });
    const track = [];
    let deepestGap = Infinity;
    let deepestFrame = -1;
    let moveEndedFrame = -1;
    let sawMove = false;
    for (let frame = 0; frame < 150; frame += 1) {
      window.__finalBlowQa.step(1 / 60);
      const s = window.__finalBlowEngine.snapshot();
      const [a, b] = s.fighters;
      const gap = Math.abs(a.x - b.x);
      track.push({ frame, aX: a.x, bX: b.x, gap, move: a.move, hitstop: s.hitstop > 0 });
      if (a.move === 'cyraxx-buffer-skip' && gap < deepestGap) { deepestGap = gap; deepestFrame = frame; }
      if (a.move === 'cyraxx-buffer-skip') sawMove = true;
      if (sawMove && moveEndedFrame < 0 && a.move === null) moveEndedFrame = frame;
      if (moveEndedFrame >= 0 && frame > moveEndedFrame + 10) break;
    }
    // The teleport evidence: the largest single-tick position correction any
    // fighter makes after the move has ended (hitstop ticks hold still and
    // are excluded rather than diluting the maximum).
    let maxStep = 0;
    for (let i = 1; i < track.length; i += 1) {
      // The old snap happens ON the tick the move ends, so that tick counts.
      if (track[i].frame < moveEndedFrame || track[i].hitstop) continue;
      maxStep = Math.max(
        maxStep,
        Math.abs(track[i].aX - track[i - 1].aX),
        Math.abs(track[i].bX - track[i - 1].bX),
      );
    }
    return { deepestGap, deepestFrame, moveEndedFrame, maxStepAfterMoveEnd: maxStep, track };
  })()`);

  await evaluate(page, `(() => {
    window.__finalBlowQa.fight('cyraxx', 'ali');
    window.__finalBlowQa.positions(980, 1180);
    window.__finalBlowQa.fighter(1, { invulnerableFrames: 240 });
    window.__finalBlowQa.input(0, { backSpecial: true });
    for (let frame = 0; frame <= ${overlap.deepestFrame}; frame += 1) window.__finalBlowQa.step(1 / 60);
  })()`);
  await capture(page, "overlap-mid");
  await evaluate(page, `(() => {
    for (let frame = ${overlap.deepestFrame + 1}; frame <= ${overlap.moveEndedFrame + 3}; frame += 1) {
      window.__finalBlowQa.step(1 / 60);
    }
  })()`);
  await capture(page, "overlap-after");

  const metrics = {
    label,
    build: buildVersion,
    gameRoot,
    impactLandedAfterFrames: impact.landedAfterFrames,
    overlap: {
      deepestGap: overlap.deepestGap,
      deepestFrame: overlap.deepestFrame,
      moveEndedFrame: overlap.moveEndedFrame,
      maxSingleTickCorrectionAfterMoveEnd: overlap.maxStepAfterMoveEnd,
      // The ticks around the move end, for auditing the correction curve.
      trackTail: overlap.track.filter((tick) => tick.frame >= overlap.moveEndedFrame - 6),
    },
  };
  await writeFile(join(shotDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`  ${label}/metrics.json — max post-move single-tick correction: ${overlap.maxStepAfterMoveEnd.toFixed(1)}px`);
} finally {
  client?.close();
  chrome.kill("SIGKILL");
  server.close();
}
