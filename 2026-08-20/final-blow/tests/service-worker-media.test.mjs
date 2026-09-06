// v5.1 #38 — the runtime media cache, run for real: sw.js is evaluated in a
// vm with a fake CacheStorage + fetch, and its fetch/activate handlers are
// driven with synthetic events. The source-level guard test pins the SHAPE
// of the worker; this one pins what it DOES — cache-first for media, no
// store of ranges or non-200s, the shell path untouched, the byte cap
// evicting oldest-first, and activate keeping this build's two caches only.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ORIGIN = "https://final-blow.test";

class FakeCache {
  constructor() { this.entries = new Map(); }
  static key(request, options = {}) {
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN);
    if (options.ignoreSearch) url.search = "";
    return url.href;
  }
  async match(request, options) {
    const key = FakeCache.key(request, options);
    for (const [stored, response] of this.entries) {
      if (options?.ignoreSearch ? FakeCache.key(stored, options) === key : stored === key) return response.clone();
    }
    return undefined;
  }
  async put(request, response) { this.entries.set(FakeCache.key(request), response); }
  async delete(request) { return this.entries.delete(FakeCache.key(request)); }
  async keys() { return [...this.entries.keys()].map((url) => new Request(url)); }
  async addAll(requests) { for (const request of requests) this.entries.set(FakeCache.key(request), new Response("shell")); }
}

class FakeCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name);
  }
  async keys() { return [...this.caches.keys()]; }
  async delete(name) { return this.caches.delete(name); }
  async match(request, options) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request, options);
      if (hit) return hit;
    }
    return undefined;
  }
}

