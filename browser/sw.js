/* FormCapy offline app shell.
 *
 * Only the pinned program files listed in the build manifest are cached.
 * Documents are created as in-memory Blobs and are never requests, so this
 * worker never sees or stores a user's paper. Unknown URLs are not cached.
 *
 * __CACHE_VERSION__ changes whenever the app version, the Pyodide version or
 * the built file digest changes; activation removes older FormCapy caches.
 */
const CACHE_NAME = "__CACHE_VERSION__";
const PRECACHE = __PRECACHE__;
const PRECACHE_SET = new Set(PRECACHE);

self.addEventListener("install", (event) => {
  // Do not skipWaiting: a new version must not take over tabs that are still
  // running the previous UI/worker and could then mix Python resources.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("formcapy-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      // No clients.claim(): existing pages keep their old worker/runtime until
      // they are closed or navigated. The new cache activates without touching
      // an open draft.
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  let key = "./" + url.pathname.slice(scope.length);
  if (request.mode === "navigate" && (key === "./" || key === "")) {
    key = "./index.html";
  }
  if (!PRECACHE_SET.has(key)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(key);
      return cached || fetch(request);
    })(),
  );
});
