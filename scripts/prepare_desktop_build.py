"""Prepare versioned macOS/Linux PyInstaller builds without importing the app."""

import argparse
import base64
import hashlib
from html import escape
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


def macos_document_types():
    """Offer Finder's Open With without becoming the primary document editor."""
    documents = [
        ("Word draft", "docx", "org.openxmlformats.wordprocessingml.document"),
        ("Text draft", "txt", "public.plain-text"),
        ("Markdown draft", "md", "net.daringfireball.markdown"),
    ]
    return [{"CFBundleTypeName": name, "CFBundleTypeRole": "Viewer",
             "LSHandlerRank": "Alternate", "CFBundleTypeExtensions": [extension],
             "LSItemContentTypes": [identifier]}
            for name, extension, identifier in documents]


def write_macos_install(output, version, architecture, status):
    """Render a self-contained, double-clickable guide after app verification."""
    if status == "notarized":
        report = json.loads((output / "notarization-app.json").read_text(encoding="utf-8"))
        if report.get("status") != "Accepted":
            raise SystemExit("A notarized install guide requires Apple's Accepted app report.")
    architecture_label = "Apple silicon · M 系列" if architecture == "arm64" else "Intel · x64"
    if status == "notarized":
        verification = ("此应用已使用 Developer ID 签名并通过 Apple 公证。",
                        "The app is Developer ID signed and Apple-notarized.")
        first_open = ("打开“应用程序”中的 MLAFMT，按系统提示确认首次打开。",
                      "Open MLAFMT in Applications and confirm the first launch when prompted.")
    elif status == "developer-id":
        verification = ("此应用已使用 Developer ID 签名，尚未经过 Apple 公证。",
                        "The app is Developer ID signed and has not been Apple-notarized.")
        first_open = ("首次打开如被阻止，确认来自项目 GitHub Releases 后，前往“系统设置 → 隐私与安全性 → 仍要打开”。",
                      "If macOS blocks the first launch, confirm the GitHub Releases download source, then use System Settings → Privacy & Security → Open Anyway.")
    else:
        verification = ("此应用使用临时签名，尚未经过 Apple 公证。",
                        "The app is ad-hoc signed and has not been Apple-notarized.")
        first_open = ("首次打开如被阻止，确认来自项目 GitHub Releases 后，前往“系统设置 → 隐私与安全性 → 仍要打开”。",
                      "If macOS blocks the first launch, confirm the GitHub Releases download source, then use System Settings → Privacy & Security → Open Anyway.")
    icon = base64.b64encode((output / "MLAFMT.png").read_bytes()).decode("ascii")
    page = f"""<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MLAFMT · Mac 安装 / Install</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f5f3ef;color:#243058;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
main{{max-width:780px;margin:48px auto;padding:32px;background:#fff;border-radius:20px}}header{{display:flex;align-items:center;gap:18px}}
img{{width:76px;height:76px}}h1{{margin:0;font-size:30px}}.muted,.en{{color:#666d7b}}.en{{display:block;font-size:14px;margin:3px 0 18px}}
ol{{padding-left:24px}}li{{padding-left:8px;margin:20px 0}}.note{{padding:18px 20px;background:#f5f6fa;border-radius:12px}}
a{{color:#31569b}}footer{{margin-top:26px;font-size:14px}}@media(max-width:600px){{main{{margin:16px;padding:24px}}}}
</style>
<main><header><img src="data:image/png;base64,{icon}" alt=""><div><h1>MLAFMT</h1>
<div class="muted">v{escape(version)} · {architecture_label} · macOS 14+</div></div></header>
<ol><li><strong>把 MLAFMT 拖入 Applications（应用程序）。</strong>
<span class="en" lang="en">Drag MLAFMT into the Applications shortcut in this disk image.</span></li>
<li><strong>从“应用程序”中打开 MLAFMT。</strong><br>{first_open[0]}
<span class="en" lang="en">{first_open[1]}</span></li>
<li><strong>选择草稿，填写姓名和标题，生成 Word 文档。</strong>
<span class="en" lang="en">Choose a draft, enter your name and title, then generate the Word document.</span></li></ol>
<div class="note">{verification[0]}<span class="en" lang="en">{verification[1]}</span>
所有排版在设备上离线完成，无需安装 Python。
<span class="en" lang="en">Formatting works offline. No Python installation is required.</span></div>
<footer>支持 .docx / .txt / .md · 图文说明：<a href="Documentation/README.md">README</a> ·
<a href="https://github.com/SuperOoze0309/MLAFMT/releases">GitHub Releases</a></footer></main></html>
"""
    (output / "Read Me.html").write_text(page, encoding="utf-8")


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
                 "NSDownloadsFolderUsageDescription": "Choose drafts and save formatted documents.",
                 "CFBundleDocumentTypes": macos_document_types(),
                 "UTImportedTypeDeclarations": [
                     {"UTTypeIdentifier": "org.openxmlformats.wordprocessingml.document",
                      "UTTypeDescription": "Office Open XML document",
                      "UTTypeConformsTo": ["public.data", "public.content"],
                      "UTTypeTagSpecification": {
                          "public.filename-extension": ["docx"],
                          "public.mime-type": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}},
                     {"UTTypeIdentifier": "net.daringfireball.markdown",
                      "UTTypeDescription": "Markdown document",
                      "UTTypeConformsTo": ["public.plain-text"],
                      "UTTypeTagSpecification": {
                          "public.filename-extension": ["md"],
                          "public.mime-type": ["text/markdown"]}},
                 ]}
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
    parser.add_argument("--macos-install-status", choices=("ad-hoc", "developer-id", "notarized"))
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
    if args.macos_install_status:
        if args.platform != "macos":
            parser.error("--macos-install-status requires --platform macos")
        write_macos_install(output, version, args.architecture, args.macos_install_status)
        return
    if args.verify_dependencies:
        verify_dependencies(root)
    write_icons(output, args.platform)
    packages = write_notices(root, output)
    status = git_output(root, "status", "--porcelain", "--untracked-files=normal")
    sources = [root / "mla_gui.py", root / "mla_formatter.py", root / "format_profiles.py", root / "requirements-build.txt",
               root / "scripts/prepare_desktop_build.py", root / "scripts/prepare_windows_build.py",
               root / "scripts/hooks-desktop/hook-tkinterdnd2.py",
               root / "scripts/hooks-desktop/hook-docx.py"]
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
    if (root / "examples").is_dir():
        shutil.copytree(root / "examples", documentation / "examples", dirs_exist_ok=True)
    write_spec(root, output, args.platform, args.architecture, version)
    print(version)


if __name__ == "__main__":
    main()
