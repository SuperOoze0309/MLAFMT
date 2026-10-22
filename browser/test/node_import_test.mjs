// Desktop Node smoke test for the pinned Pyodide runtime.
// Proves that lxml, typing_extensions and python-docx import and that the
// project formatter generates a DOCX inside the wasm runtime.
// Run: node browser/test/node_import_test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { loadPyodide } from "../.cache/pyodide/314.0.7/full/pyodide.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runtimeDir = path.join(root, "browser/.cache/pyodide/314.0.7/full");
const runtimeURL = runtimeDir.replace(/\\/g, "/") + "/";

const pyodide = await loadPyodide({ indexURL: runtimeURL });
console.log("pyodide", pyodide.version, "python", pyodide.runPython("import sys; sys.version.split()[0]"));

await pyodide.loadPackage(["lxml", "typing-extensions"]);
console.log("lxml", pyodide.runPython("import lxml.etree; lxml.etree.LXML_VERSION"));

// Install the pure-Python python-docx wheel into an application directory.
const wheel = await readFile(path.join(runtimeDir, "python_docx-1.2.0-py3-none-any.whl"));
pyodide.FS.writeFile("/tmp/python_docx.whl", new Uint8Array(wheel));
console.log("python-docx install", pyodide.runPython(`
import sys, zipfile, pathlib
target = pathlib.Path("/app/pylib")
target.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile("/tmp/python_docx.whl") as archive:
    archive.extractall(target)
sys.path.insert(0, str(target))
import docx, typing_extensions
docx.__version__
`));

for (const name of ["mla_formatter.py", "format_profiles.py", "docx_preserve.py", "bibliography_export.py", "browser_bridge.py"]) {
  const bytes = await readFile(path.join(root, name));
  pyodide.FS.writeFile("/app/" + name, new Uint8Array(bytes));
}
pyodide.runPython("import sys; sys.path.insert(0, '/app')");

const sampleDocx = pyodide.runPython(`
import io
from docx import Document
document = Document()
for text in ("Jordan Example", "Professor Example", "ENG 101", "1 January 2026",
             "The Role of Memory in Hamlet",
             "This is a preserved body paragraph with a citation (Smith 12)."):
    document.add_paragraph(text)
buffer = io.BytesIO()
document.save(buffer)
buffer.getvalue()
`);
pyodide.FS.writeFile("/tmp/sample.docx", sampleDocx);
const report = JSON.parse(pyodide.runPython(`
import io, json, zipfile
from mla_formatter import convert_draft_to_mla, generate_filename
out = io.BytesIO()
stats = convert_draft_to_mla("/tmp/sample.docx", out, name="Jordan Example", instructor="Professor Example",
    course="ENG 101", date_str="1 January 2026", title="The Role of Memory in Hamlet")
data = out.getvalue()
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    names = archive.namelist()
    document_xml = archive.read("word/document.xml").decode("utf-8")
    header_xml = "".join(archive.read(name).decode("utf-8") for name in names
                          if name.startswith("word/header"))
json.dumps({
    "bytes": len(data),
    "stats": stats,
    "filename": generate_filename("Jordan Example", None, format_id="mla"),
    "entries": len(names),
    "header_xml": header_xml,
    "has_body": "preserved body paragraph" in document_xml,
    "zip_ok": zipfile.ZipFile(io.BytesIO(data)).testzip() is None,
})
`));
console.log("convert result", {
  bytes: report.bytes,
  stats: report.stats,
  filename: report.filename,
  entries: report.entries,
});

assert.ok(report.bytes > 1000, "generated DOCX should not be empty");
assert.equal(report.stats.body, 1, "one preserved body paragraph expected");
assert.equal(report.filename, "Example_MLA_Essay.docx", "filename must use the surname");
assert.ok(report.has_body, "body paragraph must survive conversion");
assert.ok(report.header_xml.includes("Example "), "the running header must use the surname Example");
assert.ok(report.header_xml.includes("PAGE"), "the running header must contain a PAGE field");
assert.ok(report.zip_ok, "generated DOCX must be a valid ZIP package");
assert.equal(report.entries, 18, "unexpected DOCX part count");
console.log("OK: Pyodide import and DOCX conversion assertions passed");

