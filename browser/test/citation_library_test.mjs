// Pure Node tests for the local citation library model.
// Uses the production static/citation-library.js in a VM; no DOM, network or
// user documents are involved.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "static/citation-library.js"), "utf8");
const context = vm.createContext({ TextEncoder, URL, console });
vm.runInContext(source, context);
const M = context.FormCapyCitations;

const item = (overrides = {}) => M.createItem({
  title: "A fictional source",
  authors: [{ family: "Example", given: "Ana" }],
  issued: { year: 2024 },
  ...overrides,
});
const raw = (overrides = {}) => ({ ...item(), ...overrides });
const plain = (value) => JSON.parse(JSON.stringify(value));
const library = (items) => ({ schema: M.SCHEMA, v: M.VERSION, items });

test("exports a stable schema and limits", () => {
  assert.equal(M.SCHEMA, "formcapy-citations");
  assert.equal(M.VERSION, 1);
  assert.deepEqual([...M.TYPES], ["book", "article-journal", "webpage"]);
  assert.equal(M.MAX_ITEMS, 200);
  assert.equal(M.MAX_AUTHORS, 50);
  assert.equal(M.MAX_FIELD, 5000);
  assert.equal(M.MAX_ORIGINAL, 10000);
  assert.equal(M.MAX_JSON_BYTES, 1048576);
});

