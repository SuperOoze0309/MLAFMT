// Actual installed Chrome acceptance of the independent converter page and
// six browser-local file conversions, reached through the public home entry.
// Requires a complete frozen build including the pinned Office runtime.
// A failed or unavailable engine fails the run; no successful output is mocked.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function option(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  assert.ok(process.argv[at + 1] && !process.argv[at + 1].startsWith("--"), `${name} needs a value`);
  return process.argv[at + 1];
}
const dist = path.resolve(root, option("--dist", "dist/formcapy-v2.12.0-preview"));
const baseArgument = option("--base", "");
let publicBase = "";
if (baseArgument) {
  const baseURL = new URL(baseArgument);
  assert.equal(baseURL.protocol,"https:","Public acceptance uses trusted HTTPS");
  assert.ok(!baseURL.username&&!baseURL.password&&!baseURL.search&&!baseURL.hash&&baseURL.pathname==="/","--base must be an HTTPS origin without credentials, path, query or fragment");
  publicBase=baseURL.origin;
}
const output = path.resolve(root, option("--out", "build/v2.12.0/acceptance/pdf-images"));
const chromePath = option("--chrome", process.env.FORMCAPY_TEST_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
const python = path.resolve(root, option("--python", process.env.FORMCAPY_TEST_PYTHON || ".venv/Scripts/python.exe"));
const marker = "PDF_IMAGE_ACCEPTANCE";
const chinese = "中文论文排版测试 水豚";
assert.equal(path.parse(output).root.toLowerCase(), path.parse(root).root.toLowerCase(), "Acceptance artifacts must stay on the project drive");
assert.equal((await fs.stat(path.join(dist, "index.html"))).isFile(), true, "Build the frozen static preview first");
assert.equal((await fs.stat(path.join(dist, "converter.html"))).isFile(), true, "Build the standalone converter page first");
await fs.mkdir(output, { recursive: true });
// Preserve the previous embedded-page acceptance before creating replacement
// screenshots/downloads. Never recursively remove or move an unchecked path.
try {
  await fs.access(path.join(output, "report.json"));
  let archive = path.join(output, "before-standalone");
  try { await fs.access(path.join(archive, "report.json")); archive = path.join(archive, "attempt-" + Date.now()); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await fs.mkdir(archive, { recursive: true });
  for (const entry of await fs.readdir(output, { withFileTypes: true })) {
    if (entry.name !== "downloads" && !(entry.isFile() && (entry.name.endsWith(".png") || ["report.json", "download-manifest.json"].includes(entry.name)))) continue;
    const source = path.resolve(output, entry.name);
    const destination = path.resolve(archive, entry.name);
    for (const target of [source, destination]) {
      const relative = path.relative(output, target);
      assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Acceptance archive stays within its verified output directory");
    }
    await fs.rename(source, destination);
  }
  console.log(`Preserved previous acceptance under ${archive}`);
} catch (error) { if (error.code !== "ENOENT") throw error; }
const profile = await fs.mkdtemp(path.join(output, "chrome-profile-"));
const downloads = path.join(output, "downloads");
const temp = path.join(output, "temp");
const fixtures = path.join(output, "fixtures");
await Promise.all([downloads, temp, fixtures].map(directory => fs.mkdir(directory, { recursive: true })));
const env = { ...process.env, TEMP: temp, TMP: temp, PYTHONDONTWRITEBYTECODE: "1" };
const report = {
  started: new Date().toISOString(), dist, output, base: publicBase||null, marker, chinese, checks: [], downloads: [],
  requests: [], serverRequests: [], externalRequests: [], failedRequests: [],
  consoleErrors: [], pageExceptions: [], workerAuditErrors: [], layouts: [], artifactHashes: {},
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const record = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const selector = value => `[data-fc-convert="${value}"]`;
async function pythonRun(code, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-c", code, ...args], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`Python validation failed (${code}): ${stderr || stdout}`)));
  });
}
for (const name of ["manifest.json", "index.html", "converter.html", "static/converter-page.js", "static/converter-page.css", "static/document-converter.js", "static/local-office.js", "runtime/office/runtime.json"]) {
  try { report.artifactHashes[name] = hash(await fs.readFile(path.join(dist, name))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml", ".py": "text/plain", ".txt": "text/plain" };
const server = publicBase ? null : createServer(async (request, response) => {
  const entry = { method: request.method, path: request.url, started: new Date().toISOString() };
  report.serverRequests.push(entry);
  const isolation = {
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache",
  };
  try {
    if (!["GET", "HEAD"].includes(request.method)) { entry.status = 405; response.writeHead(405, isolation).end(); return; }
    const url = new URL(request.url, "http://localhost");
    const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    if (relative === "/favicon.ico") { entry.status = 204; response.writeHead(204, isolation).end(); return; }
    const file = path.resolve(dist, "." + relative);
    const within = path.relative(dist, file);
    if (within.startsWith("..") || path.isAbsolute(within)) { entry.status = 403; response.writeHead(403, isolation).end(); return; }
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error("not a static file");
    entry.status = 200;
    response.writeHead(200, { ...isolation, "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": stat.size });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).on("error", () => response.destroy()).pipe(response);
  } catch { entry.status = 404; response.writeHead(404, isolation).end(); }
});
if (server) await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = publicBase || `http://127.0.0.1:${server.address().port}`;
const flags = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--metrics-recording-only", "--mute-audio", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--disk-cache-dir=${path.join(profile, "cache")}`, "about:blank"];
report.browserFlags = flags;
const chrome = spawn(chromePath, flags, { stdio: "ignore", env });
let launchError;
chrome.on("error", error => { launchError = error; });
let socket, cdp;
class CDP {
  constructor(socket) {
    this.socket = socket; this.next = 0; this.pending = new Map(); this.events = new Map();
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
      } else for (const listener of this.events.get(message.method) || []) listener({...message.params,cdpSessionId:message.sessionId||null});
    });
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.next; this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId?{sessionId}:{}) }));
    });
  }
  on(name, listener) { this.events.set(name, [...(this.events.get(name) || []), listener]); }
}
async function evaluate(expression, timeout = 15000) {
  let timer;
  try {
    const result = await Promise.race([
      cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Browser evaluation timeout: ${expression.slice(0, 100)}`)), timeout); }),
    ]);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  } finally { clearTimeout(timer); }
}
async function wait(expression, label, timeout = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error(`Timeout waiting for ${label}`);
}
const uiState = () => evaluate("window.__conversionAcceptance.ui.state()");
const click = value => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(value)}); if (!node || node.disabled || node.hidden) throw new Error('Missing/disabled/hidden control: '+${JSON.stringify(value)}); node.click(); return true; })()`);
async function chooseFile(filename, targetFormat) {
  const document = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: document.root.nodeId, selector: selector("file") });
  assert.ok(nodeId, "Converter file input exists");
  await cdp.send("DOM.setFileInputFiles", { nodeId, files: [filename] });
  await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector("target"))});node.value=${JSON.stringify(targetFormat)};node.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  const state = await uiState();
  assert.equal(state.hasFile, true);
  assert.equal(state.targetFormat, targetFormat);
  assert.equal(state.hasResult, false, "Changing a source or target invalidates the previous result");
}
async function screenshot(name) {
  await evaluate("window.scrollTo(0,0)");
  await sleep(100);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(data, "base64"));
}
async function pageScreenshot(name) {
  await evaluate("window.scrollTo(0,0)");
  await sleep(100);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(data, "base64"));
}
async function actualDownload(artifactName, expectedFormat) {
  const blob = await evaluate(`(async()=>{
    const link=document.querySelector(${JSON.stringify(selector("download"))});
    if(link.hidden||!link.href.startsWith('blob:'))throw new Error('No local conversion download');
    const bytes=await(await fetch(link.href)).arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return {href:link.href,name:link.download,size:bytes.byteLength,mime:(window.__conversionAcceptance.blobs.get(link.href)||{}).type,sha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')};
  })()`);
  assert.ok(blob.size > 100, "Converted Blob is nonempty");
  assert.ok(blob.name.toLowerCase().endsWith("." + expectedFormat), "Download extension matches the selected format");
  const expectedMime = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[expectedFormat];
  assert.equal(blob.mime, expectedMime);
  const before = new Set(await fs.readdir(downloads));
  await click(selector("download"));
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const names = (await fs.readdir(downloads)).filter(name => !before.has(name) && !name.endsWith(".crdownload"));
    if (names.length) {
      assert.equal(names.length, 1, "One click produces one downloaded file");
      const actual = path.join(downloads, names[0]);
      const bytes = await fs.readFile(actual);
      assert.equal(bytes.length, blob.size);
      assert.equal(hash(bytes), blob.sha256, "The real browser download matches the generated Blob");
      const destination = path.join(downloads, artifactName);
      if (actual !== destination) await fs.rename(actual, destination);
      const item = { file: destination, format: expectedFormat, actualBrowserDownload: true, suggestedFilename: names[0], bytes: bytes.length, sha256: hash(bytes), blob };
      report.downloads.push(item);
      return destination;
    }
    await sleep(100);
  }
  throw new Error(`Browser download did not finish: ${artifactName}`);
}
async function runConversion(source, targetFormat, artifactName, timeout = 120000) {
  await chooseFile(source, targetFormat);
  const started = Date.now();
  await click(selector("convert"));
  await wait("!window.__conversionAcceptance.ui.state().busy", artifactName, timeout);
  const state = await uiState();
  assert.equal(state.hasResult, true, await evaluate("document.querySelector('[data-fc-convert=status]').textContent"));
  const file = await actualDownload(artifactName, targetFormat);
  record(`real clicked ${path.extname(source).slice(1).toUpperCase()} to ${targetFormat.toUpperCase()} conversion and download`, { elapsedMs: Date.now() - started, file });
  return file;
}
const noEssayUI = () => evaluate(`({fields:['name','title','instructor','course','date','format-id','web-download','paper-title','paper-date'].filter(id=>document.getElementById(id)),citation:Boolean(window.FormCapyCitationAssistant),paperForm:Boolean(document.querySelector('form#format-form'))})`);

