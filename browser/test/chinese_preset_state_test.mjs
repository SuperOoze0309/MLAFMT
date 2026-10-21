// Pure Node VM checks for the real template state code extracted from the HTML.
// No browser, network, document conversion, or user profile is used.
// Run: node browser/test/chinese_preset_state_test.mjs [path/to/index.html]
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

const profileCode = section('      const CUSTOM_DEFAULT =', '      function profileSnapshot');
const snapshotCode = section('      function profileSnapshot', '      function currentFormat');
const controlCode = section('      function currentFormat()', '      function numberingSummary');
const presetCode = section('      let presets = [];', '      function templateMessage');
const restoreCode = section('      const savedFormat = store.get', '      function renderStatus');
const handlers = section('      $("format-id").addEventListener("change"', '      const transfer =');
const importHandler = section('      $("transfer-apply").addEventListener("click"', '      $("transfer-file").addEventListener');

class Element {
  constructor() {
    this.value = '';
    this.defaultValue = '';
    this.checked = false;
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
  }
  get value() { return this._value; }
  set value(value) { this._value = String(value); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  trigger(type) { for (const callback of this.listeners.get(type) || []) callback({ target: this }); }
  removeAttribute() {}
  setAttribute() {}
  focus() {}
  close() { this.open = false; }
}

function harness(storage = new Map(), native = false) {
  const nodes = new Map([...source.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((match) => [match[1], new Element()]));
  const $ = (id) => {
    assert.ok(nodes.has(id), `Missing DOM control: ${id}`);
    return nodes.get(id);
  };
  const context = vm.createContext({
    $, native, window: {}, Blob,
    document: { createElement: () => new Element() },
    store: { get: (key) => storage.has(key) ? storage.get(key) : null,
      set: (key, value) => { storage.set(key, String(value)); return true; } },
    t: (key) => key === 'builtin_copy' ? 'Copy' : key,
    templateMessage: () => {}, refreshPreview: () => {},
  });
  const run = (code) => vm.runInContext(code, context);
  const json = (code) => JSON.parse(run(`JSON.stringify(${code})`));
  run(profileCode);
  const defaults = json('CUSTOM_DEFAULT');
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === 'boolean') $(`c-${key}`).checked = value;
    else $(`c-${key}`).value = String(value);
  }
  $('format-id').value = 'custom';
  $('spacing-mode').value = 'multiple';
  $('indent-mode').value = 'cm';
  $('date').value = $('date').defaultValue = '21 October 2026';
  run(controlCode + presetCode + restoreCode + handlers + '\nconst transfer = $("template-transfer");\n' + importHandler + '\nrenderPresets();');
  run(snapshotCode);
  function choose(value) { $('saved-presets').value = value; $('saved-presets').trigger('change'); }
  function edit(key, value) {
    const node = $(`c-${key}`);
    if (typeof defaults[key] === 'boolean') node.checked = value;
    else node.value = String(value);
    node.trigger(typeof defaults[key] === 'boolean' || run(`Object.hasOwn(PROFILE_CHOICES, ${JSON.stringify(key)})`) ? 'change' : 'input');
  }
  return { $, run, json, storage, choose, edit,
    profile: () => json('customProfile()'), saved: () => json('presets'),
    save: () => $('preset-save').trigger('click'),
    remove: () => $('preset-delete').trigger('click'),
    importProfile: (value) => { $('transfer-text').value = JSON.stringify(value); $('transfer-apply').trigger('click'); } };
}

const outcomes = [];
function check(name, callback) {
  callback();
  outcomes.push(name);
}

check('built-in profiles contain both Chinese layouts and effective units', () => {
  const h = harness();
  h.choose('builtin:zh_course');
  let p = h.profile();
  assert.equal(p.label, '中文课程论文（通用）');
  assert.equal(p.typography, 'chinese');
  assert.equal(p.font_name, '宋体');
  assert.equal(p.latin_font_name, 'Times New Roman');
  assert.equal(p.font_size, 12);
  assert.equal(p.first_line_chars, 2);
  assert.equal(p.line_spacing, 1.5);
  assert.equal(p.line_spacing_pt, 0);
  assert.equal(p.sort_references, false);
  assert.equal(p.title_page, false);
  h.choose('builtin:zh_thesis');
  p = h.profile();
  assert.equal(p.line_spacing_pt, 20);
  assert.equal(p.title_page, true);
  assert.equal(p.show_cover_page_number, false);
  assert.equal(p.page_number_position, 'bottom_center');
  assert.equal(h.saved().length, 0);
});

