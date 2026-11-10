// Exercise the actual output renderer with ZIP and Word results in one page.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../../templates/index.html', import.meta.url)), 'utf8');
const start = html.indexOf('      function renderWebResult() {');
const end = html.indexOf('      function releaseWebResult()', start);
assert.ok(start >= 0 && end > start);
const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, {hidden:true, textContent:'', disabled:false});
  return nodes.get(id);
};
const context = vm.createContext({
  $:node, native:false, sharing:false, inProgress:false, paragraphLoading:false,
  renderParagraphControls() {}, canShareResult:()=>false, fileSize:()=> '1 KB',
  formatLabel:(format)=>format?.id, renderRetained(id) {node(id).hidden=true;},
  renderWarnings(id) {node(id).hidden=true;}, renderLayoutCheck() {node('layout-check').hidden=false;},
  t:(key,...args)=>key==='icml_details' ? `LaTeX ZIP · ${args[0]}` : key,
  webResult:null,
});
vm.runInContext(html.slice(start,end), context);
context.webResult = {name:'FormCapy-ICML-2026.zip', blob:{size:1024}, format:{id:'icml'}, url:'blob:icml', stats:[0,0,0], retained:[0,0,0], warnings:{}, icmlStyleIncluded:true, icmlStyleSource:'cache'};
vm.runInContext('renderWebResult()',context);
assert.equal(node('result-details').textContent, 'LaTeX ZIP · 1 KB');
assert.equal(node('web-download').textContent, 'icml_download');
assert.equal(node('web-download').download, 'FormCapy-ICML-2026.zip');
assert.equal(node('result-warning').hidden, false);
assert.equal(node('result-warning').textContent, 'icml_style_included_cache icml_result_warning');
assert.equal(node('layout-check').hidden, true, 'Word inspection must not appear for a LaTeX ZIP');
for (const [source, expected] of [['network','icml_style_included_network'], ['network_uncached','icml_style_included_uncached']]) {
  context.webResult.icmlStyleSource = source;
  vm.runInContext('renderWebResult()',context);
  assert.equal(node('result-warning').textContent, expected + ' icml_result_warning');
}
context.webResult.icmlStyleIncluded = false;
vm.runInContext('renderWebResult()',context);
assert.equal(node('result-warning').textContent, 'icml_style_unknown icml_result_warning', 'older backends must never claim the style was included');
context.webResult.icmlStyleIncluded = true;
context.webResult.icmlStyleSource = null;
vm.runInContext('renderWebResult()',context);
assert.equal(node('result-warning').textContent, 'icml_style_included_unknown icml_result_warning', 'unknown cache state is distinct from absent style');
context.webResult = {name:'paper.docx', blob:{size:1024}, format:{id:'mla'}, url:'blob:docx', stats:[0,0,0], retained:[0,0,0], warnings:{}};
vm.runInContext('renderWebResult()',context);
assert.equal(node('web-download').textContent, 'download_word');
assert.equal(node('result-warning').hidden, true);
assert.equal(node('layout-check').hidden, false, 'the old ZIP result must not hide Word inspection');
console.log('PASS ICML ZIP and Word result rendering and replacement');
