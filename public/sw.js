const CACHE_NAME = "code-clash-pwa-v6";
const ASSETS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("code-clash-pwa-") && key !== CACHE_NAME).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Never return HTML for missing scripts or styles. Navigation alone has an offline fallback.
  if (request.mode === "navigate") event.respondWith(fetch(request).catch(() => caches.match("/")));
});
