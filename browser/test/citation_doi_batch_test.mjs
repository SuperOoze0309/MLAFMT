// DOI batch coordinator tests. All lookups are injected fakes; timers and the
// clock are virtualized so no network, production storage or real delay is used.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const librarySource = fs.readFileSync(path.join(root, "static/citation-library.js"), "utf8");
const lookupSource = fs.readFileSync(path.join(root, "static/citation-lookup.js"), "utf8");
const batchSource = fs.readFileSync(path.join(root, "static/citation-doi-batch.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async (rounds = 12) => {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
};

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  class FakeDate extends Date {
    static now() { return now; }
  }
  function setTimeoutFake(fn, delay) {
    const id = ++nextId;
    timers.set(id, { fn, due: now + Number(delay) });
    return id;
  }
  function clearTimeoutFake(id) {
    timers.delete(id);
  }
  return {
    Date: FakeDate,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    timers,
    now() { return now; },
    pending() { return timers.size; },
    advance(ms) {
      const target = now + ms;
      while (true) {
        let nextId = null;
        let next = null;
        for (const [id, timer] of timers) {
          if (timer.due <= target && (!next || timer.due < next.due)) {
            nextId = id;
            next = timer;
          }
        }
        if (!next) break;
        now = next.due;
        timers.delete(nextId);
        next.fn();
      }
      now = target;
    },
  };
}

function harness({ loadLookup = true, loadModel = true } = {}) {
  const clock = fakeClock();
  const fetchCalls = [];
  const context = vm.createContext({
    console,
    URL,
    TextEncoder,
    TextDecoder,
    AbortController,
    performance: undefined,
    Date: clock.Date,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    fetch: (...args) => {
      fetchCalls.push(args);
      throw new TypeError("network is forbidden in DOI batch tests");
    },
  });
  if (loadModel) vm.runInContext(librarySource, context);
  if (loadLookup) vm.runInContext(lookupSource, context);
  vm.runInContext(batchSource, context);
  const api = context.FormCapyDoiBatch;
  const model = context.FormCapyCitations;
  function item(doi, title = "Fictional DOI record") {
    return model.createItem({
      type: "article-journal",
      title,
      authors: [{ family: "Example", given: "Ana" }],
      issued: { year: 2024 },
      DOI: doi,
    });
  }
  function success(doi, title, warnings = []) {
    return { ok: true, items: [item(doi, title)], warnings, errors: [] };
  }
  function failure(code) {
    return { ok: false, items: [], warnings: [], errors: [{ code }] };
  }
  function recorder(handler) {
    const calls = [];
    const lookup = {
      calls,
      lookup(doi, options = {}) {
        calls.push({ doi, at: clock.now(), signal: options.signal });
        return handler(doi, calls.length - 1, options.signal);
      },
    };
    return lookup;
  }
  return { api, context, model, clock, fetchCalls, item, success, failure, recorder };
}

function rows(text, h) {
  return h.api.parse(text).rows;
}

test("parse is side-effect free and reports normalized, invalid and duplicate rows", () => {
  const h = harness();
  const text = "\n10.5555/Alpha\ndoi:10.5555/alpha\nhttps://doi.org/10.5555%2FALPHA\nnot-a-doi\n";
  const result = h.api.parse(text);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(result.errors), []);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(plain(result.rows[0]), {
    line: 2, input: "10.5555/Alpha", doi: "10.5555/Alpha", status: "ready", errors: [],
  });
  assert.equal(result.rows[1].status, "duplicate");
  assert.equal(result.rows[1].duplicateOf, 2);
  assert.equal(result.rows[1].doi, "10.5555/alpha");
  assert.equal(result.rows[2].status, "duplicate");
  assert.equal(result.rows[2].duplicateOf, 2);
  assert.equal(result.rows[3].line, 5);
  assert.equal(result.rows[3].input, "not-a-doi");
  assert.equal(result.rows[3].doi, null);
  assert.equal(result.rows[3].status, "invalid");
  assert.deepEqual(plain(result.rows[3].errors), [{ code: "doi_invalid" }]);
  assert.equal(h.fetchCalls.length, 0);
  assert.equal(h.api.parse("").ok, true);
  assert.deepEqual(plain(h.api.parse("").rows), []);
  assert.equal(h.api.parse("  \n \r\n").rows.length, 0);
  assert.equal(h.fetchCalls.length, 0);
});

