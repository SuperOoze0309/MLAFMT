"""
mla_formatter.py  (v2.4)
Shared MLA 9, APA 7 student and custom course-layout engine.

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
from docx.enum.section import WD_SECTION_START
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor
from docx.text.run import Run

from format_profiles import FORMAT_IDS, resolve_profile

__version__ = "2.6.0"

FONT_NAME = "Times New Roman"
FONT_SIZE = 12
SUPPORTED_EXTS = (".docx", ".txt", ".md")

MLG_DISCLAIMER = (
    "This tool formats drafts using the selected paper layout. DOCX body images "
    "and tables are retained. Selected paragraphs keep their original formatting; "
    "paper size, margins, headers and footers follow the selected template. "
    "Text and Markdown image syntax does not embed images. Review the result."
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


def today_for_format(format_id="mla", date=None):
    """Use an English written date independent of the operating-system locale."""
    resolve_profile(format_id)
    d = date or datetime.date.today()
    months = ("January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December")
    if format_id == "apa":
        return f"{months[d.month - 1]} {d.day}, {d.year}"
    return f"{d.day} {months[d.month - 1]} {d.year}"


def _date_variants(text):
    """Equivalent written English dates for matching a complete old heading."""
    months = ("January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December")
    variants = [text]
    chinese = re.fullmatch(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日", text.strip())
    if chinese:
        try:
            date = datetime.date(*(int(value) for value in chinese.groups()))
        except ValueError:
            return variants
        english = f"{date.day} {months[date.month - 1]} {date.year}"
        return list(dict.fromkeys(variants + _date_variants(english)))
    match = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})", text.strip())
    if match:
        day, month, year = match.group(1), match.group(2), match.group(3)
    else:
        match = re.fullmatch(r"([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})", text.strip())
        if not match:
            return variants
        month, day, year = match.group(1), match.group(2), match.group(3)
    month_number = next((index for index, value in enumerate(months, 1)
                         if month.casefold() in (value.casefold(), value[:3].casefold())), None)
    if month_number is None:
        return variants
    try:
        date = datetime.date(int(year), month_number, int(day))
    except ValueError:
        return variants
    month_name = months[date.month - 1]
    variants.extend((f"{date.day} {month_name} {date.year}", f"{month_name} {date.day}, {date.year}"))
    variants.append(f"{date.year}年{date.month}月{date.day}日")
    return list(dict.fromkeys(variants))


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
    # MLA paper titles are not bolded. Keep italic markup for titles of works
    # embedded in the paper title, but treat Markdown bold as plain text.
    title_segments = [
        (text, False, italic, underline)
        for text, _bold, italic, underline in _parse_markdown_emphasis(title)
    ]
    _add_segments(title_p, title_segments)
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


def date_warning(date_str, format_id="mla"):
    """Return a hint if the date is not in MLA day-month-year form, else None."""
    if format_id == "mla" and date_str and not _MLA_DATE_RE.match(date_str.strip()):
        return f"Tip: MLA date format is day month year, e.g. '{today_mla()}'."
    return None


def generate_filename(name, last_name_override=None, *, format_id="mla", custom_profile=None):
    """Auto-generate filename: LastName_MLA_Essay.docx"""
    profile = resolve_profile(format_id, custom_profile)
    ln = extract_last_name(name, last_name_override)
    safe = re.sub(r'[\\/*?:"<>|\s\x00-\x1f\x7f]+', "_", ln).strip("_.") or "Paper"
    while len(safe.encode("utf-8")) > 150:
        safe = safe[:-1]
    style = {"mla": "MLA", "apa": "APA", "custom": "Custom"}[profile["format_id"]]
    return f"{safe}_{style}_Essay.docx"


def format_summary(name, last_name_override=None, *, format_id="mla", custom_profile=None):
    """Human-readable list of the MLA specs that will be applied."""
    profile = resolve_profile(format_id, custom_profile)
    ln = extract_last_name(name, last_name_override)
    if format_id != "mla":
        spacing = (f"Exactly {profile['line_spacing_pt']:g} pt" if profile["line_spacing_pt"]
                   else f"{profile['line_spacing']:g} times")
        indent = (f"{profile['first_line_chars']:g} characters" if profile["first_line_chars"]
                  else f"{profile['first_line_cm']:g} cm")
        references_indent = ("no automatic hanging indent" if profile["typography"] == "chinese"
                             else "hanging indent 0.5 in")
        position = {"top_right": "upper right", "bottom_center": "footer center",
                    "bottom_right": "footer right"}[profile["page_number_position"]]
        start = profile["page_number_start"]
        headers = {"page": f"Page number only ({position}, starts at {start})", "none": "None",
                   "surname_page": f"{ln} {start} ({position})"}
        return [
            f"Format: {profile['label']}",
            f"Paper: {profile['paper_size']}",
            f"Font: {profile['font_name']} {profile['font_size']:g} pt"
            + (f"; Latin/numerals: {profile['latin_font_name']}" if profile["typography"] == "chinese" else ""),
            f"Margins: {profile['margin_cm']:g} cm (all sides)",
            f"Line spacing: {spacing}; 0 pt before/after",
            f"First-line indent: {indent}; {profile['alignment']} alignment",
            f"Header: {headers[profile['header']]}",
            "Separate title page" if profile["title_page"] else "First-page information block",
            ("Cover counted and numbered" if profile["show_cover_page_number"]
             else "Cover unnumbered; body starts at the selected page number") if profile["title_page"]
            else "Page numbering begins on the first page",
            f"{profile['references_title']}: new page, {references_indent}; "
            + ("alphabetical order" if profile["sort_references"] else "original order"),
            "Reference wording and in-text citations are kept as supplied.",
        ]
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
                          title="Title of Your Paper", last_name_override=None, *,
                          format_id="mla", custom_profile=None, affiliation=""):
    """Write a blank MLA template. `output` is a path or a binary stream."""
    profile = resolve_profile(format_id, custom_profile)
    if format_id == "mla":
        doc = _new_mla_document(name, instructor, course, date_str, title, last_name_override)
        add_body_paragraph(doc, "[Start writing your essay here.]")
    else:
        doc = _new_profile_document(profile, name, instructor, course, date_str, title,
                                    last_name_override, affiliation)
        placeholder = "[在此开始撰写正文。]" if profile["typography"] == "chinese" else "[Start writing your essay here.]"
        _add_profile_paragraph(doc, [_seg(placeholder)], profile)
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

    return _text_paragraphs(_read_text_draft(input_path), txt_paragraph_mode, markdown_emphasis)


def _read_text_draft(input_path):
    """Try UTF-8 first, then common Windows and Chinese draft encodings."""
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
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _text_paragraphs(text, txt_paragraph_mode, markdown_emphasis):
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
                         strip_existing_heading=True, *, format_id="mla",
                         custom_profile=None, affiliation="", preserve_paragraphs=None,
                         source_fingerprint=None):
    """Convert a draft (.docx/.txt/.md) into an MLA-formatted .docx.

    Returns a stats dict: {"body": n, "works_cited": n, "removed_heading_lines": n}.
    """
    profile = resolve_profile(format_id, custom_profile)
    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".docx":
        _ensure_distinct_output(input_path, output)
        from docx_preserve import convert_docx_draft
        return convert_docx_draft(
            input_path, output, name, instructor, course, date_str, title,
            last_name_override, txt_paragraph_mode, enable_heading_detection,
            enable_block_quote, markdown_emphasis, strip_existing_heading,
            profile=profile, affiliation=affiliation,
            preserve_paragraphs=preserve_paragraphs, source_fingerprint=source_fingerprint)
    if preserve_paragraphs:
        raise ValueError("preserve_docx_only")
    if format_id != "mla":
        return _convert_profile_draft(
            input_path, output, name, instructor, course, date_str, title,
            last_name_override, txt_paragraph_mode, enable_heading_detection,
            enable_block_quote, markdown_emphasis, strip_existing_heading,
            profile, affiliation)
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
        if not removed:
            blocks = [(segments, 0) for segments in paragraphs]
            removed = _strip_profile_front_matter(
                blocks, profile, name, instructor, course, date_str, title,
                affiliation, last_name)
            if removed:
                paragraphs = [segments for segments, _level in blocks]

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
        if wc_title == "Works Cited" and len(wc_entries) == 1:
            wc_title = "Work Cited"
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
# APA student papers and custom course layouts
# ======================================================================

_LITERAL_BLOCK = -1  # A fenced text block, exempt from heading/reference guesses.

def _profile_spacing(paragraph, profile):
    pf = paragraph.paragraph_format
    pf.line_spacing = (Pt(profile["line_spacing_pt"]) if profile["line_spacing_pt"]
                       else profile["line_spacing"])
    pf.space_before = pf.space_after = Pt(0)
    if profile["typography"] == "chinese":
        ppr = paragraph._p.get_or_add_pPr()
        grid = ppr.find(qn("w:snapToGrid"))
        if grid is None:
            grid = OxmlElement("w:snapToGrid")
            ppr.insert_element_before(grid, "w:spacing")
        grid.set(qn("w:val"), "0")
    return pf


def _profile_font(profile, role="body", heading_level=0):
    if profile["typography"] == "chinese" and (heading_level or role in ("title", "reference_title")):
        return "黑体", {1: 16, 2: 14, 3: 12}.get(heading_level, 16)
    return profile["font_name"], profile["font_size"]


def _profile_rfonts(rpr, profile, font_name):
    _force_rfonts(rpr, font_name)
    if profile["typography"] == "chinese":
        rfonts = rpr.find(qn("w:rFonts"))
        for attribute in ("w:ascii", "w:hAnsi", "w:cs"):
            rfonts.set(qn(attribute), profile["latin_font_name"])


def _style_profile_run(run, profile, *, role="body", heading_level=0):
    font_name, size = _profile_font(profile, role, heading_level)
    _style_run(run, font_name, size)
    _profile_rfonts(run._r.get_or_add_rPr(), profile, font_name)
    return run


def _reset_profile_character_indents(paragraph):
    """Remove source character units before applying the template's units."""
    indent = paragraph._p.get_or_add_pPr().find(qn("w:ind"))
    if indent is not None:
        for key in ("firstLineChars", "hangingChars", "leftChars", "rightChars", "startChars", "endChars", "start", "end"):
            indent.attrib.pop(qn("w:" + key), None)


