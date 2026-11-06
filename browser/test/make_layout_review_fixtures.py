"""Create fictional fixtures for the real-page layout-check acceptance test.

Run in the project virtualenv with an output directory on the project drive:
    python browser/test/make_layout_review_fixtures.py build/v2.13.0/acceptance/fixtures

No external image, font, network, or third-party rendering library is needed.
"""

from io import BytesIO
from pathlib import Path
import json
import struct
import sys
import zlib

from docx import Document
from docx.shared import Inches, Pt


def png_fixture():
    """An entirely synthetic small RGB PNG with a deterministic pixel pattern."""
    def chunk(kind, payload):
        return (struct.pack(">I", len(payload)) + kind + payload +
                struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))

    width, height = 8, 6
    pixels = b"".join(
        b"\0" + bytes(value for x in range(width)
                       for value in (x * 20, y * 30, 180))
        for y in range(height)
    )
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: make_layout_review_fixtures.py OUTPUT_DIRECTORY")
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)

    (output / "layout-review.txt").write_text(
        "LAYOUT_AUDIT_PLAIN_FIRST Fictional test paragraph.\n\n"
        "LAYOUT_AUDIT_PLAIN_SECOND Another fictional paragraph.\n\n"
        "Works Cited\n\nDoe, Jane. An Imaginary Reference. 2024.\n",
        encoding="utf-8", newline="\n",
    )

    doc = Document()
    doc.add_paragraph("LAYOUT_AUDIT_BODY_FIRST Fictional source paragraph.")
    preserved = doc.add_paragraph()
    run = preserved.add_run("LAYOUT_AUDIT_PRESERVED Explicit source formatting.")
    run.font.name = "Courier New"
    run.font.size = Pt(17)
    run.bold = True
    preserved.paragraph_format.line_spacing = 1.5
    doc.add_paragraph("LAYOUT_AUDIT_IMAGE_FOLLOWS")
    doc.add_picture(BytesIO(png_fixture()), width=Inches(0.5))
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "LAYOUT_AUDIT_TABLE_LEFT"
    table.cell(0, 1).text = "LAYOUT_AUDIT_TABLE_RIGHT"
    doc.add_heading("LAYOUT_AUDIT_HEADING_LEVEL_FOUR", level=4)
    doc.add_paragraph("Works Cited")
    doc.add_paragraph("Doe, Jane. A Fictional Reference. 2024.")
    doc.save(output / "layout-review-preserve.docx")

    (output / "layout-review-custom.json").write_text(json.dumps({
        "label": "Layout audit custom",
        "paper_size": "A4",
        "font_name": "Arial",
        "font_size": 11,
        "line_spacing": 1.5,
        "margin_cm": 2.5,
        "header": "page",
        "page_number_position": "bottom_center",
        "title_page": False,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Fixtures created under {output}")
    print("For preserved-source acceptance, select paragraph 2 in the UI.")


if __name__ == "__main__":
    main()
