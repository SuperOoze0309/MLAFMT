// Isolated service-worker behavior checks; no browser, network, or app writes.
// node browser/test/service_worker_redirect_test.mjs [template-or-built-sw]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const sourcePath = process.argv[2] || fileURLToPath(new URL('../../browser/sw.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const fixturePrecache = ['./', './static/app.js', './runtime/core.wasm'];
const badCacheName = 'formcapy-2.4.0-pyodide-314.0.7-f7d959ab5df8';
const cacheDeclaration = source.match(/const\s+CACHE_NAME\s*=\s*("(?:[^"\\]|\\.)*")\s*;/);
const precacheDeclaration = source.match(/const\s+PRECACHE\s*=\s*(__PRECACHE__|\[[\s\S]*?\])\s*;/);
assert(cacheDeclaration, 'worker must declare a JSON string CACHE_NAME');
assert(precacheDeclaration, 'worker must declare PRECACHE as build marker or JSON array');
const declaredCacheName = JSON.parse(cacheDeclaration[1]);
const cacheName = declaredCacheName === '__CACHE_VERSION__' ? 'formcapy-vm-redirect-check' : declaredCacheName;
const declaredPrecache = precacheDeclaration[1] === '__PRECACHE__' ? null : JSON.parse(precacheDeclaration[1]);
// Parse a built worker's real declarations before replacing only its asset list
// with the small fixture; the build marker is not required to still exist.
const rendered = source.replace(cacheDeclaration[0], `const CACHE_NAME = ${JSON.stringify(cacheName)};`)
  .replace(precacheDeclaration[0], `const PRECACHE = ${JSON.stringify(fixturePrecache)};`);
const environments = [];

function redirectedResponse(body = 'redirected home', options = {}) {
  const response = new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', 'X-Probe': 'retained' }, ...options });
  function mark(value) {
    const nativeClone = value.clone.bind(value);
    Object.defineProperty(value, 'redirected', { value: true });
    Object.defineProperty(value, 'clone', { value: () => mark(nativeClone()) });
    return value;
  }
  return mark(response);
}

function setup({ scope = 'https://formcapy.example/', network, existingCaches = [], windows } = {}) {
  const handlers = new Map();
  const cachesByName = new Map();
  const fetchCalls = [];
  const cacheMatches = [];
  const added = [];
  const timeline = [];
  const skipWaitingCalls = [];
  const forbiddenClientCalls = [];
  const updateReplies = [];
  const clientQueries = [];
  let inUpdateRequest = false;
  environments.push({ forbiddenClientCalls });
  function forbidden(name) {
    forbiddenClientCalls.push(name);
    throw new Error(`worker must not force a page operation: ${name}`);
  }
  const absolute = (key) => new URL(typeof key === 'string' ? key : key.url, scope).href;
  const fetcher = async (request) => {
    const url = typeof request === 'string' ? absolute(request) : request.url;
    fetchCalls.push(url);
    return network ? network(url, request) : new Response(url.endsWith('/') ? 'home' : 'asset');
  };
  const caches = {
    async open(name) {
      if (!cachesByName.has(name)) {
        const entries = new Map();
        cachesByName.set(name, {
          entries,
          async addAll(keys) {
            timeline.push('precache-start');
            added.push(...keys);
            for (const key of keys) {
              const response = await fetcher({ url: absolute(key), method: 'GET', mode: 'cors' });
              assert.equal(response.ok, true, 'precache fetch must succeed');
              entries.set(absolute(key), response.clone());
            }
            timeline.push('precache-complete');
          },
          async match(key) {
            cacheMatches.push(key);
            return entries.get(absolute(key))?.clone();
          },
        });
      }
      return cachesByName.get(name);
    },
    async keys() { timeline.push('cache-keys'); return [...cachesByName.keys()]; },
    async delete(name) { return cachesByName.delete(name); },
  };
  const self = {
    location: Object.assign(new URL(scope), { reload: () => forbidden('location.reload') }),
    registration: { scope },
    clients: {
      claim: () => forbidden('clients.claim'),
      matchAll: async (options) => {
        if (!inUpdateRequest) return forbidden('clients.matchAll');
        clientQueries.push(options);
        return windows || [{ id: 'requesting-tab', url: scope, type: 'window' }];
      },
      openWindow: () => forbidden('clients.openWindow'),
    },
    async skipWaiting() { timeline.push('skip-waiting'); skipWaitingCalls.push(timeline.length - 1); },
    addEventListener(name, handler) { handlers.set(name, handler); },
  };
  const context = vm.createContext({ self, caches, fetch: fetcher, URL, Response, Request, Headers, Set, Promise, console });
  vm.runInContext(rendered, context, { filename: sourcePath });
  return {
    handlers, caches, cachesByName, fetchCalls, cacheMatches, added, scope,
    timeline, skipWaitingCalls, forbiddenClientCalls,
    updateReplies, clientQueries,
    async message(data, { source = { id: 'requesting-tab', url: scope, type: 'window' }, withPort = true } = {}) {
      let pending;
      inUpdateRequest = true;
      try {
        handlers.get('message')({
          data, source,
          ports: withPort ? [{ postMessage(value) { updateReplies.push(value); } }] : [],
          waitUntil(value) { pending = value; },
        });
        await pending;
      } finally { inUpdateRequest = false; }
    },
    async install() {
      for (const key of existingCaches) await caches.open(key);
      let pending;
      handlers.get('install')({ waitUntil(value) { pending = value; } });
      await pending;
    },
    async fetch(path, { mode = 'navigate', method = 'GET' } = {}) {
      let response;
      let intercepted = false;
      handlers.get('fetch')({
        request: { url: new URL(path, scope).href, method, mode },
        respondWith(value) { intercepted = true; response = value; },
      });
      return { intercepted, response: intercepted ? await response : undefined };
    },
  };
}

