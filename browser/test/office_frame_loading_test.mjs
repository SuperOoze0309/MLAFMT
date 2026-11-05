// Behavioral checks of the Office loader with tiny synthetic, pinned assets.
// This executes the actual iframe script without downloading Office or documents.
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const source = await readFile(new URL("../office-frame.js", import.meta.url), "utf8");
const origin = "https://formcapy.example";
const base = `${origin}/runtime.json`;
const gzipBase = `${origin}/runtime-gzip-v1.json`;
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const enc = new TextEncoder();
const payloads = new Map();
function asset(path, value) {
  const bytes = enc.encode(value);
  payloads.set(new URL(path, base).href, bytes);
  return { path, size: bytes.length, sha256: sha(bytes) };
}
const wasmChunks = [asset("w0", "wasm-0"), asset("w1", "wasm-1"), asset("w2", "wasm-2")];
const dataChunks = [asset("d0", "data-0"), asset("d1", "data-1"), asset("d2", "data-2")];
const join = chunks => Buffer.concat(chunks.map(item => Buffer.from(payloads.get(new URL(item.path, base).href))));
const wasmBytes = join(wasmChunks), dataBytes = join(dataChunks);
const manifest = { schemaVersion: 1, id: "loader-test", assets: {
  script: asset("script", "script"), bridge: asset("bridge", "bridge"),
  metadata: asset("metadata", "metadata"), driver: asset("driver", "driver"), font: asset("font", "font"),
  wasm: { size: wasmBytes.length, sha256: sha(wasmBytes), chunks: wasmChunks },
  data: { size: dataBytes.length, sha256: sha(dataBytes), chunks: dataChunks },
} };
const gzipManifest = structuredClone(manifest);
for (const kind of ["wasm", "data"]) for (const chunk of gzipManifest.assets[kind].chunks) {
  const path = chunk.path + ".gz";
  const packed = gzipSync(payloads.get(new URL(chunk.path, base).href));
  payloads.set(new URL(path, gzipBase).href, packed);
  chunk.compressed = { path, size: packed.length, sha256: sha(packed), encoding: "gzip" };
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeCaches({ manifestWriteDelay = 0 } = {}) {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(key) { return store.get(key)?.clone(); },
        async put(key, value) {
          if (name === "formcapy-office-manifests-v1" && manifestWriteDelay) await sleep(manifestWriteDelay);
          store.set(key, value.clone());
        },
        async delete(key) { return store.delete(key); },
      };
    },
  };
}

