/* service-worker.js - versioned offline cache. GDD v2.3 sections 3.2, 24.1.
   Bump CACHE on every release so an old shell cannot survive an update. */
const CACHE = "hlc-v2.3.3";

/* Cache-first is right for a deployed PWA and wrong while developing: an edited
   stylesheet stays invisible until CACHE changes. Serve localhost straight from
   the network so local edits always show up on reload. */
const DEV = ["localhost", "127.0.0.1", ""].includes(self.location.hostname);
const ASSETS = ["./","index.html","styles.css","hybrid.css","config.js",
                "telemetry.js","game.js","hybrid-model.js","hybrid-ui.js",
                "manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;                 // never cache telemetry POSTs
  if (DEV) return;                                        // local dev always hits the network
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
