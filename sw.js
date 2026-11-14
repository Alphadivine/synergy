/* Synergy service worker: caches the app shell and hero art so the page opens fast.
   Stats always come fresh from the Worker (the app keeps its own saved copy). */
const CACHE = 'synergy-v1.1.0';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'data.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/heroes/')) {
    // hero art: cache first
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  // app files: network first so updates show up, cache as backup
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