def _profile_first_line(paragraph, profile):
    chars = profile["first_line_chars"]
    if chars:
        # Word's character unit is one hundredth of a full-width character.
        # Keep a physical fallback for editors which ignore firstLineChars.
        paragraph.paragraph_format.first_line_indent = Pt(profile["font_size"] * chars)
        indent = paragraph._p.get_or_add_pPr().find(qn("w:ind"))
        indent.set(qn("w:firstLineChars"), str(round(chars * 100)))
    else:
        paragraph.paragraph_format.first_line_indent = Cm(profile["first_line_cm"])


def _profile_date(profile, date_str):
    if date_str and date_str.strip():
        return date_str.strip()
    if profile["typography"] == "chinese":
        today = datetime.date.today()
        return f"{today.year}年{today.month}月{today.day}日"
    return today_for_format(profile["format_id"])


def _set_page_start(section, start):
    element = section._sectPr.find(qn("w:pgNumType"))
    if element is None:
        element = OxmlElement("w:pgNumType")
        section._sectPr.insert_element_before(
            element, "w:cols", "w:formProt", "w:vAlign", "w:noEndnote", "w:titlePg",
            "w:textDirection", "w:bidi", "w:rtlGutter", "w:docGrid", "w:printerSettings",
            "w:sectPrChange")
    element.set(qn("w:fmt"), "decimal")
    if start is None:
        element.attrib.pop(qn("w:start"), None)
    else:
        element.set(qn("w:start"), str(start))


