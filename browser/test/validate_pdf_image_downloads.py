"""Independently inspect drawn images and text in real browser downloads."""
import json
import hashlib
import struct
import sys
import zlib
from io import BytesIO
from pathlib import Path

from docx import Document
from docx.image.image import Image
from docx.oxml.ns import qn


def png_pixels(blob, width, height):
    assert blob.startswith(b'\x89PNG\r\n\x1a\n')
    offset, payload = 8, bytearray()
    while offset < len(blob):
        length = struct.unpack_from('>I', blob, offset)[0]
        kind = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + length]
        if kind == b'IDAT':
            payload.extend(data)
        if kind == b'IEND':
            break
        offset += length + 12
    rows = zlib.decompress(payload)
    stride = 1 + width * 3
    assert len(rows) == height * stride
    assert all(rows[i * stride] == 0 for i in range(height))
    return b''.join(rows[i * stride + 1:(i + 1) * stride] for i in range(height))


def inspect(path, exact_pixels=False):
    document = Document(path)
    pages = [{'text': '', 'images': []}]
    for paragraph in document.paragraphs:
        for item in paragraph._p.iter():
            if item.tag == qn('w:t'):
                pages[-1]['text'] += item.text or ''
            elif item.tag == qn('w:br') and item.get(qn('w:type')) == 'page':
                pages.append({'text': '', 'images': []})
            elif item.tag == qn('a:blip'):
                rel = item.get(qn('r:embed'))
                assert rel, 'Image is not embedded in the Word file'
                blob = document.part.related_parts[rel].blob
                image = Image.from_blob(blob)
                if exact_pixels and (image.px_width, image.px_height) == (8, 8):
                    assert hashlib.sha256(blob).hexdigest() == expected_jpeg, 'JPEG content changed'
                if exact_pixels and (image.px_width, image.px_height) == (6, 4):
                    assert png_pixels(blob, 6, 4) == expected_pixels, 'Flate image pixels changed'
                if exact_pixels and (image.px_width, image.px_height) == (3, 5):
                    assert png_pixels(blob, 3, 5) == expected_pixels_second, 'Second image pixels changed'
                pages[-1]['images'].append({'width': image.px_width, 'height': image.px_height, 'bytes': len(blob)})
    assert len(pages) >= 2, pages
    assert 'PAGE_ONE_JPEG_MARKER' in pages[0]['text'] and pages[0]['images'], pages
    assert 'PAGE_TWO_FLATE_MARKER' in pages[1]['text'] and pages[1]['images'], pages
    assert len(pages[0]['images']) == 2 and len(pages[1]['images']) == 1, pages
    assert any((i['width'], i['height']) == (8, 8) for i in pages[0]['images']), pages
    assert any((i['width'], i['height']) == (3, 5) for i in pages[0]['images']), pages
    assert any((i['width'], i['height']) == (6, 4) for i in pages[1]['images']), pages
    return {'path': str(path), 'pages': pages}


docx, doc, roundtrip, fixture = map(Path, sys.argv[1:5])
from pypdf import PdfReader
source = PdfReader(fixture)
expected_jpeg = hashlib.sha256(source.pages[0]['/Resources']['/XObject']['/Image1'].get_object()._data).hexdigest()
expected_pixels = zlib.decompress(source.pages[1]['/Resources']['/XObject']['/Image1'].get_object()._data)
expected_pixels_second = zlib.decompress(source.pages[0]['/Resources']['/XObject']['/Image2'].get_object()._data)
data = doc.read_bytes()
assert data[:8] == bytes.fromhex('d0cf11e0a1b11ae1')
assert ('WordDocument' + chr(0)).encode('utf-16le') in data
assert any((name + chr(0)).encode('utf-16le') in data for name in ('0Table', '1Table'))
print(json.dumps({'doc_cfb': True, 'direct_docx': inspect(docx, exact_pixels=True), 'doc_roundtrip': inspect(roundtrip)}))
