"""Prepare versioned macOS/Linux PyInstaller builds without importing the app."""

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import shutil
import struct
import subprocess
import sys
import sysconfig

from prepare_windows_build import icon_png


def source_version(root):
    text = (root / "mla_formatter.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__\s*=\s*[\'"]([0-9]+\.[0-9]+\.[0-9]+)[\'"]', text, re.M)
    if not match:
        raise SystemExit("mla_formatter.py must define a semantic __version__.")
    return match.group(1)


def git_output(root, *arguments):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, text=True)
    except OSError:
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def verify_dependencies(root):
    from packaging.requirements import Requirement

    for line in (root / "requirements-build.txt").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        requirement = Requirement(line)
        if requirement.marker and not requirement.marker.evaluate():
            continue
        try:
            actual = importlib.metadata.version(requirement.name)
        except importlib.metadata.PackageNotFoundError:
            actual = "missing"
        if actual == "missing" or not requirement.specifier.contains(actual):
            raise SystemExit(f"{requirement.name}: expected {requirement.specifier}, found {actual}.")


def _license_path(path):
    return any(re.match(r"^(licen[cs]e|copying|copyright|notice|authors)(\b|[-_.])", part, re.I)
               or part.lower() == "license.terms" for part in path.parts)


def write_notices(root, output):
    """Keep installed wheel license texts, Python/Tcl/Tk licenses and provenance."""
    notices = ["MLAFMT THIRD-PARTY NOTICES\n",
               "MLAFMT is distributed under the MIT License; see LICENSE.\n",
               "Build tool licenses are included for traceability. PyInstaller's bootloader\n"
               "exception permits distribution of the generated application.\n"]
    seen = set()
    packages = {}

    def append_text(label, filename):
        if not filename.is_file():
            return
        value = filename.read_text(encoding="utf-8", errors="replace")
        digest = hashlib.sha256(value.encode()).hexdigest()
        if digest not in seen:
            seen.add(digest)
            notices.append(f"\n{'=' * 72}\n{label}\n{'=' * 72}\n{value}\n")

    for distribution in sorted(importlib.metadata.distributions(),
                               key=lambda item: item.metadata["Name"].lower()):
        name = distribution.metadata["Name"]
        packages[name] = distribution.version
        identifier = distribution.metadata.get("License-Expression") or distribution.metadata.get("License") or "See license texts below"
        notices.append(f"\n{name} {distribution.version}: {identifier}\n")
        for item in distribution.files or []:
            if _license_path(Path(str(item))):
                append_text(f"{name}: {item}", Path(distribution.locate_file(item)))

    for candidate in [Path(sys.base_prefix) / "LICENSE.txt",
                      Path(sysconfig.get_path("stdlib")) / "LICENSE.txt"]:
        append_text(f"Python {platform.python_version()}: {candidate.name}", candidate)
    import tkinter

    interpreter = tkinter.Tcl()
    tcl_library = Path(interpreter.eval("info library"))
    roots = [tcl_library, tcl_library.parent / "tk8.6", tcl_library.parent / "tk9.0"]
    for candidate in roots:
        for name in ("license.terms", "LICENSE", "COPYRIGHT"):
            append_text(f"Tcl/Tk: {candidate.name}/{name}", candidate / name)
    if sys.platform == "linux":
        for package in ("libtcl8.6", "libtk8.6", "libfontconfig1", "libxft2", "libxrender1", "libx11-6"):
            append_text(f"Ubuntu system library: {package}", Path("/usr/share/doc") / package / "copyright")
        for path in sorted((root / "platforms/linux/licenses").glob("*")):
            append_text(f"AppImage runtime: {path.name}", path)
    (output / "THIRD-PARTY-NOTICES.txt").write_text("\n".join(notices), encoding="utf-8")
    return packages


def write_icons(output, target):
    (output / "MLAFMT.png").write_bytes(icon_png(256))
    if target == "macos":
        # Modern ICNS entries accept PNG payloads; no Pillow or shared /tmp files.
        contents = b""
        for size, tag in ((16, b"icp4"), (32, b"icp5"), (64, b"icp6"),
                          (128, b"ic07"), (256, b"ic08"), (512, b"ic09"), (1024, b"ic10")):
            data = icon_png(size)
            contents += tag + struct.pack(">I", len(data) + 8) + data
        (output / "MLAFMT.icns").write_bytes(b"icns" + struct.pack(">I", len(contents) + 8) + contents)


