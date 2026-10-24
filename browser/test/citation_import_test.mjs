// Production intake tests. Synthetic records only; no network or user drafts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const context = vm.createContext({ TextEncoder, URL });
for (const name of ["citation-library.js", "citation-import.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "static", name), "utf8"), context);
}
const M = context.FormCapyCitations;
const I = context.FormCapyCitationImport;
const plain = (value) => JSON.parse(JSON.stringify(value));
const csl = (overrides = {}) => ({ type: "book", title: "Fictional example", author: [{ family: "Example", given: "Ana" }],
  issued: { "date-parts": [[2024]] }, publisher: "Example Press", ...overrides });
const item = (overrides = {}) => M.createItem({ type: "book", title: "Fictional example", authors: [{ family: "Example", given: "Ana" }],
  issued: { year: 2024 }, publisher: "Example Press", ...overrides });
function rejects(text, code, options) {
  const result = I.parse(text, options);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.items.length, 0);
  assert.ok(result.errors.some((error) => error.code === code), JSON.stringify(result.errors));
}

test("exposes intake limits and has no global network/storage requirements", () => {
  assert.equal(I.MAX_BYTES, 1048576);
  assert.equal(I.MAX_ITEMS, 200);
  assert.equal(I.MAX_FIELD, 5000);
  assert.equal(I.MAX_ORIGINAL, 10000);
  assert.equal(typeof I.parse, "function");
  assert.equal(context.fetch, undefined);
});

test("CSL JSON maps journal metadata, ordered personal/corporate authors and precise dates", () => {
  const source = csl({ id: "untrusted/source-id", type: "article-journal", title: "Étude 中文 🦫", author: [
    { family: "García", given: "María" }, { literal: "Fictional Institute" }, { family: "Example", given: "Ana" }],
  issued: { "date-parts": [[2024, 2, 29]] }, accessed: { "date-parts": [[2025, 1]] },
  "container-title": "Example Journal", volume: 8, issue: 2, page: "11-22", DOI: "https://doi.org/10.5555%2FEXAMPLE", language: "es" });
  const parsed = I.parse(JSON.stringify(source));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.format, "json");
  assert.equal(parsed.items[0].id, "import_1");
  assert.deepEqual(plain(parsed.items[0].authors), source.author);
  assert.deepEqual(plain(parsed.items[0].issued), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(plain(parsed.items[0].accessed), { year: 2025, month: 1 });
  assert.equal(parsed.items[0].volume, "8");
  assert.equal(parsed.items[0].DOI, "10.5555/EXAMPLE");
  assert.equal(parsed.items[0].originalText, JSON.stringify(source));
});

test("CSL arrays and BOM accept book/journal/webpage and retain per-record source", () => {
  const records = [csl(), csl({ type: "article-journal", title: "Journal", "container-title": "Fictional Journal" }),
    csl({ type: "webpage", title: "Web", URL: "https://example.com/page" })];
  const parsed = I.parse("\uFEFF" + JSON.stringify(records), { format: "csl-json" });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.items.map((value) => value.type), vm.runInContext('["book", "article-journal", "webpage"]', context));
  assert.equal(parsed.items[1].originalText, JSON.stringify(records[1]));
});

test("CSL omitted fields and date ranges produce warnings without invented values", () => {
  const parsed = I.parse(JSON.stringify(csl({ author: [], issued: { "date-parts": [[2024], [2025]] }, editor: [{ literal: "Unused" }] })));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items[0].authors.length, 0);
  assert.deepEqual(plain(parsed.items[0].issued), { year: 2024 });
  assert.ok(parsed.warnings.some((issue) => issue.code === "date_range_first_only"));
  assert.ok(parsed.warnings.some((issue) => issue.code === "field_not_imported" && issue.field === "editor"));
  assert.ok(parsed.warnings.some((issue) => issue.code === "author_missing"));
});

