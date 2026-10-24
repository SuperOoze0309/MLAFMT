// Optional Crossref lookup contract, using controlled fetch/timers only.
// These tests never contact a public API and contain no user documents.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const librarySource = fs.readFileSync(path.join(root, "static/citation-library.js"), "utf8");
const lookupSource = fs.readFileSync(path.join(root, "static/citation-lookup.js"), "utf8");
const encoder = new TextEncoder();
const DOI = "10.5555/example";
const URL_BASE = "https://api.crossref.org/works/";
const envelope = (message = {}) => ({ status: "ok", "message-type": "work", message: {
  DOI, type: "journal-article", title: ["A fictional study"],
  author: [{ family: "Example", given: "Ana" }, { name: "Fictional Research Group" }],
  issued: { "date-parts": [[2024, 2, 29]] }, "container-title": ["Example Journal"],
  publisher: "Fictional Press", volume: "8", issue: "2", page: "11-22", ...message,
} });
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness(fetchImpl) {
  let now = 10000;
  let timerId = 0;
  const timers = new Map();
  const calls = [];
  const context = vm.createContext({ URL, TextEncoder, TextDecoder, AbortController,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (...args) => { calls.push(args); return fetchImpl(...args); },
  });
  vm.runInContext(librarySource, context);
  vm.runInContext(lookupSource, context);
  return { api: context.FormCapyCitationLookup, context, calls, timers,
    advance(ms = 1300) { now += ms; },
    timeout() { for (const timer of [...timers.values()]) timer.fn(); },
  };
}

function response(data = envelope(), options = {}) {
  const chunks = options.chunks || [encoder.encode(typeof data === "string" ? data : JSON.stringify(data))];
  let index = 0;
  const state = { cancelled: 0, released: 0, reads: 0 };
  const body = { async cancel() { state.cancelled += 1; }, getReader() { return {
    async read() { state.reads += 1; return index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }; },
    async cancel() { state.cancelled += 1; },
    releaseLock() { state.released += 1; },
  }; } };
  return { status: options.status ?? 200, ok: options.status ? options.status >= 200 && options.status < 300 : true,
    url: options.url ?? URL_BASE + encodeURIComponent(DOI), redirected: options.redirected ?? false,
    headers: new Headers({ "content-type": "application/json", ...options.headers }),
    body: options.body === null ? null : body, state,
  };
}
function errorCode(result) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.items.length, 0);
  return result.errors[0].code;
}
function abortablePending(_url, options) {
  return new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

test("loading and DOI normalization send no network request", () => {
  const h = harness(() => { throw new Error("Unexpected network"); });
  assert.equal(h.calls.length, 0);
  assert.equal(h.api.normalizeDoi(" doi:10.5555/Example "), "10.5555/Example");
  assert.equal(h.api.normalizeDoi("https://doi.org/10.5555%2FExample"), "10.5555/Example");
  assert.equal(h.api.normalizeDoi("http://dx.doi.org/10.5555/example"), DOI);
  assert.equal(h.calls.length, 0);
});

for (const input of [null, 123, "", "10.123/no", "10.5555/with space", "https://example.com/10.5555/x",
  "https://doi.org.evil.example/10.5555/x", "https://user:secret@doi.org/10.5555/x", "https://doi.org:444/10.5555/x",
  "https://doi.org/%ZZ", "10.5555/<script>", "10.5555/a\\b", "10.5555/a\u202eb", "10.5555/a\ud800", "x".repeat(2049)]) {
  const label = typeof input === "string" && input.length > 100 ? "overlong input" : JSON.stringify(input);
  test(`rejects invalid DOI ${label} before requesting`, async () => {
    const h = harness(() => response());
    assert.equal(errorCode(await h.api.lookup(input)), "doi_invalid");
    assert.equal(h.calls.length, 0);
  });
}

test("manual lookup requests one encoded DOI at the fixed HTTPS provider with privacy options", async () => {
  const h = harness(() => response());
  const result = await h.api.lookup("doi:10.5555/example");
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(h.calls.length, 1);
  const [url, options] = h.calls[0];
  assert.equal(url, URL_BASE + "10.5555%2Fexample");
  for (const [key, value] of Object.entries({ method: "GET", mode: "cors", credentials: "omit", redirect: "error",
    referrerPolicy: "no-referrer", cache: "no-store" })) assert.equal(options[key], value, key);
  assert.deepEqual(plain(options.headers), { Accept: "application/json" });
  assert.equal(options.body, undefined);
  assert.equal(options.signal.aborted, true, "always abort completed requests and unread error bodies");
  assert.equal(h.timers.size, 0);
  assert.deepEqual(plain(result.items[0].authors), [{ family: "Example", given: "Ana" }, { literal: "Fictional Research Group" }]);
  assert.deepEqual(plain(result.items[0].issued), { year: 2024, month: 2, day: 29 });
  assert.equal(result.items[0].containerTitle, "Example Journal");
});

test("request encodes punctuation as one path segment and never forwards caller URL parameters", async () => {
  const doi = "10.5555/example?name=value#part";
  const h = harness(() => response(envelope({ DOI: doi })));
  assert.equal((await h.api.lookup(doi)).ok, true);
  assert.equal(h.calls[0][0], URL_BASE + encodeURIComponent(doi));
  const other = harness(() => response());
  assert.equal((await other.api.lookup("https://doi.org/10.5555/example?tracking=secret#section")).ok, true);
  assert.equal(other.calls[0][0], URL_BASE + encodeURIComponent(DOI));
});

test("strips provider markup/entities with warnings and maps subtitle and book metadata", async () => {
  const h = harness(() => response(envelope({ type: "book", title: ["A &amp; B <i>example</i>"], subtitle: ["A subtitle"],
    author: [{ family: "Garc&#237;a", given: "Mar&iacute;a" }], "edition-number": 2,
    editor: [{ name: "Unused Editor" }] })));
  const result = await h.api.lookup(DOI);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.items[0].type, "book");
  assert.equal(result.items[0].title, "A & B example: A subtitle");
  assert.equal(result.items[0].authors[0].family, "García");
  assert.equal(result.items[0].edition, "2");
  assert.ok(result.warnings.some((issue) => issue.code === "metadata_markup_removed"));
  assert.ok(result.warnings.some((issue) => issue.code === "metadata_fields_omitted"));
});

