// Focused checks against the shipped codec. Run with Node, without a browser.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const codec = require('../../static/template-share.js');
const checks = [];
function check(name, run) {
  try { run(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: error.stack || String(error) }); }
}
function rejects(run, code) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof codec.ShareError, `Expected ShareError, got ${error}`);
    if (code) assert.equal(error.code, code);
    return true;
  });
}
const EXPECTED_SETTINGS = {
  label: 'Course template', paper_size: 'Letter', font_name: 'Times New Roman',
  font_size: 12, line_spacing: 2, margin_cm: 2.54, first_line_cm: 1.27,
  alignment: 'left', header: 'page', title_page: false,
  references_title: 'References', sort_references: true,
  page_number_position: 'top_right', show_cover_page_number: true,
  page_number_start: 1, typography: 'western', latin_font_name: 'Times New Roman',
  first_line_chars: 0, line_spacing_pt: 0
};
const EXPECTED_LABELS = { school_name: '', school_abbr: '', course_code: '', campus_term: '' };
const SETTING_ORDER = [
  'label', 'paper_size', 'font_name', 'font_size', 'line_spacing', 'margin_cm',
  'first_line_cm', 'alignment', 'header', 'title_page', 'references_title',
  'sort_references', 'page_number_position', 'show_cover_page_number',
  'page_number_start', 'typography', 'latin_font_name', 'first_line_chars', 'line_spacing_pt'
];
const LABEL_ORDER = ['school_name', 'school_abbr', 'course_code', 'campus_term'];
// This literal and Buffer's independent base64url encoder are the wire oracle.
const DEFAULT_PACKED = '[["Course template",0,0,12,2,2.54,1.27,0,1,0,"References",1,0,1,1,0,0,0,0],["","","",""]]';
const wire = (text) => 'FC1.' + Buffer.from(text, 'utf8').toString('base64url');
const bytesWire = (bytes) => 'FC1.' + Buffer.from(bytes).toString('base64url');
const fresh = () => ({
  schema: 'formcapy-template', v: 1,
  settings: { ...EXPECTED_SETTINGS }, labels: { ...EXPECTED_LABELS }
});
const raw = () => JSON.stringify(fresh());
const alteredPacked = (change) => {
  const packed = JSON.parse(DEFAULT_PACKED);
  change(packed);
  return wire(JSON.stringify(packed));
};

check('frozen public constants and independent defaults match the v1 specification', () => {
  assert.deepEqual(codec.SETTINGS_KEYS, SETTING_ORDER);
  assert.deepEqual(codec.LABEL_KEYS, LABEL_ORDER);
  assert.deepEqual(codec.DEFAULT_SETTINGS, EXPECTED_SETTINGS);
  assert.deepEqual(codec.DEFAULT_LABELS, EXPECTED_LABELS);
  assert.deepEqual(codec.LIMITS, { codeCharacters: 8192, jsonBytes: 4096 });
  assert.ok(Object.isFrozen(codec.DEFAULT_SETTINGS));
  assert.ok(Object.isFrozen(codec.DEFAULT_LABELS));
  assert.ok(Object.isFrozen(codec.SETTINGS_KEYS));
  assert.equal('encodeLink' in codec, false);
  assert.equal('decodeFragment' in codec, false);
});
check('default code has the independently specified packed bytes and 123 characters', () => {
  assert.equal(Buffer.byteLength(DEFAULT_PACKED), 89);
  const expected = wire(DEFAULT_PACKED);
  assert.equal(expected.length, 123);
  assert.equal(codec.encodeCode(fresh()), expected);
  assert.deepEqual(codec.decodeCode(expected), fresh());
});
check('all 19 settings and four independent Unicode labels use the frozen positions', () => {
  const envelope = {
    schema: 'formcapy-template', v: 1,
    settings: {
      label: '课程 😀 e\u0301', paper_size: 'A4', font_name: '黑体',
      font_size: 13.25, line_spacing: 1.375, margin_cm: 3.125, first_line_cm: 1.015625,
      alignment: 'justify', header: 'none', title_page: true, references_title: '文献 🌏',
      sort_references: false, page_number_position: 'bottom_right', show_cover_page_number: false,
      page_number_start: 347, typography: 'chinese', latin_font_name: 'Calibri',
      first_line_chars: 2.5, line_spacing_pt: 19.125
    },
    labels: { school_name: '海边大学 🦫', school_abbr: '校 A', course_code: 'LING 36-e\u0301', campus_term: '北校区 / otoño' }
  };
  const expectedPacked = [[
    '课程 😀 e\u0301', 1, 4, 13.25, 1.375, 3.125, 1.015625, 1, 2, 1, '文献 🌏',
    0, 2, 0, 347, 1, 2, 2.5, 19.125
  ], ['海边大学 🦫', '校 A', 'LING 36-e\u0301', '北校区 / otoño']];
  const expected = wire(JSON.stringify(expectedPacked));
  assert.equal(codec.encodeCode(envelope), expected);
  assert.deepEqual(codec.decodeCode(expected), envelope);
  assert.deepEqual(codec.parseShareJson(codec.stringifyShareJson(envelope)), envelope);
});