def _configure_page_numbers(doc, profile, name, last_name_override=None, *, header_style_id=None):
    """Create fresh page-number stories; hidden covers do not count as page 1."""
    doc.settings.odd_and_even_pages_header_footer = False
    hidden_cover = profile["title_page"] and not profile["show_cover_page_number"]
    for index, section in enumerate(doc.sections):
        for reference in list(section._sectPr):
            if reference.tag in (qn("w:headerReference"), qn("w:footerReference")):
                section._sectPr.remove(reference)
        section.different_first_page_header_footer = False
        _set_page_start(section, profile["page_number_start"]
                        if index == (1 if hidden_cover else 0) else None)
    if profile["header"] == "none":
        return
    for index, section in enumerate(doc.sections):
        if hidden_cover and index == 0:
            continue
        location = profile["page_number_position"]
        story = section.header if location == "top_right" else section.footer
        story.is_linked_to_previous = False
        paragraph = story.paragraphs[0]
        if header_style_id:
            paragraph._p.style = header_style_id
        _add_page_number(paragraph, profile, name, last_name_override)


def _add_page_number(paragraph, profile, name, last_name_override):
    paragraph.alignment = (WD_ALIGN_PARAGRAPH.CENTER
                           if profile["page_number_position"] == "bottom_center" else WD_ALIGN_PARAGRAPH.RIGHT)
    _profile_spacing(paragraph, profile)
    if profile["header"] == "surname_page":
        paragraph.add_run(extract_last_name(name, last_name_override) + " ")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), " PAGE ")
    run = OxmlElement("w:r")
    text = OxmlElement("w:t")
    text.text = str(profile["page_number_start"])
    run.append(text)
    field.append(run)
    paragraph._p.append(field)
    for element in paragraph._p.iter(qn("w:r")):
        _style_profile_run(Run(element, paragraph), profile)


