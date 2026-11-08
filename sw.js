/* BEJHERRO — service worker
   - Guarda la "carcasa" de la app para que abra sin conexión.
   - NO toca el audio ni las peticiones a otras webs (Internet Archive, Jamendo):
     así no se rompen el avance/retroceso dentro de una canción ni se llena la caché.
   - index.html se pide primero a la red (si hay), así siempre recibes la última versión.
   - Solo borra SUS cachés: manuelvs8.github.io es compartido con tus otras apps. */
const PREFIX = 'bejherro-music-';
const VERSION = PREFIX + 'v2.1.1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // audio y APIs externas: directo a la red
  if (req.headers.has('range')) return;                  // nunca interceptar audio por rangos

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(req, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) { const c = await caches.open(VERSION); c.put('./index.html', res.clone()); }
        return res;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok && SHELL.some(s => url.pathname.endsWith(s.replace('./', '/')))) caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit || Response.error());
    return hit || net;
  })());
});