test("parse enforces 50 nonempty lines and 32 KiB UTF-8 exactly", () => {
  const h = harness();
  const fifty = Array.from({ length: 50 }, (_, index) => "10.5555/item" + index).join("\n");
  const allowed = h.api.parse(fifty);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.rows.length, 50);
  assert.equal(allowed.rows[49].status, "ready");
  const tooMany = h.api.parse(fifty + "\n10.5555/extra");
  assert.equal(tooMany.ok, false);
  assert.deepEqual(plain(tooMany.rows), []);
  assert.equal(tooMany.errors[0].code, "too_many_lines");
  assert.equal(tooMany.errors[0].limitLines, 50);

  const base = "10.5555/limit";
  const exact = base + "\n".repeat(h.api.MAX_BYTES - base.length);
  assert.equal(new TextEncoder().encode(exact).length, h.api.MAX_BYTES);
  const exactParsed = h.api.parse(exact);
  assert.equal(exactParsed.ok, true);
  assert.equal(exactParsed.rows.length, 1);
  assert.equal(exactParsed.rows[0].doi, base);
  const over = h.api.parse(exact + "\n");
  assert.equal(over.ok, false);
  assert.equal(over.errors[0].code, "input_too_large");
  assert.equal(over.errors[0].limitBytes, h.api.MAX_BYTES);
  assert.equal(h.api.parse(null).errors[0].code, "input_invalid");
});

test("a mixed batch requests only valid unique rows, in source order", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/one\nbad\n10.5555/ONE\n10.5555/two");
  const before = JSON.stringify(parsed.rows);
  const lookup = h.recorder((doi) => h.success(doi, "Fictional " + doi));
  const running = h.api.run(parsed.rows, { lookup });
  await flush();
  assert.equal(lookup.calls.length, 1);
  h.clock.advance(h.api.MIN_INTERVAL_MS);
  await flush();
  const result = await running;
  assert.equal(JSON.stringify(parsed.rows), before, "run must not mutate the caller's rows");
  assert.deepEqual(Object.keys(result).sort(), ["cancelled", "completed", "failed", "items", "rateLimited", "rows"]);
  assert.deepEqual(lookup.calls.map((call) => call.doi), ["10.5555/one", "10.5555/two"]);
  assert.equal(result.rows[0].status, "success");
  assert.equal(result.rows[1].status, "invalid");
  assert.equal(result.rows[2].status, "duplicate");
  assert.equal(result.rows[3].status, "success");
  assert.equal(result.completed, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.items.length, 2);
  assert.equal(h.fetchCalls.length, 0);
  assert.equal(h.clock.pending(), 0);
});

test("empty and all-invalid batches produce no requests", async () => {
  const h = harness();
  const lookup = h.recorder(() => { throw new Error("must not request"); });
  const empty = await h.api.run([], { lookup });
  assert.equal(empty.completed, 0);
  assert.equal(lookup.calls.length, 0);
  const invalid = h.api.parse("not-a-doi\n10.123/no").rows;
  const result = await h.api.run(invalid, { lookup });
  assert.equal(result.completed, 0);
  assert.equal(result.failed, 0);
  assert.equal(lookup.calls.length, 0);
  assert.equal(result.rows.every((row) => row.status === "invalid"), true);
  assert.equal(h.fetchCalls.length, 0);
  assert.equal(h.clock.pending(), 0);
});

