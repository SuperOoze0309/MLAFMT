"""Validate gathered platform assets and prepare a concise manual GitHub Release."""

import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import zipfile

from prepare_windows_build import source_version
from verify_android_apk import inspect_apk


def validate_license_metadata(info, label):
    audit = info.get("license_audit", {})
    if audit.get("release_ready") is not True or audit.get("missing_license_texts"):
        raise SystemExit(f"{label} has not passed the release dependency material checks")
    hashes = info.get("license_files_sha256", {})
    for name in ("THIRD-PARTY-NOTICES.txt", "license-manifest.json", "license-audit.json"):
        value = hashes.get(name, "")
        if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
            raise SystemExit(f"{label} is missing license artifact provenance: {name}")


def validate_license_bundle(read, info, label):
    """Read archive members without extracting or probing host dependencies."""
    validate_license_metadata(info, label)
    try:
        for name, expected in info["license_files_sha256"].items():
            if hashlib.sha256(read(name)).hexdigest() != expected:
                raise SystemExit(f"{label} license artifact hash differs: {name}")
        audit = json.loads(read("license-audit.json"))
        if audit != info["license_audit"]:
            raise SystemExit(f"{label} license audit differs from its build provenance")
        manifest = json.loads(read("license-manifest.json"))
        if not manifest.get("texts"):
            raise SystemExit(f"{label} has an empty license text inventory")
        for entry in manifest["texts"]:
            path = entry["file"]
            if not path.startswith("licenses/") or ".." in Path(path).parts:
                raise SystemExit(f"{label} has an invalid license text path")
            if hashlib.sha256(read(path)).hexdigest() != entry["sha256"]:
                raise SystemExit(f"{label} is missing or has modified original license text: {path}")
        kit = audit.get("source_kit")
        if kit:
            data = read("MLAFMT-SOURCE-KIT.zip")
            if hashlib.sha256(data).hexdigest() != kit["sha256"]:
                raise SystemExit(f"{label} source kit hash differs")
            with zipfile.ZipFile(io.BytesIO(data)) as source:
                source_manifest = json.loads(source.read("source-kit-manifest.json"))
                if (source_manifest["application_commit"] != info["commit"]
                        or source_manifest["working_tree_dirty"]
                        or kit["application_commit"] != info["commit"] or kit["working_tree_dirty"]):
                    raise SystemExit(f"{label} source kit does not match the clean application commit")
                native = {item["file"].replace("\\", "/"): item["sha256"]
                          for item in audit["lxml_native"]["binaries"]}
                if (source_manifest["installed_native_files"] != native
                        or source_manifest["upstream"]["native_files"] != native):
                    raise SystemExit(f"{label} source kit identifies a different native dependency")
                for entry in source_manifest["upstream"]["sources"]:
                    if hashlib.sha256(source.read("sources/" + entry["archive"])).hexdigest() != entry["sha256"]:
                        raise SystemExit(f"{label} source kit lacks the original source archive: {entry['name']}")
                for path, expected in source_manifest["application_files"].items():
                    if hashlib.sha256(source.read("application/" + path)).hexdigest() != expected:
                        raise SystemExit(f"{label} application source kit file differs: {path}")
                if not source.read("REBUILD.txt").strip() or not source.read("rebuild.py").strip():
                    raise SystemExit(f"{label} source kit lacks relink instructions or helper")
    except (KeyError, FileNotFoundError, AttributeError, json.JSONDecodeError, zipfile.BadZipFile) as error:
        raise SystemExit(f"{label} is missing required license/source materials: {error}") from error


