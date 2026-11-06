"""Conversion tests use real generated PDF/DOCX bytes, never disguised DOC files."""

from io import BytesIO
import base64
import os
from pathlib import Path
import subprocess
import threading
import zlib
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document
import pytest

import document_conversion as conversion


def docx_bytes(text="Fictional conversion sample"):
    document = Document()
    document.add_paragraph(text)
    document.add_table(rows=1, cols=2).rows[0].cells[0].text = "Table cell"
    result = BytesIO()
    document.save(result)
    return result.getvalue()


def pdf_bytes(pages=("First page sample",), *, encrypted=False, image=False):
    pypdf = pytest.importorskip("pypdf")
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
    writer = pypdf.PdfWriter()
    for text in pages:
        page = writer.add_blank_page(width=612, height=792)
        resources = DictionaryObject()
        resources[NameObject("/Font")] = DictionaryObject({
            NameObject("/F1"): DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica")})})
        if image:
            resources[NameObject("/XObject")] = DictionaryObject({
                NameObject("/UnusedForm"): DictionaryObject({NameObject("/Subtype"): NameObject("/Form")})})
        page[NameObject("/Resources")] = resources
        if text:
            escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            content = DecodedStreamObject()
            content.set_data(f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("latin-1"))
            page[NameObject("/Contents")] = writer._add_object(content)
    if encrypted:
        writer.encrypt("fixture-password")
    result = BytesIO()
    writer.write(result)
    return result.getvalue()


def assert_error(code, function, *args, **kwargs):
    with pytest.raises(conversion.ConversionError) as caught:
        function(*args, **kwargs)
    assert caught.value.code == code


def test_pdf_to_editable_docx_retains_page_text_order_and_input_bytes():
    original = pdf_bytes(("First page (test) and punctuation.", "Second page sample"))
    before = bytes(original)
    result = conversion.convert_document(original, "C:/private/fictional.PDF", "docx")
    assert original == before
    assert result.filename == "fictional.docx"
    assert result.mime_type == conversion.MIME_TYPES["docx"]
    assert result.engine == "pypdf"
    assert result.source_format == "pdf" and result.target_format == "docx"
    assert result.warnings == ("pdf_text_reconstruction",)
    document = Document(BytesIO(result.data))
    text = "\n".join(p.text for p in document.paragraphs)
    assert text.index("First page (test)") < text.index("Second page")
    assert document.sections[0].page_width.inches == 8.5
    with ZipFile(BytesIO(result.data)) as archive:
        assert archive.testzip() is None
        assert b'w:type="page"' in archive.read("word/document.xml")


def test_pdf_blank_page_is_preserved_and_disclosed():
    result, warnings = conversion.pdf_to_docx(pdf_bytes(("Page one", "", "Page three")))
    assert "pdf_blank_pages" in warnings
    with ZipFile(BytesIO(result)) as archive:
        assert archive.read("word/document.xml").count(b'w:type="page"') == 2


def test_scanned_or_empty_pdf_does_not_fabricate_editable_content():
    assert_error("pdf_needs_ocr", conversion.pdf_to_docx, pdf_bytes(("",)))


def test_pdf_encryption_is_reported_without_attempting_password_bypass():
    assert_error("encrypted_document", conversion.pdf_to_docx, pdf_bytes(encrypted=True))


def test_pdf_page_limit_precedes_text_extraction():
    with patch.object(conversion, "MAX_PDF_PAGES", 1):
        assert_error("pdf_page_limit", conversion.pdf_to_docx, pdf_bytes(("A", "B")))


def test_pdf_text_and_stream_limits_are_enforced():
    data = pdf_bytes(("This is a text content fixture",))
    with patch.object(conversion, "MAX_PDF_TEXT", 4):
        assert_error("pdf_content_limit", conversion.pdf_to_docx, data)
    with patch.object(conversion, "MAX_PDF_PAGE_CONTENT", 4):
        assert_error("pdf_content_limit", conversion.pdf_to_docx, data)


def test_pdf_parser_errors_are_stable_and_do_not_include_draft_content():
    assert_error("bad_pdf", conversion.pdf_to_docx, b"%PDF-1.7\nPRIVATE broken fixture\n%%EOF")


def pdf_with_drawn_images(*, transparent=False, huge=False, unsupported=False,
                          include_unused=False, repeats=1, text=True, jpeg=False,
                          bomb=False, operators=None, width=2, height=1,
                          cropped=False, rotated=False, truncated=False,
                          image_optional_content=False, alternate=False):
    """Build actual direct image XObjects, not mock pypdf image access."""
    from pypdf import PdfWriter
    from pypdf.generic import (ArrayObject, DecodedStreamObject, DictionaryObject,
                               EncodedStreamObject, NameObject, NumberObject)
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    image = EncodedStreamObject()
    image.update({NameObject('/Type'): NameObject('/XObject'),
                  NameObject('/Subtype'): NameObject('/Image'),
                  NameObject('/Width'): NumberObject(100000 if huge else width),
                  NameObject('/Height'): NumberObject(100000 if huge else height),
                  NameObject('/BitsPerComponent'): NumberObject(8),
                  NameObject('/ColorSpace'): NameObject('/DeviceRGB'),
                  NameObject('/Filter'): ArrayObject([NameObject('/ASCII85Decode'),
                                                       NameObject('/FlateDecode')])})
    if jpeg:
        image[NameObject('/Filter')] = NameObject('/DCTDecode')
        image._data = base64.b64decode(
            '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62rZ4C8ybqmx5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKT/wAARCAABAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCAANSP/9k=')
        if truncated:
            image._data = image._data[:-2]
    else:
        raw = b'\xff\x00\x00\x00\x00\xff' if not bomb else b'X' * 1000000
        image._data = base64.a85encode(zlib.compress(raw)) + b'~>'
    if transparent:
        image[NameObject('/SMask')] = DictionaryObject()
    if unsupported:
        image[NameObject('/ColorSpace')] = NameObject('/DeviceCMYK')
    if image_optional_content:
        image[NameObject('/OC')] = DictionaryObject()
    if alternate:
        image[NameObject('/Alternates')] = ArrayObject()
    objects = DictionaryObject({NameObject('/Im1'): writer._add_object(image)})
    if include_unused:
        objects[NameObject('/Unused')] = DictionaryObject({NameObject('/Subtype'): NameObject('/Form')})
    fonts = DictionaryObject({NameObject('/F1'): DictionaryObject({
        NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'),
        NameObject('/BaseFont'): NameObject('/Helvetica')})})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/XObject'): objects, NameObject('/Font'): fonts})
    if cropped:
        page.cropbox.lower_left = (100, 100)
    if rotated:
        page[NameObject('/Rotate')] = NumberObject(90)
    content = DecodedStreamObject()
    content.set_data((b'BT /F1 12 Tf 72 720 Td (Editable text) Tj ET\n' if text else b'') +
                     (operators if operators is not None else b'q 100 0 0 50 50 50 cm /Im1 Do Q\n' * repeats))
    page[NameObject('/Contents')] = writer._add_object(content)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_pdf_reconstructs_drawn_rgb_image_without_pillow():
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(include_unused=True))
    assert warnings == ('pdf_text_reconstruction',)
    result = Document(BytesIO(data))
    assert 'Editable text' in '\n'.join(p.text for p in result.paragraphs)
    assert len(result.inline_shapes) == 1
    with ZipFile(BytesIO(data)) as archive:
        names = [x for x in archive.namelist() if x.startswith('word/media/')]
        assert len(names) == 1  # identical images can be reused by DOCX
        png = archive.read(names[0])
        assert png.startswith(b'\x89PNG\r\n\x1a\n')
        pos = png.index(b'IDAT')
        size = int.from_bytes(png[pos-4:pos], 'big')
        assert zlib.decompress(png[pos+4:pos+4+size]) == b'\x00\xff\x00\x00\x00\x00\xff'


def test_pdf_reconstructs_jpeg_bytes_without_reencoding():
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(jpeg=True))
    assert 'pdf_images_omitted' not in warnings
    with ZipFile(BytesIO(data)) as archive:
        media = [n for n in archive.namelist() if n.startswith('word/media/')]
        assert len(media) == 1 and media[0].endswith('.jpg')
        assert archive.read(media[0]).startswith(b'\xff\xd8')


