"""ICML export uses real LaTeX source, bounded local input and safe escaping."""
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pytest
from docx import Document
from docx.oxml import OxmlElement

import browser_bridge
import icml_latex


def submit(data=None, filename="", **options):
    started = json.loads(browser_bridge.begin(filename))
    if data is not None:
        Path(started["input_path"]).write_bytes(data)
    payload, result = browser_bridge.finish(json.dumps({
        "kind": "blank" if data is None else "convert", "format_id": "icml",
        "title": "Research 100% & Safe", "name": "Private Name",
        "file_name": filename, **options,
    }), started["workdir"])
    assert not Path(started["workdir"]).exists()
    return json.loads(payload), result


def unpack(result):
    with ZipFile(BytesIO(result)) as z:
        assert set(z.namelist()) == {"main.tex", "README.txt"}
        return z.read("main.tex").decode(), z.read("README.txt").decode()


def test_blank_has_real_anonymous_icml_source_and_explicit_official_style_requirement():
    meta, result = submit()
    assert meta["ok"] and meta["mime"] == "application/zip"
    assert meta["format_id"] == "icml" and meta["name"].endswith(".zip")
    assert meta["latex_warnings"] == ["icml_manual_style", "icml_anonymity_review"]
    source, readme = unpack(result)
    assert r"\documentclass{article}" in source
    assert r"\usepackage{icml2026}" in source and r"\printAffiliationsAndNotice{}" in source
    assert r"Research 100\% \& Safe" in source
    assert "Private Name" not in source and "Private Name" not in readme
    assert "does NOT include the ICML style" in readme
    assert icml_latex.OFFICIAL_STYLE_URL in readme
    assert "does not anonymize" in readme


def test_title_only_is_sufficient_and_missing_title_is_rejected():
    meta, result = submit(name="", title="Just a title")
    assert meta["ok"] and result.startswith(b"PK")
    meta, result = submit(name="", title="  ")
    assert meta["error"] == "missing_fields" and not result


def test_markdown_is_data_not_executable_tex_and_simple_sections_are_supported():
    content = b'# Introduction\n\nA \\input{secrets} & 50% _ ~ ^ $ # { }\n\n## Related Work\n\nText'
    meta, result = submit(content, "draft.md")
    source, _ = unpack(result)
    assert meta["latex_warnings"] == ["icml_manual_style", "icml_anonymity_review", "icml_text_reconstruction"]
    assert r"\section{Introduction}" in source and r"\subsection{Related Work}" in source
    assert r"\input{secrets}" not in source
    assert r"\textbackslash{}input\{secrets\}" in source
    assert r"\& 50\% \_ \textasciitilde{} \textasciicircum{} \$ \# \{ \}" in source


def test_docx_text_and_table_text_are_reconstructed_in_order_without_false_preservation_claims():
    doc = Document()
    doc.add_heading("Analysis", level=1)
    doc.add_paragraph("First paragraph")
    t = doc.add_table(rows=1, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "Alpha", "Beta"
    doc.add_paragraph("Last paragraph")
    buf = BytesIO()
    doc.save(buf)
    meta, result = submit(buf.getvalue(), "paper.docx")
    source, readme = unpack(result)
    assert meta["ok"] and "icml_text_reconstruction" in meta["latex_warnings"]
    assert source.index(r"\section{Analysis}") < source.index("First paragraph") < source.index("Alpha | Beta") < source.index("Last paragraph")
    assert "figures, complex tables" in readme


def test_nested_table_text_is_not_silently_dropped():
    doc = Document()
    outer = doc.add_table(rows=1, cols=1)
    cell = outer.cell(0, 0)
    cell.paragraphs[0].text = "Outer text"
    cell.add_table(rows=1, cols=1).cell(0, 0).text = "Nested table text"
    buf = BytesIO()
    doc.save(buf)
    meta, result = submit(buf.getvalue(), "paper.docx")
    source, _ = unpack(result)
    assert meta["ok"] and "Outer text" in source and "Nested table text" in source
    assert "icml_text_reconstruction" in meta["latex_warnings"]


def test_docx_textbox_omission_is_disclosed():
    doc = Document()
    run = doc.add_paragraph("Visible body").add_run()
    textbox = OxmlElement("w:txbxContent")
    paragraph, run_el, text = OxmlElement("w:p"), OxmlElement("w:r"), OxmlElement("w:t")
    text.text = "TEXTBOX CONTENT"
    run_el.append(text)
    paragraph.append(run_el)
    textbox.append(paragraph)
    run._r.append(textbox)
    buf = BytesIO()
    doc.save(buf)
    meta, result = submit(buf.getvalue(), "paper.docx")
    source, readme = unpack(result)
    assert meta["ok"] and "Visible body" in source
    assert "TEXTBOX CONTENT" not in source
    assert "icml_text_reconstruction" in meta["latex_warnings"]
    assert "text boxes, footnotes, endnotes" in readme


def test_fenced_markdown_does_not_turn_code_comments_into_sections():
    raw = b"# C#\n\n```python\n# still code\n```\n\n## End ##\n"
    meta, result = submit(raw, "draft.md")
    source, _ = unpack(result)
    assert meta["ok"] and r"\section{C\#}" in source
    assert r"\# still code" in source and r"\section{still code}" not in source
    assert r"\subsection{End}" in source


def test_unicode_warning_and_literal_backslash_escape(tmp_path):
    data = '中文 \\write18{bad}'.encode()
    meta, result = submit(data, "draft.txt")
    source, readme = unpack(result)
    assert "icml_unicode_review" in meta["latex_warnings"]
    assert "中文" in source and r"\write18{bad}" not in source
    assert "may disappear from the PDF" in source
    assert "characters may be missing from the PDF even if compilation reports success" in readme


def test_oversized_text_and_too_many_blocks_are_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(icml_latex, "MAX_DRAFT_CHARS", 8)
    meta, result = submit(b"123456789", "draft.txt")
    assert meta["error"] == "too_large" and not result
    monkeypatch.setattr(icml_latex, "MAX_DRAFT_CHARS", 100)
    monkeypatch.setattr(icml_latex, "MAX_BLOCKS", 2)
    meta, result = submit(b"a\n\nb\n\nc", "draft.txt")
    assert meta["error"] == "too_large" and not result


def test_table_cell_budget_rejects_excessive_reconstruction(monkeypatch):
    doc = Document()
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "one", "two"
    buf = BytesIO()
    doc.save(buf)
    monkeypatch.setattr(icml_latex, "MAX_TABLE_CELLS", 1)
    meta, result = submit(buf.getvalue(), "paper.docx")
    assert meta["error"] == "too_large" and not result


def test_output_is_starter_not_a_fake_document_or_compiled_pdf():
    meta, result = submit(b"Some text", "draft.txt")
    with ZipFile(BytesIO(result)) as archive:
        assert not any(name.endswith((".docx", ".pdf", ".sty")) for name in archive.namelist())
        assert b"Some text" in archive.read("main.tex")
