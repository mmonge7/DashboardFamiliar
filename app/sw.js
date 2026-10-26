// Service worker: guarda la app para que abra al instante y sin conexión.
// Los datos (calendario, luz, compra) no pasan por aquí: la app guarda su propia copia.
// Cambia VERSION en cada publicación para que los dispositivos descarguen la nueva.
const VERSION = 'casa-v11';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/store.js', 'js/api.js', 'js/ui.js', 'js/demo.js',
  'js/data/calendar.js', 'js/data/energy.js', 'js/data/weather.js', 'js/data/shopping.js', 'js/data/tariff.js', 'js/data/menu.js', 'js/data/events.js', 'js/data/diet.js', 'js/data/aisles.js',
  'js/views/common.js', 'js/views/today.js', 'js/views/calendar.js', 'js/views/energy.js',
  'js/views/shopping.js', 'js/views/settings.js', 'js/views/menu.js', 'js/views/newEvent.js', 'js/views/diet.js',
  'vendor/ical.min.js',
  'fonts/bricolage-grotesque-latin-400-normal.woff2', 'fonts/bricolage-grotesque-latin-600-normal.woff2',
  'fonts/bricolage-grotesque-latin-700-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API y servicios externos: red directa
  // Primero la red (para recibir cambios), y si no hay, la copia guardada
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
