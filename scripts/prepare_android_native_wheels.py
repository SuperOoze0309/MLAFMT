"""Package genuinely relinked Chaquopy native dependencies and verify their ABI."""

import argparse
import base64
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import urllib.request
import zipfile


XML_VERSION = "2.9.8+mlafmt16k1"
XSLT_VERSION = "1.1.32+mlafmt16k1"
BASELINES = {
    "chaquopy_libxml2-2.9.8-2-py3-none-android_21_arm64_v8a.whl": "f8a7adf4f565e4cec6add811a9886be2191e8214913987dce24a3bb522dcb4e3",
    "chaquopy_libxml2-2.9.8-2-py3-none-android_21_x86_64.whl": "d2de5e9e2157f83011a65650b9cc6162a4557473815de7a0ff39b0fc0dc573ff",
    "chaquopy_libxslt-1.1.32-2-py3-none-android_21_arm64_v8a.whl": "0526c414fc0af6f02b9e922042c79e3aa0e3c28fe093de3a38d834755ffc2a27",
    "chaquopy_libxslt-1.1.32-2-py3-none-android_21_x86_64.whl": "0ecc6d76ab50ee38dd5a8dc108636a4b5c350495ddb2ad82b488475ec2692818",
}
SOURCE_HASHES = {
    "libxml2-2.9.8.tar.xz": "dcca21d624bbbe094fcc104e1f15f2eacfb65aecd0e38ed220aeca56b62c81e2",
    "libxslt-1.1.32.tar.xz": "b7da90eaa6b0dae9e9a3769e29a757342eef0edb9a7b431424814375414422af",
    "xz-5.2.4.tar.xz": "9717ae363760dedf573dad241420c5fea86256b65bc21d2cf71b2b12f0544f4b",
}
SOURCE_PATCHES = [{
    "source": "libxslt-1.1.32/libxslt/extensions.c",
    "function": "xsltHashScannerModuleFree",
    "change": "The unused private callback name parameter is const xmlChar *, matching xmlHashScanner.",
    "reason": "Clang 19 enforces function pointer compatibility; public ABI and callback behavior are unchanged.",
}]


