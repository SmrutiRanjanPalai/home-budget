// ============================================
// HOME BUDGET TRACKER - Service Worker
// Version: 2.0 (V2 with Dashboard + History + Personal)
// ============================================

const CACHE_NAME = 'home-budget-v3';
const ASSETS_TO_CACHE = [
  './index.html',
  './styles.css',
  './app.js',
  './api.js',
  './manifest.json',
  './icon.svg'
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch((err) => {
      console.warn('[SW] Failed to cache some assets:', err);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and external API calls
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('script.google.com')) return;
  if (event.request.url.includes('fonts.googleapis.com')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If offline and no cache, return the main page
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
