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
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PYTHON_MODULES = [
  "mla_formatter.py",
  "format_profiles.py",
  "docx_preserve.py",
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
    if (action === "generate" && request.kind !== "blank" && request.kind !== "convert") {
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
    if (action === "paragraphs" || request.kind === "convert") {
      if (!file || !(file.buffer instanceof ArrayBuffer)) {
        postFailure(id, "no_file");
        return;
      }
      pyodide.FS.writeFile(started.input_path, new Uint8Array(file.buffer));
    }

    if (action === "generate") stage("formatting", id);
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
