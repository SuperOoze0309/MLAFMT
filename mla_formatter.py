"""
mla_formatter.py  (v2.1)
Core engine for one-click MLA formatting (MLA Handbook, 9th Edition).

Two entry points:
  create_blank_template(...)  -> blank MLA-formatted docx, ready to type into
  convert_draft_to_mla(...)   -> takes an existing .docx / .txt / .md draft and
                                 reformats it into proper MLA layout

Both accept either a file path or a writable binary stream (e.g. io.BytesIO)
as the output target.

Command line:
  python mla_formatter.py draft.docx -o out.docx --name "Jane Doe" --title "My Essay"
"""

import datetime
import os
import re
import tempfile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from docx.text.run import Run

__version__ = "2.1.0"

FONT_NAME = "Times New Roman"
FONT_SIZE = 12
SUPPORTED_EXTS = (".docx", ".txt", ".md")

MLG_DISCLAIMER = (
    "This tool reformats plain essay text into MLA format. Italic, bold and "
    "underline are kept; images, footnotes, tables, lists and special styles "
    "may not be preserved. Always proofread the result."
)


# ======================================================================
# Rich-text model
#   A paragraph is a list of segments: (text, bold, italic, underline)
# ======================================================================

def _seg(text, bold=False, italic=False, underline=False):
    return (text, bool(bold), bool(italic), bool(underline))


def _plain(segments):
    return "".join(s[0] for s in segments)


def _normalize_segments(segments):
    """Collapse internal whitespace / line breaks / tabs to single spaces,
    trim the ends, and merge neighbouring segments with identical formatting."""
    out = []
    for text, b, i, u in segments:
        text = re.sub(r"[ \t\r\n \u000b]+", " ", text)
        if not text:
            continue
        if out and out[-1][1:] == (b, i, u):
            out[-1] = (out[-1][0] + text,) + out[-1][1:]
        else:
            out.append((text, b, i, u))
    # trim leading / trailing spaces across segments
    while out and not out[0][0].strip():
        out.pop(0)
    while out and not out[-1][0].strip():
        out.pop()
    if out:
        out[0] = (out[0][0].lstrip(),) + out[0][1:]
        out[-1] = (out[-1][0].rstrip(),) + out[-1][1:]
    # collapse double spaces created at segment borders
    fixed = []
    for idx, seg in enumerate(out):
        t = seg[0]
        if fixed and fixed[-1][0].endswith(" ") and t.startswith(" "):
            t = t[1:]
        if t:
            fixed.append((t,) + seg[1:])
    return fixed


_MD_EMPH_RE = re.compile(r"(\*\*|__)(?=\S)(.+?)(?<=\S)\1|(\*|_)(?=\S)(.+?)(?<=\S)\3")


def _parse_markdown_emphasis(text):
    """Turn *italic* / _italic_ / **bold** into segments. Used for .txt/.md input
    so students can italicize titles of works in a plain-text draft."""
    segs, pos = [], 0
    for m in _MD_EMPH_RE.finditer(text):
        # ignore underscores inside words (snake_case, URLs)
        if m.group(3) == "_" or m.group(1) == "__":
            before = text[m.start() - 1] if m.start() > 0 else " "
            after = text[m.end()] if m.end() < len(text) else " "
            if before.isalnum() or after.isalnum():
                continue
        if m.start() > pos:
            segs.append(_seg(text[pos:m.start()]))
        if m.group(1):
            segs.append(_seg(m.group(2), bold=True))
        else:
            segs.append(_seg(m.group(4), italic=True))
        pos = m.end()
    if pos < len(text):
        segs.append(_seg(text[pos:]))
    return segs


# ======================================================================
# Optional heuristic classifiers (opt-in only)
# ======================================================================

def is_likely_heading(text):
    """Detect section headings in body text (e.g. Introduction, 1. Background).
    Exposed for GUI opt-in; NOT used by default."""
    stripped = text.strip()
    if not stripped or len(stripped) > 80 or stripped[-1] in ".!?,;:\"'":
        return False
    if len(stripped) >= 3 and stripped.isupper():
        return True
    if re.match(r"^[IVX]+\.\s", stripped):
        return True
    if re.match(r"^\d+(\.\d+)*\.?\s", stripped):
        return True
    words = stripped.split()
    if 2 <= len(words) <= 8:
        upper_words = sum(1 for w in words if w[0].isupper())
        if upper_words >= len(words) * 0.6:
            return True
    if len(words) == 1 and stripped[0].isupper() and len(stripped) > 3:
        return True
    return False