const bibliographyReport = JSON.parse(pyodide.runPython(`
import os
import browser_bridge
bibliography = {
    "style": "apa", "heading": "References",
    "entries": [
        {"id": "b", "html": '<div class="csl-entry">Zed, J. (2024). <i>Fictional river</i>. Example Press.</div>', "text": "Zed, J. (2024). Fictional river. Example Press."},
        {"id": "a", "html": '<div class="csl-entry">Alfa Research. (2023). <a href="https://example.org/resource">Signals</a>.</div>', "text": "Alfa Research. (2023). Signals."},
    ],
    "layout": {"hangingindent": True, "linespacing": 2, "entryspacing": 0, "second-field-align": False, "maxoffset": 0},
}
started = json.loads(browser_bridge.begin())
metadata, content = browser_bridge.finish(json.dumps({"kind": "bibliography", "bibliography": bibliography}), started["workdir"])
meta = json.loads(metadata)
with zipfile.ZipFile(io.BytesIO(content)) as archive:
    xml = archive.read("word/document.xml").decode("utf-8")
    relations = archive.read("word/_rels/document.xml.rels").decode("utf-8")
    package_names = archive.namelist()
json.dumps({
    "meta": meta,
    "zip_ok": zipfile.ZipFile(io.BytesIO(content)).testzip() is None,
    "order_ok": xml.find("Zed, J.") < xml.find("Alfa Research."),
    "has_italic": '<w:i' in xml,
    "has_link": 'https://example.org/resource' in relations,
    "has_hanging": 'w:hanging="720"' in xml,
    "no_header": not any(name.startswith("word/header") for name in package_names),
    "cleaned": not os.path.exists(started["workdir"]),
})
`));
assert.equal(bibliographyReport.meta.ok, true);
assert.equal(bibliographyReport.meta.kind, "bibliography");
assert.equal(bibliographyReport.meta.name, "FormCapy-APA-References.docx");
assert.equal(bibliographyReport.meta.stats.works_cited, 2);
assert.ok(bibliographyReport.zip_ok);
assert.ok(bibliographyReport.order_ok, "CSL entry order must survive export");
assert.ok(bibliographyReport.has_italic);
assert.ok(bibliographyReport.has_link);
assert.ok(bibliographyReport.has_hanging);
assert.ok(bibliographyReport.no_header, "standalone list must not include a paper identity header");
assert.ok(bibliographyReport.cleaned, "MEMFS request directory must be removed");
console.log("OK: Pyodide standalone bibliography DOCX export assertions passed", bibliographyReport.meta.bytes);

