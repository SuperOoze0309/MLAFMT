// Portable bibliography export tests. Uses the real model and importer in a VM;
// all data is fictional, no network/DOM/storage is involved.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modelSource = fs.readFileSync(path.join(root, "static/citation-library.js"), "utf8");
const importSource = fs.readFileSync(path.join(root, "static/citation-import.js"), "utf8");
const exportSource = fs.readFileSync(path.join(root, "static/citation-export.js"), "utf8");
const require = createRequire(import.meta.url);
const MAX = 1048576;
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness({ loadModel = true, loadImport = true } = {}) {
  const fetchCalls = [];
  const context = vm.createContext({
    console, URL, TextEncoder, TextDecoder,
    fetch: (...args) => {
      fetchCalls.push(args);
      throw new TypeError("network is forbidden in export tests");
    },
  });
  if (loadModel) vm.runInContext(modelSource, context);
  if (loadImport) vm.runInContext(importSource, context);
  vm.runInContext(exportSource, context);
  return {
    context,
    model: context.FormCapyCitations,
    importer: context.FormCapyCitationImport,
    exporter: context.FormCapyCitationExport,
    fetchCalls,
  };
}

function makeItem(h, overrides = {}) {
  return h.model.createItem({
    id: "book_01",
    type: "book",
    title: "A fictional source",
    authors: [{ family: "Example", given: "Ana" }],
    issued: { year: 2024 },
    publisher: "Fictional Press",
    ...overrides,
  });
}

function makeLibrary(h, items) {
  return { schema: h.model.SCHEMA, v: h.model.VERSION, items };
}

function fullLibrary(h) {
  return makeLibrary(h, [
    makeItem(h, {
      id: "book_01",
      type: "book",
      title: "中文 / Español 🦫 — {curly} \\backslash % & $ # _ ~ ^",
      authors: [
        { family: "García", given: "María" },
        { literal: "Fictional Research Group" },
      ],
      issued: { year: 2020 },
      publisher: "Editorial Ñandú",
      edition: "2",
      DOI: "10.5555/book.1",
      URL: "https://example.test/book?a=1&b=2#frag",
      language: "es",
      originalText: "Private source text must never be exported.",
    }),
    makeItem(h, {
      id: "article_01",
      type: "article-journal",
      title: "A fictional article",
      authors: [
        { family: "Example", given: "Ana" },
        { literal: "Consorcio Ejemplo" },
      ],
      issued: { year: 2024, month: 2 },
      containerTitle: "Journal & Stuff",
      volume: "12",
      issue: "3",
      page: "45-67",
      DOI: "10.5555/article.1",
      URL: "https://example.test/article",
      language: "en",
      originalText: "Another private source.",
    }),
    makeItem(h, {
      id: "web_01",
      type: "webpage",
      title: "A fictional webpage",
      authors: [{ family: "Example", given: "Ana" }],
      issued: { year: 2024, month: 2, day: 29 },
      containerTitle: "Example Site",
      URL: "https://example.test/page?x=1&y=2",
      accessed: { year: 2024, month: 3, day: 1 },
      language: "zh",
      originalText: "Web source text.",
    }),
  ]);
}

function losslessLibrary(h) {
  return makeLibrary(h, [
    makeItem(h, {
      id: "book_01",
      type: "book",
      title: "Café {Brace} 100% & more",
      authors: [{ family: "García", given: "María" }],
      issued: { year: 2020 },
      publisher: "Editorial Ñandú",
      edition: "2",
      DOI: "10.5555/book.1",
      URL: "https://example.test/book?a=1&b=2",
      language: "es",
    }),
    makeItem(h, {
      id: "article_01",
      type: "article-journal",
      title: "Article 中文 🦫",
      authors: [
        { family: "Example", given: "Ana" },
        { family: "Zulu", given: "Zoé" },
      ],
      issued: { year: 2024, month: 2 },
      containerTitle: "Journal & Review",
      volume: "12",
      issue: "3",
      page: "45-67",
      DOI: "10.5555/article.1",
      URL: "https://example.test/article?x=1&y=2",
      language: "en",
    }),
    makeItem(h, {
      id: "web_01",
      type: "webpage",
      title: "Web page",
      authors: [{ family: "Example", given: "Ana" }],
      issued: { year: 2024, month: 2, day: 29 },
      containerTitle: "Example Site",
      URL: "https://example.test/page?x=1&y=2",
      accessed: { year: 2024, month: 3, day: 1 },
      language: "zh",
    }),
  ]);
}