def is_likely_block_quote(text):
    """True only on an explicit '>' prefix (Markdown block-quote marker)."""
    return text.strip().startswith(">")


# ======================================================================
# Low-level MLA building blocks
# ======================================================================

def set_mla_page_setup(doc):
    """8.5 x 11 in, 1 in margins, header 0.5 in from top (MLA 9th 1.1, 1.5)."""
    s = doc.sections[0]
    s.page_height, s.page_width = Inches(11), Inches(8.5)
    s.top_margin = s.bottom_margin = s.left_margin = s.right_margin = Inches(1)
    s.header_distance = Inches(0.5)
    s.footer_distance = Inches(0.5)


def _force_rfonts(rpr, font_name):
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    # theme-font attributes override explicit ones -> remove them
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rfonts.get(qn(attr)) is not None:
            del rfonts.attrib[qn(attr)]
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), font_name)


def set_default_font(doc, font_name=FONT_NAME, size=FONT_SIZE):
    """Times New Roman 12 pt for every script, in Normal, Header and the
    document defaults, so nothing falls back to Calibri (MLA 9th 1.2)."""
    for style_name in ("Normal", "Header"):
        try:
            style = doc.styles[style_name]
        except KeyError:
            continue
        style.font.name = font_name
        style.font.size = Pt(size)
        style.font.color.rgb = None
        _force_rfonts(style.element.get_or_add_rPr(), font_name)
    # docDefaults
    defaults = doc.styles.element.find(qn("w:docDefaults"))
    if defaults is not None:
        rpr_default = defaults.find(qn("w:rPrDefault"))
        if rpr_default is not None:
            rpr = rpr_default.find(qn("w:rPr"))
            if rpr is not None:
                _force_rfonts(rpr, font_name)


def _strip_name_suffix(tokens):
    suffixes = {"jr", "sr", "ii", "iii", "iv", "v", "phd", "md", "esq"}
    while len(tokens) > 1 and tokens[-1].strip(".,").lower() in suffixes:
        tokens = tokens[:-1]
    return tokens


def extract_last_name(name, override=None):
    """Header surname: override if given, else last word of the name
    (ignoring suffixes such as Jr., Sr., III)."""
    if override and override.strip():
        return override.strip()
    tokens = [t.strip(",") for t in name.split() if t.strip(",")]
    tokens = _strip_name_suffix(tokens)
    return tokens[-1] if tokens else "LastName"


_extract_last_name = extract_last_name  # backward-compatible alias


def today_mla(date=None):
    """Today's date in MLA day-month-year form, e.g. '8 October 2026'."""
    d = date or datetime.date.today()
    return f"{d.day} {d.strftime('%B')} {d.year}"


def add_header_with_pagenum(doc, last_name):
    """'LastName N' flush right in the header, N = live PAGE field (MLA 9th 1.5).
    The field carries a cached '1' so it shows correctly even before Word
    recalculates it - no 'update fields?' prompt needed."""
    header = doc.sections[0].header
    header.is_linked_to_previous = False
    p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    _style_run(p.add_run(f"{last_name} "))

    def fld(kind):
        r = p.add_run()
        _style_run(r)
        el = OxmlElement("w:fldChar")
        el.set(qn("w:fldCharType"), kind)
        r._r.append(el)

    fld("begin")
    r = p.add_run()
    _style_run(r)
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    r._r.append(instr)
    fld("separate")
    _style_run(p.add_run("1"))
    fld("end")


def _style_run(run, font_name=FONT_NAME, size=FONT_SIZE):
    run.font.name = font_name
    run.font.size = Pt(size)
    _force_rfonts(run._r.get_or_add_rPr(), font_name)
    return run


def set_double_spacing(paragraph):
    """Double spacing, 0 pt before/after (MLA 9th 1.3-1.4)."""
    pf = paragraph.paragraph_format
    pf.line_spacing = 2.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)


def _add_segments(paragraph, segments, force_bold=False):
    for text, b, i, u in segments:
        r = paragraph.add_run(text)
        r.bold = True if (b or force_bold) else None
        r.italic = True if i else None
        r.underline = True if u else None


def add_mla_heading_block(doc, name, instructor, course, date_str, title):
    """First-page heading block at top left + centered title (MLA 9th 1.4)."""
    for text in (name, instructor, course, date_str):
        p = doc.add_paragraph(text)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        set_double_spacing(p)
    title_p = doc.add_paragraph()
    _add_segments(title_p, _parse_markdown_emphasis(title))  # *Hamlet* in a title
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_double_spacing(title_p)


