import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const venvPython = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.FORMCAPY_TEST_PYTHON || (fs.existsSync(venvPython) ? venvPython : "python");
const source = fs.readFileSync(new URL("../../static/batch-converter.js", import.meta.url), "utf8");
const window = { Blob };
vm.runInNewContext(source, { window, TextEncoder, Uint8Array, Uint32Array, DataView, Set, Number, Array, String, Error, Object });
const { run, createZip } = window.FormCapyBatchConverter;
const file = (name, size = 10) => ({ name, size, arrayBuffer: async () => new ArrayBuffer(0) });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const result = (name, text = "content") => ({ name, blob: new Blob([text]), warnings: ["layout_changed"] });

test("converts strictly in order, isolates failures and skips matching formats", async () => {
  let active = 0, peak = 0; const calls = [];
  const entries = await run({ files: [file("a.doc"), file("broken.pdf"), file("same.docx"), file("b.DOC")], targetFormat: "docx", convert: async ({file}) => {
    active++; peak = Math.max(peak, active); calls.push(file.name);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    if (file.name === "broken.pdf") throw Object.assign(new Error("bad"), { code: "needs_ocr" });
    return result("重复.docx");
  } });
  assert.equal(peak, 1); assert.deepEqual(calls, ["a.doc", "broken.pdf", "b.DOC"]);
  assert.deepEqual(Array.from(entries, e => e.status), ["success", "error", "skipped", "success"]);
  assert.equal(entries[1].error, "needs_ocr");
  assert.equal(entries[0].result.name, "重复.docx"); assert.equal(entries[3].result.name, "重复 (2).docx");
  assert.deepEqual(entries[0].result.warnings, ["layout_changed"]);
});

test("cancel waits for active work and rejects late results and stages", async () => {
  const gate = deferred(), controller = new AbortController(); const calls = [], updates = [];
  const promise = run({ files: [file("a.doc"), file("b.doc")], targetFormat: "pdf", signal: controller.signal,
    onUpdate: entries => updates.push(Array.from(entries, e => e.status)),
    convert: request => { calls.push(request); return gate.promise; } });
  controller.abort(); calls[0].onStage("late"); gate.resolve(result("late.pdf"));
  const entries = await promise;
  assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(Array.from(entries, e => e.status), ["cancelled", "cancelled"]);
  assert.equal(entries[0].result, null); assert.equal(entries[0].stage, null);
  assert.equal(updates.some(states => states.includes("success")), false);
});

test("limits and invalid inputs do not reach the engine; output budget preserves earlier results", async () => {
  let count = 0;
  await assert.rejects(run({ files: Array.from({length:21}, () => file("x.doc")), targetFormat: "pdf", convert() {} }), e => e.code === "too_many_files");
  await assert.rejects(run({ files: Array.from({length:6}, () => file("x.doc", 20 * 1024 * 1024)), targetFormat: "pdf", convert() {} }), e => e.code === "batch_too_large");
  class LargeBlob extends Blob { get size() { return 100 * 1024 * 1024; } }
  const entries = await run({ files: [file("empty.doc", 0), file("wrong.txt"), file("huge.doc", 20 * 1024 * 1024 + 1), file("first.doc"), file("second.doc")], targetFormat: "pdf", convert: async () => {
    count++; return count === 1 ? {name: "first.pdf", blob: new LargeBlob(["x"])} : result("second.pdf");
  } });
  assert.equal(count, 2);
  assert.deepEqual(Array.from(entries, e => e.status), ["error", "error", "error", "success", "error"]);
  assert.deepEqual(Array.from(entries, e => e.error), ["empty_file", "unsupported", "too_large", null, "output_limit"]);
});

test("ZIP opens in a standard reader, preserving UTF-8 names, content and uniqueness", async () => {
  const entries = [
    {status:"success", result:result("报告.pdf", "first")},
    {status:"error", result:null},
    {status:"success", result:result("报告.pdf", "second")},
    {status:"success", result:result("../safe.pdf", "third")},
  ];
  const archive = await createZip(entries);
  assert.equal(archive.type, "application/zip");
  const check = spawnSync(python, ["-c", "import io,sys,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}, ensure_ascii=True))"], {input: Buffer.from(await archive.arrayBuffer()), encoding:"utf8"});
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), {"报告.pdf":"first", "报告 (2).pdf":"second", ".._safe.pdf":"third"});
});

test("ZIP packaging handles empty results and cancellation", async () => {
  await assert.rejects(createZip([]), e => e.code === "no_results");
  const controller = new AbortController();
  await assert.rejects(createZip([{status:"success", result:result("a.pdf")}, {status:"success", result:result("b.pdf")}], {
    signal: controller.signal, onProgress: () => controller.abort()
  }), e => e.code === "cancelled");
});


test("long names keep extensions and unique suffixes within the download limit", async () => {
  const name = "😀".repeat(140) + ".DOCX";
  const entries = await run({files:[file("a.pdf"), file("b.pdf"), file("c.pdf")], targetFormat:"docx", convert:async ({file}) => result(file.name === "b.pdf" ? name.toLowerCase() : name)});
  const names = Array.from(entries, entry => entry.result.name);
  assert.equal(new Set(names.map(value => value.toLowerCase())).size, 3);
  assert.ok(names.every(value => value.length <= 240 && /\.docx$/i.test(value)));
  assert.match(names[1], / \(2\)\.docx$/i);
  assert.match(names[2], / \(3\)\.docx$/i);
  const archive = await createZip(entries);
  const check = spawnSync(python, ["-c", "import io,sys,zipfile,json; print(json.dumps(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).namelist()))"], {input: Buffer.from(await archive.arrayBuffer()), encoding:"utf8"});
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), names);
});
