// PWA 与 Web Push 共用注册；不缓存业务行情。

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

function safeNotificationUrl(value, ruleId) {
  const scope = new URL(self.registration.scope);
  const fallback = new URL(scope.href);
  if (ruleId) fallback.searchParams.set('fundAlert', ruleId);
  try {
    const target = new URL(value || fallback.href, scope);
    return target.origin === scope.origin && target.pathname.startsWith(scope.pathname) ? target.href : fallback.href;
  } catch {
    return fallback.href;
  }
}

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload?.title || !payload?.body) return;
  const ruleId = String(payload.ruleId || '');
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: new URL('Icon-60@3x.png', self.registration.scope).href,
      tag: payload.eventId || payload.tag || ruleId || 'fund-alert-test',
      data: { ruleId, url: safeNotificationUrl(payload.url, ruleId) }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ruleId = event.notification.data?.ruleId || '';
  const url = safeNotificationUrl(event.notification.data?.url, ruleId);
  event.waitUntil(
    (async () => {
      const scope = new URL(self.registration.scope);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        const current = new URL(client.url);
        if (current.origin !== scope.origin || current.pathname !== scope.pathname) continue;
        await client.focus();
        client.postMessage({ type: 'FUND_ALERT_OPEN', ruleId });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
