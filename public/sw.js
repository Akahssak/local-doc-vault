/* Offline-capable service worker for the Local Doc Vault PWA.
   Strategy:
     - Navigations & index.html  -> NETWORK-FIRST (always get the latest app
       shell when online; fall back to cache only when offline). This prevents
       stale builds from being served after a deploy.
     - Hashed build assets (/assets/**, immutable) -> CACHE-FIRST.
     - Other same-origin GETs -> CACHE-FIRST with background fill.
   User documents live in OPFS/IndexedDB, never in this cache. */
const CACHE = 'vault-cache-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = req.mode === 'navigate';
  const isAppShellDoc = url.pathname === '/' || url.pathname === '/index.html';

  // Network-first for the app shell so new deploys show up immediately.
  if (isNavigation || isAppShellDoc) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.status === 200 && res.type === 'basic') {
            const cache = await caches.open(CACHE);
            cache.put('/index.html', res.clone());
          }
          return res;
        } catch (err) {
          const cache = await caches.open(CACHE);
          const fallback =
            (await cache.match(req)) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/'));
          if (fallback) return fallback;
          throw err;
        }
      })()
    );
    return;
  }

  // Cache-first for immutable hashed assets and everything else.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic' && isImmutableAsset(url)) {
        cache.put(req, res.clone());
      }
      return res;
    })
  );
});
