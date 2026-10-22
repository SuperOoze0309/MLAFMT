// Pure Node VM lifecycle acceptance checks. No browser, network, or real Worker.
// Run: node browser/test/transport_lifecycle_test.mjs [path/to/transport.js]
import assert from 'node:assert/strict';
import { Blob, File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const sourcePath = process.argv[2] ||
  fileURLToPath(new URL('../../static/transport.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const outcomes = [];

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function track(promise) {
  const state = { status: 'pending', value: undefined, error: undefined };
  promise.then(
    value => { state.status = 'fulfilled'; state.value = value; },
    error => { state.status = 'rejected'; state.error = error; },
  );
  return state;
}

async function flush() {
  // All sequencing under test consists of Promise continuations. No wall-clock
  // sleep or race against an arbitrary timeout is needed.
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}

function cancelled(state, description) {
  assert.equal(state.status, 'rejected', `${description}: expected immediate rejection, got ${state.status}`);
  assert.equal(state.error?.code, 'cancelled', `${description}: expected cancelled error`);
}

function bytes(text = 'DOCX') {
  return new TextEncoder().encode(text).buffer;
}

function harness() {
  const workers = [];
  const timers = new Map();
  let timerId = 0;
  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.messages = [];
      this.terminated = false;
      this.terminateCount = 0;
      workers.push(this);
    }
    postMessage(message, transfer = []) {
      assert.equal(this.terminated, false, 'postMessage attempted on terminated Worker');
      // Transfer behaves like a Worker: clone the posted object and detach the
      // sender's ArrayBuffer. We never start or evaluate the worker script.
      this.messages.push(structuredClone(message, { transfer }));
    }
    terminate() { this.terminated = true; this.terminateCount++; }
    emit(data) { this.onmessage?.({ data }); }
    error(message = 'late fake worker error') {
      this.onerror?.({ message, preventDefault() {} });
    }
    requests() { return this.messages.filter(message => message.type === 'request'); }
  }
  const window = { isSecureContext: true };
  const context = vm.createContext({
    window,
    document: {
      baseURI: 'https://formcapy.com/',
      querySelector(selector) {
        return selector.includes('mlafmt-runtime') ? { content: '314.0.7' } : null;
      },
    },
    navigator: {},
    Worker: FakeWorker,
    URL, Blob, File, AbortController, AbortSignal,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch() { throw new Error('Network access is forbidden in this VM check'); },
    console,
  });
  vm.runInContext(source, context, { filename: sourcePath });
  const transport = window.MLAFMTTransport.create({ mode: 'browser', offline: false });
  const stages = [];
  transport.onStage(stage => stages.push(stage));
  return {
    workers, transport, stages,
    ready(worker = workers.at(-1)) { worker.emit({ type: 'ready' }); },
    complete(worker = workers.at(-1), name = 'fresh.docx') {
      const request = worker.requests().at(-1);
      assert.ok(request, 'expected a dispatched task before sending a result');
      worker.emit({
        type: 'result', id: request.id,
        meta: { ok: true, name, blank: true, format_id: 'mla', stats: {} },
        buffer: bytes('fresh document'),
      });
    },
    blank(signal) {
      return transport.generate({
        isBlank: true, request: { name: 'Jane Doe', title: 'Fresh document' },
        file: null, signal,
      });
    },
    draft(read, signal) {
      return transport.generate({
        isBlank: false, request: { name: 'Jane Doe', title: 'Original draft' },
        file: { name: 'old-draft.docx', size: 12, arrayBuffer: () => read.promise }, signal,
      });
    },
  };
}

async function check(name, callback) {
  const h = harness();
  try {
    await callback(h);
    outcomes.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    outcomes.push({ name, status: 'FAIL', message: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  } finally {
    h.transport.dispose();
    await flush();
  }
}

await check('cancel init then synchronously retry keeps the new init promise', async h => {
  const first = track(h.transport.init());
  const oldWorker = h.workers[0];
  h.transport.cancel();
  const retryPromise = h.transport.init();
  const retry = track(retryPromise);
  await flush();
  cancelled(first, 'cancelled initialization');
  assert.equal(oldWorker.terminated, true);
  assert.equal(h.workers.length, 2);
  assert.equal(h.transport.init(), retryPromise, 'old promise cleanup cleared the newer initialization');
  assert.equal(retry.status, 'pending');
  h.ready();
  await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('cancel generate initialization then synchronously retry completes', async h => {
  const first = track(h.blank());
  h.transport.cancel();
  const retry = track(h.blank());
  await flush();
  cancelled(first, 'first generation');
  assert.equal(h.workers.length, 2);
  h.ready();
  await flush();
  assert.equal(h.workers[1].requests().length, 1);
  h.complete();
  await flush();
  assert.equal(retry.status, 'fulfilled');
  assert.equal(retry.value.name, 'fresh.docx');
});

await check('cancel hanging read then retry never posts the old draft', async h => {
  const read = deferred();
  const controller = new AbortController();
  let obsoleteAbortHandler = null;
  const addListener = controller.signal.addEventListener.bind(controller.signal);
  controller.signal.addEventListener = (type, listener, options) => {
    if (type === 'abort') obsoleteAbortHandler = listener;
    return addListener(type, listener, options);
  };
  const first = track(h.draft(read, controller.signal));
  const oldWorker = h.workers[0];
  h.ready(oldWorker);
  await flush();
  assert.equal(h.stages.at(-1), 'reading');
  h.transport.cancel();
  const retry = track(h.blank());
  const newWorker = h.workers[1];
  h.ready(newWorker);
  await flush();
  assert.equal(retry.status, 'pending');
  // Even a saved/queued callback from the old signal must not terminate the
  // new worker after cancellation and synchronous retry.
  assert.equal(typeof obsoleteAbortHandler, 'function');
  controller.abort();
  obsoleteAbortHandler();
  await flush();
  assert.equal(newWorker.terminated, false, 'obsolete AbortSignal terminated the retry worker');
  assert.equal(retry.status, 'pending', 'obsolete AbortSignal settled the retry task');
  read.resolve(bytes('OLD DRAFT'));
  await flush();
  cancelled(first, 'old draft after late read completion');
  assert.equal(oldWorker.requests().length, 0, 'old draft dispatched to old worker');
  assert.equal(newWorker.requests().length, 1, 'late draft dispatched to retry worker');
  assert.equal(newWorker.requests()[0].file, null, 'retry unexpectedly received old draft bytes');
  assert.equal(retry.status, 'pending', 'old task settled the new task');
  h.complete(newWorker);
  await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('manual cancel immediately rejects a hanging file read', async h => {
  const read = deferred();
  const task = track(h.draft(read));
  h.ready();
  await flush();
  const worker = h.workers[0];
  h.transport.cancel();
  await flush();
  assert.equal(worker.terminated, true, 'cancel did not terminate the worker');
  cancelled(task, 'manual cancellation while arrayBuffer remains unresolved');
});

await check('old worker ready cannot initialize or dispatch the retry', async h => {
  track(h.blank());
  const oldWorker = h.workers[0];
  h.transport.cancel();
  const retry = track(h.blank());
  const newWorker = h.workers[1];
  oldWorker.emit({ type: 'ready' });
  await flush();
  assert.equal(newWorker.requests().length, 0, 'stale ready initialized the new worker before its own ready');
  assert.equal(retry.status, 'pending');
  h.ready(newWorker);
  await flush();
  h.complete(newWorker);
  await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('old worker init-error cannot reject the retry initialization', async h => {
  track(h.blank());
  const oldWorker = h.workers[0];
  h.transport.cancel();
  const retry = track(h.blank());
  const newWorker = h.workers[1];
  oldWorker.emit({ type: 'init-error', code: 'engine_init_failed', detail: 'obsolete initialization' });
  await flush();
  assert.equal(retry.status, 'pending', 'stale init-error settled the retry');
  assert.equal(newWorker.terminated, false);
  h.ready(newWorker);
  await flush();
  h.complete(newWorker);
  await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('old worker onerror cannot reject or terminate retry initialization', async h => {
  track(h.blank());
  const oldWorker = h.workers[0];
  h.transport.cancel();
  const retry = track(h.blank());
  const newWorker = h.workers[1];
  oldWorker.error();
  await flush();
  assert.equal(newWorker.terminated, false, 'stale onerror terminated the current worker');
  assert.equal(retry.status, 'pending', 'stale onerror settled the retry');
  h.ready(newWorker);
  await flush();
  h.complete(newWorker);
  await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('old worker onerror cannot reject a dispatched new task', async h => {
  track(h.blank());
  const oldWorker = h.workers[0];
  h.transport.cancel();
  const retry = track(h.blank());
  const newWorker = h.workers[1];
  h.ready(newWorker);
  await flush();
  assert.equal(newWorker.requests().length, 1);
  oldWorker.error();
  await flush();
  assert.equal(retry.status, 'pending', 'stale onerror rejected the newly dispatched task');
  assert.equal(newWorker.terminated, false);
  h.complete(newWorker);
  await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('late result with an old request id cannot settle a new task', async h => {
  const first = track(h.blank());
  const oldWorker = h.workers[0];
  h.ready(oldWorker);
  await flush();
  const oldId = oldWorker.requests()[0].id;
  h.transport.cancel();
  const retry = track(h.blank());
  const newWorker = h.workers[1];
  h.ready(newWorker);
  await flush();
  oldWorker.emit({ type: 'result', id: oldId, meta: { ok: true, name: 'obsolete.docx' }, buffer: bytes('OLD') });
  await flush();
  cancelled(first, 'cancelled dispatched task');
  assert.equal(retry.status, 'pending');
  h.complete(newWorker);
  await flush();
  assert.equal(retry.status, 'fulfilled');
  assert.equal(retry.value.name, 'fresh.docx');
});

await check('already-aborted AbortSignal rejects before creating a worker', async h => {
  const controller = new AbortController();
  controller.abort();
  const task = track(h.blank(controller.signal));
  await flush();
  cancelled(task, 'pre-aborted signal');
  assert.equal(h.workers.length, 0);
});

await check('AbortSignal during initialization immediately rejects and terminates', async h => {
  const controller = new AbortController();
  const task = track(h.blank(controller.signal));
  const worker = h.workers[0];
  controller.abort();
  await flush();
  assert.equal(worker.terminated, true);
  cancelled(task, 'signal aborted during initialization');
});

await check('AbortSignal during hanging arrayBuffer immediately rejects and terminates', async h => {
  const controller = new AbortController();
  const read = deferred();
  const task = track(h.draft(read, controller.signal));
  const worker = h.workers[0];
  h.ready(worker);
  await flush();
  assert.equal(h.stages.at(-1), 'reading');
  controller.abort();
  await flush();
  assert.equal(worker.terminated, true);
  cancelled(task, 'signal aborted while arrayBuffer remains unresolved');
});

await check('AbortSignal after dispatch immediately rejects and terminates', async h => {
  const controller = new AbortController();
  const task = track(h.blank(controller.signal));
  const worker = h.workers[0];
  h.ready(worker);
  await flush();
  assert.equal(worker.requests().length, 1);
  controller.abort();
  await flush();
  assert.equal(worker.terminated, true);
  cancelled(task, 'signal aborted after dispatch');
});

await check('a current initialization failure rejects the task and a fresh worker can retry', async h => {
  const first = track(h.blank());
  const failedWorker = h.workers[0];
  failedWorker.emit({ type: 'init-error', code: 'engine_init_failed', detail: 'synthetic offline import' });
  await flush();
  assert.equal(first.status, 'rejected'); assert.equal(first.error.code, 'engine_init_failed');
  assert.equal(failedWorker.terminated, true);
  const retry = track(h.blank()); const next = h.workers[1];
  h.ready(next); await flush(); h.complete(next); await flush();
  assert.equal(retry.status, 'fulfilled'); assert.equal(retry.value.name, 'fresh.docx');
});

await check('a current worker failure resets ownership and cannot poison the next generation', async h => {
  const first = track(h.blank()); const failedWorker = h.workers[0];
  h.ready(failedWorker); await flush();
  failedWorker.emit({ type: 'worker-error', detail: 'synthetic runtime failure' }); await flush();
  assert.equal(first.status, 'rejected'); assert.equal(first.error.code, 'failed');
  assert.equal(failedWorker.terminated, true);
  const retry = track(h.blank()); const next = h.workers[1];
  h.ready(next); await flush(); h.complete(next); await flush();
  assert.equal(retry.status, 'fulfilled');
});

await check('a rejected file read preserves the ready worker and the next request succeeds', async h => {
  const read = deferred(); const first = track(h.draft(read)); const worker = h.workers[0];
  h.ready(worker); await flush(); read.reject(new Error('synthetic file unavailable')); await flush();
  assert.equal(first.status, 'rejected'); assert.equal(first.error.code, 'unreadable_file');
  assert.equal(worker.requests().length, 0); assert.equal(worker.terminated, false);
  const retry = track(h.blank()); await flush();
  assert.equal(h.workers.length, 1); assert.equal(worker.requests().length, 1);
  assert.equal(worker.requests()[0].file, null, 'an unreadable old draft must not be posted later');
  h.complete(worker); await flush(); assert.equal(retry.status, 'fulfilled');
});

await check('an old completed request removes its abort listener before the next request reuses the worker', async h => {
  const controller = new AbortController(); const first = track(h.blank(controller.signal));
  const worker = h.workers[0]; h.ready(worker); await flush(); h.complete(worker); await flush();
  assert.equal(first.status, 'fulfilled');
  const second = track(h.blank()); await flush(); controller.abort(); await flush();
  assert.equal(worker.terminated, false); assert.equal(second.status, 'pending');
  h.complete(worker); await flush(); assert.equal(second.status, 'fulfilled');
});

await check('aborting a queued bibliography settles the old worker tasks and preserves an immediate fresh retry', async h => {
  const preceding = track(h.blank());
  const controller = new AbortController();
  const bibliographyRequest = { kind: 'bibliography', bibliography: { style: 'mla', entries: [] } };
  const queued = track(h.transport.generate({ request: bibliographyRequest, file: null, signal: controller.signal }));
  const oldWorker = h.workers[0]; h.ready(oldWorker); await flush();
  assert.equal(oldWorker.requests().length, 2, 'both requests should be posted to the sequential worker queue');
  assert.equal(oldWorker.requests()[1].request.kind, 'bibliography');
  const oldId = oldWorker.requests()[1].id;
  controller.abort();
  const retry = track(h.transport.generate({ request: bibliographyRequest, file: null }));
  const newWorker = h.workers[1]; h.ready(newWorker); await flush();
  cancelled(preceding, 'the terminated worker preceding task'); cancelled(queued, 'queued bibliography');
  assert.equal(oldWorker.terminated, true); assert.equal(newWorker.terminated, false);
  oldWorker.emit({ type: 'result', id: oldId, meta: { ok: true, name: 'obsolete-reference.docx' }, buffer: bytes('old bibliography') });
  await flush(); assert.equal(retry.status, 'pending');
  h.complete(newWorker, 'fresh-references.docx'); await flush();
  assert.equal(retry.status, 'fulfilled'); assert.equal(retry.value.name, 'fresh-references.docx');
});

const failures = outcomes.filter(item => item.status === 'FAIL');
console.log(JSON.stringify({
  sourcePath, sourceSha256,
  checks: outcomes.length, passed: outcomes.length - failures.length,
  failed: failures.length, failures,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
