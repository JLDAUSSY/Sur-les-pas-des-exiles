// Service Worker PWA — Sur les pas des exilés à Sanary (technologie RandoTracker)
// Cache applicatif (Network-First), médias audio/photo (Cache-First) et tuiles cartographiques (Cache-First).

const APP_CACHE = 'sanary-exiles-app-v18';
const MEDIA_CACHE = 'sanary-exiles-media-v18';
const TILE_CACHE = 'sanary-exiles-tiles-v1';

const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/etapes.js',
  './data/i18n.js',
  './data/i18n_steps.js',
  './images/icon.svg'
];

const MEDIA_ASSETS = [
  './images/etape-01.jpg',
  './images/etape-02.jpg',
  './images/etape-03.jpg',
  './images/etape-04.jpg',
  './images/etape-05.jpg',
  './images/etape-06.jpg',
  './images/etape-07.jpg',
  './images/etape-08.jpg',
  './images/etape-09.jpg',
  './images/etape-10.jpg',
  './images/etape-11.jpg',
  './images/etape-12.jpg',
  './images/etape-13.jpg',
  './audio/intro-peer-gynt.mp3',
  './audio/etape-01.mp3',
  './audio/etape-02.mp3',
  './audio/etape-03.mp3',
  './audio/etape-04.mp3',
  './audio/etape-05.mp3',
  './audio/etape-06.mp3',
  './audio/etape-07.mp3',
  './audio/etape-08.mp3',
  './audio/etape-09.mp3',
  './audio/etape-10.mp3',
  './audio/etape-11.mp3',
  './audio/etape-12.mp3',
  './audio/etape-13.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_CACHE).then((cache) => cache.addAll(APP_ASSETS)),
      caches.open(MEDIA_CACHE).then((cache) =>
        Promise.allSettled(MEDIA_ASSETS.map((url) => cache.add(url)))
      )
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const valid = new Set([APP_CACHE, MEDIA_CACHE, TILE_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isTileUrl(url) {
  return (
    url.hostname.includes('data.geopf.fr') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1. Tuiles cartographiques : Cache-First (hors-ligne instantané)
  if (isTileUrl(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req)
            .then((res) => {
              if (res && res.status === 200) {
                cache.put(req, res.clone());
              }
              return res;
            })
            .catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // 2. Audio MP3 & Photos locales : Cache-First (en évitant les requêtes Range partielles qui perturbent le cache)
  if (url.origin === self.location.origin && (url.pathname.includes('/audio/') || url.pathname.includes('/images/'))) {
    if (req.headers.has('range')) {
      return; // Laisse le navigateur gérer les Range requests normalement
    }
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone());
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // 3. Fichiers applicatifs : Network-First avec repli cache hors-ligne
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