def _configure_profile_styles(doc, profile):
    set_default_font(doc, profile["font_name"], profile["font_size"])
    if profile["typography"] == "chinese":
        for style_name in ("Normal", "Header"):
            _profile_rfonts(doc.styles[style_name].element.get_or_add_rPr(), profile, profile["font_name"])
        defaults = doc.styles.element.find(qn("w:docDefaults"))
        if defaults is not None:
            rpr = defaults.find("./" + qn("w:rPrDefault") + "/" + qn("w:rPr"))
            if rpr is not None:
                _profile_rfonts(rpr, profile, profile["font_name"])
    normal = doc.styles["Normal"].paragraph_format
    normal.line_spacing = (Pt(profile["line_spacing_pt"]) if profile["line_spacing_pt"]
                           else profile["line_spacing"])
    normal.space_before = normal.space_after = Pt(0)
    for level in (1, 2, 3):
        style = doc.styles[f"Heading {level}"]
        font_name, size = _profile_font(profile, heading_level=level)
        style.font.name = font_name
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.font.bold = True
        style.font.italic = level == 3 and profile["format_id"] == "apa"
        _profile_rfonts(style.element.get_or_add_rPr(), profile, font_name)
        pf = style.paragraph_format
        pf.line_spacing = normal.line_spacing
        pf.space_before = pf.space_after = Pt(0)
        pf.first_line_indent = pf.left_indent = Inches(0)
        pf.keep_with_next = True
        pf.alignment = (WD_ALIGN_PARAGRAPH.CENTER
                        if level == 1 and profile["format_id"] == "apa"
                        else WD_ALIGN_PARAGRAPH.LEFT)


def _add_profile_paragraph(doc, segments, profile, *, role="body", heading_level=0):
    paragraph = doc.add_paragraph(style=f"Heading {heading_level}" if heading_level else None)
    _add_segments(paragraph, segments, force_bold=bool(heading_level) or role == "title")
    for run in paragraph.runs:
        _style_profile_run(run, profile, role=role, heading_level=heading_level)
        run.font.color.rgb = RGBColor(0, 0, 0)
        if heading_level == 3 and profile["format_id"] == "apa":
            run.italic = True
    pf = _profile_spacing(paragraph, profile)
    pf.left_indent = pf.right_indent = pf.first_line_indent = Inches(0)
    _reset_profile_character_indents(paragraph)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    if role in ("title", "reference_title"):
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf.keep_with_next = True
        if role == "reference_title" and (profile["format_id"] == "apa" or profile["typography"] == "chinese"):
            for run in paragraph.runs:
                run.bold = True
    elif role == "reference":
        if profile["typography"] != "chinese":
            pf.left_indent = Inches(0.5)
            pf.first_line_indent = Inches(-0.5)
    elif role == "block":
        pf.left_indent = Inches(0.5)
    elif heading_level:
        if heading_level == 1 and profile["format_id"] == "apa":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf.keep_with_next = True
    elif role == "body":
        _profile_first_line(paragraph, profile)
        if profile["alignment"] == "justify":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    return paragraph