// Exercise the real pinned CSL processor and styles through to the actual
// WASM Word exporter. All records are fictional; fetch reads only local pins.
const citationContext = vm.createContext({
  console, URL, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto,
  location: { href: "http://localhost/index.html", origin: "http://localhost" },
  fetch: async (value) => {
    const url = new URL(value);
    assert.equal(url.origin, "http://localhost");
    assert.ok(/^\/static\/vendor\/citations\/[a-zA-Z0-9.-]+$/.test(url.pathname));
    const content = await readFile(path.join(root, url.pathname.slice(1)));
    return { ok: true, arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) };
  },
});
const processorBytes = await readFile(path.join(root, "static/vendor/citations/citeproc.js"));
vm.runInContext(processorBytes.toString("utf8"), citationContext);
vm.runInContext(await readFile(path.join(root, "static/citation-engine.js"), "utf8"), citationContext);
assert.equal(createHash("sha256").update(processorBytes).digest("hex"), citationContext.FormCapyCitationEngine.PINS["citeproc.js"]);
citationContext.fictionalItemsJSON = JSON.stringify([
  { id: "book-unicode", type: "book", title: "Café, rivers & 中文研究", author: [{ family: "Rivera", given: "Aléxa" }, { family: "Chen", given: "Ming" }, { literal: "Example Watershed Collective" }], issued: { "date-parts": [[2024]] }, publisher: "Fictional Example Press", edition: "2" },
  { id: "journal-doi", type: "article-journal", title: "Imagined river signals", author: [{ family: "Benton", given: "Lea" }, { family: "Yates", given: "Nora" }], issued: { "date-parts": [[2023, 2, 28]] }, "container-title": "Journal of Fictional Signals", volume: "12", issue: "3", page: "25-37", DOI: "10.5555/formcapy.fictional.2023" },
  { id: "web-org", type: "webpage", title: "Synthetic field guide", author: [{ literal: "Example Research Group" }], issued: { "date-parts": [[2025, 3, 4]] }, "container-title": "Example Field Notes", URL: "https://example.org/field-notes?view=one&lang=en", accessed: { "date-parts": [[2026, 10, 21]] } },
  { id: "web-undated", type: "webpage", title: "Fictional undated note", URL: "https://example.org/undated" },
]);
const fictionalCSLItems = vm.runInContext("JSON.parse(fictionalItemsJSON)", citationContext);
for (const style of ["mla", "apa"]) {
  const rendered = await citationContext.FormCapyCitationEngine.render(fictionalCSLItems, style);
  pyodide.globals.set("actual_csl_request", JSON.stringify({ kind: "bibliography", bibliography: rendered }));
  const actualReport = JSON.parse(pyodide.runPython(`
from lxml import etree
started = json.loads(browser_bridge.begin())
metadata, content = browser_bridge.finish(actual_csl_request, started["workdir"])
meta = json.loads(metadata)
assert meta["ok"], meta
with zipfile.ZipFile(io.BytesIO(content)) as archive:
    xml = etree.fromstring(archive.read("word/document.xml"))
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs = ["".join(p.xpath(".//w:t/text()", namespaces=ns)) for p in xml.xpath("//w:body/w:p", namespaces=ns)]
    relationships = etree.fromstring(archive.read("word/_rels/document.xml.rels"))
    links = relationships.xpath("//*[local-name()='Relationship' and @TargetMode='External']/@Target")
    expected = json.loads(actual_csl_request)["bibliography"]
    assert paragraphs == [expected["heading"]] + [entry["text"] for entry in expected["entries"]]
    assert "Café" in "".join(paragraphs) and "中文研究" in "".join(paragraphs)
    assert len(xml.xpath("//w:ind[@w:hanging='720']", namespaces=ns)) == 4
    assert xml.xpath("//w:i", namespaces=ns)
    assert not any(name.startswith("word/header") for name in archive.namelist())
    assert archive.testzip() is None
    assert not os.path.exists(started["workdir"])
json.dumps({"bytes":len(content),"entries":len(expected["entries"]),"links":links,"order_and_text":True,"hanging_indent":True,"unicode":True,"cleaned":True})
`));
  assert.equal(actualReport.entries, 4);
  assert.equal(actualReport.order_and_text, true);
  assert.equal(actualReport.hanging_indent, true);
  assert.equal(actualReport.unicode, true);
  assert.equal(actualReport.cleaned, true);
  assert.deepEqual(actualReport.links, [
    "https://doi.org/10.5555/formcapy.fictional.2023",
    "https://example.org/field-notes?view=one&lang=en",
    "https://example.org/undated",
  ]);
  console.log("OK: actual CSL to Pyodide bibliography DOCX", style, actualReport);
}