test("missing authors/date are reviewable warnings, not fabricated metadata", async () => {
  const h = harness(() => response(envelope({ author: undefined, issued: undefined })));
  const result = await h.api.lookup(DOI);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.items[0].authors.length, 0);
  assert.equal(result.items[0].issued, null);
  assert.ok(result.warnings.some((issue) => issue.code === "metadata_incomplete"));
});

test("fifty empty author records produce unique bounded warnings with their field", async () => {
  const h = harness(() => response(envelope({ author: Array.from({ length: 50 }, () => ({ name: "" })),
    title: ["A <i>fictional</i> study"], editor: [{ name: "Unused editor" }] })));
  const result = await h.api.lookup(DOI);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.items[0].authors.length, 0);
  assert.equal(result.warnings.filter((issue) => issue.code === "metadata_incomplete" && issue.field === "authors").length, 1);
  const keys = result.warnings.map((issue) => issue.code + ":" + (issue.field || ""));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(result.warnings.length, 4);
  assert.equal(h.calls.length, 1);
});

for (const [label, message, code] of [
  ["different DOI", { DOI: "10.5555/different" }, "lookup_response_invalid"],
  ["missing DOI", { DOI: undefined }, "lookup_response_invalid"],
  ["unknown type", { type: "proceedings-article" }, "lookup_type_unsupported"],
  ["missing title", { title: [] }, "lookup_metadata_invalid"],
  ["non-array title", { title: "Title" }, "lookup_metadata_invalid"],
  ["non-array author", { author: {} }, "lookup_metadata_invalid"],
  ["too many authors", { author: Array.from({ length: 51 }, () => ({ family: "Example" })) }, "lookup_metadata_invalid"],
  ["invalid date", { issued: { "date-parts": [[2023, 2, 29]] } }, "lookup_metadata_invalid"],
  ["control characters", { title: ["A\u202eTitle"] }, "lookup_metadata_invalid"],
  ["excessive title", { title: ["x".repeat(5001)] }, "lookup_metadata_invalid"],
]) {
  test(`rejects ${label} in provider metadata`, async () => {
    const h = harness(() => response(envelope(message)));
    assert.equal(errorCode(await h.api.lookup(DOI)), code);
  });
}

