"""
mla_web.py  (v2.0)
Local web UI for MLAFMT -> http://127.0.0.1:8600
Works on Windows / macOS / Linux / Android (Termux or bundled in the APK).

    python mla_web.py            # local only (safe default)
    python mla_web.py --lan      # also reachable from other devices on your Wi-Fi
"""

import io
import os
import sys
import tempfile
from urllib.parse import quote

from flask import Flask, jsonify, render_template, request, send_file

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
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024   # 20 MB upload cap
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _form(src, key, default=""):
    v = src.get(key, default)
    return v.strip() if isinstance(v, str) else v


def _flag(src, key, default):
    v = src.get(key)
    if v is None:
        return default
    return str(v).lower() in ("1", "true", "on", "yes")


def _docx_response(buf, filename, stats=None):
    buf.seek(0)
    resp = send_file(buf, as_attachment=True, download_name=filename, mimetype=DOCX_MIME)
    # explicit UTF-8 filename so non-ASCII surnames survive
    resp.headers["Content-Disposition"] = (
        f"attachment; filename=\"{filename if filename.isascii() else 'MLA_Essay.docx'}\"; "
        f"filename*=UTF-8''{quote(filename)}")
    resp.headers["X-Filename"] = quote(filename)
    if stats:
        for k, v in stats.items():
            resp.headers[f"X-Stat-{k.replace('_', '-')}"] = str(v)
    resp.headers["Access-Control-Expose-Headers"] = "X-Filename, X-Stat-body, X-Stat-works-cited, X-Stat-removed-heading-lines"
    return resp


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "too_large"}), 413


@app.route("/")
def index():
    return render_template("index.html", version=__version__, today=today_mla())


@app.route("/api/summary", methods=["POST"])
def api_summary():
    data = request.get_json(silent=True) or {}
    return jsonify(format_summary(data.get("name", ""), data.get("last_name_override") or None))


@app.route("/api/blank", methods=["POST"])
def api_blank():
    data = request.get_json(silent=True) or {}
    name, title = _form(data, "name"), _form(data, "title")
    if validate_inputs(name, title):
        return jsonify({"error": "missing_fields"}), 400
    override = _form(data, "last_name_override") or None
    buf = io.BytesIO()
    try:
        create_blank_template(buf, name=name, instructor=_form(data, "instructor"),
                              course=_form(data, "course"), date_str=_form(data, "date"),
                              title=title, last_name_override=override)
    except Exception as e:  # noqa
        return jsonify({"error": "failed", "detail": str(e)}), 500
    return _docx_response(buf, generate_filename(name, override))


@app.route("/api/convert", methods=["POST"])
def api_convert():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "no_file"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in SUPPORTED_EXTS:
        return jsonify({"error": "unsupported"}), 400

    form = request.form
    name, title = _form(form, "name"), _form(form, "title")
    if validate_inputs(name, title):
        return jsonify({"error": "missing_fields"}), 400
    override = _form(form, "last_name_override") or None

    fd, in_path = tempfile.mkstemp(prefix="mlafmt_", suffix=ext)
    os.close(fd)
    buf = io.BytesIO()
    try:
        f.save(in_path)
        stats = convert_draft_to_mla(
            in_path, buf, name=name, instructor=_form(form, "instructor"),
            course=_form(form, "course"), date_str=_form(form, "date"), title=title,
            last_name_override=override,
            txt_paragraph_mode=form.get("txt_mode", "blank_line"),
            enable_heading_detection=_flag(form, "heading_detect", False),
            enable_block_quote=_flag(form, "block_quote", False),
            markdown_emphasis=_flag(form, "markdown", True),
            strip_existing_heading=_flag(form, "strip_heading", True),
        )
    except Exception as e:  # noqa
        msg = str(e).lower()
        code = "bad_doc" if ("package not found" in msg or "zip" in msg) else "failed"
        return jsonify({"error": code, "detail": str(e)}), 500
    finally:
        try:
            os.remove(in_path)
        except OSError:
            pass
    return _docx_response(buf, generate_filename(name, override), stats)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    host = "0.0.0.0" if "--lan" in argv else "127.0.0.1"
    port = 8600
    print(f"\n  MLAFMT Web v{__version__}  ->  http://127.0.0.1:{port}\n")
    if "--no-browser" not in argv:
        import threading
        import webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()
