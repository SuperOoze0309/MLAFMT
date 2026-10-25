// Focused DOM tests for the standalone citation assistant.
// A small in-memory DOM adapter exercises the real static/citation-assistant.js;
// it is not a browser layout or real clipboard test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modelSource = fs.readFileSync(path.join(root, "static/citation-library.js"), "utf8");
const importSource = fs.readFileSync(path.join(root, "static/citation-import.js"), "utf8");
const exportSource = fs.readFileSync(path.join(root, "static/citation-export.js"), "utf8");
const assistantSource = fs.readFileSync(path.join(root, "static/citation-assistant.js"), "utf8");
const assistantCss = fs.readFileSync(path.join(root, "static/citation-assistant.css"), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

class TextNode {
  constructor(text) { this.textContent = String(text); this.parent = null; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
}

class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this._text = "";
    this.value = "";
    this.type = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.files = [];
    this.readOnly = false;
    this.selected = false;
    this.focused = false;
    this.events = new Map();
    this.style = {};
    this.href = "";
    this.download = "";
    this.rel = "";
    this.target = "";
    this.min = "";
    this.max = "";
    this.accept = "";
    this.classList = {
      add: (...names) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => set.add(name));
        this.className = [...set].join(" ");
      },
      remove: (...names) => {
        this.className = this.className.split(/\s+/)
          .filter((name) => name && !names.includes(name)).join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const present = this.classList.contains(name);
        const next = force === undefined ? !present : Boolean(force);
        if (next) this.classList.add(name); else this.classList.remove(name);
        return next;
      },
    };
  }
  get textContent() {
    return this._text + this.children.map((child) => child.textContent || "").join("");
  }
  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }
  get innerHTML() {
    return this._text + this.children.map((child) => child.tagName ? child.innerHTML : child.textContent).join("");
  }
  set innerHTML(value) {
    this.children = [];
    this._text = String(value);
  }
  append(...nodes) {
    for (const node of nodes.flat()) {
      if (node === null || node === undefined) continue;
      const child = typeof node === "string" ? new TextNode(node) : node;
      child.parent = this;
      this.children.push(child);
      // A real single-select chooses its first option when it is inserted.
      if (this.tagName === "SELECT" && child.tagName === "OPTION" &&
          this.children.filter((entry) => entry.tagName === "OPTION").length === 1 && this.value === "") {
        this.value = child.value;
      }
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  addEventListener(name, handler) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name).push(handler);
  }
  async dispatch(name, event = {}) {
    if (this.disabled && name === "click") return;
    for (const handler of this.events.get(name) || []) {
      await handler({ target: this, type: name, ...event });
    }
  }
  click() {
    if (this.tagName === "A" && this.download && this.ownerDocument?.downloads) {
      this.ownerDocument.downloads.push({ href: this.href, filename: this.download, rel: this.rel });
    }
    return this.dispatch("click");
  }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  setSelectionRange() {}
  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (String(name).startsWith("data-")) this.dataset[String(name).slice(5)] = String(value);
  }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  removeAttribute(name) { this.attributes.delete(String(name)); }
}

function makeDocument() {
  const document = {
    body: new Element("body"),
    downloads: [],
    createElement(tag) {
      const node = new Element(tag);
      node.ownerDocument = document;
      return node;
    },
    createTextNode: (text) => new TextNode(text),
    createDocumentFragment: () => new Element("fragment"),
  };
  return document;
}

function makeStorage() {
  const map = new Map();
  return {
    map, gets: [], sets: [], removes: [],
    failSet: false,
    getItem(key) { this.gets.push(key); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) {
      if (this.failSet) throw new DOMException("quota", "QuotaExceededError");
      this.sets.push([key, value]); map.set(key, value);
    },
    removeItem(key) { this.removes.push(key); map.delete(key); },
  };
}

function makeEngine({ manual = false, layout = null } = {}) {
  const calls = [], safeCalls = [], queue = [];
  const engine = {
    calls, safeCalls, queue,
    safeError: false,
    failCode: "",
    layout: layout || { hangingindent: 36, linespacing: 2, entryspacing: 8, "second-field-align": false, maxoffset: 0 },
    attribution: "(c) Frank Bennett — citeproc-js test attribution",
    render(items, style) {
      calls.push({ items: JSON.parse(JSON.stringify(items)), style });
      if (engine.failCode) {
        const error = new Error(engine.failCode);
        error.code = engine.failCode;
        return Promise.reject(error);
      }
      if (manual) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject, style }));
      }
      return Promise.resolve({
        style, heading: "Works Cited", html: `<p>${style}</p>`,
        text: `${style} bibliography`, entries: [], layout: engine.layout,
      });
    },
    safeFragment(html, document) {
      safeCalls.push(html);
      if (engine.safeError) {
        const error = new Error("unsafe_citation_output");
        error.code = "unsafe_citation_output";
        throw error;
      }
      const node = document.createElement("div");
      node.className = "safe-fragment";
      node.textContent = "SANITIZED";
      return node;
    },
    resolve(index, text) {
      const entry = queue[index];
      entry.resolve({
        style: entry.style, heading: "Works Cited", html: `<p>${text}</p>`,
        text, entries: [], layout: engine.layout,
      });
    },
  };
  return engine;
}

function makeBlob(parts, options = {}) {
  return { parts, type: options.type || "" };
}
class URLStub extends URL {
  static createObjectURL(blob) {
    URLStub.created.push(blob);
    const url = "blob:test-" + URLStub.serial++;
    URLStub.urls.push(url);
    return url;
  }
  static revokeObjectURL(url) { URLStub.revoked.push(url); }
}
URLStub.revoked = [];
URLStub.created = [];
URLStub.urls = [];
URLStub.serial = 0;

function setup({ locale = "en", manual = false, onExportWord = null, allowDownloads = true,
  importer = null, lookup = null, batch = null, exporter = null } = {}) {
  const document = makeDocument();
  const mount = document.createElement("div");
  const storage = makeStorage();
  const engine = makeEngine({ manual });
  const navigator = { clipboard: undefined };
  const networkCalls = [];
  const context = vm.createContext({
    document, navigator, localStorage: storage,
    Blob: makeBlob, URL: URLStub, TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, console, queueMicrotask,
    fetch(...args) { networkCalls.push(args); throw new Error("Network is forbidden in citation DOM tests"); },
  });
  vm.runInContext(modelSource, context);
  if (importer === true) vm.runInContext(importSource, context);
  if (exporter === true) vm.runInContext(exportSource, context);
  vm.runInContext(assistantSource, context);
  const M = context.FormCapyCitations;
  const intake = importer === true ? context.FormCapyCitationImport : importer;
  const portable = exporter === true ? context.FormCapyCitationExport : exporter;
  const A = context.FormCapyCitationAssistant;
  const localeBox = { value: locale };
  const assistant = A.create({
    mount, model: M, engine, storage,
    getLocale: () => localeBox.value,
    onExportWord, allowDownloads, importer: intake, lookup, batch, exporter: portable,
  });
  return { document, mount, storage, engine, model: M, assistant, locale: localeBox, navigator,
    importer: intake, lookup, batch, exporter: portable, networkCalls };
}

function walk(node, callback) {
  callback(node);
  for (const child of node.children || []) walk(child, callback);
}
function action(h, name) {
  let found = null;
  walk(h.mount, (node) => {
    if (!found && node.getAttribute && node.getAttribute("data-action") === name) found = node;
  });
  return found;
}
function actions(h, name) {
  const found = [];
  walk(h.mount, (node) => {
    if (node.getAttribute && node.getAttribute("data-action") === name) found.push(node);
  });
  return found;
}
function field(h, name) {
  let found = null;
  walk(h.mount, (node) => {
    if (!found && node.getAttribute && node.getAttribute("data-field") === name) found = node;
  });
  return found;
}
function libraryFile(h) {
  // Acquisition and saved-library import own separate file inputs. Keep the
  // legacy import regressions attached to their intended control as UI grows.
  const input = field(h, "library-file");
  assert.ok(input, "saved-library JSON file input exists");
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.type, "file");
  return input;
}
function tag(h, name, predicate = () => true) {
  let found = null;
  walk(h.mount, (node) => {
    if (!found && node.tagName === name && predicate(node)) found = node;
  });
  return found;
}
function fill(h, value) {
  const input = field(h, "title");
  input.value = value;
  return input.dispatch("input");
}
function setDatePart(h, which, part, value) {
  const input = field(h, which + "-" + part);
  input.value = value;
  return input.dispatch("input");
}
function addAndFill(h, title = "Fictional source") {
  return (async () => {
    await action(h, "add").click();
    await fill(h, title);
    await action(h, "add-author").click();
    const family = field(h, "author-family-0");
    family.value = "García"; await family.dispatch("input");
    const given = field(h, "author-given-0");
    given.value = "María"; await given.dispatch("input");
    return h.assistant.state();
  })();
}
function status(h) { return h.mount.textContent; }

// Controlled coordinator snapshots exercise UI ownership independently of the
// batch module's timer/network tests. No test below contacts a public API.
const copyIntake = (value) => JSON.parse(JSON.stringify(value));
const readyDoi = (doi, line = 1) => ({ line, input: doi, doi, status: "ready", errors: [] });
const succeededDoi = (row, item) => ({ ...row, status: "success", items: [item], warnings: [], errors: [] });
const failedDoi = (row, code = "lookup_not_found") => ({ ...row, status: "failed", items: [], warnings: [], errors: [{ code }] });
function intakeItem(h, title = "Fictional retrieved article", doi = "10.5555/first") {
  return h.model.createItem({ type: "article-journal", title, DOI: doi,
    authors: [{ family: "Example", given: "Ana" }], issued: { year: 2024 },
    containerTitle: "Fictional Journal", volume: "3", issue: "1", page: "10-20" });
}
function batchSnapshot(rows, flags = {}) {
  const snapshot = copyIntake(rows);
  return { rows: snapshot, items: snapshot.filter((row) => row.status === "success").flatMap((row) => row.items || []),
    completed: snapshot.filter((row) => row.status === "success").length,
    failed: snapshot.filter((row) => row.status === "failed").length,
    cancelled: false, rateLimited: false, ...flags };
}
function controlledBatch(parseResult = null) {
  const parses = [], jobs = [];
  const api = {
    parse(text) {
      parses.push(text);
      return copyIntake(parseResult || { ok: true,
        rows: text.split(/\r?\n/).map((doi, index) => readyDoi(doi, index + 1)), errors: [] });
    },
    run(rows, options) {
      return new Promise((resolve, reject) => jobs.push({ rows: copyIntake(rows), options, resolve, reject }));
    },
  };
  const publish = (index, rows, flags) => {
    const result = batchSnapshot(rows, flags);
    jobs[index].options.onProgress?.(copyIntake(result));
    return result;
  };
  return { api, parses, jobs, publish,
    finish(index, rows, flags) { const result = publish(index, rows, flags); jobs[index].resolve(result); return result; } };
}
function controlledLookup() {
  const calls = [];
  return { calls, lookup(input, options) {
    return new Promise((resolve, reject) => calls.push({ input, options, resolve, reject }));
  } };
}
async function beginDoi(h, text = "10.5555/first") {
  const input = field(h, "intake-doi");
  input.value = text;
  await input.dispatch("input");
  const pending = action(h, "intake-query").click();
  await flush();
  return { pending };
}
function candidateInputs(h) {
  const found = [];
  walk(h.mount, (node) => {
    if (node.getAttribute?.("data-field")?.startsWith("intake-select-")) found.push(node);
  });
  return found;
}
async function selectCandidate(h, index, selected) {
  const node = field(h, `intake-select-${index}`);
  assert.ok(node, `candidate ${index} checkbox exists`);
  assert.equal(node.type, "checkbox");
  node.checked = selected;
  await node.dispatch("change");
}
function cslImportText(titles) {
  return JSON.stringify(titles.map((title) => ({ type: "book", title,
    author: [{ family: "Example", given: "Ana" }],
    issued: { "date-parts": [[2024]] }, publisher: "Fictional Press" })));
}