const ENUM_CASES = [
  ['paper_size', 1, ['Letter', 'A4']],
  ['font_name', 2, ['Times New Roman', 'Arial', 'Calibri', '宋体', '黑体']],
  ['alignment', 7, ['left', 'justify']],
  ['header', 8, ['surname_page', 'page', 'none']],
  ['page_number_position', 12, ['top_right', 'bottom_center', 'bottom_right']],
  ['typography', 15, ['western', 'chinese']],
  ['latin_font_name', 16, ['Times New Roman', 'Arial', 'Calibri']]
];
for (const [key, position, values] of ENUM_CASES) {
  check(`${key} enum indexes are frozen and accept no coercion`, () => {
    values.forEach((value, index) => {
      const envelope = fresh(); envelope.settings[key] = value;
      const packed = JSON.parse(DEFAULT_PACKED); packed[0][position] = index;
      assert.equal(codec.encodeCode(envelope), wire(JSON.stringify(packed)));
      assert.equal(codec.decodeCode(wire(JSON.stringify(packed))).settings[key], value);
    });
    for (const value of [-1, values.length, 0.5, '0', false, null, {}]) {
      rejects(() => codec.decodeCode(alteredPacked((p) => { p[0][position] = value; })), 'invalid_value');
    }
  });
}
for (const [key, position] of [['title_page', 9], ['sort_references', 11], ['show_cover_page_number', 13]]) {
  check(`${key} flags use only numeric 0 and 1 on the wire`, () => {
    for (const value of [true, false]) {
      const envelope = fresh(); envelope.settings[key] = value;
      const packed = JSON.parse(DEFAULT_PACKED); packed[0][position] = value ? 1 : 0;
      assert.equal(codec.encodeCode(envelope), wire(JSON.stringify(packed)));
      assert.equal(codec.decodeCode(wire(JSON.stringify(packed))).settings[key], value);
    }
    for (const value of [true, false, '0', '1', null, -1, 2, 0.5]) {
      rejects(() => codec.decodeCode(alteredPacked((p) => { p[0][position] = value; })), 'invalid_value');
    }
    for (const value of [0, 1, 'false', null]) {
      const envelope = fresh(); envelope.settings[key] = value;
      rejects(() => codec.validateEnvelope(envelope), 'invalid_value');
    }
  });
}
check('different key insertion orders give identical canonical JSON and code', () => {
  const original = fresh();
  original.labels.school_name = '学校';
  const reversed = {
    labels: Object.fromEntries(Object.entries(original.labels).reverse()),
    settings: Object.fromEntries(Object.entries(original.settings).reverse()),
    v: 1, schema: 'formcapy-template'
  };
  assert.equal(codec.encodeCode(reversed), wire('[["Course template",0,0,12,2,2.54,1.27,0,1,0,"References",1,0,1,1,0,0,0,0],["学校","","",""]]'));
  assert.equal(codec.encodeCode(original), codec.encodeCode(reversed));
  assert.equal(codec.canonicalize(original), codec.canonicalize(reversed));
});
check('JCS serializes negative zero as zero without trimming or normalizing strings', () => {
  const envelope = fresh();
  envelope.settings.first_line_chars = -0;
  assert.equal(codec.encodeCode(envelope), wire(DEFAULT_PACKED));
  assert.equal(Object.is(codec.decodeCode(wire(DEFAULT_PACKED)).settings.first_line_chars, -0), false);
  envelope.labels.school_name = ' e\u0301 ';
  const decoded = codec.decodeCode(codec.encodeCode(envelope));
  assert.equal(decoded.labels.school_name, ' e\u0301 ');
  assert.notEqual(decoded.labels.school_name, ' é ');
  assert.equal(codec.canonicalize(envelope).includes('"first_line_chars":0'), true);
});
check('createEnvelope fills only missing labels and never mutates or aliases inputs', () => {
  const settings = { ...EXPECTED_SETTINGS }, labels = { course_code: 'COCENGL1001C' };
  const envelope = codec.createEnvelope(settings, labels);
  assert.deepEqual(envelope.labels, { ...EXPECTED_LABELS, course_code: 'COCENGL1001C' });
  envelope.settings.label = 'changed'; envelope.labels.course_code = 'changed';
  assert.equal(settings.label, 'Course template');
  assert.equal(labels.course_code, 'COCENGL1001C');
  assert.equal(Object.keys(labels).length, 1);
  rejects(() => codec.createEnvelope(settings, { school: 'unknown' }), 'invalid_fields');
  rejects(() => codec.createEnvelope(settings, null), 'invalid_structure');
});
check('schema and versions are exact and never guessed', () => {
  for (const schema of ['other', 'FormCapy-template', null, 1]) {
    const envelope = fresh(); envelope.schema = schema;
    rejects(() => codec.validateEnvelope(envelope), 'invalid_schema');
  }
  for (const v of [0, 2, '1', true, null, 1.5]) {
    const envelope = fresh(); envelope.v = v;
    rejects(() => codec.validateEnvelope(envelope), 'unsupported_version');
  }
  for (const prefix of ['FC0.', 'FC2.', 'FC01.', 'FC999.']) {
    rejects(() => codec.decodeCode(prefix + wire(DEFAULT_PACKED).slice(4)), 'unsupported_version');
  }
});
check('missing or extra fields at every envelope level are rejected', () => {
  for (const key of ['schema', 'v', 'settings', 'labels']) {
    const envelope = fresh(); delete envelope[key];
    rejects(() => codec.validateEnvelope(envelope), 'invalid_fields');
  }
  for (const key of SETTING_ORDER) {
    const envelope = fresh(); delete envelope.settings[key];
    rejects(() => codec.validateEnvelope(envelope), 'invalid_fields');
  }
  for (const key of LABEL_ORDER) {
    const envelope = fresh(); delete envelope.labels[key];
    rejects(() => codec.validateEnvelope(envelope), 'invalid_fields');
  }
  for (const scope of ['top', 'settings', 'labels']) {
    const envelope = fresh(); (scope === 'top' ? envelope : envelope[scope]).draft = 'must not be exported';
    rejects(() => codec.validateEnvelope(envelope), 'invalid_fields');
  }
});
check('arrays, nulls, nonplain objects, symbols and accessors cannot become records', () => {
  for (const value of [null, [], 'x', 1, true, new Date(), new Map()]) {
    rejects(() => codec.validateEnvelope(value));
    const envelope = fresh(); envelope.settings = value;
    rejects(() => codec.validateEnvelope(envelope));
  }
  let accessed = false;
  const accessor = fresh();
  Object.defineProperty(accessor.settings, 'label', { enumerable: true, get() { accessed = true; return 'x'; } });
  rejects(() => codec.validateEnvelope(accessor), 'invalid_fields');
  assert.equal(accessed, false);
  const symbolic = fresh(); symbolic.labels[Symbol('secret')] = 'x';
  rejects(() => codec.validateEnvelope(symbolic), 'invalid_fields');
  const hidden = fresh(); Object.defineProperty(hidden.labels, 'secret', { value: 'x', enumerable: false });
  rejects(() => codec.validateEnvelope(hidden), 'invalid_fields');
});
check('duplicate object keys, including escaped equivalent names, are rejected', () => {
  rejects(() => codec.parseShareJson(raw().replace('"schema":', '"schema":"formcapy-template","schema":')), 'duplicate_key');
  rejects(() => codec.parseShareJson(raw().replace('"label":', '"label":"first","label":')), 'duplicate_key');
  rejects(() => codec.parseShareJson(raw().replace('"label":', '"\\u006cabel":"first","label":')), 'duplicate_key');
  rejects(() => codec.parseShareJson(raw().replace('"school_name":', '"school_name":"first","school_name":')), 'duplicate_key');
});
check('prototype-related keys are rejected without pollution', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    rejects(() => codec.parseShareJson('{"' + key + '":{},' + raw().slice(1)), 'invalid_fields');
    rejects(() => codec.parseShareJson(raw().replace('"labels":{', '"labels":{"' + key + '":{},')), 'invalid_fields');
    const envelope = fresh();
    Object.defineProperty(envelope.settings, key, { value: {}, enumerable: true });
    rejects(() => codec.validateEnvelope(envelope), 'invalid_fields');
  }
  assert.equal({}.polluted, undefined);
});

