"""Check the emitted DOCX and disclose the limits of structural inspection."""
from io import BytesIO
import json
from pathlib import Path

import pytest
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

import browser_bridge
from format_profiles import resolve_profile
from mla_formatter import create_blank_template, inspect_draft_paragraphs


def make_blank(format_id="mla", custom=None):
    out = BytesIO()
    create_blank_template(out, name="PRIVATE NAME", title="PRIVATE TITLE",
                          format_id=format_id, custom_profile=custom)
    return out.getvalue(), resolve_profile(format_id, custom)


def inspect(data, profile, stats=None):
    report = browser_bridge._layout_inspection(data, profile, stats or {})
    assert report["version"] == 1
    assert all(set(item) == {"id", "status"} for item in report["checks"])
    assert "PRIVATE" not in json.dumps(report)
    return {item["id"]: item["status"] for item in report["checks"]}


def saved(doc):
    out = BytesIO()
    doc.save(out)
    return out.getvalue()


@pytest.mark.parametrize("format_id,custom", [
    ("mla", None), ("apa", None),
    ("custom", {"paper_size": "A4", "font_name": "宋体", "typography": "chinese",
                "line_spacing_pt": 20, "title_page": True,
                "show_cover_page_number": False, "page_number_position": "bottom_center"}),
    ("custom", {"header": "none", "page_number_position": "bottom_right"}),
])
def test_generated_templates_check_real_settings_without_claiming_visual_compliance(format_id, custom):
    data, profile = make_blank(format_id, custom)
    result = inspect(data, profile)
    for code in ("paper_size", "margins", "default_font", "paragraph_spacing", "page_number"):
        assert result[code] == "pass"
    for code in ("preserved_content", "images_tables", "headings", "references", "visual_layout"):
        assert result[code] == "unchecked"


def test_changed_actual_output_reports_only_relevant_structural_findings():
    data, profile = make_blank()
    doc = Document(BytesIO(data))
    doc.sections[0].page_width = Cm(20)
    doc.sections[0].left_margin = Cm(3)
    doc.styles["Normal"].font.name = "Arial"
    doc.paragraphs[-1].paragraph_format.line_spacing = 1.5
    doc.sections[0].header.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.LEFT
    result = inspect(saved(doc), profile)
    for code in ("paper_size", "margins", "default_font", "paragraph_spacing", "page_number"):
        assert result[code] == "warn"
    assert result["visual_layout"] == result["references"] == "unchecked"


def test_cjk_font_and_fixed_spacing_are_checked_separately():
    custom = {"paper_size": "A4", "font_name": "宋体", "typography": "chinese", "line_spacing_pt": 20}
    data, profile = make_blank("custom", custom)
    doc = Document(BytesIO(data))
    doc.paragraphs[-1].paragraph_format.line_spacing = Pt(19)
    result = inspect(saved(doc), profile)
    assert result["default_font"] == "pass"
    assert result["paragraph_spacing"] == "warn"


def test_fixed_spacing_rejects_at_least_rule_with_same_numeric_size():
    data, profile = make_blank("custom", {"line_spacing_pt": 20})
    doc = Document(BytesIO(data))
    doc.paragraphs[-1].paragraph_format.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
    assert doc.paragraphs[-1].paragraph_format.line_spacing == Pt(20)
    assert inspect(saved(doc), profile)["paragraph_spacing"] == "warn"


@pytest.mark.parametrize("multiplier", [1, 1.29, 1.5, 2, 2.25])
def test_supported_line_spacing_multipliers_accept_the_matching_word_rule(multiplier):
    data, profile = make_blank("custom", {"line_spacing": multiplier})
    assert inspect(data, profile)["paragraph_spacing"] == "pass"


def test_unrelated_field_named_page_is_not_a_page_number():
    data, profile = make_blank()
    doc = Document(BytesIO(data))
    paragraph = doc.sections[0].header.paragraphs[0]
    for field in paragraph._p.xpath(".//w:instrText"):
        field.text = " DOCPROPERTY PAGE "
    assert inspect(saved(doc), profile)["page_number"] == "warn"


def test_page_instructions_without_a_begin_and_end_field_are_not_dynamic():
    data, profile = make_blank()
    doc = Document(BytesIO(data))
    paragraph = doc.sections[0].header.paragraphs[0]
    for field in paragraph._p.xpath(".//w:fldChar"):
        field.getparent().remove(field)
    assert paragraph._p.xpath(".//w:instrText")
    assert inspect(saved(doc), profile)["page_number"] == "warn"


