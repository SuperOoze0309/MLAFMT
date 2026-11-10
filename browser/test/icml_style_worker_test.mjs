// Exercise the actual worker request path with a bounded test byte fixture.
// Only the pinned size and digest are substituted; no network is used here.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(path.join(root, 'browser/worker.js'), 'utf8');
const official = Buffer.from('Deterministic ICML style test fixture; no official file needed.');
const digest = createHash('sha256').update(official).digest('hex');
const shaLine = source.match(/const ICML_STYLE_SHA256 = "[0-9a-f]{64}";/)?.[0];
const sizeLine = source.match(/const ICML_STYLE_SIZE = \d+;/)?.[0];
assert.ok(shaLine && sizeLine, 'worker declares pinned SHA and size');
const worker = source.replace(shaLine, `const ICML_STYLE_SHA256 = "${digest}";`)
  .replace(sizeLine, `const ICML_STYLE_SIZE = ${official.length};`);

function fixture({available = true, corruptNetwork = false, cacheWritable = true, unstreamed = false, workerOrigin = 'https://example.test'} = {}) {
  const saved = new Map(), requests = [], writes = [], events = [], finished = [], discarded = [];
  let arrayBufferRead = false;
  let online = available;
  const cache = {
    async match(key) { return saved.get(String(key))?.clone(); },
    async delete(key) { return saved.delete(String(key)); },
    async put(key, response) { if (!cacheWritable) throw Error('quota'); saved.set(String(key), response.clone()); },
  };
  const caches = { async open() { return cache; } };
  const fetcher = async (url, options) => {
    requests.push({url: String(url), options});
    if (!online) throw Error('offline');
    if (unstreamed) return {ok:true, redirected:false, body:null,
      headers:new Headers({'content-length':String(official.length)}),
      async arrayBuffer() {arrayBufferRead=true; return new Uint8Array(50 * 1024 * 1024).buffer;}};
    const b = Buffer.from(official);
    if (corruptNetwork) b[9] ^= 1;
    return new Response(b, {status: 200, headers: {'content-length': String(b.length)}});
  };
  const self = {location:{origin:workerOrigin}, postMessage(m) {events.push(m);}, addEventListener(){}, close(){}};
  const module = new Function('self', 'fetch', 'caches', 'crypto', 'Response', 'URL', `${worker}\nreturn {
    install(stub, py) { config={baseURL:'https://example.test/', indexURL:'https://example.test/runtime/', runtimeVersion:'test'}; bridgeApi=stub; pyodide=py; ready=true; },
    run: handleRequest,
    cancel(id) {cancelled.add(id);}
  };`)(self, fetcher, caches, webcrypto, Response, URL);
  const py = {FS: {writeFile(name, bytes) {writes.push({name, bytes: Buffer.from(bytes)});}}};
  const bridge = {
    begin() {return JSON.stringify({workdir: '/tmp/work', input_path: '/tmp/input'});},
    discard(dir) {discarded.push(dir);},
    finish(json) {
      const request = JSON.parse(json); finished.push(request);
      const isIcml = request.format_id === 'icml';
      const meta = {ok:true, icml_style_included: isIcml};
      return {get(i) {return i === 0 ? JSON.stringify(meta) : {length:1, toJs(){return new Uint8Array([42]);}, destroy(){}};}, destroy(){}};
    },
  };
  module.install(bridge, py);
  return {module, saved, requests, writes, events, finished, discarded, get arrayBufferRead(){return arrayBufferRead;}, setOnline(value){online=value;}};
}
const req = (id, format) => ({id, action:'generate', request:{kind:'blank',format_id:format}});
const f = fixture();
await f.module.run(req(1, 'mla'));
assert.equal(f.requests.length, 0, 'ordinary conversion does not fetch ICML style');
await f.module.run(req(2, 'icml'));
assert.equal(f.requests.length, 1);
assert.equal(f.requests[0].url, `https://example.test/runtime/icml/icml2026-${digest}.zip`);
assert.equal(f.requests[0].options.redirect, 'error');
assert.equal(f.events.find(x=>x.type==='result'&&x.id===2).meta.icml_style_source, 'network');
assert.equal(f.writes.at(-1).name, '/app/python/icml2026-official.zip');
assert.ok(f.writes.at(-1).bytes.equals(official), 'exact pinned bytes passed to the runtime');
f.setOnline(false);
await f.module.run(req(3, 'icml'));
assert.equal(f.requests.length, 1, 'offline cache hit makes no fetch');
assert.equal(f.events.find(x=>x.type==='result'&&x.id===3).meta.icml_style_source, 'cache');
const cacheUrl = f.requests[0].url;
const damaged = Buffer.from(official); damaged[1] ^= 1;
f.saved.set(cacheUrl, new Response(damaged, {headers:{'content-length':String(damaged.length)}}));
f.setOnline(true);
await f.module.run(req(31, 'icml'));
assert.equal(f.requests.length, 2, 'a corrupt cached copy is replaced from the network');
assert.equal(f.events.find(x=>x.type==='result'&&x.id===31).meta.icml_style_source, 'network');
assert.ok(Buffer.from(await f.saved.get(cacheUrl).clone().arrayBuffer()).equals(official));
f.saved.set(cacheUrl, new Response(damaged, {headers:{'content-length':String(damaged.length)}}));
f.setOnline(false);
const completedBefore = f.finished.length;
await f.module.run(req(32, 'icml'));
assert.equal(f.finished.length, completedBefore, 'a corrupt cache is never used even when offline');
assert.equal(f.events.find(x=>x.type==='error'&&x.id===32).code, 'icml_style_unavailable');

