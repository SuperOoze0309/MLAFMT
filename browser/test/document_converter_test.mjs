// Stateful tests of the shipped converter UI with a small DOM adapter. Real
// engine conversion and browser layout acceptance are separate checks.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../static/document-converter.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../../static/document-converter.css", import.meta.url), "utf8");
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = new Map(); this.events = new Map();
    this.className = ""; this._text = ""; this.value = ""; this.files = [];
    this.disabled = false; this.hidden = false; this.href = ""; this.download = "";
    this.clicks = 0;
    this.classList = { toggle: (value, force) => {
      const names = new Set(this.className.split(" ").filter(Boolean));
      if (force) names.add(value); else names.delete(value);
      this.className = [...names].join(" ");
    } };
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) {
    this.children.push(...children);
    if (this.tagName === "SELECT" && this.value === "" && this.children.length) this.value = this.children[0].value;
  }
  replaceChildren(...children) { this.children = []; this._text = ""; if (this.tagName === "SELECT") this.value = ""; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === "href" || name === "download") this[name] = ""; }
  addEventListener(name, listener) { this.events.set(name, [...(this.events.get(name) || []), listener]); }
  dispatch(name, event = {}) {
    if (name === "click" && this.disabled) return Promise.resolve();
    return Promise.all((this.events.get(name) || []).map(listener => listener({ type: name, target: this, ...event })));
  }
  click() { this.clicks++; return this.dispatch("click"); }
}

function setup(options = {}) {
  const document = { createElement: tag => new Element(tag, document) };
  const mount = document.createElement("section");
  const created = [], revoked = [], requests = [], busy = [], events = new Map();
  let lang = "en";
  const window = {
    document, AbortController,
    URL: { createObjectURL: blob => { const url = `blob:test-${created.length}`; created.push({ blob, url }); return url; }, revokeObjectURL: url => revoked.push(url) },
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name, listener) => { if (events.get(name) === listener) events.delete(name); },
  };
  vm.runInNewContext(source, { window, fetch: () => { throw new Error("UI must not fetch"); } });
  const instance = window.FormCapyDocumentConverter.create({
    mount, getLocale: () => lang,
    convert: async request => { requests.push(request); return options.convert ? options.convert(request) : { blob: new Blob(["converted"]), name: "Result.pdf", warnings: [] }; },
    canStart: options.canStart || (() => true),
    onBusyChange: value => busy.push(value),
  });
  function find(role) {
    const scan = element => element.getAttribute("data-fc-convert") === role ? element : element.children.map(scan).find(Boolean);
    return scan(mount);
  }
  async function file(name = "paper.docx", size = 100) {
    const input = find("file");
    input.files = [{ name, size, arrayBuffer: () => { throw new Error("UI must not read bytes before Convert"); } }];
    await input.dispatch("change");
  }
  return { instance, mount, find, file, requests, busy, created, revoked, events, locale: value => { lang = value; instance.setLocale(); } };
}

test("mounting, opening and choosing a file do not start the engine or read bytes", async () => {
  const ui = setup();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.find("convert").disabled, true);
  await ui.find("choose").click();
  assert.equal(ui.find("file").clicks, 1);
  await ui.file();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.find("convert").disabled, false);
  assert.match(ui.find("engine-notice").textContent, /hundreds of MB/);
  assert.match(ui.find("engine-notice").textContent, /1 GiB/);
  assert.match(ui.mount.textContent, /not uploaded/);
});

test("file choice exposes only the two different output formats", async () => {
  const ui = setup();
  await ui.file("paper.PDF");
  assert.deepEqual(ui.find("target").children.map(option => option.value), ["docx", "doc"]);
  assert.equal(ui.instance.state().targetFormat, "docx");
  assert.match(ui.find("limitations").textContent, /OCR/);
  await ui.file("paper.doc");
  assert.deepEqual(ui.find("target").children.map(option => option.value), ["pdf", "docx"]);
});

