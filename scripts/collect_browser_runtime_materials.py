"""Collect pinned browser-runtime source and notice material; no build is run.

Only explicitly listed inputs are downloaded. Original bytes are preserved,
oversized archives are split without recompression, and incomplete collections
are visibly marked. This is an engineering inventory, not legal certification.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tempfile
import time
from urllib.request import Request, urlopen
from zipfile import ZipFile, is_zipfile


ROOT = Path(__file__).resolve().parents[1]
HARD_FILE_LIMIT = 25 * 1024 * 1024
HEX256 = re.compile(r"^[0-9a-f]{64}$")


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def safe_relative(value):
    path = PurePosixPath(value)
    if not value or "\\" in value or path.is_absolute() or any(
            part in (".", "..") or ":" in part for part in path.parts):
        raise ValueError(f"Unsafe material path: {value!r}")
    return path


def record(path, output):
    return {"path": path.relative_to(output).as_posix(),
            "size": path.stat().st_size, "sha256": digest(path)}


def write_bytes(output, relative, data):
    target = output.joinpath(*safe_relative(relative).parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    # Duplicate destinations are a manifest error; never silently overwrite.
    with target.open("xb") as stream:
        stream.write(data)
    return record(target, output)


def validate_inputs(pins, runtime, version):
    if pins.get("schema") != 1 or runtime.get("schema") != 1:
        raise ValueError("Unsupported manifest schema")
    expected = pins["expected_runtime"]
    actual = runtime["pyodide"]
    if version != expected["pyodide_version"] or actual["version"] != version:
        raise ValueError("Requested runtime version does not match the fixed source manifest")
    if actual["python"] != expected["python_version"]:
        raise ValueError("Python runtime version has changed; audit and update the source manifest")
    core = actual["core"]
    wasm = next(item for item in core["files"] if item["path"] == "pyodide.asm.wasm")
    if (core["sha256"] != expected["core_archive_sha256"] or
            wasm["sha256"] != expected["wasm_sha256"]):
        raise ValueError("The declared runtime binary identity has changed")
    packages = {item["name"]: item for item in actual["packages"] + runtime["wheels"]}
    if set(packages) != set(expected["packages"]):
        raise ValueError("Runtime package set changed; dependency materials need a new audit")
    for name, wanted in expected["packages"].items():
        if any(packages[name][key] != wanted[key] for key in ("version", "sha256")):
            raise ValueError(f"Runtime package identity changed: {name}")
    if pins["publication_file_limit_bytes"] != HARD_FILE_LIMIT:
        raise ValueError("This collector enforces the fixed 25 MiB publication ceiling")
    if not 0 < pins["split_part_bytes"] < HARD_FILE_LIMIT:
        raise ValueError("Split parts must be strictly below the publication ceiling")
    ids, filenames = set(), set()
    for item in pins["sources"]:
        if not re.fullmatch(r"[a-z0-9-]+", item["id"]):
            raise ValueError("Invalid source identifier")
        if item["id"] in ids or item["file"] in filenames:
            raise ValueError("Duplicate source identifier or archive filename")
        ids.add(item["id"])
        filenames.add(item["file"])
        if safe_relative(item["file"]).name != item["file"]:
            raise ValueError("Archive filename must not contain directories")
        if not item["url"].startswith("https://") or not HEX256.fullmatch(item["sha256"]):
            raise ValueError("Every download requires HTTPS and a fixed SHA-256")
        if not isinstance(item["size"], int) or item["size"] <= 0:
            raise ValueError("Every download requires a fixed positive byte size")
        if not item.get("extract"):
            raise ValueError(f"No declared notices/build material for {item['id']}")
        for member in item["extract"]:
            safe_relative(member["member"])
            if not HEX256.fullmatch(member["sha256"]):
                raise ValueError("Each extracted member requires its own SHA-256")


def fetch(item, cache):
    destination = cache / item["file"]
    if destination.exists():
        if destination.stat().st_size != item["size"] or digest(destination) != item["sha256"]:
            raise ValueError(f"Cached input does not match its pin: {destination}")
        return destination
    for attempt in range(3):
        temporary = None
        try:
            request = Request(item["url"], headers={"User-Agent": "FormCapy-runtime-materials/1"})
            with tempfile.NamedTemporaryFile(dir=cache, prefix="download-", delete=False) as stream:
                temporary = Path(stream.name)
                with urlopen(request, timeout=45) as response:
                    if not response.geturl().startswith("https://"):
                        raise ValueError("An input redirected away from HTTPS")
                    received = 0
                    while block := response.read(1024 * 1024):
                        received += len(block)
                        if received > item["size"]:
                            raise ValueError(f"Download exceeds pinned size: {item['id']}")
                        stream.write(block)
            if temporary.stat().st_size != item["size"] or digest(temporary) != item["sha256"]:
                raise ValueError(f"Download checksum/size mismatch: {item['id']}")
            temporary.replace(destination)
            return destination
        except (OSError, ValueError):
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def publish_archive(source, item, output, part_size):
    records = []
    if source.stat().st_size < HARD_FILE_LIMIT:
        destination = output / "sources" / item["file"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        with source.open("rb") as src, destination.open("xb") as dst:
            shutil.copyfileobj(src, dst)
        return [record(destination, output)]
    with source.open("rb") as stream:
        number = 1
        while block := stream.read(part_size):
            records.append(write_bytes(output, f"sources/{item['file']}.part{number:03d}", block))
            number += 1
    return records


def collect_members(source, item, output):
    result = []
    with (ZipFile(source) if is_zipfile(source) else tarfile.open(source)) as archive:
        zipped = isinstance(archive, ZipFile)
        names = (archive.namelist() if zipped else
                 [member.name for member in archive.getmembers() if member.isfile()])
        available = {}
        for name in names:
            if name.endswith("/"):
                continue
            relative = name
            if item.get("strip_archive_root", True):
                if "/" not in name:
                    continue
                relative = name.split("/", 1)[1]
            safe_relative(relative)
            if relative in available:
                raise ValueError(f"Ambiguous archive member: {relative}")
            available[relative] = name
        for member in item["extract"]:
            name = available.get(member["member"])
            if name is None:
                raise ValueError(f"Pinned member missing: {item['id']}/{member['member']}")
            if zipped:
                data = archive.read(name)
            else:
                with archive.extractfile(name) as stream:
                    data = stream.read()
            if (len(data) != member["size"] or
                    hashlib.sha256(data).hexdigest() != member["sha256"]):
                raise ValueError(f"Archive member checksum mismatch: {name}")
            if "byte_range" in member:
                start, end = member["byte_range"]
                data = data[start:end]
                if (len(data) != member["selected_size"] or
                        hashlib.sha256(data).hexdigest() != member["selected_sha256"]):
                    raise ValueError(f"Selected original-byte notice mismatch: {name}")
            relative = member.get("output_name", member["member"])
            saved = write_bytes(output, f"materials/{item['id']}/{relative}", data)
            result.append({**saved, "archive_member": name,
                           "selection": member.get("selection", "complete original member bytes")})
    return result


REASSEMBLE = r'''"""Reassemble one pinned original archive without changing its bytes."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_id")
parser.add_argument("destination", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent
manifest = json.loads((root / "SOURCE-MANIFEST.json").read_text(encoding="utf-8"))
entry = next(item for item in manifest["sources"] if item["id"] == args.source_id)
args.destination.parent.mkdir(parents=True, exist_ok=True)
whole = hashlib.sha256()
size = 0
try:
    with args.destination.open("xb") as output:
        for part in entry["published_files"]:
            filename = root / part["path"]
            part_hash = hashlib.sha256()
            count = 0
            with filename.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    count += len(block)
                    part_hash.update(block)
                    whole.update(block)
                    output.write(block)
            if count != part["size"] or part_hash.hexdigest() != part["sha256"]:
                raise ValueError("Part checksum mismatch: " + part["path"])
            size += count
        if size != entry["size"] or whole.hexdigest() != entry["sha256"]:
            raise ValueError("Reassembled archive checksum mismatch")
except FileExistsError:
    raise SystemExit("Destination already exists; choose a new path")
except Exception:
    args.destination.unlink(missing_ok=True)
    raise
print("Verified original archive:", args.destination, whole.hexdigest())
'''


def rebuild_text(pins):
    expected = pins["expected_runtime"]
    commits = pins["commits"]
    return f'''# FormCapy browser runtime source and relink materials

## Status and scope

These downloads and selected original members were checked against fixed hashes.
**No native/WASM rebuild has been performed by this collector.** This inventory
is not a legal compliance certification or a byte-identical rebuild claim.
The official wheel has no independent per-library build attestation. Matching
evidence and limits are recorded in SOURCE-MANIFEST.json.

The five lxml recipes declare static libiconv 1.16, libxml2 2.15.3, libxslt 1.1.45
and zlib 1.3.1; lxml 6.1.3 links with -liconv. Their original meta.yaml files are
under materials/recipes/packages/. They declare no source.patches. This is a
different build from the project's Windows wheel and its Windows source kit.

## Get the original sources

Each source is listed separately in SOURCE-MANIFEST.json and index.html. Files
below 25 MiB are supplied unchanged in sources/. Larger archives are split into
20 MiB binary parts without recompression. Reassemble and verify an original:

```sh
python reassemble.py cpython work/Python-3.14.2.tgz
python reassemble.py emscripten work/emscripten-5.0.3.tar.gz
```

The helper also works for an unsplit source ID. It verifies every part and the
whole archive. It refuses to overwrite an existing destination. Original license
and copyright bytes are in materials/; source archives also retain all original
source and notices. A file labelled as source/build material does not imply that
every component inside that archive is linked into the browser runtime.

## Fixed build inputs

- Pyodide {expected['pyodide_version']}: {commits['pyodide']}
- CPython {expected['python_version']}; ABI {expected['abi_version']}, wasm32
- Emscripten SDK {expected['emscripten_version']}: {commits['emscripten']}
- Recipes 314-20260911: {commits['recipes']}
- Recipes' pyodide-build submodule: {commits['pyodide_build_recipes']}
- Core's pyodide-build submodule: {commits['pyodide_build_core']}
- hiwire: {commits['hiwire']}

The two pyodide-build submodule revisions are intentionally supplied separately.
The C/C++ compiler binaries, SDK activation, host Python and host build tools are
external prerequisites; no downloaded compiler binary is represented as included.
Use the requirements and build instructions in these exact source revisions.

## Modify libiconv and rebuild the lxml wheel

1. Work on a Linux build host with native host Python 3.14.2, a native compiler,
   Git, CMake, autotools, and Emscripten SDK 5.0.3 activated. Follow the supplied
   Pyodide source's build instructions to obtain its matching sysroot/xbuildenv;
   do not silently substitute a newer ABI or SDK. Put the supplied pyodide-build
   archives at the respective repositories' pyodide-build submodule paths.
2. Unpack the five original native source archives, the Pyodide source, recipes,
   and recipes' pyodide-build source. Install that local pyodide-build package
   into an isolated host environment. Its build_recipes CLI source and
   pyproject.toml are included as readable material.
3. Edit your own copy of the unpacked libiconv 1.16 source. In a working copy of
   packages/libiconv/meta.yaml, replace source.url/source.sha256 with source.path
   pointing at this modified directory (resolved relative to that recipe).
   Preserve the original recipe alongside your changed recipe and describe your
   modifications. For an unmodified rebuild, retain the pinned URL and hash.
   The other four recipes can likewise use their supplied local source trees.
4. From the recipes checkout, build the complete dependent set using a clean
   build directory so an earlier stock libiconv cannot be reused:

   ```sh
   pyodide build-recipes libiconv libzlib libxml libxslt lxml \\
     --recipe-dir packages --force-rebuild --install --install-dir rebuilt-wheels
   ```

   Retain the static-library configure/CMake options from the supplied recipes:
   libiconv --disable-shared; libxml --with-iconv and --with-zlib pointing at
   WASM_LIBRARY_DIR; libxslt --disable-shared --without-crypto; lxml -liconv.
   If build prerequisites or the exact sysroot are unavailable, report that
   limitation. These commands describe the upstream flow; this collector has
   not executed or validated a complete rebuild on this host.
5. Keep the rebuilt lxml wasm wheel and its build logs, original notices,
   modified sources, recipe changes and updated hashes. The wheel tag must stay
   compatible with cp314/pyemscripten_2026_0_wasm32 for this runtime. A modified
   wheel normally has a different SHA-256 and must not retain the stock hash.
6. In a source checkout of FormCapy, replace the static site's lxml wheel and
   its pyodide-lock.json package entry with your rebuilt wheel filename and
   SHA-256. Update the source manifest for your changed sources. Rebuild the
   static artifact using that checkout's browser build instructions, then serve
   it from your own HTTPS origin. No original signing key or account is needed
   to modify the formatter or host your own replacement wheel.

You may modify the library/work for your own use and reverse engineer it to debug
such modifications as allowed by the applicable licenses. GNU libiconv's original
COPYING.LIB and other notices are supplied under materials/libiconv/. Pyodide and
hiwire's MPL texts and corresponding source archives are listed in index.html.
The application and each other component retain their respective licenses.

## Remaining work before publication

- Integrate this complete output directory into the actual static artifact and
  link its index from the application; a private build directory is not delivery.
- Verify runtime/wheel files in the final artifact independently against their
  runtime manifest. This collector checks the declared runtime identity and its
  pinned downloaded source/wheel materials, not a final deployed site.
- Record any further source changes and dependencies added after this manifest.
- Review actual relink success separately; material collection alone does not
  prove a reproducible native build or settle every redistribution question.
'''


def render_index(manifest):
    escape = html.escape
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8">',
             '<meta name="viewport" content="width=device-width,initial-scale=1">',
             '<title>FormCapy runtime sources and notices</title><body>',
             '<h1>FormCapy runtime sources and notices</h1>',
             '<p>Pinned source archives and original notices. Native rebuild not performed. '
             'This is an engineering inventory, not a legal certification.</p>',
             '<p><a href="SOURCE-MANIFEST.json">Hashes and provenance</a> · '
             '<a href="REBUILD.md">Rebuild and replace the library</a> · '
             '<a href="reassemble.py">Archive reassembly helper</a></p>']
    for item in manifest["sources"]:
        parts.append(f"<section><h2>{escape(item['id'])} {escape(item['version'])}</h2>")
        parts.append(f"<p>Original source: <a href=\"{escape(item['url'], quote=True)}\">"
                     f"{escape(item['file'])}</a><br>SHA-256: <code>{item['sha256']}</code></p><ul>")
        for file in item["published_files"] + item["extracted_materials"]:
            parts.append(f'<li><a href="{escape(file["path"], quote=True)}">'
                         f'{escape(file["path"])}</a> ({file["size"]:,} bytes)</li>')
        parts.append("</ul></section>")
    return "\n".join(parts + ["</body></html>\n"])


def collect(args, cache):
    pins_data = args.manifest.read_bytes()
    runtime_data = args.runtime_manifest.read_bytes()
    pins = json.loads(pins_data)
    runtime = json.loads(runtime_data)
    validate_inputs(pins, runtime, args.runtime_version)
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output must be a new or empty directory; refusing to mix collections")
    output.mkdir(parents=True, exist_ok=True)
    incomplete = output / "COLLECTION-INCOMPLETE.txt"
    incomplete.write_text("Collection has not completed. Do not publish this directory.\n", encoding="utf-8")
    manifest = {"schema": 1, "status": "collected-not-rebuilt", "rebuild_performed": False,
                "expected_runtime": pins["expected_runtime"], "commits": pins["commits"],
                "correspondence": pins["correspondence"],
                "input_source_manifest_sha256": hashlib.sha256(pins_data).hexdigest(),
                "input_runtime_manifest_sha256": hashlib.sha256(runtime_data).hexdigest(),
                "publication_file_limit_bytes": HARD_FILE_LIMIT, "sources": []}
    write_bytes(output, "runtime-sources-input.json", pins_data)
    write_bytes(output, "runtime-input.json", runtime_data)
    for number, item in enumerate(pins["sources"], 1):
        print(f"[{number}/{len(pins['sources'])}] {item['id']}: {item['file']}", flush=True)
        source = fetch(item, cache)
        published = publish_archive(source, item, output, pins["split_part_bytes"])
        materials = collect_members(source, item, output)
        manifest["sources"].append({key: value for key, value in item.items() if key != "extract"} |
                                   {"published_files": published, "extracted_materials": materials})
    write_bytes(output, "REBUILD.md", rebuild_text(pins).encode("utf-8"))
    write_bytes(output, "reassemble.py", REASSEMBLE.encode("utf-8"))
    write_bytes(output, "index.html", render_index(manifest).encode("utf-8"))
    manifest["files"] = [record(path, output) for path in sorted(output.rglob("*"))
                         if path.is_file() and path != incomplete]
    if any(item["size"] >= HARD_FILE_LIMIT for item in manifest["files"]):
        raise ValueError("A publication file reaches/exceeds the 25 MiB ceiling")
    manifest_data = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    if len(manifest_data) >= HARD_FILE_LIMIT:
        raise ValueError("The generated source manifest is too large")
    write_bytes(output, "SOURCE-MANIFEST.json", manifest_data)
    incomplete.unlink()
    print(f"Collected {len(manifest['sources'])} pinned inputs; "
          f"{len(manifest['files']) + 1} publication files, each below 25 MiB.", flush=True)
    print(f"Output: {output}\nNative/WASM rebuild: NOT PERFORMED", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-version", required=True, help="Exact audited Pyodide version")
    parser.add_argument("--manifest", type=Path, default=ROOT / "browser/runtime-sources.json")
    parser.add_argument("--runtime-manifest", type=Path, default=ROOT / "browser/runtime.json")
    parser.add_argument("--output", type=Path, required=True, help="New/empty publication directory")
    parser.add_argument("--cache", type=Path, help="Optional private download cache; never copied wholesale")
    args = parser.parse_args()
    try:
        if args.cache:
            cache = args.cache.resolve()
            if cache == args.output.resolve() or args.output.resolve() in cache.parents:
                raise ValueError("Download cache must be outside the publication directory")
            cache.mkdir(parents=True, exist_ok=True)
            collect(args, cache)
        else:
            with tempfile.TemporaryDirectory(prefix="formcapy-runtime-inputs-") as temporary:
                collect(args, Path(temporary))
    except (OSError, ValueError, KeyError, StopIteration, tarfile.TarError) as error:
        print(f"Collection failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
