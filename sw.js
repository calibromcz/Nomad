const CACHE_NAME = 'nomad-cache-v45';
const MAP_TILES_CACHE_NAME = 'nomad-map-tiles-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=45',
  './db.js?v=45',
  './app.js?v=45',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MAP_TILES_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  const url = event.request.url;

  // 1. Tasselli Mappa OpenStreetMap: Cache-First su MAP_TILES_CACHE_NAME
  if (url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(MAP_TILES_CACHE_NAME).then(async (tilesCache) => {
        const cached = await tilesCache.match(event.request);
        if (cached) return cached;
        try {
          const netRes = await fetch(event.request);
          if (netRes && netRes.status === 200) {
            tilesCache.put(event.request, netRes.clone());
          }
          return netRes;
        } catch (e) {
          return new Response('', { status: 408, statusText: 'Offline Map Tile' });
        }
      })
    );
    return;
  }

  // 2. API esterne dinamiche (MyMemory, open.er-api, Nominatim, Open-Meteo): Network-Only
  if (
    url.includes('api.mymemory.translated.net') ||
    url.includes('open.er-api.com') ||
    url.includes('@fawazahmed0/currency-api') ||
    url.includes('open-meteo.com') ||
    url.includes('nominatim.openstreetmap.org')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. Risorse App & CDN statiche: Network First per i file core dell'app (per evitare stale cache), con fallback a Cache
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
        return caches.match('./index.html');
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
