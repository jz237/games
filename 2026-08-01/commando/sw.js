// sw.js — offline cache for Commando HD (installed-app / PWA path only; the
// page registers this worker on https origins alone, so the LAN dev server and
// the headless QA rig never see stale cached assets).
//
// Strategy: precache the boot core on install; everything else same-scope is
// cached on first fetch (cache-first). The game loads every sprite, plate and
// mask at boot, so one online session leaves the whole game playable offline.
const CACHE = 'commando-hd-v1';
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never touch cross-origin
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
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