function normalized(item) {
  return {
    type: item.type,
    title: item.title,
    authors: (item.authors || []).map((author) => ({ ...author })),
    issued: item.issued ? { ...item.issued } : null,
    publisher: item.publisher || "",
    containerTitle: item.containerTitle || "",
    volume: item.volume || "",
    issue: item.issue || "",
    page: item.page || "",
    edition: item.edition || "",
    DOI: item.DOI || "",
    URL: item.URL || "",
    accessed: item.accessed ? { ...item.accessed } : null,
    language: item.language || "",
  };
}

function hasWarning(result, code, index) {
  return result.warnings.some((warning) => warning.code === code &&
    (index === undefined || warning.index === index));
}

test("exports all three formats with fixed metadata and no private/envelope data", () => {
  const h = harness();
  const lib = fullLibrary(h);
  const expected = {
    "csl-json": ["formcapy-references.csl.json", "application/vnd.citationstyles.csl+json"],
    ris: ["formcapy-references.ris", "application/x-research-info-systems"],
    bibtex: ["formcapy-references.bib", "application/x-bibtex"],
  };
  for (const [format, [filename, mime]] of Object.entries(expected)) {
    const result = h.exporter.exportLibrary(lib, { format });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.format, format);
    assert.equal(result.filename, filename);
    assert.equal(result.mime, mime);
    assert.equal(result.errors.length, 0);
    assert.equal(result.text.length > 0, true);
    assert.equal(hasWarning(result, "original_text_omitted", 0), true);
    assert.equal(hasWarning(result, "original_text_omitted", 1), true);
    assert.equal(hasWarning(result, "original_text_omitted", 2), true);
    assert.doesNotMatch(result.text, /Private source text|Another private source|Web source text/);
    assert.doesNotMatch(result.text, /originalText|formcapy-citations|"schema"|draft|paper title/);
    assert.equal(h.fetchCalls.length, 0);
  }
  const csl = JSON.parse(h.exporter.exportLibrary(lib, { format: "csl-json" }).text);
  assert.equal(Array.isArray(csl), true);
  assert.equal(csl.length, 3);
  assert.deepEqual(csl.map((item) => item.id), ["book_01", "article_01", "web_01"]);
});

test("CSL JSON maps types, ordered personal/literal authors, partial/leap dates and fields", () => {
  const h = harness();
  const lib = fullLibrary(h);
  const result = h.exporter.exportLibrary(lib, { format: "csl-json" });
  assert.equal(result.ok, true);
  const items = JSON.parse(result.text);
  const book = items[0];
  assert.equal(book.type, "book");
  assert.equal(book.title, "中文 / Español 🦫 — {curly} \\backslash % & $ # _ ~ ^");
  assert.deepEqual(plain(book.author), [
    { family: "García", given: "María" },
    { literal: "Fictional Research Group" },
  ]);
  assert.deepEqual(plain(book.issued), { "date-parts": [[2020]] });
  assert.equal(book.publisher, "Editorial Ñandú");
  assert.equal(book.edition, "2");
  assert.equal(book.DOI, "10.5555/book.1");
  assert.equal(book.URL, "https://example.test/book?a=1&b=2#frag");
  assert.equal(book.language, "es");
  const article = items[1];
  assert.equal(article.type, "article-journal");
  assert.deepEqual(plain(article.issued), { "date-parts": [[2024, 2]] });
  assert.equal(article["container-title"], "Journal & Stuff");
  assert.equal(article.volume, "12");
  assert.equal(article.issue, "3");
  assert.equal(article.page, "45-67");
  const webpage = items[2];
  assert.equal(webpage.type, "webpage");
  assert.deepEqual(plain(webpage.issued), { "date-parts": [[2024, 2, 29]] });
  assert.deepEqual(plain(webpage.accessed), { "date-parts": [[2024, 3, 1]] });
  for (const item of items) assert.equal("originalText" in item, false);
});

