
const CACHE_NAME = 'motorota-v2';
const urlsToCache = [
  './',
  './index.html'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Only cache critical static assets, ignore failures
        return cache.addAll(urlsToCache).catch(err => console.log('Cache add failed', err));
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Network First, Fallback to Cache strategy (safer for dynamic apps)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache if successful
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
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
});