def add_body_paragraph(doc, content, works_cited_entry=False,
                       is_heading=False, is_block_quote=False):
    """Add one MLA paragraph. `content` is a str or a list of segments."""
    segments = [_seg(content)] if isinstance(content, str) else content
    p = doc.add_paragraph()
    _add_segments(p, segments, force_bold=is_heading)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    set_double_spacing(p)
    pf = p.paragraph_format
    if works_cited_entry:                       # hanging indent, MLA 9th 2.8
        pf.left_indent = Inches(0.5)
        pf.first_line_indent = Inches(-0.5)
    elif is_block_quote:                        # MLA 9th 6.35
        pf.left_indent = Inches(0.5)
        pf.first_line_indent = Inches(0)
    elif is_heading:
        pf.first_line_indent = Inches(0)
    else:
        pf.first_line_indent = Inches(0.5)
    return p


# ======================================================================
# Works Cited helpers
# ======================================================================

_WORKS_CITED_RE = re.compile(
    r"^\s*(Works?\s+Cited|Works?\s+Consulted|Bibliography|References)\s*[.\-:;!?]*\s*$",
    re.IGNORECASE,
)


def _works_cited_title(match_text):
    t = match_text.lower()
    return "Works Consulted" if "consulted" in t else "Works Cited"


def _wc_sort_key(entry):
    """MLA alphabetization: ignore leading punctuation/quotes and an initial
    article (A, An, The), case-insensitive."""
    text = entry if isinstance(entry, str) else _plain(entry)
    base = re.sub(r"^[\W_]+", "", text.strip())
    base = re.sub(r"^(a|an|the)\s+", "", base, flags=re.IGNORECASE)
    return re.sub(r"^[\W_]+", "", base).lower()


# ======================================================================
# Validation / helpers
# ======================================================================

def validate_inputs(name, title):
    errors = []
    if not (name or "").strip():
        errors.append("Student Name cannot be empty.")
    if not (title or "").strip():
        errors.append("Essay Title cannot be empty.")
    return errors


_MLA_DATE_RE = re.compile(r"^\d{1,2}\s+[A-Za-z]{3,}\.?\s+\d{4}$")


def date_warning(date_str):
    """Return a hint if the date is not in MLA day-month-year form, else None."""
    if date_str and not _MLA_DATE_RE.match(date_str.strip()):
        return f"Tip: MLA date format is day month year, e.g. '{today_mla()}'."
    return None


def generate_filename(name, last_name_override=None):
    """Auto-generate filename: LastName_MLA_Essay.docx"""
    ln = extract_last_name(name, last_name_override)
    safe = re.sub(r'[\\/*?:"<>|\s]+', "_", ln).strip("_") or "MLA"
    return f"{safe}_MLA_Essay.docx"


def format_summary(name, last_name_override=None):
    """Human-readable list of the MLA specs that will be applied."""
    ln = extract_last_name(name, last_name_override)
    return [
        f"Header: {ln} 1 (upper right, 0.5 in from top)",
        "Paper: 8.5 x 11 in (Letter)",
        "Font: Times New Roman 12 pt",
        "Margins: 1 in (all sides)",
        "Spacing: Double (0 pt before/after)",
        "First-line indent: 0.5 in",
        "Alignment: Left (not justified)",
        "Block quote indent: 0.5 in",
        "Works Cited: new page, centered, alphabetical",
        "Works Cited entries: hanging indent 0.5 in",
    ]


# ======================================================================
# Entry point 1: blank template
# ======================================================================

def _new_mla_document(name, instructor, course, date_str, title, last_name_override):
    doc = Document()
    set_mla_page_setup(doc)
    set_default_font(doc)
    add_header_with_pagenum(doc, extract_last_name(name, last_name_override))
    add_mla_heading_block(doc, name, instructor, course,
                          date_str.strip() if date_str and date_str.strip() else today_mla(),
                          title)
    return doc


def _ensure_distinct_output(input_path, output):
    """Never replace the original draft, including aliases to the same file."""
    output_path = output if isinstance(output, (str, os.PathLike)) else getattr(output, "name", None)
    if not isinstance(output_path, (str, os.PathLike)):
        return
    source = os.path.normcase(os.path.realpath(input_path))
    target = os.path.normcase(os.path.realpath(output_path))
    same_file = source == target
    if not same_file:
        try:
            same_file = os.path.samefile(input_path, output_path)
        except (FileNotFoundError, OSError):
            pass
    if same_file:
        raise ValueError("Output must be a different file from the original draft.")


