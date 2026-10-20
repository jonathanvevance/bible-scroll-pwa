// Offline support. The app's code is fetched from the network first so every file comes
// from the same version (mixing an old journal.js with a new app.js breaks the app); the
// cache is the offline fallback. The large Bible text is served from the cache first.
// Only runs over HTTPS (service workers need a secure origin).

const CACHE = 'bible-scroll-v30';
const ASSETS = [
  './', 'index.html', 'style.css', 'app.js', 'journal.js', 'books.js', 'bsb.json',
  'manifest.webmanifest', 'icons/cross-180.png', 'icons/cross-192.png', 'icons/cross-512.png',
];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's HTTP cache, which can still hold files from the last version.
  const fresh = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.endsWith('/bsb.json') ? cacheFirst(request) : networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request.mode === 'navigate' ? request : new Request(request, { cache: 'no-cache' }));
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error(`Offline and not cached: ${request.url}`);
  }
}
