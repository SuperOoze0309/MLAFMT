/* FormCapy browser-local formatter worker (module worker).
 *
 * Runs the pinned Pyodide runtime and the project's Python core in a worker so
 * the page stays responsive. One request is processed at a time; the main
 * thread correlates replies with a numeric request id.
 *
 * A request looks like:
 *   { type: "request", id, action: "generate" | "paragraphs",
 *     request: {...}, file: { name, buffer } }
 * and the reply is { type: "result", id, meta, buffer? } where buffer is a
 * transferred ArrayBuffer. Documents never pass through base64.
 */

const PYTHON_DOCX_WHEEL = "python_docx-1.2.0-py3-none-any.whl";
const PYPDF_WHEEL = "pypdf-6.21.4-py3-none-any.whl";
const ICML_STYLE_SHA256 = "03be9bd927f247198af11eed05a83865531edcacde80804ee8e831f512e2c293";
const ICML_STYLE_SIZE = 24486;
const ICML_STYLE_PATH = `runtime/icml/icml2026-${ICML_STYLE_SHA256}.zip`;
// This small validated cache is independent of app-shell version updates.
const ICML_STYLE_CACHE = "icml-2026-style-03be9bd9-v1";
let pdfParserReady = false;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PYTHON_MODULES = [
  "mla_formatter.py",
  "format_profiles.py",
  "docx_preserve.py",
  "bibliography_export.py",
  "document_conversion.py",
  "icml_latex.py",
  "browser_bridge.py",
];

let config = null;
let pyodide = null;
let packagesReady = false;
let applicationReady = false;
let bridge = null;
let bridgeApi = null;
let initPromise = null;
let ready = false;
let queue = Promise.resolve();
const cancelled = new Set();

self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "init") {
    if (!config) config = message.config;
    queue = queue
      .then(() => ensureReady(message.id))
      .catch((error) => failInit(error, message.id));
    return;
  }
  if (message.type === "request") {
    queue = queue.then(() => handleRequest(message));
    return;
  }
  if (message.type === "cancel") {
    // A queued request can be dropped here. Python runs synchronously, so an
    // in-flight layout cannot be interrupted; the page terminates this worker
    // and creates a fresh one for the next attempt.
    cancelled.add(message.id);
    return;
  }
  if (message.type === "dispose") {
    disposeBridge();
    pyodide = null;
    self.close();
  }
};

self.addEventListener("unhandledrejection", (event) => {
  self.postMessage({
    type: "worker-error",
    detail: String(event.reason?.message || event.reason || "worker error").slice(0, 300),
  });
});

function post(message, transfer) {
  if (transfer) self.postMessage(message, transfer);
  else self.postMessage(message);
}

function stage(name, id) {
  post({ type: "stage", stage: name, id });
}

async function ensureReady(id) {
  if (ready) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!config) throw new Error("missing worker configuration");
    if (!pyodide) {
      stage("runtime", id);
      const module = await import(new URL("pyodide.mjs", config.indexURL).href);
      pyodide = await module.loadPyodide({
        indexURL: config.indexURL,
        stdout: (line) => console.info("[python]", line),
        stderr: (line) => console.info("[python]", line),
      });
    }
    if (!packagesReady) {
      stage("packages", id);
      await pyodide.loadPackage(["lxml", "typing-extensions"]);
      packagesReady = true;
    }
    if (!applicationReady) {
      stage("application", id);
      await installApplication();
      applicationReady = true;
    }
    bridgeApi = {
      begin: bridge.begin,
      finish: bridge.finish,
      discard: bridge.discard,
    };
    ready = true;
    post({
      type: "ready",
      id,
      runtime: config.runtimeVersion,
      python: pyodide.runPython("import sys; sys.version.split()[0]"),
    });
  })();
  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
  initPromise = null;
}

