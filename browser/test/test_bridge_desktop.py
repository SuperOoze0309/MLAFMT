"""Desktop tests for the browser (Pyodide) bridge.

Run: .venv/Scripts/python.exe -m pytest browser/test/test_bridge_desktop.py -q
The same module runs unchanged inside Pyodide in browser/test/worker_test.html.
"""

import io
import json
import os
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import browser_bridge  # noqa: E402


def _write_draft(tmp_path, data: bytes, name="draft.docx"):
    path = tmp_path / name
    path.write_bytes(data)
    return path


def _sample_docx(text="A preserved body paragraph with a citation (Smith 12)."):
    from docx import Document

    document = Document()
    for line in ("Jordan Example", "Professor Example", "ENG 101",
                 "1 January 2026", "The Role of Memory in Hamlet", text):
        document.add_paragraph(line)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _request(kind, **overrides):
    data = {
        "kind": kind,
        "name": "Jordan Example",
        "title": "The Role of Memory in Hamlet",
        "instructor": "Professor Example",
        "course": "ENG 101",
        "affiliation": "",
        "date": "1 January 2026",
        "last_name_override": "",
        "format_id": "mla",
        "custom_profile": None,
        "txt_mode": "blank_line",
        "markdown": True,
        "strip_heading": True,
        "heading_detect": False,
        "block_quote": False,
        "preserve_paragraphs": [],
    }
    data.update(overrides)
    return data


def _run(request, data=b"", file_name=None, tmp_path=None):
    started = json.loads(browser_bridge.begin(file_name or request.get("file_name", "")))
    if data:
        Path(started["input_path"]).write_bytes(data)
    request = dict(request)
    if file_name:
        request["file_name"] = file_name
    metadata, document = browser_bridge.finish(json.dumps(request), started["workdir"])
    return json.loads(metadata), document, Path(started["workdir"])


def test_blank_document(tmp_path):
    metadata, document, workdir = _run(_request("blank"), tmp_path=tmp_path)
    assert metadata["ok"] is True
    assert metadata["blank"] is True
    assert metadata["name"] == "Example_MLA_Essay.docx"
    assert metadata["format_id"] == "mla"
    assert metadata["format_label"] == "MLA 9"
    assert metadata["mime"].endswith("wordprocessingml.document")
    assert len(document) == metadata["bytes"] > 1000
    assert not workdir.exists(), "MEMFS work directory must be removed"
    with zipfile.ZipFile(io.BytesIO(document)) as archive:
        assert archive.testzip() is None
        assert "word/document.xml" in archive.namelist()
        assert "[Start writing your essay here.]" in archive.read(
            "word/document.xml").decode("utf-8")


def test_txt_conversion_and_filename(tmp_path):
    draft = "First paragraph of the essay.\n\nSecond paragraph with *italic* text.\n"
    metadata, document, workdir = _run(
        _request("convert"), draft.encode(), file_name="draft.txt", tmp_path=tmp_path)
    assert metadata["ok"] is True
    assert metadata["stats"]["body"] == 2
    assert not workdir.exists()
    with zipfile.ZipFile(io.BytesIO(document)) as archive:
        xml = archive.read("word/document.xml").decode("utf-8")
    assert "First paragraph of the essay." in xml
    assert "Second paragraph with" in xml


def test_docx_conversion_preserves_body_and_pages(tmp_path):
    started = json.loads(browser_bridge.begin("draft.docx"))
    Path(started["input_path"]).write_bytes(_sample_docx("A kept paragraph (Smith 12)."))
    metadata, document = browser_bridge.finish(
        json.dumps(_request("convert", file_name="draft.docx")), started["workdir"])
    metadata = json.loads(metadata)
    assert metadata["ok"] is True
    with zipfile.ZipFile(io.BytesIO(document)) as archive:
        document_xml = archive.read("word/document.xml").decode("utf-8")
        headers = [name for name in archive.namelist() if name.startswith("word/header")]
    assert "A kept paragraph" in document_xml
    header_xml = "".join(
        zipfile.ZipFile(io.BytesIO(document)).read(name).decode("utf-8") for name in headers)
    assert "Example " in header_xml and "PAGE" in header_xml


