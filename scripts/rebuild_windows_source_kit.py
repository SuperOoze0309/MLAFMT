"""Unpack and relink the exact Windows dependency sources included in the kit."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import struct
import sys
import tarfile


def run(arguments, **kwargs):
    subprocess.run([str(item) for item in arguments], check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("unpack", "build"))
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()
    kit = Path(__file__).resolve().parent
    manifest = json.loads((kit / "source-kit-manifest.json").read_text(encoding="utf-8"))
    work = args.workspace.resolve()
    if args.action == "unpack":
        if work.exists():
            raise SystemExit("Use a new workspace directory; existing source edits are never overwritten.")
        work.mkdir(parents=True)
        native = work / "native"
        for source in manifest["upstream"]["sources"]:
            if source["name"] == "published-wheel":
                continue
            filename = kit / "sources" / source["archive"]
            if hashlib.sha256(filename.read_bytes()).hexdigest() != source["sha256"]:
                raise SystemExit(f"Source checksum mismatch: {filename}")
            staging = work / ("unpack-" + source["name"])
            staging.mkdir()
            with tarfile.open(filename) as archive:
                archive.extractall(staging, filter="data")
            roots = [item for item in staging.iterdir() if item.is_dir()]
            if len(roots) != 1:
                raise SystemExit("Source archive has an unexpected root.")
            destination = native if source["name"] == "windows-dependency-build" else (
                work / "lxml" if source["name"] == "lxml-source" else native / source["name"])
            if not destination.resolve().is_relative_to(work):
                raise SystemExit("Source destination must remain inside the requested workspace.")
            if destination.exists():
                # Git archives represent submodules as empty directories.
                if not destination.is_dir() or any(destination.iterdir()):
                    raise SystemExit(f"Source destination is not empty: {destination}")
                destination.rmdir()
            shutil.move(str(roots[0]), str(destination))
        patch_environment = os.environ.copy()
        patch_environment["GIT_CEILING_DIRECTORIES"] = str(work)
        run(["git", "apply", str(native / "libiconv.patch")], cwd=native / "libiconv", env=patch_environment)
        print(f"Sources unpacked. Modify {native / 'libiconv/source'}, then run the build action.")
        return
    if (sys.platform != "win32" or sys.prefix == sys.base_prefix
            or sys.implementation.cache_tag != "cpython-312" or struct.calcsize("P") != 8):
        raise SystemExit("Build on Windows x64 in an isolated CPython 3.12 environment.")
    native, lxml_source = work / "native", work / "lxml"
    if not (native / "build.ps1").is_file() or not (lxml_source / "setupinfo.py").is_file():
        raise SystemExit("Unpack the kit into this workspace first.")
    original_builder = (native / "build.ps1").read_text(encoding="utf-8")
    checked_lines = []
    for line in original_builder.splitlines():
        command = line.strip()
        if command.startswith("Start-Process ") and " nmake " in command:
            checked_lines.append(line.replace("Start-Process ", "$taskNativeProcess = Start-Process -PassThru ", 1))
            checked_lines.append('if ($taskNativeProcess.ExitCode -ne 0) { throw "Native nmake build failed." }')
        else:
            checked_lines.append(line)
            if command.startswith(("msbuild ", "vcbuild ", "cscript ", "cmd.exe ")):
                checked_lines.append('if ($LASTEXITCODE -ne 0) { throw "Native compiler/configuration command failed." }')
    checked_builder = native / "build-checked.ps1"
    checked_builder.write_text("\n".join(checked_lines) + "\n", encoding="utf-8-sig")
    # Keep the exact original upstream script. The checked companion stops on
    # native tool failures so stale .lib files cannot mask a failed rebuild.
    (work / "native-builder-patch.json").write_text(json.dumps({
        "original_sha256": hashlib.sha256(original_builder.encode()).hexdigest(),
        "checked_sha256": hashlib.sha256(checked_builder.read_bytes()).hexdigest(),
        "change": "Check exit status after native compiler/configuration commands and wait for nmake with PassThru.",
    }, indent=2) + "\n", encoding="utf-8")
    run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", checked_builder, "-x64"], cwd=native)
    libraries = [native / "libxslt/win32/bin.msvc", native / "libxml2/win32/bin.msvc",
                 native / "libiconv/MSVC17/x64/lib", native / "zlib"]
    includes = [native / "libxslt", native / "libxml2/include", native / "libiconv/source/include", native / "zlib"]
    for name in ("libxslt_a.lib", "libexslt_a.lib", "libxml2_a.lib", "iconv_a.lib", "zlib.lib"):
        if not any((directory / name).is_file() for directory in libraries):
            raise SystemExit(f"Native dependency builder did not produce {name}. Inspect its output before relinking.")
    setupinfo = lxml_source / "setupinfo.py"
    original = setupinfo.read_text(encoding="utf-8")
    if "# MLAFMT source-kit local linkage" not in original:
        patched = original.replace("    if OPTION_BUILD_LIBXML2XSLT:\n        macros.append(('LIBXML_STATIC', None))",
                                   "    if OPTION_STATIC:\n        macros.append(('LIBXML_STATIC', None))")
        for declaration, value in (("def library_dirs(static_library_dirs):\n", [str(p) for p in libraries]),
                                   ("def include_dirs(static_include_dirs):\n", [str(p) for p in includes])):
            if patched.count(declaration) != 1:
                raise SystemExit("The lxml static link configuration has changed. Patch the explicit local paths manually.")
            patched = patched.replace(declaration, declaration + f"    # MLAFMT source-kit local linkage\n    if OPTION_STATIC:\n        return {value!r}\n")
        declaration = "def get_library_versions():\n"
        patched = patched.replace(declaration, declaration + "    if OPTION_STATIC:\n        return ('2.11.9', '1.1.45')\n")
        setupinfo.write_text(patched, encoding="utf-8")
    environment = os.environ.copy()
    for name in ("STATICBUILD", "STATIC_DEPS", "LXML_STATIC_DEPS", "LXML_BUILD_LIBXML2XSLT"):
        environment.pop(name, None)
    wheel_output = work / "wheel"
    run([sys.executable, "setup.py", "--static", "--without-cython", "bdist_wheel", "--dist-dir", wheel_output], cwd=lxml_source, env=environment)
    wheels = list(wheel_output.glob("*.whl"))
    if len(wheels) != 1:
        raise SystemExit("Expected exactly one rebuilt wheel; use a fresh wheel output directory.")
    if args.install:
        run([sys.executable, "-m", "pip", "install", "--no-deps", "--force-reinstall", wheels[0]])
    print(f"Relinked wheel: {wheels[0]}")


if __name__ == "__main__":
    main()
