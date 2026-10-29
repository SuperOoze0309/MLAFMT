"""Exercise the real PDF request path shared by CPython and Pyodide."""
import json
from pathlib import Path

import browser_bridge
from docx import Document
from io import BytesIO
from test_document_conversion import pdf_bytes, docx_bytes


def convert(pdf, name="fictional.pdf", target="docx"):
    start = json.loads(browser_bridge.begin(name))
    Path(start["input_path"]).write_bytes(pdf)
    metadata, result = browser_bridge.finish(json.dumps({
        "kind": "file_convert", "file_name": name, "target_format": target,
    }), start["workdir"])
    assert not Path(start["workdir"]).exists(), "MEMFS work directory is always removed"
    return json.loads(metadata), result


def test_real_pdf_request_needs_no_paper_fields_and_returns_editable_text():
    metadata, result = convert(pdf_bytes(("Independent local conversion",)))
    assert metadata["ok"] and metadata["kind"] == "file_convert"
    assert metadata["name"] == "fictional.docx"
    assert metadata["conversion_warnings"] == ["pdf_text_reconstruction"]
    assert "Independent local conversion" in "\n".join(p.text for p in Document(BytesIO(result)).paragraphs)


def test_scan_and_encryption_codes_survive_bridge_and_cleanup():
    for data, expected in ((pdf_bytes(("",)), "pdf_needs_ocr"),
                           (pdf_bytes(("Secret",), encrypted=True), "encrypted_document")):
        metadata, result = convert(data)
        assert metadata["error"] == expected and not result


def test_browser_bridge_cannot_start_a_native_office_process():
    metadata, result = convert(pdf_bytes(), target="doc")
    assert metadata["error"] == "unsupported" and not result


def test_word_check_validates_container_and_cleans_it_without_exporting_bytes():
    for data, name, expected in ((docx_bytes(), "sample.docx", None),
                                  (b"<html>not a DOC file</html>", "sample.doc", "bad_doc")):
        start = json.loads(browser_bridge.begin(name))
        Path(start["input_path"]).write_bytes(data)
        metadata, output = browser_bridge.finish(json.dumps({
            "kind": "file_check", "file_name": name,
        }), start["workdir"])
        payload = json.loads(metadata)
        assert not Path(start["workdir"]).exists() and not output
        assert payload.get("error") == expected
        assert payload["ok"] is (expected is None)
