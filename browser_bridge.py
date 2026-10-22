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
KINDS = ("blank", "convert", "paragraphs", "bibliography")
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
    if extension not in SUPPORTED_EXTS:
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


def _generate(request, workdir):
    kind = request["kind"]
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
    }
    return _metadata(metadata), document


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