def _save_document(doc, output):
    """Finish writing a file before replacing an existing output document."""
    if not isinstance(output, (str, os.PathLike)):
        doc.save(output)
        return
    target = os.path.abspath(os.fspath(output))
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".mlafmt-", suffix=".docx",
                                         dir=os.path.dirname(target), delete=False) as temporary:
            temporary_path = temporary.name
        doc.save(temporary_path)
        os.replace(temporary_path, target)
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.unlink(temporary_path)


def create_blank_template(output, name="Your Name", instructor="Instructor Name",
                          course="Course Number", date_str="",
                          title="Title of Your Paper", last_name_override=None):
    """Write a blank MLA template. `output` is a path or a binary stream."""
    doc = _new_mla_document(name, instructor, course, date_str, title, last_name_override)
    add_body_paragraph(doc, "[Start writing your essay here.]")
    _save_document(doc, output)


# ======================================================================
# Entry point 2: convert an existing draft
# ======================================================================

def _effective_emphasis(run, paragraph, attribute):
    """Resolve direct formatting and character/paragraph style inheritance."""
    value = getattr(run, attribute)
    if value is not None:
        return bool(value)
    for style in (run.style, paragraph.style):
        seen = set()
        while style is not None and style.style_id not in seen:
            seen.add(style.style_id)
            value = getattr(style.font, attribute)
            if value is not None:
                return bool(value)
            style = style.base_style
    return False


def _docx_paragraph_segments(paragraph):
    segs = []
    # paragraph.runs omits runs nested inside hyperlinks. Preserve their visible
    # text in document order even though conversion does not retain link targets.
    for element in paragraph._p.iter(qn("w:r")):
        run = Run(element, paragraph)
        if run.text:
            segs.append(_seg(run.text, *(_effective_emphasis(run, paragraph, attr)
                                         for attr in ("bold", "italic", "underline"))))
    return segs


def _extract_paragraphs(input_path, txt_paragraph_mode="blank_line",
                        markdown_emphasis=True):
    """Return a list of rich paragraphs (each a list of segments)."""
    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".docx":
        src = Document(input_path)
        paras = [_normalize_segments(_docx_paragraph_segments(p)) for p in src.paragraphs]
        return [p for p in paras if p]

    # .txt / .md  - try UTF-8 first, fall back to common Windows/Chinese encodings
    with open(input_path, "rb") as source:
        raw = source.read()
    for enc in ("utf-8-sig", "utf-16", "gb18030", "cp1252"):
        try:
            text = raw.decode(enc)
            if enc == "utf-16" and not raw.startswith((b"\xff\xfe", b"\xfe\xff")):
                continue
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    if txt_paragraph_mode == "line_by_line":
        chunks = [line for line in text.split("\n") if line.strip()]
    else:
        chunks = []
        for chunk in re.split(r"\n\s*\n", text):
            lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
            if not lines:
                continue
            # a multi-line '>' block keeps one '>' marker
            if all(ln.startswith(">") for ln in lines):
                lines = [">"] + [ln.lstrip(">").strip() for ln in lines]
            chunks.append(" ".join(lines))   # unwrap hard-wrapped lines

    out = []
    for c in chunks:
        segs = _parse_markdown_emphasis(c) if markdown_emphasis else [_seg(c)]
        segs = _normalize_segments(segs)
        if segs:
            out.append(segs)
    return out


def _canon(s):
    return re.sub(r"[\s\W_]+", " ", (s or "")).strip().lower()


def _strip_existing_heading(paragraphs, name, instructor, course, date_str, title,
                            last_name):
    """Drop a heading block / title / running header the draft already has,
    so it is not duplicated. Only looks at the first few paragraphs."""
    # A single paragraph that matches the name or title can be actual prose.
    # Only remove a complete, ordered metadata block; leave ambiguous text alone.
    def key(text):
        return " ".join((text or "").split()).casefold()

    metadata = [key(text) for text in (name, instructor, course, date_str) if key(text)]
    header_re = re.compile(rf"^{re.escape(key(last_name))} \d+$") if last_name else None
    offset = int(bool(paragraphs and header_re and header_re.fullmatch(key(_plain(paragraphs[0])))))
    actual = [key(_plain(p)) for p in paragraphs[offset:offset + len(metadata)]]
    if len(metadata) < 2 or actual != metadata:
        return 0
    removed = offset + len(metadata)
    title_text = key(_plain(_parse_markdown_emphasis(title)))
    if len(paragraphs) > removed and key(_plain(paragraphs[removed])) == title_text:
        removed += 1
    del paragraphs[:removed]
    return removed