try {
  let port;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (launchError) throw launchError;
    try { port = Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); if (port) break; } catch {}
    await sleep(100);
  }
  assert.ok(port, "Installed Chrome debugging endpoint is available");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(target => target.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  cdp = new CDP(socket);
  // Edge can leave a service worker paused while Network.enable waits for its
  // startup. Keep the conversion workers/frames instrumented without pausing
  // the app's normal service-worker installation and activation lifecycle.
  const autoAttach = {autoAttach:true,waitForDebuggerOnStart:true,flatten:true,
    filter:[{type:"service_worker",exclude:true},{type:"browser",exclude:true},
      {type:"tab",exclude:true},{}]};
  cdp.on("Target.attachedToTarget", async event => {
    const session=event.sessionId;
    try {
      await cdp.send("Network.enable",{},session);
      await cdp.send("Target.setAutoAttach",autoAttach,session).catch(()=>{});
    } catch(error) {
      if(!/session.*(not found|closed)|target.*closed|No session/i.test(String(error.message||error)))report.workerAuditErrors.push(String(error.message||error));
    } finally {
      await cdp.send("Runtime.runIfWaitingForDebugger",{},session).catch(()=>{});
    }
  });
  cdp.on("Runtime.consoleAPICalled", event => { if (event.type === "error") report.consoleErrors.push(event.args.map(argument => argument.value || argument.description || "").join(" ")); });
  cdp.on("Runtime.exceptionThrown", event => report.pageExceptions.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
  cdp.on("Network.requestWillBeSent", event => {
    const item = { url: event.request.url, method: event.request.method, postData: event.request.postData || null, initiator: event.initiator.type, timestamp: event.timestamp, sessionId:event.cdpSessionId };
    report.requests.push(item);
    if (/^https?:/.test(item.url) && new URL(item.url).origin !== origin) report.externalRequests.push(item);
  });
  cdp.on("Network.loadingFailed", event => report.failedRequests.push(event));
  await Promise.all(["Page.enable", "Runtime.enable", "Network.enable", "DOM.enable"].map(method => cdp.send(method)));
  await cdp.send("Target.setAutoAttach",autoAttach);
  report.browserVersion = await cdp.send("Browser.getVersion");
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    window.__conversionAcceptance={ui:null,blobs:new Map(),calls:[],revoked:[]};
    localStorage.setItem('mlafmt.lang','en');
    const make=URL.createObjectURL.bind(URL), revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=(blob)=>{const url=make(blob);window.__conversionAcceptance.blobs.set(url,blob);return url;};
    URL.revokeObjectURL=(url)=>{window.__conversionAcceptance.revoked.push(String(url));return revoke(url);};
    let api;
    Object.defineProperty(window,'FormCapyDocumentConverter',{configurable:true,get(){return api},set(original){
      api=Object.freeze({...original,create(options){
        const ui=original.create({...options,convert:async request=>{
          const call={name:request.file.name,target:request.targetFormat,started:Date.now()};
          window.__conversionAcceptance.calls.push(call);
          try {const result=await options.convert(request);call.completed=Date.now();call.bytes=result.blob?.size;return result;}
          catch(error){call.error=error.code||error.message;call.detail=String(error.detail||'').slice(0,1000);throw error;}
        }});window.__conversionAcceptance.ui=ui;return ui;
      }});
    }});
  })()` });
  await cdp.send("Page.navigate", { url: origin + "/" });
  await wait("document.readyState==='complete' && document.querySelector('a[href$=\"converter.html\"]')", "home page with converter entry", 30000);
  assert.equal(await evaluate("crossOriginIsolated && isSecureContext && typeof SharedArrayBuffer==='function'"), true);
  record("frozen build runs in an isolated secure browser context");
  const home = await evaluate(`(()=>{
    const entry=[...document.querySelectorAll('a[href$="converter.html"]')].find(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.top<innerHeight});
    return {embedded:Boolean(document.querySelector('[data-fc-convert=panel],#document-converter-mount')),module:Boolean(window.FormCapyDocumentConverter),converterScripts:[...document.scripts].some(script=>/document-converter|local-office|converter-page/.test(script.src)),entry:entry?{href:entry.getAttribute('href'),text:entry.textContent.trim()}:null};
  })()`);
  assert.deepEqual({embedded:home.embedded,module:home.module,converterScripts:home.converterScripts},{embedded:false,module:false,converterScripts:false},"Homepage contains no embedded converter form or converter modules");
  assert.ok(home.entry?.text, "A visible, named converter navigation link is present in the first home viewport");
  report.homeEntry=home.entry;
  await pageScreenshot("homepage-converter-entry");
  await click('a[href$="converter.html"]');
  await wait("['/converter.html','/converter'].includes(location.pathname) && window.__conversionAcceptance?.ui && document.readyState==='complete'", "standalone converter mount", 30000);
  const standalone = await evaluate(`(()=>{
    const visible=role=>{const node=document.querySelector('[data-fc-convert="'+role+'"]');const r=node?.getBoundingClientRect();return Boolean(r?.width&&r.height&&getComputedStyle(node).visibility!=='hidden')};
    const panel=document.querySelector('[data-fc-convert=panel]');
    return {path:location.pathname,heading:document.getElementById('conversion-heading')?.textContent.trim(),open:panel?.open,chooseVisible:visible('choose'),targetVisible:visible('target'),homeLink:document.querySelector('#tool-paper')?.getAttribute('href')};
  })()`);
  assert.ok(standalone.heading, "Standalone page has a clear conversion heading");
  assert.equal(standalone.open,true,"Converter opens without an extra disclosure click");
  assert.equal(standalone.chooseVisible,true,"Source selection is visible immediately");
  assert.equal(standalone.targetVisible,true,"Target format is visible immediately");
  assert.equal(standalone.homeLink,"index.html");
  assert.deepEqual(await noEssayUI(),{fields:[],citation:false,paperForm:false},"Standalone converter contains no essay or citation interface");
  report.standalone=standalone;
  record("visible homepage entry opens an independent converter with source/target controls shown and no essay fields");

  await pythonRun(`import runpy,sys; sys.argv=['make_pdf_image_fixture.py',sys.argv[1]]; runpy.run_path('browser/test/make_pdf_image_fixture.py',run_name='__main__')`, [fixtures]);
  const imagePdf = path.join(fixtures, 'image-text.pdf');
  const scanned = path.join(fixtures, 'image-only.pdf');
  const direct = await runConversion(imagePdf, 'docx', 'pdf-images.docx');
  const doc = await runConversion(imagePdf, 'doc', 'pdf-images-mid.doc', 240000);
  const roundtrip = await runConversion(doc, 'docx', 'pdf-images-doc-roundtrip.docx', 240000);
  report.independentValidation = JSON.parse(await pythonRun(`import runpy,sys; sys.argv=['validate_pdf_image_downloads.py',*sys.argv[1:]]; runpy.run_path('browser/test/validate_pdf_image_downloads.py',run_name='__main__')`, [direct, doc, roundtrip, imagePdf]));
  record('drawn JPEG and Flate images and text survive per page in direct DOCX and real DOC roundtrip');

  await chooseFile(scanned, 'docx');
  await click(selector('convert'));
  await wait('!window.__conversionAcceptance.ui.state().busy', 'image-only PDF OCR limitation', 120000);
  assert.equal((await uiState()).hasResult, false, 'Image-only PDF must not pretend to create editable text');
  const ocrStatus = await evaluate("document.querySelector('[data-fc-convert=status]').textContent");
  assert.match(ocrStatus, /OCR/i);
  report.ocrLimitation = { source: scanned, status: ocrStatus, downloadOffered: false };
  record('image-only PDF preserves the OCR-required behavior');

  assert.equal(report.downloads.length, 3);
  assert.deepEqual(report.externalRequests, [], 'No external page or worker request');
  assert.ok(report.requests.every(item => item.method === 'GET'), 'Page and conversion workers only make GET requests');
  assert.ok(report.serverRequests.every(item => ['GET', 'HEAD'].includes(item.method)), 'No document uploads reach the local server');
  assert.deepEqual(report.pageExceptions, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.workerAuditErrors, []);
  report.requestTraceScope = 'Edge page/iframe and attached conversion worker network requests plus all local static-server requests. Initial service-worker installation requests are outside the CDP trace. Local blob reads are not uploads.';
  record('conversion emits no external request or upload and no browser exception');
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error.stack || error);
  console.error(report.error);
  try { report.failureState = await uiState(); report.calls = await evaluate('window.__conversionAcceptance.calls'); report.failureBody = await evaluate('document.body.innerText'); await screenshot('failure'); } catch {}
  process.exitCode = 1;
} finally {
  report.completed = new Date().toISOString();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  try { socket?.close(); } catch {}
  chrome.kill();
  await sleep(500);
  if (server) await new Promise(resolve => server.close(resolve));
  const absoluteProfile = await fs.realpath(profile);
  const relativeProfile = path.relative(path.resolve(output), absoluteProfile);
  assert.ok(relativeProfile && !relativeProfile.startsWith('..') && !path.isAbsolute(relativeProfile));
  await fs.rm(absoluteProfile, { recursive: true, force: true }).catch(error => console.log('Edge profile retained:', error.message));
}