test("query starts are sequential and at least 1300 ms apart", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/a\n10.5555/b\n10.5555/c");
  const lookup = h.recorder((doi) => h.success(doi));
  const running = h.api.run(parsed.rows, { lookup });
  await flush();
  assert.equal(lookup.calls.length, 1);
  assert.equal(lookup.calls[0].at, 0);
  h.clock.advance(1299);
  await flush();
  assert.equal(lookup.calls.length, 1);
  h.clock.advance(1);
  await flush();
  assert.equal(lookup.calls.length, 2);
  assert.equal(lookup.calls[1].at, 1300);
  h.clock.advance(1300);
  await flush();
  assert.equal(lookup.calls.length, 3);
  assert.equal(lookup.calls[2].at, 2600);
  const result = await running;
  assert.equal(result.completed, 3);
  assert.equal(result.items.length, 3);
  assert.equal(h.api.MIN_INTERVAL_MS, 1300);
  assert.equal(h.clock.pending(), 0);
});

test("only one lookup may be in flight at a time", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/first\n10.5555/second");
  const calls = [];
  let release;
  const lookup = {
    lookup(doi) {
      calls.push({ doi, at: h.clock.now() });
      if (calls.length === 1) return new Promise((resolve) => { release = resolve; });
      return h.success(doi);
    },
  };
  const running = h.api.run(parsed.rows, { lookup });
  await flush();
  assert.equal(calls.length, 1);
  h.clock.advance(5000);
  await flush();
  assert.equal(calls.length, 1);
  release(h.success("10.5555/first"));
  await flush();
  assert.equal(calls.length, 2);
  const result = await running;
  assert.equal(result.completed, 2);
  assert.equal(calls[1].at - calls[0].at >= h.api.MIN_INTERVAL_MS, true);
  assert.equal(h.clock.pending(), 0);
});

test("cancellation aborts the active lookup immediately, ignores its late result/rejection and leaves later rows ready", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/first\n10.5555/second\n10.5555/third");
  let release;
  let rejectLate;
  let requestSignal;
  const lookup = {
    lookup(_doi, { signal }) {
      requestSignal = signal;
      return new Promise((resolve, reject) => { release = resolve; rejectLate = reject; });
    },
  };
  const controller = new AbortController();
  const running = h.api.run(parsed.rows, { lookup, signal: controller.signal });
  await flush();
  assert.equal(requestSignal.aborted, false);
  controller.abort();
  const result = await running;
  assert.equal(result.cancelled, true);
  assert.equal(result.rateLimited, false);
  assert.equal(result.completed, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.rows[0].status, "cancelled");
  assert.deepEqual(plain(result.rows[0].errors), [{ code: "lookup_cancelled" }]);
  assert.equal(result.rows[1].status, "ready");
  assert.equal(result.rows[2].status, "ready");
  assert.equal(requestSignal.aborted, true);
  assert.equal(h.clock.pending(), 0);
  release(h.success("10.5555/first"));
  await flush();
  rejectLate(new Error("late rejection"));
  await flush();
  assert.equal(result.rows[0].status, "cancelled");
  assert.equal(result.items.length, 0);
});

test("cancellation during the pacing delay resolves immediately and starts nothing else", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/first\n10.5555/second");
  const lookup = h.recorder((doi) => h.success(doi));
  const controller = new AbortController();
  const running = h.api.run(parsed.rows, { lookup, signal: controller.signal });
  await flush();
  assert.equal(lookup.calls.length, 1);
  assert.equal(h.clock.pending(), 1);
  controller.abort();
  const result = await running;
  assert.equal(result.cancelled, true);
  assert.equal(result.completed, 1);
  assert.equal(result.rows[0].status, "success");
  assert.equal(result.rows[1].status, "ready");
  assert.equal(lookup.calls.length, 1);
  assert.equal(h.clock.pending(), 0);
});

test("pre-aborted cancellation starts no request", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/first");
  const lookup = h.recorder(() => h.success("10.5555/first"));
  const controller = new AbortController();
  controller.abort();
  const result = await h.api.run(parsed.rows, { lookup, signal: controller.signal });
  assert.equal(result.cancelled, true);
  assert.equal(result.rows[0].status, "ready");
  assert.equal(lookup.calls.length, 0);
  assert.equal(h.clock.pending(), 0);
});

