#!/usr/bin/env python3
"""Verify the original citation assets using their committed provenance pins.

No downloads and no dependency installation are performed. Run this before a
static build. All listed third-party files must be copied unchanged alongside
index.html, NOTICE.txt and sources.json when distributing the component.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import tarfile
from pathlib import Path


def verify(directory: Path) -> list[str]:
    directory = directory.resolve()
    manifest = json.loads((directory / "sources.json").read_text(encoding="utf-8"))
    if manifest.get("schema") != "formcapy-citation-assets" or manifest.get("v") != 1:
        raise ValueError("unsupported citation asset manifest")
    if manifest.get("processor", {}).get("selected_license") != "CPAL-1.0":
        raise ValueError("citation component license selection changed")
    seen = set()
    reports = []
    for entry in manifest["entries"]:
        name = entry["path"]
        if not isinstance(name, str) or Path(name).name != name or name in seen:
            raise ValueError("invalid or duplicate asset path")
        seen.add(name)
        target = (directory / name).resolve()
        if target.parent != directory:
            raise ValueError("asset path leaves its component directory")
        data = target.read_bytes()
        if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError(f"citation asset changed: {name}")
        if entry.get("modified") is not False:
            raise ValueError(f"original asset unexpectedly modified: {name}")
        reports.append(f"OK {name}: {len(data)} bytes")
    required = {
        "citeproc.js", "citeproc-LICENSE.txt", "CPAL-1.0.txt", "AGPL-3.0.txt",
        "citeproc-source.tar.gz", "modern-language-association.csl", "apa.csl",
        "styles-README.md", "locales-en-US.xml", "locales-README.md", "CC-BY-SA-3.0.txt",
    }
    if seen != required:
        raise ValueError("the citation source/license asset set changed")
    for name in ("index.html", "NOTICE.txt"):
        if not (directory / name).is_file():
            raise ValueError(f"missing distribution document: {name}")
    source_pin = manifest["pins"]["processor"]
    prefix = f"citeproc-js-{source_pin}/"
    with tarfile.open(directory / "citeproc-source.tar.gz", "r:gz") as archive:
        original = archive.extractfile(prefix + "citeproc.js")
        if original is None or original.read() != (directory / "citeproc.js").read_bytes():
            raise ValueError("processor source archive does not contain the served original JS")
        if not any(member.name.startswith(prefix + "src/") and member.isfile() for member in archive):
            raise ValueError("processor preferred src modules are missing")
    reports.append("OK source archive contains the identical original processor and src modules")
    return reports


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "static/vendor/citations")
    args = parser.parse_args()
    for report in verify(args.directory):
        print(report)
    print("All citation component source and license bytes match their pins.")


if __name__ == "__main__":
    main()
