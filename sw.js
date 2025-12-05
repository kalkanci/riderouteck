
const CACHE_NAME = 'motorota-v5'; // Version bump
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.warn("Cache incomplete", err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network First Strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Check if we got a valid response
        if (networkResponse && networkResponse.status === 200) {
           // Cache it if it's a basic request (same-origin)
           if (networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
           }
           return networkResponse;
        }

        // Handle 404 for Navigation (SPA fallback)
        if (event.request.mode === 'navigate' && networkResponse.status === 404) {
          return caches.match('./index.html');
        }

        return networkResponse;
      })
      .catch(() => {
        // Offline Fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return caches.match(event.request);
      })
  );
});
