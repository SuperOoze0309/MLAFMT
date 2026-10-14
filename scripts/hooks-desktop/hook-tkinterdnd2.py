"""Bundle only the running desktop's TkDnD libraries and Tcl scripts."""

from pathlib import Path
import platform
import sys
import tkinter

from PyInstaller.utils.hooks import get_package_paths


_, package_directory = get_package_paths("tkinterdnd2")
package_directory = Path(package_directory)
native = {("darwin", "arm64"): "osx-arm64", ("darwin", "x86_64"): "osx-x64",
          ("linux", "x86_64"): "linux-x64"}.get((sys.platform, platform.machine()))
if not native:
    raise RuntimeError(f"Unsupported desktop TkDnD build: {sys.platform} {platform.machine()}")
if not (package_directory / "tkdnd" / native).is_dir():
    raise RuntimeError(f"tkinterdnd2 is missing its {native} native library")
datas, binaries = [], []
tcl_major = int(tkinter.Tcl().eval("info patchlevel").split(".")[0])
folder = native + "-tcl9" if tcl_major >= 9 and (package_directory / "tkdnd" / (native + "-tcl9")).is_dir() else native
for folder in (folder,):
    for path in sorted((package_directory / "tkdnd" / folder).rglob("*")):
        if path.is_file():
            destination = "tkinterdnd2/" + path.parent.relative_to(package_directory).as_posix()
            entry = (str(path), destination)
            (binaries if path.suffix in (".so", ".dylib") else datas).append(entry)
