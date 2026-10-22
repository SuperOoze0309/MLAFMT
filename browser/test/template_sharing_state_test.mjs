// Integration checks for the real sharing UI and HTML apply/import handlers.
// This is a bounded DOM adapter, not browser layout, device or DOCX validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawHtml = fs.readFileSync(path.join(root, 'templates/index.html'), 'utf8');
const html = rawHtml.replace(/\r\n/g, '\n');
const codecSource = fs.readFileSync(path.join(root, 'static/template-share.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'static/template-sharing-ui.js'), 'utf8');
function section(start, end, input = html) {
  const first = input.indexOf(start), last = input.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing source boundary: ${start}`);
  return input.slice(first, last);
}
const profileCode = section('      const CUSTOM_DEFAULT = ', '      function profileSnapshot');
const syncCode = section('      function syncPageControls()', '      function numberingSummary');
const applyCode = section('        applyProfile(profile) {', '\n        },\n      }) || null;') + '\n        }';
const importCode = section('      let transferOpener = null;', '      $("transfer-copy").addEventListener');

function harness({ native = false, clipboardFails = false } = {}) {
  const nodes = new Map(), copied = [], downloads = [];
  let document;
  class Node {
    constructor(id = '') {
      this.id = id; this._value = ''; this.checked = false; this.hidden = false;
      this.open = false; this.disabled = false; this.dataset = {}; this.children = [];
      this.textContent = ''; this.events = new Map(); this.attributes = new Map();
    }
    get value() { return this._value; }
    set value(value) { this._value = String(value); }
    addEventListener(name, handler) {
      const handlers = this.events.get(name) || [];
      handlers.push(handler); this.events.set(name, handlers);
    }
    async trigger(name, event = {}) {
      for (const handler of this.events.get(name) || []) await handler({ target: this, ...event });
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    focus() { document.activeElement = this; }
    select() { this.selected = true; }
    showModal() { this.open = true; }
    close() { this.open = false; void this.trigger('close'); }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    click() { downloads.push({ href: this.href, filename: this.download }); }
    remove() {}
  }
  const translated = [...html.matchAll(/data-share-t="([^"]+)"/g)].map((match) => {
    const node = new Node(); node.dataset.shareT = match[1]; return node;
  });
  const labelled = [...html.matchAll(/data-share-label="([^"]+)"/g)].map((match) => {
    const node = new Node(); node.dataset.shareLabel = match[1]; return node;
  });
  const selected = new Map();
  document = {
    activeElement: null,
    getElementById(id) {
      assert.ok(html.includes(`id="${id}"`), `UI references a missing HTML id: ${id}`);
      if (!nodes.has(id)) nodes.set(id, new Node(id));
      return nodes.get(id);
    },
    createElement(tag) { const node = new Node(); node.tagName = tag; return node; },
    querySelectorAll(selector) {
      if (selector === '[data-share-t]') return translated;
      if (selector === '[data-share-label]') return labelled;
      throw new Error(`Unmodelled selector: ${selector}`);
    },
    querySelector(selector) {
      assert.ok(['[data-t="transfer_hint"]', '[data-t="template_text"]'].includes(selector));
      if (!selected.has(selector)) selected.set(selector, new Node());
      return selected.get(selector);
    },
    body: new Node('body'),
  };
  const context = vm.createContext({
    console, document, TextEncoder, TextDecoder, Blob,
    navigator: { clipboard: { async writeText(text) {
      if (clipboardFails) throw new Error('clipboard unavailable');
      copied.push(text);
    } } },
    URL: { createObjectURL() { return 'blob:sharing-state-test'; }, revokeObjectURL() {} },
    setTimeout() { return 0; },
  });
  const run = (code) => vm.runInContext(code, context);
  run(codecSource);
  run(uiSource);
  run(`const $ = (id) => document.getElementById(id);
       const native = ${JSON.stringify(native)};
       const t = (key) => key;
       const store = { set() { throw new Error('Unexpected storage write'); } };
       function updateAutomaticDate() { throw new Error('Unexpected date rewrite'); }
       function selectPreset() { throw new Error('Unexpected persisted selection'); }
       function persistCurrentProfile() { throw new Error('Unexpected profile persistence'); }
       let builtinWorkingCopy = 'zh_course', selectedPreset = 'saved:Original';
       const presets = [{ label: 'Original saved template' }];
       let redraws = 0;
       function renderPresets() { redraws += 1; }
       function refreshPreview() { redraws += 1; }
       ${profileCode}
       ${syncCode}
       writeProfile(CUSTOM_DEFAULT);
       $('format-id').value = 'mla';
       for (const id of ['name', 'instructor', 'title', 'course', 'affiliation', 'date', 'lname'])
         $(id).value = 'PRIVATE_' + id + '_527';
       let file = { name: 'PRIVATE_DRAFT_527.docx', bytes: 'PRIVATE_BYTES_527' };
       let paragraphItems = [{ id: 1, text: 'PRIVATE_PARAGRAPH_527' }];
       let preservedIds = new Set([1, 3]);
       let paragraphFingerprint = 'f'.repeat(64);
       let webResult = { name: 'PRIVATE_RESULT_527.docx', url: 'blob:PRIVATE_RESULT_527' };
       let dateWasEdited = true;
       const transfer = $('template-transfer');
       function checkedProfile() { return customProfile(); }
       const applyHook = ({ ${applyCode} }).applyProfile;
       templateSharing = FormCapyTemplateSharing.attach({
         getProfile: customProfile, normalizeLegacy: normalizeProfile, translate: t, native,
         applyProfile: applyHook,
       });
       ${importCode}
       templateSharing.render('en');
       function protectedSnapshot() {
         return JSON.stringify({
           paper: Object.fromEntries(['name','instructor','title','course','affiliation','date','lname'].map((id) => [id,$(id).value])),
           file, paragraphItems, preservedIds: [...preservedIds], paragraphFingerprint,
           webResult, dateWasEdited, presets,
         });
       }
       function allSnapshot() {
         return JSON.stringify({ protected: protectedSnapshot(), profile: customProfile(),
           format: $('format-id').value, selectedPreset, builtinWorkingCopy,
           labels: Object.fromEntries(FormCapyTemplateShare.LABEL_KEYS.map((key) => [key,$('share-'+key).value])),
         });
       }
  `);
  function input(text) { context.importText = text; return run('templateSharing.parseImport(importText)'); }
  function incoming(overrides = {}, labels = {}) {
    context.incomingSettings = JSON.stringify(overrides); context.incomingLabels = JSON.stringify(labels);
    run(`globalThis.incoming = FormCapyTemplateShare.createEnvelope(
      {...FormCapyTemplateShare.DEFAULT_SETTINGS, ...JSON.parse(incomingSettings)}, JSON.parse(incomingLabels));`);
    return run('JSON.stringify(incoming)');
  }
  return {
    run, nodes, copied, downloads, translated, input, incoming,
    $: (id) => document.getElementById(id),
    protected: () => run('protectedSnapshot()'), snapshot: () => run('allSnapshot()'),
    profile: () => JSON.parse(run('JSON.stringify(customProfile())')),
    click: async (id) => { await document.getElementById(id).trigger('click'); await Promise.resolve(); },
  };
}

const outcomes = [];
async function check(name, action) { await action(); outcomes.push(name); }
await check('code preview, cancel and malformed imports leave all document and template state intact', async () => {
  const h = harness(), before = h.snapshot();
  h.incoming({ label: 'Shared layout', paper_size: 'A4' }, { school_name: 'Universidad 示例 🦫' });
  const code = h.run('FormCapyTemplateShare.encodeCode(incoming)');
  h.$('transfer-text').value = code;
  await h.click('transfer-apply');
  assert.equal(h.$('template-share-preview').open, true);
  assert.equal(h.snapshot(), before);
  await h.click('share-dismiss');
  assert.equal(h.snapshot(), before);
  h.$('transfer-text').value = 'FC999.invalid';
  await h.click('transfer-apply');
  assert.equal(h.snapshot(), before);
  assert.match(h.$('transfer-message').textContent, /version/i);
});
await check('explicit application preserves paper details, file, paragraph selections, existing result and saved templates', async () => {
  const h = harness(), before = h.protected();
  h.incoming({ label: '  Shared layout  ', references_title: '  参考文献 🦫  ', paper_size: 'A4', typography: 'chinese', line_spacing_pt: 20 },
    { school_name: '学校 🦫', school_abbr: 'UCSB', course_code: 'LING 36', campus_term: '秋季' });
  h.run('templateSharing.preview(incoming, $("preset-import"))');
  await h.click('share-apply');
  assert.equal(h.protected(), before);
  assert.equal(h.run('selectedPreset'), '');
  assert.equal(h.run('builtinWorkingCopy'), '');
  assert.equal(h.$('format-id').value, 'custom');
  assert.equal(h.profile().label, '  Shared layout  ');
  assert.equal(h.profile().references_title, '  参考文献 🦫  ');
  assert.equal(h.$('share-course_code').value, 'LING 36');
  assert.equal(h.$('template-share-preview').open, false);
  await h.click('preset-share-json');
  const exported = JSON.parse(h.$('share-output').value);
  assert.equal(exported.settings.label, '  Shared layout  ');
  assert.equal(exported.settings.references_title, '  参考文献 🦫  ');
  assert.equal(exported.labels.school_name, '学校 🦫');
});
await check('outgoing code and JSON include only layout and explicitly entered labels, with an optional generic name', async () => {
  const h = harness(), before = h.protected(), original = h.profile();
  h.$('share-course_code').value = 'COCENGL1001C';
  await h.click('preset-share-code');
  assert.equal(h.copied.length, 1);
  const exported = h.input(h.copied[0]);
  assert.equal(Object.keys(exported.settings).length, 19);
  assert.equal(Object.keys(exported.labels).length, 4);
  assert.equal(exported.labels.course_code, 'COCENGL1001C');
  assert.equal(exported.labels.school_name, '');
  assert.ok(!JSON.stringify(exported).includes('PRIVATE_'));
  assert.equal(h.protected(), before);
  await h.click('share-dismiss');
  h.$('share-generic-name').checked = true;
  h.$('c-label').value = 'My private layout name';
  await h.click('preset-share-json');
  assert.equal(JSON.parse(h.$('share-output').value).settings.label, 'Course template');
  assert.equal(h.$('c-label').value, 'My private layout name');
  assert.equal(original.paper_size, h.profile().paper_size);
});
await check('legacy bare JSON and custom_profile wrapper still normalize, then wait for explicit application', async () => {
  const h = harness(), before = h.snapshot();
  const bare = JSON.stringify({ label: 'Legacy course', font_name: 'Arial', line_spacing: 1.25 });
  h.$('transfer-text').value = bare;
  await h.click('transfer-apply');
  assert.equal(h.snapshot(), before);
  await h.click('share-apply');
  assert.equal(h.profile().label, 'Legacy course');
  assert.equal(h.profile().font_name, 'Arial');
  assert.equal(h.profile().typography, 'western');
  assert.equal(h.input(JSON.stringify({ custom_profile: { label: 'Wrapped course' } })).settings.label, 'Wrapped course');
});
await check('three languages render all fields, labels remain literal text, and changing presets clears metadata', async () => {
  const h = harness();
  h.incoming({ label: 'Literal template' }, { school_name: '<img src=x onerror=alert(1)>', course_code: 'CSWMP16' });
  h.run('templateSharing.preview(incoming, $("preset-import"))');
  for (const [lang, title] of [['zh','核对导入的模板'],['en','Review imported template'],['es','Revisar la plantilla importada']]) {
    h.run(`templateSharing.render(${JSON.stringify(lang)})`);
    assert.equal(h.$('share-title').textContent, title);
    assert.equal(h.$('share-preview-settings').children.length, 38);
    assert.ok(h.translated.every((node) => typeof node.textContent === 'string' && node.textContent.length > 0));
    assert.ok(h.$('share-preview-overview').children.some((node) => node.textContent === '<img src=x onerror=alert(1)>'));
    assert.ok(h.$('share-preview-overview').children.every((node) => ['dt','dd'].includes(node.tagName)));
  }
  await h.click('share-apply');
  h.run('templateSharing.clearLabels()');
  for (const key of ['school_name','school_abbr','course_code','campus_term']) assert.equal(h.$('share-'+key).value, '');
  assert.equal(h.$('share-editor-message').textContent, '');
});
await check('clipboard fallback selects the full code; native export never offers browser downloads', async () => {
  const h = harness({ native: true, clipboardFails: true });
  await h.click('preset-share-code');
  assert.equal(h.$('share-output').selected, true);
  assert.equal(h.$('share-download').hidden, true);
  assert.ok(h.$('share-output').value.startsWith('FC1.'));
  assert.equal(h.downloads.length, 0);
});
await check('invalid UTF-8 file import cannot mutate current state', async () => {
  const h = harness(), before = h.snapshot();
  h.run('openTransfer(false)');
  const candidate = { size: 1, async arrayBuffer() { return Uint8Array.from([255]).buffer; } };
  await h.$('template-file').trigger('change', { target: { files: [candidate] } });
  assert.equal(h.snapshot(), before);
  assert.equal(h.$('transfer-message').textContent, 'template_unavailable');
});

function pendingTemplate() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { file: { size: 50, arrayBuffer: () => promise },
    finish: (text) => resolve(new TextEncoder().encode(text).buffer), reject };
}
function readTemplate(h, file) {
  return h.$('template-file').trigger('change', { target: { files: file ? [file] : [] } });
}
await check('newer template file wins when older file finishes late', async () => {
  const h = harness(), first = pendingTemplate(), second = pendingTemplate();
  h.run('openTransfer(false)');
  const a = readTemplate(h, first.file), b = readTemplate(h, second.file);
  second.finish('newer B'); await b;
  first.finish('older A'); await a;
  assert.equal(h.$('transfer-text').value, 'newer B');
});
await check('late import cannot replace a newly opened current-template export', async () => {
  const h = harness(), old = pendingTemplate(), before = h.protected();
  h.run('openTransfer(false)');
  const reading = readTemplate(h, old.file);
  h.$('template-transfer').close(); h.run('openTransfer(true)');
  const expected = h.$('transfer-text').value;
  old.finish('{"label":"Wrong late template"}'); await reading;
  assert.equal(h.$('transfer-text').value, expected);
  assert.equal(h.$('transfer-download').hidden, false);
  assert.equal(h.protected(), before);
});
await check('typing while a file is pending preserves the edited template text', async () => {
  const h = harness(), old = pendingTemplate();
  h.run('openTransfer(false)');
  const reading = readTemplate(h, old.file);
  h.$('transfer-text').value = 'user pasted code';
  await h.$('transfer-text').trigger('input');
  old.finish('late file text'); await reading;
  assert.equal(h.$('transfer-text').value, 'user pasted code');
});
await check('closing and reopening import invalidates the previous file and its errors', async () => {
  const h = harness(), old = pendingTemplate();
  h.run('openTransfer(false)'); const reading = readTemplate(h, old.file);
  h.$('template-transfer').close(); h.run('openTransfer(false)');
  old.reject(new Error('old cloud file unavailable')); await reading;
  assert.equal(h.$('transfer-text').value, '');
  assert.equal(h.$('transfer-message').textContent, '');
});
await check('an oversize newer choice keeps its error when an older read completes', async () => {
  const h = harness(), old = pendingTemplate();
  h.run('openTransfer(false)'); const reading = readTemplate(h, old.file);
  await readTemplate(h, { size: 32769, arrayBuffer() { throw new Error('must not read'); } });
  old.finish('late data'); await reading;
  assert.equal(h.$('transfer-message').textContent, 'template_file_large');
  assert.equal(h.$('transfer-text').value, '');
});
await check('cancelling the dialog invalidates a pending template read', async () => {
  const h = harness(), old = pendingTemplate();
  h.run('openTransfer(false)'); const reading = readTemplate(h, old.file);
  await h.$('template-transfer').trigger('cancel');
  old.finish('cancelled file'); await reading;
  assert.equal(h.$('transfer-text').value, '');
});
await check('cancelled chooser selection cannot allow an older read to reappear', async () => {
  const h = harness(), old = pendingTemplate();
  h.run('openTransfer(false)'); const reading = readTemplate(h, old.file);
  await readTemplate(h, null);
  old.finish('old selection'); await reading;
  assert.equal(h.$('transfer-text').value, '');
});
await check('same file can be chosen again and a stale close event does not cancel the new read', async () => {
  const h = harness(), old = pendingTemplate();
  h.run('openTransfer(false)'); h.$('template-transfer').close(); h.run('openTransfer(false)');
  const input = { files: [old.file], value: 'chosen.json' };
  const reading = h.$('template-file').trigger('change', { target: input });
  assert.equal(input.value, '');
  await h.$('template-transfer').trigger('close');
  old.finish('new dialog data'); await reading;
  assert.equal(h.$('transfer-text').value, 'new dialog data');
});

console.log(JSON.stringify({
  sourceSha256: createHash('sha256').update(rawHtml).digest('hex'),
  passed: outcomes.length, outcomes,
  limits: ['VM/DOM adapter; not layout, Safari or native device execution', 'No DOCX conversion or fresh downloaded-file inspection'],
}, null, 2));
