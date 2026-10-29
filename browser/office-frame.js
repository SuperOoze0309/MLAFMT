/* Private iframe host for a pinned, same-origin LibreOffice WASM snapshot. */
(function () {
  "use strict";
  let port;
  let unoPort;
  let files;
  let inputPath;
  let outputPath;
  let runtimeCache;
  let disposed = false;
  const blobURLs = [];
  const controller = new AbortController();
  const post = (message, transfer) => port?.postMessage(message, transfer || []);
  const stage = (name, loaded, total) => post({ type: "stage", stage: name, loaded, total });
  const fail = (error, id) => {
    console.error("FormCapy Office runtime:", error.code || "office_failed", String(error.message || error).slice(0, 200));
    post({ type: "error", id, code: error.code || "office_failed", detail: String(error.message || error).slice(0, 200) });
  };
  const officeError = (code, message) => Object.assign(new Error(message || code), { code });

  function sameOriginURL(path, base) {
    const url = new URL(path, base);
    if (url.origin !== location.origin) throw officeError("office_runtime_missing", "office assets must be same-origin");
    return url.href;
  }

  const asBlobURL = (bytes, type) => {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    blobURLs.push(url);
    return url;
  };

  async function cacheOpen(name) {
    try { return await caches.open(name); } catch (_) { return null; }
  }

  async function assetResponse(url) {
    let cached;
    try { cached = await runtimeCache?.match(url); } catch (_) {}
    if (cached) return { response: cached, cached: true };
    const response = await fetch(url, { signal: controller.signal, credentials: "same-origin" });
    return { response, cached: false };
  }

  async function verified(entry, base) {
    if (!entry || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 260 * 1024 * 1024 ||
        !/^[0-9a-f]{64}$/.test(entry.sha256)) throw officeError("office_integrity");
    const url = sameOriginURL(entry.path, base);
    const { response, cached } = await assetResponse(url);
    if (!response.ok) throw officeError("office_runtime_missing", `runtime asset returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== entry.size) {
      if (cached) { await runtimeCache?.delete(url); return verified(entry, base); }
      throw officeError("office_integrity");
    }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    if (digest !== entry.sha256) {
      if (cached) { await runtimeCache?.delete(url); return verified(entry, base); }
      throw officeError("office_integrity");
    }
    if (!cached && runtimeCache) {
      try { await runtimeCache.put(url, new Response(bytes, { headers: { "Content-Type": response.headers.get("Content-Type") || "application/octet-stream" } })); } catch (_) {}
    }
    return bytes;
  }

  async function assembled(entry, base, label) {
    if (!entry || !Array.isArray(entry.chunks) || !Number.isSafeInteger(entry.size) || entry.size > 260 * 1024 * 1024) {
      throw officeError("office_integrity");
    }
    const bytes = new Uint8Array(entry.size);
    let offset = 0;
    for (const chunk of entry.chunks) {
      const part = await verified(chunk, base);
      if (offset + part.length > bytes.length) throw officeError("office_integrity");
      bytes.set(part, offset);
      offset += part.length;
      stage(label, offset, bytes.length);
    }
    if (offset !== bytes.length) throw officeError("office_integrity");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    if (digest !== entry.sha256) throw officeError("office_integrity");
    return bytes;
  }

  function cleanupPaths() {
    for (const path of [inputPath, outputPath]) {
      try { if (path) globalThis.FS?.unlink(path); } catch (_) {}
    }
    inputPath = outputPath = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    cleanupPaths();
    unoPort?.close();
    try { globalThis.PThread?.terminateAllThreads(); } catch (_) {}
    for (const url of blobURLs) URL.revokeObjectURL(url);
    port?.close();
  }

  async function initialize(manifestURL) {
    if (!crossOriginIsolated || typeof SharedArrayBuffer === "undefined") throw officeError("office_isolation_required");
    const base = sameOriginURL(manifestURL, location.href);
    stage("office_loading");
    const manifestCache = await cacheOpen("formcapy-office-manifests-v1");
    let response;
    try {
      response = await fetch(base, { signal: controller.signal, credentials: "same-origin" });
      if (!response.ok) throw officeError("office_runtime_missing");
    } catch (error) {
      if (controller.signal.aborted) throw error;
      response = await manifestCache?.match(base);
    }
    if (!response?.ok) throw officeError("office_runtime_missing");
    const manifestResponse = response.clone();
    const manifest = await response.json();
    if (manifest.schemaVersion !== 1 || !manifest.assets || !/^[a-z0-9-]{1,100}$/.test(manifest.id)) throw officeError("office_integrity");
    try { await manifestCache?.put(base, manifestResponse); } catch (_) {}
    runtimeCache = await cacheOpen(`formcapy-office-${manifest.id}`);
    files = manifest.assets;
    // Fetch both small executable scripts before invoking them; validate their
    // exact bytes, then load the immutable same-origin URLs for pthread reuse.
    const glue = await verified(files.script, base);
    const bridge = await verified(files.bridge, base);
    const metadata = await verified(files.metadata, base);
    const threadBytes = await verified(files.driver, base);
    const cjkFont = await verified(files.font, base);
    const wasm = await assembled(files.wasm, base, "office_wasm");
    const data = await assembled(files.data, base, "office_data");
    stage("office_starting");
    const scriptURL = asBlobURL(glue, "text/javascript");
    const metadataURL = asBlobURL(metadata, "application/json");
    const bridgeURL = asBlobURL(bridge, "text/javascript");
    const driverURL = asBlobURL(threadBytes, "text/javascript");
    const packageBase = new URL(".", sameOriginURL(files.script.path, base)).href;
    const workerBootstrap = new Blob([`importScripts(${JSON.stringify(scriptURL)});`], { type: "text/javascript" });
    globalThis.Module = {
      canvas: document.getElementById("qtcanvas"),
      wasmBinary: wasm,
      getPreloadedPackage: () => data.buffer,
      preRun: [() => {
        // Install before Fontconfig/Writer start. This is a separately pinned,
        // unmodified OFL font; the upstream Office bundle itself is unchanged.
        const directory = "/instdir/share/fonts/truetype";
        globalThis.FS.mkdirTree(directory);
        globalThis.FS.writeFile(`${directory}/NotoSansCJKsc-Regular.otf`, cjkFont);
      }],
      locateFile: (path) => path === "soffice.data.js.metadata" ? metadataURL : new URL(path, packageBase).href,
      uno_scripts: [bridgeURL, driverURL],
      mainScriptUrlOrBlob: workerBootstrap,
      print: () => {},
      printErr: (text) => console.warn("Office:", String(text).slice(0, 200)),
      onAbort: (reason) => fail(officeError("office_failed", String(reason).slice(0, 200))),
    };
    const script = document.createElement("script");
    script.src = scriptURL;
    script.onerror = () => fail(officeError("office_runtime_missing"));
    script.onload = () => {
      Promise.resolve(globalThis.Module.uno_main).then((mainPort) => {
        if (!mainPort) throw officeError("office_failed");
        unoPort = mainPort;
        unoPort.onmessage = (event) => {
          const message = event.data || {};
          if (message.type === "ready") post({ type: "ready" });
          else if (message.type === "error") { console.error("Office thread:", message.detail); cleanupPaths(); post(message); }
          else if (message.type === "converted") {
            try {
              const outputSize = globalThis.FS.stat(outputPath).size;
              if (!Number.isSafeInteger(outputSize) || outputSize > 80 * 1024 * 1024) throw officeError("too_large");
              const bytes = globalThis.FS.readFile(outputPath).slice();
              const valid = message.target === "pdf" ? bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
                : message.target === "doc" ? bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
                  : bytes[0] === 0x50 && bytes[1] === 0x4b;
              if (!valid || !bytes.length) throw officeError("office_failed", "unexpected output file type");
              post({ type: "result", id: message.id, buffer: bytes.buffer }, [bytes.buffer]);
            } catch (error) { fail(error, message.id); }
            finally { cleanupPaths(); }
          }
        };
      }).catch((error) => fail(error));
    };
    document.body.appendChild(script);
  }

  function onRequest(event) {
    const request = event.data || {};
    if (request.type === "dispose") { dispose(); return; }
    if (request.type !== "convert") return;
    try {
      if (!unoPort || inputPath || !(request.buffer instanceof ArrayBuffer) || !request.buffer.byteLength ||
          request.buffer.byteLength > 20 * 1024 * 1024 || !["doc", "docx"].includes(request.extension) ||
          !["doc", "docx", "pdf"].includes(request.target) || !Number.isSafeInteger(request.id)) {
        throw officeError("invalid_options");
      }
      inputPath = `/tmp/formcapy-office-${request.id}.${request.extension}`;
      outputPath = `/tmp/formcapy-office-${request.id}-out.${request.target}`;
      globalThis.FS.writeFile(inputPath, new Uint8Array(request.buffer));
      stage("office_converting");
      unoPort.postMessage({ ...request, buffer: undefined, from: inputPath, to: outputPath });
    } catch (error) { cleanupPaths(); fail(error, request.id); }
  }

  window.addEventListener("message", (event) => {
    if (port || event.source !== parent || event.origin !== location.origin ||
        event.data?.type !== "formcapy-office-init" || !event.ports[0]) return;
    port = event.ports[0];
    port.onmessage = onRequest;
    initialize(event.data.manifestURL).catch((error) => { if (!disposed) fail(error); });
  });
  window.addEventListener("pagehide", dispose);
})();