const checks = [];
async function check(name, fn) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('check did not settle within 5 seconds')), 5000); }),
    ]);
    checks.push({ name, passed: true }); console.log(`PASS ${name}`);
  }
  catch (error) { checks.push({ name, passed: false, error: error.stack }); console.log(`FAIL ${name}: ${error.message}`); }
  finally { clearTimeout(timer); }
}

await check('install precaches canonical root without ./index.html', async () => {
  if (declaredPrecache) {
    assert(Array.isArray(declaredPrecache));
    assert(declaredPrecache.includes('./'), 'built precache must include canonical root');
    assert(!declaredPrecache.includes('./index.html'), 'built precache must not include redirecting index.html');
  }
  const env = setup();
  await env.install();
  assert(env.added.includes('./'));
  assert(!env.added.includes('./index.html'));
  assert.equal(env.added.filter((key) => key === './').length, 1);
});

await check('root navigation and /index.html use the same canonical cache key', async () => {
  const env = setup();
  await env.install();
  const before = env.fetchCalls.length;
  for (const path of ['/', '/index.html', '/?launch=1', '/index.html?launch=1']) {
    const result = await env.fetch(path);
    assert(result.intercepted);
    assert.equal(await result.response.text(), 'home');
    assert.equal(env.cacheMatches.at(-1), './');
  }
  assert.equal(env.fetchCalls.length, before);
});

await check('cached redirected root becomes a fresh nonredirected navigation Response', async () => {
  const env = setup({ network: (url) => url.endsWith('/') ? redirectedResponse('cached redirect') : new Response('asset') });
  await env.install();
  for (const path of ['/', '/index.html']) {
    const { response } = await env.fetch(path);
    assert.equal(response.redirected, false);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Probe'), 'retained');
    assert.equal(await response.text(), 'cached redirect');
  }
});

await check('network fallback following /index.html to / is navigation safe', async () => {
  const env = setup({ network: (url) => {
    assert.equal(new URL(url).pathname, '/index.html');
    return redirectedResponse('network canonical redirect');
  } });
  const { intercepted, response } = await env.fetch('/index.html');
  assert(intercepted);
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get('Content-Type'), 'text/html');
  assert.equal(await response.text(), 'network canonical redirect');
});

await check('ordinary cached assets preserve bytes and nonredirected response metadata', async () => {
  const env = setup({ network: (url) => new Response(url.endsWith('.wasm') ? new Uint8Array([0, 97, 115, 109]) : 'asset', {
    status: 200, headers: { 'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' },
  }) });
  await env.install();
  const before = env.fetchCalls.length;
  const wasm = await env.fetch('/runtime/core.wasm', { mode: 'cors' });
  assert(wasm.intercepted);
  assert.equal(wasm.response.headers.get('Content-Type'), 'application/wasm');
  assert.deepEqual([...new Uint8Array(await wasm.response.arrayBuffer())], [0, 97, 115, 109]);
  assert.equal(env.fetchCalls.length, before);
});

