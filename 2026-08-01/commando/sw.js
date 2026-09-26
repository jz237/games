// sw.js — retires the service worker that the 2D build (v0.x) installed.
// Returning players' browsers fetch this file on their next visit; it clears
// the old offline cache, unregisters itself and reloads open tabs so they pick
// up the 3D build straight from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('commando-hd')) await caches.delete(k);
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    for (const t of tabs) t.navigate(t.url);
  })());
});
