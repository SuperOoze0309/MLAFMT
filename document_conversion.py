"""Local PDF / DOCX / Word 97-2003 conversion, without a conversion service.

PDF-to-DOCX is an explicitly text-only reconstruction using optional pypdf.
It runs in memory, including inside Pyodide. Native Word conversions require
an installed LibreOffice and use its real binary DOC export filter. No format
is implemented by changing a filename extension.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import importlib.util
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import sys
import tempfile
import time
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

FORMATS = ("pdf", "docx", "doc")
MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
}
MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_OUTPUT_SIZE = 80 * 1024 * 1024
MAX_DOCX_ENTRIES = 2000
MAX_PDF_PAGES = 200
MAX_PDF_PAGE_CONTENT = 4 * 1024 * 1024
MAX_PDF_TEXT = 2_000_000
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_EXPORT_FILTERS = {
    "pdf": "pdf:writer_pdf_Export",
    "docx": "docx:Office Open XML Text",
    "doc": "doc:MS Word 97",
}
_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


class ConversionError(ValueError):
    """A stable user-facing error code; detail is diagnostic, never executable."""

    def __init__(self, code: str, detail: str = ""):
        self.code = code
        self.detail = detail
        super().__init__(code)


@dataclass(frozen=True)
class ConversionResult:
    data: bytes
    filename: str
    mime_type: str
    warnings: tuple[str, ...]
    source_format: str
    target_format: str
    engine: str


def _cancelled(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise ConversionError("cancelled")


def _binary(data, *, output=False):
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise ConversionError("invalid_file")
    if not data:
        raise ConversionError("empty_file")
    if len(data) > (MAX_OUTPUT_SIZE if output else MAX_FILE_SIZE):
        raise ConversionError("too_large")
    return bytes(data)


def _doc_stream_names(data):
    """Read bounded CFB directory names, without executing embedded OLE objects."""
    if len(data) < 512 or data[:8] != OLE_SIGNATURE:
        raise ConversionError("bad_doc")
    try:
        major, byte_order, shift = struct.unpack_from("<HHH", data, 26)
        if byte_order != 0xFFFE or (major, shift) not in ((3, 9), (4, 12)):
            raise ValueError("unsupported CFB header")
        sector_size = 1 << shift
        count = len(data) // sector_size - 1
        if count < 1:
            raise ValueError("no CFB sectors")

        def sector(index):
            if not 0 <= index < count:
                raise ValueError("invalid CFB sector")
            start = (index + 1) * sector_size
            return data[start:start + sector_size]

        fat_count = struct.unpack_from("<I", data, 44)[0]
        if not 0 < fat_count <= count:
            raise ValueError("invalid CFB FAT")
        difat = list(struct.unpack_from("<109I", data, 76))
        next_difat, difat_count = struct.unpack_from("<II", data, 68)
        visited = set()
        for _ in range(min(difat_count, count)):
            if next_difat in visited:
                raise ValueError("CFB DIFAT cycle")
            visited.add(next_difat)
            values = struct.unpack(f"<{sector_size // 4}I", sector(next_difat))
            difat.extend(values[:-1])
            next_difat = values[-1]
        fat_indices = [index for index in difat if index < 0xFFFFFFFA][:fat_count]
        if len(fat_indices) != fat_count:
            raise ValueError("truncated CFB FAT")
        fat = []
        for index in fat_indices:
            fat.extend(struct.unpack(f"<{sector_size // 4}I", sector(index)))
        directory = struct.unpack_from("<I", data, 48)[0]
        visited = set()
        names = set()
        while directory != 0xFFFFFFFE:
            if directory in visited or len(visited) > 1024:
                raise ValueError("CFB directory cycle or limit")
            visited.add(directory)
            content = sector(directory)
            for offset in range(0, sector_size, 128):
                length = struct.unpack_from("<H", content, offset + 64)[0]
                kind = content[offset + 66]
                if kind == 2 and 2 <= length <= 64 and length % 2 == 0:
                    names.add(content[offset:offset + length - 2].decode("utf-16le"))
            directory = fat[directory]
        return names
    except (ValueError, IndexError, struct.error, UnicodeError) as error:
        raise ConversionError("bad_doc") from error


def _validate_docx(data):
    try:
        with ZipFile(BytesIO(data)) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if len(entries) > MAX_DOCX_ENTRIES or sum(e.file_size for e in entries) > MAX_OUTPUT_SIZE:
                raise ConversionError("too_large")
            if len(names) != len(set(names)):
                raise ConversionError("bad_doc")
            for entry in entries:
                path = PurePosixPath(entry.filename)
                if (path.is_absolute() or ".." in path.parts or "\\" in entry.filename or
                        entry.flag_bits & 1 or entry.file_size > MAX_FILE_SIZE):
                    raise ConversionError("bad_doc")
                if "vbaproject" in entry.filename.lower():
                    raise ConversionError("unsupported_document")
            if not {"[Content_Types].xml", "word/document.xml"}.issubset(names):
                raise ConversionError("bad_doc")
            if archive.testzip() is not None:
                raise ConversionError("bad_doc")
            for name in names:
                if name.endswith(".rels"):
                    root = ElementTree.fromstring(archive.read(name))
                    for relation in root.findall(_REL_NS + "Relationship"):
                        if (relation.get("TargetMode", "").lower() == "external" and
                                not relation.get("Type", "").endswith("/hyperlink")):
                            # Linked images/templates must not cause a local office engine
                            # to fetch a document resource from a remote origin.
                            raise ConversionError("external_content")
            ElementTree.fromstring(archive.read("word/document.xml"))
    except ConversionError:
        raise
    except (BadZipFile, OSError, ValueError, KeyError, ElementTree.ParseError) as error:
        raise ConversionError("bad_doc") from error


def validate_document(data, source_format, *, output=False):
    """Validate declared format and bounds; returns an immutable bytes copy."""
    data = _binary(data, output=output)
    if source_format not in FORMATS:
        raise ConversionError("unsupported")
    if source_format == "pdf":
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
            raise ConversionError("bad_pdf")
    elif source_format == "docx":
        _validate_docx(data)
    else:
        names = _doc_stream_names(data)
        if "EncryptedPackage" in names:
            raise ConversionError("encrypted_document")
        if "WordDocument" not in names or not {"0Table", "1Table"}.intersection(names):
            raise ConversionError("bad_doc")
    return data


def _pypdf_available():
    try:
        return importlib.util.find_spec("pypdf") is not None
    except (ImportError, ValueError):
        return False


def pdf_to_docx(data, *, cancel_event=None):
    """Return (DOCX bytes, warning codes) from PDF text. No OCR or layout claim.

    This path uses no filesystem, subprocess, HTTP client or platform-specific
    dependency, so it is also suitable for the browser's existing Pyodide worker.
    """
    _cancelled(cancel_event)
    data = validate_document(data, "pdf")
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise ConversionError("pdf_engine_missing") from error
    from docx import Document
    from docx.shared import Inches, Pt

    try:
        reader = PdfReader(BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ConversionError("encrypted_document")
        page_count = len(reader.pages)
        if not 1 <= page_count <= MAX_PDF_PAGES:
            raise ConversionError("pdf_page_limit")
        document = Document()
        section = document.sections[0]
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.top_margin = section.bottom_margin = Inches(0.75)
        section.left_margin = section.right_margin = Inches(0.75)
        style = document.styles["Normal"]
        style.font.name = "Arial"
        style.font.size = Pt(11)
        style.paragraph_format.space_after = Pt(4)
        warnings = ["pdf_text_reconstruction"]
        total_chars = 0
        blank_pages = 0
        for index, page in enumerate(reader.pages):
            _cancelled(cancel_event)
            contents = page.get_contents()
            if contents is not None and len(contents.get_data()) > MAX_PDF_PAGE_CONTENT:
                raise ConversionError("pdf_content_limit")
            text = page.extract_text() or ""
            text = text.replace("\r\n", "\n").replace("\r", "\n")
            text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
            total_chars += len(text)
            if total_chars > MAX_PDF_TEXT:
                raise ConversionError("pdf_content_limit")
            if index:
                document.add_page_break()
            if not text.strip():
                blank_pages += 1
            else:
                for line in text.split("\n"):
                    document.add_paragraph(line)
            # Do not decode images (which would introduce Pillow and another
            # decompression boundary). We disclose their omission explicitly.
            resources = page.get("/Resources")
            if resources:
                resources = resources.get_object()
                if resources.get("/XObject") and "pdf_images_omitted" not in warnings:
                    warnings.append("pdf_images_omitted")
        _cancelled(cancel_event)
        if blank_pages == page_count:
            raise ConversionError("pdf_needs_ocr")
        if blank_pages:
            warnings.append("pdf_blank_pages")
        buffer = BytesIO()
        document.save(buffer)
        result = buffer.getvalue()
        validate_document(result, "docx", output=True)
        return result, tuple(warnings)
    except ConversionError:
        raise
    except Exception as error:
        # pypdf exposes several parser exceptions and legacy malformed documents
        # can also surface built-in errors. Do not leak draft content in detail.
        raise ConversionError("bad_pdf") from error


def find_soffice(explicit=None):
    """Return a local executable path, never a shell command or remote URL."""
    configured = explicit or os.environ.get("FORMCAPY_SOFFICE")
    if configured:
        candidate = Path(configured).expanduser()
        return str(candidate.resolve()) if candidate.is_file() else None
    candidates = [shutil.which("soffice"), shutil.which("libreoffice")]
    if sys.platform == "win32":
        for root in (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)")):
            if root:
                candidates.append(str(Path(root) / "LibreOffice" / "program" / "soffice.exe"))
    elif sys.platform == "darwin":
        candidates.extend(("/Applications/LibreOffice.app/Contents/MacOS/soffice",
                           str(Path.home() / "Applications/LibreOffice.app/Contents/MacOS/soffice")))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    return None


def conversion_capabilities(soffice=None):
    """Describe availability without starting an engine or accessing a draft."""
    office = bool(find_soffice(soffice))
    pdf = _pypdf_available()
    routes = []
    for source in FORMATS:
        for target in FORMATS:
            if source == target:
                continue
            required = []
            if source == "pdf":
                required.append("pypdf")
            if source != "pdf" or target == "doc":
                required.append("libreoffice")
            routes.append({"source": source, "target": target,
                           "available": all({"pypdf": pdf, "libreoffice": office}[r] for r in required),
                           "requires": required})
    return {"formats": list(FORMATS), "local": True, "libreoffice": office,
            "pypdf": pdf, "routes": routes}


def _temporary_root(requested):
    if requested is not None:
        root = Path(requested)
    elif os.environ.get("FORMCAPY_TEMP_DIR"):
        root = Path(os.environ["FORMCAPY_TEMP_DIR"])
    elif Path("H:/DSHworkspace").is_dir():
        root = Path("H:/DSHworkspace/Codex/MLAFMT/build/conversion-tmp")
    else:
        root = Path(tempfile.gettempdir()) / "formcapy-conversion"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _stop_process(process):
    """Stop the isolated office process and its child, never another user session."""
    import subprocess
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        try:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                           check=False)
        except (OSError, subprocess.TimeoutExpired):
            process.kill()
    else:
        import signal
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            process.kill()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def _office_convert(data, source, target, executable, directory, deadline, cancel_event):
    import subprocess
    source_path = directory / ("document." + source)
    source_path.write_bytes(data)
    output_dir = directory / "output"
    output_dir.mkdir()
    profile = directory / "profile"
    profile.mkdir()
    # Separate user profile prevents reusing or interrupting an open office
    # session. Macros are disabled for this job; linked DOCX resources have
    # already been rejected before invoking LibreOffice.
    (profile / "user").mkdir()
    (profile / "user/registrymodifications.xcu").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
        '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
        '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>'
        '<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>'
        '</item></oor:items>', encoding="utf-8")
    command = [executable, "-env:UserInstallation=" + profile.as_uri(),
               "--headless", "--nologo", "--nodefault", "--nolockcheck",
               "--norestore", "--nofirststartwizard", "--convert-to", _EXPORT_FILTERS[target],
               "--outdir", str(output_dir), str(source_path)]
    process = None
    try:
        options = {"cwd": str(directory), "stdin": subprocess.DEVNULL,
                   "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if sys.platform == "win32":
            options["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        else:
            options["start_new_session"] = True
        process = subprocess.Popen(command, **options)
        while process.poll() is None:
            _cancelled(cancel_event)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ConversionError("conversion_timeout")
            try:
                process.wait(timeout=min(0.15, remaining))
            except subprocess.TimeoutExpired:
                pass
        _cancelled(cancel_event)
        output = output_dir / ("document." + target)
        if process.returncode != 0 or not output.is_file():
            raise ConversionError("conversion_failed")
        if output.stat().st_size > MAX_OUTPUT_SIZE:
            raise ConversionError("too_large")
        result = output.read_bytes()
        validate_document(result, target, output=True)
        return result
    except ConversionError:
        raise
    except OSError as error:
        raise ConversionError("conversion_failed") from error
    finally:
        if process is not None and process.poll() is None:
            _stop_process(process)


def convert_document(data, filename, target_format, *, timeout=120, soffice=None,
                     temp_root=None, cancel_event=None):
    """Convert one local document. Source bytes and files are never overwritten."""
    _cancelled(cancel_event)
    if (not isinstance(filename, str) or not filename or len(filename) > 1000 or
            not isinstance(target_format, str) or target_format not in FORMATS):
        raise ConversionError("invalid_options")
    if (isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or
            not math.isfinite(timeout) or not 0 < timeout <= 600):
        raise ConversionError("invalid_options")
    basename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    source = Path(basename).suffix.lower().lstrip(".")
    if source not in FORMATS:
        raise ConversionError("unsupported")
    if source == target_format:
        raise ConversionError("same_format")
    data = validate_document(data, source)
    stem = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]', "_", Path(basename).stem).strip(" .")[:160]
    output_name = (stem or "Converted_document") + "." + target_format
    warnings = ()
    deadline = time.monotonic() + timeout
    if source == "pdf":
        data, warnings = pdf_to_docx(data, cancel_event=cancel_event)
        if target_format == "docx":
            return ConversionResult(data, output_name, MIME_TYPES[target_format], warnings,
                                    source, target_format, "pypdf")
        intermediate = "docx"
    else:
        intermediate = source
    executable = find_soffice(soffice)
    if not executable:
        raise ConversionError("office_engine_missing")
    _cancelled(cancel_event)
    if time.monotonic() >= deadline:
        raise ConversionError("conversion_timeout")
    try:
        root = _temporary_root(temp_root)
        with tempfile.TemporaryDirectory(prefix="job-", dir=str(root)) as name:
            data = _office_convert(data, intermediate, target_format, executable,
                                   Path(name), deadline, cancel_event)
    except ConversionError:
        raise
    except OSError as error:
        raise ConversionError("conversion_io") from error
    warnings += ("office_layout_review",)
    if target_format == "doc":
        warnings += ("legacy_doc_limits",)
    return ConversionResult(data, output_name, MIME_TYPES[target_format], warnings,
                            source, target_format,
                            "pypdf+libreoffice" if source == "pdf" else "libreoffice")