def _new_profile_document(profile, name, instructor, course, date_str, title,
                          last_name_override, affiliation):
    doc = Document()
    section = doc.sections[0]
    if profile["paper_size"] == "A4":
        section.page_width, section.page_height = Cm(21), Cm(29.7)
    else:
        section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Cm(profile["margin_cm"])
    section.left_margin = section.right_margin = Cm(profile["margin_cm"])
    # Keep a header inside even a narrow custom margin.
    section.header_distance = section.footer_distance = min(Inches(0.5), Cm(profile["margin_cm"] / 2))
    _configure_profile_styles(doc, profile)
    date_text = _profile_date(profile, date_str)
    title_segments = _parse_markdown_emphasis(title)
    if profile["title_page"]:
        cover_title = _add_profile_paragraph(doc, title_segments, profile, role="title")
        cover_title.paragraph_format.space_before = Pt((profile["line_spacing_pt"] or profile["font_size"] * profile["line_spacing"]) * 3)
        # APA student title pages have one extra double-spaced line before the byline.
        _add_profile_paragraph(doc, [], profile, role="metadata")
        for value in (name, affiliation, course, instructor, date_text):
            if value and value.strip():
                paragraph = _add_profile_paragraph(doc, [_seg(value.strip())], profile, role="metadata")
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        hidden_cover = not profile["show_cover_page_number"]
        if hidden_cover:
            doc.add_section(WD_SECTION_START.NEW_PAGE)
        body_title = _add_profile_paragraph(doc, title_segments, profile, role="title")
        body_title.paragraph_format.page_break_before = not hidden_cover
    else:
        if profile["typography"] == "chinese":
            _add_profile_paragraph(doc, title_segments, profile, role="title")
            for value in (name, affiliation, instructor, course, date_text):
                if value and value.strip():
                    paragraph = _add_profile_paragraph(doc, [_seg(value.strip())], profile, role="metadata")
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            for value in (name, affiliation, instructor, course, date_text):
                if value and value.strip():
                    _add_profile_paragraph(doc, [_seg(value.strip())], profile, role="metadata")
            _add_profile_paragraph(doc, title_segments, profile, role="title")
    _configure_page_numbers(doc, profile, name, last_name_override)
    return doc


def _paragraph_heading_level(paragraph):
    style = paragraph.style
    seen = set()
    while style is not None and style.style_id not in seen:
        seen.add(style.style_id)
        match = re.fullmatch(r"Heading\s*([1-9])", style.style_id, re.IGNORECASE)
        if match:
            return int(match.group(1))
        style = style.base_style
    return 0


def _profile_blocks(input_path, txt_paragraph_mode, markdown_emphasis):
    """Keep explicit heading levels alongside the existing rich text model."""
    if os.path.splitext(input_path)[1].lower() == ".docx":
        source = Document(input_path)
        blocks = []
        for paragraph in source.paragraphs:
            segments = _normalize_segments(_docx_paragraph_segments(paragraph))
            if segments:
                blocks.append((segments, _paragraph_heading_level(paragraph)))
        unsupported = ("w:tbl", "w:drawing", "w:pict", "w:footnoteReference",
                       "w:endnoteReference", "m:oMath")
        unsupported_tags = {qn(tag) for tag in unsupported}
        omitted = sum(1 for element in source.element.iter() if element.tag in unsupported_tags)
        return blocks, omitted
    blocks = []
    regular_lines, literal_lines = [], []
    fence = None
    closing_fence = None

    def flush_regular():
        # A heading ends at the newline even without an empty line after it.
        text = "\n".join(regular_lines)
        text = re.sub(r"(?m)^(#{1,6})[ \t]+([^\n]+)$", r"\n\n\1 \2\n\n", text)
        for segments in _text_paragraphs(text, txt_paragraph_mode, markdown_emphasis):
            match = re.match(r"^(#{1,6})\s+", _plain(segments))
            level = len(match.group(1)) if match else 0
            if match:
                segments = _drop_segment_prefix(segments, len(match.group(0)))
            blocks.append((segments, level))
        regular_lines.clear()

    for line in _read_text_draft(input_path).split("\n"):
        if fence is not None:
            literal_lines.append(line)
            if closing_fence.fullmatch(line):
                blocks.append(([_seg("\n".join(literal_lines))], _LITERAL_BLOCK))
                literal_lines.clear()
                fence = None
            continue
        match = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if match and (match.group(1)[0] != "`" or "`" not in match.group(2)):
            flush_regular()
            fence = match.group(1)
            closing_fence = re.compile(r" {0,3}" + re.escape(fence[0])
                                       + "{" + str(len(fence)) + r",}[ \t]*")
            literal_lines.append(line)
        else:
            regular_lines.append(line)
    if literal_lines:
        blocks.append(([_seg("\n".join(literal_lines))], _LITERAL_BLOCK))
    flush_regular()
    return blocks, 0


