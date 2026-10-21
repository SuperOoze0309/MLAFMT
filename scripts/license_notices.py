"""Collect original installed license texts and record native build provenance.

This module is independent of the platform preparation scripts.  A notice
inventory is not a legal clearance: release checks separately reject the
unresolved GNU iconv dependency in stock statically linked lxml wheels.
"""

import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import sysconfig


NOTICE_NAME = "THIRD-PARTY-NOTICES.txt"
_NOTICE_FILE = re.compile(r"^(?:licen[cs]es?|copying|copyright|notices?|authors)(?:$|[-_.])", re.I)


def _notice_file(path):
    # Match the file name, not a parent named "licenses": packaging/licenses
    # contains executable Python modules rather than license documents.
    path = Path(path)
    if _NOTICE_FILE.match(path.name):
        return True
    parts = path.parts
    in_license_data = any(part.lower().endswith(".dist-info") and index + 1 < len(parts)
                          and parts[index + 1].lower() == "licenses" for index, part in enumerate(parts))
    return in_license_data and path.suffix.lower() not in {
        ".py", ".pyc", ".pyo", ".so", ".dll", ".pyd", ".exe", ".png", ".jpg", ".gif", ".whl"}


def _read_text(data):
    try:
        return data.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        # Keep exact bytes alongside this readable rendition; do not silently
        # replace characters in copyright holders' names.
        return data.decode("latin-1"), "latin-1"


def inspect_lxml():
    """Read feature/version metadata and native import tables, without tests."""
    from lxml import etree

    distribution = importlib.metadata.distribution("lxml")
    imports, binaries, provenance, import_status = [], [], None, "not inspected"
    for item in distribution.files or []:
        filename = Path(distribution.locate_file(item))
        if filename.name == "native-build.json" and filename.is_file():
            provenance = json.loads(filename.read_text(encoding="utf-8"))
        if not filename.is_file() or not (filename.suffix.lower() in {".pyd", ".dll", ".dylib"}
                                         or ".so" in filename.name):
            continue
        binaries.append({"file": str(item), "sha256": hashlib.sha256(filename.read_bytes()).hexdigest()})
        if filename.resolve() != Path(etree.__file__).resolve():
            continue
        if sys.platform == "win32":
            import pefile
            binary = pefile.PE(str(filename), fast_load=True)
            try:
                binary.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]])
                imports = [entry.dll.decode("ascii") for entry in getattr(binary, "DIRECTORY_ENTRY_IMPORT", [])]
                import_status = "PE import table read"
            finally:
                binary.close()
        elif sys.platform in {"darwin", "linux"}:
            command = ["otool", "-L", str(filename)] if sys.platform == "darwin" else ["ldd", str(filename)]
            try:
                result = subprocess.run(command, capture_output=True, text=True, check=False)
                if result.returncode == 0:
                    imports = [line.strip() for line in result.stdout.splitlines()[1:] if line.strip()]
                    import_status = "native dependency tool succeeded"
                else:
                    import_status = f"dependency tool exited {result.returncode}"
            except OSError as error:
                import_status = f"dependency tool unavailable: {error}"
    features = sorted(getattr(etree, "LIBXML_FEATURES", ()))
    compiled_features = sorted(getattr(etree, "LIBXML_COMPILED_FEATURES", ()))
    iconv_version = getattr(etree, "ICONV_COMPILED_VERSION", None)
    # Older lxml builds may not expose feature sets.  Do not infer absence from
    # missing metadata; a non-zero compile version is positive evidence too.
    dynamic_iconv = any("iconv" in name.lower() for name in imports)
    iconv = "iconv" in features or "iconv" in compiled_features or bool(iconv_version and any(iconv_version)) or dynamic_iconv
    return {
        "lxml": distribution.version,
        "libxml2": list(etree.LIBXML_VERSION),
        "libxml2_compiled": list(etree.LIBXML_COMPILED_VERSION),
        "libxslt": list(etree.LIBXSLT_VERSION),
        "libxslt_compiled": list(etree.LIBXSLT_COMPILED_VERSION),
        "iconv_compiled": list(iconv_version) if iconv_version else None,
        "libxml_features": features, "libxml_compiled_features": compiled_features,
        "feature_metadata_available": hasattr(etree, "LIBXML_FEATURES"),
        "iconv_enabled": iconv,
        "iconv_linkage": ("dynamic dependency listed" if dynamic_iconv else
                          "no separate iconv import; static linkage requires source/relink review") if iconv else "disabled",
        "native_imports": imports, "binaries": sorted(binaries, key=lambda item: item["file"]),
        "native_import_inspection": import_status,
        "source_build_provenance": provenance,
    }