test("RIS uses current type tags, one AU per author and all supported fields", () => {
  const h = harness();
  const result = h.exporter.exportLibrary(fullLibrary(h), { format: "ris" });
  assert.equal(result.ok, true);
  const text = result.text;
  assert.match(text, /^TY  - BOOK/m);
  assert.match(text, /^TY  - JOUR/m);
  assert.match(text, /^TY  - ELEC/m);
  assert.match(text, /^AU  - García, María$/m);
  assert.match(text, /^AU  - Fictional Research Group$/m);
  assert.match(text, /^TI  - 中文 \/ Español 🦫/m);
  assert.match(text, /^JO  - Journal & Stuff$/m);
  assert.match(text, /^T2  - Example Site$/m);
  assert.match(text, /^PB  - Editorial Ñandú$/m);
  assert.match(text, /^VL  - 12$/m);
  assert.match(text, /^IS  - 3$/m);
  assert.match(text, /^SP  - 45$/m);
  assert.match(text, /^EP  - 67$/m);
  assert.match(text, /^ET  - 2$/m);
  assert.match(text, /^DA  - 2024-02$/m);
  assert.match(text, /^Y2  - 2024-03-01$/m);
  assert.match(text, /^DO  - 10\.5555\/article\.1$/m);
  assert.match(text, /^UR  - https:\/\/example\.test\/page\?x=1&y=2$/m);
  assert.match(text, /^LA  - zh$/m);
  assert.equal((text.match(/^ER  -/gm) || []).length, 3);
  assert.equal(hasWarning(result, "ris_author_literal", 0), true);
  assert.equal(hasWarning(result, "ris_author_literal", 1), true);
  assert.doesNotMatch(text, /originalText|Private source/);
});

