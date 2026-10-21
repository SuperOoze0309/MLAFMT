"""Build the release lxml wheel from locked sources without GNU iconv.

Requires a native C compiler, CMake, Python headers and the pinned build
environment. No test suite is run here. This recipe has not been executed on
every platform merely because its source is present in the repository.
"""

import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import urlopen
from zipfile import ZipFile, ZIP_DEFLATED


def digest(filename):
    return hashlib.sha256(Path(filename).read_bytes()).hexdigest()


def run(arguments, **kwargs):
    print("Running: " + " ".join(str(item) for item in arguments), flush=True)
    subprocess.run([str(item) for item in arguments], check=True, **kwargs)


def fetch(source, directory):
    filename = directory / source["archive"]
    if filename.is_file() and digest(filename) == source["sha256"]:
        return filename
    temporary = filename.with_suffix(filename.suffix + ".download")
    with urlopen(source["url"], timeout=120) as response, temporary.open("wb") as destination:
        shutil.copyfileobj(response, destination)
    if digest(temporary) != source["sha256"]:
        raise SystemExit(f"Source checksum mismatch: {source['url']}")
    temporary.replace(filename)
    return filename


def unpack(archive, directory):
    directory.mkdir()
    with tarfile.open(archive) as contents:
        contents.extractall(directory, filter="data")
    roots = [item for item in directory.iterdir() if item.is_dir()]
    if len(roots) != 1:
        raise SystemExit(f"Expected one source root in {archive}")
    return roots[0]


def cmake_build(source, build, prefix, options):
    common = ["-DBUILD_SHARED_LIBS=OFF", "-DCMAKE_BUILD_TYPE=Release",
              "-DCMAKE_POSITION_INDEPENDENT_CODE=ON", "-DCMAKE_INSTALL_LIBDIR=lib",
              "-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL", f"-DCMAKE_INSTALL_PREFIX={prefix}",
              f"-DCMAKE_PREFIX_PATH={prefix}"]
    if sys.platform == "darwin":
        common += ["-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0", f"-DCMAKE_OSX_ARCHITECTURES={platform.machine()}"]
    run(["cmake", "-S", source, "-B", build, *common, *options])
    run(["cmake", "--build", build, "--config", "Release", "--parallel", str(min(os.cpu_count() or 2, 8))])
    run(["cmake", "--install", build, "--config", "Release"])


