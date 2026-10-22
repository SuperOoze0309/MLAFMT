// Integration of the real citation UI and main-page Word callback. This narrow
// in-memory DOM does not claim browser layout, clipboard, downloads or worker QA.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = (name) => fs.readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
const pageSource = source("templates/index.html");
const modelSource = source("static/citation-library.js");
const assistantSource = source("static/citation-assistant.js");
const clone = (value) => JSON.parse(JSON.stringify(value));

function section(start, end) {
  const a = pageSource.indexOf(start), b = pageSource.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `main-page source anchor: ${start}`);
  return pageSource.slice(a, b);
}

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = []; this.parent = null; this.events = new Map();
    this.attributes = new Map(); this.className = ""; this._text = "";
    this.value = ""; this.hidden = false; this.disabled = false; this.inert = false;
    this.classList = { add: (name) => { this.className += ` ${name}`; } };
  }
  get textContent() { return this._text + this.children.map((node) => node.textContent).join(""); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) {
    for (const node of nodes.flat()) {
      const child = typeof node === "string" ? { textContent: node } : node;
      if (!child) continue;
      child.parent = this; this.children.push(child);
    }
  }
  replaceChildren(...nodes) { this.children = []; this._text = ""; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  addEventListener(type, callback) {
    if (!this.events.has(type)) this.events.set(type, new Set());
    this.events.get(type).add(callback); // Native DOM deduplicates identical listeners.
  }
  async dispatch(type) {
    if (this.disabled && type === "click") return;
    for (const callback of this.events.get(type) || []) await callback({ target: this });
  }
  click() { return this.dispatch("click"); }
  focus() {}
}

function find(node, attribute, value) {
  if (node.getAttribute?.(attribute) === value) return node;
  for (const child of node.children || []) {
    const result = find(child, attribute, value);
    if (result) return result;
  }
  return null;
}

function setup({ honorAbort = true } = {}) {
  const formStart = pageSource.indexOf('<form id="essay-form"');
  const formEnd = pageSource.indexOf("</form>", formStart);
  const mountPosition = pageSource.indexOf('id="citation-assistant-mount"');
  assert.ok(formStart >= 0 && formEnd > formStart && mountPosition > formEnd,
    "the citation mount and its cancel button are outside the inert paper form");
  const document = {
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
  };
  document.body = document.createElement("body");
  const mount = document.createElement("section");
  const nodes = new Map([["citation-assistant-mount", mount]]);
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, document.createElement("div"));
    return nodes.get(id);
  };
  const paper = Object.freeze({ url: "blob:original-paper", name: "original.docx" });
  $("web-download").href = paper.url;
  $("web-download").download = paper.name;
  $("date").value = "Manually entered date";
  const jobs = [], created = [], revoked = [];
  class LocalURL extends URL {
    static createObjectURL(blob) {
      const url = `blob:references-${created.length}`;
      created.push({ url, blob }); return url;
    }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const transport = {
    kind: "browser",
    generate(request) {
      assert.ok(request.signal instanceof AbortSignal, "host forwards the UI AbortSignal");
      assert.equal(request.request.kind, "bibliography");
      assert.equal(request.file, null);
      return new Promise((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("cancelled"), { code: "cancelled" }));
        if (honorAbort) {
          request.signal.addEventListener("abort", abort, { once: true });
          if (request.signal.aborted) abort();
        }
        jobs.push({ request, resolve });
      });
    },
  };
  const host = vm.createContext({
    $, transport, inProgress: false, sharing: false, paragraphLoading: false,
    citationWordBusy: false, updateInProgress: false, webResult: paper, URL: LocalURL,
  });
  const locks = section("      function syncWorkLocks()", "      const BUILTIN_PRESETS");
  const callback = section("onExportWord: transport?.kind", " : undefined,")
    .replace(/^onExportWord: /, "const exportWord = ");
  vm.runInContext(locks + callback + " : undefined;", host);
  const ui = vm.createContext({
    document, navigator: {}, Blob, URL: LocalURL, TextEncoder, TextDecoder,
    AbortController, setTimeout, clearTimeout,
  });
  vm.runInContext(modelSource, ui);
  vm.runInContext(assistantSource, ui);
  const engine = {
    render: async (_, style) => ({ style, heading: "Works Cited", html: "<p>Example</p>", text: "Example", entries: [] }),
    safeFragment: () => document.createElement("div"),
  };
  const assistant = ui.FormCapyCitationAssistant.create({
    mount, storage: null, engine, onExportWord: vm.runInContext("exportWord", host),
  });
  const action = (name) => {
    const node = find(mount, "data-action", name); assert.ok(node, `action: ${name}`); return node;
  };
  const fillTitle = async (title) => {
    const input = find(mount, "data-field", "title");
    input.value = title; await input.dispatch("input");
  };
  const checkPaper = () => {
    assert.equal(host.webResult, paper);
    assert.equal($("web-download").href, paper.url);
    assert.equal($("web-download").download, paper.name);
    assert.equal($("date").value, "Manually entered date");
    assert.ok(!revoked.includes(paper.url), "existing paper URL is never revoked");
  };
  const checkUnlocked = () => {
    assert.equal($("essay-form").inert, false);
    assert.equal($("convert").disabled, false);
    assert.equal($("blank").disabled, false);
    checkPaper();
  };
  return { $, host, assistant, action, fillTitle, jobs, created, revoked, checkPaper, checkUnlocked, mount };
}