for (const [name, size, pattern] of [
  ["file.docm", 40, /PDF, DOCX or DOC/],
  ["file.docx", 0, /empty/],
  ["file.docx", 20 * 1024 * 1024 + 1, /exceeds 20 MiB/],
  ["file.docx", NaN, /could not be read/],
]) test(`invalid file ${name}/${size} is rejected before conversion`, async () => {
  const ui = setup(); await ui.file(name, size);
  assert.equal(ui.find("convert").disabled, true);
  assert.match(ui.find("status").textContent, pattern);
  assert.equal(ui.requests.length, 0);
});

test("conversion owns its Blob result and clears it when the target changes", async () => {
  const ui = setup({ convert: async () => ({ blob: new Blob(["converted"]), name: "../safe.pdf", warnings: ["office_layout_review", "office_layout_review", "legacy_doc_limits"] }) });
  await ui.file(); await ui.find("convert").click();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].file.name, "paper.docx");
  assert.equal(ui.requests[0].targetFormat, "pdf");
  assert.equal(ui.find("download").hidden, false);
  assert.equal(ui.find("download").download, ".._safe.pdf");
  assert.equal(ui.find("warnings").children.length, 2);
  assert.deepEqual(ui.busy, [true, false]);
  ui.find("target").value = "doc"; await ui.find("target").dispatch("change");
  assert.equal(ui.find("download").hidden, true);
  assert.equal(ui.find("download").href, "");
  assert.deepEqual(ui.revoked, ["blob:test-0"]);
});

test("PDF reconstruction and actual backend warnings are explained before download", async () => {
  const ui = setup({ convert: async () => ({ blob: new Blob(["docx"]), name: "result.docx", warnings: ["pdf_text_reconstruction", "pdf_images_omitted", "pdf_blank_pages"] }) });
  await ui.file("source.pdf"); await ui.find("convert").click();
  assert.equal(ui.find("warnings").children.length, 3);
  assert.match(ui.find("warnings").textContent, /editable Word/);
  assert.match(ui.find("warnings").textContent, /images were not retained/);
  assert.match(ui.find("warnings").textContent, /no extractable text/);
});

test("busy controls and localized progress follow the active conversion", async () => {
  const pending = deferred();
  const ui = setup({ convert: request => { request.onStage("download"); return pending.promise; } });
  await ui.file(); const running = ui.find("convert").click();
  assert.equal(ui.instance.state().busy, true);
  for (const role of ["file", "choose", "target", "convert", "clear"]) assert.equal(ui.find(role).disabled, true, role);
  assert.equal(ui.find("cancel").hidden, false);
  assert.match(ui.find("status").textContent, /first run/);
  ui.requests[0].onStage("extracting");
  assert.match(ui.find("status").textContent, /editable text/);
  pending.resolve({ blob: new Blob(["pdf"]), name: "result.pdf" }); await running;
  assert.equal(ui.instance.state().busy, false);
  assert.equal(ui.find("cancel").hidden, true);
});

test("cancel releases the host lock and stale completion cannot overwrite a retry", async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const ui = setup({ convert: () => (++calls === 1 ? old.promise : current.promise) });
  await ui.file(); const first = ui.find("convert").click();
  await ui.find("cancel").click();
  assert.equal(ui.requests[0].signal.aborted, true);
  assert.equal(ui.instance.state().busy, false);
  assert.match(ui.find("status").textContent, /cancelled/);
  const second = ui.find("convert").click();
  old.resolve({ blob: new Blob(["old"]), name: "old.pdf" }); await first;
  assert.equal(ui.instance.state().busy, true);
  assert.equal(ui.created.length, 0);
  ui.requests[0].onStage("extracting");
  assert.doesNotMatch(ui.find("status").textContent, /editable text/);
  current.resolve({ blob: new Blob(["new"]), name: "new.pdf" }); await second;
  assert.equal(ui.find("download").download, "new.pdf");
  assert.equal(ui.created.length, 1);
  assert.deepEqual(ui.busy, [true, false, true, false]);
});

test("host busy prevents conversion and does not discard an existing result", async () => {
  let available = true;
  const ui = setup({ canStart: () => available });
  await ui.file(); await ui.find("convert").click(); available = false;
  await ui.find("convert").click();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.created.length, 1);
  assert.equal(ui.revoked.length, 0);
  assert.equal(ui.instance.state().hasResult, true);
  assert.match(ui.find("status").textContent, /Another document task/);
});