const bad = fixture({corruptNetwork:true});
await bad.module.run(req(4, 'icml'));
assert.equal(bad.finished.length, 0, 'corrupt bytes never reach the exporter');
assert.equal(bad.saved.size, 0, 'corrupt bytes never enter cache');
assert.equal(bad.events.find(x=>x.id===4 && x.type==='error').code, 'icml_style_unavailable');
assert.deepEqual(bad.discarded, ['/tmp/work']);

const missing = fixture({available:false});
await missing.module.run(req(5, 'icml'));
assert.equal(missing.finished.length, 0, 'offline without cache cannot return a purportedly complete ZIP');
assert.equal(missing.events.find(x=>x.id===5&&x.type==='error').code, 'icml_style_unavailable');

const noStream = fixture({unstreamed:true});
await noStream.module.run(req(51, 'icml'));
assert.equal(noStream.arrayBufferRead, false, 'forged Content-Length must not trigger unbounded arrayBuffer');
assert.equal(noStream.finished.length, 0, 'unstreamed responses never produce a ZIP');
assert.equal(noStream.events.find(x=>x.id===51&&x.type==='error').code, 'icml_style_unavailable');

const otherOrigin = fixture({workerOrigin:'https://other.test'});
await otherOrigin.module.run(req(52, 'icml'));
assert.equal(otherOrigin.requests.length, 0, 'worker refuses a configured foreign origin before any fetch');
assert.equal(otherOrigin.finished.length, 0);
assert.equal(otherOrigin.events.find(x=>x.id===52&&x.type==='error').code, 'icml_style_unavailable');

const quota = fixture({cacheWritable:false});
await quota.module.run(req(6, 'icml'));
assert.equal(quota.events.find(x=>x.type==='result'&&x.id===6).meta.icml_style_source, 'network_uncached');
quota.setOnline(false);
await quota.module.run(req(7, 'icml'));
assert.equal(quota.events.find(x=>x.id===7&&x.type==='error').code, 'icml_style_unavailable');

const canceled = fixture();
canceled.module.cancel(8);
await canceled.module.run(req(8, 'icml'));
assert.equal(canceled.requests.length, 0, 'canceled queued request never fetches');
assert.equal(canceled.events.find(x=>x.id===8).type, 'aborted');
console.log('PASS real worker: on-demand, offline cache, integrity failure, offline miss, quota failure and cancellation');
