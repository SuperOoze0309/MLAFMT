/* Offline bibliography intake. No DOM, storage, network, or code evaluation.
 *
 * The local library remains the authority for item validation. Source formats
 * are deliberately narrower than their full specifications: unsupported data
 * is reported, and a malformed record prevents the entire batch from being
 * appended. Reading a file never changes the existing library.
 */
(function (root) {
  "use strict";

  const model = root.FormCapyCitations ||
    (typeof module !== "undefined" && module.exports ? require("./citation-library.js") : null);
  const MAX_BYTES = 1048576;
  const MAX_ITEMS = 200;
  const MAX_AUTHORS = 50;
  const MAX_FIELD = 5000;
  const MAX_ORIGINAL = 10000;
  const MAX_DEPTH = 32;
  const MAX_NODES = 50000;
  const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const MONTHS = Object.freeze({ jan: "1", feb: "2", mar: "3", apr: "4", may: "5", jun: "6",
    jul: "7", aug: "8", sep: "9", oct: "10", nov: "11", dec: "12" });
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = (value) => value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.prototype.toString.call(value) === "[object Object]";
  const present = (value) => value !== undefined && value !== null && value !== "" &&
    !(Array.isArray(value) && value.length === 0);

  class IntakeError extends Error {
    constructor(code, path) {
      super(code);
      this.code = code;
      this.path = path || "$";
    }
  }

  function fail(code, path) { throw new IntakeError(code, path); }
  function bytes(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    let count = 0;
    for (const char of text) {
      const point = char.codePointAt(0);
      count += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    }
    return count;
  }
  function warning(context, code, index, field) {
    const key = [code, index, field].join("\u0000");
    if (context.seen.has(key)) return;
    context.seen.add(key);
    const issue = { code };
    if (index !== undefined) issue.index = index;
    if (field) issue.field = field;
    context.warnings.push(issue);
  }
  function sourceText(text, context, index) {
    if (text.length <= MAX_ORIGINAL) return text;
    warning(context, "original_text_truncated", index, "originalText");
    let end = MAX_ORIGINAL;
    if (text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end -= 1;
    return text.slice(0, end);
  }
  function safeText(value, path, multiline) {
    for (let cursor = 0; cursor < value.length; cursor += 1) {
      const code = value.charCodeAt(cursor);
      if (code === 0xfffe || code === 0xffff) fail("invalid_unicode", path);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(cursor + 1);
        if (next < 0xdc00 || next > 0xdfff || !Number.isFinite(next)) fail("invalid_unicode", path);
        cursor += 1;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) fail("invalid_unicode", path);
      if ((code < 32 && !(multiline && [9, 10, 13].includes(code))) ||
          (code >= 0x7f && code <= 0x9f) || (code >= 0x202a && code <= 0x202e) ||
          (code >= 0x2066 && code <= 0x2069) || [0x200e, 0x200f, 0x061c].includes(code)) fail("control_character", path);
    }
  }
  function textField(value, path) {
    if (typeof value !== "string") fail("expected_text", path);
    if (value.length > MAX_FIELD) fail("text_too_long", path);
    safeText(value, path, true);
    return value.replace(/[\t\r\n]+/g, " ").trim();
  }
  function scalar(value, path) {
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    return textField(value, path);
  }
  function normalizeDoi(value) {
    const text = String(value || "").trim().replace(/^doi\s*:\s*/i, "");
    if (!/^https?:\/\/(?:dx\.)?doi\.org\//i.test(text)) return text;
    try {
      const path = new URL(text).pathname.slice(1);
      // A resolver URL encodes its path once. Percent sequences in a raw DOI
      // are left alone because decoding them could change the identifier.
      try { return decodeURIComponent(path); } catch (_) { return path; }
    } catch (_) { return text; }
  }
  function safeDoiKey(value) {
    const doi = normalizeDoi(value);
    return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi.toLowerCase() : "";
  }
  function choose(fields, names, context, index, outputField) {
    const found = names.filter((name) => has(fields, name) && present(fields[name]));
    if (!found.length) return "";
    const first = Array.isArray(fields[found[0]]) ? fields[found[0]][0] : fields[found[0]];
    for (const name of found) {
      const values = Array.isArray(fields[name]) ? fields[name] : [fields[name]];
      if (values.some((value) => value !== first)) warning(context, "field_conflict", index, outputField);
    }
    return first;
  }

  // Strict JSON parsing detects duplicate keys before JSON.parse could erase
  // them. Every value and nesting level is bounded; dangerous keys are refused
  // even when they occur in fields that will not be imported.
  function strictJson(text) {
    let position = 0;
    let nodes = 0;
    const spans = new WeakMap();
    const whitespace = () => { while (position < text.length && /[ \t\r\n]/.test(text[position])) position += 1; };
    const readString = (path) => {
      const start = position;
      position += 1;
      while (position < text.length) {
        const char = text[position];
        if (char === '"') {
          position += 1;
          try { return JSON.parse(text.slice(start, position)); }
          catch (_) { fail("json_invalid", path); }
        }
        if (char.charCodeAt(0) < 32) fail("json_invalid", path);
        if (char === "\\") {
          position += 1;
          if (position >= text.length) fail("json_invalid", path);
          if (text[position] === "u") {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(position + 1, position + 5))) fail("json_invalid", path);
            position += 4;
          } else if (!'"\\/bfnrt'.includes(text[position])) fail("json_invalid", path);
        }
        position += 1;
      }
      fail("json_invalid", path);
    };
    const value = (path, depth) => {
      if (++nodes > MAX_NODES) fail("input_too_complex", path);
      if (depth > MAX_DEPTH) fail("input_too_deep", path);
      whitespace();
      const start = position;
      const char = text[position];
      if (char === '"') return readString(path);
      if (char === "{" || char === "[") {
        const object = char === "{" ? Object.create(null) : [];
        const closing = char === "{" ? "}" : "]";
        const keys = new Set();
        position += 1;
        whitespace();
        if (text[position] !== closing) {
          while (position < text.length) {
            let key;
            whitespace();
            if (char === "{") {
              if (text[position] !== '"') fail("json_invalid", path);
              key = readString(path);
              if (BAD_KEYS.has(key)) fail("forbidden_key", path + "." + key);
              if (keys.has(key)) fail("duplicate_key", path + "." + key);
              keys.add(key);
              whitespace();
              if (text[position++] !== ":") fail("json_invalid", path);
            } else key = object.length;
            object[key] = value(path + (char === "{" ? "." + key : "[" + key + "]"), depth + 1);
            whitespace();
            if (text[position] === closing) break;
            if (text[position++] !== ",") fail("json_invalid", path);
          }
        }
        if (text[position++] !== closing) fail("json_invalid", path);
        spans.set(object, [start, position]);
        return object;
      }
      for (const [literal, result] of [["true", true], ["false", false], ["null", null]]) {
        if (text.slice(position, position + literal.length) === literal) {
          position += literal.length;
          return result;
        }
      }
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(position, position + 400));
      if (!match || match[0].length >= 400) fail("json_invalid", path);
      position += match[0].length;
      const number = Number(match[0]);
      if (!Number.isFinite(number)) fail("json_invalid", path);
      return number;
    };
    const result = value("$", 0);
    whitespace();
    if (position !== text.length) fail("json_invalid", "$");
    return { value: result, spans };
  }

  function dateFromText(value, path, context, index, field) {
    if (!present(value)) return null;
    const text = textField(value, path);
    const match = /^(\d{1,4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?(\/*)$/.exec(text);
    if (!match) {
      warning(context, "date_not_imported", index, field);
      return null;
    }
    const date = { year: Number(match[1]) };
    if (match[2]) date.month = Number(match[2]);
    if (match[3]) date.day = Number(match[3]);
    return date;
  }

  function cslDate(value, path, context, index, field) {
    if (!present(value)) return null;
    if (!plain(value)) fail("date_invalid", path);
    for (const key of Object.keys(value)) {
      if (key !== "date-parts" && present(value[key])) warning(context, "field_not_imported", index, field + "." + key);
    }
    if (!has(value, "date-parts")) {
      warning(context, "date_not_imported", index, field);
      return null;
    }
    const parts = value["date-parts"];
    if (!Array.isArray(parts) || parts.length === 0 || !Array.isArray(parts[0]) ||
        parts[0].length === 0 || parts[0].length > 3 ||
        parts[0].some((part) => !Number.isSafeInteger(part))) fail("date_invalid", path);
    if (parts.length > 1) warning(context, "date_range_first_only", index, field);
    const date = { year: parts[0][0] };
    if (parts[0].length > 1) date.month = parts[0][1];
    if (parts[0].length > 2) date.day = parts[0][2];
    return date;
  }

  function parseCsl(text, context) {
    const parsed = strictJson(text);
    const records = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
    if (!records.length) fail("no_items", "$");
    if (records.length > MAX_ITEMS) fail("too_many_items", "$");
    return records.map((record, index) => {
      const path = "$[" + index + "]";
      if (!plain(record)) fail("item_invalid", path);
      if (has(record, "schema") || has(record, "items")) fail("csl_json_expected", path);
      if (!["book", "article-journal", "webpage"].includes(record.type)) fail("type_unsupported", path + ".type");
      const item = { id: "import_" + (index + 1), type: record.type,
        title: textField(record.title, path + ".title"), authors: [] };
      const recognized = new Set(["id", "type", "title", "author", "issued", "accessed", "publisher",
        "container-title", "volume", "issue", "page", "edition", "DOI", "URL", "language"]);
      for (const key of Object.keys(record)) {
        if (!recognized.has(key) && present(record[key])) warning(context, "field_not_imported", index, key);
      }
      if (present(record.author)) {
        if (!Array.isArray(record.author)) fail("authors_invalid", path + ".author");
        if (record.author.length > MAX_AUTHORS) fail("too_many_authors", path + ".author");
        item.authors = record.author.map((author, authorIndex) => {
          const authorPath = path + ".author[" + authorIndex + "]";
          if (!plain(author)) fail("author_invalid", authorPath);
          const mapped = {};
          for (const key of Object.keys(author)) {
            if (["given", "family", "literal"].includes(key)) mapped[key] = textField(author[key], authorPath + "." + key);
            else if (present(author[key])) warning(context, "field_not_imported", index, "author." + key);
          }
          return mapped;
        });
      }
      for (const [source, target] of [["publisher", "publisher"], ["container-title", "containerTitle"],
        ["volume", "volume"], ["issue", "issue"], ["page", "page"], ["edition", "edition"],
        ["DOI", "DOI"], ["URL", "URL"], ["language", "language"]]) {
        if (present(record[source])) item[target] = scalar(record[source], path + "." + source);
      }
      if (item.DOI) item.DOI = normalizeDoi(item.DOI);
      item.issued = cslDate(record.issued, path + ".issued", context, index, "issued");
      item.accessed = cslDate(record.accessed, path + ".accessed", context, index, "accessed");
      const span = parsed.spans.get(record);
      item.originalText = sourceText(span ? text.slice(span[0], span[1]) : "", context, index);
      return item;
    });
  }

  function splitTopLevel(text, separator) {
    const result = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "\\") { index += 1; continue; }
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") depth -= 1;
      if (depth > MAX_DEPTH || depth < 0) fail("input_too_deep", "$");
      if (depth !== 0) continue;
      const match = separator(text, index);
      if (match) {
        result.push(text.slice(start, index).trim());
        index += match - 1;
        start = index + 1;
      }
    }
    if (depth !== 0) fail("bibtex_invalid", "$");
    result.push(text.slice(start).trim());
    return result;
  }

  // Decode common textual TeX escapes without executing TeX. Unknown commands
  // remain visible and receive a warning rather than being silently removed.
  function bibText(value, context, index, field) {
    const accents = { "'": "\u0301", '"': "\u0308", "`": "\u0300", "^": "\u0302", "~": "\u0303",
      "=": "\u0304", ".": "\u0307", c: "\u0327", v: "\u030c", H: "\u030b", u: "\u0306", r: "\u030a",
      b: "\u0331", d: "\u0323" };
    const letters = { ae: "æ", AE: "Æ", oe: "œ", OE: "Œ", aa: "å", AA: "Å", o: "ø", O: "Ø",
      l: "ł", L: "Ł", ss: "ß", i: "ı", j: "ȷ", LaTeX: "LaTeX", TeX: "TeX", textendash: "–",
      textemdash: "—", textquotesingle: "'", textquotedbl: '"', textbackslash: "\\" };
    let output = "";
    for (let cursor = 0; cursor < value.length; cursor += 1) {
      const char = value[cursor];
      if (char === "{" || char === "}") continue;
      if (char === "~") { output += field === "URL" || field === "DOI" ? "~" : " "; continue; }
      if (char !== "\\") { output += char; continue; }
      const next = value[cursor + 1];
      if (!next) { output += "\\"; break; }
      if ("%&#_${}".includes(next)) { output += next; cursor += 1; continue; }
      if (next === " " || next === "\\") { output += " "; cursor += 1; continue; }
      if (has(accents, next) && (!/[A-Za-z]/.test(next) || !/[A-Za-z]/.test(value[cursor + 2] || ""))) {
        let offset = cursor + 2;
        while (value[offset] === " ") offset += 1;
        let braced = false;
        if (value[offset] === "{") { braced = true; offset += 1; }
        if (value[offset] && !"{}\\".includes(value[offset]) &&
            (!braced || value[offset + 1] === "}")) {
          output += (value[offset] + accents[next]).normalize("NFC");
          cursor = offset + (braced ? 1 : 0);
          continue;
        }
      }
      const command = /^[A-Za-z]+/.exec(value.slice(cursor + 1));
      if (command) {
        if (has(letters, command[0])) output += letters[command[0]];
        else if (["textit", "textbf", "emph", "textrm", "textnormal"].includes(command[0])) {
          warning(context, "formatting_not_imported", index, field);
        } else {
          output += "\\" + command[0];
          warning(context, "bibtex_latex_unconverted", index, field);
        }
        cursor += command[0].length;
      } else {
        output += "\\" + next;
        cursor += 1;
        warning(context, "bibtex_latex_unconverted", index, field);
      }
    }
    return textField(output, "$[" + index + "]." + field);
  }

  function bibLink(value, context, index, field) {
    const wrapped = /^\\url\{([\s\S]*)\}$/.exec(value.trim());
    return bibText(wrapped ? wrapped[1] : value, context, index, field);
  }

  function personalName(value, context, index, field, bibtex) {
    const raw = value.trim();
    if (!raw) fail("author_invalid", "$[" + index + "].authors");
    if (bibtex && raw[0] === "{" && raw[raw.length - 1] === "}") {
      // Only a single outer group denotes a corporate author; sibling groups
      // must still be treated as an ordinary name.
      let depth = 0;
      let outer = true;
      for (let cursor = 0; cursor < raw.length; cursor += 1) {
        if (raw[cursor] === "\\") { cursor += 1; continue; }
        if (raw[cursor] === "{") depth += 1;
        if (raw[cursor] === "}") depth -= 1;
        if (depth === 0 && cursor < raw.length - 1) outer = false;
      }
      if (outer) return { literal: bibText(raw.slice(1, -1), context, index, field) };
    }
    const parts = splitTopLevel(raw, (text, cursor) => text[cursor] === "," ? 1 : 0);
    const decode = (text) => bibtex ? bibText(text, context, index, field) : textField(text, "$[" + index + "]." + field);
    if (parts.length > 3) fail("author_invalid", "$[" + index + "].authors");
    if (parts.length > 1) {
      if (parts.length === 3) warning(context, "field_not_imported", index, "author.suffix");
      return { family: decode(parts[0]), given: decode(parts[parts.length - 1]) };
    }
    const name = decode(raw);
    const words = name.split(/\s+/);
    if (words.length === 1) return { family: name };
    if (!bibtex) warning(context, "author_name_review", index, field);
    let familyStart = words.length - 1;
    while (familyStart > 1 && /^[a-zà-öø-ÿ]/.test(words[familyStart - 1])) familyStart -= 1;
    return { given: words.slice(0, familyStart).join(" "), family: words.slice(familyStart).join(" ") };
  }

  function parseBibtex(text, context) {
    let position = 0;
    let entries = 0;
    const items = [];
    const macros = Object.assign(Object.create(null), MONTHS);
    const whitespace = () => {
      while (position < text.length) {
        if (/\s/.test(text[position])) position += 1;
        else if (text[position] === "%") {
          while (position < text.length && text[position] !== "\n") position += 1;
        } else break;
      }
    };
    const identifier = () => {
      const start = position;
      while (position < text.length && /[A-Za-z0-9_:.+\-/]/.test(text[position])) position += 1;
      if (position === start) fail("bibtex_invalid", "$@" + position);
      return text.slice(start, position);
    };
    const group = (quote) => {
      const start = ++position;
      let depth = quote ? 0 : 1;
      while (position < text.length) {
        const char = text[position];
        if (char === "\\") { position += 2; continue; }
        if (char === "{") depth += 1;
        else if (char === "}") {
          depth -= 1;
          if (!quote && depth === 0) return text.slice(start, position++);
          if (depth < 0) fail("bibtex_invalid", "$@" + position);
        } else if (quote && char === '"' && depth === 0) return text.slice(start, position++);
        if (depth > MAX_DEPTH) fail("input_too_deep", "$@" + position);
        position += 1;
      }
      fail("bibtex_invalid", "$@" + position);
    };
    const fieldValue = (path) => {
      let output = "";
      let terms = 0;
      while (position < text.length) {
        if (++terms > 1000) fail("input_too_complex", path);
        whitespace();
        if (text[position] === "{") output += group(false);
        else if (text[position] === '"') output += group(true);
        else {
          const token = identifier();
          if (/^\d+$/.test(token)) output += token;
          else if (has(macros, token.toLowerCase())) output += macros[token.toLowerCase()];
          else fail("bibtex_macro_unsupported", path);
        }
        if (output.length > MAX_FIELD) fail("text_too_long", path);
        whitespace();
        if (text[position] !== "#") return output;
        position += 1;
      }
      fail("bibtex_invalid", path);
    };
    while (position < text.length) {
      whitespace();
      if (position >= text.length) break;
      const start = position;
      if (text[position++] !== "@") fail("bibtex_invalid", "$@" + start);
      if (++entries > 1000) fail("input_too_complex", "$@" + start);
      const entryType = identifier().toLowerCase();
      whitespace();
      const opening = text[position++];
      if (opening !== "{" && opening !== "(") fail("bibtex_invalid", "$@" + start);
      const closing = opening === "{" ? "}" : ")";
      if (entryType === "comment" || entryType === "preamble") {
        // Comments may contain prose, so skip their balanced container rather
        // than interpreting it as an item or as executable TeX.
        let depth = 1;
        let quoted = false;
        while (position < text.length && depth) {
          const char = text[position++];
          if (char === "\\") { position += 1; continue; }
          if (opening === "(" && char === '"') quoted = !quoted;
          if (!quoted && char === opening) depth += 1;
          if (!quoted && char === closing) depth -= 1;
          if (depth > MAX_DEPTH) fail("input_too_deep", "$@" + position);
        }
        if (depth) fail("bibtex_invalid", "$@" + start);
        warning(context, "bibtex_directive_not_imported", undefined, entryType);
        continue;
      }
      const fields = Object.create(null);
      whitespace();
      if (entryType !== "string") {
        const keyStart = position;
        while (position < text.length && ![",", closing].includes(text[position])) position += 1;
        const key = text.slice(keyStart, position).trim();
        if (!key || key.length > MAX_FIELD || text[position++] !== ",") fail("bibtex_invalid", "$@" + keyStart);
      }
      whitespace();
      while (position < text.length && text[position] !== closing) {
        const field = identifier().toLowerCase();
        if (BAD_KEYS.has(field)) fail("forbidden_key", "$@" + position);
        if (has(fields, field)) fail("duplicate_key", "$@" + position + "." + field);
        whitespace();
        if (text[position++] !== "=") fail("bibtex_invalid", "$@" + position);
        fields[field] = fieldValue("$[" + items.length + "]." + field);
        whitespace();
        if (text[position] === ",") { position += 1; whitespace(); }
        else if (text[position] !== closing) fail("bibtex_invalid", "$@" + position);
      }
      if (text[position++] !== closing) fail("bibtex_invalid", "$@" + position);
      if (entryType === "string") {
        for (const key of Object.keys(fields)) {
          if (has(macros, key)) fail("duplicate_key", "$macro." + key);
          macros[key] = fields[key];
        }
        continue;
      }
      if (items.length >= MAX_ITEMS) fail("too_many_items", "$");
      const types = { book: "book", article: "article-journal", online: "webpage", webpage: "webpage", www: "webpage" };
      if (!has(types, entryType)) fail("type_unsupported", "$[" + items.length + "].type");
      const type = types[entryType];
      const index = items.length;
      const item = { id: "import_" + (index + 1), type, authors: [] };
      const recognized = new Set(["title", "author", "year", "month", "day", "date", "urldate", "publisher",
        "journal", "journaltitle", "booktitle", "volume", "number", "pages", "edition", "doi", "url", "language"]);
      for (const field of Object.keys(fields)) {
        if (!recognized.has(field) && present(fields[field])) warning(context, "field_not_imported", index, field);
      }
      item.title = bibText(fields.title || "", context, index, "title");
      if (present(fields.author)) {
        const names = splitTopLevel(fields.author, (value, cursor) => {
          const match = /^\s+and\s+/i.exec(value.slice(cursor, cursor + 20));
          return match ? match[0].length : 0;
        });
        if (names.length > MAX_AUTHORS) fail("too_many_authors", "$[" + index + "].author");
        for (const name of names) {
          if (/^others$/i.test(name)) warning(context, "authors_incomplete", index, "author");
          else item.authors.push(personalName(name, context, index, "author", true));
        }
      }
      for (const [source, target] of [["publisher", "publisher"], ["volume", "volume"], ["number", "issue"],
        ["pages", "page"], ["edition", "edition"], ["language", "language"]]) {
        if (present(fields[source])) item[target] = bibText(fields[source], context, index, source);
      }
      if (item.page) item.page = item.page.replace(/--+/g, "-");
      const container = choose(fields, ["journaltitle", "journal", "booktitle"], context, index, "containerTitle");
      if (container) item.containerTitle = bibText(container, context, index, "containerTitle");
      if (fields.doi) item.DOI = normalizeDoi(bibLink(fields.doi, context, index, "DOI"));
      if (fields.url) item.URL = bibLink(fields.url, context, index, "URL");
      if (fields.date) {
        item.issued = dateFromText(bibText(fields.date, context, index, "issued"), "$[" + index + "].issued", context, index, "issued");
        if (fields.year && (!item.issued || String(item.issued.year) !== fields.year.trim())) warning(context, "field_conflict", index, "issued");
        for (const field of ["month", "day"]) {
          if (fields[field]) warning(context, "field_not_imported", index, field);
        }
      } else if (fields.year) {
        item.issued = dateFromText(fields.year, "$[" + index + "].issued", context, index, "issued");
        if (item.issued && fields.month) {
          const month = fields.month.trim().toLowerCase();
          const named = /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/.test(month);
          const value = named ? MONTHS[month.slice(0, 3)] : month;
          if (/^\d{1,2}$/.test(value)) item.issued.month = Number(value);
          else warning(context, "date_not_imported", index, "month");
        }
        if (item.issued && fields.day) {
          if (/^\d{1,2}$/.test(fields.day.trim()) && item.issued.month) item.issued.day = Number(fields.day.trim());
          else warning(context, "date_not_imported", index, "day");
        }
      } else if (fields.month || fields.day) warning(context, "date_not_imported", index, "issued");
      if (fields.urldate) item.accessed = dateFromText(fields.urldate, "$[" + index + "].accessed", context, index, "accessed");
      item.originalText = sourceText(text.slice(start, position), context, index);
      items.push(item);
    }
    if (!items.length) fail("no_items", "$");
    return items;
  }

  function parseRis(text, context) {
    const items = [];
    let record = null;
    let start = 0;
    let previous = "";
    let offset = 0;
    const lines = text.split(/\r\n|\n|\r/);
    if (lines.length > MAX_NODES) fail("input_too_complex", "$");
    const finish = (end) => {
      const index = items.length;
      if (index >= MAX_ITEMS) fail("too_many_items", "$");
      const kind = (record.TY && record.TY[0] || "").trim().toUpperCase();
      const type = { BOOK: "book", EBOOK: "book", JOUR: "article-journal", EJOUR: "article-journal", ELEC: "webpage", WEB: "webpage" }[kind];
      if (!type) fail("type_unsupported", "$[" + index + "].TY");
      if (kind === "ELEC") warning(context, "type_review", index, "TY");
      const item = { id: "import_" + (index + 1), type, authors: [] };
      const recognized = new Set(["TY", "TI", "T1", "AU", "A1", "JO", "JF", "T2", "PY", "Y1", "DA",
        "DO", "UR", "SP", "EP", "PB", "VL", "IS", "ET", "LA", "Y2"]);
      for (const key of Object.keys(record)) {
        if (!recognized.has(key) && record[key].some(present)) warning(context, "field_not_imported", index, key);
      }
      item.title = textField(choose(record, ["TI", "T1"], context, index, "title"), "$[" + index + "].title");
      const seenAuthors = new Set();
      for (const raw of [...(record.AU || []), ...(record.A1 || [])]) {
        if (seenAuthors.has(raw)) { warning(context, "duplicate_author", index, "author"); continue; }
        seenAuthors.add(raw);
        if (item.authors.length >= MAX_AUTHORS) fail("too_many_authors", "$[" + index + "].author");
        item.authors.push(personalName(raw, context, index, "author", false));
      }
      item.containerTitle = textField(choose(record, ["JF", "JO", "T2"], context, index, "containerTitle"), "$[" + index + "].containerTitle");
      for (const [source, target] of [["PB", "publisher"], ["VL", "volume"], ["IS", "issue"], ["ET", "edition"], ["LA", "language"]]) {
        const value = choose(record, [source], context, index, target);
        if (value) item[target] = textField(value, "$[" + index + "]." + target);
      }
      const doi = choose(record, ["DO"], context, index, "DOI");
      if (doi) item.DOI = normalizeDoi(doi);
      const url = choose(record, ["UR"], context, index, "URL");
      if (url) item.URL = textField(url, "$[" + index + "].URL");
      const pageStart = choose(record, ["SP"], context, index, "page");
      const pageEnd = choose(record, ["EP"], context, index, "page");
      if (pageStart) item.page = pageStart + (pageEnd && pageEnd !== pageStart ? "-" + pageEnd : "");
      else if (pageEnd) warning(context, "field_not_imported", index, "EP");
      item.issued = dateFromText(choose(record, ["DA", "Y1", "PY"], context, index, "issued"), "$[" + index + "].issued", context, index, "issued");
      item.accessed = dateFromText(choose(record, ["Y2"], context, index, "accessed"), "$[" + index + "].accessed", context, index, "accessed");
      item.originalText = sourceText(text.slice(start, end), context, index);
      items.push(item);
      record = null;
      previous = "";
    };
    for (const line of lines) {
      const lineStart = offset;
      offset += line.length;
      if (text.slice(offset, offset + 2) === "\r\n") offset += 2;
      else if (text[offset] === "\n" || text[offset] === "\r") offset += 1;
      const match = /^([A-Z0-9]{2})[ \t]+-[ \t]?(.*)$/.exec(line);
      if (!match) {
        if (!line.trim()) continue;
        if (record && previous && /^[ \t]/.test(line)) {
          const values = record[previous];
          values[values.length - 1] += " " + line.trim();
          if (values[values.length - 1].length > MAX_FIELD) fail("text_too_long", "$[" + items.length + "]." + previous);
          continue;
        }
        fail("ris_invalid", "$@" + lineStart);
      }
      const [, tag, value] = match;
      if (tag === "TY") {
        if (record) fail("ris_record_unterminated", "$@" + lineStart);
        record = Object.create(null);
        start = lineStart;
      } else if (!record) fail("ris_invalid", "$@" + lineStart);
      if (tag === "ER") {
        if (value.trim()) fail("ris_invalid", "$@" + lineStart);
        finish(offset);
      } else {
        if (value.length > MAX_FIELD) fail("text_too_long", "$[" + items.length + "]." + tag);
        if (!record[tag]) record[tag] = [];
        if (record[tag].length >= MAX_NODES) fail("input_too_complex", "$@" + lineStart);
        record[tag].push(value.trim());
        previous = tag;
      }
    }
    if (record) fail("ris_record_unterminated", "$@" + start);
    if (!items.length) fail("no_items", "$");
    return items;
  }

  function validateItems(items, context) {
    const errors = [];
    const clean = [];
    items.forEach((item, index) => {
      const checked = model.validateItem(item);
      for (const error of checked.errors) errors.push({ code: error.code,
        path: "$[" + index + "]" + error.path.replace(/^item/, "") });
      for (const issue of checked.warnings) {
        const field = issue.path.replace(/^item\.?/, "");
        warning(context, issue.code, index, field);
      }
      if (checked.valid) clean.push(model.createItem(item));
    });
    return { items: clean, errors };
  }

  function parse(input, options = {}) {
    const context = { warnings: [], seen: new Set() };
    let format = options && typeof options.format === "string" ? options.format.toLowerCase() : "auto";
    if (format === "csl-json") format = "json";
    const result = (ok, items, errors) => ({ ok, format, items, warnings: context.warnings, errors });
    if (!model) return result(false, [], [{ code: "model_unavailable", path: "$" }]);
    if (typeof input !== "string") return result(false, [], [{ code: "expected_text", path: "$" }]);
    if (input.length > MAX_BYTES || bytes(input) > MAX_BYTES) return result(false, [], [{ code: "input_too_large", path: "$" }]);
    const text = input.replace(/^\uFEFF/, "");
    if (!text.trim()) return result(false, [], [{ code: "no_items", path: "$" }]);
    if (format === "auto") {
      if (/^\s*[\[{]/.test(text)) format = "json";
      else if (/^\s*(?:%[^\r\n]*(?:\r?\n|\r)\s*)*@/.test(text)) format = "bibtex";
      else if (/^\s*TY[ \t]+-/.test(text)) format = "ris";
      else return result(false, [], [{ code: "format_unrecognized", path: "$" }]);
    }
    if (!["bibtex", "ris", "json"].includes(format)) return result(false, [], [{ code: "format_unrecognized", path: "$" }]);
    try {
      safeText(text, "$", true);
      const items = format === "bibtex" ? parseBibtex(text, context) : format === "ris" ? parseRis(text, context) : parseCsl(text, context);
      const checked = validateItems(items, context);
      return result(checked.errors.length === 0, checked.errors.length ? [] : checked.items, checked.errors);
    } catch (error) {
      if (error instanceof IntakeError) return result(false, [], [{ code: error.code, path: error.path }]);
      return result(false, [], [{ code: "import_invalid", path: "$" }]);
    }
  }

  function identityText(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function bibliographyIdentity(item) {
    const date = (value) => value ? [value.year, value.month || null, value.day || null] : null;
    const authors = (item.authors || []).map((author) => author.literal ?
      ["literal", identityText(author.literal)] : ["person", identityText(author.family), identityText(author.given)]);
    let url = item.URL || "";
    try { if (url) url = new URL(url).href; } catch (_) {}
    // A title/first-author/year heuristic can discard another edition or a
    // different web page. The fallback compares every bibliography field,
    // including all authors, date precision, edition, pages, DOI and URL. URL
    // paths retain their case; only id and the retained source text are ignored.
    return JSON.stringify([item.type, identityText(item.title), authors, date(item.issued),
      ...["publisher", "containerTitle", "volume", "issue", "page", "edition"].map((key) => identityText(item[key])),
      safeDoiKey(item.DOI) || String(item.DOI || "").trim(), url, date(item.accessed), identityText(item.language)]);
  }
  function cloneItem(item, id) {
    const copy = { ...item, id, authors: (item.authors || []).map((author) => ({ ...author })) };
    if (item.issued) copy.issued = { ...item.issued };
    if (item.accessed) copy.accessed = { ...item.accessed };
    return copy;
  }
  function checkObjectGraph(value) {
    // planAppend is also public and may receive objects from a caller, so its
    // safety does not depend on the text parser having produced those objects.
    const ancestors = new Set();
    let nodes = 0;
    let textBytes = 0;
    const visit = (current, depth, path) => {
      if (++nodes > MAX_NODES) fail("input_too_complex", path);
      if (depth > MAX_DEPTH) fail("input_too_deep", path);
      if (typeof current === "string") {
        if (current.length > MAX_ORIGINAL) fail("text_too_long", path);
        textBytes += bytes(current);
        if (textBytes > MAX_BYTES * 2) fail("input_too_large", path);
        safeText(current, path, path.endsWith(".originalText"));
      }
      if (!current || typeof current !== "object") return;
      if (ancestors.has(current)) fail("input_too_complex", path);
      ancestors.add(current);
      for (const key of Object.keys(current)) {
        if (BAD_KEYS.has(key)) fail("forbidden_key", path + "." + key);
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !has(descriptor, "value")) fail("item_invalid", path + "." + key);
        visit(descriptor.value, depth + 1, path + "." + key);
      }
      ancestors.delete(current);
    };
    visit(value, 0, "$");
  }

  function planAppend(existingItems, incomingItems) {
    const context = { warnings: [], seen: new Set() };
    const failed = (errors) => ({ ok: false, items: [], added: 0, skipped: 0, errors, warnings: context.warnings });
    if (!model) return failed([{ code: "model_unavailable", path: "$" }]);
    if (!Array.isArray(existingItems) || !Array.isArray(incomingItems)) return failed([{ code: "library_items_invalid", path: "$" }]);
    if (existingItems.length > MAX_ITEMS || incomingItems.length > MAX_ITEMS) return failed([{ code: "too_many_items", path: "$" }]);
    try {
      checkObjectGraph([existingItems, incomingItems]);
      const library = model.validateLibrary({ schema: model.SCHEMA, v: model.VERSION, items: existingItems });
      if (!library.valid) return failed(library.errors);
      const checked = validateItems(incomingItems, context);
      if (checked.errors.length) return failed(checked.errors);
      const items = existingItems.map((item) => cloneItem(item, item.id));
      const ids = new Set(items.map((item) => item.id));
      const dois = new Set();
      const bibliographies = new Set();
      const remember = (item) => {
        const doi = safeDoiKey(item.DOI);
        if (doi) dois.add(doi);
        bibliographies.add(bibliographyIdentity(item));
      };
      items.forEach(remember);
      let added = 0;
      let skipped = 0;
      let serial = 1;
      checked.items.forEach((item, index) => {
        const doi = safeDoiKey(item.DOI);
        const sameBibliography = bibliographies.has(bibliographyIdentity(item));
        if ((doi && dois.has(doi)) || sameBibliography) {
          skipped += 1;
          warning(context, "duplicate_skipped", index, doi && dois.has(doi) ? "DOI" : undefined);
          return;
        }
        while (ids.has("import_" + serial)) serial += 1;
        const id = "import_" + serial++;
        ids.add(id);
        const copy = cloneItem(item, id);
        items.push(copy);
        remember(copy);
        added += 1;
      });
      if (items.length > MAX_ITEMS) return failed([{ code: "too_many_items", path: "items" }]);
      // Persisting and exporting must remain possible after the append, even
      // when retaining original records doubles the size of imported metadata.
      model.stringifyLibrary({ schema: model.SCHEMA, v: model.VERSION, items });
      return { ok: true, items, added, skipped, errors: [], warnings: context.warnings };
    } catch (error) {
      const expected = error instanceof IntakeError || error instanceof model.CitationError;
      return failed([{ code: expected ? error.code : "import_invalid", path: expected ? error.path : "$" }]);
    }
  }

  const api = Object.freeze({ MAX_BYTES, MAX_ITEMS, MAX_FIELD, MAX_ORIGINAL, parse, planAppend });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FormCapyCitationImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