test("modern BibLaTeX profile maps types/fields, protects authors and escapes TeX controls", () => {
  const h = harness();
  const result = h.exporter.exportLibrary(fullLibrary(h), { format: "bibtex" });
  assert.equal(result.ok, true);
  const text = result.text;
  assert.match(text, /@book\{ref_book_01,/);
  assert.match(text, /@article\{ref_article_01,/);
  assert.match(text, /@online\{ref_web_01,/);
  assert.match(text, /\{\{García\}\}, \{\{María\}\}/);
  assert.match(text, /\{\{Fictional Research Group\}\}/);
  assert.match(text, /date = \{2024-02\}/);
  assert.match(text, /journaltitle = \{Journal \\& Stuff\}/);
  assert.match(text, /booktitle = \{Example Site\}/);
  assert.match(text, /publisher = \{Editorial Ñandú\}/);
  assert.match(text, /volume = \{12\}/);
  assert.match(text, /number = \{3\}/);
  assert.match(text, /pages = \{45-67\}/);
  assert.match(text, /edition = \{2\}/);
  assert.match(text, /doi = \{10\.5555\/article\.1\}/);
  assert.match(text, /url = \{https:\/\/example\.test\/page\?x=1\\&y=2\}/);
  assert.match(text, /urldate = \{2024-03-01\}/);
  assert.match(text, /language = \{zh\}/);
  assert.match(text, /\\textbackslash\{\}/);
  assert.match(text, /\\textasciitilde\{\}/);
  assert.match(text, /\\textasciicircum\{\}/);
  assert.doesNotMatch(text, /originalText|Private source/);
  assert.equal(hasWarning(result, "bibtex_tex_escape_lossy", 0), true);
  assert.equal(hasWarning(result, "bibtex_container_semantics", 2), true);
});

test("the existing importer round-trips CSL, RIS and BibTeX lossless profiles", () => {
  const h = harness();
  const lib = losslessLibrary(h);
  for (const [format, importFormat] of [["csl-json", "csl-json"], ["ris", "ris"], ["bibtex", "bibtex"]]) {
    const exported = h.exporter.exportLibrary(lib, { format });
    assert.equal(exported.ok, true, JSON.stringify(exported.errors));
    const imported = h.importer.parse(exported.text, { format: importFormat });
    assert.equal(imported.ok, true, JSON.stringify(imported.errors));
    assert.deepEqual(plain(imported.items.map(normalized)), plain(lib.items.map(normalized)));
    assert.equal(imported.items.every((item) => typeof item.originalText === "string"), true);
  }
});

test("BibTeX preserves literal/corporate authors and punctuation in protected name parts", () => {
  const h = harness();
  const authors = [
    { family: "van der Berg, Jr.", given: "María-José" },
    { literal: "Research, Development and Testing" },
    { family: "Smith and Sons", given: "Ana" },
    { literal: "Org {Braces} \\ Backslash & Punctuation!" },
    { family: "O'Neil {Jr.}", given: "J. R." },
  ];
  const lib = makeLibrary(h, [
    makeItem(h, { id: "names_01", title: "Names", authors }),
  ]);
  const csl = h.exporter.exportLibrary(lib, { format: "csl-json" });
  assert.equal(csl.ok, true);
  assert.deepEqual(plain(JSON.parse(csl.text)[0].author), plain(authors));
  const exported = h.exporter.exportLibrary(lib, { format: "bibtex" });
  assert.equal(exported.ok, true);
  assert.equal(exported.warnings.some((warning) => warning.code.startsWith("bibtex_")), false);
  const imported = h.importer.parse(exported.text, { format: "bibtex" });
  assert.equal(imported.ok, true, JSON.stringify(imported.errors));
  assert.deepEqual(plain(imported.items[0].authors), plain(authors));
});

test("partial and leap dates survive RIS/BibTeX output and importer round trips", () => {
  const h = harness();
  const items = [
    makeItem(h, { id: "year", title: "Year", issued: { year: 2024 } }),
    makeItem(h, { id: "month", title: "Month", issued: { year: 2024, month: 2 } }),
    makeItem(h, { id: "day", title: "Day", issued: { year: 2024, month: 2, day: 29 } }),
  ];
  const lib = makeLibrary(h, items);
  for (const format of ["ris", "bibtex"]) {
    const exported = h.exporter.exportLibrary(lib, { format });
    assert.equal(exported.ok, true);
    const imported = h.importer.parse(exported.text, { format });
    assert.equal(imported.ok, true, JSON.stringify(imported.errors));
    assert.deepEqual(plain(imported.items.map((item) => item.issued)), [
      { year: 2024 }, { year: 2024, month: 2 }, { year: 2024, month: 2, day: 29 },
    ]);
    assert.equal(imported.items[2].issued.day, 29);
  }
});

test("CSL preserves exact strings and never emits RIS/BibTeX-only warnings", () => {
  const h = harness();
  const lib = makeLibrary(h, [
    makeItem(h, {
      id: "exact",
      title: "  spaced ~ caret ^ and {braces} \\ slash  ",
      authors: [{ family: "Fam~", given: "Given^" }],
      page: "12–34",
      containerTitle: " A container ",
    }),
  ]);
  const result = h.exporter.exportLibrary(lib, { format: "csl-json" });
  assert.equal(result.ok, true);
  const items = JSON.parse(result.text);
  assert.equal(items[0].title, "  spaced ~ caret ^ and {braces} \\ slash  ");
  assert.deepEqual(plain(items[0].author), [{ family: "Fam~", given: "Given^" }]);
  assert.equal(items[0].page, "12–34");
  assert.equal(items[0]["container-title"], " A container ");
  assert.equal(result.warnings.some((warning) =>
    warning.code.startsWith("ris_") || warning.code.startsWith("bibtex_")), false);
  assert.equal(result.warnings.some((warning) => warning.code === "original_text_omitted"), false);
});

test("lossy RIS names/pages and lossy BibTeX TeX/page cases emit explicit warnings", () => {
  const h = harness();
  const lib = makeLibrary(h, [
    makeItem(h, {
      id: "ris_loss",
      title: "  leading and trailing  ",
      authors: [
        { family: "Family, Jr.", given: "Ana " },
        { literal: "Organization, Inc." },
      ],
      page: "12–34",
    }),
    makeItem(h, {
      id: "bib_loss",
      title: "Tilde ~ and caret ^",
      authors: [{ given: "GivenOnly" }],
      page: "12--34",
      containerTitle: "Odd Container",
    }),
  ]);
  const ris = h.exporter.exportLibrary(lib, { format: "ris" });
  assert.equal(ris.ok, true);
  assert.equal(hasWarning(ris, "ris_author_literal", 0), true);
  assert.equal(hasWarning(ris, "ris_author_comma", 0), true);
  assert.equal(hasWarning(ris, "ris_page_semantics", 0), true);
  assert.equal(hasWarning(ris, "ris_field_whitespace", 0), true);
  assert.equal(hasWarning(ris, "ris_author_whitespace", 0), true);
  assert.equal(hasWarning(ris, "ris_author_given_only", 1), true);
  assert.equal(ris.warnings.some((warning) => warning.field === "page" && warning.path), true);

  const bib = h.exporter.exportLibrary(lib, { format: "bibtex" });
  assert.equal(bib.ok, true);
  assert.equal(hasWarning(bib, "bibtex_tex_escape_lossy", 1), true);
  assert.equal(hasWarning(bib, "bibtex_page_dash_lossy", 1), true);
  assert.equal(hasWarning(bib, "bibtex_author_given_only", 1), true);
  assert.equal(hasWarning(bib, "bibtex_author_whitespace", 0), true);
  assert.equal(hasWarning(bib, "bibtex_field_whitespace", 0), true);
  assert.equal(hasWarning(bib, "bibtex_container_semantics", 1), true);
  assert.match(bib.text, /pages = \{12--34\}/);
});

test("model warnings are structured and originalText is warned per item but never exported", () => {
  const h = harness();
  const lib = makeLibrary(h, [
    makeItem(h, {
      id: "no_author",
      title: "No author",
      authors: [],
      issued: null,
      originalText: "Comparison text",
    }),
  ]);
  const csl = h.exporter.exportLibrary(lib, { format: "csl-json" });
  assert.equal(csl.ok, true);
  assert.equal(hasWarning(csl, "author_missing", 0), true);
  assert.equal(hasWarning(csl, "year_missing", 0), true);
  const original = csl.warnings.find((issue) => issue.code === "original_text_omitted");
  assert.deepEqual(plain(original), {
    code: "original_text_omitted", index: 0, field: "originalText",
    path: "library.items[0].originalText",
  });
  assert.doesNotMatch(csl.text, /Comparison text|originalText/);
});

test("output is stable, ordered, collision-free and input is never mutated", () => {
  const h = harness();
  const lib = losslessLibrary(h);
  const before = JSON.stringify(lib);
  const first = h.exporter.exportLibrary(lib, { format: "bibtex" });
  const second = h.exporter.exportLibrary(lib, { format: "bibtex" });
  assert.equal(first.ok, true);
  assert.equal(first.text, second.text);
  assert.match(first.text, /@book\{ref_book_01,/);
  assert.match(first.text, /@article\{ref_article_01,/);
  assert.match(first.text, /@online\{ref_web_01,/);
  assert.ok(first.text.indexOf("@book{") < first.text.indexOf("@article{"));
  assert.ok(first.text.indexOf("@article{") < first.text.indexOf("@online{"));
  assert.equal(JSON.stringify(lib), before);
  assert.deepEqual(plain(lib.items.map((item) => item.id)), ["book_01", "article_01", "web_01"]);
});

test("empty, invalid, oversized and unknown-format requests fail with empty text", () => {
  const h = harness();
  const empty = h.exporter.exportLibrary(makeLibrary(h, []), { format: "ris" });
  assert.equal(empty.ok, false);
  assert.equal(empty.text, "");
  assert.equal(empty.errors[0].code, "library_empty");
  assert.equal(empty.filename, "formcapy-references.ris");
  const unknown = h.exporter.exportLibrary(makeLibrary(h, []), { format: "docx" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.text, "");
  assert.equal(unknown.errors[0].code, "format_unsupported");
  assert.equal(unknown.filename, "");
  const invalid = h.exporter.exportLibrary({
    schema: "wrong", v: 1, items: [],
  }, { format: "csl-json" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.text, "");
  assert.equal(invalid.errors.some((error) => error.code === "schema_invalid"), true);
  const badField = makeItem(h, { id: "bad" });
  badField.private = "must not be accepted";
  const malformed = h.exporter.exportLibrary(makeLibrary(h, [badField]), { format: "ris" });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.text, "");
  const tooMany = makeLibrary(h, Array.from({ length: 201 }, (_, index) =>
    makeItem(h, { id: "too_" + index, title: "Item " + index })));
  const overCount = h.exporter.exportLibrary(tooMany, { format: "bibtex" });
  assert.equal(overCount.ok, false);
  assert.equal(overCount.text, "");
  const newlineItem = makeItem(h, { id: "newline" });
  newlineItem.title = "bad\nER  - injected";
  const newline = h.exporter.exportLibrary(makeLibrary(h, [newlineItem]), { format: "ris" });
  assert.equal(newline.ok, false);
  assert.equal(newline.text, "");
});

test("getters, toJSON, cycles, prototypes and hostile options are rejected before model use", () => {
  const h = harness();
  const originalModel = h.context.FormCapyCitations;
  let modelCalls = 0;
  h.context.FormCapyCitations = {
    ...originalModel,
    validateLibrary(...args) {
      modelCalls += 1;
      return originalModel.validateLibrary(...args);
    },
  };
  let getterCalls = 0;
  const accessor = { schema: h.model.SCHEMA, v: 1, items: [] };
  Object.defineProperty(accessor, "items", {
    enumerable: true,
    get() { getterCalls += 1; return []; },
  });
  const getter = h.exporter.exportLibrary(accessor, { format: "ris" });
  assert.equal(getter.ok, false);
  assert.equal(getter.text, "");
  assert.equal(getterCalls, 0);
  assert.equal(modelCalls, 0);
  h.context.FormCapyCitations = originalModel;

  let nestedGetterCalls = 0;
  const nestedItem = makeItem(h, { id: "nested_getter" });
  const nestedAuthor = { family: "X", given: "Y" };
  Object.defineProperty(nestedAuthor, "family", {
    enumerable: true,
    get() { nestedGetterCalls += 1; return "X"; },
  });
  nestedItem.authors = [nestedAuthor];
  const nested = h.exporter.exportLibrary(makeLibrary(h, [nestedItem]), { format: "bibtex" });
  assert.equal(nested.ok, false);
  assert.equal(nestedGetterCalls, 0);

  let toJSONCalls = 0;
  const jsonItem = makeItem(h, { id: "tojson" });
  jsonItem.toJSON = function toJSON() { toJSONCalls += 1; return {}; };
  const toJSON = h.exporter.exportLibrary(makeLibrary(h, [jsonItem]), { format: "csl-json" });
  assert.equal(toJSON.ok, false);
  assert.equal(toJSONCalls, 0);

  const cyclicItem = makeItem(h, { id: "cyclic" });
  const cycle = {};
  cycle.self = cycle;
  cyclicItem.extra = cycle;
  const cyclic = h.exporter.exportLibrary(makeLibrary(h, [cyclicItem]), { format: "bibtex" });
  assert.equal(cyclic.ok, false);
  assert.equal(cyclic.text, "");

  const protoLibrary = Object.create({ polluted: true });
  protoLibrary.schema = h.model.SCHEMA;
  protoLibrary.v = 1;
  protoLibrary.items = [];
  const proto = h.exporter.exportLibrary(protoLibrary, { format: "csl-json" });
  assert.equal(proto.ok, false);
  assert.equal(proto.text, "");

  const ownProtoItem = makeItem(h, { id: "own_proto" });
  Object.defineProperty(ownProtoItem, "__proto__", {
    enumerable: true,
    value: { polluted: true },
  });
  const ownProto = h.exporter.exportLibrary(makeLibrary(h, [ownProtoItem]), { format: "ris" });
  assert.equal(ownProto.ok, false);
  assert.equal(ownProto.text, "");

  const symbolItem = makeItem(h, { id: "symbol" });
  symbolItem[Symbol("hidden")] = "value";
  const symbol = h.exporter.exportLibrary(makeLibrary(h, [symbolItem]), { format: "ris" });
  assert.equal(symbol.ok, false);

  let optionsGetterCalls = 0;
  const options = {};
  Object.defineProperty(options, "format", {
    enumerable: true,
    get() { optionsGetterCalls += 1; return "ris"; },
  });
  const hostileOptions = h.exporter.exportLibrary(losslessLibrary(h), options);
  assert.equal(hostileOptions.ok, false);
  assert.equal(hostileOptions.text, "");
  assert.equal(optionsGetterCalls, 0);
  assert.equal(Array.isArray(hostileOptions.warnings), true);
  assert.equal(Array.isArray(hostileOptions.errors), true);
  assert.equal(hostileOptions.errors[0].code, "options_invalid");

  const hugeItem = makeItem(h, { id: "huge" });
  hugeItem.title = "x".repeat(8 * 1024 * 1024 + 1);
  const huge = h.exporter.exportLibrary(makeLibrary(h, [hugeItem]), { format: "ris" });
  assert.equal(huge.ok, false);
  assert.equal(huge.text, "");
  assert.equal(huge.errors[0].path, "library.items.0.title");

  const hugeArray = makeLibrary(h, new Array(10001));
  const array = h.exporter.exportLibrary(hugeArray, { format: "ris" });
  assert.equal(array.ok, false);
  assert.equal(array.text, "");

  const sparseArray = makeLibrary(h, new Array(1));
  const sparse = h.exporter.exportLibrary(sparseArray, { format: "ris" });
  assert.equal(sparse.ok, false);
  assert.equal(sparse.text, "");
});

test("missing model and unsupported formats always return warning/error arrays", () => {
  const h = harness({ loadModel: false, loadImport: false });
  const missing = h.exporter.exportLibrary({ schema: "formcapy-citations", v: 1, items: [] }, { format: "ris" });
  assert.equal(missing.ok, false);
  assert.equal(missing.text, "");
  assert.equal(missing.errors[0].code, "model_unavailable");
  assert.equal(Array.isArray(missing.warnings), true);
  assert.equal(Array.isArray(missing.errors), true);
  const unsupported = h.exporter.exportLibrary({}, { format: "unknown" });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.text, "");
  assert.equal(Array.isArray(unsupported.warnings), true);
  assert.equal(Array.isArray(unsupported.errors), true);
  assert.equal(unsupported.errors[0].code, "format_unsupported");
  const prototypeFormat = h.exporter.exportLibrary({}, { format: "__proto__" });
  assert.equal(prototypeFormat.ok, false);
  assert.equal(prototypeFormat.text, "");
  assert.equal(prototypeFormat.errors[0].code, "format_unsupported");
  const options = h.exporter.exportLibrary({}, { format: 12 });
  assert.equal(options.ok, false);
  assert.equal(options.text, "");
  assert.equal(Array.isArray(options.warnings), true);
  assert.equal(Array.isArray(options.errors), true);
});

test("CSL pretty JSON is used when it fits and compact fallback preserves 1 MiB boundary", () => {
  const h = harness();
  const small = h.exporter.exportLibrary(losslessLibrary(h), { format: "csl-json" });
  assert.equal(small.ok, true);
  assert.match(small.text, /\n    "id":/);
  assert.equal(JSON.parse(small.text).length, 3);

  const boundary = boundaryLibrary(h, "csl-json", 240);
  const exact = h.exporter.exportLibrary(boundary, { format: "csl-json" });
  assert.equal(exact.ok, true);
  assert.equal(new TextEncoder().encode(exact.text).length, MAX);
  assert.equal(exact.text.includes("\n  \""), false);
  assert.equal(JSON.parse(exact.text).length, 200);
  const over = h.exporter.exportLibrary(boundaryLibrary(h, "csl-json", 241), { format: "csl-json" });
  assert.equal(over.ok, false);
  assert.equal(over.text, "");
  assert.equal(over.errors[0].code, "export_too_large");
});

function boundaryLibrary(h, format, tunedLength) {
  const lengths = { "csl-json": 240, ris: 3314, bibtex: 1615 };
  const target = tunedLength === undefined ? lengths[format] : tunedLength;
  const items = [];
  for (let index = 0; index < 200; index += 1) {
    let publisher = "";
    if (index < 8) publisher = "P".repeat(5000);
    else if (index === 8) publisher = "P".repeat(target);
    items.push(h.model.createItem({
      id: "id-" + String(index).padStart(3, "0"),
      type: "book",
      title: "T".repeat(5000),
      publisher,
    }));
  }
  return makeLibrary(h, items);
}

test("RIS and BibTeX exact 1 MiB boundaries succeed; one more byte fails", () => {
  const h = harness();
  for (const [format, mid] of [["ris", 3314], ["bibtex", 1615]]) {
    const exact = h.exporter.exportLibrary(boundaryLibrary(h, format, mid), { format });
    assert.equal(exact.ok, true, JSON.stringify(exact.errors));
    assert.equal(new TextEncoder().encode(exact.text).length, MAX);
    const over = h.exporter.exportLibrary(boundaryLibrary(h, format, mid + 1), { format });
    assert.equal(over.ok, false);
    assert.equal(over.text, "");
    assert.equal(over.errors[0].code, "export_too_large");
  }
});

test("BibTeX escaping and RIS output cannot inject extra entries or tags", () => {
  const h = harness();
  const lib = makeLibrary(h, [
    makeItem(h, {
      id: "inject",
      title: "@article{evil, title={pwned}} % comment & $ # _ {literal} \\ slash",
      authors: [
        { family: "Smith and Sons", given: "Ana" },
        { literal: "Org, Inc. and Co." },
      ],
      page: "1-2",
    }),
  ]);
  const bib = h.exporter.exportLibrary(lib, { format: "bibtex" });
  assert.equal(bib.ok, true);
  const importedBib = h.importer.parse(bib.text, { format: "bibtex" });
  assert.equal(importedBib.ok, true, JSON.stringify(importedBib.errors));
  assert.equal(importedBib.items.length, 1);
  assert.equal(importedBib.items[0].title, lib.items[0].title);
  assert.deepEqual(plain(importedBib.items[0].authors), plain(lib.items[0].authors));

  const ris = h.exporter.exportLibrary(lib, { format: "ris" });
  assert.equal(ris.ok, true);
  assert.equal((ris.text.match(/^TY  -/gm) || []).length, 1);
  assert.equal((ris.text.match(/^ER  -/gm) || []).length, 1);
  assert.match(ris.text, /^TI  - @article\{evil, title=\{pwned\}\} % comment & \$ # _ \{literal\} \\ slash$/m);
});

test("CommonJS export is available and produces the same portable format", () => {
  const api = require(path.join(root, "static/citation-export.js"));
  assert.equal(api.MAX_ITEMS, 200);
  assert.equal(api.MAX_BYTES, 1048576);
  assert.equal(typeof api.exportLibrary, "function");
  const model = require(path.join(root, "static/citation-library.js"));
  const item = model.createItem({
    id: "commonjs", type: "book", title: "CommonJS entry",
    authors: [{ family: "Example", given: "Ana" }], issued: { year: 2024 },
    publisher: "Press",
  });
  const result = api.exportLibrary({ schema: model.SCHEMA, v: 1, items: [item] }, { format: "ris" });
  assert.equal(result.ok, true);
  assert.match(result.text, /^TY  - BOOK/m);
});
