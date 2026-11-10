"""Check style-source pinning and on-demand cache boundaries."""
import importlib.util
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
try:
    spec = importlib.util.spec_from_file_location("browser_static_builder_icml", ROOT / "scripts/build_browser_static.py")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    import prepare_icml_runtime as icml_runtime
finally:
    sys.path.remove(str(ROOT / "scripts"))


def test_style_bundle_pins_agree_and_is_not_initially_precached():
    config = json.loads((ROOT / "browser/icml-runtime.json").read_text(encoding="utf-8"))
    assert config["official"]["sha256"] == icml_runtime.OFFICIAL_SHA256
    assert config["official"]["size"] == icml_runtime.OFFICIAL_SIZE
    assert config["bundle"]["sha256"] == icml_runtime.BUNDLE_SHA256
    assert config["bundle"]["size"] == icml_runtime.BUNDLE_SIZE
    assert config["bundle"]["sha256"] in config["bundle"]["filename"]
    import icml_latex
    assert icml_latex.STYLE_BUNDLE_SHA256 == icml_runtime.BUNDLE_SHA256
    assert icml_latex.STYLE_BUNDLE_SIZE == icml_runtime.BUNDLE_SIZE
    worker = (ROOT / "browser/worker.js").read_text(encoding="utf-8")
    assert icml_runtime.BUNDLE_SHA256 in worker
    assert f"const ICML_STYLE_SIZE = {icml_runtime.BUNDLE_SIZE};" in worker
    entries = [{"path": "index.html"}, {"path": "runtime/icml/" + config["bundle"]["filename"]},
               {"path": "runtime/pyodide/core.wasm"}]
    assert builder.precache_paths(entries) == ["./", "./runtime/pyodide/core.wasm"]


def test_wrong_source_archive_is_rejected_before_parsing():
    with pytest.raises(ValueError, match="integrity"):
        icml_runtime.make_bundle(b"not an official archive")


def test_official_cached_source_repackages_deterministically():
    config = json.loads((ROOT / "browser/icml-runtime.json").read_text(encoding="utf-8"))
    source = ROOT / "browser/.cache/icml" / ("official-" + config["official"]["sha256"] + ".zip")
    if not source.is_file():
        pytest.skip("official source archive not cached; build fetches and verifies it")
    first = icml_runtime.make_bundle(source.read_bytes())
    assert first == icml_runtime.make_bundle(source.read_bytes())
    assert len(first) == 24486