test("rate limiting stops without retry, and a later explicit run resumes ready rows", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/first\n10.5555/second\n10.5555/third");
  const lookup = h.recorder((doi, index) => index === 0 ? h.failure("lookup_rate_limited") : h.success(doi));
  const running = h.api.run(parsed.rows, { lookup });
  const first = await running;
  assert.equal(first.rateLimited, true);
  assert.equal(first.failed, 1);
  assert.equal(first.completed, 0);
  assert.equal(first.rows[0].status, "failed");
  assert.deepEqual(plain(first.rows[0].errors), [{ code: "lookup_rate_limited" }]);
  assert.equal(first.rows[1].status, "ready");
  assert.equal(first.rows[2].status, "ready");
  assert.equal(lookup.calls.length, 1);
  assert.equal(h.clock.pending(), 0);

  const resumedLookup = h.recorder((doi) => h.success(doi));
  const resumedRunning = h.api.run(first.rows, { lookup: resumedLookup });
  await flush();
  assert.equal(resumedLookup.calls.length, 1);
  h.clock.advance(h.api.MIN_INTERVAL_MS);
  const resumed = await resumedRunning;
  assert.equal(resumedLookup.calls.length, 2);
  assert.equal(resumed.rateLimited, false);
  assert.equal(resumed.completed, 2);
  assert.equal(resumed.failed, 1);
  assert.equal(resumed.items.length, 2);
  assert.equal(resumed.rows[0].status, "failed");
  assert.equal(resumed.rows[1].status, "success");
  assert.equal(resumed.rows[2].status, "success");
});

test("ordinary failure continues after pacing and preserves later successes", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/missing\n10.5555/found");
  const lookup = h.recorder((doi, index) => index === 0 ? h.failure("lookup_not_found") : h.success(doi));
  const running = h.api.run(parsed.rows, { lookup });
  await flush();
  assert.equal(lookup.calls.length, 1);
  h.clock.advance(h.api.MIN_INTERVAL_MS);
  const result = await running;
  assert.equal(lookup.calls.length, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.rows[0].status, "failed");
  assert.deepEqual(plain(result.rows[0].errors), [{ code: "lookup_not_found" }]);
  assert.equal(result.rows[1].status, "success");
  assert.equal(result.items[0].DOI, "10.5555/found");
});

test("multiple successes retain every item and report provider warning codes", async () => {
  const h = harness();
  const parsed = h.api.parse("10.5555/a\n10.5555/b\n10.5555/c");
  const lookup = h.recorder((doi, index) => {
    if (index === 1) return h.failure("lookup_network");
    return h.success(doi, "Fictional " + doi, [{ code: "metadata_incomplete" }, { code: "metadata_fields_omitted" }]);
  });
  const running = h.api.run(parsed.rows, { lookup });
  await flush();
  h.clock.advance(h.api.MIN_INTERVAL_MS);
  await flush();
  h.clock.advance(h.api.MIN_INTERVAL_MS);
  const result = await running;
  assert.equal(result.completed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.items.length, 2);
  assert.deepEqual(plain(result.rows[0].warnings), [
    { code: "metadata_incomplete" }, { code: "metadata_fields_omitted" },
  ]);
  assert.equal(result.rows[1].status, "failed");
  assert.equal(result.rows[2].status, "success");
});