async function prepare(h) {
  await h.action("add").click();
  await h.fillTitle("Fictional reference");
  await h.action("preview").click();
  assert.equal(h.assistant.state().previewStale, false);
}

test("Word cancel remains reachable outside the locked paper form and supports immediate retry", async () => {
  const h = setup();
  try {
    await prepare(h);
    const before = clone(h.assistant.state());
    const first = h.action("word").click();
    assert.equal(h.$("essay-form").inert, true);
    assert.equal(h.mount.inert, false);
    const cancel = h.action("word-cancel");
    assert.equal(cancel.hidden, false); assert.equal(cancel.disabled, false);
    assert.equal(cancel.type, "button"); assert.ok(cancel.textContent.trim());
    h.checkPaper();
    await cancel.click();
    await first;
    assert.equal(h.jobs[0].request.signal.aborted, true);
    h.checkUnlocked();
    assert.deepEqual(clone(h.assistant.state().items), before.items);
    assert.deepEqual(clone(h.assistant.state().preview), before.preview);
    assert.equal(h.action("word").disabled, false);
    const retry = h.action("word").click();
    assert.equal(h.jobs.length, 2); assert.equal(h.$("essay-form").inert, true);
    h.jobs[1].resolve({ blob: new Blob(["synthetic"]), name: "references.docx" });
    await retry;
    h.checkUnlocked();
    assert.equal(h.created.length, 1);
  } finally { h.assistant.dispose(); }
});

test("editing during Word generation aborts work and unlocks the paper form", async () => {
  const h = setup();
  try {
    await prepare(h);
    const running = h.action("word").click();
    await h.fillTitle("Changed reference");
    await running;
    assert.equal(h.jobs[0].request.signal.aborted, true);
    assert.equal(h.assistant.state().items[0].title, "Changed reference");
    assert.equal(h.assistant.state().previewStale, true);
    assert.equal(h.created.length, 0);
    h.checkUnlocked();
  } finally { h.assistant.dispose(); }
});

test("disposing during Word generation aborts transport and unlocks the paper form", async () => {
  const h = setup();
  await prepare(h);
  const running = h.action("word").click();
  h.assistant.dispose();
  await running;
  assert.equal(h.jobs[0].request.signal.aborted, true);
  assert.equal(h.created.length, 0);
  h.checkUnlocked();
});

test("a host result arriving after disposal is revoked without changing the original paper", async () => {
  const h = setup({ honorAbort: false });
  await prepare(h);
  const running = h.action("word").click();
  h.assistant.dispose();
  assert.equal(h.jobs[0].request.signal.aborted, true);
  h.jobs[0].resolve({ blob: new Blob(["late synthetic"]), name: "late.docx" });
  await running;
  assert.equal(h.created.length, 1);
  assert.ok(h.revoked.includes(h.created[0].url));
  h.checkUnlocked();
});

