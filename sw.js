/* Service worker — offline support for the hosted build.
 *
 * Two caches:
 *   shell    precached on install: HTML, CSS, JS, icons, manifest
 *   runtime  filled on demand with the sprite sheets
 *
 * The ~130 sprite sheets are NOT listed here — duplicating the manifest from
 * assets.js would drift out of step the first time either changed. Instead the
 * page posts the exact list it loaded (see primeOfflineCache in assets.js) and
 * the 'message' handler below stores it. That also covers the first visit, where
 * the images are fetched while this worker is still installing and so never pass
 * through the fetch handler at all.
 *
 * BUMP `VERSION` whenever anything in game/ changes, or returning visitors will
 * keep running the cached copy.
 */
const VERSION = 'v44';
const SHELL = 'ts-shell-' + VERSION;
const RUNTIME = 'ts-runtime-' + VERSION;
const KEEP = [SHELL, RUNTIME];

/* Relative URLs so this works from a GitHub Pages project subpath as well as
   from a domain root. */
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './game/style.css',
  './game/gfx.js',
  './game/assets.js',
  './game/audio.js',
  './game/save.js',
  './game/themes.js',
  './game/terrain.js',
  './game/scene.js',
  './game/fx.js',
  './game/entities.js',
  './game/levels.js',
  './game/story.js',
  './game/ui.js',
  './game/game.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* Added one at a time: cache.addAll() rejects the whole install if any single
       entry fails, which would leave the site with no offline support at all. */
    await Promise.all(SHELL_FILES.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] could not precache', url, err);
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (KEEP.includes(n) ? null : caches.delete(n))));
    /* Take over open tabs so the next navigation is served by this version. The
       already-running page keeps the scripts it loaded, so nothing is disrupted
       mid-battle. */
    await self.clients.claim();
  })());
});

/* Store the sheet list the page reports after its loading screen finishes. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-assets' || !Array.isArray(data.urls)) return;

  event.waitUntil((async () => {
    const cache = await caches.open(RUNTIME);
    const have = new Set((await cache.keys()).map((r) => r.url));
    /* Relative URLs resolve against this worker's location, which sits beside
       index.html — correct at a domain root and under a project subpath alike. */
    const todo = data.urls
      .map((u) => new URL(u, self.location.href).href)
      .filter((u) => !have.has(u));
    if (!todo.length) return;

    /* Small concurrency pool: these are already in the HTTP cache, so this is
       cheap, but 130 parallel requests would still be rude. */
    let next = 0, failed = 0;
    async function worker() {
      while (next < todo.length) {
        const url = todo[next++];
        try { await cache.add(new Request(url)); } catch (err) { failed++; }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker));
    console.info('[sw] offline art cached:', todo.length - failed, 'of', todo.length);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations go to the network first so a deployed update is picked up as
     soon as the player is online, falling back to the cached shell offline. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        /* Only a SUCCESSFUL fetch of the app shell itself may refresh the cached
           shell. fetch() resolves on a 404, and any in-scope navigation lands
           here — without both checks a mistyped deep link stored the host's 404
           page (or a stray README tab stored that document) as index.html, and
           the installed PWA then booted into it offline. */
        const isShell = url.pathname.endsWith('/') ||
          url.pathname.endsWith('/index.html');
        if (fresh.ok && isShell) {
          const cache = await caches.open(SHELL);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (err) {
        return (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          Response.error();
      }
    })());
    return;
  }

  /* Everything else — scripts, styles, sprite sheets — is cache-first. These are
     immutable for a given VERSION, so there is no reason to revalidate. */
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      /* Only store real successes. Caching an error or an opaque cross-origin
         response would poison the cache for the life of this version. */
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(RUNTIME);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