// Portable-export UI tests inject a pure formatter. Serializer correctness and
// actual third-party interoperability are covered by the export module suite.
function portableExporter(overrides = {}) {
  const calls = [];
  return {
    calls,
    exportLibrary(library, options) {
      calls.push({ library: copyIntake(library), options: copyIntake(options) });
      const format = options.format;
      const data = {
        "csl-json": { filename: "formcapy-references.csl.json", mime: "application/vnd.citationstyles.csl+json" },
        ris: { filename: "formcapy-references.ris", mime: "application/x-research-info-systems" },
        bibtex: { filename: "formcapy-references.bib", mime: "application/x-bibtex" },
      }[format];
      const text = format === "csl-json" ? JSON.stringify(library.items.map((item) => ({ id: item.id, title: item.title })))
        : library.items.map((item) => `${format}: ${item.title}`).join("\n");
      return { ok: true, format, text, ...data, warnings: [], errors: [], ...overrides };
    },
  };
}

async function loadLibraryItems(h, records) {
  const items = records.map((record) => h.model.createItem(record));
  await action(h, "import-toggle").click();
  field(h, "import-json").value = h.model.stringifyLibrary(h.model.createLibrary(items));
  await action(h, "review-import").click();
  await action(h, "apply-import").click();
  return h.assistant.state().items;
}

const managementRecords = () => [
  { id: "book_alpha", type: "book", title: "Écologie of capybaras",
    authors: [{ family: "García", given: "María" }, { literal: "Capybara Research Group" }],
    issued: { year: 2021 }, publisher: "Lakewood Press", DOI: "10.5555/book-one" },
  { id: "journal_beta", type: "article-journal", title: "水豚与湿地 🦫",
    authors: [{ family: "王", given: "明" }], issued: { year: 2024, month: 2, day: 29 },
    containerTitle: "Wetland Journal", volume: "12", issue: "3", page: "11-20", DOI: "10.5555/wetland" },
  { id: "web_gamma", type: "webpage", title: "A field guide",
    authors: [{ literal: "Habitat Institute" }], issued: { year: 2025 },
    containerTitle: "Capybara Field Notes", URL: "https://example.com/field-guide",
    accessed: { year: 2026, month: 10, day: 25 } },
];

test("mounts collapsed, starts session-only, and never touches storage at init", () => {
  const h = setup();
  const details = h.mount.children[0];
  assert.equal(details.tagName, "DETAILS");
  assert.equal(details.open, false);
  assert.equal(h.storage.gets.length, 0);
  assert.equal(h.storage.sets.length, 0);
  assert.equal(h.assistant.state().items.length, 0);
  assert.match(status(h), /Reference assistant/);
});

test("adds and edits an entry without auto-previewing or saving", async () => {
  const h = setup();
  await action(h, "add").click();
  await fill(h, "Étude 中文 🦫");
  await action(h, "add-author").click();
  const family = field(h, "author-family-0");
  family.value = "García"; await family.dispatch("input");
  const given = field(h, "author-given-0");
  given.value = "María"; await given.dispatch("input");
  const state = h.assistant.state();
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].title, "Étude 中文 🦫");
  assert.deepEqual(JSON.parse(JSON.stringify(state.items[0].authors)), [{ family: "García", given: "María" }]);
  assert.equal(h.engine.calls.length, 0);
  assert.equal(h.storage.sets.length, 0);
  assert.equal(action(h, "copy").disabled, true);
});

test("preview is explicit, safe-fragment based, and stale after edits or style changes", async () => {
  const h = setup();
  await addAndFill(h);
  await action(h, "preview").click();
  assert.equal(h.engine.calls.length, 1);
  assert.equal(h.engine.safeCalls.length, 1);
  assert.equal(h.assistant.state().previewStale, false);
  assert.equal(action(h, "copy").disabled, false);
  await fill(h, "Changed title");
  assert.equal(h.assistant.state().previewStale, true);
  assert.equal(action(h, "copy").disabled, true);
  await action(h, "preview").click();
  assert.equal(h.engine.calls.length, 2);
  const style = field(h, "style");
  style.value = "apa";
  await style.dispatch("change");
  assert.equal(h.assistant.state().previewStale, true);
  assert.equal(action(h, "copy").disabled, true);
  await action(h, "preview").click();
  assert.equal(h.engine.calls.at(-1).style, "apa");
  assert.equal(h.assistant.state().previewStale, false);
});

test("language switches preserve fields, authors, dates and style", async () => {
  const h = setup();
  await addAndFill(h, "Título original");
  const year = field(h, "issued-year");
  year.value = "2024"; await year.dispatch("input");
  const originalFamily = field(h, "author-family-0").value;
  h.locale.value = "es";
  h.assistant.render();
  assert.equal(field(h, "title").value, "Título original");
  assert.equal(field(h, "author-family-0").value, originalFamily);
  assert.equal(field(h, "issued-year").value, "2024");
  assert.equal(field(h, "style").value, "mla");
  assert.match(action(h, "add").textContent, /Añadir entrada/);
  h.locale.value = "zh";
  h.assistant.render();
  assert.equal(field(h, "title").value, "Título original");
  assert.match(action(h, "add").textContent, /添加条目/);
  assert.equal(h.assistant.state().previewStale, true);
  h.locale.value = "en";
  h.assistant.render();
  assert.match(action(h, "add").textContent, /Add entry/);
});

test("a language switch is label-only and keeps a fresh preview intact", async () => {
  const h = setup();
  await addAndFill(h);
  await action(h, "preview").click();
  assert.equal(h.assistant.state().previewStale, false);
  h.locale.value = "es";
  h.assistant.render();
  assert.equal(h.assistant.state().previewStale, false);
  assert.equal(action(h, "copy").disabled, false);
  assert.equal(h.assistant.state().preview.text, "mla bibliography");
  assert.match(status(h), /bibliografía|referencias/);
});

test("removing an entry is undoable", async () => {
  const h = setup();
  await addAndFill(h);
  assert.equal(h.assistant.state().items.length, 1);
  await action(h, "delete-entry").click();
  assert.equal(h.assistant.state().items.length, 0);
  assert.equal(action(h, "undo").hidden, false);
  await action(h, "undo").click();
  assert.equal(h.assistant.state().items.length, 1);
  assert.equal(field(h, "title").value, "Fictional source");
});

test("ordered authors can be moved and literal authors are supported", async () => {
  const h = setup();
  await addAndFill(h);
  await action(h, "add-author").click();
  const secondMode = field(h, "author-mode-1");
  secondMode.value = "literal";
  await secondMode.dispatch("change");
  const literal = field(h, "author-literal-1");
  literal.value = "Example Institute"; await literal.dispatch("input");
  await action(h, "preview").click();
  assert.deepEqual(JSON.parse(JSON.stringify(h.engine.calls.at(-1).items[0].author)), [
    { family: "García", given: "María" },
    { literal: "Example Institute" },
  ]);
  const firstUp = actions(h, "author-down")[0];
  await firstUp.click();
  await action(h, "preview").click();
  assert.deepEqual(JSON.parse(JSON.stringify(h.engine.calls.at(-1).items[0].author)), [
    { literal: "Example Institute" },
    { family: "García", given: "María" },
  ]);
});

test("a stale render cannot overwrite a newer preview", async () => {
  const h = setup({ manual: true });
  await addAndFill(h);
  const firstClick = action(h, "preview").click();
  await flush();
  await fill(h, "Newest title");
  const secondClick = action(h, "preview").click();
  await flush();
  assert.equal(h.engine.queue.length, 2);
  h.engine.resolve(0, "old bibliography");
  await flush();
  assert.equal(h.assistant.state().preview, null);
  h.engine.resolve(1, "new bibliography");
  await Promise.allSettled([firstClick, secondClick]);
  assert.equal(h.assistant.state().preview.text, "new bibliography");
  assert.equal(h.assistant.state().previewStale, false);
});

test("library import previews, cancels, applies and undoes without draft data", async () => {
  const h = setup();
  await addAndFill(h, "Original entry");
  const importedItem = h.model.createItem({
    title: "Imported entry", authors: [{ literal: "Example Group" }], issued: { year: 2023 },
  });
  const json = h.model.stringifyLibrary(h.model.createLibrary([importedItem]));
  await action(h, "import-toggle").click();
  const textarea = field(h, "import-json");
  textarea.value = json;
  await action(h, "review-import").click();
  assert.equal(h.assistant.state().pendingImport, true);
  assert.equal(h.assistant.state().items[0].title, "Original entry");
  await action(h, "cancel-review").click();
  assert.equal(h.assistant.state().pendingImport, false);
  assert.equal(h.assistant.state().items[0].title, "Original entry");
  await action(h, "review-import").click();
  await action(h, "apply-import").click();
  assert.equal(h.assistant.state().items[0].title, "Imported entry");
  assert.equal(action(h, "undo").hidden, false);
  await action(h, "undo").click();
  assert.equal(h.assistant.state().items[0].title, "Original entry");
});

test("malformed import leaves the current library untouched", async () => {
  const h = setup();
  await addAndFill(h);
  const before = JSON.stringify(h.assistant.state().items);
  await action(h, "import-toggle").click();
  const textarea = field(h, "import-json");
  textarea.value = '{"schema":"formcapy-citations","v":1,"items":[],"items":[]}';
  await action(h, "review-import").click();
  assert.equal(JSON.stringify(h.assistant.state().items), before);
  textarea.value = '{"schema":"formcapy-citations","v":99,"items":[]}';
  await action(h, "review-import").click();
  assert.equal(JSON.stringify(h.assistant.state().items), before);
  textarea.value = '{"schema":"formcapy-citations","v":1,"items":[],"__proto__":{}}';
  await action(h, "review-import").click();
  assert.equal(JSON.stringify(h.assistant.state().items), before);
  assert.match(status(h), /Invalid library JSON|JSON/);
});

test("fatal UTF-8 and size-limited file reads do not replace the library", async () => {
  const h = setup();
  await addAndFill(h);
  const before = JSON.stringify(h.assistant.state().items);
  const fileInput = libraryFile(h);
  assert.ok(fileInput, "file input exists");
  fileInput.files = [{ size: 3, arrayBuffer: async () => new Uint8Array([0xff, 0xfe, 0xfd]).buffer }];
  await fileInput.dispatch("change");
  await flush();
  assert.equal(JSON.stringify(h.assistant.state().items), before);
  fileInput.files = [{ size: h.model.MAX_JSON_BYTES + 1, arrayBuffer: async () => { throw new Error("must not read"); } }];
  await fileInput.dispatch("change");
  assert.equal(JSON.stringify(h.assistant.state().items), before);
});

test("saved-library file import stays separate from quick acquisition controls", async () => {
  const h = setup();
  await action(h, "import-toggle").click();
  const fileInput = libraryFile(h);
  const intakeFile = field(h, "intake-file");
  assert.ok(intakeFile, "quick acquisition file input exists");
  assert.notEqual(fileInput, intakeFile);
  assert.equal(fileInput.accept, ".json,application/json");
  assert.match(intakeFile.accept, /\.bib/);
  const intakeText = field(h, "intake-text");
  intakeText.value = "Unrelated pending bibliography text";
  const json = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "Saved library record" }),
  ]));
  fileInput.files = [{ size: json.length, arrayBuffer: async () => new TextEncoder().encode(json).buffer }];
  await fileInput.dispatch("change");
  assert.equal(field(h, "import-json").value, json);
  assert.equal(intakeText.value, "Unrelated pending bibliography text");
  assert.equal(h.assistant.state().items.length, 0, "reading a file does not apply it");
  await action(h, "review-import").click();
  assert.equal(h.assistant.state().pendingImport, true);
  await action(h, "apply-import").click();
  assert.equal(h.assistant.state().items[0].title, "Saved library record");
  assert.equal(intakeText.value, "Unrelated pending bibliography text");
});

test("save, load and remove are explicit and use only the owned key", async () => {
  const h = setup();
  await addAndFill(h, "Saved title");
  assert.equal(h.storage.gets.length, 0);
  await action(h, "save").click();
  assert.equal(h.storage.sets.length, 1);
  assert.equal(h.storage.sets[0][0], "formcapy.citations.v1");
  assert.equal(h.assistant.state().saved, true);
  await fill(h, "Unsaved title");
  assert.equal(h.assistant.state().saved, false);
  await action(h, "load").click();
  assert.equal(h.storage.gets.length, 1);
  assert.equal(h.assistant.state().items[0].title, "Saved title");
  await action(h, "remove-saved").click();
  assert.equal(h.storage.removes.length, 1);
  assert.equal(h.assistant.state().items[0].title, "Saved title");
  assert.equal(h.assistant.state().saved, false);
});