function harness({ caches = makeCaches(), corrupt, corruptBytes = enc.encode("sCript"), offline = false,
  delay = 12, inputManifest = manifest, manifestURL = base, gzip = false, missing = [], status = {},
  decompressor = DecompressionStream, streamFor, bodylessFor } = {}) {
  const events = new Map(), stages = [], started = [], completed = [], timeline = [], allocations = [];
  let releaseFirstWasm;
  const laterWasmFinished = new Promise(resolve => { releaseFirstWasm = resolve; });
  class TrackedBytes extends Uint8Array {
    constructor(...args) { super(...args); if (typeof args[0] === "number") allocations.push(args[0]); }
  }
  let running = 0, maxRunning = 0, resultResolve, streamReadyResolve, streamCancelled = false, bodyBufferCalls = 0;
  const streamReady = new Promise(resolve => { streamReadyResolve = resolve; });
  const outcome = new Promise(resolve => { resultResolve = resolve; });
  const port = { postMessage(message) {
    stages.push(message);
    if (["ready", "error"].includes(message.type)) resultResolve(message);
  }, close() {} };
  const parent = {};
  const context = {
    window: { addEventListener(name, callback) { events.set(name, callback); } }, parent,
    location: { href: `${origin}/browser/office-frame.html`, origin },
    crossOriginIsolated: true, SharedArrayBuffer, AbortController, DOMException, Blob, URL, Response,
    Uint8Array: TrackedBytes, ArrayBuffer, crypto: webcrypto, caches,
    DecompressionStream: gzip ? decompressor : undefined,
    console: { error() {}, warn() {} },
    document: {
      getElementById() { return {}; }, createElement() { return {}; },
      body: { appendChild(script) {
        context.Module.uno_main = Promise.resolve({ postMessage() {}, close() {},
          set onmessage(handler) { queueMicrotask(() => handler({ data: { type: "ready" } })); },
        });
        queueMicrotask(() => script.onload());
      } },
    },
    async fetch(url, options = {}) {
      if (url === base || url === gzipBase) {
        if (offline) throw new Error("offline");
        if (missing.includes(url)) return new Response("missing", { status: 404 });
        if (status[url]) return new Response("error", { status: status[url] });
        return new Response(JSON.stringify(inputManifest), { headers: { "Content-Type": "application/json" } });
      }
      started.push(url);
      timeline.push(["start", url]);
      if (offline) throw new Error(`unexpected offline asset request ${url}`);
      if (missing.includes(url)) return new Response("missing", { status: 404 });
      if (status[url]) return new Response("error", { status: status[url] });
      if (url === bodylessFor) return { ok: true, status: 200, body: null,
        async arrayBuffer() { bodyBufferCalls++; throw new Error("unbounded buffer must not be read"); } };
      if (url === streamFor) return { ok: true, status: 200, body: { getReader() {
        let first = true, pending;
        streamReadyResolve();
        return {
          read() {
            if (first) { first = false; return Promise.resolve({ value: payloads.get(url).slice(0, 2), done: false }); }
            return new Promise(resolve => { pending = resolve; });
          },
          cancel() { streamCancelled = true; pending?.({ done: true }); return Promise.resolve(); },
          releaseLock() {},
        };
      } } };
      running++; maxRunning = Math.max(maxRunning, running);
      try {
        // Hold the first chunk until a later one finishes, ensuring out-of-order
        // completion without depending on scheduler or machine timing.
        await new Promise((resolve, reject) => {
          if (options.signal?.aborted) return reject(new DOMException("cancelled", "AbortError"));
          let timer;
          const done = () => { options.signal?.removeEventListener("abort", abort); resolve(); };
          const abort = () => { clearTimeout(timer); reject(new DOMException("cancelled", "AbortError")); };
          options.signal?.addEventListener("abort", abort, { once: true });
          if (/\/w0(?:\.gz)?$/.test(url)) laterWasmFinished.then(done);
          else timer = setTimeout(done, delay);
        });
        completed.push(url);
        timeline.push(["complete", url]);
        if (/\/w1(?:\.gz)?$/.test(url)) releaseFirstWasm();
        const bytes = corrupt === url ? corruptBytes : payloads.get(url);
        return bytes ? new Response(bytes) : new Response("missing", { status: 404 });
      } finally { running--; }
    },
  };
  vm.runInNewContext(source, context, { filename: "office-frame.js" });
  events.get("message")({ source: parent, origin, data: { type: "formcapy-office-init", manifestURL }, ports: [port] });
  return { context, events, stages, started, completed, timeline, allocations, outcome, caches, streamReady,
    get streamCancelled() { return streamCancelled; }, get bodyBufferCalls() { return bodyBufferCalls; },
    get maxRunning() { return maxRunning; }, get running() { return running; } };
}
async function settled(h) {
  let timer;
  try { return await Promise.race([h.outcome, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Office loader did not settle")), 3000);
  })]); } finally { clearTimeout(timer); }
}

// Out-of-order completions must still reproduce both exact files with a shared cap.
const cold = harness();
assert.equal((await settled(cold)).type, "ready");
assert.equal(cold.maxRunning, 4);
assert.equal(cold.running, 0);
assert.deepEqual(Buffer.from(cold.context.Module.wasmBinary), wasmBytes);
assert.deepEqual(Buffer.from(cold.context.Module.getPreloadedPackage()), dataBytes);
assert.ok(cold.timeline.findIndex(([kind, url]) => kind === "start" && url === `${origin}/d0`) <
  cold.timeline.findIndex(([kind, url]) => kind === "complete" && url === `${origin}/w0`),
  "both categories must be scheduled during loading");
