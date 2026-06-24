/* wabil service worker — receives web push and renders the poke.
 * Kept minimal: no offline caching yet (the app needs the server live anyway). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'wabil';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'wabil-poke',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // iOS web push only opens same-origin URLs from an installed PWA. Coerce any
  // out-of-scope link (e.g. an external mail link) to a same-origin path so the
  // click always lands inside wabil instead of doing nothing.
  const raw = (event.notification.data && event.notification.data.url) || '/';
  let target = '/';
  try {
    const u = new URL(raw, self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search + u.hash;
  } catch {}

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if (!c.url) continue;
        try {
          if (new URL(c.url).origin !== self.location.origin) continue;
        } catch { continue; }
        await c.focus();
        if (target !== '/' && 'navigate' in c) {
          try { await c.navigate(target); } catch {}
        }
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