test("malformed and unmatched provider responses fail rows instead of being accepted", async () => {
  const cases = [
    ["non-object response", () => null, "lookup_response_invalid"],
    ["empty items", () => ({ ok: true, items: [], warnings: [], errors: [] }), "lookup_items_invalid"],
    ["non-array items", () => ({ ok: true, items: {}, warnings: [], errors: [] }), "lookup_items_invalid"],
    ["missing warnings", (h) => ({ ok: true, items: [h.item("10.5555/x")], errors: [] }), "lookup_response_invalid"],
    ["malformed warnings", (h) => ({ ok: true, items: [h.item("10.5555/x")], warnings: "bad", errors: [] }), "lookup_response_invalid"],
    ["success errors", (h) => ({ ok: true, items: [h.item("10.5555/x")], warnings: [], errors: [{ code: "x" }] }), "lookup_response_invalid"],
    ["mismatched DOI", (h) => ({ ok: true, items: [h.item("10.5555/other")], warnings: [], errors: [] }), "lookup_doi_mismatch"],
    ["invalid model item", (h) => ({ ok: true, items: [{ ...h.item("10.5555/x"), title: "" }], warnings: [], errors: [] }), "lookup_item_invalid"],
    ["malformed failure errors", () => ({ ok: false, items: [], warnings: [], errors: "bad" }), "lookup_response_invalid"],
    ["empty failure errors", () => ({ ok: false, items: [], warnings: [], errors: [] }), "lookup_response_invalid"],
    ["provider not found", () => ({ ok: false, items: [], warnings: [], errors: [{ code: "lookup_not_found" }] }), "lookup_not_found"],
  ];
  for (const [label, makePayload, code] of cases) {
    const h = harness();
    const lookup = h.recorder(() => makePayload(h));
    const result = await h.api.run(h.api.parse("10.5555/x").rows, { lookup });
    assert.equal(result.rows[0].status, "failed", label);
    assert.deepEqual(plain(result.rows[0].errors), [{ code }], label);
    assert.equal(result.failed, 1, label);
    assert.equal(h.clock.pending(), 0, label);
  }
});

test("a thrown lookup is an ordinary structured failure and is not retried", async () => {
  const h = harness();
  const lookup = h.recorder(() => { throw new Error("synthetic failure"); });
  const result = await h.api.run(h.api.parse("10.5555/x").rows, { lookup });
  assert.equal(result.rows[0].status, "failed");
  assert.deepEqual(plain(result.rows[0].errors), [{ code: "lookup_failed" }]);
  assert.equal(lookup.calls.length, 1);
  assert.equal(h.clock.pending(), 0);
});

test("a thrown rate-limit signal stops the batch without retry", async () => {
  const h = harness();
  const lookup = h.recorder(() => {
    const error = new Error("provider rate limit");
    error.code = "lookup_rate_limited";
    throw error;
  });
  const result = await h.api.run(h.api.parse("10.5555/a\n10.5555/b").rows, { lookup });
  assert.equal(result.rateLimited, true);
  assert.equal(result.failed, 1);
  assert.equal(result.rows[0].status, "failed");
  assert.deepEqual(plain(result.rows[0].errors), [{ code: "lookup_rate_limited" }]);
  assert.equal(result.rows[1].status, "ready");
  assert.equal(lookup.calls.length, 1);
  assert.equal(h.clock.pending(), 0);
});

test("progress snapshots are fresh and cannot mutate internal rows/items", async () => {
  const h = harness();
  const snapshots = [];
  const lookup = h.recorder((doi) => h.success(doi, "Progress record"));
  const running = h.api.run(h.api.parse("10.5555/progress").rows, {
    lookup,
    onProgress(snapshot) {
      snapshots.push(snapshot);
      if (snapshots.length === 1) {
        snapshot.rows[0].status = "mutated";
        snapshot.items.push("not an item");
      }
    },
  });
  const result = await running;
  assert.equal(snapshots.length >= 2, true);
  for (const snapshot of snapshots) {
    assert.deepEqual(Object.keys(snapshot).sort(), ["cancelled", "completed", "failed", "items", "rateLimited", "rows"]);
  }
  assert.notEqual(snapshots[0], snapshots[1]);
  assert.equal(result.rows[0].status, "success");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "Progress record");
  snapshots.at(-1).rows[0].status = "also mutated";
  assert.equal(result.rows[0].status, "success");
});

test("callback exceptions and rejected progress promises do not break the run or leave timers", async () => {
  const h = harness();
  const lookup = h.recorder((doi) => h.success(doi));
  const throwing = await h.api.run(h.api.parse("10.5555/a").rows, {
    lookup,
    onProgress() { throw new Error("progress callback failed"); },
  });
  assert.equal(throwing.completed, 1);
  assert.equal(throwing.items.length, 1);
  assert.equal(h.clock.pending(), 0);

  const h2 = harness();
  const lookup2 = h2.recorder((doi) => h.success(doi));
  const rejecting = await h2.api.run(h2.api.parse("10.5555/b").rows, {
    lookup: lookup2,
    onProgress() { return Promise.reject(new Error("async progress failure")); },
  });
  await flush();
  assert.equal(rejecting.completed, 1);
  assert.equal(h2.clock.pending(), 0);
});

