"""Validate bundled style files and compile complete ICML Pyodide exports.

All output stays in the caller's project-local test directory. The official
archive is used only for comparison; compilation uses the generated ZIP files.
"""
from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile

from docx import Document
from pypdf import PdfReader


def fixtures(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "draft.md").write_text(
        "# Intro & Goals\n\nText with A & B, 50%, dollar $5, hash #1 and a_b.\n\n"
        "## Method #1\n\nLiteral \\input{evil} remains data.\n", encoding="utf-8"
    )
    doc = Document()
    doc.add_heading("Methods & Evaluation", level=1)
    doc.add_paragraph("English retained text 42 and 25%")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "A & B", "Results"
    table.cell(1, 0).text, table.cell(1, 1).text = "accuracy", "92%"
    doc.save(out / "english.docx")
    doc = Document()
    doc.add_heading("中文标题与实验", level=1)
    doc.add_paragraph("水豚中文实验结果 Example 42")
    doc.save(out / "chinese.docx")


def validate(out: Path, official: Path, compiler: Path, cache: Path) -> None:
    official_zip = official / "icml2026-official.zip"
    assert hashlib.sha256(official_zip.read_bytes()).hexdigest() == "8b29290f5828e176debb57ea9cc00252502973d55ea561a2f18a7f0a326bfc6c"
    style_files = ("icml2026.sty", "icml2026.bst", "algorithm.sty", "algorithmic.sty", "fancyhdr.sty")
    with ZipFile(official_zip) as official_archive:
        for name in style_files:
            assert (official / name).read_bytes() == official_archive.read(name)
    results = {}
    for case in ("blank", "special", "docx", "cjk"):
        folder = out / case
        folder.mkdir(parents=True, exist_ok=True)
        meta = json.loads((out / (case + ".json")).read_text(encoding="utf-8"))
        assert meta["ok"] and meta["name"] == "FormCapy-ICML-2026.zip"
        assert meta["mime"] == "application/zip" and meta["format_id"] == "icml"
        with ZipFile(out / (case + ".zip")) as archive:
            assert set(archive.namelist()) == {"main.tex", "README.txt", *style_files}
            for name in style_files:
                assert archive.read(name) == (official / name).read_bytes(), name
            source = archive.read("main.tex").decode("utf-8")
            readme = archive.read("README.txt").decode("utf-8")
        assert "Private Author 778899" not in source and "Private Author 778899" not in readme
        assert r"\usepackage{icml2026}" in source and r"\usepackage[accepted]{icml2026}" not in source
        assert "includes the official ICML 2026 style" in readme and "does not anonymize" in readme
        assert meta.get("icml_style_included") is True
        if case == "special":
            assert r"\textbackslash{}input\{evil\}" in source and r"\input{evil}" not in source
            assert r"A \& B 50\% \$cost\$ \#\_\{\}" in source
        if case == "docx":
            assert "accuracy | 92\\%" in source and r"\section{Methods \& Evaluation}" in source
        if case == "cjk":
            assert "icml_unicode_review" in meta["latex_warnings"]
            assert "characters may be missing from the PDF" in readme
        (folder / "main.tex").write_text(source, encoding="utf-8")
        with ZipFile(out / (case + ".zip")) as generated:
            for name in style_files:
                (folder / name).write_bytes(generated.read(name))
        env = os.environ.copy()
        env["TECTONIC_CACHE_DIR"] = str(cache)
        run = subprocess.run(
            [str(compiler), "--untrusted", "--only-cached", "--keep-logs", "--outdir", str(folder), str(folder / "main.tex")],
            cwd=folder, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90, check=False,
        )
        output = run.stdout.decode("utf-8", errors="replace")
        (folder / "compiler.log").write_text(output, encoding="utf-8")
        assert run.returncode == 0, (case, output[-1000:])
        pdf = PdfReader(folder / "main.pdf")
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        (folder / "extract.txt").write_text(text, encoding="utf-8")
        assert "Anonymous" in text and "Private Author 778899" not in text
        if case == "special":
            assert "A & B 50% $cost$ #_{}" in text and "Literal \\input{evil} remains data." in text
        if case == "docx":
            assert all(word in text for word in ("English retained text 42", "accuracy | 92%", "Methods & Evaluation"))
        missing = sum("missing character" in line.lower() for line in output.splitlines())
        results[case] = {
            "pdf_pages": len(pdf.pages), "anonymous_marker": True,
            "missing_glyph_warnings": missing, "cjk_text_visible_in_extraction": "水豚中文实验结果" in text,
            "fontconfig_warning": "Fontconfig error" in output,
        }
    (out / "summary.json").write_text(json.dumps({"ok": True, "cases": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "fixtures":
        fixtures(Path(sys.argv[2]).resolve())
    elif mode == "validate":
        validate(*(Path(item).resolve() for item in sys.argv[2:6]))
    else:
        raise ValueError("unknown mode")
