/* ============================================================
   Service worker — makes the app installable and fully offline.

   Two caches:
     SHELL   the app itself, precached on install
     RUNTIME everything else it fetches (pdf.js, the OCR engine,
             the OCR language data), cached the first time you are
             online so slip scanning works with no signal after that.

   Bump VERSION to force clients onto a new build.
   ============================================================ */
const VERSION = 'v45';
const SHELL   = 'budget-shell-' + VERSION;
const RUNTIME = 'budget-runtime-' + VERSION;

/* index.html is now the marketing/signup front door; app.html is the actual
   app. Both are precached so the whole site works offline once visited. */
const SHELL_FILES = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* Hosts whose assets we are willing to cache for offline use. */
const CDN = [
  'cdnjs.cloudflare.com',      // pdf.js + tesseract.js
  'cdn.jsdelivr.net',          // tesseract wasm core
  'unpkg.com',                 // tesseract worker fallback
  'tessdata.projectnaptha.com' // OCR language data
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    /* addAll fails the whole install if any single file 404s, so add individually */
    await Promise.all(SHELL_FILES.map(f => c.add(f).catch(err => console.warn('skip', f, err))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  /* Navigations: network first so updates land, cache as the safety net. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(SHELL);
        c.put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) ||
               new Response('Offline and nothing cached yet.', {status:503, headers:{'Content-Type':'text/plain'}});
      }
    })());
    return;
  }

  /* App files: cache first, refresh in the background. */
  if (sameOrigin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(async res => {
        if (res && res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await net) || new Response('', {status:504});
    })());
    return;
  }

  /* CDN libraries and OCR data: cache first, store on first success.
     This is what makes slip scanning work offline after one online run. */
  if (CDN.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        /* opaque responses (status 0) are still worth keeping for wasm/data */
        if (res && (res.ok || res.type === 'opaque')) {
          (await caches.open(RUNTIME)).put(req, res.clone());
        }
        return res;
      } catch (err) {
        return new Response('', {status:504});
      }
    })());
  }
});
