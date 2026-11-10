"""Runtime caching must not retain a stale mutable Office manifest."""

import fnmatch
import importlib.util
from pathlib import Path


def test_office_manifest_cache_rules_do_not_conflict(tmp_path):
    root = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location("browser_static_builder", root / "scripts/build_browser_static.py")
    # Its sibling modules are normally imported when launched as a script.
    import sys
    sys.path.insert(0, str(root / "scripts"))
    try:
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
    finally:
        sys.path.remove(str(root / "scripts"))
    builder.write_headers(tmp_path)

    rules = []
    for line in (tmp_path / "_headers").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith(" "):
            rules.append((line, []))
        elif line.strip().lower().startswith("cache-control:"):
            rules[-1][1].append(line.strip().split(":", 1)[1].strip())

    def values(url):
        return [value for pattern, headers in rules if fnmatch.fnmatchcase(url, pattern) for value in headers]

    mutable = values("/runtime/office/runtime-gzip-v1.json")
    assert mutable == ["public, max-age=0, must-revalidate"]
    immutable = "public, max-age=31536000, immutable"
    assert values("/runtime/office/runtime.json") == [immutable]
    assert values("/runtime/office/zeta-test/soffice.wasm.part-001.hash.gz") == [immutable]
    assert values("/runtime/pyodide/314.0.7/pyodide.mjs") == [immutable]
    assert values("/runtime/icml/icml2026-bundle.zip") == [immutable]