// Real edge cases which previously previewed successfully but either produced
// a wrong DOI target or were rejected by the Word parser. Source records stay
// unchanged; only fixed program files are fetched by the engine above.
const boundaryItems = [
  {id:"reserved-doi",type:"article-journal",title:"An invented URI study",author:[{literal:"Example Laboratory"}],issued:{"date-parts":[[2024]]},"container-title":"Fictional URI Journal",DOI:'10.9999/a<b>c"d?e#f%g'},
  {id:"quoted-url",type:"webpage",title:"An imaginary quoted URL",URL:'https://example.org/"<&>'},
  {id:"unicode-url",type:"webpage",title:"عنوان عبري עברית 🦫",URL:'https://例子.中国/文稿?x=壹&y=two'},
  {id:"literal-text",type:"book",title:'A  title &amp; XML <record> with <sc>Small Caps</sc>',author:[{family:"García",given:"María"}],publisher:"Fictional Press"},
];
const boundarySnapshot=JSON.stringify(boundaryItems);
for(const style of ["mla","apa"]){
  const rendered=await citationContext.FormCapyCitationEngine.render(boundaryItems,style);
  assert.equal(JSON.stringify(boundaryItems),boundarySnapshot);
  pyodide.globals.set("edge_csl_request",JSON.stringify({kind:"bibliography",bibliography:rendered}));
  const edgeReport=JSON.parse(pyodide.runPython(`
from docx import Document
expected = json.loads(edge_csl_request)["bibliography"]
cycles = []
for cycle in range(3):
    # A failed request must not poison the next request or leave MEMFS drafts.
    bad = json.loads(edge_csl_request)
    bad["bibliography"]["entries"][0]["html"] = '<div class="csl-entry">Lost original text.</div>'
    started = json.loads(browser_bridge.begin())
    metadata, content = browser_bridge.finish(json.dumps(bad), started["workdir"])
    assert json.loads(metadata)["error"] == "invalid_options" and not content
    assert not os.path.exists(started["workdir"])
    started = json.loads(browser_bridge.begin())
    metadata, content = browser_bridge.finish(edge_csl_request, started["workdir"])
    meta = json.loads(metadata)
    assert meta["ok"], meta
    document = Document(io.BytesIO(content))
    actual = [paragraph.text for paragraph in document.paragraphs]
    reference = [expected["heading"]] + [entry["text"] for entry in expected["entries"]]
    assert [value.replace("\\u00a0", " ") for value in actual] == [value.replace("\\u00a0", " ") for value in reference]
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        relationships = etree.fromstring(archive.read("word/_rels/document.xml.rels"))
        links = relationships.xpath("//*[local-name()='Relationship' and @TargetMode='External']/@Target")
        assert archive.testzip() is None
    assert 'https://doi.org/10.9999/a%3Cb%3Ec%22d%3Fe%23f%25g' in links
    assert 'https://example.org/%22%3C&%3E' in links
    assert 'https://xn--fsqu00a.xn--fiqs8s/%E6%96%87%E7%A8%BF?x=%E5%A3%B9&y=two' in links
    assert not os.path.exists(started["workdir"])
    cycles.append(meta["bytes"])
json.dumps({"cycles":len(cycles),"entries":len(expected["entries"]),"links_once_encoded":True,"content_preserved":True,"cleaned":True})
`));
  assert.equal(edgeReport.cycles,3);
  assert.equal(edgeReport.entries,4);
  assert.equal(edgeReport.links_once_encoded,true);
  assert.equal(edgeReport.content_preserved,true);
  assert.equal(edgeReport.cleaned,true);
  console.log("OK: edge CSL to Pyodide, failure/success continuity",style,edgeReport);
}