await check('ordinary asset network fallback follows the original request', async () => {
  const env = setup({ network: (url) => new Response(`fallback:${url}`) });
  const result = await env.fetch('/static/app.js?version=2', { mode: 'cors' });
  assert(result.intercepted);
  assert.equal(await result.response.text(), 'fallback:https://formcapy.example/static/app.js?version=2');
  assert.equal(env.cacheMatches.at(-1), './static/app.js');
});

await check('unknown same-origin URLs are not intercepted or fetched', async () => {
  const env = setup();
  assert.equal((await env.fetch('/unknown')).intercepted, false);
  assert.equal((await env.fetch('/missing.wasm', { mode: 'cors' })).intercepted, false);
  assert.equal(env.fetchCalls.length, 0);
  assert.equal(env.cachesByName.size, 0);
});

await check('cross-origin known paths are not intercepted', async () => {
  const env = setup();
  assert.equal((await env.fetch('https://other.example/static/app.js', { mode: 'cors' })).intercepted, false);
  assert.equal(env.fetchCalls.length, 0);
});

await check('POST to known assets or home is not intercepted', async () => {
  const env = setup();
  assert.equal((await env.fetch('/', { method: 'POST' })).intercepted, false);
  assert.equal((await env.fetch('/static/app.js', { method: 'POST', mode: 'cors' })).intercepted, false);
  assert.equal(env.fetchCalls.length, 0);
});

await check('subdirectory scope canonicalizes home and excludes outside paths', async () => {
  const env = setup({ scope: 'https://formcapy.example/app/' });
  await env.install();
  assert.equal((await env.fetch('/static/app.js', { mode: 'cors' })).intercepted, false);
  assert.equal((await env.fetch('/application/static/app.js', { mode: 'cors' })).intercepted, false);
  for (const path of ['/app/', '/app/index.html']) {
    const result = await env.fetch(path);
    assert(result.intercepted);
    assert.equal(await result.response.text(), 'home');
    assert.equal(env.cacheMatches.at(-1), './');
  }
});

await check('network failure is propagated without creating an empty page or cache entry', async () => {
  const expected = new Error('offline with no shell');
  const env = setup({ network: () => { throw expected; } });
  await assert.rejects(env.fetch('/'), (error) => error === expected);
  const cache = await env.caches.open(cacheName);
  assert.equal(cache.entries.size, 0);
});

