"""Assemble source/relink materials for one exactly identified published wheel."""

import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
from zipfile import ZipFile, ZIP_DEFLATED

from build_lxml_no_iconv import fetch


def prepare_source_kit(root, output, native):
    """Return None for an unknown wheel, never infer identity from its version."""
    root, output = Path(root).resolve(), Path(output).resolve()
    lock_path = root / "scripts/lxml-windows-source-kit.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    if (sys.platform != lock["platform"] or sys.implementation.cache_tag != lock["python_cache_tag"]
            or platform.machine().lower() != lock["machine"].lower() or native["lxml"] != lock["lxml"]):
        return None
    expected = lock["compiled_versions"]
    if (native["libxml2_compiled"] != expected["libxml2"]
            or native["libxslt_compiled"] != expected["libxslt"]
            or native["iconv_compiled"] != expected["iconv"]):
        return None
    distribution = importlib.metadata.distribution("lxml")
    actual = {item["file"].replace("\\", "/"): item["sha256"] for item in native["binaries"]}
    if actual != lock["native_files"]:
        return None
    downloads = output / "source-inputs"
    downloads.mkdir(exist_ok=True)
    archives = {source["name"]: fetch(source, downloads) for source in lock["sources"]}
    # Match every wheel source/data file too, not just extension versions. The
    # installed RECORD itself legitimately differs after a pip installation.
    with ZipFile(archives["published-wheel"]) as wheel:
        for name in wheel.namelist():
            if name.endswith("/") or ".dist-info/" in name:
                continue
            installed = Path(distribution.locate_file(name))
            if not installed.is_file() or installed.read_bytes() != wheel.read(name):
                return None

    result = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                            cwd=root, capture_output=True, check=True)
    paths = []
    ignored_binaries = {".exe", ".dll", ".pyd", ".pyc", ".apk", ".zip", ".dmg", ".appimage"}
    for name in sorted(set(result.stdout.decode("utf-8").split("\0"))):
        if not name:
            continue
        filename = root / name
        if not filename.is_file() or filename.suffix.lower() in ignored_binaries:
            continue
        # Complete tracked source plus this change's new build/documentation
        # files. Do not sweep unrelated untracked user drafts into a release.
        tracked = subprocess.run(["git", "ls-files", "--error-unmatch", "--", name], cwd=root,
                                 capture_output=True, check=False).returncode == 0
        if tracked or name.startswith("scripts/") or name == "docs/DEPENDENCIES.md":
            paths.append((name, filename))
    required = {"mla_gui.py", "mla_formatter.py", "requirements-build.txt", "scripts/build_windows.ps1",
                "scripts/rebuild_windows_source_kit.py", "scripts/lxml-windows-source-kit.json"}
    if not required.issubset({name for name, _ in paths}):
        raise SystemExit("The source kit is missing application or relink source files.")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=root, text=True).strip())
    manifest = {
        "schema_version": 1, "application_commit": commit, "working_tree_dirty": dirty,
        "installed_native_files": actual, "upstream": lock,
        "application_files": {name: hashlib.sha256(filename.read_bytes()).hexdigest() for name, filename in paths},
        "engineering_check": "Pinned official wheel files, component versions, full locked source archives, application sources and relink recipe are included.",
        "limits": lock["matching_evidence"]["limits"],
    }
    instructions = """MLAFMT WINDOWS SOURCE / RELINK KIT
=================================

GNU libiconv is used by the bundled lxml extension. Its library and its use
are covered by the GNU Lesser General Public License, version 2.1 or later.
Full original license notices are in the source archives and in the app's
THIRD-PARTY-NOTICES.txt. The application and lxml retain their own licenses.
You may modify the work for your own use and reverse engineer it to debug
such modifications, as provided by the applicable licenses.

CONTENTS
  application/   Full tracked application source and current build additions.
  sources/       Full lxml sdist (generated C included), original published
                 wheel, Windows dependency build repository and all four
                 source submodules at fixed commits, including local build
                 project files and the upstream libiconv.patch.
  source-kit-manifest.json  Exact hashes, versions, source correspondence
                           evidence, application commit and known limits.
  rebuild.py     Unpack, modify and rebuild the library/lxml extension.

REBUILD WITH A MODIFIED LIBRARY (Windows x64)
1. Extract this ZIP to a new working directory. Install CPython 3.12 x64,
   Visual Studio 2022 C++ tools and Windows SDK 10.0.19041, Git, and the Pscx
   PowerShell module required by the included upstream dependency builder.
   The upstream builder searches VS 2022 Community/Enterprise paths; for
   Build Tools/other locations adjust its Get-BatPath before building.
2. In PowerShell create an isolated environment and install pinned tools:
     py -3.12 -m venv .venv-relink
     .venv-relink/Scripts/python.exe -m pip install -r application/requirements-build.txt
3. Unpack the fixed archives (new target directory required):
     .venv-relink/Scripts/python.exe rebuild.py unpack --workspace work
4. Modify work/native/libiconv/source/ (or the other native sources).
   The unpack helper applies the included upstream libiconv project patch.
5. From a VS 2022 x64 developer environment, rebuild the native libraries and
   lxml's generated C extension against your modified library:
     .venv-relink/Scripts/python.exe rebuild.py build --workspace work --install
   The helper uses local built libraries, does not download replacement
   native libraries, and leaves the source and link configuration available.
6. Rebuild the complete application from the supplied Python sources:
     application/scripts/build_windows.ps1 -PythonPath <absolute-path-to-.venv-relink/Scripts/python.exe> -Development
   The development build preserves your modified installed lxml. Output is
   under application/dist/development. No original signing key is required.

The native toolchain itself is an external build prerequisite. This kit has
not been rebuilt on the packaging host, which lacks a C compiler. Matching
evidence is from the exact official wheel, its compiled version metadata and
the preceding upstream dependency release with fixed source submodules.
No third party legal certification or byte-identical rebuild is claimed.
"""
    destination = output / "MLAFMT-SOURCE-KIT.zip"
    with ZipFile(destination, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for name, filename in paths:
            archive.write(filename, "application/" + name)
        for source in lock["sources"]:
            archive.write(archives[source["name"]], "sources/" + source["archive"])
        archive.writestr("source-kit-manifest.json", json.dumps(manifest, indent=2) + "\n")
        archive.writestr("REBUILD.txt", instructions)
        archive.write(root / "scripts/rebuild_windows_source_kit.py", "rebuild.py")
    additional_notices = []
    for component, filename in archives.items():
        if component in {"published-wheel", "windows-dependency-build"}:
            continue
        with tarfile.open(filename) as archive:
            for member in archive.getmembers():
                base = Path(member.name).name.lower()
                lxml_reference = component == "lxml-source" and "/doc/licenses/" in member.name
                if member.isfile() and (lxml_reference or base in {"copying", "copying.lib", "copyright", "license", "license.txt"}):
                    additional_notices.append((f"{component}: original Windows dependency source notice", member.name,
                                               archive.extractfile(member).read()))
    return ({"file": destination.name, "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
             "application_commit": commit, "working_tree_dirty": dirty,
             "engineering_materials_check": "passed for the exact pinned Windows wheel",
             "matching_evidence": lock["matching_evidence"]}, additional_notices)