test("clipboard fallback is visible and XSS text stays text", async () => {
  const h = setup();
  await addAndFill(h, '<img src=x onerror="globalThis.pwned=1">');
  await action(h, "preview").click();
  await action(h, "copy").click();
  const fallback = tag(h, "TEXTAREA", (node) => node.readOnly &&
    node.className.split(/\s+/).includes("fc-citations-fallback"));
  assert.ok(fallback);
  assert.equal(fallback.hidden, false);
  assert.match(fallback.value, /mla bibliography/);
  let image = false;
  walk(h.mount, (node) => { if (node.tagName === "IMG") image = true; });
  assert.equal(image, false);
  assert.equal(globalThis.pwned, undefined);
  assert.equal(h.engine.safeCalls.length, 1);
});

test("Word export is optional, callback-driven and busy-safe", async () => {
  const absent = setup();
  await addAndFill(absent);
  await action(absent, "preview").click();
  assert.equal(action(absent, "word").hidden, true);
  let resolveWord;
  const calls = [];
  const h = setup({ onExportWord: (rendered) => {
    calls.push(rendered);
    return new Promise((resolve) => { resolveWord = resolve; });
  } });
  await addAndFill(h);
  await action(h, "preview").click();
  assert.equal(action(h, "word").hidden, false);
  const pending = action(h, "word").click();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(action(h, "word").disabled, true);
  resolveWord({ downloadUrl: "blob:word", name: "references.docx" });
  await pending;
  assert.equal(action(h, "word").disabled, false);
  assert.equal(action(h, "word") !== null, true);
});

test("downloads can be disabled without touching the native bridge", async () => {
  const h = setup({ allowDownloads: false, onExportWord: async () => ({ downloadUrl: "blob:x", name: "x.docx" }) });
  await addAndFill(h);
  await action(h, "preview").click();
  assert.equal(action(h, "word").hidden, true);
  assert.equal(action(h, "json-download").hidden, true);
  assert.equal(action(h, "html").hidden, true);
  assert.equal(action(h, "copy").disabled, false);
});

test("multiple entries keep source order, and JSON/HTML downloads exclude paper state", async () => {
  const h = setup();
  await addAndFill(h, "First fictional entry");
  await action(h, "add").click();
  await fill(h, "Second fictional entry");
  assert.equal(h.assistant.state().items.length, 2);
  await action(h, "preview").click();
  assert.deepEqual(h.engine.calls.at(-1).items.map((entry) => entry.title), [
    "First fictional entry", "Second fictional entry",
  ]);
  URLStub.created.length = 0;
  await action(h, "json-download").click();
  assert.equal(URLStub.created.at(-1).type, "application/json");
  const json = URLStub.created.at(-1).parts[0];
  assert.match(json, /"schema": "formcapy-citations"/);
  assert.match(json, /First fictional entry/);
  assert.doesNotMatch(json, /draft|student name|paper title/);
  await action(h, "html").click();
  assert.equal(URLStub.created.at(-1).type, "text/html");
  const exported = URLStub.created.at(-1).parts[0];
  assert.match(exported, /SANITIZED/);
  assert.match(exported, /line-height:2/);
  assert.match(exported, /padding-left:36px/);
  assert.match(exported, /text-indent:-36px/);
  assert.match(exported, /margin-bottom:8px/);
  assert.match(exported, /Generated locally with FormCapy/);
  assert.match(exported, /citeproc-js/);
  assert.doesNotMatch(exported, /<script/i);
});

test("preview CSS formats real CSL div entries with double spacing and a half-inch hanging indent", () => {
  const bodyRule = /\.fc-citations-preview-body\s*\{([^}]+)\}/.exec(assistantCss)?.[1] || "";
  const entryRule = /\.fc-citations-preview-body\s+\.csl-entry\s*\{([^}]+)\}/.exec(assistantCss)?.[1] || "";
  assert.match(bodyRule, /line-height:\s*2\s*;/);
  assert.match(entryRule, /padding-left:\s*0\.5in\s*;/);
  assert.match(entryRule, /text-indent:\s*-0\.5in\s*;/);
  assert.match(entryRule, /margin:\s*0\s*;/);
  assert.doesNotMatch(assistantCss, /\.fc-citations-preview-body\s+p\s*\{[^}]*text-indent/);
});

test("HTML export maps the real CSL boolean hanging indent to half an inch", async () => {
  const h = setup();
  h.engine.layout = { hangingindent: true, linespacing: 2, entryspacing: 0, "second-field-align": false, maxoffset: 0 };
  await addAndFill(h);
  await action(h, "preview").click();
  URLStub.created.length = 0;
  await action(h, "html").click();
  const exported = URLStub.created.at(-1).parts[0];
  assert.match(exported, /padding-left:48px/);
  assert.match(exported, /text-indent:-48px/);
});

test("HTML export leaves indentation off for CSL boolean false", async () => {
  const h = setup();
  h.engine.layout = { hangingindent: false, linespacing: 2, entryspacing: 0, "second-field-align": false, maxoffset: 0 };
  await addAndFill(h);
  await action(h, "preview").click();
  URLStub.created.length = 0;
  await action(h, "html").click();
  const exported = URLStub.created.at(-1).parts[0];
  assert.doesNotMatch(exported, /padding-left:|text-indent:/);
  assert.match(exported, /line-height:2/);
});

test("three locales keep catalog labels and preserve entered text", () => {
  for (const locale of ["en", "es", "zh"]) {
    const h = setup({ locale });
    assert.match(action(h, "add").textContent, locale === "zh" ? /添加/ : locale === "es" ? /Añadir/ : /Add/);
  }
});

test("invalid date components stay visible, block preview, and survive locale switches", async () => {
  const cases = [
    ["0", "", "", "date_invalid", "0"],
    ["-1", "", "", "date_invalid", "-1"],
    ["2024.5", "", "", "date_invalid", "2024.5"],
    ["", "2", "", "date_year_required", ""],
    ["", "", "2", "date_year_required", ""],
  ];
  for (const [year, month, day, code, expectedYear] of cases) {
    const h = setup();
    await addAndFill(h);
    await setDatePart(h, "issued", "year", year);
    await setDatePart(h, "issued", "month", month);
    await setDatePart(h, "issued", "day", day);
    assert.equal(h.assistant.state().items[0].issued.year === undefined ? "" : String(h.assistant.state().items[0].issued.year), expectedYear);
    assert.ok(h.model.validateItem(h.assistant.state().items[0]).errors.some((issue) => issue.code === code));
    await action(h, "preview").click();
    assert.equal(h.engine.calls.length, 0, "invalid date never reaches the engine");
    assert.equal(action(h, "copy").disabled, true);
    h.locale.value = "es";
    h.assistant.render();
    assert.equal(field(h, "issued-year").value, year);
    assert.equal(field(h, "issued-month").value, month);
    assert.equal(field(h, "issued-day").value, day);
    assert.match(status(h), /Fecha|inválid|año|mes|día/i);
  }
});

test("valid partial dates still reach CSL as partial date-parts", async () => {
  const h = setup();
  await addAndFill(h);
  await setDatePart(h, "issued", "year", "2024");
  await setDatePart(h, "issued", "month", "2");
  await action(h, "preview").click();
  assert.deepEqual(h.engine.calls.at(-1).items[0].issued["date-parts"], [[2024, 2]]);
  assert.equal(h.assistant.state().previewStale, false);
});

test("renderer DOI rejection is explicit and disabled formats stay disabled", async () => {
  const h = setup();
  await addAndFill(h);
  const doi = field(h, "DOI");
  doi.value = "not-a-doi"; await doi.dispatch("input");
  assert.match(status(h), /DOI/);
  h.engine.failCode = "invalid_citation_doi";
  await action(h, "preview").click();
  assert.match(status(h), /DOI/);
  assert.equal(h.assistant.state().preview, null);
  assert.equal(action(h, "copy").disabled, true);
  assert.equal(h.assistant.state().previewStale, true);
});

test("unsafe engine output fails preview instead of downgrading to plaintext", async () => {
  const h = setup();
  await addAndFill(h);
  await action(h, "preview").click();
  assert.equal(h.assistant.state().previewStale, false);
  h.engine.safeError = true;
  await action(h, "preview").click();
  assert.equal(h.assistant.state().previewStale, true);
  assert.equal(action(h, "copy").disabled, true);
  assert.match(status(h), /safely|safe/i);
  assert.equal(h.assistant.state().preview.text, "mla bibliography");
  assert.match(status(h), /SANITIZED|safe-fragment/);
  h.engine.safeError = false;
  await action(h, "preview").click();
  assert.equal(h.assistant.state().previewStale, false);
});

test("stale Word result is revoked and never shown after an edit", async () => {
  let resolveWord, exportSignal;
  const h = setup({ onExportWord: (_, { signal }) => {
    exportSignal = signal;
    return new Promise((resolve) => { resolveWord = resolve; });
  } });
  await addAndFill(h);
  await action(h, "preview").click();
  URLStub.revoked.length = 0;
  const pending = action(h, "word").click();
  await flush();
  await fill(h, "Edited while Word was exporting");
  assert.equal(exportSignal.aborted, true);
  resolveWord({ downloadUrl: "blob:stale-word", name: "stale.docx" });
  await pending;
  assert.ok(URLStub.revoked.includes("blob:stale-word"));
  assert.equal(tag(h, "A").hidden, true);
  assert.doesNotMatch(status(h), /reference list is ready/);
  assert.doesNotMatch(status(h), /Preparing Word/);
  assert.match(status(h), /Preview again|stale/i);
  assert.equal(h.assistant.state().previewStale, true);
});

test("disposing during Word export revokes the late URL and leaves no UI mutation", async () => {
  let resolveWord, exportSignal;
  const h = setup({ onExportWord: (_, { signal }) => {
    exportSignal = signal;
    return new Promise((resolve) => { resolveWord = resolve; });
  } });
  await addAndFill(h);
  await action(h, "preview").click();
  URLStub.revoked.length = 0;
  const pending = action(h, "word").click();
  await flush();
  h.assistant.dispose();
  assert.equal(exportSignal.aborted, true);
  resolveWord({ downloadUrl: "blob:disposed-word", name: "disposed.docx" });
  await pending;
  assert.ok(URLStub.revoked.includes("blob:disposed-word"));
  assert.equal(h.mount.children.length, 0);
});

test("a stale file read cannot overwrite newer import text", async () => {
  const h = setup();
  await action(h, "import-toggle").click();
  const validJson = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "From the old file" }),
  ]));
  let resolveRead;
  const fileInput = libraryFile(h);
  fileInput.files = [{ size: validJson.length, arrayBuffer: () => new Promise((resolve) => { resolveRead = resolve; }) }];
  const read = fileInput.dispatch("change");
  await flush();
  const textarea = field(h, "import-json");
  textarea.value = "new pasted text";
  await textarea.dispatch("input");
  resolveRead(new TextEncoder().encode(validJson).buffer);
  await read;
  await flush();
  assert.equal(textarea.value, "new pasted text");
  assert.equal(h.assistant.state().pendingImport, false);
  assert.equal(h.assistant.state().items.length, 0);
});

test("import confirmation is tied to the reviewed raw text generation", async () => {
  const h = setup();
  await action(h, "import-toggle").click();
  const first = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "Reviewed entry" }),
  ]));
  const second = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "Unreviewed replacement" }),
  ]));
  const textarea = field(h, "import-json");
  textarea.value = first;
  await action(h, "review-import").click();
  assert.equal(h.assistant.state().pendingImport, true);
  textarea.value = second;
  await action(h, "apply-import").click();
  assert.equal(h.assistant.state().items.length, 0);
  assert.match(status(h), /Review|review|重新|revis/i);
  await textarea.dispatch("input");
  assert.equal(h.assistant.state().pendingImport, false);
});

test("large issue collections are capped in the DOM", async () => {
  const h = setup();
  await addAndFill(h);
  for (let index = 0; index < 25; index += 1) await action(h, "add-author").click();
  let issueList = null;
  walk(h.mount, (node) => {
    if (!issueList && node.className && node.className.split(/\s+/).includes("fc-citations-issues-list") && node.children.length) {
      issueList = node;
    }
  });
  assert.ok(issueList);
  assert.ok(issueList.children.length <= 23);
  assert.match(issueList.textContent, /more/);
});

