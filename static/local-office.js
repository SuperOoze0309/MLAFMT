/* On-demand, browser-local LibreOffice transport. Document bytes never leave
 * this origin's page/iframe/worker. The office globals live in a disposable
 * iframe so they cannot overwrite the formatter's Python worker or the page.
 */
(function () {
  "use strict";
  const scriptURL = document.currentScript?.src || new URL("static/local-office.js", document.baseURI).href;
  const MIME = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const MAX_BYTES = 20 * 1024 * 1024;
  let settings = {
    frameURL: new URL("../browser/office-frame.html", scriptURL).href,
    runtimeManifestURL: new URL("../runtime/office/runtime.json", scriptURL).href,
    timeoutMs: 240000,
  };
  let current = null;
  let busy = false;
  let sequence = 0;

  class OfficeError extends Error {
    constructor(code, detail = "") {
      super(code);
      this.name = "OfficeError";
      this.code = code;
      this.detail = String(detail).slice(0, 300);
    }
  }

  function available() {
    return Boolean(window.isSecureContext && window.crossOriginIsolated &&
      typeof SharedArrayBuffer === "function" && window.WebAssembly && window.crypto?.subtle);
  }

  function dispose() {
    const old = current;
    current = null;
    if (!old) return;
    old.port?.postMessage({ type: "dispose" });
    old.port?.close();
    old.frame.remove();
    old.pending?.reject(new OfficeError("cancelled"));
    old.pending = null;
    old.progress = null;
    old.reject?.(new OfficeError("cancelled"));
    old.reject = null;
  }

  function createFrame(progress) {
    const frame = document.createElement("iframe");
    frame.src = settings.frameURL;
    frame.title = "Local document conversion engine";
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    const channel = new MessageChannel();
    const state = { frame, port: channel.port1, ready: null, pending: null, progress, reject: null };
    state.ready = new Promise((resolve, reject) => {
      state.reject = reject;
      frame.onerror = () => reject(new OfficeError("office_runtime_missing"));
      frame.onload = () => {
        frame.contentWindow.postMessage({
          type: "formcapy-office-init",
          manifestURL: settings.runtimeManifestURL,
        }, location.origin, [channel.port2]);
      };
      state.port.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === "stage") {
          state.progress?.(message.stage, { loaded: message.loaded, total: message.total });
        } else if (message.type === "ready") {
          state.reject = null;
          resolve(state);
        } else if (message.type === "error") {
          const error = new OfficeError(message.code || "office_failed", message.detail);
          if (state.pending && state.pending.id === message.id) state.pending.reject(error);
          else reject(error);
        } else if (message.type === "result" && state.pending && state.pending.id === message.id) {
          state.pending.resolve(message);
        }
      };
      document.body.appendChild(frame);
    });
    return state;
  }

  async function convert(file, target, options = {}) {
    if (busy) throw new OfficeError("office_busy");
    if (!available()) throw new OfficeError("office_isolation_required");
    const extension = String(file?.name || "").split(".").pop().toLowerCase();
    if (!["doc", "docx"].includes(extension) || !MIME[target] || target === extension) {
      throw new OfficeError("unsupported");
    }
    if (!file || typeof file.arrayBuffer !== "function" || !file.size) throw new OfficeError("empty_file");
    if (file.size > MAX_BYTES) throw new OfficeError("too_large");
    if (options.signal?.aborted) throw new OfficeError("cancelled");
    busy = true;
    let timer;
    let rejectStop;
    const stopped = new Promise((_, reject) => { rejectStop = reject; });
    const stop = (code) => {
      dispose();
      rejectStop(new OfficeError(code));
    };
    const aborted = () => stop("cancelled");
    options.signal?.addEventListener("abort", aborted, { once: true });
    timer = setTimeout(() => stop("timeout"), Math.max(180000, Number(options.timeoutMs || settings.timeoutMs)));
    try {
      const progress = typeof options.onProgress === "function" ? options.onProgress : options.onStage;
      const buffer = await Promise.race([file.arrayBuffer(), stopped]);
      if (!buffer.byteLength) throw new OfficeError("empty_file");
      if (buffer.byteLength > MAX_BYTES) throw new OfficeError("too_large");
      const signature = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
      const realWord = extension === "docx" ? signature[0] === 0x50 && signature[1] === 0x4b
        : [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => signature[index] === value);
      if (!realWord) throw new OfficeError("bad_doc");
      if (!current) current = createFrame(progress);
      current.progress = progress;
      const state = await Promise.race([current.ready, stopped]);
      if (options.signal?.aborted) throw new OfficeError("cancelled");
      const id = ++sequence;
      const result = new Promise((resolve, reject) => { state.pending = { id, resolve, reject }; });
      state.port.postMessage({ type: "convert", id, extension, target, buffer }, [buffer]);
      const message = await Promise.race([result, stopped]);
      state.pending = null;
      const stem = String(file.name).replace(/\.[^.]*$/, "").replace(/[\\/\u0000-\u001f\u007f]/g, "_") || "Converted";
      return {
        blob: new Blob([message.buffer], { type: MIME[target] }),
        name: `${stem}.${target}`,
        warnings: ["font_substitution", ...(target === "doc" ? ["legacy_format"] : [])],
      };
    } catch (error) {
      dispose();
      if (error instanceof OfficeError) throw error;
      throw new OfficeError("office_failed", error?.message || error);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", aborted);
      busy = false;
    }
  }

  window.FormCapyLocalOffice = Object.freeze({
    available, convert, dispose, OfficeError,
    configure(options = {}) {
      if (busy) throw new OfficeError("office_busy");
      dispose();
      for (const field of ["frameURL", "runtimeManifestURL"]) {
        if (options[field]) {
          const url = new URL(options[field], document.baseURI);
          if (url.origin !== location.origin) throw new OfficeError("office_runtime_missing");
          settings[field] = url.href;
        }
      }
      if (Number.isFinite(options.timeoutMs)) settings.timeoutMs = Math.max(180000, options.timeoutMs);
    },
  });
  window.addEventListener("pagehide", dispose);
})();
