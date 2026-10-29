#!/usr/bin/env python3
"""Build the static, browser-local FormCapy site.

The output directory is self-contained: HTML, the shared transport, the module
Worker, the project's Python core, a pinned Pyodide runtime, the pinned
python-docx wheel, license notices, an integrity manifest and an offline app
shell. No server-side Python is required to serve it.

    python scripts/build_browser_static.py
    python scripts/build_browser_static.py --out dist/browser-local --refresh
    python -m http.server 8080 --directory dist/browser-local

Downloads are cached in browser/.cache (git-ignored). Every runtime file is
checked against the sizes and SHA-256 digests pinned in browser/runtime.json
before it is copied into the output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from prepare_office_runtime import prepare as prepare_office_runtime

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / "browser"
CACHE = BROWSER / ".cache"
PYTHON_MODULES = (
    "mla_formatter.py",
    "format_profiles.py",
    "docx_preserve.py",
    "browser_bridge.py",
    "bibliography_export.py",
    "document_conversion.py",
)
STATIC_ASSETS = (
    "transport.js", "template-share.js", "template-sharing-ui.js", "capybara-64.png",
    "update-notice.js", "citation-library.js", "citation-import.js", "citation-lookup.js",
    "citation-doi-batch.js", "citation-export.js", "citation-engine.js",
    "citation-assistant.js", "citation-assistant.css",
    "local-office.js", "document-converter.js", "document-converter.css",
    "converter-page.js", "converter-page.css",
)
MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_DOCX_EXPANDED = 80 * 1024 * 1024
MAX_DOCX_ENTRIES = 2000
MATERIALS_FILE_LIMIT = 25 * 1024 * 1024


class BuildError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(path: Path, entry: dict, label: str) -> None:
    if not path.is_file():
        raise BuildError(f"missing {label}: {path}")
    size = path.stat().st_size
    if size != entry["size"]:
        raise BuildError(f"{label} size mismatch: expected {entry['size']}, got {size}")
    digest = sha256(path)
    if digest != entry["sha256"]:
        raise BuildError(f"{label} SHA-256 mismatch: expected {entry['sha256']}, got {digest}")


def download(url: str, destination: Path, entry: dict, refresh: bool = False) -> None:
    if destination.is_file() and not refresh:
        try:
            verify(destination, entry, destination.name)
            return
        except BuildError:
            destination.unlink(missing_ok=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".part")
    request = urllib.request.Request(
        url, headers={"User-Agent": "FormCapy-browser-static-build/1"}
    )
    print(f"  downloading {destination.name} ({entry['size'] / 1048576:.1f} MiB)")
    try:
        with urllib.request.urlopen(request, timeout=180) as response, open(
            temporary, "wb"
        ) as target:
            shutil.copyfileobj(response, target, length=1024 * 1024)
        verify(temporary, entry, destination.name)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def project_version() -> str:
    text = (ROOT / "mla_formatter.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__ = "([0-9]+\.[0-9]+\.[0-9]+)"', text, re.M)
    if not match:
        raise BuildError("cannot read __version__ from mla_formatter.py")
    return match.group(1)


def project_license() -> str:
    return (ROOT / "LICENSE").read_text(encoding="utf-8")


def materials_fingerprint() -> tuple[str, str]:
    return (
        sha256(BROWSER / "runtime-sources.json"),
        sha256(BROWSER / "runtime.json"),
    )


def materials_compatible(directory: Path) -> bool:
    """True only for a complete collection matching the current source pins."""
    if not directory.is_dir() or (directory / "COLLECTION-INCOMPLETE.txt").exists():
        return False
    manifest_path = directory / "SOURCE-MANIFEST.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    source_hash, runtime_hash = materials_fingerprint()
    return (
        manifest.get("status") == "collected-not-rebuilt"
        and manifest.get("rebuild_performed") is False
        and manifest.get("input_source_manifest_sha256") == source_hash
        and manifest.get("input_runtime_manifest_sha256") == runtime_hash
    )


def ensure_materials(choice: str, version: str, refresh: bool) -> Path | None:
    """Return a complete source-material directory, collecting it if needed."""
    if choice == "none":
        return None
    if choice != "auto":
        directory = Path(choice).resolve()
        if not materials_compatible(directory):
            raise BuildError(
                f"runtime materials at {directory} are incomplete or do not match "
                "the current browser/runtime-sources.json and browser/runtime.json"
            )
        return directory
    cache_root = CACHE / "runtime-materials"
    if cache_root.is_dir() and not refresh:
        for manifest in sorted(cache_root.glob("*/SOURCE-MANIFEST.json")):
            if materials_compatible(manifest.parent):
                return manifest.parent
    source_hash, runtime_hash = materials_fingerprint()
    # New pure-Python wheels change the runtime inventory without changing
    # upstream source pins. Keep earlier release materials intact.
    output = cache_root / f"{version}-{source_hash[:12]}-{runtime_hash[:12]}"
    if output.exists():
        if materials_compatible(output) and not refresh:
            return output
        if not refresh:
            raise BuildError(
                f"{output} exists without matching complete materials; "
                "pass --refresh-materials to recollect"
            )
        shutil.rmtree(output)
    collector = ROOT / "scripts" / "collect_browser_runtime_materials.py"
    if not collector.is_file():
        raise BuildError(
            "scripts/collect_browser_runtime_materials.py is required to include "
            "runtime source materials; pass --runtime-materials none to skip"
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    cache = CACHE / "runtime-sources"
    cache.mkdir(parents=True, exist_ok=True)
    print(f"  collecting pinned runtime source materials -> {output}")
    subprocess.run(
        [
            sys.executable,
            str(collector),
            "--runtime-version",
            version,
            "--output",
            str(output),
            "--cache",
            str(cache),
        ],
        check=True,
    )
    if not materials_compatible(output):
        raise BuildError("runtime source material collection did not complete")
    return output


def copy_materials(source: Path, destination: Path) -> dict:
    manifest = json.loads((source / "SOURCE-MANIFEST.json").read_text(encoding="utf-8"))
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    total = 0
    for entry in manifest["files"]:
        relative = PurePosixPath(entry["path"])
        if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
            raise BuildError(f"unsafe runtime material path: {entry['path']}")
        if entry["size"] >= MATERIALS_FILE_LIMIT:
            raise BuildError(f"runtime material reaches the 25 MiB ceiling: {entry['path']}")
        verify(source.joinpath(*relative.parts), entry, f"runtime material {entry['path']}")
        target = destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source.joinpath(*relative.parts), target)
        total += entry["size"]
    manifest_path = source / "SOURCE-MANIFEST.json"
    if manifest_path.stat().st_size >= MATERIALS_FILE_LIMIT:
        raise BuildError("SOURCE-MANIFEST.json reaches the 25 MiB ceiling")
    shutil.copyfile(manifest_path, destination / "SOURCE-MANIFEST.json")
    total += manifest_path.stat().st_size
    return {
        "status": manifest["status"],
        "rebuild_performed": bool(manifest["rebuild_performed"]),
        "sources": len(manifest["sources"]),
        "files": len(manifest["files"]) + 1,
        "total_bytes": total,
        "source_manifest_sha256": sha256(manifest_path),
        "publication_file_limit_bytes": MATERIALS_FILE_LIMIT,
    }


def note_materials(out: Path, info: dict | None) -> None:
    notices = out / "THIRD-PARTY-NOTICES.txt"
    text = notices.read_text(encoding="utf-8")
    if info:
        text += (
            "\n" + "=" * 78 + "\n"
            "Browser runtime source inventory\n"
            "=" * 78 + "\n\n"
            "Original source archives, recipe/build declarations and selected original\n"
            "notice bytes are published under licenses/runtime-materials/. Start at\n"
            "licenses/runtime-materials/index.html; hashes and provenance are in\n"
            "licenses/runtime-materials/SOURCE-MANIFEST.json and rebuild notes are in\n"
            "licenses/runtime-materials/REBUILD.md.\n\n"
            f"Collection status: {info['status']}\n"
            f"Native/WASM rebuild performed by the collector: {info['rebuild_performed']}\n"
            f"Sources: {info['sources']} · publication files: {info['files']}\n"
            f"Each publication file is below {MATERIALS_FILE_LIMIT // 1048576} MiB.\n"
        )
    else:
        text += (
            "\n" + "=" * 78 + "\n"
            "Browser runtime source inventory: NOT INCLUDED\n"
            "=" * 78 + "\n\n"
            "This build omits licenses/runtime-materials/. Do not present it as a complete\n"
            "source-compliance artifact; rebuild with runtime materials included.\n"
        )
    notices.write_text(text, encoding="utf-8")


def ensure_runtime(runtime: dict, refresh: bool) -> tuple[Path, str, str]:
    pyodide = runtime["pyodide"]
    version = pyodide["version"]
    cache_root = CACHE / "pyodide" / version
    core = pyodide["core"]
    archive = cache_root / f"pyodide-core-{version}.tar.bz2"
    download(core["url"], archive, core, refresh)

    target = cache_root / "core"
    needed = [(target / item["path"], item) for item in core["files"]]
    usable = all(path.is_file() for path, _ in needed) and not refresh
    if usable:
        try:
            for path, entry in needed:
                verify(path, entry, f"Pyodide {entry['path']}")
        except BuildError:
            usable = False
    if not usable:
        print(f"  extracting Pyodide {version} core")
        temporary = cache_root / "core.tmp"
        shutil.rmtree(temporary, ignore_errors=True)
        temporary.mkdir(parents=True)
        with tarfile.open(archive, "r:bz2") as archive_file:
            archive_file.extractall(temporary, filter="data")
        extracted = temporary / "pyodide"
        if not extracted.is_dir():
            raise BuildError("pyodide-core archive has an unexpected layout")
        for path, entry in needed:
            verify(temporary / "pyodide" / entry["path"], entry, f"Pyodide {entry['path']}")
        shutil.rmtree(target, ignore_errors=True)
        extracted.rename(target)
        shutil.rmtree(temporary, ignore_errors=True)
    return cache_root, pyodide, version


def wheel_licenses(path: Path) -> list[tuple[str, bytes]]:
    found = []
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = info.filename
            lower = name.lower()
            base = lower.rsplit("/", 1)[-1]
            if (
                "/licenses/" in lower
                or base.startswith(("license", "copying", "notice"))
            ):
                found.append((name, archive.read(info)))
    return found


def collect_licenses(out: Path, catalog: dict, wheels: list[tuple[str, Path]], version: str) -> None:
    licenses_dir = out / "licenses"
    licenses_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "LICENSE", out / "LICENSE.txt")

    sections = [
        "FormCapy (MLAFMT) browser-local build — third-party copyright and license notices",
        f"Application version: {version}",
        "",
        "This build bundles a pinned Pyodide runtime, CPython, lxml, python-docx",
        "and typing_extensions. The application source is licensed under the",
        "project LICENSE reproduced below.",
        "",
    ]

    def section(title: str, source: str, body: str) -> None:
        sections.extend(
            [
                "",
                "=" * 78,
                title,
                f"Source: {source}",
                "=" * 78,
                "",
                body.rstrip() + "\n",
            ]
        )

    section("FormCapy / MLAFMT", "repository LICENSE", project_license())

    for entry in catalog.get("entries", []):
        source = BROWSER / "licenses" / entry["file"]
        verify(source, entry, f"license {entry['file']}")
        shutil.copyfile(source, licenses_dir / entry["file"])
        section(
            f"{entry['name']} {entry['version']} — {entry['license']}",
            entry["source"],
            source.read_text(encoding="utf-8"),
        )

    for wheel_name, wheel_path in wheels:
        entries = wheel_licenses(wheel_path)
        wheel_dir = licenses_dir / "wheels" / wheel_path.stem
        if not entries:
            sections.extend(
                [
                    "",
                    "=" * 78,
                    f"{wheel_name} — license text not found inside the wheel",
                    f"Wheel: {wheel_name}",
                    "=" * 78,
                ]
            )
            continue
        for name, data in entries:
            safe = name.replace("/", "__")
            wheel_dir.mkdir(parents=True, exist_ok=True)
            (wheel_dir / safe).write_bytes(data)
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                text = data.decode("latin-1", errors="replace")
            section(f"{wheel_name} — {name}", f"wheel: {wheel_name}", text)

    (out / "THIRD-PARTY-NOTICES.txt").write_text("\n".join(sections) + "\n", encoding="utf-8")


def write_headers(out: Path) -> None:
    (out / "_headers").write_text(
        """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/sw.js
  Cache-Control: no-cache
