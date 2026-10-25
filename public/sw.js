/*
 * public/sw.js
 *
 * Forge's service worker. It does two things and caches nothing:
 *
 *   push               show the notification the server sent (the weekly
 *                      plan is ready, someone commented on a draft)
 *   notificationclick  focus an open Forge window on the notification's
 *                      page, or open one
 *
 * There is deliberately no offline cache. Forge is live data end to end and
 * a stale cached shell that cannot reach the API is worse than the browser's
 * own offline page.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = { title: 'Forge', body: '', url: '/dashboard', tag: undefined };
  try {
    if (event.data) message = Object.assign(message, event.data.json());
  } catch (error) {
    if (event.data) message.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: message.tag,
      renotify: Boolean(message.tag),
      data: { url: message.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin);
  // Only ever navigate within Forge.
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && 'focus' in client) {
          return client.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target.href) : focused));
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
