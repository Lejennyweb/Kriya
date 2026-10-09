const CACHE = "kriya-v41";

const ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/rules.js",
  "./js/app.js",
  "./data/steps.js",
  "./fonts/fraunces-roman.woff2",
  "./fonts/fraunces-italic.woff2",
  "./fonts/outfit-latin.woff2",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  if (new URL(request.url).origin !== self.location.origin) return;

  const key = request.mode === "navigate" ? "./index.html" : request;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(key).then((byKey) => byKey || cache.match(request)).then((cached) => {
        const refresh = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(key, response.clone());
            return response;
          })
          .catch(() => cached);
        if (cached) return cached;
        return refresh.then((response) => response || new Response("", { status: 503 }));
      })
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => client.url.includes("index.html") || client.url.endsWith("/"));
      if (open) return open.focus();
      if (clients[0]) return clients[0].focus();
      return self.clients.openWindow("./");
    })
  );
});