test("article-journal type labels and both date groups translate", async () => {
  const h = setup({ locale: "es" });
  assert.match(status(h), /Aún no hay entradas/);
  await action(h, "add").click();
  await fill(h, "Artículo de prueba");
  const type = field(h, "type");
  type.value = "article-journal";
  await type.dispatch("change");
  let meta = null;
  walk(h.mount, (node) => {
    if (!meta && node.className && node.className.split(/\s+/).includes("fc-citations-item-meta")) meta = node;
  });
  assert.equal(meta.textContent, "Artículo de revista");
  assert.notEqual(meta.textContent, "type_article-journal");
  assert.equal(field(h, "issued-year").parent.children[0].textContent, "Año");
  assert.equal(field(h, "accessed-year").parent.children[0].textContent, "Año");
  assert.match(action(h, "import-toggle").textContent, /Importar biblioteca JSON/);
});

test("save validation failures do not write or replace the active library", async () => {
  const h = setup();
  await addAndFill(h);
  await fill(h, "   ");
  await action(h, "save").click();
  assert.equal(h.storage.sets.length, 0);
  assert.equal(h.assistant.state().items.length, 1);
  assert.equal(h.assistant.state().items[0].title, "   ");
});

test("download URLs are disposable; the current Word URL survives until invalidation", async () => {
  const h = setup({ onExportWord: async () => ({ downloadUrl: "blob:word-result", name: "refs.docx" }) });
  await addAndFill(h);
  await action(h, "preview").click();
  URLStub.created.length = 0;
  URLStub.urls.length = 0;
  URLStub.revoked.length = 0;
  await action(h, "json-download").click();
  const jsonUrl = URLStub.urls.at(-1);
  await action(h, "html").click();
  const htmlUrl = URLStub.urls.at(-1);
  await new Promise((resolve) => setTimeout(resolve, 1150));
  assert.ok(URLStub.revoked.includes(jsonUrl));
  assert.ok(URLStub.revoked.includes(htmlUrl));
  await action(h, "word").click();
  const wordUrl = tag(h, "A").href;
  assert.equal(wordUrl, "blob:word-result");
  assert.equal(URLStub.revoked.includes(wordUrl), false);
  await action(h, "preview").click();
  assert.ok(URLStub.revoked.includes(wordUrl));
  assert.equal(tag(h, "A").hidden, true);
  await fill(h, "Invalidate the Word result");
  assert.ok(URLStub.revoked.includes(wordUrl));
});

test("download timers and URLs are cleared on dispose", async () => {
  const h = setup();
  await addAndFill(h);
  await action(h, "preview").click();
  URLStub.urls.length = 0;
  URLStub.revoked.length = 0;
  await action(h, "json-download").click();
  const url = URLStub.urls.at(-1);
  h.assistant.dispose();
  assert.ok(URLStub.revoked.includes(url));
});

test("a second file selection supersedes an older deferred file read", async () => {
  const h = setup();
  await action(h, "import-toggle").click();
  const textarea = field(h, "import-json");
  const firstJson = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "First file" }),
  ]));
  const secondJson = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "Second file" }),
  ]));
  let resolveFirst;
  const fileInput = libraryFile(h);
  fileInput.files = [{ size: firstJson.length, arrayBuffer: () => new Promise((resolve) => { resolveFirst = resolve; }) }];
  const firstRead = fileInput.dispatch("change");
  await flush();
  fileInput.files = [{ size: secondJson.length, arrayBuffer: async () => new TextEncoder().encode(secondJson).buffer }];
  await fileInput.dispatch("change");
  resolveFirst(new TextEncoder().encode(firstJson).buffer);
  await firstRead;
  await flush();
  assert.equal(textarea.value, secondJson);
});

test("closing the import panel invalidates an in-flight file read", async () => {
  const h = setup();
  await action(h, "import-toggle").click();
  const textarea = field(h, "import-json");
  let resolveRead;
  const fileInput = libraryFile(h);
  fileInput.files = [{ size: 100, arrayBuffer: () => new Promise((resolve) => { resolveRead = resolve; }) }];
  const read = fileInput.dispatch("change");
  await flush();
  await action(h, "import-toggle").click();
  resolveRead(new TextEncoder().encode(JSON.stringify({ schema: h.model.SCHEMA, v: 1, items: [] })).buffer);
  await read;
  await flush();
  assert.equal(textarea.value, "");
});

test("unsafe output on the first preview is an explicit failure, not plaintext", async () => {
  const h = setup();
  h.engine.safeError = true;
  await addAndFill(h);
  await action(h, "preview").click();
  assert.equal(h.assistant.state().preview, null);
  assert.equal(h.assistant.state().previewStale, true);
  assert.equal(action(h, "copy").disabled, true);
  assert.match(status(h), /safely|safe/i);
});

test("invalid JSON export does not create a download or write storage", async () => {
  const h = setup();
  await action(h, "add").click();
  URLStub.urls.length = 0;
  await action(h, "json-download").click();
  assert.equal(URLStub.urls.length, 0);
  assert.equal(h.storage.sets.length, 0);
  assert.match(status(h), /title|Title|título/i);
});

test("selecting a file immediately invalidates a reviewed import", async () => {
  const h = setup();
  await action(h, "import-toggle").click();
  const textarea = field(h, "import-json");
  textarea.value = h.model.stringifyLibrary(h.model.createLibrary([
    h.model.createItem({ title: "Reviewed before file" }),
  ]));
  await action(h, "review-import").click();
  assert.equal(h.assistant.state().pendingImport, true);
  let review = null;
  walk(h.mount, (node) => {
    if (!review && node.className && node.className.split(/\s+/).includes("fc-citations-review")) review = node;
  });
  assert.ok(review);
  let resolveRead;
  const fileInput = libraryFile(h);
  fileInput.files = [{ size: 10, arrayBuffer: () => new Promise((resolve) => { resolveRead = resolve; }) }];
  const read = fileInput.dispatch("change");
  await flush();
  assert.equal(h.assistant.state().pendingImport, false);
  assert.equal(review.hidden, true);
  resolveRead(new TextEncoder().encode(JSON.stringify({ schema: h.model.SCHEMA, v: 1, items: [] })).buffer);
  await read;
});

test("ordinary Word copy and explicit import label are present", async () => {
  const h = setup();
  await addAndFill(h);
  assert.match(action(h, "import-toggle").textContent, /Import library JSON/);
  assert.match(status(h), /Download the independent reference list for Word/);
  assert.doesNotMatch(status(h), /host page|页面提供/i);
});

test("Word export can be cancelled without losing the preview and immediately retried", async () => {
  let calls = 0, exportSignal;
  const h = setup({ onExportWord: (_, { signal }) => {
    exportSignal = signal;
    calls += 1;
    if (calls > 1) return Promise.resolve({ downloadUrl: "blob:word-retry", name: "retry.docx" });
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  } });
  await addAndFill(h); await action(h, "preview").click();
  const before = h.assistant.state();
  const pending = action(h, "word").click(); await flush();
  assert.equal(action(h, "word-cancel").hidden, false);
  assert.equal(action(h, "word-cancel").type, "button");
  await action(h, "word-cancel").click(); await pending;
  assert.equal(exportSignal.aborted, true);
  assert.equal(action(h, "word-cancel").hidden, true);
  assert.equal(action(h, "word").disabled, false);
  assert.equal(h.assistant.state().previewStale, false);
  assert.deepEqual(h.assistant.state().items, before.items);
  assert.equal(h.assistant.state().preview.text, before.preview.text);
  assert.match(status(h), /Word generation cancelled/);
  await action(h, "word").click();
  assert.equal(exportSignal.aborted, false);
  assert.equal(tag(h, "A").href, "blob:word-retry");
});

test("a host result arriving after Word cancellation is revoked and never displayed", async () => {
  let finish;
  const h = setup({ onExportWord: () => new Promise((resolve) => { finish = resolve; }) });
  await addAndFill(h); await action(h, "preview").click();
  const pending = action(h, "word").click(); await flush();
  await action(h, "word-cancel").click();
  finish({ downloadUrl: "blob:late-cancelled-word", name: "late.docx" }); await pending;
  assert.ok(URLStub.revoked.includes("blob:late-cancelled-word"));
  assert.equal(tag(h, "A").hidden, true);
  assert.equal(action(h, "word").disabled, false);
  assert.match(status(h), /Word generation cancelled/);
});

test("oversize rendered output has an actionable message in all three locales", async () => {
  const messages = { en: /size limit/, zh: /大小限制/, es: /límite de exportación/ };
  for (const locale of ["en", "zh", "es"]) {
    const h = setup({ locale });
    await addAndFill(h);
    h.engine.render = async () => { const error = new Error("too large"); error.code = "citation_output_too_large"; throw error; };
    await action(h, "preview").click();
    assert.match(status(h), messages[locale]);
    assert.equal(h.assistant.state().previewStale, true);
    assert.equal(action(h, "html").disabled, true);
  }
});

test("saved-library access failure keeps its error instead of claiming no saved library", async () => {
  const h = setup(); await addAndFill(h);
  const before = h.assistant.state().items;
  h.storage.getItem = () => { throw new DOMException("blocked", "SecurityError"); };
  await action(h, "load").click();
  const notice = tag(h, "SPAN", (node) => node.className.split(/\s+/).includes("fc-citations-status"));
  assert.match(notice.textContent, /storage operation failed/i);
  assert.doesNotMatch(notice.textContent, /not saved/i);
  assert.deepEqual(h.assistant.state().items, before);
  h.storage.getItem = () => null;
  await action(h, "load").click();
  assert.match(notice.textContent, /not saved/i);
});

test("editing after a successful Word export clears the old success status", async () => {
  const h = setup({ onExportWord: async () => ({ downloadUrl: "blob:old-ready", name: "old.docx" }) });
  await addAndFill(h); await action(h, "preview").click(); await action(h, "word").click();
  await fill(h, "Changed after Word export");
  const notice = tag(h, "SPAN", (node) => node.className.split(/\s+/).includes("fc-citations-status"));
  assert.match(notice.textContent, /changes have not been previewed/i);
  assert.doesNotMatch(notice.textContent, /ready/i);
  assert.equal(tag(h, "A").hidden, true);
  assert.equal(h.assistant.state().previewStale, true);
});

test("batch DOI lookup requires an explicit query and never applies candidates automatically", async () => {
  const batch = controlledBatch(), lookup = controlledLookup();
  const h = setup({ importer: true, lookup, batch: batch.api });
  const input = field(h, "intake-doi");
  assert.equal(input.tagName, "TEXTAREA");
  assert.equal(batch.parses.length, 0);
  assert.equal(batch.jobs.length, 0);
  assert.equal(lookup.calls.length, 0);
  input.value = "10.5555/first\n10.5555/second";
  await input.dispatch("input");
  h.locale.value = "es"; h.assistant.render();
  h.locale.value = "en"; h.assistant.render();
  assert.equal(batch.parses.length, 0, "typing and locale rendering do not query");
  assert.equal(batch.jobs.length, 0);
  assert.equal(lookup.calls.length, 0);
  const pending = action(h, "intake-query").click(); await flush();
  assert.equal(batch.jobs.length, 1);
  assert.equal(batch.jobs[0].options.lookup, lookup);
  assert.equal(batch.jobs[0].options.signal.aborted, false);
  assert.equal(h.assistant.state().intakeBusy, true);
  assert.equal(h.assistant.state().batchActive, true);
  assert.equal(action(h, "intake-query").disabled, true);
  const rows = batch.jobs[0].rows.map((row, index) => succeededDoi(row,
    intakeItem(h, `Retrieved ${index + 1}`, row.doi)));
  batch.finish(0, rows); await pending;
  assert.equal(h.assistant.state().intakeBusy, false);
  assert.equal(h.assistant.state().batchActive, false);
  assert.equal(h.assistant.state().pendingIntake, true);
  assert.equal(h.assistant.state().items.length, 0);
  assert.equal(candidateInputs(h).length, 2);
  assert.ok(candidateInputs(h).every((node) => node.checked && !node.disabled));
  assert.equal(h.storage.gets.length + h.storage.sets.length + h.storage.removes.length, 0);
});

