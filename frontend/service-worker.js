  const CACHE_NAME = 'wiki48-shell-v16';
const APP_SHELL = [
  '/index.html',
  '/members.html',
  '/member.html',
  '/groups.html',
  '/stage-schedule.html',
  '/news.html',
  '/community.html',
  '/fan.html',
  '/login.html',
  '/profile.html',
  '/access-request.html',
  '/admin-login.html',
  '/admin.html',
  '/style.css',
  '/api-config.js',
  '/common.js',
  '/script.js',
  '/groups.js',
  '/member.js',
  '/stage-schedule.js',
  '/news.js',
  '/community.js',
  '/auth.js',
  '/access-request.js',
  '/admin.js',
  '/pwa.js',
  '/manifest.json',
  '/img/icon-192.svg',
  '/img/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  /* Navigasi & aset same-origin: NETWORK-FIRST.
     Dulu aset non-navigasi (style.css, common.js, script.js) memakai
     cache-first, akibatnya setelah deploy browser masih menyajikan
     CSS/JS lama dari cache sampai SW baru aktif — navbar "tidak mau"
     berubah padahal kode sudah ter-deploy. Sekarang jaringan didahulukan;
     cache hanya fallback saat offline. */
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && url.origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached
    || caches.match('/index.html'))));
});