def write_spec(root, output, target, architecture, version):
    datas = [(str(output / "MLAFMT.png"), "."), (str(output / "documentation"), "documentation")]
    identity = os.environ.get("MLAFMT_CODESIGN_IDENTITY") or None
    entitlements = root / "platforms/macos/entitlements.plist"
    spec = f"""# Generated from mla_formatter.__version__; do not edit.
a = Analysis([{str(root / 'mla_gui.py')!r}], pathex=[{str(root)!r}],
    binaries=[], datas={datas!r}, hiddenimports=[],
    hookspath=[{str(root / 'scripts/hooks-desktop')!r}], hooksconfig={{}},
    runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='MLAFMT',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
    console=False, disable_windowed_traceback=False,
    target_arch={architecture if target == 'macos' else None!r},
    codesign_identity={identity if target == 'macos' else None!r},
    entitlements_file={str(entitlements) if target == 'macos' and identity else None!r})
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='MLAFMT')
"""
    if target == "macos":
        plist = {"CFBundleDisplayName": "MLAFMT", "CFBundleShortVersionString": version,
                 "CFBundleVersion": version, "LSMinimumSystemVersion": "14.0",
                 "NSHighResolutionCapable": True,
                 "NSHumanReadableCopyright": "MLAFMT contributors. MIT License.",
                 "NSDocumentsFolderUsageDescription": "Choose and save your essay documents.",
                 "NSDownloadsFolderUsageDescription": "Choose drafts and save formatted documents."}
        spec += f"""app = BUNDLE(coll, name='MLAFMT.app', icon={str(output / 'MLAFMT.icns')!r},
    bundle_identifier='com.mlafmt.app', version={version!r}, info_plist={plist!r})
"""
    (output / "MLAFMT.spec").write_text(spec, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--platform", choices=("macos", "linux"))
    parser.add_argument("--architecture", choices=("arm64", "x86_64"))
    parser.add_argument("--expected-version", default="")
    parser.add_argument("--verify-dependencies", action="store_true")
    parser.add_argument("--version-only", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    version = source_version(root)
    if args.expected_version and args.expected_version.removeprefix("v") != version:
        raise SystemExit(f"Source version {version} does not match expected version {args.expected_version}.")
    if args.version_only:
        print(version)
        return
    if not args.output or not args.platform or not args.architecture:
        parser.error("--output, --platform and --architecture are required to prepare a build")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if args.verify_dependencies:
        verify_dependencies(root)
    write_icons(output, args.platform)
    packages = write_notices(root, output)
    status = git_output(root, "status", "--porcelain", "--untracked-files=normal")
    sources = [root / "mla_gui.py", root / "mla_formatter.py", root / "requirements-build.txt",
               root / "scripts/prepare_desktop_build.py", root / "scripts/prepare_windows_build.py",
               root / "scripts/hooks-desktop/hook-tkinterdnd2.py"]
    sources += sorted((root / "platforms" / args.platform).rglob("*"))
    metadata = {
        "application": "MLAFMT", "version": version, "target_platform": args.platform,
        "architecture": args.architecture, "build_platform": platform.platform(),
        "python": platform.python_version(), "packages": packages,
        "commit": git_output(root, "rev-parse", "HEAD"),
        "working_tree_dirty": None if status is None else bool(status),
        "minimum_system": "macOS 14" if args.platform == "macos" else "glibc 2.35, X11/XWayland",
        "signing": "Developer ID" if os.environ.get("MLAFMT_CODESIGN_IDENTITY") else "ad-hoc" if args.platform == "macos" else "not signed",
        "notarization_requested": bool(os.environ.get("MLAFMT_NOTARY_PROFILE")) if args.platform == "macos" else False,
        "source_sha256": {str(path.relative_to(root)).replace("\\", "/"): hashlib.sha256(path.read_bytes()).hexdigest()
                          for path in sources if path.is_file()},
    }
    if args.platform == "linux":
        metadata["external_tools"] = json.loads((root / "platforms/linux/appimage-tools.json").read_text(encoding="utf-8"))
    (output / "build-info.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    documentation = output / "documentation"
    if documentation.resolve().parent != output:
        raise SystemExit("The documentation staging path must remain inside the build output.")
    if documentation.exists():
        shutil.rmtree(documentation)
    documentation.mkdir()
    for name in ("README.md", "CHANGELOG.md", "LICENSE"):
        shutil.copy2(root / name, documentation / name)
    for name in ("build-info.json", "THIRD-PARTY-NOTICES.txt"):
        shutil.copy2(output / name, documentation / name)
    if args.platform == "linux":
        shutil.copytree(root / "platforms/linux/licenses", documentation / "licenses", dirs_exist_ok=True)
    shutil.copy2(root / "platforms" / args.platform / "INSTALL.md", documentation / "INSTALL.md")
    if (root / "docs").is_dir():
        shutil.copytree(root / "docs", documentation / "docs", dirs_exist_ok=True)
    write_spec(root, output, args.platform, args.architecture, version)
    print(version)


if __name__ == "__main__":
    main()