await check('activation deletes only older FormCapy caches', async () => {
  const env = setup();
  await env.caches.open(cacheName);
  await env.caches.open('formcapy-old');
  await env.caches.open('unrelated-app');
  let pending;
  env.handlers.get('activate')({ waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual((await env.caches.keys()).sort(), [cacheName, 'unrelated-app'].sort());
});

await check('fresh install does not skip waiting', async () => {
  const env = setup();
  await env.install();
  assert.equal(env.skipWaitingCalls.length, 0);
});

await check('unknown previous cache does not skip waiting', async () => {
  const env = setup({ existingCaches: ['formcapy-unknown-version', 'unrelated-app'] });
  await env.install();
  assert.equal(env.skipWaitingCalls.length, 0);
});

await check('similar prefixes and suffixes do not trigger the exact cache migration', async () => {
  const env = setup({ existingCaches: [`prefix-${badCacheName}`, `${badCacheName}-suffix`, `${badCacheName.slice(0, -1)}0`] });
  await env.install();
  assert.equal(env.skipWaitingCalls.length, 0);
});

await check('the exact broken cache skips waiting once only after complete precaching', async () => {
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const atLastAsset = new Promise((resolve) => { entered = resolve; });
  const env = setup({
    existingCaches: [badCacheName, 'formcapy-unknown-version'],
    network: async (url) => {
      if (url.endsWith('.wasm')) { entered(); await gate; }
      return new Response('migration fixture');
    },
  });
  const installation = env.install();
  await atLastAsset;
  assert.equal(env.skipWaitingCalls.length, 0, 'must not take over during partial precache');
  assert(!env.timeline.includes('precache-complete'));
  release();
  await installation;
  assert.equal(env.skipWaitingCalls.length, 1);
  assert(env.timeline.indexOf('precache-complete') < env.timeline.indexOf('skip-waiting'));
});

await check('the exact broken cache cannot skip waiting if precaching fails', async () => {
  const expected = new Error('precache asset unavailable');
  const env = setup({
    existingCaches: [badCacheName],
    network: (url) => { if (url.endsWith('.wasm')) throw expected; return new Response('partial fixture'); },
  });
  await assert.rejects(env.install(), (error) => error === expected);
  assert.equal(env.skipWaitingCalls.length, 0);
  assert(!env.timeline.includes('precache-complete'));
});

await check('install, migration and activation do not claim clients, navigate or reload pages', async () => {
  assert(environments.length > 0);
  for (const env of environments) assert.deepEqual(env.forbiddenClientCalls, []);
});

const updateMessage = { type: 'FORMCAPY_ACTIVATE_UPDATE', confirmed: true };
await check('explicit update asks only for scoped windows and activates the requesting page', async () => {
  const env = setup();
  await env.install();
  await env.message(updateMessage);
  assert.equal(env.skipWaitingCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(env.clientQueries)), [{ type: 'window', includeUncontrolled: true }]);
  assert.equal(env.updateReplies.at(-1).status, 'activating');
  assert.deepEqual(env.forbiddenClientCalls, []);
});

await check('another same-scope page prevents explicit activation without touching it', async () => {
  const env = setup({ windows: [
    { id: 'requesting-tab', url: 'https://formcapy.example/' },
    { id: 'another-draft', url: 'https://formcapy.example/index.html?draft=1' },
  ] });
  await env.message(updateMessage);
  assert.equal(env.skipWaitingCalls.length, 0);
  assert.equal(env.updateReplies.at(-1).status, 'other-tabs');
  assert.deepEqual(env.forbiddenClientCalls, []);
});

await check('unrelated origins and paths outside a subdirectory scope do not block update', async () => {
  const env = setup({ scope: 'https://formcapy.example/app/', windows: [
    { id: 'requesting-tab', url: 'https://formcapy.example/app/' },
    { id: 'other-app', url: 'https://formcapy.example/other/' },
    { id: 'similar', url: 'https://formcapy.example/application/' },
    { id: 'third-party', url: 'https://elsewhere.example/app/' },
    { id: 'malformed', url: 'not a URL' },
  ] });
  await env.message(updateMessage);
  assert.equal(env.skipWaitingCalls.length, 1);
  assert.equal(env.updateReplies.at(-1).status, 'activating');
});

await check('unknown messages and requests without confirmed user action or response port are ignored', async () => {
  const env = setup();
  for (const data of [null, {}, { type: 'SKIP_WAITING' }, { type: 'FORMCAPY_ACTIVATE_UPDATE' },
    { type: 'FORMCAPY_ACTIVATE_UPDATE', confirmed: 'true' }]) await env.message(data);
  await env.message(updateMessage, { withPort: false });
  assert.equal(env.skipWaitingCalls.length, 0);
  assert.equal(env.clientQueries.length, 0);
  assert.equal(env.updateReplies.length, 0);
});

await check('an unverified, external or non-window request cannot activate the worker', async () => {
  const env = setup({ scope: 'https://formcapy.example/app/' });
  for (const source of [null, {}, { id: '', url: env.scope, type: 'window' },
    { id: 'requesting-tab', url: env.scope, type: 'sharedworker' },
    { id: 'requesting-tab', url: 'https://elsewhere.example/app/', type: 'window' },
    { id: 'requesting-tab', url: 'https://formcapy.example/application/', type: 'window' },
    { id: 'requesting-tab', url: 'not a URL', type: 'window' }]) {
    await env.message(updateMessage, { source });
    assert.equal(env.updateReplies.at(-1).status, 'unavailable');
  }
  assert.equal(env.skipWaitingCalls.length, 0);
});

await check('a requesting page absent from the live client list cannot activate', async () => {
  const env = setup({ windows: [] });
  await env.message(updateMessage);
  assert.equal(env.skipWaitingCalls.length, 0);
  assert.equal(env.updateReplies.at(-1).status, 'unavailable');
});

const failed = checks.filter((entry) => !entry.passed);
console.log(JSON.stringify({ source: sourcePath, input: declaredPrecache ? 'built' : 'template', cacheName, checks: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) {
  for (const item of failed) console.error(item.error);
  process.exitCode = 1;
}
