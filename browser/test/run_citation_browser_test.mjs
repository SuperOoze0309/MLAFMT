// Real Chromium acceptance for citation intake, local rendering and Word export.
// Run against the frozen static preview. All generated files stay on the H drive.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith('--'), `${name} requires a path`);
  return process.argv[index + 1];
}
const dist = path.resolve(root, option('--dist', process.env.FORMCAPY_TEST_DIST || 'dist/formcapy-v2.8.0-preview'));
const output = path.resolve(root, option('--out', process.env.FORMCAPY_TEST_OUT || 'build/v2.8.0/acceptance/browser'));
assert.equal(path.parse(output).root.toLowerCase(), path.parse(root).root.toLowerCase(), 'Test artifacts remain on the workspace drive');
assert.equal((await fs.stat(path.join(dist, 'index.html'))).isFile(), true, 'Build the static preview first');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.py': 'text/plain', '.png': 'image/png', '.txt': 'text/plain' };
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'chrome-profile-'));
const downloads = path.join(output, 'downloads');
const temp = path.join(output, 'temp');
const fixtures = path.join(output, 'fixtures');
await Promise.all([downloads, temp, fixtures].map(p => fs.mkdir(p, { recursive: true })));
const report = { started: new Date().toISOString(), dist, output, browserFlags: [], checks: [], realProvider: null, responses: [], simulated: [], consoleErrors: [], pageExceptions: [], requests: [], failedRequests: [], fetchCalls: [], layouts: [], downloads: [] };
report.artifactHashes = {};
for (const relative of ['manifest.json','index.html','static/citation-assistant.js','static/citation-doi-batch.js','static/citation-lookup.js','static/citation-import.js']) {
  try { report.artifactHashes[relative] = createHash('sha256').update(await fs.readFile(path.join(dist,relative))).digest('hex'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (relative === '/favicon.ico') { response.writeHead(204).end(); return; }
    const file = path.resolve(dist, '.' + relative);
    if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disk-cache-dir=${path.join(profile, 'cache')}`, 'about:blank'];
report.browserFlags = flags;
const chrome = spawn(chromePath, flags, { stdio: 'ignore', env: { ...process.env, TEMP: temp, TMP: temp } });
let socket;
class CDP {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id); if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
      } else for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  on(method, handler) { this.handlers.set(method, [...(this.handlers.get(method) || []), handler]); }
}
let cdp;
async function evaluate(expression, timeout = 240000) {
  let timer;
  try {
    const result = await Promise.race([cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Evaluation timeout: ${expression.slice(0, 100)}`)), timeout); })]);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  } finally { clearTimeout(timer); }
}
async function wait(expression, label, timeout = 240000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression, 10000)) return; await sleep(100); }
  throw new Error(`Timeout waiting for ${label}`);
}
const click = selector => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.disabled) throw new Error('Missing/disabled: ' + ${JSON.stringify(selector)}); node.click(); return true; })()`);
const set = (selector, value, event = 'input') => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('Missing: ' + ${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles: true})); return true; })()`);
const action = value => `[data-action="${value}"]`;
const field = value => `[data-field="${value}"]`;
const state = () => evaluate('window.__citationAcceptance.assistant.state()');
const intakeStatus = () => evaluate("document.querySelector('.fc-citations-intake-status').textContent");
const metadataRequests = () => report.requests.filter(x => x.url.startsWith('https://api.crossref.org/'));
const externalRequests = () => report.requests.filter(x => /^https?:/.test(x.url) && !x.url.startsWith(origin));
async function screenshot(name, selector = '.fc-citations-intake') {
  const pos = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (node) node.scrollIntoView({block:'start'}); return true; })()`);
  await sleep(150);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
}
async function sectionScreenshot(name, startSelector, endSelector=startSelector) {
  const clip=await evaluate(`(() => {const start=document.querySelector(${JSON.stringify(startSelector)}).getBoundingClientRect();const end=document.querySelector(${JSON.stringify(endSelector)}).getBoundingClientRect();return {x:Math.max(0,Math.floor(start.left)),y:Math.floor(start.top+scrollY),width:Math.ceil(start.width),height:Math.ceil(end.bottom-start.top),scale:1}})()`);
  const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
  await fs.writeFile(path.join(output,name+'.png'),Buffer.from(data,'base64'));
}
async function selectFile(selector, filename) {
  const doc = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  assert.ok(nodeId, `File input ${selector}`);
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filename] });
}
async function actualDownload(selector, name) {
  const before = new Set(await fs.readdir(downloads));
  await click(selector);
  for (let i = 0; i < 300; i++) {
    const names = (await fs.readdir(downloads)).filter(n => !before.has(n) && !n.endsWith('.crdownload'));
    if (names.length) {
      const source = path.join(downloads, names[0]);
      const dest = path.join(downloads, name);
      if (source !== dest) await fs.rename(source, dest);
      const stat = await fs.stat(dest);
      report.downloads.push({ name, bytes: stat.size, path: dest, actualBrowserDownload: true });
      assert.ok(stat.size > 1000);
      return dest;
    }
    await sleep(100);
  }
  throw new Error('Actual browser download did not finish');
}
const hostSnapshot = () => evaluate(`({title:document.getElementById('title').value,date:document.getElementById('date').value,name:document.getElementById('name').value,format:document.getElementById('format-id').value,previewTitle:document.getElementById('paper-title').textContent,previewDate:document.getElementById('paper-date').textContent,download:document.getElementById('web-download').href,dropTitle:document.getElementById('drop-title').textContent})`);

try {
  let port;
  for (let i = 0; i < 200; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); if (port) break; } catch {}
    await sleep(100);
  }
  assert.ok(port, 'Chrome debugging port');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(x => x.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  cdp = new CDP(socket);
  cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') report.consoleErrors.push(event.args.map(x => x.value || x.description || '').join(' ')); });
  cdp.on('Runtime.exceptionThrown', event => report.pageExceptions.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
  cdp.on('Network.requestWillBeSent', event => report.requests.push({ requestId:event.requestId,url: event.request.url, method: event.request.method, headers: event.request.headers, referrerPolicy: event.request.referrerPolicy, postData: event.request.postData || null, initiator: event.initiator.type, timestamp: event.timestamp, redirectedFrom:event.redirectResponse?.url||null }));
  cdp.on('Network.responseReceived', event => { if (event.response.url.startsWith('https://api.crossref.org/')) report.responses.push({url:event.response.url,status:event.response.status,protocol:event.response.protocol,securityState:event.response.securityState,securityDetails:event.response.securityDetails,headers:event.response.headers}); });
  cdp.on('Network.loadingFailed', event => report.failedRequests.push(event));
  await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable', 'DOM.enable'].map(method => cdp.send(method)));
  report.browserVersion = await cdp.send('Browser.getVersion');
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  // Read-only observability around the real factories; no successful metadata is injected here.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__citationAcceptance = {renders:[], fetchCalls:[]};
    localStorage.setItem('mlafmt.lang', 'en');
    for (const name of ['FormCapyCitationAssistant', 'FormCapyCitationEngine']) {
      let exposed;
      Object.defineProperty(window, name, {configurable:true, get(){return exposed}, set(api){
        if(name==='FormCapyCitationAssistant') exposed=Object.freeze({...api,create(options){const result=api.create(options);window.__citationAcceptance.assistant=result;return result}});
        else exposed=Object.freeze({...api,render:async(...args)=>{const result=await api.render(...args);window.__citationAcceptance.renders.push({args,result});return result}});
      }});
    }
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>{window.__citationAcceptance.fetchCalls.push({url:String(url),method:options?.method,mode:options?.mode,credentials:options?.credentials,referrerPolicy:options?.referrerPolicy,body:options?.body||null,started:performance.now()});return nativeFetch(url,options)};
  })()` });
  await cdp.send('Page.navigate', { url: origin + '/' });
  await wait("document.readyState === 'complete' && Boolean(window.__citationAcceptance?.assistant)", 'citation UI');
  await evaluate("document.querySelector('.fc-citations').open=true");
  const hasBatch = await evaluate('Boolean(window.FormCapyDoiBatch)');
  report.hasBatch = hasBatch;
  await sleep(500);
  assert.equal(externalRequests().length, 0);
  record('initial load has no external metadata request');

  await click('#try-demo');
  await set('#title', 'Acceptance paper title — retain exactly');
  await set('#date', '23 October 2026');
  await set('#name', 'Acceptance Student');
  await click('#convert');
  await wait("document.getElementById('web-download').href.startsWith('blob:') || document.getElementById('status').classList.contains('err')", 'paper conversion');
  assert.equal(await evaluate("document.getElementById('status').classList.contains('err')"), false, await evaluate("document.getElementById('status').textContent"));
  const hostBefore = await hostSnapshot();
  await fs.writeFile(path.join(output, 'paper-before.json'), JSON.stringify(hostBefore, null, 2));
  record('paper baseline converted through real Pyodide worker');

  await click(action('add'));
  await set(field('title'), 'Existing local fictional source');
  await set(field('issued-year'), '2024');
  await set(field('publisher'), 'Fictional Acceptance Press');
  await set(field('intake-doi'), 'https://doi.org/10.1038/nphys1170');
  await sleep(200);
  assert.equal(metadataRequests().length, 0);
  record('manual editing and pasted DOI do not trigger requests');
  await screenshot('01-doi-before-query');

  await click(action('intake-query'));
  await wait('!window.__citationAcceptance.assistant.state().intakeBusy', 'real Crossref DOI response', 22000);
  const realState = await state();
  report.realProvider = { doi: '10.1038/nphys1170', requests: metadataRequests(), status: await intakeStatus(), pending: realState.pendingIntake, success: realState.pendingIntake, simulated: false };
  await screenshot('02-doi-real-response');
  if (realState.pendingIntake) {
    const beforeCount = realState.items.length;
    assert.equal(beforeCount, 1, 'lookup review must not append automatically');
    report.realProvider.reviewText = await evaluate("document.querySelector('.fc-citations-intake-review').textContent");
    await click(action('intake-append'));
    const appended = await state();
    assert.equal(appended.items.length, 2);
    report.realProvider.item = appended.items.find(x => x.DOI?.toLowerCase() === '10.1038/nphys1170');
    assert.ok(report.realProvider.item?.title && report.realProvider.item?.authors.length && report.realProvider.item?.issued?.year);
    record('real DOI lookup populated title authors year, reviewed before append', report.realProvider.item);
  } else {
    report.providerBlocker = { status: await intakeStatus(), failedRequests: report.failedRequests.slice() };
    record('real DOI request failed safely; retained evidence without TLS bypass', report.providerBlocker);
  }

  if (hasBatch) {
    // This is a separate explicit operation following a single-record lookup.
    // Respect the adapter's documented 1.2 s global cooldown before starting it.
    await sleep(1300);
    const doiText = '10.1038/171737a0\nnot a DOI\nhttps://doi.org/10.1126/science.169.3946.635\n10.1038/171737a0';
    const beforeCount = (await state()).items.length;
    const beforeRequests = metadataRequests().length;
    await set(field('intake-doi'), doiText);
    await sleep(200);
    assert.equal(metadataRequests().length,beforeRequests,'pasting DOI list stays local');
    await click(action('intake-query'));
    await wait('!window.__citationAcceptance.assistant.state().intakeBusy','real mixed DOI batch',45000);
    const batchState = await state();
    const requests = metadataRequests().slice(beforeRequests);
    report.realBatch = {input:doiText,requests,rows:batchState.batchRows,status:await intakeStatus(),simulated:false};
    assert.deepEqual(batchState.batchRows.map(r=>r.status),['success','invalid','success','duplicate'],JSON.stringify(batchState.batchRows));
    assert.equal(requests.length,2,'only valid unique DOI rows requested');
    assert.equal(requests[0].url,'https://api.crossref.org/works/10.1038%2F171737a0');
    assert.equal(requests[1].url,'https://api.crossref.org/works/10.1126%2Fscience.169.3946.635');
    const intervalMs=(requests[1].timestamp-requests[0].timestamp)*1000;
    report.realBatch.startIntervalMs=intervalMs;
    assert.ok(intervalMs>=1299.5,`Real request start interval ${intervalMs} ms`);
    assert.equal(batchState.items.length,beforeCount,'batch results require explicit append');
    await screenshot('02b-real-mixed-doi-batch','.fc-citations-batch');
    record('real mixed batch queries valid unique DOIs in order with >=1.3 s start interval',{intervalMs,titles:batchState.batchRows.filter(r=>r.status==='success').map(r=>r.items[0].title)});
    await click(action('intake-select-none'));
    assert.equal(await evaluate("document.querySelectorAll('.fc-citations-intake-checkbox:checked').length"),0);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(action('intake-append'))}).disabled`),true);
    await click(action('intake-select-all'));
    assert.equal(await evaluate("document.querySelectorAll('.fc-citations-intake-checkbox:checked').length"),2);
    await click(field('intake-select-0'));
    assert.equal(await evaluate("document.querySelectorAll('.fc-citations-intake-checkbox:checked').length"),1);
    await sectionScreenshot('02c-real-selected-doi-review','.fc-citations-intake');
    await sectionScreenshot('formcapy-v2.9-quick-references-full-with-credits','#citation-assistant-mount','#citation-credits');
    for (const [width,height] of [[320,568],[390,844]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      const layout=await evaluate('({width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth})');
      assert.ok(layout.documentWidth<=width+1&&layout.bodyWidth<=width+1,JSON.stringify(layout));
      report.layouts.push({width,height,context:'real batch selection pending',...layout});
      await screenshot(`02d-real-batch-selection-${width}x${height}`,'.fc-citations-intake-review');
      record(`${width}x${height} real batch selection cards have no horizontal overflow`);
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await click(action('intake-append'));
    const after=(await state()).items;
    assert.equal(after.length,beforeCount+1);
    assert.ok(after.some(item=>item.DOI==='10.1126/science.169.3946.635'));
    assert.ok(!after.some(item=>item.DOI==='10.1038/171737a0'));
    report.realBatch.selectedDoi='10.1126/science.169.3946.635';
    record('all none and individual checkboxes append only the selected real DOI record');
  }

  await click(action('intake-import'));
  const bib = '@book{localbib,title={Fictional BibTeX acceptance},author={Example, Alice},year={2022},publisher={Local Press}}';
  const ris = 'TY  - JOUR\nTI  - Fictional RIS acceptance\nAU  - Example, Bob\nPY  - 2023\nJO  - Local Journal\nVL  - 7\nIS  - 2\nSP  - 12\nEP  - 20\nER  - '; 
  const json = JSON.stringify([{type:'webpage',title:'Fictional CSL JSON acceptance',author:[{literal:'Acceptance Institute'}],issued:{'date-parts':[[2025]]},URL:'https://example.com/local-acceptance'}]);
  const fileData = [['acceptance.bib', bib, 'bibtex'], ['acceptance.ris', ris, 'ris'], ['acceptance.json', json, 'json']];
  for (const [name, contents, format] of fileData) {
    const filename = path.join(fixtures, name);
    await fs.writeFile(filename, contents, 'utf8');
    const beforeCount = (await state()).items.length;
    const requestsBefore = metadataRequests().length;
    await set(field('intake-text'), '');
    await selectFile(field('intake-file'), filename);
    await wait(`document.querySelector(${JSON.stringify(field('intake-text'))}).value.length > 0 && !window.__citationAcceptance.assistant.state().intakeBusy`, `${format} local file read`);
    assert.equal((await state()).items.length, beforeCount);
    await click(action('intake-review'));
    await wait('window.__citationAcceptance.assistant.state().pendingIntake', `${format} review`);
    assert.equal((await state()).items.length, beforeCount, 'review before append');
    const review = await evaluate("document.querySelector('.fc-citations-intake-review').textContent");
    await click(action('intake-append'));
    assert.equal((await state()).items.length, beforeCount + 1);
    assert.equal(metadataRequests().length, requestsBefore);
    record(`actual ${name} file selection review append stays local`, {review});
  }
  const beforeDuplicate = await state();
  await set(field('intake-text'), bib);
  await click(action('intake-review'));
  await wait('window.__citationAcceptance.assistant.state().pendingIntake', 'duplicate review');
  const duplicateText = await evaluate("document.querySelector('.fc-citations-intake-review').textContent");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(action('intake-append'))}).disabled`), true);
  assert.deepEqual((await state()).items, beforeDuplicate.items);
  record('duplicate import is skipped without adding a row', {review: duplicateText});
  await click(action('intake-dismiss'));

  const oldItems = (await state()).items;
  const undoBatch = JSON.stringify([{type:'book',title:'Undo first synthetic source',publisher:'Local Press',issued:{'date-parts':[[2020]]}},{type:'book',title:'Undo second synthetic source',publisher:'Local Press',issued:{'date-parts':[[2021]]}}]);
  await set(field('intake-text'), undoBatch);
  await click(action('intake-review'));
  await click(action('intake-append'));
  assert.equal((await state()).items.length, oldItems.length + 2);
  await click(action('undo'));
  assert.deepEqual((await state()).items, oldItems);
  record('batch undo restores all prior entries');

  for (const style of ['mla', 'apa']) {
    await set(field('style'), style, 'change');
    await click(action('preview'));
    await wait(`window.__citationAcceptance.assistant.state().preview?.style === '${style}' && !window.__citationAcceptance.assistant.state().previewStale && !window.__citationAcceptance.assistant.state().previewBusy`, `${style} real rendering`);
    const payload = await evaluate('window.__citationAcceptance.renders.at(-1)');
    const dom = await evaluate("({html:document.querySelector('.fc-citations-preview-body').innerHTML,text:document.querySelector('.fc-citations-preview-body').textContent,heading:document.querySelector('.fc-citations-preview-heading').textContent})");
    await fs.writeFile(path.join(output, `${style}-preview-payload.json`), JSON.stringify({payload, dom, state:await state()}, null, 2));
    assert.ok(dom.text.toLowerCase().includes('fictional bibtex acceptance') && dom.text.toLowerCase().includes('fictional ris acceptance'));
    await click(action('word'));
    await wait("Boolean(document.querySelector('.fc-citations-word-link a').href.startsWith('blob:')) && !document.querySelector('.fc-citations-word-link a').hidden", `${style} real Word generation`);
    await actualDownload('.fc-citations-word-link a', `acceptance-${style}-references.docx`);
    await screenshot(`03-${style}-preview`, '.fc-citations-preview');
    record(`${style} real citation engine preview and actual Word browser download`);
  }
  const hostAfter = await hostSnapshot();
  assert.deepEqual(hostAfter, hostBefore);
  await fs.writeFile(path.join(output, 'paper-after.json'), JSON.stringify(hostAfter, null, 2));
  record('citation intake preview and Word export preserve paper metadata and original download link');

  const libraryBeforeLanguages = (await state()).items;
  for (const lang of ['zh', 'es', 'en']) {
    await click(`#lang-${lang}`);
    const labels = await evaluate("({heading:document.querySelector('.fc-citations-summary-title').textContent,query:document.querySelector('[data-action=intake-query]').textContent,import:document.querySelector('[data-action=intake-import]').textContent,preview:document.querySelector('[data-action=preview]').textContent})");
    assert.equal(labels.heading, {zh:'参考文献助手',es:'Asistente de referencias',en:'Reference assistant'}[lang]);
    assert.deepEqual((await state()).items, libraryBeforeLanguages);
    record(`${lang} language switch keeps imported library`, labels);
  }
  await click(action('intake-doi'));
  for (const [width, height] of [[320,568],[390,844],[800,600],[1024,600]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false});
    await sleep(100);
    const layout = await evaluate(`({width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,oversized:[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(n).position!=='absolute'}).slice(0,15).map(n=>({tag:n.tagName,id:n.id,className:n.className,right:n.getBoundingClientRect().right}))})`);
    report.layouts.push({width,height,...layout});
    await screenshot(`04-layout-${width}x${height}`);
    assert.ok(layout.documentWidth <= width + 1 && layout.bodyWidth <= width + 1, JSON.stringify(layout));
    record(`${width}x${height} layout has no horizontal overflow`);
  }

  // Controlled failure modes are explicitly simulated, after the real provider test.
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`(() => {
    window.__realAcceptanceFetch=window.fetch;
    const response=(url,doi,title)=>{const result=new Response(JSON.stringify({status:'ok','message-type':'work',message:{DOI:doi,type:'book',title:[title],author:[{family:'Synthetic',given:'Local'}],issued:{'date-parts':[[2024]]},publisher:'Local Press'}}),{status:200,headers:{'content-type':'application/json'}});Object.defineProperty(result,'url',{value:String(url)});return result};
    window.fetch=(url,options)=>{
      if(String(url).startsWith('https://api.crossref.org/')){
        const scenario=window.__lookupScenario;
        const doi=decodeURIComponent(new URL(String(url)).pathname.replace('/works/',''));
        window.__citationAcceptance.fetchCalls.push({url:String(url),simulated:true,scenario,started:performance.now()});
        if(scenario==='404')return Promise.resolve(new Response('',{status:404}));
        if(scenario==='network')return Promise.reject(new TypeError('Simulated offline'));
        if(scenario==='slow')return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})});
        if(scenario==='late')return new Promise(resolve=>setTimeout(()=>resolve(response(url,doi,'Late synthetic response')),250));
        if(scenario==='partial')return Promise.resolve(doi.endsWith('/batch-partial-missing')?new Response('',{status:404}):response(url,doi,'Partial synthetic '+doi.split('/')[1]));
        if(scenario==='cancel-completed')return doi.endsWith('/batch-cancel-late')?new Promise(resolve=>setTimeout(()=>resolve(response(url,doi,'Cancelled late synthetic source')),800)):Promise.resolve(response(url,doi,'Completed before cancellation'));
        if(scenario==='rate')return Promise.resolve(doi.endsWith('/batch-rate-limit')?new Response('',{status:429,headers:{'retry-after':'1'}}):response(url,doi,'Completed before 429'));
        throw new Error('Unexpected simulated scenario '+scenario);
      }
      return window.__realAcceptanceFetch(url,options);
    };
  })()`);
  for (const [scenario, doi] of [['404','10.5555/acceptance-not-found'],['network','10.5555/acceptance-network'],['slow','10.5555/acceptance-timeout']]) {
    await sleep(1300);
    await evaluate(`window.__lookupScenario=${JSON.stringify(scenario)}`);
    await set(field('intake-doi'), doi);
    const before = (await state()).items;
    await click(action('intake-query'));
    await wait('!window.__citationAcceptance.assistant.state().intakeBusy', `simulated ${scenario}`, 18000);
    assert.deepEqual((await state()).items, before);
    assert.equal((await state()).pendingIntake, false);
    const status = await intakeStatus();
    const feedback = await evaluate("document.querySelector('.fc-citations-intake').textContent");
    report.simulated.push({scenario,status,feedback,successProviderClaim:false});
    assert.ok(scenario==='404' ? /no record for this DOI/i.test(feedback) : scenario==='network' ? /Could not connect/i.test(feedback) : /lookup timed out/i.test(feedback));
    record(`simulated ${scenario} reports safe failure and preserves existing entries`, {status});
  }
  await sleep(1300);
  await evaluate("window.__lookupScenario='slow'");
  await set(field('intake-doi'), '10.5555/acceptance-cancel');
  await click(action('intake-query'));
  await wait('window.__citationAcceptance.assistant.state().intakeBusy', 'cancelable lookup busy');
  await click(action('intake-cancel'));
  await wait('!window.__citationAcceptance.assistant.state().intakeBusy', 'query cancellation');
  assert.equal((await state()).pendingIntake, false);
  assert.match(await intakeStatus(), /cancelled/i);
  report.simulated.push({scenario:'cancel',status:await intakeStatus(),successProviderClaim:false});
  record('simulated user cancellation restores usable intake with no stale append');
  await sleep(1300);
  await evaluate("window.__lookupScenario='late'");
  const beforeLate = (await state()).items;
  await set(field('intake-doi'), '10.5555/acceptance-late');
  await click(action('intake-query'));
  await wait('window.__citationAcceptance.assistant.state().intakeBusy', 'late response starts');
  await set(field('intake-doi'), '10.5555/new-input-after-request');
  await sleep(500);
  assert.equal((await state()).pendingIntake,false);
  assert.equal((await state()).intakeBusy,false);
  assert.deepEqual((await state()).items,beforeLate);
  assert.equal(await evaluate("document.querySelector('.fc-citations-intake-review').hidden"),true);
  report.simulated.push({scenario:'late response after edited DOI',delayMs:250,successProviderClaim:false});
  record('simulated late metadata after DOI edit cannot create stale review or overwrite library');
  if (hasBatch) {
    const beforePartial=(await state()).items;
    await sleep(1300);
    await evaluate("window.__lookupScenario='partial'");
    await set(field('intake-doi'),'10.5555/batch-partial-one\n10.5555/batch-partial-missing\n10.5555/batch-partial-three');
    await click(action('intake-query'));
    await wait('!window.__citationAcceptance.assistant.state().intakeBusy','partial batch completion',12000);
    const partial=await state();
    assert.deepEqual(partial.batchRows.map(r=>r.status),['success','failed','success']);
    assert.equal(await evaluate("document.querySelectorAll('.fc-citations-intake-checkbox').length"),2);
    assert.deepEqual(partial.items,beforePartial);
    report.simulated.push({scenario:'partial batch success/404/success',rows:partial.batchRows,successProviderClaim:false});
    record('simulated middle failure preserves both completed records for review');
    await click(action('intake-dismiss'));
    await sleep(1300);
    await evaluate("window.__lookupScenario='cancel-completed'");
    await set(field('intake-doi'),'10.5555/batch-cancel-completed\n10.5555/batch-cancel-late\n10.5555/batch-cancel-unqueried');
    await click(action('intake-query'));
    await wait("window.__citationAcceptance.fetchCalls.some(x=>x.simulated&&x.url.endsWith('batch-cancel-late')) && window.__citationAcceptance.assistant.state().batchRows[0]?.status==='success'",'completed first row and pending second row',6000);
    await click(action('intake-cancel'));
    const cancelled=await state();
    assert.equal(cancelled.intakeBusy,false);
    assert.equal(cancelled.pendingIntake,true);
    assert.equal(cancelled.batchRows[0].status,'success');
    await sleep(1000);
    assert.equal(await evaluate("document.querySelectorAll('.fc-citations-intake-checkbox').length"),1);
    assert.ok(!(await state()).batchRows.some(r=>r.status==='success'&&r.doi==='10.5555/batch-cancel-late'));
    const cancelCalls=await evaluate("window.__citationAcceptance.fetchCalls.filter(x=>x.simulated&&x.scenario==='cancel-completed')");
    assert.equal(cancelCalls.length,2,'cancelled batch must not query remaining row');
    await click(action('intake-append'));
    const appendedCancelled=(await state()).items;
    assert.equal(appendedCancelled.length,beforePartial.length+1);
    assert.equal(appendedCancelled.at(-1).DOI,'10.5555/batch-cancel-completed');
    await click(action('undo'));
    assert.deepEqual((await state()).items,beforePartial);
    report.simulated.push({scenario:'cancel batch after first success; second ignores abort and arrives late',rows:cancelled.batchRows,calls:cancelCalls,successProviderClaim:false});
    record('simulated batch cancellation retains completed selection and ignores late result without querying remaining DOI');
    await sleep(1300);
    await evaluate("window.__lookupScenario='rate'");
    await set(field('intake-doi'),'10.5555/batch-rate-completed\n10.5555/batch-rate-limit\n10.5555/batch-rate-unqueried');
    await click(action('intake-query'));
    await wait('!window.__citationAcceptance.assistant.state().intakeBusy','429 batch stops',6000);
    const limited=await state();
    const rateCalls=await evaluate("window.__citationAcceptance.fetchCalls.filter(x=>x.simulated&&x.scenario==='rate')");
    assert.equal(rateCalls.length,2,'429 stops before later rows');
    assert.deepEqual(limited.batchRows.map(r=>r.status),['success','failed','ready']);
    assert.deepEqual(limited.items,beforePartial);
    assert.equal(limited.pendingIntake,true);
    const limitedStatus=await intakeStatus();
    assert.match(limitedStatus,/Crossref requested a pause/);
    assert.match(limitedStatus,/this batch stopped/);
    assert.match(limitedStatus,/review 1 completed results/);
    assert.match(limitedStatus,/Try again manually later/);
    assert.match(limitedStatus,/there are no automatic retries/);
    report.simulated.push({scenario:'429 stops queue and retains completed first record',rows:limited.batchRows,calls:rateCalls,status:await intakeStatus(),successProviderClaim:false});
    await screenshot('05-simulated-429-stopped-batch','.fc-citations-batch');
    record('simulated 429 retains completed result and leaves later DOI unqueried with no auto retry');
  }
  await evaluate('window.fetch=window.__realAcceptanceFetch');

  report.fetchCalls = await evaluate('window.__citationAcceptance.fetchCalls');
  const realCalls = report.fetchCalls.filter(x => x.url.startsWith('https://api.crossref.org/') && !x.simulated);
  assert.equal(realCalls.length, hasBatch ? 3 : 1);
  for(const call of realCalls){assert.equal(call.credentials, 'omit');assert.equal(call.referrerPolicy, 'no-referrer');assert.equal(call.body, null);}
  assert.deepEqual(externalRequests().map(x => x.url), ['https://api.crossref.org/works/10.1038%2Fnphys1170',...(hasBatch?['https://api.crossref.org/works/10.1038%2F171737a0','https://api.crossref.org/works/10.1126%2Fscience.169.3946.635']:[])]);
  report.realRequestCounts=Object.fromEntries([...new Set(externalRequests().map(x=>x.url))].map(url=>[url,externalRequests().filter(x=>x.url===url).length]));
  report.requestTraceScope='Chrome DevTools Network events for this owned page; duplicate requests, redirects and loading failures are retained without filtering. Transport-internal retransmissions below CDP are not inferred.';
  assert.deepEqual(report.pageExceptions, []);
  const expectedNetworkErrors = report.providerBlocker ? report.consoleErrors.filter(x => /Failed to fetch|Failed to load resource|crossref|ERR_/i.test(x)) : [];
  assert.deepEqual(report.consoleErrors.filter(x => !expectedNetworkErrors.includes(x)), []);
  report.finalLibrary = await state();
  assert.deepEqual(await hostSnapshot(),hostBefore,'all simulated batch flows preserve original paper state');
  report.ok = !report.providerBlocker;
  report.completed = new Date().toISOString();
  console.log(report.ok ? 'OK: full real-provider citation browser acceptance passed' : 'PARTIAL: real provider blocked; all independent browser flows completed');
} catch (error) {
  report.ok = false; report.error = String(error.stack || error);
  console.error(report.error);
  try { report.failureState=await state(); report.failureBody=await evaluate('document.body.innerText'); await screenshot('failure'); } catch {}
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  try { socket?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  await new Promise(resolve=>server.close(resolve));
  const resolved=await fs.realpath(profile);
  assert.ok(resolved.startsWith(path.resolve(output)+path.sep),'profile cleanup remains inside acceptance directory');
  await fs.rm(resolved,{recursive:true,force:true}).catch(error=>console.log('Profile retained:',error.message));
}