test("retained original record truncation is explicit and never leaves half a Unicode pair", () => {
  const prefix = '{"type":"book","title":"Example","ignored":"';
  const text = prefix + "x".repeat(9999 - prefix.length) + '🦫more"}';
  const parsed = I.parse(text);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.items[0].originalText.length, 9999);
  assert.equal(parsed.items[0].originalText.endsWith("x"), true);
  assert.ok(parsed.warnings.some((issue) => issue.code === "original_text_truncated"));
});

test("BibTeX parses macros, concatenation, TeX accents, three author kinds and page ranges", () => {
  const text = String.raw`% Synthetic bibliography
@string{press = "Example " # "Press"}
@article{one,
 title={An {Example} of \LaTeX{} and Caf\'{e}},
 author={Garc\'{i}a, Mar\'{i}a and {Fictional Research Institute} and Ludwig van Beethoven},
 year=2024, month=feb, day=29, journal={Example Journal},
 volume=8, number=2, pages={11--22}, publisher=press,
 doi={\url{https://doi.org/10.5555%2Fexample}}, url={https://example.com/~paper}
}`;
  const parsed = I.parse(text);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  const value = parsed.items[0];
  assert.equal(value.title, "An Example of LaTeX and Café");
  assert.deepEqual(plain(value.authors), [{ family: "García", given: "María" }, { literal: "Fictional Research Institute" },
    { family: "van Beethoven", given: "Ludwig" }]);
  assert.deepEqual(plain(value.issued), { year: 2024, month: 2, day: 29 });
  assert.equal(value.page, "11-22");
  assert.equal(value.publisher, "Example Press");
  assert.equal(value.URL, "https://example.com/~paper");
  assert.equal(value.DOI, "10.5555/example");
});

test("BibTeX keeps unknown TeX visibly with warnings and skips directives safely", () => {
  const parsed = I.parse(String.raw`@comment{ignored {balanced} text}
@preamble{"\write18{does not execute}"}
@book{x,title={A \unknown{word} and \emph{title}},author={Doe, Jr., John and others},year=2024}`);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.items[0].title, String.raw`A \unknownword and title`);
  for (const code of ["bibtex_directive_not_imported", "bibtex_latex_unconverted", "formatting_not_imported", "authors_incomplete"]) {
    assert.ok(parsed.warnings.some((issue) => issue.code === code), code);
  }
});

test("RIS imports multiple records, continuation lines, repeat authors and page endpoints", () => {
  const text = "TY  - JOUR\r\nTI  - Fictional title\r\n      continued\r\nAU  - Example, Ana\r\nAU  - Other, Ben\r\nA1  - Example, Ana\r\nJF  - Example Journal\r\nDA  - 2024/02/29\r\nDO  - doi:10.5555/example\r\nSP  - 11\r\nEP  - 22\r\nVL  - 8\r\nIS  - 2\r\nER  -\r\nTY  - BOOK\r\nTI  - Second source\r\nPB  - Fictional Press\r\nPY  - 2020///\r\nER  -\r\n";
  const parsed = I.parse(text);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].title, "Fictional title continued");
  assert.equal(parsed.items[0].authors.length, 2);
  assert.deepEqual(plain(parsed.items[0].issued), { year: 2024, month: 2, day: 29 });
  assert.equal(parsed.items[0].page, "11-22");
  assert.equal(parsed.items[0].DOI, "10.5555/example");
  assert.ok(parsed.warnings.some((issue) => issue.code === "duplicate_author"));
  assert.deepEqual(plain(parsed.items[1].issued), { year: 2020 });
});

test("RIS conflicting title and ambiguous freeform dates require review", () => {
  const parsed = I.parse("TY  - ELEC\nTI  - Chosen\nT1  - Different\nPY  - Spring 2024\nAU  - Fictional Institute\nUR  - https://example.com/\nER  -\n");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items[0].title, "Chosen");
  assert.equal(parsed.items[0].issued, null);
  for (const code of ["type_review", "field_conflict", "date_not_imported", "author_name_review"]) {
    assert.ok(parsed.warnings.some((issue) => issue.code === code), code);
  }
});