for (const [status, code] of [[404, "lookup_not_found"], [429, "lookup_rate_limited"], [403, "lookup_network"], [500, "lookup_network"]]) {
  test(`handles HTTP ${status} and aborts unread response`, async () => {
    const r = response({}, { status });
    const h = harness(() => r);
    assert.equal(errorCode(await h.api.lookup(DOI)), code);
    assert.equal(r.state.reads, 0);
    assert.equal(h.calls[0][1].signal.aborted, true);
    assert.equal(h.timers.size, 0);
  });
}

test("429 retry-after is bounded and rate limiting avoids another request", async () => {
  const h = harness(() => response({}, { status: 429, headers: { "retry-after": "999999" } }));
  assert.equal(errorCode(await h.api.lookup(DOI)), "lookup_rate_limited");
  h.advance(299000);
  assert.equal(errorCode(await h.api.lookup("10.5555/other")), "lookup_rate_limited");
  assert.equal(h.calls.length, 1);
  h.advance(1100);
  assert.equal(errorCode(await h.api.lookup("10.5555/other")), "lookup_rate_limited");
  assert.equal(h.calls.length, 2, "five-minute retry window eventually permits a request");
});

for (const [label, options] of [
  ["redirected response", { redirected: true }], ["different response origin", { url: "https://example.com/data" }],
  ["HTML response", { headers: { "content-type": "text/html" } }], ["unreadable response stream", { body: null }],
]) {
  test(`rejects ${label}`, async () => {
    const r = response(envelope(), options);
    const h = harness(() => r);
    assert.equal(errorCode(await h.api.lookup(DOI)), "lookup_response_invalid");
    assert.equal(h.calls[0][1].signal.aborted, true);
  });
}

test("rejects invalid JSON and non-work response envelopes", async () => {
  for (const data of ["{bad json", [], { status: "failed" }, { ...envelope(), "message-type": "work-list" }]) {
    const h = harness(() => response(data));
    assert.equal(errorCode(await h.api.lookup(DOI)), "lookup_response_invalid");
  }
});

test("streaming handles split Unicode and rejects bad UTF-8", async () => {
  const bytes = encoder.encode(JSON.stringify(envelope({ title: ["中文 🦫"] })));
  const h = harness(() => response(null, { chunks: Array.from(bytes, (byte) => Uint8Array.of(byte)) }));
  const result = await h.api.lookup(DOI);
  assert.equal(result.ok, true);
  assert.equal(result.items[0].title, "中文 🦫");
  for (const chunks of [[Uint8Array.of(0xc3, 0x28)], [Uint8Array.of(0xe2, 0x82)]]) {
    const r = response(null, { chunks });
    const bad = harness(() => r);
    assert.equal(errorCode(await bad.api.lookup(DOI)), "lookup_response_invalid");
    assert.equal(r.state.released, 1);
    assert.equal(bad.calls[0][1].signal.aborted, true);
  }
});

test("rejects oversized declared and chunked responses before reading/allocating the rest", async () => {
  const declared = response(envelope(), { headers: { "content-length": String(2 * 1024 * 1024 + 1) } });
  const a = harness(() => declared);
  assert.equal(errorCode(await a.api.lookup(DOI)), "lookup_response_large");
  assert.equal(declared.state.reads, 0);
  assert.equal(declared.state.cancelled, 1);
  const chunked = response(null, { chunks: [new Uint8Array(1024 * 1024), new Uint8Array(1024 * 1024 + 1), encoder.encode("not read")] });
  const b = harness(() => chunked);
  assert.equal(errorCode(await b.api.lookup(DOI)), "lookup_response_large");
  assert.equal(chunked.state.reads, 2);
  assert.equal(chunked.state.cancelled, 1);
  assert.equal(chunked.state.released, 1);
});

test("timeout aborts a pending fetch and always releases the single-request slot", async () => {
  const h = harness(abortablePending);
  const pending = h.api.lookup(DOI);
  assert.equal(h.calls.length, 1);
  assert.equal([...h.timers.values()][0].delay, 15000);
  h.timeout();
  assert.equal(errorCode(await pending), "lookup_timeout");
  assert.equal(h.timers.size, 0);
  h.advance();
  h.context.fetch = async () => response();
  assert.equal((await h.api.lookup(DOI)).ok, true);
});