test("import review supports none, all and an individual subset before append", async () => {
  const lookup = controlledLookup();
  const h = setup({ importer: true, lookup });
  await action(h, "intake-import").click();
  const input = field(h, "intake-text");
  input.value = cslImportText(["First candidate", "Second candidate", "Third candidate"]);
  await input.dispatch("input");
  await action(h, "intake-review").click();
  assert.equal(candidateInputs(h).length, 3);
  assert.ok(candidateInputs(h).every((node) => node.checked));
  await action(h, "intake-select-none").click();
  assert.ok(candidateInputs(h).every((node) => !node.checked));
  assert.equal(action(h, "intake-append").disabled, true);
  await action(h, "intake-select-all").click();
  assert.ok(candidateInputs(h).every((node) => node.checked));
  await selectCandidate(h, 0, false);
  await selectCandidate(h, 2, false);
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["Second candidate"]);
  assert.equal(lookup.calls.length, 0, "local bibliography import never triggers DOI lookup");
  await action(h, "undo").click();
  assert.equal(h.assistant.state().items.length, 0);
});

test("plain Enter adds a DOI line without starting a query", async () => {
  const batch = controlledBatch(), lookup = controlledLookup();
  const h = setup({ importer: true, lookup, batch: batch.api });
  const input = field(h, "intake-doi");
  input.value = "10.5555/first";
  await input.dispatch("input");
  let prevented = false;
  await input.dispatch("keydown", { key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, false, "multiline DOI entry keeps native newline behavior");
  assert.equal(batch.jobs.length, 0);
  assert.equal(batch.parses.length, 0);
  assert.equal(lookup.calls.length, 0);
});

test("DOI selection appends only checked successful candidates", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/second");
  batch.finish(0, batch.jobs[0].rows.map((row, index) =>
    succeededDoi(row, intakeItem(h, `DOI candidate ${index + 1}`, row.doi))));
  await pending;
  await action(h, "intake-select-none").click();
  assert.equal(action(h, "intake-append").disabled, true);
  await selectCandidate(h, 1, true);
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["DOI candidate 2"]);
});

test("ordinary lookup failures retain successful candidates for review", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/missing\n10.5555/third");
  const rows = batch.jobs[0].rows;
  batch.finish(0, [succeededDoi(rows[0], intakeItem(h, "First found", rows[0].doi)),
    failedDoi(rows[1]), succeededDoi(rows[2], intakeItem(h, "Third found", rows[2].doi))]);
  await pending;
  assert.equal(h.assistant.state().pendingIntake, true);
  assert.equal(candidateInputs(h).length, 2);
  assert.equal(h.assistant.state().batchRows.filter((row) => row.status === "failed").length, 1);
  assert.equal(h.assistant.state().items.length, 0);
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["First found", "Third found"]);
});

test("invalid and duplicate DOI rows remain visible without becoming candidates", async () => {
  const rows = [
    { line: 1, input: "not a DOI", doi: null, status: "invalid", errors: [{ code: "doi_invalid" }] },
    readyDoi("10.5555/first", 2),
    { ...readyDoi("10.5555/first", 3), status: "duplicate", duplicateOf: 2, errors: [{ code: "duplicate_doi" }] },
  ];
  const batch = controlledBatch({ ok: true, rows, errors: [] });
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "not a DOI\n10.5555/first\n10.5555/first");
  assert.equal(batch.jobs.length, 1);
  batch.finish(0, [rows[0], succeededDoi(rows[1], intakeItem(h)), rows[2]]);
  await pending;
  assert.equal(h.assistant.state().batchRows.length, 3);
  assert.equal(candidateInputs(h).length, 1);
  assert.match(status(h), /not a DOI/);
  assert.equal(h.assistant.state().items.length, 0);
});

test("an oversized DOI list reports the parse error without starting a batch", async () => {
  const batch = controlledBatch({ ok: false, rows: [], errors: [{ code: "too_many_lines", limitLines: 50 }] });
  const lookup = controlledLookup();
  const h = setup({ importer: true, lookup, batch: batch.api });
  const { pending } = await beginDoi(h, Array.from({ length: 51 }, (_, index) => `10.5555/${index}`).join("\n"));
  await pending;
  assert.equal(batch.jobs.length, 0);
  assert.equal(lookup.calls.length, 0);
  assert.equal(h.assistant.state().intakeBusy, false);
  assert.equal(h.assistant.state().pendingIntake, false);
  assert.equal(candidateInputs(h).length, 0);
  assert.match(status(h), /50/);
});

test("rate limiting stops the UI batch without retry and preserves completed references", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/limited\n10.5555/unstarted");
  const rows = batch.jobs[0].rows;
  batch.finish(0, [succeededDoi(rows[0], intakeItem(h)), failedDoi(rows[1], "lookup_rate_limited"), rows[2]], { rateLimited: true });
  await pending; await flush(); await flush();
  assert.equal(batch.jobs.length, 1, "rate limiting never starts an automatic retry");
  assert.equal(h.assistant.state().intakeBusy, false);
  assert.equal(h.assistant.state().pendingIntake, true);
  assert.equal(candidateInputs(h).length, 1);
  assert.match(status(h), /rate|limit|later/i);
  await action(h, "intake-append").click();
  assert.equal(h.assistant.state().items.length, 1);
});

test("cancelling a running batch immediately preserves completed candidates and rejects late work", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/late");
  const rows = batch.jobs[0].rows;
  const first = succeededDoi(rows[0], intakeItem(h, "Completed before cancel"));
  batch.publish(0, [first, rows[1]]);
  assert.equal(action(h, "intake-append").disabled, true, "cannot append while querying");
  assert.ok(candidateInputs(h).every((node) => node.disabled));
  await action(h, "intake-cancel").click();
  assert.equal(batch.jobs[0].options.signal.aborted, true);
  assert.equal(h.assistant.state().intakeBusy, false, "cancel does not await an uncooperative request");
  assert.equal(h.assistant.state().pendingIntake, true);
  assert.equal(candidateInputs(h).length, 1);
  assert.equal(candidateInputs(h)[0].disabled, false);
  await action(h, "intake-append").click();
  batch.finish(0, [first, succeededDoi(rows[1], intakeItem(h, "Late result", rows[1].doi))]);
  await pending; await flush();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["Completed before cancel"]);
  assert.equal(h.assistant.state().pendingIntake, false);
  assert.equal(candidateInputs(h).length, 0);
});

test("cancelling before any successful DOI leaves no appendable candidates", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h);
  await action(h, "intake-cancel").click();
  assert.equal(h.assistant.state().intakeBusy, false);
  assert.equal(h.assistant.state().pendingIntake, false);
  batch.finish(0, batch.jobs[0].rows, { cancelled: true }); await pending;
  assert.equal(candidateInputs(h).length, 0);
  assert.equal(h.assistant.state().items.length, 0);
});

for (const transition of ["edit", "mode", "dispose"]) {
  test(`${transition} invalidates a running DOI batch and rejects progress and resolution arriving later`, async () => {
    const batch = controlledBatch();
    const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
    const { pending } = await beginDoi(h, "10.5555/first\n10.5555/late");
    const rows = batch.jobs[0].rows;
    const before = succeededDoi(rows[0], intakeItem(h));
    batch.publish(0, [before, rows[1]]);
    if (transition === "edit") {
      field(h, "intake-doi").value = "10.5555/changed";
      await field(h, "intake-doi").dispatch("input");
    } else if (transition === "mode") await action(h, "intake-import").click();
    else h.assistant.dispose();
    assert.equal(batch.jobs[0].options.signal.aborted, true);
    assert.equal(h.assistant.state().intakeBusy, false);
    assert.equal(h.assistant.state().pendingIntake, false);
    const completed = [before, succeededDoi(rows[1], intakeItem(h, "Stale late result", rows[1].doi))];
    batch.publish(0, completed);
    batch.finish(0, completed);
    await pending; await flush();
    assert.equal(h.assistant.state().pendingIntake, false);
    assert.equal(h.assistant.state().items.length, 0);
    if (transition === "dispose") assert.equal(h.mount.children.length, 0);
    else assert.equal(candidateInputs(h).length, 0);
  });
}

test("a stale batch cannot clear the busy state or replace candidates of a fresh query", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const first = await beginDoi(h, "10.5555/first");
  const second = await beginDoi(h, "10.5555/second");
  assert.equal(batch.jobs.length, 2);
  assert.equal(batch.jobs[0].options.signal.aborted, true);
  batch.finish(0, [succeededDoi(batch.jobs[0].rows[0], intakeItem(h, "Stale first"))]);
  await first.pending;
  assert.equal(h.assistant.state().intakeBusy, true);
  assert.equal(h.assistant.state().pendingIntake, false);
  batch.finish(1, [succeededDoi(batch.jobs[1].rows[0], intakeItem(h, "Fresh second", "10.5555/second"))]);
  await second.pending;
  assert.equal(h.assistant.state().intakeBusy, false);
  assert.equal(candidateInputs(h).length, 1);
  assert.match(status(h), /Fresh second/);
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["Fresh second"]);
});

test("without the batch module a single DOI still uses explicit lookup and review", async () => {
  const lookup = controlledLookup();
  const h = setup({ importer: true, lookup });
  field(h, "intake-doi").value = "10.5555/first";
  await field(h, "intake-doi").dispatch("input");
  assert.equal(lookup.calls.length, 0);
  const pending = action(h, "intake-query").click(); await flush();
  assert.equal(lookup.calls.length, 1);
  assert.equal(lookup.calls[0].input, "10.5555/first");
  lookup.calls[0].resolve({ ok: true, items: [intakeItem(h)], warnings: [], errors: [] });
  await pending;
  assert.equal(h.assistant.state().pendingIntake, true);
  assert.equal(h.assistant.state().items.length, 0);
  await action(h, "intake-append").click();
  assert.equal(h.assistant.state().items.length, 1);
});

test("local bibliography file acquisition stays separate from saved-library JSON import", async () => {
  const lookup = controlledLookup();
  const h = setup({ importer: true, lookup });
  await action(h, "intake-import").click();
  await action(h, "import-toggle").click();
  field(h, "import-json").value = "Unrelated saved-library draft";
  const text = cslImportText(["Local file candidate"]);
  const file = field(h, "intake-file");
  file.files = [{ size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer }];
  await file.dispatch("change");
  assert.equal(h.assistant.state().pendingIntake, true);
  assert.equal(h.assistant.state().pendingImport, false);
  assert.equal(field(h, "import-json").value, "Unrelated saved-library draft");
  assert.equal(h.assistant.state().items.length, 0);
  assert.equal(lookup.calls.length, 0);
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["Local file candidate"]);
  assert.equal(field(h, "import-json").value, "Unrelated saved-library draft");
});

test("undoing a selected imported batch preserves later edits and manually added references", async () => {
  const h = setup({ importer: true, lookup: controlledLookup() });
  await addAndFill(h, "Existing reference");
  await action(h, "intake-import").click();
  field(h, "intake-text").value = cslImportText(["Batch reference", "Unchecked reference"]);
  await field(h, "intake-text").dispatch("input");
  await action(h, "intake-review").click();
  await selectCandidate(h, 1, false);
  await action(h, "intake-append").click();
  await fill(h, "Edited original after append");
  await addAndFill(h, "Later manual reference");
  assert.equal(h.assistant.state().items.length, 3);
  await action(h, "undo").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title),
    ["Edited original after append", "Later manual reference"]);
});

test("editing a reviewed local bibliography clears its candidates and prevents stale append", async () => {
  const h = setup({ importer: true, lookup: controlledLookup() });
  await action(h, "intake-import").click();
  field(h, "intake-text").value = cslImportText(["Reviewed candidate"]);
  await field(h, "intake-text").dispatch("input");
  await action(h, "intake-review").click();
  assert.equal(candidateInputs(h).length, 1);
  field(h, "intake-text").value = cslImportText(["Unreviewed replacement"]);
  await field(h, "intake-text").dispatch("input");
  assert.equal(h.assistant.state().pendingIntake, false);
  assert.equal(candidateInputs(h).length, 0);
  await action(h, "intake-append").click();
  assert.equal(h.assistant.state().items.length, 0);
});

test("batch selection is deduplicated against the library at confirmation time", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  await addAndFill(h, "Existing local reference");
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/second");
  batch.finish(0, batch.jobs[0].rows.map((row, index) =>
    succeededDoi(row, intakeItem(h, `Retrieved candidate ${index + 1}`, row.doi))));
  await pending;
  const doi = field(h, "DOI");
  doi.value = "10.5555/first";
  await doi.dispatch("input");
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title),
    ["Existing local reference", "Retrieved candidate 2"]);
  assert.equal(h.assistant.state().items[0].DOI, "10.5555/first");
});

