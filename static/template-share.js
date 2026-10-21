/* FormCapy template-code protocol v1. No storage, network or document access.
 * FC1 carries the full template; it is an encoding, not an encrypted secret.
 * The frozen field/enum order below is independent of application defaults.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FormCapyTemplateShare = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIMITS = Object.freeze({ codeCharacters: 8192, jsonBytes: 4096 });
  const SETTINGS_KEYS = Object.freeze([
    "label", "paper_size", "font_name", "font_size", "line_spacing",
    "margin_cm", "first_line_cm", "alignment", "header", "title_page",
    "references_title", "sort_references", "page_number_position",
    "show_cover_page_number", "page_number_start", "typography",
    "latin_font_name", "first_line_chars", "line_spacing_pt"
  ]);
  const LABEL_KEYS = Object.freeze([
    "school_name", "school_abbr", "course_code", "campus_term"
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    label: "Course template", paper_size: "Letter", font_name: "Times New Roman",
    font_size: 12, line_spacing: 2, margin_cm: 2.54, first_line_cm: 1.27,
    alignment: "left", header: "page", title_page: false,
    references_title: "References", sort_references: true,
    page_number_position: "top_right", show_cover_page_number: true,
    page_number_start: 1, typography: "western",
    latin_font_name: "Times New Roman", first_line_chars: 0, line_spacing_pt: 0
  });
  const DEFAULT_LABELS = Object.freeze({
    school_name: "", school_abbr: "", course_code: "", campus_term: ""
  });
  const ENUMS = Object.freeze({
    paper_size: Object.freeze(["Letter", "A4"]),
    font_name: Object.freeze(["Times New Roman", "Arial", "Calibri", "宋体", "黑体"]),
    alignment: Object.freeze(["left", "justify"]),
    header: Object.freeze(["surname_page", "page", "none"]),
    page_number_position: Object.freeze(["top_right", "bottom_center", "bottom_right"]),
    typography: Object.freeze(["western", "chinese"]),
    latin_font_name: Object.freeze(["Times New Roman", "Arial", "Calibri"])
  });
  const BOOLEANS = Object.freeze(["title_page", "sort_references", "show_cover_page_number"]);
  const RANGES = Object.freeze({
    font_size: [8, 24], line_spacing: [1, 3], margin_cm: [0.5, 5.08],
    first_line_cm: [0, 2.54], page_number_start: [1, 9999],
    first_line_chars: [0, 4], line_spacing_pt: [0, 60]
  });
  const LABEL_LENGTHS = Object.freeze({
    school_name: 120, school_abbr: 24, course_code: 64, campus_term: 80
  });
  const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
  const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  class ShareError extends Error {
    constructor(code) {
      super(code);
      this.name = "ShareError";
      this.code = code;
    }
  }
  function fail(code) { throw new ShareError(code); }
  function unicodeValid(text) {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail("invalid_unicode");
      } else if (code >= 0xdc00 && code <= 0xdfff) fail("invalid_unicode");
    }
    return text;
  }
  function textValue(value, maximum, required) {
    if (typeof value !== "string") fail("invalid_value");
    unicodeValid(value);
    if ([...value].length > maximum || (required && !value.trim()) ||
        /[\u0000-\u001f\u007f-\u009f\ufffe\uffff]/u.test(value)) fail("invalid_value");
    return value;
  }
  function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_structure");
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail("invalid_structure");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string" || FORBIDDEN.has(key)) fail("invalid_fields");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) fail("invalid_fields");
    }
    return descriptors;
  }
  function exactKeys(value, keys) {
    const descriptors = record(value);
    if (Object.keys(descriptors).length !== keys.length ||
        keys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key))) fail("invalid_fields");
    return descriptors;
  }
  function utf8(text) {
    unicodeValid(text);
    if (typeof TextEncoder !== "function") fail("unsupported_runtime");
    return new TextEncoder().encode(text);
  }
  function sizeChecked(text) {
    if (text.length > LIMITS.jsonBytes) fail("json_too_large");
    if (utf8(text).length > LIMITS.jsonBytes) fail("json_too_large");
    return text;
  }

  // RFC 8785: ECMAScript primitive serialization and UTF-16 key ordering.
  // Only validated finite numbers, well-formed strings, booleans and the
  // protocol's fixed objects/arrays reach this serializer; no toJSON hooks.
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value !== null && typeof value === "object") {
      return "{" + Object.keys(value).sort().map((key) =>
        JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function validateEnvelope(envelope) {
    const top = exactKeys(envelope, ["schema", "v", "settings", "labels"]);
    if (top.schema.value !== "formcapy-template") fail("invalid_schema");
    if (top.v.value !== 1) fail("unsupported_version");
    const sourceSettings = exactKeys(top.settings.value, SETTINGS_KEYS);
    const sourceLabels = exactKeys(top.labels.value, LABEL_KEYS);
    const settings = {};
    const labels = {};
    for (const key of SETTINGS_KEYS) {
      const value = sourceSettings[key].value;
      if (key === "label" || key === "references_title") {
        settings[key] = textValue(value, key === "label" ? 60 : 80, true);
      } else if (Object.prototype.hasOwnProperty.call(ENUMS, key)) {
        if (typeof value !== "string" || !ENUMS[key].includes(value)) fail("invalid_value");
        settings[key] = value;
      } else if (BOOLEANS.includes(key)) {
        if (typeof value !== "boolean") fail("invalid_value");
        settings[key] = value;
      } else {
        const [minimum, maximum] = RANGES[key];
        if (typeof value !== "number" || !Number.isFinite(value) ||
            value < minimum || value > maximum ||
            (key === "page_number_start" && !Number.isInteger(value))) fail("invalid_value");
        settings[key] = value;
      }
    }
    for (const key of LABEL_KEYS) labels[key] = textValue(sourceLabels[key].value, LABEL_LENGTHS[key], false);
    const validated = { schema: "formcapy-template", v: 1, settings, labels };
    sizeChecked(canonical(validated));
    return validated;
  }

  function createEnvelope(settings, labels = {}) {
    const descriptors = record(labels);
    if (Object.keys(descriptors).some((key) => !LABEL_KEYS.includes(key))) fail("invalid_fields");
    const completeLabels = {};
    for (const key of LABEL_KEYS) completeLabels[key] = Object.prototype.hasOwnProperty.call(descriptors, key)
      ? descriptors[key].value : DEFAULT_LABELS[key];
    return validateEnvelope({ schema: "formcapy-template", v: 1, settings, labels: completeLabels });
  }

  // JSON.parse loses duplicate keys. This bounded parser checks them before
  // constructing null-prototype records; string/number tokens use native JSON
  // decoding only after their token boundary has been found.
  function strictParse(text) {
    if (typeof text !== "string") fail("invalid_json");
    sizeChecked(text);
    let offset = 0;
    function whitespace() { while (offset < text.length && /[\x20\t\r\n]/.test(text[offset])) offset += 1; }
    function string() {
      const start = offset++;
      let escaped = false;
      while (offset < text.length) {
        const char = text[offset++];
        if (!escaped && char === '"') {
          try { return unicodeValid(JSON.parse(text.slice(start, offset))); }
          catch (error) { if (error instanceof ShareError) throw error; fail("invalid_json"); }
        }
        if (!escaped && char.charCodeAt(0) < 32) fail("invalid_json");
        if (!escaped && char === "\\") escaped = true;
        else escaped = false;
      }
      fail("invalid_json");
    }
    function value(depth) {
      whitespace();
      if (depth > 3) fail("invalid_structure");
      const char = text[offset];
      if (char === '"') return string();
      if (char === "{") {
        offset += 1;
        whitespace();
        const result = Object.create(null);
        if (text[offset] === "}") { offset += 1; return result; }
        while (offset < text.length) {
          if (text[offset] !== '"') fail("invalid_json");
          const key = string();
          if (FORBIDDEN.has(key)) fail("invalid_fields");
          if (Object.prototype.hasOwnProperty.call(result, key)) fail("duplicate_key");
          whitespace();
          if (text[offset++] !== ":") fail("invalid_json");
          result[key] = value(depth + 1);
          whitespace();
          if (text[offset] === "}") { offset += 1; return result; }
          if (text[offset++] !== ",") fail("invalid_json");
          whitespace();
        }
        fail("invalid_json");
      }
      if (char === "[") {
        offset += 1;
        whitespace();
        const result = [];
        if (text[offset] === "]") { offset += 1; return result; }
        while (offset < text.length) {
          if (result.length >= 24) fail("invalid_structure");
          result.push(value(depth + 1));
          whitespace();
          if (text[offset] === "]") { offset += 1; return result; }
          if (text[offset++] !== ",") fail("invalid_json");
        }
        fail("invalid_json");
      }
      for (const [token, decoded] of [["true", true], ["false", false], ["null", null]]) {
        if (text.startsWith(token, offset)) { offset += token.length; return decoded; }
      }
      const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(offset));
      if (!match) fail("invalid_json");
      offset += match[0].length;
      const decoded = Number(match[0]);
      if (!Number.isFinite(decoded)) fail("invalid_value");
      return decoded;
    }
    const result = value(0);
    whitespace();
    if (offset !== text.length) fail("invalid_json");
    return result;
  }

  function parseShareJson(text) { return validateEnvelope(strictParse(text)); }
  function canonicalize(envelope) { return canonical(validateEnvelope(envelope)); }
  function stringifyShareJson(envelope) {
    const validated = validateEnvelope(envelope);
    const readable = JSON.stringify(validated, null, 2) + "\n";
    // Keep exported files importable even at the size boundary.
    return utf8(readable).length <= LIMITS.jsonBytes ? readable : canonical(validated);
  }
  function encodeBytes(bytes) {
    let result = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      result += BASE64[a >> 2];
      result += BASE64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
      if (b !== undefined) result += BASE64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
      if (c !== undefined) result += BASE64[c & 63];
    }
    return result;
  }
  function decodeBytes(payload) {
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) fail("invalid_base64");
    const length = Math.floor(payload.length * 6 / 8);
    if (length > LIMITS.jsonBytes) fail("json_too_large");
    const bytes = new Uint8Array(length);
    let buffer = 0, bits = 0, position = 0;
    for (const char of payload) {
      buffer = (buffer << 6) | BASE64.indexOf(char);
      bits += 6;
      if (bits >= 8) { bits -= 8; bytes[position++] = (buffer >> bits) & 255; }
    }
    if (encodeBytes(bytes) !== payload) fail("invalid_base64");
    return bytes;
  }
  function pack(envelope) {
    return [SETTINGS_KEYS.map((key) => {
      const value = envelope.settings[key];
      if (Object.prototype.hasOwnProperty.call(ENUMS, key)) return ENUMS[key].indexOf(value);
      return BOOLEANS.includes(key) ? (value ? 1 : 0) : value;
    }), LABEL_KEYS.map((key) => envelope.labels[key])];
  }
  function unpack(packed) {
    if (!Array.isArray(packed) || packed.length !== 2 ||
        !Array.isArray(packed[0]) || packed[0].length !== SETTINGS_KEYS.length ||
        !Array.isArray(packed[1]) || packed[1].length !== LABEL_KEYS.length) fail("invalid_structure");
    const settings = {}, labels = {};
    SETTINGS_KEYS.forEach((key, index) => {
      let value = packed[0][index];
      if (Object.prototype.hasOwnProperty.call(ENUMS, key)) {
        if (!Number.isInteger(value) || value < 0 || value >= ENUMS[key].length) fail("invalid_value");
        value = ENUMS[key][value];
      } else if (BOOLEANS.includes(key)) {
        if (value !== 0 && value !== 1) fail("invalid_value");
        value = value === 1;
      }
      settings[key] = value;
    });
    LABEL_KEYS.forEach((key, index) => { labels[key] = packed[1][index]; });
    return validateEnvelope({ schema: "formcapy-template", v: 1, settings, labels });
  }
  function encodeCode(envelope) {
    const packed = sizeChecked(canonical(pack(validateEnvelope(envelope))));
    const code = "FC1." + encodeBytes(utf8(packed));
    if (code.length > LIMITS.codeCharacters) fail("code_too_long");
    return code;
  }
  function decodeCode(code) {
    if (typeof code !== "string" || /[^\x00-\x7f]/.test(code)) fail("invalid_code");
    if (code.length > LIMITS.codeCharacters) fail("code_too_long");
    const match = /^FC([0-9]+)\.(.*)$/.exec(code);
    if (!match) fail("invalid_code");
    if (match[1] !== "1") fail("unsupported_version");
    const bytes = decodeBytes(match[2]);
    if (typeof TextDecoder !== "function") fail("unsupported_runtime");
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch (_) { fail("invalid_utf8"); }
    const envelope = unpack(strictParse(text));
    if (encodeCode(envelope) !== code) fail("non_canonical");
    return envelope;
  }

  return Object.freeze({
    ShareError, LIMITS, DEFAULT_SETTINGS, DEFAULT_LABELS, SETTINGS_KEYS, LABEL_KEYS,
    createEnvelope, validateEnvelope, parseShareJson, stringifyShareJson,
    canonicalize, encodeCode, decodeCode
  });
});
