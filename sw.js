/* Murph Tracker service worker.
   Goal: every launch loads the NEWEST version when online (network-first, cache-bypassing),
   and the app still opens offline (falls back to the last cached copy). */
const VERSION = 'murph-sw-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // activate this SW immediately, don't wait for old tabs to close
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim(); // take control of already-open pages
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const isDoc = req.mode === 'navigate' || req.destination === 'document';

  if (isDoc) {
    // NETWORK-FIRST for the page itself, bypassing the HTTP cache so we always
    // pull the freshest deploy. Fall back to cache only when the network fails.
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Other GETs (Firebase SDK, Google Fonts): serve from cache if we have it,
  // otherwise fetch and cache in the background — this is what makes offline work.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
