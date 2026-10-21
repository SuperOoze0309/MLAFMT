// Desktop Node smoke test for the pinned Pyodide runtime.
// Proves that lxml, typing_extensions and python-docx import and that the
// project formatter generates a DOCX inside the wasm runtime.
// Run: node browser/test/node_import_test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
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

for (const name of ["mla_formatter.py", "format_profiles.py", "docx_preserve.py"]) {
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
