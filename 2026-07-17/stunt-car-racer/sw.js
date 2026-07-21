// Service worker for Stunt Car Racer PWA
// Caches game files for offline play and home-screen launch

var CACHE_NAME = 'scr-v142';
var ASSETS = [
  'source.html',
  'source.js?v=142',
  'source.wasm?v=142',
  'controls.js?v=142',
  'driver-controls.js?v=142',
  'profile.js?v=142',
  'track-access.js?v=142',
  'hotseat.js?v=142',
  'link-championship.js?v=142',
  'backup.js?v=142',
  'multiplayer.js?v=142',
  'game.js?v=142',
  'game.css?v=142',
  'hd-graphics.js?v=142',
  'hd-audio.js?v=142',
  'audio/engine-idle.mp3?v=142',
  'audio/engine-high.mp3?v=142',
  'audio/boost.mp3?v=142',
  'audio/air.mp3?v=142',
  'audio/crash.mp3?v=142',
  'audio/wreck.mp3?v=142',
  'audio/land.mp3?v=142',
  'audio/fanfare.mp3?v=142',
  'audio/lost.mp3?v=142',
  'audio/music.mp3?v=142',
  'images/sky.jpg',
  'images/tex-grass.jpg',
  'images/tex-asphalt2.jpg',
  'images/tex-wall.jpg',
  'images/tex-sand.jpg',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'images/cockpit.png',
  'images/chains.png',
  'images/boost/boost-1.png',
  'images/boost/boost-2.png',
  'images/boost/boost-3.png',
  'images/wheels/left-wheel-0.png',
  'images/wheels/left-wheel-1.png',
  'images/wheels/left-wheel-2.png',
  'images/wheels/right-wheel-0.png',
  'images/wheels/right-wheel-1.png',
  'images/wheels/right-wheel-2.png',
  'images/indicators/hole.png',
  'images/indicators/smash.png',
  'images/indicators/flag-bright.png',
  'images/indicators/stopwatch-bright.png',
  'images/dust/dust-cloud-0.png',
  'images/dust/dust-cloud-1.png',
  'images/dust/dust-cloud-2.png',
  'images/dust/dust-cloud-3.png',
  'images/dust/dust-cloud-4.png',
  'images/dust/dust-cloud-5.png',
  'images/dust/dust-cloud-6.png',
  'images/dust/dust-cloud-7.png',
  'images/screens/menu.jpg',
  'images/screens/heads.png',
  'images/screens/racewin.jpg',
  'images/screens/racelost.jpg',
  'images/screens/wrecked.png'
];

// Install: pre-cache core assets
self.addEventListener('install', async function () {
  var cache = await caches.open(CACHE_NAME);
  await cache.addAll(ASSETS);
  await self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', async function () {
  var names = await caches.keys();
  await Promise.all(
    names.filter(function (n) { return n !== CACHE_NAME; })
         .map(function (n) { return caches.delete(n); })
  );
  await self.clients.claim();
});

// Fetch fresh shell/code first so phones do not stay stuck on an old control build.
// Large immutable assets remain cache-first for fast starts and offline use.
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  var freshFirst = event.request.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname);
  if (freshFirst) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return caches.match(event.request); })
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(function (cached) {
    return cached || fetch(event.request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    });
  }));
});
