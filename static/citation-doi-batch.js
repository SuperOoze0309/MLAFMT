/* FormCapy DOI batch coordinator.
 *
 * Parses a pasted DOI list and coordinates the caller's existing lookup
 * object. This module never fetches anything itself and performs no work on
 * load, paste or parse. A lookup starts only when the caller explicitly calls
 * run(). Batch state stays in memory; the injected lookup sends each DOI to
 * its metadata provider only when the caller explicitly starts the batch.
 *
 * Status convention: parse sets ready/invalid/duplicate rows. run preserves
 * terminal rows when explicitly resumed; ready rows are queried sequentially.
 * A cancelled in-flight row becomes cancelled and later rows stay ready. A
 * rate-limited row becomes failed and later rows stay ready. completed counts
 * successful rows, failed counts failed rows, and items is the flattened,
 * cloned union of successful items. Global/configuration errors are returned
 * in an additional errors array; ordinary snapshots contain only the six
 * public fields.
 */
(function (root) {
  "use strict";

  const MAX_LINES = 50;
  const MAX_BYTES = 32768;
  const MIN_INTERVAL_MS = 1300;
  const MAX_ITEMS_PER_RESPONSE = 200;
  const MAX_ISSUES = 20;
  const RATE_LIMITED = "lookup_rate_limited";
  const CANCELLED = "lookup_cancelled";
  const CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
  const WARNING_FIELDS = new Set(["id", "type", "title", "authors", "issued", "accessed", "publisher",
    "containerTitle", "volume", "issue", "page", "edition", "DOI", "URL", "language", "originalText"]);

  let commonLookup = null;
  let commonModel = null;
  if (typeof module !== "undefined" && module.exports) {
    try { commonLookup = require("./citation-lookup.js"); } catch (_) {}
    try { commonModel = require("./citation-library.js"); } catch (_) {}
  }

  const getLookup = () => root.FormCapyCitationLookup || commonLookup;
  const getModel = () => root.FormCapyCitations || commonModel;
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = (value) => value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.prototype.toString.call(value) === "[object Object]";
  function byteLength(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    let total = 0;
    for (const character of text) {
      const point = character.codePointAt(0);
      total += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    }
    return total;
  }

  function clone(value) {
    try {
      const text = JSON.stringify(value);
      return typeof text === "string" ? JSON.parse(text) : null;
    } catch (_) {
      return null;
    }
  }

  function clockNow() {
    try {
      if (root.performance && typeof root.performance.now === "function") {
        return root.performance.now();
      }
    } catch (_) {}
    return Date.now();
  }

  function normalizer() {
    try {
      const api = getLookup();
      return api && typeof api.normalizeDoi === "function" ? api.normalizeDoi.bind(api) : null;
    } catch (_) {
      return null;
    }
  }

  function normalized(normalize, input) {
    try {
      const doi = normalize(input);
      return typeof doi === "string" && doi ? doi : null;
    } catch (_) {
      return null;
    }
  }

  function issueCodes(value, allowEmpty = false, preserveField = false) {
    if (!Array.isArray(value) || value.length > MAX_ISSUES || (!allowEmpty && !value.length)) return null;
    const result = [];
    for (const issue of value) {
      if (!plain(issue) || typeof issue.code !== "string" || !CODE_PATTERN.test(issue.code)) return null;
      const entry = { code: issue.code };
      if (preserveField && typeof issue.field === "string" && WARNING_FIELDS.has(issue.field)) entry.field = issue.field;
      result.push(entry);
    }
    return result;
  }

  function parse(text) {
    if (typeof text !== "string") {
      return { ok: false, rows: [], errors: [{ code: "input_invalid" }] };
    }
    if (text.length > MAX_BYTES || byteLength(text) > MAX_BYTES) {
      return { ok: false, rows: [], errors: [{ code: "input_too_large", limitBytes: MAX_BYTES }] };
    }
    const normalize = normalizer();
    if (!normalize) {
      return { ok: false, rows: [], errors: [{ code: "normalizer_unavailable" }] };
    }
    const lines = text.split(/\r\n|\n|\r/);
    let nonempty = 0;
    for (const line of lines) if (line.trim()) nonempty += 1;
    if (nonempty > MAX_LINES) {
      return { ok: false, rows: [], errors: [{ code: "too_many_lines", limitLines: MAX_LINES }] };
    }
    const rows = [];
    const seen = new Map();
    for (let index = 0; index < lines.length; index += 1) {
      const input = lines[index];
      if (!input.trim()) continue;
      const line = index + 1;
      const doi = normalized(normalize, input);
      if (!doi) {
        rows.push({ line, input, doi: null, status: "invalid", errors: [{ code: "doi_invalid" }] });
        continue;
      }
      const key = doi.toLowerCase();
      if (seen.has(key)) {
        rows.push({
          line, input, doi, status: "duplicate", errors: [{ code: "duplicate_doi" }],
          duplicateOf: seen.get(key),
        });
        continue;
      }
      seen.set(key, line);
      rows.push({ line, input, doi, status: "ready", errors: [] });
    }
    return { ok: true, rows, errors: [] };
  }

  function successItems(requestedDoi, result, normalize) {
    if (!Array.isArray(result.items) || !result.items.length ||
        result.items.length > MAX_ITEMS_PER_RESPONSE) {
      return { ok: false, code: "lookup_items_invalid" };
    }
    const warnings = issueCodes(result.warnings, true, true);
    if (!warnings) return { ok: false, code: "lookup_response_invalid" };
    const items = [];
    for (const source of result.items) {
      if (!plain(source)) return { ok: false, code: "lookup_item_invalid" };
      const item = clone(source);
      if (!item || !plain(item)) return { ok: false, code: "lookup_item_invalid" };
      const itemDoi = normalized(normalize, item.DOI);
      if (!itemDoi || itemDoi.toLowerCase() !== requestedDoi.toLowerCase()) {
        return { ok: false, code: "lookup_doi_mismatch" };
      }
      const model = getModel();
      if (model && typeof model.validateItem === "function") {
        try {
          const validation = model.validateItem(item);
          if (!validation || validation.valid !== true) {
            return { ok: false, code: "lookup_item_invalid" };
          }
        } catch (_) {
          return { ok: false, code: "lookup_item_invalid" };
        }
      } else if (typeof item.id !== "string" ||
          !["book", "article-journal", "webpage"].includes(item.type) ||
          typeof item.title !== "string" || !item.title.trim()) {
        return { ok: false, code: "lookup_item_invalid" };
      }
      items.push(item);
    }
    return { ok: true, items, warnings };
  }

  function classify(result, requestedDoi, normalize) {
    if (!plain(result)) return { ok: false, code: "lookup_response_invalid" };
    if (result.ok === false) {
      const errors = issueCodes(result.errors);
      if (!errors) return { ok: false, code: "lookup_response_invalid" };
      return {
        ok: false,
        errors,
        rateLimited: errors.some((issue) => issue.code === RATE_LIMITED),
      };
    }
    if (result.ok !== true) return { ok: false, code: "lookup_response_invalid" };
    if (has(result, "errors")) {
      const errors = issueCodes(result.errors, true);
      if (!errors || errors.length) return { ok: false, code: "lookup_response_invalid" };
    }
    const success = successItems(requestedDoi, result, normalize);
    return success.ok
      ? { ok: true, items: success.items, warnings: success.warnings }
      : { ok: false, code: success.code };
  }

  function preserveTerminal(raw, prepared, normalize) {
    if (raw.status === "success") {
      const success = successItems(prepared.doi, {
        items: raw.items, warnings: raw.warnings,
      }, normalize);
      if (!success.ok) return null;
      return { status: "success", items: success.items, warnings: success.warnings, errors: [] };
    }
    if (raw.status === "failed") {
      const errors = issueCodes(raw.errors);
      if (!errors) return null;
      return { status: "failed", items: [], errors };
    }
    return null;
  }

  function prepareRows(inputRows, normalize) {
    if (!Array.isArray(inputRows) || inputRows.length > MAX_LINES) {
      return { error: "rows_invalid" };
    }
    const rows = [];
    const seen = new Map();
    let totalBytes = 0;
    for (let index = 0; index < inputRows.length; index += 1) {
      const raw = inputRows[index];
      if (!plain(raw) || typeof raw.input !== "string" ||
          !Number.isSafeInteger(raw.line) || raw.line < 1) {
        return { error: "rows_invalid" };
      }
      if (raw.input.length > MAX_BYTES) return { error: "input_too_large" };
      totalBytes += byteLength(raw.input);
      if (totalBytes > MAX_BYTES) return { error: "input_too_large" };
      const row = {
        line: raw.line,
        input: raw.input,
        doi: normalized(normalize, raw.input),
        status: "ready",
        errors: [],
      };
      if (!row.doi) {
        row.status = "invalid";
        row.errors = [{ code: "doi_invalid" }];
        rows.push(row);
        continue;
      }
      const key = row.doi.toLowerCase();
      if (seen.has(key)) {
        row.status = "duplicate";
        row.duplicateOf = seen.get(key);
        row.errors = [{ code: "duplicate_doi" }];
        rows.push(row);
        continue;
      }
      seen.set(key, row.line);
      const terminal = preserveTerminal(raw, row, normalize);
      if (terminal) Object.assign(row, terminal);
      rows.push(row);
    }
    return { rows };
  }

  function emptySnapshot() {
    return { rows: [], items: [], completed: 0, failed: 0, cancelled: false, rateLimited: false };
  }

  function withSignal(signal, handler) {
    if (!signal || typeof signal.addEventListener !== "function") return false;
    try {
      signal.addEventListener("abort", handler, { once: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  function makeController() {
    if (typeof root.AbortController === "function") {
      try { return new root.AbortController(); } catch (_) {}
    }
    const listeners = new Set();
    const signal = {
      aborted: false,
      addEventListener(type, handler) { if (type === "abort" && typeof handler === "function") listeners.add(handler); },
      removeEventListener(type, handler) { if (type === "abort") listeners.delete(handler); },
    };
    return {
      signal,
      abort() {
        if (signal.aborted) return;
        signal.aborted = true;
        for (const handler of [...listeners]) {
          try { handler(); } catch (_) {}
        }
        listeners.clear();
      },
    };
  }

  async function run(inputRows, options = {}) {
    const settings = options && typeof options === "object" ? options : {};
    const normalize = normalizer();
    if (!normalize) {
      return { ...emptySnapshot(), errors: [{ code: "normalizer_unavailable" }] };
    }
    let prepared;
    try {
      prepared = prepareRows(inputRows, normalize);
    } catch (_) {
      prepared = { error: "rows_invalid" };
    }
    if (prepared.error) {
      return { ...emptySnapshot(), errors: [{ code: prepared.error }] };
    }
    const rows = prepared.rows;
    let completed = 0;
    let failed = 0;
    let cancelled = false;
    let rateLimited = false;
    let stopped = false;
    let lastStart = null;
    let currentController = null;
    let currentAbortResolve = null;
    let delayTimer = null;
    let delayResolve = null;
    const progress = typeof settings.onProgress === "function" ? settings.onProgress : null;
    const signal = settings.signal;
    let listenerAttached = false;

    for (const row of rows) {
      if (row.status === "success") completed += 1;
      else if (row.status === "failed") failed += 1;
    }

    function aggregateItems() {
      const result = [];
      for (const row of rows) {
        if (row.status === "success" && Array.isArray(row.items)) {
          for (const item of row.items) result.push(item);
        }
      }
      return result;
    }

    function snapshot() {
      const rowCopy = clone(rows);
      const itemCopy = clone(aggregateItems());
      return {
        rows: Array.isArray(rowCopy) ? rowCopy : [],
        items: Array.isArray(itemCopy) ? itemCopy : [],
        completed,
        failed,
        cancelled,
        rateLimited,
      };
    }

    function emit() {
      if (!progress) return;
      try {
        const pending = progress(snapshot());
        if (pending && typeof pending.then === "function") pending.catch(() => {});
      } catch (_) {}
    }

    function clearDelay() {
      if (delayTimer !== null) {
        const clear = root.clearTimeout || (typeof clearTimeout === "function" ? clearTimeout : null);
        if (clear) {
          try { clear(delayTimer); } catch (_) {}
        }
        delayTimer = null;
      }
      if (delayResolve) {
        const resolve = delayResolve;
        delayResolve = null;
        resolve();
      }
    }

    function abortRun() {
      if (stopped) return;
      stopped = true;
      cancelled = true;
      if (currentController) {
        try { currentController.abort(); } catch (_) {}
      }
      if (currentAbortResolve) {
        const resolve = currentAbortResolve;
        currentAbortResolve = null;
        resolve();
      }
      clearDelay();
    }

    function pause(ms) {
      if (ms <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        delayResolve = resolve;
        const schedule = root.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
        if (!schedule) {
          delayResolve = null;
          resolve();
          return;
        }
        try {
          delayTimer = schedule(() => {
            delayTimer = null;
            delayResolve = null;
            resolve();
          }, ms);
          if (delayTimer === undefined) delayTimer = null;
        } catch (_) {
          delayResolve = null;
          resolve();
        }
      });
    }

    function cleanup() {
      if (listenerAttached) {
        try { signal.removeEventListener("abort", abortRun); } catch (_) {}
        listenerAttached = false;
      }
      if (currentController) {
        try { currentController.abort(); } catch (_) {}
        currentController = null;
      }
      clearDelay();
    }

    if (signal && signal.aborted) abortRun();
    else listenerAttached = withSignal(signal, abortRun);

    emit();

    let lookupFn = null;
    try {
      if (settings.lookup && typeof settings.lookup.lookup === "function") {
        lookupFn = settings.lookup.lookup.bind(settings.lookup);
      }
    } catch (_) {}
    if (!lookupFn && !stopped && rows.some((row) => row.status === "ready")) {
      const snap = snapshot();
      emit();
      cleanup();
      return { ...snap, errors: [{ code: "lookup_unavailable" }] };
    }

    try {
      for (const row of rows) {
        if (stopped) break;
        if (row.status !== "ready") continue;
        if (lastStart !== null) {
          const wait = lastStart + MIN_INTERVAL_MS - clockNow();
          if (wait > 0) await pause(wait);
          if (stopped) break;
        }
        if (stopped) break;
        const controller = makeController();
        currentController = controller;
        let requestAbortResolve = null;
        const requestAbort = new Promise((resolve) => { requestAbortResolve = resolve; });
        currentAbortResolve = requestAbortResolve;
        let outcome;
        try {
          let request;
          try {
            request = Promise.resolve(lookupFn(row.doi, { signal: controller.signal }));
          } catch (error) {
            request = Promise.reject(error);
          }
          // Timestamp after invocation so the next start is measured from a
          // point no earlier than this query actually began.
          lastStart = clockNow();
          request.catch(() => {});
          outcome = await Promise.race([
            request.then((value) => ({ type: "value", value }), (error) => ({ type: "error", error })),
            requestAbort.then(() => ({ type: "abort" })),
          ]);
        } catch (error) {
          outcome = { type: "error", error };
        }
        currentAbortResolve = null;
        currentController = null;
        try { controller.abort(); } catch (_) {}

        if (stopped || outcome.type === "abort") {
          row.status = "cancelled";
          row.errors = [{ code: CANCELLED }];
          row.items = [];
          emit();
          break;
        }
        if (outcome.type === "error") {
          let errorCode = "lookup_failed";
          try {
            if (outcome.error && outcome.error.code === RATE_LIMITED) errorCode = RATE_LIMITED;
          } catch (_) {}
          row.status = "failed";
          row.errors = [{ code: errorCode }];
          row.items = [];
          failed += 1;
          if (errorCode === RATE_LIMITED) {
            rateLimited = true;
            emit();
            break;
          }
          emit();
          continue;
        }
        const result = (() => {
          try {
            return classify(outcome.value, row.doi, normalize);
          } catch (_) {
            return { ok: false, code: "lookup_response_invalid" };
          }
        })();
        if (!result.ok) {
          row.status = "failed";
          row.errors = result.errors || [{ code: result.code }];
          row.items = [];
          failed += 1;
          if (result.rateLimited) {
            rateLimited = true;
            emit();
            break;
          }
          emit();
          continue;
        }
        row.status = "success";
        row.items = result.items;
        row.warnings = result.warnings;
        row.errors = [];
        completed += 1;
        emit();
      }
    } finally {
      cleanup();
    }

    const final = snapshot();
    emit();
    const clean = clone(final);
    return Array.isArray(clean && clean.rows) ? clean : final;
  }

  const api = Object.freeze({
    MAX_LINES,
    MAX_BYTES,
    MIN_INTERVAL_MS,
    parse,
    run,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FormCapyDoiBatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
