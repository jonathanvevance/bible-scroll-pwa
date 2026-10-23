// Offline support and fast launches. Every file is served from the cache, so the app opens
// without waiting for the network. A new version (a new CACHE name) downloads in the background
// and waits; it takes over on the next launch, so files from two versions never mix (an old
// module importing a new one breaks the app).
// Only runs over HTTPS (service workers need a secure origin).
// ml/sw.js is this file with the first three values below changed, written by release.py.

const APP = 'bible-scroll';
const BIBLE = 'bsb.json';
/** Where the files every language shares are, relative to this worker. */
const SHARED = '';
const VERSION = 183;
const CACHE = `${APP}-v${VERSION}`;
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', BIBLE, ...[
  'style.css',
  'books.js',
  'src/core/backup-file.js',
  'src/core/bible.js',
  'src/core/dates.js',
  'src/core/feed-model.js',
  'src/core/references.js',
  'src/data/journal.js',
  'src/data/prefs.js',
  'src/lang/current.js',
  'src/lang/en.js',
  'src/lang/ml.js',
  'src/main.js',
  'src/ui/actions.js',
  'src/ui/app-state.js',
  'src/ui/backup.js',
  'src/ui/cards.js',
  'src/ui/dom.js',
  'src/ui/feed.js',
  'src/ui/haptics.js',
  'src/ui/history.js',
  'src/ui/jump.js',
  'src/ui/liked.js',
  'src/ui/rail.js',
  'src/ui/reflect-sheet.js',
  'src/ui/reflections.js',
  'src/ui/sheets.js',
  'src/ui/study.js',
  'src/ui/tabs.js',
  'icons/scroll-180.png',
  'icons/scroll-192.png',
  'icons/scroll-512.png',
].map((file) => SHARED + file)];

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's HTTP cache, which can still hold files from the last version.
  const fresh = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(fresh)));
});

/** The version in one of this app's cache names; NaN for anything else, such as the other language's. */
const version = (name) => (name.startsWith(`${APP}-v`) ? Number(name.slice(APP.length + 2)) : NaN);

/**
 * Deletes the caches of earlier versions, and only those: a newer version may be downloading
 * into its own cache while this one still runs.
 */
async function deleteOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => version(k) < version(CACHE)).map((k) => caches.delete(k)));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

// iOS can activate a new version without finishing the clean-up above, which left every old
// version's files on the phone. So the worker also tidies up on the first request it serves.
let tidied = false;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(cacheFirst(request));
  if (!tidied) {
    tidied = true;
    event.waitUntil(deleteOldCaches());
  }
});

// Only the install step fills the cache. Anything else comes from the network and isn't kept:
// the site may already be serving the next version, and its files must not mix with this one's.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
}