for (const [label, text, code] of [
  ["duplicate CSL keys", '{"type":"book","title":"one","title":"two"}', "duplicate_key"],
  ["dangerous escaped JSON keys", '[{"type":"book","title":"safe","extra":{"\\u005f_proto__":"x"}}]', "forbidden_key"],
  ["duplicate BibTeX fields", '@book{x,title={One},title={Two}}', "duplicate_key"],
  ["duplicate macro", '@string{foo={a}}@string{foo={b}}@book{x,title={Title}}', "duplicate_key"],
  ["unknown macro", '@book{x,title=notdefined}', "bibtex_macro_unsupported"],
  ["unclosed BibTeX", '@book{x,title={Title}', "bibtex_invalid"],
  ["unclosed RIS", 'TY  - BOOK\nTI  - Title\n', "ris_record_unterminated"],
  ["RIS nesting", 'TY  - BOOK\nTI  - Title\nTY  - BOOK\nER  -\n', "ris_record_unterminated"],
  ["unknown BibTeX type", '@inproceedings{x,title={Title}}', "type_unsupported"],
  ["unknown CSL type", JSON.stringify(csl({ type: "thesis" })), "type_unsupported"],
  ["unknown RIS type", 'TY  - THES\nTI  - Title\nER  -\n', "type_unsupported"],
  ["FormCapy envelope in CSL importer", '{"schema":"formcapy-citations","items":[]}', "csl_json_expected"],
  ["invalid calendar date", JSON.stringify(csl({ issued: { "date-parts": [[2023, 2, 29]] } })), "date_invalid"],
]) {
  test(`rejects ${label} atomically`, () => rejects(text, code));
}

test("rejects byte overflow, author/item limits, nesting and node complexity", () => {
  rejects("x".repeat(I.MAX_BYTES + 1), "input_too_large");
  rejects("中".repeat(350000), "input_too_large");
  rejects(JSON.stringify(Array.from({ length: 201 }, () => csl())), "too_many_items");
  rejects(JSON.stringify(csl({ author: Array.from({ length: 51 }, () => ({ family: "Example" })) })), "too_many_authors");
  rejects('['.repeat(34) + '0' + ']'.repeat(34), "input_too_deep");
  rejects('[' + '0,'.repeat(50000) + '0]', "input_too_complex");
  rejects('@book{x,title={' + '{'.repeat(33) + 'x' + '}'.repeat(33) + '}}', "input_too_deep");
});

for (const value of ["\u0000", "\u007f", "\u0085", "\u202e", "\u2066", "\u200e"]) {
  test(`rejects hidden control U+${value.codePointAt(0).toString(16).padStart(4, "0")}`, () => {
    rejects(JSON.stringify(csl({ title: "A" + value + "title" })), "control_character");
  });
}

test("rejects invalid Unicode, unsafe URL and overlong metadata", () => {
  rejects(JSON.stringify(csl({ title: "bad\ud800" })), "invalid_unicode");
  rejects(JSON.stringify(csl({ URL: "javascript:alert(1)" })), "url_invalid");
  rejects(JSON.stringify(csl({ title: "x".repeat(5001) })), "text_too_long");
});

test("malformed batch leaves existing library and prior successful parse untouched", () => {
  const existing = [item({ id: "keep" })];
  const before = JSON.stringify(existing);
  const good = I.parse(JSON.stringify(csl()));
  const goodBefore = JSON.stringify(good);
  const bad = I.parse(JSON.stringify([csl(), csl({ type: "thesis" })]));
  assert.equal(bad.ok, false);
  assert.equal(bad.items.length, 0);
  const plan = I.planAppend(existing, [item({ title: "" })]);
  assert.equal(plan.ok, false);
  assert.equal(plan.added, 0);
  assert.equal(JSON.stringify(existing), before);
  assert.equal(JSON.stringify(good), goodBefore);
});