def _drop_segment_prefix(segments, count):
    out = []
    for text, *style in segments:
        if count >= len(text):
            count -= len(text)
            continue
        out.append((text[count:], *style))
        count = 0
    return _normalize_segments(out)


def _strip_profile_front_matter(blocks, profile, name, instructor, course, date_str,
                                 title, affiliation, last_name):
    """Only remove complete matching metadata blocks; never guess from a name."""
    def key(text):
        return " ".join(text.split()).casefold()

    if not blocks:
        return 0
    values = [key(_plain(segments)) for segments, _ in blocks]
    title_text = key(_plain(_parse_markdown_emphasis(title)))
    date_text = _profile_date(profile, date_str)
    # Match both layouts so switching a course template's cover setting does
    # not copy the previous cover into the new body. All supplied metadata must
    # still match, including an equivalent date; a title alone is never enough.
    for previous_date in _date_variants(date_text):
        for fields in (
            (name, affiliation, course, instructor, previous_date),
            (name, affiliation, instructor, course, previous_date),
        ):
            metadata = [key(value) for value in fields if value and value.strip()]
            for title_first in (True, False):
                expected = ([title_text] if title_first else []) + metadata
                if len(metadata) < 2 or values[:len(expected)] != expected:
                    continue
                count = len(expected)
                if len(values) > count and values[count] == title_text:
                    count += 1
                del blocks[:count]
                return count
    # Support an MLA draft being laid out as APA without retaining the MLA block.
    for previous_date in _date_variants(date_text):
        paragraphs = [segments for segments, _ in blocks]
        count = _strip_existing_heading(paragraphs, name, instructor, course, previous_date, title, last_name)
        if count:
            del blocks[:count]
            return count
    return 0


def _profile_reference_title(text, profile):
    """Recognize a standalone reference-section label, never rewrite entries."""
    if _WORKS_CITED_RE.match(text):
        return True
    return _canon(text) == _canon(profile["references_title"])


def _reference_sort_key(segments):
    # APA author surnames include The/A/An; do not use MLA's article stripping.
    return re.sub(r"^[\W_]+", "", _plain(segments)).casefold()


def _convert_profile_draft(input_path, output, name, instructor, course, date_str, title,
                            last_name_override, txt_paragraph_mode, enable_heading_detection,
                            enable_block_quote, markdown_emphasis, strip_existing_heading,
                            profile, affiliation):
    ext = os.path.splitext(input_path)[1].lower()
    if ext not in SUPPORTED_EXTS:
        raise ValueError(f"Unsupported file type '{ext}'. Use .docx, .txt or .md.")
    if txt_paragraph_mode not in ("blank_line", "line_by_line"):
        raise ValueError("Choose blank_line or line_by_line for plain text.")
    _ensure_distinct_output(input_path, output)
    blocks, omitted = _profile_blocks(input_path, txt_paragraph_mode, markdown_emphasis)
    removed = 0
    if strip_existing_heading:
        removed = _strip_profile_front_matter(
            blocks, profile, name, instructor, course, date_str, title, affiliation,
            extract_last_name(name, last_name_override))
    doc = _new_profile_document(profile, name, instructor, course, date_str, title,
                                last_name_override, affiliation)
    references, body_blocks, trailing_blocks = [], [], []
    found_references, after_references = False, False
    for segments, level in blocks:
        plain = _plain(segments).strip()
        if level != _LITERAL_BLOCK and not found_references and _profile_reference_title(plain, profile):
            found_references = True
            continue
        if found_references and not after_references:
            # A section heading or literal block ends References, so appendix
            # text is never alphabetized with the bibliography entries.
            if level > 0 or level == _LITERAL_BLOCK:
                after_references = True
            else:
                references.append(segments)
                continue
        (trailing_blocks if after_references else body_blocks).append((segments, level))

    body_count, unsupported_headings = 0, 0

    def add_body_blocks(items, new_page=False):
        nonlocal body_count, unsupported_headings
        first = True
        for segments, level in items:
            plain = _plain(segments).strip()
            literal = level == _LITERAL_BLOCK
            if literal:
                level = 0
            unsupported_level = level > 3
            if unsupported_level:
                unsupported_headings += 1
                level = 0
            role = "literal" if literal else "body"
            if not literal and enable_block_quote and plain.startswith(">"):
                segments = _drop_segment_prefix(segments, len(plain) - len(plain.lstrip(">")))
                role = "block"
                level = 0
            elif not literal and not level and not unsupported_level and enable_heading_detection and is_likely_heading(plain):
                level = 1
            if not segments:
                continue
            paragraph = _add_profile_paragraph(doc, segments, profile, role=role, heading_level=level)
            if first and new_page:
                paragraph.paragraph_format.page_break_before = True
            first = False
            body_count += 1

    add_body_blocks(body_blocks)
    if found_references:
        label = _add_profile_paragraph(doc, [_seg(profile["references_title"])], profile, role="reference_title")
        label.paragraph_format.page_break_before = True
        entries = sorted(references, key=_reference_sort_key) if profile["sort_references"] else references
        for entry in entries:
            _add_profile_paragraph(doc, entry, profile, role="reference")
    add_body_blocks(trailing_blocks, new_page=True)
    _save_document(doc, output)
    return {"body": body_count, "works_cited": len(references), "removed_heading_lines": removed,
            "omitted_elements": omitted, "unsupported_headings": unsupported_headings}


