// Guarda los archivos de la app para que abra rápido. Siempre intenta primero la versión
// más nueva de internet; si no hay conexión, usa la guardada. Nunca guarda tus datos.
const CACHE = 'mis-finanzas-v1';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/config.js', 'js/vendor/supabase.js',
  'manifest.webmanifest', 'icons/icono-180.png', 'icons/icono-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // datos: siempre a internet
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