// Run the actual browser worker request queue with a second real WASM runtime.
// Node's Pyodide loader needs a filesystem indexURL rather than a file: URL;
// only that module-loading boundary and same-origin static fetches are adapted.
const workerMessages=[];
let workerClosed=false;
let failWorkerModuleOnce=true;
const testWorkerSelf={
  postMessage(message){workerMessages.push(message);},
  addEventListener(){},
  close(){workerClosed=true;},
};
const fetchWorkerAsset=async(value)=>{
  const url=new URL(value);
  assert.equal(url.origin,"http://localhost");
  assert.ok(/^\/(?:wheels\/python_docx-1\.2\.0-py3-none-any\.whl|python\/(?:mla_formatter|format_profiles|docx_preserve|bibliography_export|browser_bridge)\.py)$/.test(url.pathname));
  if(failWorkerModuleOnce && url.pathname==="/python/bibliography_export.py"){
    failWorkerModuleOnce=false;
    return {ok:false,status:503};
  }
  const local=url.pathname.startsWith("/wheels/")?path.join(runtimeDir,PYTHON_DOCX_WHEEL_NAME):path.join(root,path.basename(url.pathname));
  const data=await readFile(local);
  return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
};
const PYTHON_DOCX_WHEEL_NAME="python_docx-1.2.0-py3-none-any.whl";
const workerSource=await readFile(path.join(root,"browser/worker.js"),"utf8");
const importStatement='const module = await import(new URL("pyodide.mjs", config.indexURL).href);';
assert.equal(workerSource.split(importStatement).length,2,"worker loader test hook must match exactly once");
const makeWorker=new Function("self","fetch","console","loadWorkerModule",
  workerSource.replace(importStatement,'const module = await loadWorkerModule(new URL("pyodide.mjs", config.indexURL).href);')+
  "\nreturn {drain:()=>queue,runtime:()=>pyodide};");
const workerHarness=makeWorker(testWorkerSelf,fetchWorkerAsset,console,async(url)=>{
  assert.equal(url,pathToFileURL(path.join(runtimeDir,"pyodide.mjs")).href);
  return {loadPyodide:options=>loadPyodide({...options,indexURL:runtimeURL})};
});
const workerConfig={indexURL:pathToFileURL(runtimeDir+path.sep).href,baseURL:"http://localhost/",runtimeVersion:pyodide.version};
testWorkerSelf.onmessage({data:{type:"init",id:10,config:workerConfig}});
await workerHarness.drain();
assert.ok(workerMessages.some(message=>message.type==="init-error" && message.id===10));
testWorkerSelf.onmessage({data:{type:"init",id:11,config:workerConfig}});
await workerHarness.drain();
assert.ok(workerMessages.some(message=>message.type==="ready" && message.id===11));
const queueBibliography=await citationContext.FormCapyCitationEngine.render(boundaryItems,"apa");
for(const [id,bibliography]of [[20,{}],[21,queueBibliography],[22,queueBibliography],[23,queueBibliography]]){
  testWorkerSelf.onmessage({data:{type:"request",id,action:"generate",request:{kind:"bibliography",bibliography},file:null}});
}
testWorkerSelf.onmessage({data:{type:"cancel",id:22}});
testWorkerSelf.onmessage({data:{type:"request",id:24,action:"generate",request:null,file:null}});
testWorkerSelf.onmessage({data:{type:"request",id:25,action:"generate",request:{kind:"bibliography",bibliography:queueBibliography},file:null}});
await workerHarness.drain();
const workerReplies=workerMessages.filter(message=>["result","aborted","error"].includes(message.type));
assert.deepEqual(workerReplies.map(message=>message.id),[20,21,22,23,24,25]);
assert.equal(workerReplies[0].meta.error,"invalid_options");
assert.equal(workerReplies[2].type,"aborted");
assert.equal(workerReplies[4].code,"invalid_json");
for(const index of [1,3,5]){
  const reply=workerReplies[index];
  assert.equal(reply.meta.ok,true);
  assert.ok(reply.buffer instanceof ArrayBuffer);
  assert.equal(reply.buffer.byteLength,reply.meta.bytes);
  assert.equal(new Uint8Array(reply.buffer)[0],0x50);
  assert.equal(new Uint8Array(reply.buffer)[1],0x4b);
}
const workerTempDirs=JSON.parse(workerHarness.runtime().runPython("import glob, json; json.dumps(glob.glob('/tmp/mlafmt-*'))"));
assert.deepEqual(workerTempDirs,[]);
testWorkerSelf.onmessage({data:{type:"dispose"}});
assert.equal(workerClosed,true);
console.log("OK: actual worker queue/WASM init retry, failure/success, cancellation, cleanup and dispose");
