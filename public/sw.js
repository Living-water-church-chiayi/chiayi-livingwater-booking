const CACHE_NAME = 'chiayi-livingwater-pwa-v1';
const CORE_SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          CORE_SHELL_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

async function trimCacheIfNeeded(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= 45) return;
    // Remove oldest hashed asset entries while keeping core shell intact
    const removable = keys.filter((req) => req.url.includes('/assets/'));
    const excess = keys.length - 35;
    await Promise.all(removable.slice(0, Math.max(0, excess)).map((req) => cache.delete(req)));
  } catch {
    // Ignore cache pruning errors
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin APIs (Firebase/Firestore handles its own IndexedDB persistence)
  if (url.origin !== self.location.origin) return;

  // 1. Navigation / HTML shell: Network-First so new deployments always arrive immediately
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match('./index.html')) ||
            (await cache.match('./')) ||
            Response.error()
          );
        })
    );
    return;
  }

  // 2. Hashed Vite build assets (/assets/*): Cache-First (content-hashed, immutable)
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).then(() => trimCacheIfNeeded(cache));
        }
        return response;
      })
    );
    return;
  }

  // 3. Same-origin static files (icons, manifest, logo): Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkPromise = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkPromise;
    })
  );
});
