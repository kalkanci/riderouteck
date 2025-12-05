
const CACHE_NAME = 'motorota-v3';

// Cache init
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate worker immediately
});

// Cache cleanup
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

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. For Navigation (HTML page load), always go Network first, then fallback to cache, then fallback to index.html
  // This fixes the "404" when opening PWA from a subdirectory or different path.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('./index.html') || caches.match('./');
        })
    );
    return;
  }

  // 2. For other assets (CSS, JS, Images) - Stale-While-Revalidate pattern is often best for apps like this, 
  // but to avoid 404s on new deploys, let's use Network First.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid response, clone and cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});
