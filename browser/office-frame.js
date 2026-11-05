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
  // Limit the total number of simultaneous downloads, cache reads and hashes.
  // Each Office chunk may be 20 MiB, so unconstrained Promise.all is expensive.
  const LOAD_CONCURRENCY = 4;
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

  function requireActive() {
    if (controller.signal.aborted) throw new DOMException("Office loading cancelled", "AbortError");
  }

  async function matchesDigest(bytes, expected) {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    requireActive();
    return digest === expected;
  }

  function canDecompressGzip() {
    if (typeof DecompressionStream !== "function") return false;
    try { new DecompressionStream("gzip"); return true; } catch (_) { return false; }
  }

  async function readCompressed(response, expectedSize) {
    if (!response.body?.getReader) {
      // Do not buffer an unbounded response before checking its size.
      throw officeError("office_integrity", "compressed response stream unavailable");
    }
    const reader = response.body.getReader();
    const output = new Uint8Array(expectedSize);
    let offset = 0;
    const abort = () => { reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", abort, { once: true });
    try {
      requireActive();
      while (true) {
        const { value, done } = await reader.read();
        requireActive();
        if (done) break;
        if (!value || value.byteLength > expectedSize - offset) {
          reader.cancel().catch(() => {});
          throw officeError("office_integrity", "compressed asset exceeds expected size");
        }
        output.set(value, offset);
        offset += value.byteLength;
      }
      if (offset !== expectedSize) throw officeError("office_integrity", "compressed asset size mismatch");
      return output;
    } finally {
      controller.signal.removeEventListener("abort", abort);
      try { reader.releaseLock(); } catch (_) {}
    }
  }

  async function decompressGzip(bytes, expectedSize) {
    let reader;
    let abort;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      reader = stream.getReader();
      const output = new Uint8Array(expectedSize);
      let offset = 0;
      abort = () => { reader.cancel().catch(() => {}); };
      controller.signal.addEventListener("abort", abort, { once: true });
      requireActive();
      while (true) {
        const { value, done } = await reader.read();
        requireActive();
        if (done) break;
        if (!value || value.byteLength > expectedSize - offset) {
          reader.cancel().catch(() => {});
          throw officeError("office_integrity", "decompressed asset exceeds expected size");
        }
        output.set(value, offset);
        offset += value.byteLength;
      }
      if (offset !== expectedSize) throw officeError("office_integrity", "decompressed asset size mismatch");
      return output;
    } catch (error) {
      requireActive();
      if (error?.code === "office_integrity") throw error;
      throw officeError("office_integrity", "invalid compressed asset");
    } finally {
      if (abort) controller.signal.removeEventListener("abort", abort);
      try { reader?.releaseLock(); } catch (_) {}
    }
  }

  async function verified(entry, base) {
    requireActive();
    if (!entry || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 260 * 1024 * 1024 ||
        !/^[0-9a-f]{64}$/.test(entry.sha256)) throw officeError("office_integrity");
    const url = sameOriginURL(entry.path, base);
    let cached;
    try { cached = await runtimeCache?.match(url); } catch (_) {}
    requireActive();
    if (cached) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      if (bytes.length === entry.size && await matchesDigest(bytes, entry.sha256)) return bytes;
      await runtimeCache?.delete(url);
      requireActive();
    }

    let response, bytes, contentType = "application/octet-stream";
    if (entry.compressed && canDecompressGzip()) {
      const compressed = entry.compressed;
      if (compressed.encoding !== "gzip" || !Number.isSafeInteger(compressed.size) || compressed.size < 1 ||
          compressed.size >= 25 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(compressed.sha256)) {
        throw officeError("office_integrity", "invalid compressed asset metadata");
      }
      const compressedURL = sameOriginURL(compressed.path, base);
      response = await fetch(compressedURL, { signal: controller.signal, credentials: "same-origin", redirect: "error" });
      requireActive();
      // A deployment may briefly lack a new compressed sibling; keep the
      // original pinned asset as a compatible fallback for 404 only.
      if (response.status !== 404) {
        if (!response.ok) throw officeError("office_runtime_missing", `compressed asset returned ${response.status}`);
        const packed = await readCompressed(response, compressed.size);
        if (!await matchesDigest(packed, compressed.sha256)) {
          throw officeError("office_integrity", "compressed asset integrity mismatch");
        }
        bytes = await decompressGzip(packed, entry.size);
      }
    }
    if (!bytes) {
      response = await fetch(url, { signal: controller.signal, credentials: "same-origin" });
      requireActive();
      if (!response.ok) throw officeError("office_runtime_missing", `runtime asset returned ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
      contentType = response.headers.get("Content-Type") || contentType;
    }
    requireActive();
    if (bytes.length !== entry.size || !await matchesDigest(bytes, entry.sha256)) throw officeError("office_integrity");
    if (runtimeCache) {
      // Store verified uncompressed bytes under the existing URL/cache key so
      // older clients and previously cached installations remain compatible.
      try { await runtimeCache.put(url, new Response(bytes, { headers: { "Content-Type": contentType } })); } catch (_) {}
    }
    requireActive();
    return bytes;
  }

  function planAssembly(entry, label) {
    if (!entry || !Array.isArray(entry.chunks) || !entry.chunks.length ||
        !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 260 * 1024 * 1024 ||
        !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      throw officeError("office_integrity");
    }
    let offset = 0;
    const chunks = entry.chunks.map((chunk) => {
      if (!chunk || !Number.isSafeInteger(chunk.size) || chunk.size < 1 ||
          chunk.size > entry.size - offset || !/^[0-9a-f]{64}$/.test(chunk.sha256)) {
        throw officeError("office_integrity");
      }
      const planned = { entry: chunk, offset };
      offset += chunk.size;
      return planned;
    });
    if (offset !== entry.size) throw officeError("office_integrity");
    return { entry, label, chunks, bytes: new Uint8Array(entry.size), loaded: 0 };
  }

  async function checkAssembly(plan) {
    if (controller.signal.aborted) throw new DOMException("Office loading cancelled", "AbortError");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", plan.bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    if (controller.signal.aborted) throw new DOMException("Office loading cancelled", "AbortError");
    if (digest !== plan.entry.sha256) throw officeError("office_integrity");
  }

  async function loadJobs(jobs, base) {
    let next = 0;
    let firstError;
    async function worker() {
      while (!firstError && !controller.signal.aborted && next < jobs.length) {
        const job = jobs[next++];
        try {
          const bytes = await verified(job.entry, base);
          if (firstError || controller.signal.aborted) return;
          job.accept(bytes);
        } catch (error) {
          if (!firstError) {
            firstError = error;
            controller.abort();
          }
          return;
        }
      }
    }
    // Drain all in-flight tasks before reporting a failure. Any cache writes
    // already started contain verified program bytes; no later jobs start.
    await Promise.allSettled(Array.from({ length: Math.min(LOAD_CONCURRENCY, jobs.length) }, worker));
    if (firstError) throw firstError;
    if (controller.signal.aborted) throw new DOMException("Office loading cancelled", "AbortError");
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
    const requestedBase = sameOriginURL(manifestURL, location.href);
    const requested = new URL(requestedBase);
    const candidates = [requestedBase];
    // An older deployment may not yet have the separate gzip manifest. Its
    // original manifest lives in the same directory and remains valid offline.
    if (requested.pathname.endsWith("/runtime-gzip-v1.json")) {
      candidates.push(sameOriginURL("runtime.json", requestedBase));
    }
    stage("office_loading");
    const manifestCache = await cacheOpen("formcapy-office-manifests-v1");
    let response, base;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let fetched;
      try {
        fetched = await fetch(candidate, { signal: controller.signal, credentials: "same-origin" });
      } catch (error) {
        requireActive();
        try { fetched = await manifestCache?.match(candidate); } catch (_) {}
        if (!fetched && i + 1 < candidates.length) continue;
        if (!fetched) throw officeError("office_runtime_missing", "runtime manifest unavailable");
      }
      requireActive();
      if (fetched.status === 404 && i + 1 < candidates.length) continue;
      if (!fetched.ok) {
        try { fetched = await manifestCache?.match(candidate); } catch (_) { fetched = null; }
        if (!fetched?.ok) throw officeError("office_runtime_missing", "runtime manifest unavailable");
      }
      response = fetched;
      base = candidate;
      break;
    }
    if (!response?.ok) throw officeError("office_runtime_missing");
    const manifestResponse = response.clone();
    const manifest = await response.json();
    if (manifest.schemaVersion !== 1 || !manifest.assets || !/^[a-z0-9-]{1,100}$/.test(manifest.id)) throw officeError("office_integrity");
    try { await manifestCache?.put(base, manifestResponse); } catch (_) {}
    if (controller.signal.aborted) throw new DOMException("Office loading cancelled", "AbortError");
    runtimeCache = await cacheOpen(`formcapy-office-${manifest.id}`);
    if (controller.signal.aborted) throw new DOMException("Office loading cancelled", "AbortError");
    files = manifest.assets;
    // Fetch both small executable scripts before invoking them; validate their
    // exact bytes, then load the immutable same-origin URLs for pthread reuse.
    const wasmPlan = planAssembly(files.wasm, "office_wasm");
    const dataPlan = planAssembly(files.data, "office_data");
    const small = {};
    const jobs = ["script", "bridge", "metadata", "driver", "font"].map((key) => ({
      entry: files[key], accept: (bytes) => { small[key] = bytes; },
    }));
    // Interleave WASM and data chunks so both resources can progress while
    // independent small assets are loading. Write out-of-order completions to
    // predetermined offsets and report each resource's cumulative bytes.
    for (let i = 0; i < Math.max(wasmPlan.chunks.length, dataPlan.chunks.length); i++) {
      for (const plan of [wasmPlan, dataPlan]) {
        const chunk = plan.chunks[i];
        if (!chunk) continue;
        jobs.push({ entry: chunk.entry, accept: (bytes) => {
          plan.bytes.set(bytes, chunk.offset);
          plan.loaded += bytes.length;
          stage(plan.label, plan.loaded, plan.bytes.length);
        } });
      }
    }
    await loadJobs(jobs, base);
    // Verify full assemblies independently after every chunk has been checked.
    // Serial full-buffer hashes avoid two additional large copies at once.
    await checkAssembly(wasmPlan);
    await checkAssembly(dataPlan);
    const { script: glue, bridge, metadata, driver: threadBytes, font: cjkFont } = small;
    const wasm = wasmPlan.bytes;
    const data = dataPlan.bytes;
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
