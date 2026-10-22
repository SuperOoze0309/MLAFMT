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
  click() { return this.dispatch("click"); }
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
    createElement: (tag) => new Element(tag),
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
    const url = "blob:test-" + URLStub.urls.length;
    URLStub.urls.push(url);
    return url;
  }
  static revokeObjectURL(url) { URLStub.revoked.push(url); }
}
URLStub.revoked = [];
URLStub.created = [];
URLStub.urls = [];

function setup({ locale = "en", manual = false, onExportWord = null, allowDownloads = true } = {}) {
  const document = makeDocument();
  const mount = document.createElement("div");
  const storage = makeStorage();
  const engine = makeEngine({ manual });
  const navigator = { clipboard: undefined };
  const context = vm.createContext({
    document, navigator, localStorage: storage,
    Blob: makeBlob, URL: URLStub, TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, console, queueMicrotask,
  });
  vm.runInContext(modelSource, context);
  vm.runInContext(assistantSource, context);
  const M = context.FormCapyCitations;
  const A = context.FormCapyCitationAssistant;
  const localeBox = { value: locale };
  const assistant = A.create({
    mount, model: M, engine, storage,
    getLocale: () => localeBox.value,
    onExportWord, allowDownloads,
  });
  return { document, mount, storage, engine, model: M, assistant, locale: localeBox, navigator };
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
  const fileInput = tag(h, "INPUT", (node) => node.type === "file");
  assert.ok(fileInput, "file input exists");
  fileInput.files = [{ size: 3, arrayBuffer: async () => new Uint8Array([0xff, 0xfe, 0xfd]).buffer }];
  await fileInput.dispatch("change");
  await flush();
  assert.equal(JSON.stringify(h.assistant.state().items), before);
  fileInput.files = [{ size: h.model.MAX_JSON_BYTES + 1, arrayBuffer: async () => { throw new Error("must not read"); } }];
  await fileInput.dispatch("change");
  assert.equal(JSON.stringify(h.assistant.state().items), before);
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
  const fallback = tag(h, "TEXTAREA", (node) => node.readOnly);
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
  const fileInput = tag(h, "INPUT", (node) => node.type === "file");
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
  const fileInput = tag(h, "INPUT", (node) => node.type === "file");
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
  const fileInput = tag(h, "INPUT", (node) => node.type === "file");
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
  const fileInput = tag(h, "INPUT", (node) => node.type === "file");
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
