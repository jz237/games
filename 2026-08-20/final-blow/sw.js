// Keep offline startup reliable. Images and audio are intentionally fetched on
// demand: preloading the complete game was a 19 MB / 162-request install that
// could make Chrome abort the page before it rendered.
const CACHE_NAME = "final-blow-shell-2.2";
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
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
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