def convert_draft_to_mla(input_path, output, name, instructor, course,
                         date_str, title, last_name_override=None,
                         txt_paragraph_mode="blank_line",
                         enable_heading_detection=False,
                         enable_block_quote=False,
                         markdown_emphasis=True,
                         strip_existing_heading=True):
    """Convert a draft (.docx/.txt/.md) into an MLA-formatted .docx.

    Returns a stats dict: {"body": n, "works_cited": n, "removed_heading_lines": n}.
    """
    ext = os.path.splitext(input_path)[1].lower()
    if ext not in SUPPORTED_EXTS:
        raise ValueError(f"Unsupported file type '{ext}'. Use .docx, .txt or .md.")
    _ensure_distinct_output(input_path, output)

    paragraphs = _extract_paragraphs(input_path, txt_paragraph_mode, markdown_emphasis)
    last_name = extract_last_name(name, last_name_override)
    date_str = date_str.strip() if date_str and date_str.strip() else today_mla()

    removed = 0
    if strip_existing_heading:
        removed = _strip_existing_heading(paragraphs, name, instructor, course,
                                          date_str, title, last_name)

    doc = _new_mla_document(name, instructor, course, date_str, title, last_name_override)

    wc_title, wc_entries, body_count = None, [], 0
    for segs in paragraphs:
        plain = _plain(segs).strip()

        m = _WORKS_CITED_RE.match(plain)
        if m and wc_title is None:
            wc_title = _works_cited_title(m.group(1))
            continue
        if wc_title is not None:
            wc_entries.append(segs)
            continue

        if enable_block_quote and is_likely_block_quote(plain):
            first = segs[0]
            segs = _normalize_segments([(first[0].lstrip().lstrip(">"),) + first[1:]] + segs[1:])
            if segs:
                add_body_paragraph(doc, segs, is_block_quote=True)
                body_count += 1
            continue

        if enable_heading_detection and is_likely_heading(plain):
            add_body_paragraph(doc, segs, is_heading=True)
            body_count += 1
            continue

        add_body_paragraph(doc, segs)
        body_count += 1

    if wc_title is not None:
        title_p = doc.add_paragraph(wc_title)
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_double_spacing(title_p)
        title_p.paragraph_format.page_break_before = True   # new page, MLA 9th 2.8
        for entry in sorted(wc_entries, key=_wc_sort_key):
            add_body_paragraph(doc, entry, works_cited_entry=True)

    _save_document(doc, output)
    return {"body": body_count, "works_cited": len(wc_entries),
            "removed_heading_lines": removed}


# ======================================================================
# CLI
# ======================================================================

def _cli(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Format an essay draft in MLA 9th edition style.")
    ap.add_argument("input", nargs="?", help=".docx/.txt/.md draft (omit with --blank)")
    ap.add_argument("-o", "--output", help="output .docx (default: LastName_MLA_Essay.docx)")
    ap.add_argument("--blank", action="store_true", help="create a blank template instead")
    ap.add_argument("--name", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--instructor", default="")
    ap.add_argument("--course", default="")
    ap.add_argument("--date", default="", help="default: today")
    ap.add_argument("--last-name", default=None, help="header surname override")
    ap.add_argument("--line-by-line", action="store_true", help="txt: every line is a paragraph")
    ap.add_argument("--headings", action="store_true", help="auto-detect headings")
    ap.add_argument("--block-quotes", action="store_true", help="'>' lines become block quotes")
    a = ap.parse_args(argv)

    out = a.output or generate_filename(a.name, a.last_name)
    if a.blank:
        create_blank_template(out, a.name, a.instructor, a.course, a.date, a.title, a.last_name)
        print(f"Blank template -> {out}")
        return 0
    if not a.input:
        ap.error("input file required (or use --blank)")
    stats = convert_draft_to_mla(a.input, out, a.name, a.instructor, a.course, a.date,
                                 a.title, a.last_name,
                                 "line_by_line" if a.line_by_line else "blank_line",
                                 a.headings, a.block_quotes)
    print(f"{stats['body']} body paragraphs, {stats['works_cited']} Works Cited entries -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
