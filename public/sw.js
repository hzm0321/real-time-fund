// 最小 Service Worker，满足 Android Chrome「添加到主屏幕」的安装条件
const CACHE_NAME = 'jigubao-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
