/* Optional Crossref metadata lookup. This module makes no request on load.
 * The assistant calls lookup only after an explicit DOI-query action.
 * No paper, library, author/title query, cookies or referrer is transmitted.
 */
(function (root) {
  "use strict";

  const ORIGIN = "https://api.crossref.org";
  const MAX_BYTES = 2 * 1024 * 1024;
  const TIMEOUT_MS = 15000;
  const MAX_CACHE = 40;
  const cache = new Map();
  let busy = false;
  let nextAllowed = 0;

  const fail = (code) => ({ ok: false, items: [], warnings: [], errors: [{ code }] });
  const plainObject = (value) => value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.prototype.toString.call(value) === "[object Object]";
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function normalizeDoi(input) {
    if (typeof input !== "string" || input.length > 2048) return null;
    let value = input.trim();
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (!["doi.org", "www.doi.org", "dx.doi.org"].includes(url.hostname.toLowerCase()) ||
            url.username || url.password || url.port) return null;
        value = decodeURIComponent(url.pathname.slice(1));
      } catch (_) { return null; }
    } else {
      value = value.replace(/^doi\s*:\s*/i, "");
    }
    if (!/^10\.\d{4,9}\/[^\s<>\\]+$/u.test(value) ||
        /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffe\uffff]/u.test(value)) return null;
    for (const character of value) {
      const point = character.codePointAt(0);
      if (point >= 0xd800 && point <= 0xdfff) return null;
    }
    return value;
  }

  function metadataItem(message, requestedDoi, model) {
    if (!plainObject(message)) return fail("lookup_response_invalid");
    const actualDoi = normalizeDoi(message.DOI);
    if (!actualDoi || actualDoi.toLowerCase() !== requestedDoi.toLowerCase()) {
      return fail("lookup_response_invalid");
    }
    const type = message.type === "journal-article" ? "article-journal" :
      ["book", "monograph", "edited-book", "reference-book"].includes(message.type) ? "book" : null;
    if (!type) return fail("lookup_type_unsupported");
    const warnings = [];
    let removedMarkup = false;
    const clean = (input) => {
      if (input === undefined || input === null) return "";
      if (typeof input === "number" && Number.isFinite(input)) input = String(input);
      if (typeof input !== "string" || input.length > model.MAX_FIELD * 4) {
        throw new Error("metadata_field_invalid");
      }
      let value = input.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
        const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
        const lower = entity.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(named, lower)) return named[lower];
        const point = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : Number(lower.slice(1));
        return Number.isInteger(point) && point > 0 && point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
      });
      if (/<\/?[a-z][^>]*>/i.test(value)) {
        removedMarkup = true;
        value = value.replace(/<\/?[a-z][^>]*>/gi, "");
      }
      value = value.replace(/[\t\r\n ]+/g, " ").trim();
      if (value.length > model.MAX_FIELD) throw new Error("metadata_field_invalid");
      return value;
    };
    const first = (input) => {
      if (input === undefined) return "";
      if (!Array.isArray(input)) throw new Error("metadata_field_invalid");
      return input.length ? clean(input[0]) : "";
    };
    try {
      let title = first(message.title);
      if (!title) return fail("lookup_metadata_invalid");
      const subtitle = first(message.subtitle);
      if (subtitle && !title.toLowerCase().endsWith(subtitle.toLowerCase())) title += ": " + subtitle;
      if (!title || title.length > model.MAX_FIELD) return fail("lookup_metadata_invalid");
      if (message.author !== undefined && !Array.isArray(message.author)) return fail("lookup_metadata_invalid");
      const sourceAuthors = message.author || [];
      if (sourceAuthors.length > model.MAX_AUTHORS) return fail("lookup_metadata_invalid");
      const authors = [];
      for (const author of sourceAuthors) {
        if (!plainObject(author)) return fail("lookup_metadata_invalid");
        const family = clean(author.family), given = clean(author.given), literal = clean(author.name);
        if (family || given) authors.push({ family, given });
        else if (literal) authors.push({ literal });
        else warnings.push({ code: "metadata_incomplete", field: "authors" });
      }
      let issued = null;
      const date = message.issued || message.published || message["published-print"] || message["published-online"];
      if (plainObject(date) && Array.isArray(date["date-parts"]) && Array.isArray(date["date-parts"][0])) {
        const parts = date["date-parts"][0];
        if (parts.length >= 1 && parts.length <= 3 && parts.every(Number.isInteger)) {
          issued = { year: parts[0] };
          if (parts.length > 1) issued.month = parts[1];
          if (parts.length > 2) issued.day = parts[2];
        }
      }
      const data = {
        type, title, authors, issued, DOI: actualDoi,
        URL: "https://doi.org/" + encodeURIComponent(actualDoi).replace(/%2F/gi, "/"),
        publisher: clean(message.publisher), containerTitle: first(message["container-title"]),
        volume: clean(message.volume), issue: clean(message.issue), page: clean(message.page),
        edition: clean(message["edition-number"]), language: clean(message.language),
        originalText: "Source: Crossref\nDOI: " + actualDoi + "\nMetadata: " + ORIGIN + "/works/" + encodeURIComponent(actualDoi),
      };
      const item = model.createItem(data);
      const validation = model.validateItem(item);
      if (!validation.valid) return fail("lookup_metadata_invalid");
      if (validation.warnings.length) warnings.push({ code: "metadata_incomplete" });
      if (removedMarkup) warnings.push({ code: "metadata_markup_removed" });
      if (message["article-number"] || message.editor || message.translator) {
        warnings.push({ code: "metadata_fields_omitted" });
      }
      // Repeated empty author records describe one missing field. Keep the
      // warning list bounded and compatible with batch response validation.
      const seenWarnings = new Set();
      const uniqueWarnings = warnings.filter((warning) => {
        const key = warning.code + "\u0000" + (warning.field || "");
        if (seenWarnings.has(key)) return false;
        seenWarnings.add(key);
        return true;
      });
      return { ok: true, items: [item], warnings: uniqueWarnings, errors: [], provider: "Crossref" };
    } catch (_) { return fail("lookup_metadata_invalid"); }
  }

  async function readBounded(response) {
    const length = response.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > MAX_BYTES) {
      await response.body?.cancel();
      throw new Error("lookup_response_large");
    }
    if (!response.body || typeof response.body.getReader !== "function") {
      // Streaming is needed to enforce the cap before allocating the response.
      throw new Error("lookup_response_invalid");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0, text = "";
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("lookup_response_large");
        }
        try { text += decoder.decode(part.value, { stream: true }); }
        catch (_) { throw new Error("lookup_response_invalid"); }
      }
      try { return text + decoder.decode(); }
      catch (_) { throw new Error("lookup_response_invalid"); }
    } finally { reader.releaseLock(); }
  }

  async function lookup(input, { signal } = {}) {
    const doi = normalizeDoi(input);
    if (!doi) return fail("doi_invalid");
    if (signal?.aborted) return fail("lookup_cancelled");
    const model = root.FormCapyCitations;
    if (!model || typeof model.createItem !== "function" || typeof root.fetch !== "function" ||
        typeof root.AbortController !== "function") return fail("lookup_network");
    const key = doi.toLowerCase();
    if (cache.has(key)) return clone(cache.get(key));
    if (busy) return fail("lookup_busy");
    if (Date.now() < nextAllowed) return fail("lookup_rate_limited");
    busy = true;
    nextAllowed = Date.now() + 1200;
    const controller = new root.AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = root.setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    const url = ORIGIN + "/works/" + encodeURIComponent(doi);
    try {
      if (signal?.aborted) controller.abort();
      const response = await root.fetch(url, {
        method: "GET", mode: "cors", credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) return fail("lookup_not_found");
      if (response.status === 429) {
        const retry = Number(response.headers.get("retry-after"));
        nextAllowed = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(300, Math.max(5, retry)) * 1000 : 30000);
        return fail("lookup_rate_limited");
      }
      if (!response.ok) return fail("lookup_network");
      if (response.redirected || new URL(response.url).origin !== ORIGIN ||
          !/application\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") || "")) {
        return fail("lookup_response_invalid");
      }
      const text = await readBounded(response);
      if (controller.signal.aborted) return fail(timedOut ? "lookup_timeout" : "lookup_cancelled");
      let data;
      try { data = JSON.parse(text); } catch (_) { return fail("lookup_response_invalid"); }
      if (!plainObject(data) || data.status !== "ok" || data["message-type"] !== "work") return fail("lookup_response_invalid");
      const result = metadataItem(data.message, doi, model);
      if (result.ok) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(key, clone(result));
      }
      return result;
    } catch (error) {
      if (timedOut) return fail("lookup_timeout");
      if (controller.signal.aborted || signal?.aborted) return fail("lookup_cancelled");
      if (["lookup_response_large", "lookup_response_invalid"].includes(error?.message)) return fail(error.message);
      return fail("lookup_network");
    } finally {
      // Also stop unread error bodies (404/429/invalid MIME/UTF-8), so a
      // rejected response cannot continue downloading after the timeout ends.
      controller.abort();
      root.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      busy = false;
    }
  }

  const api = Object.freeze({ normalizeDoi, lookup });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FormCapyCitationLookup = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
