// Service worker: a small background script that saves a copy of the game's files in the
// browser, so the game can open as an installed app and still work when the internet drops.
const CACHE = "localbus-v4.4";

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([
    "./",
    "./index.html",
    "./css/tokens.css?v=4.0",
    "./css/style.css?v=4.0",
    "./css/menu.css?v=4.0",
    "./fonts/atma-700-bengali.woff2",
    "./fonts/notosansbengali-bengali.woff2",
    "./js/rickshawModel.js",
    "./models/rickshaw.glb",
    "./js/carModel.js",
    "./js/SkeletonUtils.js",
    "./models/hiace.glb",
    "./models/hiace_2004.glb",
    "./models/corolla.glb",
    "./models/fielder.glb"
  ])));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Network-first strategy: always fetches your latest Live Server edits first, falling back to cache offline.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

