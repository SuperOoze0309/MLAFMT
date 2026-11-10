"""Repackage five verified ICML styles using their original DEFLATE streams.

The source archive is official and SHA-pinned. ZIP headers are normalized, so
the output does not depend on the host's zlib version or local timestamp.
"""
from io import BytesIO
import hashlib
import struct
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED

OFFICIAL_SIZE = 228368
OFFICIAL_SHA256 = "8b29290f5828e176debb57ea9cc00252502973d55ea561a2f18a7f0a326bfc6c"
BUNDLE_SIZE = 24486
BUNDLE_SHA256 = "03be9bd927f247198af11eed05a83865531edcacde80804ee8e831f512e2c293"
STYLE_FILES = {
    "icml2026.sty": 27344, "icml2026.bst": 27147,
    "algorithm.sty": 2223, "algorithmic.sty": 7414, "fancyhdr.sty": 31715,
}


def make_bundle(source: bytes) -> bytes:
    if len(source) != OFFICIAL_SIZE or hashlib.sha256(source).hexdigest() != OFFICIAL_SHA256:
        raise ValueError("official ICML archive integrity mismatch")
    try:
        with ZipFile(BytesIO(source)) as archive:
            names = [info.filename for info in archive.infolist()]
            if len(set(names)) != len(names):
                raise ValueError("duplicate ICML archive entry")
            output, entries = BytesIO(), []
            for name, expected_size in STYLE_FILES.items():
                info = archive.getinfo(name)
                if info.file_size != expected_size or info.compress_type != ZIP_DEFLATED or info.flag_bits & 1:
                    raise ValueError("unexpected ICML archive entry")
                # zipfile checks decompressed length and CRC before copying raw
                # bytes. The pinned outer SHA establishes the compressed stream.
                contents = archive.read(info)
                if len(contents) != expected_size:
                    raise ValueError("invalid ICML style length")
                header = struct.unpack_from("<IHHHHHIIIHH", source, info.header_offset)
                if header[0] != 0x04034B50:
                    raise ValueError("invalid ICML ZIP local header")
                start = info.header_offset + 30 + header[-2] + header[-1]
                raw = source[start:start + info.compress_size]
                if len(raw) != info.compress_size:
                    raise ValueError("truncated ICML DEFLATE stream")
                filename, offset = name.encode("ascii"), output.tell()
                output.write(struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0, 8, 0, 33,
                                         info.CRC, len(raw), len(contents), len(filename), 0))
                output.write(filename)
                output.write(raw)
                entries.append((filename, offset, info))
            directory_offset = output.tell()
            for filename, offset, info in entries:
                output.write(struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0, 8, 0, 33,
                                         info.CRC, info.compress_size, info.file_size, len(filename),
                                         0, 0, 0, 0, 0, offset))
                output.write(filename)
            directory_size = output.tell() - directory_offset
            output.write(struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(entries), len(entries),
                                     directory_size, directory_offset, 0))
            result = output.getvalue()
            if len(result) != BUNDLE_SIZE or hashlib.sha256(result).hexdigest() != BUNDLE_SHA256:
                raise ValueError("ICML style bundle integrity mismatch")
            # Confirm the canonical output is a valid ZIP with unmodified files.
            with ZipFile(BytesIO(result)) as bundle:
                for name in STYLE_FILES:
                    if bundle.read(name) != archive.read(name):
                        raise ValueError("ICML style content mismatch")
            return result
    except (BadZipFile, KeyError, IndexError, struct.error) as error:
        raise ValueError("invalid official ICML archive") from error