def test_page_field_inside_header_table_does_not_pass_as_no_page_number():
    data, profile = make_blank("custom", {"header": "none"})
    doc = Document(BytesIO(data))
    table = doc.sections[0].header.add_table(rows=1, cols=1, width=Cm(3))
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), " PAGE ")
    field.append(OxmlElement("w:r"))
    table.cell(0, 0).paragraphs[0]._p.append(field)
    assert inspect(saved(doc), profile)["page_number"] == "warn"


@pytest.mark.parametrize("theme_attribute", ["asciiTheme", "hAnsiTheme", "eastAsiaTheme", "csTheme", "cstheme"])
def test_theme_font_override_cannot_be_reported_as_a_matching_normal_style(theme_attribute):
    data, profile = make_blank()
    doc = Document(BytesIO(data))
    fonts = doc.styles["Normal"].element.get_or_add_rPr().find(qn("w:rFonts"))
    fonts.set(qn("w:" + theme_attribute), "minorHAnsi")
    assert inspect(saved(doc), profile)["default_font"] == "warn"


def test_preserved_format_and_table_never_pass_as_complete_checks():
    data, profile = make_blank()
    doc = Document(BytesIO(data))
    doc.add_table(rows=1, cols=1).cell(0, 0).text = "PRIVATE TABLE"
    result = inspect(saved(doc), profile, {"preserved_paragraphs": 1})
    assert result["preserved_content"] == result["images_tables"] == "warn"
    assert result["headings"] == result["references"] == result["visual_layout"] == "unchecked"


def test_real_preserved_draft_exposes_different_spacing_and_objects(tmp_path):
    source = Document()
    paragraph = source.add_paragraph("PRIVATE SOURCE PARAGRAPH")
    paragraph.paragraph_format.line_spacing = 1.5
    paragraph.runs[0].font.name = "Courier New"
    source.add_table(rows=1, cols=1).cell(0, 0).text = "PRIVATE TABLE"
    source_path = tmp_path / "source.docx"
    source.save(source_path)
    fingerprint = inspect_draft_paragraphs(source_path)["source_fingerprint"]
    started = json.loads(browser_bridge.begin("source.docx"))
    Path(started["input_path"]).write_bytes(source_path.read_bytes())
    request = {"kind": "convert", "file_name": "source.docx", "name": "Private Name",
               "title": "Private Title", "strip_heading": False,
               "preserve_paragraphs": [1], "source_fingerprint": fingerprint}
    metadata, document = browser_bridge.finish(json.dumps(request), started["workdir"])
    payload = json.loads(metadata)
    assert payload["ok"] and document.startswith(b"PK")
    result = {item["id"]: item["status"] for item in payload["layout_check"]["checks"]}
    assert result["paragraph_spacing"] == "warn"
    assert result["preserved_content"] == result["images_tables"] == "warn"
    assert "PRIVATE SOURCE" not in json.dumps(payload["layout_check"])


def test_bridge_returns_checked_output_without_leaking_paper_contents():
    started = json.loads(browser_bridge.begin(""))
    metadata, document = browser_bridge.finish(json.dumps({
        "kind": "blank", "name": "PRIVATE NAME", "title": "PRIVATE TITLE",
    }), started["workdir"])
    payload = json.loads(metadata)
    assert payload["ok"] and document.startswith(b"PK")
    assert not Path(started["workdir"]).exists()
    assert "PRIVATE" not in json.dumps(payload["layout_check"])
    assert payload["layout_check"]["checks"][0] == {"id": "paper_size", "status": "pass"}


def test_inspection_failure_does_not_block_the_document_download(monkeypatch):
    def fail(*args):
        raise RuntimeError("PRIVATE EXCEPTION")
    monkeypatch.setattr(browser_bridge, "_layout_inspection", fail)
    started = json.loads(browser_bridge.begin(""))
    metadata, document = browser_bridge.finish(json.dumps({
        "kind": "blank", "name": "Private", "title": "Paper",
    }), started["workdir"])
    payload = json.loads(metadata)
    assert payload["ok"] and document.startswith(b"PK")
    assert payload["layout_check"] == {"version": 1, "checks": [
        {"id": "inspection_unavailable", "status": "unchecked"}]}
    assert "PRIVATE EXCEPTION" not in metadata
