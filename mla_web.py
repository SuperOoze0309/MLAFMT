"""
mla_web.py  (v2.4)
Local web UI for MLAFMT -> http://127.0.0.1:8600
Works on Windows / macOS / Linux. The Android APK embeds the formatter separately.

    python mla_web.py            # local only (safe default)
    python mla_web.py --lan      # also reachable from other devices on your Wi-Fi
"""

import argparse
import io
import json
import os
import sys
import socket
import tempfile
from urllib.parse import quote
from zipfile import BadZipFile

from docx.opc.exceptions import PackageNotFoundError
from flask import Flask, jsonify, render_template, request, send_file
from lxml.etree import XMLSyntaxError

from format_profiles import resolve_profile

from mla_formatter import (
    SUPPORTED_EXTS,
    __version__,
    convert_draft_to_mla,
    create_blank_template,
    format_summary,
    generate_filename,
    today_mla,
    validate_inputs,
)

BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
app = Flask(__name__, template_folder=os.path.join(BASE_DIR, "templates"))
MAX_FILE_SIZE = 20 * 1024 * 1024
# Leave room for multipart boundaries and form fields; validate the file itself below.
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE + 1024 * 1024
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_FIELDS = ("name", "title", "instructor", "course", "date", "last_name_override", "affiliation", "format_id")


