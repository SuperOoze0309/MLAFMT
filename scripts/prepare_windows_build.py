"""Generate Windows metadata/icon from the source version without extra libraries."""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import re
import struct
import subprocess
import sys

from license_notices import write_notices


def source_version(root):
    source = (root / "mla_formatter.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__\s*=\s*[\'"]([0-9]+\.[0-9]+\.[0-9]+)[\'"]', source, re.M)
    if not match:
        raise SystemExit("mla_formatter.py must define a semantic __version__.")
    return match.group(1)


def icon_png(size):
    """Use the same capybara artwork for each platform's icon container."""
    path = Path(__file__).resolve().parents[1] / "assets/icons" / f"capybara-{size}.png"
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", data[16:24]) != (size, size):
        raise ValueError(f"Invalid application icon asset: {path}")
    return data


def write_icon(path):
    sizes = [16, 32, 48, 256]
    images = [icon_png(size) for size in sizes]
    offset = 6 + 16 * len(sizes)
    directory = bytearray(struct.pack("<HHH", 0, 1, len(sizes)))
    for size, data in zip(sizes, images):
        dimension = size if size < 256 else 0
        directory.extend(struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    path.write_bytes(bytes(directory) + b"".join(images))


def git_output(root, *arguments):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, text=True, check=False)
    except OSError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--verify-dependencies", action="store_true")
    parser.add_argument("--release-check", action="store_true")
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    if args.verify_dependencies:
        from packaging.requirements import Requirement
        for line in (root / "requirements-build.txt").read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            requirement = Requirement(line)
            if requirement.marker and not requirement.marker.evaluate():
                continue
            name, expected = requirement.name, str(requirement.specifier)
            try:
                actual = importlib.metadata.version(name)
            except importlib.metadata.PackageNotFoundError:
                actual = "missing"
            if actual == "missing" or not requirement.specifier.contains(actual, prereleases=True):
                raise SystemExit(f"{name}: expected {expected}, found {actual}. Rebuild with -InstallDependencies.")
    output.mkdir(parents=True, exist_ok=True)
    version = source_version(root)
    numeric = ", ".join(version.split(".") + ["0"])
    resource = f"""VSVersionInfo(
    ffi=FixedFileInfo(filevers=({numeric}), prodvers=({numeric}),
        mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
    kids=[StringFileInfo([StringTable('040904B0', [
        StringStruct('CompanyName', 'MLAFMT'),
        StringStruct('FileDescription', 'FormCapy - Document Formatter'),
        StringStruct('FileVersion', '{version}'),
        StringStruct('InternalName', 'MLAFMT'),
        StringStruct('LegalCopyright', 'MIT License'),
        StringStruct('OriginalFilename', 'MLAFMT.exe'),
        StringStruct('ProductName', 'FormCapy'),
        StringStruct('ProductVersion', '{version}')])]),
        VarFileInfo([VarStruct('Translation', [1033, 1200])])])
"""
    (output / "version-info.txt").write_text(resource, encoding="utf-8")
    write_icon(output / "MLAFMT.ico")
    changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
    release = re.search(rf"(?ms)^## v{re.escape(version)}\b[^\n]*\n.*?(?=^## |\Z)", changelog)
    if not release:
        raise SystemExit(f"CHANGELOG.md has no entry for v{version}.")
    (output / "release-notes.md").write_text(release.group(0).strip() + "\n", encoding="utf-8")
    packages = write_notices(root, output, target="windows", release_check=args.release_check)
    source_files = ["mla_gui.py", "mla_formatter.py", "format_profiles.py", "docx_preserve.py", "requirements-build.txt",
                    "document_conversion.py", "desktop_conversion.py", "requirements-conversion.txt",
                    "scripts/build_windows.ps1", "scripts/prepare_windows_build.py", "scripts/prepare_brand_assets.ps1",
                    "scripts/license_notices.py", "scripts/build_lxml_no_iconv.py", "scripts/lxml-no-iconv-sources.json",
                    "scripts/windows_source_kit.py", "scripts/rebuild_windows_source_kit.py", "scripts/lxml-windows-source-kit.json",
                    "scripts/hooks/hook-tkinterdnd2.py"]
    source_files += [str(path.relative_to(root)).replace("\\", "/") for path in sorted((root / "scripts/licenses").glob("*")) if path.is_file()]
    source_files += [path.relative_to(root).as_posix() for folder in (root / "static", root / "assets/icons")
                     for path in sorted(folder.glob("*")) if path.is_file()]
    git_status = git_output(root, "status", "--porcelain", "--untracked-files=normal")
    metadata = {
        "application": "MLAFMT", "application_display_name": "FormCapy", "version": version, "platform": platform.platform(),
        "python": platform.python_version(), "architecture": platform.machine(),
        "commit": git_output(root, "rev-parse", "HEAD"),
        "working_tree_dirty": None if git_status is None else bool(git_status),
        "packages": packages,
        "license_audit": json.loads((output / "license-audit.json").read_text(encoding="utf-8")),
        "license_files_sha256": {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                                 for name in ("THIRD-PARTY-NOTICES.txt", "license-manifest.json", "license-audit.json")},
        "source_sha256": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in source_files},
    }
    (output / "build-info.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(version)


if __name__ == "__main__":
    main()