def main():
    root = Path(__file__).resolve().parents[1]
    version = source_version(root)
    tag = f"v{version}"
    release = root / "dist/release"
    assets = ["MLAFMT.exe", f"MLAFMT-{tag}-windows-x64.zip",
              f"MLAFMT-{tag}-macos-arm64.dmg", f"MLAFMT-{tag}-macos-x64.dmg",
              f"MLAFMT-{tag}-linux-x64.AppImage", f"MLAFMT-{tag}-linux-x64.tar.gz",
              f"MLAFMT-{tag}-android.apk"]
    missing = [name for name in assets if not (release / name).is_file()]
    if missing:
        raise SystemExit("Missing release assets: " + ", ".join(missing))
    for name in assets:
        if (release / name).stat().st_size < 100_000:
            raise SystemExit(f"Unexpectedly small release asset: {name}")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()

    def validate_provenance(info, label):
        if info["version"] != version or info["commit"] != commit or info["working_tree_dirty"]:
            raise SystemExit(f"{label} does not match the clean current source commit")

    with zipfile.ZipFile(release / assets[1]) as archive:
        if archive.testzip():
            raise SystemExit("Windows ZIP integrity check failed")
        info = json.loads(archive.read("build-info.json"))
        validate_provenance(info, "Windows ZIP")
        validate_license_bundle(archive.read, info, "Windows ZIP")
        if hashlib.sha256(archive.read("MLAFMT.exe")).digest() != hashlib.sha256((release / assets[0]).read_bytes()).digest():
            raise SystemExit("Standalone EXE differs from the packaged EXE")
        for image in ("mlafmt-web-zh.png", "mlafmt-web-en.png"):
            if f"docs/images/{image}" not in archive.namelist():
                raise SystemExit("Windows ZIP is missing its illustrated guide")
        # One-file downloads must carry the same notices and source material,
        # rather than relying only on the optional companion ZIP.
        from PyInstaller.archive.readers import CArchiveReader
        executable = CArchiveReader(release / assets[0])
        embedded_names = {name.replace("\\", "/"): name for name in executable.toc}
        for name, expected in info["license_files_sha256"].items():
            if name not in executable.toc or hashlib.sha256(executable.extract(name)).hexdigest() != expected:
                raise SystemExit(f"Standalone EXE is missing its license artifact: {name}")
        for entry in json.loads(archive.read("license-manifest.json"))["texts"]:
            name = embedded_names.get(entry["file"])
            if name is None or hashlib.sha256(executable.extract(name)).hexdigest() != entry["sha256"]:
                raise SystemExit(f"Standalone EXE is missing its original license text: {entry['file']}")
        kit = info["license_audit"].get("source_kit")
        if kit and ("MLAFMT-SOURCE-KIT.zip" not in executable.toc
                    or hashlib.sha256(executable.extract("MLAFMT-SOURCE-KIT.zip")).hexdigest() != kit["sha256"]):
            raise SystemExit("Standalone EXE is missing its complete corresponding source kit")
    with zipfile.ZipFile(release / assets[-1]) as archive:
        if archive.testzip() or "AndroidManifest.xml" not in archive.namelist():
            raise SystemExit("Android APK integrity check failed")
        validate_provenance(json.loads(archive.read("assets/build-info.json")), "Android APK")
    inspect_apk(release / assets[-1])
    with tarfile.open(release / assets[5], "r:gz") as archive:
        member = archive.extractfile("MLAFMT.AppDir/Documentation/build-info.json")
        info = json.load(member)
        validate_provenance(info, "Linux portable package")
        validate_license_bundle(lambda name: archive.extractfile("MLAFMT.AppDir/Documentation/" + name).read(),
                                info, "Linux portable package")
    for platform_name, platform_assets in (("macos-arm64", [assets[2]]),
                                           ("macos-x64", [assets[3]]),
                                           ("linux-x64", assets[4:6])):
        sidecar = release / f"MLAFMT-{tag}-{platform_name}.build-info.json"
        if not sidecar.is_file():
            raise SystemExit(f"Missing CI provenance: {sidecar.name}")
        info = json.loads(sidecar.read_text(encoding="utf-8"))
        validate_provenance(info, platform_name)
        validate_license_metadata(info, platform_name)
        for name in platform_assets:
            if info["asset_sha256"].get(name) != hashlib.sha256((release / name).read_bytes()).hexdigest():
                raise SystemExit(f"Asset does not match CI provenance: {name}")
    manifest = "".join(f"{hashlib.sha256((release / name).read_bytes()).hexdigest()}  {name}\n" for name in assets)
    (release / "SHA256SUMS.txt").write_text(manifest, encoding="utf-8")
    base = f"https://github.com/SuperOoze0309/MLAFMT/releases/download/{tag}"
    notes = f"""## 直接使用 / Use online

**[打开 FormCapy / Open FormCapy](https://formcapy.com/)** — 免费、无需注册。文稿在浏览器本地排版，不会自动上传。支持中文、English、Español。
Free, no account required. Formatting runs on your device; drafts are not uploaded automatically.

本版新增中文课程论文、毕业论文基础预设，以及西班牙语界面。中文预设支持中西文字体、首行字符缩进和固定磅值行距；学校具体要求仍需自行核对。引用条目文字保持原样。
New: Chinese course-paper and basic-thesis presets, plus a Spanish interface. Chinese typography supports separate Latin fonts, character indentation and exact point spacing. Reference wording is preserved; institutional requirements still take precedence.

## 离线应用 / Offline apps

选择你的设备，下载对应文件。所有版本在设备上离线排版，无需安装 Python。
Choose your device. All apps format documents offline; no Python installation is needed.

| 设备 / Device | 下载 / Download |
| --- | --- |
| Windows · x64 | [Windows 应用 / App]({base}/MLAFMT.exe) |
| macOS 14+ · M 系列 / Apple silicon | [Mac 安装包 / DMG]({base}/{assets[2]}) |
| macOS 14+ · Intel | [Mac 安装包 / DMG]({base}/{assets[3]}) |
| Linux · x64 · Ubuntu 22.04+ 或兼容系统 / or compatible | [Linux AppImage]({base}/{assets[4]}) |
| Android 7+ · 64 位 / 64-bit | [Android APK]({base}/{assets[6]}) |

Mac：拖入应用程序。此版本尚未 Apple 公证；首次打开若被阻止，在系统设置 → 隐私与安全确认打开。
Mac: drag to Applications. These builds are not Apple-notarized; confirm first launch in System Settings → Privacy & Security if blocked.

Linux：允许执行后打开。Android：安装后选择草稿，生成并保存或分享 Word 文档。
Linux: mark executable and open. Android: install, choose your draft, then save or share the formatted Word document.

iPhone/iPad 使用上方 HTTPS 网页。文档包含图片、表格、脚注或公式时，请对照原稿检查。
Use the HTTPS website on iPhone/iPad. Compare documents containing images, tables, notes or equations with the original.

<details>
<summary>其他下载 / Other downloads</summary>

- [Windows ZIP（含说明）/ Windows ZIP with guide]({base}/{assets[1]})
- [Linux tar.gz（无 FUSE 时使用）/ Linux tar.gz without FUSE]({base}/{assets[5]})
- [SHA-256 校验和 / Checksums]({base}/SHA256SUMS.txt)
- [图文使用说明 / Illustrated guide](https://github.com/SuperOoze0309/MLAFMT/blob/{tag}/README.md)
- [Apple 设备指南 / Apple guide](https://github.com/SuperOoze0309/MLAFMT/blob/{tag}/docs/APPLE.md)
- [格式与模板说明 / Formats and templates](https://github.com/SuperOoze0309/MLAFMT/blob/{tag}/docs/FORMATS.md)

</details>
"""
    (root / "build").mkdir(exist_ok=True)
    (root / "build/release-notes.md").write_text(notes, encoding="utf-8")
    print(f"Validated {len(assets)} assets for {tag} at source {commit[:8]}.")


if __name__ == "__main__":
    main()
