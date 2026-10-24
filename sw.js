/* AI Collector Pro: offline-first app shell.
 * Only same-origin static app assets are cached. Auth and Storage API requests
 * are always network-only and are never stored in Cache Storage.
 */
const CACHE_PREFIX = 'ai-collector-pro-shell-';
const CACHE_VERSION = 'v1';
const SHELL_CACHE = CACHE_PREFIX + CACHE_VERSION;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Avoid failing the entire installation if GitHub Pages doesn't expose
    // one optional path; install the rest of the shell in that case.
    await Promise.all(APP_SHELL.map(async (path) => {
      try {
        const response = await fetch(new Request(path, { cache: 'reload' }));
        if (response.ok && response.type !== 'opaque') {
          await cache.put(path, response);
        }
      } catch (_) {
        // Offline installation is not possible until the shell was visited online.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Supabase Auth or Storage calls. Push/Pull require a live
  // connection and response bodies may contain private collection data/tokens.
  if (url.origin !== self.location.origin ||
      /\/auth\/v1\//i.test(url.pathname) ||
      /\/storage\/v1\//i.test(url.pathname) ||
      request.cache === 'no-store') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('./index.html', networkResponse.clone());
        }
        return networkResponse;
      } catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('AI Collector Pro belum tersimpan untuk offline. Buka halaman saat online satu kali terlebih dahulu.', {
                 status: 503,
                 headers: { 'Content-Type': 'text/plain; charset=utf-8' }
               });
      }
    })());
    return;
  }

  // Cache-first for same-origin app shell files only. Unknown paths fall back
  // to the network and are not cached, preventing accidental API/data caching.
  const isShellFile = APP_SHELL.some((path) => {
    const shellUrl = new URL(path, self.registration.scope);
    return shellUrl.href === url.href;
  });
  if (!isShellFile) return;

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request) || await cache.match(url.href);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return new Response('Aset aplikasi belum tersedia offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