def test_pdf_image_decompression_bomb_is_skipped():
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(bomb=True))
    assert 'pdf_images_omitted' in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 0


@pytest.mark.parametrize('kwargs', [
    {'operators': b'q 0 0 50 50 re W n 100 0 0 50 50 50 cm /Im1 Do Q'},
    {'operators': b'q /GS1 gs 100 0 0 50 50 50 cm /Im1 Do Q'},
    {'operators': b'/OC /Hidden BDC q 100 0 0 50 50 50 cm /Im1 Do Q EMC'},
    {'operators': b'q 100 0 0 50 50 50 cm /Im1 Do Q 0 0 100 100 re f'},
    {'operators': b'q -100 0 0 50 150 50 cm /Im1 Do Q'},
    {'operators': b'q 0 100 -50 0 150 50 cm /Im1 Do Q'},
    {'cropped': True}, {'rotated': True},
    {'jpeg': True, 'truncated': True}, {'width': 1, 'height': 4000000},
    {'image_optional_content': True}, {'alternate': True},
])
def test_pdf_hidden_clipped_rotated_or_invalid_images_are_not_exported(kwargs):
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(**kwargs))
    assert 'pdf_images_omitted' in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 0


def test_pdf_clipping_state_restored_before_image_remains_eligible():
    operators = b'q 0 0 50 50 re W n Q q 100 0 0 50 50 50 cm /Im1 Do Q'
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(operators=operators))
    assert 'pdf_images_omitted' not in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 1