const NUMBER_RANGES = {
  font_size: [8, 24], line_spacing: [1, 3], margin_cm: [0.5, 5.08], first_line_cm: [0, 2.54],
  page_number_start: [1, 9999], first_line_chars: [0, 4], line_spacing_pt: [0, 60]
};
for (const [key, [minimum, maximum]] of Object.entries(NUMBER_RANGES)) {
  check(`${key} enforces finite numeric range and integer page start`, () => {
    for (const value of [minimum, maximum]) {
      const envelope = fresh(); envelope.settings[key] = value;
      assert.equal(codec.validateEnvelope(envelope).settings[key], value);
      assert.equal(codec.decodeCode(codec.encodeCode(envelope)).settings[key], value);
    }
    for (const value of [minimum - 0.01, maximum + 0.01, NaN, Infinity, -Infinity, null, false, String(minimum), [], {}]) {
      const envelope = fresh(); envelope.settings[key] = value;
      rejects(() => codec.validateEnvelope(envelope), 'invalid_value');
    }
    const envelope = fresh(); envelope.settings[key] = minimum + 0.125;
    if (key === 'page_number_start') rejects(() => codec.validateEnvelope(envelope), 'invalid_value');
    else assert.equal(codec.validateEnvelope(envelope).settings[key], minimum + 0.125);
  });
}
check('text limits count Unicode code points and retain exact labels', () => {
  for (const [scope, key, maximum, required] of [
    ['settings', 'label', 60, true], ['settings', 'references_title', 80, true],
    ['labels', 'school_name', 120, false], ['labels', 'school_abbr', 24, false],
    ['labels', 'course_code', 64, false], ['labels', 'campus_term', 80, false]
  ]) {
    const envelope = fresh(); envelope[scope][key] = '😀'.repeat(maximum);
    assert.equal(codec.validateEnvelope(envelope)[scope][key], envelope[scope][key]);
    envelope[scope][key] += 'a';
    rejects(() => codec.validateEnvelope(envelope), 'invalid_value');
    envelope[scope][key] = '   ';
    if (required) rejects(() => codec.validateEnvelope(envelope), 'invalid_value');
    else assert.equal(codec.validateEnvelope(envelope)[scope][key], '   ');
  }
});
check('controls, noncharacters and unpaired surrogates are rejected in text', () => {
  for (const value of ['x\u0000', 'x\t', 'x\n', 'x\u007f', 'x\u0085', 'x\ufffe', 'x\uffff']) {
    const envelope = fresh(); envelope.labels.course_code = value;
    rejects(() => codec.validateEnvelope(envelope), 'invalid_value');
  }
  for (const value of ['\ud800', '\udc00', '\ud800x', '\udc00\ud800']) {
    const envelope = fresh(); envelope.settings.label = value;
    rejects(() => codec.validateEnvelope(envelope), 'invalid_unicode');
    rejects(() => codec.parseShareJson(raw().replace('Course template', JSON.stringify(value).slice(1, -1))), 'invalid_unicode');
  }
});
check('JSON parser rejects malformed syntax, trailing data and excessive nesting', () => {
  for (const text of ['', ' ', 'undefined', raw() + 'null', raw() + ',', '{"schema":}', '{"v":01}', '{"v":+1}', '{"v":1.}', '{"v":NaN}', '{"v":1e}', '{"v":1e999}', raw().slice(0, -1) + ',}', '[[[[[0]]]]]', '"unclosed', '"\\x20"']) {
    rejects(() => codec.parseShareJson(text));
  }
  rejects(() => codec.parseShareJson(raw().replace('Course template', 'Course\ntext')), 'invalid_json');
  rejects(() => codec.parseShareJson(null), 'invalid_json');
});
check('readable JSON accepts whitespace and ordinary noncanonical numeric spelling', () => {
  const text = ' \n\t' + raw().replace('"font_size":12', '"font_size":12.0') + '\r\n';
  assert.deepEqual(codec.parseShareJson(text), fresh());
  assert.deepEqual(codec.parseShareJson(codec.stringifyShareJson(fresh())), fresh());
});
check('packed tuple shape and every label type are strict', () => {
  for (const value of [[], [[], []], [JSON.parse(DEFAULT_PACKED)[0]], [...JSON.parse(DEFAULT_PACKED), []], { settings: [], labels: [] }]) {
    rejects(() => codec.decodeCode(wire(JSON.stringify(value))), 'invalid_structure');
  }
  for (const target of [0, 1]) {
    rejects(() => codec.decodeCode(alteredPacked((p) => { p[target].push('extra'); })), 'invalid_structure');
    rejects(() => codec.decodeCode(alteredPacked((p) => { p[target].pop(); })), 'invalid_structure');
  }
  for (let index = 0; index < 4; index += 1) {
    for (const value of [null, false, 1, [], {}]) {
      rejects(() => codec.decodeCode(alteredPacked((p) => { p[1][index] = value; })), 'invalid_value');
    }
  }
});
check('base64url alphabet, padding, length and pad bits are strict', () => {
  for (const payload of ['', 'A', 'AAA=', 'AA+A', 'AA/A', 'AA A', 'AA%A', 'QR', 'W11']) {
    rejects(() => codec.decodeCode('FC1.' + payload), 'invalid_base64');
  }
  for (const code of ['', 'fc1.' + wire(DEFAULT_PACKED).slice(4), 'FC1', ' FC1.AA', 'FC1.😀', 'FC1.AA\nA']) {
    rejects(() => codec.decodeCode(code), 'invalid_code');
  }
  rejects(() => codec.decodeCode(wire(DEFAULT_PACKED) + '\n'), 'invalid_code');
});
check('UTF-8 decoding rejects overlong, surrogate, out-of-range and truncated bytes', () => {
  for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82], [0xff]]) {
    rejects(() => codec.decodeCode(bytesWire(bytes)), 'invalid_utf8');
  }
  rejects(() => codec.decodeCode(bytesWire(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(DEFAULT_PACKED)]))), 'invalid_json');
});
check('noncanonical packed JSON cannot have spaces, alternate escapes or numeric spellings', () => {
  for (const text of [
    ' ' + DEFAULT_PACKED, DEFAULT_PACKED + '\n', DEFAULT_PACKED.replace('],[', '], ['),
    DEFAULT_PACKED.replace('2.54', '2.540'), DEFAULT_PACKED.replace('2.54', '254e-2'),
    DEFAULT_PACKED.replace('Course template', '\\u0043ourse template'),
    DEFAULT_PACKED.replace(',0,0,0,0],', ',0,0,-0,0],')
  ]) {
    assert.notEqual(text, DEFAULT_PACKED);
    rejects(() => codec.decodeCode(wire(text)), 'non_canonical');
  }
});
check('JSON has an exact 4096 UTF-8-byte boundary, including multibyte characters', () => {
  const envelope = fresh(); envelope.labels.school_name = '大学 😀';
  const text = JSON.stringify(envelope);
  const atLimit = text + ' '.repeat(4096 - Buffer.byteLength(text, 'utf8'));
  assert.equal(Buffer.byteLength(atLimit), 4096);
  assert.ok(atLimit.length < 4096);
  assert.deepEqual(codec.parseShareJson(atLimit), envelope);
  rejects(() => codec.parseShareJson(atLimit + ' '), 'json_too_large');
  const packedAtLimit = DEFAULT_PACKED + ' '.repeat(4096 - Buffer.byteLength(DEFAULT_PACKED));
  rejects(() => codec.decodeCode(wire(packedAtLimit)), 'non_canonical');
  rejects(() => codec.decodeCode(wire(packedAtLimit + ' ')), 'json_too_large');
});
check('code hard limit is 8192 ASCII characters and stays distinct from decoded size limit', () => {
  const atLimit = 'FC1.' + 'A'.repeat(8188);
  assert.equal(atLimit.length, 8192);
  rejects(() => codec.decodeCode(atLimit), 'json_too_large');
  rejects(() => codec.decodeCode(atLimit + 'A'), 'code_too_long');
  rejects(() => codec.decodeCode('FC1.' + 'A'.repeat(8187)), 'json_too_large');
});
check('maximal legal Unicode text exports within limits and is readable on import', () => {
  const envelope = fresh();
  envelope.settings.label = '😀'.repeat(60);
  envelope.settings.references_title = '😀'.repeat(80);
  envelope.labels.school_name = '😀'.repeat(120);
  envelope.labels.school_abbr = '😀'.repeat(24);
  envelope.labels.course_code = '😀'.repeat(64);
  envelope.labels.campus_term = '😀'.repeat(80);
  const exported = codec.stringifyShareJson(envelope);
  assert.ok(Buffer.byteLength(exported) <= 4096);
  assert.deepEqual(codec.parseShareJson(exported), envelope);
  assert.deepEqual(codec.decodeCode(codec.encodeCode(envelope)), envelope);
});
check('defensive pretty-size fallback returns importable compact JSON (isolated encoder-size stub)', () => {
  // Current text/range limits cannot naturally make a legal pretty export
  // exceed 4096 bytes. Exercise only the defensive branch with a size stub;
  // restore the native encoder before checking the actual exported bytes.
  const envelope = fresh();
  const pretty = JSON.stringify(envelope, null, 2) + '\n';
  const NativeEncoder = globalThis.TextEncoder;
  const native = new NativeEncoder();
  let forced = false, exported;
  try {
    globalThis.TextEncoder = class {
      encode(text) {
        if (text === pretty) { forced = true; return new Uint8Array(4097); }
        return native.encode(text);
      }
    };
    exported = codec.stringifyShareJson(envelope);
  } finally {
    globalThis.TextEncoder = NativeEncoder;
  }
  assert.equal(forced, true);
  assert.equal(exported.includes('\n'), false);
  assert.ok(Buffer.byteLength(exported, 'utf8') <= 4096);
  assert.deepEqual(codec.parseShareJson(exported), envelope);
});

const failed = checks.filter((item) => !item.passed);
for (const failure of failed) console.error(`${failure.name}\n${failure.error}\n`);
console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
