const IMMUTABLE_CACHE = 'film-collection-immutable-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== IMMUTABLE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // ⚡ Bolt: Cache-first for content-hashed Vite assets and immutable uploaded cover images
  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/uploads/'))) {
    event.respondWith(
      caches.open(IMMUTABLE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          void cache.put(event.request, response.clone());
        }
        return response;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((response) => response || Response.error())),
  );
});