test("pre-abort sends no request; active user abort is distinguished from timeout", async () => {
  const pre = new AbortController(); pre.abort();
  const a = harness(abortablePending);
  assert.equal(errorCode(await a.api.lookup(DOI, { signal: pre.signal })), "lookup_cancelled");
  assert.equal(a.calls.length, 0);
  const active = new AbortController();
  const b = harness(abortablePending);
  const pending = b.api.lookup(DOI, { signal: active.signal });
  active.abort();
  assert.equal(errorCode(await pending), "lookup_cancelled");
  assert.equal(b.timers.size, 0);
});

for (const timedOut of [false, true]) {
  test(`${timedOut ? "timeout" : "user cancellation"} while streaming aborts body read and releases lock`, async () => {
    let released = 0;
    let reading = false;
    const signal = new AbortController();
    const h = harness((_url, options) => ({
      ...response(), body: { getReader() { return {
        read() {
          reading = true;
          return new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          });
        },
        releaseLock() { released += 1; },
      }; } },
    }));
    const pending = h.api.lookup(DOI, { signal: signal.signal });
    // The controlled fetch settles in a microtask, then readBounded begins.
    for (let attempt = 0; attempt < 10 && !reading; attempt += 1) await Promise.resolve();
    assert.equal(reading, true);
    if (timedOut) h.timeout(); else signal.abort();
    assert.equal(errorCode(await pending), timedOut ? "lookup_timeout" : "lookup_cancelled");
    assert.equal(released, 1);
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls[0][1].signal.aborted, true);
  });
}

test("successful cache cannot bypass an already-aborted caller signal", async () => {
  const h = harness(() => response());
  assert.equal((await h.api.lookup(DOI)).ok, true);
  const controller = new AbortController(); controller.abort();
  assert.equal(errorCode(await h.api.lookup(DOI, { signal: controller.signal })), "lookup_cancelled");
  assert.equal(h.calls.length, 1);
});

test("only one request may be pending and a completed request enforces pacing", async () => {
  let resolve;
  const h = harness(() => new Promise((done) => { resolve = done; }));
  const first = h.api.lookup(DOI);
  assert.equal(errorCode(await h.api.lookup("10.5555/second")), "lookup_busy");
  assert.equal(h.calls.length, 1);
  resolve(response());
  assert.equal((await first).ok, true);
  assert.equal(errorCode(await h.api.lookup("10.5555/second")), "lookup_rate_limited");
  assert.equal(h.calls.length, 1);
});

test("cache canonicalizes DOI case, returns defensive copies and does not cache failures", async () => {
  const h = harness(() => response());
  const first = await h.api.lookup(DOI);
  first.items[0].title = "Changed";
  first.items[0].authors[0].family = "Changed";
  const cached = await h.api.lookup("https://doi.org/10.5555/EXAMPLE");
  assert.equal(cached.ok, true);
  assert.equal(cached.items[0].title, "A fictional study");
  assert.equal(cached.items[0].authors[0].family, "Example");
  assert.equal(h.calls.length, 1);
  const bad = harness(() => response({}, { status: 404 }));
  assert.equal(errorCode(await bad.api.lookup(DOI)), "lookup_not_found");
  bad.advance();
  assert.equal(errorCode(await bad.api.lookup(DOI)), "lookup_not_found");
  assert.equal(bad.calls.length, 2);
});

test("cache has a bounded capacity and evicts the oldest successful lookup", async () => {
  const h = harness((url) => response(envelope({ DOI: decodeURIComponent(url.slice(URL_BASE.length)) })));
  for (let index = 0; index < 41; index += 1) {
    h.advance();
    assert.equal((await h.api.lookup("10.5555/item" + index)).ok, true);
  }
  assert.equal(h.calls.length, 41);
  h.advance();
  assert.equal((await h.api.lookup("10.5555/item40")).ok, true);
  assert.equal(h.calls.length, 41);
  assert.equal((await h.api.lookup("10.5555/item0")).ok, true);
  assert.equal(h.calls.length, 42);
});

test("network failure is a structured result and leaves no timer", async () => {
  const h = harness(async () => { throw new TypeError("Synthetic network failure"); });
  assert.equal(errorCode(await h.api.lookup(DOI)), "lookup_network");
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls[0][1].signal.aborted, true);
});
