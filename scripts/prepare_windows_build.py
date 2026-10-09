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
import zlib


def source_version(root):
    source = (root / "mla_formatter.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__\s*=\s*[\'"]([0-9]+\.[0-9]+\.[0-9]+)[\'"]', source, re.M)
    if not match:
        raise SystemExit("mla_formatter.py must define a semantic __version__.")
    return match.group(1)


def _inside_polygon(x, y, points):
    inside = False
    previous = points[-1]
    for current in points:
        ax, ay = previous
        bx, by = current
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
        previous = current
    return inside


def icon_png(size):
    """Draw a paper-white M on a rounded indigo tile, with a folded corner."""
    paper, indigo, fold = (249, 247, 241, 255), (36, 48, 88, 255), (111, 137, 181, 255)
    letter = [(0.24, 0.73), (0.24, 0.28), (0.34, 0.28), (0.50, 0.50),
              (0.66, 0.28), (0.76, 0.28), (0.76, 0.73), (0.65, 0.73),
              (0.65, 0.47), (0.50, 0.67), (0.35, 0.47), (0.35, 0.73)]
    rows = bytearray()
    for row in range(size):
        rows.append(0)
        for column in range(size):
            x, y = (column + 0.5) / size, (row + 0.5) / size
            dx, dy = max(abs(x - 0.5) - 0.30, 0), max(abs(y - 0.5) - 0.30, 0)
            color = indigo if dx * dx + dy * dy <= 0.18 ** 2 else (0, 0, 0, 0)
            if color[3] and x > 0.77 and y < 0.23 and x - y > 0.62:
                color = fold
            if _inside_polygon(x, y, letter):
                color = paper
            rows.extend(color)

    def chunk(kind, value):
        data = kind + value
        return struct.pack(">I", len(value)) + data + struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b""))


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
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    if args.verify_dependencies:
        for line in (root / "requirements-build.txt").read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#") or ('sys_platform == "win32"' in line and sys.platform != "win32"):
                continue
            name, expected = line.split(";", 1)[0].strip().split("==", 1)
            try:
                actual = importlib.metadata.version(name)
            except importlib.metadata.PackageNotFoundError:
                actual = "missing"
            if actual != expected:
                raise SystemExit(f"{name}: expected {expected}, found {actual}. Rebuild with -InstallDependencies.")
    output.mkdir(parents=True, exist_ok=True)
    version = source_version(root)
    numeric = ", ".join(version.split(".") + ["0"])
    resource = f"""VSVersionInfo(
    ffi=FixedFileInfo(filevers=({numeric}), prodvers=({numeric}),
        mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
    kids=[StringFileInfo([StringTable('040904B0', [
        StringStruct('CompanyName', 'MLAFMT'),
        StringStruct('FileDescription', 'MLAFMT - MLA Essay Formatter'),
        StringStruct('FileVersion', '{version}'),
        StringStruct('InternalName', 'MLAFMT'),
        StringStruct('LegalCopyright', 'MIT License'),
        StringStruct('OriginalFilename', 'MLAFMT.exe'),
        StringStruct('ProductName', 'MLAFMT'),
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
    source_files = ["mla_gui.py", "mla_formatter.py", "requirements-build.txt",
                    "scripts/build_windows.ps1", "scripts/prepare_windows_build.py",
                    "scripts/hooks/hook-tkinterdnd2.py"]
    git_status = git_output(root, "status", "--porcelain", "--untracked-files=normal")
    metadata = {
        "application": "MLAFMT", "version": version, "platform": platform.platform(),
        "python": platform.python_version(), "architecture": platform.machine(),
        "commit": git_output(root, "rev-parse", "HEAD"),
        "working_tree_dirty": None if git_status is None else bool(git_status),
        "packages": {item.metadata["Name"]: item.version for item in sorted(
            importlib.metadata.distributions(), key=lambda item: item.metadata["Name"].lower())},
        "source_sha256": {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in source_files},
    }
    (output / "build-info.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(version)


if __name__ == "__main__":
    main()
