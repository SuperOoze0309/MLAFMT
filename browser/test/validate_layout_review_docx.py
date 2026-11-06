"""Independently inspect a downloaded DOCX from layout-check UI acceptance.

This inspects document properties, not Word's rendered pages or full-format
compliance. Run after saving an actual browser download, e.g.:
    python browser/test/validate_layout_review_docx.py downloaded.docx --profile mla --fixture text
    python browser/test/validate_layout_review_docx.py downloaded.docx --profile custom --fixture preserve
Optionally pass --report-json with the browser's layout_check metadata. Only a
small allowlisted report schema is read; document text is not printed.
"""

import argparse
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn


PROFILES = {
    "mla": {"paper": (12240, 15840), "margin": 1440, "font": "Times New Roman", "pt": 12, "spacing": 2.0, "story": "header", "alignment": WD_ALIGN_PARAGRAPH.RIGHT},
    "apa": {"paper": (12240, 15840), "margin": 1440, "font": "Times New Roman", "pt": 12, "spacing": 2.0, "story": "header", "alignment": WD_ALIGN_PARAGRAPH.RIGHT},
    "custom": {"paper": (11906, 16838), "margin": 1417, "font": "Arial", "pt": 11, "spacing": 1.5, "story": "footer", "alignment": WD_ALIGN_PARAGRAPH.CENTER},
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(actual, expected, tolerance=2):
    return actual is not None and abs(actual - expected) <= tolerance


def effective_font(run, paragraph, attribute):
    value = getattr(run.font, attribute)
    if value is not None:
        return value
    for style in (run.style, paragraph.style):
        seen = set()
        while style is not None and style.style_id not in seen:
            seen.add(style.style_id)
            value = getattr(style.font, attribute)
            if value is not None:
                return value
            style = style.base_style
    return None


def has_page_field(paragraph):
    for element in paragraph._p.xpath(".//w:instrText | .//w:fldSimple"):
        instruction = element.text if element.tag == qn("w:instrText") else element.get(qn("w:instr"))
        if instruction and re.match(r"^\s*PAGE(?:\s|\\|$)", instruction, flags=re.IGNORECASE):
            return True
    return False


def validate(path, profile_name, fixture, report_path):
    data = path.read_bytes()
    with ZipFile(BytesIO(data)) as package:
        names = package.namelist()
        require("word/document.xml" in names, "Missing DOCX document.xml")
        require(package.testzip() is None, "Corrupt DOCX archive")
        story_names = [name for name in names if name.startswith("word/" + PROFILES[profile_name]["story"]) and name.endswith(".xml")]
        require(any(b"PAGE" in package.read(name) for name in story_names), "No PAGE field in expected header/footer package")
        image_count = len([name for name in names if name.startswith("word/media/")])

    doc = Document(BytesIO(data))
    profile = PROFILES[profile_name]
    require(len(doc.sections) >= 1, "Output has no sections")
    for section in doc.sections:
        require(close(section.page_width.twips, profile["paper"][0]) and close(section.page_height.twips, profile["paper"][1]), "Paper dimensions differ")
        for margin in (section.top_margin, section.bottom_margin, section.left_margin, section.right_margin):
            require(close(margin.twips, profile["margin"]), "A page margin differs")
    require(any(
        any(p.alignment == profile["alignment"] and has_page_field(p)
            for p in (getattr(section, profile["story"]).paragraphs))
        for section in doc.sections), "PAGE field or expected paragraph alignment absent")

    if fixture != "blank":
        marker = "LAYOUT_AUDIT_PLAIN_FIRST" if fixture == "text" else "LAYOUT_AUDIT_BODY_FIRST"
        paragraph = next((p for p in doc.paragraphs if marker in p.text), None)
        require(paragraph is not None, "Source text marker missing")
        runs = [r for r in paragraph.runs if marker in r.text]
        require(runs, "Source marker has no text run")
        actual_font = effective_font(runs[0], paragraph, "name")
        actual_size = effective_font(runs[0], paragraph, "size")
        require(actual_font == profile["font"] and close(actual_size.pt if actual_size else None, profile["pt"], 0.01), "Normal source body run font differs")
        require(close(paragraph.paragraph_format.line_spacing, profile["spacing"], 0.01), "Normal source body line spacing differs")
    if fixture == "preserve":
        paragraph = next((p for p in doc.paragraphs if "LAYOUT_AUDIT_PRESERVED" in p.text), None)
        require(paragraph is not None, "Preserved paragraph missing")
        run = next(r for r in paragraph.runs if "LAYOUT_AUDIT_PRESERVED" in r.text)
        require(run.font.name == "Courier New" and run.font.size.pt == 17 and run.bold is True, "Explicit preserved run formatting changed")
        require(close(paragraph.paragraph_format.line_spacing, 1.5, 0.01), "Preserved paragraph spacing changed")
        require(len(doc.tables) >= 1 and image_count >= 1, "Source table or image missing")
        require("LAYOUT_AUDIT_TABLE_LEFT" in doc.tables[0].cell(0, 0).text, "Source table text missing")

    report = None
    if report_path:
        report = json.loads(report_path.read_text(encoding="utf-8-sig"))
        require(report.get("version") == 1 and isinstance(report.get("checks"), list), "Unexpected report schema")
        by_id = {entry.get("id"): entry.get("status") for entry in report["checks"]}
        for key in ("paper_size", "margins", "page_number"):
            require(by_id.get(key) == "pass", f"Report and separately checked {key} disagree")
        for key in ("headings", "references", "visual_layout"):
            require(by_id.get(key) == "unchecked", f"Report overclaims {key}")
        if fixture == "preserve":
            require(by_id.get("preserved_content") == "warn", "Preserved paragraph review missing")
            require(by_id.get("images_tables") == "warn", "Image/table review missing")

    print(json.dumps({"ok": True, "profile": profile_name, "fixture": fixture,
                      "sections": len(doc.sections), "tables": len(doc.tables),
                      "media_parts": image_count, "report_checked": bool(report_path)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docx", type=Path)
    parser.add_argument("--profile", choices=PROFILES, required=True)
    parser.add_argument("--fixture", choices=("blank", "text", "preserve"), required=True)
    parser.add_argument("--report-json", type=Path)
    options = parser.parse_args()
    validate(options.docx, options.profile, options.fixture, options.report_json)


if __name__ == "__main__":
    main()