function setupRetry() {
  const nodes = new Map(), jobs = [], reports = [];
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Element("button"));
    return nodes.get(id);
  };
  let context;
  const transport = {
    init() {
      return new Promise((resolve, reject) => { jobs.push({ resolve, reject }); });
    },
    cancel() {
      for (const job of jobs) job.reject(Object.assign(new Error("cancelled"), { code: "cancelled" }));
    },
    errorCode: (error) => error.code || "failed",
  };
  context = vm.createContext({
    $, transport, generationSeq: 0, inProgress: false, sharing: false,
    paragraphLoading: false, citationWordBusy: false, updateInProgress: false,
    paragraphController: null, paragraphNotice: null, stageKey: null,
    busy: (active) => { context.inProgress = active; },
    renderParagraphs() {}, renderProcessingProgress() {},
    setStatus: (key, tone) => reports.push({ key, tone }),
  });
  vm.runInContext(section('      $("cancel-processing").addEventListener("click"',
    '      if (transport?.kind === "browser"'), context);
  return { $, context, jobs, reports,
    retry: () => $("browser-retry").click(),
    cancel: () => $("cancel-processing").click(),
    latest: () => reports.at(-1)?.key,
  };
}

test("a shared initialization retry cannot overwrite a later paper cancellation", async () => {
  const h = setupRetry();
  const retry = h.retry();
  assert.equal(h.jobs.length, 1);
  // A paper generation begins while sharing the retry's pending initialization.
  h.context.generationSeq += 1;
  h.context.inProgress = true;
  await h.cancel();
  await retry;
  assert.equal(h.latest(), "cancelled");
  assert.equal(h.context.inProgress, false);
  assert.equal(h.context.stageKey, null);
});

test("an obsolete retry completion preserves the status and stage of a newer task", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const h = setupRetry();
    const retry = h.retry();
    h.context.generationSeq += 1;
    h.context.inProgress = true;
    h.context.stageKey = "stage_formatting";
    h.context.setStatus("stage_formatting", "working");
    if (outcome === "resolve") h.jobs[0].resolve();
    else h.jobs[0].reject(Object.assign(new Error("cancelled"), { code: "cancelled" }));
    await retry;
    assert.equal(h.latest(), "stage_formatting", outcome);
    assert.equal(h.context.stageKey, "stage_formatting", outcome);
  }
});

test("a cancelled retry cannot clear a replacement task started before its catch runs", async () => {
  const h = setupRetry();
  const retry = h.retry();
  h.context.inProgress = true;
  h.context.generationSeq += 1;
  const cancel = h.cancel();
  h.context.generationSeq += 1;
  h.context.inProgress = true;
  h.context.stageKey = "stage_reading";
  h.context.setStatus("stage_reading", "working");
  await cancel;
  await retry;
  assert.equal(h.latest(), "stage_reading");
  assert.equal(h.context.stageKey, "stage_reading");
  assert.equal(h.context.inProgress, true);
});

test("a genuine retry initialization failure stays visible and offers retry", async () => {
  const h = setupRetry();
  const retry = h.retry();
  h.jobs[0].reject(Object.assign(new Error("unavailable runtime"), { code: "engine_init_failed" }));
  await retry;
  assert.equal(h.latest(), "browser_init_failed");
  assert.equal(h.$("browser-retry").hidden, false);
  assert.equal(h.context.stageKey, null);
});

test("retry does not start while bibliography Word generation holds the host lock", async () => {
  const h = setupRetry();
  h.context.citationWordBusy = true;
  h.context.stageKey = "previous_stage";
  await h.retry();
  assert.equal(h.jobs.length, 0);
  assert.equal(h.reports.length, 0);
  assert.equal(h.context.stageKey, "previous_stage");
});

test("initialization cancellation without an obsolete generation is not reported as failure", async () => {
  const h = setupRetry();
  const retry = h.retry();
  h.jobs[0].reject(Object.assign(new Error("cancelled"), { code: "cancelled" }));
  await retry;
  assert.equal(h.latest(), "cancelled");
  assert.equal(h.$("browser-retry").hidden, false);
  assert.equal(h.context.stageKey, null);
});
