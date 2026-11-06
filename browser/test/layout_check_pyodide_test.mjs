// Real Node/Pyodide acceptance of the frozen static build's report and DOCX.
// No browser, network, or mocked formatter. Host CPython independently checks
// each produced DOCX; documents and reports are fictional and stay on H:.
// node browser/test/layout_check_pyodide_test.mjs [dist] [output]
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.resolve(root, process.argv[2] || 'dist/formcapy-v2.13.0-preview');
const out = path.resolve(root, process.argv[3] || 'build/v2.13.0/acceptance/layout-pyodide');
assert.equal(path.parse(out).root.toLowerCase(), path.parse(root).root.toLowerCase(), 'output must stay on project drive');
const relative = path.relative(root, out);
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'output must stay within project');
await mkdir(out, {recursive: true});
const tmp = path.join(out, 'temp');
const fixtures = path.join(out, 'fixtures');
await mkdir(tmp, {recursive: true});
await mkdir(fixtures, {recursive: true});
const python = path.join(root, '.venv', 'Scripts', 'python.exe');
const env = {...process.env, TEMP: tmp, TMP: tmp, PYTHONDONTWRITEBYTECODE: '1'};
function hostPython(args) {
  const child = spawnSync(python, args, {cwd: root, env, encoding: 'utf8'});
  assert.equal(child.status, 0, `host validation failed: ${child.stderr || child.stdout}`);
  return child.stdout.trim();
}
hostPython(['browser/test/make_layout_review_fixtures.py', fixtures]);
const runtime = path.join(dist, 'runtime', 'pyodide', '314.0.7');
const {loadPyodide} = await import(pathToFileURL(path.join(runtime, 'pyodide.mjs')).href);
const py = await loadPyodide({indexURL: runtime.replace(/\\/g, '/') + '/'});
await py.loadPackage(['lxml', 'typing-extensions']);
py.FS.mkdirTree('/app/python');
py.FS.mkdirTree('/app/pylib');
py.FS.mkdirTree('/fixtures');
py.FS.mkdirTree('/out');
py.FS.writeFile('/tmp/python_docx.whl', await readFile(path.join(dist, 'wheels/python_docx-1.2.0-py3-none-any.whl')));
py.runPython(`import sys, zipfile
with zipfile.ZipFile('/tmp/python_docx.whl') as z: z.extractall('/app/pylib')
sys.path[:0] = ['/app/python', '/app/pylib']`);
for (const name of ['mla_formatter.py', 'format_profiles.py', 'docx_preserve.py', 'bibliography_export.py', 'document_conversion.py', 'browser_bridge.py']) {
  py.FS.writeFile('/app/python/' + name, await readFile(path.join(dist, 'python', name)));
}
for (const name of ['layout-review.txt', 'layout-review-preserve.docx', 'layout-review-custom.json']) {
  py.FS.writeFile('/fixtures/' + name, await readFile(path.join(fixtures, name)));
}
const summary = JSON.parse(py.runPython(`
import os, json
from pathlib import Path
import browser_bridge
from mla_formatter import inspect_draft_paragraphs

custom = json.loads(Path('/fixtures/layout-review-custom.json').read_text(encoding='utf-8'))
results = []
for profile in ('mla', 'apa', 'custom'):
    for fixture in ('blank', 'text', 'preserve'):
        filename = {'blank': '', 'text': 'layout-review.txt', 'preserve': 'layout-review-preserve.docx'}[fixture]
        started = json.loads(browser_bridge.begin(filename))
        request = {'kind': 'blank' if fixture == 'blank' else 'convert', 'name': 'Fictional Example',
                   'title': 'Fictional Paper', 'format_id': profile, 'file_name': filename,
                   'strip_heading': False}
        if profile == 'custom': request['custom_profile'] = custom
        if fixture != 'blank':
            Path(started['input_path']).write_bytes(Path('/fixtures/' + filename).read_bytes())
        if fixture == 'preserve':
            inspected = inspect_draft_paragraphs(started['input_path'])
            request['source_fingerprint'] = inspected['source_fingerprint']
            request['preserve_paragraphs'] = [2]
        metadata, data = browser_bridge.finish(json.dumps(request), started['workdir'])
        payload = json.loads(metadata)
        assert payload['ok'], payload
        assert not os.path.exists(started['workdir'])
        report = payload['layout_check']
        assert 'Fictional' not in json.dumps(report), 'report contains document data'
        tag = profile + '-' + fixture
        Path('/out/' + tag + '.docx').write_bytes(data)
        Path('/out/' + tag + '.json').write_text(json.dumps(report), encoding='utf-8')
        results.append({'profile': profile, 'fixture': fixture, 'report': report})

original = browser_bridge._layout_inspection
def fail(*args): raise RuntimeError('PRIVATE INTERNAL FAILURE')
browser_bridge._layout_inspection = fail
try:
    started = json.loads(browser_bridge.begin(''))
    metadata, data = browser_bridge.finish(json.dumps({'kind': 'blank', 'name': 'Fictional', 'title': 'Paper'}), started['workdir'])
    payload = json.loads(metadata)
    assert payload['ok'] and data.startswith(b'PK')
    assert payload['layout_check'] == {'version': 1, 'checks': [{'id': 'inspection_unavailable', 'status': 'unchecked'}]}
    assert 'PRIVATE INTERNAL FAILURE' not in metadata
    assert not os.path.exists(started['workdir'])
finally:
    browser_bridge._layout_inspection = original

# A minimum 20 pt and exactly 20 pt share a number but not Word behavior.
# The structural report must not call the minimum rule an exact match.
from io import BytesIO
from docx import Document
from docx.enum.text import WD_LINE_SPACING
from mla_formatter import create_blank_template
from format_profiles import resolve_profile
fixed = {'paper_size': 'A4', 'font_name': '宋体', 'typography': 'chinese', 'line_spacing_pt': 20}
fixed_profile = resolve_profile('custom', fixed)
buf = BytesIO()
create_blank_template(buf, name='Fictional', title='Paper', format_id='custom', custom_profile=fixed)
fixed_doc = Document(BytesIO(buf.getvalue()))
fixed_status = {x['id']: x['status'] for x in browser_bridge._layout_inspection(buf.getvalue(), fixed_profile, {})['checks']}
assert fixed_status['paragraph_spacing'] == 'pass', fixed_status
target = next(p for p in fixed_doc.paragraphs if p.text.strip())
target.paragraph_format.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
changed = BytesIO()
fixed_doc.save(changed)
changed_status = {x['id']: x['status'] for x in browser_bridge._layout_inspection(changed.getvalue(), fixed_profile, {})['checks']}
assert changed_status['paragraph_spacing'] == 'warn', changed_status
json.dumps({'results': results, 'failure_degrades_safely': True, 'fixed_spacing_rule_distinguished': True})
`));
assert.equal(summary.results.length, 9);
for (const entry of summary.results) {
  const tag = `${entry.profile}-${entry.fixture}`;
  const doc = path.join(out, `${tag}.docx`);
  const report = path.join(out, `${tag}.json`);
  await writeFile(doc, py.FS.readFile(`/out/${tag}.docx`));
  await writeFile(report, py.FS.readFile(`/out/${tag}.json`));
  const check = JSON.parse(hostPython(['browser/test/validate_layout_review_docx.py', doc, '--profile', entry.profile, '--fixture', entry.fixture, '--report-json', report]));
  assert.equal(check.ok, true);
  console.log(`PASS ${tag}: frozen Pyodide output and independent DOCX/report inspection`);
}
assert.equal(summary.failure_degrades_safely, true);
assert.equal(summary.fixed_spacing_rule_distinguished, true);
await writeFile(path.join(out, 'summary.json'), JSON.stringify({ok:true, pyodide: py.version, dist, checks: 11, report: summary}, null, 2) + '\n');
console.log('PASS failed inspection preserves DOCX and reports unavailable without leaking details');
console.log('PASS fixed 20 pt spacing is distinguished from minimum 20 pt spacing');
