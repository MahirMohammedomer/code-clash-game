/* Cipher Clash service worker — built for bad networks:
   - Pages: stale-while-revalidate (cached copy shows INSTANTLY, fresh
     copy downloads in the background for next time).
   - Bundled arcade games (/games/*), thumbnails & build assets:
     cache-first — after the first play they load instantly, fully offline.
   - APIs: network only (never serve stale game data).
   Bump VERSION to ship updates. */
const VERSION = "cipher-clash-v9";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Return the cached response immediately; refresh the cache in the background. */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        })
    )
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // APIs: network only (never serve stale game data)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "offline", offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // Bundled arcade games + thumbnails + build assets + fonts/icons:
  // cache-first (immutable within a version; VERSION bumps flush them).
  if (
    url.pathname.startsWith("/arcade/") ||
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|mp3|wav|ogg)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Pages & everything else: instant from cache, refresh behind the scenes.
  event.respondWith(
    staleWhileRevalidate(request, PAGE_CACHE).catch(() =>
      caches.match(request).then((r) => r || caches.match("/"))
    )
  );
});

/* --------------------------- push notifications --------------------------- */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Cipher Clash";
  const options = {
    body: data.body || "Something happened in Cipher Clash!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "cipher-clash",
    data: { url: data.url || "/" },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.postMessage({ type: "notification-click", url });
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
