/* wabil service worker — receives web push and renders the poke.
 * Kept minimal: no offline caching yet (the app needs the server live anyway). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  // no custom title: iOS already stamps the app name on every notification,
  // so the message rides as plain BODY text under it — like a real text.
  // (a title is only used when the server explicitly sends one, e.g. a
  // voiced inbox poke with a real content headline.)
  const title = data.title || '';
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
  // out-of-scope link to a same-origin path.
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
        let same = false;
        try { same = new URL(c.url).origin === self.location.origin; } catch {}
        if (!same) continue;
        // iOS ignores client.navigate(), so ask the running app to navigate
        // itself, then bring it to the foreground.
        c.postMessage({ type: 'wabil:navigate', url: target });
        await c.focus();
        return;
      }
      // App not open: a fresh window can load the target directly.
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
