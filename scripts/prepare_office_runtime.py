#!/usr/bin/env python3
"""Acquire and package the optional, pinned browser-local Office engine.

Normal builds validate browser/office-runtime.json. --snapshot is an explicit
maintainer operation to pin the current upstream files, never a build fallback.
All caches and generated payloads are under this repository on the H: drive.
No document is used by this downloader. Node's built-in Brotli decoder avoids
adding a Python package solely for the CDN's compressed files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIN = ROOT / "browser" / "office-runtime.json"
CACHE = ROOT / "browser" / ".cache" / "office"
CDN = "https://cdn.zetaoffice.net/zetaoffice_latest/"
ZETA_COMMIT = "b3dec98af5dc4c059a260afd6db0bf0fe38c6384"
LO_SOURCE_COMMIT = "efaf0670b4d055f838a2849becb10f08aa06a257"
NOTO_CJK_COMMIT = "f8d157532fbfaeda587e826d4cd5b21a49186f7c"
NOTO_CJK_NAME = "NotoSansCJKsc-Regular.otf"
NOTO_CJK_URL = f"https://raw.githubusercontent.com/notofonts/noto-cjk/{NOTO_CJK_COMMIT}/Sans/OTF/SimplifiedChinese/{NOTO_CJK_NAME}"
CHUNK_BYTES = 20 * 1024 * 1024
RUNTIME_NAMES = ("soffice.js", "soffice.wasm", "soffice.data", "soffice.data.js.metadata")


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(data)
    return value.hexdigest()


def entry(path: Path, url: str) -> dict:
    return {"url": url, "size": path.stat().st_size, "sha256": digest(path)}


def valid(path: Path, pin: dict) -> bool:
    return path.is_file() and path.stat().st_size == pin["size"] and digest(path) == pin["sha256"]


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    raw = target.with_name(target.name + ".download")
    decoded = target.with_name(target.name + ".decoded")
    request = urllib.request.Request(url, headers={"User-Agent": "FormCapy-Office-runtime/1", "Accept-Encoding": "identity"})
    print(f"  office: downloading {target.name}", flush=True)
    try:
        with urllib.request.urlopen(request, timeout=180) as response, raw.open("wb") as stream:
            encoding = response.headers.get("Content-Encoding", "").lower()
            shutil.copyfileobj(response, stream, 1024 * 1024)
        if encoding == "br":
            node = shutil.which("node")
            if not node:
                raise RuntimeError("Node.js is required to decode the Office CDN's Brotli assets")
            subprocess.run([
                node, "-e", "const fs=require('node:fs'),z=require('node:zlib');fs.writeFileSync(process.argv[2],z.brotliDecompressSync(fs.readFileSync(process.argv[1])));",
                str(raw), str(decoded),
            ], check=True)
            decoded.replace(target)
        elif encoding in ("", "identity"):
            raw.replace(target)
        else:
            raise RuntimeError(f"Unexpected content encoding: {encoding}")
    finally:
        raw.unlink(missing_ok=True)
        decoded.unlink(missing_ok=True)


def license_urls() -> dict[str, str]:
    source = f"https://raw.githubusercontent.com/LibreOffice/core/{LO_SOURCE_COMMIT}/"
    return {
        "zetajs-LICENSE.txt": f"https://raw.githubusercontent.com/allotropia/zetajs/{ZETA_COMMIT}/LICENSE",
        "LibreOffice-COPYING.txt": source + "COPYING",
        "LibreOffice-MPL-2.0.txt": source + "COPYING.MPL",
        "LibreOffice-LGPL-3.0.txt": source + "COPYING.LGPL",
        "LibreOffice-third-party-license.html": source + "readlicense_oo/license/license.xml",
        "LibreOffice-NOTICE.txt": source + "readlicense_oo/license/NOTICE",
        "LibreOffice-download.lst": source + "download.lst",
        "LibreOffice-WASM-README.md": source + "static/README.wasm.md",
        "NotoSansCJK-OFL-1.1.txt": f"https://raw.githubusercontent.com/notofonts/noto-cjk/{NOTO_CJK_COMMIT}/Sans/LICENSE",
    }


def snapshot() -> dict:
    source = CACHE / "upstream"
    files = {}
    for name in RUNTIME_NAMES:
        target = source / name
        download(CDN + name, target)
        files[name] = entry(target, CDN + name)
    bridge_url = f"https://raw.githubusercontent.com/allotropia/zetajs/{ZETA_COMMIT}/source/zeta.js"
    download(bridge_url, source / "zeta.js")
    files["zeta.js"] = entry(source / "zeta.js", bridge_url)
    download(NOTO_CJK_URL, source / NOTO_CJK_NAME)
    files[NOTO_CJK_NAME] = entry(source / NOTO_CJK_NAME, NOTO_CJK_URL)
    licenses = {}
    for name, url in license_urls().items():
        target = CACHE / "licenses" / name
        try:
            download(url, target)
        except urllib.error.HTTPError as error:
            if name == "LibreOffice-third-party-license.txt" and error.code == 404:
                continue  # This source revision uses the HTML license inventory.
            raise
        licenses[name] = entry(target, url)
    metadata = json.loads((source / "soffice.data.js.metadata").read_text())
    data = (source / "soffice.data").read_bytes()
    version_file = next(item for item in metadata["files"] if item["filename"] == "/instdir/program/versionrc")
    version = data[version_file["start"]:version_file["end"]].decode("utf-8", errors="replace")
    result = {
        "schemaVersion": 1,
        "id": "zeta-20250513-" + files["soffice.wasm"]["sha256"][:12],
        "description": "Unmodified ZetaOffice CDN snapshot (Last-Modified 2025-05-13); verified at build and browser load.",
        "initialMemoryMiB": 1024,
        "chunkBytes": CHUNK_BYTES,
        "files": files,
        "licenses": licenses,
        "versionrc": version,
        "sources": {
            "libreoffice": f"https://github.com/LibreOffice/core/tree/{LO_SOURCE_COMMIT}",
            "libreoffice_upstream_branch": "https://git.libreoffice.org/core/+/refs/heads/distro/allotropia/zeta-24-2",
            "zetajs": f"https://github.com/allotropia/zetajs/tree/{ZETA_COMMIT}",
            "emscripten": "https://github.com/allotropia/emscripten/tree/fixed-3.1.65",
            "qt5": "https://github.com/allotropia/qt5/tree/5.15.2%2Bwasm",
            "qtbase": "https://github.com/allotropia/qtbase/tree/5.15.2%2Bwasm",
            "noto_sans_cjk": f"https://github.com/notofonts/noto-cjk/tree/{NOTO_CJK_COMMIT}/Sans",
        },
        "font_files": [item["filename"] for item in metadata["files"] if "/fonts/" in item["filename"]],
        "additional_fonts": [{"name": NOTO_CJK_NAME, "family": "Noto Sans CJK SC", "install_path": f"/instdir/share/fonts/truetype/{NOTO_CJK_NAME}", "license": "SIL Open Font License 1.1"}],
    }
    PIN.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


def cached(name: str, pin: dict, group: str, refresh: bool) -> Path:
    target = CACHE / group / name
    if refresh or not valid(target, pin):
        download(pin["url"], target)
    if not valid(target, pin):
        raise RuntimeError(f"Office runtime hash/size mismatch: {name}; the upstream snapshot changed. Do not silently update pins.")
    return target


def chunks(source: Path, directory: Path) -> dict:
    result = {"size": source.stat().st_size, "sha256": digest(source), "chunks": []}
    with source.open("rb") as stream:
        index = 0
        for block in iter(lambda: stream.read(CHUNK_BYTES), b""):
            path = directory / f"{source.name}.part-{index:03}"
            path.write_bytes(block)
            result["chunks"].append({"path": f"{directory.name}/{path.name}", "size": len(block), "sha256": hashlib.sha256(block).hexdigest()})
            index += 1
    return result


def prepare(out: Path, refresh: bool = False) -> dict:
    """Copy verified runtime/chunks/notices into a static site's output root."""
    out = Path(out).resolve()
    pin = json.loads(PIN.read_text(encoding="utf-8"))
    directory = out / "runtime" / "office" / pin["id"]
    directory.mkdir(parents=True, exist_ok=True)
    files = {name: cached(name, record, "upstream", refresh) for name, record in pin["files"].items()}
    assets = {}
    for key, name in (("script", "soffice.js"), ("bridge", "zeta.js"), ("metadata", "soffice.data.js.metadata"), ("font", NOTO_CJK_NAME)):
        shutil.copyfile(files[name], directory / name)
        assets[key] = {"path": f"{pin['id']}/{name}", "size": pin["files"][name]["size"], "sha256": pin["files"][name]["sha256"]}
    assets["wasm"] = chunks(files["soffice.wasm"], directory)
    assets["data"] = chunks(files["soffice.data"], directory)
    driver = ROOT / "browser" / "office-thread.js"
    assets["driver"] = {"path": "../../browser/office-thread.js", "size": driver.stat().st_size, "sha256": digest(driver)}
    runtime = {"schemaVersion": 1, "id": pin["id"], "initialMemoryMiB": pin["initialMemoryMiB"], "assets": assets}
    (directory.parent / "runtime.json").write_text(json.dumps(runtime, indent=2) + "\n", encoding="utf-8")
    notices = out / "licenses" / "office"
    notices.mkdir(parents=True, exist_ok=True)
    for name, record in pin["licenses"].items():
        shutil.copyfile(cached(name, record, "licenses", refresh), notices / name)
    (notices / "SOURCE-INVENTORY.json").write_text(json.dumps(pin, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (notices / "README.txt").write_text(
        "FormCapy optional local Office converter\n\n"
        "The unchanged ZetaOffice WebAssembly runtime is LibreOffice Technology.\n"
        "It is separate from FormCapy's MIT-licensed application code. See the\n"
        "included MPL/LGPL texts and complete upstream third-party license HTML.\n"
        "zeta.js is MIT licensed; its original notice is included.\n\n"
        "FormCapy additionally installs the unmodified Noto Sans CJK SC Regular\n"
        "font before Office starts, providing Chinese/Japanese/Korean glyphs\n"
        "with Simplified Chinese regional forms as fallback. It is separately\n"
        "licensed under SIL OFL 1.1; the original license and pinned repository\n"
        "source/commit are included. No proprietary system font is bundled.\n\n"
        "SOURCE-INVENTORY.json lists exact binary hashes, the runtime's own\n"
        "versionrc/build ID, upstream source URLs, bridge commit, and font files.\n"
        "The third-party license HTML is the upstream source inventory (some\n"
        "optional components may not be included in this WASM build).\n"
        "No claim is made that FormCapy rebuilt the upstream binaries.\n\n"
        "The runtime requires cross-origin isolation and allocates 1 GiB of\n"
        "shared WASM memory, in addition to decoded runtime and document data.\n"
        "It is loaded only on an explicit Office conversion action. Input and\n"
        "output bytes remain in the browser. Missing fonts can alter layout;\n"
        "legacy DOC can lose features. PDF reconstruction has separate limits.\n",
        encoding="utf-8",
    )
    return runtime


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "build" / "office-runtime")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--snapshot", action="store_true", help="maintainer: explicitly replace the checked-in upstream pins")
    args = parser.parse_args()
    if args.snapshot:
        snapshot()
    result = prepare(args.out, refresh=args.refresh)
    print(f"Office runtime prepared: {result['id']} -> {args.out}")


if __name__ == "__main__":
    main()
