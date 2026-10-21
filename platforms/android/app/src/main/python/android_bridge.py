"""Offline Android adapter. It accepts only private native-selected paths.

No Android imports are needed here, so the same adapter can be exercised on a
desktop. Android chooses files, bounds input size, and handles saving/sharing.
"""
import json
import os
import re
import zipfile

from docx.opc.exceptions import PackageNotFoundError
from lxml.etree import XMLSyntaxError

from format_profiles import resolve_profile

from mla_formatter import (
    SUPPORTED_EXTS, convert_draft_to_mla, create_blank_template,
    generate_filename, today_mla, validate_inputs,
    inspect_draft_paragraphs,
)

MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_DOCX_EXPANDED = 80 * 1024 * 1024
TEXT_FIELDS = ("name", "title", "instructor", "course", "date", "last_name_override", "affiliation")
FLAGS = {
    "heading_detect": False, "block_quote": False,
    "markdown": True, "strip_heading": True,
}


def initial_state():
    return json.dumps({"today": today_mla()})


def _check_docx(path):
    """Bound ZIP expansion before python-docx reads every part into memory."""
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if (len(entries) > 2000 or sum(i.file_size for i in entries) > MAX_DOCX_EXPANDED
                or any(i.file_size > 20 * 1024 * 1024 for i in entries)
                or any(i.flag_bits & 1 for i in entries)):
            raise ValueError("DOCX archive exceeds safe processing limits")
        if "[Content_Types].xml" not in archive.namelist():
            raise ValueError("Not a DOCX package")


def paragraphs(input_path):
    try:
        if not input_path or not os.path.isfile(input_path):
            return json.dumps({"error": "no_file"})
        if os.path.splitext(input_path)[1].lower() != ".docx":
            return json.dumps({"error": "preserve_docx_only"})
        if os.path.getsize(input_path) > MAX_FILE_SIZE:
            return json.dumps({"error": "too_large"})
        return json.dumps(inspect_draft_paragraphs(input_path), ensure_ascii=True)
    except Exception:
        return json.dumps({"error": "bad_doc"})


def generate(request_json, input_path, output_directory):
    """Return a small JSON result; documents never cross the JavaScript bridge."""
    output_path = None
    ext = None
    try:
        data = json.loads(request_json)
        if not isinstance(data, dict):
            return json.dumps({"error": "invalid_json"})
        if any(not isinstance(data.get(k, ""), str) or len(data.get(k, "")) > 5000
               for k in TEXT_FIELDS):
            return json.dumps({"error": "invalid_fields"})
        fields = {k: data.get(k, "").strip() for k in TEXT_FIELDS}
        if validate_inputs(fields["name"], fields["title"]):
            return json.dumps({"error": "missing_fields"})
        if data.get("kind") not in ("blank", "convert"):
            return json.dumps({"error": "invalid_options"})
        if data.get("txt_mode", "blank_line") not in ("blank_line", "line_by_line"):
            return json.dumps({"error": "invalid_options"})
        if any(k in data and not isinstance(data[k], bool) for k in FLAGS):
            return json.dumps({"error": "invalid_options"})
        preserve = data.get("preserve_paragraphs", [])
        fingerprint = data.get("source_fingerprint")
        if (not isinstance(preserve, list) or len(preserve) > 10000
                or any(isinstance(value, bool) or not isinstance(value, int) or value < 1 for value in preserve)
                or (fingerprint is not None and (not isinstance(fingerprint, str) or len(fingerprint) > 64))):
            return json.dumps({"error": "invalid_options"})
        format_id = data.get("format_id", "mla")
        custom_profile = data.get("custom_profile")
        try:
            profile = resolve_profile(format_id, custom_profile)
        except ValueError:
            return json.dumps({"error": "invalid_options"})
        layout = {"format_id": format_id, "custom_profile": custom_profile if format_id == "custom" else None}
        override = fields.pop("last_name_override") or None
        filename = generate_filename(fields["name"], override, **layout)
        # Android filesystem component limits apply to long Unicode surnames.
        stem = filename[:-5]
        while len(stem.encode("utf-8")) > 180:
            stem = stem[:-1]
        filename = re.sub(r"[\x00-\x1f]", "_", stem) + ".docx"
        output_path = os.path.join(output_directory, filename)
        os.makedirs(output_directory, exist_ok=True)
        arguments = dict(fields)
        arguments["date_str"] = arguments.pop("date")
        arguments["last_name_override"] = override
        arguments.update(layout)
        stats = {}
        if data["kind"] == "blank":
            create_blank_template(output_path, **arguments)
        else:
            if not input_path or not os.path.isfile(input_path):
                return json.dumps({"error": "no_file"})
            ext = os.path.splitext(input_path)[1].lower()
            if ext not in SUPPORTED_EXTS:
                return json.dumps({"error": "unsupported"})
            size = os.path.getsize(input_path)
            if size > MAX_FILE_SIZE:
                return json.dumps({"error": "too_large"})
            if size == 0:
                return json.dumps({"error": "empty_file"})
            if ext == ".docx":
                _check_docx(input_path)
            stats = convert_draft_to_mla(
                input_path, output_path, **arguments,
                txt_paragraph_mode=data.get("txt_mode", "blank_line"),
                enable_heading_detection=data.get("heading_detect", False),
                enable_block_quote=data.get("block_quote", False),
                markdown_emphasis=data.get("markdown", True),
                strip_existing_heading=data.get("strip_heading", True),
                preserve_paragraphs=preserve, source_fingerprint=fingerprint,
            )
        return json.dumps({"name": filename, "path": output_path, "stats": stats,
                           "blank": data["kind"] == "blank", "format_id": format_id,
                           "format_label": profile["label"]})
    except (json.JSONDecodeError, TypeError):
        return json.dumps({"error": "invalid_json"})
    except Exception as error:
        if output_path and os.path.isfile(output_path):
            os.remove(output_path)
        if isinstance(error, ValueError) and str(error) in ("draft_changed", "preserve_docx_only", "invalid_options", "unsupported_document"):
            return json.dumps({"error": str(error)})
        invalid = ext == ".docx" and isinstance(error, (
            zipfile.BadZipFile, PackageNotFoundError, KeyError, ValueError, XMLSyntaxError))
        return json.dumps({"error": "bad_doc" if invalid else "failed"})
