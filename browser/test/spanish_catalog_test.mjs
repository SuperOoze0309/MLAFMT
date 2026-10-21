// Pure Node VM checks for the real language catalogs, initialization and render
// paths extracted from index.html. No browser, network or user profile is used.
// Run: node browser/test/spanish_catalog_test.mjs [path/to/index.html]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const sourcePath = process.argv[2] || fileURLToPath(new URL('../../templates/index.html', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
function section(start, end) {
  const first = source.indexOf(start);
  assert.ok(first >= 0, `Missing source anchor: ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.ok(last > first, `Missing end anchor: ${end}`);
  return source.slice(first, last);
}

const catalogCode = section('      const T =', '      const $ =');
const languageCode = section('      const $ =', '      let file = null');
const translationCode = section('      const t =', '      const CUSTOM_DEFAULT =');
const profileCode = section('      const CUSTOM_DEFAULT =', '      function currentFormat()');
const controlCode = section('      function currentFormat()', '      function isWordDraft()');
const previewCode = section('      function surname()', '      let observedPaperWidth =');
const renderCode = section('      function render() {', '      for (const code of LANGUAGES)');
const languageHandlers = section('      for (const code of LANGUAGES)', '      $("format-id").addEventListener');

function initialized(saved, browserLanguage) {
  const initialValues = new Map([
    ['mlafmt.name', 'María García'], ['mlafmt.title', 'Mi ensayo — 原文'],
    ['mlafmt.date', '21 October 2026'], ['mlafmt.references', 'Referencia sin traducir'],
  ]);
  if (saved !== null) initialValues.set('mlafmt.lang', saved);
  const storage = new Map(initialValues);
  const writes = [];
  const nodes = new Map();
  const context = vm.createContext({
    navigator: { language: browserLanguage },
    document: { getElementById: (id) => nodes.get(id) },
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => { storage.set(key, String(value)); writes.push(key); },
    },
  });
  const run = (code) => vm.runInContext(code, context);
  run(catalogCode + languageCode);
  return { context, run, storage, initialValues, writes, nodes };
}

const base = initialized(null, 'en-US');
const catalogs = base.run('T');
const keys = Object.keys(catalogs.en).sort();
const outcomes = [];
function check(name, callback) { callback(); outcomes.push(name); }

check('Chinese, English and Spanish have exactly the same catalog keys and types', () => {
  assert.deepEqual(Object.keys(catalogs).sort(), ['en', 'es', 'zh']);
  for (const lang of ['zh', 'en', 'es']) {
    assert.deepEqual(Object.keys(catalogs[lang]).sort(), keys, `${lang}: catalog keys`);
    for (const key of keys) {
      assert.ok(['string', 'function'].includes(typeof catalogs[lang][key]), `${lang}.${key}: unsupported value`);
      assert.equal(typeof catalogs[lang][key], typeof catalogs.en[key], `${lang}.${key}: incompatible type`);
    }
  }
});

check('Spanish contains explicit translations instead of inherited English messages', () => {
  // Identical universal units and the MLA style name are intentional.
  const unchangedAllowed = new Set(['format_mla', 'unit_pt', 'unit_cm']);
  for (const key of keys) {
    if (unchangedAllowed.has(key)) continue;
    assert.notEqual(catalogs.es[key], catalogs.en[key], `${key}: English string/function fallback`);
  }
});

check('Every Spanish catalog value renders nonempty text', () => {
  const profile = { line_spacing: 1.5, line_spacing_pt: 20, first_line_chars: 2, first_line_cm: 0.8466666667 };
  for (const key of keys) {
    const entry = catalogs.es[key];
    const text = typeof entry === 'function'
      ? entry(...(['spacing_summary', 'indent_summary'].includes(key) ? [profile] : [1, 2, 3, 4]))
      : entry;
    assert.equal(typeof text, 'string', `${key}: non-string rendering`);
    assert.ok(text.trim(), `${key}: empty translation`);
    assert.ok(!/\p{Script=Han}/u.test(text), `${key}: untranslated Chinese catalog text`);
  }
});

check('All HTML data-t, data-ph and data-label keys exist in all three catalogs', () => {
  const markup = source.slice(0, source.indexOf('<script'));
  const usedKeys = new Set([...markup.matchAll(/\bdata-(?:t|ph|label)="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(usedKeys.size > 80, 'Unexpectedly few markup translation keys');
  for (const key of usedKeys)
    for (const lang of ['zh', 'en', 'es']) assert.ok(Object.hasOwn(catalogs[lang], key), `${lang}: missing markup key ${key}`);
  const buttons = [...markup.matchAll(/\bid="lang-([a-z]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(buttons, ['en', 'es', 'zh']);
});

for (const [saved, browser, expected] of [
  ['es', 'en-US', 'es'], [null, 'es-ES', 'es'], [null, 'ES-mx', 'es'],
  ['en', 'es-MX', 'en'], ['zh', 'es-ES', 'zh'], [null, 'zh-CN', 'zh'],
  ['fr', 'es-AR', 'es'], ['unsupported', 'fr-FR', 'en'], [null, 'fr-FR', 'en'],
  [null, '', 'en'], [null, undefined, 'en'],
]) {
  check(`language initialization: saved=${saved ?? '(none)'}, browser=${browser ?? '(none)'} -> ${expected}`, () => {
    const h = initialized(saved, browser);
    assert.equal(h.run('lang'), expected);
    assert.deepEqual(h.run('Array.from(LANGUAGES)').join(','), 'zh,en,es');
    assert.equal(h.run('LANGUAGE_LOCALES[lang]'), { zh: 'zh-CN', en: 'en', es: 'es-ES' }[expected]);
    assert.deepEqual([...h.storage], [...h.initialValues], 'Language initialization changed stored user content');
    assert.deepEqual(h.writes, [], 'Language initialization unexpectedly wrote storage');
  });
}

class Element {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.checked = false;
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.style = { setProperty() {} };
    this.classList = { toggle() {} };
  }
  get value() { return this._value; }
  set value(value) {
    assert.ok(!this.protectValue, `Language rendering changed user input: ${this.id}`);
    this._value = String(value);
  }
  setAttribute() {}
  removeAttribute() {}
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  trigger(type) { for (const callback of this.listeners.get(type) || []) callback({ target: this }); }
  getBoundingClientRect() { return { width: 420 }; }
}

function renderingHarness() {
  const h = initialized('en', 'es-ES');
  for (const match of source.matchAll(/\bid="([A-Za-z0-9_-]+)"/g))
    if (!h.nodes.has(match[1])) h.nodes.set(match[1], new Element(match[1]));
  const translated = ['t', 'ph', 'label'].flatMap((attribute) =>
    [...source.matchAll(new RegExp(`\\bdata-${attribute}="([^"]+)"`, 'g'))].map((match) => {
      const element = new Element();
      element.dataset[attribute] = match[1];
      return element;
    }));
  const selectors = new Map([
    ['.paper-body', new Element()], ['.paper-heading', new Element()],
  ]);
  const querySelector = (selector) => {
    const translatedKey = selector.match(/^\[data-t=([^\]]+)\]$/)?.[1];
    if (translatedKey) return translated.find((element) => element.dataset.t === translatedKey);
    if (selector.startsWith('meta[')) return { content: 'none' };
    assert.ok(selectors.has(selector), `Unexpected preview selector: ${selector}`);
    return selectors.get(selector);
  };
  h.context.document = {
    getElementById: (id) => h.nodes.get(id),
    querySelector,
    querySelectorAll: (selector) => {
      const attribute = selector.match(/^\[data-(t|ph|label)\]$/)?.[1];
      assert.ok(attribute, `Unexpected render selector: ${selector}`);
      return translated.filter((element) => Object.hasOwn(element.dataset, attribute));
    },
    createElement: () => new Element(), documentElement: {}, title: '',
  };
  Object.assign(h.context, {
    native: false, publicServer: false, transport: { kind: 'browser' },
    nativeResultFormat: null, nativeResultWarnings: null, nativeResultRetained: null,
    renderDrop() {}, renderPresets() {}, renderStatus() {}, renderWebResult() {},
    renderParagraphs() {}, renderWarnings() {}, renderRetained() {}, templateMessage() {},
    defaultDate: () => 'AUTOMATIC-DATE-MUST-NOT-REPLACE-USER-TEXT',
  });
  h.run(translationCode + profileCode + controlCode + '\nlet selectedPreset = "";\n');
  const defaults = JSON.parse(h.run('JSON.stringify(CUSTOM_DEFAULT)'));
  for (const [key, value] of Object.entries(defaults)) {
    const element = h.nodes.get(`c-${key}`);
    assert.ok(element, `Missing profile control c-${key}`);
    if (typeof value === 'boolean') element.checked = value;
    else element.value = value;
  }
  h.nodes.get('format-id').value = 'custom';
  h.nodes.get('spacing-mode').value = 'multiple';
  h.nodes.get('indent-mode').value = 'cm';
  const userValues = {
    name: 'María García', title: 'Mi ensayo — 原文', instructor: 'Profesor/a López',
    course: 'Letras 101', affiliation: 'Universidad de Ejemplo', date: '21 October 2026',
    lname: 'García', 'c-label': '中文课程论文（通用）', 'c-references_title': 'Mis referencias',
  };
  for (const [id, value] of Object.entries(userValues)) {
    h.nodes.get(id).value = value;
    h.nodes.get(id).protectValue = true;
  }
  h.run(previewCode + renderCode + languageHandlers);
  return { ...h, userValues };
}

