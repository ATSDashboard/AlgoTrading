// Minimal service worker — shell caching only. Do NOT cache API or WS responses.
// Live trading data must always be fresh. This SW is purely for "installable PWA" behavior
// and graceful offline page.

const SHELL_CACHE = "theta-gainers-shell-v1";
const SHELL = ["/", "/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== SHELL_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API, WebSocket handshake, or auth
  if (url.pathname.startsWith("/api") ||
      url.pathname.startsWith("/ws")  ||
      url.pathname.startsWith("/auth")) {
    return;
  }
  // Navigation: network-first, offline fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html"))
    );
    return;
  }
  // Static shell: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