test("creates a complete item, preserves Unicode, and roundtrips exactly", () => {
  const created = item({
    title: "Étude 中文 🦫 — café",
    authors: [
      { family: "García", given: "María" },
      { literal: "Example Research Group" },
    ],
    issued: { year: 2024, month: 2, day: 29 },
    publisher: "Éditions Exemple",
    language: "es",
    originalText: "Étude 中文 🦫\nSecond line",
  });
  assert.equal(created.title, "Étude 中文 🦫 — café");
  assert.deepEqual(plain(created.authors), [
    { family: "García", given: "María" },
    { literal: "Example Research Group" },
  ]);
  const lib = library([created]);
  assert.equal(M.validateLibrary(lib).valid, true);
  const text = M.stringifyLibrary(lib);
  const parsed = M.parseLibraryJson(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(plain(parsed.library), plain(lib));
  assert.equal(parsed.library.items[0].originalText, "Étude 中文 🦫\nSecond line");
});

test("maps only entered metadata to CSL and never fabricates authors or dates", () => {
  const minimal = item({ title: "Untitled source", authors: [], issued: null, DOI: "", URL: "" });
  const csl = M.toCslItems(library([minimal]))[0];
  assert.equal(csl.title, "Untitled source");
  assert.equal(csl.author, undefined);
  assert.equal(csl.issued, undefined);
  assert.equal(csl.DOI, undefined);
  assert.equal(csl.URL, undefined);
  const warnings = M.validateItem(minimal).warnings.map((issue) => issue.code);
  assert.ok(warnings.includes("author_missing"));
  assert.ok(warnings.includes("year_missing"));
  const noAuthorField = raw();
  delete noAuthorField.authors;
  const noAuthorValidation = M.validateItem(noAuthorField);
  assert.equal(noAuthorValidation.valid, true);
  assert.ok(noAuthorValidation.warnings.some((issue) => issue.code === "author_missing"));
});

test("keeps ordered multiple and literal authors", () => {
  const created = item({
    authors: [
      { family: "Zulu", given: "Zoé" },
      { literal: "Example Institute" },
      { family: "Alpha", given: "Ana" },
    ],
    issued: { year: 2020, month: 5 },
  });
  const csl = M.toCslItems(library([created]))[0];
  assert.deepEqual(plain(csl.author), [
    { family: "Zulu", given: "Zoé" },
    { literal: "Example Institute" },
    { family: "Alpha", given: "Ana" },
  ]);
  assert.deepEqual(plain(csl.issued["date-parts"]), [[2020, 5]]);
});

test("supports partial dates and validates leap days", () => {
  assert.deepEqual(plain(M.toCslItems(library([item({ issued: { year: 2024 } })]))[0].issued["date-parts"]), [[2024]]);
  assert.deepEqual(plain(M.toCslItems(library([item({ issued: { year: 2024, month: 2 } })]))[0].issued["date-parts"]), [[2024, 2]]);
  assert.equal(M.validateItem(item({ issued: { year: 2024, month: 2, day: 29 } })).valid, true);
  assert.equal(M.validateItem(raw({ issued: { year: 2023, month: 2, day: 29 } })).valid, false);
  assert.equal(M.validateItem(raw({ issued: { year: 2024, month: 2, day: 30 } })).valid, false);
  assert.equal(M.validateItem(raw({ issued: { year: 2024, day: 2 } })).valid, false);
  assert.equal(M.validateItem(raw({ issued: { month: 2 } })).valid, false);
  assert.equal(M.validateItem(raw({ issued: { year: 2024, month: 13 } })).valid, false);
});

test("validates type-specific fields and missing-field warnings", () => {
  assert.ok(M.validateItem(item({ type: "book", publisher: "" })).warnings.some((issue) => issue.code === "publisher_missing"));
  assert.ok(M.validateItem(item({ type: "article-journal", containerTitle: "" })).warnings.some((issue) => issue.code === "container_missing"));
  const webpage = item({ type: "webpage", containerTitle: "", URL: "", accessed: null });
  const warnings = M.validateItem(webpage).warnings.map((issue) => issue.code);
  assert.ok(warnings.includes("container_missing"));
  assert.ok(warnings.includes("url_missing"));
  assert.ok(warnings.includes("accessed_missing"));
  assert.equal(M.validateItem(item({ title: "   " })).valid, false);
});

test("warns about unusual DOI but never fetches or rewrites it", () => {
  const created = item({ DOI: "not-a-doi" });
  const validation = M.validateItem(created);
  assert.equal(validation.valid, true);
  assert.ok(validation.warnings.some((issue) => issue.code === "doi_format"));
  assert.equal(M.toCslItems(library([created]))[0].DOI, "not-a-doi");
});

test("rejects unsafe URLs and invalid date/author structures", () => {
  assert.equal(M.validateItem(raw({ URL: "javascript:alert(1)" })).valid, false);
  assert.equal(M.validateItem(raw({ URL: "https://example.test/a b" })).valid, false);
  assert.equal(M.validateItem(raw({ URL: "https://user:secret@example.test/" })).valid, false);
  assert.equal(M.validateItem(raw({ authors: [{ literal: "Org", family: "Wrong" }] })).valid, false);
  assert.equal(M.validateItem(raw({ authors: [{ family: "" }] })).valid, false);
  assert.equal(M.validateItem(raw({ authors: [{ family: "A", extra: "x" }] })).valid, false);
  assert.equal(M.validateItem(raw({ issued: { year: 2024, extra: 1 } })).valid, false);
});

test("rejects control characters, unpaired surrogates and oversized text", () => {
  assert.equal(M.validateItem(raw({ title: "bad\u0000title" })).valid, false);
  assert.equal(M.validateItem(raw({ title: "bad\uD800title" })).valid, false);
  assert.equal(M.validateItem(raw({ title: "x".repeat(M.MAX_FIELD + 1) })).valid, false);
  assert.equal(M.validateItem(raw({ originalText: "x".repeat(M.MAX_ORIGINAL + 1) })).valid, false);
  assert.equal(M.validateItem(item({ originalText: "line one\nline two\tok" })).valid, true);
});

test("rejects unknown fields, duplicate IDs and over-limit libraries", () => {
  const unknownItem = { ...item(), unexpected: true };
  assert.equal(M.validateLibrary(library([unknownItem])).valid, false);
  assert.equal(M.validateLibrary({ ...library([]), extra: true }).valid, false);
  assert.equal(M.validateLibrary({ schema: M.SCHEMA, v: 2, items: [] }).valid, false);
  assert.equal(M.validateLibrary({ schema: M.SCHEMA, v: 1, items: "no" }).valid, false);
  const duplicate = item({ id: "same-id" });
  assert.equal(M.validateLibrary(library([duplicate, { ...duplicate }])).valid, false);
  const many = Array.from({ length: M.MAX_ITEMS + 1 }, (_, index) => item({ id: "id-" + index }));
  assert.equal(M.validateLibrary(library(many)).valid, false);
  assert.equal(M.validateItem(raw({ authors: Array.from({ length: M.MAX_AUTHORS + 1 }, (_, index) => ({ literal: "Org " + index })) })).valid, false);
});

test("strict JSON parser rejects duplicate keys, prototype keys, unknown/oversize data", () => {
  const duplicate = '{"schema":"formcapy-citations","v":1,"items":[],"items":[]}';
  assert.equal(M.parseLibraryJson(duplicate).errors[0].code, "duplicate_key");
  const proto = '{"schema":"formcapy-citations","v":1,"items":[],"__proto__":{}}';
  assert.equal(M.parseLibraryJson(proto).errors[0].code, "forbidden_key");
  const unknown = JSON.stringify({ schema: M.SCHEMA, v: 1, items: [], extra: true });
  assert.equal(M.parseLibraryJson(unknown).ok, false);
  const badVersion = JSON.stringify({ schema: M.SCHEMA, v: 99, items: [] });
  assert.equal(M.parseLibraryJson(badVersion).errors[0].code, "version_unsupported");
  assert.equal(M.parseLibraryJson("{bad").ok, false);
  assert.equal(M.parseLibraryJson("[]").ok, false);
  assert.equal(M.parseLibraryJson("x".repeat(M.MAX_JSON_BYTES + 1)).errors[0].code, "json_too_large");
});

test("malformed imports leave the caller's library untouched", () => {
  const current = library([item()]);
  const before = JSON.stringify(current);
  for (const text of [
    "{bad", "[]",
    JSON.stringify({ schema: M.SCHEMA, v: 1, items: [{ ...item(), title: "" }] }),
    JSON.stringify({ schema: M.SCHEMA, v: 1, items: [{ ...item(), id: "bad id!" }] }),
    '{"schema":"formcapy-citations","v":1,"items":[{"id":"a","id":"b"}]}',
  ]) {
    assert.equal(M.parseLibraryJson(text).ok, false);
    assert.equal(JSON.stringify(current), before);
  }
});

test("rejects whitespace-only authors without trimming stored names", () => {
  assert.equal(M.validateItem(raw({ authors: [{ family: "   " }] })).valid, false);
  assert.equal(M.validateItem(raw({ authors: [{ literal: "\t \n" }] })).valid, false);
  assert.equal(M.validateItem(raw({ authors: [{ family: "  Example  ", given: " Ana " }] })).valid, true);
  const kept = M.validateItem(raw({ authors: [{ family: "  Example  ", given: " Ana " }] }));
  assert.equal(kept.valid, true);
  assert.throws(() => M.createItem({ title: "x", authors: [{ family: "   " }] }), /author_empty/);
});

test("early-returns on oversized item/author arrays and caps visible work", () => {
  const huge = { schema: M.SCHEMA, v: 1, items: Array.from({ length: 10000 }, () => ({})) };
  const result = M.validateLibrary(huge);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, "too_many_items");
  const hugeAuthors = raw({ authors: Array.from({ length: 10000 }, () => ({})) });
  const authorResult = M.validateItem(hugeAuthors);
  assert.equal(authorResult.errors.length, 1);
  assert.equal(authorResult.errors[0].code, "too_many_authors");
  const parsed = M.parseLibraryJson(JSON.stringify({ schema: M.SCHEMA, v: 1, items: Array.from({ length: 10000 }, () => ({})) }));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errors.length, 1);
});