test("append skips DOI case/resolver duplicates and exact bibliographies, reassigns IDs and clones data", () => {
  const existing = [item({ id: "import_1", DOI: "10.5555/example" })];
  const incoming = [item({ id: "import_1", title: "Changed metadata", DOI: "https://doi.org/10.5555/EXAMPLE" }),
    item({ id: "import_1", title: "New source", DOI: "10.5555/new" }),
    item({ id: "import_1", title: "New source", DOI: "10.5555/new" })];
  const before = JSON.stringify([existing, incoming]);
  const plan = I.planAppend(existing, incoming);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.added, 1);
  assert.equal(plan.skipped, 2);
  assert.deepEqual(plain(plan.items.map((value) => value.id)), ["import_1", "import_2"]);
  assert.equal(JSON.stringify([existing, incoming]), before);
  plan.items[0].authors[0].family = "Changed";
  plan.items[1].issued.year = 1900;
  assert.equal(existing[0].authors[0].family, "Example");
  assert.equal(incoming[1].issued.year, 2024);
});

test("conservative fallback preserves distinct DOI, URL path case, edition, coauthors and date precision", () => {
  const existing = [item({ id: "keep" })];
  const incoming = [item({ DOI: "10.5555/one" }), item({ DOI: "10.5555/two" }),
    item({ URL: "https://example.com/Paper" }), item({ URL: "https://example.com/paper" }),
    item({ edition: "2" }), item({ authors: [{ family: "Example", given: "Ana" }, { literal: "Other Group" }] }),
    item({ issued: { year: 2024, month: 1 } })];
  const plan = I.planAppend(existing, incoming);
  assert.equal(plan.ok, true, JSON.stringify(plan.errors));
  assert.equal(plan.added, 7);
  assert.equal(plan.skipped, 0);
});

test("append rejects cycles/accessors/prototype keys without running getters or modifying source", () => {
  const cycle = item(); cycle.extra = cycle;
  assert.equal(I.planAppend([], [cycle]).ok, false);
  const accessor = item();
  let invoked = false;
  Object.defineProperty(accessor, "title", { enumerable: true, get() { invoked = true; return "Unsafe"; } });
  const rejected = I.planAppend([], [accessor]);
  assert.equal(rejected.ok, false);
  assert.equal(invoked, false);
  const bad = JSON.parse(JSON.stringify(item()).replace('"title":', '"__proto__":{},"title":'));
  assert.equal(I.planAppend([], [bad]).errors[0].code, "forbidden_key");
});

test("append enforces combined item count and exported library byte limit atomically", () => {
  const existing = Array.from({ length: 200 }, (_, index) => item({ id: "old_" + index, title: "Existing " + index }));
  const before = JSON.stringify(existing);
  const tooMany = I.planAppend(existing, [item({ title: "A new source" })]);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.errors[0].code, "too_many_items");
  assert.equal(JSON.stringify(existing), before);
  const oversized = Array.from({ length: 110 }, (_, index) => item({ title: "Item " + index,
    originalText: "中".repeat(3500) }));
  const oversizedBefore = JSON.stringify(oversized);
  const tooLarge = I.planAppend([], oversized);
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.errors[0].code, "json_too_large", JSON.stringify(tooLarge.errors));
  assert.equal(JSON.stringify(oversized), oversizedBefore);
});

test("combined persisted size is bounded even when each input library separately fits", () => {
  const first = Array.from({ length: 55 }, (_, index) => item({ id: "keep_" + index, title: "Existing " + index,
    originalText: "中".repeat(3500) }));
  const incoming = Array.from({ length: 55 }, (_, index) => item({ title: "Incoming " + index,
    originalText: "中".repeat(3500) }));
  assert.doesNotThrow(() => M.stringifyLibrary({ schema: M.SCHEMA, v: M.VERSION, items: first }));
  assert.equal(I.planAppend([], incoming).ok, true);
  const before = JSON.stringify([first, incoming]);
  const result = I.planAppend(first, incoming);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "json_too_large");
  assert.equal(JSON.stringify([first, incoming]), before);
});
