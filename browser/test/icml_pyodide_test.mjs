// Real frozen Pyodide/WASM bridge, fictional local inputs, and independent
// inspection + offline TeX compilation. No browser, network, or mocked code.
// Requires the official ICML example assets and cached Tectonic test tool:
// node browser/test/icml_pyodide_test.mjs [dist] [output]
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.resolve(root, process.argv[2] || 'dist/formcapy-v2.14.0-preview');
const out = path.resolve(root, process.argv[3] || 'build/v2.14.0/acceptance/icml-pyodide');
const relative = path.relative(root, out);
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'test output remains in project');
const temp = path.join(out, 'temp');
const fixtures = path.join(out, 'fixtures');
await mkdir(temp, {recursive: true});
await mkdir(fixtures, {recursive: true});
const python = path.join(root, '.venv', 'Scripts', 'python.exe');
const env = {...process.env, TEMP: temp, TMP: temp, PYTHONDONTWRITEBYTECODE: '1'};
function hostPython(args) {
  const child = spawnSync(python, ['browser/test/icml_pyodide_validation.py', ...args],
    {cwd: root, env, encoding: 'utf8', timeout: 180000});
  assert.equal(child.status, 0, `host fixture/validation failed: ${child.stderr || child.stdout}`);
  return child.stdout.trim();
}
hostPython(['fixtures', fixtures]);
const runtime = path.join(dist, 'runtime', 'pyodide', '314.0.7');
const {loadPyodide} = await import(pathToFileURL(path.join(runtime, 'pyodide.mjs')).href);
const py = await loadPyodide({indexURL: runtime.replace(/\\/g, '/') + '/'});
await py.loadPackage(['lxml', 'typing-extensions']);
for (const dir of ['/app/python', '/app/pylib', '/fixtures', '/out']) py.FS.mkdirTree(dir);
py.FS.writeFile('/tmp/python_docx.whl', await readFile(path.join(dist, 'wheels/python_docx-1.2.0-py3-none-any.whl')));
py.runPython(`import sys, zipfile
with zipfile.ZipFile('/tmp/python_docx.whl') as z: z.extractall('/app/pylib')
sys.path[:0] = ['/app/python', '/app/pylib']`);
for (const name of ['mla_formatter.py', 'format_profiles.py', 'docx_preserve.py', 'bibliography_export.py', 'document_conversion.py', 'icml_latex.py', 'browser_bridge.py']) {
  py.FS.writeFile('/app/python/' + name, await readFile(path.join(dist, 'python', name)));
}
for (const name of ['draft.md', 'english.docx', 'chinese.docx']) {
  py.FS.writeFile('/fixtures/' + name, await readFile(path.join(fixtures, name)));
}
const results = JSON.parse(py.runPython(`
import os, json
from pathlib import Path
import browser_bridge
cases = [
  ('blank', '', 'A Safe Example'),
  ('special', 'draft.md', 'A & B 50% $cost$ #_{}'),
  ('docx', 'english.docx', 'Evaluation & Method'),
  ('cjk', 'chinese.docx', '中文论文 中文测试'),
]
results = []
for name, filename, title in cases:
    started = json.loads(browser_bridge.begin(filename))
    request = {'kind': 'convert' if filename else 'blank', 'format_id': 'icml', 'title': title,
               'name': 'Private Author 778899', 'file_name': filename}
    if filename:
        Path(started['input_path']).write_bytes(Path('/fixtures/' + filename).read_bytes())
    metadata, data = browser_bridge.finish(json.dumps(request), started['workdir'])
    payload = json.loads(metadata)
    assert payload['ok'] and payload['bytes'] == len(data), payload
    assert not os.path.exists(started['workdir'])
    Path('/out/' + name + '.zip').write_bytes(data)
    Path('/out/' + name + '.json').write_text(metadata, encoding='utf-8')
    results.append(name)
json.dumps(results)
`));
assert.deepEqual(results, ['blank', 'special', 'docx', 'cjk']);
for (const name of results) {
  for (const extension of ['zip', 'json']) {
    await writeFile(path.join(out, `${name}.${extension}`), py.FS.readFile(`/out/${name}.${extension}`));
  }
}
const official = path.join(root, 'build/v2.14.0/tex-validation/fixture');
const compiler = path.join(root, 'build/v2.14.0/tex-validation/tools/tectonic.exe');
const cache = path.join(root, 'build/v2.14.0/tex-validation/cache');
console.log(hostPython(['validate', out, official, compiler, cache]));
const summaryFile = path.join(out, 'summary.json');
const summary = JSON.parse(await readFile(summaryFile, 'utf8'));
summary.dist = dist;
summary.pyodide = py.version;
summary.manifestSha256 = createHash('sha256').update(await readFile(path.join(dist, 'manifest.json'))).digest('hex');
await writeFile(summaryFile, JSON.stringify(summary, null, 2) + '\n');
console.log('PASS actual frozen Pyodide ICML ZIPs, independent inspection, and cached local compilation');
