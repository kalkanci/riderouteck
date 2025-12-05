
const CACHE_NAME = 'motorota-v8-stable';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './index.tsx'
];

// Install Event: Cache core files
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(console.error);
    })
  );
});

// Activate Event: Clean up old caches
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

// Fetch Event: Network First with Navigation Fallback
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // SPA Navigation Strategy: If navigation fails (404/Offline), show index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If server returns 404 or error for the page, fall back to cache
          if (!response || !response.ok) {
             return caches.match('./index.html');
          }
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Standard Asset Strategy: Network First, then Cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Update cache if successful and valid
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If offline, try cache
        return caches.match(event.request);
      })
  );
});