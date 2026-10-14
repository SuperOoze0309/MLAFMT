"""Check every bundled native library and APK ZIP mapping for 16 KiB Android."""

import argparse
import io
from pathlib import Path
import struct
import zipfile

PAGE_SIZE = 16384


def inspect_apk(path):
    failures, libraries, architectures = [], [], set()

    def inspect_elf(data, label):
        if len(data) < 64 or data[:4] != b"\x7fELF" or data[4] != 2 or data[5] != 1:
            failures.append(f"{label}: expected a little-endian 64-bit ELF")
            return
        architectures.add(struct.unpack_from("<H", data, 18)[0])
        start = struct.unpack_from("<Q", data, 32)[0]
        size, count = struct.unpack_from("<HH", data, 54)
        loads = 0
        for index in range(count):
            offset = start + index * size
            if size < 56 or offset + 56 > len(data):
                failures.append(f"{label}: invalid ELF program header")
                return
            kind, _, file_offset, address, _, file_size, memory_size, alignment = struct.unpack_from("<IIQQQQQQ", data, offset)
            if kind != 1 or not (file_size or memory_size):
                continue
            loads += 1
            if alignment < PAGE_SIZE or file_offset % PAGE_SIZE != address % PAGE_SIZE:
                failures.append(f"{label}: PT_LOAD {index} is incompatible with 16 KiB pages (alignment={alignment})")
        if not loads:
            failures.append(f"{label}: ELF has no loadable segments")
        libraries.append(label)

    def inspect_archive(data, label="", depth=0):
        stream = io.BytesIO(data)
        with zipfile.ZipFile(stream) as archive:
            for entry in archive.infolist():
                if entry.is_dir():
                    continue
                name = label + entry.filename
                if entry.filename.endswith(".so"):
                    inspect_elf(archive.read(entry), name)
                    if depth == 0 and entry.filename.startswith("lib/"):
                        if entry.compress_type != zipfile.ZIP_STORED:
                            failures.append(f"{name}: direct JNI library must be uncompressed")
                        header = data[entry.header_offset:entry.header_offset + 30]
                        filename_length, extra_length = struct.unpack_from("<HH", header, 26)
                        payload_offset = entry.header_offset + 30 + filename_length + extra_length
                        if payload_offset % PAGE_SIZE:
                            failures.append(f"{name}: APK payload is not ZIP-aligned to 16 KiB")
                elif depth < 3 and entry.filename.endswith((".imy", ".zip")):
                    nested = archive.read(entry)
                    if zipfile.is_zipfile(io.BytesIO(nested)):
                        inspect_archive(nested, name + "!", depth + 1)

    inspect_archive(path.read_bytes())
    if not libraries or architectures != {62, 183}:
        failures.append("APK must contain native libraries for x86_64 and arm64-v8a")
    if failures:
        raise SystemExit("Android native compatibility check failed:\n" + "\n".join(failures))
    print(f"Verified {len(libraries)} native libraries and JNI ZIP alignment for 16 KiB pages: {path.name}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    args = parser.parse_args()
    inspect_apk(args.apk)


if __name__ == "__main__":
    main()