check('old profile JSON receives compatible typography defaults', () => {
  const h = harness();
  const old = { label: 'Legacy course', font_name: 'Arial', first_line_cm: 1 };
  const normalized = h.json(`normalizeProfile(${JSON.stringify(old)})`);
  assert.equal(normalized.typography, 'western');
  assert.equal(normalized.first_line_chars, 0);
  assert.equal(normalized.line_spacing_pt, 0);
  assert.equal(normalized.font_name, 'Arial');
  h.run(`writeProfile(${JSON.stringify(old)})`);
  assert.equal(h.profile().first_line_cm, 1);
  assert.equal(h.$('spacing-mode').value, 'multiple');
  assert.equal(h.$('indent-mode').value, 'cm');
});

check('old template import applies defaults and clears built-in copy provenance', () => {
  const h = harness();
  h.choose('builtin:zh_thesis');
  h.importProfile({ label: 'Imported old template', font_name: 'Arial', line_spacing: 1.25 });
  assert.equal(h.profile().label, 'Imported old template');
  assert.equal(h.profile().line_spacing, 1.25);
  assert.equal(h.profile().typography, 'western');
  assert.equal(h.profile().line_spacing_pt, 0);
  assert.equal(h.profile().first_line_chars, 0);
  assert.equal(h.storage.get('builtin_working_copy'), '');
  assert.equal(h.$('saved-presets').value, '');
  assert.equal(h.$('transfer-message').textContent, undefined);
});

check('legacy labels resembling new IDs migrate to personal templates', () => {
  for (const label of ['builtin:zh_course', 'saved:Course template']) {
    const storage = new Map([
      ['presets', JSON.stringify([{ label, font_name: 'Arial' }])],
      ['custom_profile', JSON.stringify({ label, font_name: 'Arial' })],
      ['selected_preset', label],
    ]);
    const h = harness(storage);
    assert.equal(h.$('saved-presets').value, `saved:${encodeURIComponent(label)}`);
    assert.equal(h.profile().font_name, 'Arial');
    assert.equal(h.$('preset-delete').disabled, false);
  }
});

check('built-in cannot be deleted and saving creates a distinct personal copy', () => {
  const h = harness();
  h.choose('builtin:zh_course');
  assert.equal(h.$('preset-delete').disabled, true);
  h.remove();
  assert.equal(h.saved().length, 0);
  h.save();
  assert.equal(h.saved().length, 1);
  assert.match(h.saved()[0].label, /Copy/);
  assert.equal(h.storage.get('builtin_working_copy'), '');
  h.choose('builtin:zh_course');
  assert.equal(h.profile().label, '中文课程论文（通用）');
});

check('built-in edit provenance survives reload and protects an existing name', () => {
  const storage = new Map([['presets', JSON.stringify([{ label: 'Existing', font_name: 'Arial', font_size: 14 }])]]);
  let h = harness(storage);
  h.choose('builtin:zh_thesis');
  h.edit('label', 'Existing');
  assert.equal(storage.get('builtin_working_copy'), 'zh_thesis');
  h = harness(storage);
  h.save();
  assert.equal(h.saved().length, 2);
  assert.equal(h.saved().find((p) => p.label === 'Existing').font_size, 14);
  assert.equal(h.saved().find((p) => p.label !== 'Existing').line_spacing_pt, 20);
  assert.equal(storage.get('builtin_working_copy'), '');
});

check('unrecognized persisted provenance is ignored', () => {
  const h = harness(new Map([['builtin_working_copy', 'unknown-template']]));
  assert.equal(h.run('builtinWorkingCopy'), '');
});

check('empty selection preserves copy provenance through reload', () => {
  const storage = new Map([['presets', JSON.stringify([{ label: 'Existing', font_size: 14 }])]]);
  let h = harness(storage);
  h.choose('builtin:zh_course');
  h.choose('');
  h.edit('label', 'Existing');
  h = harness(storage);
  h.save();
  assert.equal(h.saved().length, 2);
  assert.equal(h.saved().find((p) => p.label === 'Existing').font_size, 14);
});

check('twenty personal templates do not hide built-ins or allow extra copies', () => {
  const profiles = Array.from({ length: 20 }, (_, i) => ({ label: `Saved ${i}` }));
  const h = harness(new Map([['presets', JSON.stringify(profiles)]]));
  h.choose('builtin:zh_course');
  assert.equal(h.profile().typography, 'chinese');
  h.save();
  assert.equal(h.saved().length, 20);
  h.choose('saved:Saved%200');
  h.edit('font_size', 14);
  h.save();
  assert.equal(h.saved().length, 20);
  assert.equal(h.saved()[0].font_size, 14);
});

check('selecting personal templates clears built-in provenance and keeps updates', () => {
  const h = harness(new Map([['presets', JSON.stringify([{ label: 'Personal', font_name: 'Arial' }])]]));
  h.choose('builtin:zh_course');
  h.choose('saved:Personal');
  assert.equal(h.storage.get('builtin_working_copy'), '');
  h.edit('font_size', 14);
  h.save();
  assert.equal(h.saved().length, 1);
  assert.equal(h.saved()[0].font_size, 14);
  h.remove();
  assert.equal(h.storage.get('builtin_working_copy'), '');
  assert.equal(h.saved().length, 0);
});

