/* shoponclick PWA service worker — installability + offline shell only.
   Do not cache every same-origin GET; that cache grows without a cap. */
const CACHE = "dukanonclick-v8";
const PRECACHE = ["/", "/manifest.webmanifest", "/pwa-192x192.png", "/pwa-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept cross-origin (Neon Auth / Data API) — PWA standalone + SW
  // can break credentialed session cookies and get-session responses.
  if (url.origin !== self.location.origin) return;

  // Navigations: network only, fall back to the cached shell when offline.
  // Scripts, styles, and API calls stay on the network / HTTP cache.
  if (request.mode !== "navigate") return;

  event.respondWith(fetch(request).catch(() => caches.match("/")));
});
