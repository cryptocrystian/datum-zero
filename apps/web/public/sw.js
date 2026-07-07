/*
 * Datum Zero — Infield Validator service worker (M1-04).
 * Hand-rolled (App-Router-safe, no build plugin). Precaches a branded offline app shell and serves
 * it when a field navigation can't reach the network — the on-site tool stays usable off-grid.
 * No tenant data is cached: authenticated /field pages are always fetched fresh from the network.
 */
const CACHE = "dz-infield-v1";
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/insignia.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Best-effort per item so one missing asset never blocks registration.
      await Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Page navigations: network-first (never serve stale tenant data), fall back to the offline shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return (await caches.match("/offline.html")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Precached shell assets: cache-first so the shell renders offline.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && APP_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
  }
});
