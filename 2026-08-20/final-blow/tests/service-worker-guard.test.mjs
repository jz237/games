import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("Final Blow service worker stays small and Cloudflare-navigation safe", async () => {
  const [worker, game, index] = await Promise.all([
    readFile(join(gameRoot, "sw.js"), "utf8"),
    readFile(join(gameRoot, "game.js"), "utf8"),
    readFile(join(gameRoot, "index.html"), "utf8"),
  ]);

  const cacheName = worker.match(/const CACHE_NAME = "final-blow-shell-([^"]+)";/)?.[1];
  assert.ok(cacheName, "worker cache must use the final-blow-shell-* namespace");

  const shellSource = worker.match(/const SHELL = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(shellSource, "worker must declare a small SHELL list");
  const shell = [...shellSource.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]);

  assert.ok(shell.length <= 25, `worker shell grew to ${shell.length} entries`);
  assert.equal(new Set(shell).size, shell.length, "worker shell contains duplicate entries");
  assert.ok(shell.includes("./"), "worker shell must cache the directory URL");
  assert.ok(shell.includes("./game.js"), "worker shell must cache game.js");
  assert.ok(shell.includes("./engine/rollback.mjs"), "worker shell must cache rollback engine");
  assert.ok(!shell.includes("./index.html"), "redirected index.html must never enter CacheStorage");
  assert.ok(!shell.some((entry) => entry.startsWith("./assets/")), "images and audio must stay out of the install cache");

  assert.match(worker, /event\.request\.mode === "navigate"[\s\S]*caches\.match\("\.\/"\)/);
  assert.doesNotMatch(worker, /caches\.match\("\.\/index\.html"\)/);
  assert.doesNotMatch(worker, /cache\.put\(/, "runtime media must not silently refill the cache");
  assert.ok(game.includes(`serviceWorker.register("./sw.js?v=final-blow-${cacheName}")`), "worker registration version must match cache version");
  assert.ok(index.includes(`game.js?v=final-blow-${cacheName}`), "entry script version must match cache version");
});