async function installApplication() {
  pyodide.runPython(`
import pathlib, sys
pathlib.Path("/app/pylib").mkdir(parents=True, exist_ok=True)
pathlib.Path("/app/python").mkdir(parents=True, exist_ok=True)
for entry in ("/app/pylib", "/app/python"):
    if entry not in sys.path:
        sys.path.insert(0, entry)
`);
  const wheelResponse = await fetch(new URL(`wheels/${PYTHON_DOCX_WHEEL}`, config.baseURL));
  if (!wheelResponse.ok) {
    throw new Error(`python-docx wheel failed to load (${wheelResponse.status})`);
  }
  const wheel = new Uint8Array(await wheelResponse.arrayBuffer());
  pyodide.FS.writeFile("/tmp/formcapy-python-docx.whl", wheel);
  pyodide.runPython(`
import zipfile, pathlib
target = pathlib.Path("/app/pylib")
with zipfile.ZipFile("/tmp/formcapy-python-docx.whl") as archive:
    archive.extractall(target)
`);
  for (const name of PYTHON_MODULES) {
    const response = await fetch(new URL(`python/${name}`, config.baseURL));
    if (!response.ok) {
      throw new Error(`application module failed to load: ${name} (${response.status})`);
    }
    pyodide.FS.writeFile(`/app/python/${name}`, new Uint8Array(await response.arrayBuffer()));
  }
  bridge = pyodide.pyimport("browser_bridge");
}

function failInit(error, id) {
  const detail = String(error?.message || error || "engine initialization failed").slice(0, 300);
  post({ type: "init-error", id, code: "engine_init_failed", detail });
}

function postFailure(id, code, detail) {
  post({ type: "error", id, code, detail: String(detail || "").slice(0, 300) });
}

async function ensurePdfParser() {
  if (pdfParserReady) return;
  const response = await fetch(new URL(`wheels/${PYPDF_WHEEL}`, config.baseURL));
  if (!response.ok) throw new Error("The local PDF parser could not load.");
  pyodide.FS.writeFile("/tmp/formcapy-pypdf.whl", new Uint8Array(await response.arrayBuffer()));
  pyodide.runPython(`
import zipfile, os
with zipfile.ZipFile("/tmp/formcapy-pypdf.whl") as archive:
    archive.extractall("/app/pylib")
os.unlink("/tmp/formcapy-pypdf.whl")
`);
  pdfParserReady = true;
}

async function readCheckedIcml(response) {
  if (!response || !response.ok || response.redirected) throw new Error("invalid ICML style response");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== ICML_STYLE_SIZE)) throw new Error("invalid ICML style size");
  let data;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const pieces = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > ICML_STYLE_SIZE) throw new Error("ICML style response too large");
        pieces.push(next.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    data = new Uint8Array(size);
    let offset = 0;
    for (const piece of pieces) { data.set(piece, offset); offset += piece.byteLength; }
  } else {
    // Content-Length can be forged; never allocate an unbounded body.
    throw new Error("ICML style streaming unavailable");
  }
  if (data.byteLength !== ICML_STYLE_SIZE) throw new Error("invalid ICML style size");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const hex = Array.from(hash, (value) => value.toString(16).padStart(2, "0")).join("");
  if (hex !== ICML_STYLE_SHA256) throw new Error("ICML style integrity check failed");
  return data;
}

async function ensureIcmlStyle(id) {
  const url = new URL(ICML_STYLE_PATH, config.baseURL);
  if (url.origin !== self.location.origin) throw new Error("invalid ICML origin");
  let cache = null;
  try { cache = await caches.open(ICML_STYLE_CACHE); } catch (_) { /* network remains usable */ }
  let bytes = null;
  if (cache) {
    try {
      const stored = await cache.match(url.href);
      if (stored) {
        stage("icml_style_check", id);
        try { bytes = await readCheckedIcml(stored); }
        catch (_) { await cache.delete(url.href).catch(() => {}); }
      }
    } catch (_) { /* stale/unavailable cache: try network */ }
  }
  let source = "cache";
  if (!bytes) {
    stage("icml_style_fetch", id);
    const response = await fetch(url.href, { credentials: "same-origin", redirect: "error" });
    stage("icml_style_check", id);
    bytes = await readCheckedIcml(response);
    source = "network_uncached";
    if (cache) {
      try {
        await cache.put(url.href, new Response(bytes, { headers: {
          "Content-Type": "application/zip", "Content-Length": String(ICML_STYLE_SIZE),
        }}));
        source = "network";
      } catch (_) { /* generation can proceed, but offline is not guaranteed */ }
    }
  } else stage("icml_style_cached", id);
  pyodide.FS.writeFile("/app/python/icml2026-official.zip", bytes);
  return source;
}