assert.ok(cold.completed.indexOf(`${origin}/w1`) < cold.completed.indexOf(`${origin}/w0`), "test exercises out-of-order completion");
for (const label of ["office_wasm", "office_data"]) {
  const progress = cold.stages.filter(x => x.type === "stage" && x.stage === label);
  assert.equal(progress.length, 3);
  assert.deepEqual(progress.map(x => x.loaded), [6, 12, 18]);
  assert.ok(progress.every(x => x.total === 18));
}

// A complete cache permits offline initialization and does not fetch assets.
const warm = harness({ caches: cold.caches, offline: true });
assert.equal((await settled(warm)).type, "ready");
assert.equal(warm.started.length, 0);
assert.deepEqual(Buffer.from(warm.context.Module.wasmBinary), wasmBytes);

// Damaged cached bytes are deleted and retried against the real pinned bytes.
const cache = cold.caches.stores.get("formcapy-office-loader-test");
cache.set(`${origin}/w1`, new Response(enc.encode("wAsm-1")));
const repaired = harness({ caches: cold.caches });
assert.equal((await settled(repaired)).type, "ready");
assert.deepEqual(repaired.started, [`${origin}/w1`]);
assert.deepEqual(Buffer.from(repaired.context.Module.wasmBinary), wasmBytes);
assert.deepEqual(Buffer.from(await cache.get(`${origin}/w1`).clone().arrayBuffer()), Buffer.from(payloads.get(`${origin}/w1`)));

// A failed integrity check cancels in-flight requests before failure is sent.
const failed = harness({ corrupt: `${origin}/script`, delay: 50 });
const failure = await settled(failed);
assert.equal(failure.type, "error");
assert.equal(failure.code, "office_integrity");
assert.equal(failed.running, 0);
const startsAtFailure = failed.started.length, stagesAtFailure = failed.stages.length;
await sleep(100);
assert.equal(failed.started.length, startsAtFailure);
assert.equal(failed.stages.length, stagesAtFailure);
assert.equal(failed.context.Module, undefined);

// Network data of the wrong length must fail before it can be cached.
const badNetworkLength = harness({ corrupt: `${origin}/script`, corruptBytes: enc.encode("too-long") });
assert.equal((await settled(badNetworkLength)).code, "office_integrity");
assert.equal(badNetworkLength.caches.stores.get("formcapy-office-loader-test").has(`${origin}/script`), false);

// Correctly hashed chunks cannot conceal an invalid full-file digest.
const wrongWholeHash = structuredClone(manifest);
wrongWholeHash.assets.wasm.sha256 = "0".repeat(64);
const badWhole = harness({ inputManifest: wrongWholeHash });
assert.equal((await settled(badWhole)).code, "office_integrity");
assert.equal(badWhole.context.Module, undefined);

// Reject malformed chunk sizes before loading any program bytes.
const badLength = structuredClone(manifest);
badLength.assets.data.chunks[0].size++;
const malformed = harness({ inputManifest: badLength });
assert.equal((await settled(malformed)).code, "office_integrity");
assert.equal(malformed.started.length, 0);

// Page disposal aborts the pool and cannot later report progress or readiness.
const cancelled = harness({ delay: 100 });
await sleep(20);
cancelled.events.get("pagehide")();
await sleep(150);
assert.equal(cancelled.running, 0);
assert.equal(cancelled.context.Module, undefined);
assert.equal(cancelled.stages.filter(x => x.type === "ready" || x.type === "error").length, 0);
assert.equal(cancelled.stages.filter(x => x.stage === "office_wasm" || x.stage === "office_data").length, 0);

// Cache writes cannot be interrupted, but canceling during one must not then
// allocate the assembled WASM/data buffers or schedule any asset request.
const cancelledInCache = harness({ caches: makeCaches({ manifestWriteDelay: 100 }) });
await sleep(20);
cancelledInCache.events.get("pagehide")();
await sleep(150);
assert.equal(cancelledInCache.started.length, 0);
assert.equal(cancelledInCache.allocations.includes(wasmBytes.length), false);
assert.equal(cancelledInCache.context.Module, undefined);
assert.equal(cancelledInCache.stages.filter(x => x.type === "ready" || x.type === "error").length, 0);

