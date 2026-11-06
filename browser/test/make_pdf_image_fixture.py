"""Create reproducible drawn-image PDFs without Pillow, reportlab or network."""
import base64
import sys
import zlib
from pathlib import Path

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, EncodedStreamObject, NameObject, NumberObject

JPEG = base64.b64decode(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD42+//ALW7/gWc/wDfWc7/APazv/j3/wCkFFFfuB/Rp//Z'
)


def put_name(value):
    return NameObject(value)


def make_page(writer, text, kind):
    page = writer.add_blank_page(width=612, height=792)
    image = EncodedStreamObject()
    if kind == 'jpeg':
        image._data = JPEG
        width, height, filter_name = 8, 8, '/DCTDecode'
    else:
        width, height, filter_name = 6, 4, '/FlateDecode'
        pixels = bytes(value for y in range(height) for x in range(width) for value in (x * 37 % 256, y * 61 % 256, 180))
        image._data = zlib.compress(pixels)
    image.update({put_name('/Type'): put_name('/XObject'), put_name('/Subtype'): put_name('/Image'),
                  put_name('/Width'): NumberObject(width), put_name('/Height'): NumberObject(height),
                  put_name('/ColorSpace'): put_name('/DeviceRGB'), put_name('/BitsPerComponent'): NumberObject(8),
                  put_name('/Filter'): put_name(filter_name)})
    font = DictionaryObject({put_name('/Type'): put_name('/Font'), put_name('/Subtype'): put_name('/Type1'), put_name('/BaseFont'): put_name('/Helvetica')})
    xobjects = DictionaryObject({put_name('/Image1'): writer._add_object(image)})
    if text == 'PAGE_ONE_JPEG_MARKER':
        second = EncodedStreamObject()
        second._data = zlib.compress(bytes(value for y in range(5) for x in range(3) for value in (x * 70, y * 50, 100)))
        second.update({put_name('/Type'): put_name('/XObject'), put_name('/Subtype'): put_name('/Image'),
                       put_name('/Width'): NumberObject(3), put_name('/Height'): NumberObject(5),
                       put_name('/ColorSpace'): put_name('/DeviceRGB'), put_name('/BitsPerComponent'): NumberObject(8),
                       put_name('/Filter'): put_name('/FlateDecode')})
        xobjects[put_name('/Image2')] = writer._add_object(second)
    page[put_name('/Resources')] = DictionaryObject({
        put_name('/Font'): DictionaryObject({put_name('/F1'): writer._add_object(font)}),
        put_name('/XObject'): xobjects})
    content = DecodedStreamObject()
    commands = (f'BT /F1 14 Tf 50 740 Td ({text}) Tj ET\n' if text else '').encode('ascii') + b'q 160 0 0 100 60 500 cm /Image1 Do Q\n'
    if text == 'PAGE_ONE_JPEG_MARKER':
        commands += b'q 90 0 0 150 340 400 cm /Image2 Do Q\n'
    content.set_data(commands)
    page[put_name('/Contents')] = writer._add_object(content)


output = Path(sys.argv[1])
writer = PdfWriter()
make_page(writer, 'PAGE_ONE_JPEG_MARKER', 'jpeg')
make_page(writer, 'PAGE_TWO_FLATE_MARKER', 'flate')
writer.write(output / 'image-text.pdf')
scan = PdfWriter()
make_page(scan, '', 'jpeg')
scan.write(output / 'image-only.pdf')
