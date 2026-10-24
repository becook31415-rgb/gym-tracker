// Service worker: precache the whole app, serve it cache-first, and wait for the
// user to tap "Update available" before switching to a new version.
// The GitHub Pages workflow stamps VERSION with the commit id on every deploy, which
// is what makes phones notice a new version. Locally it stays 'dev'.

const VERSION = 'dev'; // replaced with the commit id by the deploy workflow
const CACHE = `gym-tracker-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/units.js',
  'js/pb.js',
  'js/history.js',
  'js/program.js',
  'js/csv.js',
  'js/export.js',
  'js/exporter.js',
  'data/sample-program.json',
  'data/sample-history.json',
  'templates/program-template.json',
  'templates/program-template.csv',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the browser HTTP cache so a new version gets fresh files
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gym-tracker-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      // Any page load (including a cold start from the Home Screen icon) gets the cached shell.
      return (await cache.match('index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  })());
});
