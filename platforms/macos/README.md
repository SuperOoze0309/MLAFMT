# MLAFMT macOS builds

Build each architecture on its own macOS runner with **Python 3.12** and working
Tkinter. From the repository root:

```bash
bash platforms/macos/build_macos.sh --python python3 --architecture arm64 --expected-version v2.2.0
# On an Intel Mac / native Intel runner:
bash platforms/macos/build_macos.sh --python python3 --architecture x86_64 --expected-version v2.2.0
```

The script creates an isolated environment under `build/macos/<architecture>`,
installs `requirements-build.txt`, and reads the version from `mla_formatter.py`.
PyInstaller includes Tcl/Tk and the matching TkDnD native library. The resulting
app is tested for GUI initialization, drag-and-drop loading and document conversion.

Outputs:

- `dist/release/MLAFMT-v2.2.0-macos-arm64.dmg`
- `dist/release/MLAFMT-v2.2.0-macos-x64.dmg`
- Uncompressed app: `build/macos/<architecture>/dist/MLAFMT.app`

DMGs include an Applications shortcut and offline illustrated documentation,
version/build metadata and license notices. See [INSTALL.md](INSTALL.md).

## Signing and notarization

Without signing credentials, PyInstaller applies an **ad-hoc signature**.
This does **not** bypass Gatekeeper and is **not** Apple notarization.

For a Developer ID build, import your certificate into the build machine's
keychain and export `MLAFMT_CODESIGN_IDENTITY='Developer ID Application: …'`.
For notarization, also export `MLAFMT_NOTARY_PROFILE` naming a profile already
stored with `xcrun notarytool store-credentials`. The build submits and staples
both the app and DMG and fails if Apple does not accept the submission.
Credentials are never stored in the repository or build metadata.

The package declares macOS 14 as its minimum version, matching the arm64 TkDnD
library's Mach-O deployment target. Compatibility with older versions is not
claimed. CI tests the packaged app on its native build runner.

References: [PyInstaller macOS support](https://pyinstaller.org/en/stable/feature-notes.html),
[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
