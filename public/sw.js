/* Cipher Clash service worker — built for bad networks & FULL offline play:
   - Pages: stale-while-revalidate (cached copy shows INSTANTLY, fresh
     copy downloads in the background for next time).
   - Bundled arcade games (/games/*), thumbnails & build assets:
     cache-first — after the first play they load instantly, fully offline.
   - APIs: network only (never serve stale game data) with a JSON offline
     response so the app can show friendly offline states.
   - The app "warms" the offline cache after every online visit by sending
     every URL it loaded (CACHE_URLS message) — so after ONE online session
     the whole app, every tab and every arcade game works with zero network.
   Bump VERSION to ship updates. */
const VERSION = "cipher-clash-v9";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon-64.png",
];

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

/** Cache a batch of URLs the app reports as loaded (offline warm-up). */
async function cacheUrls(urls) {
  const cache = await caches.open(STATIC_CACHE);
  const pageCache = await caches.open(PAGE_CACHE);
  await Promise.all(
    urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin) return;
        if (url.pathname.startsWith("/api/")) return;
        const target = /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|mp3|wav|ogg)$/.test(url.pathname) ||
          url.pathname.startsWith("/games/") ||
          url.pathname.startsWith("/arcade/") ||
          url.pathname.startsWith("/_next/static/")
          ? cache
          : pageCache;
        const hit = await target.match(url.href);
        if (hit) return;
        const res = await fetch(url.href, { cache: "no-cache" }).catch(() => null);
        if (res && (res.status === 200 || res.type === "opaque")) target.put(url.href, res);
      } catch {}
    })
  );
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(cacheUrls(data.urls));
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // APIs: network only (never serve stale game data) — offline gets clean JSON.
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
    url.pathname.startsWith("/games/") ||
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
