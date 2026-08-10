const CACHE_NAME = "fastbar-shell-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/abrir",
  // Add your generated asset paths here (Vite outputs in /assets)
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass for API calls and server-fns (keep network behavior for auth/session)
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_start") ||
    url.pathname.startsWith("/rpc") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/api")
  ) {
    return;
  }

  // navigation requests: network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))),
    );
    return;
  }

  // static assets: cache-first
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            try {
              if (
                request.method === "GET" &&
                res &&
                res.status === 200 &&
                request.destination !== "document"
              ) {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              }
            } catch (e) {}
            return res;
          })
          .catch(() => cached),
    ),
  );
});
