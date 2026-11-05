"""Check compressed Office assets without network or a full Office download."""

import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("prepare_office_runtime", ROOT / "scripts" / "prepare_office_runtime.py")
office = importlib.util.module_from_spec(spec)
spec.loader.exec_module(office)


def sha(data):
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def cached_runtime(tmp_path, monkeypatch):
    root = tmp_path / "fixture"
    cache = root / "cache"
    upstream = cache / "upstream"
    license_dir = cache / "licenses"
    upstream.mkdir(parents=True)
    license_dir.mkdir(parents=True)
    driver = root / "browser" / "office-thread.js"
    driver.parent.mkdir()
    driver.write_bytes(b"offline test driver")
    files = {
        "soffice.js": b"offline test script",
        "zeta.js": b"offline test bridge",
        "soffice.data.js.metadata": b"{}",
        office.NOTO_CJK_NAME: b"offline test font",
        "soffice.wasm": b"wasm-original-content-" * 8,
        "soffice.data": b"office-data-original-" * 7,
    }
    for name, content in files.items():
        (upstream / name).write_bytes(content)
    (license_dir / "license.txt").write_bytes(b"license material")
    record = lambda data: {"url": "https://example.invalid/unused", "size": len(data), "sha256": sha(data)}
    pin = {
        "id": "loader-build-test",
        "initialMemoryMiB": 1024,
        "files": {name: record(content) for name, content in files.items()},
        "licenses": {"license.txt": record(b"license material")},
    }
    pin_path = root / "pin.json"
    pin_path.write_text(json.dumps(pin), encoding="utf-8")
    monkeypatch.setattr(office, "ROOT", root)
    monkeypatch.setattr(office, "CACHE", cache)
    monkeypatch.setattr(office, "PIN", pin_path)
    monkeypatch.setattr(office, "CHUNK_BYTES", 31)
    monkeypatch.setattr(office, "download", lambda *_: pytest.fail("unexpected network download"))
    return root, files


def test_gzip_manifest_preserves_legacy_files_and_rebuilds_offline(cached_runtime, tmp_path):
    _, originals = cached_runtime
    first, second = tmp_path / "out-one", tmp_path / "out-two"
    legacy_first = office.prepare(first)
    legacy_second = office.prepare(second)
    legacy_path = Path("runtime/office/runtime.json")
    gzip_path = Path("runtime/office/runtime-gzip-v1.json")

    # No part of the legacy payload, manifest or cache identifier changes.
    assert (first / legacy_path).read_bytes() == (second / legacy_path).read_bytes()
    assert json.loads((first / legacy_path).read_text(encoding="utf-8")) == legacy_first == legacy_second
    compressed = json.loads((first / gzip_path).read_text(encoding="utf-8"))
    assert (first / gzip_path).read_bytes() == (second / gzip_path).read_bytes()
    assert compressed["id"] == legacy_first["id"]
    assert compressed["schemaVersion"] == legacy_first["schemaVersion"]

    for kind in ("wasm", "data"):
        source_name = "soffice." + kind
        old = legacy_first["assets"][kind]
        new = compressed["assets"][kind]
        assert new["size"] == old["size"] == len(originals[source_name])
        assert new["sha256"] == old["sha256"] == sha(originals[source_name])
        rebuilt = bytearray()
        for original_entry, gz_entry in zip(old["chunks"], new["chunks"], strict=True):
            variant = gz_entry["compressed"]
            assert {key: value for key, value in gz_entry.items() if key != "compressed"} == original_entry
            raw = (first / "runtime/office" / original_entry["path"]).read_bytes()
            packed = (first / "runtime/office" / variant["path"]).read_bytes()
            assert raw == gzip.decompress(packed)
            assert sha(raw) == original_entry["sha256"]
            assert variant["encoding"] == "gzip"
            assert variant["size"] == len(packed) < office.HOST_ASSET_LIMIT
            assert variant["sha256"] == sha(packed)
            assert variant["sha256"] in Path(variant["path"]).name
            assert packed == (second / "runtime/office" / variant["path"]).read_bytes()
            assert packed[:4] == b"\x1f\x8b\x08\x00" and packed[4:8] == bytes(4)
            rebuilt.extend(raw)
        assert bytes(rebuilt) == originals[source_name]

    assert (first / "licenses/office/license.txt").read_bytes() == b"license material"
    assert (first / "licenses/office/SOURCE-INVENTORY.json").is_file()


def test_rejects_damaged_source_chunk_and_removes_failed_temp(cached_runtime, tmp_path, monkeypatch):
    _, originals = cached_runtime
    output = tmp_path / "runtime-id"
    output.mkdir()
    original = tmp_path / "soffice.wasm"
    original.write_bytes(originals["soffice.wasm"])
    assembly = office.chunks(original, output)
    first = output.parent / assembly["chunks"][0]["path"]
    first.write_bytes(b"tampered")
    with pytest.raises(RuntimeError, match="hash/size mismatch"):
        office.gzip_chunks(assembly, output)

    # Even incompressible output exceeding the host limit leaves no temp file.
    assembly = office.chunks(original, output)
    monkeypatch.setattr(office, "HOST_ASSET_LIMIT", 10)
    with pytest.raises(RuntimeError, match="host asset limit"):
        office.gzip_chunks(assembly, output)
    assert not list(output.glob(".office-gzip-*.tmp"))
