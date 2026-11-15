/* Service worker (production only): offline support.
 * - Navigation requests: network first, cached copy when offline.
 * - Same-origin static assets: cache first (they are content-hashed or versioned).
 * - NASA Mars Trek imagery/terrain tiles: cache first, bounded (they never change).
 * - Other cross-origin requests (APIs, feeds) are never cached here.
 */
const CACHE = 'mars-explorer-v3';
const TILES = 'mars-explorer-tiles-v1';
const MAX_TILES = 4000;
const TILE_HOSTS = ['trek.nasa.gov', 'marshub.s3.amazonaws.com'];

async function trimTiles() {
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (TILE_HOSTS.includes(url.hostname) && /\/(tiles|mars_v14)\//.test(url.pathname)) {
    event.respondWith(
      caches.open(TILES).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) {
                cache.put(req, res.clone());
                trimTiles();
              }
              return res;
            })
        )
      )
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