@pytest.mark.parametrize('mode', [4, 5, 6, 7])
def test_pdf_text_rendering_clip_does_not_export_hidden_image_pixels(mode):
    operators = (f'BT /F1 12 Tf {mode} Tr 72 720 Td (Clip) Tj ET '.encode() +
                 b'q 100 0 0 50 50 50 cm /Im1 Do Q')
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(operators=operators))
    assert 'pdf_images_omitted' in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 0


def test_pdf_text_rendering_clip_is_restored_by_graphics_state():
    operators = (b'q BT /F1 12 Tf 7 Tr 72 720 Td (Clip) Tj ET Q '
                 b'q 100 0 0 50 50 50 cm /Im1 Do Q')
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(operators=operators))
    assert 'pdf_images_omitted' not in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 1


def test_pdf_overlapping_image_draws_only_export_final_visible_image():
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(repeats=2))
    assert 'pdf_images_omitted' in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 1


def test_pdf_separate_images_are_retained_across_nested_save_restore():
    operators = (b'q 100 0 0 50 50 50 cm /Im1 Do Q '
                 b'q 1 0 0 1 200 0 cm q 100 0 0 50 50 50 cm /Im1 Do Q Q')
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(operators=operators))
    assert 'pdf_images_omitted' not in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 2


def test_pdf_later_overlapping_image_after_transform_restore_skips_earlier():
    operators = (b'q 1 0 0 1 20 0 cm q 100 0 0 50 50 50 cm /Im1 Do Q Q '
                 b'q 100 0 0 50 100 50 cm /Im1 Do Q')
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(operators=operators))
    assert 'pdf_images_omitted' in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 1


def test_pdf_page_without_resources_is_still_preserved():
    from pypdf import PdfWriter
    from pypdf.generic import NameObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    page.pop(NameObject('/Resources'), None)
    output = BytesIO()
    writer.write(output)
    assert_error('pdf_needs_ocr', conversion.pdf_to_docx, output.getvalue())


@pytest.mark.parametrize('kwargs', [{'transparent': True}, {'huge': True}, {'unsupported': True}])
def test_pdf_unsupported_or_oversize_drawn_images_warn_and_keep_text(kwargs):
    data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images(**kwargs))
    assert 'pdf_images_omitted' in warnings
    result = Document(BytesIO(data))
    assert 'Editable text' in '\n'.join(p.text for p in result.paragraphs)
    assert len(result.inline_shapes) == 0