test("backend errors are localized instead of exposing arbitrary error details", async () => {
  for (const [code, expected] of [["pdf_needs_ocr", /OCR/], ["encrypted_document", /encrypted/], ["office_engine_missing", /engine is unavailable/], ["conversion_timeout", /timed out/], ["untrusted-error", /Conversion failed/]]) {
    const ui = setup({ convert: async () => { throw Object.assign(new Error("<script>untrusted</script>"), { code }); } });
    await ui.file(); await ui.find("convert").click();
    assert.match(ui.find("status").textContent, expected);
    assert.doesNotMatch(ui.mount.textContent, /script|untrusted/);
    assert.equal(ui.find("download").hidden, true);
    assert.equal(ui.instance.state().busy, false);
    ui.instance.destroy();
  }
});

test("invalid and empty conversion results have no download", async () => {
  for (const output of [{}, { blob: new Blob([]) }, { blob: { size: 10 } }]) {
    const ui = setup({ convert: async () => output });
    await ui.file(); await ui.find("convert").click();
    assert.match(ui.find("status").textContent, /output is invalid/);
    assert.equal(ui.created.length, 0);
    assert.equal(ui.instance.state().busy, false);
  }
});

test("changing language preserves file, target and result without another conversion", async () => {
  const ui = setup(); await ui.file(); await ui.find("convert").click();
  ui.locale("zh"); assert.match(ui.find("status").textContent, /转换完成/);
  assert.match(ui.mount.textContent, /不会上传/);
  assert.equal(ui.find("download").download, "Result.pdf");
  ui.locale("es"); assert.match(ui.find("status").textContent, /Conversión terminada/);
  assert.match(ui.mount.textContent, /no se suben/);
  assert.equal(ui.instance.state().hasFile, true);
  assert.equal(ui.requests.length, 1);
});

test("file replacement and clear revoke download URLs and discard previous warnings", async () => {
  const ui = setup(); await ui.file(); await ui.find("convert").click();
  await ui.file("second.pdf");
  assert.deepEqual(ui.revoked, ["blob:test-0"]);
  assert.equal(ui.instance.state().hasResult, false);
  await ui.find("convert").click();
  await ui.find("clear").click();
  assert.deepEqual(ui.revoked, ["blob:test-0", "blob:test-1"]);
  assert.equal(ui.instance.state().hasFile, false);
  assert.equal(ui.find("warnings").hidden, true);
});

test("destroy aborts pending work, releases busy and ignores late results", async () => {
  const pending = deferred(); const ui = setup({ convert: () => pending.promise });
  await ui.file(); const running = ui.find("convert").click();
  ui.instance.destroy();
  assert.equal(ui.requests[0].signal.aborted, true);
  assert.deepEqual(ui.busy, [true, false]);
  assert.equal(ui.mount.children.length, 0);
  pending.resolve({ blob: new Blob(["late"]), name: "late.pdf" }); await running;
  assert.equal(ui.created.length, 0);
  assert.equal(ui.events.size, 0);
});

test("BFCache pagehide keeps the result; ordinary pagehide disposes it", async () => {
  const ui = setup(); await ui.file(); await ui.find("convert").click();
  ui.events.get("pagehide")({ persisted: true });
  assert.equal(ui.instance.state().hasResult, true);
  ui.events.get("pagehide")({ persisted: false });
  assert.deepEqual(ui.revoked, ["blob:test-0"]);
  assert.equal(ui.mount.children.length, 0);
});

test("status is a polite atomic live region and controls have associated labels", async () => {
  const ui = setup(); const status = ui.find("status");
  assert.equal(status.getAttribute("role"), "status");
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(status.getAttribute("aria-atomic"), "true");
  const collect = element => [element, ...element.children.flatMap(collect)];
  const elements = collect(ui.mount);
  for (const role of ["file", "target"]) assert.ok(elements.some(element => element.tagName === "LABEL" && element.getAttribute("for") === ui.find(role).id));
  assert.match(css, /max-width: 560px/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
});

test("a tampered same-format target is rejected before the local engine", async () => {
  const ui = setup(); await ui.file(); ui.find("target").value = "docx";
  await ui.find("convert").click();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.created.length, 0);
});
