"""Generate a local ICML 2026 LaTeX source starter, without bundling ICML files.

Text from a draft is always escaped as data, never inserted as executable TeX.
The output is a starter: its formatting, contents and anonymity require review.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

from mla_formatter import _read_text_draft


OFFICIAL_STYLE_URL = "https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip"
OFFICIAL_INSTRUCTIONS_URL = "https://icml.cc/Conferences/2026/AuthorInstructions"
MAX_DRAFT_CHARS = 2_000_000
MAX_BLOCKS = 50_000
MAX_TABLE_CELLS = 100_000

_TEX_ESCAPES = {
    "\\": r"\textbackslash{}", "{": r"\{", "}": r"\}",
    "$": r"\$", "&": r"\&", "#": r"\#", "%": r"\%",
    "_": r"\_", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


def _clean(text):
    """Remove invalid controls before embedding untrusted draft text."""
    return "".join(
        " " if (ord(c) < 32 and c not in "\n\t") or 127 <= ord(c) <= 159
        or 0xD800 <= ord(c) <= 0xDFFF or ord(c) in (0xFFFE, 0xFFFF) else c
        for c in str(text)
    )


def escape_tex(text):
    return "".join(_TEX_ESCAPES.get(char, char) for char in _clean(text))


def _text_blocks(path, extension, mode):
    text = _read_text_draft(path)
    if len(text) > MAX_DRAFT_CHARS:
        raise ValueError("too_large")
    # Recognise only straightforward Markdown section headings. Everything
    # else (including Markdown images, formulas and TeX) remains literal text.
    blocks, lines = [], []
    fence = None
    def flush():
        if lines:
            blocks.append((0, " ".join(lines)))
            lines.clear()
            if len(blocks) > MAX_BLOCKS:
                raise ValueError("too_large")
    for line in text.split("\n"):
        line = line.strip()
        marker = re.match(r"^(`{3,}|~{3,})", line) if extension == ".md" else None
        in_fence = fence is not None
        if marker:
            token = marker.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
        heading = (re.match(r"^(#{1,3})\s+(.+?)\s*$", line)
                   if extension == ".md" and not in_fence and not marker else None)
        if heading:
            flush()
            heading_text = re.sub(r"\s+#+\s*$", "", heading.group(2))
            blocks.append((len(heading.group(1)), heading_text))
            if len(blocks) > MAX_BLOCKS:
                raise ValueError("too_large")
        elif not line:
            flush()
        else:
            lines.append(line)
            if mode == "line_by_line":
                flush()
    flush()
    return blocks


def _docx_blocks(path):
    doc = Document(path)
    blocks = []
    total = 0
    row_size = 0
    cell_visits = 0
    def add(level, text):
        nonlocal total
        total += len(text)
        if total > MAX_DRAFT_CHARS or len(blocks) >= MAX_BLOCKS:
            raise ValueError("too_large")
        blocks.append((level, text))
    def flatten_cell(cell, depth=0):
        nonlocal row_size, cell_visits
        if depth > 16:
            raise ValueError("too_large")
        cell_visits += 1
        if cell_visits > MAX_TABLE_CELLS:
            raise ValueError("too_large")
        parts = []
        for child in cell.iter_inner_content():
            if isinstance(child, Paragraph):
                if child.text.strip():
                    value = child.text.strip()
                    row_size += len(value) + 3
                    if total + row_size > MAX_DRAFT_CHARS:
                        raise ValueError("too_large")
                    parts.append(value)
            elif isinstance(child, Table):
                for nested_row in child.rows:
                    row_text = " | ".join(flatten_cell(nested_cell, depth + 1) for nested_cell in nested_row.cells)
                    if row_text.strip(" |"):
                        parts.append(row_text)
        return " ".join(parts)
    for block in doc.iter_inner_content():
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if not text:
                continue
            style_name = (block.style.name if block.style else "") or ""
            heading = re.fullmatch(r"Heading\s+([1-3])", style_name, flags=re.IGNORECASE)
            add(int(heading.group(1)) if heading else 0, text)
        elif isinstance(block, Table):
            # Preserve directly accessible table text as plain lines; this is
            # not a table conversion and must be reported as such to the user.
            for row in block.rows:
                row_size = 0
                cells = [flatten_cell(cell) for cell in row.cells]
                if any(cells):
                    add(0, " | ".join(cells))
    return blocks


def make_icml_source(title, input_path=None, *, txt_mode="blank_line"):
    """Return a ZIP of main.tex and instructions; does not bundle ICML styles.

    Input may be TXT, Markdown or DOCX.  Images, tables, equations, citations
    and rich formatting are not reconstructed; users must review the output.
    """
    title = _clean(title).strip()
    if not title:
        raise ValueError("missing_fields")
    if txt_mode not in ("blank_line", "line_by_line"):
        raise ValueError("invalid_options")
    blocks = []
    if input_path is not None:
        extension = Path(input_path).suffix.lower()
        if extension not in (".docx", ".txt", ".md"):
            raise ValueError("unsupported")
        blocks = _docx_blocks(input_path) if extension == ".docx" else _text_blocks(input_path, extension, txt_mode)

    rendered = []
    for level, text in blocks:
        safe = escape_tex(text.strip())
        if not safe:
            continue
        rendered.append(("\\" + ("section", "subsection", "subsubsection")[level - 1] + "{" + safe + "}")
                        if level else safe)
    body = "\n\n".join(rendered) if rendered else "% Add your paper text here."
    safe_title = escape_tex(" ".join(title.split()))
    contains_non_ascii = any(ord(c) > 127 for c in title + "".join(text for _, text in blocks))
    tex = r"""% ICML 2026 starter: obtain the official style package before compiling.