def test_pdf_image_count_limit_warns_without_dropping_text():
    with patch.object(conversion, 'MAX_PDF_IMAGES', 0):
        data, warnings = conversion.pdf_to_docx(pdf_with_drawn_images())
    assert 'pdf_images_omitted' in warnings
    assert len(Document(BytesIO(data)).inline_shapes) == 0


def test_image_only_pdf_still_explains_that_ocr_is_required():
    assert_error('pdf_needs_ocr', conversion.pdf_to_docx, pdf_with_drawn_images(text=False))


@pytest.mark.parametrize("declared,data,code", [
    ("pdf", b"not a pdf", "bad_pdf"),
    ("docx", b"<html>Fake Word</html>", "bad_doc"),
    ("doc", b"{\\rtf1 A renamed RTF is not a binary DOC}", "bad_doc"),
    ("doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 504, "bad_doc"),
])
def test_renamed_or_truncated_files_are_rejected(declared, data, code):
    assert_error(code, conversion.validate_document, data, declared)


def rewrite_docx(changes):
    out = BytesIO()
    with ZipFile(BytesIO(docx_bytes())) as source, ZipFile(out, "w", ZIP_DEFLATED) as target:
        for item in source.infolist():
            target.writestr(item.filename, source.read(item.filename))
        for name, contents in changes.items():
            target.writestr(name, contents)
    return out.getvalue()


@pytest.mark.parametrize("name,content,code", [
    ("../outside.txt", "blocked", "bad_doc"),
    ("word/vbaProject.bin", "blocked", "unsupported_document"),
    ("word/_rels/foreign.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="x" Type="https://example.org/image" Target="https://example.org/private.png" TargetMode="External"/></Relationships>', "external_content"),
])
def test_docx_package_resource_boundaries(name, content, code):
    assert_error(code, conversion.validate_document, rewrite_docx({name: content}), "docx")


def test_docx_zip_expansion_limit_prevents_processing_compression_bombs():
    data = rewrite_docx({"word/large.txt": "0" * 50000})
    with patch.object(conversion, "MAX_OUTPUT_SIZE", 40000):
        assert_error("too_large", conversion.validate_document, data, "docx")


def test_docx_hyperlinks_do_not_require_network_or_get_rejected():
    extra = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="x" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/" TargetMode="External"/></Relationships>'
    data = rewrite_docx({"word/_rels/link.xml.rels": extra})
    assert conversion.validate_document(data, "docx") == data


def test_cancellation_before_pdf_conversion_does_not_process_input():
    cancelled = threading.Event()
    cancelled.set()
    assert_error("cancelled", conversion.pdf_to_docx, b"not even parsed", cancel_event=cancelled)


@pytest.mark.parametrize("timeout", [True, 0, -1, float("inf"), float("nan"), 601, "120"])
def test_invalid_timeout_options_are_rejected(timeout):
    assert_error("invalid_options", conversion.convert_document, b"x", "a.pdf", "docx", timeout=timeout)


def test_same_format_and_unknown_format_are_rejected():
    assert_error("same_format", conversion.convert_document, docx_bytes(), "a.docx", "docx")
    assert_error("unsupported", conversion.convert_document, b"text", "a.txt", "pdf")
    assert_error("invalid_options", conversion.convert_document, b"x", "a.pdf", "rtf")


def test_file_size_type_and_empty_boundaries():
    assert_error("empty_file", conversion.validate_document, b"", "pdf")
    assert_error("invalid_file", conversion.validate_document, "not bytes", "pdf")
    with patch.object(conversion, "MAX_FILE_SIZE", 4):
        assert_error("too_large", conversion.validate_document, b"12345", "pdf")


def test_missing_office_dependency_is_not_a_fake_success():
    with patch.object(conversion, "find_soffice", return_value=None):
        assert_error("office_engine_missing", conversion.convert_document,
                     docx_bytes(), "a.docx", "doc")


def test_capability_matrix_has_exactly_six_directional_routes():
    with patch.object(conversion, "find_soffice", return_value=None), patch.object(conversion, "_pypdf_available", return_value=True):
        state = conversion.conversion_capabilities()
    assert state["local"] is True
    assert len(state["routes"]) == 6
    assert {(r["source"], r["target"]) for r in state["routes"] if r["available"]} == {("pdf", "docx")}
    with patch.object(conversion, "find_soffice", return_value="soffice"), patch.object(conversion, "_pypdf_available", return_value=True):
        assert all(r["available"] for r in conversion.conversion_capabilities()["routes"])


def test_explicit_office_setting_is_one_executable_not_a_shell_command(tmp_path):
    assert conversion.find_soffice(str(tmp_path / "missing.exe") + " --headless") is None
    with patch.dict(os.environ, {"FORMCAPY_SOFFICE": str(tmp_path / "missing.exe")}):
        assert conversion.find_soffice() is None


class HangingProcess:
    pid = 1234567
    returncode = None

    def poll(self):
        return self.returncode

    def wait(self, timeout):
        raise subprocess.TimeoutExpired("fixture", timeout)


def test_office_timeout_stops_only_the_job_and_removes_its_temporary_files(tmp_path):
    process = HangingProcess()
    stopped = []

    def stop(value):
        stopped.append(value)
        value.returncode = -9

    with patch.object(conversion, "find_soffice", return_value="fixture-soffice"), patch("subprocess.Popen", return_value=process), patch.object(conversion, "_stop_process", side_effect=stop):
        assert_error("conversion_timeout", conversion.convert_document,
                     docx_bytes(), "a.docx", "pdf", timeout=0.01, temp_root=tmp_path)
    assert stopped == [process]
    assert not list(tmp_path.iterdir())


def test_office_command_uses_isolated_profile_real_doc_filter_and_no_shell(tmp_path):
    captured = {}

    def fail(command, **options):
        captured.update(command=command, options=options)
        raise OSError("test: executable unavailable")

    with patch.object(conversion, "find_soffice", return_value="fixture-soffice"), patch("subprocess.Popen", side_effect=fail):
        assert_error("conversion_failed", conversion.convert_document,
                     docx_bytes(), "../../private.docx", "doc", temp_root=tmp_path)
    command = captured["command"]
    assert "doc:MS Word 97" in command
    assert any(item.startswith("-env:UserInstallation=file:") for item in command)
    assert command[-1].endswith("document.docx")
    assert "shell" not in captured["options"]
    assert not list(tmp_path.iterdir())


@pytest.mark.skipif(not conversion.find_soffice(), reason="Native LibreOffice is not installed")
def test_real_libreoffice_six_routes_and_real_binary_doc(tmp_path):
    """When installed, inspect actual PDF text and DOC round trips independently."""
    pypdf = pytest.importorskip("pypdf")
    original = docx_bytes("Fictional six-route sample 42")
    native_doc = conversion.convert_document(original, "sample.docx", "doc", temp_root=tmp_path)
    assert native_doc.data.startswith(conversion.OLE_SIGNATURE)
    native_pdf = conversion.convert_document(original, "sample.docx", "pdf", temp_root=tmp_path)
    assert "six-route sample 42" in pypdf.PdfReader(BytesIO(native_pdf.data)).pages[0].extract_text()
    returned_docx = conversion.convert_document(native_doc.data, "sample.doc", "docx", temp_root=tmp_path)
    assert "six-route sample 42" in "\n".join(p.text for p in Document(BytesIO(returned_docx.data)).paragraphs)
    assert conversion.convert_document(native_doc.data, "sample.doc", "pdf", temp_root=tmp_path).data.startswith(b"%PDF-")
    pdf_docx = conversion.convert_document(native_pdf.data, "sample.pdf", "docx", temp_root=tmp_path)
    assert "six-route sample 42" in "\n".join(p.text for p in Document(BytesIO(pdf_docx.data)).paragraphs)
    pdf_doc = conversion.convert_document(native_pdf.data, "sample.pdf", "doc", temp_root=tmp_path)
    assert pdf_doc.data.startswith(conversion.OLE_SIGNATURE)
    assert not list(tmp_path.iterdir())