def write_notices(root, output, target=None, release_check=False):
    """Write full original texts, byte-preserved copies, and a separate audit.

    Normal development preparation still works with stock wheels.  The release
    path requires our no-iconv build until corresponding static LGPL relinking
    materials have been prepared and reviewed for a different build.
    """
    root, output = Path(root).resolve(), Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    license_directory = output / "licenses"
    if license_directory.exists():
        if license_directory.resolve().parent != output or license_directory.is_symlink():
            raise SystemExit("License staging must remain directly inside the build output.")
        shutil.rmtree(license_directory)
    license_directory.mkdir(exist_ok=True)
    records, sections, packages, package_hashes, missing = [], [], {}, {}, []
    copied = set()

    def append(label, source, data=None, provenance=None):
        data = Path(source).read_bytes() if data is None else data
        if not data.strip():
            raise SystemExit(f"Empty license text: {label}")
        digest = hashlib.sha256(data).hexdigest()
        filename = re.sub(r"[^A-Za-z0-9._-]", "_", Path(str(source)).name)
        stored = f"{digest}-{filename}"
        if stored not in copied:
            (license_directory / stored).write_bytes(data)
            copied.add(stored)
        value, encoding = _read_text(data)
        record = {"component": label, "source": str(source).replace("\\", "/"),
                  "file": f"licenses/{stored}", "sha256": digest, "encoding": encoding}
        if provenance:
            record["provenance"] = provenance
        records.append(record)
        # Keep each attribution label, even when different components ship
        # identical license texts. Original byte copies may share storage.
        sections.append(f"\n{'=' * 72}\n{label}\nSource: {record['source']}\nSHA-256: {digest}\n{'=' * 72}\n{value}\n")

    for distribution in sorted(importlib.metadata.distributions(),
                               key=lambda item: item.metadata["Name"].lower()):
        name = distribution.metadata["Name"]
        packages[name] = distribution.version
        installed_record = distribution.read_text("RECORD")
        package_hashes[name] = {
            "version": distribution.version,
            "installed_RECORD_sha256": hashlib.sha256(installed_record.encode("utf-8")).hexdigest() if installed_record else None,
        }
        found = 0
        for item in sorted(distribution.files or [], key=str):
            filename = Path(distribution.locate_file(item))
            if _notice_file(item):
                if filename.is_file():
                    append(f"{name} {distribution.version}", str(item), filename.read_bytes())
                    found += 1
                else:
                    missing.append(f"{name}: {item}")
            # tkinterdnd2's MIT license covers its Python wrapper.  The native
            # TkDnD notices live in source comment blocks in the actual wheel.
            if name.lower() == "tkinterdnd2" and filename.suffix == ".tcl" and filename.is_file():
                data = filename.read_bytes()
                lines = []
                for line in data.splitlines(keepends=True):
                    if not line.strip() or line.lstrip().startswith(b"#"):
                        lines.append(line)
                    else:
                        break
                header = b"".join(lines)
                if b"copyright" in header.lower() and b"permission" in header.lower():
                    append(f"TkDnD bundled with {name} {distribution.version} (original comment header)",
                           str(item) + ".notice", header,
                           {"source_file": str(item), "source_sha256": hashlib.sha256(data).hexdigest(),
                            "selection": "complete leading comment block"})
        if not found:
            missing.append(name)

    python_license, python_text = None, ""
    for filename in (Path(sys.base_prefix) / "LICENSE.txt", Path(sys.base_prefix) / "LICENSE",
                     Path(sysconfig.get_path("stdlib")) / "LICENSE.txt"):
        if filename.is_file():
            python_license = filename
            python_text = _read_text(filename.read_bytes())[0]
            append(f"CPython {platform.python_version()} (complete installed license, including bundled notices)",
                   f"Python-runtime/{filename.name}", filename.read_bytes())
            break
    if python_license is None:
        missing.append("CPython runtime license")

    import tkinter
    interpreter = tkinter.Tcl()
    tcl_library = Path(interpreter.eval("info library"))
    runtime_roots = [tcl_library, tcl_library.parent / f"tk{tkinter.TkVersion}"]
    normalized_python_license = " ".join(python_text.split())
    runtime_notice_sources = []
    for directory in runtime_roots:
        found = 0
        if directory.is_dir():
            for filename in sorted(directory.rglob("*")):
                if filename.is_file() and _notice_file(filename):
                    append(f"Tcl/Tk {directory.name}",
                           f"Python-runtime/tcl/{directory.name}/{filename.relative_to(directory).as_posix()}",
                           filename.read_bytes())
                    found += 1
        # Windows CPython's combined license includes Tcl's complete terms,
        # although its tcl8.6 directory has no separate license. Record a
        # missing source unless that actual installed fallback is present.
        combined_marker = ("This software is copyrighted by the Regents of the University of California, "
                           "Sun Microsystems, Inc., Scriptics Corporation, ActiveState Corporation" +
                           (", Apple Inc. and other parties." if directory.name.startswith("tk") else " and other parties."))
        combined = combined_marker in normalized_python_license
        runtime_notice_sources.append({"component": directory.name, "standalone_notice_files": found,
                                       "installed_python_combined_notice": combined})
        if not found and not combined:
            missing.append(f"Tcl/Tk {directory.name} license (directory or installed combined license)")

    # Supplement runtime/wheel files with pinned original upstream license
    # texts. The manifest states the exact source and any excerpt boundary.
    # It is provenance data and never substitutes for the full texts above.
    sources = root / "scripts/licenses/sources.json"
    if sources.is_file():
        for entry in json.loads(sources.read_text(encoding="utf-8")):
            filename = sources.parent / entry["file"]
            data = filename.read_bytes()
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise SystemExit(f"Upstream license snapshot changed: {filename}")
            append(entry["component"] + " (upstream license supplement)", entry["file"], data, entry)

    if (target or sys.platform) == "linux":
        for package in ("libtcl8.6", "libtk8.6", "libfontconfig1", "libfreetype6", "libxft2",
                        "libxrender1", "libx11-6", "libxext6", "libexpat1", "libpng16-16"):
            filename = Path("/usr/share/doc") / package / "copyright"
            if filename.is_file():
                append(f"Ubuntu system library: {package}", f"usr/share/doc/{package}/copyright", filename.read_bytes())
        for filename in sorted((root / "platforms/linux/licenses").glob("*")):
            if filename.is_file():
                append(f"AppImage runtime: {filename.name}", f"platforms/linux/licenses/{filename.name}", filename.read_bytes())

    native = inspect_lxml()
    unresolved_iconv = native["iconv_enabled"] or not native["feature_metadata_available"]
    source_kit = None
    if unresolved_iconv and release_check and target == "windows":
        from windows_source_kit import prepare_source_kit
        prepared = prepare_source_kit(root, output, native)
        if prepared is not None:
            source_kit, original_native_notices = prepared
            for label, filename, data in original_native_notices:
                append(label, filename, data)
    if source_kit is None:
        obsolete_kit = output / "MLAFMT-SOURCE-KIT.zip"
        if obsolete_kit.is_file() and obsolete_kit.resolve().parent == output:
            obsolete_kit.unlink()
    ready = (not unresolved_iconv or source_kit is not None) and not missing
    audit = {
        "schema_version": 1, "python": platform.python_version(), "platform": target or sys.platform,
        "packages": packages, "package_records": package_hashes, "lxml_native": native,
        "release_dependency_check": ("pinned Windows wheel with complete source/relink kit" if source_kit else
                                     "blocked: GNU iconv source/relink materials unresolved" if unresolved_iconv else
                                     "no iconv dependency reported"),
        "release_ready": ready,
        "release_ready_meaning": "Engineering checks for license texts and selected source/relink materials only; not third-party legal certification.",
        "source_kit": source_kit,
        "tcl_tk_notice_sources": runtime_notice_sources,
        "missing_license_texts": missing,
        "scope": "Installed wheel texts, Python/Tcl/Tk notices, pinned upstream supplements and recorded native imports. This inventory is not legal clearance.",
    }
    (output / "license-manifest.json").write_text(json.dumps({"schema_version": 1, "texts": records},
                                                          ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "license-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    introduction = (
        "MLAFMT THIRD-PARTY NOTICES\n\n"
        "MLAFMT is distributed under the MIT License; see LICENSE.\n"
        "The original license and copyright texts below retain their own terms.\n"
        "Installed build-tool notices are included for traceability; their presence\n"
        "does not state that every build tool is included in the application.\n"
        "Byte-preserved copies and source hashes accompany this file in licenses/\n"
        "and license-manifest.json. Native versions are recorded in license-audit.json.\n"
    )
    if source_kit:
        introduction += ("\nGNU libiconv is used by lxml; the library and its use are covered by\n"
                         "the GNU Lesser General Public License, version 2.1 or later.\n"
                         "The complete source/relink kit accompanies this build as\n"
                         "MLAFMT-SOURCE-KIT.zip. Use Help > Save corresponding source in the app\n"
                         "or read that ZIP beside the application. See its REBUILD.txt and\n"
                         "source-kit-manifest.json for source matching evidence and known limits.\n")
    elif unresolved_iconv:
        introduction += ("\nDEVELOPMENT BUILD: the installed lxml enables iconv. Including these texts\n"
                         "does not resolve static LGPL source/relink requirements. This dependency\n"
                         "configuration has not passed the release build policy.\n")
    (output / NOTICE_NAME).write_text(introduction + "".join(sections), encoding="utf-8")
    if release_check and not ready:
        detail = "; missing texts: " + ", ".join(missing) if missing else ""
        raise SystemExit("Release dependency check failed" + detail + ". "
                         "Build/install scripts/build_lxml_no_iconv.py's wheel, then prepare again. "
                         "Development preparation remains available without --release-check. "
                         "See license-audit.json; notice texts alone do not resolve LGPL relinking requirements.")
    return packages
