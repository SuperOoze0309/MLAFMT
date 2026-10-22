/* FormCapy offline app shell.
 *
 * Only the pinned program files listed in the build manifest are cached.
 * Documents are created as in-memory Blobs and are never requests, so this
 * worker never sees or stores a user's paper. Unknown URLs are not cached.
 *
 * __CACHE_VERSION__ changes whenever the app version, the Pyodide version,
 * this template or the built file digest changes; activation removes older
 * FormCapy caches.
 */
const CACHE_NAME = "__CACHE_VERSION__";
const PRECACHE = __PRECACHE__;
const PRECACHE_SET = new Set(PRECACHE);
const BROKEN_REDIRECT_CACHE = "formcapy-2.4.0-pyodide-314.0.7-f7d959ab5df8";
const UPDATE_REQUEST = "FORMCAPY_ACTIVATE_UPDATE";

// Only a page which has asked its user to save may request this transition.
// A second open app window prevents activation: an update must not replace
// another page's worker while it may still be loading the old runtime.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== UPDATE_REQUEST ||
      event.data.confirmed !== true || !event.ports || !event.ports[0]) return;
  const port = event.ports[0];
  const answer = (status) => port.postMessage({ type: UPDATE_REQUEST, status });
  event.waitUntil((async () => {
    try {
      const source = event.source;
      if (!source || typeof source.id !== "string" || !source.id ||
          source.type !== "window" || typeof source.url !== "string") {
        answer("unavailable"); return;
      }
      const scope = new URL(self.registration.scope);
      const sourceURL = new URL(source.url);
      if (sourceURL.origin !== scope.origin || !sourceURL.pathname.startsWith(scope.pathname)) {
        answer("unavailable"); return;
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const scoped = windows.filter((client) => {
        try {
          const url = new URL(client.url);
          return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
        } catch (_) { return false; }
      });
      if (!scoped.some((client) => client.id === source.id)) {
        answer("unavailable"); return;
      }
      if (scoped.some((client) => client.id !== source.id)) {
        answer("other-tabs"); return;
      }
      await self.skipWaiting();
      answer("activating");
    } catch (_) { answer("unavailable"); }
  })());
});

function withoutRedirect(response) {
  // CacheStorage preserves the redirected flag after a fetch follows a
  // canonical URL redirect. Navigation requests use redirect: "manual" and
  // cannot be fulfilled with that flagged Response (for example when a host
  // redirects /index.html to /). Preserve its bytes and headers, not the flag.
  return response.redirected
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
      // One repair exception for the first public 2.4.0 cache: its redirected
      // home Response can prevent new navigations. This repair changes only
      // SW/cache handling; the program and Python runtime bytes are unchanged.
      // Activate only after the replacement cache is complete and that exact
      // broken key exists. Ordinary upgrades keep waiting to avoid mixing
      // different program/runtime versions in open tabs; never broaden this
      // condition to a version prefix or an unknown cache.
      if ((await caches.keys()).includes(BROKEN_REDIRECT_CACHE)) {
        await self.skipWaiting();
      }
    })(),
  );
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
      // No clients.claim(), navigation or reload: loaded pages and their
      // in-memory drafts remain intact, including during the targeted repair.
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
  if (request.mode === "navigate" && (key === "./" || key === "./index.html")) {
    key = "./";
  }
  if (!PRECACHE_SET.has(key)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(key);
      return withoutRedirect(cached || (await fetch(request)));
    })(),
  );
});
