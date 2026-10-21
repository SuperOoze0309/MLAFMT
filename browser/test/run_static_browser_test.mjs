// End-to-end test of the static browser build in a real headless Chrome.
//
//   node browser/test/run_static_browser_test.mjs
//   node browser/test/run_static_browser_test.mjs --offline
//
// It serves dist/browser-local with correct MIME types, drives the page through
// a real Pyodide module Worker, parses the downloaded DOCX central directory,
// exercises paragraph inspection, cancellation/recovery, the 20 MiB pre-check,
// and (with --offline) a reload with the network disabled.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dist = path.join(root, "dist", "browser-local");
const chromePath = process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const runOffline = process.argv.includes("--offline");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".whl": "application/octet-stream",
  ".zip": "application/zip",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  "": "application/octet-stream",
};

assert.ok(existsSync(path.join(dist, "index.html")), "build dist/browser-local first");
assert.ok(existsSync(chromePath), `Chrome not found at ${chromePath}`);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    let relative = decodeURIComponent(url.pathname);
    if (relative === "/") relative = "/index.html";
    const file = path.resolve(dist, "." + relative);
    if (!file.startsWith(dist + path.sep) && file !== dist) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch (_) {
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const userDataDir = await mkdtemp(path.join(tmpdir(), "formcapy-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--metrics-recording-only",
  "--mute-audio",
  "--remote-debugging-port=0",
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

async function waitForDevTools() {
  const target = path.join(userDataDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const lines = (await fs.readFile(target, "utf8")).trim().split(/\r?\n/);
      if (lines[0]) return Number(lines[0]);
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome DevTools port did not appear");
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = this.pending.get(message.id);
        if (!item) return;
        this.pending.delete(message.id);
        if (message.error) item.reject(new Error(JSON.stringify(message.error)));
        else item.resolve(message.result);
        return;
      }
      for (const handler of this.events.get(message.method) || []) {
        handler(message.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }
}

const devToolsPort = await waitForDevTools();
let pageTarget;
for (let attempt = 0; attempt < 100; attempt += 1) {
  const list = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`).then((r) => r.json());
  pageTarget = list.find((item) => item.type === "page");
  if (pageTarget) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(pageTarget, "no Chrome page target");

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
const cdp = new CDP(socket);
const consoleErrors = [];
const pageExceptions = [];
const requests = [];
cdp.on("Runtime.consoleAPICalled", (event) => {
  if (event.type === "error") {
    consoleErrors.push(event.args.map((arg) => arg.value || arg.description || "").join(" "));
  }
});
cdp.on("Runtime.exceptionThrown", (event) => {
  pageExceptions.push(event.exceptionDetails?.exception?.description ||
    event.exceptionDetails?.text || "unknown exception");
});
cdp.on("Network.requestWillBeSent", (event) => {
  requests.push({ url: event.request.url, method: event.request.method });
});
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Network.enable");
await cdp.send("Log.enable");

async function evaluate(expression, timeoutMs = 300000) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("evaluation timed out")), timeoutMs);
  });
  try {
    const result = await Promise.race([
      cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      }),
      timeout,
    ]);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text;
      throw new Error(`page exception: ${detail}`);
    }
    return result.result?.value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function navigate(url) {
  await cdp.send("Page.navigate", { url });
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const ready = await evaluate(
        "document.readyState === 'complete' && Boolean(window.MLAFMTTransport)",
        10000,
      );
      if (ready) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("page did not become ready");
}

const pageTest = async ({ runOffline }) => {
  const steps = [];
  const rejections = [];
  window.addEventListener("unhandledrejection", (event) => {
    rejections.push(String(event.reason?.stack || event.reason));
    event.preventDefault();
  });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const status = () => document.getElementById("status");
  const waitFor = async (predicate, label, timeout = 300000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (predicate()) return;
      } catch (_) {}
      await sleep(100);
    }
    throw new Error(`timeout waiting for ${label}; status=${status().textContent}`);
  };
  const waitConversion = async (label) => {
    await waitFor(
      () => document.getElementById("web-download").href.startsWith("blob:") ||
        status().classList.contains("err"),
      label,
    );
    if (status().classList.contains("err")) {
      throw new Error(`${label} failed: ${status().textContent}`);
    }
  };
  const zipNames = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = -1;
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
      if (view.getUint32(index, true) === 0x06054b50) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0) throw new Error("ZIP end-of-central-directory record not found");
    const count = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const names = [];
    for (let index = 0; index < count; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error("bad central directory entry");
      }
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      names.push(
        new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      );
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return names;
  };
  const installFile = async (file) => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById("file");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  await waitFor(() => document.getElementById("try-demo"), "demo button");
  localStorage.setItem("mlafmt.lang", "en");
  steps.push({ name: "mode", value: document.querySelector('meta[name="mlafmt-mode"]').content });

  document.getElementById("try-demo").click();
  await waitFor(
    () => document.getElementById("drop-title").textContent.includes("FormCapy_Sample.md"),
    "sample draft",
  );
  document.getElementById("convert").click();
  await waitConversion("demo conversion");
  const firstHref = document.getElementById("web-download").href;
  const firstBuffer = await (await fetch(firstHref)).arrayBuffer();
  const firstNames = zipNames(firstBuffer);
  if (!firstNames.includes("word/document.xml")) throw new Error("DOCX has no document part");
  if (!firstNames.some((name) => name.startsWith("word/header"))) {
    throw new Error("DOCX has no header part");
  }
  steps.push({
    name: "demo",
    bytes: firstBuffer.byteLength,
    parts: firstNames.length,
    filename: document.getElementById("result-filename").textContent,
  });
  if (document.getElementById("legal-links").hidden) {
    throw new Error("runtime source link is hidden in browser mode");
  }
  const sourceLink = document.querySelector("#legal-links a").href;
  const sourceIndex = await (await fetch(sourceLink)).text();
  if (!sourceIndex.includes("FormCapy runtime sources")) {
    throw new Error("runtime source index was not served");
  }
  steps.push({ name: "sources-link", href: sourceLink });

  document.getElementById("blank").click();
  await waitFor(
    () => document.getElementById("web-download").href !== firstHref &&
      document.getElementById("web-download").href.startsWith("blob:"),
    "blank conversion",
  );
  const blankHref = document.getElementById("web-download").href;
  const blankBuffer = await (await fetch(blankHref)).arrayBuffer();
  const blankNames = zipNames(blankBuffer);
  if (!blankNames.includes("word/document.xml")) throw new Error("blank DOCX is invalid");
  steps.push({ name: "blank", bytes: blankBuffer.byteLength, parts: blankNames.length });

  const blankBlob = new Blob([blankBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await installFile(new File([blankBlob], "FormCapy_Blank.docx", { type: blankBlob.type }));
  await waitFor(
    () => document.getElementById("drop-title").textContent.includes("FormCapy_Blank.docx"),
    "docx selected",
  );
  document.getElementById("adv-open").click();
  await waitFor(() => document.getElementById("adv").open, "advanced dialog");
  document.getElementById("preserve-options").open = true;
  document.getElementById("load-paragraphs").click();
  await waitFor(
    () => document.querySelectorAll("#paragraph-list .paragraph-choice input").length > 0,
    "paragraph list",
  );
  const paragraphCount = document.querySelectorAll("#paragraph-list .paragraph-choice input").length;
  steps.push({ name: "paragraphs", count: paragraphCount });
  document.getElementById("adv-x").click();

  const bigText = new Array(3000).fill("A paragraph of text for cancellation. ".repeat(90)).join("\n\n");
  await installFile(new File([bigText], "FormCapy_Cancel.txt", { type: "text/plain" }));
  await waitFor(
    () => document.getElementById("drop-title").textContent.includes("FormCapy_Cancel.txt"),
    "cancel draft selected",
  );
  document.getElementById("convert").click();
  await waitFor(() => !document.getElementById("cancel-processing").hidden, "cancel button");
  document.getElementById("cancel-processing").click();
  await waitFor(
    () => document.getElementById("status").textContent.toLowerCase().includes("cancel"),
    "cancelled status",
  );
  steps.push({ name: "cancelled", status: document.getElementById("status").textContent });

  document.getElementById("convert").click();
  await waitFor(
    () => document.getElementById("status").textContent.toLowerCase().includes("document ready") ||
      document.getElementById("status").classList.contains("err"),
    "conversion after cancel",
    300000,
  );
  if (document.getElementById("status").classList.contains("err")) {
    throw new Error(`retry failed: ${document.getElementById("status").textContent}`);
  }
  steps.push({ name: "retry", status: document.getElementById("status").textContent });

  const huge = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "TooLarge.txt", { type: "text/plain" });
  await installFile(huge);
  await waitFor(
    () => {
      const text = document.getElementById("status").textContent.toLowerCase();
      return text.includes("exceed") || text.includes("20 mb");
    },
    "size rejection",
  );
  steps.push({ name: "size-check", status: document.getElementById("status").textContent });

  const nameInput = document.getElementById("name");
  const titleInput = document.getElementById("title");
  const savedName = nameInput.value;
  const savedTitle = titleInput.value;
  nameInput.value = "";
  titleInput.value = "";
  document.getElementById("convert").click();
  await waitFor(
    () => {
      const text = document.getElementById("status").textContent.toLowerCase();
      return text.includes("essay title") || text.includes("论文标题");
    },
    "validation message",
  );
  if (document.getElementById("convert").disabled ||
      !document.getElementById("processing-progress").hidden) {
    throw new Error("validation failure left the form busy");
  }
  nameInput.value = savedName;
  titleInput.value = savedTitle;
  nameInput.dispatchEvent(new Event("input", { bubbles: true }));
  titleInput.dispatchEvent(new Event("input", { bubbles: true }));
  steps.push({ name: "preflight", status: document.getElementById("status").textContent });

  // Cancel while a draft read is in flight, then immediately generate again.
  // The late read must not post into the rebuilt worker.
  const raceTransport = window.MLAFMTTransport.create({ mode: "browser" });
  const baseRequest = {
    kind: "convert", name: "Old", title: "Old Title", instructor: "", course: "",
    date: "1 January 2026", format_id: "mla", custom_profile: null,
    txt_mode: "blank_line", markdown: true, strip_heading: true,
  };
  const slowFile = {
    name: "Slow.txt",
    size: 12,
    arrayBuffer: () => new Promise((resolve) => {
      setTimeout(() => resolve(new TextEncoder().encode("Old paragraph.").buffer), 400);
    }),
  };
  const oldRun = raceTransport.generate({ isBlank: false, request: baseRequest, file: slowFile });
  oldRun.catch(() => {});
  const oldOutcome = oldRun.then(
    () => ({ ok: true, code: null }),
    (error) => ({ ok: false, code: error.code }),
  );
  await sleep(60);
  raceTransport.cancel();
  const freshRun = raceTransport.generate({
    isBlank: false,
    request: { ...baseRequest, name: "New", title: "New Title" },
    file: new File(["New paragraph."], "New.txt", { type: "text/plain" }),
  });
  const oldResult = await oldOutcome;
  const oldCode = oldResult.code;
  const freshResult = await freshRun;
  if (oldResult.ok || oldCode !== "cancelled") {
    throw new Error(`old read was not cancelled: ${oldCode}`);
  }
  if (!freshResult.name.startsWith("New_")) {
    throw new Error(`stale read affected the new result: ${freshResult.name}`);
  }
  raceTransport.dispose();
  steps.push({ name: "epoch-race", old: oldCode, fresh: freshResult.name });

  // Native adapter protocol: consecutive generations, stale previous results
  // and Android rotation/legacy payloads without request ids.
  const nativeMessages = [];
  window.MLAFMTAndroid = {
    postMessage(text) { nativeMessages.push(JSON.parse(text)); },
  };
  const nativeTransport = window.MLAFMTTransport.create({});
  if (nativeTransport.kind !== "native") throw new Error("native transport not selected");
  const settleFlag = (promise) => {
    const state = { settled: false, value: null, error: null };
    promise.then(
      (value) => { state.settled = true; state.value = value; },
      (error) => { state.settled = true; state.error = error; },
    );
    return state;
  };
  const first = nativeTransport.generate({
    isBlank: false,
    request: { kind: "convert", name: "A", title: "T" },
  });
  const firstState = settleFlag(first);
  window.MLAFMTNative.receive({
    type: "state", busy: true, message: "working", result: { name: "Old.docx" },
  });
  await sleep(80);
  if (firstState.settled) throw new Error("native generate resolved while busy with an old result");
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "Stale.docx" },
    request_id: 99,
  });
  await sleep(80);
  if (firstState.settled) throw new Error("native generate resolved on a stale request id");
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "One.docx" },
    request_id: 1,
  });
  await first;

  const second = nativeTransport.generate({
    isBlank: false,
    request: { kind: "convert", name: "A", title: "T" },
  });
  const secondState = settleFlag(second);
  window.MLAFMTNative.receive({
    type: "state", busy: true, message: "working", result: { name: "One.docx" }, request_id: 1,
  });
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "One.docx" },
    request_id: 1,
  });
  await sleep(80);
  if (secondState.settled) throw new Error("second native generate resolved with the first request's result");
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "Two.docx" },
    request_id: 2,
  });
  await second;

  const failing = nativeTransport.generate({
    isBlank: false,
    request: { kind: "convert", name: "A", title: "T" },
  });
  const failingState = settleFlag(failing);
  window.MLAFMTNative.receive({ type: "state", busy: true, message: "working", request_id: 3 });
  window.MLAFMTNative.receive({ type: "state", busy: false, error: "bad_doc", request_id: 3 });
  await sleep(80);
  if (!failingState.settled || failingState.error?.code !== "bad_doc") {
    throw new Error("native error terminal did not reject");
  }

  // Legacy WebView payloads carry no request_id: a terminal state is accepted
  // only after busy=true, so a stale result cannot settle the new request.
  const legacy = nativeTransport.generate({
    isBlank: true,
    request: { kind: "blank", name: "A", title: "T" },
  });
  const legacyState = settleFlag(legacy);
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "Previous.docx" },
  });
  await sleep(80);
  if (legacyState.settled) throw new Error("legacy native generate resolved on a stale result");
  window.MLAFMTNative.receive({
    type: "state", busy: true, message: "working", result: { name: "Previous.docx" },
  });
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "Blank.docx" },
  });
  await legacy;
  steps.push({
    name: "native-protocol",
    requests: nativeMessages.filter((item) => item.action === "generate").map((item) => item.data.request_id),
  });
  delete window.MLAFMTAndroid;
  nativeTransport.dispose();

  window.MLAFMTAndroid = { postMessage() { throw new Error("native bridge unavailable"); } };
  const broken = window.MLAFMTTransport.create({});
  let brokenCode = null;
  try {
    await broken.generate({ isBlank: false, request: { kind: "convert", name: "A", title: "T" } });
  } catch (error) {
    brokenCode = error.code;
  }
  if (brokenCode !== "not_dispatched") throw new Error(`unexpected dispatch error: ${brokenCode}`);
  broken.dispose();

  window.MLAFMTAndroid = { postMessage() {} };
  const slow = window.MLAFMTTransport.create({ nativeTimeoutMs: 100 });
  let timeoutCode = null;
  try {
    await slow.generate({ isBlank: false, request: { kind: "convert", name: "A", title: "T" } });
  } catch (error) {
    timeoutCode = error.code;
  }
  if (timeoutCode !== "timeout") throw new Error(`unexpected timeout error: ${timeoutCode}`);
  window.MLAFMTNative.receive({
    type: "state", busy: true, message: "working", request_id: 6,
  });
  window.MLAFMTNative.receive({
    type: "state", busy: false, message: "native_done", result: { name: "Late.docx" },
    request_id: 6,
  });
  slow.dispose();
  steps.push({ name: "native-errors", dispatch: brokenCode, timeout: timeoutCode });
  delete window.MLAFMTAndroid;

  if (runOffline) {
    const registration = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    steps.push({
      name: "offline-ready",
      scope: registration.scope,
      caches: keys,
    });
  }
  return { ok: true, steps, rejections };
};

let report;
try {
  await navigate(`${origin}/index.html`);
  await evaluate("localStorage.setItem('mlafmt.lang', 'en')");
  await navigate(`${origin}/index.html`);
  report = await evaluate(`(${pageTest.toString()})({runOffline: ${runOffline}})`);
  if (!report?.ok) throw new Error(JSON.stringify(report));

  if (runOffline) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await navigate(`${origin}/index.html`).catch(async () => {
      // A controlled navigation may not fire load events while offline; poll.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    const offlineReport = await evaluate(`(async () => {
      const waitFor = async (predicate, label, timeout = 240000) => {
        const started = Date.now();
        while (Date.now() - started < timeout) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("timeout waiting for " + label);
      };
      await waitFor(() => window.MLAFMTTransport && document.getElementById('try-demo'), "offline UI");
      localStorage.setItem("mlafmt.lang", "en");
      document.getElementById('try-demo').click();
      await waitFor(() => document.getElementById('drop-title').textContent.includes('FormCapy_Sample.md'), "offline sample");
      document.getElementById('convert').click();
      await waitFor(() => document.getElementById('web-download').href.startsWith('blob:') ||
        document.getElementById('status').classList.contains('err'), "offline conversion");
      if (document.getElementById('status').classList.contains('err')) {
        throw new Error(document.getElementById('status').textContent);
      }
      const buffer = await (await fetch(document.getElementById('web-download').href)).arrayBuffer();
      return { ok: true, bytes: buffer.byteLength };
    })()`);
    report.offline = offlineReport;
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }

  const external = requests.filter((request) =>
    !request.url.startsWith(origin) && !request.url.startsWith("blob:"));
  const posts = requests.filter((request) => request.method !== "GET");
  assert.deepEqual(external, [], `unexpected external requests: ${JSON.stringify(external)}`);
  assert.deepEqual(posts, [], `unexpected non-GET requests: ${JSON.stringify(posts)}`);
  assert.deepEqual(pageExceptions, [], `page exceptions: ${JSON.stringify(pageExceptions)}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${JSON.stringify(consoleErrors)}`);
  console.log(JSON.stringify(report, null, 2));
  console.log("OK: static browser build passed end-to-end checks");
} finally {
  try { socket.close(); } catch (_) {}
  chrome.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  server.close();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}