def _json_fields():
    """Reject malformed/non-object JSON and unexpected field types as client errors."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, (jsonify({"error": "invalid_json"}), 400)
    if any(data.get(key) is not None and (not isinstance(data[key], str) or len(data[key]) > 5000)
           for key in TEXT_FIELDS):
        return None, (jsonify({"error": "invalid_fields"}), 400)
    return data, None


def _form(src, key, default=""):
    v = src.get(key, default)
    return v.strip() if isinstance(v, str) else default


def _flag(src, key, default):
    v = src.get(key)
    if v is None:
        return default
    return str(v).lower() in ("1", "true", "on", "yes")


def _layout_options(src, *, multipart=False):
    format_id = _form(src, "format_id", "mla")
    custom = src.get("custom_profile")
    if format_id == "custom" and multipart and custom is not None:
        if len(custom) > 10000:
            raise ValueError("The course template is too large.")
        try:
            custom = json.loads(custom)
        except (ValueError, TypeError) as error:
            raise ValueError("The course template must be valid JSON.") from error
    profile = resolve_profile(format_id, custom)
    options = {"format_id": format_id, "custom_profile": custom if format_id == "custom" else None}
    return options, profile


def _docx_response(buf, filename, stats=None, profile=None):
    buf.seek(0)
    resp = send_file(buf, as_attachment=True, download_name=filename, mimetype=DOCX_MIME)
    # explicit UTF-8 filename so non-ASCII surnames survive
    resp.headers["Content-Disposition"] = (
        f"attachment; filename=\"{filename if filename.isascii() else 'Formatted_Paper.docx'}\"; "
        f"filename*=UTF-8''{quote(filename)}")
    resp.headers["X-Filename"] = quote(filename)
    resp.headers["Cache-Control"] = "no-store, max-age=0"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if profile:
        resp.headers["X-Format-Id"] = profile["format_id"]
        resp.headers["X-Format-Label"] = quote(profile["label"])
    if stats:
        for k, v in stats.items():
            resp.headers[f"X-Stat-{k.replace('_', '-')}"] = str(v)
    resp.headers["Access-Control-Expose-Headers"] = (
        "X-Filename, X-Format-Id, X-Format-Label, X-Stat-body, X-Stat-works-cited, "
        "X-Stat-removed-heading-lines, X-Stat-omitted-elements, X-Stat-unsupported-headings")
    return resp


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "too_large"}), 413


@app.route("/")
def index():
    return render_template("index.html", version=__version__, today=today_mla())


@app.route("/api/summary", methods=["POST"])
def api_summary():
    data, error = _json_fields()
    if error is not None:
        return error
    try:
        layout, _profile = _layout_options(data)
    except ValueError as error:
        return jsonify({"error": "invalid_options", "detail": str(error)}), 400
    return jsonify(format_summary(_form(data, "name"), _form(data, "last_name_override") or None, **layout))


@app.route("/api/blank", methods=["POST"])
def api_blank():
    data, error = _json_fields()
    if error is not None:
        return error
    name, title = _form(data, "name"), _form(data, "title")
    if validate_inputs(name, title):
        return jsonify({"error": "missing_fields"}), 400
    override = _form(data, "last_name_override") or None
    try:
        layout, profile = _layout_options(data)
    except ValueError as error:
        return jsonify({"error": "invalid_options", "detail": str(error)}), 400
    buf = io.BytesIO()
    try:
        create_blank_template(buf, name=name, instructor=_form(data, "instructor"),
                              course=_form(data, "course"), date_str=_form(data, "date"),
                              title=title, last_name_override=override,
                              affiliation=_form(data, "affiliation"), **layout)
    except Exception as e:  # noqa
        return jsonify({"error": "failed", "detail": str(e)}), 500
    return _docx_response(buf, generate_filename(name, override, **layout), profile=profile)


@app.route("/api/convert", methods=["POST"])
def api_convert():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "no_file"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in SUPPORTED_EXTS:
        return jsonify({"error": "unsupported"}), 400

    form = request.form
    if any(len(form.get(key, "")) > 5000 for key in TEXT_FIELDS):
        return jsonify({"error": "invalid_fields"}), 400
    if form.get("txt_mode", "blank_line") not in ("blank_line", "line_by_line"):
        return jsonify({"error": "invalid_options"}), 400
    name, title = _form(form, "name"), _form(form, "title")
    if validate_inputs(name, title):
        return jsonify({"error": "missing_fields"}), 400
    override = _form(form, "last_name_override") or None
    try:
        layout, profile = _layout_options(form, multipart=True)
    except ValueError as error:
        return jsonify({"error": "invalid_options", "detail": str(error)}), 400

    fd, in_path = tempfile.mkstemp(prefix="mlafmt_", suffix=ext)
    os.close(fd)
    buf = io.BytesIO()
    try:
        f.save(in_path)
        size = os.path.getsize(in_path)
        if size > MAX_FILE_SIZE:
            return jsonify({"error": "too_large"}), 413
        if not size:
            return jsonify({"error": "empty_file"}), 400
        stats = convert_draft_to_mla(
            in_path, buf, name=name, instructor=_form(form, "instructor"),
            course=_form(form, "course"), date_str=_form(form, "date"), title=title,
            last_name_override=override,
            txt_paragraph_mode=form.get("txt_mode", "blank_line"),
            enable_heading_detection=_flag(form, "heading_detect", False),
            enable_block_quote=_flag(form, "block_quote", False),
            markdown_emphasis=_flag(form, "markdown", True),
            strip_existing_heading=_flag(form, "strip_heading", True),
            affiliation=_form(form, "affiliation"), **layout,
        )
    except Exception as e:  # noqa
        invalid_docx = ext == ".docx" and isinstance(
            e, (BadZipFile, PackageNotFoundError, KeyError, ValueError, XMLSyntaxError))
        code = "bad_doc" if invalid_docx else "failed"
        return jsonify({"error": code, "detail": str(e)}), 400 if code == "bad_doc" else 500
    finally:
        try:
            os.remove(in_path)
        except OSError:
            pass
    return _docx_response(buf, generate_filename(name, override, **layout), stats, profile)


def main(argv=None):
    parser = argparse.ArgumentParser(description="MLAFMT local web preview")
    parser.add_argument("--lan", action="store_true", help="Allow devices on the same network to open this preview")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser automatically")
    parser.add_argument("--port", type=int, default=8600, help="Local preview port (default: 8600)")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    port = args.port
    print(f"\n  MLAFMT Web v{__version__}  ->  http://127.0.0.1:{port}")
    if args.lan:
        try:
            addresses = sorted({item[4][0] for item in socket.getaddrinfo(
                socket.gethostname(), port, family=socket.AF_INET, type=socket.SOCK_STREAM)
                if not item[4][0].startswith(("127.", "169.254."))})
        except OSError:
            addresses = []
        print("  iPhone / iPad (same Wi-Fi):")
        for address in addresses:
            print(f"    http://{address}:{port}")
        if not addresses:
            print(f"    http://<this computer's Wi-Fi IPv4 address>:{port}")
    print()
    if not args.no_browser:
        import threading
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
