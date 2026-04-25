// FightPro Service Worker — DBP Systems
// Cache-first strategy with network fallback

const CACHE_NAME = 'fightpro-v3.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Share+Tech+Mono&display=swap'
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache core assets; font URL may fail in some environments — that's OK
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[FightPro SW] Some assets failed to cache during install:', err);
        // Cache critical assets individually so a single failure doesn't kill install
        return Promise.allSettled(
          STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[FightPro SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Strategy: Cache First, fallback to Network, then Offline page
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Serve from cache; revalidate in background (stale-while-revalidate for HTML)
        if (request.destination === 'document' || url.pathname.endsWith('.html')) {
          fetch(request).then(networkRes => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(request, networkRes.clone()));
            }
          }).catch(() => {});
        }
        return cached;
      }

      // Not in cache — try network
      return fetch(request).then(networkRes => {
        if (!networkRes || networkRes.status !== 200 || networkRes.type === 'opaque') {
          return networkRes;
        }
        // Cache the fresh response
        const toCache = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        return networkRes;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// ── BACKGROUND SYNC (future-proof) ───────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-training-data') {
    console.log('[FightPro SW] Background sync triggered');
    // Placeholder for future server sync
  }
});

// ── PUSH NOTIFICATIONS (future-proof) ────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'FightPro', {
      body: data.body || 'Time to train.',
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'fightpro-notification',
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
