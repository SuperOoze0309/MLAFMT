/* Shared document transport for FormCapy.
 *
 * One interface, three hosts:
 *   server  - desktop Flask preview, same-origin /api endpoints
 *   browser - static site, pinned Pyodide runtime in a module Worker
 *   native  - Android WebMessage bridge (wins whenever MLAFMTAndroid exists)
 *
 * The transport never decides to upload a draft on its own. In browser mode the
 * only network traffic is fetching the pinned runtime and application files;
 * document bytes stay in the page and the worker.
 */
(function () {
  "use strict";

  const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const KNOWN_ERRORS = new Set([
    "bad_doc",
    "browser_init_failed",
    "cancelled",
    "draft_changed",
    "empty_file",
    "engine_init_failed",
    "failed",
    "invalid_fields",
    "invalid_json",
    "invalid_options",
    "missing_fields",
    "net",
    "no_file",
    "not_dispatched",
    "preserve_docx_only",
    "preserve_read_failed",
    "timeout",
    "too_large",
    "unreadable_file",
    "unsupported",
    "unsupported_document",
  ]);

  class TransportError extends Error {
    constructor(code, detail) {
      super(code);
      this.name = "TransportError";
      this.code = code;
      this.detail = detail || "";
    }
  }

  const todayMla = () => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const now = new Date();
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  };

  const sanitizeName = (value, fallback = "Formatted_Paper.docx") => {
    const name = String(value || fallback).replace(/[\\/\u0000-\u001f\u007f]/g, "_");
    return name || fallback;
  };

  const makeShareFile = (blob, name) => {
    if (!blob || !window.isSecureContext || typeof File !== "function" ||
        typeof navigator.share !== "function" ||
        typeof navigator.canShare !== "function") return null;
    try {
      return new File([blob], name, { type: DOCX_MIME });
    } catch (_) {
      return null;
    }
  };

  const toResult = (base) => ({
    warnings: { omitted: 0, headings: 0, referenceSort: 0 },
    retained: [0, 0, 0],
    stats: [0, 0, 0],
    format: null,
    ...base,
  });

  const headerNumber = (response, key) => {
    const value = Number(response.headers.get("X-Stat-" + key) || 0);
    return Number.isFinite(value) ? value : 0;
  };

  async function serverError(response) {
    let data = {};
    try {
      data = await response.json();
    } catch (_) {}
    const code = typeof data.error === "string" && KNOWN_ERRORS.has(data.error)
      ? data.error
      : response.status === 413
        ? "too_large"
        : "failed";
    return new TransportError(code, data.detail || "");
  }

  function linkedAbort(external, timeoutMs) {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const onAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", onAbort, { once: true });
    }
    return {
      signal: controller.signal,
      cleanup() {
        if (timer) clearTimeout(timer);
        external?.removeEventListener("abort", onAbort);
      },
    };
  }

  function createServerTransport() {
    let stageHandler = null;

    async function fetchWithTimeout(url, options, timeoutMs, signal) {
      const linked = linkedAbort(signal, timeoutMs);
      try {
        return await fetch(url, { ...options, signal: linked.signal });
      } catch (error) {
        if (error instanceof TransportError) throw error;
        if (error?.name === "AbortError") throw new TransportError("cancelled");
        throw new TransportError("net");
      } finally {
        linked.cleanup();
      }
    }

    async function generate({ isBlank, request: fields, file, signal }) {
      let response;
      if (isBlank) {
        response = await fetchWithTimeout(
          "/api/blank",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          },
          120000,
          signal,
        );
      } else {
        if (!file) throw new TransportError("no_file");
        if (Number(file.size) > MAX_FILE_SIZE) throw new TransportError("too_large");
        const body = new FormData();
        body.append("file", file, file.name);
        for (const [key, value] of Object.entries(fields)) {
          if (value === null || value === undefined || key === "kind") continue;
          if (key === "custom_profile" || key === "preserve_paragraphs") {
            body.append(key, JSON.stringify(value));
          } else if (typeof value === "object") {
            body.append(key, JSON.stringify(value));
          } else {
            body.append(key, String(value));
          }
        }
        response = await fetchWithTimeout("/api/convert", { method: "POST", body }, 120000, signal);
      }
      if (!response.ok) throw await serverError(response);
      const name = sanitizeName(decodeHeader(response.headers.get("X-Filename")));
      const blob = await response.blob();
      let format = null;
      const formatId = response.headers.get("X-Format-Id");
      if (["mla", "apa", "custom"].includes(formatId)) {
        format = {
          id: formatId,
          label: decodeHeader(response.headers.get("X-Format-Label")),
        };
      }
      return toResult({
        name,
        blob,
        shareFile: makeShareFile(blob, name),
        isBlank: Boolean(isBlank),
        format,
        stats: ["body", "works-cited", "removed-heading-lines"].map((key) =>
          headerNumber(response, key)),
        warnings: {
          omitted: headerNumber(response, "omitted-elements"),
          headings: headerNumber(response, "unsupported-headings"),
          referenceSort: headerNumber(response, "reference-sort-skipped"),
        },
        retained: ["preserved-paragraphs", "retained-images", "retained-tables"].map(
          (key) => headerNumber(response, key)),
        source: "server",
      });
    }

    async function paragraphs({ file, signal }) {
      if (!file) throw new TransportError("no_file");
      if (Number(file.size) > MAX_FILE_SIZE) throw new TransportError("too_large");
      const body = new FormData();
      body.append("file", file, file.name);
      const response = await fetchWithTimeout("/api/paragraphs", { method: "POST", body }, 120000, signal);
      if (!response.ok) throw await serverError(response);
      let data;
      try {
        data = await response.json();
      } catch (_) {
        throw new TransportError("preserve_read_failed");
      }
      return {
        paragraphs: data.paragraphs,
        source_fingerprint: data.source_fingerprint,
        file_id: null,
      };
    }

    return {
      kind: "server",
      supportsCancel: true,
      onStage(callback) { stageHandler = callback; },
      init() {
        return Promise.resolve();
      },
      generate,
      paragraphs,
      cancel() {},
      dispose() {},
      errorCode(error) {
        return error?.code && KNOWN_ERRORS.has(error.code) ? error.code : "failed";
      },
    };
  }

  const decodeHeader = (value) => {
    if (!value) return "";
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  };

  function createBrowserTransport(options = {}) {
    const pageURL = new URL(options.baseURL || ".", document.baseURI);
    const workerURL = new URL(options.worker || "browser/worker.js", document.baseURI).href;
    const runtimeVersion =
      document.querySelector('meta[name="mlafmt-runtime"]')?.content?.trim() ||
      options.runtimeVersion ||
      "";
    const runtimePath = runtimeVersion
      ? `runtime/pyodide/${encodeURIComponent(runtimeVersion)}/`
      : "runtime/pyodide/";
    const runtimeURL = new URL(options.runtime || runtimePath, document.baseURI).href;
    let worker = null;
    let initialized = false;
    let initPromise = null;
    let initResolve = null;
    let initReject = null;
    let requestSeq = 0;
    let stageHandler = null;
    let disposed = false;
    let epoch = 0;
    const pending = new Map();
    let offlineRegistered = false;

    function postOn(instance, message, transfer) {
      if (!instance) throw new TransportError("cancelled");
      if (transfer) instance.postMessage(message, transfer);
      else instance.postMessage(message);
    }

    function emitStage(stage) {
      try {
        stageHandler?.(stage);
      } catch (_) {}
    }

    function settlePending(error) {
      for (const [id, item] of pending) {
        pending.delete(id);
        item.reject(error);
      }
    }

    function terminate(reason) {
      const error = reason instanceof TransportError
        ? reason
        : new TransportError("cancelled");
      epoch += 1;
      if (worker) {
        worker.terminate();
        worker = null;
      }
      initialized = false;
      initPromise = null;
      if (initReject) {
        const reject = initReject;
        initResolve = null;
        initReject = null;
        reject(error);
      }
      settlePending(error);
    }

    function failInit(error) {
      initialized = false;
      initPromise = null;
      if (initReject) {
        const reject = initReject;
        initResolve = null;
        initReject = null;
        reject(error);
      }
      settlePending(error);
    }

    function registerOffline() {
      if (offlineRegistered || options.offline === false) return;
      offlineRegistered = true;
      if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
      try {
        navigator.serviceWorker
          .register(new URL("sw.js", pageURL).href)
          .catch(() => {});
      } catch (_) {}
    }

    function onMessage(event) {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "stage") {
        emitStage(message.stage);
        return;
      }
      if (message.type === "ready") {
        initialized = true;
        registerOffline();
        const resolve = initResolve;
        initResolve = null;
        initReject = null;
        resolve?.();
        return;
      }
      if (message.type === "init-error") {
        failInit(new TransportError(message.code || "engine_init_failed", message.detail));
        return;
      }
      if (message.type === "worker-error") {
        const error = new TransportError("failed", message.detail);
        if (!initialized) failInit(new TransportError("engine_init_failed", message.detail));
        else settlePending(error);
        return;
      }
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.type === "aborted") {
        item.reject(new TransportError("cancelled"));
        return;
      }
      if (message.type === "error") {
        item.reject(new TransportError(message.code || "failed", message.detail));
        return;
      }
      if (message.type !== "result") return;
      if (!message.meta || message.meta.ok !== true) {
        item.reject(new TransportError(message.meta?.error || "failed", message.meta?.detail));
        return;
      }
      item.resolve(message);
    }

    function init() {
      if (disposed) return Promise.reject(new TransportError("cancelled"));
      if (initialized && worker) return Promise.resolve();
      if (initPromise) return initPromise;
      if (worker) terminate(new TransportError("cancelled"));
      epoch += 1;
      const promise = new Promise((resolve, reject) => {
        try {
          const instance = new Worker(workerURL, {
            type: "module",
            name: "formcapy-formatter",
          });
          worker = instance;
          initResolve = resolve;
          initReject = reject;
          instance.onmessage = onMessage;
          instance.onerror = (event) => {
            event.preventDefault?.();
            const detail = String(event?.message || "The formatter worker could not load.").slice(0, 300);
            failInit(new TransportError("engine_init_failed", detail));
            terminate(new TransportError("engine_init_failed", detail));
          };
          instance.postMessage({
            type: "init",
            id: ++requestSeq,
            config: {
              indexURL: runtimeURL,
              baseURL: pageURL.href,
              runtimeVersion,
            },
          });
        } catch (error) {
          initResolve = null;
          initReject = null;
          reject(new TransportError("engine_init_failed", error?.message || error));
        }
      });
      initPromise = promise;
      const clear = () => {
        if (initPromise === promise) initPromise = null;
      };
      promise.then(clear, clear);
      return promise;
    }

    async function enqueue(action, request, file, signal) {
      if (signal?.aborted) throw new TransportError("cancelled");
      if (file && Number(file.size) > MAX_FILE_SIZE) throw new TransportError("too_large");

      // Cancellation may happen while the draft is being read. Register the
      // abort handler before any await; the epoch check below keeps a late read
      // from posting into a newer worker after cancel + retry.
      let abortHandler = null;
      if (signal) {
        abortHandler = () => terminate(new TransportError("cancelled"));
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      let id = 0;
      let item = null;
      try {
        await init();
        if (signal?.aborted) throw new TransportError("cancelled");
        const runEpoch = epoch;
        const instance = worker;
        if (!instance || runEpoch !== epoch) throw new TransportError("cancelled");

        id = ++requestSeq;
        const promise = new Promise((resolve, reject) => {
          item = { resolve, reject };
          pending.set(id, item);
        });
        promise.catch(() => {});
        let buffer = null;
        if (file) {
          emitStage("reading");
          try {
            buffer = await file.arrayBuffer();
          } catch (_) {
            throw new TransportError("unreadable_file");
          }
        }
        if (runEpoch !== epoch || instance !== worker ||
            !pending.has(id) || signal?.aborted) {
          throw new TransportError("cancelled");
        }
        postOn(
          instance,
          {
            type: "request",
            id,
            action,
            request,
            file: file ? { name: file.name, buffer } : null,
          },
          buffer ? [buffer] : [],
        );
        return await promise;
      } catch (error) {
        if (item && pending.delete(id)) item.reject(error);
        throw error;
      } finally {
        if (abortHandler) signal.removeEventListener("abort", abortHandler);
      }
    }

    function browserResult(message) {
      const meta = message.meta;
      const name = sanitizeName(meta.name);
      const type = meta.mime || DOCX_MIME;
      let blob;
      try {
        blob = new File([message.buffer], name, { type });
      } catch (_) {
        blob = new Blob([message.buffer], { type });
      }
      const shareFile = typeof File === "function" && blob instanceof File
        ? blob
        : makeShareFile(blob, name);
      const stats = meta.stats || {};
      return toResult({
        name,
        blob,
        shareFile,
        isBlank: Boolean(meta.blank),
        format: ["mla", "apa", "custom"].includes(meta.format_id)
          ? { id: meta.format_id, label: meta.format_label || "" }
          : null,
        stats: [
          Number(stats.body || 0),
          Number(stats.works_cited || 0),
          Number(stats.removed_heading_lines || 0),
        ],
        warnings: {
          omitted: Number(stats.omitted_elements || 0),
          headings: Number(stats.unsupported_headings || 0),
          referenceSort: Number(stats.reference_sort_skipped || 0),
        },
        retained: [
          Number(stats.preserved_paragraphs || 0),
          Number(stats.retained_images || 0),
          Number(stats.retained_tables || 0),
        ],
        source: "browser",
      });
    }

    async function generate({ isBlank, request, file, signal }) {
      const message = await enqueue("generate", request, file, signal);
      if (!message.buffer) throw new TransportError("failed");
      return browserResult(message);
    }

    async function paragraphs({ file, requestId, signal }) {
      const message = await enqueue("paragraphs", { request_id: requestId }, file, signal);
      const meta = message.meta;
      if (!Array.isArray(meta?.paragraphs) ||
          typeof meta.source_fingerprint !== "string" ||
          !/^[a-f0-9]{64}$/i.test(meta.source_fingerprint)) {
        throw new TransportError("preserve_read_failed");
      }
      return {
        paragraphs: meta.paragraphs,
        source_fingerprint: meta.source_fingerprint,
        file_id: null,
      };
    }

    return {
      kind: "browser",
      supportsCancel: true,
      onStage(callback) { stageHandler = callback; },
      init,
      generate,
      paragraphs,
      cancel() {
        terminate(new TransportError("cancelled"));
      },
      dispose() {
        disposed = true;
        terminate(new TransportError("cancelled"));
        stageHandler = null;
      },
      errorCode(error) {
        if (error?.code && KNOWN_ERRORS.has(error.code)) return error.code;
        return "failed";
      },
    };
  }

  function createNativeTransport(options = {}) {
    const timeoutMs = Number(options.nativeTimeoutMs) > 0
      ? Number(options.nativeTimeoutMs)
      : 300000;
    let stageHandler = null;
    let eventHandler = null;
    let pendingGenerate = null;
    let generateSeq = 0;
    const pendingParagraphs = new Map();
    const send = (action, data) => {
      const bridge = window.MLAFMTAndroid;
      if (!bridge || typeof bridge.postMessage !== "function") {
        throw new TransportError("failed");
      }
      bridge.postMessage(JSON.stringify({ action, data }));
    };
    const finishGenerate = (item, message) => {
      pendingGenerate = null;
      clearTimeout(item.timer);
      if (message.error) item.reject(new TransportError(message.error));
      else item.resolve({ source: "native" });
    };
    const deliver = (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "state" && pendingGenerate) {
        const item = pendingGenerate;
        if (message.busy === true) {
          item.sawBusy = true;
        } else if (message.error || (message.message === "native_done" && message.result)) {
          // Android keeps the previous result while a new run is busy. Settle
          // only on a terminal, non-busy state. A request id settles exactly;
          // older WebView payloads must at least follow busy=true.
          const echoed = message.request_id;
          const hasEcho = echoed !== undefined && echoed !== null;
          if ((hasEcho && Number(echoed) === item.requestId) ||
              (!hasEcho && item.sawBusy)) {
            finishGenerate(item, message);
          }
        }
      }
      if (message.type === "paragraphs" && pendingParagraphs.has(message.request_id)) {
        const item = pendingParagraphs.get(message.request_id);
        pendingParagraphs.delete(message.request_id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new TransportError(message.error));
        else if (!Array.isArray(message.paragraphs) ||
                 typeof message.source_fingerprint !== "string") {
          item.reject(new TransportError("preserve_read_failed"));
        } else {
          item.resolve({
            paragraphs: message.paragraphs,
            source_fingerprint: message.source_fingerprint,
            file_id: message.file_id ?? null,
          });
        }
      }
      try {
        eventHandler?.(message);
      } catch (_) {}
    };
    window.MLAFMTNative = { receive: deliver };

    return {
      kind: "native",
      supportsCancel: false,
      onStage(callback) { stageHandler = callback; },
      onNativeEvent(callback) { eventHandler = callback; },
      init() {
        send("ready");
        return Promise.resolve();
      },
      generate({ request, isBlank }) {
        return new Promise((resolve, reject) => {
          if (pendingGenerate) {
            reject(new TransportError("not_dispatched"));
            return;
          }
          const requestId = ++generateSeq;
          const timer = setTimeout(() => {
            if (pendingGenerate?.requestId === requestId) {
              pendingGenerate = null;
              reject(new TransportError("timeout"));
            }
          }, timeoutMs);
          pendingGenerate = { resolve, reject, requestId, sawBusy: false, timer };
          try {
            send("generate", {
              ...request,
              kind: isBlank ? "blank" : "convert",
              request_id: requestId,
            });
          } catch (error) {
            clearTimeout(timer);
            pendingGenerate = null;
            reject(new TransportError("not_dispatched", error?.message || error));
          }
        });
      },
      paragraphs({ requestId }) {
        return new Promise((resolve, reject) => {
          if (pendingParagraphs.has(requestId)) {
            reject(new TransportError("failed"));
            return;
          }
          const timer = setTimeout(() => {
            pendingParagraphs.delete(requestId);
            reject(new TransportError("preserve_read_failed"));
          }, 120000);
          pendingParagraphs.set(requestId, { resolve, reject, timer });
          try {
            send("paragraphs", { request_id: requestId });
          } catch (error) {
            clearTimeout(timer);
            pendingParagraphs.delete(requestId);
            reject(error);
          }
        });
      },
      send,
      cancel() {},
      dispose() {
        eventHandler = null;
        stageHandler = null;
        window.MLAFMTNative = null;
      },
      errorCode(error) {
        return error?.code && KNOWN_ERRORS.has(error.code) ? error.code : "failed";
      },
    };
  }

  window.MLAFMTTransport = {
    create(options = {}) {
      if (typeof window.MLAFMTAndroid?.postMessage === "function") {
        return createNativeTransport(options);
      }
      if (options.mode === "browser") return createBrowserTransport(options);
      return createServerTransport();
    },
    todayMla,
    TransportError,
    DOCX_MIME,
  };
})();