# Format-neutral name for new clients; the old entry point remains compatible.
convert_draft = convert_draft_to_mla


def inspect_draft_paragraphs(input_path):
    """Read original DOCX paragraph identifiers and a source-file fingerprint."""
    from docx_preserve import inspect_draft_paragraphs as inspect
    return inspect(input_path)


def list_draft_paragraphs(input_path):
    return inspect_draft_paragraphs(input_path)["paragraphs"]


# ======================================================================
# CLI
# ======================================================================

def _cli(argv=None):
    import argparse
    import json
    ap = argparse.ArgumentParser(description="Format a draft in MLA 9, APA 7 student, or a course template.")
    ap.add_argument("input", nargs="?", help=".docx/.txt/.md draft (omit with --blank)")
    ap.add_argument("-o", "--output", help="output .docx (default: LastName_MLA_Essay.docx)")
    ap.add_argument("--blank", action="store_true", help="create a blank template instead")
    ap.add_argument("--name", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--instructor", default="")
    ap.add_argument("--course", default="")
    ap.add_argument("--date", default="", help="default: today")
    ap.add_argument("--last-name", default=None, help="header surname override")
    ap.add_argument("--format", dest="format_id", choices=FORMAT_IDS, default="mla")
    ap.add_argument("--affiliation", default="", help="department and university for an APA student title page")
    ap.add_argument("--profile", help="custom course-template JSON file (use with --format custom)")
    ap.add_argument("--line-by-line", action="store_true", help="txt: every line is a paragraph")
    ap.add_argument("--headings", action="store_true", help="auto-detect headings")
    ap.add_argument("--block-quotes", action="store_true", help="'>' lines become block quotes")
    a = ap.parse_args(argv)

    custom = None
    if a.profile:
        if a.format_id != "custom":
            ap.error("--profile requires --format custom")
        try:
            with open(a.profile, encoding="utf-8-sig") as source:
                custom = json.load(source)
        except (OSError, ValueError) as error:
            ap.error(f"Cannot read course template: {error}")
    layout = {"format_id": a.format_id, "custom_profile": custom}
    try:
        resolve_profile(**layout)
    except ValueError as error:
        ap.error(str(error))
    out = a.output or generate_filename(a.name, a.last_name, **layout)
    if a.blank:
        create_blank_template(out, a.name, a.instructor, a.course, a.date, a.title, a.last_name,
                              affiliation=a.affiliation, **layout)
        print(f"Blank template -> {out}")
        return 0
    if not a.input:
        ap.error("input file required (or use --blank)")
    stats = convert_draft_to_mla(a.input, out, a.name, a.instructor, a.course, a.date,
                                 a.title, a.last_name,
                                 "line_by_line" if a.line_by_line else "blank_line",
                                 a.headings, a.block_quotes,
                                 affiliation=a.affiliation, **layout)
    print(f"{stats['body']} body paragraphs, {stats['works_cited']} reference entries -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