test("all-failed DOI batches leave the existing library and preview unchanged", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  await addAndFill(h, "Existing reference");
  await action(h, "preview").click();
  const before = h.assistant.state();
  const { pending } = await beginDoi(h, "10.5555/missing");
  batch.finish(0, [failedDoi(batch.jobs[0].rows[0])]); await pending;
  assert.equal(h.assistant.state().pendingIntake, false);
  assert.equal(candidateInputs(h).length, 0);
  assert.deepEqual(h.assistant.state().items, before.items);
  assert.deepEqual(h.assistant.state().preview, before.preview);
  assert.equal(h.assistant.state().previewStale, false);
});

test("batch parsing preserves leading blank lines so displayed source line numbers stay accurate", async () => {
  const row = readyDoi("10.5555/first", 3);
  const batch = controlledBatch({ ok: true, rows: [row], errors: [] });
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const raw = "\n\n10.5555/first\n";
  const { pending } = await beginDoi(h, raw);
  assert.equal(batch.parses[0], raw, "batch.parse receives the untrimmed source text");
  assert.equal(batch.jobs[0].rows[0].line, 3);
  batch.finish(0, [succeededDoi(row, intakeItem(h))]); await pending;
  assert.equal(h.assistant.state().batchRows[0].line, 3);
  let renderedRow;
  walk(h.mount, (node) => { if (node.getAttribute?.("data-batch-line") === "3") renderedRow = node; });
  assert.ok(renderedRow);
  assert.match(renderedRow.textContent, /Line 3/);
});

test("a batch byte-limit error names the 32 KiB DOI limit and sends no requests", async () => {
  const batch = controlledBatch({ ok: false, rows: [], errors: [{ code: "input_too_large", limitBytes: 32768 }] });
  const lookup = controlledLookup();
  const h = setup({ importer: true, lookup, batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/" + "x".repeat(32768)); await pending;
  assert.equal(batch.jobs.length, 0);
  assert.equal(lookup.calls.length, 0);
  let intake;
  walk(h.mount, (node) => { if (node.classList?.contains("fc-citations-intake")) intake = node; });
  assert.ok(intake);
  const messages = [];
  walk(intake, (node) => {
    if (node.classList?.contains("fc-citations-issues-error")) messages.push(node.textContent);
  });
  assert.ok(messages.length, "batch size failure has an actionable error message");
  assert.match(messages.join(" "), /32 KiB/);
  assert.doesNotMatch(messages.join(" "), /1\s*MiB|1\s*MB|input_too_large|batch_input_large/);
  assert.equal(h.assistant.state().pendingIntake, false);
});

test("after a rate-limit stop unstarted DOI rows say Not queried instead of Waiting", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/limited\n10.5555/unstarted");
  const rows = batch.jobs[0].rows;
  const finalRows = [succeededDoi(rows[0], intakeItem(h)), failedDoi(rows[1], "lookup_rate_limited"), rows[2]];
  batch.publish(0, finalRows, { rateLimited: true });
  let before;
  walk(h.mount, (node) => { if (node.getAttribute?.("data-batch-line") === "3") before = node; });
  assert.match(before.textContent, /Waiting/);
  // The final snapshot has identical row bytes: changing running->stopped
  // alone must invalidate the row rendering cache.
  batch.finish(0, finalRows, { rateLimited: true }); await pending;
  let after;
  walk(h.mount, (node) => { if (node.getAttribute?.("data-batch-line") === "3") after = node; });
  assert.match(after.textContent, /Not queried/);
  assert.doesNotMatch(after.textContent, /Waiting|Looking up/);
  assert.equal(h.assistant.state().intakeBusy, false);
});

for (const [locale, words] of Object.entries({
  zh: { hint: /一行一条/, selected: /识别 1 条 · 已选 1 条/, none: /已选 0 条/,
    cancelled: /已取消；保留 1 条/, limited: /稍后手动重新查询/ },
  en: { hint: /One per line/, selected: /1 detected · 1 selected/, none: /0 selected/,
    cancelled: /Cancelled\. Kept 1/, limited: /Try again manually later/ },
  es: { hint: /Uno por línea/, selected: /1 detectadas · 1 seleccionadas/, none: /0 seleccionadas/,
    cancelled: /Cancelado\. Se conservan 1/, limited: /Vuelve a consultar manualmente más tarde/ },
})) {
  test(`${locale} translates batch guidance, selection counts, cancellation and rate limiting`, async () => {
    const batch = controlledBatch();
    const h = setup({ locale, importer: true, lookup: controlledLookup(), batch: batch.api });
    assert.match(status(h), words.hint);
    const first = await beginDoi(h, "10.5555/first\n10.5555/unfinished");
    const firstRows = batch.jobs[0].rows;
    batch.publish(0, [succeededDoi(firstRows[0], intakeItem(h)), firstRows[1]]);
    await action(h, "intake-cancel").click();
    assert.match(status(h), words.cancelled);
    assert.match(status(h), words.selected);
    await action(h, "intake-select-none").click();
    assert.match(status(h), words.none);
    batch.finish(0, firstRows, { cancelled: true }); await first.pending;
    const second = await beginDoi(h, "10.5555/first\n10.5555/limited");
    const secondRows = batch.jobs[1].rows;
    batch.finish(1, [succeededDoi(secondRows[0], intakeItem(h)), failedDoi(secondRows[1], "lookup_rate_limited")], { rateLimited: true });
    await second.pending;
    assert.match(status(h), words.limited);
    assert.doesNotMatch(status(h), /batch_(?:hint|privacy|progress|cancelled|rate_limited)|select_(?:all|none)|quick_count|\{(?:count|selected|succeeded|failed|total|line)\}/);
    assert.notEqual(action(h, "intake-select-all").textContent, "select_all");
    assert.notEqual(action(h, "intake-select-none").textContent, "select_none");
  });
}

test("changing candidate selection retains the same checkbox nodes and disables append for none", async () => {
  const h = setup({ importer: true, lookup: controlledLookup() });
  await action(h, "intake-import").click();
  field(h, "intake-text").value = cslImportText(["First keyboard candidate", "Second keyboard candidate"]);
  await field(h, "intake-text").dispatch("input");
  await action(h, "intake-review").click();
  const first = field(h, "intake-select-0"), second = field(h, "intake-select-1");
  first.focus();
  first.checked = false;
  await first.dispatch("change");
  assert.equal(field(h, "intake-select-0"), first, "focused checkbox is not replaced on change");
  assert.equal(field(h, "intake-select-1"), second, "other candidates are not rebuilt");
  assert.equal(first.focused, true);
  assert.match(status(h), /1 selected/);
  await action(h, "intake-select-none").click();
  assert.equal(field(h, "intake-select-0"), first);
  assert.equal(field(h, "intake-select-1"), second);
  assert.equal(first.checked, false);
  assert.equal(second.checked, false);
  assert.equal(action(h, "intake-append").disabled, true);
  assert.match(status(h), /0 selected/);
});

test("progress arriving after successful completion cannot replace final candidates or their selection", async () => {
  const batch = controlledBatch();
  const h = setup({ importer: true, lookup: controlledLookup(), batch: batch.api });
  const { pending } = await beginDoi(h, "10.5555/first\n10.5555/second");
  const rows = batch.jobs[0].rows.map((row, index) =>
    succeededDoi(row, intakeItem(h, `Final candidate ${index + 1}`, row.doi)));
  batch.finish(0, rows); await pending;
  const first = field(h, "intake-select-0"), second = field(h, "intake-select-1");
  await selectCandidate(h, 0, false);
  batch.publish(0, [rows[0], batch.jobs[0].rows[1]]);
  await flush();
  assert.equal(candidateInputs(h).length, 2);
  assert.equal(field(h, "intake-select-0"), first);
  assert.equal(field(h, "intake-select-1"), second);
  assert.equal(first.checked, false);
  assert.equal(second.checked, true);
  assert.equal(h.assistant.state().batchRows.filter((row) => row.status === "success").length, 2);
  await action(h, "intake-append").click();
  assert.deepEqual(Array.from(h.assistant.state().items, (item) => item.title), ["Final candidate 2"]);
});

async function filterLibrary(h, query, type = null) {
  const queryNode = field(h, "library-query");
  assert.ok(queryNode, "library query exists");
  queryNode.value = query;
  await queryNode.dispatch("input");
  if (type !== null) {
    const typeNode = field(h, "library-type");
    typeNode.value = type;
    await typeNode.dispatch("change");
  }
}

function visibleIds(h) { return Array.from(h.assistant.state().visibleIds); }
function portableText(h) { return field(h, "portable-text"); }
function portableStatus(h) {
  let result = "";
  walk(h.mount, (node) => {
    if (node.className?.split(/\s+/).includes("fc-citations-portable-status")) result = node.textContent;
  });
  return result;
}

test("library management starts with all records and portable export remains an explicit action", async () => {
  const exporter = portableExporter();
  const h = setup({ exporter });
  assert.equal(field(h, "library-query").type, "search");
  assert.equal(field(h, "library-type").value, "all");
  assert.equal(field(h, "portable-format").value, "csl-json");
  assert.equal(field(h, "portable-scope").value, "all");
  assert.equal(h.assistant.state().query, "");
  assert.equal(h.assistant.state().typeFilter, "all");
  assert.deepEqual(visibleIds(h), []);
  assert.equal(action(h, "portable-preview").disabled, true);
  assert.equal(action(h, "portable-copy").disabled, true);
  assert.equal(action(h, "portable-download").disabled, true);
  assert.equal(exporter.calls.length, 0);
  await loadLibraryItems(h, managementRecords());
  assert.deepEqual(visibleIds(h), ["book_alpha", "journal_beta", "web_gamma"]);
  assert.equal(exporter.calls.length, 0);
  assert.deepEqual(h.storage.sets, []);
});

test("library query matches all metadata fields with AND tokens, Unicode and accent folding", async () => {
  const h = setup();
  await loadLibraryItems(h, managementRecords());
  const original = JSON.stringify(h.assistant.state().items);
  for (const [query, expected] of [
    ["ECOLOGIE garcia", ["book_alpha"]],
    ["Research lakewood", ["book_alpha"]],
    ["2021 10.5555/book-one", ["book_alpha"]],
    ["水豚 wetland 王", ["journal_beta"]],
    ["2024 wetland", ["journal_beta"]],
    ["HABITAT field-guide", ["web_gamma"]],
    ["https://example.com/field-guide", ["web_gamma"]],
    ["garcia habitat", []],
    ["  \t  ", ["book_alpha", "journal_beta", "web_gamma"]],
  ]) {
    await filterLibrary(h, query);
    assert.deepEqual(visibleIds(h), expected, query);
  }
  assert.equal(JSON.stringify(h.assistant.state().items), original);
  assert.deepEqual(h.storage.sets, []);
});

test("type filtering combines with search and clear resets both filters", async () => {
  const h = setup();
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "capybara", "webpage");
  assert.deepEqual(visibleIds(h), ["web_gamma"]);
  await filterLibrary(h, "capybara", "book");
  assert.deepEqual(visibleIds(h), ["book_alpha"]);
  await filterLibrary(h, "capybara", "article-journal");
  assert.deepEqual(visibleIds(h), []);
  assert.equal(h.assistant.state().items.length, 3);
  await action(h, "library-clear").click();
  assert.equal(field(h, "library-query").value, "");
  assert.equal(field(h, "library-type").value, "all");
  assert.deepEqual(visibleIds(h), ["book_alpha", "journal_beta", "web_gamma"]);
});