def test_docx_paragraph_inspection(tmp_path):
    metadata, document, workdir = _run(
        _request("paragraphs"), _sample_docx(), file_name="draft.docx", tmp_path=tmp_path)
    assert metadata["ok"] is True
    assert document == b""
    assert metadata["paragraphs"]
    assert len(metadata["source_fingerprint"]) == 64
    assert not workdir.exists()
    for item in metadata["paragraphs"]:
        assert isinstance(item["id"], int) and item["id"] >= 1
        assert isinstance(item["text"], str)


def test_chinese_filename_is_bounded(tmp_path):
    metadata, document, _ = _run(
        _request("blank", name="张小明"), file_name="", tmp_path=tmp_path)
    assert metadata["ok"] is True
    assert metadata["name"].endswith(".docx")
    assert len(metadata["name"].encode("utf-8")) <= 184


@pytest.mark.parametrize("overrides,code", [
    ({"name": ""}, "missing_fields"),
    ({"title": ""}, "missing_fields"),
    ({"txt_mode": "nope"}, "invalid_options"),
    ({"format_id": "nope"}, "invalid_options"),
    ({"preserve_paragraphs": [0]}, "invalid_options"),
    ({"preserve_paragraphs": [True]}, "invalid_options"),
    ({"source_fingerprint": "x" * 65}, "invalid_options"),
    ({"markdown": "yes"}, "invalid_options"),
])
def test_validation_errors(overrides, code):
    started = json.loads(browser_bridge.begin(""))
    metadata, document = browser_bridge.finish(
        json.dumps(_request("blank", **overrides)), started["workdir"])
    payload = json.loads(metadata)
    assert payload["ok"] is False
    assert payload["error"] == code
    assert document == b""
    assert not Path(started["workdir"]).exists()


def test_paragraphs_requires_docx():
    started = json.loads(browser_bridge.begin("draft.txt"))
    Path(started["input_path"]).write_text("text")
    metadata, document = browser_bridge.finish(
        json.dumps(_request("paragraphs", file_name="draft.txt")), started["workdir"])
    payload = json.loads(metadata)
    assert payload["error"] == "preserve_docx_only"
    assert document == b""
    assert not Path(started["workdir"]).exists()


def test_bad_docx_and_cleanup():
    started = json.loads(browser_bridge.begin("draft.docx"))
    Path(started["input_path"]).write_bytes(b"not a zip")
    metadata, document = browser_bridge.finish(
        json.dumps(_request("convert", file_name="draft.docx")), started["workdir"])
    payload = json.loads(metadata)
    assert payload["error"] == "bad_doc"
    assert document == b""
    assert not Path(started["workdir"]).exists()


def test_missing_file_and_unsupported_extension():
    started = json.loads(browser_bridge.begin("draft.docx"))
    metadata, _ = browser_bridge.finish(
        json.dumps(_request("convert", file_name="draft.docx")), started["workdir"])
    assert json.loads(metadata)["error"] == "no_file"

    started = json.loads(browser_bridge.begin("draft.pdf"))
    Path(started["input_path"]).write_bytes(b"%PDF")
    metadata, _ = browser_bridge.finish(
        json.dumps(_request("convert", file_name="draft.pdf")), started["workdir"])
    assert json.loads(metadata)["error"] == "unsupported"


def test_rejects_invalid_json_and_traversal_names():
    started = json.loads(browser_bridge.begin("../../etc/passwd"))
    metadata, document = browser_bridge.finish("[]", started["workdir"])
    assert json.loads(metadata)["error"] == "invalid_json"
    assert document == b""

    started = json.loads(browser_bridge.begin("draft.docx"))
    Path(started["input_path"]).write_bytes(_sample_docx())
    metadata, _ = browser_bridge.finish(
        json.dumps(_request("convert", file_name="../../draft.docx")), started["workdir"])
    assert json.loads(metadata)["ok"] is True
    assert "/" not in json.loads(metadata)["name"]


def test_initial_state_has_today_and_version():
    state = json.loads(browser_bridge.initial_state())
    assert isinstance(state["today"], str) and state["today"]
    assert state["version"] == "2.4.0"


def test_no_flask_imported():
    import subprocess
    result = subprocess.run(
        [sys.executable, "-c",
         "import sys, browser_bridge; "
         "raise SystemExit(0 if 'flask' not in sys.modules else 3)"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