async function handleRequest(message) {
  const id = message.id;
  let workdir = null;
  try {
    if (cancelled.delete(id)) {
      post({ type: "aborted", id });
      return;
    }
    await ensureReady(id);
    if (cancelled.delete(id)) {
      post({ type: "aborted", id });
      return;
    }
    if (!bridgeApi) throw new Error("Python bridge is unavailable");
    const request = message.request;
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      postFailure(id, "invalid_json");
      return;
    }
    const action = message.action === "paragraphs" ? "paragraphs" : "generate";
    if (action === "generate" && !["blank", "convert", "bibliography", "file_convert", "file_check"].includes(request.kind)) {
      postFailure(id, "invalid_options");
      return;
    }
    const file = message.file;
    if (file && (!(file.buffer instanceof ArrayBuffer) || file.buffer.byteLength > MAX_FILE_SIZE)) {
      postFailure(id, file.buffer?.byteLength > MAX_FILE_SIZE ? "too_large" : "no_file");
      return;
    }
    const requestJson = JSON.stringify({
      ...request,
      kind: action === "paragraphs" ? "paragraphs" : request.kind,
      file_name: file?.name ?? "",
    });

    const started = JSON.parse(bridgeApi.begin(file?.name ?? ""));
    workdir = started.workdir;
    if (action === "paragraphs" || ["convert", "file_convert", "file_check"].includes(request.kind)) {
      if (!file || !(file.buffer instanceof ArrayBuffer)) {
        postFailure(id, "no_file");
        return;
      }
      pyodide.FS.writeFile(started.input_path, new Uint8Array(file.buffer));
    }

    let icmlStyleSource = null;
    if (action === "generate" && request.format_id === "icml" && ["blank", "convert"].includes(request.kind)) {
      try { icmlStyleSource = await ensureIcmlStyle(id); }
      catch (_) { postFailure(id, "icml_style_unavailable", "ICML style unavailable or failed integrity checks"); return; }
      if (cancelled.delete(id)) { post({ type: "aborted", id }); return; }
    }
    if (action === "generate") stage("formatting", id);
    if (request.kind === "file_convert") await ensurePdfParser();
    const result = bridgeApi.finish(requestJson, workdir);
    workdir = null; // finish() cleaned it in a finally block
    let meta;
    let bytes = null;
    try {
      meta = JSON.parse(result.get(0));
      const document = result.get(1);
      try {
        if (meta.ok && document.length) bytes = document.toJs();
      } finally {
        document.destroy?.();
      }
    } finally {
      result.destroy?.();
    }
    if (!meta.ok) {
      post({ type: "result", id, meta });
      return;
    }
    if (icmlStyleSource && meta.icml_style_included === true) meta.icml_style_source = icmlStyleSource;
    if (bytes) {
      const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.slice().buffer;
      post({ type: "result", id, meta, buffer }, [buffer]);
    } else {
      post({ type: "result", id, meta });
    }
  } catch (error) {
    postFailure(id, "failed", error?.message || error);
  } finally {
    if (workdir) {
      try { bridgeApi?.discard(workdir); } catch (_) { /* worker is reset by the page */ }
    }
  }
}

function disposeBridge() {
  for (const value of Object.values(bridgeApi || {})) value?.destroy?.();
  bridgeApi = null;
  bridge?.destroy?.();
  bridge = null;
}
