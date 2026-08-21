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
  ".mjs": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function startStaticServer() {
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push(request.url || "");
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = normalize(join(gameRoot, relative));
      if (!target.startsWith(gameRoot)) throw new Error("Path outside game root");
      const info = await stat(target);
      const file = info.isDirectory() ? join(target, "index.html") : target;
      const body = await readFile(file);
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": mimeTypes[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, requests }));
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
    const values = this.listeners.get(method) || [];
    values.push(listener);
    this.listeners.set(method, values);
  }

  close() { this.socket.close(); }
}

async function waitForJson(url, timeout = 10_000) {
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
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(client, expression, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(client, expression);
    if (last) return last;
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser condition; last value: ${JSON.stringify(last)}`);
}

async function createTarget(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  assert.equal(response.ok, true);
  const target = await response.json();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const errors = [];
  const requestUrls = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  client.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") errors.push(entry.text); });
  client.on("Network.requestWillBeSent", ({ request }) => requestUrls.push(request.url));
  client.on("Network.webSocketCreated", ({ url: socketUrl }) => requestUrls.push(socketUrl));
  await Promise.all([client.send("Runtime.enable"), client.send("Log.enable"), client.send("Network.enable"), client.send("Page.enable")]);
  return { client, errors, requestUrls };
}

const { server, requests: staticRequests } = await startStaticServer();
const address = server.address();
const signalingApi = process.env.FINAL_BLOW_SIGNALING_API || "";
const gameUrl = `http://127.0.0.1:${address.port}/?debug=1${signalingApi ? `&signaling=${encodeURIComponent(signalingApi)}` : ""}`;
const userDataDir = await mkdtemp(join(tmpdir(), "final-blow-online-chrome-"));
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
  "--allow-insecure-localhost",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let host;
let guest;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  host = await createTarget(debugPort, gameUrl);
  await Promise.all([
    host.client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }),
    host.client.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: true }),
  ]);
  await host.client.send("Page.reload", { ignoreCache: true });
  await delay(650);
  await waitFor(host.client, `document.readyState === 'complete' && Boolean(window.__finalBlowEngine)`);
  assert.equal(await evaluate(host.client, `document.body.classList.contains('mobile-landscape')`), true);
  await evaluate(host.client, `document.querySelector('#onlineButton').click(); document.querySelector('#onlineCreateButton').click(); true`);
  const hostRoom = await waitFor(host.client, `(() => {
    const snapshot = window.__finalBlowEngine?.snapshot().online;
    if (!snapshot?.roomId || document.querySelector('#onlineRoomDetails').hidden) return null;
    return { snapshot, invite: document.querySelector('#onlineInviteLink').value };
  })()`);
  assert.equal(hostRoom.snapshot.role, "host");
  assert.equal(hostRoom.snapshot.roomId.length, 22);
  const invite = new URL(hostRoom.invite);
  const guestSecret = new URLSearchParams(invite.hash.slice(1)).get("key");
  assert.equal(invite.searchParams.has("key"), false);
  assert.equal(guestSecret.length, 43);

  guest = await createTarget(debugPort, invite.toString());
  await waitFor(guest.client, `document.readyState === 'complete' && Boolean(window.__finalBlowEngine)`);
  const guestInviteUi = await evaluate(guest.client, `(() => ({
    screen: window.__finalBlowEngine.snapshot().screen,
    status: document.querySelector('#onlineStatusTitle').textContent,
    inviteLoaded: document.querySelector('#onlineInviteInput').value.includes('#online=join'),
  }))()`);
  assert.equal(guestInviteUi.screen, "online");
  assert.equal(guestInviteUi.inviteLoaded, true);
  await evaluate(guest.client, `document.querySelector('#onlineJoinButton').click(); true`);

  const guestConnected = await waitFor(guest.client, `(() => {
    const value = window.__finalBlowEngine?.snapshot().online;
    return value?.peer?.connected ? value : null;
  })()`, 30_000);
  const hostConnected = await waitFor(host.client, `(() => {
    const value = window.__finalBlowEngine?.snapshot().online;
    return value?.peer?.connected ? value : null;
  })()`, 30_000);
  assert.equal(guestConnected.role, "guest");
  assert.equal(hostConnected.roomId, guestConnected.roomId);
  assert.equal(hostConnected.peer.controlState, "open");
  assert.equal(hostConnected.peer.inputState, "open");
  assert.equal(guestConnected.peer.controlState, "open");
  assert.equal(guestConnected.peer.inputState, "open");

  await waitFor(host.client, `window.__finalBlowEngine.snapshot().online.latency !== null`);
  await waitFor(guest.client, `window.__finalBlowEngine.snapshot().online.latency !== null`);
  const guestSecurity = await evaluate(guest.client, `(() => ({
    hash: location.hash,
    inviteField: document.querySelector('#onlineInviteLink').value,
    title: document.querySelector('#onlineStatusTitle').textContent,
    latency: document.querySelector('#onlineLatency').textContent,
  }))()`);
  assert.equal(guestSecurity.hash, "");
  assert.equal(guestSecurity.inviteField, "PRIVATE INVITE AUTHENTICATED");
  assert.match(guestSecurity.title, /DIRECT LINK READY/);
  assert.match(guestSecurity.latency, /MS · ENCRYPTED/);
  assert.equal(host.requestUrls.some((url) => url.includes(guestSecret)), false);
  assert.equal(guest.requestUrls.some((url) => url.includes(guestSecret)), false);
  assert.equal(staticRequests.some((url) => url.includes(guestSecret)), false);

  await delay(450);
  const mobileBounds = await evaluate(host.client, `(() => {
    document.querySelector('#onlineScreen').style.animation = 'none';
    const settledScreen = document.querySelector('#onlineScreen').getBoundingClientRect();
    const terminal = document.querySelector('.online-terminal').getBoundingClientRect();
    const copy = document.querySelector('#onlineCopyButton').getBoundingClientRect();
    return {
      screen: { left: settledScreen.left, top: settledScreen.top, right: settledScreen.right, bottom: settledScreen.bottom },
      terminal: { left: terminal.left, top: terminal.top, right: terminal.right, bottom: terminal.bottom },
      copy: { left: copy.left, top: copy.top, right: copy.right, bottom: copy.bottom },
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  assert.equal(mobileBounds.overflow, false);
  for (const bounds of [mobileBounds.screen, mobileBounds.terminal, mobileBounds.copy]) {
    assert.ok(
      bounds.left >= -0.1 && bounds.top >= -0.1 && bounds.right <= 844.1 && bounds.bottom <= 390.1,
      `Online mobile element escaped viewport: ${JSON.stringify({ bounds, mobileBounds })}`,
    );
  }

  await evaluate(host.client, `(() => {
    const change = (selector, value) => { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); };
    change('#onlineFighterSelect', 'deathblow');
    change('#onlineStageSelect', 'vet');
    change('#onlineDelaySelect', '2');
    return true;
  })()`);
  await evaluate(guest.client, `(() => {
    const change = (selector, value) => { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); };
    change('#onlineFighterSelect', 'jez');
    change('#onlineDelaySelect', '1');
    return true;
  })()`);
  await delay(250);
  await evaluate(guest.client, `document.querySelector('#onlineReadyButton').click(); true`);
  await waitFor(host.client, `window.__finalBlowEngine.snapshot().online.lobby.remoteReady === true`);
  await evaluate(host.client, `document.querySelector('#onlineReadyButton').click(); true`);
  const hostFight = await waitFor(host.client, `(() => {
    const value = window.__finalBlowEngine.snapshot();
    return value.screen === 'fight' && value.mode === 'online' && value.online.rollback ? value : null;
  })()`, 15_000);
  const guestFight = await waitFor(guest.client, `(() => {
    const value = window.__finalBlowEngine.snapshot();
    return value.screen === 'fight' && value.mode === 'online' && value.online.rollback ? value : null;
  })()`, 15_000);
  assert.deepEqual(hostFight.online.matchConfig.picks, ["deathblow", "jez"]);
  assert.deepEqual(guestFight.online.matchConfig.picks, ["deathblow", "jez"]);
  assert.equal(hostFight.online.matchConfig.stage, "vet");
  assert.equal(hostFight.online.matchConfig.inputDelay, 2);
  assert.equal(guestFight.online.matchConfig.matchId, hostFight.online.matchConfig.matchId);

  await Promise.all([
    evaluate(host.client, `window.__finalBlowQa.onlineManual(true)`),
    evaluate(guest.client, `window.__finalBlowQa.onlineManual(true)`),
  ]);
  const pumpBoth = async (frames) => {
    let remaining = frames;
    while (remaining > 0) {
      const chunk = Math.min(6, remaining);
      await Promise.all([
        evaluate(host.client, `window.__finalBlowQa.step(${chunk} / 60)`),
        evaluate(guest.client, `window.__finalBlowQa.step(${chunk} / 60)`),
      ]);
      remaining -= chunk;
      await delay(12);
    }
  };
  await pumpBoth(160);
  await waitFor(host.client, `window.__finalBlowEngine.snapshot().phase === 'fight'`, 15_000);
  await waitFor(guest.client, `window.__finalBlowEngine.snapshot().phase === 'fight'`, 15_000);
  await evaluate(host.client, `(() => {
    const button = document.querySelector('[data-touch="right"]');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11 }));
    return true;
  })()`);
  await guest.client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
  await pumpBoth(36);
  await evaluate(host.client, `(() => {
    const button = document.querySelector('[data-touch="right"]');
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11 }));
    return true;
  })()`);
  await guest.client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
  await evaluate(host.client, `(() => {
    const button = document.querySelector('[data-touch="light"]');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 12 }));
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 12 }));
    return true;
  })()`);
  await guest.client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "j", code: "KeyJ", windowsVirtualKeyCode: 74 });
  await guest.client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "j", code: "KeyJ", windowsVirtualKeyCode: 74 });
  await pumpBoth(150);

  const hostSynced = await waitFor(host.client, `(() => {
    const value = window.__finalBlowEngine.snapshot().online;
    return value.confirmedChecksumFrame >= 240 && value.checksumMismatches === 0 ? value : null;
  })()`, 20_000);
  const guestSynced = await waitFor(guest.client, `(() => {
    const value = window.__finalBlowEngine.snapshot().online;
    return value.confirmedChecksumFrame >= 240 && value.checksumMismatches === 0 ? value : null;
  })()`, 20_000);
  assert.equal(hostSynced.confirmedChecksumFrame, guestSynced.confirmedChecksumFrame);
  assert.equal(hostSynced.confirmedChecksum, guestSynced.confirmedChecksum);
  const convergedState = await Promise.all([
    evaluate(host.client, `window.__finalBlowEngine.snapshot()`),
    evaluate(guest.client, `window.__finalBlowEngine.snapshot()`),
  ]);
  assert.deepEqual(
    convergedState[0].fighters.map(({ x, y, health, meter, state: fighterState }) => ({ x, y, health, meter, fighterState })),
    convergedState[1].fighters.map(({ x, y, health, meter, state: fighterState }) => ({ x, y, health, meter, fighterState })),
  );
  const netHudBounds = await evaluate(host.client, `(() => {
    const bounds = document.querySelector('#onlineHud').getBoundingClientRect();
    return { hidden: document.querySelector('#onlineHud').hidden, left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
  })()`);
  assert.equal(netHudBounds.hidden, false);
  assert.ok(netHudBounds.left >= 0 && netHudBounds.top >= 0 && netHudBounds.right <= 844 && netHudBounds.bottom <= 390);

  await evaluate(guest.client, `window.__finalBlowQa.dropOnlineLink()`);
  await waitFor(guest.client, `window.__finalBlowEngine.snapshot().online.reconnecting === true`, 12_000);
  const guestReconnected = await waitFor(guest.client, `(() => {
    const value = window.__finalBlowEngine.snapshot().online;
    return value.peer?.connected && !value.reconnecting && !value.networkPaused ? value : null;
  })()`, 35_000);
  const hostReconnected = await waitFor(host.client, `(() => {
    const value = window.__finalBlowEngine.snapshot().online;
    return value.peer?.connected && !value.reconnecting && !value.networkPaused ? value : null;
  })()`, 35_000);
  assert.equal(guestReconnected.matchConfig.matchId, hostReconnected.matchConfig.matchId);
  await pumpBoth(72);
  const recovered = await Promise.all([
    evaluate(host.client, `window.__finalBlowEngine.snapshot().online`),
    evaluate(guest.client, `window.__finalBlowEngine.snapshot().online`),
  ]);
  assert.equal(recovered[0].checksumMismatches, 0);
  assert.equal(recovered[1].checksumMismatches, 0);

  const previousMatchId = hostFight.online.matchConfig.matchId;
  await Promise.all([
    evaluate(host.client, `window.__finalBlowQa.onlineResult(0)`),
    evaluate(guest.client, `window.__finalBlowQa.onlineResult(0)`),
  ]);
  await evaluate(guest.client, `document.querySelector('#rematchButton').click(); true`);
  await waitFor(host.client, `document.querySelector('#onlineRematchStatus').textContent.includes('1 / 2')`);
  await evaluate(host.client, `document.querySelector('#rematchButton').click(); true`);
  const rematchHost = await waitFor(host.client, `(() => {
    const value = window.__finalBlowEngine.snapshot();
    return value.screen === 'fight' && value.online.matchConfig?.matchId !== '${previousMatchId}' ? value.online : null;
  })()`, 15_000);
  const rematchGuest = await waitFor(guest.client, `(() => {
    const value = window.__finalBlowEngine.snapshot();
    return value.screen === 'fight' && value.online.matchConfig?.matchId !== '${previousMatchId}' ? value.online : null;
  })()`, 15_000);
  assert.equal(rematchHost.matchConfig.matchId, rematchGuest.matchConfig.matchId);
  assert.equal(rematchHost.matchConfig.rematch, true);
  assert.deepEqual(host.errors, []);
  assert.deepEqual(guest.errors, []);
  console.log(JSON.stringify({
    status: "passed",
    roomIdLength: hostConnected.roomId.length,
    host: { control: hostConnected.peer.controlState, input: hostConnected.peer.inputState, latency: hostConnected.latency },
    guest: { control: guestConnected.peer.controlState, input: guestConnected.peer.inputState, latency: guestConnected.latency },
    inviteSecretInRequestUrls: false,
    mobileBounds,
    rollback: {
      matchId: hostFight.online.matchConfig.matchId,
      inputDelay: hostFight.online.matchConfig.inputDelay,
      confirmedFrame: hostSynced.confirmedChecksumFrame,
      checksum: hostSynced.confirmedChecksum,
      hostRollbacks: hostSynced.rollback.rollbacks,
      guestRollbacks: guestSynced.rollback.rollbacks,
      reconnectFrame: hostReconnected.rollback.frame,
      rematchId: rematchHost.matchConfig.matchId,
    },
  }, null, 2));
} finally {
  host?.client.close();
  guest?.client.close();
  const chromeExit = chrome.exitCode === null ? once(chrome, "exit") : Promise.resolve();
  chrome.kill("SIGTERM");
  await Promise.race([chromeExit, delay(3_000)]);
  await new Promise((resolve) => server.close(resolve));
  if (userDataDir.startsWith(join(tmpdir(), "final-blow-online-chrome-"))) {
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