test("abort listeners and timers are released after completion", async () => {
  const h = harness();
  const listeners = new Set();
  const signal = {
    aborted: false,
    addEventListener(type, handler) { if (type === "abort") listeners.add(handler); },
    removeEventListener(type, handler) { if (type === "abort") listeners.delete(handler); },
  };
  const lookup = h.recorder((doi) => h.success(doi));
  const result = await h.api.run(h.api.parse("10.5555/listener").rows, {
    lookup, signal,
    onProgress() { throw new Error("callback failure"); },
  });
  assert.equal(result.completed, 1);
  assert.equal(listeners.size, 0);
  assert.equal(h.clock.pending(), 0);
});

test("run revalidates rows, bounds, and the lookup dependency without requesting", async () => {
  const h = harness();
  const lookup = h.recorder(() => { throw new Error("must not request"); });
  const badRows = await h.api.run(null, { lookup });
  assert.equal(badRows.errors[0].code, "rows_invalid");
  assert.equal(lookup.calls.length, 0);

  const many = Array.from({ length: 51 }, (_, index) => ({
    line: index + 1, input: "10.5555/x" + index, doi: null, status: "ready", errors: [],
  }));
  const tooMany = await h.api.run(many, { lookup });
  assert.equal(tooMany.errors[0].code, "rows_invalid");
  assert.equal(lookup.calls.length, 0);

  const huge = await h.api.run([{ line: 1, input: "x".repeat(h.api.MAX_BYTES + 1), status: "ready", errors: [] }], { lookup });
  assert.equal(huge.errors[0].code, "input_too_large");
  assert.equal(lookup.calls.length, 0);

  const invalidRow = await h.api.run([{ line: 1, input: "not-a-doi", status: "ready", errors: [] }], { lookup });
  assert.equal(invalidRow.rows[0].status, "invalid");
  assert.equal(lookup.calls.length, 0);

  const duplicateRows = await h.api.run([
    { line: 1, input: "10.5555/same", status: "ready", errors: [] },
    { line: 2, input: "DOI:10.5555/SAME", status: "ready", errors: [] },
  ], { lookup: h.recorder((doi) => h.success(doi)) });
  assert.equal(duplicateRows.rows[0].status, "success");
  assert.equal(duplicateRows.rows[1].status, "duplicate");
  assert.equal(duplicateRows.rows[1].duplicateOf, 1);

  const unavailable = await h.api.run(h.api.parse("10.5555/ready").rows, { lookup: {} });
  assert.equal(unavailable.errors[0].code, "lookup_unavailable");
  assert.equal(unavailable.rows[0].status, "ready");
});

test("a successful row with malformed stored terminal data is revalidated, not trusted", async () => {
  const h = harness();
  const rowsWithStaleSuccess = [{
    line: 1,
    input: "10.5555/stale",
    doi: "10.5555/stale",
    status: "success",
    items: [],
    warnings: [],
    errors: [],
  }];
  const lookup = h.recorder((doi) => h.success(doi));
  const result = await h.api.run(rowsWithStaleSuccess, { lookup });
  assert.equal(lookup.calls.length, 1);
  assert.equal(result.rows[0].status, "success");
  assert.equal(result.completed, 1);
});

test("resumed items follow source row order even when a later row was already successful", async () => {
  const h = harness();
  const second = h.item("10.5555/second", "Second fictional record");
  const inputRows = [
    { line: 1, input: "10.5555/first", status: "ready", errors: [] },
    {
      line: 2, input: "10.5555/second", doi: "10.5555/second", status: "success",
      items: [second], warnings: [], errors: [],
    },
  ];
  const lookup = h.recorder(() => h.success("10.5555/first", "First fictional record"));
  const result = await h.api.run(inputRows, { lookup });
  assert.equal(lookup.calls.length, 1);
  assert.equal(result.completed, 2);
  assert.equal(result.items.length, 2);
  assert.deepEqual(plain(result.items.map((item) => item.title)), ["First fictional record", "Second fictional record"]);
});

