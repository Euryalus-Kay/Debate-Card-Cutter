/*
 * Clash service worker: keeps the app usable on bad tournament Wi-Fi.
 *
 * - App code (/_next/static, hashed and immutable): cache first.
 * - Pages: network first with a short timeout, falling back to the last copy
 *   of that page; unknown pages fall back to /offline.html.
 * - Round and library data (selected GET APIs): network first, falling back
 *   to the last response, so an open round still renders offline.
 * - Never cached: auth, sync, AI, uploads, and any non-GET request. Edits made
 *   offline are queued in IndexedDB by the app and sent when back online.
 *
 * Caches are cleared on sign-out (message "clear").
 */
const VERSION = "clash-sw-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DATA = `${VERSION}-data`;

const DATA_ROUTES = [
  /^\/api\/rounds(\/[^/]+)?$/,
  /^\/api\/rounds\/[^/]+\/ai-ops$/,
  /^\/api\/cards(\/[^/]+)?$/,
  /^\/api\/cards\/batch$/,
  /^\/api\/uploads\/[^/]+$/,
  /^\/api\/me\/settings$/,
  /^\/api\/teams$/,
  /^\/api\/research\/jobs(\/[^/]+)?$/,
  /^\/api\/docs\/[^/]+\/versions$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll(["/offline.html", "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") {
    event.waitUntil(
      (async () => {
        for (const key of await caches.keys()) if (key.startsWith("clash-sw")) await caches.delete(key);
      })(),
    );
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/** Network first; cache successful responses; fall back to the cache after `ms` or on failure. */
async function networkFirst(event, cacheName, ms, key) {
  const cache = await caches.open(cacheName);
  const network = fetch(event.request).then((res) => {
    // Don't cache redirects (e.g. to /login) or errors.
    if (res.ok && !res.redirected && res.type === "basic") cache.put(key, res.clone());
    return res;
  });
  // Let a slow network response still refresh the cache after we answered from it.
  event.waitUntil(network.catch(() => undefined));
  try {
    return await withTimeout(network, ms);
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    try {
      return await network;
    } catch {
      return null;
    }
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/dev/")) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (!DATA_ROUTES.some((r) => r.test(url.pathname))) return;
    event.respondWith(
      networkFirst(event, DATA, 5000, request).then(
        (res) => res || new Response(JSON.stringify({ error: "You're offline and this data isn't saved on this device yet." }), { status: 503, headers: { "content-type": "application/json" } }),
      ),
    );
    return;
  }

  // Router data requests (RSC payloads) depend on the client's router state; don't serve them from
  // cache. If they fail offline, Next falls back to a full page load, which the branch below serves.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      networkFirst(event, PAGES, 3500, key).then(async (res) => res || (await caches.match("/offline.html")) || new Response("Offline", { status: 503 })),
    );
  }
});
