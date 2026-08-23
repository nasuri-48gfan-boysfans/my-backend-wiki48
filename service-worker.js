const CACHE_NAME = 'wiki48-shell-v6';
const APP_SHELL = [
  '/index.html',
  '/members.html',
  '/member.html',
  '/groups.html',
  '/schedule.html',
  '/news.html',
  '/community.html',
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
  '/schedule.js',
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

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html'))));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && url.origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