/static/*
  Cache-Control: public, max-age=0, must-revalidate
/browser/*
  Cache-Control: public, max-age=0, must-revalidate
/python/*
  Cache-Control: public, max-age=0, must-revalidate
/manifest.json
  Cache-Control: public, max-age=0, must-revalidate
/runtime/*
  Cache-Control: public, max-age=31536000, immutable
/wheels/*
  Cache-Control: public, max-age=31536000, immutable
""",
        encoding="utf-8",
    )


def file_entries(root: Path) -> list[dict]:
    entries = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.name == "manifest.json":
            continue
        entries.append(
            {
                "path": path.relative_to(root).as_posix(),
                "size": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    return entries


def precache_paths(entries: list[dict]) -> list[str]:
    prefixes = ("index.html", "converter.html", "static/", "browser/", "python/", "runtime/", "wheels/")
    return sorted(
        "./" if entry["path"] == "index.html" else "./" + entry["path"]
        for entry in entries
        if entry["path"].startswith(prefixes)
        and not entry["path"].startswith("runtime/office/")
    )


def browser_page(name: str, version: str, runtime_version: str, offline: bool, materials: bool) -> str:
    """Render either standalone tool at the same static application root."""
    html = (ROOT / "templates" / name).read_text(encoding="utf-8")
    if "{{ version }}" not in html or (name == "index.html" and "{{ today }}" not in html):
        raise BuildError(f"{name} is missing its required build placeholders")
    html = (html.replace("{{ version }}", version).replace("{{ today }}", "")
            .replace("{{ public_server }}", "false"))
    mode_tags = re.findall(r'<meta name="mlafmt-mode" content="(?:server|browser)" />', html)
    if len(mode_tags) != 1:
        raise BuildError(f"{name} must contain exactly one transport mode meta tag")
    html = html.replace(mode_tags[0], '<meta name="mlafmt-mode" content="browser" />')
    replacements = {
        '<meta name="formcapy-offline" content="false" />': f'<meta name="formcapy-offline" content="{str(offline).lower()}" />',
        '<meta name="mlafmt-runtime" content="" />': f'<meta name="mlafmt-runtime" content="{runtime_version}" />',
        '<meta name="mlafmt-materials" content="none" />': f'<meta name="mlafmt-materials" content="{"included" if materials else "none"}" />',
    }
    for original, rendered in replacements.items():
        if html.count(original) != 1:
            raise BuildError(f"{name} must contain exactly one {original}")
        html = html.replace(original, rendered)
    if "{{" in html or "{%" in html:
        raise BuildError(f"Jinja placeholder remained in {name}")
    return html


def build(
    out: Path,
    refresh: bool,
    offline: bool,
    headers: bool,
    materials_choice: str,
    refresh_materials: bool,
) -> dict:
    citation_check = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "verify_citation_assets.py")],
        capture_output=True, text=True, check=False,
    )
    if citation_check.returncode:
        raise BuildError("citation asset verification failed: " + (citation_check.stderr or citation_check.stdout)[-1500:])
    version = project_version()
    runtime = json.loads((BROWSER / "runtime.json").read_text(encoding="utf-8"))
    catalog = json.loads((BROWSER / "licenses.json").read_text(encoding="utf-8"))
    cache_root, pyodide, pyodide_version = ensure_runtime(runtime, refresh)
    materials_source = ensure_materials(materials_choice, pyodide_version, refresh_materials)

    if out.exists():
        shutil.rmtree(out)
    (out / "static").mkdir(parents=True)
    (out / "browser").mkdir()
    (out / "python").mkdir()
    (out / "runtime" / "pyodide" / pyodide_version).mkdir(parents=True)
    (out / "wheels").mkdir()

    for name in ("index.html", "converter.html"):
        html = browser_page(name, version, pyodide_version, offline, bool(materials_source))
        (out / name).write_text(html, encoding="utf-8")

    for name in STATIC_ASSETS:
        shutil.copyfile(ROOT / "static" / name, out / "static" / name)
    # Citation styles, locale, original processor source and license notices
    # are served locally with the application, including its offline cache.
    shutil.copytree(ROOT / "static" / "vendor" / "citations", out / "static" / "vendor" / "citations")
    shutil.copyfile(BROWSER / "worker.js", out / "browser" / "worker.js")
    for name in ("office-frame.html", "office-frame.js", "office-thread.js"):
        shutil.copyfile(BROWSER / name, out / "browser" / name)
    for name in PYTHON_MODULES:
        shutil.copyfile(ROOT / name, out / "python" / name)

    # Pinned Pyodide core and packages. The 314.x distribution keeps package
    # wheels next to pyodide-lock.json rather than in a packages/ directory.
    runtime_out = out / "runtime" / "pyodide" / pyodide_version
    for item in pyodide["core"]["files"]:
        source = cache_root / "core" / item["path"]
        verify(source, item, f"Pyodide {item['path']}")
        shutil.copyfile(source, runtime_out / item["path"])
    wheels: list[tuple[str, Path]] = []
    for package in pyodide["packages"]:
        wheel_path = cache_root / package["file"]
        download(package["url"], wheel_path, package, refresh)
        shutil.copyfile(wheel_path, runtime_out / package["file"])
        wheels.append((package["file"], wheel_path))
    for wheel in runtime["wheels"]:
        wheel_path = cache_root / wheel["file"]
        download(wheel["url"], wheel_path, wheel, refresh)
        shutil.copyfile(wheel_path, out / "wheels" / wheel["file"])
        wheels.append((wheel["file"], wheel_path))

    collect_licenses(out, catalog, wheels, version)
    # The large office engine is integrity-pinned and hosted alongside the app.
    # It is loaded only after an explicit conversion, never in the app precache.
    office_runtime = prepare_office_runtime(out, refresh=refresh)
    with (out / "THIRD-PARTY-NOTICES.txt").open("a", encoding="utf-8") as notice:
        notice.write("\n" + "=" * 78 + "\nLocal LibreOffice WebAssembly conversion engine\n" + "=" * 78 + "\n\n")
        notice.write((out / "licenses" / "office" / "README.txt").read_text(encoding="utf-8"))
        notice.write("\nOriginal license texts and source inventory: licenses/office/\n")
    with (out / "THIRD-PARTY-NOTICES.txt").open("a", encoding="utf-8") as notice:
        notice.write("\n" + "=" * 78 + "\nCitation processor, styles and locale\n" + "=" * 78 + "\n\n")
        citation_dir = ROOT / "static" / "vendor" / "citations"
        for name in ("NOTICE.txt", "citeproc-LICENSE.txt", "CPAL-1.0.txt", "AGPL-3.0.txt", "CC-BY-SA-3.0.txt"):
            notice.write(f"\n--- static/vendor/citations/{name} ---\n\n")
            notice.write((citation_dir / name).read_text(encoding="utf-8") + "\n")
    materials_info = None
    if materials_source:
        materials_info = copy_materials(
            materials_source, out / "licenses" / "runtime-materials"
        )
        materials_info["path"] = "licenses/runtime-materials/SOURCE-MANIFEST.json"
    note_materials(out, materials_info)

    entries = file_entries(out)
    # Include the unexpanded template in the cache identity: changing only SW
    # behavior must select a fresh cache without hashing its own generated name.
    template = (BROWSER / "sw.js").read_text(encoding="utf-8") if offline else ""
    if offline and ("__CACHE_VERSION__" not in template or "__PRECACHE__" not in template):
        raise BuildError("sw.js template is missing its build markers")
    digest = hashlib.sha256(
        json.dumps(
            {
                "files": [(entry["path"], entry["size"], entry["sha256"]) for entry in entries],
                "service_worker_template": template,
            },
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    cache_name = f"formcapy-{version}-pyodide-{pyodide_version}-{digest[:12]}"
    precache = precache_paths(entries)

    if offline:
        worker = template.replace("__CACHE_VERSION__", cache_name).replace(
            "__PRECACHE__", json.dumps(precache, indent=2)
        )
        (out / "sw.js").write_text(worker, encoding="utf-8")
        if "__CACHE_VERSION__" in worker or "__PRECACHE__" in worker:
            raise BuildError("sw.js build markers were not replaced")

    if headers:
        write_headers(out)

    entries = file_entries(out)
    application_bytes = sum(
        entry["size"] for entry in entries
        if not entry["path"].startswith("licenses/runtime-materials/")
    )
    manifest = {
        "schema": 1,
        "application": {"name": "FormCapy", "project": "MLAFMT", "version": version},
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "runtime": {
            "name": "Pyodide",
            "version": pyodide_version,
            "python": pyodide["python"],
            "source": pyodide["core"]["url"],
            "packages": [
                {
                    "name": package["name"],
                    "version": package["version"],
                    "file": package["file"],
                    "sha256": package["sha256"],
                }
                for package in pyodide["packages"] + runtime["wheels"]
            ],
        },
        "limits": {
            "max_input_bytes": MAX_FILE_SIZE,
            "max_docx_expanded_bytes": MAX_DOCX_EXPANDED,
            "max_docx_entries": MAX_DOCX_ENTRIES,
            "max_conversion_output_bytes": 80 * 1024 * 1024,
            "max_pdf_pages": 200,
        },
        "office_runtime": {
            "id": office_runtime["id"],
            "manifest": "runtime/office/runtime.json",
            "initial_memory_mib": office_runtime["initialMemoryMiB"],
            "loaded_on_explicit_conversion_only": True,
            "precache": False,
            "license_and_source_inventory": "licenses/office/SOURCE-INVENTORY.json",
        },
        "offline": {
            "service_worker": bool(offline),
            "scope": "./",
            "caches_user_documents": False,
        },
        "runtime_materials": {
            "included": materials_info is not None,
            "path": materials_info["path"] if materials_info else None,
            "status": materials_info["status"] if materials_info else None,
            "rebuild_performed": materials_info["rebuild_performed"] if materials_info else None,
            "sources": materials_info["sources"] if materials_info else 0,
            "files": materials_info["files"] if materials_info else 0,
            "total_bytes": materials_info["total_bytes"] if materials_info else 0,
            "source_manifest_sha256": (
                materials_info["source_manifest_sha256"] if materials_info else None
            ),
            "note": (
                "Pinned original source archives and notices are included. The "
                "collector did not perform or certify a native/WASM rebuild."
                if materials_info else
                "Not included: this artifact is not a complete source-compliance bundle."
            ),
        },
        "cache_version": cache_name,
        "precache": precache,
        "files": entries,
        "application_bytes": application_bytes,
        "total_bytes": sum(entry["size"] for entry in entries),
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "dist" / "browser-local",
        help="output directory (default: dist/browser-local)",
    )
    parser.add_argument(
        "--refresh", action="store_true", help="re-download and re-extract pinned files"
    )
    parser.add_argument(
        "--runtime-materials",
        default="auto",
        metavar="auto|none|DIR",
        help=(
            "include the pinned source/notice bundle: auto (collect or reuse the "
            "cache), none, or an existing collector output directory"
        ),
    )
    parser.add_argument(
        "--refresh-materials",
        action="store_true",
        help="re-run the runtime source collector instead of reusing its cache",
    )
    parser.add_argument(
        "--no-offline", action="store_true", help="omit the service worker app shell"
    )
    parser.add_argument(
        "--no-headers", action="store_true", help="omit the Cloudflare Pages _headers file"
    )
    parser.add_argument(
        "--check", action="store_true", help="verify the built manifest and exit"
    )
    args = parser.parse_args(argv)
    started = time.time()
    try:
        manifest = build(
            args.out.resolve(),
            args.refresh,
            not args.no_offline,
            not args.no_headers,
            args.runtime_materials,
            args.refresh_materials,
        )
    except (BuildError, OSError, urllib.error.URLError, tarfile.TarError, zipfile.BadZipFile) as error:
        print(f"BUILD FAILED: {error}", flush=True)
        return 1
    if args.check:
        for entry in manifest["files"]:
            path = args.out / entry["path"]
            verify(path, entry, entry["path"])
    total = manifest["total_bytes"] / 1048576
    print(f"\nBuilt {args.out}")
    print(f"  version:       {manifest['application']['version']}")
    print(f"  Pyodide:       {manifest['runtime']['version']} / Python {manifest['runtime']['python']}")
    print(f"  files:         {len(manifest['files'])}")
    print(f"  app size:      {manifest['application_bytes'] / 1048576:.1f} MiB")
    if manifest["runtime_materials"]["included"]:
        print(f"  source kit:    {manifest['runtime_materials']['total_bytes'] / 1048576:.1f} MiB "
              f"({manifest['runtime_materials']['sources']} sources, "
              f"status {manifest['runtime_materials']['status']})")
        print("                 native/WASM rebuild NOT performed")
    else:
        print("  source kit:    NOT INCLUDED (not a complete source-compliance artifact)")
    print(f"  total size:    {total:.1f} MiB")
    print(f"  cache version: {manifest['cache_version']}")
    print(f"  elapsed:       {time.time() - started:.1f}s")
    print(f"  preview:       python scripts/preview_local.py --port 8080 --directory \"{args.out}\"")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
