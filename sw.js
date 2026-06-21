const CACHE_NAME = "block-bullet-2-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./index.css",
  "./config.js",
  "./icon.png",
  "./manifest.json",
  "./src/app.js",
  "./src/audio.js",
  "./src/auth-lobby.js",
  "./src/firebase-config.js",
  "./src/game.js",
  "./src/relay.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
