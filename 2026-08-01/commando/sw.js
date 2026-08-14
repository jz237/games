// sw.js — offline cache for Commando HD (installed-app / PWA path only; the
// page registers this worker on https origins alone, so the LAN dev server and
// the headless QA rig never see stale cached assets).
//
// it82 REWRITE. The first version was cache-first over EVERYTHING with a fixed
// cache name and ignoreSearch — which meant a browser that loaded the game once
// replayed that build forever: updates were invisible, and even a ?cachebust
// query matched the stale entry. Now:
//   * CODE (documents, .js, .webmanifest) is NETWORK-FIRST — you always get the
//     build that is actually deployed when you are online, and the cache is
//     refreshed behind you; offline falls back to the last good copy.
//   * MEDIA (art, audio, wasm) stays CACHE-FIRST — it is the bulk of the ~8MB
//     payload, it rarely changes, and it is what makes offline play possible.
//   * The cache name carries a version; activate() purges every other cache, so
//     a deploy self-heals instead of needing the user to clear anything.
const CACHE = 'commando-hd-v2';
const CORE = [
  './index.html',
  './game.js',
  './music.js',
  './sfx.js',
  './data/area1.js',
  './data/area2.js',
  './data/area3.js',
  './data/plate-masks.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

const isCode = (req, url) =>
  req.mode === 'navigate' ||
  /\.(?:html|js|webmanifest|json)$/i.test(url.pathname);

// it125: the page's update toast asks the waiting worker to take over now
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never touch cross-origin

  if (isCode(e.request, url)) {
    // network-first with FORCED REVALIDATION. The site is served by a Worker
    // that stamps its own 4h Cache-Control (so the project's _headers rules do
    // not reach these files); cache:'no-cache' makes the browser check the
    // etag every time, so a fresh deploy is never masked by the HTTP cache.
    // Cheap: unchanged files answer 304.
    e.respondWith(
      fetch(new Request(e.request, { cache: 'no-cache' }))
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // media: cache-first, filled on first sight
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