test("filtering preserves selected editor nodes, fresh preview, Word result and saved state", async () => {
  const h = setup({ onExportWord: async () => ({ downloadUrl: "blob:filtered-word", name: "keep.docx" }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "save").click();
  await action(h, "preview").click();
  await action(h, "word").click();
  const before = h.assistant.state();
  const title = field(h, "title"), query = field(h, "library-query");
  const word = tag(h, "A", (node) => node.href === "blob:filtered-word");
  assert.ok(word);
  query.focus();
  const calls = h.engine.calls.length, writes = h.storage.sets.length;
  await filterLibrary(h, "Wetland", "article-journal");
  const after = h.assistant.state();
  assert.equal(after.selectedId, before.selectedId);
  assert.equal(field(h, "title"), title, "filters do not rebuild the active editor");
  assert.equal(field(h, "library-query"), query);
  assert.equal(query.focused, true);
  assert.equal(field(h, "library-hidden-selection").hidden, false);
  assert.deepEqual(after.preview, before.preview);
  assert.equal(after.previewStale, false);
  assert.equal(after.saved, true);
  assert.equal(word.href, "blob:filtered-word");
  assert.equal(word.hidden, false);
  assert.equal(h.engine.calls.length, calls);
  assert.equal(h.storage.sets.length, writes);
  await action(h, "library-clear").click();
  assert.equal(field(h, "library-hidden-selection").hidden, true);
});

test("adding a blank entry clears filters so its editor and list row are reachable", async () => {
  const h = setup();
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "does not match", "webpage");
  await action(h, "add").click();
  const state = h.assistant.state();
  assert.equal(state.query, "");
  assert.equal(state.typeFilter, "all");
  assert.equal(state.items.length, 4);
  assert.equal(visibleIds(h).includes(state.selectedId), true);
  assert.equal(field(h, "title").value, "");
});

test("filters never narrow the existing full FormCapy JSON backup", async () => {
  const h = setup();
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "Wetland", "article-journal");
  URLStub.created.length = 0;
  await action(h, "json-download").click();
  const backup = JSON.parse(URLStub.created.at(-1).parts.join(""));
  assert.equal(backup.schema, "formcapy-citations");
  assert.deepEqual(backup.items.map((item) => item.id), ["book_alpha", "journal_beta", "web_gamma"]);
  assert.equal(Object.hasOwn(backup, "query"), false);
  assert.equal(Object.hasOwn(backup, "typeFilter"), false);
});

test("portable all-library preview ignores presentation filters and does not auto-download", async () => {
  const exporter = portableExporter();
  const h = setup({ exporter });
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "Wetland", "article-journal");
  const before = JSON.stringify(h.assistant.state().items);
  URLStub.created.length = 0;
  await action(h, "portable-preview").click();
  assert.equal(exporter.calls.length, 1);
  assert.deepEqual(exporter.calls[0].library.items.map((item) => item.id), ["book_alpha", "journal_beta", "web_gamma"]);
  assert.equal(exporter.calls[0].options.format, "csl-json");
  assert.equal(h.assistant.state().portablePending, true);
  assert.equal(portableText(h).readOnly, true);
  assert.equal(JSON.parse(portableText(h).value).length, 3);
  assert.equal(URLStub.created.length, 0, "review does not download automatically");
  assert.equal(h.storage.sets.length, 0);
  assert.equal(JSON.stringify(h.assistant.state().items), before);
});

test("portable filtered scope passes only matching records and empty matches disable preview", async () => {
  const exporter = portableExporter();
  const h = setup({ exporter });
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "Wetland", "article-journal");
  field(h, "portable-scope").value = "filtered";
  await field(h, "portable-scope").dispatch("change");
  await action(h, "portable-preview").click();
  assert.deepEqual(exporter.calls[0].library.items.map((item) => item.id), ["journal_beta"]);
  await filterLibrary(h, "no matching source");
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(action(h, "portable-preview").disabled, true);
  await action(h, "portable-preview").click();
  assert.equal(exporter.calls.length, 1);
});

test("all-scope reviewed export survives filter changes while filtered-scope export becomes stale", async () => {
  const exporter = portableExporter();
  const h = setup({ exporter });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  const text = portableText(h).value;
  await filterLibrary(h, "Wetland");
  assert.equal(h.assistant.state().portablePending, true);
  assert.equal(portableText(h).value, text);
  field(h, "portable-scope").value = "filtered";
  await field(h, "portable-scope").dispatch("change");
  await action(h, "portable-preview").click();
  await filterLibrary(h, "Wetland ");
  assert.equal(h.assistant.state().portablePending, false, "even an equivalent filter edit invalidates its reviewed scope");
  assert.equal(portableText(h).value, "");
});

test("editing bibliography data invalidates reviewed portable text and copy/download actions", async () => {
  const h = setup({ exporter: portableExporter() });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  await fill(h, "Edited source after export review");
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(action(h, "portable-copy").disabled, true);
  assert.equal(action(h, "portable-download").disabled, true);
});

test("changing portable format or scope discards the old reviewed artifact", async () => {
  const h = setup({ exporter: portableExporter() });
  await loadLibraryItems(h, managementRecords());
  for (const [name, value] of [["portable-format", "ris"], ["portable-scope", "filtered"], ["portable-format", "bibtex"]]) {
    await action(h, "portable-preview").click();
    assert.equal(h.assistant.state().portablePending, true);
    field(h, name).value = value;
    await field(h, name).dispatch("change");
    assert.equal(h.assistant.state().portablePending, false, `${name} invalidates review`);
    assert.equal(portableText(h).value, "");
  }
});

test("language-only changes keep filter state, candidate data and portable review", async () => {
  const exporter = portableExporter();
  const h = setup({ exporter });
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "García", "book");
  await action(h, "portable-preview").click();
  const before = JSON.stringify(h.assistant.state().items), text = portableText(h).value;
  for (const locale of ["zh", "es", "en"]) {
    h.locale.value = locale;
    h.assistant.render();
    assert.equal(h.assistant.state().query, "García");
    assert.equal(h.assistant.state().typeFilter, "book");
    assert.deepEqual(visibleIds(h), ["book_alpha"]);
    assert.equal(h.assistant.state().portablePending, true);
    assert.equal(portableText(h).value, text);
    assert.equal(JSON.stringify(h.assistant.state().items), before);
    assert.doesNotMatch(action(h, "portable-preview").textContent, /^portable_/);
    assert.doesNotMatch(action(h, "library-clear").textContent, /^library_/);
  }
  assert.equal(exporter.calls.length, 1);
});

