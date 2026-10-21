# MLAFMT Linux builds

Build on **Ubuntu 22.04 x64**, using **Python 3.12** with Tkinter. Newer glibc
build hosts are rejected so the package retains the glibc 2.35 baseline.

System build dependencies:

```bash
sudo apt-get update
sudo apt-get install -y libtcl8.6 libtk8.6 libx11-6 libxext6 libxrender1 libxft2 fontconfig xvfb squashfs-tools curl
bash platforms/linux/build_linux.sh --python python3.12 --expected-version v2.3.0
```

Python 3.12 may be supplied by GitHub Actions `setup-python`; the Ubuntu system
Python need not be replaced. The script creates an isolated environment under
`build/linux/x64`, installs locked dependencies from `requirements-build.txt`,
and generates version metadata from `mla_formatter.py`.

Outputs:

- `dist/release/MLAFMT-v2.3.0-linux-x64.AppImage`
- `dist/release/MLAFMT-v2.3.0-linux-x64.tar.gz` (portable AppDir fallback)

Both contain the desktop application, Tcl/Tk, the Linux TkDnD native library,
offline illustrated documentation, MIT license and third-party notices.
The build tests both the portable folder and the extracted final AppImage with
`--smoke-test --require-dnd`, under Xvfb when no display is available.

The packaging tool and AppImage runtime hashes are locked in
`appimage-tools.json`. The reviewed runtime is included under `vendor/` so builds
do not depend on the upstream continuous release remaining unchanged. Its SHA256
is checked before use. The fixed appimagetool 1.9.1 release is downloaded on the
first build; verified cached copies can be reused. Runtime source provenance and
dependency license texts are included in the package's `Documentation/licenses`.

For user instructions, see [INSTALL.md](INSTALL.md).

References: [AppDir specification](https://docs.appimage.org/reference/appdir.html),
[FUSE-free extraction](https://docs.appimage.org/user-guide/troubleshooting/fuse.html),
[PyInstaller operating mode](https://pyinstaller.org/en/stable/operating-mode.html).