async function loadWorker({ responses = {} } = {}) {
  const source = await readFile(join(gameRoot, "sw.js"), "utf8");
  const handlers = {};
  const fetchLog = [];
  const caches = new FakeCacheStorage();
  const sandbox = {
    self: null,
    caches,
    fetch: async (request) => {
      const url = typeof request === "string" ? request : request.url;
      fetchLog.push(url);
      const make = responses[new URL(url).pathname];
      if (!make) throw new TypeError(`network failure for ${url}`);
      // A real same-origin fetch answers type "basic"; a synthesized Response
      // says "default", which the worker rightly refuses to store.
      const response = make();
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
    Request, Response, Headers, URL, Promise, Number, Math, console,
  };
  sandbox.self = {
    location: { origin: ORIGIN },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(source, sandbox, { filename: "sw.js" });
  const dispatchFetch = async (path, init = {}) => {
    const request = new Request(new URL(path, ORIGIN).href, init);
    let responded = null;
    const event = {
      request,
      respondWith: (promise) => { responded = promise; },
      waitUntil: () => {},
    };
    handlers.fetch(event);
    return responded ? await responded : null;
  };
  const dispatchActivate = async () => {
    let waited = null;
    handlers.activate({ waitUntil: (promise) => { waited = promise; } });
    await waited;
  };
  // Trimming runs after the put resolves; drain the microtask queue.
  const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  return { caches, fetchLog, dispatchFetch, dispatchActivate, settle, handlers };
}

function media(bytes, status = 200) {
  return () => new Response(new Uint8Array(8), { status, headers: { "content-length": String(bytes), "content-type": "image/webp" } });
}

test("media under assets/ is cache-first: one network fetch, then served from the media cache", async () => {
  const worker = await loadWorker({ responses: { "/assets/unified/jez.webp": media(300_000) } });
  const first = await worker.dispatchFetch("/assets/unified/jez.webp");
  assert.equal(first.status, 200);
  await worker.settle();
  assert.deepEqual(worker.fetchLog, [`${ORIGIN}/assets/unified/jez.webp`]);
  const names = await worker.caches.keys();
  assert.equal(names.length, 1, "only the media cache is created at runtime");
  assert.match(names[0], /^final-blow-media-/);
  const second = await worker.dispatchFetch("/assets/unified/jez.webp");
  assert.equal(second.status, 200);
  assert.equal(worker.fetchLog.length, 1, "the second read must not touch the network");
  // The query string never splits the cache (ignoreSearch on match).
  const third = await worker.dispatchFetch("/assets/unified/jez.webp?cb=2");
  assert.equal(third.status, 200);
  assert.equal(worker.fetchLog.length, 1);
});

test("ranges, non-200s and cross-origin requests never enter the media cache", async () => {
  const worker = await loadWorker({ responses: {
    "/assets/audio/fight.mp3": media(90_000),
    "/assets/unified/missing.webp": media(0, 404),
  } });
  const ranged = await worker.dispatchFetch("/assets/audio/fight.mp3", { headers: { range: "bytes=0-1023" } });
  assert.equal(ranged.status, 200);
  const missing = await worker.dispatchFetch("/assets/unified/missing.webp");
  assert.equal(missing.status, 404);
  await worker.settle();
  const mediaCache = await worker.caches.open((await worker.caches.keys()).find((name) => name.startsWith("final-blow-media-")) || "none");
  assert.equal((await mediaCache.keys()).length, 0, "neither the range nor the 404 may be stored");
  assert.equal(worker.fetchLog.length, 2);
  // Not our origin, or not a GET: the handler does not respond at all.
  let responded = 0;
  const respondWith = () => { responded += 1; };
  worker.handlers.fetch({ request: new Request("https://elsewhere.test/assets/unified/jez.webp"), respondWith });
  worker.handlers.fetch({ request: new Request(`${ORIGIN}/assets/unified/jez.webp`, { method: "POST", body: "x" }), respondWith });
  assert.equal(responded, 0);
});

test("the shell path stays cache-then-network and never writes the media cache", async () => {
  const worker = await loadWorker({ responses: { "/game.js": () => new Response("js", { status: 200, headers: { "content-length": "2" } }) } });
  const response = await worker.dispatchFetch("/game.js");
  assert.equal(await response.text(), "js");
  await worker.settle();
  assert.deepEqual(await worker.caches.keys(), [], "a shell miss must not create or fill any cache at runtime");
  // A network failure with nothing cached propagates, as before this cache existed.
  await assert.rejects(worker.dispatchFetch("/engine/nothing.mjs"), /network failure/);
  await assert.rejects(worker.dispatchFetch("/assets/unified/offline.webp"), /network failure/);
});

test("the byte cap evicts the oldest media first and keeps the tally honest", async () => {
  const MB = 1024 * 1024;
  const worker = await loadWorker({ responses: {
    "/assets/a.webp": media(50 * MB),
    "/assets/b.webp": media(50 * MB),
    "/assets/c.webp": media(50 * MB),
    "/assets/d.webp": media(10 * MB),
  } });
  for (const name of ["a", "b", "c"]) {
    await worker.dispatchFetch(`/assets/${name}.webp`);
    await worker.settle();
  }
  const mediaCache = await worker.caches.open((await worker.caches.keys()).find((name) => name.startsWith("final-blow-media-")));
  let keys = (await mediaCache.keys()).map((request) => new URL(request.url).pathname);
  // 150 MB crossed the 120 MB cap: the oldest (a) went, b and c stay.
  assert.deepEqual(keys, ["/assets/b.webp", "/assets/c.webp"]);
  await worker.dispatchFetch("/assets/d.webp");
  await worker.settle();
  keys = (await mediaCache.keys()).map((request) => new URL(request.url).pathname);
  assert.deepEqual(keys, ["/assets/b.webp", "/assets/c.webp", "/assets/d.webp"], "110 MB fits; nothing else is evicted");
  // The evicted sheet is a miss again — fetched, stored, and now the cap
  // takes b (the new oldest).
  await worker.dispatchFetch("/assets/a.webp");
  await worker.settle();
  keys = (await mediaCache.keys()).map((request) => new URL(request.url).pathname);
  assert.deepEqual(keys, ["/assets/c.webp", "/assets/d.webp", "/assets/a.webp"]);
});

test("activate purges every older build's caches and keeps this build's shell AND media caches", async () => {
  const worker = await loadWorker();
  const source = await readFile(join(gameRoot, "sw.js"), "utf8");
  const version = source.match(/const CACHE_NAME = "final-blow-shell-([^"]+)";/)[1];
  for (const name of [`final-blow-shell-${version}`, `final-blow-media-${version}`, "final-blow-shell-4.9", "final-blow-media-4.9", "unrelated-cache"]) {
    await worker.caches.open(name);
  }
  await worker.dispatchActivate();
  assert.deepEqual((await worker.caches.keys()).sort(), [`final-blow-media-${version}`, `final-blow-shell-${version}`, "unrelated-cache"]);
});