% Review the entire source, references and PDF for anonymity before submission.
""" + ("% Non-ASCII text may disappear from the PDF with default ICML fonts;\n"
       "% configure compatible fonts/engine and verify every character in the PDF.\n"
       if contains_non_ascii else "") + r"""\documentclass{article}
\usepackage{hyperref}
\usepackage{icml2026}
\usepackage{amsmath,amssymb}
\icmltitlerunning{""" + safe_title + r"""}
\begin{document}
\twocolumn[
\icmltitle{""" + safe_title + r"""}
\begin{icmlauthorlist}
\icmlauthor{Anonymous Author}{anon}
\end{icmlauthorlist}
\icmlaffiliation{anon}{Anonymous Institution}
\icmlcorrespondingauthor{Anonymous Author}{anon@example.com}
\vskip 0.3in
]
\printAffiliationsAndNotice{}
\begin{abstract}
% Replace with your own abstract.
\end{abstract}

""" + body + r"""

% Add and review citations and bibliography using the official ICML style.
\end{document}
"""
    readme = f"""FormCapy ICML 2026 LaTeX starter

This ZIP does NOT include the ICML style or bibliography files and is not
ready to compile on its own. Obtain the official ICML 2026 style archive:
{OFFICIAL_STYLE_URL}

Unpack the official files into the same project as main.tex. In particular,
icml2026.sty is required, and icml2026.bst is needed when using its BibTeX
style. Standard LaTeX packages and a TeX installation are also required.
Read the official instructions: {OFFICIAL_INSTRUCTIONS_URL}
Check the official template for the intended conference year before submitting;
this starter specifically targets 2026 and is not a future-year template.

The starter uses the anonymous review option and does not include the name
entered in the FormCapy form. It does not anonymize the title, draft text,
citations, file names, PDF metadata or supplementary material. Review them yourself.
Author and affiliation fields are anonymous placeholders. For an accepted
paper, consult the official instructions and replace them yourself.

Draft content is reconstructed as text; simple Markdown or Word heading
styles may become sections. Existing LaTeX commands and equations are escaped
as literal text. Rich formatting, figures, complex tables, references and
other document objects are not preserved as editable LaTeX structures. DOCX
text boxes, footnotes, endnotes and other embedded content may be omitted;
check and rebuild them manually. Non-ASCII text may need a compatible TeX engine,
fonts or additional configuration. In particular, Chinese or other CJK
characters may be missing from the PDF even if compilation reports success.
Configure a suitable TeX engine and CJK fonts, then check every character in
the resulting PDF visually and by text extraction. Support is not guaranteed.
The abstract environment starts empty; move or write your abstract there.
Text that resembles references remains body text; create a bibliography yourself.
No PDF is generated by FormCapy. Compile and review the result yourself.
"""
    warnings = ["icml_manual_style", "icml_anonymity_review"]
    if input_path is not None:
        warnings.append("icml_text_reconstruction")
    if contains_non_ascii:
        warnings.append("icml_unicode_review")
    out = BytesIO()
    with ZipFile(out, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("main.tex", tex.encode("utf-8"))
        archive.writestr("README.txt", readme.encode("utf-8"))
    return out.getvalue(), tuple(warnings), len(blocks)
