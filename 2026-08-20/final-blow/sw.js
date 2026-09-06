// Keep offline startup reliable. Images and audio are intentionally fetched on
// demand: preloading the complete game was a 19 MB / 162-request install that
// could make Chrome abort the page before it rendered. (Since 5.1 a fetched
// media file is KEPT, in a second, capped, build-keyed cache — see
// MEDIA_CACHE_NAME — which is a different thing from installing it.)
const CACHE_NAME = "final-blow-shell-5.1";
// v5.1 #38 — the RUNTIME media cache. Sheets, audio, stage plates and the 3D
// renderer's HD/vendor files are still fetched on demand (never at install:
// the precache alternative is now 81 MB / ~560 files), but once a file has
// been fetched it stays, keyed by the build, so the second fight of a session
// — and the second session — do not re-download or re-validate 30-40 URLs.
// The hosts' defaults (GitHub Pages max-age=600) made every fight after the
// first ten minutes a conditional re-request per sheet; a phone that evicts
// its HTTP cache repeated the whole 12-22 MB first-fight download.
// Derived from the shell name so the one version bump per release keys both.
const MEDIA_CACHE_NAME = CACHE_NAME.replace("final-blow-shell-", "final-blow-media-");
// Soft cap on the media cache, in bytes, so it can never recreate the
// oversized install: the whole assets tree is ~81 MB, so the cap is a full
// roster plus headroom, and the oldest entries go first when it is crossed.
const MEDIA_CACHE_CAP_BYTES = 120 * 1024 * 1024;
const MEDIA_PATHS = ["/assets/", "/renderer/hd/", "/renderer/vendor/"];
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
  "./engine/audio-manifest.mjs",
  "./engine/ambient.mjs",
  "./engine/announcer.mjs",
  "./engine/crowd-voice.mjs",
  "./engine/shared-sfx.mjs",
  "./engine/swing-resolve.mjs",
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
    // Every cache of an older build goes, the media one included: a media
    // file is addressed by an un-versioned URL, so the build key on the cache
    // name is what keeps a 5.0 sheet from drawing under a 5.1 manifest.
    caches.keys().then((names) => Promise.all(names
      .filter((name) => name.startsWith("final-blow-") && name !== CACHE_NAME && name !== MEDIA_CACHE_NAME)
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

  if (isMediaRequest(event.request, requestUrl)) {
    event.respondWith(mediaResponse(event.request));
    return;
  }

  event.respondWith(shellResponse(event.request));
});

// Only the intentionally small shell is cached here. Do not add runtime media
// to THIS path; doing so would quietly recreate the oversized installation —
// media goes through mediaResponse and its cap.
function shellResponse(request) {
  return caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request));
}

function isMediaRequest(request, requestUrl) {
  // A media element fetching a byte range must reach the network: a 206
  // cannot be served as a whole file, and caching it would poison later
  // full reads of the same URL.
  if (request.headers.has("range")) return false;
  const path = requestUrl.pathname;
  return MEDIA_PATHS.some((prefix) => path.includes(prefix));
}

// Cache-first. On a miss the network response is stored (a full, plain 200
// only) and the cache is trimmed to the cap; on a network failure with no
// cached copy the failure propagates exactly as it did before this cache
// existed, so the game's own fallback chains stay the safety net.
function mediaResponse(request) {
  return caches.open(MEDIA_CACHE_NAME).then((cache) => cache.match(request, { ignoreSearch: true })
    .then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.status === 200 && response.type === "basic") {
        const copy = response.clone();
        cache.put(request, copy).then(() => trimMediaCache(cache, sizeOf(response))).catch(() => {});
      }
      return response;
    })));
}

function sizeOf(response) {
  const length = Number(response.headers.get("content-length"));
  return Number.isFinite(length) && length > 0 ? length : 0;
}

// Byte tally of the media cache for this worker's life. The first insert
// after a worker starts recounts from the stored headers (one pass over the
// keys); every later insert adds its own length, so trimming is cheap.
let mediaBytes = -1;
let mediaTrim = Promise.resolve();

function trimMediaCache(cache, addedBytes) {
  mediaTrim = mediaTrim.then(async () => {
    if (mediaBytes < 0) {
      mediaBytes = 0;
      for (const key of await cache.keys()) {
        const entry = await cache.match(key);
        mediaBytes += entry ? sizeOf(entry) : 0;
      }
    } else {
      mediaBytes += addedBytes;
    }
    if (mediaBytes <= MEDIA_CACHE_CAP_BYTES) return;
    // keys() lists entries oldest-first in every engine that ships this
    // worker; dropping from the front is the LRU-by-insertion the cap wants.
    for (const key of await cache.keys()) {
      if (mediaBytes <= MEDIA_CACHE_CAP_BYTES) break;
      const entry = await cache.match(key);
      const bytes = entry ? sizeOf(entry) : 0;
      if (await cache.delete(key)) mediaBytes -= bytes;
    }
  }).catch(() => { mediaBytes = -1; });
  return mediaTrim;
}