test("portable omission warnings and untrusted content remain text during review", async () => {
  const text = '<script>alert("not executable")</script>';
  const h = setup({ exporter: portableExporter({ text, warnings: [
    { code: "original_text_omitted", index: 0, field: "originalText" },
    { code: "unknown_export_warning", field: "<img src=x onerror=alert(1)>" },
  ] }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, true);
  assert.equal(portableText(h).value, text);
  assert.equal(portableText(h).readOnly, true);
  assert.equal(tag(h, "SCRIPT"), null);
  assert.equal(tag(h, "IMG"), null);
  assert.doesNotMatch(h.mount.textContent, /unknown_export_warning|<img src=x onerror/,
    "unknown warning codes and untrusted field names use a generic localized description");
});

test("inherited object property names in portable warning codes and fields use the safe fallback", async () => {
  const h = setup({ exporter: portableExporter({ warnings: [
    { code: "constructor", index: 0, field: "__proto__", path: "library.items[0].constructor" },
    { code: "__proto__", field: "constructor", path: "library.items[0].__proto__" },
    { code: "toString", field: "toString", path: "library.items[0].toString" },
  ] }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, true);
  let issues = null;
  walk(h.mount, (node) => {
    if (node.className?.split(/\s+/).includes("fc-citations-portable-issues")) issues = node;
  });
  assert.ok(issues);
  assert.match(issues.textContent, /review/i);
  assert.doesNotMatch(issues.textContent, /\[native code\]|\[object Object\]|function\s|constructor|__proto__|toString/);
});

test("structured portable failures never expose partial text or create a download", async () => {
  const exporter = portableExporter({ ok: false, text: "PARTIAL MUST NOT LEAK", errors: [{ code: "output_too_large" }] });
  const h = setup({ exporter });
  await loadLibraryItems(h, managementRecords());
  const before = JSON.stringify(h.assistant.state().items);
  URLStub.created.length = 0;
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(action(h, "portable-copy").disabled, true);
  assert.equal(action(h, "portable-download").disabled, true);
  assert.equal(URLStub.created.length, 0);
  assert.equal(JSON.stringify(h.assistant.state().items), before);
  assert.doesNotMatch(h.mount.textContent, /PARTIAL MUST NOT LEAK/);
});

test("an unavailable or throwing portable formatter leaves the library usable", async () => {
  const missing = setup();
  await loadLibraryItems(missing, managementRecords());
  assert.equal(action(missing, "portable-preview").disabled, true);
  const h = setup({ exporter: { exportLibrary() { throw new Error("failed to serialize"); } } });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(h.assistant.state().items.length, 3);
  assert.equal(portableText(h).value, "");
});

for (const [name, overrides] of [
  ["empty text", { text: "" }],
  ["wrong format", { format: "ris" }],
  ["over one MiB UTF-8", { text: "é".repeat(524289) }],
  ["null errors", { errors: null }],
  ["missing errors", { errors: undefined }],
  ["string errors", { errors: "" }],
  ["null warnings", { warnings: null }],
  ["missing warnings", { warnings: undefined }],
  ["string warnings", { warnings: "" }],
]) {
  test(`portable UI rejects a malformed formatter result: ${name}`, async () => {
    const h = setup({ exporter: portableExporter(overrides) });
    await loadLibraryItems(h, managementRecords());
    await action(h, "portable-preview").click();
    assert.equal(h.assistant.state().portablePending, false);
    assert.equal(portableText(h).value, "");
    assert.equal(action(h, "portable-download").disabled, true);
  });
}

test("portable download uses a fixed safe name and MIME rather than formatter-supplied values", async () => {
  const h = setup({ exporter: portableExporter({ filename: "../../paper.html", mime: "text/html" }) });
  await loadLibraryItems(h, managementRecords());
  URLStub.created.length = 0;
  await action(h, "portable-preview").click();
  await action(h, "portable-download").click();
  const blob = URLStub.created.at(-1);
  assert.ok(blob);
  assert.equal(blob.type, "application/vnd.citationstyles.csl+json");
  assert.equal(blob.parts.join(""), portableText(h).value);
  assert.equal(h.document.downloads.at(-1).filename, "formcapy-references.csl.json");
  assert.equal(h.document.downloads.at(-1).rel, "noopener");
});

test("portable copy is explicit and copies only the reviewed text", async () => {
  const copied = [];
  const h = setup({ exporter: portableExporter() });
  h.navigator.clipboard = { async writeText(text) { copied.push(text); } };
  await loadLibraryItems(h, managementRecords());
  assert.deepEqual(copied, []);
  await action(h, "portable-preview").click();
  assert.deepEqual(copied, []);
  await action(h, "portable-copy").click();
  assert.deepEqual(copied, [portableText(h).value]);
  assert.equal(h.storage.sets.length, 0);
});

test("portable copy fallback selects its own readonly text without replacing the library", async () => {
  const h = setup({ exporter: portableExporter() });
  await loadLibraryItems(h, managementRecords());
  const before = JSON.stringify(h.assistant.state().items);
  await action(h, "portable-preview").click();
  await action(h, "portable-copy").click();
  assert.equal(portableText(h).focused, true);
  assert.equal(portableText(h).selected, true);
  assert.equal(h.assistant.state().portablePending, true);
  assert.equal(JSON.stringify(h.assistant.state().items), before);
});

test("a late portable clipboard failure cannot resurrect text after an edit", async () => {
  let rejectCopy;
  const h = setup({ exporter: portableExporter() });
  h.navigator.clipboard = { writeText() { return new Promise((resolve, reject) => { rejectCopy = reject; }); } };
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  const pending = action(h, "portable-copy").click();
  await flush();
  await fill(h, "Changed while clipboard pending");
  rejectCopy(new Error("Clipboard unavailable"));
  await pending;
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(portableText(h).focused, false);
  assert.equal(portableText(h).selected, false);
  assert.doesNotMatch(portableStatus(h), /copied/i);
});

test("disposing during portable copy handles its late result without new UI", async () => {
  let resolveCopy;
  const h = setup({ exporter: portableExporter() });
  h.navigator.clipboard = { writeText() { return new Promise((resolve) => { resolveCopy = resolve; }); } };
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  const pending = action(h, "portable-copy").click();
  await flush();
  h.assistant.dispose();
  const removed = h.mount.textContent;
  resolveCopy();
  await pending;
  assert.equal(h.mount.textContent, removed);
  assert.equal(h.mount.children.length, 0);
});

test("portable downloads honor host download restrictions while copy remains available", async () => {
  const h = setup({ exporter: portableExporter(), allowDownloads: false });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(action(h, "portable-copy").disabled, false);
  const download = action(h, "portable-download");
  assert.ok(download.disabled || download.hidden);
  URLStub.created.length = 0;
  await download.click();
  assert.equal(URLStub.created.length, 0);
});

test("portable download URLs are reclaimed after the shared TTL and immediately on dispose", async () => {
  const h = setup({ exporter: portableExporter() });
  await loadLibraryItems(h, managementRecords());
  URLStub.urls.length = 0;
  URLStub.revoked.length = 0;
  await action(h, "portable-preview").click();
  await action(h, "portable-download").click();
  const first = URLStub.urls.at(-1);
  assert.ok(first);
  await new Promise((resolve) => setTimeout(resolve, 1150));
  assert.equal(URLStub.revoked.includes(first), true);
  await action(h, "portable-download").click();
  const second = URLStub.urls.at(-1);
  h.assistant.dispose();
  assert.equal(URLStub.revoked.includes(second), true);
});

for (const [format, filename, mime] of [
  ["ris", "formcapy-references.ris", "application/x-research-info-systems"],
  ["bibtex", "formcapy-references.bib", "application/x-bibtex"],
]) {
  test(`portable ${format} download uses its reviewed format, fixed filename and MIME`, async () => {
    const exporter = portableExporter();
    const h = setup({ exporter });
    await loadLibraryItems(h, managementRecords());
    field(h, "portable-format").value = format;
    await field(h, "portable-format").dispatch("change");
    await action(h, "portable-preview").click();
    URLStub.created.length = 0;
    await action(h, "portable-download").click();
    assert.equal(exporter.calls.at(-1).options.format, format);
    assert.equal(h.assistant.state().portableFormat, format);
    assert.equal(URLStub.created.at(-1).type, mime);
    assert.equal(h.document.downloads.at(-1).filename, filename);
    assert.equal(URLStub.created.at(-1).parts.join(""), portableText(h).value);
  });
}

test("portable UI accepts exactly one MiB of UTF-8 while guarding the next byte", async () => {
  const text = "é".repeat(524288);
  assert.equal(new TextEncoder().encode(text).length, 1048576);
  const h = setup({ exporter: portableExporter({ text }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, true);
  assert.equal(portableText(h).value, text);
  assert.equal(action(h, "portable-copy").disabled, false);
});

test("library deletion, undo and replacement each invalidate portable review", async () => {
  const h = setup({ exporter: portableExporter() });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  await action(h, "delete-entry").click();
  assert.equal(h.assistant.state().portablePending, false);
  await action(h, "portable-preview").click();
  await action(h, "undo").click();
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(h.assistant.state().items.length, 3);
  await action(h, "portable-preview").click();
  await loadLibraryItems(h, [managementRecords()[2]]);
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(h.assistant.state().items.length, 1);
});

test("a successful result that also contains errors is not a valid portable artifact", async () => {
  const h = setup({ exporter: portableExporter({ ok: true, text: "PARTIAL", errors: [{ code: "item_invalid" }] }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(action(h, "portable-download").disabled, true);
});

test("a late successful clipboard response cannot claim a stale portable copy", async () => {
  let finishCopy;
  const h = setup({ exporter: portableExporter() });
  h.navigator.clipboard = { writeText() { return new Promise((resolve) => { finishCopy = resolve; }); } };
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  const pending = action(h, "portable-copy").click();
  await flush();
  await fill(h, "Changed while successful copy is pending");
  finishCopy();
  await pending;
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.doesNotMatch(portableStatus(h), /copied/i);
});

test("management state snapshots cannot mutate visible IDs or current bibliography", async () => {
  const h = setup({ exporter: portableExporter() });
  await loadLibraryItems(h, managementRecords());
  await filterLibrary(h, "Wetland");
  const snapshot = h.assistant.state();
  snapshot.visibleIds.push("forged");
  snapshot.items[0].title = "forged title";
  assert.deepEqual(visibleIds(h), ["journal_beta"]);
  assert.equal(h.assistant.state().items[0].title, "Écologie of capybaras");
});

test("portable formatting receives a detached snapshot instead of active library objects", async () => {
  const exporter = { exportLibrary(library, options) {
    library.items[0].title = "Changed inside the injected serializer";
    return { ok: true, format: options.format, text: "[]", warnings: [], errors: [] };
  } };
  const h = setup({ exporter });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().items[0].title, "Écologie of capybaras");
  assert.equal(field(h, "title").value, "Écologie of capybaras");
});

test("large legitimate portable warning collections still prepare and only render the first twenty", async () => {
  const warnings = Array.from({ length: 2050 }, (_, index) => ({
    code: "ris_author_literal", index: index % 200, field: "authors",
  }));
  const h = setup({ exporter: portableExporter({ warnings }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, true);
  assert.notEqual(portableText(h).value, "");
  let container = null;
  walk(h.mount, (node) => {
    if (node.className?.split(/\s+/).includes("fc-citations-portable-issues")) container = node;
  });
  assert.ok(container);
  const rows = [];
  walk(container, (node) => { if (node.tagName === "LI") rows.push(node); });
  assert.equal(rows.length, 21, "twenty warning rows plus one remaining-count row");
  assert.equal(rows.filter((row) => row.className.split(/\s+/).includes("fc-citations-more-issues")).length, 1);
  assert.match(rows.at(-1).textContent, /2030/);
  assert.match(rows.at(-1).textContent, /more/i);
  assert.equal(action(h, "portable-copy").disabled, false);
});

test("a portable issue collection beyond the bounded maximum is rejected without partial output", async () => {
  const warnings = Array.from({ length: 10001 }, () => ({ code: "original_text_omitted" }));
  const h = setup({ exporter: portableExporter({ warnings }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  assert.equal(h.assistant.state().portablePending, false);
  assert.equal(portableText(h).value, "");
  assert.equal(action(h, "portable-download").disabled, true);
});

for (const [format, mime, filename] of [
  ["csl-json", "application/vnd.citationstyles.csl+json", "formcapy-references.csl.json"],
  ["ris", "application/x-research-info-systems", "formcapy-references.ris"],
  ["bibtex", "application/x-bibtex", "formcapy-references.bib"],
]) {
  test(`real ${format} serializer integrates with portable UI review, warnings and download metadata`, async () => {
    const h = setup({ exporter: true });
    const originalText = "Private original comparison stays outside portable metadata";
    await loadLibraryItems(h, [{
      id: "portable_real", type: "book", title: "Capybara research handbook",
      authors: [{ literal: "Wetland Research Group" }], issued: { year: 2024 },
      publisher: "Fictional Lake Press", DOI: "10.5555/portable-book", originalText,
    }]);
    const before = JSON.stringify(h.assistant.state().items);
    assert.equal(typeof h.exporter.exportLibrary, "function");
    assert.equal(h.assistant.state().portablePending, false);
    field(h, "portable-format").value = format;
    await field(h, "portable-format").dispatch("change");
    URLStub.created.length = 0;
    await action(h, "portable-preview").click();
    assert.equal(h.assistant.state().portablePending, true);
    const text = portableText(h).value;
    assert.equal(portableText(h).readOnly, true);
    assert.match(text, /Capybara research handbook/);
    assert.match(text, /Wetland Research Group/);
    assert.doesNotMatch(text, /Private original comparison|formcapy-citations|originalText/);
    assert.equal(URLStub.created.length, 0, "real serialization still requires explicit download");
    let issues = null;
    walk(h.mount, (node) => {
      if (node.className?.split(/\s+/).includes("fc-citations-portable-issues")) issues = node;
    });
    assert.ok(issues);
    assert.match(issues.textContent, /comparison|original/i);
    assert.doesNotMatch(issues.textContent, /original_text_omitted|ris_author_literal|bibtex_[a-z_]+/);
    if (format === "csl-json") {
      const csl = JSON.parse(text);
      assert.equal(csl.length, 1);
      assert.deepEqual(csl[0].author, [{ literal: "Wetland Research Group" }]);
      assert.equal(csl[0].DOI, "10.5555/portable-book");
    } else if (format === "ris") {
      assert.match(text, /^TY  - BOOK/m);
      assert.match(issues.textContent, /author|organization/i);
    } else {
      assert.match(text, /^@book\{/m);
    }
    await action(h, "portable-download").click();
    assert.equal(URLStub.created.at(-1).type, mime);
    assert.equal(URLStub.created.at(-1).parts.join(""), text);
    assert.equal(h.document.downloads.at(-1).filename, filename);
    assert.equal(JSON.stringify(h.assistant.state().items), before);
    assert.equal(h.storage.sets.length, 0);
    assert.deepEqual(h.networkCalls, []);
    h.assistant.dispose();
  });
}

test("portable export occupies its own full-width section after the unchanged three-column grid", () => {
  const h = setup({ exporter: portableExporter() });
  let grid = null;
  walk(h.mount, (node) => {
    if (node.className?.split(/\s+/).includes("fc-citations-grid")) grid = node;
  });
  assert.ok(grid);
  const panel = action(h, "portable-toggle").parent;
  assert.equal(panel.tagName, "DETAILS");
  assert.equal(panel.parent, grid.parent, "portable controls share the grid's full-width parent");
  const siblings = grid.parent.children;
  assert.equal(siblings[siblings.indexOf(grid) + 1], panel, "portable export immediately follows the workspace");
  assert.equal(grid.children.length, 3);
  assert.equal(grid.children[0].className, "fc-citations-library");
  assert.equal(grid.children[1].className, "fc-citations-editor");
  assert.equal(grid.children[2].className, "fc-citations-preview");
  assert.equal(field(h, "portable-format").parent.parent, field(h, "portable-scope").parent.parent,
    "format and scope are grouped in shared responsive controls");
});

test("nine exact comparison omissions collapse to one count summary while another warning remains across locales", async () => {
  const warnings = Array.from({ length: 9 }, (_, index) => ({ code: "original_text_omitted", index, field: "originalText" }));
  warnings.splice(1, 0, { code: "ris_author_literal", index: 0, field: "authors" });
  const beforeWarnings = JSON.stringify(warnings);
  const h = setup({ exporter: portableExporter({ warnings }) });
  await loadLibraryItems(h, Array.from({ length: 9 }, (_, index) => ({
    id: `summary_${index}`, type: "book", title: `Fictional summary record ${index + 1}`,
    authors: [{ literal: "Fictional Institute" }], issued: { year: 2024 }, publisher: "Fictional Press",
  })));
  await action(h, "portable-preview").click();
  const reviewed = portableText(h).value;
  for (const [locale, comparison, author] of [
    ["en", /comparison/i, /author|organization/i],
    ["zh", /原文对照/, /作者/],
    ["es", /comparaci[oó]n/i, /autor|organiza/i],
  ]) {
    h.locale.value = locale;
    h.assistant.render();
    let container = null;
    walk(h.mount, (node) => {
      if (node.className?.split(/\s+/).includes("fc-citations-portable-issues")) container = node;
    });
    const rows = [];
    walk(container, (node) => { if (node.tagName === "LI") rows.push(node); });
    assert.equal(rows.length, 2, locale);
    assert.match(rows[0].textContent, comparison);
    assert.match(rows[0].textContent, /\b9\b/);
    assert.match(rows[1].textContent, author);
    assert.doesNotMatch(container.textContent, /portable_original_omitted_summary|original_text_omitted|ris_author_literal/);
    assert.equal(h.assistant.state().portablePending, true);
    assert.equal(portableText(h).value, reviewed);
  }
  assert.equal(JSON.stringify(warnings), beforeWarnings, "display aggregation never mutates serializer warnings");
});

test("comparison omission counts deduplicate valid record indexes and count unindexed diagnostics separately", async () => {
  const warnings = [
    { code: "original_text_omitted", index: 0 },
    { code: "original_text_omitted", index: 0 },
    { code: "original_text_omitted", index: 1 },
    { code: "original_text_omitted" },
    { code: "original_text_omitted", index: -1 },
    { code: "ris_author_literal", index: 0, field: "authors" },
    { code: "ris_author_literal", index: 1, field: "authors" },
  ];
  const h = setup({ exporter: portableExporter({ warnings }) });
  await loadLibraryItems(h, managementRecords());
  await action(h, "portable-preview").click();
  let container = null;
  walk(h.mount, (node) => {
    if (node.className?.split(/\s+/).includes("fc-citations-portable-issues")) container = node;
  });
  const rows = [];
  walk(container, (node) => { if (node.tagName === "LI") rows.push(node); });
  assert.equal(rows.length, 3, "other warning instances are not deduplicated");
  assert.match(rows[0].textContent, /comparison/i);
  assert.match(rows[0].textContent, /\b4\b/);
  assert.match(rows[1].textContent, /1/);
  assert.match(rows[2].textContent, /2/);
});
