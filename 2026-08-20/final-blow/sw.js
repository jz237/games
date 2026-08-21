const CACHE_NAME = "final-blow-offline-1.0d";
const PRECACHE = [
  "./",
  "./index.html",
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
  "./engine/webrtc.mjs",
  "./engine/rollback.mjs",
  "./assets/kensington-allegheny.webp",
  "./assets/veterans-stadium.webp",
  "./assets/fighters/deathblow.webp",
  "./assets/fighters/jez.webp",
  "./assets/fighters/alan.webp",
  "./assets/fighters/post.webp",
  "./assets/fighters/benny.webp",
  "./assets/fighters/donald.webp",
  "./assets/fighters/cyraxx.webp",
  "./assets/fighters/ali.webp",
  "./assets/fighters/commissioner.webp",
  "./assets/atlases/deathblow.webp",
  "./assets/atlases/jez.webp",
  "./assets/atlases/alan.webp",
  "./assets/atlases/post.webp",
  "./assets/atlases/benny.webp",
  "./assets/atlases/donald.webp",
  "./assets/atlases/cyraxx.webp",
  "./assets/atlases/ali.webp",
  "./assets/atlases/commissioner.webp",
  "./assets/moves/deathblow-specials.webp",
  "./assets/moves/jez-specials.webp",
  "./assets/moves/alan-specials.webp",
  "./assets/moves/post-specials.webp",
  "./assets/moves/benny-specials.webp",
  "./assets/moves/donald-specials.webp",
  "./assets/moves/cyraxx-specials.webp",
  "./assets/moves/ali-specials.webp",
  "./assets/audio/ui-select.mp3",
  "./assets/audio/jump.mp3",
  "./assets/audio/light-swing.mp3",
  "./assets/audio/heavy-swing.mp3",
  "./assets/audio/special-swing.mp3",
  "./assets/audio/body-hit.mp3",
  "./assets/audio/block.mp3",
  "./assets/audio/finish-ready.mp3",
  "./assets/audio/final-blow.mp3",
  "./assets/audio/knockout.mp3",
  "./assets/audio/philly-after-dark.mp3",
  "./assets/audio/vet-parking-lot.mp3",
  "./assets/audio/neon-sign-war.mp3",
  "./assets/audio/subway-after-midnight.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then((cached) => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