def add_wheel_notices(filename, sources, provenance):
    """Keep the unmodified upstream notices and append exact native notices."""
    with ZipFile(filename) as archive:
        members = {item.filename: archive.read(item) for item in archive.infolist() if not item.is_dir()}
    metadata = next(name.rsplit("/", 1)[0] for name in members if name.endswith(".dist-info/METADATA"))
    notices = []
    notice_pattern = re.compile(r"^(?:licen[cs]es?|copying|copyright|notices?)(?:$|[-_.])", re.I)
    for component, directory in sources.items():
        candidates = (directory / "doc/licenses").glob("*") if component == "lxml" else directory.rglob("*")
        for source in sorted(candidates):
            if source.is_file() and (component == "lxml" or notice_pattern.match(source.name)):
                relative = source.relative_to(directory).as_posix()
                destination = f"{metadata}/licenses/mlafmt-native/{component}/{relative}"
                members[destination] = source.read_bytes()
                notices.append(destination[len(metadata + "/licenses/"):])
    if not notices:
        raise SystemExit("Native library source licenses were not found.")
    members[f"{metadata}/native-build.json"] = (json.dumps(provenance, indent=2) + "\n").encode("utf-8")
    # Preserve upstream metadata and add explicit license-file references.
    original_metadata = members[f"{metadata}/METADATA"]
    head, separator, body = original_metadata.partition(b"\n\n")
    if not separator:
        head, separator, body = original_metadata.partition(b"\r\n\r\n")
    additions = b"".join(("\nLicense-File: " + name).encode("utf-8") for name in notices)
    members[f"{metadata}/METADATA"] = head + additions + b"\n\n" + body
    record = f"{metadata}/RECORD"
    members.pop(record, None)
    rows = []
    for name, data in sorted(members.items()):
        value = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode("ascii")
        rows.append([name, "sha256=" + value, str(len(data))])
    rows.append([record, "", ""])
    stream = io.StringIO(newline="")
    csv.writer(stream, lineterminator="\n").writerows(rows)
    members[record] = stream.getvalue().encode("utf-8")
    temporary = filename.with_suffix(".rewritten")
    with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
        for name, data in sorted(members.items()):
            archive.writestr(name, data)
    temporary.replace(filename)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--install", action="store_true", help="Install the produced wheel in this build environment")
    args = parser.parse_args()
    if sys.prefix == sys.base_prefix:
        raise SystemExit("Use an isolated build virtual environment.")
    if sys.version_info[:2] != (3, 12):
        raise SystemExit("Build with CPython 3.12, matching the desktop package runtime.")
    root = Path(__file__).resolve().parent.parent
    lock = root / "scripts/lxml-no-iconv-sources.json"
    sources = json.loads(lock.read_text(encoding="utf-8"))
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    downloads, wheels = output / "downloads", output / "wheels"
    downloads.mkdir(exist_ok=True)
    wheels.mkdir(exist_ok=True)
    identity = {"recipe_sha256": digest(__file__), "sources_lock_sha256": digest(lock),
                "python_cache_tag": sys.implementation.cache_tag, "architecture": platform.machine(),
                "platform": sys.platform, "python": platform.python_version()}
    result_path = output / "build-result.json"
    wheel = None
    if result_path.is_file():
        result = json.loads(result_path.read_text(encoding="utf-8"))
        candidate = wheels / Path(result.get("wheel", "")).name
        if result.get("identity") == identity and candidate.is_file() and digest(candidate) == result.get("sha256"):
            wheel = candidate
    if wheel is None:
        if not shutil.which("cmake"):
            raise SystemExit("CMake is required. On Windows use Visual Studio C++ Build Tools; "
                             "on macOS install Xcode command-line tools; on Linux install build-essential and Python headers. "
                             "Use the development package option if those release build tools are unavailable.")
        work = Path(tempfile.mkdtemp(prefix="source-build-", dir=output))
        directories = {source["name"]: unpack(fetch(source, downloads), work / source["name"]) for source in sources}
        prefix = work / "installed"
        cmake_build(directories["libxml2"], work / "xml-build", prefix, [
            "-DLIBXML2_WITH_ICONV=OFF", "-DLIBXML2_WITH_ICU=OFF", "-DLIBXML2_WITH_LZMA=OFF",
            "-DLIBXML2_WITH_ZLIB=OFF", "-DLIBXML2_WITH_PYTHON=OFF", "-DLIBXML2_WITH_PROGRAMS=OFF",
            "-DLIBXML2_WITH_TESTS=OFF", "-DLIBXML2_WITH_MODULES=OFF", "-DLIBXML2_WITH_HTTP=OFF",
        ])
        cmake_build(directories["libxslt"], work / "xslt-build", prefix, [
            "-DLIBXSLT_WITH_CRYPTO=OFF", "-DLIBXSLT_WITH_PYTHON=OFF", "-DLIBXSLT_WITH_PROGRAMS=OFF",
            "-DLIBXSLT_WITH_TESTS=OFF", "-DLIBXSLT_WITH_MODULES=OFF",
        ])
        setupinfo = directories["lxml"] / "setupinfo.py"
        original = setupinfo.read_text(encoding="utf-8")
        replacement = ("def libraries():\n"
                       "    # MLAFMT: these exact CMake libraries have no iconv/ICU/zlib/lzma dependency.\n"
                       "    if sys.platform == 'win32':\n"
                       "        return ['libexslts', 'libxslts', 'libxml2s', 'bcrypt']\n"
                       "    return ['exslt', 'xslt', 'xml2', 'm']\n\n\n")
        patched, count = re.subn(r"def libraries\(\):\n.*?(?=def library_dirs\()", replacement, original, flags=re.S)
        if count != 1:
            raise SystemExit("The locked lxml source no longer matches the no-iconv link patch.")
        old = "    if OPTION_BUILD_LIBXML2XSLT:\n        macros.append(('LIBXML_STATIC', None))"
        new = "    if OPTION_STATIC:\n        macros.append(('LIBXML_STATIC', None))"
        if patched.count(old) != 1:
            raise SystemExit("The locked lxml source no longer matches the static macro patch.")
        patched = patched.replace(old, new)
        # lxml's legacy environment parser splits paths on whitespace (even
        # LIBRARY on Windows). Embed exact paths in the locked source patch.
        for declaration, body in (
            ("def library_dirs(static_library_dirs):\n", f"    if OPTION_STATIC:\n        return {[str(prefix / 'lib')]!r}\n"),
            ("def include_dirs(static_include_dirs):\n", f"    if OPTION_STATIC:\n        return {[str(prefix / 'include'), str(prefix / 'include/libxml2')]!r}\n"),
            ("def get_library_versions():\n", "    if OPTION_STATIC:\n        return ('2.14.6', '1.1.45')\n"),
        ):
            if patched.count(declaration) != 1:
                raise SystemExit("The locked lxml source no longer matches the static configuration patch.")
            patched = patched.replace(declaration, declaration + body)
        setupinfo.write_text(patched, encoding="utf-8")
        environment = os.environ.copy()
        # Do not trigger lxml's upstream static-deps downloader, which would
        # silently reintroduce the GNU iconv prebuilt library.
        for name in ("STATICBUILD", "STATIC_DEPS", "LXML_STATIC_DEPS", "LXML_BUILD_LIBXML2XSLT"):
            environment.pop(name, None)
        includes = [str(prefix / "include"), str(prefix / "include/libxml2")]
        if sys.platform == "win32":
            if environment.get("INCLUDE"):
                includes.append(environment["INCLUDE"])
            environment["INCLUDE"] = ";".join(includes)
        else:
            environment["INCLUDE"] = " ".join(includes)
            environment["CFLAGS"] = environment.get("CFLAGS", "") + " -fPIC -pthread"
            environment["LDFLAGS"] = environment.get("LDFLAGS", "") + " -pthread"
        environment["LIBRARY"] = str(prefix / "lib")
        if sys.platform == "darwin":
            environment["MACOSX_DEPLOYMENT_TARGET"] = "14.0"
        wheel_output = work / "wheel"
        run([sys.executable, "setup.py", "--static", "--without-cython", "bdist_wheel", "--dist-dir", wheel_output],
            cwd=directories["lxml"], env=environment)
        produced = list(wheel_output.glob("*.whl"))
        if len(produced) != 1:
            raise SystemExit("The lxml source build did not produce exactly one wheel.")
        provenance = {"schema_version": 1, "identity": identity, "sources": sources,
                      "policy": "libxml2 iconv/ICU/lzma/zlib disabled; libxslt crypto/modules disabled",
                      "setupinfo_before_sha256": hashlib.sha256(original.encode()).hexdigest(),
                      "setupinfo_after_sha256": hashlib.sha256(patched.encode()).hexdigest(),
                      "recipe": "scripts/build_lxml_no_iconv.py"}
        add_wheel_notices(produced[0], directories, provenance)
        wheel = wheels / produced[0].name
        shutil.copy2(produced[0], wheel)
        result_path.write_text(json.dumps({"identity": identity, "wheel": wheel.name, "sha256": digest(wheel),
                                          "provenance": provenance}, indent=2) + "\n", encoding="utf-8")
    if args.install:
        run([sys.executable, "-m", "pip", "install", "--no-deps", "--force-reinstall", wheel])
        # Read the just-installed extension's compiled features in a fresh
        # process, so a previously imported stock extension cannot be cached.
        code = ("from lxml import etree; import json; "
                "features=sorted(etree.LIBXML_FEATURES); "
                "print(json.dumps({'features':features,'iconv_compiled':etree.ICONV_COMPILED_VERSION})); "
                "raise SystemExit(1 if 'iconv' in features or any(etree.ICONV_COMPILED_VERSION) else 0)")
        run([sys.executable, "-c", code])
    print(f"No-iconv wheel: {wheel}")


if __name__ == "__main__":
    main()
