// State and consent checks for the update banner; isolated DOM/SW adapters.
// No network, browser profile, application storage or filesystem mutation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../static/update-notice.js', import.meta.url), 'utf8');
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, detail = {}) { for (const callback of [...(this.listeners.get(name) || [])]) callback(detail); }
}
class Node extends Target {
  constructor(tag = '') { super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.style = {}; this.hidden = false; this.disabled = false; this.textContent = ''; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  insertBefore(child, before) { child.parent = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, child); }
  get firstChild() { return this.children[0] || null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  click() { if (!this.disabled) this.emit('click'); }
}
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function setup({ active = true, waiting = true, controller = true, enabled = true, secure = true, registerError = false, updateError = false, channel = true, reply, workerState = 'installed', pageURL = 'https://formcapy.example/app/?a=1', registrationThrows = false, onUpdating } = {}) {
  const doc = new Target(); doc.body = new Node('body'); doc.documentElement = { lang: 'zh-CN' }; doc.visibilityState = 'visible';
  doc.createElement = (tag) => new Node(tag);
  const page = new Target(); page.document = doc; page.isSecureContext = secure;
  const reloads = []; page.location = { href: pageURL, reload() { reloads.push('reload'); } };
  const forbidden = () => { throw new Error('document data and storage are off limits'); };
  page.localStorage = new Proxy({}, { get: forbidden, set: forbidden });
  const messages = []; const registers = []; const updates = [];
  const worker = new Target(); worker.state = workerState;
  worker.postMessage = (data, ports) => {
    messages.push({ data, ports });
    if (reply) ports[0].postMessage({ type: 'FORMCAPY_ACTIVATE_UPDATE', status: reply });
  };
  const reg = new Target(); reg.active = active ? {} : null; reg.waiting = waiting ? worker : null; reg.installing = null;
  reg.update = async () => { updates.push('update'); if (updateError) throw new Error('offline update'); };
  const sw = new Target(); sw.controller = controller ? {} : null;
  sw.register = (url, options) => {
    registers.push({ url, options });
    if (registrationThrows) throw new Error('registration denied');
    return registerError ? Promise.reject(new Error('offline registration')) : Promise.resolve(reg);
  };
  page.navigator = { serviceWorker: sw };
  const timers = new Map(); let sequence = 0;
  page.setTimeout = (callback, ms) => { const id = ++sequence; timers.set(id, { callback, ms }); return id; };
  page.clearTimeout = (id) => timers.delete(id);
  class Channel {
    constructor() {
      const one = { onmessage: null, closed: false, close() { this.closed = true; } };
      const two = { closed: false, close() { this.closed = true; }, postMessage(data) { if (!one.closed) one.onmessage?.({ data }); } };
      this.port1 = one; this.port2 = two;
    }
  }
  if (channel) page.MessageChannel = Channel;
  const context = vm.createContext({ window: page, URL, console });
  vm.runInContext(source, context, { filename: 'static/update-notice.js' });
  let busy = false; let language = 'zh';
  const transitions = [];
  const api = page.FormCapyUpdates.start({ window: page, document: doc, enabled, getLocale: () => language, isBusy: () => busy,
    onUpdating(value) { transitions.push(value); onUpdating?.(value); } });
  const node = doc.body.firstChild;
  const primary = () => node.children[2].children[0]; const secondary = () => node.children[2].children[1];
  return { api, doc, page, sw, reg, worker, registers, updates, messages, reloads, timers, node, primary, secondary, transitions,
    language(value) { language = value; api.render(); }, busy(value) { busy = value; },
    async ready() { await flush(); return this; },
    expire(ms) { for (const [id, task] of [...timers]) if (task.ms === ms) { timers.delete(id); task.callback(); } },
  };
}
const checks = [];
async function check(name, body) {
  try { await body(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, passed: false, error: error.stack }); console.error(`FAIL ${name}: ${error.stack}`); }
}
await check('registers immediately, before any Python engine exists, with HTTP cache bypass for the SW', async () => {
  const env = setup();
  assert.equal(env.registers.length, 1);
  assert.equal(env.registers[0].url, 'https://formcapy.example/app/sw.js');
  assert.equal(env.registers[0].options.updateViaCache, 'none');
  await env.ready();
  assert.equal(env.updates.length, 1);
  assert.equal(env.api.state().phase, 'ready');
  assert.equal(env.reloads.length, 0); assert.equal(env.messages.length, 0);
});
await check('a first install without an active worker never announces an update', async () => {
  const env = await setup({ active: false, controller: false }).ready();
  assert.equal(env.api.state().phase, 'hidden'); assert.equal(env.node.hidden, true);
});
await check('a waiting update in an already controlled page is announced without mutation', async () => {
  const env = await setup({ active: false, controller: true }).ready();
  assert.equal(env.api.state().phase, 'ready'); assert.equal(env.node.hidden, false);
  assert.equal(env.messages.length, 0); assert.equal(env.reloads.length, 0);
});
await check('no waiting worker means no banner', async () => {
  const env = await setup({ waiting: false }).ready();
  assert.equal(env.api.state().phase, 'hidden'); assert.equal(env.node.hidden, true);
});
await check('disabled, insecure and file pages do not register or mount a banner', async () => {
  for (const options of [{ enabled: false }, { secure: false }, { pageURL: 'file:///H:/FormCapy/index.html' }]) {
    const env = await setup(options).ready();
    assert.equal(env.registers.length, 0); assert.equal(env.doc.body.children.length, 0);
    assert.equal(env.api.state().started, false);
  }
});
await check('registration rejection and synchronous failure do not escape or affect documents', async () => {
  for (const options of [{ registerError: true }, { registrationThrows: true }]) {
    const env = await setup(options).ready();
    assert.equal(env.reloads.length, 0); assert.equal(env.messages.length, 0);
    assert.equal(env.api.state().phase, 'hidden');
  }
});
await check('an offline update failure leaves the ready prompt and document available', async () => {
  const env = await setup({ updateError: true }).ready();
  assert.equal(await env.api.check(), false);
  assert.equal(env.api.state().phase, 'ready'); assert.equal(env.reloads.length, 0);
});
await check('all three languages describe saving before reload and can change at runtime', async () => {
  const env = await setup().ready();
  for (const [language, label, warning] of [['zh', '更新', '保存'], ['en', 'Update', 'Save'], ['es', 'Actualizar', 'Guarda']]) {
    env.language(language);
    assert.equal(env.primary().textContent, label);
    assert(env.node.children[1].textContent.includes(warning));
    assert(env.node.attributes['aria-label']);
  }
  env.language('unknown'); assert.equal(env.primary().textContent, 'Update');
});
await check('the first Update click asks for saved-work confirmation without contacting the worker', async () => {
  const env = await setup().ready(); env.primary().click();
  assert.equal(env.api.state().phase, 'review'); assert.equal(env.messages.length, 0);
  assert(env.node.children[1].textContent.includes('丢失')); assert.equal(env.reloads.length, 0);
  env.secondary().click(); assert.equal(env.api.state().phase, 'ready');
});
await check('Later hides this candidate in this page session without storing preferences', async () => {
  const env = await setup().ready(); env.secondary().click();
  assert.equal(env.api.state().phase, 'hidden'); await env.api.check();
  assert.equal(env.api.state().phase, 'hidden'); assert.equal(env.messages.length, 0);
  const newWorker = new Target(); newWorker.state = 'installed'; env.reg.waiting = newWorker;
  await env.api.check(); assert.equal(env.api.state().phase, 'ready');
});
await check('processing blocks update even if processing starts after the confirmation view', async () => {
  const env = await setup().ready(); env.primary().click(); env.busy(true); env.primary().click();
  assert.equal(env.api.state().phase, 'busy'); assert.equal(env.messages.length, 0);
  env.busy(false); env.primary().click(); assert.equal(env.api.state().phase, 'review');
});
await check('only the second explicit click sends confirmed activation with a response port', async () => {
  const env = await setup().ready(); env.primary().click(); env.primary().click();
  assert.equal(env.api.state().phase, 'activating'); assert.equal(env.messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(env.messages[0].data)), { type: 'FORMCAPY_ACTIVATE_UPDATE', confirmed: true });
  assert.equal(env.messages[0].ports.length, 1); assert.equal(env.reloads.length, 0);
  assert.equal(env.primary().disabled, true); assert.equal(env.secondary().disabled, true);
});
await check('a controller change before user consent never reloads this page', async () => {
  const env = await setup().ready(); env.sw.emit('controllerchange');
  assert.equal(env.reloads.length, 0); env.primary().click(); env.sw.emit('controllerchange');
  assert.equal(env.reloads.length, 0);
});
await check('after consent controllerchange reloads exactly once', async () => {
  const env = await setup({ reply: 'activating' }).ready(); env.primary().click(); env.primary().click();
  env.sw.emit('controllerchange'); env.sw.emit('controllerchange');
  assert.equal(env.reloads.length, 1); assert.equal(env.api.state().reloaded, true);
});
await check('activated worker state also completes an approved update without repeated reloads', async () => {
  const env = await setup({ reply: 'activating' }).ready(); env.primary().click(); env.primary().click();
  env.worker.state = 'activated'; env.worker.emit('statechange'); env.sw.emit('controllerchange');
  assert.equal(env.reloads.length, 1);
});
await check('a worker that activated before acknowledging the request still reloads once', async () => {
  const env = await setup({ reply: 'activating', workerState: 'activated' }).ready();
  env.primary().click(); env.primary().click(); assert.equal(env.reloads.length, 1);
});
await check('other open FormCapy tabs block update and later controller changes do not reload', async () => {
  const env = await setup({ reply: 'other-tabs' }).ready(); env.primary().click(); env.primary().click();
  assert.equal(env.api.state().phase, 'other-tabs'); assert.equal(env.api.state().consent, false);
  assert(env.node.children[1].textContent.includes('其他 FormCapy'));
  env.sw.emit('controllerchange'); assert.equal(env.reloads.length, 0);
  env.primary().click(); assert.equal(env.api.state().phase, 'review');
});
await check('unavailable response, missing MessageChannel and postMessage failure are recoverable', async () => {
  for (const options of [{ reply: 'unavailable' }, { channel: false }, {}]) {
    const env = await setup(options).ready();
    if (!options.reply && options.channel !== false) env.worker.postMessage = () => { throw new Error('worker unavailable'); };
    env.primary().click(); env.primary().click();
    assert.equal(env.api.state().phase, 'failed'); assert.equal(env.api.state().consent, false);
    env.sw.emit('controllerchange'); assert.equal(env.reloads.length, 0);
  }
});
await check('failure to construct a response channel leaves the document available', async () => {
  const env = await setup().ready();
  // A new instance captures the failing constructor as it would at startup.
  env.api.dispose(); env.page.MessageChannel = class { constructor() { throw new Error('channel denied'); } };
  const api = env.page.FormCapyUpdates.start({ window: env.page, document: env.doc });
  await flush(); const buttons = env.doc.body.firstChild.children[2].children;
  buttons[0].click(); buttons[0].click();
  assert.equal(api.state().phase, 'failed'); assert.equal(api.state().consent, false);
  assert.equal(env.reloads.length, 0); api.dispose();
});
await check('an unknown processing state safely prevents activation', async () => {
  const env = await setup().ready(); env.api.dispose();
  const api = env.page.FormCapyUpdates.start({ window: env.page, document: env.doc, isBusy() { throw new Error('state unavailable'); } });
  await flush(); env.doc.body.firstChild.children[2].children[0].click();
  assert.equal(api.state().phase, 'busy'); assert.equal(env.messages.length, 0);
  api.dispose();
});
await check('changed waiting candidate requires a new preview instead of activating a stale worker', async () => {
  const env = await setup().ready(); env.primary().click(); env.reg.waiting = new Target();
  env.primary().click(); assert.equal(env.api.state().phase, 'failed');
  assert.equal(env.messages.length, 0); assert.equal(env.reloads.length, 0);
});
await check('a silent worker times out without reload, and delayed activation cannot refresh the document', async () => {
  const env = await setup().ready(); env.primary().click(); env.primary().click();
  env.expire(15000); assert.equal(env.api.state().phase, 'failed'); assert.equal(env.api.state().consent, false);
  env.worker.state = 'activated'; env.worker.emit('statechange'); env.sw.emit('controllerchange');
  assert.equal(env.reloads.length, 0);
});
await check('an unrelated installation event cannot replace a pending user-approved transition', async () => {
  const env = await setup().ready(); env.primary().click(); env.primary().click();
  const installing = new Target(); env.reg.installing = installing; env.reg.emit('updatefound');
  env.reg.waiting = new Target(); installing.emit('statechange');
  assert.equal(env.api.state().phase, 'activating'); assert.equal(env.messages.length, 1);
  assert.equal(env.primary().disabled, true); env.api.dispose();
});
await check('new installation reaching waiting is detected through statechange', async () => {
  const env = await setup({ waiting: false }).ready(); const installing = new Target();
  env.reg.installing = installing; env.reg.emit('updatefound');
  env.reg.waiting = env.worker; installing.emit('statechange');
  assert.equal(env.api.state().phase, 'ready');
});
await check('focus and visibility checks are throttled; manual checks can retry', async () => {
  const env = await setup().ready(); const count = env.updates.length;
  env.page.emit('focus'); env.doc.emit('visibilitychange'); await flush();
  assert.equal(env.updates.length, count);
  await env.api.check(); assert.equal(env.updates.length, count + 1);
});
await check('disposing stops timers, removes listeners/banner and never reloads on late events', async () => {
  const env = await setup().ready(); env.primary().click(); env.primary().click(); env.api.dispose();
  assert.equal(env.doc.body.children.length, 0); assert.equal(env.timers.size, 0);
  env.worker.state = 'activated'; env.worker.emit('statechange'); env.sw.emit('controllerchange'); env.page.emit('focus');
  assert.equal(env.reloads.length, 0);
});
await check('dispose before registration resolves never installs late listeners or timers', async () => {
  const env = setup(); env.api.dispose(); await env.ready();
  assert.equal(env.api.state().registered, false); assert.equal(env.timers.size, 0);
});
await check('the host lock begins only after saved-work confirmation and ends before reload', async () => {
  const env = await setup({ reply: 'activating' }).ready();
  assert.deepEqual(env.transitions, []); env.primary().click(); assert.deepEqual(env.transitions, []);
  env.primary().click(); assert.deepEqual(env.transitions, [true]); assert.equal(env.api.state().updating, true);
  env.sw.emit('controllerchange'); assert.deepEqual(env.transitions, [true, false]);
  assert.equal(env.api.state().updating, false); assert.equal(env.reloads.length, 1);
  env.sw.emit('controllerchange'); env.api.dispose(); assert.deepEqual(env.transitions, [true, false]);
});
await check('refusal, failure, timeout and disposal always release the host lock', async () => {
  for (const variant of ['other-tabs', 'unavailable', 'post-failed', 'timeout', 'dispose']) {
    const env = await setup({ reply: ['other-tabs', 'unavailable'].includes(variant) ? variant : undefined }).ready();
    if (variant === 'post-failed') env.worker.postMessage = () => { throw new Error('dispatch failed'); };
    env.primary().click(); env.primary().click();
    if (variant === 'timeout') env.expire(15000);
    if (variant === 'dispose') env.api.dispose();
    assert.deepEqual(env.transitions, [true, false], variant);
    assert.equal(env.api.state().updating, false, variant);
    env.sw.emit('controllerchange'); assert.equal(env.reloads.length, 0, variant);
    env.api.dispose();
  }
});
await check('a throwing lock callback cancels activation, attempts unlock and cannot arm a reload', async () => {
  const env = await setup({ onUpdating(value) { if (value) throw new Error('host lock failed'); } }).ready();
  env.primary().click(); env.primary().click();
  assert.deepEqual(env.transitions, [true, false]); assert.equal(env.messages.length, 0);
  assert.equal(env.api.state().phase, 'failed'); assert.equal(env.api.state().consent, false);
  env.sw.emit('controllerchange'); assert.equal(env.reloads.length, 0); env.api.dispose();
});
await check('a throwing unlock callback prevents navigation and does not re-arm on later events', async () => {
  const env = await setup({ reply: 'activating', onUpdating(value) { if (!value) throw new Error('host unlock failed'); } }).ready();
  env.primary().click(); env.primary().click(); env.sw.emit('controllerchange');
  assert.deepEqual(env.transitions, [true, false]); assert.equal(env.api.state().phase, 'failed');
  assert.equal(env.api.state().consent, false); assert.equal(env.reloads.length, 0);
  env.worker.state = 'activated'; env.worker.emit('statechange'); env.sw.emit('controllerchange');
  assert.equal(env.reloads.length, 0); env.api.dispose();
});
const failed = checks.filter((check) => !check.passed);
console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
