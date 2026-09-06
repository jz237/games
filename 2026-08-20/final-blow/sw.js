// Keep offline startup reliable. Images and audio are intentionally fetched on
// demand: preloading the complete game was a 19 MB / 162-request install that
// could make Chrome abort the page before it rendered.
const CACHE_NAME = "final-blow-shell-5.0";
const SHELL = [
  "./",
  "./styles.css",
  "./game.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./engine/foundation.mjs",
  "./engine/defense.mjs",
  "./engine/combos.mjs",
  "./engine/fighter-kits.mjs",
  "./engine/ai.mjs",
  "./engine/arcade.mjs",
  "./engine/controls.mjs",
  "./engine/training.mjs",
  "./engine/polish.mjs",
  "./engine/rooms.mjs",
  "./engine/facing.mjs",
  "./engine/webrtc.mjs",
  "./engine/rollback.mjs",
  "./engine/demo.mjs",
  "./engine/fatalities.mjs",
  "./engine/fighter-audio.mjs",
  "./engine/atlas-facing.mjs",
];

self.addEventListener("install", (event) => {
  // cache: "reload" bypasses the browser HTTP cache for every shell fetch. A
  // new worker only ever installs because the BUILD changed, so it must never
  // fill its cache with heuristically HTTP-cached bytes — measured during the
  // 3.3 update-flow verification: without this, the fresh CacheStorage cache
  // held the PREVIOUS index.html and the update-reload landed the player on a
  // mixed-version shell.
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

// v3.3 FRESH — the update contract. skipWaiting + clients.claim mean a new
// worker takes over every open window the moment it finishes installing, and
// the PAGE decides what to do about it: 3.3+ shells listen for
// controllerchange and reload themselves when it is safe (never mid-match —
// see the freshness block next to registerOfflineGame in game.js). Shells
// OLDER than 3.3 have no such listener — they show their stale build one
// final time while this worker installs and claims, and every navigation
// after that serves the fresh cache. (A worker-side client.navigate() rescue
// for that one visit was built and rejected: timers inside the activate
// waitUntil died before firing and repeatedly wedged the verification
// browser — not a risk the offline path can carry for a one-visit win.)
self.addEventListener("message", (event) => {
  // Lets a page tell a re-registration echo apart from a real update: a
  // takeover whose shell matches the page's own build needs no reload.
  if (event.data?.type === "fb-shell-version?") event.ports[0]?.postMessage({ version: CACHE_NAME });
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names
      .filter((name) => name.startsWith("final-blow-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    // Cloudflare Pages redirects /index.html to the directory URL. Returning
    // that redirected CacheStorage response from a navigation fetch event is
    // rejected by browsers as ERR_FAILED. The directory entry is the same
    // document without a redirect history, so it is safe to use offline.
    event.respondWith(caches.match("./").then((cached) => cached || fetch(event.request)));
    return;
  }

  // Only the intentionally small shell is cached. Do not add runtime media
  // here; doing so would quietly recreate the oversized installation.
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));
});
