// 最小 Service Worker，满足 Android Chrome「添加到主屏幕」的安装条件
const CACHE_NAME = 'jigubao-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 仅针对同源 GET 请求进行处理；跨域 API 请求（如 Supabase）或非 GET 请求直接跳过，交由浏览器原生执行
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
