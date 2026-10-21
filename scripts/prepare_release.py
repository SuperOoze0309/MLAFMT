"""Validate gathered platform assets and prepare a concise manual GitHub Release."""

import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import zipfile

from prepare_windows_build import source_version
from verify_android_apk import inspect_apk


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
        if hashlib.sha256(archive.read("MLAFMT.exe")).digest() != hashlib.sha256((release / assets[0]).read_bytes()).digest():
            raise SystemExit("Standalone EXE differs from the packaged EXE")
        for image in ("mlafmt-web-zh.png", "mlafmt-web-en.png"):
            if f"docs/images/{image}" not in archive.namelist():
                raise SystemExit("Windows ZIP is missing its illustrated guide")
    with zipfile.ZipFile(release / assets[-1]) as archive:
        if archive.testzip() or "AndroidManifest.xml" not in archive.namelist():
            raise SystemExit("Android APK integrity check failed")
        validate_provenance(json.loads(archive.read("assets/build-info.json")), "Android APK")
    inspect_apk(release / assets[-1])
    with tarfile.open(release / assets[5], "r:gz") as archive:
        member = archive.extractfile("MLAFMT.AppDir/Documentation/build-info.json")
        validate_provenance(json.load(member), "Linux portable package")
    for platform_name, platform_assets in (("macos-arm64", [assets[2]]),
                                           ("macos-x64", [assets[3]]),
                                           ("linux-x64", assets[4:6])):
        sidecar = release / f"MLAFMT-{tag}-{platform_name}.build-info.json"
        if not sidecar.is_file():
            raise SystemExit(f"Missing CI provenance: {sidecar.name}")
        info = json.loads(sidecar.read_text(encoding="utf-8"))
        validate_provenance(info, platform_name)
        for name in platform_assets:
            if info["asset_sha256"].get(name) != hashlib.sha256((release / name).read_bytes()).hexdigest():
                raise SystemExit(f"Asset does not match CI provenance: {name}")
    manifest = "".join(f"{hashlib.sha256((release / name).read_bytes()).hexdigest()}  {name}\n" for name in assets)
    (release / "SHA256SUMS.txt").write_text(manifest, encoding="utf-8")
    base = f"https://github.com/SuperOoze0309/MLAFMT/releases/download/{tag}"
    notes = f"""## 下载 / Downloads

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

本版新增 APA 7 学生论文版式与自定义课程模板：可保存多套老师要求，并用 JSON 在设备间交换模板。
桌面、网页和 Android 共用格式设置；APA 支持封面、页码、1–3 级标题与新页 References。引用文字保持原样。
iPhone/iPad 继续使用本地网页预览。文档包含图片、表格、脚注或公式时，请对照原稿检查。
This release adds APA 7 student paper layouts and custom course templates, with named presets and JSON transfer between devices.
Desktop, web and Android share the layout engine. APA includes a title page, page numbers, heading levels 1–3 and a new References page; citation text is unchanged.
iPhone/iPad continue to use the local web preview. Compare documents containing images, tables, notes or equations with the original.

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