// A new gzip manifest downloads and validates both representations, while
// storing only the verified original bytes under the existing cache keys.
const compressedCold = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(compressedCold)).type, "ready");
assert.equal(compressedCold.started.filter(url => url.endsWith(".gz")).length, 6);
assert.equal(compressedCold.started.filter(url => /\/(w|d)[0-2]$/.test(url)).length, 0);
assert.equal(compressedCold.maxRunning, 4);
assert.deepEqual(Buffer.from(compressedCold.context.Module.wasmBinary), wasmBytes);
assert.deepEqual(Buffer.from(compressedCold.context.Module.getPreloadedPackage()), dataBytes);
const gzipCache = compressedCold.caches.stores.get("formcapy-office-loader-test");
assert.deepEqual(Buffer.from(await gzipCache.get(`${origin}/w0`).arrayBuffer()), Buffer.from(payloads.get(`${origin}/w0`)));
assert.equal(gzipCache.has(`${origin}/w0.gz`), false);

// Old raw cache entries remain usable; no gzip payloads need downloading.
const upgraded = harness({ caches: cold.caches, inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(upgraded)).type, "ready");
assert.equal(upgraded.started.length, 0, JSON.stringify(upgraded.started));
assert.deepEqual(Buffer.from(upgraded.context.Module.wasmBinary), wasmBytes);

// Missing DecompressionStream uses the original assets even with new metadata.
const noGzip = harness({ inputManifest: gzipManifest, manifestURL: gzipBase });
assert.equal((await settled(noGzip)).type, "ready");
assert.equal(noGzip.started.filter(url => url.endsWith(".gz")).length, 0);
assert.equal(noGzip.started.filter(url => /\/(w|d)[0-2]$/.test(url)).length, 6);
class UnsupportedGzip { constructor() { throw new Error("gzip not supported"); } }
const unsupportedGzip = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true, decompressor: UnsupportedGzip });
assert.equal((await settled(unsupportedGzip)).type, "ready");
assert.equal(unsupportedGzip.started.filter(url => url.endsWith(".gz")).length, 0);

// Missing new manifests and old offline installations use the old manifest URL.
const oldDeployment = harness({ manifestURL: gzipBase, missing: [gzipBase] });
assert.equal((await settled(oldDeployment)).type, "ready");
assert.ok(oldDeployment.caches.stores.get("formcapy-office-manifests-v1").has(base));
const oldOffline = harness({ caches: oldDeployment.caches, manifestURL: gzipBase, offline: true, gzip: true });
assert.equal((await settled(oldOffline)).type, "ready");
assert.equal(oldOffline.started.length, 0);

// A missing compressed sibling alone permits fallback to the pinned raw URL.
const missingCompressed = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true, missing: [`${origin}/d1.gz`] });
assert.equal((await settled(missingCompressed)).type, "ready");
assert.ok(missingCompressed.started.includes(`${origin}/d1.gz`));
assert.ok(missingCompressed.started.includes(`${origin}/d1`));

// Server errors and bad compressed hashes never trigger raw fallback.
const serverError = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true, status: { [`${origin}/d1.gz`]: 500 } });
assert.equal((await settled(serverError)).code, "office_runtime_missing");
assert.equal(serverError.started.includes(`${origin}/d1`), false);
const wrongPackedSize = structuredClone(gzipManifest);
wrongPackedSize.assets.data.chunks[1].compressed.size--;
const badPackedSize = harness({ inputManifest: wrongPackedSize, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(badPackedSize)).code, "office_integrity");
assert.equal(badPackedSize.started.includes(`${origin}/d1`), false);
const oversizedMetadata = structuredClone(gzipManifest);
oversizedMetadata.assets.data.chunks[1].compressed.size = 25 * 1024 * 1024;
const badMetadata = harness({ inputManifest: oversizedMetadata, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(badMetadata)).code, "office_integrity");
assert.equal(badMetadata.started.includes(`${origin}/d1.gz`), false);
assert.equal(badMetadata.allocations.includes(25 * 1024 * 1024), false);
const missingBody = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true, bodylessFor: `${origin}/d1.gz` });
assert.equal((await settled(missingBody)).code, "office_integrity");
assert.equal(missingBody.bodyBufferCalls, 0);
assert.equal(missingBody.started.includes(`${origin}/d1`), false);
const changedPacked = Buffer.from(payloads.get(`${origin}/w1.gz`)); changedPacked[0] ^= 1;
const badPacked = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true,
  corrupt: `${origin}/w1.gz`, corruptBytes: changedPacked });