def download_baselines(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for filename, expected in BASELINES.items():
        path = directory / filename
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            package = "chaquopy-libxml2" if filename.startswith("chaquopy_libxml2") else "chaquopy-libxslt"
            with urllib.request.urlopen(f"https://chaquo.com/pypi-13.1/{package}/{filename}", timeout=120) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != expected:
                raise SystemExit(f"Original wheel checksum mismatch: {filename}")
            path.write_bytes(data)


def elf(data):
    if data[:6] != b"\x7fELF\x02\x01":
        raise SystemExit("Expected a 64-bit little-endian ELF shared library")
    machine = struct.unpack_from("<H", data, 18)[0]
    phoff, shoff = struct.unpack_from("<QQ", data, 32)
    phsize, phnum, shsize, shnum, shstrndx = struct.unpack_from("<HHHHH", data, 54)
    programs = [struct.unpack_from("<IIQQQQQQ", data, phoff + index * phsize) for index in range(phnum)]
    sections = [struct.unpack_from("<IIQQQQIIQQ", data, shoff + index * shsize) for index in range(shnum)]
    exports = set()
    for section in sections:
        if section[1] != 11:  # SHT_DYNSYM
            continue
        strings_section = sections[section[6]]
        strings = data[strings_section[4]:strings_section[4] + strings_section[5]]
        for offset in range(section[4], section[4] + section[5], section[9]):
            name, info, other, index, value, size = struct.unpack_from("<IBBHQQ", data, offset)
            if index != 0 and info >> 4 in (1, 2) and other & 3 in (0, 3):
                exports.add(strings[name:strings.find(b"\0", name)].decode())
    dynamic = next(item for item in programs if item[0] == 2)
    tags = [struct.unpack_from("<qQ", data, position)
            for position in range(dynamic[2], dynamic[2] + dynamic[5], 16)]
    strings_address = next(value for tag, value in tags if tag == 5)
    owner = next(item for item in programs if item[0] == 1 and item[3] <= strings_address < item[3] + item[5])
    strings_offset = owner[2] + strings_address - owner[3]

    def string(value):
        start = strings_offset + value
        return data[start:data.find(b"\0", start)].decode()

    soname = next((string(value) for tag, value in tags if tag == 14), None)
    needed = [string(value) for tag, value in tags if tag == 1]
    return machine, programs, exports, soname, needed


def verify_library(data, original, abi, soname):
    machine, programs, exports, actual_name, needed = elf(data)
    assert machine == (183 if abi == "arm64-v8a" else 62), "Wrong ELF architecture"
    assert actual_name == soname, f"Unexpected SONAME {actual_name}; expected {soname}"
    for item in programs:
        if item[0] == 1:
            assert item[7] >= 16384, f"{soname} has a PT_LOAD alignment below 16 KB"
            assert item[2] % 16384 == item[3] % 16384, f"{soname} has incongruent load offsets"
    # GNU BFD synthesizes these bookkeeping exports; LLVM lld may omit them.
    # They are linker markers, rather than XML/XSLT or liblzma interfaces.
    linker_markers = {"__bss_end__", "__bss_start", "__bss_start__", "__end__", "_bss_end__", "_edata", "_end"}
    baseline_exports = {name for name in elf(original)[2]
                        if name not in linker_markers and not name.startswith("LIBXML2_")}
    missing = baseline_exports - exports
    assert not missing, f"{soname} is missing original ABI symbols: {sorted(missing)}"
    allowed = {"libc.so", "libm.so", "libdl.so", "libz.so", "liblog.so", "libxml2.so", "libxslt.so"}
    assert set(needed) <= allowed, f"Unexpected dynamic dependencies: {needed}"
    return {"soname": actual_name, "needed": needed, "defined_symbols": len(exports),
            "baseline_symbols": len(baseline_exports), "all_baseline_symbols_preserved": True,
            "load_segments": [{"offset": item[2], "virtual_address": item[3], "file_size": item[5],
                               "memory_size": item[6], "alignment": item[7], "flags": item[1]}
                              for item in programs if item[0] == 1]}


def configure_sonames(source):
    count = 0
    for filename in (source / "Makefile", source / "libxslt/Makefile", source / "libexslt/Makefile"):
        if filename.exists():
            text = filename.read_text()
            text, replacements = re.subn(r"-version-info\s+\$\(LIB(?:XML|XSLT|EXSLT)_VERSION_INFO\)", "-avoid-version", text)
            filename.write_text(text)
            count += replacements
    if not count:
        raise SystemExit(f"No expected native library linker rule found in {source}")


def patch_source(source):
    path = source / "libxslt/extensions.c"
    text = path.read_text(encoding="utf-8")
    old = ("xsltHashScannerModuleFree(void *payload ATTRIBUTE_UNUSED,\n"
           "                          void *data ATTRIBUTE_UNUSED,\n"
           "                          xmlChar * name ATTRIBUTE_UNUSED)")
    new = old.replace("xmlChar * name", "const xmlChar * name")
    if text.count(old) != 1:
        raise SystemExit("The locked XSLT callback signature no longer matches the reviewed source patch.")
    function_start = text.index(old) + len(old)
    body = text[function_start:text.index("\n}", function_start)]
    if re.search(r"\bname\b", body):
        raise SystemExit("The callback name parameter is unexpectedly used; re-review const safety.")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def write_wheel(output, name, version, abi, files, requires):
    tag = f"py3-none-android_24_{abi.replace('-', '_')}"
    normalized = name.replace("-", "_")
    info = f"{normalized}-{version}.dist-info"
    files[f"{info}/METADATA"] = (f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n"
                                "Summary: MLAFMT rebuild of the original Chaquopy native library with 16 KB load segments\n"
                                "License: MIT\n" + "".join(f"Requires-Dist: {requirement}\n" for requirement in requires) + "\n").encode()
    files[f"{info}/WHEEL"] = (f"Wheel-Version: 1.0\nGenerator: MLAFMT native rebuild\nRoot-Is-Purelib: false\nTag: {tag}\n").encode()
    records = io.StringIO(newline="")
    writer = csv.writer(records, lineterminator="\n")
    for path, data in sorted(files.items()):
        digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
        writer.writerow([path, "sha256=" + digest, len(data)])
    writer.writerow([f"{info}/RECORD", "", ""])
    files[f"{info}/RECORD"] = records.getvalue().encode()
    path = output / f"{normalized}-{version}-1-{tag}.whl"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            item = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            archive.writestr(item, data)
    print(f"Built and verified {path.name}")


def package(args):
    args.output.mkdir(parents=True, exist_ok=True)
    suffix = args.abi.replace("-", "_")
    reports = {}
    for name, version, library_names, header_directory, source_name, original_version, requires in [
        ("chaquopy-libxml2", XML_VERSION, ("libxml2.so",), "libxml2", "libxml2-2.9.8", "2.9.8", []),
        ("chaquopy-libxslt", XSLT_VERSION, ("libxslt.so", "libexslt.so"), None, "libxslt-1.1.32", "1.1.32", [f"chaquopy-libxml2 (=={XML_VERSION})"]),
    ]:
        files = {}
        baseline_filename = f"{name.replace('-', '_')}-{original_version}-2-py3-none-android_21_{suffix}.whl"
        baseline_path = args.baseline_directory / baseline_filename
        assert hashlib.sha256(baseline_path.read_bytes()).hexdigest() == BASELINES[baseline_filename]
        with zipfile.ZipFile(baseline_path) as baseline:
            for library in library_names:
                data = (args.prefix / "lib" / library).read_bytes()
                reports[library] = verify_library(data, baseline.read(f"chaquopy/lib/{library}"), args.abi, library)
                files[f"chaquopy/lib/{library}"] = data
        header_roots = [args.prefix / "include" / header_directory] if header_directory else [args.prefix / "include/libxslt", args.prefix / "include/libexslt"]
        for header_root in header_roots:
            for path in sorted(header_root.rglob("*")):
                if path.is_file():
                    files["chaquopy/include/" + path.relative_to(args.prefix / "include").as_posix()] = path.read_bytes()
        source_root = args.source_directory / source_name
        for pattern in ("COPYING*", "Copyright*", "AUTHORS*"):
            for path in source_root.glob(pattern):
                if path.is_file():
                    files[f"{name.replace('-', '_')}-{version}.dist-info/licenses/{path.name}"] = path.read_bytes()
        if name == "chaquopy-libxml2":
            xz_root = args.source_directory / "xz-5.2.4"
            for path in xz_root.glob("COPYING*"):
                if path.is_file():
                    files[f"{name.replace('-', '_')}-{version}.dist-info/licenses/xz-{path.name}"] = path.read_bytes()
        write_wheel(args.output, name, version, args.abi, files, requires)
    report = {"abi": args.abi, "ndk": "28.2.13676358", "minimum_api": 24,
              "linker_flags": ["-z max-page-size=16384", "-z common-page-size=16384", "--undefined-version"],
              "source_sha256": SOURCE_HASHES, "baseline_wheel_sha256": BASELINES,
              "source_patches": SOURCE_PATCHES,
              "libraries": reports, "method": "Original source compiled and linked; unversioned SONAME emitted by libtool -avoid-version"}
    (args.output / f"native-build-{args.abi}.json").write_text(json.dumps(report, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    download = subparsers.add_parser("download-baselines")
    download.add_argument("--directory", type=Path, required=True)
    configure = subparsers.add_parser("configure-sonames")
    configure.add_argument("--source-directory", type=Path, required=True)
    patch = subparsers.add_parser("patch-source")
    patch.add_argument("--source-directory", type=Path, required=True)
    build = subparsers.add_parser("package")
    for name in ("prefix", "source-directory", "output", "baseline-directory", "ndk"):
        build.add_argument("--" + name, type=Path, required=True)
    build.add_argument("--abi", choices=("arm64-v8a", "x86_64"), required=True)
    manifest = subparsers.add_parser("manifest")
    manifest.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "download-baselines":
        download_baselines(args.directory)
    elif args.command == "configure-sonames":
        configure_sonames(args.source_directory)
    elif args.command == "patch-source":
        patch_source(args.source_directory)
    elif args.command == "package":
        package(args)
    else:
        files = sorted(args.directory.glob("*.whl"))
        if len(files) != 4:
            raise SystemExit(f"Expected four native wheels, found {len(files)}")
        manifest = "".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in files)
        (args.directory / "SHA256SUMS.txt").write_text(manifest)


if __name__ == "__main__":
    main()
