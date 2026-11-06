"""Local PDF / DOCX / Word 97-2003 conversion, without a conversion service.

PDF-to-DOCX reconstructs text and supported images using optional pypdf.
It runs in memory, including inside Pyodide. Native Word conversions require
an installed LibreOffice and use its real binary DOC export filter. No format
is implemented by changing a filename extension.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import base64
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
import zlib
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
# Bound decoded and generated image data before touching an image stream.
MAX_PDF_IMAGE_PIXELS = 4_000_000
MAX_PDF_IMAGE_DIMENSION = 4096
MAX_PDF_IMAGE_BYTES = 12 * 1024 * 1024
MAX_PDF_IMAGES_TOTAL_BYTES = 32 * 1024 * 1024
MAX_PDF_IMAGES = 100
MAX_PDF_IMAGE_OPERATIONS = 50000
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


def _png_from_pixels(width, height, channels, pixels):
    """Encode already-bounded 8-bit pixels without an optional image library."""
    def chunk(kind, payload):
        return (struct.pack(">I", len(payload)) + kind + payload +
                struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))
    stride = width * channels
    rows = bytearray()
    for i in range(0, len(pixels), stride):
        rows.append(0)
        rows.extend(pixels[i:i + stride])
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8,
                                       0 if channels == 1 else 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


def _pdf_image_bytes(image):
    """Decode a small, deliberately narrow subset; return None for others.

    Never use pypdf's image helper or get_data(): its image decoder may expand
    untrusted data before our own pixel budget can be enforced.
    """
    from docx.image.image import Image
    try:
        width, height = int(image.get('/Width', 0)), int(image.get('/Height', 0))
        if (width <= 0 or height <= 0 or width > MAX_PDF_IMAGE_DIMENSION or
                height > MAX_PDF_IMAGE_DIMENSION or width * height > MAX_PDF_IMAGE_PIXELS):
            return None
        if any(image.get(k) is not None for k in ('/SMask', '/Mask', '/ImageMask', '/Decode',
                                                   '/OC', '/SMaskInData', '/Alternates')):
            return None
        colorspace = str(image.get('/ColorSpace', ''))
        channels = {'/DeviceGray': 1, '/DeviceRGB': 3}.get(colorspace)
        if not channels or int(image.get('/BitsPerComponent', 0)) != 8:
            return None
        raw = image._data
        if not isinstance(raw, bytes) or len(raw) > MAX_FILE_SIZE:
            return None
        filters = image.get('/Filter', [])
        filters = list(filters) if isinstance(filters, (list, tuple)) else [filters]
        filters = [str(x) for x in filters]
        if filters and filters[0] in ('/ASCII85Decode', '/A85'):
            raw = raw.strip()
            if raw.startswith(b'<~'):
                raw = raw[2:]
            if raw.endswith(b'~>'):
                raw = raw[:-2]
            raw = base64.a85decode(raw, adobe=False)
            filters = filters[1:]
        # Non-default DecodeParms may change output interpretation.
        params = image.get('/DecodeParms')
        if params:
            if isinstance(params, (list, tuple)):
                if any(p and (p.get('/Predictor', 1) != 1 or
                              any(str(k) not in ('/Predictor', '/Colors', '/Columns', '/BitsPerComponent') for k in p)) for p in params):
                    return None
            elif (params.get('/Predictor', 1) != 1 or
                  any(str(k) not in ('/Predictor', '/Colors', '/Columns', '/BitsPerComponent') for k in params)):
                return None
        if filters in (['/DCTDecode'], ['/DCT']):
            if len(raw) > MAX_PDF_IMAGE_BYTES or not raw.endswith(b'\xff\xd9'):
                return None
            parsed = Image.from_blob(raw)
            if parsed.px_width != width or parsed.px_height != height:
                return None
            return raw, width, height
        if filters not in (['/FlateDecode'], ['/Fl']):
            return None
        expected = width * height * channels
        if expected > MAX_PDF_IMAGE_BYTES:
            return None
        decoder = zlib.decompressobj()
        pixels = decoder.decompress(raw, expected + 1)
        if len(pixels) != expected or not decoder.eof or decoder.unconsumed_tail:
            return None
        return _png_from_pixels(width, height, channels, pixels), width, height
    except Exception:
        return None


def _page_pdf_images(page, reader, budget, cancel_event):
    """Conservatively skip detected visibility changes for direct images.

    This narrow check does not cover every PDF visibility semantic. Images
    affected by detected clipping, layers, transparency, annotations or later
    drawing are not exported.
    """
    from pypdf.generic import ContentStream
    omitted = False
    candidates = []
    contents = page.get_contents()
    if contents is None:
        return [], False
    # Later unknown drawing can mask/redact prior images. Axis-aligned direct
    # images have a known painted rectangle and are compared separately.
    painters = {b'S', b's', b'f', b'F', b'f*', b'B', b'B*', b'b', b'b*',
                b'Tj', b'TJ', b"'", b'"', b'sh', b'Do', b'INLINE IMAGE'}
    harmless = {b'w', b'J', b'j', b'M', b'd', b'ri', b'i', b'm', b'l', b'c', b'v',
                b'y', b'h', b're', b'n', b'BT', b'ET', b'Tc', b'Tw', b'Tz', b'TL',
                b'Tf', b'Tr', b'Ts', b'Td', b'TD', b'Tm', b'T*', b'CS', b'cs',
                b'SC', b'SCN', b'sc', b'scn', b'G', b'g', b'RG', b'rg', b'K',
                b'k', b'MP', b'DP'} | painters
    try:
        resources = page.get('/Resources')
        resources = resources.get_object() if resources else {}
        objects = resources.get('/XObject', {})
        objects = objects.get_object() if objects else {}
        crop, media = page.cropbox, page.mediabox
        bounds = (max(float(crop.left), float(media.left)), max(float(crop.bottom), float(media.bottom)),
                  min(float(crop.right), float(media.right)), min(float(crop.top), float(media.top)))
        page_unsafe = bool(page.get('/Annots')) or bool(page.get('/Group')) or int(page.get('/Rotate', 0)) % 360 != 0
        matrix = (1., 0., 0., 1., 0., 0.)
        uncertain = page_unsafe
        stack = []
        marked = 0
        for operands, operator in ContentStream(contents, reader).operations:
            _cancelled(cancel_event)
            budget['operations'] += 1
            if budget['operations'] > MAX_PDF_IMAGE_OPERATIONS:
                return [], True
            if operator in painters and operator != b'Do' and candidates:
                candidates = []
                omitted = True
            if operator == b'q':
                stack.append((matrix, uncertain))
            elif operator == b'Q':
                if stack:
                    matrix, uncertain = stack.pop()
                else:
                    uncertain = True
            elif operator == b'cm':
                a,b,c,d,e,f = matrix
                A,B,C,D,E,F = (float(value) for value in operands)
                matrix = (a*A+c*B, b*A+d*B, a*C+c*D, b*C+d*D, a*E+c*F+e, b*E+d*F+f)
                if not all(math.isfinite(v) for v in matrix):
                    uncertain = True
            elif operator in (b'W', b'W*', b'gs'):
                uncertain = True
            elif operator == b'Tr':
                # Text rendering modes 4..7 add glyph outlines to the clip
                # at ET. Conservatively treat the graphics state as unsafe
                # even if no subsequent text is actually shown.
                value = float(operands[0]) if len(operands) == 1 else -1
                if not math.isfinite(value) or value not in (0, 1, 2, 3):
                    uncertain = True
            elif operator in (b'BMC', b'BDC'):
                marked += 1
            elif operator == b'EMC':
                if marked:
                    marked -= 1
                else:
                    uncertain = True
            elif operator == b'INLINE IMAGE':
                omitted = True
            elif operator == b'Do':
                obj = objects.get(operands[0]) if operands else None
                obj = obj.get_object() if obj else None
                # Nested Form streams, clipping, arbitrary transforms, marked
                # content, annotations and ExtGState are deliberately skipped.
                a,b,c,d,e,f = matrix
                simple = (all(math.isfinite(v) for v in matrix + bounds) and
                          a > 0 and d > 0 and b == 0 and c == 0)
                if not obj or str(obj.get('/Subtype', '')) != '/Image' or not simple:
                    if candidates:
                        candidates = []
                    omitted = True
                    continue
                rect = (e, f, e+a, f+d)
                kept = []
                for existing, other in candidates:
                    # A one-point margin also treats touching edges as overlap.
                    disjoint = (rect[2]+1 < other[0] or other[2]+1 < rect[0] or
                                rect[3]+1 < other[1] or other[3]+1 < rect[1])
                    if disjoint:
                        kept.append((existing, other))
                    else:
                        omitted = True
                candidates = kept
                fully_visible = (simple and
                                 e >= bounds[0] and f >= bounds[1] and
                                 e+a <= bounds[2] and f+d <= bounds[3])
                if uncertain or marked or not fully_visible or len(candidates) >= MAX_PDF_IMAGES:
                    omitted = True
                else:
                    candidates.append((obj, rect))
            elif operator not in harmless:
                # Unknown operators may change visibility or paint over images.
                if candidates:
                    candidates = []
                    omitted = True
                uncertain = True
        if not candidates:
            return [], omitted
        found = []
        for candidate, _ in candidates:
            _cancelled(cancel_event)
            if budget['count'] >= MAX_PDF_IMAGES:
                omitted = True
                break
            w, h = int(candidate.get('/Width', 0)), int(candidate.get('/Height', 0))
            channels = 1 if str(candidate.get('/ColorSpace', '')) == '/DeviceGray' else 3
            estimate = max(0, w*h*channels)
            if estimate > MAX_PDF_IMAGE_BYTES or budget['bytes'] + estimate > MAX_PDF_IMAGES_TOTAL_BYTES:
                omitted = True
                continue
            result = _pdf_image_bytes(candidate)
            if result is None:
                omitted = True
                continue
            blob, width, height = result
            if budget['bytes'] + max(estimate, len(blob)) > MAX_PDF_IMAGES_TOTAL_BYTES:
                omitted = True
                continue
            budget['count'] += 1
            budget['bytes'] += max(estimate, len(blob))
            found.append((blob, width, height))
        return found, omitted
    except ConversionError:
        raise
    except Exception:
        return [], True


def pdf_to_docx(data, *, cancel_event=None):
    """Reconstruct PDF text and supported images, without OCR or layout claims.

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
        image_budget = {'count': 0, 'bytes': 0, 'operations': 0}
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
            images, omitted = _page_pdf_images(page, reader, image_budget, cancel_event)
            for blob, width, height in images:
                _cancelled(cancel_event)
                try:
                    # Place each image on its source page after the page text;
                    # these limits avoid page-spanning shapes for tall images.
                    display_width = min(6.5, 9.0 * width / height)
                    document.add_picture(BytesIO(blob), width=Inches(display_width))
                except Exception:
                    omitted = True
            if omitted and "pdf_images_omitted" not in warnings:
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
