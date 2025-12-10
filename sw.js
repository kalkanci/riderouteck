
const CACHE_NAME = 'motorota-v11-production';

// Critical static assets
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/client',
  'https://aistudiocdn.com/react@^19.2.0/jsx-runtime',
  'https://aistudiocdn.com/lucide-react@^0.555.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/',
  'https://aistudiocdn.com/react@^19.2.0/'
];

// Install Event: Cache core files immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.error("Cache add failed", err));
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

// Fetch Event: Stale-While-Revalidate with Navigation Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback for navigation (SPA support)
          if (event.request.mode === 'navigate') {
            return cache.match('./index.html');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