check('mode switching disables the conflicting field and resets inactive unit', () => {
  const h = harness();
  h.choose('builtin:zh_thesis');
  assert.equal(h.$('c-line_spacing').disabled, true);
  assert.equal(h.$('c-first_line_cm').disabled, true);
  h.$('spacing-mode').value = 'multiple';
  h.$('spacing-mode').trigger('change');
  assert.equal(h.profile().line_spacing_pt, 0);
  assert.equal(h.$('c-line_spacing_pt').disabled, true);
  assert.equal(h.$('c-line_spacing').disabled, false);
  h.$('indent-mode').value = 'cm';
  h.$('indent-mode').trigger('change');
  assert.equal(h.profile().first_line_chars, 0);
  assert.equal(h.$('c-first_line_cm').disabled, false);
  h.$('spacing-mode').value = 'exact';
  h.$('spacing-mode').trigger('change');
  assert.equal(h.profile().line_spacing_pt, 20);
  h.$('indent-mode').value = 'chars';
  h.$('indent-mode').trigger('change');
  assert.equal(h.profile().first_line_chars, 2);
});

check('automatic date becomes Chinese while manual today remains literal', () => {
  const automatic = harness();
  automatic.choose('builtin:zh_course');
  assert.equal(automatic.$('date').value, '2026年10月21日');
  const manual = harness();
  manual.$('date').value = '21 October 2026';
  manual.$('date').trigger('input');
  manual.choose('builtin:zh_thesis');
  assert.equal(manual.$('date').value, '21 October 2026');
  manual.$('date').value = '2026-12-31';
  manual.$('date').trigger('input');
  manual.choose('builtin:zh_course');
  assert.equal(manual.$('date').value, '2026-12-31');
  manual.importProfile({ label: 'Imported Chinese', typography: 'chinese' });
  assert.equal(manual.$('date').value, '2026-12-31');
});

check('native dirty-date marker is stored and restored conservatively', () => {
  const storage = new Map();
  let h = harness(storage, true);
  h.$('date').value = '21 October 2026';
  h.$('date').trigger('input');
  assert.equal(storage.get('date_edited'), 'true');
  storage.set('date', '21 October 2026');
  h = harness(storage, true);
  assert.equal(h.run('hasAutomaticDate()'), false);
  h.choose('builtin:zh_thesis');
  assert.equal(h.$('date').value, '21 October 2026');
  const legacy = harness(new Map([['date', '21 October 2026']]), true);
  assert.equal(legacy.run('hasAutomaticDate()'), false);
});

check('built-in display identity is captured and survives later edits', () => {
  const h = harness();
  h.choose('builtin:zh_course');
  h.run('const generatedFormat = profileSnapshot({format_id: "custom", custom_profile: customProfile()})');
  assert.equal(h.run('generatedFormat.builtin_id'), 'zh_course');
  h.choose('builtin:zh_thesis');
  assert.equal(h.run('formatLabel(generatedFormat)'), 'chinese_course');
  h.edit('font_size', 14);
  assert.equal(h.run('profileSnapshot({format_id: "custom", custom_profile: customProfile()}).builtin_id'), null);
});

check('personal and imported names equal to built-ins remain literal', () => {
  const label = '中文课程论文（通用）';
  const h = harness(new Map([['presets', JSON.stringify([{ label, font_size: 14 }])]]));
  h.choose('saved:' + encodeURIComponent(label));
  h.run('const personalFormat = profileSnapshot({format_id: "custom", custom_profile: customProfile()})');
  assert.equal(h.run('personalFormat.builtin_id'), null);
  assert.equal(h.run('formatLabel(personalFormat)'), label);
  h.importProfile(h.json('BUILTIN_PRESETS[0].profile'));
  assert.equal(h.run('formatLabel(profileSnapshot({format_id: "custom", custom_profile: customProfile()}))'), label);
  assert.equal(h.run('formatLabel({id: "custom", label: "中文课程论文（通用）"})'), label);
});

check('bare transport metadata preserves only the matching request identity', () => {
  const h = harness();
  h.choose('builtin:zh_course');
  h.run('const requested = profileSnapshot({format_id: "custom", custom_profile: customProfile()})');
  assert.equal(h.run('resultFormat({id: requested.id, label: requested.label}, requested).builtin_id'), 'zh_course');
  assert.equal(h.run('resultFormat(null, requested).builtin_id'), 'zh_course');
  assert.equal(h.run('resultFormat({id: "custom", label: "Other"}, requested).builtin_id'), null);
  assert.equal(h.run('resultFormat({id: "apa", label: "APA"}, requested).builtin_id'), null);
});

console.log(JSON.stringify({ sourcePath, sourceSha256, passed: outcomes.length, outcomes,
  limits: ['DOM adapter, not a real browser', 'No document conversion, Android WebView or Safari execution'] }, null, 2));