check('Real language click/render/preview paths preserve user text and literal date', () => {
  const h = renderingHarness();
  for (const lang of ['es', 'zh', 'en', 'es']) {
    h.nodes.get(`lang-${lang}`).trigger('click');
    assert.equal(h.run('lang'), lang);
    assert.equal(h.storage.get('mlafmt.lang'), lang);
    assert.equal(h.context.document.documentElement.lang, { zh: 'zh-CN', en: 'en', es: 'es-ES' }[lang]);
    for (const [id, value] of Object.entries(h.userValues)) assert.equal(h.nodes.get(id).value, value, `${lang}: changed ${id}`);
    assert.equal(h.nodes.get('paper-date').textContent, '21 October 2026');
    assert.equal(h.nodes.get('paper-title').textContent, h.userValues.title);
    for (const [key, value] of h.initialValues)
      if (key !== 'mlafmt.lang') assert.equal(h.storage.get(key), value);
  }
  assert.ok(h.writes.every((key) => key === 'mlafmt.lang'), 'Language switch wrote non-language user settings');
});

check('Personal template names matching built-ins stay literal in every language', () => {
  const h = renderingHarness();
  for (const lang of ['es', 'zh', 'en']) {
    h.nodes.get(`lang-${lang}`).trigger('click');
    assert.equal(h.run('formatLabel(profileSnapshot({format_id:"custom",custom_profile:customProfile()}))'), '中文课程论文（通用）');
    assert.equal(h.run('profileSnapshot({format_id:"custom",custom_profile:customProfile()}).builtin_id'), null);
  }
});

console.log(JSON.stringify({ sourcePath, sourceSha256, catalogKeysPerLanguage: keys.length,
  passed: outcomes.length, outcomes,
  limits: ['Pure VM and DOM adapter; not browser layout or a device run', 'No document conversion or translated citation content'] }, null, 2));
