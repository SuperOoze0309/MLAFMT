/* FormCapy citation library model.
 *
 * Pure data model: no DOM, storage, network or engine imports. The UI owns
 * persistence and the render engine; this file validates and maps the local
 * bibliography schema to CSL JSON for the engine.
 */
(function (root) {
  "use strict";

  const SCHEMA = "formcapy-citations";
  const VERSION = 1;
  const TYPES = Object.freeze(["book", "article-journal", "webpage"]);
  const MAX_ITEMS = 200;
  const MAX_AUTHORS = 50;
  const MAX_FIELD = 5000;
  const MAX_ORIGINAL = 10000;
  const MAX_JSON_BYTES = 1048576;
  const MAX_JSON_DEPTH = 32;
  const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const ITEM_KEYS = Object.freeze([
    "id", "type", "title", "authors", "issued", "publisher",
    "containerTitle", "volume", "issue", "page", "edition", "DOI",
    "URL", "accessed", "language", "originalText",
  ]);
  const AUTHOR_KEYS = Object.freeze(["family", "given", "literal"]);
  const DATE_KEYS = Object.freeze(["year", "month", "day"]);
  const ENVELOPE_KEYS = Object.freeze(["schema", "v", "items"]);
  const AUTHOR_ITEM_KEYS = new Set(AUTHOR_KEYS);
  const ITEM_KEY_SET = new Set(ITEM_KEYS);

  class CitationError extends Error {
    constructor(code, path) {
      super(code);
      this.name = "CitationError";
      this.code = code;
      this.path = path || "";
    }
  }

  class JsonError extends Error {
    constructor(code, path) {
      super(code);
      this.name = "JsonError";
      this.code = code;
      this.path = path || "";
    }
  }

  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isArray = Array.isArray;
  const isInteger = (value) => typeof value === "number" && Number.isSafeInteger(value);
  const isPlain = (value) => {
    if (value === null || typeof value !== "object" || isArray(value)) return false;
    // Accept plain objects from another VM realm as well as local ones.
    return Object.prototype.toString.call(value) === "[object Object]";
  };
  const add = (list, code, path) => list.push({ code, path });

  function utf8Length(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    let length = 0;
    for (const character of text) {
      const point = character.codePointAt(0);
      length += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    }
    return length;
  }

  function checkText(value, path, maximum, errors, { multiline = false } = {}) {
    if (typeof value !== "string") {
      add(errors, "expected_text", path);
      return;
    }
    if (value.length > maximum) add(errors, "text_too_long", path);
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          index += 1;
          continue;
        }
        add(errors, "invalid_unicode", path);
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        add(errors, "invalid_unicode", path);
        continue;
      }
      if (code < 0x20) {
        if (multiline && (code === 0x09 || code === 0x0a || code === 0x0d)) continue;
        add(errors, "control_character", path);
        continue;
      }
      if (code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
        add(errors, "control_character", path);
        continue;
      }
      if ((code >= 0x202a && code <= 0x202e) ||
          (code >= 0x2066 && code <= 0x2069) ||
          code === 0x200e || code === 0x200f || code === 0x061c) {
        add(errors, "control_character", path);
      }
    }
  }

  function daysInMonth(year, month) {
    if (month === 2) {
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return leap ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
  }

  function checkDate(value, path, errors) {
    if (value === null || value === undefined) return;
    if (!isPlain(value)) {
      add(errors, "date_invalid", path);
      return;
    }
    for (const key of Object.keys(value)) {
      if (!DATE_KEYS.includes(key)) add(errors, "unknown_field", path + "." + key);
    }
    if (!has(value, "year")) {
      add(errors, "date_year_required", path);
      return;
    }
    const year = value.year;
    if (!isInteger(year) || year < 1 || year > 9999) {
      add(errors, "date_invalid", path + ".year");
      return;
    }
    if (has(value, "month")) {
      if (!isInteger(value.month) || value.month < 1 || value.month > 12) {
        add(errors, "date_invalid", path + ".month");
        return;
      }
    } else if (has(value, "day")) {
      add(errors, "date_month_required", path);
      return;
    }
    if (has(value, "day")) {
      if (!isInteger(value.day) || value.day < 1 ||
          value.day > daysInMonth(year, value.month)) {
        add(errors, "date_invalid", path + ".day");
      }
    }
  }

  function checkUrl(value, path, errors) {
    if (!value) return;
    if (value.trim() !== value || /\s/.test(value)) {
      add(errors, "url_invalid", path);
      return;
    }
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname ||
          parsed.username || parsed.password) {
        add(errors, "url_invalid", path);
      }
    } catch (_) {
      add(errors, "url_invalid", path);
    }
  }

  function checkAuthors(value, path, errors) {
    if (!isArray(value)) {
      add(errors, "authors_invalid", path);
      return;
    }
    if (value.length > MAX_AUTHORS) {
      add(errors, "too_many_authors", path);
      return;
    }
    value.forEach((author, index) => {
      const authorPath = `${path}[${index}]`;
      if (!isPlain(author)) {
        add(errors, "author_invalid", authorPath);
        return;
      }
      for (const key of Object.keys(author)) {
        if (!AUTHOR_ITEM_KEYS.has(key)) add(errors, "unknown_field", authorPath + "." + key);
      }
      const literal = has(author, "literal") ? author.literal : "";
      const family = has(author, "family") ? author.family : "";
      const given = has(author, "given") ? author.given : "";
      const hasLiteral = has(author, "literal");
      const hasName = has(author, "family") || has(author, "given");
      if (hasLiteral && hasName) add(errors, "author_literal_exclusive", authorPath);
      if (hasLiteral) {
        if (typeof literal !== "string") {
          add(errors, "expected_text", authorPath + ".literal");
        } else {
          checkText(literal, authorPath + ".literal", MAX_FIELD, errors);
          if (!literal.trim()) add(errors, "author_empty", authorPath);
        }
        return;
      }
      if (!(typeof family === "string" && family.trim()) &&
          !(typeof given === "string" && given.trim())) {
        add(errors, "author_empty", authorPath);
        return;
      }
      if (has(author, "family")) checkText(family, authorPath + ".family", MAX_FIELD, errors);
      if (has(author, "given")) checkText(given, authorPath + ".given", MAX_FIELD, errors);
    });
  }

  function checkStringField(item, key, path, errors, maximum = MAX_FIELD, multiline = false) {
    if (has(item, key)) checkText(item[key], path + "." + key, maximum, errors, { multiline });
  }

  function collectItem(item, path, { requireTitle = true } = {}) {
    const errors = [];
    const warnings = [];
    if (!isPlain(item)) {
      add(errors, "item_invalid", path);
      return { errors, warnings };
    }
    for (const key of Object.keys(item)) {
      if (!ITEM_KEY_SET.has(key)) add(errors, "unknown_field", path + "." + key);
    }
    if (!has(item, "id") || typeof item.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) {
      add(errors, "item_id_invalid", path + ".id");
    }
    if (!has(item, "type") || !TYPES.includes(item.type)) {
      add(errors, "item_type_invalid", path + ".type");
    }
    if (!has(item, "title") || typeof item.title !== "string") {
      add(errors, "title_required", path + ".title");
    } else {
      checkText(item.title, path + ".title", MAX_FIELD, errors);
      if (requireTitle && !item.title.trim()) add(errors, "title_required", path + ".title");
    }
    if (!has(item, "authors")) {
      add(warnings, "author_missing", path);
    } else if (!isArray(item.authors)) {
      add(errors, "authors_invalid", path + ".authors");
    } else {
      checkAuthors(item.authors, path + ".authors", errors);
      if (item.authors.length === 0) add(warnings, "author_missing", path);
    }
    if (!has(item, "issued") || item.issued === null || item.issued === undefined) {
      add(warnings, "year_missing", path);
    } else {
      checkDate(item.issued, path + ".issued", errors);
    }
    if (has(item, "accessed") && item.accessed !== null && item.accessed !== undefined) {
      checkDate(item.accessed, path + ".accessed", errors);
    }
    for (const key of [
      "publisher", "containerTitle", "volume", "issue", "page", "edition",
      "DOI", "URL", "language",
    ]) {
      checkStringField(item, key, path, errors);
    }
    checkStringField(item, "originalText", path, errors, MAX_ORIGINAL, true);
    if (has(item, "language") && typeof item.language === "string" &&
        item.language.length > 64) {
      add(errors, "text_too_long", path + ".language");
    }
    if (has(item, "URL") && item.URL) checkUrl(item.URL, path + ".URL", errors);
    if (has(item, "DOI") && item.DOI && !/^10\.\d{4,9}\/\S+$/.test(item.DOI)) {
      add(warnings, "doi_format", path + ".DOI");
    }
    if (item.type === "book" && !(typeof item.publisher === "string" ? item.publisher.trim() : "")) {
      add(warnings, "publisher_missing", path);
    }
    if (item.type === "article-journal" &&
        !(typeof item.containerTitle === "string" ? item.containerTitle.trim() : "")) {
      add(warnings, "container_missing", path);
    }
    if (item.type === "webpage") {
      if (!(typeof item.containerTitle === "string" ? item.containerTitle.trim() : "")) {
        add(warnings, "container_missing", path);
      }
      if (!(typeof item.URL === "string" ? item.URL.trim() : "")) {
        add(warnings, "url_missing", path);
      }
      if (!item.accessed) add(warnings, "accessed_missing", path);
    }
    return { errors, warnings };
  }

  function normalizeDate(value, path) {
    if (value === null || value === undefined || value === "") return null;
    if (!isPlain(value)) throw new CitationError("date_invalid", path);
    const result = {};
    for (const key of DATE_KEYS) {
      if (has(value, key) && value[key] !== null && value[key] !== "") result[key] = value[key];
    }
    return Object.keys(result).length ? result : null;
  }

  function normalizeAuthor(author, path) {
    if (!isPlain(author)) throw new CitationError("author_invalid", path);
    for (const key of Object.keys(author)) {
      if (!AUTHOR_ITEM_KEYS.has(key)) throw new CitationError("unknown_field", path + "." + key);
    }
    const result = {};
    for (const key of AUTHOR_KEYS) {
      if (!has(author, key)) continue;
      if (typeof author[key] !== "string") throw new CitationError("expected_text", path + "." + key);
      result[key] = author[key];
    }
    if (has(result, "literal") && (has(result, "family") || has(result, "given"))) {
      throw new CitationError("author_literal_exclusive", path);
    }
    if (has(result, "literal")) {
      if (!result.literal.trim()) throw new CitationError("author_empty", path);
    } else if (!result.family?.trim() && !result.given?.trim()) {
      throw new CitationError("author_empty", path);
    }
    return result;
  }

  function newId() {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === "function") {
        return "cit_" + root.crypto.randomUUID().replace(/-/g, "");
      }
    } catch (_) {}
    let value = "cit_";
    while (value.length < 32) value += Math.random().toString(36).slice(2);
    return value.slice(0, 32);
  }

  function blankItem(input = {}) {
    if (!isPlain(input)) throw new CitationError("item_invalid", "item");
    for (const key of Object.keys(input)) {
      if (!ITEM_KEY_SET.has(key)) throw new CitationError("unknown_field", "item." + key);
    }
    const item = {
      id: has(input, "id") ? input.id : newId(),
      type: has(input, "type") ? input.type : "book",
      title: has(input, "title") ? input.title : "",
      authors: has(input, "authors") ? input.authors : [],
      issued: normalizeDate(has(input, "issued") ? input.issued : null, "item.issued"),
      publisher: has(input, "publisher") ? input.publisher : "",
      containerTitle: has(input, "containerTitle") ? input.containerTitle : "",
      volume: has(input, "volume") ? input.volume : "",
      issue: has(input, "issue") ? input.issue : "",
      page: has(input, "page") ? input.page : "",
      edition: has(input, "edition") ? input.edition : "",
      DOI: has(input, "DOI") ? input.DOI : "",
      URL: has(input, "URL") ? input.URL : "",
      accessed: normalizeDate(has(input, "accessed") ? input.accessed : null, "item.accessed"),
      language: has(input, "language") ? input.language : "",
      originalText: has(input, "originalText") ? input.originalText : "",
    };
    if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) {
      throw new CitationError("item_id_invalid", "item.id");
    }
    if (!TYPES.includes(item.type)) throw new CitationError("item_type_invalid", "item.type");
    if (!isArray(item.authors)) throw new CitationError("authors_invalid", "item.authors");
    if (item.authors.length > MAX_AUTHORS) throw new CitationError("too_many_authors", "item.authors");
    item.authors = item.authors.map((author, index) => normalizeAuthor(author, `item.authors[${index}]`));
    const result = collectItem(item, "item", { requireTitle: false });
    const structural = result.errors.filter((issue) => issue.code !== "title_required");
    if (structural.length) throw new CitationError(structural[0].code, structural[0].path);
    return item;
  }

  function validateItem(item) {
    const result = collectItem(item, "item", { requireTitle: true });
    return {
      valid: result.errors.length === 0,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  function validateLibrary(library) {
    const errors = [];
    const warnings = [];
    if (!isPlain(library)) {
      add(errors, "library_invalid", "library");
      return { valid: false, errors, warnings };
    }
    for (const key of Object.keys(library)) {
      if (!ENVELOPE_KEYS.includes(key)) add(errors, "unknown_field", "library." + key);
    }
    if (library.schema !== SCHEMA) add(errors, "schema_invalid", "library.schema");
    if (library.v !== VERSION) add(errors, "version_unsupported", "library.v");
    if (!isArray(library.items)) {
      add(errors, "library_items_invalid", "library.items");
      return { valid: errors.length === 0, errors, warnings };
    }
    if (library.items.length > MAX_ITEMS) {
      add(errors, "too_many_items", "library.items");
      return { valid: false, errors, warnings };
    }
    const ids = new Set();
    library.items.forEach((item, index) => {
      const path = `library.items[${index}]`;
      const result = collectItem(item, path, { requireTitle: true });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      if (isPlain(item) && typeof item.id === "string") {
        if (ids.has(item.id)) add(errors, "duplicate_id", path + ".id");
        ids.add(item.id);
      }
    });
    return { valid: errors.length === 0, errors, warnings };
  }

  function createLibrary(items = []) {
    if (!isArray(items)) throw new CitationError("library_items_invalid", "items");
    const library = {
      schema: SCHEMA,
      v: VERSION,
      items: items.map((item) => blankItem(item)),
    };
    const result = validateLibrary(library);
    if (!result.valid) throw new CitationError(result.errors[0].code, result.errors[0].path);
    return library;
  }

  function stringifyLibrary(library) {
    const result = validateLibrary(library);
    if (!result.valid) throw new CitationError(result.errors[0].code, result.errors[0].path);
    const clean = {
      schema: SCHEMA,
      v: VERSION,
      items: library.items.map((item) => {
        const authors = Array.isArray(item.authors) ? item.authors : [];
        const copy = { id: item.id, type: item.type, title: item.title, authors: authors.map((author) => ({ ...author })) };
        copy.issued = item.issued ? { ...item.issued } : null;
        copy.publisher = item.publisher || "";
        copy.containerTitle = item.containerTitle || "";
        copy.volume = item.volume || "";
        copy.issue = item.issue || "";
        copy.page = item.page || "";
        copy.edition = item.edition || "";
        copy.DOI = item.DOI || "";
        copy.URL = item.URL || "";
        copy.accessed = item.accessed ? { ...item.accessed } : null;
        copy.language = item.language || "";
        copy.originalText = item.originalText || "";
        return copy;
      }),
    };
    const compact = JSON.stringify(clean);
    if (utf8Length(compact) > MAX_JSON_BYTES) {
      throw new CitationError("json_too_large", "library");
    }
    const pretty = JSON.stringify(clean, null, 2) + "\n";
    return utf8Length(pretty) <= MAX_JSON_BYTES ? pretty : compact;
  }

  function dateParts(date) {
    if (!date || !isInteger(date.year)) return null;
    if (isInteger(date.month) && isInteger(date.day)) return [[date.year, date.month, date.day]];
    if (isInteger(date.month)) return [[date.year, date.month]];
    return [[date.year]];
  }

  function toCslItem(item) {
    const result = {
      id: item.id,
      type: item.type,
      title: item.title,
    };
    if (Array.isArray(item.authors) && item.authors.length) {
      result.author = item.authors.map((author) => {
        if (author.literal) return { literal: author.literal };
        const output = {};
        if (author.family) output.family = author.family;
        if (author.given) output.given = author.given;
        return output;
      });
    }
    const issued = dateParts(item.issued);
    if (issued) result.issued = { "date-parts": issued };
    if (item.publisher) result.publisher = item.publisher;
    if (item.containerTitle) result["container-title"] = item.containerTitle;
    if (item.volume) result.volume = item.volume;
    if (item.issue) result.issue = item.issue;
    if (item.page) result.page = item.page;
    if (item.edition) result.edition = item.edition;
    if (item.DOI) result.DOI = item.DOI;
    if (item.URL) result.URL = item.URL;
    const accessed = dateParts(item.accessed);
    if (accessed) result.accessed = { "date-parts": accessed };
    if (item.language) result.language = item.language;
    return result;
  }

  function toCslItems(library) {
    const result = validateLibrary(library);
    if (!result.valid) throw new CitationError(result.errors[0].code, result.errors[0].path);
    return library.items.map(toCslItem);
  }

  function parseStrictJson(text) {
    let index = 0;
    let nodes = 0;
    let depth = 0;
    const length = text.length;
    const fail = (code, path) => { throw new JsonError(code, path); };
    const whitespace = () => {
      while (index < length && (text[index] === " " || text[index] === "\t" ||
        text[index] === "\n" || text[index] === "\r")) index += 1;
    };
    const readString = () => {
      if (text[index] !== '"') fail("json_string_expected", "$");
      index += 1;
      let result = "";
      while (index < length) {
        const code = text.charCodeAt(index);
        if (code === 0x22) {
          index += 1;
          return result;
        }
        if (code < 0x20) fail("json_control_character", "$");
        if (code === 0x5c) {
          index += 1;
          if (index >= length) fail("json_invalid_escape", "$");
          const escaped = text[index];
          index += 1;
          const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (Object.prototype.hasOwnProperty.call(simple, escaped)) {
            result += simple[escaped];
          } else if (escaped === "u") {
            const hex = text.slice(index, index + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("json_invalid_escape", "$");
            result += String.fromCharCode(parseInt(hex, 16));
            index += 4;
          } else {
            fail("json_invalid_escape", "$");
          }
          continue;
        }
        result += text[index];
        index += 1;
      }
      fail("json_unterminated_string", "$");
    };
    const readNumber = () => {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index, index + 400));
      if (!match || match[0].length >= 400) fail("json_number_invalid", "$");
      index += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) fail("json_number_invalid", "$");
      return value;
    };
    const value = (path) => {
      nodes += 1;
      if (nodes > 50000) fail("json_too_complex", path);
      whitespace();
      if (index >= length) fail("json_unexpected_end", path);
      const character = text[index];
      if (character === "{") {
        depth += 1;
        if (depth > MAX_JSON_DEPTH) fail("json_too_deep", path);
        index += 1;
        const object = {};
        const keys = new Set();
        whitespace();
        if (text[index] === "}") {
          index += 1;
          depth -= 1;
          return object;
        }
        while (index < length) {
          whitespace();
          if (text[index] !== '"') fail("json_key_expected", path);
          const key = readString();
          if (FORBIDDEN_KEYS.has(key)) fail("forbidden_key", path + "." + key);
          if (keys.has(key)) fail("duplicate_key", path + "." + key);
          keys.add(key);
          whitespace();
          if (text[index] !== ":") fail("json_colon_expected", path);
          index += 1;
          object[key] = value(path + "." + key);
          whitespace();
          if (text[index] === "}") {
            index += 1;
            depth -= 1;
            return object;
          }
          if (text[index] !== ",") fail("json_comma_expected", path);
          index += 1;
        }
        fail("json_unterminated_object", path);
      }
      if (character === "[") {
        depth += 1;
        if (depth > MAX_JSON_DEPTH) fail("json_too_deep", path);
        index += 1;
        const array = [];
        whitespace();
        if (text[index] === "]") {
          index += 1;
          depth -= 1;
          return array;
        }
        while (index < length) {
          array.push(value(path + "[" + array.length + "]"));
          whitespace();
          if (text[index] === "]") {
            index += 1;
            depth -= 1;
            return array;
          }
          if (text[index] !== ",") fail("json_comma_expected", path);
          index += 1;
        }
        fail("json_unterminated_array", path);
      }
      if (character === '"') return readString();
      if (character === "t" && text.slice(index, index + 4) === "true") {
        index += 4;
        return true;
      }
      if (character === "f" && text.slice(index, index + 5) === "false") {
        index += 5;
        return false;
      }
      if (character === "n" && text.slice(index, index + 4) === "null") {
        index += 4;
        return null;
      }
      if (character === "-" || (character >= "0" && character <= "9")) return readNumber();
      fail("json_unexpected_character", path);
    };
    const result = value("$");
    whitespace();
    if (index !== length) fail("json_trailing_content", "$");
    return result;
  }

  function parseLibraryJson(text) {
    if (typeof text !== "string") {
      return { ok: false, errors: [{ code: "json_invalid", path: "$" }], warnings: [] };
    }
    if (text.length > MAX_JSON_BYTES || utf8Length(text) > MAX_JSON_BYTES) {
      return { ok: false, errors: [{ code: "json_too_large", path: "$" }], warnings: [] };
    }
    let parsed;
    try {
      parsed = parseStrictJson(text);
    } catch (error) {
      if (error instanceof JsonError) {
        return { ok: false, errors: [{ code: error.code, path: error.path }], warnings: [] };
      }
      return { ok: false, errors: [{ code: "json_invalid", path: "$" }], warnings: [] };
    }
    const result = validateLibrary(parsed);
    if (!result.valid) return { ok: false, errors: result.errors, warnings: result.warnings };
    return { ok: true, library: parsed, warnings: result.warnings };
  }

  const api = Object.freeze({
    SCHEMA,
    VERSION,
    TYPES,
    MAX_ITEMS,
    MAX_AUTHORS,
    MAX_FIELD,
    MAX_ORIGINAL,
    MAX_JSON_BYTES,
    MAX_JSON_DEPTH,
    ITEM_KEYS,
    AUTHOR_KEYS,
    DATE_KEYS,
    CitationError,
    newId,
    createItem: blankItem,
    createLibrary,
    validateItem,
    validateLibrary,
    parseLibraryJson,
    stringifyLibrary,
    toCslItems,
    toCslItem,
    dateParts,
    utf8Length,
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FormCapyCitations = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
