// Real browser checks of the optional Office runtime. No server receives files.
// node browser/test/run_office_browser_test.mjs [--dist dist/browser-local]
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = process.argv.indexOf("--dist");
const dist = arg < 0 ? path.join(root, "build/office-runtime") : path.resolve(root, process.argv[arg + 1]);
const output = path.join(root, "build/v2.11.0/office-acceptance");
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, "chrome-profile-"));
const temp = path.join(profile, "temp");
await fs.mkdir(temp);
const python = path.join(root, ".venv/Scripts/python.exe");
const fixture = path.join(output, "sample.docx");
const fixtureCode = "from docx import Document;import sys;d=Document();d.add_heading('Local Office Conversion',0);d.add_paragraph('Private conversion fixture 314159.');t=d.add_table(rows=2,cols=2);t.cell(0,0).text='Item';t.cell(0,1).text='Value';t.cell(1,0).text='Result';t.cell(1,1).text='271828';d.save(sys.argv[1])";
assert.equal(spawnSync(python, ["-c", fixtureCode, fixture]).status, 0);
const requests = [];
const errors = [];
const stages = [];
const report = { checks: [], requests, errors, stages, dist };
const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm" };
const server = createServer(async (request, response) => {
  requests.push({ method: request.method, url: request.url });
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cache-Control", "no-store");
  try {
    const relative = new URL(request.url, "http://localhost").pathname;
    if (relative === "/favicon.ico") { response.writeHead(204).end(); return; }
    if (relative === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/static/local-office.js"></script></body></html>');
      return;
    }
    const source = relative.startsWith("/browser/") || relative === "/static/local-office.js" ? root : dist;
    const target = path.resolve(source, "." + decodeURIComponent(relative));
    if (!target.startsWith(source + path.sep)) throw Error("path");
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw Error("file");
    response.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
    response.setHeader("Content-Length", stat.size);
    createReadStream(target).pipe(response);
  } catch (_) { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-component-update", "--disable-sync",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--disk-cache-dir=${path.join(profile, "cache")}`, "about:blank",
], { stdio: "ignore", env: { ...process.env, TEMP: temp, TMP: temp } });
let socket;
let cdp;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(Error(JSON.stringify(message.error))); else pending.resolve(message.result);
      } else for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(name, handler) { this.handlers.set(name, [...(this.handlers.get(name) || []), handler]); }
}
async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
function check(name) { report.checks.push(name); console.log(`PASS ${name}`); }
async function convert(input, target, outputName) {
  const base64 = (await fs.readFile(input)).toString("base64");
  const result = await evaluate(`(async()=>{const file=new File([Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0))],${JSON.stringify(path.basename(input))});const result=await FormCapyLocalOffice.convert(file,${JSON.stringify(target)},{onProgress:(stage)=>console.info('OFFICE_STAGE:'+stage)});const bytes=new Uint8Array(await result.blob.arrayBuffer());let text='';for(let p=0;p<bytes.length;p+=8192)text+=String.fromCharCode(...bytes.subarray(p,p+8192));return {name:result.name,warnings:result.warnings,base64:btoa(text)}})()`);
  const bytes = Buffer.from(result.base64, "base64");
  const destination = path.join(output, outputName);
  await fs.writeFile(destination, bytes);
  assert.ok(bytes.length > 100);
  assert.ok(result.warnings.includes("font_substitution"));
  if (target === "doc") { assert.equal(bytes.subarray(0, 8).toString("hex"), "d0cf11e0a1b11ae1"); assert.ok(result.warnings.includes("legacy_format")); }
  if (target === "pdf") assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  if (target === "docx") assert.equal(bytes.subarray(0, 2).toString(), "PK");
  check(`${path.extname(input).slice(1).toUpperCase()} -> ${target.toUpperCase()} produced real ${target} bytes`);
  return destination;
}
try {
  let debugPort;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { debugPort = Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/)[0]); } catch (_) {}
    if (debugPort) break;
    await sleep(100);
  }
  assert.ok(debugPort);
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  cdp = new CDP(socket);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");
  cdp.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") { errors.push(entry.text); console.log("BROWSER_ERROR", entry.text); } });
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => { const value = exceptionDetails.exception?.description || exceptionDetails.text; errors.push(value); console.log("PAGE_ERROR", value); });
  cdp.on("Runtime.consoleAPICalled", ({ args, type }) => {
    const value = args.map((item) => item.value || item.description || "").join(" ");
    if (value.startsWith("OFFICE_STAGE:")) { stages.push(value); console.log(value); }
    else if (type === "error") { errors.push(value); console.log("CONSOLE_ERROR", value); }
  });
  await cdp.send("Page.navigate", { url: origin });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate("Boolean(window.FormCapyLocalOffice)")) break;
    await sleep(100);
  }
  assert.equal(await evaluate("FormCapyLocalOffice.available()"), true);
  check("cross-origin isolated local Office transport available");
  const malformed = await evaluate("FormCapyLocalOffice.convert(new File(['not-a-word-document'],'broken.doc'),'pdf').then(()=>null,e=>e.code)");
  assert.equal(malformed, "bad_doc");
  check("plain text renamed .doc rejected before runtime loading");
  const doc = await convert(fixture, "doc", "converted.doc");
  const restored = await convert(doc, "docx", "roundtrip.docx");
  const docxPdf = await convert(fixture, "pdf", "docx.pdf");
  const docPdf = await convert(doc, "pdf", "doc.pdf");
  const verification = spawnSync(python, ["-c", "from docx import Document;from pypdf import PdfReader;import sys;d=Document(sys.argv[1]);text='\\n'.join(p.text for p in d.paragraphs);assert '314159' in text and '271828' in text;[(lambda t: None if '314159' in t and '271828' in t else (_ for _ in ()).throw(AssertionError('PDF text missing')))('\\n'.join(p.extract_text() for p in PdfReader(f).pages)) for f in sys.argv[2:]];print('roundtrip editable text and both PDF texts verified; DOC legacy table structure may flatten')", restored, docxPdf, docPdf], { encoding: "utf8" });
  assert.equal(verification.status, 0, verification.stderr + verification.stdout);
  check("DOC roundtrip preserves editable text including table contents; both PDF outputs contain expected text");
  report.limitations = ["The tested legacy DOC roundtrip flattened a DOCX table into ordinary text; legacy_format warning applies."];
  assert.equal(requests.every((request) => request.method === "GET"), true);
  check("all conversion requests are same-origin asset GETs; no document upload");
  await evaluate("FormCapyLocalOffice.dispose()");
  const fixtureBase64 = (await fs.readFile(fixture)).toString("base64");
  const cancellation = await evaluate(`(async()=>{const controller=new AbortController();const file=new File([Uint8Array.from(atob(${JSON.stringify(fixtureBase64)}),c=>c.charCodeAt(0))],'sample.docx');try{await FormCapyLocalOffice.convert(file,'pdf',{signal:controller.signal,onProgress:stage=>{if(stage==='office_wasm')controller.abort()}});return null}catch(error){return {code:error.code,iframes:document.querySelectorAll('iframe').length}}})()`);
  assert.equal(cancellation.code, "cancelled");
  assert.equal(cancellation.iframes, 0);
  check("cancelling runtime loading rejects promptly and removes the engine iframe");
  await convert(fixture, "pdf", "after-cancel.pdf");
  check("real conversion recovers after runtime-load cancellation");
  await evaluate("FormCapyLocalOffice.dispose()");
  cdp.on("Fetch.requestPaused", ({ requestId }) => { cdp.send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" }).catch(() => {}); });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*runtime/office/*" }] });
  await convert(fixture, "pdf", "cached-runtime.pdf");
  await cdp.send("Fetch.disable");
  check("cached verified runtime converts after every engine network resource is blocked");
  await evaluate("FormCapyLocalOffice.dispose()");
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error.stack || error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  if (cdp) { try { await cdp.send("Browser.close"); } catch (_) {} }
  socket?.close();
  chrome.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Office acceptance report: ${path.join(output, "report.json")}`);
}
