"""Browser-local document bridge for FormCapy (MLAFMT).

This adapter runs inside Pyodide in a dedicated module Worker. It mirrors the
Android adapter protocol: a JSON request goes in, a small JSON metadata object
and the generated DOCX bytes come out, and drafts never leave the browser.

Only files that the page writes into the unique MEMFS work directory are read.
The directory is removed in ``finish()`` even when formatting fails. Nothing in
this module imports Flask or touches the network.

Protocol (called by ``browser/worker.js``):

    begin(file_name)            -> JSON {"workdir": ..., "input_path": ...}
    finish(request_json, dir)   -> (metadata_json, document_bytes)
    discard(dir)                -> JSON {"ok": true}
    initial_state()             -> JSON {"today": ..., "version": ...}

``finish`` accepts the same document request as the Android bridge, plus a
``file_name`` field so the extension and size limits can be checked before the
draft is opened.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import zipfile
from io import BytesIO

from docx.opc.exceptions import PackageNotFoundError
from lxml.etree import XMLSyntaxError

from format_profiles import resolve_profile
from bibliography_export import render_bibliography_docx

from mla_formatter import (
    SUPPORTED_EXTS,
    __version__,
    convert_draft_to_mla,
    create_blank_template,
    generate_filename,
    inspect_draft_paragraphs,
    today_mla,
    validate_inputs,
)

MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_DOCX_EXPANDED = 80 * 1024 * 1024
MAX_DOCX_ENTRIES = 2000
MAX_DOCX_ENTRY_SIZE = 20 * 1024 * 1024
MAX_PRESERVE_PARAGRAPHS = 10000
MAX_TEXT_FIELD = 5000
MAX_FINGERPRINT = 64
DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
KINDS = ("blank", "convert", "paragraphs", "bibliography", "file_convert", "file_check")
TEXT_FIELDS = (
    "name",
    "title",
    "instructor",
    "course",
    "date",
    "last_name_override",
    "affiliation",
)
FLAGS = ("markdown", "strip_heading", "heading_detect", "block_quote")
KNOWN_VALUE_ERRORS = (
    "draft_changed",
    "preserve_docx_only",
    "invalid_options",
    "unsupported_document",
    "too_large",
    "empty_file",
    "unsupported",
    "no_file",
    "missing_fields",
    "icml_style_unavailable",
)
_TEMP_PREFIX = "mlafmt-"


class RequestError(Exception):
    """A request problem that maps onto one of the shared UI error codes."""

    def __init__(self, code, detail=None):
        super().__init__(code)
        self.code = code
        self.detail = detail


def _error_payload(code, detail=None):
    payload = {"ok": False, "error": code}
    if detail:
        text = " ".join(str(detail).split())
        payload["detail"] = text[:300]
    return payload


def _metadata(value):
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def initial_state():
    """Small boot payload; the page already knows how to format dates."""
    return _metadata({"today": today_mla(), "version": __version__})


def begin(file_name=""):
    """Create a unique MEMFS work directory and return its input path.

    ``file_name`` only selects the draft extension. The extension is re-checked
    in ``finish``; unsupported names get a neutral ``.bin`` suffix so ``begin``
    itself cannot fail on untrusted input.
    """
    workdir = tempfile.mkdtemp(prefix=_TEMP_PREFIX)
    extension = os.path.splitext(_basename(file_name))[1].lower()
    if extension not in (*SUPPORTED_EXTS, ".pdf", ".doc"):
        extension = ".bin"
    input_path = os.path.join(workdir, "input" + extension)
    return _metadata({"workdir": workdir, "input_path": input_path})


def discard(workdir):
    """Remove a work directory after a JavaScript-side failure."""
    _cleanup(workdir)
    return _metadata({"ok": True})


def finish(request_json, workdir):
    """Run one request and always remove the work directory afterwards.

    Returns ``(metadata_json, document_bytes)``. ``paragraphs`` returns empty
    bytes; the paragraph list travels in the metadata object.
    """
    try:
        request = _parse_request(request_json)
        kind = request["kind"]
        if kind == "paragraphs":
            return _paragraphs(request, workdir), b""
        if kind == "bibliography":
            return _bibliography(request)
        if kind == "file_convert":
            return _file_convert(request, workdir)
        if kind == "file_check":
            return _file_check(request, workdir), b""
        return _generate(request, workdir)
    except RequestError as error:
        return _metadata(_error_payload(error.code, error.detail)), b""
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile,
            PackageNotFoundError, XMLSyntaxError) as error:
        code = _document_error_code(error, request_json)
        return _metadata(_error_payload(code, error)), b""
    except Exception as error:  # noqa: BLE001 - the worker needs a JSON reply
        return _metadata(_error_payload("failed", f"{type(error).__name__}: {error}")), b""
    finally:
        _cleanup(workdir)


def _basename(file_name):
    if not isinstance(file_name, str):
        return ""
    return re.split(r"[\\/]", file_name)[-1]


def _cleanup(workdir):
    """Only remove a directory this module created under the temp root."""
    if not isinstance(workdir, str) or not workdir:
        return
    try:
        temp_root = os.path.realpath(tempfile.gettempdir())
        resolved = os.path.realpath(workdir)
        if (os.path.commonpath((temp_root, resolved)) != temp_root
                or not os.path.basename(resolved).startswith(_TEMP_PREFIX)):
            return
        shutil.rmtree(resolved, ignore_errors=True)
    except (OSError, ValueError):
        pass


def _parse_request(request_json):
    if not isinstance(request_json, str):
        raise RequestError("invalid_json")
    try:
        data = json.loads(request_json)
    except (ValueError, TypeError) as error:
        raise RequestError("invalid_json") from error
    if not isinstance(data, dict):
        raise RequestError("invalid_json")
    if data.get("kind") not in KINDS:
        raise RequestError("invalid_options")
    for key in TEXT_FIELDS:
        value = data.get(key, "")
        if value is None:
            data[key] = ""
        elif not isinstance(value, str) or len(value) > MAX_TEXT_FIELD:
            raise RequestError("invalid_fields")
    if data.get("txt_mode", "blank_line") not in ("blank_line", "line_by_line"):
        raise RequestError("invalid_options")
    for key in FLAGS:
        if key in data and not isinstance(data[key], bool):
            raise RequestError("invalid_options")
    preserve = data.get("preserve_paragraphs", [])
    if (not isinstance(preserve, list) or len(preserve) > MAX_PRESERVE_PARAGRAPHS
            or any(isinstance(value, bool) or not isinstance(value, int) or value < 1
                   for value in preserve)):
        raise RequestError("invalid_options")
    fingerprint = data.get("source_fingerprint")
    if fingerprint is not None and (
            not isinstance(fingerprint, str) or len(fingerprint) > MAX_FINGERPRINT):
        raise RequestError("invalid_options")
    return data


def _layout(request):
    format_id = request.get("format_id", "mla")
    custom_profile = request.get("custom_profile")
    if isinstance(custom_profile, str):
        if len(custom_profile) > 10000:
            raise RequestError("invalid_options")
        try:
            custom_profile = json.loads(custom_profile)
        except (ValueError, TypeError) as error:
            raise RequestError("invalid_options") from error
    try:
        profile = resolve_profile(format_id, custom_profile)
    except ValueError as error:
        raise RequestError("invalid_options", error) from error
    return (
        {"format_id": format_id,
         "custom_profile": custom_profile if format_id == "custom" else None},
        profile,
    )


def _fields(request):
    values = {key: request.get(key, "").strip() for key in TEXT_FIELDS}
    if validate_inputs(values["name"], values["title"]):
        raise RequestError("missing_fields")
    override = values.pop("last_name_override") or None
    values["last_name_override"] = override
    return values


def _input_path(request, workdir):
    """The worker writes into ``workdir/input<ext>`` returned by ``begin``."""
    file_name = request.get("file_name", "")
    if not isinstance(file_name, str) or not _basename(file_name):
        raise RequestError("no_file")
    extension = os.path.splitext(_basename(file_name))[1].lower()
    return os.path.join(workdir, "input" + extension), extension


def _check_limits(path):
    if not os.path.isfile(path):
        raise RequestError("no_file")
    size = os.path.getsize(path)
    if size > MAX_FILE_SIZE:
        raise RequestError("too_large")
    if not size:
        raise RequestError("empty_file")
    return size


def _check_docx(path):
    """Bound ZIP expansion before python-docx reads every part into memory."""
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if (len(entries) > MAX_DOCX_ENTRIES
                    or sum(item.file_size for item in entries) > MAX_DOCX_EXPANDED
                    or any(item.file_size > MAX_DOCX_ENTRY_SIZE for item in entries)
                    or any(item.flag_bits & 1 for item in entries)):
                raise ValueError("DOCX archive exceeds safe processing limits")
            if "[Content_Types].xml" not in archive.namelist():
                raise ValueError("Not a DOCX package")
    except zipfile.BadZipFile:
        raise


def _document_error_code(error, request_json):
    code = str(error)
    if code in KNOWN_VALUE_ERRORS:
        return code
    extension = ""
    try:
        data = json.loads(request_json)
        extension = os.path.splitext(_basename(data.get("file_name", "")))[1].lower()
    except (ValueError, TypeError, AttributeError):
        pass
    if extension == ".docx" and isinstance(error, (
            zipfile.BadZipFile, PackageNotFoundError, KeyError, ValueError,
            XMLSyntaxError)):
        return "bad_doc"
    return "failed"


def _safe_filename(filename):
    """Match the Android adapter: valid, bounded, no path components."""
    name = _basename(filename) or "Formatted_Paper.docx"
    if not name.lower().endswith(".docx"):
        name += ".docx"
    stem = re.sub(r"[\x00-\x1f\x7f]", "_", name[:-5]) or "Formatted_Paper"
    while len(stem.encode("utf-8")) > 180:
        stem = stem[:-1]
    return stem.rstrip(" .") + ".docx"


def _read(path):
    with open(path, "rb") as source:
        return source.read()


def _layout_inspection(document_bytes, profile, stats):
    """Inspect limited DOCX settings, never document text or rendered pages.

    The returned codes and statuses are fixed strings and contain no document
    content.  A pass applies only to the named setting, not the entire paper.
    """
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
    from docx.oxml.ns import qn
    from docx.shared import Cm, Inches, Pt

    doc = Document(BytesIO(document_bytes))
    checks = []

    def add(code, status):
        checks.append({"id": code, "status": status})

    def near(actual, expected):
        # DOCX section dimensions are quantized to twips.
        return actual is not None and abs(int(actual) - int(expected)) <= 635

    sections = list(doc.sections)
    width, height = ((Cm(21), Cm(29.7)) if profile["paper_size"] == "A4"
                     else (Inches(8.5), Inches(11)))
    add("paper_size", "pass" if sections and all(
        near(section.page_width, width) and near(section.page_height, height)
        for section in sections) else "warn")
    margin = Cm(profile["margin_cm"])
    add("margins", "pass" if sections and all(
        near(value, margin) for section in sections for value in
        (section.top_margin, section.bottom_margin, section.left_margin, section.right_margin))
        else "warn")

    # This is the Normal style alone; run overrides, tables and other styles
    # are deliberately not asserted to match the requested font.
    normal = doc.styles["Normal"]
    font_expected = profile["latin_font_name"] if profile["typography"] == "chinese" else profile["font_name"]
    font_matches = normal.font.name == font_expected and near(normal.font.size, Pt(profile["font_size"]))
    fonts = normal.element.get_or_add_rPr().find(qn("w:rFonts"))
    font_matches = (font_matches and fonts is not None and
                    all(fonts.get(qn("w:" + key)) == font_expected for key in ("ascii", "hAnsi", "cs")) and
                    fonts.get(qn("w:eastAsia")) == profile["font_name"] and
                    all(fonts.get(qn("w:" + key)) is None for key in
                        ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "csTheme", "cstheme")))
    add("default_font", "pass" if font_matches else "warn")

    # Inspect only explicit spacing on nonempty top-level paragraphs. A run
    # can still render differently due to fonts, style overrides or layout.
    paragraphs = [p for p in doc.paragraphs if p.text.strip()]
    spacing = Pt(profile["line_spacing_pt"]) if profile["line_spacing_pt"] else profile["line_spacing"]
    def spacing_matches(paragraph):
        actual = paragraph.paragraph_format.line_spacing
        if actual is None:
            return False
        if profile["line_spacing_pt"]:
            return (paragraph.paragraph_format.line_spacing_rule == WD_LINE_SPACING.EXACTLY and
                    not isinstance(actual, float) and near(actual, spacing))
        return (paragraph.paragraph_format.line_spacing_rule in
                (WD_LINE_SPACING.SINGLE, WD_LINE_SPACING.ONE_POINT_FIVE,
                 WD_LINE_SPACING.DOUBLE, WD_LINE_SPACING.MULTIPLE) and
                isinstance(actual, float) and abs(actual - spacing) <= 1 / 480 + 1e-9)
    add("paragraph_spacing", "unchecked" if not paragraphs else
        "pass" if all(spacing_matches(p) for p in paragraphs) else "warn")

    def page_field(paragraph):
        def is_page(instruction):
            # A property named PAGE (e.g. DOCPROPERTY PAGE) is not a PAGE field.
            return bool(instruction and re.match(r"^\s*PAGE(?:\s|\\|$)", instruction, flags=re.IGNORECASE))

        found = False
        in_field = False
        after_separator = False
        instruction = []
        for el in paragraph._p.iter():
            if el.tag == qn("w:fldSimple"):
                if in_field:
                    return False  # Nested fields are outside this inspection.
                if is_page(el.get(qn("w:instr"))) and el.find(qn("w:r")) is not None:
                    found = True
            elif el.tag == qn("w:fldChar"):
                field_type = el.get(qn("w:fldCharType"))
                if field_type == "begin" and not in_field:
                    in_field, after_separator, instruction = True, False, []
                elif field_type == "separate" and in_field and not after_separator:
                    after_separator = True
                elif field_type == "end" and in_field:
                    found = found or is_page("".join(instruction))
                    in_field = False
                else:
                    return False
            elif el.tag == qn("w:instrText") and in_field and not after_separator:
                instruction.append(el.text or "")
        return found and not in_field

    def unsupported_story_fields(story):
        # Fields inside tables, text boxes and other wrappers are not inspected
        # by story.paragraphs. Never claim their page-number configuration passed.
        for el in story._element.iter():
            if el.tag not in (qn("w:fldSimple"), qn("w:fldChar"), qn("w:instrText")):
                continue
            parent = el.getparent()
            while parent is not None and parent.tag != qn("w:p"):
                parent = parent.getparent()
            if parent is None or parent.getparent() is not story._element:
                return True
        return False

    hidden_cover = profile["title_page"] and not profile["show_cover_page_number"]
    page_ok = bool(sections)
    for index, section in enumerate(sections):
        target_header = profile["page_number_position"] == "top_right"
        expected_alignment = (WD_ALIGN_PARAGRAPH.CENTER if profile["page_number_position"] == "bottom_center"
                              else WD_ALIGN_PARAGRAPH.RIGHT)
        target = section.header if target_header else section.footer
        other = section.footer if target_header else section.header
        if unsupported_story_fields(target) or unsupported_story_fields(other):
            page_ok = False
        expected = profile["header"] != "none" and not (hidden_cover and index == 0)
        target_fields = [p for p in target.paragraphs if page_field(p)]
        other_fields = [p for p in other.paragraphs if page_field(p)]
        if expected:
            page_ok = page_ok and bool(target_fields) and all(p.alignment == expected_alignment for p in target_fields) and not other_fields
        else:
            page_ok = page_ok and not target_fields and not other_fields
        # Different first/even-page stories require separate rendering checks.
        if section.different_first_page_header_footer or doc.settings.odd_and_even_pages_header_footer:
            page_ok = False
    add("page_number", "pass" if page_ok else "warn")

    add("preserved_content", "warn" if stats.get("preserved_paragraphs", 0) else "unchecked")
    has_objects = bool(doc.tables or doc.inline_shapes or stats.get("retained_images", 0) or stats.get("retained_tables", 0))
    add("images_tables", "warn" if has_objects else "unchecked")
    for code in ("headings", "references", "visual_layout"):
        add(code, "unchecked")
    return {"version": 1, "checks": checks}


def _safe_layout_inspection(document, profile, stats):
    """A failed inspection must not prevent downloading the generated DOCX."""
    try:
        return _layout_inspection(document, profile, stats)
    except Exception:  # noqa: BLE001 - report unknown without exposing content
        return {"version": 1, "checks": [{"id": "inspection_unavailable", "status": "unchecked"}]}


def _generate(request, workdir):
    kind = request["kind"]
    if request.get("format_id") == "icml":
        return _generate_icml(request, workdir)
    fields = _fields(request)
    layout, profile = _layout(request)
    override = fields["last_name_override"]
    filename = _safe_filename(generate_filename(fields["name"], override, **layout))
    output_path = os.path.join(workdir, "output.docx")
    arguments = dict(fields)
    arguments["date_str"] = arguments.pop("date")
    arguments.update(layout)

    stats = {}
    if kind == "blank":
        create_blank_template(output_path, **arguments)
    else:
        input_path, extension = _input_path(request, workdir)
        if extension not in SUPPORTED_EXTS:
            raise RequestError("unsupported")
        _check_limits(input_path)
        if extension == ".docx":
            _check_docx(input_path)
        stats = convert_draft_to_mla(
            input_path,
            output_path,
            **arguments,
            txt_paragraph_mode=request.get("txt_mode", "blank_line"),
            enable_heading_detection=request.get("heading_detect", False),
            enable_block_quote=request.get("block_quote", False),
            markdown_emphasis=request.get("markdown", True),
            strip_existing_heading=request.get("strip_heading", True),
            preserve_paragraphs=request.get("preserve_paragraphs", []),
            source_fingerprint=request.get("source_fingerprint") or None,
        )

    if not os.path.isfile(output_path):
        raise RequestError("failed", "The formatter did not create a document.")
    document = _read(output_path)
    metadata = {
        "ok": True,
        "kind": kind,
        "blank": kind == "blank",
        "name": filename,
        "mime": DOCX_MIME,
        "bytes": len(document),
        "stats": stats,
        "format_id": profile["format_id"],
        "format_label": profile["label"],
        "layout_check": _safe_layout_inspection(document, profile, stats),
    }
    return _metadata(metadata), document


def _generate_icml(request, workdir):
    """Build a local LaTeX starter using the verified official style archive."""
    from icml_latex import make_icml_source

    title = request.get("title", "").strip()
    if not title:
        raise RequestError("missing_fields")
    path = None
    if request["kind"] != "blank":
        path, extension = _input_path(request, workdir)
        if extension not in SUPPORTED_EXTS:
            raise RequestError("unsupported")
        _check_limits(path)
        if extension == ".docx":
            _check_docx(path)
    data, warnings, count = make_icml_source(title, path, txt_mode=request.get("txt_mode", "blank_line"))
    return _metadata({
        "ok": True, "kind": request["kind"], "blank": request["kind"] == "blank",
        "name": "FormCapy-ICML-2026.zip", "mime": "application/zip", "bytes": len(data),
        "format_id": "icml", "format_label": "ICML 2026 LaTeX",
        "stats": {"body": count, "works_cited": 0}, "latex_warnings": list(warnings),
        "icml_style_included": True,
    }), data


def _bibliography(request):
    """A standalone CSL list: no draft, paper identity or formatter sorting."""
    bibliography = request.get("bibliography")
    document = render_bibliography_docx(bibliography)
    style = bibliography["style"]
    return _metadata({
        "ok": True,
        "kind": "bibliography",
        "blank": False,
        "name": f"FormCapy-{style.upper()}-References.docx",
        "mime": DOCX_MIME,
        "bytes": len(document),
        "stats": {"body": 0, "works_cited": len(bibliography["entries"])},
        "format_id": style,
        "format_label": f"{style.upper()} independent bibliography",
    }), document


def _file_convert(request, workdir):
    """Reconstruct an editable Word file from PDF entirely inside MEMFS.

    The browser's separate local office engine handles Word format conversions;
    keeping this adapter PDF-only makes a native subprocess impossible here.
    """
    from document_conversion import ConversionError, convert_document

    path, extension = _input_path(request, workdir)
    if extension != ".pdf" or request.get("target_format") != "docx":
        raise RequestError("unsupported")
    _check_limits(path)
    try:
        result = convert_document(_read(path), request["file_name"], "docx")
    except ConversionError as error:
        raise RequestError(error.code, error.detail) from error
    return _metadata({
        "ok": True,
        "kind": "file_convert",
        "name": result.filename,
        "mime": result.mime_type,
        "bytes": len(result.data),
        "conversion_warnings": list(result.warnings),
    }), result.data


def _file_check(request, workdir):
    """Check containers and external-resource links before starting Office."""
    from document_conversion import ConversionError, validate_document

    path, extension = _input_path(request, workdir)
    if extension not in (".docx", ".doc"):
        raise RequestError("unsupported")
    _check_limits(path)
    try:
        validate_document(_read(path), extension[1:])
    except ConversionError as error:
        raise RequestError(error.code, error.detail) from error
    return _metadata({"ok": True, "kind": "file_check"})


def _paragraphs(request, workdir):
    input_path, extension = _input_path(request, workdir)
    if extension != ".docx":
        raise RequestError("preserve_docx_only")
    _check_limits(input_path)
    _check_docx(input_path)
    result = inspect_draft_paragraphs(input_path)
    if not isinstance(result, dict):
        raise RequestError("bad_doc")
    return _metadata({
        "ok": True,
        "kind": "paragraphs",
        "paragraphs": result.get("paragraphs", []),
        "source_fingerprint": result.get("source_fingerprint", ""),
    })