assert.equal((await settled(badPacked)).code, "office_integrity");
assert.equal(badPacked.started.includes(`${origin}/w1`), false);
assert.equal(badPacked.caches.stores.get("formcapy-office-loader-test").has(`${origin}/w1`), false);

// Decompression cannot bypass the original-byte hash or size cap, even when
// the packed bytes' advertised hash is correct.
const wrongOriginal = structuredClone(gzipManifest);
wrongOriginal.assets.wasm.chunks[1].sha256 = "0".repeat(64);
const badOriginal = harness({ inputManifest: wrongOriginal, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(badOriginal)).code, "office_integrity");
assert.equal(badOriginal.caches.stores.get("formcapy-office-loader-test").has(`${origin}/w1`), false);
const bomb = structuredClone(gzipManifest);
const oversized = gzipSync(Buffer.alloc(1024, 65));
payloads.set(`${origin}/bomb.gz`, oversized);
bomb.assets.data.chunks[1].compressed = { path: "bomb.gz", size: oversized.length, sha256: sha(oversized), encoding: "gzip" };
const rejectedBomb = harness({ inputManifest: bomb, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(rejectedBomb)).code, "office_integrity");
assert.equal(rejectedBomb.caches.stores.get("formcapy-office-loader-test").has(`${origin}/d1`), false);

// A packed stream with correct metadata but invalid gzip bytes is rejected.
const invalidGzip = structuredClone(gzipManifest);
const fakePacked = enc.encode("not gzip"); payloads.set(`${origin}/invalid.gz`, fakePacked);
invalidGzip.assets.data.chunks[1].compressed = { path: "invalid.gz", size: fakePacked.length, sha256: sha(fakePacked), encoding: "gzip" };
const rejectedGzip = harness({ inputManifest: invalidGzip, manifestURL: gzipBase, gzip: true });
assert.equal((await settled(rejectedGzip)).code, "office_integrity");

// Abort while decompression is paused: no partial output, cache, or ready event.
let decodeStarted;
const decoding = new Promise(resolve => { decodeStarted = resolve; });
class DelayedDecompressionStream {
  constructor(format) {
    const decoder = new DecompressionStream(format);
    this.writable = decoder.writable;
    this.readable = decoder.readable.pipeThrough(new TransformStream({
      async transform(chunk, output) { decodeStarted(); await sleep(200); try { output.enqueue(chunk); } catch (_) {} },
    }));
  }
}
const cancelledDecode = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true, decompressor: DelayedDecompressionStream });
let decodeTimer;
try { await Promise.race([decoding, new Promise((_, reject) => {
  decodeTimer = setTimeout(() => reject(new Error("gzip decode did not start")), 2000);
})]); } finally { clearTimeout(decodeTimer); }
cancelledDecode.events.get("pagehide")();
await sleep(300);
assert.equal(cancelledDecode.running, 0);
assert.equal(cancelledDecode.context.Module, undefined);
assert.equal(cancelledDecode.stages.filter(x => x.type === "ready" || x.type === "error").length, 0);

// Abort while a compressed HTTP body is still streaming.
const cancelledStream = harness({ inputManifest: gzipManifest, manifestURL: gzipBase, gzip: true, streamFor: `${origin}/d1.gz` });
let streamTimer;
try { await Promise.race([cancelledStream.streamReady, new Promise((_, reject) => {
  streamTimer = setTimeout(() => reject(new Error("compressed response did not start")), 2000);
})]); } finally { clearTimeout(streamTimer); }
cancelledStream.events.get("pagehide")();
const stagesAfterCancel = cancelledStream.stages.length;
await sleep(150);
assert.equal(cancelledStream.streamCancelled, true);
assert.equal(cancelledStream.running, 0);
assert.equal(cancelledStream.context.Module, undefined);
assert.equal(cancelledStream.stages.length, stagesAfterCancel);

console.log("PASS Office loader: bounded concurrency, cache compatibility, gzip integrity, fallback and cancellation");