test("canonical compact data caps at exactly 1 MiB and oversize fails explicitly", () => {
  const base = { schema: M.SCHEMA, v: 1, items: [M.createItem({ title: "Fictional exact-limit entry" })] };
  const compact = M.stringifyLibrary(base).trimEnd();
  assert.ok(M.utf8Length(compact) < M.MAX_JSON_BYTES);
  const exact = compact + " ".repeat(M.MAX_JSON_BYTES - M.utf8Length(compact));
  assert.equal(M.utf8Length(exact), M.MAX_JSON_BYTES);
  assert.equal(M.parseLibraryJson(exact).ok, true);
  assert.equal(M.parseLibraryJson(exact + " ").errors[0].code, "json_too_large");

  const near = { schema: M.SCHEMA, v: M.VERSION, items: [] };
  for (let index = 0; index < 101; index += 1) {
    near.items.push(M.createItem({
      id: "exact-" + String(index).padStart(3, "0"),
      title: "Fictional aggregate entry " + index,
      publisher: index === 100 ? "y".repeat(2000) : "",
      originalText: "x".repeat(index === 100 ? 10000 : 10000),
    }));
  }
  const output = M.stringifyLibrary(near);
  assert.ok(M.utf8Length(output) <= M.MAX_JSON_BYTES);
  assert.equal(output.includes("\n  "), false, "compact fallback when pretty exceeds cap");
  assert.equal(M.parseLibraryJson(output).ok, true);

  const oversize = { schema: M.SCHEMA, v: M.VERSION, items: [] };
  for (let index = 0; index < 110; index += 1) {
    oversize.items.push(M.createItem({
      id: "over-" + String(index).padStart(3, "0"),
      title: "Fictional oversize entry " + index,
      originalText: "x".repeat(10000),
    }));
  }
  assert.throws(() => M.stringifyLibrary(oversize), (error) => error.code === "json_too_large");
  assert.equal(M.parseLibraryJson(JSON.stringify({ schema: M.SCHEMA, v: 1, items: [] })).ok, true);
});

test("creates stable safe IDs and rejects invalid IDs", () => {
  const first = M.newId();
  const second = M.newId();
  assert.match(first, /^[A-Za-z0-9_-]{1,64}$/);
  assert.notEqual(first, second);
  assert.equal(M.validateItem(raw({ id: "bad id" })).valid, false);
  assert.equal(M.validateItem(raw({ id: "x".repeat(65) })).valid, false);
});

test("standalone HTML/library JSON does not expose draft or paper state", () => {
  const text = M.stringifyLibrary(library([item({ title: "Only the citation" })]));
  for (const forbidden of ["draft", "paper title", "student name", "paragraphPreservation", "downloadUrl"]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("rejects XML noncharacters before preview or library export", () => {
  for (const code of [0xfffe, 0xffff]) {
    const invalid = "Source " + String.fromCodePoint(code);
    assert.equal(M.validateItem(raw({ title: invalid })).valid, false);
    assert.equal(M.validateItem(raw({ authors: [{ literal: invalid }] })).valid, false);
    const result = M.parseLibraryJson(JSON.stringify(library([raw({ title: invalid })])));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((issue) => issue.code === "invalid_unicode"));
  }
  assert.equal(M.validateItem(raw({ title: "中文 العربية 🦫" })).valid, true);
});

test("rejects backslash URLs consistently with Word export", () => {
  assert.equal(M.validateItem(raw({ URL: "https://example.org/a\\b" })).valid, false);
  assert.equal(M.validateItem(raw({ URL: "https://example.org/a%5Cb" })).valid, true);
  assert.equal(M.validateItem(raw({ URL: "https://example.org/中文" })).valid, true);
});
