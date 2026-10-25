/* FormCapy portable bibliography exports.
 *
 * Pure, original adapter code. No DOM, network, storage, timers or eval. The
 * local citation model remains the validation authority; this module only
 * serializes its public bibliographic fields into CSL JSON, RIS, or a modern
 * UTF-8 BibLaTeX-compatible .bib profile. FormCapy envelope/state and
 * originalText are intentionally excluded from all portable formats.
 */
(function (root) {
  "use strict";

  const MAX_ITEMS = 200;
  const MAX_BYTES = 1048576;
  const MAX_GRAPH_NODES = 50000;
  const MAX_GRAPH_DEPTH = 32;
  const MAX_GRAPH_TEXT = 8 * 1024 * 1024;
  const MAX_ARRAY_LENGTH = 10000;
  const MAX_OBJECT_KEYS = 1000;
  const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const FORMATS = Object.freeze({
    "csl-json": Object.freeze({
      filename: "formcapy-references.csl.json",
      mime: "application/vnd.citationstyles.csl+json",
    }),
    ris: Object.freeze({
      filename: "formcapy-references.ris",
      mime: "application/x-research-info-systems",
    }),
    bibtex: Object.freeze({
      filename: "formcapy-references.bib",
      mime: "application/x-bibtex",
    }),
  });

  let commonModel = null;
  if (typeof module !== "undefined" && module.exports) {
    try { commonModel = require("./citation-library.js"); } catch (_) {}
  }
  const getModel = () => root.FormCapyCitations || commonModel;
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function utf8Length(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    let size = 0;
    for (const character of text) {
      const point = character.codePointAt(0);
      size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    }
    return size;
  }

  function warning(code, index, field, path) {
    const issue = { code };
    if (Number.isSafeInteger(index) && index >= 0) issue.index = index;
    if (field) issue.field = field;
    if (path) issue.path = path;
    return issue;
  }

  function itemPath(index, field) {
    return "library.items[" + index + "]" + (field ? "." + field : "");
  }

  function pathDetails(path) {
    const match = /^library\.items\[(\d+)\](?:\.([A-Za-z][A-Za-z0-9_]*))?/.exec(String(path || ""));
    if (!match) return {};
    const details = { index: Number(match[1]) };
    if (match[2]) details.field = match[2];
    return details;
  }

  function modelIssue(issue) {
    const source = issue && typeof issue === "object" ? issue : {};
    const result = { code: typeof source.code === "string" ? source.code : "library_invalid" };
    const details = pathDetails(source.path);
    if (has(details, "index")) result.index = details.index;
    if (details.field) result.field = details.field;
    if (typeof source.path === "string" && source.path) result.path = source.path;
    return result;
  }

  function addUnique(list, issue) {
    const key = [issue.code, issue.index, issue.field, issue.path].map((value) =>
      value === undefined ? "" : String(value)).join("\u0000");
    if (list.some((existing) => [existing.code, existing.index, existing.field, existing.path]
      .map((value) => value === undefined ? "" : String(value)).join("\u0000") === key)) return;
    list.push(issue);
  }

  function graphError(path, reason) {
    return { graph: true, path, reason };
  }

  function nativeConstructorPrototype(proto, expected) {
    // Accept built-in prototypes from other realms without accepting a
    // fabricated null-parent object that merely borrows hasOwnProperty.
    const constructor = Object.getOwnPropertyDescriptor(proto, "constructor");
    if (!constructor || !has(constructor, "value") || typeof constructor.value !== "function") return false;
    const prototype = Object.getOwnPropertyDescriptor(constructor.value, "prototype");
    return Boolean(prototype && has(prototype, "value") && prototype.value === proto &&
      Function.prototype.toString.call(constructor.value) === Function.prototype.toString.call(expected));
  }

  function standardObjectPrototype(proto) {
    if (proto === null) return true;
    try {
      if (Object.getPrototypeOf(proto) !== null) return false;
      return nativeConstructorPrototype(proto, Object);
    } catch (_) {
      return false;
    }
  }

  function standardArrayPrototype(proto) {
    try {
      if (!Array.isArray(proto)) return false;
      const parent = Object.getPrototypeOf(proto);
      return parent !== null && standardObjectPrototype(parent) && nativeConstructorPrototype(proto, Array);
    } catch (_) {
      return false;
    }
  }

  function inspectGraph(value, path, stack, depth, state) {
    if (value === null) return;
    const type = typeof value;
    if (type === "string") {
      state.text += value.length;
      if (state.text > MAX_GRAPH_TEXT) throw graphError(path, "text_too_large");
      return;
    }
    if (type === "number" || type === "boolean" || type === "undefined") return;
    if (type !== "object") throw graphError(path, "unsupported_value");
    if (depth > MAX_GRAPH_DEPTH) throw graphError(path, "too_deep");
    if (stack.has(value)) throw graphError(path, "cycle");
    state.nodes += 1;
    if (state.nodes > MAX_GRAPH_NODES) throw graphError(path, "too_complex");
    const array = Array.isArray(value);
    let proto;
    try { proto = Object.getPrototypeOf(value); } catch (_) { throw graphError(path, "prototype"); }
    if (array) {
      if (!standardArrayPrototype(proto)) throw graphError(path, "prototype");
      let lengthDescriptor;
      try { lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length"); } catch (_) {
        throw graphError(path, "accessor");
      }
      if (!lengthDescriptor || !has(lengthDescriptor, "value") ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value > MAX_ARRAY_LENGTH) {
        throw graphError(path, "array_too_large");
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        let itemDescriptor;
        try { itemDescriptor = Object.getOwnPropertyDescriptor(value, String(index)); } catch (_) {
          throw graphError(path + "." + index, "accessor");
        }
        if (!itemDescriptor) throw graphError(path + "." + index, "sparse_array");
      }
    } else if (proto !== null && !standardObjectPrototype(proto)) {
      throw graphError(path, "prototype");
    }
    let keys;
    try { keys = Reflect.ownKeys(value); } catch (_) { throw graphError(path, "unsafe_object"); }
    if (!array && keys.length > MAX_OBJECT_KEYS) throw graphError(path, "too_complex");
    stack.add(value);
    try {
      for (const key of keys) {
        if (typeof key === "symbol") throw graphError(path, "symbol_key");
        if (key.length > 256) throw graphError(path, "key_too_long");
        state.text += key.length;
        if (state.text > MAX_GRAPH_TEXT) throw graphError(path, "text_too_large");
        if (FORBIDDEN_KEYS.has(key) || key === "toJSON") {
          throw graphError(path + "." + key, key === "toJSON" ? "toJSON" : "forbidden_key");
        }
        let descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch (_) {
          throw graphError(path + "." + key, "accessor");
        }
        if (!descriptor || !has(descriptor, "value")) {
          throw graphError(path + "." + key, "accessor");
        }
        inspectGraph(descriptor.value, path + "." + key, stack, depth + 1, state);
      }
    } finally {
      stack.delete(value);
    }
  }

  function checkLibraryGraph(library) {
    if (library === null || typeof library !== "object" || Array.isArray(library)) {
      return { ok: false, path: "library", reason: "not_object" };
    }
    const state = { nodes: 0, text: 0 };
    try {
      inspectGraph(library, "library", new Set(), 0, state);
      return { ok: true };
    } catch (error) {
      if (error && error.graph) return { ok: false, path: error.path, reason: error.reason };
      return { ok: false, path: "library", reason: "unsafe_object" };
    }
  }

  function readOptions(options) {
    if (options === undefined) return { ok: true, format: undefined };
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      return { ok: false };
    }
    let keys;
    try { keys = Reflect.ownKeys(options); } catch (_) { return { ok: false }; }
    let format;
    for (const key of keys) {
      if (typeof key === "symbol") return { ok: false };
      let descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(options, key); } catch (_) {
        return { ok: false };
      }
      if (!descriptor || !has(descriptor, "value")) return { ok: false };
      if (key === "format") format = descriptor.value;
    }
    return { ok: true, format };
  }

  function result(format, meta, ok, text, warnings, errors) {
    return {
      ok,
      format,
      text,
      filename: meta ? meta.filename : "",
      mime: meta ? meta.mime : "",
      warnings: Array.isArray(warnings) ? warnings : [],
      errors: Array.isArray(errors) ? errors : [],
    };
  }

  function failure(format, meta, code, warnings, path) {
    const errors = [{ code }];
    if (path) errors[0].path = path;
    return result(format, meta, false, "", warnings, errors);
  }

  function mappedIssues(list) {
    if (!Array.isArray(list)) return [];
    return list.map(modelIssue);
  }

  function addItemLossWarnings(items, format, warnings) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (typeof item.originalText === "string" && item.originalText.length > 0) {
        addUnique(warnings, warning("original_text_omitted", index, "originalText",
          itemPath(index, "originalText")));
      }
      const fields = ["title", "containerTitle", "publisher", "volume", "issue", "page",
        "edition", "DOI", "URL", "language"];
      for (const field of fields) {
        const value = item[field];
        if (typeof value !== "string" || !value) continue;
        if (value !== value.trim()) {
          if (format === "ris") {
            addUnique(warnings, warning("ris_field_whitespace", index, field, itemPath(index, field)));
          } else if (format === "bibtex") {
            addUnique(warnings, warning("bibtex_field_whitespace", index, field, itemPath(index, field)));
          }
        }
        if (format === "bibtex" && field !== "URL" && field !== "DOI" && /[~^]/.test(value)) {
          addUnique(warnings, warning("bibtex_tex_escape_lossy", index, field, itemPath(index, field)));
        }
      }
      if (format === "ris") {
        if (item.page && !/^[^\s-]+-[^\s-]+$/.test(item.page) && item.page.includes("-")) {
          addUnique(warnings, warning("ris_page_semantics", index, "page", itemPath(index, "page")));
        }
        if (item.page && (/[\u2013\u2014]/.test(item.page) || item.page.includes("--"))) {
          addUnique(warnings, warning("ris_page_semantics", index, "page", itemPath(index, "page")));
        }
        if (item.type === "book" && item.containerTitle) {
          addUnique(warnings, warning("ris_container_semantics", index, "containerTitle",
            itemPath(index, "containerTitle")));
        }
      } else if (format === "bibtex") {
        if (item.page && item.page.includes("--")) {
          addUnique(warnings, warning("bibtex_page_dash_lossy", index, "page", itemPath(index, "page")));
        }
        if (item.type === "book" && item.containerTitle) {
          addUnique(warnings, warning("bibtex_container_semantics", index, "containerTitle",
            itemPath(index, "containerTitle")));
        }
        if (item.type === "webpage" && item.containerTitle) {
          addUnique(warnings, warning("bibtex_container_semantics", index, "containerTitle",
            itemPath(index, "containerTitle")));
        }
      }
      if (!Array.isArray(item.authors)) continue;
      for (const author of item.authors) {
        if (!author || typeof author !== "object") continue;
        if (format === "ris") {
          if (has(author, "literal")) {
            addUnique(warnings, warning("ris_author_literal", index, "authors", itemPath(index, "authors")));
          } else if (!author.family && author.given) {
            addUnique(warnings, warning("ris_author_given_only", index, "authors", itemPath(index, "authors")));
          }
          if (["family", "given", "literal"].some((key) =>
            typeof author[key] === "string" && author[key].includes(","))) {
            addUnique(warnings, warning("ris_author_comma", index, "authors", itemPath(index, "authors")));
          }
          if (["family", "given", "literal"].some((key) =>
            typeof author[key] === "string" && author[key] !== author[key].trim())) {
            addUnique(warnings, warning("ris_author_whitespace", index, "authors", itemPath(index, "authors")));
          }
        } else if (format === "bibtex") {
          if (!has(author, "literal") && !author.family && author.given) {
            addUnique(warnings, warning("bibtex_author_given_only", index, "authors", itemPath(index, "authors")));
          }
          if (["family", "given", "literal"].some((key) =>
            typeof author[key] === "string" && author[key] !== author[key].trim())) {
            addUnique(warnings, warning("bibtex_author_whitespace", index, "authors", itemPath(index, "authors")));
          }
          if (["family", "given", "literal"].some((key) =>
            typeof author[key] === "string" && /[~^]/.test(author[key]))) {
            addUnique(warnings, warning("bibtex_tex_escape_lossy", index, "authors", itemPath(index, "authors")));
          }
        }
      }
    }
  }

  function dateText(date) {
    if (!date || !Number.isSafeInteger(date.year)) return "";
    let text = String(date.year).padStart(4, "0");
    if (Number.isSafeInteger(date.month)) text += "-" + String(date.month).padStart(2, "0");
    if (Number.isSafeInteger(date.day)) text += "-" + String(date.day).padStart(2, "0");
    return text;
  }

  function risPageFields(page) {
    if (!page) return [];
    const range = /^([^\s-]+)-([^\s-]+)$/.exec(page);
    if (range) return [["SP", range[1]], ["EP", range[2]]];
    return [["SP", page]];
  }

  function risAuthor(author) {
    if (has(author, "literal")) return author.literal;
    if (author.family && author.given) return author.family + ", " + author.given;
    return author.family || author.given || "";
  }

  function risRecord(item) {
    const lines = [["TY", item.type === "book" ? "BOOK" : item.type === "article-journal" ? "JOUR" : "ELEC"]];
    for (const author of item.authors || []) lines.push(["AU", risAuthor(author)]);
    lines.push(["TI", item.title]);
    if (item.containerTitle) lines.push([item.type === "article-journal" ? "JO" : "T2", item.containerTitle]);
    if (item.publisher) lines.push(["PB", item.publisher]);
    if (item.volume) lines.push(["VL", item.volume]);
    if (item.issue) lines.push(["IS", item.issue]);
    for (const field of risPageFields(item.page)) lines.push(field);
    if (item.edition) lines.push(["ET", item.edition]);
    const issued = dateText(item.issued);
    if (issued) lines.push(["DA", issued]);
    const accessed = dateText(item.accessed);
    if (accessed) lines.push(["Y2", accessed]);
    if (item.DOI) lines.push(["DO", item.DOI]);
    if (item.URL) lines.push(["UR", item.URL]);
    if (item.language) lines.push(["LA", item.language]);
    lines.push(["ER", ""]);
    return lines.map(([tag, value]) => tag + "  - " + value).join("\n") + "\n";
  }

  function risText(items) {
    return items.map(risRecord).join("\n");
  }

  function bibEscape(value, field) {
    let output = "";
    for (const character of value) {
      if (character === "\\") output += "\\textbackslash{}";
      else if (character === "{") output += "\\{";
      else if (character === "}") output += "\\}";
      else if (character === "$") output += "\\$";
      else if (character === "&") output += "\\&";
      else if (character === "#") output += "\\#";
      else if (character === "%") output += "\\%";
      else if (character === "_") output += "\\_";
      else if (character === "~") {
        output += field === "URL" || field === "DOI" ? "~" : "\\textasciitilde{}";
      } else if (character === "^") {
        output += field === "URL" || field === "DOI" ? "^" : "\\textasciicircum{}";
      } else {
        output += character;
      }
    }
    return output;
  }

  function bibAuthor(author) {
    if (has(author, "literal")) return "{{" + bibEscape(author.literal, "author") + "}}";
    return "{{" + bibEscape(author.family || "", "author") + "}}, {{" +
      bibEscape(author.given || "", "author") + "}}";
  }

  function bibEntry(item) {
    const type = item.type === "book" ? "book" : item.type === "article-journal" ? "article" : "online";
    const fields = [];
    if (Array.isArray(item.authors) && item.authors.length) {
      fields.push(["author", item.authors.map(bibAuthor).join(" and ")]);
    }
    fields.push(["title", bibEscape(item.title, "title")]);
    const issued = dateText(item.issued);
    if (issued) fields.push(["date", issued]);
    if (item.publisher) fields.push(["publisher", bibEscape(item.publisher, "publisher")]);
    if (item.containerTitle) {
      fields.push([item.type === "article-journal" ? "journaltitle" : "booktitle",
        bibEscape(item.containerTitle, "container")]);
    }
    if (item.volume) fields.push(["volume", bibEscape(item.volume, "volume")]);
    if (item.issue) fields.push(["number", bibEscape(item.issue, "issue")]);
    if (item.page) fields.push(["pages", bibEscape(item.page, "page")]);
    if (item.edition) fields.push(["edition", bibEscape(item.edition, "edition")]);
    if (item.DOI) fields.push(["doi", bibEscape(item.DOI, "DOI")]);
    if (item.URL) fields.push(["url", bibEscape(item.URL, "URL")]);
    const accessed = dateText(item.accessed);
    if (accessed) fields.push(["urldate", accessed]);
    if (item.language) fields.push(["language", bibEscape(item.language, "language")]);
    const body = fields.map(([name, value]) => "  " + name + " = {" + value + "}").join(",\n");
    return "@" + type + "{ref_" + item.id + ",\n" + body + "\n}\n";
  }

  function bibText(items) {
    return items.map(bibEntry).join("\n");
  }

  function cslText(library, model) {
    const csl = model.toCslItems(library);
    const pretty = JSON.stringify(csl, null, 2) + "\n";
    if (utf8Length(pretty) <= MAX_BYTES) return pretty;
    return JSON.stringify(csl);
  }

  function exportLibrary(library, options) {
    const optionState = readOptions(options);
    if (!optionState.ok) {
      return result("", null, false, "", [], [{ code: "options_invalid" }]);
    }
    const requested = typeof optionState.format === "string" ? optionState.format : "";
    const meta = has(FORMATS, requested) ? FORMATS[requested] : null;
    if (!meta) {
      return result(requested, null, false, "", [], [{ code: "format_unsupported" }]);
    }
    const preflight = checkLibraryGraph(library);
    if (!preflight.ok) {
      return result(requested, meta, false, "", [], [{
        code: "library_invalid", path: preflight.path, reason: preflight.reason,
      }]);
    }
    const model = getModel();
    if (!model || typeof model.validateLibrary !== "function" || typeof model.toCslItems !== "function") {
      return failure(requested, meta, "model_unavailable", []);
    }
    let validation;
    try {
      validation = model.validateLibrary(library);
    } catch (_) {
      return failure(requested, meta, "library_invalid", []);
    }
    const warnings = mappedIssues(validation && validation.warnings);
    if (!validation || validation.valid !== true) {
      const errors = mappedIssues(validation && validation.errors);
      if (!errors.length) errors.push({ code: "library_invalid" });
      return result(requested, meta, false, "", warnings, errors);
    }
    let items;
    try {
      items = library.items;
    } catch (_) {
      return failure(requested, meta, "library_invalid", warnings);
    }
    if (!Array.isArray(items)) return failure(requested, meta, "library_invalid", warnings);
    if (!items.length) return failure(requested, meta, "library_empty", warnings);
    if (items.length > MAX_ITEMS) return failure(requested, meta, "too_many_items", warnings);
    try {
      addItemLossWarnings(items, requested, warnings);
      let text;
      if (requested === "csl-json") text = cslText(library, model);
      else if (requested === "ris") text = risText(items);
      else text = bibText(items);
      if (typeof text !== "string") return failure(requested, meta, "export_failed", warnings);
      if (utf8Length(text) > MAX_BYTES) return failure(requested, meta, "export_too_large", warnings);
      return result(requested, meta, true, text, warnings, []);
    } catch (_) {
      return failure(requested, meta, "export_failed", warnings);
    }
  }

  const api = Object.freeze({
    MAX_ITEMS,
    MAX_BYTES,
    FORMATS,
    exportLibrary,
  });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FormCapyCitationExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
