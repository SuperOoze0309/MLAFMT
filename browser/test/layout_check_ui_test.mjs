// Exercise the real result renderer in all three languages without a network.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const html = readFileSync(process.argv[2] || fileURLToPath(new URL('../../templates/index.html', import.meta.url)), 'utf8');
const start = html.indexOf('      const LAYOUT_CHECK_TEXT =');
const end = html.indexOf('      function renderWebResult()', start);
assert.ok(start >= 0 && end > start, 'actual layout renderer must exist');
const ids = ['paper_size','margins','default_font','paragraph_spacing','page_number',
  'preserved_content','images_tables','headings','references','visual_layout'];
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {textContent: '', hidden: true, children: [],
    replaceChildren(...children) { this.children = children; }});
  return nodes.get(id);
}
const context = vm.createContext({
  $: node, document: {createElement: () => ({textContent: ''})},
});
vm.runInContext('let lang = "en";\n' + html.slice(start, end), context);
function render(report, lang = 'en') {
  context.report = report;
  context.locale = lang;
  vm.runInContext('lang = locale; renderLayoutCheck(report);', context);
}
function labels(status) { return node(`layout-check-${status}`).children.map(item => item.textContent); }
function makeReport() {
  return {version:1, checks:ids.map((id, i) => ({id, status:i < 5 ? 'pass' : i < 7 ? 'warn' : 'unchecked'}))};
}

for (const language of ['zh','en','es']) {
  render(makeReport(), language);
  assert.equal(node('layout-check').hidden, false);
  assert.equal(labels('pass').length, 5);
  assert.equal(labels('warn').length, 2);
  assert.equal(labels('unchecked').length, 3);
  for (const id of ['layout-check-title','layout-check-scope','layout-check-pass-title','layout-check-warn-title','layout-check-unchecked-title']) {
    assert.ok(node(id).textContent.trim(), `${language}: ${id} must be translated`);
  }
}
for (const [language, pageCaveat, manualCaveat] of [
  ['zh', /不检查起始值或姓氏/, /页码起始值和姓氏/],
  ['en', /not starting value or surname/, /page-number start and surname/],
  ['es', /no el valor inicial ni el apellido/, /valor inicial y apellido/],
]) {
  render(makeReport(), language);
  assert.match(labels('pass').at(-1), pageCaveat);
  assert.match(labels('unchecked').at(-1), manualCaveat);
}

render(null);
assert.deepEqual(labels('pass'), ['No items could be confirmed.']);
assert.match(labels('unchecked')[0], /unavailable/);
render({version:1, checks:[{id:'paper_size',status:'pass'}]});
assert.equal(labels('pass').length, 1);
assert.match(labels('unchecked').at(-1), /unavailable/, 'partial report is not a full pass');
for (const bad of [
  {version:2, checks:makeReport().checks},
  {version:1, checks:[{id:'paper_size',status:'pass'}, {id:'paper_size',status:'pass'}]},
  {version:1, checks:[{id:'<img src=x onerror=alert(1)>',status:'pass'}]},
  {version:1, checks:[{id:'inspection_unavailable',status:'pass'}]},
  {version:1, checks:[{id:'references',status:'pass'}]},
  {version:1, checks:[{id:'images_tables',status:'pass'}]},
  {version:1, checks:[{id:'paper_size',status:'unknown'}]},
]) {
  render(bad);
  assert.deepEqual(labels('pass'), ['No items could be confirmed.']);
  assert.match(labels('unchecked')[0], /unavailable/);
  assert.ok(!JSON.stringify([...nodes.values()]).includes('<img'), 'never display untrusted labels');
}
render(makeReport(), 'en');
render({version:1, checks:[{id:'inspection_unavailable',status:'unchecked'}]}, 'zh');
assert.equal(labels('pass').length, 1, 'old results are replaced, not mixed');
assert.match(labels('unchecked')[0], /不可用/);
console.log('PASS layout check grouping, three languages, malformed or missing reports, and result replacement');