test("parse and run make no network calls; batch resolution can be unavailable explicitly", async () => {
  const h = harness();
  h.api.parse("10.5555/x\nbad");
  assert.equal(h.fetchCalls.length, 0);
  const noLookup = harness({ loadLookup: false });
  assert.equal(noLookup.api.parse("10.5555/x").ok, false);
  assert.equal(noLookup.api.parse("10.5555/x").errors[0].code, "normalizer_unavailable");
  const runResult = await noLookup.api.run([], {});
  assert.equal(runResult.errors[0].code, "normalizer_unavailable");
});

test("CommonJS export exposes the same dependency-free API", () => {
  const common = require(path.join(root, "static/citation-doi-batch.js"));
  assert.equal(common.MAX_LINES, 50);
  assert.equal(common.MAX_BYTES, 32768);
  assert.equal(common.MIN_INTERVAL_MS, 1300);
  const parsed = common.parse("10.5555/commonjs");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows[0].status, "ready");
  assert.equal(parsed.rows[0].doi, "10.5555/commonjs");
});

test("real lookup metadata with fifty empty authors remains a successful batch record", async () => {
  const h = harness();
  const doi = "10.5555/empty-authors";
  h.context.fetch = async (url, options) => {
    h.fetchCalls.push([url, options]);
    const response = new Response(JSON.stringify({ status: "ok", "message-type": "work", message: {
      DOI: doi, type: "journal-article", title: ["A fictional empty-author record"],
      author: Array.from({ length: 50 }, () => ({ name: "" })),
      issued: { "date-parts": [[2024]] }, "container-title": ["Fictional Journal"],
    } }), { status: 200, headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "url", { value: "https://api.crossref.org/works/" + encodeURIComponent(doi) });
    return response;
  };
  const result = await h.api.run(h.api.parse(doi).rows, { lookup: h.context.FormCapyCitationLookup });
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.rows[0].status, "success");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].authors.length, 0);
  assert.deepEqual(plain(result.rows[0].warnings), [
    { code: "metadata_incomplete", field: "authors" }, { code: "metadata_incomplete" },
  ]);
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(h.clock.pending(), 0);
  const resumed = await h.api.run(result.rows, { lookup: h.context.FormCapyCitationLookup });
  assert.equal(resumed.completed, 1);
  assert.deepEqual(plain(resumed.rows[0].warnings), plain(result.rows[0].warnings));
  assert.equal(h.fetchCalls.length, 1, "a valid stored success does not request again");
});

test("batch warning fields are allowlisted and error fields remain stripped", async () => {
  const h = harness();
  const warnings = [
    { code: "metadata_incomplete", field: "authors", note: "not retained" },
    { code: "metadata_incomplete", field: "publisher" },
    { code: "metadata_incomplete", field: "<img src=x onerror=alert(1)>" },
    { code: "metadata_incomplete", field: "x".repeat(5000) },
    { code: "metadata_incomplete", field: "__proto__" },
    { code: "metadata_incomplete", field: { unexpected: true } },
  ];
  const result = await h.api.run(h.api.parse("10.5555/fields").rows, {
    lookup: h.recorder((doi) => h.success(doi, undefined, warnings)),
  });
  assert.equal(result.completed, 1);
  assert.deepEqual(plain(result.rows[0].warnings), [
    { code: "metadata_incomplete", field: "authors" },
    { code: "metadata_incomplete", field: "publisher" },
    ...Array.from({ length: 4 }, () => ({ code: "metadata_incomplete" })),
  ]);
  const failure = await h.api.run(h.api.parse("10.5555/error-fields").rows, {
    lookup: h.recorder(() => ({ ok: false, items: [], warnings: [], errors: [
      { code: "lookup_network", field: "authors", detail: "not retained" },
    ] })),
  });
  assert.deepEqual(plain(failure.rows[0].errors), [{ code: "lookup_network" }]);
});
